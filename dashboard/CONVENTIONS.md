# Frontend Conventions: Team Usage Dashboard

> **Version:** 1.0.0
> **Created:** 2026-01-26
> **Framework:** Next.js 15 with App Router

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Technology Recommendations](#2-technology-recommendations)
3. [Folder Structure](#3-folder-structure)
4. [File Naming Conventions](#4-file-naming-conventions)
5. [Component Patterns](#5-component-patterns)
6. [State Management Patterns](#6-state-management-patterns)
7. [API Integration Patterns](#7-api-integration-patterns)
8. [Error Handling Patterns](#8-error-handling-patterns)
9. [Testing Conventions](#9-testing-conventions)
10. [Styling Conventions](#10-styling-conventions)
11. [Performance Guidelines](#11-performance-guidelines)
12. [Accessibility Guidelines](#12-accessibility-guidelines)

---

## 1. Technology Stack

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | `^15.1.0` | React framework with App Router |
| `react` | `^19.0.0` | UI library |
| `react-dom` | `^19.0.0` | React DOM renderer |
| `typescript` | `^5.7.0` | Type safety |

### Styling

| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | `^4.0.0` | Utility-first CSS |
| `@tailwindcss/postcss` | `^4.0.0` | PostCSS integration |
| `tailwind-merge` | `^2.6.0` | Merge Tailwind classes |
| `clsx` | `^2.1.0` | Conditional class names |

### UI Components

| Package | Version | Purpose |
|---------|---------|---------|
| `@radix-ui/react-*` | `^1.1.0` | Unstyled accessible primitives |
| `lucide-react` | `^0.469.0` | Icon library |
| `class-variance-authority` | `^0.7.0` | Component variants |

### Data Fetching & State

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | `^5.62.0` | Server state management |
| `zustand` | `^5.0.0` | Client state (minimal use) |

### Charts

| Package | Version | Purpose |
|---------|---------|---------|
| `recharts` | `^2.15.0` | React charting library |

### Forms & Validation

| Package | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | `^7.54.0` | Form state management |
| `zod` | `^3.24.0` | Schema validation |
| `@hookform/resolvers` | `^3.9.0` | Zod integration |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | `^2.1.0` | Test runner |
| `@testing-library/react` | `^16.1.0` | Component testing |
| `@testing-library/user-event` | `^14.5.0` | User interaction testing |
| `@vitejs/plugin-react` | `^4.3.0` | Vitest React support |
| `jsdom` | `^25.0.0` | DOM environment for tests |
| `eslint` | `^9.17.0` | Linting |
| `prettier` | `^3.4.0` | Code formatting |

---

## 2. Technology Recommendations

### Answers to Frontend Spec Section 4 Questions

#### 1. Framework: Next.js App Router vs Pages Router?

**Recommendation: App Router**

Rationale:
- React Server Components reduce client bundle size (target: <200KB gzipped)
- Built-in data fetching with `fetch()` and caching
- Streaming with Suspense for faster initial loads (<2s target)
- Parallel and intercepting routes for modal patterns
- Layout-based architecture matches dashboard structure
- Future-proof: Pages Router is in maintenance mode

#### 2. Styling: Tailwind CSS vs CSS Modules vs styled-components?

**Recommendation: Tailwind CSS v4**

Rationale:
- Zero-runtime CSS (smaller bundle than CSS-in-JS)
- Excellent developer experience with Tailwind v4 improvements
- Design system consistency through design tokens
- Easy responsive design for desktop-first approach
- Strong ecosystem and community support
- shadcn/ui is built on Tailwind

#### 3. State Management: React Query vs SWR vs Zustand?

**Recommendation: TanStack Query (React Query) + Zustand (minimal)**

Rationale:
- TanStack Query v5 for server state (API data caching, refetching, mutations)
- Built-in features: stale-while-revalidate, background refetching, error retry
- Zustand only for ephemeral UI state (sidebar open, date range selection)
- Avoid over-engineering: most state is server state in a dashboard
- TanStack Query integrates well with Next.js App Router

#### 4. Charts: Recharts vs Chart.js vs Visx?

**Recommendation: Recharts**

Rationale:
- React-native API with declarative components
- Good TypeScript support
- Covers all dashboard needs: Line, Bar, Pie, Stacked Bar
- Smaller learning curve than Visx
- Better React integration than Chart.js
- Active maintenance and good documentation

#### 5. Component Library: shadcn/ui vs Radix vs custom?

**Recommendation: shadcn/ui (Radix-based)**

Rationale:
- Copy-paste components, not a dependency (full control)
- Built on Radix primitives (WCAG 2.1 AA compliance)
- Tailwind-based styling matches our stack
- Easy to customize and extend
- Excellent accessibility out of the box
- Only import what you need (no bloat)

#### 6. Form Handling: React Hook Form vs Formik?

**Recommendation: React Hook Form + Zod**

Rationale:
- Smaller bundle size than Formik
- Better performance (uncontrolled inputs)
- First-class Zod integration via @hookform/resolvers
- Shared Zod schemas with API for type consistency
- Less boilerplate than Formik v3

#### 7. Testing: Vitest + Testing Library vs Jest?

**Recommendation: Vitest + Testing Library**

Rationale:
- Faster than Jest (native ESM, Vite-based)
- Jest-compatible API (easy migration if needed)
- Better TypeScript support out of the box
- Works with Next.js 15 without extra config
- React Testing Library for accessible component tests

#### 8. Build Tool: Default Next.js (Turbopack)?

**Recommendation: Next.js with Turbopack**

Rationale:
- Turbopack is stable in Next.js 15 for development
- Significantly faster HMR than Webpack
- Use default Webpack for production builds (more stable)
- No additional configuration needed

---

## 3. Folder Structure

```
dashboard/
├── public/                     # Static assets
│   ├── favicon.ico
│   └── images/
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth route group (no layout)
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/        # Dashboard route group
│   │   │   ├── page.tsx        # / (Dashboard home)
│   │   │   ├── members/
│   │   │   │   ├── page.tsx    # /members
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx # /members/[id]
│   │   │   ├── reports/
│   │   │   │   └── page.tsx    # /reports
│   │   │   └── layout.tsx      # Shared dashboard layout
│   │   │
│   │   ├── api/                # API route handlers (if needed)
│   │   ├── error.tsx           # Global error boundary
│   │   ├── loading.tsx         # Global loading state
│   │   ├── not-found.tsx       # 404 page
│   │   ├── layout.tsx          # Root layout
│   │   └── globals.css         # Global styles
│   │
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── table.tsx
│   │   │   └── ...
│   │   │
│   │   ├── charts/             # Chart components
│   │   │   ├── usage-trend-chart.tsx
│   │   │   ├── model-distribution-chart.tsx
│   │   │   ├── top-users-chart.tsx
│   │   │   └── token-breakdown-chart.tsx
│   │   │
│   │   ├── dashboard/          # Dashboard-specific components
│   │   │   ├── summary-card.tsx
│   │   │   ├── recent-activity-table.tsx
│   │   │   └── member-summary-table.tsx
│   │   │
│   │   ├── members/            # Member-specific components
│   │   │   ├── member-card.tsx
│   │   │   ├── member-list.tsx
│   │   │   └── session-history.tsx
│   │   │
│   │   ├── layout/             # Layout components
│   │   │   ├── navbar.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── footer.tsx
│   │   │
│   │   └── shared/             # Shared components
│   │       ├── date-range-picker.tsx
│   │       ├── loading-spinner.tsx
│   │       └── error-fallback.tsx
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── use-dashboard.ts
│   │   ├── use-members.ts
│   │   ├── use-reports.ts
│   │   └── use-auth.ts
│   │
│   ├── lib/                    # Utility functions
│   │   ├── api-client.ts       # API client configuration
│   │   ├── utils.ts            # General utilities (cn, formatters)
│   │   ├── constants.ts        # App constants
│   │   └── query-client.ts     # TanStack Query configuration
│   │
│   ├── stores/                 # Zustand stores (minimal)
│   │   └── ui-store.ts         # UI state (sidebar, date range)
│   │
│   ├── types/                  # TypeScript types
│   │   ├── api.ts              # API response types
│   │   ├── dashboard.ts        # Dashboard-specific types
│   │   └── member.ts           # Member-related types
│   │
│   └── schemas/                # Zod validation schemas
│       ├── auth.ts             # Login form schemas
│       └── member.ts           # Member form schemas
│
├── tests/                      # Test files (mirrors src structure)
│   ├── components/
│   ├── hooks/
│   └── lib/
│
├── .env.example                # Environment variables template
├── .env.local                  # Local environment (git-ignored)
├── .eslintrc.json
├── .prettierrc
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── CONVENTIONS.md              # This file
```

---

## 4. File Naming Conventions

### General Rules

| Element | Convention | Example |
|---------|------------|---------|
| Directories | `kebab-case` | `date-range-picker/` |
| React components | `kebab-case.tsx` | `summary-card.tsx` |
| Hooks | `use-*.ts` | `use-dashboard.ts` |
| Utilities | `kebab-case.ts` | `api-client.ts` |
| Types | `kebab-case.ts` | `dashboard.ts` |
| Tests | `*.test.ts(x)` | `summary-card.test.tsx` |
| Schemas | `kebab-case.ts` | `auth.ts` |

### Component Files

```
# Single file component
components/ui/button.tsx

# Complex component with sub-components
components/charts/
├── usage-trend-chart.tsx       # Main component
├── usage-trend-chart.test.tsx  # Tests (optional, prefer tests/)
└── index.ts                    # Re-export (optional)
```

### Export Conventions

```typescript
// Named exports for components (preferred)
export function SummaryCard({ ... }: SummaryCardProps) { }

// Named exports for utilities
export function formatCurrency(value: number): string { }

// Default exports only for pages
export default function DashboardPage() { }
```

---

## 5. Component Patterns

### 5.1 Component Structure

```typescript
// summary-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// 1. Type definitions at the top
interface SummaryCardProps {
  title: string
  value: string | number
  change?: {
    value: number
    trend: 'up' | 'down' | 'neutral'
  }
  icon?: React.ReactNode
  className?: string
}

// 2. Named export (not default)
export function SummaryCard({
  title,
  value,
  change,
  icon,
  className,
}: SummaryCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change && (
          <p className={cn(
            'text-xs',
            change.trend === 'up' && 'text-green-600',
            change.trend === 'down' && 'text-red-600',
          )}>
            {change.trend === 'up' ? '+' : ''}{change.value}% from last period
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

### 5.2 Server Components vs Client Components

```typescript
// Default: Server Component (no directive needed)
// src/app/(dashboard)/page.tsx
import { getDashboardData } from '@/lib/api-client'
import { SummaryCards } from '@/components/dashboard/summary-cards'

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="space-y-6">
      <SummaryCards data={data.summary} />
    </div>
  )
}

// Client Component: Only when needed
// src/components/charts/usage-trend-chart.tsx
'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'

interface UsageTrendChartProps {
  data: { date: string; cost: number }[]
}

export function UsageTrendChart({ data }: UsageTrendChartProps) {
  return (
    <LineChart width={600} height={300} data={data}>
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="cost" stroke="#2563eb" />
    </LineChart>
  )
}
```

### 5.3 When to Use Client Components

Use `'use client'` only when the component:
- Uses React hooks (useState, useEffect, etc.)
- Uses browser APIs (window, localStorage)
- Uses event handlers (onClick, onChange)
- Uses third-party libraries that require client-side JS (Recharts, React Hook Form)

### 5.4 Composition Pattern

```typescript
// Prefer composition over prop drilling
// Good: Composable components
<Card>
  <CardHeader>
    <CardTitle>Usage Trend</CardTitle>
    <CardDescription>Daily cost over time</CardDescription>
  </CardHeader>
  <CardContent>
    <UsageTrendChart data={data} />
  </CardContent>
</Card>

// Avoid: Monolithic components with many props
<UsageCard
  title="Usage Trend"
  description="Daily cost over time"
  chartType="line"
  data={data}
  showLegend
  enableZoom
/>
```

---

## 6. State Management Patterns

### 6.1 Server State with TanStack Query

```typescript
// src/hooks/use-dashboard.ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { DashboardData } from '@/types/dashboard'

export function useDashboard(dateRange?: { from: Date; to: Date }) {
  return useQuery({
    queryKey: ['dashboard', dateRange],
    queryFn: () => apiClient.get<DashboardData>('/api/dashboard', {
      params: dateRange ? {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      } : undefined,
    }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Usage in component
'use client'

import { useDashboard } from '@/hooks/use-dashboard'

export function DashboardContent() {
  const { data, isLoading, error } = useDashboard()

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorFallback error={error} />

  return <SummaryCards data={data.summary} />
}
```

### 6.2 Client State with Zustand (Minimal)

```typescript
// src/stores/ui-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  dateRange: { from: Date; to: Date } | null
  toggleSidebar: () => void
  setDateRange: (range: { from: Date; to: Date } | null) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      dateRange: null,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setDateRange: (dateRange) => set({ dateRange }),
    }),
    {
      name: 'ccusage-ui',
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    }
  )
)

// Usage
'use client'

import { useUIStore } from '@/stores/ui-store'

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore()
  // ...
}
```

### 6.3 URL State for Shareable Views

```typescript
// Use URL search params for filterable/shareable state
// src/app/(dashboard)/members/page.tsx
import { MemberList } from '@/components/members/member-list'

interface SearchParams {
  sort?: 'name' | 'cost' | 'last_sync'
  order?: 'asc' | 'desc'
  search?: string
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  // Use params for server-side data fetching

  return <MemberList initialSort={params.sort} />
}
```

---

## 7. API Integration Patterns

### 7.1 API Client Configuration

```typescript
// src/lib/api-client.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined>
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { params, ...fetchOptions } = options

    // Build URL with query params
    const url = new URL(`${this.baseUrl}${endpoint}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      })
    }

    const response = await fetch(url.toString(), {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      credentials: 'include', // Include cookies for JWT
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new ApiError(response.status, error.message || 'Request failed')
    }

    return response.json()
  }

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const apiClient = new ApiClient(API_BASE_URL)
```

### 7.2 Query Key Conventions

```typescript
// src/lib/query-keys.ts

export const queryKeys = {
  // Dashboard
  dashboard: {
    all: ['dashboard'] as const,
    stats: (dateRange?: DateRange) => ['dashboard', 'stats', dateRange] as const,
  },

  // Members
  members: {
    all: ['members'] as const,
    list: (filters?: MemberFilters) => ['members', 'list', filters] as const,
    detail: (id: string) => ['members', 'detail', id] as const,
    usage: (id: string, dateRange?: DateRange) =>
      ['members', 'detail', id, 'usage', dateRange] as const,
  },

  // Reports
  reports: {
    daily: (dateRange?: DateRange) => ['reports', 'daily', dateRange] as const,
    monthly: (month: string) => ['reports', 'monthly', month] as const,
  },
} as const
```

### 7.3 Custom Hooks for API Calls

```typescript
// src/hooks/use-members.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import type { Member, MemberFilters } from '@/types/member'

export function useMembers(filters?: MemberFilters) {
  return useQuery({
    queryKey: queryKeys.members.list(filters),
    queryFn: () => apiClient.get<{ data: Member[] }>('/api/members', {
      params: filters,
    }),
  })
}

export function useMember(id: string) {
  return useQuery({
    queryKey: queryKeys.members.detail(id),
    queryFn: () => apiClient.get<{ data: Member }>(`/api/members/${id}`),
    enabled: !!id,
  })
}

export function useMemberUsage(id: string, dateRange?: DateRange) {
  return useQuery({
    queryKey: queryKeys.members.usage(id, dateRange),
    queryFn: () => apiClient.get<{ data: UsageData[] }>(`/api/members/${id}/usage`, {
      params: dateRange ? {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      } : undefined,
    }),
    enabled: !!id,
  })
}
```

---

## 8. Error Handling Patterns

### 8.1 Error Boundary

```typescript
// src/app/error.tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to error reporting service
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground">
        An unexpected error occurred. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
```

### 8.2 API Error Handling

```typescript
// src/components/shared/error-fallback.tsx
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ApiError } from '@/lib/api-client'

interface ErrorFallbackProps {
  error: Error
  onRetry?: () => void
}

export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  const isApiError = error instanceof ApiError

  const getMessage = () => {
    if (!isApiError) return 'An unexpected error occurred'

    switch (error.status) {
      case 401:
        return 'Please log in to continue'
      case 403:
        return 'You do not have permission to view this'
      case 404:
        return 'The requested data was not found'
      case 500:
        return 'Server error. Please try again later'
      default:
        return error.message
    }
  }

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{getMessage()}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
```

### 8.3 Query Error Handling

```typescript
// In TanStack Query hooks
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard.all,
    queryFn: () => apiClient.get<DashboardData>('/api/dashboard'),
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error instanceof ApiError && error.status < 500) {
        return false
      }
      return failureCount < 3
    },
  })
}

// In component
export function DashboardContent() {
  const { data, isLoading, error, refetch } = useDashboard()

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorFallback error={error} onRetry={refetch} />

  return <SummaryCards data={data} />
}
```

### 8.4 Form Error Handling

```typescript
// src/components/auth/login-form.tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@/schemas/auth'
import { useLogin } from '@/hooks/use-auth'

export function LoginForm() {
  const { mutate: login, isPending, error } = useLogin()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = (data: LoginInput) => {
    login(data)
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {error instanceof ApiError && error.status === 401
              ? 'Invalid email or password'
              : 'Login failed. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Form fields */}
    </form>
  )
}
```

---

## 9. Testing Conventions

### 9.1 Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/types/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 9.2 Test Setup

```typescript
// tests/setup.ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
```

### 9.3 Component Testing

```typescript
// tests/components/dashboard/summary-card.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SummaryCard } from '@/components/dashboard/summary-card'

describe('SummaryCard', () => {
  it('renders title and value', () => {
    render(<SummaryCard title="Total Cost" value="$123.45" />)

    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('$123.45')).toBeInTheDocument()
  })

  it('renders change indicator when provided', () => {
    render(
      <SummaryCard
        title="Total Cost"
        value="$123.45"
        change={{ value: 12, trend: 'up' }}
      />
    )

    expect(screen.getByText('+12% from last period')).toBeInTheDocument()
  })

  it('applies correct color for trend', () => {
    const { rerender } = render(
      <SummaryCard
        title="Cost"
        value="$100"
        change={{ value: 10, trend: 'up' }}
      />
    )

    expect(screen.getByText('+10% from last period')).toHaveClass('text-green-600')

    rerender(
      <SummaryCard
        title="Cost"
        value="$100"
        change={{ value: -10, trend: 'down' }}
      />
    )

    expect(screen.getByText('-10% from last period')).toHaveClass('text-red-600')
  })
})
```

### 9.4 Hook Testing

```typescript
// tests/hooks/use-dashboard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDashboard } from '@/hooks/use-dashboard'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useDashboard', () => {
  it('fetches dashboard data', async () => {
    const mockData = { summary: { totalCost: 123.45 } }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response)

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockData)
  })
})
```

---

## 10. Styling Conventions

### 10.1 Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Use CSS variables for theming
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

export default config
```

### 10.2 CSS Variables

```css
/* src/app/globals.css */
@import 'tailwindcss';

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}
```

### 10.3 Utility Function for Class Merging

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 10.4 Component Variants with CVA

```typescript
// src/components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
```

---

## 11. Performance Guidelines

### 11.1 Bundle Size Targets

| Metric | Target |
|--------|--------|
| Total bundle (gzipped) | < 200KB |
| First Load JS | < 100KB |
| Largest page JS | < 50KB |

### 11.2 Code Splitting

```typescript
// Dynamic imports for heavy components
import dynamic from 'next/dynamic'

const UsageTrendChart = dynamic(
  () => import('@/components/charts/usage-trend-chart').then(mod => mod.UsageTrendChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false, // Charts don't need SSR
  }
)
```

### 11.3 Image Optimization

```typescript
// Always use next/image for images
import Image from 'next/image'

export function Logo() {
  return (
    <Image
      src="/images/logo.svg"
      alt="CCUsage"
      width={120}
      height={32}
      priority // For above-the-fold images
    />
  )
}
```

### 11.4 Data Fetching Optimization

```typescript
// Parallel data fetching in Server Components
export default async function DashboardPage() {
  // Fetch in parallel, not sequentially
  const [stats, members, recentActivity] = await Promise.all([
    getDashboardStats(),
    getTopMembers(5),
    getRecentActivity(10),
  ])

  return (
    <>
      <SummaryCards data={stats} />
      <TopMembersTable members={members} />
      <RecentActivityList activity={recentActivity} />
    </>
  )
}
```

### 11.5 React Query Optimization

```typescript
// Configure stale time to reduce refetches
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30,   // 30 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
    },
  },
})
```

---

## 12. Accessibility Guidelines

### 12.1 WCAG 2.1 AA Compliance Checklist

| Criterion | Implementation |
|-----------|----------------|
| Color contrast | Minimum 4.5:1 for text, 3:1 for large text |
| Keyboard navigation | All interactive elements focusable |
| Focus indicators | Visible focus rings on all focusable elements |
| Screen reader | Proper ARIA labels and semantic HTML |
| Form labels | All inputs have associated labels |
| Error messages | Programmatically associated with inputs |
| Skip links | Skip to main content link |

### 12.2 Semantic HTML

```typescript
// Use semantic elements
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r">
        <nav aria-label="Main navigation">
          {/* Navigation items */}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  )
}
```

### 12.3 ARIA Patterns

```typescript
// Charts need aria descriptions
export function UsageTrendChart({ data }: UsageTrendChartProps) {
  const totalCost = data.reduce((sum, d) => sum + d.cost, 0)

  return (
    <div
      role="img"
      aria-label={`Usage trend chart showing daily costs. Total: $${totalCost.toFixed(2)}`}
    >
      <LineChart data={data} accessibilityLayer>
        {/* Chart content */}
      </LineChart>
    </div>
  )
}

// Tables need proper headers
export function MembersTable({ members }: MembersTableProps) {
  return (
    <table>
      <caption className="sr-only">Team members and their usage</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Cost (MTD)</th>
          <th scope="col">Last Sync</th>
        </tr>
      </thead>
      <tbody>
        {members.map(member => (
          <tr key={member.id}>
            <th scope="row">{member.name}</th>
            <td>${member.cost.toFixed(2)}</td>
            <td>{formatDate(member.lastSync)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

### 12.4 Focus Management

```typescript
// Skip link for keyboard users
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
    >
      Skip to main content
    </a>
  )
}

// Main content target
export function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      {children}
    </main>
  )
}
```

---

## Quick Reference

### Import Aliases

```typescript
// tsconfig.json paths
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}

// Usage
import { Button } from '@/components/ui/button'
import { useDashboard } from '@/hooks/use-dashboard'
import { cn } from '@/lib/utils'
```

### Environment Variables

```bash
# .env.example
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### NPM Scripts

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  }
}
```

---

*End of Conventions Document*
