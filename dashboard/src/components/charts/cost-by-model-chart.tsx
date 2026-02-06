'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface DataPoint {
  model: string
  costUsd: number
  tokens: number
}

interface CostByModelChartProps {
  data: DataPoint[]
  className?: string
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

export function CostByModelChart({ data, className }: CostByModelChartProps) {
  const formatModel = (model: string) => {
    if (model.includes('sonnet')) return 'Sonnet'
    if (model.includes('opus')) return 'Opus'
    if (model.includes('haiku')) return 'Haiku'
    return model.split('-').slice(0, 2).join(' ')
  }

  const totalCost = data.reduce((sum, d) => sum + d.costUsd, 0)

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Cost by Model</span>
          <span className="font-mono text-lg">{formatCurrency(totalCost)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="h-[200px]"
          role="img"
          aria-label="Horizontal bar chart showing cost breakdown by model"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={(v) => `$${v}`}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="model"
                tickFormatter={formatModel}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
                formatter={(value: number) => [formatCurrency(value), 'Cost']}
                labelFormatter={formatModel}
              />
              <Bar dataKey="costUsd" radius={[0, 4, 4, 0]}>
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
