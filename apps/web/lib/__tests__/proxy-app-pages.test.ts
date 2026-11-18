/**
 * L1: every signed-in section under app/(app) is an app page to the proxy, so the
 * login redirect, maintenance mode, onboarding and the Google consent gate apply to it.
 * /badges, /capstones and /notifications used to fall through the fast path.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../../proxy'

const APP_GROUP = path.resolve(__dirname, '../../app/(app)')

function appSegments(): string[] {
  return readdirSync(APP_GROUP).filter(
    (name) => statSync(path.join(APP_GROUP, name)).isDirectory() && !name.startsWith('(') && !name.startsWith('_')
  )
}

describe('proxy app pages (L1)', () => {
  it('every app/(app) segment sends an anonymous visitor to the login page', async () => {
    const segments = appSegments()
    expect(segments).toEqual(expect.arrayContaining(['badges', 'capstones', 'notifications']))

    for (const segment of segments) {
      const res = await proxy(new NextRequest(`https://prodily.app/${segment}`))
      const location = res.headers.get('location') || ''
      expect(location, segment).toContain('/login')
      expect(new URL(location).searchParams.get('next'), segment).toBe(`/${segment}`)
    }
  })

  it('covers sub-paths but not look-alike paths', async () => {
    const sub = await proxy(new NextRequest('https://prodily.app/capstones/discovery'))
    expect(sub.headers.get('location') || '').toContain('/login')

    const lookAlike = await proxy(new NextRequest('https://prodily.app/badgesx'))
    expect(lookAlike.headers.get('location')).toBeNull()
  })

  it('the section list in proxy.ts is matched on a segment boundary', () => {
    const source = readFileSync(path.resolve(__dirname, '../../proxy.ts'), 'utf8')
    expect(source).toMatch(/const APP_SECTIONS = \['\/badges', '\/capstones', '\/notifications'\]/)
  })
})
