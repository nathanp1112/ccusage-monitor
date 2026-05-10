'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'
import {
  useMemberPromptMonths,
  useMemberPrompts,
  type PromptDay,
  type PromptRecord,
} from '@/hooks/use-members'

interface MemberPromptsPanelProps {
  memberId: string
  memberName?: string
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function formatMonth(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function shortProjectPath(path: string): string {
  if (!path) return '—'
  const parts = path.split('/')
  return parts.slice(-2).join('/') || path
}

const PREVIEW_CHARS = 240

function PromptCard({ prompt }: { prompt: PromptRecord }) {
  const [expanded, setExpanded] = useState(false)
  const truncated = prompt.content.length > PREVIEW_CHARS
  const shown = expanded || !truncated ? prompt.content : prompt.content.slice(0, PREVIEW_CHARS) + '…'

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">{formatTime(prompt.timestamp)}</span>
        <span className="font-mono" title={prompt.projectPath}>
          {shortProjectPath(prompt.projectPath)}
        </span>
        <span className="font-mono opacity-60" title={prompt.sessionId}>
          session {prompt.sessionId.slice(0, 8)}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
        {shown}
      </pre>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      {prompt.truncated && (
        <p className="mt-2 text-xs text-muted-foreground">
          Server-truncated at 10 KB (original length:{' '}
          {prompt.originalLength?.toLocaleString()} chars).
        </p>
      )}
    </div>
  )
}

function DaySection({ day, defaultOpen }: { day: PromptDay; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-mono text-sm font-medium">{day.date}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {day.count} prompt{day.count === 1 ? '' : 's'}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-4 py-3">
          {day.prompts.map((p) => (
            <PromptCard key={p.uuid} prompt={p} />
          ))}
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE = 5 // days per page

export function MemberPromptsPanel({ memberId, memberName }: MemberPromptsPanelProps) {
  const { data: monthsData, isLoading: monthsLoading, error: monthsError } =
    useMemberPromptMonths(memberId)

  const months = monthsData?.months ?? []
  const defaultKey = months.length > 0 ? `${months[0].year}-${months[0].month}` : ''
  const [selectedKey, setSelectedKey] = useState<string>(defaultKey)
  const [page, setPage] = useState(1)

  // Adopt default once months load (only if user hasn't picked yet).
  useEffect(() => {
    if (!selectedKey && defaultKey) setSelectedKey(defaultKey)
  }, [selectedKey, defaultKey])

  // Reset to page 1 whenever the month changes.
  useEffect(() => {
    setPage(1)
  }, [selectedKey])

  const [yearStr, monthStr] = selectedKey ? selectedKey.split('-') : ['', '']
  const selectedYear = yearStr ? parseInt(yearStr, 10) : 0
  const selectedMonth = monthStr ? parseInt(monthStr, 10) : 0

  const { data: promptsData, isLoading: promptsLoading, isFetching } = useMemberPrompts(
    memberId,
    selectedYear,
    selectedMonth,
    page,
    PAGE_SIZE,
    !!selectedKey
  )

  const title = useMemo(
    () => (memberName ? `Prompts — ${memberName}` : 'Prompts'),
    [memberName]
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {months.length > 0 && (
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className={cn(
              'h-9 rounded-md border border-input bg-background px-2 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            {months.map((m) => (
              <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                {formatMonth(m.year, m.month)} ({m.count})
              </option>
            ))}
          </select>
        )}
      </CardHeader>
      <CardContent>
        {monthsLoading && <LoadingSpinner />}
        {monthsError && (
          <p className="text-sm text-destructive">Failed to load prompt months.</p>
        )}
        {!monthsLoading && !monthsError && months.length === 0 && (
          <EmptyState message="No prompts recorded for this member yet." />
        )}
        {selectedKey && (
          <div className="mt-2 space-y-3">
            {promptsData && (
              <p className="text-xs text-muted-foreground">
                {promptsData.totalPrompts.toLocaleString()} prompts across{' '}
                {promptsData.totalDays} day{promptsData.totalDays === 1 ? '' : 's'} — showing{' '}
                {Math.min(page * PAGE_SIZE, promptsData.totalDays)} of {promptsData.totalDays}
              </p>
            )}
            {promptsLoading && <LoadingSpinner />}
            {!promptsLoading && promptsData && promptsData.days.length === 0 && (
              <EmptyState message="No prompts in this month." />
            )}
            {!promptsLoading &&
              promptsData?.days.map((day, idx) => (
                <DaySection key={day.date} day={day} defaultOpen={idx === 0 && page === 1} />
              ))}
            {promptsData?.hasMore && (
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
                className={cn(
                  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium',
                  'hover:bg-muted/60 disabled:opacity-50'
                )}
              >
                {isFetching ? 'Loading…' : 'Load more days'}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
