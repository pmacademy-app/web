import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { toClientLesson } from '@/lib/academy/client-lesson'
import type { CompiledBlock, CompiledLesson } from '@/types'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>Problem</text></svg>'

function mermaid(blockId: string): CompiledBlock {
  return {
    blockId,
    id: blockId,
    type: 'mermaid',
    source: 'graph TD\n  A --> B',
    normalized: 'graph TD\n  A --> B',
    authorTheme: { primaryColor: '#fff' },
    svg: SVG,
    staticSvg: SVG,
  }
}

function makeLesson(): CompiledLesson {
  return {
    schemaVersion: 2,
    id: 'les_test01',
    contentHash: 'hash',
    title: 'Test lesson',
    slug: 'lesson-001',
    module: 'foundations',
    order: 1,
    totalInModule: 10,
    difficulty: 1,
    estimatedReadingTime: 8,
    estimatedCompletionTime: 15,
    prerequisites: [],
    sourceFile: 'content/lessons/lesson-001.md',
    searchable: { plainText: 'lots of text', headings: ['Intro'] },
    blocks: [
      { blockId: 'b-1', type: 'paragraph', text: 'Hello' },
      {
        blockId: 'b-2',
        type: 'mentalModel',
        name: 'Model',
        diagram: mermaid('blk_diagram01'),
        children: [{ blockId: 'b-2a', type: 'paragraph', text: 'Inside' }, mermaid('blk_child001')],
      },
      mermaid('blk_toplevel1'),
      {
        blockId: 'b-3',
        type: 'quiz',
        id: 'quiz-1',
        questions: [
          {
            id: 'q1',
            question: 'What?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 2,
            explanation: 'Because C.',
            objectivesTested: [0],
            difficulty: 'easy',
          },
        ],
      },
      {
        blockId: 'b-4',
        type: 'flashcardDeck',
        id: 'deck-1',
        cards: [{ id: 'c1', front: 'Front', back: 'Back', difficulty: 1, tags: ['t'] }],
      },
      { blockId: 'b-5', type: 'reflection', prompts: ['Reflect'] },
      // A non-mermaid block that happens to carry `source` must keep it.
      { blockId: 'b-6', type: 'resources', source: 'Book title' },
    ],
  }
}

function collectMermaid(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) value.forEach((v) => collectMermaid(v, out))
  else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.type === 'mermaid') out.push(obj)
    Object.values(obj).forEach((v) => collectMermaid(v, out))
  }
  return out
}

describe('toClientLesson', () => {
  it('removes top-level sourceFile and searchable', () => {
    const client = toClientLesson(makeLesson()) as Record<string, unknown>
    expect(client).not.toHaveProperty('sourceFile')
    expect(client).not.toHaveProperty('searchable')
    expect(client.id).toBe('les_test01')
    expect(client.estimatedReadingTime).toBe(8)
  })

  it('strips staticSvg, source, normalized and authorTheme from every mermaid block, keeping svg', () => {
    const blocks = collectMermaid(toClientLesson(makeLesson()).blocks)
    expect(blocks).toHaveLength(3) // top level, nested child, mentalModel.diagram
    for (const b of blocks) {
      expect(b.svg).toBe(SVG)
      expect(b).not.toHaveProperty('staticSvg')
      expect(b).not.toHaveProperty('source')
      expect(b).not.toHaveProperty('normalized')
      expect(b).not.toHaveProperty('authorTheme')
      expect(typeof b.blockId).toBe('string')
    }
  })

  it('sends quiz questions without correctAnswer or explanation, keeping text, options and ids', () => {
    const client = toClientLesson(makeLesson())
    const quiz = client.blocks.find((b) => b.type === 'quiz')!
    expect(quiz.blockId).toBe('b-3')
    expect(quiz.id).toBe('quiz-1')
    expect(quiz.questions).toEqual([
      {
        id: 'q1',
        question: 'What?',
        options: ['A', 'B', 'C', 'D'],
        objectivesTested: [0],
        difficulty: 'easy',
      },
    ])
    const serialized = JSON.stringify(client)
    expect(serialized).not.toContain('correctAnswer')
    expect(serialized).not.toContain('explanation')
    expect(serialized).not.toContain('Because C.')
  })

  it('drops any unknown question key (allowlist), including per-option answer flags', () => {
    const lesson = makeLesson()
    const quiz = lesson.blocks.find((b) => b.type === 'quiz')!
    quiz.questions = [
      {
        ...quiz.questions![0],
        hint: 'It is C',
        correctOption: 'C',
        isCorrect: [false, false, true, false],
      } as unknown as NonNullable<typeof quiz.questions>[number],
    ]
    const question = toClientLesson(lesson).blocks.find((b) => b.type === 'quiz')!.questions![0]
    expect(Object.keys(question).sort()).toEqual(
      ['difficulty', 'id', 'objectivesTested', 'options', 'question'].sort()
    )
  })

  it('strips quiz answers from a nested quiz block and from every compiled lesson', () => {
    const lesson = makeLesson()
    const quiz = lesson.blocks.find((b) => b.type === 'quiz')!
    lesson.blocks.push({ blockId: 'b-7', type: 'section', children: [quiz] } as CompiledBlock)
    expect(JSON.stringify(toClientLesson(lesson))).not.toContain('correctAnswer')

    const distDir = path.resolve(__dirname, '../../../../content/dist/lessons')
    const files = fs.readdirSync(distDir).filter((f) => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const compiled = JSON.parse(fs.readFileSync(path.join(distDir, file), 'utf-8')) as CompiledLesson
      const client = toClientLesson(compiled)
      const quizBlock = client.blocks.find((b) => b.type === 'quiz')
      expect(quizBlock?.questions?.length, file).toBeGreaterThan(0)
      for (const q of quizBlock?.questions ?? []) {
        expect(q, file).not.toHaveProperty('correctAnswer')
        expect(q, file).not.toHaveProperty('explanation')
        expect(q.options.length, file).toBeGreaterThan(1)
      }
      expect(JSON.stringify(client).includes('"correctAnswer"'), file).toBe(false)
    }
  })

  it('keeps flashcard, reflection and other block data intact', () => {
    const lesson = makeLesson()
    const client = toClientLesson(lesson)
    const byType = (t: string) => client.blocks.find((b) => b.type === t)
    expect(byType('flashcardDeck')).toEqual(lesson.blocks.find((b) => b.type === 'flashcardDeck'))
    expect(byType('reflection')).toEqual(lesson.blocks.find((b) => b.type === 'reflection'))
    expect(byType('resources')?.source).toBe('Book title')
    expect(client.blocks.map((b) => b.blockId)).toEqual(lesson.blocks.map((b) => b.blockId))
  })

  it('does not mutate the input lesson (it is a shared cached object)', () => {
    const lesson = makeLesson()
    const before = JSON.stringify(lesson)
    const client = toClientLesson(lesson)
    expect(JSON.stringify(lesson)).toBe(before)
    expect(client.blocks).not.toBe(lesson.blocks)
    expect(client.blocks[3]).not.toBe(lesson.blocks[3])
  })
})

describe('academy lesson page passes the stripped lesson to the client', () => {
  const pagePath = path.resolve(__dirname, '../../app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx')
  const source = fs.readFileSync(pagePath, 'utf-8')

  it('imports toClientLesson and passes its result as the lesson prop', () => {
    expect(source).toContain("import { toClientLesson } from '@/lib/academy/client-lesson'")
    expect(source).toMatch(/const clientLesson = toClientLesson\(renderedLesson\)/)
    expect(source).toMatch(/lesson=\{clientLesson\}/)
    expect(source).not.toMatch(/lesson=\{renderedLesson\}/)
    expect(source).not.toMatch(/lesson=\{lesson\}/)
  })

  it('MermaidBlock renders only svg, not the removed staticSvg', () => {
    const mermaidPath = path.resolve(__dirname, '../../blocks/mermaid/MermaidBlock.tsx')
    expect(fs.readFileSync(mermaidPath, 'utf-8')).not.toContain('block.staticSvg')
  })
})
