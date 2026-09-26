'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, RotateCw, Trophy, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface MobileTabBarProps {
  onOpenMenu: () => void
}

const PRIMARY_TABS = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Curriculum', href: '/academy', icon: BookOpen },
  { label: 'Review', href: '/review', icon: RotateCw },
  { label: 'Badges', href: '/badges', icon: Trophy },
]

export function MobileTabBar({ onOpenMenu }: MobileTabBarProps) {
  const pathname = usePathname()

  const isMoreActive =
    pathname.startsWith('/progress') ||
    pathname.startsWith('/capstones') ||
    pathname.startsWith('/leaderboard') ||
    pathname.startsWith('/settings')

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-card/92 backdrop-blur-xl border-t border-border/80 shadow-[0_-4px_24px_rgba(0,0,0,0.07)]"
    >
      <div className="flex items-center justify-around px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-w-lg mx-auto">
        {PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive =
            tab.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`) || (tab.href === '/academy' && pathname.startsWith('/lessons'))

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'group relative flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all duration-150 active:scale-95 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span className="absolute -top-1.5 w-6 h-0.5 rounded-full bg-primary shadow-xs" />
              )}
              <Icon
                className={cn(
                  'w-5 h-5 transition-transform duration-150',
                  isActive ? 'scale-105' : 'group-hover:scale-105'
                )}
              />
              <span
                className={cn(
                  'text-[10px] mt-0.5 tracking-tight transition-colors',
                  isActive ? 'font-semibold text-primary' : 'font-medium'
                )}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}

        {/* More / Menu Drawer Trigger */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenMenu}
          className={cn(
            'group relative flex flex-col items-center justify-center min-w-[56px] h-[48px] p-0 rounded-xl transition-all duration-150 active:scale-95 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer hover:bg-transparent',
            isMoreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label="More navigation options"
        >
          {isMoreActive && (
            <span className="absolute -top-1.5 w-6 h-0.5 rounded-full bg-primary shadow-xs" />
          )}
          <Menu
            className={cn(
              'w-5 h-5 transition-transform duration-150',
              isMoreActive ? 'scale-105' : 'group-hover:scale-105'
            )}
          />
          <span
            className={cn(
              'text-[10px] mt-0.5 tracking-tight transition-colors',
              isMoreActive ? 'font-semibold text-primary' : 'font-medium'
            )}
          >
            More
          </span>
        </Button>
      </div>
    </nav>
  )
}
