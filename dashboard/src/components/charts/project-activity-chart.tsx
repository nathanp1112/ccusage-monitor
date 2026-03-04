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

export interface ProjectActivityData {
  project: string      // raw path
  requestCount: number
  costUsd: number
}

interface ProjectActivityChartProps {
  data: ProjectActivityData[]
  title: string
}

/** Show last 2 path segments as label, e.g. /Users/foo/my-app → my-app */
function shortLabel(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path
}

const BAR_COLOR = 'hsl(var(--primary))'

export function ProjectActivityChart({ data, title }: ProjectActivityChartProps) {
  if (!data || data.length === 0) {
    return null
  }

  // Sort descending by requestCount, take top 10
  const chartData = [...data]
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, 10)
    .map((d) => ({ ...d, label: shortLabel(d.project) }))

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
            margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => v.toLocaleString()}
              label={{ value: 'Requests', position: 'insideBottomRight', offset: -4, fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={{ fontSize: 11, fontFamily: 'monospace' }}
            />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString(), 'Requests']}
              labelFormatter={(label) => {
                const item = chartData.find((d) => d.label === label)
                return item?.project ?? label
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="requestCount" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.project}
                  fill={BAR_COLOR}
                  fillOpacity={1 - index * 0.07}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
