import React from 'react'
import { Inbox } from 'lucide-react'
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
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

/**
 * Presentational data table. Rendered as a Server Component so that column
 * `cell` render callbacks and `keyExtractor` functions defined by server pages
 * never cross the Server -> Client boundary. Interactive features (search,
 * pagination) must be provided by a client wrapper when needed.
 */
export function AdminDataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching your criteria at this time.',
  className,
}: AdminDataTableProps<T>) {
  return (
    <div className={cn('space-y-4', className)}>
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
              {data.length === 0 ? (
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
      </div>
    </div>
  )
}
