/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { choosableFrames, earnedFrames, resolveFrame, STREAK_FRAME_MIN_DAYS } from '@/lib/avatar/frames'
import fs from 'node:fs'
import path from 'node:path'
import { AvatarFrame } from '@/components/avatar/AvatarFrame'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('earned frames', () => {
  it('always earns the level ring', () => {
    expect(earnedFrames({})).toEqual(['level'])
  })

  it('orders earned frames by rarity, Fellow first', () => {
    expect(
      earnedFrames({ isFellow: true, weeklyRank: 2, hasFullCertificate: true, isPortfolioVerified: true, currentStreak: 9 })
    ).toEqual(['fellow', 'top3', 'certified', 'verified', 'streak', 'level'])
  })

  it('needs a few days in a row for the streak frame, and a top 3 rank for top3', () => {
    expect(earnedFrames({ currentStreak: STREAK_FRAME_MIN_DAYS - 1 })).not.toContain('streak')
    expect(earnedFrames({ currentStreak: STREAK_FRAME_MIN_DAYS })).toContain('streak')
    expect(earnedFrames({ weeklyRank: 4 })).not.toContain('top3')
    expect(earnedFrames({ weeklyRank: 0 })).not.toContain('top3')
  })
})

describe('resolveFrame', () => {
  it('shows the highest earned frame by default', () => {
    expect(resolveFrame({ isPortfolioVerified: true, currentStreak: 5 }).kind).toBe('verified')
  })

  it('honours a chosen frame the learner still holds', () => {
    expect(resolveFrame({ isFellow: true, currentStreak: 5 }, 'streak').kind).toBe('streak')
  })

  it('falls back when the chosen frame is no longer earned or unknown', () => {
    expect(resolveFrame({ currentStreak: 1 }, 'streak').kind).toBe('level')
    expect(resolveFrame({}, 'not-a-frame').kind).toBe('level')
  })

  it('derives level progress and caps streak segments at 7', () => {
    const f = resolveFrame({ totalXp: 500, currentStreak: 40 })
    expect(f.level).toBe(2)
    expect(f.levelProgress).toBeCloseTo(0.5, 5)
    expect(f.streakSegments).toBe(7)
  })
})

let root: Root | null = null
let el: HTMLDivElement | null = null
function render(node: React.ReactElement) {
  el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  act(() => root!.render(node))
  return el
}

afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
})

describe('AvatarFrame', () => {
  it('renders the avatar inside a labelled, decorative ring', () => {
    const c = render(
      <AvatarFrame frame={resolveFrame({ isFellow: true })} size={96}>
        <span data-testid="who">VA</span>
      </AvatarFrame>
    )
    const frame = c.querySelector('[data-avatar-frame]')!
    expect(frame.getAttribute('data-avatar-frame')).toBe('fellow')
    expect(frame.getAttribute('title')).toBe('PM Fellow')
    expect(c.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    expect(c.querySelector('[data-testid="who"]')).not.toBeNull()
  })

  it('plays earned moments only in full motion, not in quiet lists', () => {
    const full = render(<AvatarFrame frame={resolveFrame({ totalXp: 300 })} size={96}><span /></AvatarFrame>)
    expect(full.innerHTML).toMatch(/class="[^"]*fill/)
    act(() => root?.unmount())
    const quiet = render(<AvatarFrame frame={resolveFrame({ totalXp: 300 })} size={96} motion="quiet"><span /></AvatarFrame>)
    expect(quiet.innerHTML).not.toMatch(/class="[^"]*fill/)
  })

  it('hides the level chip on small avatars', () => {
    const small = render(<AvatarFrame frame={resolveFrame({ totalXp: 300 })} size={40}><span /></AvatarFrame>)
    expect(small.textContent).not.toContain('L2')
    act(() => root?.unmount())
    const big = render(<AvatarFrame frame={resolveFrame({ totalXp: 300 })} size={96}><span /></AvatarFrame>)
    expect(big.textContent).toContain('L2')
  })

  it('marks a live learner and keeps quiet mode free of idle loops', () => {
    const c = render(
      <AvatarFrame frame={resolveFrame({ weeklyRank: 1 })} size={96} motion="quiet" live>
        <span />
      </AvatarFrame>
    )
    expect(c.querySelector('[data-live="true"]')).not.toBeNull()
    const spinning = Array.from(c.querySelectorAll('circle')).filter((n) => (n.getAttribute('class') || '').includes('spin'))
    expect(spinning).toHaveLength(0)
  })
})

describe('frame picker rules', () => {
  it('offers the level ring always, streak and Fellow only once earned', () => {
    expect(choosableFrames({})).toEqual(['level'])
    expect(choosableFrames({ currentStreak: STREAK_FRAME_MIN_DAYS, isFellow: true })).toEqual(['fellow', 'streak', 'level'])
  })

  it('the save endpoint refuses frames that are not earned and writes only server-side', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../app/api/settings/avatar-frame/route.ts'), 'utf8')
    expect(src).toContain("z.object({ frame: z.enum(FRAME_KINDS).nullable() }).strict()")
    expect(src).toContain('You have not earned that frame yet.')
    expect(src).toContain("const { error } = await supabase.from('users').update({ avatar_frame: body.frame })")
    expect(src).toContain('const supabase = createServiceRoleClient()')
    expect(src).toContain('rateLimit: [')
  })
})
