import Image from 'next/image'
import { cn } from '@/lib/utils'
import { BRAND } from '@/lib/brand'

export type BrandLogoVariant =
  | 'animated-full'
  | 'hero-full'
  | 'full'
  | 'static-full'
  | 'mark-prodigy'
  | 'icon'
  | 'mark'
  | 'wordmark'

export type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl'

export type BrandLogoProps = {
  variant?: BrandLogoVariant
  size?: BrandLogoSize
  priority?: boolean
  className?: string
  imageClassName?: string
  badgeText?: string
  onDark?: boolean
}

const SIZE_CONFIG = {
  sm: {
    full: 'h-9 w-auto',
    icon: 'h-8 w-8',
    text: 'text-base font-bold',
    badge: 'text-[10px] px-1.5 py-0.5',
  },
  md: {
    full: 'h-12 w-auto',
    icon: 'h-10 w-10',
    text: 'text-lg font-bold',
    badge: 'text-xs px-2 py-0.5',
  },
  lg: {
    full: 'h-16 w-auto',
    icon: 'h-12 w-12',
    text: 'text-xl font-bold',
    badge: 'text-xs px-2 py-0.5',
  },
  xl: {
    full: 'h-24 w-auto sm:h-28 lg:h-32',
    icon: 'h-16 w-16',
    text: 'text-2xl font-bold',
    badge: 'text-sm px-2.5 py-1',
  },
} as const

export function BrandLogo({
  variant = 'full',
  size = 'md',
  priority = false,
  className,
  imageClassName,
  badgeText,
  onDark = false,
}: BrandLogoProps) {
  if (variant === 'mark-prodigy') {
    return (
      <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
        <Image
          src={onDark ? BRAND.assets.logoMarkOnDark : BRAND.assets.logoMarkSvg}
          alt={`${BRAND.company} mark`}
          width={BRAND.assets.logoMarkDimensions.width}
          height={BRAND.assets.logoMarkDimensions.height}
          priority={priority}
          className={cn('object-contain', SIZE_CONFIG[size].icon, imageClassName)}
        />
        <span className="flex items-center gap-2">
          <span className={cn('font-display tracking-tight', onDark ? 'text-slate-100' : 'text-foreground', SIZE_CONFIG[size].text)}>
            {BRAND.company}
          </span>
          {badgeText && (
            <span className={cn('rounded font-semibold tracking-wide uppercase', onDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-primary/10 text-primary border border-primary/20', SIZE_CONFIG[size].badge)}>
              {badgeText}
            </span>
          )}
        </span>
      </span>
    )
  }

  const isIcon = variant === 'icon' || variant === 'mark'
  const isAnimated = variant === 'animated-full' || variant === 'hero-full'
  const isWordmark = variant === 'wordmark'

  let source: string = BRAND.assets.logoFullSvg
  let dimensions: { width: number; height: number } = BRAND.assets.logoFullDimensions

  if (isIcon) {
    source = BRAND.assets.logoMarkSvg
    dimensions = BRAND.assets.logoMarkDimensions
  } else if (isWordmark) {
    source = BRAND.assets.wordmarkSvg
    dimensions = BRAND.assets.wordmarkDimensions
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center select-none',
        isAnimated && 'motion-safe:animate-[brand-logo-rise_700ms_cubic-bezier(0.16,1,0.3,1)_both]',
        className,
      )}
      aria-label={isIcon ? `${BRAND.fullName} mark` : BRAND.fullName}
    >
      <Image
        src={source}
        alt={isIcon ? `${BRAND.fullName} mark` : BRAND.fullName}
        width={dimensions.width}
        height={dimensions.height}
        priority={priority}
        className={cn(
          'object-contain',
          isIcon ? SIZE_CONFIG[size].icon : SIZE_CONFIG[size].full,
          isAnimated && 'motion-safe:drop-shadow-[0_18px_40px_rgba(0,74,115,0.14)]',
          imageClassName,
        )}
      />
    </span>
  )
}

export function AnimatedBrandLogo(props: Omit<BrandLogoProps, 'variant'>) {
  return <BrandLogo variant="animated-full" priority {...props} />
}

export function StaticBrandLogo(props: Omit<BrandLogoProps, 'variant'>) {
  return <BrandLogo variant="full" {...props} />
}

export function BrandMarkProdigy(props: Omit<BrandLogoProps, 'variant'>) {
  return <BrandLogo variant="mark-prodigy" {...props} />
}

export function BrandIcon(props: Omit<BrandLogoProps, 'variant'>) {
  return <BrandLogo variant="icon" {...props} />
}

export function WordmarkLogo(props: Omit<BrandLogoProps, 'variant'>) {
  return <BrandLogo variant="wordmark" {...props} />
}
