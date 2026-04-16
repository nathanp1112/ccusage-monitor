# CCUsage Monitor - Project Context

Comprehensive documentation for the CCUsage Monitor system, generated for providing project context to AI agents and developers.

## Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [System Architecture](01-system-architecture.md) | High-level overview of the three components (be-agent, lambda-server, dashboard) and their interactions |
| 02 | [AWS Infrastructure](02-aws-infrastructure.md) | AWS resources, Lambda configuration, S3 buckets, CloudFront, IAM, monitoring, multi-stage deployment |
| 03 | [S3 Data Model](03-s3-data-model.md) | Three-layer S3 storage architecture (raw/aggregated/views), all data types and relationships |
| 04 | [Data Pipeline](04-data-pipeline.md) | End-to-end data flow from JSONL files through agent collection, server processing, aggregation, to dashboard display |
| 05 | [API Reference](05-api-reference.md) | All API endpoints grouped by route (sync, dashboard, members, agent, admin, auth, register) |
| 06 | [Agent Lifecycle](06-agent-lifecycle.md) | Setup, sync cycle, update, command execution, state management, CLI commands |
| 07 | [Dashboard Architecture](07-dashboard-architecture.md) | Frontend component hierarchy, state management, auth flow, chart components, responsive design |
| 09 | [Dashboard Widgets (Exhaustive)](09-dashboard-widgets.md) | All 78 widget components: charts, members, shared, UI primitives, data layer, API contracts, ERD, sequences, business flow |

## Diagrams

### Mermaid Diagrams (Legacy)

All diagrams are generated from Mermaid source files and compiled to SVG.

| # | Diagram | Source |
|---|---------|--------|
| 01 | System Architecture | [SVG](diagrams/01-system-architecture.svg) / [Mermaid](diagrams/01-system-architecture.mmd) |
| 02 | AWS Infrastructure | [SVG](diagrams/02-aws-infrastructure.svg) / [Mermaid](diagrams/02-aws-infrastructure.mmd) |
| 03 | S3 Data Model | [SVG](diagrams/03-s3-data-model.svg) / [Mermaid](diagrams/03-s3-data-model.mmd) |
| 04 | Data Pipeline | [SVG](diagrams/04-data-pipeline.svg) / [Mermaid](diagrams/04-data-pipeline.mmd) |
| 05 | API Routes | [SVG](diagrams/05-api-routes.svg) / [Mermaid](diagrams/05-api-routes.mmd) |
| 06 | Agent Lifecycle | [SVG](diagrams/06-agent-lifecycle.svg) / [Mermaid](diagrams/06-agent-lifecycle.mmd) |
| 07 | Dashboard Components | [SVG](diagrams/07-dashboard-components.svg) / [Mermaid](diagrams/07-dashboard-components.mmd) |
| 08 | Auth Flow | [SVG](diagrams/08-auth-flow.svg) / [Mermaid](diagrams/08-auth-flow.mmd) |

### D2 Diagrams (Dashboard Widgets Scan)

Generated from D2 source files and compiled to SVG using ELK layout engine.

| # | Diagram | Source |
|---|---------|--------|
| 01 | Overview Architecture | [SVG](diagrams/svg/overview-architecture.svg) / [D2](diagrams/d2/overview-architecture.d2) |
| 02 | Infrastructure | [SVG](diagrams/svg/infrastructure.svg) / [D2](diagrams/d2/infrastructure.d2) |
| 03 | ERD (Entity Relationships) | [SVG](diagrams/svg/erd.svg) / [D2](diagrams/d2/erd.d2) |
| 04 | Login Sequence | [SVG](diagrams/svg/sequence-login.svg) / [D2](diagrams/d2/sequence-login.d2) |
| 05 | Dashboard Fetch Sequence | [SVG](diagrams/svg/sequence-dashboard-fetch.svg) / [D2](diagrams/d2/sequence-dashboard-fetch.d2) |
| 06 | Members List Sequence | [SVG](diagrams/svg/sequence-members-list.svg) / [D2](diagrams/d2/sequence-members-list.d2) |
| 07 | Agent Sync Sequence | [SVG](diagrams/svg/sequence-agent-sync.svg) / [D2](diagrams/d2/sequence-agent-sync.d2) |
| 08 | Aggregation Sequence | [SVG](diagrams/svg/sequence-aggregation.svg) / [D2](diagrams/d2/sequence-aggregation.d2) |
| 09 | Agent Update Sequence | [SVG](diagrams/svg/sequence-agent-update.svg) / [D2](diagrams/d2/sequence-agent-update.d2) |
| 10 | Business Flow | [SVG](diagrams/svg/business-flow.svg) / [D2](diagrams/d2/business-flow.d2) |

## Quick Reference

### Component Stack

| Component | Tech | Runtime |
|-----------|------|---------|
| be-agent | Node.js CLI (Commander.js, tsup) | Developer machine |
| lambda-server | Hono + AWS Lambda (Serverless Framework) | AWS Lambda (Node.js 20) |
| dashboard | Next.js 15 + React 19 (static export) | S3 + CloudFront |

### Key Design Patterns

- **Idempotent sync** via request_id deduplication
- **Incremental reads** via byte offsets + SHA-256 fingerprints
- **Three-layer S3** (raw → aggregated → views)
- **ETag concurrency** on member registry
- **Lazy route loading** for Lambda cold start optimization
- **Presigned URLs** for agent binary downloads
- **Batched uploads** (entries@1000, prompts@500)
- **Decimal-safe cost arithmetic** (6 decimal places)
