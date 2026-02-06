'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTokens } from '@/lib/utils'

interface DataPoint {
  date: string
  inputTokens: number
  outputTokens: number
}

interface TokenUsageChartProps {
  data: DataPoint[]
  title?: string
  className?: string
}

export function TokenUsageChart({
  data,
  title = 'Token Usage',
  className,
}: TokenUsageChartProps) {
  const formatDate = (date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const totalInput = data.reduce((sum, d) => sum + d.inputTokens, 0)
  const totalOutput = data.reduce((sum, d) => sum + d.outputTokens, 0)

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <div className="flex gap-4 text-sm font-normal text-muted-foreground">
            <span>Send: <span className="font-mono text-foreground">{formatTokens(totalInput)}</span></span>
            <span>Receive: <span className="font-mono text-foreground">{formatTokens(totalOutput)}</span></span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="h-[300px]"
          role="img"
          aria-label={`Stacked bar chart showing send and receive tokens. Total send: ${formatTokens(totalInput)}, Total receive: ${formatTokens(totalOutput)}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
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
                  name === 'inputTokens' ? 'Send' : 'Receive',
                ]}
              />
              <Legend
                formatter={(value) =>
                  value === 'inputTokens' ? 'Send Tokens' : 'Receive Tokens'
                }
              />
              <Bar
                dataKey="inputTokens"
                stackId="tokens"
                fill="hsl(var(--chart-1))"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="outputTokens"
                stackId="tokens"
                fill="hsl(var(--chart-2))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
