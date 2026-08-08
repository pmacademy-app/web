'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Mail,
  Award,
  Briefcase,
  Activity,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMarkProdigy } from '@/components/brand/BrandLogo'

export interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  badge?: string
}

const ADMIN_NAV_ITEMS: NavItem[] = [
  { name: 'Overview', href: '/admin', icon: LayoutDashboard },
  { name: 'Content', href: '/admin/content', icon: BookOpen },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Communications', href: '/admin/communications', icon: Mail },
  { name: 'Certificates', href: '/admin/certificates', icon: Award },
  { name: 'Feedback', href: '/admin/feedback', icon: Briefcase },
  { name: 'System', href: '/admin/system', icon: Activity },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-200 flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2 focus:outline-none rounded">
          <BrandMarkProdigy size="sm" badgeText="Admin" onDark />
        </Link>
        <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-400 border border-slate-700">
          v0.3.0
        </span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
        <div className="px-2 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Operations Center
        </div>
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors relative group',
                isActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200')} />
              <span className="truncate">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer / Switch View */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <Link
          href="/dashboard"
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 rounded-lg border border-slate-700/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            Switch to Learner View
          </span>
        </Link>
      </div>
    </aside>
  )
}
