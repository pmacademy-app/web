import path from 'path'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { cache } from 'react'

export interface RawGlossaryEntry {
  term: string
  definition: string
  related?: string
  difficulty?: string
  first_taught_lesson: number
  appears_in_lessons?: number[]
}

export interface ParsedGlossaryItem {
  term: string
  name: string
  badge: string | null
  slug: string
  definition: string
  related?: string
  firstTaughtLesson: number
  lessonSlug: string
}

/**
 * Normalizes term names and extracts parenthetical suffixes like "(Failure Pattern)" or "(HMW)".
 */
export function parseGlossaryTerm(rawTerm: string): { name: string; badge: string | null } {
  const match = rawTerm.match(/^(.*?)(?:\s*\(([^)]+)\))\s*$/)
  let name = rawTerm
  let badge: string | null = null

  if (match) {
    name = match[1].trim()
    badge = match[2].trim()
  }

  // Strip leading and trailing quotes
  name = name.replace(/^["']|["']$/g, '').trim()

  return { name, badge }
}

/**
 * Generates a unique, URL-safe anchor slug from a term.
 */
export function slugifyGlossaryTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/["'()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolves the path to content/master_glossary.json in both Next.js server runtime
 * and vitest / monorepo test environments.
 */
function resolveGlossaryFilePath(): string {
  const candidate1 = path.resolve(process.cwd(), '..', '..', 'content', 'master_glossary.json')
  if (existsSync(candidate1)) return candidate1

  const candidate2 = path.resolve(process.cwd(), 'content', 'master_glossary.json')
  if (existsSync(candidate2)) return candidate2

  const candidate3 = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'master_glossary.json')
  if (existsSync(candidate3)) return candidate3

  return candidate1
}

let cachedGlossary: ParsedGlossaryItem[] | null = null

/**
 * Fetches and parses all 479 glossary entries, sorted alphabetically by clean term name.
 */
export const fetchGlossaryData = cache(async (): Promise<ParsedGlossaryItem[]> => {
  if (cachedGlossary) {
    return cachedGlossary
  }

  const filePath = resolveGlossaryFilePath()
  const raw = await readFile(filePath, 'utf-8')
  const entries = JSON.parse(raw) as RawGlossaryEntry[]

  const parsed: ParsedGlossaryItem[] = entries.map((entry) => {
    const { name, badge } = parseGlossaryTerm(entry.term)
    const slug = slugifyGlossaryTerm(entry.term)
    const lessonSlug = `lesson-${String(entry.first_taught_lesson).padStart(3, '0')}`

    return {
      term: entry.term,
      name,
      badge,
      slug,
      definition: entry.definition,
      related: entry.related,
      firstTaughtLesson: entry.first_taught_lesson,
      lessonSlug,
    }
  })

  // Sort alphabetically by clean name
  parsed.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  cachedGlossary = parsed
  return parsed
})

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Groups items into letter buckets (A to Z).
 */
export function groupGlossaryByLetter(items: ParsedGlossaryItem[]): Record<string, ParsedGlossaryItem[]> {
  const groups: Record<string, ParsedGlossaryItem[]> = {}
  for (const letter of ALPHABET) {
    groups[letter] = []
  }

  for (const item of items) {
    const firstChar = item.name.charAt(0).toUpperCase()
    if (groups[firstChar]) {
      groups[firstChar].push(item)
    } else {
      // Fallback for non-alphabetic starting characters if any
      const bucket = '#'
      if (!groups[bucket]) groups[bucket] = []
      groups[bucket].push(item)
    }
  }

  return groups
}
