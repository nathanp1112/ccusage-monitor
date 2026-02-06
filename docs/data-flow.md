# Data Flow Documentation

## End-to-End Data Flow

![End-to-End Data Flow](./diagrams/data-flow-1.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TB
    subgraph "1. Data Sources"
        FS1[("~/.claude/projects/<br/>{project}/<br/>{sessionId}.jsonl")]
        FS2[("~/.config/claude/projects/<br/>{project}/<br/>{sessionId}.jsonl")]
        ENV["CLAUDE_CONFIG_DIR<br/>Environment Variable"]
    end

    subgraph "2. Path Resolution"
        RESOLVE["getClaudePaths()"]
        GLOB["Glob Pattern Matching<br/>projects/**/*.jsonl"]
    end

    subgraph "3. File Parsing"
        STREAM["createReadStream()"]
        READLINE["readline Interface"]
        PARSE["JSON.parse(line)"]
        VALIDATE["valibot Schema Validation"]
    end

    subgraph "4. Data Transformation"
        EXTRACT["Extract Usage Data<br/>timestamp, tokens, model, cost"]
        FILTER["Date Range Filtering<br/>--since, --until"]
        DEDUP["Deduplication<br/>messageId, requestId"]
    end

    subgraph "5. Aggregation"
        AGG_DAILY["Group by Date<br/>YYYY-MM-DD"]
        AGG_WEEKLY["Group by Week<br/>YYYY-Www"]
        AGG_MONTHLY["Group by Month<br/>YYYY-MM"]
        AGG_SESSION["Group by Session<br/>project/sessionId"]
        AGG_BLOCKS["Group by 5-Hour Block"]
    end

    subgraph "6. Cost Calculation"
        PRICING["Fetch LiteLLM Pricing"]
        CALC["Calculate Token Costs<br/>input + output + cache"]
        TIERED["Apply Tiered Pricing<br/>200k threshold"]
    end

    subgraph "7. Output Generation"
        TABLE["Table Formatter<br/>cli-table3"]
        JSON["JSON Serialization"]
        JQ["jq Filter Processing"]
    end

    ENV --> RESOLVE
    FS1 --> GLOB
    FS2 --> GLOB
    RESOLVE --> GLOB

    GLOB --> STREAM
    STREAM --> READLINE
    READLINE --> PARSE
    PARSE --> VALIDATE

    VALIDATE --> EXTRACT
    EXTRACT --> FILTER
    FILTER --> DEDUP

    DEDUP --> AGG_DAILY
    DEDUP --> AGG_WEEKLY
    DEDUP --> AGG_MONTHLY
    DEDUP --> AGG_SESSION
    DEDUP --> AGG_BLOCKS

    AGG_DAILY --> CALC
    AGG_WEEKLY --> CALC
    AGG_MONTHLY --> CALC
    AGG_SESSION --> CALC
    AGG_BLOCKS --> CALC

    PRICING --> TIERED
    CALC --> TIERED

    TIERED --> TABLE
    TIERED --> JSON
    JSON --> JQ
```

</details>

## JSONL Entry Structure

### Input Data Schema

![Input Data Schema](./diagrams/data-flow-2.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
erDiagram
    JSONL_ENTRY {
        string timestamp "ISO 8601 format"
        string sessionId "Optional session identifier"
        string cwd "Current working directory"
        string version "Claude Code version"
        float costUSD "Pre-calculated cost (optional)"
        string requestId "Request deduplication ID"
        boolean isApiErrorMessage "Error flag"
    }

    MESSAGE {
        string id "Message ID"
        string model "Model name"
    }

    USAGE {
        int input_tokens "Input token count"
        int output_tokens "Output token count"
        int cache_creation_input_tokens "Cache creation tokens"
        int cache_read_input_tokens "Cache read tokens"
    }

    CONTENT {
        string text "Response text"
    }

    JSONL_ENTRY ||--|| MESSAGE : contains
    MESSAGE ||--|| USAGE : contains
    MESSAGE ||--o{ CONTENT : may_have
```

</details>

### Sample JSONL Entry

```json
{
  "timestamp": "2026-01-26T10:30:00.000Z",
  "sessionId": "abc123",
  "cwd": "/Users/dev/project",
  "version": "1.0.5",
  "message": {
    "id": "msg_001",
    "model": "claude-sonnet-4-20250514",
    "usage": {
      "input_tokens": 1500,
      "output_tokens": 800,
      "cache_creation_input_tokens": 500,
      "cache_read_input_tokens": 200
    }
  },
  "costUSD": 0.0123,
  "requestId": "req_xyz"
}
```

## Aggregated Output Schemas

### Daily Usage Schema

![Daily Usage Schema](./diagrams/data-flow-3.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
erDiagram
    DAILY_USAGE {
        string date "YYYY-MM-DD format"
        int inputTokens "Total input tokens"
        int outputTokens "Total output tokens"
        int cacheCreationTokens "Total cache creation"
        int cacheReadTokens "Total cache read"
        float totalCost "Total USD cost"
        string project "Optional project name"
    }

    MODEL_BREAKDOWN {
        string modelName "Model identifier"
        int inputTokens "Model-specific input"
        int outputTokens "Model-specific output"
        int cacheCreationTokens "Model cache creation"
        int cacheReadTokens "Model cache read"
        float cost "Model-specific cost"
    }

    DAILY_USAGE ||--o{ MODEL_BREAKDOWN : has_breakdowns
    DAILY_USAGE }o--o{ MODEL_NAME : modelsUsed
```

</details>

### Session Usage Schema

![Session Usage Schema](./diagrams/data-flow-4.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
erDiagram
    SESSION_USAGE {
        string sessionId "Session identifier"
        string projectPath "Project directory path"
        int inputTokens "Total input tokens"
        int outputTokens "Total output tokens"
        int cacheCreationTokens "Total cache creation"
        int cacheReadTokens "Total cache read"
        float totalCost "Total USD cost"
        string lastActivity "Last activity timestamp"
    }

    SESSION_USAGE }o--o{ VERSION : versions
    SESSION_USAGE }o--o{ MODEL_NAME : modelsUsed
    SESSION_USAGE ||--o{ MODEL_BREAKDOWN : has_breakdowns
```

</details>

### Session Block Schema

![Session Block Schema](./diagrams/data-flow-5.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
erDiagram
    SESSION_BLOCK {
        string blockId "Unique block identifier"
        string startTime "Block start timestamp"
        string endTime "Block end timestamp"
        int durationMinutes "Block duration"
        boolean isActive "Currently active block"
        int inputTokens "Total input tokens"
        int outputTokens "Total output tokens"
        int cacheCreationTokens "Cache creation"
        int cacheReadTokens "Cache read"
        float totalCost "Block cost"
    }

    PROJECTION {
        int projectedTokens "Projected total tokens"
        float projectedCost "Projected total cost"
        int remainingMinutes "Minutes until block ends"
    }

    SESSION_BLOCK ||--o| PROJECTION : has_projection
    SESSION_BLOCK }o--o{ MODEL_NAME : modelsUsed
```

</details>

## Pricing Data Flow

![Pricing Data Flow](./diagrams/data-flow-6.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart LR
    subgraph "Pricing Source"
        API["LiteLLM API<br/>model_prices_and_context_window.json"]
        OFFLINE["Offline Cache<br/>Macro-embedded"]
    end

    subgraph "Pricing Fetcher"
        FETCH["fetchModelPricing()"]
        CACHE["In-memory Cache<br/>Map<model, pricing>"]
        LOOKUP["getModelPricing(model)"]
    end

    subgraph "Model Matching"
        DIRECT["Direct Match<br/>claude-sonnet-4-20250514"]
        PREFIX["Provider Prefix<br/>anthropic/claude-..."]
        FUZZY["Fuzzy Match<br/>Case-insensitive contains"]
    end

    subgraph "Cost Calculation"
        INPUT_COST["Input Token Cost"]
        OUTPUT_COST["Output Token Cost"]
        CACHE_CREATE_COST["Cache Creation Cost"]
        CACHE_READ_COST["Cache Read Cost"]
        TOTAL["Total USD Cost"]
    end

    API --> FETCH
    OFFLINE --> FETCH
    FETCH --> CACHE
    CACHE --> LOOKUP

    LOOKUP --> DIRECT
    DIRECT --> PREFIX
    PREFIX --> FUZZY

    FUZZY --> INPUT_COST
    FUZZY --> OUTPUT_COST
    FUZZY --> CACHE_CREATE_COST
    FUZZY --> CACHE_READ_COST

    INPUT_COST --> TOTAL
    OUTPUT_COST --> TOTAL
    CACHE_CREATE_COST --> TOTAL
    CACHE_READ_COST --> TOTAL
```

</details>

## 5-Hour Block Detection Flow

![5-Hour Block Detection Flow](./diagrams/data-flow-7.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    START[Raw Usage Entries] --> SORT[Sort by Timestamp]
    SORT --> FIRST[Create First Block<br/>Start = First Entry Time]

    FIRST --> LOOP{Next Entry?}

    LOOP -->|No| FINALIZE[Finalize All Blocks]
    LOOP -->|Yes| CHECK{Entry within 5 hours<br/>of block start?}

    CHECK -->|Yes| ADD[Add to Current Block]
    ADD --> ACCUM[Accumulate Tokens]
    ACCUM --> LOOP

    CHECK -->|No| CLOSE[Close Current Block]
    CLOSE --> NEW[Start New Block<br/>Start = Entry Time]
    NEW --> ADD_NEW[Add Entry to New Block]
    ADD_NEW --> LOOP

    FINALIZE --> ACTIVE{Current time within<br/>5 hours of last block?}

    ACTIVE -->|Yes| MARK[Mark as Active Block]
    ACTIVE -->|No| INACTIVE[All Blocks Complete]

    MARK --> PROJECT[Calculate Projections]
    PROJECT --> OUTPUT[Output: SessionBlock[]]
    INACTIVE --> OUTPUT
```

</details>

## Output Format Flow

![Output Format Flow](./diagrams/data-flow-8.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    DATA[Aggregated Usage Data] --> FORMAT{Output Format?}

    FORMAT -->|Table| TABLE_FLOW
    FORMAT -->|JSON| JSON_FLOW

    subgraph TABLE_FLOW [Table Output Path]
        CHECK_WIDTH[Check Terminal Width]
        CHECK_WIDTH --> COMPACT{Width < Threshold?}

        COMPACT -->|Yes| COMPACT_MODE[Compact Mode<br/>Hide cache columns]
        COMPACT -->|No| FULL_MODE[Full Mode<br/>All columns visible]

        COMPACT_MODE --> CREATE_TABLE
        FULL_MODE --> CREATE_TABLE

        CREATE_TABLE[Create cli-table3 Instance]
        CREATE_TABLE --> ADD_HEADERS[Add Header Row]
        ADD_HEADERS --> ADD_ROWS[Add Data Rows]
        ADD_ROWS --> CHECK_BREAKDOWN{--breakdown?}

        CHECK_BREAKDOWN -->|Yes| ADD_BREAKDOWN[Add Model Breakdowns]
        CHECK_BREAKDOWN -->|No| ADD_TOTALS

        ADD_BREAKDOWN --> ADD_TOTALS[Add Totals Row]
        ADD_TOTALS --> RENDER[Render to String]
    end

    subgraph JSON_FLOW [JSON Output Path]
        BUILD_OBJ[Build JSON Object]
        BUILD_OBJ --> CHECK_INSTANCES{--instances?}

        CHECK_INSTANCES -->|Yes| GROUP_PROJECT[Group by Project]
        CHECK_INSTANCES -->|No| FLAT_ARRAY[Flat Array]

        GROUP_PROJECT --> ADD_TOTALS_JSON[Add Totals Object]
        FLAT_ARRAY --> ADD_TOTALS_JSON

        ADD_TOTALS_JSON --> CHECK_JQ{--jq filter?}

        CHECK_JQ -->|Yes| JQ_PROCESS[Process with jq]
        CHECK_JQ -->|No| STRINGIFY[JSON.stringify]

        JQ_PROCESS --> OUTPUT_JQ[Output Filtered Result]
        STRINGIFY --> OUTPUT_JSON[Output JSON]
    end

    RENDER --> CONSOLE[Console Output]
    OUTPUT_JQ --> CONSOLE
    OUTPUT_JSON --> CONSOLE
```

</details>
