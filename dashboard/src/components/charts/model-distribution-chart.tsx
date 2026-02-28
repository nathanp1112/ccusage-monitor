'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DataPoint {
  model: string
  costUsd: number
  percentage: number
}

interface ModelDistributionChartProps {
  data: DataPoint[]
  title?: string
  className?: string
}

const FALLBACK_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
]

// Fixed colors per model family (matches daily-model-usage-chart)
const MODEL_COLORS: Record<string, string> = {
  Opus: '#8b5cf6',
  Sonnet: '#3b82f6',
  Haiku: '#10b981',
}

function getModelColor(model: string, index: number): string {
  return MODEL_COLORS[model] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

export function ModelDistributionChart({
  data,
  title = 'Model Distribution',
  className,
}: ModelDistributionChartProps) {
  const formatModel = (model: string) => {
    const lower = model.toLowerCase()
    if (lower.includes('opus')) return 'Opus'
    if (lower.includes('sonnet')) return 'Sonnet'
    if (lower.includes('haiku')) return 'Haiku'
    return model
  }

  const formatCost = (value: number) => `$${value.toFixed(2)}`

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="h-[300px]"
          role="img"
          aria-label={`Pie chart showing cost distribution by model`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="costUsd"
                nameKey="model"
                label={({ model, percentage }) =>
                  `${formatModel(model)} (${percentage.toFixed(0)}%)`
                }
                labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getModelColor(entry.model, index)}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
                formatter={(value: number, name: string) => [
                  formatCost(value),
                  formatModel(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
