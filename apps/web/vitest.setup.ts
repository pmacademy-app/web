import { vi, afterEach } from 'vitest'

// Set deterministic test environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key'
process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS || 'admin@prodily.app,owner@prodily.app'
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret'

// Mock fetch for mock.supabase.co to prevent DNS timeouts during unit test execution
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
