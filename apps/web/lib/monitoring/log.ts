import { sanitizeStructuredPayload } from './redaction'
import { getRequestId } from './request-context'

/**
 * Structured application logging (B9-C).
 *
 * ## What this is, and what it is not
 *
 * `logErrorReport()` records an **incident**: it derives severity, builds a
 * deduplication fingerprint, writes a `system_errors` row and can page an admin.
 * That is the right shape for "the email provider is down". It is the wrong shape
 * for "the claim RPC was unavailable so we used the fallback", which happens, is
 * worth seeing, and must not become an alert or a database row.
 *
 * Before this module the only alternative was a raw `console.*`, and that is the
 * hole `F-SEC-14` names: 305 of them interpolate exception text straight into the
 * platform logs, where redaction never runs. A Postgres error carries connection
 * details, a provider error body carries whatever the provider chose to echo, and
 * an auth failure carries token material. `system_errors` was redacted; the log
 * stream beside it was not.
 *
 * So this is the third thing: a log that is **redacted, structured and cheap** —
 * no persistence, no fingerprint, no alert.
 *
 * ## The contract
 *
 * Every record is `{ ts, level, event, requestId?, ...fields }`. The `event` is a
 * stable dotted name, never an interpolated sentence, so a log search is an exact
 * match rather than a substring guess and the volatile parts stay in fields where
 * they can be read by a machine.
 *
 * Production emits one JSON line per record. Development emits something readable.
 * Tests emit nothing unless asked, which keeps the isolation the existing suites
 * rely on.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Structured fields. `unknown` rather than a narrow union because the payload is
 * sanitized before it is emitted — the redactor, not the type, is what makes a
 * value safe to print.
 */
export type LogFields = Record<string, unknown>

/**
 * Strips characters that would let a caller-supplied string forge log structure.
 *
 * JSON.stringify already escapes newlines, so the production path is covered by
 * construction: but the development path prints values directly, and an event
 * name or field value carrying `\n` or an ANSI escape could otherwise fake a
 * second record or rewrite an operator's terminal. Applied to every string in
 * both modes so the two cannot drift.
 */
function stripControlCharacters(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
}

function scrubStrings(value: unknown): unknown {
  if (typeof value === 'string') return stripControlCharacters(value)
  if (Array.isArray(value)) return value.map(scrubStrings)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[stripControlCharacters(k)] = scrubStrings(v)
    }
    return out
  }
  return value
}

/**
 * Normalises a thrown value into two safe fields.
 *
 * The stack is deliberately omitted. It is the part most likely to carry
 * interpolated argument values, it is long enough to push the useful fields out of
 * a log viewport, and the platform already captures a stack for anything that
 * escapes to the top level. Name and message are what a reader triages by.
 */
export function describeError(cause: unknown): { name: string; message: string } {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message }
  }
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return { name: 'Error', message: String((cause as { message: unknown }).message) }
  }
  return { name: 'Error', message: String(cause) }
}

/** True when the process is a test run. Kept local so this module has no cycle. */
function isTestRun(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      Boolean(process.env.VITEST_WORKER_ID) ||
      Boolean(process.env.JEST_WORKER_ID))
  )
}

/**
 * Whether a record should reach the console.
 *
 * Silent under test by default so converting a `console.warn` does not start
 * printing noise into 147 suites, and so an assertion about log output has to opt
 * in rather than fight the default. `PRODILY_LOG_IN_TESTS=true` re-enables it for
 * the tests that assert on emitted records.
 */
function shouldEmit(): boolean {
  if (!isTestRun()) return true
  return process.env.PRODILY_LOG_IN_TESTS === 'true'
}

/** `debug` is dropped in production; everything else is always emitted. */
function isLevelEnabled(level: LogLevel): boolean {
  if (level !== 'debug') return true
  return process.env.NODE_ENV !== 'production'
}

const CONSOLE_FOR_LEVEL: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: (...args) => console.debug(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}

export interface LogRecord {
  ts: string
  level: LogLevel
  event: string
  requestId?: string
  [field: string]: unknown
}

/**
 * Builds the record without emitting it.
 *
 * Exported so tests can assert on the exact shape — including that a secret was
 * removed — without depending on how the console formats it.
 */
export function buildLogRecord(level: LogLevel, event: string, fields: LogFields = {}): LogRecord {
  // Sanitize first (secrets by value and by key name, depth/size bounds, Errors
  // flattened), then strip control characters from what survives.
  const safeFields = scrubStrings(sanitizeStructuredPayload(fields) ?? {}) as LogFields

  // An explicit requestId wins; otherwise the ambient one from `withRoute`.
  const ambient = getRequestId()
  const requestId =
    typeof safeFields.requestId === 'string' ? safeFields.requestId : ambient

  delete safeFields.requestId

  return {
    ts: new Date().toISOString(),
    level,
    event: stripControlCharacters(event),
    ...(requestId ? { requestId: stripControlCharacters(requestId) } : {}),
    ...safeFields,
  }
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (!isLevelEnabled(level) || !shouldEmit()) return

  const record = buildLogRecord(level, event, fields)
  const write = CONSOLE_FOR_LEVEL[level]

  if (process.env.NODE_ENV === 'production') {
    // One JSON line per record: greppable, and the escaping neutralises anything
    // that survived the scrub above.
    write(JSON.stringify(record))
    return
  }

  const { ts: _ts, level: _level, event: name, requestId, ...rest } = record
  void _ts
  void _level
  write(
    `[${name}]${requestId ? ` (${requestId})` : ''}`,
    Object.keys(rest).length > 0 ? rest : ''
  )
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
  /**
   * `error` with a thrown value attached under `err`.
   *
   * The common case in the converted paths, and the one that used to read
   * `console.error('...', err)` — which printed the raw exception. Here the
   * message goes through the redactor first.
   */
  exception: (event: string, cause: unknown, fields?: LogFields) =>
    emit('error', event, { ...fields, err: describeError(cause) }),
  /** `warn` with a thrown value attached, for a handled-and-degraded path. */
  warnException: (event: string, cause: unknown, fields?: LogFields) =>
    emit('warn', event, { ...fields, err: describeError(cause) }),
}
