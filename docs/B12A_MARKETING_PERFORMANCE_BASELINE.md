# B12-A — Marketing Performance Baseline

**Batch:** B12-A · **Type:** Measurement only · **Source changes:** none
**Measured at:** 2026-09-17 · **Commit under test:** `528ed71`
**Verdict:** **A measurable problem exists. B12-B is unlocked.**

---

## 1. Why this report exists

`docs/B7_B14_MASTER_ROADMAP.md:996` specifies B12-A as measurement with a hard stop:

> All 11 marketing sections are `'use client'`, each importing framer-motion, on the
> most SEO- and CWV-sensitive page. Whether this is a *measured* problem is unknown —
> and the locked plan's own rule is measure first.

B12-B ("Server-render the marketing sections") is **GATED** on this report. Its stated
dependency is "B12-A showing a measurable problem. If the baseline is healthy, this
batch is cancelled, not deferred."

This report supplies the evidence for that decision. It changes no source file.

---

## 2. Method

| Input | Value |
|---|---|
| Build | `npm run build` — Next.js 16.3.5 (Turbopack), clean `.next`, exit 0 |
| Server | `npm run start` (production server, localhost:3000) |
| Lighthouse | 13.4.1, headless Chrome, `--only-categories=performance,accessibility,best-practices,seo` |
| Mobile profile | Lighthouse default — Moto G Power emulation, 4× CPU throttle, slow 4G |
| Desktop profile | `--preset=desktop` |
| Bundle analysis | Static: script tags parsed from the prerendered HTML in `.next/server/app/*.html`, chunk bytes read from `.next/static/`, gzip via `zlib.gzipSync` |

Next.js 16's Turbopack build output no longer prints a "First Load JS" column, so the
per-route payload below was measured directly from the emitted HTML and chunk files
rather than read off the build log.

**Control:** `/about` was measured with the identical method and profile. It is a
static marketing page that does **not** pull the animation chunk, which isolates the
landing page's incremental cost from the shared app baseline.

---

## 3. Bundle baseline

Per-route client JavaScript, as actually referenced by each prerendered document:

| Route | Scripts | JS raw | **JS gzip** | CSS gzip | HTML gzip |
|---|---:|---:|---:|---:|---:|
| **`/` (landing)** | 20 | 1,850.1 KB | **529.1 KB** | 32.1 KB | 15.9 KB |
| `/about` (control) | 18 | 1,120.6 KB | 345.0 KB | 32.1 KB | 8.6 KB |
| `/curriculum` | 18 | 1,120.6 KB | 345.0 KB | 32.1 KB | 20.1 KB |
| `/login` | 19 | 1,140.9 KB | 347.4 KB | 32.1 KB | 4.8 KB |

The landing page ships **184.1 KB gzipped more JavaScript than any other page in the
application.** Every other measured route sits within ~2.5 KB of a common 345 KB
baseline; `/` is the only outlier.

### Attribution — what the extra 184 KB is

Exactly two chunks are referenced by `/` and by no other page:

| Chunk | gzip | raw | Contents |
|---|---:|---:|---|
| `2xa4t_4mqbjlv.js` | **171.7 KB** | 683.1 KB | **framer-motion runtime** |
| `1dsm4jmngvf6t.js` | 12.4 KB | 46.3 KB | Marketing section bodies |
| **Total** | **184.1 KB** | 729.4 KB | |

The large chunk was identified by its API surface — `AnimatePresence`, `useReducedMotion`,
`whileInView`, `viewport`, `spring` — which is precisely the scroll-triggered animation
subset the marketing sections use.

**93% of the landing page's excess payload is the animation library, not the content.**

### Section inventory

All 10 files in `components/marketing/sections/` begin with `'use client'`:

`community` · `curriculum` · `experience` · `faq` · `final-cta` · `hero` · `journey` ·
`portfolio` · `testimonials` · `why`

Seven are composed into `/` via `app/(marketing)/page.tsx`: `hero`, `portfolio`, `why`,
`curriculum`, `experience`, `journey`, `final-cta`.

> **Correction to the roadmap's evidence line.** The roadmap states "all 11 marketing
> sections". The current tree contains **10** section files, of which **7** are on the
> landing page. The direction of the finding is unchanged; the count is not.

---

## 4. Lighthouse baseline

### Mobile — the CWV-sensitive profile

| Category | Score |
|---|---:|
| **Performance** | **44** |
| Accessibility | 96 |
| Best Practices | 96 |
| SEO | 100 |

| Metric | Value | CWV threshold | Rating |
|---|---:|---|---|
| First Contentful Paint | 3.1 s | — | — |
| **Largest Contentful Paint** | **7.7 s** | ≤ 2.5 s good, > 4.0 s poor | **POOR** |
| **Total Blocking Time** | **1,100 ms** | ≤ 200 ms good | **POOR** |
| Cumulative Layout Shift | **0** | ≤ 0.1 good | **GOOD** |
| Speed Index | 5.1 s | — | — |
| Time to Interactive | 7.7 s | — | — |
| Max Potential FID | 250 ms | — | — |

Failing diagnostics:

| Audit | Result |
|---|---|
| Reduce unused JavaScript | **Est. savings 195 KiB** (score 0) |
| Reduce JavaScript execution time | **2.5 s** (score 0) |
| Minimize main-thread work | **5.6 s** (score 0) |
| Avoids enormous network payloads | 1,004 KiB (score 1 — passes) |

The single heaviest script in the bootup-time breakdown costs **1,392 ms total /
1,184 ms scripting**.

### Desktop

| Category | Score |
|---|---:|
| **Performance** | **93** |
| Accessibility | 96 |
| Best Practices | 96 |
| SEO | 100 |

| Metric | Value | Rating |
|---|---:|---|
| First Contentful Paint | 0.4 s | good |
| Largest Contentful Paint | 1.6 s | good |
| Total Blocking Time | 10 ms | good |
| Cumulative Layout Shift | 0 | good |
| Speed Index | 1.1 s | good |

Desktop is healthy. **The problem is mobile-only** — which is where the CPU throttle
makes the 683 KB of animation JavaScript expensive to parse, compile and execute.

### Landing vs. control

| | `/` (landing) | `/about` (control) | Delta |
|---|---:|---:|---:|
| Mobile Performance | **44** | 54 | **−10 points** |
| First Contentful Paint | 3.1 s | 2.8 s | +0.3 s |
| Largest Contentful Paint | **7.7 s** | 6.9 s | **+0.8 s** |
| Total Blocking Time | **1,100 ms** | 630 ms | **+470 ms** |
| Time to Interactive | 7.7 s | 6.9 s | +0.8 s |
| JS gzip | 529.1 KB | 345.0 KB | +184.1 KB |

The control establishes that a ~345 KB shared baseline already costs this application a
mobile score in the low 50s. The landing page's animation chunk then costs a **further
10 Performance points and 470 ms of main-thread blocking on top of that.**

---

## 5. Budget comparison

Against the performance budget (< 200 KB gzipped initial JS; Lighthouse Performance ≥ 90):

| Budget | Landing page | Status |
|---|---:|---|
| Initial JS < 200 KB gzip | 529.1 KB | **2.6× over** |
| Lighthouse Performance ≥ 90 (mobile) | 44 | **FAIL** |
| Lighthouse Performance ≥ 90 (desktop) | 93 | PASS |
| LCP ≤ 2.5 s (mobile) | 7.7 s | **FAIL** |
| TBT ≤ 200 ms (mobile) | 1,100 ms | **FAIL** |
| CLS ≤ 0.1 | 0 | PASS |

---

## 6. What is *not* a problem

Measured and found healthy — these are recorded so B12-B does not widen into them:

- **CLS is 0** on both profiles. Layout stability needs no work.
- **ISR is already correct**: `revalidate = 3600` on `/`, `/curriculum`, `/lessons/[slug]`;
  `1800` on `/reviews`. Caching is not the variable.
- **Images**: `next/image` throughout, zero raw `<img>`. The four `unoptimized` sites are
  deliberate (DEBT-07, "keep `unoptimized`"). Roadmap excludes image work from B12-B.
- **Fonts**: no font-related audit failure; no layout shift attributable to fonts.
- **Total network payload passes** (1,004 KiB, score 1). The cost is CPU, not bandwidth.
- **Accessibility 96 / SEO 100** on both profiles. No regression from B11-A/B/C.
- **Third-party**: Google Tag Manager costs 456 ms / 377 ms scripting and 70 KB of unused
  bytes. Real, but the roadmap explicitly excludes analytics changes from B12-B.

---

## 7. Conclusion and gate decision

**A measurable problem exists.** The landing page:

- ships **184.1 KB gzipped** more JavaScript than any other route, **171.7 KB of which is
  the framer-motion runtime**;
- scores **44** on mobile Lighthouse Performance against a ≥ 90 budget;
- has a **POOR** LCP (7.7 s) and a **POOR** TBT (1,100 ms);
- is measurably **10 Performance points and 470 ms TBT worse** than an equivalent
  marketing page that does not load the animation chunk.

**B12-B proceeds.** Its stated objective — extracting the animated wrappers so the
section bodies become server components, starting with `hero` and `portfolio` — targets
exactly the chunk this report identifies as the cause.

### Success criteria for B12-B, fixed here

Re-measure with this same method and compare against these numbers:

| Metric | B12-A baseline | B12-B target |
|---|---:|---|
| `/` JS gzip | 529.1 KB | measurable reduction |
| framer-motion on first load | 171.7 KB gzip | reduced or deferred |
| Mobile Performance | 44 | improved |
| Mobile TBT | 1,100 ms | improved |
| Mobile LCP | 7.7 s | improved |
| CLS | 0 | **must stay 0** |
| Accessibility | 96 | **must not regress** |
| SEO | 100 | **must not regress** |

### Out of scope for B12-B

Image work · font work · analytics/GTM · ISR or caching · the shared 345 KB app baseline
(a separate, larger question this batch does not authorize).

---

## 8. Reproduction

```bash
cd apps/web
rm -rf .next && npm run build
npm run start &
npx lighthouse http://localhost:3000/ --output=json --output-path=./lh-mobile.json \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu" --quiet
npx lighthouse http://localhost:3000/ --preset=desktop --output=json \
  --output-path=./lh-desktop.json --chrome-flags="--headless=new --no-sandbox --disable-gpu" --quiet
```

Per-route gzip payload is derived by parsing `(src|href)="/_next/static/**.js"` out of
`.next/server/app/<route>.html` and gzipping each referenced file from `.next/static/`.
Landing-only chunks are the set difference against `/about`'s script list.
