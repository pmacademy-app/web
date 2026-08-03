# PM Academy — Current Status

> **Live Status & Active Focus.** This document represents the current, real-time status of the repository. It is updated at the end of every implementation session to serve as the source of truth for current focus, active bugs, and immediate tasks.
> **Documentation entry point:** See [`docs/INDEX.md`](./INDEX.md) for the full doc map.

---

## 1. Repository Metadata

- **Current Branch:** `main`
- **Current Version:** `0.1.0` (defined in [`apps/web/package.json`](../apps/web/package.json))
- **Last Successful Build:** 2026-08-03 (Next.js 16 App Router production build - clean, 0 errors, 29 routes, 90 lessons compiled)
- **Current Implementation Phase:** Phase 1.6: Foundation Finalization & Production Polish — **COMPLETE** (Polish tag applied)

---

## 2. Project Stage & Milestones

For phase definitions, see [`docs/Phases.md`](./Phases.md) and [`docs/memory/roadmap.md`](./memory/roadmap.md).

- **Phase 1.1 Content Pipeline Foundation:** ✅ Complete
- **Phase 1.2 Renderer Foundation:** ✅ Complete
- **Phase 1.3 Migration & Integration Foundation:** ✅ Complete
- **Phase 1.4 Legacy Cleanup & Finalization:** ✅ Complete
- **Phase 1.5 Sprint 1 Runtime & Navigation:** ✅ Complete
- **Phase 1.5 Sprint 2 Learning Flow (Flashcard SRS + Lesson Nav):** ✅ Complete
- **Phase 1.5 Sprint 3 Content & Curriculum Experience:** ✅ Complete
- **Phase 1.5 Sprint 4 Curriculum Integrity & Content Consistency:** ✅ Complete
- **Phase 1.5 Sprint 5 Production Readiness & 90-Lesson Audit:** ✅ Complete
- **Phase 1.5 Sprint 6 Performance & Infrastructure Optimization:** ✅ Complete
- **Phase 1.5 Sprint 7 Release Candidate Blockers:** ✅ Complete
- **Phase 1.6 Foundation Finalization & Production Polish:** ✅ Complete
- **Current Focus:** **Phase 2** - ready to begin.

---

## 3. What's Next

Phase 1.5 is complete. The application is production-ready. The next focus is **Phase 2**:

1. **[Phase 2] Gamification Layer:** XP leaderboard persistence, streak recovery mechanics, skill-radar visualisation.
2. **[Phase 2] Social / Portfolio:** Public profile pages (`/p/[username]`) with earned badges and completed modules.
3. **[Phase 2] Capstone Projects:** End-of-module capstone submission and peer review flows.
4. **[Phase 2] Email Notifications:** Resend-powered streak reminders, weekly digests, flashcard review nudges.

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
