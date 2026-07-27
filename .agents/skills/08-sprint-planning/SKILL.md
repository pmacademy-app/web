---
name: pm-academy-sprint-planning
description: >
  PM Academy sprint planning, feature scoping, and product decision skill. Covers
  the current phase context, Definition of Done, feature prioritization framework,
  and the 3-question decision filter. Triggers on: sprint planning, feature requests,
  scope decisions, phase transition questions, "should we build X", or product/roadmap
  discussions.
---

# PM Academy — Sprint Planning & Product Decisions

Load `00-pm-academy-core` alongside this skill.

---

## 1. The 3-Question Feature Filter

**Before any feature enters the roadmap:**

1. **Does it violate a Product Principle from PRD.md §1?**
   - Depth over gimmick (gamification serves real learning)
   - Free means free — no dark patterns
   - Respect the learner's time
   - Portfolio, not just certificate

2. **Does it require a paid service, breaking the ₹0 infra rule?**
   - Check Architecture.md §1 for the stack's free-tier limits
   - If paid, it doesn't go in until Phase 7+ monetization makes it viable

3. **Can a solo founder maintain it without a team?**
   - Simple enough for one person to understand, debug, and extend
   - Follows "boring technology" principle

**If the answer to #1 is "yes violation," or #2 is "yes paid," reject or redesign before adding to Phases.md.**

---

## 2. Current Phase Reference

### Phase 0 — Foundation ✅ (check Phases.md for actual status)
**Scope:** Content pipeline, design system, repo scaffolding, auth, waitlist, Google Analytics, Resend SMTP, CI/CD.
**Definition of Done:**
- [ ] Developer can clone repo, build, and see one real lesson from static JSON
- [ ] Deployment pipeline automated: GitHub → GitHub Actions → Vercel
- [ ] Waitlist page live, capturing signups
- [ ] Google Analytics tracking page views
- [ ] Resend SMTP sending verification + waitlist confirmation

### Phase 1 — Core Learning Loop MVP
**Scope:** Lesson reading view, quiz flow, basic progress tracking, auth + onboarding, client-side search.
**Out of scope:** XP, streaks, skill radar, badges, leaderboard, flashcard SRS, capstones.
**Definition of Done:**
- [ ] 10-20 real career-switcher users complete: signup → onboarding → Lesson 1 → quiz → Lesson 2 unlocks
- [ ] No P0/P1 bugs in the core loop
- [ ] Real user feedback collected before Phase 2 begins

### Phase 2 — Gamification Layer
**Scope:** XP + levels, streaks + freezes, skill radar + dashboard, flashcard SRS review hub.
**Out of scope:** Capstones, badges, leaderboard.
**Definition of Done:**
- [ ] Returning user sees accurate XP, level/title, streak, skill radar (updates immediately after lesson/quiz)
- [ ] Flashcard review schedules next-review per SM-2
- [ ] Test cohort reports gamification as motivating, not gimmicky

### Phase 3 — Depth + Retention
**Scope:** Capstone submissions, badges (~16), opt-in leaderboard, email re-engagement, portfolio/certificate export.
**Out of scope:** Expert/paid capstone review (that's §10 monetization).
**Definition of Done:**
- [ ] User can submit capstone → appears on public portfolio page → renders for logged-out viewer
- [ ] Weekly recap emails fire with accurate skill-radar movement data
- [ ] At least one badge-earning event verified end-to-end

### Phase 4 — Polish, SEO, Beta Hardening
**Scope:** SEO pass (SSR, structured data, lesson pages), WCAG AA accessibility pass, closed beta (100-200 users), funnel analysis.
**Out of scope:** New features (this is hardening only).
**Definition of Done:**
- [ ] Lighthouse ≥ 90 on lesson pages
- [ ] WCAG AA basics verified (automated + screen reader)
- [ ] Day-1 activation + Day-7 retention data collected
- [ ] Major funnel drop-offs addressed

### Phase 5 — Public Launch
**Scope:** Launch execution: Product Hunt, Reddit, LinkedIn, SEO (compounding), partnerships.
**Key metrics to watch (in this order):**
1. Day-1 lesson completion rate
2. Day-7 retention
3. Quiz completion rate (not raw signups)

---

## 3. Sprint Task Format

When creating sprint tasks, use this format:

```markdown
## Sprint [N] — [Sprint Name]

**Phase:** [0/1/2/3/4/5]
**Duration:** [X days/weeks]
**Goal:** [One sentence — what this sprint delivers]

### Must Ship (blocks next sprint)
- [ ] Task 1 — [description] — [estimated effort: S/M/L]
- [ ] Task 2 — ...

### Should Ship (high value, not blocking)
- [ ] Task 3 — ...

### Nice to Have (do only if time)
- [ ] Task 4 — ...

### Explicitly Out of Scope
- [Feature] — deferred to Phase [N] / [reason]

### Definition of Done for this Sprint
- [ ] [Specific, verifiable condition]
- [ ] [Specific, verifiable condition]
```

---

## 4. What Blocks What

```
Phase 0: Content pipeline → Phase 1 (can't build lesson view without JSON)
Phase 0: Auth → Phase 1 (can't track progress without users)
Phase 0: Waitlist page → can go live independently (DO THIS FIRST)
Phase 1 user testing → Phase 2 (gamification built on top of validated learning loop)
Phase 2: Skill radar → Phase 3 (portfolio export needs radar data)
Phase 2: XP system → Phase 3 (badges and leaderboard depend on XP events)
Phase 3: Portfolio export → Phase 5 (LinkedIn sharing lever)
Phase 4: SEO pass → Phase 5 (lesson pages must be indexable before launch)
```

---

## 5. Recurring Open Decisions (check before planning)

Before each sprint, check `docs/PRD.md §11`:

| Decision | Blocks | Action |
|----------|--------|--------|
| AI Mentor (in scope?) | Marketing site copy, hero design | Must resolve before Phase 5. Recommendation: cut from launch copy. |
| Skill radar scoring formula | Phase 2 skill radar build | Decide in Phase 2 planning, document in PRD.md §4.8 |
| XP thresholds per level | Phase 2 | Tune in closed beta (Phase 4) using real data |

---

## 6. Scope Creep Watchlist

Common features that will be requested and must be evaluated carefully:

| Feature | Verdict | Reason |
|---------|---------|--------|
| AI Mentor / chatbot | ❌ Not in scope (open decision) | No free tier for LLM API at real volume; contradicts §6 non-goal |
| Native mobile app | ❌ Permanently excluded (v1) | Responsive web only; app stores add cost + maintenance |
| Global leaderboard | ❌ Permanently excluded | Demotivates ~95% of users; contradicts PRD.md §4.10 |
| Paid lesson access | ❌ Permanently excluded | Breaks core free-forever promise |
| Purchasing streak freezes | ❌ Permanently excluded | Dark pattern; anti-pattern stance in PRD.md §4.7 |
| Community forums/comments | ❌ Not in v1 | Post-launch consideration only |
| Video content | ❌ Not in v1 | Post-launch; consider bandwidth cost |
| Expert capstone review | 🟡 Deferred to Phase 7 | Monetization feature; only after free core proven |
| Blog section | 🟡 Post-launch | SEO expansion after core 90 lesson pages indexed |
| Multi-language content | 🟡 Post-launch | i18n-ready infra only at launch |

---

## 7. Change Management Protocol

When any documentation needs updating:
1. Identify which of the 5 docs owns the decision
2. Edit that document directly
3. Check for ripple effects across other docs
4. Append to that doc's Changelog section
5. Never let two docs contradict each other

**Example ripple effects:**
- Changing module count (9 → anything) → updates PRD.md §3, Architecture.md §2+§4, Phases.md milestone checklist
- Adding a new stack service → updates Architecture.md §1 table with free-tier ceiling
- Resolving AI Mentor open decision → updates PRD.md §11, PRD.md §6, Design.md §6, all marketing copy docs

---

## 8. Prompt Templates for Common Planning Tasks

### "Should we build X?"
```
Is X in PRD.md's feature list (§4)?
  No → Is it in the Non-Goals (§6)? If yes → reject.
  No + not in non-goals → Run the 3-question filter (§6 in Rules.md)
  Yes → Check which phase it belongs to. Is that phase's Definition of Done met?
```

### "What should I work on next?"
```
1. Check Phases.md: what phase are we in?
2. Check phase's Definition of Done: what's not yet checked off?
3. Prioritize: Must Ship → Should Ship → Nice to Have
4. Check the open decisions log: does any unresolved decision block this work?
```

### "Is this feature scope creep?"
```
1. Is it in PRD.md §4 (features) or §6 (non-goals)?
2. Does it pass the 3-question filter?
3. Does it belong to a future phase?
4. If phase-future: log it in the appropriate phase in Phases.md, don't build it now.
```
