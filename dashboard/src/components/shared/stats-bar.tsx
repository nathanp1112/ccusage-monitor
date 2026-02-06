import { cn } from '@/lib/utils'

export interface StatItem {
  label: string
  value: string
  hideOnMobile?: boolean
  hideOnTablet?: boolean
}

interface StatsBarProps {
  stats: StatItem[]
  className?: string
}

export function StatsBar({ stats, className }: StatsBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm',
        className
      )}
    >
      {stats.map((stat, index) => (
        <div
          key={index}
          className={cn(
            'flex items-center gap-2',
            stat.hideOnMobile && 'hidden sm:flex',
            stat.hideOnTablet && 'hidden md:flex'
          )}
        >
          <span className="text-muted-foreground">{stat.label}:</span>
          <span className="font-semibold">{stat.value}</span>
        </div>
      ))}
    </div>
  )
}
