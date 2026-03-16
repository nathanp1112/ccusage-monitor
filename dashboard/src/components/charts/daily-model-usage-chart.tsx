'use client'

import { useState, useMemo } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Model colors - fixed colors for each model family
const MODEL_COLORS: Record<string, string> = {
  Opus: '#8b5cf6',    // violet - premium model
  Sonnet: '#3b82f6',  // blue - balanced model
  Haiku: '#10b981',   // emerald - fast model
  default: '#6b7280', // gray - unknown models
}

export interface DailyModelData {
  date: string
  models: Array<{
    model: string
    inputTokens: number
    outputTokens: number
    costUsd: number
  }>
}

interface DailyModelUsageChartProps {
  data: DailyModelData[]
  title?: string
  className?: string
}

type TokenType = 'input' | 'output' | 'both'

function getShortModelName(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('opus')) return 'Opus'
  if (lower.includes('sonnet')) return 'Sonnet'
  if (lower.includes('haiku')) return 'Haiku'
  return model
}

export function DailyModelUsageChart({
  data,
  title = 'Daily Token Usage by Model',
  className,
}: DailyModelUsageChartProps) {
  const [tokenType, setTokenType] = useState<TokenType>('input')

  // Get unique models from data
  const uniqueModels = useMemo(() => {
    const models = new Set<string>()
    data.forEach((day) => {
      day.models.forEach((m) => models.add(m.model))
    })
    return Array.from(models)
  }, [data])

  // Transform data for Recharts stacked bar
  const chartData = useMemo(() => {
    return data.map((day) => {
      const row: Record<string, number | string> = {
        date: day.date,
      }

      for (const m of day.models) {
        const shortName = getShortModelName(m.model)
        if (tokenType === 'input') {
          row[shortName] = m.inputTokens
        } else if (tokenType === 'output') {
          row[shortName] = m.outputTokens
        } else {
          // both - sum of input and output
          row[shortName] = m.inputTokens + m.outputTokens
        }
      }

      return row
    })
  }, [data, tokenType])

  // Get bar keys (short model names)
  const barKeys = useMemo(() => {
    return uniqueModels.map((m) => getShortModelName(m))
  }, [uniqueModels])

  const formatDate = (date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { day: 'numeric' })
  }

  const formatTokens = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  const getTokenTypeLabel = () => {
    switch (tokenType) {
      case 'input':
        return 'Send Tokens'
      case 'output':
        return 'Receive Tokens'
      case 'both':
        return 'Total Tokens'
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle>{title}</CardTitle>
        <Select value={tokenType} onValueChange={(v) => setTokenType(v as TokenType)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="input">Send Tokens</SelectItem>
            <SelectItem value="output">Receive Tokens</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div
          className="h-[300px]"
          role="img"
          aria-label={`Stacked bar chart showing ${getTokenTypeLabel().toLowerCase()} by model per day`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                tickFormatter={formatTokens}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
                labelFormatter={(label) => {
                  const d = new Date(label)
                  return d.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                }}
                formatter={(value: number, name: string) => [
                  formatTokens(value),
                  name.charAt(0).toUpperCase() + name.slice(1),
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value.charAt(0).toUpperCase() + value.slice(1)
                }
              />
              {barKeys.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="tokens"
                  fill={MODEL_COLORS[key] || MODEL_COLORS.default}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
