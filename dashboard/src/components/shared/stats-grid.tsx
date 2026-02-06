import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface StatCardItem {
  title: string
  value: string
  icon?: React.ReactNode
  description?: string
  change?: {
    value: number
    trend: 'up' | 'down' | 'neutral'
  }
  valueClassName?: string
}

interface StatsGridProps {
  stats: StatCardItem[]
  columns?: 2 | 3 | 4
  className?: string
}

export function StatsGrid({ stats, columns = 4, className }: StatsGridProps) {
  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }

  return (
    <div className={cn('grid gap-4', gridCols[columns], className)}>
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            {stat.icon && <div className="text-muted-foreground">{stat.icon}</div>}
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', stat.valueClassName)}>
              {stat.value}
            </div>
            {stat.description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {stat.description}
              </p>
            )}
            {stat.change && (
              <p
                className={cn(
                  'mt-1 text-xs',
                  stat.change.trend === 'up' && 'text-green-500',
                  stat.change.trend === 'down' && 'text-red-500',
                  stat.change.trend === 'neutral' && 'text-muted-foreground'
                )}
              >
                {stat.change.trend === 'up' && '+'}
                {stat.change.value.toFixed(1)}% from last period
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
