import { vi, afterEach } from 'vitest'

// Set deterministic test environment variables (isolate from local .env.local)
if (process.env.ALLOW_LIVE_DB_TESTS !== 'true') {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
}
process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS || 'admin@prodily.app,owner@prodily.app'
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret'
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA'
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'

// Mock fetch for mock.supabase.co, and block real Cloudflare Turnstile calls, so unit
// tests never depend on the network.
const originalFetch = global.fetch
global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = String(input)
  if (urlStr.includes('mock.supabase.co')) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': '0-0/0',
      },
    })
  }
  // Turnstile Siteverify must never be contacted for real, and a blanket
  // "always succeeds" stub is worse than no stub: it silently turned every route
  // suite into one that passes the CAPTCHA with any string, so those suites proved
  // nothing about the challenge. Failing loudly forces each suite to state what it
  // expects — either by mocking `@/lib/security/turnstile`, or (as the dedicated
  // Turnstile unit tests do) by stubbing `fetch` with the exact Cloudflare response
  // under test.
  if (urlStr.includes('challenges.cloudflare.com')) {
    throw new Error(
      `[vitest] Unmocked Cloudflare Turnstile call to ${urlStr}. ` +
        'Mock @/lib/security/turnstile in this suite, or stub global fetch with the ' +
        'Siteverify response the test intends to exercise.'
    )
  }
  return originalFetch(input, init)
}) as typeof global.fetch

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Headers()),
}))

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    public nextUrl: URL
    public cookies: {
      get: (name: string) => { name: string; value: string } | undefined
      getAll: () => Array<{ name: string; value: string }>
      set: (name: string, value: string) => void
      delete: (name: string) => void
    }

    constructor(input: string | URL, init?: RequestInit) {
      super(input, init)
      this.nextUrl = new URL(String(input))
      const headersRecord = (init?.headers && typeof init.headers === 'object' && !(init.headers instanceof Headers))
        ? (init.headers as Record<string, string | undefined>)
        : null
      const cookieHeader =
        headersRecord?.cookie ||
        headersRecord?.Cookie ||
        (init?.headers instanceof Headers ? init.headers.get('cookie') : '') ||
        ''
      const cookieMap = new Map<string, string>()
      if (cookieHeader) {
        cookieHeader.split(';').forEach((part: string) => {
          const [k, v] = part.trim().split('=')
          if (k) cookieMap.set(k.trim(), v ? v.trim() : '')
        })
      }

      this.cookies = {
        get: (name: string) => {
          const val = cookieMap.get(name)
          return val !== undefined ? { name, value: val } : undefined
        },
        getAll: () => Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value })),
        set: (name: string, value: string) => cookieMap.set(name, value),
        delete: (name: string) => cookieMap.delete(name),
      }
    }
  }

  class MockNextResponse extends Response {
    public cookies: {
      get: (name: string) => { name: string; value: string } | undefined
      getAll: () => Array<{ name: string; value: string }>
      set: (name: string, value: string) => void
      delete: (name: string) => void
    }

    constructor(body?: BodyInit | null, init?: ResponseInit) {
      super(body, init)
      const cookieMap = new Map<string, string>()
      this.cookies = {
        get: (name: string) => {
          const val = cookieMap.get(name)
          return val !== undefined ? { name, value: val } : undefined
        },
        getAll: () => Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value })),
        set: (name: string, value: string) => cookieMap.set(name, value),
        delete: (name: string) => cookieMap.delete(name),
      }
    }

    public static json(data: unknown, init?: ResponseInit) {
      return new MockNextResponse(JSON.stringify(data), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      })
    }

    public static redirect(url: string | URL, init?: number | ResponseInit) {
      const status = typeof init === 'number' ? init : (init?.status || 307)
      return new MockNextResponse(null, {
        status,
        headers: { Location: String(url) },
      })
    }

    public static next() {
      return new MockNextResponse(null, { status: 200 })
    }
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  }
})

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: vi.fn(({ children }) => children),
}))

vi.mock('next/image', () => ({
  default: vi.fn(() => null),
}))

vi.mock('next/dynamic', () => ({
  default: vi.fn(() => () => null),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})
