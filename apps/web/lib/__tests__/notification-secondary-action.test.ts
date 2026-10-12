import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseNotificationSecondaryAction } from '@/lib/notifications/in-app/secondary-action'
import { validateUsername } from '@/lib/portfolio'

// Growth R5 / B0: the optional second action on an in-app notification. The column is free-form
// jsonb, so the parser is the only gate between a stored value and a rendered link.

describe('parseNotificationSecondaryAction', () => {
  it('accepts a portfolio share, defaulting the context to portfolio', () => {
    expect(parseNotificationSecondaryAction({ kind: 'share_portfolio', label: 'Share', username: 'ada_l' })).toEqual({
      kind: 'share_portfolio',
      label: 'Share',
      username: 'ada_l',
      context: 'portfolio',
    })
    expect(
      parseNotificationSecondaryAction({ kind: 'share_portfolio', label: 'Share', username: 'ada', context: 'fellow' }),
    ).toMatchObject({ context: 'fellow' })
  })

  it('accepts a capstone share and validates its slug and title', () => {
    const ok = { kind: 'share_portfolio', label: 'Share case study', username: 'ada', context: 'capstone', moduleSlug: 'discovery', capstoneTitle: 'Brief' }
    expect(parseNotificationSecondaryAction(ok)).toEqual(ok)
    expect(parseNotificationSecondaryAction({ ...ok, moduleSlug: '../x' })).toBeNull()
    expect(parseNotificationSecondaryAction({ ...ok, capstoneTitle: '' })).toBeNull()
  })

  it('accepts a badge share and requires its badge name', () => {
    expect(
      parseNotificationSecondaryAction({ kind: 'share_portfolio', label: 'Share', username: 'ada', context: 'badge', badgeName: 'Module Master' }),
    ).toEqual({ kind: 'share_portfolio', label: 'Share', username: 'ada', context: 'badge', badgeName: 'Module Master' })
    expect(parseNotificationSecondaryAction({ kind: 'share_portfolio', label: 'Share', username: 'ada', context: 'badge' })).toBeNull()
    expect(
      parseNotificationSecondaryAction({ kind: 'share_portfolio', label: 'Share', username: 'ada', context: 'badge', badgeName: 'x'.repeat(61) }),
    ).toBeNull()
  })

  it('accepts an in-app link and an https LinkedIn add-to-profile link', () => {
    expect(parseNotificationSecondaryAction({ kind: 'link', label: 'Publish portfolio', href: '/settings?tab=portfolio' })).toEqual({
      kind: 'link',
      label: 'Publish portfolio',
      href: '/settings?tab=portfolio',
    })
    const url = 'https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=x'
    expect(parseNotificationSecondaryAction({ kind: 'linkedin_add_to_profile', label: 'Add to LinkedIn', url })).toEqual({
      kind: 'linkedin_add_to_profile',
      label: 'Add to LinkedIn',
      url,
    })
  })

  it.each([
    ['null', null],
    ['an array', [{ kind: 'link', label: 'x', href: '/a' }]],
    ['an unknown kind', { kind: 'download', label: 'Get', url: 'https://example.com' }],
    ['a missing label', { kind: 'link', href: '/a' }],
    ['an overlong label', { kind: 'link', label: 'x'.repeat(41), href: '/a' }],
    ['an external href on a link', { kind: 'link', label: 'Go', href: 'https://evil.example' }],
    ['a protocol-relative href', { kind: 'link', label: 'Go', href: '//evil.example/a' }],
    ['a backslash href', { kind: 'link', label: 'Go', href: '/\\evil.example' }],
    ['a javascript: href', { kind: 'link', label: 'Go', href: 'javascript:alert(1)' }],
    ['a non-LinkedIn add-to-profile host', { kind: 'linkedin_add_to_profile', label: 'Add', url: 'https://linkedin.com.evil.example/profile/add' }],
    ['an http LinkedIn url', { kind: 'linkedin_add_to_profile', label: 'Add', url: 'http://www.linkedin.com/profile/add' }],
    ['a LinkedIn url other than add-to-profile', { kind: 'linkedin_add_to_profile', label: 'Add', url: 'https://www.linkedin.com/feed/' }],
    ['a username with a slash', { kind: 'share_portfolio', label: 'Share', username: '../admin' }],
    ['a LinkedIn url with credentials', { kind: 'linkedin_add_to_profile', label: 'Add', url: 'https://u:p@linkedin.com/profile/add' }],
    ['a LinkedIn url with a username only', { kind: 'linkedin_add_to_profile', label: 'Add', url: 'https://u@www.linkedin.com/profile/add' }],
    ['a LinkedIn url with a port', { kind: 'linkedin_add_to_profile', label: 'Add', url: 'https://www.linkedin.com:8443/profile/add' }],
    ['a LinkedIn url with credentials and a port', { kind: 'linkedin_add_to_profile', label: 'Add', url: 'https://u:p@linkedin.com:8443/profile/add' }],
    ['a username with a dot', { kind: 'share_portfolio', label: 'Share', username: 'ada.l' }],
    ['a username shorter than 3', { kind: 'share_portfolio', label: 'Share', username: 'ab' }],
    ['a username longer than 30', { kind: 'share_portfolio', label: 'Share', username: 'a'.repeat(31) }],
  ])('rejects %s', (_label, value) => {
    expect(parseNotificationSecondaryAction(value)).toBeNull()
  })

  // The share username follows the portfolio rule (validateUsername in lib/portfolio.ts).
  it.each(['ada', 'Ada-L_9', 'a'.repeat(30)])('accepts the portfolio username %s', (username) => {
    expect(validateUsername(username).isValid).toBe(true)
    expect(parseNotificationSecondaryAction({ kind: 'share_portfolio', label: 'Share', username })).toMatchObject({ username })
  })
})

describe('B0 migration', () => {
  const dir = path.resolve(__dirname, '../../../../supabase/migrations')
  const code = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8').replace(/--.*$/gm, '')

  it('adds a nullable jsonb column with no default and ships a rollback', () => {
    const up = code('20261011000001_in_app_notification_secondary_action.sql')
    expect(up).toMatch(/ADD COLUMN IF NOT EXISTS secondary_action jsonb;/)
    expect(up).not.toMatch(/DEFAULT|NOT NULL|UPDATE /i)
    expect(code('rollback/20261011000001_in_app_notification_secondary_action.down.sql')).toMatch(
      /DROP COLUMN IF EXISTS secondary_action/,
    )
  })
})

describe('P2 migration (celebrated_at)', () => {
  const dir = path.resolve(__dirname, '../../../../supabase/migrations')
  const code = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8').replace(/--.*$/gm, '')
  const up = code('20261011000002_in_app_notification_celebrated_at.sql')

  it('adds a nullable celebrated_at column and a partial index for the claim', () => {
    expect(up).toMatch(/ADD COLUMN IF NOT EXISTS celebrated_at timestamptz;/)
    expect(up).toMatch(/WHERE celebrated_at IS NULL AND idempotency_key IS NOT NULL/)
  })

  it('treats every already-read achievement row as celebrated, for each claimable prefix', () => {
    expect(up).toMatch(/SET celebrated_at = coalesce\(read_at, created_at\)/)
    expect(up).toMatch(/WHERE is_read = true/)
    for (const prefix of ['certificate-generated-', 'capstone-reviewed-', 'fellow-granted-', 'module-completed-']) {
      expect(up).toContain(`idempotency_key LIKE '${prefix}%'`)
    }
  })

  it('ships a rollback', () => {
    expect(code('rollback/20261011000002_in_app_notification_celebrated_at.down.sql')).toMatch(
      /DROP COLUMN IF EXISTS celebrated_at/,
    )
  })
})
