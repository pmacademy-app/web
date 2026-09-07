/**
 * Single implementation of secret/PII redaction for the error-reporting pipeline.
 *
 * Threat model — trust boundaries where hostile or sensitive data enters this pipeline:
 *   1. Provider HTTP error bodies (Brevo / Resend) echoed into `details.providerMessage`
 *   2. Exception messages (`err.message`) from any layer, including Postgres
 *   3. Supabase / PostgREST error text, which can contain connection details
 *   4. Queue template variables, which for auth templates carry a live
 *      `token_hash` inside `verificationUrl` / `resetUrl`
 *   5. Request headers echoed into an error (cookies, Authorization)
 *
 * Assets worth stealing, in rough order of blast radius:
 *   - Supabase service-role key (full database access; a JWT)
 *   - Password-reset / email-verification token hashes (account takeover)
 *   - Session access & refresh tokens
 *   - Brevo / Resend API keys (send mail as the brand)
 *   - Webhook signing secrets
 *   - Learner email addresses (PII)
 *
 * Design rules:
 *   - Redact by VALUE SHAPE (regex) and, for structured payloads, also by KEY NAME.
 *     Either alone is bypassable: a token in an unexpected format survives the regex,
 *     and a secret embedded mid-sentence survives key matching.
 *   - Preserve diagnostic value. Emails are masked, not dropped, so the recipient
 *     domain — which is what identifies a bouncing provider — stays readable.
 *   - Fail closed on unknown structure: unrecognised value types are dropped.
 */

/** Redaction applied to any free-text string before it is logged or persisted. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // ── Order matters ──────────────────────────────────────────────────────────
  // Prefix-recognisable credentials run FIRST so the redaction marker records which
  // KIND of secret was present ("whsec_[REDACTED]" tells an operator a webhook secret
  // leaked into the message; a bare "[REDACTED]" does not). The generic key=value
  // rules below then catch anything with no recognisable shape, and skip values that
  // an earlier rule already redacted.

  // ── Provider API keys and signing secrets, by prefix ───────────────────────
  [/xkeysib-[A-Za-z0-9\-_]+/gi, 'xkeysib-[REDACTED]'],   // Brevo API key
  [/xsmtpsib-[A-Za-z0-9\-_]+/gi, 'xsmtpsib-[REDACTED]'], // Brevo SMTP key
  [/re_[A-Za-z0-9_]+/gi, 're_[REDACTED]'],               // Resend API key
  [/whsec_[A-Za-z0-9\+\/]+/gi, 'whsec_[REDACTED]'],      // Webhook signing secret
  [/sk_(live|test)_[A-Za-z0-9]+/gi, 'sk_[REDACTED]'],    // Generic secret-key shape

  // ── JWTs (Supabase anon and service-role keys are JWTs) ────────────────────
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]'],

  // ── Svix / Standard Webhooks signature ─────────────────────────────────────
  [/v1,[A-Za-z0-9\+\/=]+/gi, 'v1,[REDACTED]'],

  // ── Database / service credentials ─────────────────────────────────────────
  // postgres://user:password@host  →  keep the scheme, drop the credentials
  [/\b([a-z][a-z0-9+.-]*):\/\/[^:/\s@]+:[^@\s]+@/gi, '$1://[REDACTED]@'],

  // ── Bearer / Authorization ─────────────────────────────────────────────────
  [/Bearer\s+(?!\[REDACTED)[A-Za-z0-9\-\._~\+\/]+=*/gi, 'Bearer [REDACTED]'],
  // Consume the whole header value including the auth scheme: stopping at the first
  // space left the credential in `Authorization: Basic dXNlcjpwYXNz`.
  [/\b(authorization|proxy-authorization)\s*:\s*(?!\[REDACTED)[^\n\r,;]+/gi, '$1: [REDACTED]'],

  // ── Cookies (whole header, then the specific session cookies) ──────────────
  [/\bcookie\s*:\s*(?!\[REDACTED)[^\n\r]+/gi, 'cookie: [REDACTED]'],
  [/\bsb-(access|refresh)-token=(?!\[REDACTED)[^;\s&"']+/gi, 'sb-$1-token=[REDACTED]'],

  // ── Auth tokens in URLs and query strings ──────────────────────────────────
  // Covers /api/auth/callback?token_hash=...&type=recovery — an account-takeover
  // credential that reaches the pipeline through queued auth template variables.
  // The optional quote before the key matters: in a JSON body the key's own closing
  // quote sits between the name and the colon, so `{"token":"..."}` would otherwise
  // never match.
  [
    /["']?\b(token_hash|token_hash_new|token|access_token|refresh_token|refresh|otp|one_time_token|confirmation_token|recovery_token|api[-_]?key|apikey|secret|client_secret|signature)\b["']?\s*[=:]\s*["']?(?![A-Za-z0-9\-\._~\+\/%]*\[REDACTED)[A-Za-z0-9\-\._~\+\/%]{6,}["']?/gi,
    '$1=[REDACTED]',
  ],

  // ── Passwords and generic credential assignments ───────────────────────────
  [/["']?\b(password|passwd|pwd|new_password|current_password|credential|credentials)\b["']?\s*[=:]\s*["']?(?![^\s,;&"\'}\]]*\[REDACTED)[^\s,;&"'}\]]+["']?/gi, '$1=[REDACTED]'],
  [/(key|secret|token|password|auth|authorization)=['"]?(?![A-Za-z0-9\-\._~\+\/]*\[REDACTED)[A-Za-z0-9\-\._~\+\/]+['"]?/gi, '$1=[REDACTED]'],
]

const EMAIL_PATTERN = /([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)([A-Za-z0-9._%+-])@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

/**
 * Masks an email while keeping the domain, which is the part with diagnostic value
 * (it identifies which recipient domain is rejecting mail).
 */
export function maskEmailAddress(email: string): string {
  if (!email || !email.includes('@')) return '***'
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `*@${domain}`
  return `${local[0]}***${local[local.length - 1]}@${domain}`
}

/** Masks every email address found inside a free-text string. */
export function maskEmailsInText(input: string): string {
  return input.replace(EMAIL_PATTERN, (_m, first, _mid, last, domain) => `${first}***${last}@${domain}`)
}

/**
 * Redacts secrets and masks emails in a free-text string.
 *
 * Applied to every message and every string value inside `details` before either is
 * written to `system_errors` or to a console.
 */
export function sanitizeErrorMessage(input: string): string {
  if (!input) return ''
  const redacted = SECRET_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    input
  )
  return maskEmailsInText(redacted)
}

/**
 * Key names whose VALUE is always replaced, regardless of shape.
 *
 * Defense in depth behind the regexes: a token in an unanticipated format (a raw
 * opaque string with no recognisable prefix) still gets caught because of where it
 * sits in the object.
 */
const SENSITIVE_KEY_PATTERN =
  /^(password|passwd|pwd|new_?password|current_?password|token|token_?hash|token_?hash_?new|access_?token|refresh_?token|id_?token|session|secret|client_?secret|api_?key|apikey|authorization|auth|cookie|cookies|credential|credentials|otp|one_?time_?token|signature|private_?key|service_?role_?key|anon_?key|connection_?string|database_?url|dsn)$/i

/**
 * Key names that LOOK sensitive to the pattern above but are safe and diagnostically
 * important. Without this, `templateKey` and `authAction` would be redacted and the
 * error log would lose the two fields an operator triages by.
 */
const SAFE_KEY_ALLOWLIST = new Set([
  'templatekey',
  'template_key',
  'authaction',
  'auth_action',
  'autherrorcode',
  'errorcode',
  'errorid',
  'rawcode',
  'statuscode',
  'providerstatuscode',
  'resendid',
  'externalid',
  'queueid',
  'broadcastid',
  'userid',
  'maskedemail',
  'apikeyconfigured',
])

/** Key names whose value is an auth URL containing a one-time token. */
const TOKEN_BEARING_URL_KEY_PATTERN =
  /^(verification_?url|reset_?url|confirmation_?url|magic_?link|action_?link|recovery_?url|callback_?url|invite_?url)$/i

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s-]/g, '')
  if (SAFE_KEY_ALLOWLIST.has(normalized)) return false
  return SENSITIVE_KEY_PATTERN.test(key) || TOKEN_BEARING_URL_KEY_PATTERN.test(key)
}

const MAX_DEPTH = 6
const MAX_ARRAY_ITEMS = 50
const MAX_STRING_LENGTH = 2000

/**
 * Recursively sanitizes a structured payload for persistence.
 *
 * Applies both defenses: values are redacted by shape, and values under a sensitive
 * key name are replaced outright. Cycles and oversized payloads are bounded so a
 * hostile or accidental structure cannot wedge the logger.
 */
export function sanitizeStructuredPayload(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return '[truncated]'

  if (typeof value === 'string') {
    const clean = sanitizeErrorMessage(value)
    return clean.length > MAX_STRING_LENGTH ? `${clean.slice(0, MAX_STRING_LENGTH)}…[truncated]` : clean
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (value === undefined) return undefined

  if (value instanceof Error) {
    return sanitizeErrorMessage(`${value.name}: ${value.message}`)
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[circular]'
    seen.add(value as object)

    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map((v) => sanitizeStructuredPayload(v, depth + 1, seen))
    }

    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = '[REDACTED]'
        continue
      }
      out[k] = sanitizeStructuredPayload(v, depth + 1, seen)
    }
    return out
  }

  // Functions, symbols, bigints and anything else: drop rather than coerce.
  return undefined
}
