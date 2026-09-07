# Achievements & Credential Administration — Operating Guide

**Location:** `/admin/achievements` (sub-routes: `/certificates`, `/badges`)  
**Workspace:** Learning $\rightarrow$ Achievements  
**Audience:** Administrators & Certification Operations  

---

## 1. Purpose

The Achievements Workspace allows administrators to inspect issued certificates, verify credential integrity, inspect the badge catalog, and generate test certificates for QA verification.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/achievements` from the sidebar (or use route alias `/admin/certificates`).
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. Sub-Workspaces & Operational Procedures

### A. Certificates Registry (`/admin/achievements/certificates`)
The central ledger of all verified credentials issued to learners:
1. **Search & Filter:** Search by certificate code (e.g., `PMA-2026-8F2A7B9C`), recipient name, or email.
2. **Table Information:**
   - **Certificate Code:** Unique alphanumeric identifier (`generateCertificateCode()`).
   - **Recipient:** Student name, email, and avatar.
   - **Credential Type:** `full_curriculum` (Academy Master Certification) or module-specific credentials.
   - **Issued At:** Timestamp of issuance.
   - There is **no template versioning** — every certificate uses one layout, and there is no separate `credential_hash` field in the schema (the certificate code itself is the identifier).
3. **Certificate Detail Drawer:** Click any certificate row to open the inspection drawer:
   - **Live Verification Link:** Direct link to `/verify/[certificateId]`.
   - **QR Code Preview:** Visual verification QR code (generated for every certificate, not gated by a version tier).

### B. Badges Directory (`/admin/achievements/badges`)
Visual catalog of all platform achievement badges:
1. **Badge Inventory:** View all badges with iconography, category (`streak`, `progress`, `mastery`, `special`), and unlock criteria.
2. **Recipient Analytics:** View how many learners have earned each badge.

### C. Generating QA Test Certificates
For developer testing and pipeline verification:
1. Go to `/admin/users` $\rightarrow$ open any user's **User Detail Drawer**.
2. Scroll to the **Developer Actions Section**.
3. Click **[ Generate Test Certificate ]**.
4. The system triggers the full PDF generation, notification dispatch, and email queue pipeline, returning the certificate code and verification URL.

---

## 4. Verification & LinkedIn Integration

Every issued certificate is backed by public verification at `/verify/[certificateId]`:
- Validates the student's name, issuing authority ("Prodily · PM Academy"), issue date, and credential status.
- Integrates with the official LinkedIn Add-to-Profile URL (`buildLinkedInCertificationUrl()`), allowing learners to add the credential to their LinkedIn profile in one click.
