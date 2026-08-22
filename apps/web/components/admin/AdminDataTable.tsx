import React from 'react'
import { Inbox, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  header: string
  accessorKey?: keyof T | string
  cell?: (row: T) => React.ReactNode
  className?: string
  headerClassName?: string
  /** Renders the header as a sortable button. `sortKey` defaults to `accessorKey`. */
  sortable?: boolean
  sortKey?: string
}

export interface TableSort {
  key: string
  dir: 'asc' | 'desc'
}

export interface AdminDataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  /** Active sort state (renders indicators on matching sortable headers). */
  sort?: TableSort | null
  onSortChange?: (sort: TableSort) => void
  /** Row click handler — rows become keyboard-focusable and clickable. */
  onRowClick?: (row: T) => void
  /** Accessible label for each clickable row (defaults to "Open details"). */
  rowAriaLabel?: (row: T) => string
  /** Optional per-row action cell rendered after the last column. */
  rowActions?: (row: T) => React.ReactNode
}

/**
 * Presentational data table with optional sorting, row clicks and per-row
 * actions. Column `cell` render callbacks and `keyExtractor` are defined by
 * the caller (server page or client wrapper). Interactive features (search,
 * pagination, sorting, row clicks) are wired through props — the table itself
 * stays presentational.
 */
export function AdminDataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching your criteria at this time.',
  className,
  sort,
  onSortChange,
  onRowClick,
  rowAriaLabel,
  rowActions,
}: AdminDataTableProps<T>) {
  const handleSort = (col: Column<T>) => {
    if (!onSortChange) return
    const key = col.sortKey || String(col.accessorKey || col.header)
    const nextDir = sort?.key === key && sort.dir === 'asc' ? 'desc' : 'asc'
    onSortChange({ key, dir: nextDir })
  }

  const renderHeader = (col: Column<T>, idx: number) => {
    if (col.sortable && onSortChange) {
      const key = col.sortKey || String(col.accessorKey || col.header)
      const active = sort?.key === key
      const dir = active ? sort!.dir : null
      return (
        <th
          key={idx}
          className={cn('px-5 py-3.5', col.headerClassName)}
          aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          <button
            type="button"
            onClick={() => handleSort(col)}
            className="inline-flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-bold text-admin-fg-subtle transition-colors hover:text-admin-fg cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50"
          >
            {col.header}
            {active ? (
              dir === 'asc' ? (
                <ArrowUp className="w-3 h-3 text-admin-accent" />
              ) : (
                <ArrowDown className="w-3 h-3 text-admin-accent" />
              )
            ) : (
              <ChevronsUpDown className="w-3 h-3 opacity-50" />
            )}
          </button>
        </th>
      )
    }
    return (
      <th key={idx} className={cn('px-5 py-3.5', col.headerClassName)}>
        {col.header}
      </th>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="bg-admin-surface border border-admin-border rounded-xl overflow-hidden shadow-xl backdrop-blur">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs text-admin-fg-muted min-w-[640px]">
            <thead className="bg-admin-surface-raised text-admin-fg-subtle uppercase tracking-wider text-[10px] font-bold border-b border-admin-border sticky top-0 z-10 backdrop-blur">
              <tr>
                {columns.map((col, idx) => renderHeader(col, idx))}
                {rowActions && <th className="px-5 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border font-medium">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-5 py-12 text-center text-admin-fg-muted">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Inbox className="w-8 h-8 text-admin-fg-subtle mx-auto stroke-[1.5]" />
                      <p className="text-sm font-bold text-admin-fg">{emptyTitle}</p>
                      <p className="text-xs text-admin-fg-muted">{emptyDescription}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr
                    key={keyExtractor(item)}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onRowClick(item)
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={onRowClick ? (rowAriaLabel ? rowAriaLabel(item) : 'Open details') : undefined}
                    className={cn(
                      'transition-colors group',
                      onRowClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-admin-accent/50'
                    )}
                  >
                    {columns.map((col, idx) => (
                      <td key={idx} className={cn('px-5 py-4', col.className)}>
                        {col.cell
                          ? col.cell(item)
                          : col.accessorKey
                          ? (item as unknown as Record<string, unknown>)[col.accessorKey as string] as React.ReactNode
                          : null}
                      </td>
                    ))}
                    {rowActions && (
                      <td
                        className="px-5 py-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {rowActions(item)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}