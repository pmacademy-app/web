'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowUpRight, Bell } from 'lucide-react'
import { AdminSection } from './AdminSection'

/**
 * Notification settings are edited on the Communications workspace, not here.
 *
 * Every control this section used to render wrote to `system_settings.notification_settings`,
 * which no runtime code reads. The digest schedules and channel toggles the platform
 * actually enforces live in `system_settings.email_digest_schedules` and
 * `system_settings.email_automations`, both owned by /admin/communications. Two editors
 * for one behavior meant an admin could change the reminder day here and see the weekly
 * recap keep its old schedule.
 *
 * The section takes no props: with nothing editable there is no state to save.
 */
export function NotificationSettingsSection() {
  return (
    <div className="space-y-6">
      <AdminSection
        title="Notification Schedules"
        icon={Bell}
        meta="Managed on the Communications workspace"
      >
        <div className="flex flex-col gap-4 px-1 py-2">
          <p className="max-w-xl text-xs leading-relaxed text-admin-fg-muted">
            Daily reminders, the weekly recap schedule, and per-template channel toggles are
            configured under Communications. That is where the send pipeline reads them from,
            so changes there take effect immediately.
          </p>

          <div>
            <Link
              href="/admin/communications?tab=automations"
              className="inline-flex items-center gap-1.5 rounded-lg border border-admin-border bg-admin-surface px-4 py-2 text-xs font-semibold text-admin-fg transition-colors hover:bg-admin-surface-raised focus:outline-none focus:ring-2 focus:ring-admin-accent/50"
            >
              Open Communications settings
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </AdminSection>
    </div>
  )
}
