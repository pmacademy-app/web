# Prodily Admin Panel — 10-Phase Frontend UI/UX Implementation Plan

**Purpose:** Build the redesigned Prodily Admin Panel frontend from the finalized UI/UX specification.

**Scope:** Frontend screens, layouts, components, interactions, navigation, states, client-side display logic, and user/admin workflows.

**Out of scope:** Backend architecture, API implementation, database changes, authentication implementation, route implementation details, infrastructure, deployment, or instructions for connecting frontend to backend.

> Existing APIs and backend capabilities may be used later by the implementation team where appropriate, but this document focuses on **what the frontend should do and how it should behave**, not how it is technically connected.

---

# 1. Overall Implementation Strategy

The Admin Panel should be rebuilt progressively in 10 phases.

Each phase should produce a usable part of the new Admin Panel rather than creating disconnected screens.

## Phase sequence

```text
Phase 1
Design Foundation & App Shell
        ↓
Phase 2
Dashboard / Operations Center
        ↓
Phase 3
Users Workspace
        ↓
Phase 4
Learning Workspace
        ↓
Phase 5
Achievements & Moderation
        ↓
Phase 6
Communications Workspace
        ↓
Phase 7
System Workspace
        ↓
Phase 8
Settings & Configuration
        ↓
Phase 9
Global UX Systems
        ↓
Phase 10
Final Production UI/UX Polish
```

---

# Phase 1 — Design Foundation & Admin App Shell

## Goal

Create the new visual foundation and application shell before implementing individual workspaces.

---

## 1.1 Admin Layout

Create the primary structure:

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar                                                      │
├──────────────────┬───────────────────────────────────────────┤
│                  │                                           │
│ Sidebar          │ Main Content                              │
│                  │                                           │
│ Navigation       │                                           │
│                  │                                           │
└──────────────────┴───────────────────────────────────────────┘
```

---

## 1.2 Sidebar

Navigation groups:

```text
Overview
  Dashboard

Operations
  Users
  Communications
  Moderation

Learning
  Curriculum
  Achievements

Insights
  Analytics

System
  Health
  Alerts
  Errors
  Audit Log

Settings
  Product
  Learning
  Email
  Notifications
  Feature Flags
```

### Sidebar behavior

- Active section is visually highlighted.
- Parent groups can expand/collapse.
- Current page remains highlighted after navigation.
- Action-required sections may display count badges.
- Sidebar can collapse on desktop.
- Sidebar becomes a navigation drawer on mobile.

### Footer

- View Learner App
- Admin profile
- Sign out

---

## 1.3 Top Bar

Include:

- Breadcrumb
- Page title
- Global search
- System status
- Alerts
- Help
- Admin profile

The top bar remains visible while scrolling.

---

## 1.4 Design System

Create reusable visual primitives:

- Button
- Icon button
- Input
- Search input
- Select
- Multi-select
- Toggle
- Checkbox
- Tabs
- Badge
- Avatar
- Tooltip
- Card
- KPI card
- Table
- Pagination
- Drawer
- Modal
- Confirmation dialog
- Toast
- Alert
- Empty state
- Loading skeleton
- Error state
- Dropdown menu
- Date picker

---

## 1.5 Standard Page Structure

Every major page should follow:

```text
Page Header
    ↓
Page Description / Actions
    ↓
Summary / KPI Area
    ↓
Search + Filters
    ↓
Primary Content
```

Not every page needs every layer.

---

## 1.6 Standard UI States

Every data-driven component should support:

### Loading

Skeleton matching the final layout.

### Empty

Explain why the page is empty and what the admin can do.

### Error

Explain what failed and provide Retry where appropriate.

### Success

Use inline feedback or toast for successful actions.

### Disabled

Clearly communicate why an action is unavailable when necessary.

---

# Phase 2 — Dashboard / Operations Center

## Goal

Build the redesigned dashboard as the Admin Panel's operational home.

The dashboard should answer:

> "What is happening and what needs my attention?"

---

# 2.1 Dashboard Header

Display:

```text
Good morning, Admin

Here's what needs your attention today.

[Today ▼] [Refresh]
```

### Date range options

- Today
- Last 7 days
- Last 30 days
- Last 90 days
- Custom

Changing the range updates metrics/charts that are time-dependent.

---

# 2.2 Attention Center

This is the first major dashboard section.

Examples:

```text
3 Failed Emails                 [Review]
8 New Contact Messages         [Open Inbox]
4 Pending Testimonials         [Review]
2 Active System Alerts         [View]
```

### Logic

Only show items requiring attention.

If an item count is zero:

- It can be hidden from the attention list, or
- Display a consolidated healthy state.

Example:

```text
✓ Everything looks good

There are no important actions requiring your attention.
```

Clicking an item opens the corresponding workspace.

---

# 2.3 KPI Cards

Use a compact grid.

## Total Users

### Display

```text
Total Users
12,482
```

### Calculation

Count all registered learner accounts represented in the platform user population.

Do not count:

- Deleted users
- Non-user system records

If the UI supports a date comparison:

```text
12,482
↑ 8.2% vs previous period
```

The comparison uses the same metric over the immediately preceding equivalent period.

---

## Active Learners

Display the number of learners considered active during the selected period.

The definition of "active" should be consistent throughout the Admin Panel.

Example activity may include meaningful learning actions such as:

- Lesson activity
- Quiz activity
- Flashcard review
- Other tracked learning activity

The exact qualifying activity should remain consistent across dashboard and analytics.

---

## New Users

Count user accounts created during the selected period.

Example:

```text
New Users
284
```

---

## Verified Users

Count registered users whose account is verified.

---

## Lessons Completed

Count lesson completion events during the selected period.

---

## Course Completion

Display the percentage of eligible learners who completed the relevant course.

If multiple courses exist, provide course filtering.

---

## XP Earned

Display total XP earned during the selected period.

---

## Certificates Issued

Count certificates issued during the selected period.

---

# 2.4 Learner Activity Chart

Display:

- New users
- Active learners
- Returning learners

### Controls

- 7D
- 30D
- 90D
- Custom

Hovering over a chart point displays:

- Date
- Metric value

---

# 2.5 Learning Activity Chart

Display:

- Lessons completed
- Quiz attempts
- Course progress/activity

Allow metric switching.

---

# 2.6 Learning Funnel

Display:

```text
Registered
   ↓
Onboarding
   ↓
First Lesson
   ↓
First Quiz
   ↓
Module Completion
   ↓
Course Completion
   ↓
Certificate
```

### Logic

Each stage displays:

- Number of learners
- Percentage of the previous stage
- Overall conversion percentage

Example:

```text
First Lesson
8,240
66% of registered learners
```

---

# 2.7 Recent Activity

Timeline/table containing:

- User
- Activity
- Entity
- Timestamp

Examples:

```text
Aditya completed "Product Strategy"
2 minutes ago

Omer earned a certificate
18 minutes ago

New learner registered
31 minutes ago
```

Clicking an activity opens the relevant detail screen.

---

# 2.8 System Snapshot

Display:

- Database
- Authentication
- Email
- Notifications
- Queue
- Scheduler

Each shows:

- Status
- Last checked
- Relevant summary

Clicking a service opens System Health.

---

# Phase 3 — Users Workspace

## Goal

Create the primary learner management experience.

---

# 3.1 Users Page

Header:

```text
Users

Search, inspect and manage learners

[Search....................] [Filters]
```

---

# 3.2 User Filters

Support:

- Verification status
- Account status
- Admin status
- Activity
- Progress
- Level
- Signup date
- Last active

Filters can be combined.

Display active filter chips below the toolbar.

---

# 3.3 User Table

Columns:

| User | Status | Progress | Level | XP | Streak | Last Active | Joined |
|---|---|---:|---:|---:|---:|---|---|

### Row interaction

Clicking a row opens the User Detail view.

Actions menu may contain:

- View
- Resend verification
- Administrative actions
- Destructive actions

---

# 3.4 User Detail

Desktop:

- Full-height right drawer

Mobile:

- Full-screen detail page

---

## Header

Display:

- Avatar
- Name
- Email
- Verification
- Account type/status
- Actions

---

## User KPI Cards

Display:

- Level
- XP
- Current streak
- Course progress

---

## User Tabs

```text
Overview
Learning
Activity
Achievements
Communications
Account
```

---

# 3.5 Overview Tab

Display:

- Learning summary
- Recent activity
- Latest achievement
- Latest certificate
- Portfolio
- Current progress

---

# 3.6 Learning Tab

Display:

- Course progress
- Module progress
- Lesson completion
- Quiz performance
- Flashcard/SRS activity

---

# 3.7 Activity Tab

Display a chronological timeline:

- Lesson completed
- Quiz attempted
- Badge earned
- Certificate issued
- Reflection created
- Flashcard review
- Portfolio activity

---

# 3.8 Achievements Tab

Display:

- Badges
- Certificates
- Capstone
- Portfolio

---

# 3.9 Communications Tab

Display:

- Emails
- Notifications
- Contact interactions

---

# 3.10 Account Tab

Display:

- Email
- Verification
- Signup date
- Last active
- Account status
- Access status

---

# 3.11 User Actions

Group actions into:

### Common

- View portfolio
- Open communication history
- Resend verification

### Administrative

- Reset progress
- Manage account/access

### Destructive

- Delete account

Destructive actions are visually separated.

---

# Phase 4 — Learning Workspace

## Goal

Create a dedicated workspace for understanding and managing the learning structure.

---

# 4.1 Learning Navigation

```text
Learning

Curriculum
Analytics
```

Achievements remains a separate top-level workspace.

---

# 4.2 Curriculum Overview

Header:

```text
Curriculum

Manage and explore the learning structure

[Search] [Filters]
```

KPI cards:

- Modules
- Lessons
- Quizzes
- Flashcards
- Capstones

---

# 4.3 Module Cards

Each module displays:

- Module number
- Module name
- Description
- Lesson count
- Completion
- Status

Example:

```text
Module 01
Product Management Fundamentals

12 Lessons
82% Average Completion

[Open]
```

---

# 4.4 Module Detail

Display:

- Module title
- Description
- Completion
- Lesson count
- Status

Lesson table:

| # | Lesson | Type | Completion | Status |
|---|---|---|---:|---|

Actions:

- Preview
- Open
- Manage visibility
- Manage publication state

---

# 4.5 Lesson Detail

Display:

### Metadata

- Title
- Type
- Module
- Estimated duration
- Completion
- Quiz statistics

### Preview

Large learner-facing preview.

The preview should resemble the actual learner lesson experience.

---

# 4.6 Curriculum Controls

Frontend controls may include:

- Publish/unpublish
- Enable/disable
- Visibility
- Preview
- Ordering

Controls should use confirmation where the action affects learner visibility.

---

# 4.7 Learning Analytics

Sections:

### Learners

- DAU
- WAU
- MAU
- New vs returning

### Learning

- Lessons completed
- Module completion
- Course completion
- Quiz performance

### Engagement

- Streak distribution
- XP activity
- Flashcard activity

### Outcomes

- Certificates
- Capstones
- Portfolios

---

# Phase 5 — Achievements & Moderation

## Goal

Group learner outcomes and review workflows into clear, human-friendly experiences.

---

# 5.1 Achievements Navigation

```text
Achievements

Certificates
Badges
Capstones
Portfolios
```

---

# 5.2 Certificates

## KPI Cards

- Total Issued
- Issued This Month
- Recently Issued
- Recently Verified

## Table

| Learner | Certificate | Type | Issued | Status |
|---|---|---|---|---|

---

# 5.3 Certificate Detail

Two-column layout:

```text
┌──────────────────────────┬─────────────────────────────┐
│                          │ Certificate Information     │
│     Certificate          │ Learner                     │
│       Preview            │ Course                      │
│                          │ Issue Date                  │
│                          │ Verification                │
└──────────────────────────┴─────────────────────────────┘
```

---

# 5.4 Badges

Use a visual grid.

Each badge card:

- Icon
- Name
- Description
- Award count
- Criteria

---

# 5.5 Capstones

Table:

| Learner | Project | Submitted | Status | Visibility |
|---|---|---|---|---|

Detail view displays:

- Project title
- Learner
- Description
- Submission
- Assets/links
- Date
- Visibility
- Review status

---

# 5.6 Portfolios

Table:

| Learner | Portfolio | Visibility | Submitted | Status |
|---|---|---|---|---|

Actions:

- View
- Review
- Open public portfolio

---

# 5.7 Moderation Workspace

Create a review-oriented workspace.

Tabs:

```text
Testimonials
Product Feedback
Capstones
Portfolios
```

### Purpose

Answer:

> "What learner-submitted content needs my review?"

---

## Moderation status

Use:

- Pending
- In Review
- Approved
- Rejected
- Published

---

# 5.8 Testimonials

Display:

- Learner
- Testimonial
- Submitted
- Status
- Featured

Actions:

- Review
- Approve
- Reject
- Feature

---

# 5.9 Product Feedback

Display:

- User
- Rating
- Category
- Feedback
- Date

Product feedback is private/internal, unlike testimonials.

---

# Phase 6 — Communications Workspace

## Goal

Create one coherent communication center rather than multiple disconnected email/notification pages.

---

# 6.1 Communications Overview

The landing page should answer:

> "How are communications performing and what needs attention?"

KPI cards:

- Emails sent
- Delivered
- Failed
- Pending
- New contact messages
- Pending communication reviews

Attention section:

- Failed emails
- Delivery issues
- New contact messages
- Other communication tasks

---

# 6.2 Communications Navigation

Use secondary tabs:

```text
Overview
Email
Automations
Templates
Queue
Notifications
Contact
Testimonials
Feedback
```

Testimonials and Feedback can also be surfaced through Moderation.

---

# 6.3 Email

Display:

- Sent
- Delivered
- Failed
- Bounced
- Pending

Chart:

- Email volume
- Delivery success

Table:

| Recipient | Template | Status | Date |
|---|---|---|---|

---

# 6.4 Email Send Flow

## Production Send

Form:

```text
Send Email

Recipient
[........................]

Template
[ Welcome Email ▼ ]

Subject
[........................]

Preview

[Cancel] [Continue]
```

Then confirmation:

```text
Send this email?

Recipient: user@example.com
Template: Welcome Email

[Cancel] [Send Email]
```

---

# 6.5 Test Send

Form:

```text
Send Test Email

Template
[ Welcome Email ▼ ]

Recipient
[ admin@example.com ]

[Cancel] [Send Test]
```

---

# 6.6 Email Templates

## Template List

Columns:

| Template | Category | Trigger | Status | Updated |
|---|---|---|---|---|

---

# 6.7 Template Detail / Editor

This should be a dedicated page, not a cramped modal.

Layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Template Name                              [Save] [Send Test] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Subject                                                      │
│ [ Welcome to Prodily _________________________________ ]     │
│                                                              │
│ ┌──────────────────────────────┬───────────────────────────┐ │
│ │                              │                           │ │
│ │ Email Body / Code            │      Live Preview         │ │
│ │                              │                           │ │
│ │ {{first_name}}               │  ┌─────────────────────┐  │ │
│ │                              │  │                     │  │ │
│ │ Welcome to Prodily...        │  │   Rendered Email    │  │ │
│ │                              │  │                     │  │ │
│ │                              │  └─────────────────────┘  │ │
│ └──────────────────────────────┴───────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Editor modes

```text
Code | Preview
```

### Subject

Editable subject field.

### Body

Editable email body/content.

### Variables

Display supported variables separately.

Example:

```text
Available Variables

{{first_name}}
{{email}}
{{course_name}}
{{verification_link}}

[Copy]
```

Clicking a variable copies it.

### Preview

The preview renders the template with sample data.

Example sample values:

```text
first_name = Aditya
email = aditya@example.com
course_name = Product Management
```

### Actions

- Save
- Send test
- Preview
- Return to templates

---

# 6.8 Email Automation

Automation cards:

```text
Welcome Email
Trigger: New User
● Active

Weekly Recap
Trigger: Weekly
● Active

Inactive Learner Reminder
Trigger: 7 Days Inactive
○ Disabled
```

Automation detail:

- Name
- Trigger
- Template
- Audience
- Timing
- Conditions
- Status

---

# 6.9 Notification Management

Table:

| Notification | Type | Audience | Status | Scheduled |
|---|---|---|---|---|

Create notification:

```text
Title
Message
Type
Audience
Schedule
```

Actions:

- Save
- Send
- Schedule
- Cancel

---

# 6.10 Contact Inbox

Two-pane interface:

```text
Messages                    Detail
────────────────────────────────────────
● Course question            From
○ Login issue                Subject
○ Feedback                  Message
○ Portfolio question
```

Filters:

- Read/unread
- Status
- Topic
- Date

---

# Phase 7 — System Workspace

## Goal

Create a clean operational control center for system visibility.

---

# 7.1 System Navigation

```text
System

Health
Alerts
Errors
Audit Log
```

---

# 7.2 Health Dashboard

Service cards:

- Database
- Authentication
- Email
- Notifications
- Queue
- Scheduler

Each card:

```text
Email

● Operational

Last checked
2 minutes ago

[View Details]
```

---

# 7.3 Service Detail

Display:

- Current status
- Last check
- Recent events
- Relevant metrics
- Recent failures

---

# 7.4 Alerts

Group by severity:

```text
Critical
Error
Warning
Resolved
```

Alert card:

```text
Email delivery failures detected

Severity: Critical
Detected: 2 minutes ago

[View]
```

---

# 7.5 Errors

Table:

| Severity | Error | Area | Occurrences | Last Seen | Status |
|---|---|---|---:|---|---|

Detail drawer:

- Error
- Severity
- Area
- First seen
- Last seen
- Frequency
- Status
- Related information

---

# 7.6 Audit Log

Filters:

- Admin
- Action
- Target
- Date

Table:

| Time | Admin | Action | Target | Result |
|---|---|---|---|---|

Detail drawer:

- Admin
- Action
- Target
- Timestamp
- Result
- Context

---

# Phase 8 — Settings & Configuration

## Goal

Create a simple configuration workspace without turning Settings into a giant form.

---

# 8.1 Settings Navigation

```text
Settings

Product
Learning
Email
Notifications
Feature Flags
```

---

# 8.2 Product Settings

Groups:

### General

- Product configuration

### Platform

- Maintenance mode
- Product-level settings

Each setting:

```text
Setting Name
Description

[Control]

Current value
```

---

# 8.3 Learning Settings

Groups:

- XP
- Streaks
- Certificates
- Learning behavior

---

# 8.4 Email Settings

Groups:

- Sending
- Daily limits
- Sender
- Email behavior

---

# 8.5 Notification Settings

Groups:

- Reminders
- Weekly recap
- Defaults

---

# 8.6 Feature Flags

Display:

```text
Feature Name
Description

● Enabled

Last changed
```

Use category grouping when the number of features increases.

---

# Phase 9 — Global UX Systems

## Goal

Add the cross-application systems that make the Admin Panel fast and pleasant to use.

---

# 9.1 Global Search

Shortcut:

```text
⌘ K
```

Search:

- Users
- Lessons
- Modules
- Certificates
- Portfolios
- Capstones
- Contact messages
- Testimonials
- Feedback

Results grouped by entity type.

Example:

```text
Users
  Aditya Gangwani

Lessons
  Product Strategy

Certificates
  Product Management Certificate
```

Clicking a result opens its appropriate detail view.

---

# 9.2 Command Menu

Command menu should support frequent navigation/actions.

Examples:

```text
Search users
Open email queue
Open contact inbox
Open curriculum
View active alerts
Open analytics
```

Commands should be grouped by workspace.

---

# 9.3 Global Alerts Center

Top-bar alert icon opens:

```text
Needs Attention

3 Failed Emails
2 New Contact Messages
1 Critical Alert
```

Clicking an item opens the relevant workspace.

---

# 9.4 Keyboard Navigation

Support common shortcuts where practical:

```text
⌘ K     Global Search
Esc      Close drawer/modal
↑ ↓      Navigate search results
Enter    Open selected result
```

---

# 9.5 Standard Drawers

Use a consistent drawer system for:

- User details
- Certificate details
- Contact messages
- Email details
- Alerts
- Errors
- Audit entries
- Feedback

The underlying page remains visible behind the drawer.

---

# 9.6 Standard Modals

Use modals for:

- Sending
- Scheduling
- Confirmation
- Small edits
- Focused configuration

Do not place large multi-step workflows inside modals.

---

# 9.7 Responsive System

### Desktop

- Persistent sidebar
- Multi-column layout
- Full tables
- Drawers

### Tablet

- Collapsible sidebar
- Responsive grids
- Condensed tables

### Mobile

- Navigation drawer
- Single-column cards
- Full-screen detail views
- Stacked actions
- Scrollable tables where necessary

---

# Phase 10 — Final Production UI/UX Polish

## Goal

Perform a complete frontend-quality pass across the entire redesigned Admin Panel.

This phase is not about adding large new features.

It is about making the entire Admin Panel feel like one cohesive product.

---

# 10.1 Visual Consistency

Verify:

- Typography
- Spacing
- Cards
- Borders
- Radius
- Buttons
- Icons
- Status badges
- Tables
- Inputs
- Modals
- Drawers

Everything should use the same visual language.

---

# 10.2 Interaction Consistency

Verify:

- Every primary action behaves consistently.
- Every destructive action uses confirmation.
- Every drawer closes consistently.
- Every modal behaves consistently.
- Filters behave consistently.
- Search behaves consistently.
- Pagination behaves consistently.

---

# 10.3 Empty States

Every page should have a designed empty state.

Examples:

```text
No failed emails

Everything is running normally.
```

```text
No testimonials yet

Learner stories will appear here once submitted.
```

---

# 10.4 Loading States

Verify all pages have:

- KPI skeletons
- Table skeletons
- Drawer skeletons
- Chart skeletons
- Detail skeletons

No blank loading screens.

---

# 10.5 Error States

Every major page should have:

```text
Unable to load this information

Something went wrong.

[Try Again]
```

---

# 10.6 Responsive QA

Test:

- Desktop
- Laptop
- Tablet
- Mobile

Especially:

- Dashboard
- Users
- User details
- Curriculum
- Email
- Templates
- Contact
- System
- Settings

---

# 10.7 Accessibility QA

Verify:

- Keyboard navigation
- Focus states
- Labels
- Screen-reader semantics
- Dialog accessibility
- Table accessibility
- Color contrast
- Touch targets
- Status indicators

---

# 10.8 Performance UX

Frontend should feel responsive.

Prioritize:

- Fast initial dashboard render
- Progressive loading
- Skeleton states
- Efficient table rendering
- Efficient drawers
- Avoid unnecessary full-page reloads
- Preserve user context when navigating

---

# 10.9 Final Navigation Review

Final structure:

```text
PRODILY ADMIN
│
├── Overview
│   └── Dashboard
│
├── Operations
│   ├── Users
│   ├── Communications
│   └── Moderation
│
├── Learning
│   ├── Curriculum
│   └── Achievements
│
├── Insights
│   └── Analytics
│
├── System
│   ├── Health
│   ├── Alerts
│   ├── Errors
│   └── Audit Log
│
└── Settings
    ├── Product
    ├── Learning
    ├── Email
    ├── Notifications
    └── Feature Flags
```

---

# 11. Final Phase Summary

| Phase | Focus | Main Output |
|---|---|---|
| **1** | Design Foundation & Shell | New Admin layout, navigation, design system |
| **2** | Dashboard | Operations Center |
| **3** | Users | Learner management workspace |
| **4** | Learning | Curriculum + learning analytics |
| **5** | Achievements & Moderation | Certificates, badges, capstones, portfolios, review workflows |
| **6** | Communications | Email, templates, automations, notifications, contact |
| **7** | System | Health, alerts, errors, audit |
| **8** | Settings | Product, learning, email, notifications, feature flags |
| **9** | Global UX | Search, command menu, alerts, drawers, responsive systems |
| **10** | Final Polish | Production-level UI/UX QA and consistency |

---

# 12. Definition of Done

The redesigned Admin Panel frontend is considered complete when:

### Navigation

- Every major workspace is clearly discoverable.
- Navigation is consistent across desktop/tablet/mobile.
- No page feels isolated from the overall information architecture.

### Dashboard

- The admin immediately sees what needs attention.
- KPIs are understandable.
- Charts provide useful context.
- Recent activity is actionable.
- System status is visible.

### Users

- Users can be searched and filtered.
- User details are easy to inspect.
- Learning and activity information is organized.
- Actions are easy to discover but destructive actions remain protected.

### Learning

- Curriculum is easy to navigate.
- Modules and lessons are easy to inspect.
- Learner-facing previews are clear.
- Learning analytics are understandable.

### Achievements & Moderation

- Certificates, badges, capstones, and portfolios are easy to inspect.
- Learner-submitted content requiring review is easy to find.

### Communications

- Email activity is understandable.
- Templates are easy to inspect/edit.
- Template body and subject can be viewed together with a live preview.
- Code/Preview switching is intuitive.
- Automations are understandable.
- Contact messages work like an inbox.
- Notifications are clearly separated from email.

### System

- System status is easy to understand.
- Alerts are prioritized.
- Errors are inspectable.
- Audit history is searchable.

### Settings

- Settings are grouped logically.
- Configuration is not presented as one giant form.
- Each setting explains what it controls.

### UX

- Loading states exist.
- Empty states exist.
- Error states exist.
- Confirmation patterns are consistent.
- Drawers/modals are consistent.
- Search is fast and intuitive.
- Responsive layouts work.
- Accessibility fundamentals are covered.

---

# 13. Design Philosophy

The Admin Panel should not become a collection of screens built one after another.

Every phase should reinforce the same product philosophy:

```text
See
 ↓
Understand
 ↓
Act
 ↓
Verify
```

For example:

```text
Failed Emails
     ↓
Open Queue
     ↓
Inspect Failure
     ↓
Retry / Resolve
     ↓
Verify Result
```

Or:

```text
User
 ↓
Open Profile
 ↓
Understand Learning Progress
 ↓
Inspect Activity
 ↓
Take Action
 ↓
Return to Users
```

Or:

```text
Email Template
 ↓
Open Template
 ↓
Edit Subject / Body
 ↓
Switch Code ↔ Preview
 ↓
Send Test
 ↓
Save
```

The final Admin Panel should feel like a **single coherent operational product**, not an internal collection of database management screens.

---

# 14. Important Scope Boundary

This document intentionally does **not** specify:

- API implementation
- API route design
- Database schema
- Supabase configuration
- Authentication implementation
- Backend architecture
- Server actions
- RLS
- Deployment
- Infrastructure
- Cron implementation
- Email provider integration

Those are implementation concerns outside this frontend roadmap.

The frontend implementation may reuse existing application capabilities where appropriate, but the UI/UX defined here remains the source of truth for the redesigned Admin Panel.
