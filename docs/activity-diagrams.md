# Activity Diagrams

## CLI Command Execution Activity

### Main CLI Flow

![Main CLI Flow](./diagrams/activity-diagrams-1.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    START([User invokes ccusage]) --> PARSE_ARGS[Parse CLI arguments]
    PARSE_ARGS --> CHECK_SUBCMD{Subcommand<br/>specified?}

    CHECK_SUBCMD -->|No| USE_DEFAULT[Use 'daily' as default]
    CHECK_SUBCMD -->|Yes| ROUTE_CMD[Route to subcommand]
    USE_DEFAULT --> ROUTE_CMD

    ROUTE_CMD --> LOAD_CONFIG[Load configuration file]
    LOAD_CONFIG --> MERGE_CONFIG[Merge config with CLI args]
    MERGE_CONFIG --> CHECK_JSON{--json<br/>flag?}

    CHECK_JSON -->|Yes| SILENCE_LOGGER[Set logger.level = 0]
    CHECK_JSON -->|No| KEEP_LOGGER[Keep default log level]
    SILENCE_LOGGER --> LOAD_DATA
    KEEP_LOGGER --> LOAD_DATA

    LOAD_DATA[Load usage data] --> CHECK_DATA{Data found?}

    CHECK_DATA -->|No| WARN_EMPTY[Warn: No data found]
    CHECK_DATA -->|Yes| CALC_TOTALS[Calculate totals]

    WARN_EMPTY --> EXIT_EMPTY[Exit with code 0]

    CALC_TOTALS --> CHECK_DEBUG{--debug<br/>flag?}
    CHECK_DEBUG -->|Yes| SHOW_DEBUG[Show debug info]
    CHECK_DEBUG -->|No| FORMAT_OUT
    SHOW_DEBUG --> FORMAT_OUT

    FORMAT_OUT{Output format?}
    FORMAT_OUT -->|JSON| CHECK_JQ{--jq<br/>filter?}
    FORMAT_OUT -->|Table| CREATE_TABLE[Create table]

    CHECK_JQ -->|Yes| PROCESS_JQ[Process with jq]
    CHECK_JQ -->|No| OUTPUT_JSON[Output JSON]

    PROCESS_JQ --> OUTPUT_RESULT[Output result]
    OUTPUT_JSON --> OUTPUT_RESULT

    CREATE_TABLE --> ADD_ROWS[Add data rows]
    ADD_ROWS --> CHECK_BREAKDOWN{--breakdown<br/>flag?}

    CHECK_BREAKDOWN -->|Yes| ADD_BREAKDOWN[Add model breakdown rows]
    CHECK_BREAKDOWN -->|No| ADD_TOTALS
    ADD_BREAKDOWN --> ADD_TOTALS

    ADD_TOTALS[Add totals row] --> OUTPUT_TABLE[Output table]
    OUTPUT_TABLE --> CHECK_COMPACT{Compact mode?}

    CHECK_COMPACT -->|Yes| SHOW_HINT[Show expand hint]
    CHECK_COMPACT -->|No| END_SUCCESS
    SHOW_HINT --> END_SUCCESS

    OUTPUT_RESULT --> END_SUCCESS
    EXIT_EMPTY --> END_SUCCESS([End])
```

</details>

## Data Loading Activity

### JSONL File Processing

![JSONL File Processing](./diagrams/activity-diagrams-2.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    START([Start data loading]) --> GET_PATHS[Get Claude data paths]

    GET_PATHS --> CHECK_ENV{CLAUDE_CONFIG_DIR<br/>set?}

    CHECK_ENV -->|Yes| PARSE_ENV[Parse comma-separated paths]
    CHECK_ENV -->|No| USE_DEFAULTS[Use default paths]

    PARSE_ENV --> VALIDATE_ENV{Valid directories<br/>exist?}
    VALIDATE_ENV -->|Yes| USE_ENV[Use environment paths]
    VALIDATE_ENV -->|No| THROW_ERROR[Throw error]

    USE_DEFAULTS --> CHECK_DEFAULTS{Default paths<br/>exist?}
    CHECK_DEFAULTS -->|Yes| USE_DEFAULT_PATHS[Use found default paths]
    CHECK_DEFAULTS -->|No| THROW_ERROR

    USE_ENV --> GLOB_FILES
    USE_DEFAULT_PATHS --> GLOB_FILES

    GLOB_FILES[Glob for JSONL files] --> INIT_ENTRIES[Initialize entries array]

    INIT_ENTRIES --> LOOP_FILES{More files?}

    LOOP_FILES -->|No| APPLY_FILTERS
    LOOP_FILES -->|Yes| READ_FILE[Create read stream]

    READ_FILE --> CREATE_READER[Create readline interface]
    CREATE_READER --> LOOP_LINES{More lines?}

    LOOP_LINES -->|No| LOOP_FILES
    LOOP_LINES -->|Yes| PARSE_LINE[Parse JSON line]

    PARSE_LINE --> VALIDATE_SCHEMA{Valid against<br/>schema?}

    VALIDATE_SCHEMA -->|No| SKIP_LINE[Skip silently]
    VALIDATE_SCHEMA -->|Yes| EXTRACT_DATA[Extract usage data]

    SKIP_LINE --> LOOP_LINES
    EXTRACT_DATA --> ADD_ENTRY[Add to entries]
    ADD_ENTRY --> LOOP_LINES

    APPLY_FILTERS[Apply date filters] --> CHECK_SINCE{--since<br/>specified?}

    CHECK_SINCE -->|Yes| FILTER_SINCE[Filter by since date]
    CHECK_SINCE -->|No| CHECK_UNTIL

    FILTER_SINCE --> CHECK_UNTIL{--until<br/>specified?}

    CHECK_UNTIL -->|Yes| FILTER_UNTIL[Filter by until date]
    CHECK_UNTIL -->|No| AGGREGATE

    FILTER_UNTIL --> AGGREGATE

    AGGREGATE[Aggregate by date/session/month] --> CALC_COSTS[Calculate costs for each group]

    CALC_COSTS --> SORT_RESULTS[Sort results]
    SORT_RESULTS --> RETURN([Return aggregated data])

    THROW_ERROR --> ERROR([Throw Error])
```

</details>

## Cost Calculation Activity

### Tiered Pricing Calculation

![Tiered Pricing Calculation](./diagrams/activity-diagrams-3.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    START([Calculate cost]) --> GET_PRICING[Get model pricing]

    GET_PRICING --> CHECK_CACHE{Pricing<br/>cached?}

    CHECK_CACHE -->|Yes| USE_CACHE[Use cached pricing]
    CHECK_CACHE -->|No| CHECK_OFFLINE{Offline<br/>mode?}

    CHECK_OFFLINE -->|Yes| LOAD_OFFLINE[Load offline pricing]
    CHECK_OFFLINE -->|No| FETCH_ONLINE[Fetch from LiteLLM API]

    FETCH_ONLINE --> CHECK_RESPONSE{Response<br/>OK?}

    CHECK_RESPONSE -->|No| FALLBACK_OFFLINE[Fallback to offline]
    CHECK_RESPONSE -->|Yes| PARSE_RESPONSE[Parse JSON response]

    FALLBACK_OFFLINE --> LOAD_OFFLINE
    LOAD_OFFLINE --> CACHE_PRICING

    PARSE_RESPONSE --> VALIDATE_MODELS{Valid model<br/>entries?}
    VALIDATE_MODELS -->|Yes| CACHE_PRICING[Cache pricing data]
    VALIDATE_MODELS -->|No| SKIP_INVALID[Skip invalid entries]
    SKIP_INVALID --> CACHE_PRICING

    USE_CACHE --> LOOKUP_MODEL
    CACHE_PRICING --> LOOKUP_MODEL

    LOOKUP_MODEL[Lookup model pricing] --> TRY_DIRECT{Direct<br/>match?}

    TRY_DIRECT -->|Yes| FOUND_PRICING[Use pricing]
    TRY_DIRECT -->|No| TRY_PREFIX[Try with provider prefix]

    TRY_PREFIX --> CHECK_PREFIX{Match with<br/>prefix?}
    CHECK_PREFIX -->|Yes| FOUND_PRICING
    CHECK_PREFIX -->|No| TRY_FUZZY[Try fuzzy match]

    TRY_FUZZY --> CHECK_FUZZY{Fuzzy<br/>match?}
    CHECK_FUZZY -->|Yes| FOUND_PRICING
    CHECK_FUZZY -->|No| NO_PRICING[Return null]

    FOUND_PRICING --> CALC_INPUT[Calculate input token cost]

    CALC_INPUT --> CHECK_INPUT_TIERED{Input tokens<br/>> 200k?}

    CHECK_INPUT_TIERED -->|Yes| TIERED_INPUT[Apply tiered pricing]
    CHECK_INPUT_TIERED -->|No| BASE_INPUT[Apply base pricing]

    TIERED_INPUT --> CALC_OUTPUT
    BASE_INPUT --> CALC_OUTPUT

    CALC_OUTPUT[Calculate output token cost] --> CHECK_OUTPUT_TIERED{Output tokens<br/>> 200k?}

    CHECK_OUTPUT_TIERED -->|Yes| TIERED_OUTPUT[Apply tiered pricing]
    CHECK_OUTPUT_TIERED -->|No| BASE_OUTPUT[Apply base pricing]

    TIERED_OUTPUT --> CALC_CACHE_CREATE
    BASE_OUTPUT --> CALC_CACHE_CREATE

    CALC_CACHE_CREATE[Calculate cache creation cost] --> CALC_CACHE_READ[Calculate cache read cost]

    CALC_CACHE_READ --> SUM_COSTS[Sum all costs]
    SUM_COSTS --> RETURN_SUCCESS([Return Result.succeed])

    NO_PRICING --> RETURN_FAIL([Return Result.fail])
```

</details>

## MCP Server Request Handling Activity

### Tool Request Processing

![Tool Request Processing](./diagrams/activity-diagrams-4.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    START([MCP Request received]) --> PARSE_REQUEST[Parse request]

    PARSE_REQUEST --> CHECK_TRANSPORT{Transport<br/>type?}

    CHECK_TRANSPORT -->|HTTP| HTTP_HANDLER[HTTP Transport Handler]
    CHECK_TRANSPORT -->|Stdio| STDIO_HANDLER[Stdio Transport Handler]

    HTTP_HANDLER --> PROCESS_MSG
    STDIO_HANDLER --> PROCESS_MSG

    PROCESS_MSG[Process message] --> CHECK_TYPE{Message<br/>type?}

    CHECK_TYPE -->|CallTool| LOOKUP_TOOL[Lookup registered tool]
    CHECK_TYPE -->|Other| HANDLE_OTHER[Handle other message types]

    LOOKUP_TOOL --> CHECK_TOOL{Tool<br/>found?}

    CHECK_TOOL -->|No| TOOL_ERROR[Return error response]
    CHECK_TOOL -->|Yes| PARSE_ARGS[Parse tool arguments]

    PARSE_ARGS --> VALIDATE_ARGS{Arguments<br/>valid?}

    VALIDATE_ARGS -->|No| ARG_ERROR[Return validation error]
    VALIDATE_ARGS -->|Yes| EXECUTE_TOOL[Execute tool handler]

    EXECUTE_TOOL --> WHICH_TOOL{Which tool?}

    WHICH_TOOL -->|daily| EXEC_DAILY[getCcusageDaily]
    WHICH_TOOL -->|session| EXEC_SESSION[getCcusageSession]
    WHICH_TOOL -->|monthly| EXEC_MONTHLY[getCcusageMonthly]
    WHICH_TOOL -->|blocks| EXEC_BLOCKS[getCcusageBlocks]
    WHICH_TOOL -->|codex-daily| EXEC_CDX_DAILY[getCodexDaily]
    WHICH_TOOL -->|codex-monthly| EXEC_CDX_MONTHLY[getCodexMonthly]

    EXEC_DAILY --> FORMAT_RESPONSE
    EXEC_SESSION --> FORMAT_RESPONSE
    EXEC_MONTHLY --> FORMAT_RESPONSE
    EXEC_BLOCKS --> FORMAT_RESPONSE
    EXEC_CDX_DAILY --> FORMAT_RESPONSE
    EXEC_CDX_MONTHLY --> FORMAT_RESPONSE

    FORMAT_RESPONSE[Format JSON response] --> BUILD_CONTENT[Build content array]
    BUILD_CONTENT --> RETURN_SUCCESS([Return tool response])

    TOOL_ERROR --> RETURN_ERROR([Return error])
    ARG_ERROR --> RETURN_ERROR
    HANDLE_OTHER --> RETURN_OTHER([Return other response])
```

</details>

## Session Blocks Detection Activity

### 5-Hour Block Identification (Detailed)

The `identifySessionBlocks()` function in `_session-blocks.ts` implements Claude's billing block detection with gap handling.

![5-Hour Block Identification](./diagrams/activity-diagrams-5.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    START([identifySessionBlocks<br/>entries, sessionDurationHours=5]) --> CHECK_EMPTY{entries.length<br/>== 0?}

    CHECK_EMPTY -->|Yes| RETURN_EMPTY([Return empty array])
    CHECK_EMPTY -->|No| CALC_DURATION[sessionDurationMs =<br/>5 × 60 × 60 × 1000]

    CALC_DURATION --> SORT[Sort entries by timestamp<br/>ascending]

    SORT --> INIT_VARS[currentBlockStart = null<br/>currentBlockEntries = []]

    INIT_VARS --> LOOP{For each entry<br/>in sortedEntries}

    LOOP -->|Done| CLOSE_LAST{currentBlockEntries<br/>.length > 0?}
    LOOP -->|Next| CHECK_FIRST{currentBlockStart<br/>== null?}

    CHECK_FIRST -->|Yes| START_FIRST[currentBlockStart =<br/>floorToHour(entry.timestamp)]
    CHECK_FIRST -->|No| CALC_TIME_DIFFS

    START_FIRST --> ADD_FIRST[currentBlockEntries = [entry]]
    ADD_FIRST --> LOOP

    CALC_TIME_DIFFS[timeSinceBlockStart =<br/>entry.time - blockStart.time<br/><br/>timeSinceLastEntry =<br/>entry.time - lastEntry.time]

    CALC_TIME_DIFFS --> CHECK_EXCEED{timeSinceBlockStart > 5hr<br/>OR<br/>timeSinceLastEntry > 5hr?}

    CHECK_EXCEED -->|No| ADD_TO_CURRENT[Add entry to currentBlockEntries]
    ADD_TO_CURRENT --> LOOP

    CHECK_EXCEED -->|Yes| CLOSE_BLOCK[createBlock<br/>currentBlockStart,<br/>currentBlockEntries]

    CLOSE_BLOCK --> PUSH_BLOCK[blocks.push(block)]

    PUSH_BLOCK --> CHECK_GAP{timeSinceLastEntry<br/>> 5 hours?}

    CHECK_GAP -->|Yes| CREATE_GAP[createGapBlock<br/>lastEntryTime, entryTime]
    CHECK_GAP -->|No| NEW_BLOCK

    CREATE_GAP --> PUSH_GAP[blocks.push(gapBlock)]
    PUSH_GAP --> NEW_BLOCK

    NEW_BLOCK[currentBlockStart =<br/>floorToHour(entry.timestamp)]
    NEW_BLOCK --> RESET_ENTRIES[currentBlockEntries = [entry]]
    RESET_ENTRIES --> LOOP

    CLOSE_LAST -->|Yes| CREATE_LAST[createBlock for last entries]
    CLOSE_LAST -->|No| RETURN_BLOCKS

    CREATE_LAST --> PUSH_LAST[blocks.push(lastBlock)]
    PUSH_LAST --> RETURN_BLOCKS([Return SessionBlock array])
```

</details>

### Block Creation Detail

![Block Creation Detail](./diagrams/activity-diagrams-6.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    CREATE[createBlock<br/>startTime, entries, now, durationMs] --> CALC_END[endTime = startTime + 5 hours]

    CALC_END --> FIND_ACTUAL[actualEndTime = last entry timestamp]

    FIND_ACTUAL --> CHECK_ACTIVE{now < endTime<br/>AND<br/>now >= startTime?}

    CHECK_ACTIVE -->|Yes| SET_ACTIVE[isActive = true]
    CHECK_ACTIVE -->|No| SET_INACTIVE[isActive = false]

    SET_ACTIVE --> AGG_TOKENS
    SET_INACTIVE --> AGG_TOKENS

    AGG_TOKENS[Aggregate tokens:<br/>inputTokens<br/>outputTokens<br/>cacheCreationInputTokens<br/>cacheReadInputTokens]

    AGG_TOKENS --> SUM_COST[Sum costUSD from entries]

    SUM_COST --> COLLECT_MODELS[models = uniq(entry.model)]

    COLLECT_MODELS --> GET_RESET[usageLimitResetTime from<br/>first entry with value]

    GET_RESET --> BUILD_BLOCK[Build SessionBlock object]

    BUILD_BLOCK --> RETURN([Return SessionBlock])
```

</details>

### Gap Block Detection

![Gap Block Detection](./diagrams/activity-diagrams-7.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    GAP_START([createGapBlock<br/>lastEntryTime, nextEntryTime]) --> CALC_GAP[gapDuration =<br/>nextEntryTime - lastEntryTime]

    CALC_GAP --> CHECK_SIG{gapDuration ><br/>sessionDurationMs?}

    CHECK_SIG -->|No| RETURN_NULL([Return null])
    CHECK_SIG -->|Yes| CREATE_GAP_BLOCK

    CREATE_GAP_BLOCK[Create gap block:<br/>startTime = lastEntryTime<br/>endTime = nextEntryTime<br/>isGap = true<br/>entries = []<br/>tokens = all zeros]

    CREATE_GAP_BLOCK --> RETURN_GAP([Return gap SessionBlock])
```

</details>

### Block Timing Diagram

![Block Timing Diagram](./diagrams/activity-diagrams-8.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
gantt
    title 5-Hour Billing Block Timeline Example
    dateFormat HH:mm

    section Block 1
    Active Usage    :b1, 09:00, 3h
    Idle (within block) :idle1, 12:00, 2h

    section Gap
    No Activity (>5hr) :crit, gap1, 14:00, 6h

    section Block 2
    New Block Starts :b2, 20:00, 4h

    section Block 3 (Active)
    Current Activity :active, b3, 00:00, 2h
```

</details>

## Table Formatting Activity

### Usage Report Table Creation

![Usage Report Table Creation](./diagrams/activity-diagrams-9.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    START([Create usage table]) --> CHECK_WIDTH[Check terminal width]

    CHECK_WIDTH --> DETERMINE_MODE{Width < threshold?}

    DETERMINE_MODE -->|Yes| COMPACT_MODE[Enable compact mode]
    DETERMINE_MODE -->|No| FULL_MODE[Enable full mode]

    COMPACT_MODE --> CREATE_COMPACT[Create compact column config]
    FULL_MODE --> CREATE_FULL[Create full column config]

    CREATE_COMPACT --> INIT_TABLE
    CREATE_FULL --> INIT_TABLE

    INIT_TABLE[Initialize cli-table3] --> ADD_HEADER[Add header row]

    ADD_HEADER --> LOOP_DATA{More data rows?}

    LOOP_DATA -->|No| ADD_SEPARATOR
    LOOP_DATA -->|Yes| FORMAT_ROW[Format data row]

    FORMAT_ROW --> FORMAT_DATE[Format date]
    FORMAT_DATE --> FORMAT_INPUT[Format input tokens]
    FORMAT_INPUT --> FORMAT_OUTPUT[Format output tokens]

    FORMAT_OUTPUT --> CHECK_COMPACT{Compact<br/>mode?}

    CHECK_COMPACT -->|Yes| SKIP_CACHE[Skip cache columns]
    CHECK_COMPACT -->|No| FORMAT_CACHE[Format cache columns]

    SKIP_CACHE --> FORMAT_COST
    FORMAT_CACHE --> FORMAT_COST

    FORMAT_COST[Format cost] --> FORMAT_MODELS[Format models used]
    FORMAT_MODELS --> ADD_ROW[Add row to table]

    ADD_ROW --> CHECK_BREAKDOWN{--breakdown<br/>flag?}

    CHECK_BREAKDOWN -->|Yes| ADD_BREAKDOWN_ROWS[Add model breakdown rows]
    CHECK_BREAKDOWN -->|No| LOOP_DATA

    ADD_BREAKDOWN_ROWS --> LOOP_DATA

    ADD_SEPARATOR[Add empty separator row] --> ADD_TOTALS[Add totals row]

    ADD_TOTALS --> FORMAT_TOTALS[Format totals with colors]
    FORMAT_TOTALS --> RENDER_TABLE[Render table string]

    RENDER_TABLE --> RETURN([Return table string])
```

</details>

## Configuration Resolution Activity

### Config File Discovery and Merging

![Config File Discovery and Merging](./diagrams/activity-diagrams-10.svg)

<details>
<summary>View Mermaid Source</summary>

```mermaid
flowchart TD
    START([Load configuration]) --> CHECK_EXPLICIT{Explicit path<br/>provided?}

    CHECK_EXPLICIT -->|Yes| READ_EXPLICIT[Read specified file]
    CHECK_EXPLICIT -->|No| DISCOVER[Auto-discover config]

    DISCOVER --> TRY_LOCAL[Try ./ccusage.json]
    TRY_LOCAL --> CHECK_LOCAL{File<br/>exists?}

    CHECK_LOCAL -->|Yes| READ_LOCAL[Read local config]
    CHECK_LOCAL -->|No| TRY_XDG[Try ~/.config/ccusage/config.json]

    TRY_XDG --> CHECK_XDG{File<br/>exists?}

    CHECK_XDG -->|Yes| READ_XDG[Read XDG config]
    CHECK_XDG -->|No| TRY_HOME[Try ~/.ccusage.json]

    TRY_HOME --> CHECK_HOME{File<br/>exists?}

    CHECK_HOME -->|Yes| READ_HOME[Read home config]
    CHECK_HOME -->|No| USE_DEFAULTS[Use default values]

    READ_EXPLICIT --> PARSE_JSON
    READ_LOCAL --> PARSE_JSON
    READ_XDG --> PARSE_JSON
    READ_HOME --> PARSE_JSON

    PARSE_JSON[Parse JSON] --> VALIDATE_SCHEMA{Valid against<br/>schema?}

    VALIDATE_SCHEMA -->|No| LOG_WARNING[Log validation warning]
    VALIDATE_SCHEMA -->|Yes| EXTRACT_CONFIG[Extract configuration]

    LOG_WARNING --> USE_PARTIAL[Use valid portions]
    USE_PARTIAL --> MERGE_DEFAULTS
    EXTRACT_CONFIG --> MERGE_DEFAULTS

    USE_DEFAULTS --> MERGE_DEFAULTS

    MERGE_DEFAULTS[Merge with defaults] --> RETURN_CONFIG([Return config object])

    RETURN_CONFIG --> MERGE_ARGS[Merge with CLI args]

    MERGE_ARGS --> LOOP_OPTIONS{More options?}

    LOOP_OPTIONS -->|No| RETURN_MERGED([Return merged options])
    LOOP_OPTIONS -->|Yes| CHECK_CLI{CLI arg<br/>provided?}

    CHECK_CLI -->|Yes| USE_CLI[Use CLI value]
    CHECK_CLI -->|No| CHECK_CONFIG{Config<br/>value set?}

    USE_CLI --> LOOP_OPTIONS

    CHECK_CONFIG -->|Yes| USE_CONFIG[Use config value]
    CHECK_CONFIG -->|No| USE_DEFAULT[Use default value]

    USE_CONFIG --> LOOP_OPTIONS
    USE_DEFAULT --> LOOP_OPTIONS
```

</details>
