---
name: pm-academy-git-deployment
description: >
  PM Academy git workflow and deployment skill. Covers branching strategy, commit
  conventions, PR workflow, GitHub Actions CI pipeline, Vercel deployment, and
  environment variable management. Triggers on: git operations, deployment, CI/CD
  issues, PR creation, release process, or any workflow/pipeline questions.
---

# PM Academy — Git & Deployment

Load `00-pm-academy-core` alongside this skill.

---

## 1. Branching Strategy

**Trunk-based development** — `main` is always deployable.

```
main                    # production branch — always deployable
├── feature/[name]      # new features (feature/xp-system, feature/skill-radar)
├── fix/[name]          # bug fixes (fix/streak-timezone-bug, fix/quiz-score-calc)
├── chore/[name]        # maintenance (chore/update-deps, chore/add-unit-tests)
└── content/[name]      # content-only changes (content/lesson-047-rewrite)
```

**Rules:**
- `main` is protected — no direct pushes. All changes via PR.
- Feature branches are short-lived — merge within days, not weeks.
- Rebase onto `main` before merging (not merge commits into feature branches).
- Delete branches after merging.

---

## 2. Commit Message Convention

```
<type>: <short imperative summary (≤72 chars)>

[Optional body — explain WHY if not obvious]

[Optional footer — refs, co-authors, breaking changes]
```

### Types
| Type | Use for |
|------|---------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `content` | Lesson content changes (Markdown edits) |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `chore` | Dependency updates, CI changes, tooling |
| `docs` | Documentation only changes |
| `perf` | Performance improvements |
| `style` | Formatting, whitespace, CSS-only changes |

### Examples
```bash
feat: add SM-2 scheduling to flashcard review

fix: correct streak day-boundary calculation for IST timezone

content: rewrite lesson-007 mental-model section for clarity

chore: update Supabase client to 2.110.x

refactor: extract XP validation logic from API route to lib/xp.ts

test: add unit tests for streak freeze application logic
```

**Never:** `"wip"`, `"stuff"`, `"fix bug"`, `"update things"` — commit messages must be readable by future-you or an AI assistant with no memory of the session.

---

## 3. PR Workflow

1. Create branch from `main`: `git checkout -b feature/xp-system main`
2. Build the feature with small, focused commits
3. Push and create a PR against `main`
4. **Vercel preview deployment** is automatic — use it to verify the feature visually before merge
5. CI must pass: lint → type-check → content validation → build
6. Self-review the diff before merging — treat the PR as a document for future-you
7. Squash-merge or rebase-merge into `main` (no merge commits)
8. Delete the feature branch

### PR description template
```markdown
## What changed
[1-2 sentence summary of what this PR does]

## Why
[What was broken or needed / why this approach was chosen]

## How to test
[Steps to manually verify the change]

## Checklist
- [ ] CI passing (lint, types, content validation, build)
- [ ] Tested on Vercel preview deployment
- [ ] Accessible (keyboard nav, aria labels if UI change)
- [ ] Responsive (mobile viewport checked if UI change)
- [ ] No new secrets committed
- [ ] Architecture.md updated if new service/dependency added
```

---

## 4. CI Pipeline (GitHub Actions)

Current pipeline: `.github/workflows/ci.yml`

```yaml
# Current pipeline runs on push/PR to main:
# 1. Install dependencies (npm ci)
# 2. npm run content:build (parse + validate + search index)
# 3. npm run lint (ESLint)
# 4. npm run build (next build — includes content:build via package.json)
```

### CI must-pass rules
- Content validation failing = build fails. Broken content never reaches production.
- ESLint errors = build fails. No exceptions.
- TypeScript errors = build fails (Next.js build catches these).

### Recommended CI additions (when ready)
```yaml
# Add after lint step:
- name: Type check (strict)
  run: npx tsc --noEmit

# Add after type check:
- name: Unit tests
  run: npm test

# Add for accessibility auditing (Phase 4):
- name: Accessibility check
  run: npx @axe-core/cli http://localhost:3000/lessons/lesson-001
```

---

## 5. Vercel Deployment

**Configuration:**
- Hosting: Vercel Hobby plan
- Auto-deploy: on merge to `main`
- Preview deployments: on every PR (free, zero config)
- Build command: `npm run build` (set in Vercel dashboard or `vercel.json`)
- Install command: `npm ci`
- Root directory: `apps/web`

**Never** deploy manually by running `vercel --prod` — all deployments go through the GitHub → Vercel integration.

### Vercel environment variables
Set in Vercel dashboard under Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL` — all environments
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — all environments
- `SUPABASE_SERVICE_ROLE_KEY` — production + preview only (not development)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` — production only
- `RESEND_API_KEY` — production + preview only

---

## 6. Environment Variable Management

### Local development
```bash
# apps/web/.env.local (NOT committed — in .gitignore)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJ...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJ...   # NEVER expose to browser
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
RESEND_API_KEY=re_xxxxxxxx                   # NEVER expose to browser
```

### Documented template (committed)
```bash
# apps/web/.env.example (committed — safe to share)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # Server-only. NEVER expose to browser.
NEXT_PUBLIC_GA_MEASUREMENT_ID=
RESEND_API_KEY=              # Server-only. NEVER expose to browser.
```

### Rules
- `.env.local` is in `.gitignore` — NEVER commit it
- `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` start with NO `NEXT_PUBLIC_` prefix — they are server-only
- If you accidentally commit a secret: rotate it IMMEDIATELY in Supabase/Resend dashboards, then remove from git history

---

## 7. Supabase Migrations in CI

Database migrations are NOT run by CI automatically — they're applied manually via the Supabase dashboard or CLI:

```bash
# Apply a migration manually (when needed)
# supabase db push  (if using Supabase CLI — not currently set up)
# OR: copy SQL from migrations/ and run in Supabase SQL editor
```

Migration files are version-controlled in `apps/web/supabase/migrations/` as documentation and audit trail, even if applied manually.

---

## 8. Release Readiness Checklist

Before any "release" (new phase launch, feature launch, or public launch):

### Phase 0 → 1 Gate
- [ ] Content pipeline runs without errors (all 90 lessons parse + validate)
- [ ] One real lesson renders correctly in the browser from JSON (not from Supabase)
- [ ] Deployment pipeline fully automated: push → GitHub Actions → Vercel
- [ ] Waitlist page live and capturing signups
- [ ] Google Analytics tracking page views

### Phase 1 → 2 Gate
- [ ] Core loop works end-to-end: signup → onboarding → lesson → quiz → next lesson unlocks
- [ ] 10-20 real users have completed the loop
- [ ] No P0 bugs in reading → quiz → unlock
- [ ] Scroll-depth + dwell-time XP verification working

### Phase 4 → 5 (Public Launch) Gate
- [ ] Lighthouse ≥ 90 on lesson pages
- [ ] WCAG AA verified (automated + manual screen reader)
- [ ] All 3-5 public sample lesson pages live with SSR + structured data
- [ ] sitemap.xml submitted to Google Search Console
- [ ] Closed beta data collected: Day-1 activation, Day-7 retention, quiz completion
- [ ] Email flows verified: verification, password reset, waitlist confirmation, welcome, weekly recap
- [ ] Portfolio export works for logged-out viewers
- [ ] No P0/P1 bugs open
- [ ] Security: RLS verified on all user-owned tables

---

## 9. Hotfix Procedure

If a critical bug reaches production:

```bash
# 1. Create hotfix branch from main
git checkout -b fix/critical-xp-bug main

# 2. Make the minimal fix (don't add features in a hotfix)
# 3. Test locally (npm run dev)
# 4. Push and create PR
# 5. CI must pass
# 6. Merge immediately — Vercel auto-deploys
# 7. Verify fix on production within minutes of deploy
```

For database-level hotfixes (e.g., RLS policy bug):
- Fix in Supabase SQL editor immediately (for urgency)
- Then write a migration file to document the change
- Commit the migration file to the repo

---

## 10. What Never to Do

1. Direct push to `main` (bypasses CI and review)
2. `vercel --prod` manual deploy (bypasses GitHub Actions pipeline)
3. Committing `.env.local` or any file containing API keys
4. Merging a PR with failing CI
5. Running `npm run build` in production to bypass the content pipeline
6. Hand-editing files in `public/content/` and committing without running `npm run content:build`
7. Keeping feature branches alive for more than a week without merging
