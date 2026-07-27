import fs from 'fs'
import path from 'path'
import type { ParsedLesson } from './parse-content'

const CONTENT_DIR = path.resolve(__dirname, '../apps/web/public/content')
const LESSONS_DIR = path.resolve(CONTENT_DIR, 'lessons')
const SEARCH_INDEX_PATH = path.resolve(CONTENT_DIR, 'search-index.json')

export interface SearchDoc {
  id: string
  type: 'lesson' | 'glossary' | 'flashcard'
  title: string
  snippet: string
  slug?: string
  moduleName?: string
  lessonNumber?: number
  tags?: string[]
}

export function generateSearchIndex() {
  console.log('🔎 Generating search index for PM Academy...')

  if (!fs.existsSync(LESSONS_DIR)) {
    console.error('❌ Error: Lessons directory does not exist. Run parse-content first.')
    return
  }

  const searchDocs: SearchDoc[] = []

  // 1. Index Lessons
  const lessonFiles = fs.readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.json'))
  for (const file of lessonFiles) {
    const lesson: ParsedLesson = JSON.parse(fs.readFileSync(path.join(LESSONS_DIR, file), 'utf-8'))
    const snippet = (lesson.learningObjectives || []).join(' ') + ' ' + (lesson.meta.futureTopicsUnlocked || '')
    searchDocs.push({
      id: `lesson-${lesson.meta.slug}`,
      type: 'lesson',
      title: `Lesson ${lesson.meta.number}: ${lesson.meta.title}`,
      snippet: snippet.slice(0, 300),
      slug: lesson.meta.slug,
      moduleName: lesson.meta.moduleName,
      lessonNumber: lesson.meta.number,
    })
  }

  // 2. Index Glossary (if exists)
  const glossaryPath = path.resolve(CONTENT_DIR, 'glossary.json')
  if (fs.existsSync(glossaryPath)) {
    const glossary: any[] = JSON.parse(fs.readFileSync(glossaryPath, 'utf-8'))
    glossary.forEach((item, idx) => {
      searchDocs.push({
        id: `glossary-${idx}`,
        type: 'glossary',
        title: item.term,
        snippet: item.definition,
        lessonNumber: item.first_taught_lesson,
      })
    })
  }

  // 3. Index Flashcards (if exists)
  const flashcardsPath = path.resolve(CONTENT_DIR, 'flashcards.json')
  if (fs.existsSync(flashcardsPath)) {
    const flashcards: any[] = JSON.parse(fs.readFileSync(flashcardsPath, 'utf-8'))
    flashcards.forEach((item, idx) => {
      searchDocs.push({
        id: `flashcard-${idx}`,
        type: 'flashcard',
        title: item.front,
        snippet: item.back,
        lessonNumber: item.lesson,
        tags: item.tags ? item.tags.split(/\s+/) : [],
      })
    })
  }

  fs.writeFileSync(SEARCH_INDEX_PATH, JSON.stringify(searchDocs, null, 2))
  console.log(`✅ Search index generated with ${searchDocs.length} items at ${SEARCH_INDEX_PATH}`)
}

if (require.main === module) {
  generateSearchIndex()
}
