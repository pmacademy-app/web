# Referrals & Organic Growth — Operating Guide

**Location:** User Detail Drawer (`/admin/users`) & Learner Settings (`/settings?tab=referrals`)  
**Workspace:** Growth & Operations  
**Audience:** Administrators & Growth Leads  

---

## 1. Purpose

The Referral System drives organic learner acquisition by empowering students to invite peers, track their activation progress, and earn XP rewards when their invited friends complete their first lesson.

This guide explains the technical attribution lifecycle, anti-abuse mechanisms, user experience, and admin visibility into referral performance.

---

## 2. Referral Lifecycle & Attribution Model

```
                    1. INVITE LINK
[ Referrer User ] ────────────────► [ Peer visits https://prodily.app/signup?ref=handle ]
                                                │
                                                ▼ 2. ATTRIBUTION COOKIE (30 Days)
                                    `prodily_referral` stored in browser
                                                │
                                                ▼ 3. SIGNUP
                                    Account created in auth.users
                                    `public.referrals` row created: status = 'signed_up'
                                                │
                                                ▼ 4. ACTIVATION TRIGGER
                                    Invited peer completes Lesson #1
                                                │
                                                ▼ 5. REWARD DISPATCH
                                    • `public.referrals` updated to status = 'rewarded'
                                    • +50 XP awarded to Referrer in `public.xp_events`
                                    • In-App Notification dispatched to Referrer
```

---

## 3. Anti-Abuse Controls & Rate Limiting

The referral engine enforces strict server-side safeguards in `lib/referral/referral-service.ts`:

1. **Self-Referral Prevention:** Users cannot refer themselves or attribute their own signup (`auth.uid() !== referrer_id`).
2. **24-Hour Rolling Rate Limit:** A referrer can be credited for a maximum of **10 signups per rolling 24-hour window** (`MAX_REFERRALS_PER_24H = 10`). Excess signups within the window are rejected from attribution.
3. **Activation Gate:** XP is **never** awarded on registration alone. The reward is gated strictly behind the invited learner completing their **first full theory/quiz lesson**, ensuring genuine student activation.
4. **Idempotency Protection:** XP awards enforce unique transaction keys to prevent duplicate rewards for the same referred user.

---

## 4. Learner-Facing Referral Experience (`/settings?tab=referrals`)

Students manage and monitor their referrals in their Account Settings:
- **Personal Referral Link:** Unique link formatted as `https://prodily.app/signup?ref=username` (or UUID if username is not configured).
- **One-Click Share Buttons:** Native share triggers for LinkedIn, X (Twitter), and WhatsApp with pre-formatted copy.
- **Invited Peers Dashboard:** Table displaying:
  - **Invited Learner:** Display name / initials.
  - **Joined Date:** Signup timestamp.
  - **Status:** `Signed Up` (pending lesson completion) or `Activated` (reward unlocked).
  - **Earned XP:** `+50 XP` badge upon activation.

---

## 5. Admin Visibility & Operations

### A. Inspecting a User's Referral Count in `/admin/users`
1. Navigate to `/admin/users` and search for the user.
2. Click their row to open the **User Detail Drawer**.
3. Under the **Overview** and **Activity** sections, the system displays the learner's total active referrals count (`referralsCount`).

### B. Direct Database Auditing
Administrators with database access can inspect referral activity directly in `public.referrals`:

```sql
-- View top referrers by successful activation count
SELECT 
  u.name,
  u.email,
  COUNT(r.id) AS total_referred,
  COUNT(r.id) FILTER (WHERE r.status = 'rewarded') AS activated_count
FROM public.users u
JOIN public.referrals r ON r.referrer_id = u.id
GROUP BY u.id, u.name, u.email
ORDER BY activated_count DESC;
```

---

## 6. Practical Example

**Troubleshooting Scenario: A learner reports they invited a friend but did not receive +50 XP**
1. Open `/admin/users` and search for the **invited friend's email**.
2. Open the friend's **User Detail Drawer** $\rightarrow$ go to the **Learning Tab**.
3. Check **Lessons Completed**:
   - If `Lessons Completed = 0`: Explain to the referrer that the +50 XP reward unlocks automatically once their friend finishes their first lesson.
   - If `Lessons Completed \ge 1`: Check the referrer's **Activity Tab** to confirm the `+50 XP (Referral Activation)` event was recorded.
