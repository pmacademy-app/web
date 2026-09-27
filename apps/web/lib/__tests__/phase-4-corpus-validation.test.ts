/**
 * Phase 4 — Lesson corpus validation (IMPLEMENTATION_PLAN.md §Phase 4, Step 8).
 *
 * Audits every compiled lesson so the Core / Deep-dive recut is proven across the whole
 * corpus rather than a hand-picked sample. For all 90 lessons this asserts:
 *   - a non-empty, theory-bearing Core exists;
 *   - a non-empty Deep-dive exists (Core is never the entire lesson by default);
 *   - no block type is orphaned by the classification;
 *   - the quiz bank is intact at 15 questions (so 5-of-15 sampling is always possible).
 *
 * The revised product direction drops the "~7 min" target: Core must be conceptually
 * complete, and the honest reading estimate reflects whatever that takes (commonly 10–15 min
 * given the monolithic `theory` block). This test asserts STRUCTURAL coherence — a complete
 * Core, genuinely-optional Deep-dive, correct diagram placement, intact quiz pool — and
 * records the measured Core/Deep-dive spread rather than judging an absolute minute target.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import {
  validateLessonStructure,
  getCoreBlocks,
  getDeepDiveBlocks,
  getCoreReadingMinutes,
  getDeepDiveReadingMinutes,
  QUIZ_POOL_EXPECTED_SIZE,
} from '@/lib/academy/lesson-structure'
import type { CompiledLesson } from '@/types'

const LESSONS_DIR = path.resolve(import.meta.dirname, '../../../../content/dist/lessons')

function loadLessons(): CompiledLesson[] {
  const files = readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.json'))
  return files.map((f) => JSON.parse(readFileSync(path.join(LESSONS_DIR, f), 'utf8')) as CompiledLesson)
}

describe('Phase 4 — corpus validation (all lessons)', () => {
  const lessons = loadLessons()

  it('finds the full lesson corpus', () => {
    expect(lessons.length).toBeGreaterThanOrEqual(90)
  })

  it('every lesson has a valid Core / Deep-dive structure with an intact 15-question quiz', () => {
    const invalid = lessons
      .map((l) => validateLessonStructure(l))
      .filter((r) => !r.valid)
    // Surface the offending lessons in the failure message rather than a bare count.
    expect(invalid.map((r) => `${r.lessonId}: ${r.issues.join('; ')}`)).toEqual([])
  })

  it('no lesson has an orphaned (unclassified) block type', () => {
    const orphans = new Set<string>()
    for (const l of lessons) {
      for (const t of validateLessonStructure(l).unclassifiedTypes) orphans.add(t)
    }
    expect([...orphans]).toEqual([])
  })

  it('every quiz pool is exactly 15 questions', () => {
    for (const l of lessons) {
      const report = validateLessonStructure(l)
      expect(report.quizPoolSize, `${l.id} quiz pool`).toBe(QUIZ_POOL_EXPECTED_SIZE)
    }
  })

  it('every lesson has a Deep-dive (Core is never the whole lesson)', () => {
    for (const l of lessons) {
      const report = validateLessonStructure(l)
      expect(report.deepDiveBlockCount, `${l.id} deep-dive block count`).toBeGreaterThan(0)
      expect(report.coreBlockCount, `${l.id} core block count`).toBeGreaterThan(0)
    }
  })

  it('every Core is conceptually complete (theory + a mental model or framework)', () => {
    const incomplete = lessons.filter((l) => {
      const coreTypes = new Set(getCoreBlocks(l.blocks).map((b) => b.type))
      return !(coreTypes.has('theory') && (coreTypes.has('mentalModel') || coreTypes.has('framework')))
    })
    expect(incomplete.map((l) => l.id)).toEqual([])
  })

  it('Deep-dive never holds concept-establishing material (theory/mentalModel/framework)', () => {
    const leaks = lessons.filter((l) => {
      const deepTypes = new Set(getDeepDiveBlocks(l.blocks).map((b) => b.type))
      return deepTypes.has('theory') || deepTypes.has('mentalModel') || deepTypes.has('framework')
    })
    expect(leaks.map((l) => l.id)).toEqual([])
  })

  it('reports the Core/Deep-dive block and timing distribution (Step 13 report)', () => {
    const rows = lessons.map((l) => ({
      id: l.id,
      coreBlocks: getCoreBlocks(l.blocks).length,
      deepBlocks: getDeepDiveBlocks(l.blocks).length,
      coreMin: getCoreReadingMinutes(l),
      deepMin: getDeepDiveReadingMinutes(l),
    }))
    const coreMins = rows.map((r) => r.coreMin).sort((a, b) => a - b)
    const deepMins = rows.map((r) => r.deepMin).sort((a, b) => a - b)
    const pct = (a: number[], p: number) => a[Math.floor((a.length - 1) * p)]
    // Emit a compact report for the run log (Step 13). Honest, computed estimates — no target.
    console.info(
      '[Phase4 corpus] lessons=%d | Core min p10/median/p90 = %d/%d/%d | Deep-dive min p10/median/p90 = %d/%d/%d',
      rows.length,
      pct(coreMins, 0.1), pct(coreMins, 0.5), pct(coreMins, 0.9),
      pct(deepMins, 0.1), pct(deepMins, 0.5), pct(deepMins, 0.9)
    )
    // Well-formed: every lesson has a positive Core estimate and some optional depth.
    expect(coreMins[0]).toBeGreaterThan(0)
    expect(rows.every((r) => r.deepBlocks > 0)).toBe(true)
  })
})
