/**
 * Context-Safe JSON-LD / HTML <script> Serializer (Prodily Production Hardening B2 / I-12-B1)
 *
 * Escapes characters that have syntactic meaning in HTML script-data state:
 * - `<` is escaped as `\u003c` to prevent `</script>` tag breakout in any casing (XSS mitigation S2-C3 / I-12-B1).
 * - `>` is escaped as `\u003e` to prevent HTML tag closing and CDATA breakout.
 * - `&` is escaped as `\u0026` to prevent entity confusion.
 * - `\u2028` and `\u2029` are escaped to prevent ECMAScript line terminator parsing errors in JSON contexts.
 *
 * RFC 8259 compliant: JSON.parse() identically reconstructs the original string value.
 */

export function safeJsonLd(data: unknown): string {
  if (data === undefined) {
    return ''
  }

  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export const safeJsonStringify = safeJsonLd
