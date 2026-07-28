---
name: pm-academy-content-pipeline
description: >
  PM Academy content system skill. Covers the Markdown-to-JSON content pipeline,
  lesson schema, content authoring rules, content validation, search index generation,
  and the scripts/ directory. Triggers on: content pipeline work, lesson file editing,
  parse-content.ts, validate-content.ts, generate-search-index.ts, content schema,
  adding lessons, or any work in the /content/ directory.
---

# PM Academy — Content Pipeline (Markdown → JSON)

Load `00-pm-academy-core` alongside this skill.

> **Important:** This pipeline uses **plain Markdown**, not MDX. There is no MDX runtime, no JSX in content files, and no React components embedded in lesson files. Content is parsed at build time into static JSON.

---

## 1. Core Principle

**Markdown is the single source of truth.** The 90 lesson files in `/content/lessons/` (at the **repo root**, not inside `apps/web/`) are canonical.

Content flows one way: `Markdown → parse → validate → JSON → search index → CDN`

**Never reverse this flow.** Never hand-edit generated JSON. Never store lesson content in Supabase.

---

## 2. Content Pipeline Flow

```
/content/lessons/lesson-NNN.md         (source — edit ONLY here)
        ↓
scripts/parse-content.ts               (Markdown → structured JSON)
        ↓
scripts/validate-content.ts            (schema enforcement — build fails on invalid content)
        ↓
apps/web/public/content/lessons/       (generated JSON — DO NOT EDIT)
        ↓
scripts/generate-search-index.ts       (produces search-index.json)
        ↓
apps/web/public/content/search-index.json
        ↓
Vercel Edge CDN                        (browser fetches from /content/*.json)
```

### Key Paths
- **Source content:** `/content/lessons/` — repo root (not inside `apps/web/`)
- **Parser scripts:** `/scripts/` — repo root
- **Generated output:** `apps/web/public/content/` — committed alongside source
- **Migrations:** `apps/web/supabase/migrations/` — separate from content

### Running the Pipeline
```bash
# From the repo root or apps/web/ (check package.json scripts location)
npm run content:parse    # scripts/parse-content.ts
npm run content:validate # scripts/validate-content.ts
npm run content:search   # scripts/generate-search-index.ts
npm run content:build    # all three in sequence
npm run build            # content:build + next build
```

---

## 3. Lesson File Naming & Location

- Files: `/content/lessons/lesson-001.md` through `lesson-090.md`
- Naming: zero-padded 3-digit number (`lesson-001`, not `lesson-1`)
- 9 modules × 10 lessons = 90 lessons total (FIXED — do not change without full doc update)
- Module assignment: determined by `meta.module` field in the file's frontmatter/header, not filename order

---

## 4. Lesson Markdown Schema

Every lesson file MUST have all of these sections in this order. The parser enforces the schema — missing sections fail the build.

```markdown
# Lesson Title

## Meta
- slug: lesson-NNN            # matches filename without extension
- module: N                   # 1-9
- order: N                    # 1-10 within module
- difficulty: beginner|intermediate|advanced
- est_minutes: N              # honest estimate — do not inflate
- skill_clusters:             # EXACTLY 1 or 2 of the 7 clusters:
  - Discovery & Research      # | Strategy | Design & UX |
  - Execution & Delivery      # | Metrics & Growth |
  - Leadership & Communication# | Platform/Technical/Specialized

## Theory
[Main prose — the lecture content]

## Common Mistakes
[Practitioner mistakes section]

## Mental Model
[Diagram or framework description]

## Case Study
[Real-world PM case study]

## Framework Table
[Structured comparison or how-to table]

## Interview Perspective
[How this shows up in PM interviews]

## Summary
[2-3 sentence recap]

## Key Takeaways
- Takeaway 1
- Takeaway 2
- Takeaway 3

## Cheat Sheet
[Quick-reference card content]

## Glossary
- **Term:** Definition
[Repeat for each glossary item]

## Resources
- [Title](URL) — type: article|video|book|tool

## Flashcards
### Card 1
- id: lesson-NNN-fc-001       # STABLE — never change once published
- Front: Question side
- Back: Answer side
- difficulty: easy|medium|hard
- tags: [tag1, tag2]

[Repeat for each flashcard]

## Reflection
[Single reflection prompt question]

## Quiz
### Question 1
- id: lesson-NNN-q-001        # STABLE — never change once published
- Question: [Question text]
- A: Option A
- B: Option B
- C: Option C
- D: Option D
- Correct: A|B|C|D
- Explanation: [Why the answer is correct]
- Learning Objective: [What this tests]
- Difficulty: easy|medium|hard

[Repeat for Questions 2-15 — exactly 15 questions per lesson]

## Connections
- lesson-NNN: [Relationship description]
[Cross-references to related lessons]
```

---

## 5. Stable ID Rules (CRITICAL)

`quiz[].id` and `flashcard[].id` are referenced by user-state tables in Supabase.
`user_lesson_progress`, `quiz_attempts`, and `user_flashcard_srs` store these IDs.

**Rules:**
1. **Once an ID is published (JSON generated and deployed), it must NEVER change.**
2. IDs must be deterministically generated — the same content in the same position generates the same ID.
3. Format: `lesson-NNN-q-NNN` for quiz questions, `lesson-NNN-fc-NNN` for flashcards.
4. If a quiz question's content is rewritten (prose change), the ID stays the same.
5. If a question is DELETED, its ID is retired — do not reuse it for a new question in the same position.
6. Regenerating JSON after editing prose (Theory, Case Study, etc.) must NOT change any `q-` or `fc-` IDs.
7. Treat ID changes like breaking database migrations — they break existing user progress data.

---

## 6. Content Authoring Rules

- **Honest estimated times** — never inflate or deflate to game engagement metrics (`PRD.md §1`).
- **Exactly 1 or 2 skill_clusters** per lesson — never 0, never 3+.
- **Exactly 15 quiz questions** per lesson — the quiz is defined at 15-question length.
- **Quiz questions must map to a learning_objective** — no orphan questions without context.
- **Glossary terms** should be deduped at build time — the search index must handle cross-lesson glossary entries.
- **Resource URLs** should be stable, not ephemeral (avoid Medium articles that may disappear).
- Do not add ad hoc sections not in the schema above — add to the schema AND update the parser together.
- Content changes must go through the CI pipeline — never hand-edit generated JSON.

---

## 7. Parser Script (scripts/parse-content.ts)

Key responsibilities:
1. Parse all 90 `lesson-NNN.md` files from `/content/lessons/`
2. Extract all schema sections into a structured TypeScript/JSON object
3. Assign/validate stable IDs to quiz questions and flashcards
4. Output one JSON file per lesson to `apps/web/public/content/lessons/`
5. Output a combined `lessons-index.json` with all lessons' metadata (for curriculum page, progress tracking)

**Must be idempotent** — running it multiple times on the same source produces the same output. Stable IDs ensure no user-state references break on re-parse.

---

## 8. Validation Script (scripts/validate-content.ts)

Enforces quality gates that **fail the CI build** — broken content never reaches production:

- [ ] All required sections present in every lesson
- [ ] `meta.slug` matches the filename
- [ ] `meta.module` is 1–9
- [ ] `meta.order` is 1–10 and unique within the module
- [ ] `meta.skill_clusters` has exactly 1 or 2 items from the approved list
- [ ] Exactly 15 quiz questions per lesson
- [ ] Every quiz question has: id, question_text, options (4), correct_option, explanation, learning_objective, difficulty
- [ ] Every flashcard has: id, front, back, difficulty, tags
- [ ] No duplicate IDs across all lessons
- [ ] `connections[]` references valid lesson slugs

---

## 9. Search Index (scripts/generate-search-index.ts)

Generates `apps/web/public/content/search-index.json`.

**Searchable fields per lesson:**
```typescript
{
  slug: string,
  title: string,
  module: number,
  summary: string,
  key_takeaways: string[],
  glossary_terms: string[],  // term names only (definitions are too large)
  skill_clusters: string[]
}
```

The client-side search library (`lib/search.ts`) loads this JSON once. No server-side search infrastructure — ever.

---

## 10. Generated JSON Structure (per lesson)

```typescript
// apps/web/public/content/lessons/lesson-NNN.json
type LessonJSON = {
  meta: {
    slug: string
    title: string
    module: number
    order: number
    difficulty: 'beginner' | 'intermediate' | 'advanced'
    est_minutes: number
    skill_clusters: SkillCluster[]
  }
  theory: string           // HTML string (parsed from Markdown prose)
  mistakes: string
  mental_model: string
  case_study: string
  framework: string
  interview_perspective: string
  summary: string
  key_takeaways: string[]
  cheat_sheet: string
  glossary: Array<{ term: string; definition: string }>
  resources: Array<{ title: string; url: string; type: string }>
  flashcards: Array<{
    id: string           // STABLE — never changes after deployment
    front: string
    back: string
    difficulty: 'easy' | 'medium' | 'hard'
    tags: string[]
  }>
  reflection: string     // prompt text
  quiz: Array<{
    id: string           // STABLE — never changes after deployment
    question_text: string
    options: string[]    // exactly 4
    correct_option: number  // 0-indexed
    explanation: string
    learning_objective: string
    difficulty: 'easy' | 'medium' | 'hard'
  }>
  connections: Array<{ slug: string; description: string }>
}

// apps/web/public/content/lessons-index.json
type LessonsIndex = {
  lessons: Array<LessonJSON['meta'] & { connections: string[] }>
  modules: Array<{
    id: number
    title: string
    description: string
    lessons: string[]  // slugs in order
  }>
}
```

---

## 11. The 7 Skill Clusters (exact names — use consistently)

```typescript
type SkillCluster =
  | 'Discovery & Research'
  | 'Strategy'
  | 'Design & UX'
  | 'Execution & Delivery'
  | 'Metrics & Growth'
  | 'Leadership & Communication'
  | 'Platform/Technical/Specialized'
```

These map 1:1 to the 7 axes on the skill radar chart (`lib/skillRadar.ts`). Tag assignments are in each lesson's `meta.skill_clusters`.

---

## 12. Content Changes Workflow

1. Edit the source `.md` file in `/content/lessons/`
2. Run `npm run content:build` from the appropriate directory
3. Verify no validation errors
4. Review the diff in the generated JSON — if any `q-` or `fc-` IDs changed, that is a bug — stop and investigate
5. Commit both the `.md` source AND the generated JSON together
6. CI will re-run the pipeline and verify

**Never:**
- Edit generated JSON directly
- Run only the parser without the validator
- Commit generated JSON without the source `.md`
- Change a published stable ID without treating it as a breaking change
