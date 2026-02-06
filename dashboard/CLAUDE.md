# CCUsage Dashboard - Frontend Project Context

## Overview

Next.js 15 dashboard for the CCUsage team monitoring system. Displays Claude Code usage metrics, costs, and trends for team members.

**Tech Stack:**
- Next.js 15.1 (App Router, Turbopack)
- React 19, TypeScript 5.7
- TanStack Query 5 (server state)
- Zustand 5 (UI state)
- Tailwind CSS 4 + Radix UI
- Recharts 2.15 (charts)
- Vitest + Testing Library (tests)

## Deployment Target: AWS S3 + CloudFront (Static Export)

This dashboard is deployed as a **static site** to AWS S3 with CloudFront CDN.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  CloudFront │ ──→ │   S3 Bucket │     │  API Gateway/Lambda │
│  (CDN)      │     │  (static)   │     │  (Backend API)      │
└─────────────┘     └─────────────┘     └─────────────────────┘
      ↑                                          ↑
      │              Browser                     │
      └──────────── (SPA) ──────────────────────┘
```

### Routing Constraints (IMPORTANT)

**DO NOT** use complex routing patterns that require CloudFront URL rewrites:
- No dynamic route segments (`/members/[id]`)
- No server-side redirects
- No API routes (all API calls go directly to Lambda)

**DO** use these patterns instead:
| Instead of... | Use... |
|---------------|--------|
| Navigate to `/detail/[id]` | Open a **Modal/Dialog** with detail view |
| Dynamic routes `/users/[id]` | Query params `/users?id=X` or modals |
| Server redirects | Client-side navigation |
| Next.js API routes | Direct calls to `NEXT_PUBLIC_API_URL` |

### Recommended UX Patterns

1. **List → Detail**: Use modal/sheet instead of page navigation
   ```tsx
   // Good: Modal for detail view (no URL change needed)
   <MemberDetailModal memberId={selectedId} open={isOpen} />

   // Acceptable: Query params (works without CloudFront config)
   /members?id=123

   // Avoid: Separate detail page requiring navigation
   /members/123  // Needs CloudFront rewrite rules
   ```

2. **Flat Route Structure**: Keep routes simple
   ```
   /              → Dashboard
   /members       → Members list (with modal for detail)
   /reports       → Reports
   /login         → Login
   ```

3. **State in URL**: Use query params or hash for shareable state
   ```
   /members?view=ranking&sort=cost
   /members#detail-123
   ```

### Build Command
```bash
STATIC_EXPORT=true pnpm build
# Output: /out directory for S3 upload
```

## Architecture (Development)

```
Frontend (this package)          Backend Server
┌─────────────────────┐         ┌──────────────────┐
│  dashboard:3000     │  ──→    │  server:3003     │
│  Next.js App Router │  /api/* │  API endpoints   │
│  TanStack Query     │  rewrite│  (Lambda or PG)  │
└─────────────────────┘         └──────────────────┘
```

**Key Pattern:** API proxy via Next.js rewrites (`/api/*` → `${API_SERVER_URL}/api/*`). Configure via `.env.local`:
```bash
API_SERVER_URL=http://localhost:3003  # Local dev
API_SERVER_URL=https://xxx.execute-api.region.amazonaws.com  # Production Lambda
```

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth route group (centered layout)
│   │   └── login/         # Login page
│   ├── (dashboard)/       # Dashboard route group (sidebar + navbar)
│   │   ├── page.tsx       # Dashboard home
│   │   ├── dashboard-charts.tsx  # Charts with Treemap/Pie toggle
│   │   ├── members/       # Members list (detail via modal)
│   │   └── reports/       # Reports page
│   ├── layout.tsx         # Root layout (fonts, theme script)
│   ├── providers.tsx      # QueryClient + ThemeProvider
│   └── globals.css        # Tailwind + CSS variables
├── components/
│   ├── charts/            # Recharts visualizations
│   ├── dashboard/         # Dashboard-specific (SummaryCard - legacy)
│   ├── layout/            # Sidebar, Navbar
│   ├── members/           # Member-specific components
│   │   ├── member-card.tsx           # Member card for grid view
│   │   ├── member-ranking-list.tsx   # Ranking list with medals
│   │   ├── member-detail-content.tsx # Detail view content (for modal)
│   │   ├── member-detail-charts.tsx  # Charts for detail view
│   │   └── ranking-bar.tsx           # Progress bar component
│   ├── shared/            # Reusable common components
│   │   ├── page-header.tsx      # Title + description + back button
│   │   ├── stats-bar.tsx        # Compact inline stats
│   │   ├── stats-grid.tsx       # Card grid stats
│   │   ├── controls-bar.tsx     # View toggle + sort container
│   │   ├── empty-state.tsx      # "No data" display
│   │   ├── error-state.tsx      # Error with retry
│   │   ├── data-sheet.tsx       # Modal/sheet for detail views
│   │   ├── tag-list.tsx         # Badge/tag list
│   │   ├── view-toggle.tsx      # Tab-like toggle
│   │   └── loading-spinner.tsx  # Loading states
│   ├── theme/             # ThemeProvider, ThemeToggle
│   └── ui/                # Radix-based primitives
│       ├── button, card, select, input, tooltip, dropdown-menu
│       ├── sheet.tsx      # Slide-over panel
│       └── badge.tsx      # Tag/badge component
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities
├── stores/                # Zustand stores
└── types/                 # TypeScript types
```

## Key Files for Contributors

### API Integration
- `src/lib/api-client.ts` - HTTP client, ApiError class, retry logic
- `src/lib/api-adapters.ts` - Transforms Lambda API responses to frontend format
- `src/hooks/use-dashboard.ts` - Dashboard data fetching with dual API support
- `src/hooks/use-members.ts` - Members list/detail fetching

### State Management
- `src/app/providers.tsx` - QueryClient config (5min stale, 30min gc, no refetch on focus)
- `src/stores/ui-store.ts` - Sidebar open state (persisted to localStorage)
- `src/lib/query-keys.ts` - Query key factory for cache management

### Layout & Routing
- `src/app/layout.tsx` - Root layout with theme anti-FOUC script
- `src/app/(dashboard)/layout.tsx` - Sidebar + Navbar wrapper
- `src/components/layout/sidebar.tsx` - Collapsible navigation
- `src/components/layout/navbar.tsx` - Header with user info + theme toggle

### Theme System
- `src/app/globals.css` - CSS variables for light/dark mode
- `src/components/theme/theme-provider.tsx` - Theme context with system preference
- Storage key: `ccusage-theme` in localStorage

### Member Features
- `src/lib/member-utils.ts` - Sorting, ranking, team totals calculations
- `src/lib/treemap-utils.ts` - Transform data for Recharts Treemap
- `src/types/members.ts` - View types, RankedMember, TeamTotals interfaces
- `src/components/members/` - MemberCard, MemberRankingList, RankingBar
- `src/components/shared/view-toggle.tsx` - Generic view toggle component
- `src/components/charts/cost-treemap-chart.tsx` - Treemap visualization

## Route Features

### Dashboard (`/`)
- **Summary Cards**: Total cost, tokens, active members with trend indicators
- **Daily Cost Trend**: Line chart showing cost over time
- **Distribution Toggle**: Switch between Treemap (member costs) and Pie (model costs)

### Members (`/members`)
- **Compact Summary Bar**: Inline metrics (Team Cost, Tokens, Members, Avg) - responsive hiding on mobile
- **View Toggle**: Switch between Ranking, Cards, and Chart views
- **Sort Dropdown**: Sort by Cost, Send Tokens, or Receive Tokens
- **Ranking View**: List with medals for top 3, progress bars showing relative usage
- **Cards View**: Grid of member cards with device info and last sync
- **Chart View**: Treemap visualization of member distribution
- **Detail Modal**: Click any member → slide-over sheet with full detail (no page navigation)
- **Shareable URL**: `/members?detail=X` opens modal automatically

### Member Detail (Modal in `/members`)
- **Year-to-date Stats**: Cost, send tokens, receive tokens
- **Period Selector**: Year/month buttons with heat map preview
- **Monthly Summary**: Cost, tokens, requests for selected month
- **Charts**: Daily cost trend, model distribution pie, daily token usage by model
- **Models Used**: Tag list of models used by member

## Data Flow

```
User Action → TanStack Query hook → apiClient.get()
                                        ↓
                             Next.js rewrite → Backend API
                                        ↓
                             Response → isLambdaResponse()
                                        ↓
                    Lambda? → adaptDashboardResponse() / adaptMembersResponse()
                    Legacy? → normalizeLegacyResponse()
                                        ↓
                             Frontend types → Component render
```

**Philosophy:** Server returns raw daily data, frontend calculates totals via `calculateTotals()` in `lib/calculations.ts`.

## API Endpoints Used

| Endpoint | Hook | Purpose |
|----------|------|---------|
| GET /api/dashboard | `useDashboard()` | Team overview stats |
| GET /api/dashboard/model-distribution | `DashboardCharts` | Model cost breakdown |
| GET /api/members | `useMembers()` | Members list |
| GET /api/members/:id?year=YYYY | `useMember()` | Member yearly detail |
| GET /api/members/:id/usage | `useMemberUsage()` | Raw usage records |
| POST /api/auth/login | `useLogin()` | Login (stub) |
| POST /api/auth/logout | `useLogout()` | Logout (stub) |

## Component Patterns

### Common Components (use these for consistency)

**Page Header** - Every page should use this:
```tsx
import { PageHeader } from '@/components/shared/page-header'
<PageHeader title="Members" description="View usage details" />
<PageHeader title="John Doe" description="john@example.com" backHref="/members" />
```

**Stats Grid** - For dashboard-style stat cards:
```tsx
import { StatsGrid, type StatCardItem } from '@/components/shared/stats-grid'
const stats: StatCardItem[] = [
  { title: 'Total Cost', value: '$500', icon: <DollarSign />, valueClassName: 'font-mono' },
]
<StatsGrid stats={stats} columns={4} />
```

**Stats Bar** - For compact inline stats:
```tsx
import { StatsBar, type StatItem } from '@/components/shared/stats-bar'
const stats: StatItem[] = [
  { label: 'Cost', value: '$500' },
  { label: 'Tokens', value: '1.2M', hideOnMobile: true },
]
<StatsBar stats={stats} />
```

**Controls Bar** - For view toggle + sort/filter:
```tsx
import { ControlsBar } from '@/components/shared/controls-bar'
<ControlsBar
  left={<ViewToggle ... />}
  right={<Select ... />}
/>
```

**Data Sheet** - For detail views (modal):
```tsx
import { DataSheet } from '@/components/shared/data-sheet'
<DataSheet open={!!selectedId} onClose={close} title="Details" size="xl">
  <DetailContent id={selectedId} />
</DataSheet>
```

**Empty/Error States**:
```tsx
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
<EmptyState message="No members found" />
<ErrorState message="Failed to load" onRetry={refetch} />
```

**Tag List**:
```tsx
import { TagList } from '@/components/shared/tag-list'
<TagList items={modelsUsed} emptyMessage="No models" />
```

### Chart Components
All charts accept `data`, `title`, and optional `className`:
- `UsageTrendChart` - Line chart for daily costs
- `ModelDistributionChart` - Pie chart for model breakdown
- `DailyModelUsageChart` - Stacked bar chart with token type selector
- `UsageHeatMap` - Calendar heatmap with metric selector
- `CostTreemapChart` - Treemap for member/model cost distribution

### View Toggle
Generic tab-like toggle component for switching views:
```tsx
import { ViewToggle, type ViewOption } from '@/components/shared/view-toggle'

const options: ViewOption<'ranking' | 'cards' | 'chart'>[] = [
  { value: 'ranking', label: 'Ranking', icon: <List /> },
  { value: 'cards', label: 'Cards', icon: <LayoutGrid /> },
  { value: 'chart', label: 'Chart', icon: <BarChart3 /> },
]

<ViewToggle options={options} value={view} onChange={setView} size="sm" />
```

### Member Ranking List
Displays members with rank badges (medals for top 3) and progress bars:
```tsx
import { MemberRankingList } from '@/components/members/member-ranking-list'
import { calculateRankings } from '@/lib/member-utils'

const rankedMembers = calculateRankings(members, 'costUsd')
<MemberRankingList
  members={rankedMembers}
  sortField="costUsd"
  onMemberClick={(id) => navigate(`/members/view/?id=${id}`)}
/>
```

### Member Utilities
Use `src/lib/member-utils.ts` for member data operations:
```tsx
import { sortMembers, calculateRankings, calculateTeamTotals } from '@/lib/member-utils'

// Sort members by field
const sorted = sortMembers(members, 'costUsd', 'desc')

// Get ranked members with percentage for progress bars
const ranked = calculateRankings(members, 'costUsd')

// Calculate team aggregate totals
const totals = calculateTeamTotals(members)
// { totalCost, totalInputTokens, totalOutputTokens, activeCount, totalCount, avgCostPerMember }
```

### Treemap Utilities
Use `src/lib/treemap-utils.ts` for Recharts Treemap data:
```tsx
import { transformToTreemap, type TreemapMetric } from '@/lib/treemap-utils'

const treemapData = transformToTreemap(members, 'costUsd')
// Returns { name: 'root', children: [{ name, value, id, percentage }] }
```

### Error Handling
```tsx
<ErrorFallback error={error} onRetry={() => refetch()} />
```

## Development

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Build for production
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
pnpm test         # Vitest tests
```

### Static Export (Production)
For AWS S3 + CloudFront hosting:
```bash
STATIC_EXPORT=true pnpm build
# Output: /out directory → upload to S3
```

**Current routing workaround:** `/members/view?id=X` (requires CloudFront error page fallback to index.html)

**Recommended future pattern:** Use modals for detail views to avoid CloudFront configuration entirely. See "Deployment Target" section above.

## Coding Conventions

### Imports
Use `@/` alias for src imports:
```tsx
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
```

### Styling
- Tailwind utility classes
- `cn()` for conditional classes
- CSS variables for theme colors (`hsl(var(--foreground))`)
- `font-mono` class for numeric values (costs, tokens)

### Data Formatting
```tsx
formatCurrency(123.45)      // "$123.45"
formatTokens(1500000)       // "1.5M"
formatRelativeTime(date)    // "2h ago"
formatChange(5.2)           // "+5.2%"
```

### Query Keys
Always use factory from `queryKeys`:
```tsx
queryKeys.dashboard.stats(dateRange)
queryKeys.members.detail(id, year)
queryKeys.members.yearlyRaw(id, year)
```

## Testing

Tests in `tests/` directory with Vitest + Testing Library.

Setup includes mocks for:
- `next/navigation` (useRouter, usePathname)
- `window.matchMedia` (theme detection)
- `ResizeObserver` (charts)

## Type Definitions

### Members Types (`src/types/members.ts`)
```tsx
type MembersViewType = 'ranking' | 'cards' | 'chart'
type MemberSortField = 'costUsd' | 'inputTokens' | 'outputTokens' | 'name'
type SortOrder = 'asc' | 'desc'

interface RankedMember {
  id, name, email, costUsd, inputTokens, outputTokens,
  lastSyncAt, isActive, lastSync,
  rank: number,        // 1-indexed position
  percentage: number   // 0-100 for progress bar
}

interface TeamTotals {
  totalCost, totalInputTokens, totalOutputTokens,
  activeCount, totalCount, avgCostPerMember
}

interface TreemapNode { name, value, id?, email?, percentage? }
interface TreemapData { name: 'root', children: TreemapNode[] }
```

## Gotchas & Notes

1. **Modal-Based Detail Views:** Member detail uses `DataSheet` modal instead of separate route - no CloudFront rewrite config needed. URL updates via `history.pushState` for shareable links (`/members?detail=X`).

2. **Theme Flash Prevention:** Inline script in `layout.tsx` runs before React hydration to set `dark` class

3. **API Dual Support:** Hooks handle both Lambda API (new, has `generatedAt`) and PostgreSQL API (legacy) transparently

4. **Sidebar State:** Persisted to localStorage via Zustand `persist` middleware

5. **Query Retry:** Only retries on 5xx errors (3 attempts), not 4xx

6. **Chart Accessibility:** All charts include `role="img"` and `aria-label`

7. **Treemap Custom Content:** `CostTreemapChart` uses custom SVG renderer for cell labels, auto-hides text for small cells

8. **Ranking Medals:** Top 3 members display emoji medals (gold, silver, bronze), others show `#N` rank

9. **S3/CloudFront Routing:** NO separate detail routes. Use modals (`DataSheet`) for all detail views. Keep route structure flat: `/`, `/members`, `/reports`, `/login`.

10. **No Next.js API Routes:** All API calls use `NEXT_PUBLIC_API_URL` directly to Lambda. Don't create `/app/api/*` routes.

11. **Common Components:** Always use components from `shared/` for consistency: `PageHeader`, `StatsBar`, `StatsGrid`, `ControlsBar`, `EmptyState`, `ErrorState`, `DataSheet`, `TagList`.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `API_SERVER_URL` | Backend URL (server-side) | `http://localhost:3003` |
| `NEXT_PUBLIC_API_URL` | Client-side API URL (static export) | empty (uses rewrites) |
| `STATIC_EXPORT` | Enable static export mode | `false` |
