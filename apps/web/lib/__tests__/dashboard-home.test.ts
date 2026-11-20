import { describe, it, expect } from 'vitest'
import { firstName, greetingFor, nextFreezeDay, relativeDayLabel, weekStrip, xpSourceLabel } from '@/lib/dashboard/home'

describe('dashboard home helpers', () => {
  it('greets by local hour', () => {
    expect(greetingFor(6)).toBe('Good morning')
    expect(greetingFor(12)).toBe('Good afternoon')
    expect(greetingFor(16)).toBe('Good afternoon')
    expect(greetingFor(17)).toBe('Good evening')
  })

  it('uses the first name, then the username, then a neutral word', () => {
    expect(firstName('Aanya Rao', 'aanya')).toBe('Aanya')
    expect(firstName('  ', 'aanya')).toBe('aanya')
    expect(firstName(null, null)).toBe('there')
  })

  it('builds a Monday-first week strip from the current streak', () => {
    // Thursday 19 Nov 2026, a 12-day streak that includes today
    const week = weekStrip('2026-11-19', 12, '2026-11-19')
    expect(week.map((d) => d.label)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
    expect(week[0].date).toBe('2026-11-16')
    expect(week.map((d) => d.state)).toEqual(['done', 'done', 'done', 'done', 'future', 'future', 'future'])
  })

  it('marks today as pending when the streak ended yesterday, and older gaps as missed', () => {
    const week = weekStrip('2026-11-19', 2, '2026-11-18')
    expect(week.map((d) => d.state)).toEqual(['missed', 'done', 'done', 'today', 'future', 'future', 'future'])
  })

  it('handles no streak', () => {
    expect(weekStrip('2026-11-16', 0, null).map((d) => d.state)).toEqual(['today', 'future', 'future', 'future', 'future', 'future', 'future'])
  })

  it('earns the next freeze on the next multiple of 7', () => {
    expect(nextFreezeDay(0)).toBe(7)
    expect(nextFreezeDay(6)).toBe(7)
    expect(nextFreezeDay(7)).toBe(14)
    expect(nextFreezeDay(12)).toBe(14)
  })

  it('labels every XP source', () => {
    for (const s of ['theory_read', 'quiz_correct', 'quiz_bonus', 'flashcard', 'reflection', 'capstone', 'streak']) {
      expect(xpSourceLabel(s)).not.toBe('XP earned')
    }
  })

  it('says Today and Yesterday, else a short date', () => {
    expect(relativeDayLabel('2026-11-19', '2026-11-19', '08:40')).toBe('Today, 08:40')
    expect(relativeDayLabel('2026-11-18', '2026-11-19', '19:05')).toBe('Yesterday, 19:05')
    expect(relativeDayLabel('2026-11-12', '2026-11-19', '10:00')).toBe('12 Nov')
  })
})
