import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { BlockTreeServerRenderer } from '@/renderer/block-tree-server'
import {
  getBlocksForTab,
  withInteractiveBlocksOnly,
} from '@/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-tabs'
import type { CompiledBlock, CompiledLesson } from '@/types'

// Performance plan item 12: the lesson page renders the Theory tab on the server and passes
// it into the client shell as a ReactNode, so prose blocks are not serialized as props and
// marked + DOMPurify are not shipped to the browser on the lesson page.

const root = path.resolve(__dirname, '../../')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8')
const ROUTE = 'app/(app)/academy/[moduleSlug]/[lessonId]'

const blocks: CompiledBlock[] = [
  { blockId: 'h', type: 'heading', level: 2, text: 'Heading' },
  { blockId: 'p', type: 'paragraph', text: 'Prose' },
  { blockId: 'cs', type: 'caseStudy', title: 'Case' },
  { blockId: 'q', type: 'quiz', questions: [] },
  { blockId: 'f', type: 'flashcardDeck', cards: [] },
  { blockId: 'r', type: 'reflection', prompts: ['Why?'] },
]

describe('withInteractiveBlocksOnly', () => {
  it('keeps only the blocks the interactive tabs read', () => {
    const lesson = { id: 'les_x', title: 'T', blocks } as unknown as CompiledLesson
    const out = withInteractiveBlocksOnly(lesson)
    expect(out.blocks.map((b) => b.type)).toEqual(['quiz', 'flashcardDeck', 'reflection'])
    expect(out.title).toBe('T')
  })

  it('does not mutate the shared compiled lesson', () => {
    const lesson = { id: 'les_x', blocks } as unknown as CompiledLesson
    const before = JSON.stringify(lesson)
    withInteractiveBlocksOnly(lesson)
    expect(JSON.stringify(lesson)).toBe(before)
  })

  it('theory blocks and interactive blocks partition the control lesson', () => {
    const theory = getBlocksForTab(blocks, 'theory', 'control').map((b) => b.blockId)
    expect(theory).toEqual(['h', 'p', 'cs'])
  })
})

describe('academy lesson page passes server-rendered theory to the client shell', () => {
  const page = read(`${ROUTE}/page.tsx`)

  it('renders the theory and Deep-dive with the server block renderer', () => {
    expect(page).toContain("import { BlockTreeServerRenderer } from '@/renderer/block-tree-server'")
    expect(page).toMatch(/const theory = <BlockTreeServerRenderer blocks=\{theoryBlocks\}/)
    expect(page).toMatch(/getBlocksForTab\(lesson\.blocks, 'theory', recutVariant\)/)
    expect(page).toMatch(/theory=\{theory\}/)
    expect(page).toMatch(/deepDive=\{deepDive\}/)
  })

  it('narrows the lesson prop to interactive blocks before toClientLesson', () => {
    expect(page).toMatch(/const renderedLesson = withInteractiveBlocksOnly\(sampledLesson\)/)
    expect(page).toMatch(/const clientLesson = toClientLesson\(renderedLesson\)/)
    expect(page).toMatch(/lesson=\{clientLesson\}/)
  })
})

describe('lesson page client modules do not import the markdown pipeline', () => {
  const clientFiles = [
    `${ROUTE}/lesson-content.tsx`,
    `${ROUTE}/lesson-tabs.ts`,
    'components/academy/DeepDiveSection.tsx',
    'renderer/block-error-boundary.tsx',
  ]

  it.each(clientFiles)('%s imports neither the client block registry nor MarkdownRenderer', (file) => {
    const src = read(file)
    expect(src).not.toMatch(/from ['"]@\/renderer\/block-tree-renderer['"]/)
    expect(src).not.toMatch(/['"]@\/blocks\/index['"]/)
    expect(src).not.toMatch(/import [^;]*MarkdownRenderer/)
    expect(src).not.toMatch(/from ['"]marked['"]/)
    expect(src).not.toMatch(/from ['"][^'"]*dompurify['"]/i)
  })

  it('lesson-content renders the theory slot instead of a block tree', () => {
    const src = read(`${ROUTE}/lesson-content.tsx`)
    expect(src).toContain('{theory}')
    expect(src).not.toContain('BlockTreeRenderer')
  })

  it('lesson-content has no try/finally (React Compiler skips components that use it)', () => {
    expect(read(`${ROUTE}/lesson-content.tsx`)).not.toMatch(/\bfinally\s*\{/)
  })
})

describe('server block tree keeps sanitizing and isolates block failures', () => {
  it('sanitizes markdown on the server path', () => {
    const html = renderToString(
      React.createElement(BlockTreeServerRenderer, {
        blocks: [
          { blockId: 'x', type: 'paragraph', text: 'Hi <img src=x onerror="alert(1)"> <script>alert(2)</script>' },
        ],
        lessonId: 'les_x',
      })
    )
    expect(html).toContain('Hi')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script>')
  })

  it('wraps each block in the primitive-props error boundary', () => {
    const src = read('renderer/block-tree-server.tsx')
    expect(src).toContain("import { BlockErrorBoundary } from './block-error-boundary'")
    expect(src).toMatch(/blockId=\{block\.blockId\}\s+blockType=\{block\.type\}/)
    expect(read('renderer/block-error-boundary.tsx')).toMatch(/^'use client'/)
  })
})
