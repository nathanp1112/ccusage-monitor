'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatTokens } from '@/lib/utils'

interface DataPoint {
  date: string
  cacheCreationTokens: number
  cacheReadTokens: number
}

interface CacheEfficiencyChartProps {
  data: DataPoint[]
  className?: string
}

export function CacheEfficiencyChart({
  data,
  className,
}: CacheEfficiencyChartProps) {
  const formatDate = (date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const totalCreation = data.reduce((sum, d) => sum + d.cacheCreationTokens, 0)
  const totalRead = data.reduce((sum, d) => sum + d.cacheReadTokens, 0)
  const efficiency = totalCreation > 0
    ? ((totalRead / totalCreation) * 100).toFixed(0)
    : '0'

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Cache Efficiency</span>
          <span className="text-2xl font-mono text-primary">{efficiency}%</span>
        </CardTitle>
        <CardDescription>
          Higher read-to-creation ratio = better cache utilization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="h-[250px]"
          role="img"
          aria-label={`Area chart showing cache efficiency. Read: ${formatTokens(totalRead)}, Creation: ${formatTokens(totalCreation)}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatTokens(v)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
                labelFormatter={formatDate}
                formatter={(value: number, name: string) => [
                  formatTokens(value),
                  name === 'cacheReadTokens' ? 'Cache Read' : 'Cache Creation',
                ]}
              />
              <Legend
                formatter={(value) =>
                  value === 'cacheReadTokens' ? 'Cache Read' : 'Cache Creation'
                }
              />
              <Area
                type="monotone"
                dataKey="cacheCreationTokens"
                stackId="cache"
                stroke="hsl(var(--chart-3))"
                fill="hsl(var(--chart-3))"
                fillOpacity={0.3}
              />
              <Area
                type="monotone"
                dataKey="cacheReadTokens"
                stackId="cache"
                stroke="hsl(var(--chart-5))"
                fill="hsl(var(--chart-5))"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
