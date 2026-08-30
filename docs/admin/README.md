# Prodily Admin Panel — Operator's Manual & Navigation Hub

Welcome to the **Prodily PM Academy Admin Operating Manual**.

This documentation suite provides operational procedures for administrators and operators managing Prodily PM Academy. Every procedure in this guide describes **what is currently implemented and live in the platform today**.

---

## Intended Audience & Access Requirements

These guides are written for:
- Platform Administrators
- Community Managers & Moderation Teams
- Curriculum Authors & Content Reviewers
- Support Engineers & System Operators

### Access Requirements
To access the Admin Panel:
1. You must sign in with an account whose email is listed in `ADMIN_EMAILS`, **or**
2. Your account must have `is_admin = true` in PostgreSQL.
3. Access is located at [`/admin`](https://prodily.app/admin) (or `http://localhost:3000/admin` in development).

---

## Operating Guides Index

| Guide | Scope & Operational Procedures | Direct Link |
|---|---|---|
| **1. Operations Dashboard** | Attention center, real-time KPI metrics, activity charts, learner journey funnel, and live system snapshot | [Dashboard Guide](dashboard.md) |
| **2. User Management** | Searching & filtering learners, inspecting profile tabs, changing admin roles, granting Fellow status, resetting progress, and account deletion | [Users Guide](users.md) |
| **3. Portfolio Verification** | Verification queue workflow, Fellow designation semantics, public/private invariants, in-line verification, and audit logging | [Portfolio Verification Guide](portfolio-verification.md) |
| **4. Referrals & Growth** | Referral lifecycle, attribution cookies, activation rewards (+50 XP), anti-abuse rules, and inspecting user referral counts | [Referrals Guide](referrals.md) |
| **5. Email Operations** | Queue monitoring, dead-letter retries, broadcast builder & campaign scheduling, template testing, and direct user email dispatch | [Emails Guide](emails.md) |
| **6. In-App Notifications** | In-app broadcast campaigns, audience targeting, template manager, and platform banner announcements | [Notifications Guide](notifications.md) |
| **7. Unified Communications** | Overview hub, contact message inbox, automation schedules, and template code editing | [Communications Guide](communications.md) |
| **8. Content Moderation** | Reviewing and approving/rejecting testimonials, product feedback, and module capstone deliverables | [Moderation Guide](moderation.md) |
| **9. Curriculum & Quality** | 90-lesson browser, clarity satisfaction scores (1–5 stars), learner feedback inspection, and live preview | [Curriculum Guide](curriculum.md) |
| **10. Achievements & Credentials** | Certificates registry, QR verification preview, badge directory, and developer test certificate generator | [Achievements Guide](achievements.md) |
| **11. Analytics & Reporting** | Acquisition velocity (DAU/WAU/MAU), learning drop-off funnels, quiz pass rates, XP habits, and CSV exports | [Analytics Guide](analytics.md) |
| **12. System Health & Diagnostics** | Latency metrics, error groups with stack traces, severity alerts, audit log search, and manual queue processor trigger | [System Health Guide](system.md) |
| **13. Platform Settings & Controls** | Maintenance mode, signups toggle, email verification requirement, runtime XP values, and onboarding goal options | [Platform Settings Guide](platform-settings.md) |

---

## Operational Conventions & Best Practices

1. **Destructive Actions Require Confirmation:** Progress resets, user deletions, and un-verifications trigger built-in confirmation dialogs. Always verify the target user before confirming.
2. **Audit Trails Are Automatic:** Every mutation (status change, role toggle, broadcast trigger, settings update) is automatically recorded in `public.admin_audit_logs` with your email, IP, and timestamp.
3. **Public Invariants Are Enforced:** Actions such as Portfolio Verification strictly require the learner's portfolio to be public. Private portfolios cannot be verified.
