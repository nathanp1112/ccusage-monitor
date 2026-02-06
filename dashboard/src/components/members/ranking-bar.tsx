'use client'

import { cn } from '@/lib/utils'

interface RankingBarProps {
  percentage: number
  className?: string
  barClassName?: string
}

export function RankingBar({
  percentage,
  className,
  barClassName,
}: RankingBarProps) {
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-all duration-300',
          barClassName
        )}
        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
      />
    </div>
  )
}
