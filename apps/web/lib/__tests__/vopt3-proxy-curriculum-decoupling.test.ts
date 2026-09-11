/**
 * V-OPT-3 — the proxy no longer drags the compiled content corpus into its bundle.
 *
 * The proxy needs one thing from the content pipeline: a slug -> lesson mapping, so an
 * authenticated learner opening a public /lessons/<slug> URL lands on their interactive
 * copy. It used to obtain that through `fetchCurriculumData()`, which reads the file at
 * runtime via `fs`. Because that path is computed at runtime the file tracer could not
 * tell which files were needed and shipped the whole corpus with the proxy — 94 of 191
 * traced entries were `content/dist`.
 *
 * The fix imports the curriculum index directly, which is the same file that function
 * read, resolved at build time instead. So these tests are mostly about proving the
 * behaviour did NOT change: the redirect target is asserted against the real curriculum
 * data, exactly as `middleware-auth.test.ts` tests 11 and 12 already did.
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error('no session') }),
      refreshSession: async () => ({ data: { session: null, user: null }, error: new Error('no session') }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}))

const AUTHED = { headers: { cookie: 'sb-access-token=some-token' } }

async function run(url: string, init?: { headers?: Record<string, string> }) {
  const { proxy } = await import('../../proxy')
  return proxy(new NextRequest(url, init))
}

describe('V-OPT-3: /lessons routing behaviour is unchanged', () => {
  it('an authenticated learner on a valid slug still reaches the exact same lesson', async () => {
    // Asserted against the REAL curriculum index, which is the whole point: if the
    // statically imported data diverged from what the loader read, this would fail.
    const res = await run('https://prodily.app/lessons/lesson-001', AUTHED)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/academy/foundations/les_zoyq8a')
  })

  it('a second known slug resolves to its own module and id, not a fixed one', async () => {
    const res = await run('https://prodily.app/lessons/lesson-002', AUTHED)
    expect(res.status).toBe(307)
    const location = res.headers.get('location') || ''
    expect(location).toMatch(/\/academy\/[a-z0-9-]+\/les_[a-z0-9]+$/)
    expect(location).not.toContain('les_zoyq8a')
  })

  it('an unknown slug falls back to /academy rather than 404ing or leaking', async () => {
    const res = await run('https://prodily.app/lessons/no-such-lesson', AUTHED)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/academy')
    expect(res.headers.get('location')).not.toMatch(/les_/)
  })

  it('a trailing path segment still resolves on the first segment only', async () => {
    const res = await run('https://prodily.app/lessons/lesson-001/anything', AUTHED)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/academy/foundations/les_zoyq8a')
  })

  it('an unauthenticated visitor passes through to the static public lesson page', async () => {
    const res = await run('https://prodily.app/lessons/lesson-001')
    expect(res.status).toBe(200)
  })

  it('an unauthenticated visitor on an unknown slug also passes through (404 is the page\'s job)', async () => {
    const res = await run('https://prodily.app/lessons/no-such-lesson')
    expect(res.status).toBe(200)
  })

  it('the referral cookie is still attached to the lesson redirect', async () => {
    const res = await run('https://prodily.app/lessons/lesson-001?ref=ABC123', AUTHED)
    expect(res.status).toBe(307)
    expect(res.cookies.get('prodily_referrer')?.value).toBe('ABC123')
  })

  it('the /curriculum redirect for authenticated learners is untouched', async () => {
    const res = await run('https://prodily.app/curriculum', AUTHED)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/academy')
  })

  it('an unauthenticated visitor to /curriculum still passes through', async () => {
    const res = await run('https://prodily.app/curriculum')
    expect(res.status).toBe(200)
  })
})

describe('V-OPT-3: the content loader is out of the proxy bundle', () => {
  it('proxy.ts imports neither the lesson loader nor fs/path', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf-8')
    )
    // Strip comments line-wise so the explanatory note above the import cannot
    // satisfy these assertions. (A regex block-comment strip is wrong here: the note
    // itself contains "/lessons/*", which reads as an opening block comment.)
    const code = src
      .split('\n')
      .filter((line) => {
        const t = line.trim()
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
      })
      .join('\n')
    expect(code).not.toMatch(/from ['"]@\/lib\/lesson-loader['"]/)
    expect(code).not.toMatch(/from ['"]fs(\/promises)?['"]/)
    expect(code).not.toMatch(/from ['"]path['"]/)
    // And it reads the curriculum index statically instead.
    expect(code).toMatch(/import curriculum from ['"].*content\/dist\/curriculum\.json['"]/)
  })

  it('the statically imported index still carries the fields the redirect needs', async () => {
    const curriculum = (await import('../../../../content/dist/curriculum.json')).default as {
      lessons: Array<{ id: string; slug: string; module: string }>
    }
    expect(Array.isArray(curriculum.lessons)).toBe(true)
    expect(curriculum.lessons.length).toBeGreaterThan(0)
    for (const lesson of curriculum.lessons) {
      expect(typeof lesson.slug).toBe('string')
      expect(typeof lesson.module).toBe('string')
      expect(lesson.id).toMatch(/^les_[a-z0-9]+$/)
    }
  })

  it('slugs are unique, so a slug can never resolve to two different lessons', async () => {
    const curriculum = (await import('../../../../content/dist/curriculum.json')).default as {
      lessons: Array<{ slug: string }>
    }
    const slugs = curriculum.lessons.map((l) => l.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('the lesson loader itself is unchanged and still serves the routes that need it', async () => {
    // Decoupling the proxy must not have removed the loader other routes rely on.
    const loader = await import('../lesson-loader')
    expect(typeof loader.fetchCurriculumData).toBe('function')
    expect(typeof loader.fetchCompiledLesson).toBe('function')
    expect(typeof loader.resolveSlugToId).toBe('function')
  })
})

describe('V-OPT-3: V-OPT-1 proxy exclusions and auth routing are intact', () => {
  it.each(['/api/cron/process-email-queue', '/api/health', '/api/og/portfolio/x', '/api/email/webhooks'])(
    'still excludes %s from the matcher',
    async (path) => {
      const { config } = await import('../../proxy')
      const enters = config.matcher.some((p) => new RegExp(`^${p}$`).test(path))
      expect(enters).toBe(false)
    }
  )

  it('an unauthenticated visitor to a protected page is still redirected to login', async () => {
    const res = await run('https://prodily.app/dashboard')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('an unauthenticated visitor to the admin area is still redirected to admin login', async () => {
    const res = await run('https://prodily.app/admin/users')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/login')
  })

  it('public auth pages remain reachable', async () => {
    for (const p of ['/login', '/signup', '/reset-password', '/admin/login']) {
      const res = await run(`https://prodily.app${p}`)
      expect(res.status).toBe(200)
    }
  })
})
