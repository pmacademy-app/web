import React from 'react'

/** Label/value pair used inside admin detail drawers. */
export function AdminDetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border">
      <p className="text-[10px] font-bold text-admin-fg-subtle uppercase tracking-wider">{label}</p>
      <div className="mt-1">{value}</div>
    </div>
  )
}