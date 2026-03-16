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

export interface FileExtensionData {
  language: string
  operationCount: number
  percentage?: number
}

interface FileExtensionChartProps {
  data: FileExtensionData[]
  title: string
}

const BAR_COLOR = 'hsl(var(--chart-2))'
const CONVERSATION_COLOR = 'hsl(var(--muted-foreground))'

export function FileExtensionChart({ data, title }: FileExtensionChartProps) {
  if (!data || data.length === 0) {
    return null
  }

  const chartData = [...data]
    .filter((d) => d.operationCount > 0)
    .sort((a, b) => b.operationCount - a.operationCount)

  const barHeight = 36
  const chartHeight = Math.max(200, chartData.length * barHeight + 40)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => v.toLocaleString()}
              label={{ value: 'Operations', position: 'insideBottomRight', offset: -4, fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="language"
              width={120}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), 'Operations']}
              labelFormatter={(label) => {
                const item = chartData.find((d) => d.language === label)
                return item?.percentage != null
                  ? `${label} (${item.percentage.toFixed(1)}%)`
                  : label
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="operationCount" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.language}
                  fill={entry.language === 'Conversation' ? CONVERSATION_COLOR : BAR_COLOR}
                  fillOpacity={entry.language === 'Conversation' ? 0.5 : 1 - index * 0.06}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
