import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseNotificationSecondaryAction } from '@/lib/notifications/in-app/secondary-action'

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
    ['a username with a slash', { kind: 'share_portfolio', label: 'Share', username: '../admin' }],
  ])('rejects %s', (_label, value) => {
    expect(parseNotificationSecondaryAction(value)).toBeNull()
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
