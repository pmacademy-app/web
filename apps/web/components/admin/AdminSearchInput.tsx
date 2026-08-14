import React from 'react'
import { SearchIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Admin search input — debounced search field with clear button.
 */
export function AdminSearchInput({
  value,
  onValueChange,
  placeholder = 'Search…',
  debounceMs = 250,
  className,
  'aria-label': ariaLabel = 'Search',
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
  'aria-label'?: string
}) {
  const [inputValue, setInputValue] = React.useState(value)
  const [prevValue, setPrevValue] = React.useState(value)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external value changes without an effect (adjust state during render).
  if (value !== prevValue) {
    setPrevValue(value)
    setInputValue(value)
  }

  const handleChange = (next: string) => {
    setInputValue(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onValueChange(next), debounceMs)
  }

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-admin-fg-subtle" />
      <input
        type="search"
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 w-full rounded-lg border border-admin-border bg-admin-surface pl-9 pr-8 text-sm text-admin-fg placeholder:text-admin-fg-subtle transition-colors outline-none focus-visible:border-admin-accent/60 focus-visible:ring-2 focus-visible:ring-admin-accent/30"
      />
      {inputValue && (
        <button
          type="button"
          onClick={() => handleChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-admin-fg-subtle transition-colors hover:text-admin-fg"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}