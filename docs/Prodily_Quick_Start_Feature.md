# Quick Start Feature — Prodily

## 1. Overview

Add a **Quick Start** product tour to the Prodily dashboard for first-time users.

The purpose of Quick Start is to help a newly onboarded user understand what Prodily offers and where the important features live.

### Existing user journey

The expected flow is:

1. User signs up
2. User verifies their email
3. User logs in again
4. User completes the existing onboarding flow
5. User reaches the Dashboard
6. **Quick Start automatically opens**
7. User goes through the product tour or skips it
8. User continues using the Dashboard normally

Quick Start is **not a replacement for the existing onboarding flow**. It is a short product-tour experience that happens after onboarding when the user first reaches the Dashboard.

---

## 2. Goals

Quick Start should:

- Explain the major features available in Prodily.
- Help users understand the purpose of each major dashboard/navigation section.
- Reduce confusion for first-time users.
- Make the dashboard easier to navigate.
- Give users a clear first action after completing onboarding.
- Feel native to the existing Prodily UI and branding.
- Avoid overwhelming the user with too much information at once.

The experience should answer:

> **“What can I do on Prodily, and where do I find it?”**

---

## 3. Non-Goals

Do not turn Quick Start into a detailed tutorial for every feature.

Do not:

- Explain every button or minor UI element.
- Duplicate the existing onboarding questions.
- Force users to complete the tour.
- Show the tour on every dashboard visit.
- Introduce a completely different visual design system.
- Create unnecessary database entities when an existing user preference/state mechanism can be reused.

---

## 4. Trigger Behavior

Quick Start should automatically open when all of the following are true:

- The user is authenticated.
- The user's email is verified.
- The user has completed the existing onboarding flow.
- The user reaches the Dashboard.
- The user has not previously completed or skipped Quick Start.

### Important

Quick Start should **not** appear:

- Before email verification.
- During the existing onboarding flow.
- Every time the user visits the Dashboard.
- For existing users who have already completed/skipped the tour.

---

## 5. Persistence

Quick Start completion should be persisted against the user's account.

Preferred behavior:

- `quickStartCompleted = true` after the user finishes the tour.
- Treat skipping the tour as completed/dismissed for automatic-launch purposes.
- Do not rely only on `localStorage` because the same account may be used across devices/browsers.

If the existing user model already has a suitable onboarding/preferences field, reuse the existing architecture rather than creating unnecessary duplicate state.

The implementation should inspect the current codebase and follow its established patterns.

---

# 6. Quick Start Tour Structure

The tour should use a **multi-step modal/product-tour experience**, not one large block of text.

Each step should contain:

- Step number/progress indicator.
- Feature name.
- Short explanation.
- Relevant icon/visual.
- Next button.
- Back button where applicable.
- Skip Tour option.
- Final step should use a completion CTA.

Example progress:

> Step 1 of 8

The exact number of steps may change if the current Prodily dashboard contains more/less major navigation areas. The implementation should inspect the current UI before finalizing the steps.

---

# 7. Suggested Tour Content

## Step 1 — Welcome to Prodily

### Title

**Welcome to Prodily 👋**

### Description

Welcome to your Product Management learning journey.

Prodily brings your learning, progress, achievements, and PM portfolio together in one place.

### CTA

**Let's get started →**

---

## Step 2 — Curriculum

### Title

**📚 Curriculum**

### Description

This is where your Product Management learning journey happens.

Explore structured lessons and work through the PM curriculum step by step. Track your progress as you complete lessons and move forward.

### Highlight

Highlight the **Curriculum** navigation item/tab.

### CTA

**Next →**

---

## Step 3 — Leaderboard

### Title

**🏆 Leaderboard**

### Description

See how you rank against other Prodily learners.

Earn points through your activity and learning progress, and use the leaderboard as a little extra motivation to keep learning.

### Highlight

Highlight the **Leaderboard** navigation item/tab.

### CTA

**Next →**

---

## Step 4 — Portfolio

### Title

**🎯 Your PM Portfolio**

### Description

Build your Product Management portfolio as you learn.

Use your portfolio to showcase your projects, work, achievements, and PM journey — something you can eventually share with others.

### Highlight

Highlight the **Portfolio** navigation item/tab.

### CTA

**Next →**

---

## Step 5 — Badges & Achievements

### Title

**🏅 Badges & Achievements**

### Description

Your progress comes with milestones worth celebrating.

Complete activities, reach milestones, and unlock badges as you continue your PM journey.

### Highlight

Highlight the **Badges/Achievements** area if it exists in the current dashboard/navigation.

### CTA

**Next →**

---

## Step 6 — Progress & Dashboard

### Title

**📊 Track Your Progress**

### Description

Your Dashboard gives you a quick view of your learning journey.

See your progress, completed work, current activity, and what you can continue working on next.

### Highlight

Highlight the most relevant dashboard/progress component currently available.

### CTA

**Next →**

---

## Step 7 — Profile & Settings

### Title

**👤 Your Profile**

### Description

Manage your Prodily profile, account information, preferences, and other settings from here.

### Highlight

Highlight the Profile/Settings area currently available in the application.

### CTA

**Next →**

---

## Step 8 — You're Ready!

### Title

**🚀 You're ready to start!**

### Description

That's the quick tour.

Explore the curriculum, build your skills, earn achievements, and create your PM portfolio along the way.

Your Product Management journey starts now.

### CTA

**Start Learning**

---

# 8. UX Requirements

## Navigation

The tour must support:

- `Next`
- `Back`
- `Skip Tour`
- Final `Start Learning` / `Finish` action

### Step indicator

Show progress clearly, for example:

`1 / 8`

or

`Step 1 of 8`

Use whichever pattern best matches the existing Prodily design system.

---

## Skip behavior

The user must be able to skip the tour at any point.

When the user selects **Skip Tour**:

1. Close the Quick Start modal.
2. Persist the dismissed/completed state.
3. Do not automatically show the tour again on the next Dashboard visit.

The user should still be able to manually reopen Quick Start later.

---

# 9. Reopen Quick Start

Add a way for users to manually access the tour again after they have completed/skipped it.

Possible locations:

- Help icon
- Dashboard help menu
- Profile menu
- Settings

Use whichever location fits the existing Prodily UI best.

Suggested label:

**Quick Start**

or

**Product Tour**

Do not add a new navigation tab solely for this unless the existing information architecture makes that necessary.

---

# 10. Visual Design

The Quick Start experience must match the existing Prodily design language.

Before implementing the UI:

1. Inspect the current Dashboard.
2. Inspect the current navigation/sidebar.
3. Inspect existing modals.
4. Inspect buttons, typography, spacing, cards, icons, and colors.
5. Reuse existing components wherever possible.
6. Reuse existing design tokens/theme variables.

Do not introduce an unrelated visual style.

### Recommended visual treatment

Use a polished product-tour modal with:

- Rounded corners consistent with existing Prodily cards/modals.
- Clear title hierarchy.
- Short readable descriptions.
- Existing Prodily iconography where available.
- Subtle animation between steps.
- Optional background overlay.
- Spotlight/highlight around the relevant navigation item or UI section.

The tour should feel like a part of Prodily, not an external third-party widget.

---

# 11. Spotlight / Feature Highlight

Where technically appropriate, each step should visually point to the feature being explained.

For example:

**Curriculum step**

- Darken/blur the rest of the page slightly.
- Highlight the Curriculum navigation item.
- Position the Quick Start card near the highlighted area.

Repeat this pattern for:

- Curriculum
- Leaderboard
- Portfolio
- Badges/Achievements
- Progress/Dashboard
- Profile/Settings

If a spotlight implementation would create major responsive/accessibility issues, use a centered modal with a clear feature icon instead.

The experience should remain usable on mobile.

---

# 12. Responsive Behavior

Quick Start must work properly on:

- Desktop
- Laptop
- Tablet
- Mobile

On smaller screens:

- Do not position the modal outside the viewport.
- Ensure all text remains readable.
- Ensure buttons remain easily tappable.
- Ensure the highlighted feature does not become inaccessible.
- Allow the modal/card to scroll internally if necessary.
- Avoid requiring horizontal scrolling.

---

# 13. Accessibility

The Quick Start modal must follow the application's existing accessibility patterns.

At minimum:

- Proper dialog semantics.
- Keyboard navigation.
- Visible focus states.
- Buttons must have meaningful labels.
- Escape key should close/skip the tour if consistent with existing modal behavior.
- Screen readers should be able to understand the current step.
- Do not rely only on color or visual highlighting to communicate information.

---

# 14. Animation

Use subtle transitions.

Recommended:

- Fade/scale when opening.
- Smooth transition between steps.
- Subtle movement when the spotlight changes.

Avoid:

- Excessive animations.
- Long delays.
- Distracting effects.

The user should always feel in control.

---

# 15. Technical Implementation Guidance

Before coding, inspect the repository and identify:

- Existing authentication flow.
- Existing onboarding completion state.
- User database/schema.
- Dashboard entry point.
- Existing modal/dialog components.
- Existing navigation/sidebar components.
- Existing design tokens.
- Existing analytics/event tracking, if available.
- Existing user preference/settings patterns.

Then implement Quick Start using the project's existing architecture.

### Important

Do not blindly create a new architecture.

Prefer:

- Existing components.
- Existing hooks.
- Existing state management.
- Existing database patterns.
- Existing API/server-action patterns.
- Existing UI primitives.

Only introduce new abstractions where the existing architecture does not support the feature cleanly.

---

# 16. Suggested State Model

Conceptually, the feature needs a state similar to:

```text
quickStartStatus:
  not_started
  active
  completed
  skipped
```

However, the persisted user state only needs to distinguish whether the automatic tour should appear again.

For example:

```text
quickStartCompleted: boolean
```

or an equivalent existing user-preference field.

The temporary `active` state should remain client/UI state.

---

# 17. Error Handling

If the application cannot persist the Quick Start completion state:

- Do not break the Dashboard.
- Do not block the user from using Prodily.
- Handle the persistence failure gracefully.
- Follow the application's existing error handling/logging conventions.

Quick Start is an enhancement and must never prevent normal Dashboard usage.

---

# 18. Analytics

If Prodily already has analytics/event tracking, consider tracking:

- Quick Start opened
- Quick Start step viewed
- Quick Start skipped
- Quick Start completed
- Quick Start reopened manually

Do not introduce a new analytics system solely for this feature.

If analytics are not currently available, do not block implementation on analytics.

---

# 19. Testing Requirements

Before considering the feature complete, test the complete user journey.

### New user

Verify:

```text
Sign up
→ Email verification
→ Login
→ Existing onboarding
→ Dashboard
→ Quick Start automatically opens
```

### Complete tour

Verify:

```text
Quick Start opens
→ User goes through every step
→ User clicks Start Learning
→ Tour closes
→ Completion state is persisted
→ Dashboard works normally
→ Quick Start does not automatically open again
```

### Skip tour

Verify:

```text
Quick Start opens
→ User clicks Skip Tour
→ Tour closes
→ Dismissal state is persisted
→ Dashboard works normally
→ Tour does not automatically open again
```

### Returning user

Verify:

```text
Existing user
→ Login
→ Dashboard
→ Quick Start does NOT automatically open
```

### Manual reopen

Verify:

```text
Completed/skipped user
→ Opens Quick Start from Help/Profile/Settings
→ Tour opens normally
→ All steps work
```

### Refresh

Verify that refreshing the Dashboard does not unexpectedly reopen the tour after completion/skip.

### Multiple devices/browser

If the state is persisted server-side:

```text
Complete/skip tour on Device A
→ Login on Device B
→ Tour should not automatically open
```

### Responsive testing

Test at minimum:

- Desktop
- Tablet
- Mobile

### Accessibility testing

Test:

- Keyboard navigation
- Focus management
- Escape behavior
- Screen reader semantics
- Button labels

---

# 20. Definition of Done

Quick Start is complete only when:

- [ ] New users see Quick Start after onboarding and first Dashboard entry.
- [ ] Existing users are not unexpectedly shown the tour.
- [ ] Tour explains the major Prodily features.
- [ ] Curriculum is explained.
- [ ] Leaderboard is explained.
- [ ] Portfolio is explained.
- [ ] Badges/Achievements are explained.
- [ ] Dashboard/Progress is explained.
- [ ] Profile/Settings are explained.
- [ ] User can move forward and backward.
- [ ] User can skip the tour.
- [ ] Completion/skip state persists.
- [ ] Tour does not repeatedly appear.
- [ ] Users can manually reopen Quick Start.
- [ ] UI matches the existing Prodily design.
- [ ] Desktop and mobile layouts work.
- [ ] Accessibility requirements are met.
- [ ] Existing Dashboard functionality is unaffected.
- [ ] All relevant tests pass.
- [ ] Production build passes.
- [ ] No unrelated files/features are changed.

---

# 21. Implementation Principle

**Build the simplest polished version that fits the existing Prodily architecture.**

The goal is not to create a complicated onboarding framework.

The goal is to give a new Prodily user a short, clear introduction to:

> **What Prodily has → where each feature is → what they should do next.**

Inspect the current application first, adapt the exact feature names/content to what actually exists in the codebase, then implement the Quick Start experience without breaking the existing onboarding or Dashboard flow.
