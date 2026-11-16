---
trigger: glob
globs: "apps/web/**/*.tsx, apps/web/**/*.ts, content/**/*.md, docs/**/*.md, tasks/**/*.md"
---

# Copy and writing style

Applies to user-facing text (UI strings, emails, lesson content, metadata) and to docs.

## Hard rules
- No em-dashes anywhere. Use a comma, colon, parentheses or a full stop. En-dashes only inside number ranges if they already exist; prefer "to" ("3 to 30").
- The brand is "Prodily". Do not write "PM Academy" or "Prodily PM Academy" in new copy. Brand strings come from `apps/web/lib/brand.ts` (`BRAND`), not hard-coded.
- No hard-coded brand URLs or hex colors in `.ts`/`.tsx`. Colors come from tokens in `apps/web/app/globals.css` and `apps/web/theme/tokens.ts`. CI greps for these.
- No dark mode. Do not add `dark:` classes or `.dark` styles.

## Say only what is true
- Do not claim features, numbers or outcomes the code does not deliver (docs/RULES.md section 1). No invented learner counts, durations or XP figures.
- "Profile complete", not "Verified". PM Fellow is an award, not a job.
- The certificate states exactly what it requires.
- Credit well-known frameworks to their source. Do not call them proprietary.

## Tone
- Plain, short sentences. Active voice. Second person for learners ("you").
- Specific over vague. Name the action ("Finish Module 2") rather than "Keep going!".
- No internal jargon in learner UI (for example "AST Verified", flag names, table names).
- No exclamation-mark stacking, no emoji in product copy unless the existing component already uses them.
- Error messages say what happened and what to do next. Never show raw provider or database errors.

## Emails
- Founder and broadcast emails follow docs/RULES.md rule 8: From and Reply-To on the authenticated domain, no tracking pixels, no CTA button blocks, plain-text alternative.

## Docs
- Lead with the answer. Short sections, bullets over long tables.
- Cite real paths (`apps/web/lib/...`) and commands that exist in `package.json`.
- Update the doc in the same change when you change behavior it describes.
