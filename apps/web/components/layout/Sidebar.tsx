'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, Award, RotateCw, BarChart3, Trophy, Settings, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const SIDEBAR_LINKS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Curriculum', href: '/academy', icon: BookOpen },
  { label: 'Capstones', href: '/capstones', icon: Award },
  { label: 'Review Hub', href: '/review', icon: RotateCw },
  { label: 'Progress', href: '/progress', icon: BarChart3 },
  { label: 'Leaderboard', href: '/leaderboard', icon: Trophy },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()

  const sidebarContent = (
    <div className="flex flex-col h-full bg-card border-r border-border py-6 px-4">
      {/* Logo */}
      <div className="flex items-center justify-between px-2 mb-8">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
          onClick={onClose}
        >
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold tracking-tight text-sm">PM</span>
          </div>
          <span className="font-bold text-foreground text-lg tracking-tight font-serif">
            PM Academy
          </span>
        </Link>
        {/* Mobile close button */}
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg border border-border text-foreground hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1.5" aria-label="Main Navigation">
        {SIDEBAR_LINKS.map((link) => {
          const Icon = link.icon
          const isActive =
            pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer / Built with tag */}
      <div className="border-t border-border pt-4 px-2">
        <p className="text-[10px] text-muted-foreground/60 uppercase font-semibold tracking-wider">
          Built with PM Academy
        </p>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden lg:block w-64 h-screen sticky top-0 flex-shrink-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer container */}
          <div className="relative flex flex-col w-64 max-w-xs h-full bg-background animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
