import React from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Admin pagination — lightweight pager for admin tables.
 * `totalPages`/`currentPage` are 1-indexed.
 */
export function AdminPagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  totalItems,
  className,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize?: number
  totalItems?: number
  className?: string
}) {
  const pages = React.useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const result: (number | '…')[] = [1]
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)
    if (start > 2) result.push('…')
    for (let i = start; i <= end; i++) result.push(i)
    if (end < totalPages - 1) result.push('…')
    result.push(totalPages)
    return result
  }, [currentPage, totalPages])

  const pageButton = (page: number) => (
    <button
      key={page}
      type="button"
      onClick={() => onPageChange(page)}
      aria-current={page === currentPage ? 'page' : undefined}
      className={cn(
        'min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50',
        page === currentPage
          ? 'bg-admin-accent text-admin-accent-fg font-bold'
          : 'text-admin-fg-muted hover:bg-admin-surface-raised hover:text-admin-fg'
      )}
    >
      {page}
    </button>
  )

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-3', className)}>
      {totalItems !== undefined && pageSize ? (
        <p className="text-xs text-admin-fg-muted">
          {Math.min((currentPage - 1) * pageSize + 1, totalItems)}–
          {Math.min(currentPage * pageSize, totalItems)} of {totalItems}
        </p>
      ) : (
        <span />
      )}

      <nav aria-label="Pagination" className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-admin-fg-muted transition-colors hover:bg-admin-surface-raised hover:text-admin-fg disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50"
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>

        {pages.map((p, idx) => (p === '…' ? <span key={`ellipsis-${idx}`} className="px-1 text-xs text-admin-fg-subtle">…</span> : pageButton(p)))}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-admin-fg-muted transition-colors hover:bg-admin-surface-raised hover:text-admin-fg disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </nav>
    </div>
  )
}
