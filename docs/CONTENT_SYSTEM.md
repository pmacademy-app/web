# Content Compilation & Rendering Pipeline — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `21cc985`  
**Last Updated:** August 23, 2026  

---

## 1. Overview & Single Source of Truth

- **Source Location**: 90 Markdown files located under `content/modules/module-01/` through `module-09/`.
- **Single Source of Truth**: Markdown source files are the authoritative source for lesson theory, quizzes, key takeaways, and Mermaid diagrams. Lesson text is NEVER stored in database tables.
- **Compiled Output**: Emitted as static JSON to `content/dist/lessons/` during `npm run build` or `npm run content:compile`.

---

## 2. Content Compiler v2 Architecture (`compile.ts`)

The compiler script (`scripts/compiler/compile.ts`) executes at build time:

1. **Markdown Parsing**: Reads frontmatter metadata (`id`, `title`, `moduleSlug`, `order`) and compiles Markdown body.
2. **Mermaid Diagram Compilation (`mermaid-svg.ts`)**:
   - Extracts embedded ````mermaid``` code blocks.
   - Executes official `mermaid` v11 engine inside Node.js using JSDOM DOM polyfills.
   - Renders static SVG output styled with Prodily green/navy theme tokens.
   - Replaces Mermaid code blocks in Markdown with static inline SVG elements.
3. **Cross-Lesson Validations**: Verifies stable `lessonId` uniqueness, quiz answer option counts (4 per quiz), and link references.
4. **Curriculum Index Aggregation**: Emits `content/dist/curriculum.json` containing total counts, module structures, and lesson sequences.
5. **FlexSearch Search Index Generation**: Pre-builds FlexSearch index JSON at `content/dist/search-index.json` for client-side search.

---

## 3. Status Summary

| Content Component | Location | Status |
|---|---|---|
| **90 Markdown Source Lessons** | `content/modules/` | 🟢 Verified in Production |
| **Compiler v2 Engine** | `scripts/compiler/compile.ts` | 🟢 Verified in Production |
| **Build-Time Mermaid SVG Engine** | `scripts/compiler/mermaid-svg.ts` | 🟢 Verified in Production |
| **Static JSON Output** | `content/dist/lessons/` | 🟢 Verified in Production |
| **FlexSearch Pre-Indexed Search** | `content/dist/search-index.json` | 🟢 Verified in Production |

---

## 4. Content Quality Metric Calculation (Phase 6)

The curriculum quality loop enables learners to submit ratings (1–5 stars), clarity tags, and optional notes at the end of each lesson.

### Metric Formulations:
1. **Average Clarity Score**:
   $$\text{Clarity Score} = \frac{\sum \text{ratings}}{N} \quad (\text{rounded to 1 decimal place, range: } 1.0 - 5.0)$$
2. **Helpfulness / Clarity %**:
   $$\text{Clarity \%} = \left(\frac{\text{Count}(\text{rating} \ge 4)}{N}\right) \times 100$$
3. **Flagged Issue Count**:
   Total count of feedback submissions with rating $\le 2$ or containing critical clarity tags (`too_technical`, `confusing_example`, `outdated`, `pacing_too_fast`).
4. **Needs Review Threshold**:
   Lessons with an Average Clarity Score $< 3.5$ are automatically flagged for review in the Admin Curriculum workspace.

