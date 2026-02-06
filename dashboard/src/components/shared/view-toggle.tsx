'use client'

import { cn } from '@/lib/utils'

export interface ViewOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
}

interface ViewToggleProps<T extends string> {
  options: ViewOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'default'
}

export function ViewToggle<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'default',
}: ViewToggleProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border bg-muted p-1',
        className
      )}
      role="tablist"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}
