# Content Compilation & Rendering Pipeline — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026  

---

## 1. Overview & Single Source of Truth

- **Source Location**: 90 flat Markdown files at `content/lessons/lesson-001.md` … `lesson-090.md` — there is **no `content/modules/` directory or per-module subfolder structure**.
- **No Frontmatter**: Lesson files carry **no YAML frontmatter**. Metadata (module, difficulty, prerequisites, next lesson, unlocked topics) is instead parsed from an in-body `## Learning Path` Markdown table, combined with a hardcoded lesson-number → module-slug range map (`getModuleSlugForLessonNumber()` in `compile.ts`).
- **Single Source of Truth**: Markdown source files are the authoritative source for lesson theory, quizzes, key takeaways, and Mermaid diagrams. Lesson text is NEVER stored in database tables.
- **Compiled Output**: Emitted as static JSON to `content/dist/` (`lessons/`, `curriculum.json`, `search-index.json`, `glossary-index.json`, `module-graph.json`) during `npm run build` or `npm run content:compile`.

---

## 2. Content Compiler Architecture (`compile.ts`)

The compiler script (`scripts/compiler/compile.ts`) executes at build time:

1. **Markdown Parsing**: Reads each flat lesson file, deriving the lesson number from its filename and its module from the hardcoded range map; parses the in-body `## Learning Path` table for prerequisite/sequencing metadata (no frontmatter is read — there isn't any).
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
| **90 Markdown Source Lessons** | `content/lessons/` | 🟢 Verified in Production |
| **Compiler Engine** | `scripts/compiler/compile.ts` | 🟢 Verified in Production |
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

