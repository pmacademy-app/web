import { describe, it, expect } from 'vitest'
import robots, { AI_CRAWLER_USER_AGENTS, PUBLIC_ALLOW_PATHS, PRIVATE_DISALLOW_PATHS } from '../../app/robots'
import { GET as getLlmsTxt } from '../../app/llms.txt/route'
import { getLessonSchema } from '../schema'
import { classifyReferrer } from '../analytics'
import { BRAND } from '../brand'
import { MODULE_META_LIST } from '../curriculum/module-meta'
import type { CompiledLesson } from '@/types'

describe('AEO-03: Authority & AI Visibility Suite', () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

  describe('robots.txt AI Crawlers and Rules', () => {
    it('defines rules for wildcard and all designated AI crawlers', () => {
      const robotRules = robots()
      expect(robotRules.sitemap).toBe(`${siteUrl}/sitemap.xml`)

      const rules = Array.isArray(robotRules.rules) ? robotRules.rules : [robotRules.rules]
      expect(rules.length).toBeGreaterThanOrEqual(1 + AI_CRAWLER_USER_AGENTS.length)

      const defaultRule = rules[0]
      expect(defaultRule.userAgent).toBe('*')

      const allowList = Array.isArray(defaultRule.allow) ? defaultRule.allow : [defaultRule.allow]
      const disallowList = Array.isArray(defaultRule.disallow) ? defaultRule.disallow : [defaultRule.disallow]

      expect(allowList).toEqual(expect.arrayContaining(PUBLIC_ALLOW_PATHS))
      expect(disallowList).toEqual(expect.arrayContaining(PRIVATE_DISALLOW_PATHS))

      // Crucial: /frameworks and /glossary must be allowed
      expect(allowList).toContain('/frameworks')
      expect(allowList).toContain('/glossary')

      // Crucial: Private routes must never be exposed
      expect(disallowList).toContain('/dashboard')
      expect(disallowList).toContain('/admin')
      expect(disallowList).toContain('/api/')
      expect(disallowList).toContain('/academy/')
      expect(disallowList).toContain('/settings')
    })

    it('explicitly allows known AI crawlers without relaxing private path protections', () => {
      const robotRules = robots()
      const rules = Array.isArray(robotRules.rules) ? robotRules.rules : [robotRules.rules]

      const requiredBots = [
        'GPTBot',
        'ChatGPT-User',
        'PerplexityBot',
        'ClaudeBot',
        'anthropic-ai',
        'Google-Extended',
        'Applebot-Extended',
        'cohere-ai',
      ]

      for (const bot of requiredBots) {
        const botRule = rules.find((r) => r.userAgent === bot)
        expect(botRule, `Missing rule for AI crawler ${bot}`).toBeDefined()

        const botAllows = Array.isArray(botRule!.allow) ? botRule!.allow : [botRule!.allow]
        const botDisallows = Array.isArray(botRule!.disallow) ? botRule!.disallow : [botRule!.disallow]

        expect(botAllows).toContain('/curriculum')
        expect(botAllows).toContain('/frameworks')
        expect(botAllows).toContain('/glossary')
        expect(botAllows).toContain('/lessons/')

        // Must keep every private disallow intact
        for (const privatePath of PRIVATE_DISALLOW_PATHS) {
          expect(botDisallows).toContain(privatePath)
        }
      }
    })
  })

  describe('llms.txt Route Handler', () => {
    it('returns plain text markdown with appropriate cache headers and content structure', async () => {
      const response = await getLlmsTxt()
      expect(response.status).toBe(200)

      const contentType = response.headers.get('Content-Type')
      expect(contentType).toBe('text/plain; charset=utf-8')

      const cacheControl = response.headers.get('Cache-Control')
      expect(cacheControl).toBe('public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')

      const text = await response.text()

      // Header and description
      expect(text).toContain('# Prodily')
      expect(text).toContain('free, structured product management education')

      // Curriculum and module links
      expect(text).toContain(`[Curriculum Overview](${siteUrl}/curriculum)`)
      for (const mod of MODULE_META_LIST) {
        expect(text).toContain(`Module ${mod.number}: ${mod.title}`)
        expect(text).toContain(`${siteUrl}/curriculum#module-${mod.number}`)
      }

      // Knowledge hubs
      expect(text).toContain(`[Glossary](${siteUrl}/glossary)`)
      expect(text).toContain(`[Frameworks](${siteUrl}/frameworks)`)

      // How to Cite guidance
      expect(text).toContain('How to Cite')
      expect(text).toContain('prodily.app')
    })
  })

  describe('Lesson Schema Author and DateModified', () => {
    const mockLesson: CompiledLesson = {
      schemaVersion: 1,
      contentHash: 'hash123',
      slug: 'lesson-001',
      totalInModule: 10,
      estimatedCompletionTime: 20,
      prerequisites: [],
      sourceFile: 'content/lessons/lesson-001.md',
      id: 'lesson-1-1',
      module: 'foundations',
      order: 1,
      title: 'Product Foundations and Roles',
      estimatedReadingTime: 12,
      difficulty: 2,
      blocks: [],
      updatedAt: '2026-11-14T10:00:00.000Z',
    }

    it('points author to person entity #person-aditya and sets dateModified from updatedAt', () => {
      const schema = getLessonSchema(mockLesson, 1, 'lesson-001')

      expect(schema.author).toEqual({
        '@type': 'Person',
        '@id': `${siteUrl}/#person-aditya`,
        name: 'Aditya Gangwani',
        url: 'https://adityagangwani.me',
      })

      expect(schema.dateModified).toBe('2026-11-14')
    })

    it('falls back to default dateModified when updatedAt is undefined', () => {
      const lessonWithoutDate: CompiledLesson = {
        ...mockLesson,
        updatedAt: undefined,
      }
      const schema = getLessonSchema(lessonWithoutDate, 1, 'lesson-001')
      expect(schema.dateModified).toBe('2026-10-31')
    })
  })

  describe('AI Referrer Classification', () => {
    it('classifies major AI answer engines accurately', () => {
      const testCases = [
        { referrer: 'https://chatgpt.com/', expectedSource: 'chatgpt' },
        { referrer: 'https://chatgpt.com/?q=prompt+query', expectedSource: 'chatgpt' },
        { referrer: 'https://chat.openai.com/c/conversation-uuid', expectedSource: 'chatgpt' },
        { referrer: 'https://perplexity.ai/search?query=prodily', expectedSource: 'perplexity' },
        { referrer: 'https://www.perplexity.ai/', expectedSource: 'perplexity' },
        { referrer: 'https://gemini.google.com/app', expectedSource: 'gemini' },
        { referrer: 'https://copilot.microsoft.com/?client=web', expectedSource: 'copilot' },
        { referrer: 'https://claude.ai/chat/conv-id-123', expectedSource: 'claude' },
      ]

      for (const tc of testCases) {
        const result = classifyReferrer(tc.referrer)
        expect(result.isAiReferral).toBe(true)
        expect(result.source).toBe(tc.expectedSource)
      }
    })

    it('rejects regular search engines and social platforms', () => {
      const nonAiReferrers = [
        'https://www.google.com/',
        'https://www.bing.com/',
        'https://linkedin.com/feed',
        'https://twitter.com/',
        'https://github.com/adityagangwani',
      ]

      for (const ref of nonAiReferrers) {
        const result = classifyReferrer(ref)
        expect(result.isAiReferral).toBe(false)
        expect(result.source).toBeUndefined()
      }
    })

    it('handles empty, null, undefined and malformed inputs gracefully without leaking PII', () => {
      expect(classifyReferrer(null)).toEqual({ isAiReferral: false })
      expect(classifyReferrer(undefined)).toEqual({ isAiReferral: false })
      expect(classifyReferrer('')).toEqual({ isAiReferral: false })
      expect(classifyReferrer('   ')).toEqual({ isAiReferral: false })
      expect(classifyReferrer('not_a_valid_url')).toEqual({ isAiReferral: false })

      // Strips query parameter strings and tokens
      const result = classifyReferrer('https://perplexity.ai/?token=secret_user_token&email=test@example.com')
      expect(result).toEqual({ isAiReferral: true, source: 'perplexity' })
      expect(JSON.stringify(result)).not.toContain('secret_user_token')
      expect(JSON.stringify(result)).not.toContain('test@example.com')
    })
  })
})
