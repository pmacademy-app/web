import { z } from 'zod'

/**
 * What a learner's display name may contain.
 *
 * The name is copied into auth user metadata and from there into every email that
 * greets the learner, including admin-published HTML templates. Signup is
 * unauthenticated, so an unrestricted field let anyone mail a link or markup to any
 * address under Prodily's name ("Hi <a href=...>claim your prize</a>").
 *
 * Allowed: letters and combining marks in any script (`\p{L}`, `\p{M}`), spaces,
 * apostrophes (straight and curly), hyphens and periods. That covers names such as
 * "Zoë O'Brien-Smith", "J.R.R. Tolkien", "Nguyễn Văn An", "محمد" or "李小龙".
 * Rejected: digits, `<`, `>`, `/`, `:`, `@` and every other symbol, control
 * characters, and anything shaped like a domain (a period directly followed by two
 * or more letters, as in "evil.com"), so a name cannot render as a link.
 */
const NAME_CHARACTERS = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u
const DOMAIN_LIKE = /\.\p{L}{2,}/u

export const NAME_INVALID_MESSAGE =
  'Name can only contain letters, spaces, apostrophes, hyphens and periods.'

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'Full name is required.')
  .min(2, 'Name must be at least 2 characters.')
  .max(80)
  .regex(NAME_CHARACTERS, NAME_INVALID_MESSAGE)
  .refine((value) => !DOMAIN_LIKE.test(value), NAME_INVALID_MESSAGE)
