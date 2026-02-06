/**
 * Pricing data from LiteLLM
 * Source: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
 */

const LITELLM_PRICING_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

interface ModelPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
}

// Cache pricing data
let cachedPricing: Map<string, ModelPricing> | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Provider prefixes to try when looking up model
const PROVIDER_PREFIXES = [
  'anthropic/',
  'claude-',
  '',
];

/**
 * Fetch pricing data from LiteLLM
 */
async function fetchPricing(): Promise<Map<string, ModelPricing>> {
  // Return cached if valid
  if (cachedPricing && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return cachedPricing;
  }

  try {
    const response = await fetch(LITELLM_PRICING_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch pricing: ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const pricing = new Map<string, ModelPricing>();

    for (const [modelName, modelData] of Object.entries(data)) {
      if (typeof modelData === 'object' && modelData !== null) {
        pricing.set(modelName, modelData as ModelPricing);
      }
    }

    cachedPricing = pricing;
    lastFetchTime = Date.now();
    return pricing;
  } catch (error) {
    // Return cached even if expired, or empty map
    if (cachedPricing) {
      return cachedPricing;
    }
    console.error('Failed to fetch pricing data:', error);
    return new Map();
  }
}

/**
 * Find pricing for a model name
 */
async function getModelPricing(modelName: string): Promise<ModelPricing | null> {
  const pricing = await fetchPricing();

  // Try exact match first
  if (pricing.has(modelName)) {
    return pricing.get(modelName)!;
  }

  // Try with provider prefixes
  for (const prefix of PROVIDER_PREFIXES) {
    const key = `${prefix}${modelName}`;
    if (pricing.has(key)) {
      return pricing.get(key)!;
    }
  }

  // Try partial match
  const lower = modelName.toLowerCase();
  for (const [key, value] of pricing) {
    const comparison = key.toLowerCase();
    if (comparison.includes(lower) || lower.includes(comparison)) {
      return value;
    }
  }

  return null;
}

/**
 * Calculate tiered cost for tokens
 * Claude models have tiered pricing above 200k tokens
 */
function calculateTieredCost(
  totalTokens: number,
  basePrice: number | undefined,
  tieredPrice: number | undefined,
  threshold: number = 200_000
): number {
  if (!totalTokens || totalTokens <= 0) {
    return 0;
  }

  if (totalTokens > threshold && tieredPrice != null) {
    const tokensBelowThreshold = Math.min(totalTokens, threshold);
    const tokensAboveThreshold = Math.max(0, totalTokens - threshold);

    let cost = tokensAboveThreshold * tieredPrice;
    if (basePrice != null) {
      cost += tokensBelowThreshold * basePrice;
    }
    return cost;
  }

  if (basePrice != null) {
    return totalTokens * basePrice;
  }

  return 0;
}

/**
 * Calculate cost for token usage
 */
export async function calculateCost(
  tokens: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
  modelName: string
): Promise<number> {
  const pricing = await getModelPricing(modelName);

  if (!pricing) {
    return 0;
  }

  const inputCost = calculateTieredCost(
    tokens.input_tokens,
    pricing.input_cost_per_token,
    pricing.input_cost_per_token_above_200k_tokens
  );

  const outputCost = calculateTieredCost(
    tokens.output_tokens,
    pricing.output_cost_per_token,
    pricing.output_cost_per_token_above_200k_tokens
  );

  const cacheCreationCost = calculateTieredCost(
    tokens.cache_creation_input_tokens || 0,
    pricing.cache_creation_input_token_cost,
    pricing.cache_creation_input_token_cost_above_200k_tokens
  );

  const cacheReadCost = calculateTieredCost(
    tokens.cache_read_input_tokens || 0,
    pricing.cache_read_input_token_cost,
    pricing.cache_read_input_token_cost_above_200k_tokens
  );

  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}
