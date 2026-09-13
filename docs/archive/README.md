# Archive — historical records

Documents here are **retained for traceability, not for guidance.** They describe the
state of the system at the time they were written. Several of their findings have since
been fixed, superseded, or corrected.

**Do not use these to decide current behaviour.** For that, read
[`../INDEX.md`](../INDEX.md) and the documents it points at.

Nothing here is deleted, because security and incident evidence should remain auditable
after the implementation is complete.

## Point-in-time audits

| Document | What it recorded | Status now |
|---|---|---|
| `ARCHITECTURE_AUDIT_STAGE1.md` | Stage 1 read-only architecture audit | Findings tracked in the roadmap; several fixed |
| `SECURITY_AUDIT_STAGE2.md` | Stage 2 security audit | Most findings closed by B1–B6 |
| `FRONTEND_MOBILE_READINESS_AUDIT.md` | Stage 3 frontend/mobile audit | Partly superseded — see correction below |
| `RELIABILITY_OPERATIONS_AUDIT.md` | Stage 4 reliability/operations audit | Largely closed by B4–B6 |

## Incident investigations

| Document | Incident |
|---|---|
| `INCIDENT_2026-09-06_SIGNUP_ABUSE.md` | First signup-abuse incident |
| `INCIDENT_2026-09-08_SIGNUP_EMAIL_ABUSE.md` | Recurrence and provider-failover failure |

Retained deliberately: these are the evidence trail for the abuse controls in B5 and the
email governance in B4.

## Completed batch records

| Document | Batch |
|---|---|
| `B14A_MIGRATION_DEPLOYMENT_VERIFICATION.md` | B14-A — migration deploy guard |
| `B8A_LEADERBOARD_XP_COLUMN.md` | B8-A — leaderboard XP column fix |
| `B8D_XP_DUPLICATES_REPORT.txt` | B8-D — production duplicate diagnostic output |
| `B8E_XP_UNIQUENESS.md` | B8-E — **superseded**; see the active `../PENDING_B8E_MIGRATION.md` |
| `PHASE1_IMPLEMENTATION_TODO.md` | Phase 1 planning and closeout |

## Superseded planning

| Document | Superseded by |
|---|---|
| `PRODUCTION_BLUEPRINT.md` | `../FINAL_IMPLEMENTATION_PLAN.md` for anything actionable |
| `MARKETING_EMAIL_HISTORY.md` | Campaign record; no longer part of active engineering docs |

---

## Corrections found after these were written

Recorded here so a reader does not act on a finding that has since proven wrong.

1. **`components/ui/MarkdownRenderer.tsx` is NOT dead code.** Stage 3 and the roadmap
   both described it as unreachable with `ReflectionForm` as its only importer. It is in
   fact imported by `blocks/default/DefaultMarkdown.tsx` and `blocks/section/SectionBlock.tsx`
   — core lesson rendering. It renders `marked` output through `dangerouslySetInnerHTML`.
   Its input is repo-authored lesson content compiled from `content/`, not user input, so
   it is not a live XSS today, but it **must not be deleted** and its sanitisation posture
   should be reviewed if it is ever pointed at user-supplied markdown.
2. **`components/quiz/QuizOption.tsx` is NOT dead code.** Imported and rendered by
   `blocks/quiz/QuizBlock.tsx`.
3. **`lib/hooks/useUsageTimeTracker.ts` is NOT a stale divergent copy.** It is a one-line
   re-export of the canonical `hooks/useUsageTimeTracker.ts`, and a test asserts both
   paths resolve to the same function.

The five genuinely-unreferenced components from that list were removed in the 2026-09-13
cleanup.
