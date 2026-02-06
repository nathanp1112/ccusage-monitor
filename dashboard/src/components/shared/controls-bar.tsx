import { cn } from '@/lib/utils'

interface ControlsBarProps {
  left?: React.ReactNode
  right?: React.ReactNode
  className?: string
}

export function ControlsBar({ left, right, className }: ControlsBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4',
        className
      )}
    >
      <div className="flex items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
}
