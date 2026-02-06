import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface SummaryCardProps {
  title: string
  value: string
  description?: string
  change?: {
    value: number
    trend: 'up' | 'down' | 'neutral'
  }
  icon?: React.ReactNode
  className?: string
  valueClassName?: string
}

export function SummaryCard({
  title,
  value,
  description,
  change,
  icon,
  className,
  valueClassName,
}: SummaryCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', valueClassName)}>{value}</div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        {change && (
          <p
            className={cn(
              'mt-1 text-xs',
              change.trend === 'up' && 'text-green-500',
              change.trend === 'down' && 'text-red-500',
              change.trend === 'neutral' && 'text-muted-foreground'
            )}
          >
            {change.trend === 'up' && '+'}
            {change.trend === 'down' && ''}
            {change.value.toFixed(1)}% from last period
          </p>
        )}
      </CardContent>
    </Card>
  )
}
