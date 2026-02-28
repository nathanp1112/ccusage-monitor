# CCUsage Monitor — Project Documentation

> **Generated:** 2026-02-25 | **Scan Level:** Exhaustive | **Project Type:** Serverless Monitoring System

## Quick Reference

| Attribute | Value |
|-----------|-------|
| **Project** | CCUsage Monitor |
| **Purpose** | Team monitoring for Claude Code usage tracking |
| **Primary Language** | TypeScript (all components) |
| **Infrastructure** | AWS Lambda, S3, API Gateway, CloudFront |
| **Region** | ap-southeast-1 (Singapore) |
| **Components** | be-agent (CLI), lambda-server (Backend), dashboard (Frontend) |

## Architecture Overview

```
Developer Machine                    AWS Cloud
┌───────────────────┐               ┌──────────────────────────────────────────┐
│   be-agent        │  POST         │           API Gateway (HTTP API)         │
│   (ccusage-agent) │  /api/sync    │  ┌────────────────────────────────────┐  │
│                   │──────────────▶│  │  Lambda: API Handler (Hono)       │  │
│ Parse ~/.claude/  │               │  └───────────────┬──────────────────┘  │
│ projects/*.jsonl  │  GET          │                  │                      │
│                   │  /api/agent/* │  ┌───────────────┴──────────────────┐  │
│                   │◀──────────────│  │  S3 Bucket (ccusage-data-dev)   │  │
└───────────────────┘               │  │  raw/ → aggregated/ → views/    │  │
                                    │  └───────────────┬──────────────────┘  │
                                    │                  │                      │
Browser (SPA)                       │  ┌───────────────┴──────────────────┐  │
┌───────────────────┐  CloudFront   │  │  Lambda: Aggregator (hourly)    │  │
│   dashboard       │◀──────────── │  └──────────────────────────────────┘  │
│   (Next.js 15)    │  GET /api/*   │                                        │
│                   │──────────────▶│                                        │
└───────────────────┘               └──────────────────────────────────────────┘
```

## Generated Documentation

### Core Documentation

| Document | Description |
|----------|-------------|
| [Project Overview](./project-overview.md) | Executive summary, architecture overview, component details, AWS infrastructure, key design decisions |
| [Architecture](./architecture.md) | Detailed system architecture with mermaid diagrams: component internals, data architecture, communication patterns, security, infrastructure |
| [Source Tree Analysis](./source-tree-analysis.md) | Complete annotated directory structure for all 3 components with file-by-file descriptions |

### Technical Guides

| Document | Description |
|----------|-------------|
| [Development Guide](./development-guide.md) | Local setup, environment variables, build commands, testing, deployment, common tasks, debugging |
| [API Contracts](./api-contracts.md) | Complete API documentation: all endpoints, request/response types, auth, error codes, batching, CORS |
| [Data Models](./data-models.md) | S3 key patterns, TypeScript interfaces, JSONL format, sync payloads, view types, agent config |
| [Integration Architecture](./integration-architecture.md) | All integration points: sync protocol, command polling, S3 storage, dashboard API, admin commands |

### Pre-Existing Design Documents

| Document | Description |
|----------|-------------|
| [S3 Serverless Architecture Spec](./architecture-s3-serverless.md) | Original design spec for migrating from PostgreSQL to S3 serverless |
| [Technical Design](./team-monitor-technical-design.md) | Initial technical design document (v1.0.0, 2026-01-26) |
| [Frontend Spec](./frontend-spec.md) | Dashboard frontend specification |
| [RFC: Incremental Aggregation](./rfc-incremental-aggregation.md) | RFC for aggregate-at-source pattern (2026-02-06) |

## Component Summary

| Component | Tech | Version | Responsibility |
|-----------|------|---------|----------------|
| **be-agent** | Node.js CLI (Commander.js) | 0.5.0 | Parse local JSONL logs, push to server, auto-update, execute admin commands |
| **lambda-server** | Hono on AWS Lambda | 0.1.0 | Store raw data in S3, compute aggregations, serve views, auth, admin |
| **dashboard** | Next.js 15 (static export) | 0.1.0 | Fetch views, render charts (Recharts), hosted on CloudFront |

## Three-Layer S3 Architecture

```
raw/           = "What happened"    (source of truth, individual entries)
aggregated/    = "What it means"    (pre-computed per-month summaries)
views/         = "What to show"     (dashboard-ready JSON)

Each layer can be rebuilt from the one above: raw/ → aggregated/ → views/
```

## Technology Stack

| Category | Technology |
|----------|------------|
| **CLI Framework** | Commander.js |
| **Backend Framework** | Hono |
| **Frontend Framework** | Next.js 15 (React 19) |
| **Server State** | TanStack Query 5 |
| **UI State** | Zustand 5 |
| **Charts** | Recharts 2.15 |
| **Styling** | Tailwind CSS 4 + Radix UI |
| **Validation** | Zod |
| **Auth** | JWT (HS256) |
| **Testing** | Vitest |
| **Infrastructure** | AWS Lambda, S3, API Gateway, CloudFront, EventBridge |
| **Deployment** | Serverless Framework v4 |

## Getting Started

```bash
# Lambda server (local dev)
cd lambda-server && pnpm dev

# Dashboard (local dev)
cd dashboard && pnpm dev

# Agent (build + test)
cd be-agent && pnpm build && pnpm start sync --dry-run
```

See [Development Guide](./development-guide.md) for detailed setup instructions.
