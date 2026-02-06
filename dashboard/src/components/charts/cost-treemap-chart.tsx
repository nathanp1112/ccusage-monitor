'use client'

import { useMemo } from 'react'
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatTokens, cn } from '@/lib/utils'
import type { TreemapData, TreemapNode } from '@/types/members'
import type { TreemapMetric } from '@/lib/treemap-utils'

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
]

interface CostTreemapChartProps {
  data: TreemapData
  metric?: TreemapMetric
  title?: string
  className?: string
  onCellClick?: (node: TreemapNode) => void
}

// Custom content renderer for treemap cells
interface CustomContentProps {
  x: number
  y: number
  width: number
  height: number
  index: number
  name: string
  value: number
  percentage?: number
  metric: TreemapMetric
}

function CustomContent({
  x,
  y,
  width,
  height,
  index,
  name,
  value,
  percentage,
  metric,
}: CustomContentProps) {
  const formatValue = (val: number, m: TreemapMetric) => {
    if (m === 'costUsd') return formatCurrency(val)
    return formatTokens(val)
  }

  // Only show text if cell is large enough
  const showName = width > 60 && height > 40
  const showValue = width > 50 && height > 30
  const showPercentage = width > 40 && height > 50

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={COLORS[index % COLORS.length]}
        stroke="hsl(var(--background))"
        strokeWidth={2}
        rx={4}
        className="transition-opacity hover:opacity-80"
      />
      {showName && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showPercentage ? 8 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={Math.min(14, width / 8)}
          fontWeight="500"
          className="pointer-events-none"
        >
          {name.length > width / 8 ? `${name.slice(0, Math.floor(width / 8))}...` : name}
        </text>
      )}
      {showValue && (
        <text
          x={x + width / 2}
          y={y + height / 2 + (showName ? 12 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={Math.min(12, width / 10)}
          fontFamily="monospace"
          className="pointer-events-none"
        >
          {formatValue(value, metric)}
        </text>
      )}
      {showPercentage && percentage !== undefined && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 26}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize={10}
          className="pointer-events-none"
        >
          {percentage.toFixed(1)}%
        </text>
      )}
    </g>
  )
}

export function CostTreemapChart({
  data,
  metric = 'costUsd',
  title = 'Cost Distribution',
  className,
  onCellClick,
}: CostTreemapChartProps) {
  const formatValue = (val: number) => {
    if (metric === 'costUsd') return formatCurrency(val)
    return formatTokens(val)
  }

  const metricLabel = useMemo(() => {
    switch (metric) {
      case 'costUsd':
        return 'Cost'
      case 'inputTokens':
        return 'Send Tokens'
      case 'outputTokens':
        return 'Receive Tokens'
      default:
        return 'Value'
    }
  }, [metric])

  const hasData = data.children && data.children.length > 0

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="h-[300px]"
          role="img"
          aria-label={`Treemap showing ${metricLabel.toLowerCase()} distribution`}
        >
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={data.children}
                dataKey="value"
                aspectRatio={4 / 3}
                stroke="hsl(var(--background))"
                content={
                  <CustomContent
                    x={0}
                    y={0}
                    width={0}
                    height={0}
                    index={0}
                    name=""
                    value={0}
                    metric={metric}
                  />
                }
                onClick={(node) => {
                  if (onCellClick && node) {
                    onCellClick(node as unknown as TreemapNode)
                  }
                }}
              >
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                  formatter={(value: number) => [formatValue(value), metricLabel]}
                  labelFormatter={(label) => label}
                />
              </Treemap>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
