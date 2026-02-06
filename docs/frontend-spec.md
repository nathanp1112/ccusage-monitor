# Frontend Specification: Team Usage Dashboard

> **Status:** Draft
> **Target Folder:** `ccusage-monitor/dashboard/`

---

## 1. Project Context

### 1.1 Purpose

Build a web dashboard to visualize Claude Code usage data collected from team members. The dashboard consumes data from the API server defined in `team-monitor-technical-design.md`.

### 1.2 Relationship to Existing Code

```
ccusage-monitor/
├── ccusage/              # Existing CLI monorepo (DO NOT MODIFY)
├── docs/                 # Documentation
└── dashboard/            # NEW: Frontend application
```

### 1.3 Backend API (Source of Truth)

The frontend will consume these endpoints from the API server:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth/login` | Login, get JWT |
| `POST` | `/api/auth/refresh` | Refresh token |
| `GET` | `/api/dashboard` | Team overview stats |
| `GET` | `/api/members` | List all members |
| `GET` | `/api/members/:id` | Member detail |
| `GET` | `/api/members/:id/usage` | Member usage data |
| `GET` | `/api/reports/daily` | Daily breakdown |
| `GET` | `/api/reports/monthly` | Monthly summary |

---

## 2. Functional Requirements

### 2.1 Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Email/password authentication |
| Dashboard | `/` | Team overview with charts |
| Members | `/members` | List all team members |
| Member Detail | `/members/[id]` | Individual member usage |
| Reports | `/reports` | Export and analytics |

### 2.2 Dashboard Features

- **Summary cards**: Total cost, tokens, active members
- **Daily trend chart**: Line chart of usage over time
- **Top users table**: Ranked by cost
- **Model distribution**: Pie chart by model type

### 2.3 Member Detail Features

- **Usage timeline**: Daily/weekly view
- **Project breakdown**: Usage per project
- **Session history**: Recent sessions with token counts

### 2.4 Authentication

- JWT stored in HTTP-only cookie (set by API)
- Auto-refresh on expiry
- Redirect to `/login` when unauthorized

---

## 3. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Initial load | < 2s |
| Bundle size | < 200KB gzipped |
| Browser support | Chrome, Firefox, Safari (latest 2 versions) |
| Responsive | Desktop-first, tablet support |
| Accessibility | WCAG 2.1 AA |

---

## 4. Questions for Frontend Developer

1. **Framework**: Next.js App Router vs Pages Router?
2. **Styling**: Tailwind CSS vs CSS Modules vs styled-components?
3. **State management**: React Query vs SWR vs Zustand?
4. **Charts**: Recharts vs Chart.js vs Visx?
5. **Component library**: shadcn/ui vs Radix vs custom?
6. **Form handling**: React Hook Form vs Formik?
7. **Testing**: Vitest + Testing Library vs Jest?
8. **Build tool**: Default Next.js (Turbopack)?

---

## 5. Design Constraints

- Must work with existing Docker Compose deployment
- API runs on same domain (no CORS issues)
- No external analytics/tracking
- Self-hosted, no cloud dependencies

