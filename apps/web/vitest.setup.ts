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

afterEach(() => {
  vi.clearAllMocks()
})
