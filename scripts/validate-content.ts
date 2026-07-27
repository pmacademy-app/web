import fs from 'fs'
import path from 'path'
import type { ParsedLesson } from './parse-content'

const CONTENT_DIR = path.resolve(__dirname, '../apps/web/public/content')
const LESSONS_DIR = path.resolve(CONTENT_DIR, 'lessons')

export function validateContent(): boolean {
  console.log('🔍 Validating PM Academy static content...')

  if (!fs.existsSync(LESSONS_DIR)) {
    console.error('❌ Error: Lessons directory does not exist. Run parse-content first.')
    return false
  }

  const files = fs.readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.json'))
  let totalErrors = 0
  let totalQuizzes = 0

  if (files.length === 0) {
    console.error('❌ Error: No parsed lesson JSON files found.')
    return false
  }

  for (const file of files) {
    const filePath = path.join(LESSONS_DIR, file)
    let lesson: ParsedLesson
    try {
      lesson = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch (e: any) {
      console.error(`❌ ${file}: Invalid JSON file. ${e.message}`)
      totalErrors++
      continue
    }

    // Validate Meta
    if (!lesson.meta || !lesson.meta.slug || !lesson.meta.title || !lesson.meta.number) {
      console.error(`❌ ${file}: Missing required metadata fields (slug, title, number).`)
      totalErrors++
    }

    // Validate Theory
    if (!lesson.theory || lesson.theory.length < 50) {
      console.error(`❌ ${file}: Theory text is missing or too short.`)
      totalErrors++
    }

    // Validate Quizzes
    if (!lesson.quiz || lesson.quiz.length === 0) {
      console.warn(`⚠️ ${file}: Warning — No quiz questions found.`)
    } else {
      totalQuizzes += lesson.quiz.length
      lesson.quiz.forEach((q, idx) => {
        if (!q.questionText) {
          console.error(`❌ ${file}: Quiz #${idx + 1} is missing questionText.`)
          totalErrors++
        }
        if (!q.options || q.options.length < 2) {
          console.error(`❌ ${file}: Quiz #${idx + 1} has less than 2 options.`)
          totalErrors++
        }
        if (q.correctOptionIndex < 0 || q.correctOptionIndex >= q.options.length) {
          console.error(`❌ ${file}: Quiz #${idx + 1} has invalid correctOptionIndex (${q.correctOptionIndex}).`)
          totalErrors++
        }
        if (!q.explanation) {
          console.error(`❌ ${file}: Quiz #${idx + 1} is missing explanation.`)
          totalErrors++
        }
      })
    }
  }

  if (totalErrors > 0) {
    console.error(`❌ Validation FAILED with ${totalErrors} error(s) across ${files.length} lessons.`)
    return false
  }

  console.log(`✅ Validation PASSED! Verified ${files.length} lessons and ${totalQuizzes} quiz questions successfully.`)
  return true
}

if (require.main === module) {
  const success = validateContent()
  if (!success) process.exit(1)
}
