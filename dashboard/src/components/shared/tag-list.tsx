import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TagListProps {
  items: string[]
  emptyMessage?: string
  className?: string
}

export function TagList({
  items,
  emptyMessage = 'No items',
  className,
}: TagListProps) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">{emptyMessage}</span>
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item) => (
        <Badge key={item} variant="secondary">
          {item}
        </Badge>
      ))}
    </div>
  )
}
