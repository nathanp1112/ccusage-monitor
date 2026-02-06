import { randomBytes, createHash } from 'node:crypto';

const API_KEY_PREFIX = 'ccusage_';
const API_KEY_LENGTH = 32;

/**
 * Generate a new API key for agent authentication
 * Format: ccusage_<32 random chars><4 char checksum>
 */
export function generateApiKey(): string {
  const random = randomBytes(API_KEY_LENGTH).toString('base64url').slice(0, API_KEY_LENGTH);
  const checksum = createHash('sha256')
    .update(random)
    .digest('base64url')
    .slice(0, 4);

  return `${API_KEY_PREFIX}${random}${checksum}`;
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return false;
  }

  const rest = apiKey.slice(API_KEY_PREFIX.length);
  if (rest.length !== API_KEY_LENGTH + 4) {
    return false;
  }

  const random = rest.slice(0, API_KEY_LENGTH);
  const checksum = rest.slice(API_KEY_LENGTH);
  const expectedChecksum = createHash('sha256')
    .update(random)
    .digest('base64url')
    .slice(0, 4);

  return checksum === expectedChecksum;
}

/**
 * Extract the API key from Authorization header
 */
export function extractApiKey(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Support both "Bearer <key>" and "X-API-Key: <key>" style
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return authHeader;
}
