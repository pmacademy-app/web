import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'

/**
 * Server-side PKCE for Google sign-in, without a second session store.
 *
 * auth-js only runs PKCE when it has storage for the code verifier, and it ignores
 * custom storage when `persistSession` is false. So these clients run with
 * `persistSession: true` and a storage adapter that persists exactly one key: the
 * legacy verifier key `${storageKey}-code-verifier`. Everything else auth-js writes
 * (the session itself, the per-flow verifier slots and their index) is dropped. The
 * session therefore never lands anywhere but the httpOnly cookies the callback sets
 * (B13-A); the verifier is carried between requests in the `prodily_oauth_pkce` cookie.
 *
 * Why the legacy key: a server-side exchange has no flow id (it is not a browser), so
 * auth-js 2.112.x reads the verifier from `${storageKey}-code-verifier`, and the start
 * of every flow still dual-writes that key. The oauth-lib test drives the real auth-js
 * so a rename in a future upgrade fails there, not in production.
 *
 * Values are stored raw: auth-js JSON-encodes them, so the captured verifier is a JSON
 * string with its quotes, and the exchange client hands the same string back.
 */

export const OAUTH_STORAGE_KEY = 'prodily-oauth'
export const OAUTH_VERIFIER_STORAGE_KEY = `${OAUTH_STORAGE_KEY}-code-verifier`

/**
 * Storage that holds only the legacy verifier key. Exported for tests; routes use the
 * two client factories below.
 */
export function createVerifierOnlyStorage(initial: string | null): {
  storage: SupportedStorage
  get(): string | null
} {
  let value: string | null = initial
  const storage: SupportedStorage = {
    getItem(key: string) {
      return key === OAUTH_VERIFIER_STORAGE_KEY ? value : null
    },
    setItem(key: string, next: string) {
      if (key === OAUTH_VERIFIER_STORAGE_KEY) value = next
    },
    removeItem(key: string) {
      if (key === OAUTH_VERIFIER_STORAGE_KEY) value = null
    },
  }
  return { storage, get: () => value }
}

function createPkceClient(storage: SupportedStorage): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
        'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    )
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: OAUTH_STORAGE_KEY,
      storage,
    },
  })
}

/**
 * A client for starting the flow. Call `client.auth.signInWithOAuth(...)`, then
 * `getCapturedVerifier()` returns the verifier auth-js stored, or null if it did not.
 */
export function createPkceCaptureClient(): {
  client: SupabaseClient
  getCapturedVerifier(): string | null
} {
  const { storage, get } = createVerifierOnlyStorage(null)
  return { client: createPkceClient(storage), getCapturedVerifier: get }
}

/**
 * A client for the callback, seeded with the verifier read from the cookie. An empty
 * verifier makes `exchangeCodeForSession` return AuthPKCECodeVerifierMissingError
 * without a network call.
 */
export function createPkceExchangeClient(verifier: string): SupabaseClient {
  const { storage } = createVerifierOnlyStorage(verifier || null)
  return createPkceClient(storage)
}
