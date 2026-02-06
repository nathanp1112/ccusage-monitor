# Data Models

## Schema Definitions

### Core Schemas (Valibot)

All schemas use Valibot for runtime validation with branded types for type safety.

## Input Data Schemas

### Usage Data Entry

The primary schema for parsing JSONL entries from Claude data files.

```mermaid
classDiagram
    class UsageData {
        +string cwd
        +SessionId sessionId
        +ISOTimestamp timestamp
        +Version version
        +Message message
        +number costUSD
        +RequestId requestId
        +boolean isApiErrorMessage
    }

    class Message {
        +MessageId id
        +ModelName model
        +Usage usage
        +Content[] content
    }

    class Usage {
        +number input_tokens
        +number output_tokens
        +number cache_creation_input_tokens
        +number cache_read_input_tokens
    }

    class Content {
        +string text
    }

    UsageData --> Message
    Message --> Usage
    Message --> Content
```

### Branded Types

```typescript
// Type-safe branded types using Valibot
type SessionId = string & { readonly __brand: 'SessionId' };
type ISOTimestamp = string & { readonly __brand: 'ISOTimestamp' };
type Version = string & { readonly __brand: 'Version' };
type MessageId = string & { readonly __brand: 'MessageId' };
type ModelName = string & { readonly __brand: 'ModelName' };
type RequestId = string & { readonly __brand: 'RequestId' };
type ProjectPath = string & { readonly __brand: 'ProjectPath' };

// Date format types
type DailyDate = string & { readonly __brand: 'DailyDate' };     // YYYY-MM-DD
type WeeklyDate = string & { readonly __brand: 'WeeklyDate' };   // YYYY-Www
type MonthlyDate = string & { readonly __brand: 'MonthlyDate' }; // YYYY-MM
type ActivityDate = string & { readonly __brand: 'ActivityDate' };
```

---

## Aggregated Data Schemas

### Daily Usage

```mermaid
classDiagram
    class DailyUsage {
        +DailyDate date
        +number inputTokens
        +number outputTokens
        +number cacheCreationTokens
        +number cacheReadTokens
        +number totalCost
        +ModelName[] modelsUsed
        +ModelBreakdown[] modelBreakdowns
        +string project
    }

    class ModelBreakdown {
        +ModelName modelName
        +number inputTokens
        +number outputTokens
        +number cacheCreationTokens
        +number cacheReadTokens
        +number cost
    }

    DailyUsage --> ModelBreakdown
```

### Weekly Usage

```mermaid
classDiagram
    class WeeklyUsage {
        +WeeklyDate week
        +number inputTokens
        +number outputTokens
        +number cacheCreationTokens
        +number cacheReadTokens
        +number totalCost
        +ModelName[] modelsUsed
        +ModelBreakdown[] modelBreakdowns
        +string project
    }
```

### Monthly Usage

```mermaid
classDiagram
    class MonthlyUsage {
        +MonthlyDate month
        +number inputTokens
        +number outputTokens
        +number cacheCreationTokens
        +number cacheReadTokens
        +number totalCost
        +ModelName[] modelsUsed
        +ModelBreakdown[] modelBreakdowns
        +string project
    }
```

### Session Usage

```mermaid
classDiagram
    class SessionUsage {
        +SessionId sessionId
        +ProjectPath projectPath
        +number inputTokens
        +number outputTokens
        +number cacheCreationTokens
        +number cacheReadTokens
        +number totalCost
        +ActivityDate lastActivity
        +Version[] versions
        +ModelName[] modelsUsed
        +ModelBreakdown[] modelBreakdowns
    }
```

### Session Block

```mermaid
classDiagram
    class SessionBlock {
        +string blockId
        +ISOTimestamp startTime
        +ISOTimestamp endTime
        +number durationMinutes
        +boolean isActive
        +number inputTokens
        +number outputTokens
        +number cacheCreationTokens
        +number cacheReadTokens
        +number totalCost
        +ModelName[] modelsUsed
        +BlockProjection projection
    }

    class BlockProjection {
        +number projectedTokens
        +number projectedCost
        +number remainingMinutes
    }

    SessionBlock --> BlockProjection
```

---

## Pricing Schemas

### LiteLLM Model Pricing

```mermaid
classDiagram
    class LiteLLMModelPricing {
        +number input_cost_per_token
        +number output_cost_per_token
        +number cache_creation_input_token_cost
        +number cache_read_input_token_cost
        +number max_tokens
        +number max_input_tokens
        +number max_output_tokens
        +number input_cost_per_token_above_200k_tokens
        +number output_cost_per_token_above_200k_tokens
        +number cache_creation_input_token_cost_above_200k_tokens
        +number cache_read_input_token_cost_above_200k_tokens
    }
```

### Tiered Pricing Calculation

```mermaid
flowchart TD
    TOKENS[Token Count] --> CHECK{Tokens > 200k?}

    CHECK -->|Yes| SPLIT[Split at 200k threshold]
    CHECK -->|No| BASE[Apply base rate]

    SPLIT --> BELOW[Tokens 1-200k × base_rate]
    SPLIT --> ABOVE[Tokens 200k+ × tiered_rate]

    BELOW --> SUM[Sum costs]
    ABOVE --> SUM

    BASE --> TOTAL[Total Cost]
    SUM --> TOTAL
```

---

## Configuration Schema

### Config File Schema

```mermaid
classDiagram
    class CcusageConfig {
        +string timezone
        +string locale
        +CostMode mode
        +boolean json
        +boolean compact
        +boolean breakdown
        +CommandConfig daily
        +CommandConfig monthly
        +CommandConfig weekly
        +CommandConfig session
        +CommandConfig blocks
        +Map~string,string~ projectAliases
    }

    class CommandConfig {
        +CostMode mode
        +boolean json
        +boolean compact
        +boolean breakdown
        +string since
        +string until
    }

    CcusageConfig --> CommandConfig
```

### Cost Mode Enum

```typescript
type CostMode = 'auto' | 'calculate' | 'display';
```

---

## Token Aggregation Types

### Token Counts

```typescript
interface AggregatedTokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}
```

### Token Totals (with Cost)

```typescript
interface TokenTotals extends AggregatedTokenCounts {
  totalCost: number;
}
```

### Complete Totals Object

```typescript
interface TotalsObject extends TokenTotals {
  totalTokens: number;  // Sum of all token types
}
```

---

## File System Data Structure

### Claude Data Directory

```
~/.claude/projects/
└── {project-name}/
    └── {session-id}.jsonl

~/.config/claude/projects/
└── {project-name}/
    └── {session-id}.jsonl
```

### JSONL File Format

Each line is a JSON object:

```json
{"timestamp":"2026-01-26T10:00:00Z","sessionId":"abc123","message":{"usage":{"input_tokens":100}}}
{"timestamp":"2026-01-26T10:01:00Z","sessionId":"abc123","message":{"usage":{"input_tokens":150}}}
```

---

## Model Name Patterns

### Claude Models

```
claude-{variant}-{version}-{date}

Examples:
- claude-sonnet-4-20250514
- claude-opus-4-20250514
- claude-3-5-sonnet-20241022
```

### Provider Prefixes

When matching against LiteLLM pricing:

```
anthropic/claude-sonnet-4-20250514
claude-sonnet-4-20250514
claude-4-sonnet-20250514
```

---

## Validation Rules

### Timestamp Validation

- Must be valid ISO 8601 format
- Future timestamps are allowed
- Timezone info optional

### Token Count Validation

- Must be non-negative integers
- Missing values default to 0
- Schema allows optional cache tokens

### Cost Validation

- Must be non-negative number
- Can be undefined (will be calculated)
- Pre-calculated costs take priority in `auto` mode
