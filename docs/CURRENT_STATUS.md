# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `0.2.0` (defined in [`apps/web/package.json`](../apps/web/package.json))
- **Last Successful Build:** 2026-08-05 (Next.js 16 App Router production build - clean, 0 errors, 35 routes, 90 lessons compiled)
- **Current Implementation Phase:** Phase 3: Social & Portfolio Infrastructure — **Sprint 5 (Friends & Cohort Leaderboard System) COMPLETE**

---

## 2. Project Stage & Milestones

For phase definitions, see [`docs/Phases.md`](./Phases.md) and [`docs/memory/roadmap.md`](./memory/roadmap.md).

- **Phase 1 Foundation & Learning Loop:** ✅ Complete
- **Phase 2 Gamification & Retention Layer:** ✅ Complete (`v0.2.0-stable`)
- **Phase 3 – Sprint 1 (Capstone Workspace):** ✅ Complete
- **Phase 3 – Sprint 2 (Public Portfolio `/p/[username]`):** ✅ Complete
- **Phase 3 – Sprint 3 (Certificates & PDF Export `/verify/[certificateId]`):** ✅ Complete
- **Phase 3 – Sprint 4 (Badge & Achievement System `/badges`):** ✅ Complete
- **Phase 3 – Sprint 5 (Friends & Cohort Leaderboard `/leaderboard`):** ✅ Complete
- **Current Focus:** **Phase 3 – Sprint 6** (Peer Review & Feedback Engine).

---

## 3. What's Next

Phase 3 Sprint 5 (Friends & Cohort Leaderboard System) is complete. The next focus is **Phase 3 Sprint 6**:

1. **[Phase 3 - Sprint 6] Peer Review & Feedback Engine:** Structured evaluation criteria and peer feedback loops for capstone submissions.
2. **[Phase 3 - Sprint 7] Email Automation & Weekly Summary Digests:** Resend SMTP transactional notification emails and weekly progress digests.

---

## 4. Active Issues, Blockers & Bugs

None. All Release Candidate blockers resolved.

### Resolved This Session (Phase 1.5 - Sprint 7: Release Candidate Blockers)

- 🔒 **Server-Side Quiz Verification:** Moved quiz correctness checking and score computation entirely to the server in `recordQuizAttemptAction` by comparing client submissions against compiled lesson JSON. The client-provided `is_correct` field is discarded.
- 🔒 **XP Auditing & Idempotency:** Implemented ledger lookup checks on `xp_events` for `theory_read`, `quiz_bonus`, and `reflection` events to ensure they can be awarded at most once per lesson. Incremental quiz score XP is calculated relative to total previously awarded `quiz_correct` XP.
- 🔒 **Daily Flashcard XP Deduplication:** Added timezone-aware calendar day checking on `xp_events` for flashcard reviews to prevent XP farming (maximum 2 XP per card per user local day).
- ⚙️ **Next.js 16 Middleware & Route Guarding:** Verified the Next.js 16 standard `proxy.ts` middleware file. Updated it to include `/academy` and `/academy/**` under protected app routes so that unauthenticated users are correctly redirected to `/login` and edge token refresh logic is run.
- 🚫 **Disabled Google OAuth Placeholder:** Cleanly marked Google login/signup options as "Coming Soon" and disabled interactive pathways on auth pages until the Supabase OAuth provider is fully configured.

### Previously Resolved (Phase 1.5 - Sprint 6: Performance & Infrastructure)

- ⚡ **O(N) Glossary Validation:** Replaced nested-loop cross-lesson duplicate-term check with a Set-based single-pass accumulator in `validation.ts`. `content:validate` time reduced from ~15 s to **< 5 s**.
- ⚡ **`crossLessonsOnly` Flag in Compiler:** Added flag to skip per-lesson Zod validation on cross-lesson-only passes, enabling faster incremental rebuilds.
- ⚡ **Scroll/Timer Refs in `lesson-content.tsx`:** Converted `scrollProgress` and `elapsedSeconds` from `useState` to `useRef`, eliminating re-renders on every scroll event and timer tick.
- ⚡ **`React.memo()` on Block Renderers:** Wrapped `BlockTreeRenderer` and `BlockRenderer` in `React.memo()` to prevent unnecessary re-renders when parent state changes.
- ⚡ **`sessionStorage` Search Index Cache:** Added a `sessionStorage` tier to `fetchSearchIndex()` so the 200 KB search index is fetched at most once per browser session.
- ⚡ **Absolute `turbopack.root` in `next.config.ts`:** Used `path.resolve(__dirname, '../../')` to silence both the "inferred workspace root" and "should be absolute" Turbopack warnings.
- ⚡ **Simplified `package.json` Scripts:** Removed redundant `cd ../.. && npm install && cd apps/web &&` prefix from scripts, saving 3-5 s per invocation.

### Previously Resolved (Phase 1.5 – Sprint 5)
- ? Lesson ID Registry Pollution Fixed (?? P0)
- ? Normalized Lesson Local ordering (?? P0)
- ? Flashcards Restored for Lessons 61-90 (?? P0)
- ? 9-Module Curriculum Structure Restored
- ? Interview Perspective Extraction Fixed
- ? Real World Perspective Formatting Restructured
- ? Skipped Cross-Lesson Validations Resolved (0 warnings)

---

## 5. Definition of Done for Phase 1.5 (All Complete ?)

- [x] End-to-end learning flow functional: lesson unlock, theory read, quiz, flashcard SRS, reflection, XP award.
- [x] Curriculum: exactly 9 modules × 10 lessons = 90 lessons, correct ordering and IDs.
- [x] All block types render correctly: tables, callouts, frameworks, interview/real-world perspectives, glossaries, flashcards, quizzes, reflections.
- [x] Content pipeline: `content:validate` passes with 0 errors, 0 warnings across all 90 lessons.
- [x] Compiler tests: 7/7 pass.
- [x] Production build: 0 TypeScript errors, 0 ESLint errors, 23 routes compiled, all 90 lessons emitted.
- [x] Performance: compiler, renderer, and search optimized; redundant work eliminated.
- [x] Infrastructure: clean scripts, no spurious warnings in `next dev` / `next build`.
