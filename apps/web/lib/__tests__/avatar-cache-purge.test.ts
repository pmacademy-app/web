/**
 * An avatar change must reach the cached public portfolio (ISR, 1 hour) and the cached weekly
 * leaderboard (5 minutes). Both handlers of /api/user/avatar purge them after the write.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const routeSrc = fs.readFileSync(path.join(__dirname, '../../app/api/user/avatar/route.ts'), 'utf8')

function handlerBody(name: 'POST' | 'DELETE'): string {
  const start = routeSrc.indexOf(`export const ${name} = withRoute(`)
  expect(start).toBeGreaterThan(-1)
  const next = routeSrc.indexOf('export const ', start + 1)
  return routeSrc.slice(start, next === -1 ? undefined : next)
}

describe('avatar change purges cached pages', () => {
  it('purges the leaderboard tag and the public portfolio paths', () => {
    expect(routeSrc).toMatch(/invalidateLeaderboardCache\('max'\)/)
    expect(routeSrc).toMatch(/revalidatePublicPortfolioForUser\(createServiceRoleClient\(\), userId\)/)
  })

  it('upload purges after the avatar is saved', () => {
    const body = handlerBody('POST')
    const save = body.indexOf('uploadAndSetUserAvatar')
    const purge = body.indexOf('purgeAvatarCaches(userId)')
    expect(save).toBeGreaterThan(-1)
    expect(purge).toBeGreaterThan(save)
  })

  it('remove purges after the avatar is removed', () => {
    const body = handlerBody('DELETE')
    const remove = body.indexOf('removeUserAvatar(userId)')
    const purge = body.indexOf('purgeAvatarCaches(userId)')
    expect(remove).toBeGreaterThan(-1)
    expect(purge).toBeGreaterThan(remove)
  })
})
