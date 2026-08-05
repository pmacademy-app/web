'use client'

import React from 'react'
import { Search, ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  header: string
  accessorKey?: keyof T | string
  cell?: (row: T) => React.ReactNode
  className?: string
  headerClassName?: string
}

export interface AdminDataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  isLoading?: boolean
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (val: string) => void
  emptyTitle?: string
  emptyDescription?: string
  pagination?: {
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
    totalItems?: number
  }
  className?: string
}

export function AdminDataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  searchPlaceholder = 'Search records...',
  searchValue,
  onSearchChange,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching your criteria at this time.',
  pagination,
  className,
}: AdminDataTableProps<T>) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Table Toolbar (Search / Filters) */}
      {onSearchChange && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchValue || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all"
            />
          </div>
          {pagination?.totalItems !== undefined && (
            <span className="text-xs text-slate-400 font-mono">
              Showing {data.length} of {pagination.totalItems} records
            </span>
          )}
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800 sticky top-0 z-10 backdrop-blur">
              <tr>
                {columns.map((col, idx) => (
                  <th key={idx} className={cn('px-5 py-3.5', col.headerClassName)}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-400 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                    <p className="text-xs font-semibold">Loading data...</p>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Inbox className="w-8 h-8 text-slate-600 mx-auto stroke-[1.5]" />
                      <p className="text-sm font-bold text-white">{emptyTitle}</p>
                      <p className="text-xs text-slate-400">{emptyDescription}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={keyExtractor(item)} className="hover:bg-slate-800/40 transition-colors group">
                    {columns.map((col, idx) => (
                      <td key={idx} className={cn('px-5 py-4', col.className)}>
                        {col.cell
                          ? col.cell(item)
                          : col.accessorKey
                          ? (item as unknown as Record<string, unknown>)[col.accessorKey as string] as React.ReactNode
                          : null}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
            <span>
              Page <strong className="text-slate-200">{pagination.currentPage}</strong> of{' '}
              <strong className="text-slate-200">{pagination.totalPages}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage <= 1}
                aria-label="Previous page"
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage >= pagination.totalPages}
                aria-label="Next page"
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
