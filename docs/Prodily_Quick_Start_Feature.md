# Prodily Quick Start Feature — Implementation & UI/UX Specification v2

## Document Status

Updated specification for the existing Quick Start implementation and its next UI/UX enhancement pass.

**Implementation order:**

> Asset Audit → Spotlight Enhancement → Feature Preview Integration → Final Polish & Validation

The existing Quick Start functionality is already implemented and must be preserved.

---

# 1. Purpose

Quick Start is a first-time product tour shown after a new learner completes the existing onboarding flow and reaches the authenticated Dashboard.

The experience should answer:

> **“What can I do on Prodily, where do I find it, and what should I do next?”**

It is a product tour, not a replacement for onboarding.

---

# 2. Existing User Journey

```text
Signup
  ↓
Email Verification
  ↓
Login
  ↓
Existing Onboarding
  ↓
Dashboard
  ↓
Quick Start automatically opens
  ↓
User completes or skips the tour
  ↓
Normal Prodily usage
```

Automatic launch requires:

```text
authenticated
AND
onboarding_complete === true
AND
quick_start_completed !== true
```

Completion/skip is persisted using Supabase Auth `user_metadata.quick_start_completed`.

Supabase remains the single source of truth.

Do not introduce localStorage persistence.

---

# 3. Existing Quick Start Implementation

The current implementation already provides:

- 8-step tour.
- Automatic first-time launch.
- Next / Back navigation.
- Skip Tour.
- Final Start Learning CTA.
- Supabase persistence.
- Manual reopening.
- Profile dropdown entry.
- Settings entry.
- Keyboard handling.
- Responsive behavior.
- Analytics.
- Quick Start tests.
- Production build compatibility.

The UI/UX work in this document must **not rebuild or unnecessarily change this functionality**.

---

# 4. Tour Steps

The current tour is aligned to the actual Prodily application.

| Step | Title | Target | Purpose |
|---|---|---|---|
| 1 | Welcome to Prodily 👋 | Modal | Introduce the platform |
| 2 | 📚 Curriculum | `/academy` | Explain structured PM learning |
| 3 | 🏆 Leaderboard & Cohorts | `/leaderboard` | Explain ranking, XP and cohorts |
| 4 | 🎯 Capstones & Portfolio | `/capstones` | Explain applied work and portfolio |
| 5 | 🏅 Badges & Achievements | `/badges` | Explain milestones and badges |
| 6 | 📊 Progress & Review Hub | `/review` / `/progress` | Explain review and skill progress |
| 7 | 👤 Profile & Settings | `/settings` / profile | Explain account and preferences |
| 8 | 🚀 You're Ready! | CTA | Send user into the learning experience |

Descriptions should remain concise.

The visual preview should do part of the explaining instead of adding more text.

---

# 5. UI/UX Direction

The Quick Start should feel like:

> **“Welcome to Prodily — let me show you around.”**

Not:

> “Here is a large modal containing a lot of text.”

The experience should combine:

```text
Short explanation
      +
Actual feature preview
      +
Clear spotlight
      +
Directional arrow
```

---

# 6. Screenshot / Feature Preview Asset Audit

## This must happen BEFORE UI implementation

Before modifying the Quick Start modal, inspect the current repository and actual application.

Inspect at minimum:

- `apps/web/public/`
- Existing PNG files.
- Existing JPG/JPEG files.
- Existing WebP files.
- Existing SVG assets.
- Existing dashboard visuals.
- Existing curriculum visuals.
- Existing leaderboard visuals.
- Existing capstone/portfolio visuals.
- Existing badges visuals.
- Existing progress/review visuals.
- Existing settings/profile visuals.
- Existing Quick Start assets, if any.
- Existing documentation/demo screenshots.

Also inspect the actual current feature pages/components.

## Asset decision hierarchy

### Option A — Suitable screenshots already exist

Reuse them.

Do not create duplicates.

### Option B — Feature UI exists but no suitable screenshot exists

Determine whether a clean static preview can be created from the existing UI using the repository's existing conventions.

Avoid introducing a new screenshot-generation system just for Quick Start.

### Option C — No suitable preview exists

Create only the required preview asset.

The new preview must:

- Match the actual current Prodily UI.
- Use current branding.
- Use the repository's existing image conventions.
- Be optimized for web use.
- Be lightweight.
- Not contain fake/future functionality.
- Not use generic stock imagery.

## Required asset audit report

Before adding assets, provide:

```text
Existing assets found:
- ...

Reusable for:
- Step X
- Step Y

Missing previews:
- Step Z

New assets required:
- ...

Reason:
- ...
```

Do not create assets that are unnecessary.

---

# 7. Feature Preview Mapping

The intended mapping is:

| Step | Feature Preview |
|---|---|
| Welcome | Dashboard overview |
| Curriculum | Actual Curriculum page |
| Leaderboard & Cohorts | Actual Leaderboard page |
| Capstones & Portfolio | Actual Capstone/Portfolio experience |
| Badges & Achievements | Actual Badges page |
| Progress & Review Hub | Actual Progress/Review experience |
| Profile & Settings | Actual Settings/Profile experience |
| You're Ready | Curriculum or Dashboard |

The exact asset must be chosen after inspecting the current application.

---

# 8. Preview Design

Inside a feature step, the modal should follow:

```text
Brand / Feature badge
        ↓
Progress
        ↓
Feature title
        ↓
Short description
        ↓
Feature preview
        ↓
Navigation
```

The preview should:

- Have consistent dimensions across steps.
- Use consistent aspect ratio.
- Match Prodily border radius.
- Use existing design tokens.
- Have a subtle border.
- Avoid excessive shadows.
- Be readable without requiring interaction.
- Remain responsive.
- Not make the modal unnecessarily huge.

The preview is a **visual explanation**, not an interactive duplicate of the page.

---

# 9. Spotlight Redesign

## Current behavior

The current implementation dims/blurs the background and places a box over the selected sidebar item.

This should be changed.

## Desired behavior

Use a real spotlight cutout.

### Desktop

```text
Rest of page
     ↓
Dimmed

Target feature
     ↓
Completely clear

Quick Start modal
     ↓
Directional arrow
     ↓
Target feature
```

The target must remain part of the original page and must not be covered by a duplicate opaque box.

### Target styling

The target may receive:

- Subtle border.
- Subtle glow.
- Small emphasis ring.

But the underlying UI must remain visible.

---

# 10. Directional Arrow

Add a small polished directional arrow from the Quick Start modal toward the highlighted feature.

The arrow should:

- Be visually subtle.
- Clearly indicate the target.
- Use the actual target element's DOM position.
- Dynamically calculate its position.
- Respond to viewport changes.
- Avoid hardcoded feature-specific coordinates.
- Never leave the viewport.
- Hide itself if safe positioning is impossible.

Do not use manually calculated coordinates such as:

```text
Curriculum = top: 180px
Leaderboard = top: 350px
```

Instead use the target element's actual bounding rectangle.

---

# 11. Spotlight Targets

Desktop spotlight targets:

- Curriculum
- Leaderboard
- Capstones
- Badges
- Review Hub
- Progress
- Settings

No spotlight is required for:

- Welcome.
- Final step.

Use the actual selectors/target references already defined by the Quick Start implementation.

---

# 12. Mobile Behavior

Do not force the desktop spotlight system onto mobile.

On mobile or when the sidebar is collapsed:

```text
Centered Quick Start modal
        +
Feature preview
```

Prioritize:

- Readability.
- Touch usability.
- Correct viewport positioning.
- No horizontal scrolling.
- No off-screen arrows.
- No inaccessible sidebar elements.

The feature preview becomes especially important on mobile because the user may not see the sidebar target.

---

# 13. Modal Layout

The current modal should be enhanced rather than replaced.

Target structure:

```text
┌──────────────────────────────────┐
│ Prodily       Feature   Step X/8 │
│──────────────────────────────────│
│                                  │
│  Feature title                   │
│  Short description               │
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │      Feature Preview       │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│  Skip Tour   Back        Next →  │
└──────────────────────────────────┘
```

Do not make the modal so large that it feels like a full page.

---

# 14. Implementation Phases

## Phase 1 — Screenshot / Asset Audit

Before modifying UI:

1. Inspect existing assets.
2. Inspect actual feature pages.
3. Identify reusable screenshots.
4. Map screenshots to Quick Start steps.
5. Identify missing screenshots.
6. Add only necessary missing assets.
7. Verify image sizes and loading.
8. Report the asset mapping.

**No Quick Start behavior should change during this phase.**

---

## Phase 2 — Spotlight Enhancement

After the asset audit:

1. Replace the current highlighted box with a true overlay cutout.
2. Keep the actual target element completely clear.
3. Add subtle target emphasis.
4. Add dynamic directional arrow.
5. Handle viewport resizing.
6. Handle mobile fallback.
7. Verify existing Quick Start behavior remains unchanged.

---

## Phase 3 — Feature Preview Integration

After the spotlight is working:

1. Add the preview area below the description.
2. Connect each step to its approved preview asset.
3. Keep descriptions concise.
4. Keep preview dimensions consistent.
5. Ensure desktop modal proportions remain balanced.
6. Ensure mobile previews fit correctly.
7. Optimize image loading.

---

## Phase 4 — Final Polish & Validation

After Phases 1–3:

1. Review typography.
2. Review spacing.
3. Review modal size.
4. Review preview quality.
5. Review spotlight cutouts.
6. Review arrow positioning.
7. Review transitions.
8. Review desktop.
9. Review tablet.
10. Review mobile.
11. Review keyboard navigation.
12. Review accessibility.
13. Run targeted Quick Start tests.
14. Run relevant regression tests.
15. Run production build.
16. Deploy to Vercel Preview.
17. Perform complete browser verification.
18. Inspect final git diff.

Only then consider the branch ready for merge.

---

# 15. Preservation Rules

Do not change these unless a real defect is discovered:

- Authentication flow.
- Email verification.
- Existing onboarding.
- `onboarding_complete`.
- `quick_start_completed`.
- Supabase persistence.
- Automatic launch.
- Skip behavior.
- Finish behavior.
- Manual reopen.
- Existing 8-step business logic.
- Analytics.
- Authenticated app boundaries.

Do not introduce:

- localStorage persistence.
- New database migrations.
- Third-party product-tour libraries.
- New analytics infrastructure.
- New onboarding architecture.
- Unrelated Dashboard changes.

---

# 16. Testing

After the UI enhancement:

### Automated

Run:

```text
npm run test:quick-start
npm run test:settings
npm run test:srs
npm run build
```

Also run lint/type checks where available.

### Browser — Vercel Preview

Test:

#### New user

```text
Signup
→ Email verification
→ Login
→ Onboarding
→ Dashboard
→ Quick Start opens
```

#### Tour

- Step 1.
- Next.
- Back.
- Skip.
- Finish.
- All 8 steps.
- Spotlight targets.
- Arrow positioning.
- Preview images.

#### Persistence

```text
Complete/Skip
→ Refresh
→ Tour does not reopen

Logout
→ Login
→ Tour does not reopen
```

#### Manual reopen

- Profile dropdown.
- Settings.
- Opens at Step 1.
- Does not reset completion state.

#### Responsive

- Desktop.
- Tablet.
- Mobile.

#### Accessibility

- Keyboard navigation.
- Escape.
- Focus management.
- Dialog semantics.
- Screen-reader labels.
- Reduced motion.

---

# 17. Definition of Done

- [ ] Existing Quick Start functionality remains intact.
- [ ] Existing Quick Start tests pass.
- [ ] Regression tests pass.
- [ ] Production build passes.
- [ ] Repository assets were audited before creating new screenshots.
- [ ] Existing suitable screenshots are reused.
- [ ] Missing previews are added only where necessary.
- [ ] Preview assets match the current Prodily UI.
- [ ] Feature previews appear in relevant steps.
- [ ] Desktop spotlight uses a real cutout/exclusion.
- [ ] Target remains completely clear.
- [ ] Target is not covered by a duplicate box.
- [ ] Directional arrow points dynamically to the actual target.
- [ ] Arrow has no hardcoded feature-specific coordinates.
- [ ] Arrow remains within viewport.
- [ ] Mobile uses a safe centered modal/preview experience.
- [ ] No horizontal overflow.
- [ ] Modal remains visually balanced.
- [ ] Accessibility remains functional.
- [ ] Vercel Preview browser verification passes.
- [ ] No unrelated files or functionality are changed.
- [ ] Final git diff is reviewed.
- [ ] Branch is ready for merge only after all checks pass.

---

# 18. Implementation Principle

**Do not rebuild what already works.**

The existing Quick Start is functionally working.

This phase should make it:

> **More visual → clearer → more polished → more native to Prodily**

The required order is:

> **Asset Audit → Spotlight → Feature Previews → Polish & Validation**

No implementation of the new UI should begin until the asset audit has been completed and the screenshot/preview strategy is clear.
