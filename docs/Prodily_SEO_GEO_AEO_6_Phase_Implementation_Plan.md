# Prodily PM Academy — SEO / GEO / AEO Implementation Plan

**Source:** Claude SEO / GEO / AEO Audit & Implementation Plan  
**Audit date:** August 13, 2026  
**Site:** `prodily.adityagangwani.me`

---

## Executive Summary

Prodily PM Academy has strong underlying educational content but currently has a weak SEO/GEO/AEO technical layer.

The audit found that the site contains **90 lessons across 9 modules** with original frameworks, structured learning objectives, comparison tables, common-mistake callouts, and pedagogically deep content.

The main opportunity is therefore **not to rewrite the existing curriculum**, but to make the existing content technically discoverable, semantically understandable, internally connected, and authoritative.

The implementation is divided into **6 phases**, ordered from critical technical fixes to longer-term authority building.

---

# Phase 1 — Critical Technical SEO Foundation

**Priority: P0 — Immediate**

### Objective

Fix the technical issues that can prevent Google and other search engines from correctly crawling, indexing, and understanding Prodily.

### 1. Fix canonical URLs

- [x] Fix `/about` canonical so it points to `https://prodily.adityagangwani.me/about`.
- [x] Fix `/contact` canonical so it points to `https://prodily.adityagangwani.me/contact`.
- [x] Programmatically audit canonical URLs across all 90 `/lessons/lesson-XXX` pages.
- [x] Ensure every lesson has a self-referencing canonical URL.
- [x] Verify canonical behavior for `/`, `/curriculum`, `/privacy`, `/terms`, and other indexable public pages.

**Why:** Incorrect canonicals can cause Google to treat pages as duplicates and exclude them from indexing.

### 2. Verify and configure `robots.txt`

- [x] Confirm `robots.txt` exists.
- [x] Ensure `/lessons/` is crawlable.
- [x] Ensure `/curriculum` is crawlable.
- [x] Ensure `/about` and `/contact` are crawlable.
- [x] Ensure `/signup` is not blocked unnecessarily.
- [x] Disallow `/login`, `/app`, dashboard/private routes, and other authenticated/private areas where appropriate.
- [x] Reference the XML sitemap from `robots.txt`.

### 3. Create and verify XML sitemap

The sitemap should contain all intended indexable public URLs:

- [x] Homepage
- [x] `/curriculum`
- [x] `/about`
- [x] `/contact`
- [x] `/privacy`
- [x] `/terms`
- [x] All 90 lesson pages
- [x] Public portfolio pages if/when they are intentionally indexable

Then:

- [x] Validate sitemap XML.
- [x] Confirm all URLs return valid responses.
- [ ] Submit sitemap to Google Search Console.
- [ ] Submit sitemap to Bing Webmaster Tools.

### 4. Contact identity consistency

- [x] Standardize the contact email across the site.
- [x] Prefer the branded domain email currently used on the Contact page.
- [x] Remove conflicting contact addresses where appropriate.

### 5. Performance verification

Run Lighthouse/PageSpeed checks on:

- [x] Homepage
- [x] `/curriculum`
- [x] At least one lesson page

Check:

- [x] LCP
- [x] CLS
- [x] INP
- [x] JavaScript/render-blocking resources
- [x] Image loading
- [x] Client-side rendering impact
- [x] Gamification components affecting initial render

### Phase 1 completion criteria

- All important public pages have correct self-canonicals.
- All 90 lessons have been programmatically checked.
- `robots.txt` is valid.
- `sitemap.xml` contains all intended indexable pages.
- Search Console and Bing submission is complete.
- Contact identity is consistent.
- No critical performance issue is left unverified.

---

# Phase 2 — Structured Data, GEO & AEO

**Priority: P0–P1**

### Objective

Make Prodily's entity, curriculum, lessons, frameworks, and FAQ content easier for search engines and AI answer engines to understand.

## 1. Homepage structured data

Add:

### `EducationalOrganization`

Include:

- Name: Prodily PM Academy
- URL
- Logo
- Relevant `sameAs` profiles, including the founder/parent site and Buy Me a Coffee where appropriate

### `WebSite`

Add:

- Website name
- URL
- SearchAction if an actual site search exists

Do not add a SearchAction unless the site genuinely supports the corresponding search behavior.

## 2. Curriculum structured data

For `/curriculum`:

- [ ] Add `Course` schema.
- [ ] Identify Prodily PM Academy as the provider.
- [ ] Represent the curriculum/module structure.
- [ ] Mark the course as free where supported.
- [ ] Represent the 9 modules and their relationship to the course.

## 3. Lesson structured data

For all 90 lessons:

- [ ] Add `LearningResource` and/or appropriate `Article` structured data.
- [ ] Include lesson name.
- [ ] Include description.
- [ ] Include educational level where appropriate.
- [ ] Map displayed reading duration to `timeRequired` where appropriate.
- [ ] Include `learningResourceType`.
- [ ] Include the relevant topic/about information.
- [ ] Connect lessons to the parent course.

The implementation should use the schema types that are actually valid and appropriate for the rendered content.

## 4. FAQ structured data

The homepage already contains an FAQ section.

- [ ] Add `FAQPage` structured data to the existing FAQ.
- [ ] Ensure schema questions/answers exactly match visible page content.
- [ ] Do not create hidden FAQ content solely for schema.

## 5. About page entity markup

For `/about`:

- [ ] Add `AboutPage`.
- [ ] Add `Person` structured data for Aditya Gangwani.
- [ ] Link the person to `adityagangwani.me` where appropriate.
- [ ] Establish the relationship between the founder and Prodily.

## 6. Breadcrumbs

For lesson pages:

`Home > Curriculum > Module > Lesson`

- [ ] Add visible breadcrumb navigation.
- [ ] Add `BreadcrumbList` structured data.
- [ ] Ensure breadcrumb URLs match actual canonical URLs.

## 7. Named frameworks

Prodily contains original frameworks such as:

- Accountability Triangle
- Regulatory Surface Map
- Ownership Zones Model
- Escalation Staircase

- [ ] Audit framework definitions across lessons.
- [ ] Ensure framework names have clear headings and definitions.
- [ ] Consider `DefinedTerm` / `DefinedTermSet` where semantically appropriate.
- [ ] Avoid adding schema simply for the sake of schema; visible, clear definitions are the priority.

### Phase 2 completion criteria

- Homepage entity is clearly represented.
- Curriculum is represented as a course.
- Lessons have appropriate structured data.
- FAQ markup matches visible FAQ content.
- Founder/entity relationship is represented.
- Lesson breadcrumbs are implemented.
- Framework terminology is consistently structured.

---

# Phase 3 — Information Architecture & Internal Linking

**Priority: P1**

### Objective

Expose all 90 lessons directly and create a strong crawlable relationship between the curriculum, lessons, and proprietary frameworks.

## 1. Expand `/curriculum`

Current issue identified by the audit:

The curriculum hub links to module-opening lessons rather than directly exposing all 90 lessons.

### Required changes

- [ ] List every lesson under its respective module.
- [ ] Link directly to all 90 lessons.
- [ ] Use descriptive lesson titles as anchor text.
- [ ] Preserve a clean, usable curriculum experience.
- [ ] Avoid creating an overwhelming interface; collapsible module sections can be used if appropriate while keeping links crawlable.

## 2. Create `/glossary` or `/frameworks`

Create a dedicated, crawlable hub for Prodily's proprietary terminology.

Potential entries include:

- Accountability Triangle
- Regulatory Surface Map
- Ownership Zones Model
- Escalation Staircase
- Other original frameworks discovered during a complete curriculum audit

Each entry should:

- [ ] Have a clear definition.
- [ ] Link to the lesson where it is explained in depth.
- [ ] Link back to the relevant curriculum/module where useful.
- [ ] Be indexable.
- [ ] Avoid thin or duplicate content.

This is one of the highest-value net-new information architecture opportunities identified in the audit.

## 3. Standardize footer and CTA links

- [ ] Standardize footer navigation across public pages.
- [ ] Fix the About page footer inconsistency.
- [ ] Standardize the "Preview Sample Lesson" link.
- [ ] Standardize primary CTA destinations.
- [ ] Verify whether `/academy` is a valid intended route.
- [ ] If `/academy` is not intended, replace it with the correct route such as `/signup`.

## 4. Breadcrumb implementation

If not already completed in Phase 2:

- [ ] Add Home → Curriculum → Module → Lesson navigation.
- [ ] Ensure every breadcrumb link is crawlable.
- [ ] Ensure schema and visible breadcrumbs stay synchronized.

### Phase 3 completion criteria

- All 90 lessons are directly reachable from `/curriculum`.
- A glossary/framework hub exists.
- Framework entries link to their source lessons.
- Footer and CTA navigation is consistent.
- Breadcrumb navigation is consistent across lessons.

---

# Phase 4 — On-Page SEO, Content Packaging & AI Citability

**Priority: P1**

### Objective

Improve the way existing lessons appear in search results and how easily their information can be extracted and cited by AI systems.

## 1. Remove duplicated meta keywords

The audit found the same `meta-keywords` string repeated across multiple pages.

- [ ] Remove the obsolete/duplicated meta-keywords tag.
- [ ] Do not spend significant effort replacing it with another keyword list.
- [ ] Focus instead on titles, descriptions, headings, content structure, and internal links.

## 2. Optimize lesson titles

Current titles can become long.

Example audit finding:

`Lesson 81: Regulated Industries: PM in Healthcare, Finance, and Government | Prodily PM Academy`

Potential direction:

`Regulated Industries: PM in Healthcare, Finance & Government | Prodily PM Academy`

- [ ] Audit all 90 titles.
- [ ] Keep titles descriptive and topic-focused.
- [ ] Avoid unnecessary repetition.
- [ ] Preserve the Prodily brand where useful.
- [ ] Avoid aggressive keyword stuffing.

## 3. Improve `/curriculum` metadata and intro copy

The current description is good but generic.

- [ ] Retain the core "free 90-lesson Product Management curriculum" positioning.
- [ ] Add relevant module/topic language where natural.
- [ ] Surface topics such as PRDs, prioritization, roadmaps, strategy, and career preparation where genuinely covered by the curriculum.

## 4. Lesson opening definitions

Audit all 90 lessons for a consistent AI-friendly opening structure.

Each lesson should ideally have:

1. Clear topic/title.
2. A concise definition or direct answer.
3. Learning objectives.
4. Deeper explanation.
5. Examples/frameworks/tables.
6. Common mistakes or practical guidance where applicable.

- [ ] Audit all 90 lessons.
- [ ] Add/rewrite only where the opening definition is genuinely missing or unclear.
- [ ] Preserve the existing original, opinionated teaching style.

## 5. Authorship and freshness

- [ ] Add a visible author/byline where appropriate.
- [ ] Add a visible "Last updated" date.
- [ ] Ensure dates are truthful and reflect actual content updates.
- [ ] Do not fabricate review or update dates.

## 6. Image and diagram SEO

- [ ] Audit all lesson diagrams and images.
- [ ] Add descriptive alt text where meaningful.
- [ ] Avoid keyword-stuffed alt text.
- [ ] Ensure decorative images are treated appropriately.
- [ ] Pay particular attention to framework/process diagrams.

## 7. FAQ expansion

The existing FAQ can be expanded with natural user questions, such as:

- Is there a free alternative to Product School?
- How long does it take to learn product management for free?
- Do I need a CS or business degree to become a product manager?

Only add questions that are genuinely useful and answerable from Prodily's actual offering.

### Phase 4 completion criteria

- Duplicate metadata is removed.
- All lesson titles are reviewed.
- Curriculum metadata is improved.
- All 90 lessons follow a strong direct-answer structure where appropriate.
- Author/update information is accurate.
- Images and diagrams have appropriate alt text.
- FAQ content better reflects real user questions.

---

# Phase 5 — Search Content Expansion & Competitive Positioning

**Priority: P1–P2**

### Objective

Package existing expertise into pages capable of competing for realistic long-tail and mid-tail searches.

The audit found that Prodily should **not try to directly compete with Coursera, Product School, or Reforge for extremely broad terms in year one**.

Instead, focus on narrower queries where Prodily's original educational content provides a real advantage.

## 1. PRD content opportunity

Identify the relevant lesson in the Defining Products & PRDs module.

- [ ] Confirm the lesson that teaches how to write a PRD.
- [ ] Ensure the lesson has a clear SEO title.
- [ ] Optimize its metadata around natural queries such as:
  - How to write a PRD
  - Product requirements document guide
  - How to write a product requirements document
- [ ] Consider a standalone supporting page if the existing lesson does not sufficiently target the search intent.

## 2. Prioritization framework comparison

Identify the lesson covering:

- RICE
- MoSCoW
- ICE
- Other prioritization frameworks

- [ ] Confirm the exact existing lesson content.
- [ ] Evaluate whether it satisfies comparison search intent.
- [ ] Consider a dedicated comparison page if appropriate.
- [ ] Use a clear comparison table.
- [ ] Link the comparison page to the full curriculum lesson.

## 3. PM interview preparation

Module 09 contains interview preparation material.

Longer-term:

- [ ] Identify existing interview-preparation lessons.
- [ ] Build supporting content around narrower queries.
- [ ] Consider topics such as:
  - Product sense interview questions
  - PM interview questions for career switchers
  - Product manager case study preparation
- [ ] Avoid trying to immediately compete for the broadest "product manager interview questions" query.

## 4. Protect content quality

The audit specifically found that Prodily's existing content is:

- Original
- Specific
- Opinionated
- Framework-driven
- Educational
- Not generic AI filler

Therefore:

- [ ] Do not create large quantities of generic SEO articles.
- [ ] Do not dilute the curriculum to chase keywords.
- [ ] Preserve original terminology and teaching depth.
- [ ] Prioritize useful content over search-engine-first writing.

### Phase 5 completion criteria

- High-potential existing lessons are identified.
- PRD and prioritization content is packaged for search intent.
- Interview content has a realistic long-tail strategy.
- New content maintains Prodily's existing quality and originality.

---

# Phase 6 — Authority Building, Trust & Long-Term SEO

**Priority: P1–P2 / Ongoing**

### Objective

Build external authority and strengthen the connection between Prodily, its founder, learners, and the wider PM education ecosystem.

The audit found **zero external backlinks or mentions** at the time of research. This is expected for a new site but will become the major constraint once technical SEO is fixed.

## 1. Course roundup outreach

Target relevant existing lists and aggregators, including the types of sources identified in the audit:

- Class Central
- Coursesity
- Product-management course roundups
- Relevant Substack/Medium course lists

Actions:

- [ ] Create a concise Prodily description.
- [ ] Prepare the key differentiators.
- [ ] Contact relevant editors/authors.
- [ ] Request inclusion where genuinely relevant.
- [ ] Track outreach and responses.
- [ ] Do not use spammy mass outreach.

## 2. Community presence

Relevant communities include product-management communities such as Reddit's r/ProductManagement.

- [ ] Participate genuinely.
- [ ] Answer questions.
- [ ] Share useful knowledge.
- [ ] Mention Prodily only when genuinely relevant.
- [ ] Avoid self-promotional spam.

## 3. Product Hunt / Indie Hackers

Consider a launch once the core product and SEO foundation are stable.

- [ ] Prepare launch story.
- [ ] Explain why Prodily was built.
- [ ] Highlight the free PM curriculum.
- [ ] Explain the founder-led approach.
- [ ] Encourage genuine discussion and feedback.
- [ ] Use the launch to generate awareness, mentions, and potentially backlinks.

## 4. Founder entity building

The audit found that searches for "Aditya Gangwani" currently produce ambiguity with other people sharing the name.

Strengthen the founder/entity relationship:

- [ ] Build out `adityagangwani.me`.
- [ ] Create a clear page describing Aditya's work on Prodily.
- [ ] Link clearly between the personal site and Prodily.
- [ ] Use consistent name, role, and project information.
- [ ] Connect relevant social/professional profiles where appropriate.

## 5. Learner reviews

As more reviews accumulate:

- [ ] Consider creating a dedicated `/reviews` page.
- [ ] Add appropriate review structured data only when valid.
- [ ] Keep reviews authentic and attributable.
- [ ] Avoid manufactured ratings.

## 6. Public learner portfolios

The audit identified public learner portfolios as a potential long-term content moat.

Recommended strategy:

- [ ] Keep portfolio pages `noindex` by default if they are empty/thin.
- [ ] Define a quality/completion threshold.
- [ ] Allow indexing only for genuinely useful portfolio pages.
- [ ] Reassess once there is enough learner-generated content.

## 7. Optional `llms.txt`

- [ ] Consider adding `/llms.txt`.
- [ ] Summarize Prodily's purpose and structure.
- [ ] Link to the curriculum and glossary/framework pages.
- [ ] Treat this as optional/emerging rather than a core SEO dependency.

## 8. Wikipedia

Do **not** prioritize Wikipedia creation or founder disambiguation efforts at this stage.

Only pursue this in the future if there is genuine independent notability and reliable third-party coverage.

### Phase 6 completion criteria

- Backlink/outreach process is active.
- Community presence is genuine and useful.
- Product Hunt/Indie Hackers launch is evaluated/executed at the right time.
- Founder identity is clearly connected to Prodily.
- Reviews and learner portfolios have deliberate indexing strategies.
- Optional AI-discovery files are evaluated without distracting from core SEO.

---

# Final Implementation Priority

## Phase 1 — Critical Technical SEO Foundation
**Fix what can prevent indexing.**

Canonicals → robots.txt → sitemap → Search Console/Bing → contact consistency → performance.

## Phase 2 — Structured Data / GEO / AEO
**Tell search engines and AI systems what Prodily is.**

Organization → Website → Course → LearningResource → FAQ → Person → Breadcrumbs → framework structure.

## Phase 3 — Information Architecture
**Make all 90 lessons discoverable.**

Full curriculum linking → glossary/frameworks → footer/CTA cleanup → breadcrumbs.

## Phase 4 — On-Page SEO & AI Citability
**Improve how existing content is understood and surfaced.**

Metadata → titles → direct-answer openings → authorship → freshness → image alt text → FAQ expansion.

## Phase 5 — Content Expansion
**Target realistic search opportunities.**

PRD → prioritization comparisons → PM interview long-tail content → preserve quality.

## Phase 6 — Authority Building
**Build the external signals needed to compete.**

Roundup outreach → communities → Product Hunt/Indie Hackers → founder entity → reviews → quality-gated portfolios.

---

# Important Principles

1. **Do not rewrite the entire 90-lesson curriculum for SEO.**
2. **Fix technical discoverability before creating large amounts of new content.**
3. **Do not chase broad keywords where established domains have overwhelming authority.**
4. **Use Prodily's original frameworks as a competitive advantage.**
5. **Keep AI/GEO optimization focused on clarity, structure, authorship, and citability — not keyword stuffing.**
6. **Do not add structured data that does not accurately represent visible content.**
7. **Do not index thin learner portfolios simply to increase page count.**
8. **Do not create generic AI-generated SEO filler.**
9. **Validate every implementation programmatically after making changes.**
10. **Treat SEO as an ongoing system rather than a one-time launch task.**

---

# Success Definition

After all six phases are substantially implemented, Prodily should have:

- Correct canonicalization across all public pages.
- A valid crawl/indexation foundation.
- A complete XML sitemap covering the intended public content.
- Structured data describing the organization, course, lessons, FAQ, founder, and navigation.
- Direct internal links to all 90 lessons.
- A dedicated framework/glossary discovery layer.
- Stronger lesson-level metadata and AI-readable structure.
- Better long-tail search targeting.
- A deliberate backlink and authority-building strategy.
- A clear founder ↔ Prodily entity relationship.
- A quality-controlled strategy for reviews and learner portfolios.

The goal is **not simply to rank higher**. The goal is to make Prodily a technically strong, semantically clear, highly crawlable, authoritative educational resource that can be discovered through Google, AI Overviews, ChatGPT, Perplexity, Gemini, Claude, and other answer engines.

---

## Source

Based on the supplied **"Prodily PM Academy — SEO / GEO / AEO Audit & Implementation Plan"** dated August 13, 2026.
