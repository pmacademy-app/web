import Image from 'next/image'
import { cn } from '@/lib/utils'
import { BRAND } from '@/lib/brand'

export type BrandLogoVariant =
  | 'animated-full'
  | 'hero-full'
  | 'full'
  | 'static-full'
  | 'mark-prodily'
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
    text: 'text-[1.375rem]',
    gap: 'gap-2',
    badge: 'text-[10px] px-1.5 py-0.5',
  },
  md: {
    full: 'h-12 w-auto',
    icon: 'h-10 w-10',
    text: 'text-[1.625rem]',
    gap: 'gap-2.5',
    badge: 'text-xs px-2 py-0.5',
  },
  lg: {
    full: 'h-16 w-auto',
    icon: 'h-12 w-12',
    text: 'text-[2rem]',
    gap: 'gap-3',
    badge: 'text-xs px-2 py-0.5',
  },
  xl: {
    full: 'h-24 w-auto sm:h-28 lg:h-32',
    icon: 'h-16 w-16',
    text: 'text-[2.75rem]',
    gap: 'gap-3.5',
    badge: 'text-sm px-2.5 py-1',
  },
} as const

/**
 * The wordmark: the word "Prodily" set live in Plus Jakarta Sans ExtraBold
 * (`font-wordmark`, loaded in app/layout.tsx at that one weight). Its geometric
 * shapes and soft terminals echo the rounded arch of the mark. No "PM Academy" line.
 */
const WORDMARK_TEXT = 'font-wordmark font-extrabold leading-none tracking-[-0.035em]'

export function BrandLogo({
  variant = 'full',
  size = 'md',
  priority = false,
  className,
  imageClassName,
  badgeText,
  onDark = false,
}: BrandLogoProps) {
  if (variant === 'mark-prodily') {
    return (
      <span className={cn('inline-flex items-center select-none', SIZE_CONFIG[size].gap, className)}>
        <Image
          src={onDark ? BRAND.assets.logoMarkOnDark : BRAND.assets.logoMarkSvg}
          alt=""
          aria-hidden="true"
          width={BRAND.assets.logoMarkDimensions.width}
          height={BRAND.assets.logoMarkDimensions.height}
          priority={priority}
          className={cn('object-contain', SIZE_CONFIG[size].icon, imageClassName)}
        />
        <span className="flex items-center gap-2">
          <span className={cn(WORDMARK_TEXT, onDark ? 'text-slate-100' : 'text-foreground', SIZE_CONFIG[size].text)}>
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

export function BrandMarkProdily(props: Omit<BrandLogoProps, 'variant'>) {
  return <BrandLogo variant="mark-prodily" {...props} />
}

/** @deprecated Use BrandMarkProdily */
export const BrandMarkProdigy = BrandMarkProdily

export function BrandIcon(props: Omit<BrandLogoProps, 'variant'>) {
  return <BrandLogo variant="icon" {...props} />
}

export function WordmarkLogo(props: Omit<BrandLogoProps, 'variant'>) {
  return <BrandLogo variant="wordmark" {...props} />
}
