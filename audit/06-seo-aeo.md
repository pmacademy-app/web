# Prodily — SEO & AEO Audit

**Date:** 2026-10-17
**Commit audited:** `d43e3f2` (origin/main)
**Live host audited:** https://prodily.adityagangwani.me (see SEO-01: `prodily.app` does not exist)
**Auditor topic:** search engine optimization and answer-engine optimization (being cited by ChatGPT, Perplexity, Google AI Overviews / AI Mode, Gemini, Claude, Copilot)

---

## Scope & method

**Code read (read-only):** `apps/web/app/layout.tsx`, `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts`, every `app/(marketing)/**/page.tsx`, `app/(portfolio)/p/[username]/**`, `app/verify/[certificateId]/page.tsx`, `app/(app)/layout.tsx`, `app/(auth)/layout.tsx`, `app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx`, `proxy.ts`, `next.config.ts`, `lib/brand.ts`, `lib/schema.ts`, `lib/certificates.ts`, `lib/frameworks.ts`, `lib/portfolio.ts`, `lib/portfolio-db.ts`, `config/content.ts`, `config/navigation.ts`, `components/marketing/frameworks-explorer.tsx`, `components/marketing/faq-explorer.tsx`, `renderer/` and `blocks/`, the three SEO test files, and the content corpus (`content/lessons/*.md`, `content/dist/*.json`, `content/master_glossary.json`).

**Live checks (read-only GETs):** 30+ production URLs fetched with a Googlebot user agent (status, redirects, `<head>` tags, headings, JSON-LD, internal links, payload sizes), the same pages re-fetched as GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Bingbot, DNS and RDAP lookups for `prodily.app` and `prodily.com`, and the JS/CSS bundle sizes on the home page.

**Web research:** Google Search Central docs on AI features and the June 2025 structured-data retirements, schema.org type definitions, 2026 studies on llms.txt usage, Bing's AI Performance report, and SERP spot checks for target queries. Sources are listed at the end.

**Limitations:** no access to Google Search Console, Bing Webmaster Tools or analytics; PageSpeed Insights returned HTTP 429 (no API key), so there is no field Core Web Vitals data; the web-search tool is not Google, so SERP observations are indicative. No search-volume numbers are given anywhere in this report; where demand is discussed it is a qualitative judgment from the SERPs observed.

---

## Scorecard

| Area | Score (0–10) | One-line reason |
|---|---|---|
| Crawl & index | 4 | Server-rendered and mostly well-scoped, but robots.txt blocks `/reviews`, the sitemap lists a 307 redirect and no portfolios, every `lastmod` is "now", and the brand domain question is unresolved. |
| Metadata | 5 | Unique titles exist, but 90 lesson descriptions are one template, titles open with "Lesson N:", 28 are over 60 characters, and old-brand/duplicate-brand titles remain. |
| Structured data | 5 | Broad coverage (Organization, WebSite, Course, LearningResource, BreadcrumbList, FAQPage, DefinedTermSet, ProfilePage, Credential) with no fake ratings, but invalid types/properties, wrong module names, 85/90 lessons labelled "Advanced", no dates. |
| Content depth | 6 | ~382k words of real lesson content and about half of each lesson is public, but the glossary (479 terms), ~180 named models, 270 interview questions and the cheat sheets are hidden, and an em-dash purge broke thousands of sentences. |
| Internal linking | 4 | `/curriculum` links all 90 lessons, but lessons carry no contextual links (1,794 unlinked "Lesson N" mentions across the corpus), breadcrumbs point at the wrong module, and the footer "Glossary" link is a redirect. |
| Performance & rendering | 6 | Static/ISR HTML with care for LCP, but 50–62% of each page's HTML is the RSC payload (335 KB on lesson 29), ~830 KB of JS (uncompressed) on the home page, and FAQ answers exist only client-side. |
| E-E-A-T | 3 | No visible author bylines or dates, a one-sentence founder note, "proprietary" claims on well-known frameworks, citations without links, and the brand lives on the founder's personal subdomain. |
| AEO readiness | 3 | AI crawlers are allowed and get full HTML, but there are no answer-first summaries, no glossary, no llms.txt, conflicting numeric facts, and the brand does not surface in search for its own name. |
| **Overall** | **4.5 / 10** | Strong raw material, weak exposure. Most of the upside is in surfacing content that already exists. |

---

## Executive summary

- **The domain is not settled.** `prodily.app` is not registered (`.app` registry RDAP returns 404; DNS returns NXDOMAIN). The live site, every canonical, the sitemap and the JSON-LD `@id`s use `prodily.adityagangwani.me`, a subdomain of the founder's personal site. Code defaults in `lib/admin/settings-service.ts` still point at `support@prodily.app`. Decide the permanent domain now, while search equity is close to zero, and register `prodily.app` today if it is the plan.
- **Three crawl bugs are cheap to fix:** `Disallow: /review` also blocks `/reviews` (which is in the sitemap), `Disallow: /app` also blocks `/apple-touch-icon.png`, and `Disallow: /api/` blocks the portfolio OG card images, which X and LinkedIn fetch subject to robots.txt.
- **The module taxonomy is wrong on the live site.** `/curriculum` shows "Design, UX & Prototyping" above the Metrics lessons, "Metrics, Growth & Experiments" above the leadership lessons, and "Stakeholders & Leadership" above the strategy lessons. Lesson breadcrumbs and the Course JSON-LD carry the same errors. Search engines and AI answers will describe the course wrongly until this is fixed.
- **The best AEO asset is unused.** `content/master_glossary.json` holds 479 defined terms mapped to lessons, yet `/glossary` 307-redirects to `/frameworks`. The lessons also contain 90 mental models, 91 named frameworks, 270 interview questions, 90 cheat sheets and 90 key-takeaway lists; the public preview cuts each lesson off before the cheat sheet, takeaways and glossary.
- **Lesson pages are under-targeted.** Titles read "Lesson 29: Prioritization Fundamentals | Prodily", descriptions read "Read Lesson 29 of Prodily. Prioritization Fundamentals (Module: …)", and URLs are `/lessons/lesson-029`. None of them name the query a learner types ("RICE vs MoSCoW", "what is a PRD").
- **Content quality regression:** commit `418917d` deleted ~4,950 em dashes from the lessons without replacing them, producing run-on sentences such as "doesn't manage the engineers as direct reports what, precisely, are they accountable for?" This hurts readability and makes sentences harder for AI systems to quote cleanly.
- **E-E-A-T is thin:** lessons name Aditya Gangwani as author only inside JSON-LD; there is no visible byline, no "updated" date, no founder bio beyond one sentence, and `/frameworks` calls IDEO's desirability/feasibility/viability lens a "proprietary" Prodily framework.
- **Brand visibility is near zero.** A search for "Prodily" returned only a Product Hunt mirror (hunted.space, #37 of the day, 0 upvotes) plus unrelated results; the official site did not appear. Fixing the items above matters more than llms.txt, which current studies show AI crawlers barely request.

---

## Findings

Severity: **Critical** (blocks indexing or brand identity), **High** (large ranking/citation impact), **Medium**, **Low**. Effort: **S** (< 1 day), **M** (1–5 days), **L** (> 1 week).

### SEO-01 — Brand domain is unregistered; site lives on the founder's personal subdomain
**Severity:** Critical (entity and long-term equity) · **Effort:** S to register, M to migrate

**Evidence**
- `Resolve-DnsName prodily.app` → "DNS name does not exist"; the `.app` registry RDAP (`pubapi.registry.google/rdap/domain/prodily.app`) returns 404 while `cash.app` returns a record, so the domain appears to be unregistered as of 2026-10-17.
- Live canonicals, `og:url`, sitemap `<loc>` and every JSON-LD `@id` use `https://prodily.adityagangwani.me` (for example, `<link rel="canonical" href="https://prodily.adityagangwani.me/curriculum"/>`).
- `apps/web/lib/brand.ts:10,26,27` hard-code `prodily.adityagangwani.me` as `domain`, the `siteUrl` fallback, and `supportEmail`.
- `apps/web/lib/admin/settings-service.ts:46,106,107` default `contactEmail`, `fromEmail` and `replyToEmail` to `@prodily.app` addresses on the unregistered domain. `siteDescription` there is still "Product Management Academy" (line 45).
- `prodily.com` is registered by an unknown party (RDAP: registered 2019-09-29) and did not respond.
- `getEducationalOrganizationSchema()` lists `https://adityagangwani.me` in the Organization's `sameAs` (`lib/schema.ts:32`), which tells search engines that the company and the founder's personal site are the same entity.

**Note on the mismatch:** the SEO code (canonicals, sitemap, JSON-LD via `BRAND.siteUrl`) is internally consistent with the live host. The mismatch is between that host and the brand domain the team refers to as production (`prodily.app`), which also appears in admin email defaults and test fixtures but has no DNS and no registration.

**Why it matters:** links, citations and brand searches earned on a personal subdomain have to be migrated later, and every migration loses some equity. A personal-domain host also weakens the "Prodily" entity in Google's Knowledge Graph and in AI answers. Today the site has almost no search equity, so a move costs close to nothing.

**Fix**
1. Register `prodily.app` now, whether or not you move. It is cheap and stops anyone else from taking it.
2. Pick one permanent host. If it is `prodily.app`: add the domain in Vercel, set `NEXT_PUBLIC_SITE_URL=https://prodily.app`, update `BRAND.domain`, `siteUrl` and `supportEmail`, 308-redirect every path on `prodily.adityagangwani.me` to the same path on the new host (Vercel domain redirect), use Search Console's Change of Address tool, and resubmit the sitemap. Do it in the same release as SEO-05's slug change so there is only one migration.
3. Remove `https://adityagangwani.me` from the Organization `sameAs`; keep it on the founder `Person` node only.
4. Fix the `@prodily.app` defaults in `settings-service.ts` (or make sure the domain has working mail before relying on them).

---

### SEO-02 — robots.txt blocks `/reviews`, the touch icon, and the social card images
**Severity:** High · **Effort:** S

**Evidence**
- Live `robots.txt` (fetched 2026-10-17) contains `Allow: /` and `Disallow: /review`. Robots matching is by prefix and the longest rule wins, so `/review` (7 characters) beats `/` (1) for `/reviews`. `/reviews` is listed in `sitemap.xml`, so Search Console will report "Submitted URL blocked by robots.txt". Source: `apps/web/app/robots.ts:25`.
- `Disallow: /app` (`robots.ts:36`) matches `/apple-touch-icon.png` and any future `/app…` path. There is no `/app` route: `(app)` is a route group.
- `Disallow: /api/` (`robots.ts:33`) covers `/api/og/portfolio/<username>`, the `og:image` of every public portfolio and capstone page. Twitterbot and LinkedInBot honour robots.txt for card images, so portfolio shares can appear without a picture. Portfolio sharing is a core growth loop.
- The `Allow:` list (`robots.ts:11–22`) is redundant next to `Allow: /` and omits `/faq` and `/reviews`, which is harmless but suggests intent was misread.

**Fix** (`apps/web/app/robots.ts`):
```ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/og/'],          // longest match lets card images through
        disallow: [
          '/dashboard', '/review$', '/review/', '/progress', '/settings',
          '/leaderboard', '/admin', '/onboarding', '/capstones', '/badges',
          '/academy/', '/login', '/api/',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
```
Google and Bing support `$`. All `(app)` routes are already `noindex` (`app/(app)/layout.tsx:13`) and redirect anonymous visitors, so dropping `/review` entirely is also acceptable. Update `lib/__tests__/seo-canonicals.test.ts:55` and `seo-social-metadata.test.ts:56` accordingly, and add a test that `/reviews` and `/api/og/portfolio/x` are crawlable.

---

### SEO-03 — Module names do not match the lessons under them (live)
**Severity:** High · **Effort:** S to M

**Evidence**
- The compiled curriculum (`content/dist/curriculum.json`) orders modules as foundations (1–10), discovery (11–20), design (21–30: MVP, PRD, User Stories … Prioritization, Design Thinking), execution (31–40: Agile, Scrum …), growth (41–50: metrics, funnels, A/B tests, pricing, GTM), leadership (51–60), technical (61–70), strategy (71–80), capstone (81–90).
- `config/content.ts:21–102` (`MODULES`) titles them in a different order: 3 "Defining Products & PRDs", 4 "Prioritization & Roadmaps", 5 "Design, UX & Prototyping", 6 "Metrics, Growth & Experiments", 7 "Technical Fluency", 8 "Stakeholders & Leadership".
- `/curriculum` slices lessons by index (`app/(marketing)/curriculum/page.tsx:89`) and labels them with `MODULES`. Live result: the section `id="module-design"` titled "Design, UX & Prototyping" lists Product Metrics Fundamentals, North Star Metrics & Metric Trees, Funnel Analysis; `module-growth` "Metrics, Growth & Experiments" lists Communicating with Executives, Storytelling, Negotiation; `module-leadership` "Stakeholders & Leadership" lists Product Strategy Frameworks, Enterprise & B2B, Selling to Committees.
- Lesson pages use a third mapping (`app/(marketing)/lessons/[slug]/page.tsx:23–39`): live, lesson 29 "Prioritization Fundamentals" and lesson 22 "PRD" are labelled "Module: Design, UX & Prototyping", and their breadcrumb links to `/curriculum#module-design`, which is the section that lists the metrics lessons.
- A fourth label set exists in `app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx:34` (`MODULE_LABEL`), e.g. "Design Thinking & UX", "Growth & Metrics".
- The Course JSON-LD `hasPart` and the home page module list both use `MODULES`, so the structured data repeats the error.

**Fix:** make `content/dist/curriculum.json` modules the only source of truth. Give each compiled module a display title and description (in the compiler or a single `MODULE_META` keyed by module id), and have `/curriculum`, the home curriculum section, lesson breadcrumbs, `getCourseSchema()` and the academy page all read from it. Group lessons by `lesson.module`, not by index. Add a test asserting that every lesson's breadcrumb module equals the `/curriculum` section that lists it.

---

### SEO-04 — `/glossary` is a temporary redirect; 479 defined terms are unused
**Severity:** High (largest single content opportunity; see also AEO-02) · **Effort:** S for the redirect, M for the hub, L for term pages

**Evidence**
- `app/(marketing)/glossary/page.tsx:4` calls `redirect('/frameworks')`. Live: `GET /glossary` → **307** `Location: /frameworks` with a 41 KB HTML body.
- `/glossary` is in the sitemap (`app/sitemap.ts:42`), in the robots allow list (`robots.ts:19`), in the footer (`config/navigation.ts:47`) and linked twice from the home page. A temporary redirect asks Google to keep indexing the old URL, so it is the wrong signal either way.
- `content/master_glossary.json` (479 entries) and `content/dist/glossary-index.json` hold term, definition, related concepts, difficulty and `first_taught_lesson`/`appears_in_lessons`. Examples present: RICE, MoSCoW, Product Requirements Document (PRD), North Star Metric (NSM), Minimum Viable Product (MVP), Product-Market Fit (PMF), Net Promoter Score (NPS), Technical debt, Product-led growth (PLG), Moat, Cohort, Funnel.
- Gaps in the glossary for high-intent terms: no entry for Jobs to Be Done (despite lesson 6), OKR, Kano model, A/B test, churn, DAU/MAU.

**Fix**
1. **Now:** switch to `permanentRedirect('/frameworks')` (308) or remove `/glossary` from the sitemap, footer and home until the real page ships.
2. **Next:** build `/glossary` as a server-rendered A–Z hub: one `<dl>` with all 479 terms (`<dt id="rice">`, `<dd>` definition, "Taught in Lesson N" link), filter by module, and `DefinedTermSet` JSON-LD whose `hasDefinedTerm[].url` points at the anchor or term page.
3. **Later:** add `/glossary/[term]` pages only for the ~60–80 terms with real search demand (see the keyword plan). Each needs more than the one-line definition: a 40–60 word answer, a worked example, "common mistake", related terms, and the lesson link. Do not publish 479 one-sentence pages; that is thin content.
4. Fill the gaps above (JTBD, OKR, A/B test, churn) in `master_glossary.json`.

---

### SEO-05 — Lesson titles, descriptions and URLs do not target queries
**Severity:** High · **Effort:** M (metadata), M–L (slugs)

**Evidence**
- Title template `Lesson ${globalOrder}: ${lesson.title}` (`lessons/[slug]/page.tsx:61`) → live "Lesson 29: Prioritization Fundamentals | Prodily". The page body covers RICE, MoSCoW, "eat the frog" and prioritization theater, none of which appear in the title.
- Description template (`lessons/[slug]/page.tsx:62`) → live "Read Lesson 29 of Prodily. Prioritization Fundamentals (Module: Design, UX & Prototyping)." (90 chars). All 90 descriptions follow this pattern, and the twitter description repeats it.
- 28 of 90 rendered titles exceed 60 characters (lessons 53, 59–64, 66–74, 77–84, 86–88, 90; e.g. lesson 69 is 85 chars).
- URLs are `/lessons/lesson-001`…`/lessons/lesson-090`, and `seo-social-metadata.test.ts:22` enforces that pattern.
- Each lesson already has a `summary` block and `glossaryTermsIntroduced` (e.g. lesson 29: `["RICE","MoSCoW","\"Eating the Frog\"","\"Prioritization Theater\" (Failure Pattern)"]`), so better metadata can be generated or hand-written from existing data.

**Fix**
1. Add optional `seoTitle` and `seoDescription` fields to the lesson front matter, compile them into `content/dist`, and fall back to a better template:
```ts
// lessons/[slug]/page.tsx — generateMetadata
const title = lesson.seoTitle ?? lesson.title            // no "Lesson N:" prefix
const description =
  lesson.seoDescription ??
  firstSentences(summaryText(lesson), 155)               // from the summary block
return {
  title,                                                  // template adds " | Prodily"
  description,
  alternates: { canonical: canonicalUrl },
  openGraph: { title: `${title} | Prodily`, description, url: canonicalUrl, type: 'article',
               modifiedTime: lesson.updatedAt, images: [/* per-lesson card, SEO-10 */] },
}
```
2. Hand-write the top 20 first. Examples:

| Lesson | Current title | Proposed title (≤ 60 chars) | Proposed description |
|---|---|---|---|
| 1 | Lesson 1: What is Product Management? | What Is Product Management? Role, Scope, Examples | Product management is deciding, with evidence, which problem is worth solving and why. Learn the three questions every PM answers. |
| 2 | Lesson 2: Product vs. Project | Product vs Project Management: Key Differences | — |
| 6 | Lesson 6: Jobs To Be Done | Jobs to Be Done (JTBD) Framework, Explained | — |
| 22 | Lesson 22: Product Requirements Document (PRD) | What Is a PRD? How to Write One (With Structure) | A PRD states the problem, users, goals, scope and non-goals before solutions. See the structure and the over-specification trap. |
| 29 | Lesson 29: Prioritization Fundamentals | RICE vs MoSCoW: Prioritization Frameworks for PMs | RICE = (Reach × Impact × Confidence) / Effort. Learn when to use RICE or MoSCoW, and how to spot prioritization theater. |
| 42 | Lesson 42: North Star Metrics & Metric Trees | North Star Metric and Metric Trees, With Examples | — |
| 45 | Lesson 45: A/B Testing & Experimentation | A/B Testing for Product Managers: A Practical Guide | — |

Keep "Lesson 29 of 90" visible on the page and in breadcrumbs; it just should not lead the `<title>`.
3. Descriptive slugs (`/lessons/rice-moscow-prioritization`) are worth doing only together with the domain move in SEO-01, with 308 redirects from `lesson-NNN` and a slug map in the compiler. If the domain stays, keep the current slugs; titles and content matter far more than URL words.

---

### SEO-06 — Sitemap: lastmod is always "now", a redirect is listed, portfolios are missing
**Severity:** Medium · **Effort:** S

**Evidence**
- Live sitemap: 100 URLs (10 marketing + 90 lessons). Every `<lastmod>` is `2026-10-17T07:36:55Z` because every entry uses `new Date()` (`app/sitemap.ts:25–88`). Google ignores `lastmod` values that are always new.
- `/glossary` (a 307) is listed (`sitemap.ts:42`).
- **Zero `/p/` URLs**, although `/p/adityagangwani` is public, `index, follow`, and linked from the home page. The portfolio query (`lib/portfolio-db.ts:649–674`) swallows errors and returns `[]`, and `sitemap.ts:96–113` logs and continues. Inference: either the query errored at generation time or no service-role env was available when the sitemap was rendered. The tests only require ≥ 97 URLs, so CI passes with zero portfolios.
- `getPublicPortfolioSitemapEntries` selects `username, created_at` only, so `entry.updatedAt` (`sitemap.ts:99`) is always undefined and portfolio `lastmod` would be the account creation date.
- Indexable capstone case-study pages (`/p/[username]/capstones/[moduleSlug]`, live `index, follow`, with `CreativeWork` JSON-LD) are not in the sitemap.

**Fix**
```ts
// lessons: use the compiled lesson's updatedAt
const lessonRoutes = await Promise.all(curriculum.lessons.map(async (l) => {
  const full = await fetchCompiledLesson(l.id)
  return { url: `${siteUrl}/lessons/${l.slug}`, lastModified: full?.updatedAt ?? BUILD_DATE }
}))
// marketing pages: a fixed per-page date (or the git commit date at build), not new Date()
// portfolios: select updated_at too, and fail loudly in CI if count is 0 while public rows exist
```
Also add capstone pages that have published content, and add `export const revalidate = 3600` to `sitemap.ts` so new portfolios appear without a deploy. Change the tests to assert that at least one `/p/` URL is present when the fixture has a public portfolio.

---

### SEO-07 — Portfolio canonical copies the requested URL casing
**Severity:** Medium · **Effort:** S

**Evidence:** live `GET /p/AdityaGangwani` → 200 with `<link rel="canonical" href="https://prodily.adityagangwani.me/p/AdityaGangwani"/>`, while `/p/adityagangwani` canonicalises to itself. `formatPortfolioShareUrl` (`lib/portfolio.ts:138–141`) uses the route param as given. Every learner's portfolio can therefore exist under several self-canonical URLs. The OG card route already canonicalises to lowercase (`lib/og/card-paths.ts`), so the pattern exists in the codebase.

**Fix:** in `app/(portfolio)/p/[username]/page.tsx`, build the canonical from the stored `portfolio.user.username` (lowercased), and `permanentRedirect()` when `params.username` differs. Apply the same to the capstone page. Soft 404s: `/p/doesnotexist12345` and `/verify/<invalid>` return 200 with `noindex`; calling `notFound()` would return a proper 404 (Low).

---

### SEO-08 — FAQ page: answers missing from HTML, old brand in title, vague answers
**Severity:** Medium · **Effort:** S

**Evidence**
- `FAQExplorer` is a client component that renders only the open item inside `AnimatePresence` (`components/marketing/faq-explorer.tsx:86,119–136`). Live `/faq` HTML contains the answer to question 1 only; the other 9 answers exist only in the FAQPage JSON-LD and the RSC payload. Google wants structured data to match visible content, and AI crawlers that read HTML do not see the answers.
- Title "Product Management Academy FAQ | Prodily" (`app/(marketing)/faq/page.tsx:13,20,36`) uses the old brand. The brand test (`seo-structured-data.test.ts:45`) checks six pages and skips `/faq`.
- "How long does it take?" is answered without a number (`config/content.ts:229–231`), the question most likely to be asked of an AI engine.

**Fix:** render every item server-side with `<details>`/`<summary>` (or keep the animation but always render the answer with `hidden={!isOpen}` and the `until-found` pattern), put each question in an `<h2>` or `<h3>`, retitle to "Prodily FAQ: Free Product Management Course Questions", add `/faq` to the brand test, and answer with numbers taken from the content (see AEO-05). Note that FAQ rich results have been limited to government and health sites since 2023, so the FAQPage markup helps understanding, not SERP display.

---

### SEO-09 — Structured data: invalid types, wrong values, fragmented entities
**Severity:** Medium · **Effort:** M

**Evidence and fixes**

| Issue | Evidence | Fix |
|---|---|---|
| `CourseUnit` is not a schema.org type | `lib/schema.ts:79`; schema.org has no `CourseUnit` (it was a 2016 proposal) | Use `syllabusSections: [{ '@type': 'Syllabus', name, description, timeRequired }]` per module, or `hasPart` items of type `Course`. |
| Course has no `offers` and states 45 hours | `lib/schema.ts:57–85`; lesson data sums to 50.6 h reading / 73.3 h with practice | Add `offers: { '@type': 'Offer', price: 0, priceCurrency: 'INR', category: 'Free' }`, compute workload from content, add `teaches`, `educationalLevel: 'Beginner'`, `coursePrerequisites: 'None'`. Google retired Course Info rich results in 2025, so this is for entity accuracy and AI systems, not SERP features. |
| 85 of 90 lessons marked "Advanced" | `lib/schema.ts:103–108` maps difficulty 1 → Beginner, 2 → Intermediate, else Advanced; difficulty is on a 1–10 scale (lesson MD: "Difficulty 5 / 10"); distribution: 1×4, 2×1, 3×11, 4×23, 5×20, 6×20, 7×10, 8×1 | 1–3 Beginner, 4–6 Intermediate, 7–10 Advanced. |
| Lessons have no dates, image or topic | Live lesson JSON-LD has no `datePublished`, `dateModified`, `image`, `about` or `teaches` | Add `dateModified: lesson.updatedAt`, `datePublished` (first compile date), `image`, `teaches` (learning objectives), `about` (DefinedTerms from `glossaryTermsIntroduced`), `isAccessibleForFree: true`. |
| Lesson description is the template | `lib/schema.ts:116` | Use the summary (SEO-05). |
| Breadcrumb module is wrong and uses a `#fragment` | Live lesson 29 breadcrumb: "Design, UX & Prototyping" → `/curriculum#module-design` | Fix via SEO-03; Google drops fragments, so the module crumb resolves to `/curriculum` anyway. Consider real `/curriculum/[module]` pages later. |
| `grantee` is not a property of `EducationalOccupationalCredential` | `lib/certificates.ts:75`; schema.org lists no `grantee` on this type | Remove it; describe the learner through the page's `about`/`mainEntity`, and keep `recognizedBy`, `credentialCategory`, `educationalLevel`, `dateCreated`. |
| One person, three entities | Org `founder` `#person-aditya` (no LinkedIn), `/about` Person `sameAs` = Buy Me a Coffee + personal site, `/p/adityagangwani#person` with LinkedIn and GitHub | One `Person` with one `@id`, referenced everywhere, with `sameAs` LinkedIn, GitHub, personal site. |
| Org `sameAs` mixes in the founder's site and Buy Me a Coffee; LinkedIn slug is the old brand | `lib/schema.ts:27–33`; `linkedin.com/company/prodilypmacademy` | Keep official Prodily profiles (LinkedIn, X, Instagram, Product Hunt); rename the LinkedIn vanity URL to `/company/prodily` if available. |
| `DefinedTermSet` text is not what the page shows, and claims originality | `/frameworks` JSON-LD uses `fw.definition` while cards show `COMPACT_DATA.coreRule`; name "Prodily Original Frameworks", description "Proprietary…" (`frameworks/page.tsx:47–49`) | Mark up the visible text; drop "proprietary" (see EEAT-01). |

Add a CI check that runs every JSON-LD block through a schema.org vocabulary validator (for example, schemarama or the Schema.org validator API) so invalid types fail the build.

---

### SEO-10 — Social and head metadata gaps
**Severity:** Low–Medium · **Effort:** S

**Evidence**
- `/curriculum` sets `openGraph` but not `twitter`, so it inherits the home page's `twitter:title` ("Free Product Management Course with a Portfolio | Prodily"). Confirmed live.
- No `twitter:site` / `twitter:creator` anywhere, although `@prodily_pm` exists (`lib/brand.ts:13`).
- Duplicate brand in titles: "About Prodily | Prodily", "Contact Prodily | Prodily" (template plus brand in the page title). Portfolio titles: "Aditya Gangwani | Product Management Fellow at Prodily | Portfolio | Prodily" (76 chars, brand twice); capstone titles reach 91 chars.
- `/brand/og-image.png` is **1,312,149 bytes**. Several chat apps are widely reported to skip large preview images (WhatsApp around 300 KB; this is a commonly reported limit, not a published spec). All 90 lessons and all marketing pages share this one image.
- Verified-certificate pages define `openGraph` without `images` (`app/verify/[certificateId]/page.tsx:104–109`). Next.js replaces, rather than merges, a parent's `openGraph`, so certificate shares on LinkedIn probably have no image. Inferred from code; no valid certificate ID was available to test.
- No `google-site-verification` or `msvalidate.01` meta tags are present (the env vars are unset). Verification may be done through DNS instead; confirm.
- `keywords` meta (`app/layout.tsx:44–52`) is ignored by Google; harmless.

**Fix:** add `twitter: { site: '@prodily_pm', creator: '@prodily_pm' }` to the root metadata and a `twitter` block to `/curriculum`; use `title: 'About'` / `'Contact'` so the template adds the brand once; shorten portfolio titles to `${name} — PM Portfolio`; compress the OG image to < 200 KB (PNG-8 or high-quality JPEG/WebP at 1200×630); add `opengraph-image.tsx` for lessons (title + module + "Free lesson") and a certificate card; confirm Search Console and Bing Webmaster Tools are verified.

---

### SEO-11 — Internal linking is hub-only
**Severity:** Medium · **Effort:** M

**Evidence**
- `/curriculum` links all 90 lessons (107 unique internal links), and lesson pages link to previous/next lesson. That is the whole graph.
- Live lesson 29 mentions "Lesson N" 24 times in body text with **no** links; across the corpus there are 1,794 such mentions (`content/dist/lessons/*.json`, `searchable.plainText`).
- Lessons never link to `/frameworks` or to glossary terms. `/frameworks` cards link to lessons but there are no `/frameworks/[slug]` pages, and `DefinedTerm.url` points at lesson pages (`frameworks/page.tsx:66`).
- Anchor texts are generic ("Previous Lesson", "Next Lesson", "Open Lesson Guide"). The curriculum shows a visible `<h3>` reading "Module Lessons (10 Direct Links)" (`curriculum/page.tsx:151`), copy written for crawlers rather than readers.
- `content/dist/module-graph.json` and each lesson's `connections` and `prerequisites` already describe the relationships needed for "related lessons" blocks.

**Fix**
1. In the compiler or `DefaultMarkdown`, auto-link `Lesson (\d{1,2})` to `/lessons/lesson-0NN` with the lesson title as `title`. The proxy already upgrades signed-in users to the academy copy.
2. Auto-link the first mention of each glossary term on a lesson page to its `/glossary#term` anchor (later `/glossary/[term]`).
3. Add a "Prerequisites" and "Builds toward" block on public lessons from `prerequisites`/`connections`, with the lesson titles as anchor text.
4. Use the next lesson's title as anchor text ("Next: Design Thinking").
5. Rename the `<h3>` to "Lessons in this module".

---

### SEO-12 — Rendering and payload weight
**Severity:** Medium–Low · **Effort:** M

**Evidence (live, 2026-10-17)**
- HTML sizes: home 296 KB, `/curriculum` 328 KB, lesson 29 335 KB, `/frameworks` 126 KB. The inline RSC payload (`self.__next_f`) is 50% of the home page, 54% of `/curriculum` and 62% of lesson 29: `BlockTreeRenderer` is a client component (`renderer/block-tree-renderer.tsx:1`), so every preview block is shipped twice, once as HTML and once as JSON props.
- Home page JS: 17 scripts, ~832 KB uncompressed (served brotli). Main CSS: 251 KB uncompressed, render-blocking.
- Mermaid diagrams (203 across the corpus) render client-side only (`blocks/index.ts:10`), so their content is invisible to crawlers.
- `/frameworks` cards start at `opacity: 0` via framer-motion `initial` (`frameworks-explorer.tsx:199`). Text is in the HTML, but any renderer that does not run the IntersectionObserver sees invisible cards.
- Good: the hero H1 deliberately animates transform only, not opacity (`components/marketing/sections/hero.tsx:47`), to protect LCP. All public pages are static or ISR (`revalidate = 3600`) and served from the Vercel cache (`x-vercel-cache: HIT`).
- No field data: PageSpeed Insights returned 429. Check CrUX in Search Console once verified.

**Fix:** render public-lesson preview blocks with server components (a `PublicBlockRenderer` that reuses the prose block markup without client state) so lesson text is not duplicated in the RSC payload; render a static SVG or a text description (`<figcaption>`) for each Mermaid diagram at build time; drop the `initial` opacity on `/frameworks` (keep `y` only, as the hero does); audit the 251 KB stylesheet for unused utilities.

---

### SEO-13 — Lesson content quality regression from the em-dash purge
**Severity:** High (quality and quotability across all 90 lessons) · **Effort:** M

**Evidence**
- Commit `418917d` ("content: remove em dashes from course lessons") changed 91 files and removed ~4,950 em dashes, replacing each with nothing.
- `content/lessons/lesson-001.md:5`: "…doesn't manage the engineers as direct reports what, precisely, are they accountable for?" (was "direct reports — what, precisely…").
- `lesson-001.md:53`: "…through decisions, prioritization, and communication not through direct execution."
- Live lesson 1: "Everything else in this curriculum discovery, prioritization, metrics, execution is a method for…"
- The glossary inherits it: "Output: What a team produces or ships a feature, release, or design change."
- Lesson 29 cheat sheet: "Eat the frog vs. easy wins first context-dependent, not universally correct either way."
- The resources compiler now splits hyphenated words into separate fields (lesson 29: citation "…in a requirements", note "engineering context.").

**Why it matters:** answer engines lift single sentences. A definition that reads as a run-on is less likely to be quoted and, if quoted, reflects badly on the brand. Readers notice too.

**Fix:** revert the content part of `418917d`, then, if the house style bans em dashes, replace each with a comma, colon, parentheses or a full stop by hand (or scripted with per-diff review). Fix the compiler's hyphen split in `scripts/compiler/compile.ts`. A lint cannot reliably detect where a dash was removed, so review by hand, starting with the 90 summaries, key takeaways, cheat sheets and the 479 glossary definitions, since those are the most quoted.

---

### EEAT-01 — Authorship, credentials, dates and attribution are missing
**Severity:** High · **Effort:** M

**Evidence**
- Lesson JSON-LD names Aditya Gangwani as `author` (`lib/schema.ts:122–127`), but no lesson page shows a byline; "Aditya" appears only in the footer and JSON-LD on live lesson 29.
- No visible "published" or "updated" date on any lesson, although compiled lessons carry `createdAt`/`updatedAt`.
- `/about` (live text ~2.7 KB) has one sentence about the founder ("Prodily is an independent effort…"), no photo, no experience, no LinkedIn link, and its prominent action is "Support on Buy Me a Coffee".
- `/frameworks` presents "The Accountability Triangle" (defined as Desirability, Feasibility, Viability) and "North Star Metric Tree" and "The Discovery Flywheel (Continuous Discovery)" under "Prodily Original Frameworks" / "Proprietary Product Management frameworks". A web search for "Accountability Triangle" product management found no such named framework; results attribute desirability/feasibility/viability to IDEO. Teresa Torres (continuous discovery) and Amplitude (North Star) are the commonly cited originators of the others. AI engines cross-check these claims, and a site that over-claims loses trust.
- Lesson resources cite books and "Intercom's publicly shared writing" without links (lesson 29 `resources` block), and the resources block is not in the public preview.
- `/reviews` shows two items labelled "Verified Review". One is attributed to "Vansh Arora, Aspiring Product Manager"; the workstation running this audit belongs to a user of the same name, which suggests a team connection. If so, the review needs a disclosure or should be removed (FTC endorsement rules; Google's reviews guidance). Confirm internally.
- Positive: the footer discloses the operator (sole proprietor, Jaipur address, grievance officer), and commit `f10d676` removed a fabricated rating. Keep both.

**Fix**
1. Add a visible byline and dates to every lesson: "By Aditya Gangwani · Updated 28 Sep 2026 · 30 min read", linking to an author section.
2. Rewrite `/about` with a real founder section: role, PM experience, why the curriculum is structured this way, how lessons are researched and reviewed, a photo, LinkedIn. If any lessons were drafted with AI assistance, say how they are reviewed; disclosure is better than being found out.
3. Rename the frameworks claim to "Prodily's frameworks and mental models" and attribute each one where it builds on existing work ("Prodily's version of IDEO's desirability–feasibility–viability lens, framed around what a PM is accountable for").
4. Show the lesson's sources publicly with links (official Intercom RICE post, book pages) at the end of the preview.
5. Recruit one or two credentialed PM reviewers and show "Reviewed by" on lessons they checked.

---

### AEO-01 — The "Prodily" entity is nearly invisible
**Severity:** High · **Effort:** M–L (ongoing)

**Evidence**
- A web search for `"Prodily"` returned the hunted.space Product Hunt mirror, two Wikipedia beetle pages (*Prodilis*) and a different product, "Prodify". `Prodily product management course` returned the same mirror and unrelated courses. `prodily.adityagangwani.me lessons` returned nothing related. The official site did not appear for its own name.
- The Product Hunt launch listed "Product of the Day #37" with 0 upvotes.
- No Prodily mention appeared in any of the "free product management course" listicles that ranked (Uxcel, Product Compass, Simplilearn, UXCam, Careers360).
- Near-collision brand: "Prodify" (an AI PM tool).

**Why it matters:** Google says AI Overviews and AI Mode draw only from pages that are indexed and eligible for snippets; there is no separate AI index. ChatGPT search and Copilot lean on Bing's index. AI answers about "best free PM courses" are assembled from listicles, Reddit, YouTube and LinkedIn; a brand that appears in none of them is not recommended.

**Fix**
1. Verify the site in Google Search Console and Bing Webmaster Tools (Bing's AI Performance report, public preview since February 2026, shows Copilot citations), submit the sitemap, and use URL Inspection on the home page, `/curriculum`, `/frameworks` and the top 10 lessons.
2. Add IndexNow pings on content builds so Bing (and through it Copilot and ChatGPT search) picks up changes quickly.
3. Entity consolidation: one name everywhere ("Prodily", never "Prodily PM Academy"), LinkedIn vanity URL renamed, consistent description line on X, Instagram, LinkedIn, Product Hunt, GitHub org; same logo; `sameAs` listing all of them.
4. Earn third-party mentions: pitch the free-course roundups that already rank (Uxcel's list, Product Compass, Careers360, UXCam), answer questions on r/ProductManagement and Indian communities with links to specific lessons where genuinely useful, publish founder posts on LinkedIn that link to individual lessons, and relaunch on Product Hunt after the fixes.
5. Track brand mentions monthly (see AEO playbook).

---

### AEO-02 — No answer-first content on public pages; the best blocks are behind the preview cut
**Severity:** High · **Effort:** M

**Evidence**
- The public lesson shows the first 8 non-interactive blocks (`lessons/[slug]/page.tsx:123–125`): heading, two "why this matters" paragraphs, objectives, prerequisites, theory, common mistakes, mental model. The blocks that make the best answer material come later and are not public: `summary`, `keyTakeaways`, `cheatSheet`, `glossary`, `interviewPerspective`, `caseStudy`, `companyExample`, `framework`, `resources`.
- Lesson 29's cheat sheet starts "**RICE = (Reach × Impact × Confidence) / Effort.** Confidence should reflect real evidence quality, not persuasiveness." This is a near-perfect citable line, and it is not on the public page.
- The first public paragraph of each lesson is motivational context ("Across 24 lessons, this curriculum has repeatedly bumped into the same underlying question…"), not a definition. The direct definition of RICE appears several screens down.
- Corpus inventory: 90 summaries, 90 key-takeaway lists, 90 cheat sheets, 270 interview questions with "what the interviewer is evaluating", 90 case studies, 90 company examples across 57 companies, 106 tables, 90 mental models plus 91 named frameworks. Only 12 frameworks are surfaced on `/frameworks`.

**Fix** — expose reference material, keep practice gated. The product is the practice loop (quizzes, flashcards with spaced repetition, reflections, capstones with review, portfolio, certificate); none of that needs to be hidden for SEO, and none of it should be exposed. Reading content is already half public, so publishing the remaining reference blocks costs little and earns most of the citations.
1. Add an "In short" box directly under the H1 of every public lesson: the summary's first two sentences (40–60 words), then the key takeaways as a list. This is the paragraph answer engines quote.
2. Make the `glossary` block public as a "Key terms" `<dl>`, and the `cheatSheet` as a "Cheat sheet" list near the end of the preview.
3. Publish the `interviewPerspective` questions as an "Interview questions on this topic" section with `<h3>` question headings; show "what the interviewer is evaluating" publicly too, and gate the model answers or practice mode.
4. Keep `quiz`, `flashcardDeck`, `reflection`, `connections` interactive and signed-in only (as now).
5. Reorder or relabel so the first visible paragraph after the H1 defines the topic. Example for lesson 29:
   > **RICE** is a prioritization framework that scores each initiative as (Reach × Impact × Confidence) ÷ Effort so that dissimilar ideas can be compared on one scale. **MoSCoW** sorts scope into Must, Should, Could and Won't have, which is easier to explain to stakeholders. Use RICE to rank a backlog and MoSCoW to agree release scope.
6. Fix the FAQ claim "Every lesson is public" on the home page, or make it true; today each lesson is a preview.

---

### AEO-03 — No llms.txt or llms-full.txt
**Severity:** Low · **Effort:** S

**Evidence:** live `/llms.txt` and `/llms-full.txt` return 404; nothing in the repo references llms.txt.

**Context:** 2026 server-log studies (Ahrefs, OtterlyAI) found that 97% of llms.txt files received no requests and that AI bots overwhelmingly fetch HTML. Google's AI-features documentation (updated 2025-12-10) says no special files or markup are needed. Treat llms.txt as a 30-minute hygiene item, not a lever.

**Fix:** `app/llms.txt/route.ts` that renders, from `curriculum.json` and `FRAMEWORKS`:
```
# Prodily
> Free, structured product management course: 90 lessons in 9 modules, applied capstones, a public portfolio and a verifiable certificate. Operated by Aditya Gangwani (sole proprietor, Jaipur, India).

## Start here
- [Curriculum](https://<host>/curriculum): all 90 lessons by module
- [Frameworks](https://<host>/frameworks): product management frameworks and mental models
- [Glossary](https://<host>/glossary): 479 product management terms
- [FAQ](https://<host>/faq)

## Lessons
- [What Is Product Management?](https://<host>/lessons/lesson-001): <summary first sentence>
…
```
The proxy matcher already excludes paths containing a dot, so the route will not run through auth.

---

### AEO-04 — AI crawler access is fine by default; make it explicit and verify the edge
**Severity:** Low · **Effort:** S

**Evidence:** robots.txt has a single `User-agent: *` group with `Allow: /`, so GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot and Google-Extended are all allowed. Requests sent with GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Bingbot user agents got the same 200 responses and byte-identical HTML as Googlebot for `/`, lesson 29 and `/reviews`. These were sent from a normal IP; real bots come from their published ranges, so also check Vercel Firewall and Bot Protection settings (inference: not visible from code).

**Fix:** keep allowing search/answer bots. Decide the training-bot policy deliberately; for a free education brand that wants to be recommended, allowing GPTBot, ClaudeBot and Google-Extended is reasonable. If you ever block training, block by token (GPTBot, ClaudeBot, Google-Extended), never OAI-SearchBot, Claude-SearchBot or PerplexityBot. Make sure Vercel's bot protection does not challenge these user agents.

---

### AEO-05 — Conflicting facts about the course
**Severity:** Medium · **Effort:** S

**Evidence**
- Course JSON-LD: `courseWorkload: 'PT45H'` (`lib/schema.ts:76`). Module labels sum to roughly 47 hours (4–5, 5–6 … 6–8 hrs). Lesson data sums to 50.6 hours of reading and 73.3 hours including quizzes and reflection. The FAQ "How long does it take?" gives no number.
- Module names differ between four places (SEO-03).
- Home FAQ: "Every lesson is public"; public pages are previews.
- `lib/admin/settings-service.ts:45` default `siteDescription: 'Product Management Academy'`.

**Fix:** generate the numbers from content at build time (lessons, modules, capstones, reading hours, practice hours) into one `COURSE_FACTS` object and use it in the FAQ answer, Course JSON-LD, llms.txt and marketing copy. Example answer: "Prodily has 90 lessons in 9 modules. Reading takes about 50 hours; with quizzes, flashcards and reflections, plan on about 70 hours. Each module ends in a capstone." When a real learner median exists, add it with the date.

---

### AEO-06 — No original data to cite
**Severity:** Medium · **Effort:** L

**Evidence:** no page publishes Prodily-specific numbers or research. The platform holds data no competitor has: quiz responses per concept, capstone submissions, skill-radar scores.

**Fix:** publish an annual or semiannual "What new PMs get wrong" report from aggregated, anonymised data: the most-missed quiz concepts, which modules learners abandon, how capstone quality changes across modules. Give each finding a dated, one-sentence statement and a chart, and link to it from the relevant lessons. Only publish numbers that come from the data, with sample sizes. Original statistics are the content type most often cited by answer engines.

---

### AEO-07 — Measurement for AI visibility does not exist
**Severity:** Low · **Effort:** S

**Fix:** keep a fixed panel of ~20 prompts (see the playbook) and run it monthly in ChatGPT (search on), Perplexity, Google AI Mode, Gemini, Copilot and Claude; log whether Prodily is mentioned, which URL is cited, and which competitors appear. Add Bing's AI Performance export and Search Console's "Web" performance (which includes AI Overviews and AI Mode traffic) to the same sheet. Tag referrals from `chatgpt.com`, `perplexity.ai`, `copilot.microsoft.com`, `gemini.google.com` and `claude.ai` in Vercel Analytics and GA4.

---

## Keyword & content plan

Demand notes are qualitative, based on the SERPs observed in October 2026; validate with Search Console impressions once verified and with Google Keyword Planner or Ahrefs before committing writing time. "Existing asset" means the content already exists in `content/`.

| Cluster | Example queries | Who ranks / gets cited now (observed) | Prodily page type | Existing asset | Priority |
|---|---|---|---|---|---|
| **Framework definitions** | rice prioritization framework, rice score formula, moscow method, north star metric, metric tree example, jobs to be done framework, product-market fit, mvp meaning | Tool-vendor blogs: Fibery, Motion, Simpliaxis, PW Skills, Umbrex, ProdCamp (RICE); Product School (DVF) | `/frameworks/[slug]` (formula, worked example, template, mistakes, attribution, lesson link) | 91 framework blocks, 90 mental models, lesson theory, `lib/frameworks.ts` | 1 |
| **PM glossary** | product management glossary, what is a prd, acceptance criteria vs user story, technical debt meaning, plg meaning | Coursera, Xtensio, Ignition, Onclarity, Gocious | `/glossary` hub + `/glossary/[term]` for ~60–80 terms | 479 terms in `master_glossary.json` | 1 |
| **Templates** | prd template, opportunity brief template, problem statement template, product roadmap template | Aha!, TextCortex, SafetyCulture, template sites | `/templates/[slug]` with a copyable Markdown/Google Docs template and a filled example | Capstone briefs (9 deliverables), lesson 22 PRD structure | 2 |
| **PM interview prep** | product manager interview questions, apm interview questions, how to answer prioritization interview question, product sense interview | Exponent, Leland, Guvi, Udemy, Udacity | `/interview-questions` hub + one page per module | 270 questions with "what it evaluates" | 1 |
| **Free course intent** | free product management course, product management course with certificate free, learn product management online free | Uxcel, Simplilearn SkillUp, Coursera audit, roundups | Home, `/curriculum`, `/certificate` explainer (what is verified, sample, LinkedIn add) | Existing pages | 1 (fix pages) + outreach |
| **India** | free product management course india, apm program india, how to become a product manager in india, product manager interview india | Guvi (₹1,499), PW Skills, NextLeap, Udemy; no clearly free India-specific program surfaced | One India guide page (APM programs list with official links and dates, Indian company examples, switching from engineering), not city doorway pages | Operator is in Jaipur; lesson 56 career paths | 2 |
| **Career** | how to become a product manager, product manager career path, product vs project manager, pm portfolio examples | Coursera, Product School, Atlassian | Lessons 1, 2, 56 retitled; `/portfolio-examples` showcasing consenting learners' public capstones | Public portfolios, capstone pages | 2 |
| **Comparisons** | best free product management courses, product school alternatives, nextleap alternatives | Listicles | One honest comparison page with a table (cost, hours, certificate, portfolio, mentor) | — | 3 |

**Page-type rules**
- Every new page opens with a 40–60 word direct answer under the H1, then a table or list, then depth, then the lesson link and a signup CTA.
- One canonical page per concept. RICE lives at `/frameworks/rice`; lesson 29 links to it and covers it in curriculum context. The glossary entry for RICE is a one-paragraph `<dd>` that links to the framework page, not a competing page.
- Templates and frameworks are free and public; the interactive practice on that framework (quiz, flashcards, capstone feedback) is the signup reason.
- Do not mass-generate. Ship 10 excellent framework pages and 30 glossary pages, look at Search Console after 6–8 weeks, then expand.

**First 15 pages to build or rewrite (in order)**
1. `/frameworks/rice` (from lesson 29 theory, Intercom origin, worked example)
2. `/frameworks/moscow`
3. `/glossary` hub (all 479 terms)
4. Lesson 22 retitled "What Is a PRD?" plus `/templates/prd`
5. `/frameworks/north-star-metric` and metric tree (lesson 42)
6. `/frameworks/jobs-to-be-done` (lesson 6; add the missing glossary entry)
7. `/interview-questions` hub (270 questions)
8. Lesson 1 retitled "What Is Product Management?"
9. Lesson 2 retitled "Product vs Project Management"
10. `/frameworks/mvp` (lesson 21)
11. `/glossary/product-market-fit`
12. `/frameworks/ab-testing` (lesson 45)
13. `/certificate` explainer with the verify flow
14. India APM guide
15. `/templates/opportunity-brief` (capstone 1)

---

## AEO playbook for Prodily

1. **Be indexable first.** Google and Bing indexes feed AI Overviews, AI Mode, Copilot and ChatGPT search. Fix SEO-01, SEO-02 and SEO-06, verify both webmaster tools, and use IndexNow. Nothing below matters if the pages are not indexed.
2. **One quotable sentence per concept.** For every framework, glossary term and lesson, write a self-contained definition that names the concept, says what it does, and gives the formula or structure: "RICE is a prioritization framework that scores initiatives as (Reach × Impact × Confidence) ÷ Effort." Put it in the first paragraph after the H1, in the `DefinedTerm.description`, and in llms.txt. Check it reads correctly on its own (SEO-13).
3. **Structure answers the way questions are asked.** Use question-form `<h2>`/`<h3>` headings ("When should you use MoSCoW instead of RICE?"), comparison tables (RICE vs MoSCoW vs Kano vs ICE), numbered steps for "how to" content, and short paragraphs. Keep the content in HTML text; render diagram content as text or SVG too.
4. **Attribute and date everything.** Visible author, reviewer, "Updated" date, and outbound links to original sources (Intercom on RICE, IDEO on DVF, Amplitude on North Star). Answer engines prefer sources that cite sources, and attribution protects against the "proprietary" credibility problem.
5. **Own a few original things and name them consistently.** Prodily's real originals (for example the Prioritization Integrity Checklist, the PRD Precision Dial, the Escalation Staircase) should each get a page with the same name, definition and diagram everywhere. Named, consistent frameworks are what an engine can attribute to Prodily.
6. **Publish numbers nobody else has** (AEO-06), dated and sourced to Prodily's own data.
7. **Show up where engines read.** Roundup articles, Reddit threads, YouTube explainers, LinkedIn posts and Product Hunt are heavily represented in AI answers for "best free PM course" style prompts. Plan two outreach pushes per quarter and keep the brand line identical everywhere.
8. **Make facts machine-consistent.** One `COURSE_FACTS` object feeds the FAQ, JSON-LD, llms.txt and marketing copy (AEO-05). An engine that finds 45, 47, 50 and 73 hours will either hedge or skip you.
9. **Keep practice gated, publish reference.** Reference content (definitions, cheat sheets, interview questions, templates) is public; the practice loop (quizzes, spaced-repetition flashcards, reflections, capstone review, portfolio, certificate) is the signup reason. Every public reference page ends with "Practise this: 10-question quiz and flashcards, free" linking to signup.
10. **Measure monthly** with a fixed prompt panel across ChatGPT, Perplexity, Google AI Mode, Gemini, Copilot and Claude. Suggested prompts:
    - best free product management course with certificate
    - free product management course in India
    - how do I build a product manager portfolio with no experience
    - what is the RICE prioritization framework
    - RICE vs MoSCoW
    - how to write a PRD
    - what is a north star metric, with examples
    - product manager interview questions on prioritization
    - APM programs in India 2026
    - what is Prodily / is Prodily legit
    - free alternatives to Product School

---

## Prioritized plan

### Now (next 2 weeks)
| # | Action | Finding | Effort |
|---|---|---|---|
| 1 | Register `prodily.app`; decide the permanent host; if moving, plan the move with SEO-05 slugs and Change of Address | SEO-01 | S / M |
| 2 | Fix robots.txt (`/review$`, drop `/app`, allow `/api/og/`) and update tests | SEO-02 | S |
| 3 | Fix module taxonomy from one source; regroup `/curriculum` by `lesson.module` | SEO-03 | S–M |
| 4 | `/glossary` → 308 or remove from sitemap/footer/home until the hub ships | SEO-04 | S |
| 5 | Sitemap: real `lastmod`, portfolios restored, capstone pages added, revalidate | SEO-06 | S |
| 6 | FAQ answers server-rendered, title fixed, numeric "how long" answer | SEO-08, AEO-05 | S |
| 7 | Verify Google Search Console and Bing Webmaster Tools; submit sitemap; inspect top URLs | AEO-01 | S |
| 8 | Restore punctuation removed by `418917d` (start with summaries, glossary, first paragraphs) | SEO-13 | M |
| 9 | Schema validity: replace `CourseUnit`, drop `grantee`, fix level mapping, add dates | SEO-09 | S |
| 10 | `twitter:site`, `/curriculum` twitter block, de-duplicate brand in titles, compress OG image | SEO-10 | S |
| 11 | Portfolio canonical lowercase + redirect | SEO-07 | S |

### Next (30–60 days)
| # | Action | Finding | Effort |
|---|---|---|---|
| 12 | "In short" answer box, key terms, cheat sheet and interview questions on public lessons | AEO-02 | M |
| 13 | New titles and descriptions for all 90 lessons (top 20 hand-written first) | SEO-05 | M |
| 14 | `/glossary` A–Z hub with DefinedTermSet; fill JTBD/OKR/A-B test/churn gaps | SEO-04 | M |
| 15 | First 10 `/frameworks/[slug]` pages with attribution | Keyword plan, EEAT-01 | M–L |
| 16 | Auto-link "Lesson N" mentions and glossary terms; prerequisite and "builds toward" blocks | SEO-11 | M |
| 17 | Visible bylines and dates; rewrite `/about` with founder credentials and editorial process; review disclosure check | EEAT-01 | M |
| 18 | Entity cleanup: single Person `@id`, Org `sameAs`, LinkedIn vanity URL | SEO-09, AEO-01 | S |
| 19 | `/interview-questions` hub | Keyword plan | M |
| 20 | llms.txt route; IndexNow on content build; explicit AI-bot policy; Vercel bot settings check | AEO-03, AEO-04 | S |
| 21 | Per-lesson and certificate OG images | SEO-10 | S–M |
| 22 | Start the monthly AI prompt panel and referral tagging | AEO-07 | S |

### Later (this quarter and beyond)
| # | Action | Finding | Effort |
|---|---|---|---|
| 23 | Server-render public lesson blocks to remove the duplicated RSC payload; static Mermaid output | SEO-12 | M |
| 24 | Templates library (PRD, opportunity brief, metric tree, roadmap memo) | Keyword plan | M |
| 25 | India APM guide; `/certificate` explainer; portfolio examples page | Keyword plan | M |
| 26 | Original-data report from anonymised learner data | AEO-06 | L |
| 27 | Outreach: roundups, Reddit, LinkedIn, Product Hunt relaunch | AEO-01 | L (ongoing) |
| 28 | Expand framework and glossary term pages based on Search Console data | SEO-04 | L |
| 29 | Credentialed reviewer program ("Reviewed by") | EEAT-01 | M |

---

## What's already good

- **Server-rendered, cached public pages.** Marketing pages and all 90 lesson previews are static or ISR with `generateStaticParams` and served from the Vercel cache; full HTML reaches every crawler, including AI bots.
- **Clean scoping of private areas.** `(app)`, `(auth)`, admin, onboarding and maintenance carry `noindex`; private and missing portfolios and invalid certificates are `noindex`; unknown lessons return a real 404; trailing slashes 308 to the clean URL; HTTP 308s to HTTPS.
- **Self-referencing canonicals on every public page**, with tests guarding them (`lib/__tests__/seo-canonicals.test.ts`).
- **Substantial public content.** Each lesson preview includes the full theory section, common mistakes and the mental model; live lesson 29 has ~37 KB of text, lesson 22 ~28 KB. Single H1 per page; body H1s are demoted to H2 (`blocks/default/DefaultMarkdown.tsx:7–11`).
- **Honest structured data.** No AggregateRating or fake reviews (the fabricated rating was removed in `f10d676`); the home page avoids duplicate FAQPage markup on purpose; `safeJsonLd` escapes output.
- **Broad schema coverage already in place:** EducationalOrganization with founder, WebSite, Course, LearningResource, BreadcrumbList, FAQPage, AboutPage, DefinedTermSet, ProfilePage, CreativeWork for capstones, and EducationalOccupationalCredential for certificates. Most fixes are corrections, not new work.
- **Portfolio and capstone pages** have their own titles, descriptions, canonical URLs, dynamic OG cards and ProfilePage/CreativeWork JSON-LD, which is the right foundation for a portfolio-led growth loop.
- **Alt text present** on all images checked; `lang="en"`; manifest and icons set; the hero H1 animation avoids hurting LCP.
- **Transparent operator disclosure** in the footer (sole proprietor, address, grievance officer), which supports trust.
- **An unusually rich content corpus**: 382k words, 479 glossary terms, ~180 named frameworks and models, 270 interview questions, 90 case studies. The work to do is mostly exposing it well.

---

## Sources

- Google Search Central, "AI features and your website" (updated 2025-12-10): https://developers.google.com/search/docs/appearance/ai-features
- Google Search Central blog, "Simplifying the search results page" (2025-06-12): https://developers.google.com/search/blog/2025/06/simplifying-search-results
- Search Engine Land, Google dropping several rich result types: https://searchengineland.com/google-to-drop-support-for-several-rich-result-types-to-simplify-the-search-results-page-456969
- Search Engine Journal, Google's advice on AI Overviews / AI Mode: https://www.searchenginejournal.com/googles-official-advice-on-optimizing-for-ai-overviews-ai-mode/547341/
- schema.org, EducationalOccupationalCredential: https://schema.org/EducationalOccupationalCredential
- schema.org, syllabusSections: https://schema.org/syllabusSections
- PPC Land, llms.txt adoption vs. AI requests (Ahrefs data): https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/
- Common Crawl, llms.txt content analysis (July 2026 crawl): https://commoncrawl.org/blog/a-content-analysis-of-llms-txt-files-from-the-july-2026-crawl-archive
- Anagram, AI crawler user-agent list 2026: https://www.anagram.ai/blog/ai-crawler-user-agent-list-2026-14-bots-and-robotstxt-tokens-to-know
- Search Influence, Bing AI Performance report: https://www.searchinfluence.com/blog/bing-ai-performance-report-copilot-citations/
- Product School, DVF framework origin (IDEO): https://productschool.com/blog/product-fundamentals/dvf-framework
- hunted.space, Prodily Product Hunt listing: https://hunted.space/product/prodily
- SERP spot checks (RICE, PRD, PM glossary, free PM course, India APM prep): Fibery https://fibery.io/blog/rice, PW Skills https://pwskills.com/blog/product-management/rice-prioritization, Aha! https://www.aha.io/roadmapping/guide/requirements-management/what-is-a-good-product-requirements-document-template, Coursera https://www.coursera.org/resources/product-management-terms, Uxcel https://uxcel.com/blog/top-free-product-management-courses, Guvi https://www.guvi.in/courses/product-management/interview-preparation/
