import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { BlockTreeServerRenderer } from '@/renderer/block-tree-server'
import type { CompiledBlock } from '@/types'

describe('ENG-12 / AG-32: Lighter Lesson Pages & CI Build Reuse', () => {
  const rootDir = path.resolve(__dirname, '../../')

  describe('Server Component Block Tree Renderer', () => {
    it('block-tree-server.tsx does not have a "use client" directive', () => {
      const serverRendererPath = path.join(rootDir, 'renderer/block-tree-server.tsx')
      const content = fs.readFileSync(serverRendererPath, 'utf-8')
      expect(content).not.toMatch(/^['"]use client['"]/m)
    })

    it('public lesson page uses BlockTreeServerRenderer instead of client BlockTreeRenderer', () => {
      const publicLessonPagePath = path.join(rootDir, 'app/(marketing)/lessons/[slug]/page.tsx')
      const content = fs.readFileSync(publicLessonPagePath, 'utf-8')
      expect(content).toContain('BlockTreeServerRenderer')
      expect(content).not.toContain('BlockTreeRenderer')
    })

    it('renders theory blocks server-side to static HTML', () => {
      const sampleBlocks: CompiledBlock[] = [
        {
          blockId: 'b-1',
          type: 'heading',
          level: 2,
          text: 'Core Product Foundations',
        },
        {
          blockId: 'b-2',
          type: 'paragraph',
          text: 'This is a server-rendered theory paragraph explaining product craft.',
        },
        {
          blockId: 'b-3',
          type: 'learningObjectives',
          objectives: ['Master customer empathy', 'Define explicit metric indicators'],
        },
      ]

      const markup = renderToString(
        React.createElement(BlockTreeServerRenderer, {
          blocks: sampleBlocks,
          lessonId: 'lesson-foundations-1',
        })
      )

      expect(markup).toContain('Core Product Foundations')
      expect(markup).toContain('server-rendered theory paragraph')
      expect(markup).toContain('Learning Objectives')
      expect(markup).toContain('Master customer empathy')
    })
  })

  describe('Repository Client Boundary Reductions', () => {
    it('reduces the count of "use client" component files below the baseline of 208', () => {
      const scanDirs = ['app', 'components', 'blocks', 'renderer']
      let clientCount = 0

      for (const dirName of scanDirs) {
        const fullDir = path.join(rootDir, dirName)
        if (!fs.existsSync(fullDir)) continue

        const walk = (d: string) => {
          for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, ent.name)
            if (ent.isDirectory()) {
              if (ent.name !== '__tests__' && ent.name !== 'node_modules') walk(p)
            } else if (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts')) {
              const src = fs.readFileSync(p, 'utf-8')
              if (/^['"]use client['"]/m.test(src)) {
                clientCount++
              }
            }
          }
        }
        walk(fullDir)
      }

      // Baseline recorded before AG-32 was 208. We removed 14 redundant client directives.
      expect(clientCount).toBeLessThan(208)
      // 195: components/layout/lazy-modals.tsx is one small client boundary that keeps about
      // 2,000 lines of modal code out of every app page until a modal opens (perf plan item 5).
      expect(clientCount).toBeLessThanOrEqual(195)
    })
  })

  describe('CI Build Reuse (ENG-14)', () => {
    it('executes exactly one npm run build in .github/workflows/ci.yml', () => {
      const ciPath = path.resolve(rootDir, '../../.github/workflows/ci.yml')
      const ciContent = fs.readFileSync(ciPath, 'utf-8')
      const matches = ciContent.match(/run:\s*npm\s+run\s+build/g)
      expect(matches).not.toBeNull()
      expect(matches?.length).toBe(1)
    })

    it('e2e job depends on build-and-validate and downloads next-build artifact', () => {
      const ciPath = path.resolve(rootDir, '../../.github/workflows/ci.yml')
      const ciContent = fs.readFileSync(ciPath, 'utf-8')
      expect(ciContent).toContain('needs: [build-and-validate]')
      expect(ciContent).toContain('actions/upload-artifact@v4')
      expect(ciContent).toContain('actions/download-artifact@v4')
      expect(ciContent).toContain('name: next-build')
    })
  })
})
