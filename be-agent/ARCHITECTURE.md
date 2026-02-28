# be-agent Architecture

> Diagrams rendered with [D2](https://d2lang.com). Source files in `diagrams/*.d2`.
> Recompile: `d2 --layout elk diagrams/<name>.d2 diagrams/<name>.svg`

## 1. Module Architecture

All modules and their relationships — CLI entry, command handlers, libraries, daemon loop, filesystem, OS services, and server endpoints.

![Module Architecture](diagrams/01-module-architecture.svg)

<details>
<summary>D2 source</summary>

See [`diagrams/01-module-architecture.d2`](diagrams/01-module-architecture.d2)
</details>

## 2. Sync Data Pipeline (Main Flow)

The complete sync cycle triggered by launchd/systemd: load config → collect from byte offsets → batch push → poll admin commands.

![Sync Pipeline](diagrams/02-sync-pipeline.svg)

<details>
<summary>D2 source</summary>

See [`diagrams/02-sync-pipeline.d2`](diagrams/02-sync-pipeline.d2)
</details>

## 3. Setup & Update Lifecycle

Build-time URL injection, first-time setup (OS service install), auto-start scheduling, and self-update flow.

![Setup & Update Lifecycle](diagrams/03-setup-update-lifecycle.svg)

<details>
<summary>D2 source</summary>

See [`diagrams/03-setup-update-lifecycle.d2`](diagrams/03-setup-update-lifecycle.d2)
</details>

## 4. File Offset State Machine

How incremental file reading works: new files, unchanged (skip), appended (read from offset), truncated (reset), and force mode.

![File Offset State Machine](diagrams/04-file-offset-state-machine.svg)

<details>
<summary>D2 source</summary>

See [`diagrams/04-file-offset-state-machine.d2`](diagrams/04-file-offset-state-machine.d2)
</details>

## 5. Data Payload Structure

How JSONL source lines are parsed into UsageEntry, PromptEntry, and ProjectInfo, then batched into the POST /api/sync payload.

![Data Payload Structure](diagrams/05-data-payload-structure.svg)

<details>
<summary>D2 source</summary>

See [`diagrams/05-data-payload-structure.d2`](diagrams/05-data-payload-structure.d2)
</details>
