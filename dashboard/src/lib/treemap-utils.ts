/**
 * Treemap data transformation utilities for Recharts
 */

import type { TreemapNode, TreemapData } from '@/types/members'

// Generic item with value for treemap transformation
interface TreemapItem {
  id?: string
  name: string
  email?: string
  costUsd?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
}

export type TreemapMetric = 'costUsd' | 'inputTokens' | 'outputTokens'

/**
 * Transform items to Recharts Treemap format
 */
export function transformToTreemap(
  items: TreemapItem[],
  metric: TreemapMetric = 'costUsd'
): TreemapData {
  const total = items.reduce((sum, item) => sum + getMetricValue(item, metric), 0)

  const children: TreemapNode[] = items
    .map((item) => {
      const value = getMetricValue(item, metric)
      return {
        name: item.name,
        value,
        id: item.id,
        email: item.email,
        percentage: total > 0 ? (value / total) * 100 : 0,
      }
    })
    .filter((node) => node.value > 0) // Filter out zero values
    .sort((a, b) => b.value - a.value) // Sort by value descending

  return {
    name: 'root',
    children,
  }
}

/**
 * Get metric value from item
 */
function getMetricValue(item: TreemapItem, metric: TreemapMetric): number {
  switch (metric) {
    case 'costUsd':
      return item.costUsd ?? 0
    case 'inputTokens':
      return item.inputTokens ?? 0
    case 'outputTokens':
      return item.outputTokens ?? 0
    default:
      return 0
  }
}

/**
 * Treemap color palette based on CSS variables
 * Returns HSL color string for each index
 */
export function getTreemapColor(index: number): string {
  // Use chart colors from CSS variables (1-6)
  const colorIndex = (index % 6) + 1
  return `hsl(var(--chart-${colorIndex}))`
}

/**
 * Generate colors array for treemap cells
 */
export function generateTreemapColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => getTreemapColor(i))
}
