# Sequence Diagrams

## CLI Command Execution Sequence

### Daily Report Command Flow

![Daily Report Command Flow](./diagrams/sequence-diagrams-1.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
sequenceDiagram
    participant User
    participant CLI as CLI Entry (index.ts)
    participant Gunshi as Gunshi Framework
    participant Daily as daily Command
    participant Config as Config Loader
    participant DataLoader as Data Loader
    participant Pricing as Pricing Fetcher
    participant Calculator as Cost Calculator
    participant Table as Table Formatter
    participant Console as Console Output

    User->>CLI: ccusage daily --json
    CLI->>Gunshi: cli(args, mainCommand, options)
    Gunshi->>Daily: run(ctx)

    Daily->>Config: loadConfig(configPath)
    Config-->>Daily: config object
    Daily->>Config: mergeConfigWithArgs(ctx, config)
    Config-->>Daily: mergedOptions

    Daily->>DataLoader: loadDailyUsageData(options)

    loop For each Claude data directory
        DataLoader->>DataLoader: getClaudePaths()
        DataLoader->>DataLoader: glob(USAGE_DATA_GLOB_PATTERN)

        loop For each JSONL file
            DataLoader->>DataLoader: parseJSONL(file)
            DataLoader->>DataLoader: validate(usageDataSchema)
        end
    end

    DataLoader->>Pricing: fetchModelPricing()
    Pricing-->>DataLoader: Map<modelName, pricing>

    loop For each usage entry
        DataLoader->>Calculator: calculateCostFromTokens(tokens, model)
        Calculator-->>DataLoader: cost USD
    end

    DataLoader->>DataLoader: aggregateByDate()
    DataLoader-->>Daily: DailyUsage[]

    Daily->>Calculator: calculateTotals(dailyData)
    Calculator-->>Daily: totals

    alt --json flag
        Daily->>Console: JSON.stringify(output)
    else Table format
        Daily->>Table: createUsageReportTable()
        Daily->>Table: formatUsageDataRow() for each day
        Daily->>Table: formatTotalsRow(totals)
        Table-->>Console: table.toString()
    end

    Console-->>User: Usage Report
```

</details>

## Data Loading Sequence

### JSONL File Parsing Flow

![JSONL File Parsing Flow](./diagrams/sequence-diagrams-2.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
sequenceDiagram
    participant DataLoader as loadDailyUsageData()
    participant Paths as getClaudePaths()
    participant Glob as tinyglobby
    participant FS as File System
    participant Parser as JSONL Parser
    participant Valibot as Schema Validator
    participant Aggregator as Date Aggregator

    DataLoader->>Paths: getClaudePaths()

    alt CLAUDE_CONFIG_DIR env set
        Paths->>Paths: Split comma-separated paths
        Paths->>FS: isDirectorySync(envPath)
        Paths-->>DataLoader: [envPath1, envPath2, ...]
    else Default paths
        Paths->>FS: Check ~/.config/claude/projects/
        Paths->>FS: Check ~/.claude/projects/
        Paths-->>DataLoader: [defaultPath1, defaultPath2]
    end

    loop For each claudePath
        DataLoader->>Glob: glob(projects/**/*.jsonl)
        Glob-->>DataLoader: [file1.jsonl, file2.jsonl, ...]

        loop For each JSONL file
            DataLoader->>FS: createReadStream(file)
            DataLoader->>Parser: createInterface(stream)

            loop For each line
                Parser->>Parser: JSON.parse(line)
                Parser->>Valibot: v.safeParse(usageDataSchema, data)

                alt Valid entry
                    Valibot-->>Parser: { success: true, output }
                    Parser->>Aggregator: Add to entries
                else Invalid entry
                    Valibot-->>Parser: { success: false }
                    Parser->>Parser: Skip silently
                end
            end
        end
    end

    DataLoader->>Aggregator: groupBy(date)
    Aggregator-->>DataLoader: Map<date, entries[]>

    loop For each date group
        DataLoader->>DataLoader: Sum tokens
        DataLoader->>DataLoader: Calculate cost
        DataLoader->>DataLoader: Create DailyUsage object
    end

    DataLoader-->>DataLoader: Sort by date
```

</details>

## Cost Calculation Sequence

### Token-Based Cost Calculation

![Token-Based Cost Calculation](./diagrams/sequence-diagrams-3.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
sequenceDiagram
    participant Caller as Calling Function
    participant Fetcher as LiteLLMPricingFetcher
    participant Cache as Pricing Cache
    participant API as LiteLLM API
    participant Offline as Offline Loader
    participant Calculator as calculateCostFromPricing()

    Caller->>Fetcher: calculateCostFromTokens(tokens, modelName)

    Fetcher->>Fetcher: ensurePricingLoaded()

    alt Cache available
        Fetcher->>Cache: Get cached pricing
        Cache-->>Fetcher: Map<model, pricing>
    else Offline mode
        Fetcher->>Offline: offlineLoader()
        Offline-->>Fetcher: Embedded pricing data
        Fetcher->>Cache: Store in cache
    else Online mode
        Fetcher->>API: fetch(LITELLM_PRICING_URL)
        API-->>Fetcher: JSON pricing data

        loop For each model in response
            Fetcher->>Fetcher: v.safeParse(liteLLMModelPricingSchema)
            Fetcher->>Cache: pricing.set(modelName, data)
        end
    end

    Fetcher->>Fetcher: getModelPricing(modelName)

    alt Direct match
        Fetcher-->>Fetcher: pricing
    else Try with provider prefixes
        Fetcher->>Fetcher: Try anthropic/{model}
        Fetcher->>Fetcher: Try claude-{model}
        Fetcher-->>Fetcher: pricing or null
    end

    alt Pricing found
        Fetcher->>Calculator: calculateCostFromPricing(tokens, pricing)

        Note over Calculator: Tiered Pricing Logic
        Calculator->>Calculator: calculateTieredCost(input_tokens)
        Calculator->>Calculator: calculateTieredCost(output_tokens)
        Calculator->>Calculator: calculateTieredCost(cache_creation)
        Calculator->>Calculator: calculateTieredCost(cache_read)

        alt tokens > 200k threshold
            Calculator->>Calculator: Apply tiered rate above 200k
        else tokens <= 200k
            Calculator->>Calculator: Apply base rate
        end

        Calculator-->>Fetcher: Total cost USD
        Fetcher-->>Caller: Result.succeed(cost)
    else Pricing not found
        Fetcher-->>Caller: Result.fail(Error)
    end
```

</details>

## MCP Server Request Sequence

### MCP Tool Invocation Flow

![MCP Tool Invocation Flow](./diagrams/sequence-diagrams-4.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Transport as Transport Layer
    participant Server as McpServer
    participant Tool as Registered Tool
    participant Handler as Tool Handler
    participant ccusage as ccusage Functions
    participant DataLoader as Data Loader

    Client->>Transport: CallTool Request

    alt HTTP Transport
        Transport->>Server: StreamableHTTPTransport
    else Stdio Transport
        Transport->>Server: StdioServerTransport
    end

    Server->>Tool: Lookup tool by name
    Tool->>Handler: Execute handler(args)

    Handler->>Handler: Parse parameters (zod)

    alt Tool: daily
        Handler->>ccusage: getCcusageDaily(params, claudePath)
        ccusage->>DataLoader: loadDailyUsageData(options)
        DataLoader-->>ccusage: DailyUsage[]
        ccusage->>ccusage: calculateTotals()
        ccusage-->>Handler: JSON output
    else Tool: session
        Handler->>ccusage: getCcusageSession(params, claudePath)
        ccusage->>DataLoader: loadSessionUsageData(options)
        DataLoader-->>ccusage: SessionUsage[]
        ccusage-->>Handler: JSON output
    else Tool: blocks
        Handler->>ccusage: getCcusageBlocks(params, claudePath)
        ccusage->>DataLoader: loadBlocksUsageData(options)
        DataLoader-->>ccusage: BlocksUsage[]
        ccusage-->>Handler: JSON output
    end

    Handler->>Handler: Format response
    Handler-->>Server: { content: [{ type: 'text', text: JSON }] }
    Server-->>Transport: Tool Response
    Transport-->>Client: Result
```

</details>

## Configuration Loading Sequence

### Config File Resolution

![Config File Resolution](./diagrams/sequence-diagrams-5.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
sequenceDiagram
    participant Command as CLI Command
    participant Loader as Config Loader
    participant FS as File System
    participant Finder as Config Finder
    participant Validator as Schema Validator
    participant Merger as Arg Merger

    Command->>Loader: loadConfig(configPath, debug)

    alt Explicit config path
        Loader->>FS: readFile(configPath)
    else Auto-discovery
        Loader->>Finder: findConfigFile()

        loop Check locations
            Finder->>FS: Check ./ccusage.json
            Finder->>FS: Check ~/.config/ccusage/config.json
            Finder->>FS: Check ~/.ccusage.json
        end

        alt Config found
            Finder-->>Loader: configPath
            Loader->>FS: readFile(configPath)
        else No config
            Loader-->>Command: Default config
        end
    end

    alt File found
        FS-->>Loader: JSON content
        Loader->>Validator: Validate against schema

        alt Valid config
            Validator-->>Loader: Parsed config
        else Invalid config
            Validator-->>Loader: Validation errors
            Loader->>Loader: Log warning, use defaults
        end
    end

    Loader-->>Command: Config object

    Command->>Merger: mergeConfigWithArgs(ctx, config)

    Note over Merger: Priority: CLI args > Config > Defaults

    loop For each option
        Merger->>Merger: CLI value ?? config value ?? default
    end

    Merger-->>Command: Merged options
```

</details>

## 5-Hour Billing Block Detection Sequence

### Session Block Identification

![Session Block Identification](./diagrams/sequence-diagrams-6.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
sequenceDiagram
    participant Loader as Data Loader
    participant BlockId as identifySessionBlocks()
    participant Sorter as Timestamp Sorter
    participant BlockBuilder as Block Builder
    participant Calculator as Cost Calculator

    Loader->>BlockId: identifySessionBlocks(entries)

    BlockId->>Sorter: Sort entries by timestamp
    Sorter-->>BlockId: Sorted entries

    BlockId->>BlockBuilder: Initialize first block
    Note over BlockBuilder: Block starts at first entry timestamp

    loop For each entry
        BlockBuilder->>BlockBuilder: Check timestamp vs block start

        alt Within 5 hours of block start
            BlockBuilder->>BlockBuilder: Add to current block
            BlockBuilder->>BlockBuilder: Accumulate tokens
        else More than 5 hours
            BlockBuilder->>BlockBuilder: Finalize current block
            BlockBuilder->>BlockBuilder: Start new block
            BlockBuilder->>BlockBuilder: Add entry to new block
        end
    end

    BlockBuilder->>BlockBuilder: Finalize last block

    loop For each block
        BlockId->>Calculator: Calculate block cost
        BlockId->>BlockId: Determine if active block

        alt Is current active block
            BlockId->>BlockId: Calculate projections
            BlockId->>BlockId: Mark as active
        end
    end

    BlockId-->>Loader: SessionBlock[]
```

</details>
