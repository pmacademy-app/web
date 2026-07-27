import fs from 'fs'
import path from 'path'

export interface QuizQuestion {
  id: string
  questionNumber: number
  questionText: string
  options: string[]
  correctOptionIndex: number // 0-indexed
  correctOptionLetter: string // 'A' | 'B' | 'C' | 'D'
  explanation: string
  learningObjective?: string
  difficulty?: string
}

export interface FlashcardItem {
  id: string
  front: string
  back: string
  difficulty: string
  tags: string[]
  lessonNumber: number
}

export interface LessonMeta {
  slug: string
  number: number
  title: string
  moduleNumber: number
  moduleName: string
  difficulty: number
  estMinutesReading: number
  estMinutesReflection: number
  prerequisites: string
  nextLessonSlug: string
  futureTopicsUnlocked: string
}

export interface ParsedLesson {
  meta: LessonMeta
  learningObjectives: string[]
  theory: string
  mistakes: string
  mentalModel: {
    title: string
    content: string
    diagramMermaid?: string
  }
  caseStudy: {
    title: string
    content: string
  }
  framework: {
    title: string
    content: string
  }
  realWorldPerspective: {
    title: string
    content: string
  }
  quiz: QuizQuestion[]
  flashcards: FlashcardItem[]
  reflectionPrompt: string
  connections: string
  rawMarkdownPath: string
}

const LESSONS_DIR = path.resolve(__dirname, '../content/lessons')
const MASTER_FLASHCARDS_PATH = path.resolve(__dirname, '../content/master_flashcards.json')
const MASTER_GLOSSARY_PATH = path.resolve(__dirname, '../content/master_glossary.json')
const OUTPUT_DIR = path.resolve(__dirname, '../apps/web/public/content')
const LESSONS_OUTPUT_DIR = path.resolve(OUTPUT_DIR, 'lessons')

function parseQuizzes(markdown: string, lessonNumber: number): QuizQuestion[] {
  const quizSection = markdown.split(/## (?:Practice Quiz|Quiz|Self-Assessment Quiz)/i)[1]
  if (!quizSection) return []

  // Split by quiz question headers, e.g., "**1. Question...**"
  const questionBlocks = quizSection.split(/\n(?=\*\*\d+\.|\d+\.\s+\*\*)/)
  const questions: QuizQuestion[] = []

  for (const block of questionBlocks) {
    const headerMatch = block.match(/\*?\*?(\d+)\.\s*(.*?)(?:\*?\*?\n|\n)/)
    if (!headerMatch) continue

    const qNum = parseInt(headerMatch[1], 10)
    const qText = headerMatch[2].replace(/^\*\*/, '').replace(/\*\*$/, '').trim()

    // Extract options A), B), C), D)
    const optionMatches = [...block.matchAll(/([A-D])\)\s*(.*?)(?=\n[A-D]\)|\n\*|\n\n|$)/gs)]
    const options: string[] = []
    optionMatches.forEach((m) => {
      options.push(m[2].trim().replace(/\s+/g, ' '))
    })

    // Extract Correct Answer
    const correctMatch = block.match(/\*Correct answer:\s*([A-D])\*/i)
    const correctLetter = correctMatch ? correctMatch[1].toUpperCase() : 'A'
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(correctLetter)

    // Extract Explanation
    const expMatch = block.match(/\*Explanation:\s*(.*?)\*/i)
    const explanation = expMatch ? expMatch[1].trim() : ''

    // Extract Learning Objective
    const loMatch = block.match(/\*Learning objective tested:\s*(.*?)\*/i)
    const learningObjective = loMatch ? loMatch[1].trim() : ''

    // Extract Difficulty
    const diffMatch = block.match(/\*Difficulty:\s*(.*?)\*/i)
    const difficulty = diffMatch ? diffMatch[1].trim() : 'Medium'

    if (qText && options.length >= 2) {
      questions.push({
        id: `q-${String(lessonNumber).padStart(3, '0')}-${qNum}`,
        questionNumber: qNum,
        questionText: qText,
        options,
        correctOptionIndex: correctIndex >= 0 ? correctIndex : 0,
        correctOptionLetter: correctLetter,
        explanation,
        learningObjective,
        difficulty,
      })
    }
  }

  return questions
}

function parseLearningPath(markdown: string) {
  const match = markdown.match(/## Learning Path\s*\n\n([\s\S]*?)(?=\n---\n|\n## )/)
  const details: Record<string, string> = {}
  if (match) {
    const tableText = match[1]
    const rows = tableText.split('\n').filter((r) => r.includes('|'))
    for (const row of rows) {
      const cols = row.split('|').map((c) => c.trim()).filter(Boolean)
      if (cols.length >= 2 && cols[0] !== 'Field') {
        const key = cols[0].replace(/\*\*/g, '').trim()
        details[key] = cols[1]
      }
    }
  }
  return details
}

function parseLearningObjectives(markdown: string): string[] {
  const match = markdown.match(/## Learning Objectives\s*\n\n([\s\S]*?)(?=\n---\n|\n## )/)
  if (!match) return []
  return match[1]
    .split('\n')
    .filter((line) => /^\d+\.\s+/.test(line.trim()))
    .map((line) => line.replace(/^\d+\.\s+/, '').trim())
}

function extractSection(markdown: string, headingRegex: RegExp): string {
  const match = markdown.match(headingRegex)
  if (!match) return ''
  const startIndex = match.index! + match[0].length
  const rest = markdown.slice(startIndex)
  const nextHeading = rest.search(/\n## /)
  const sectionText = nextHeading !== -1 ? rest.slice(0, nextHeading) : rest
  return sectionText.trim()
}

export function parseLessonFile(filePath: string, masterFlashcards: any[]): ParsedLesson {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const fileName = path.basename(filePath)
  const numMatch = fileName.match(/\d+/)
  const lessonNumber = numMatch ? parseInt(numMatch[0], 10) : 1
  const slug = `lesson-${String(lessonNumber).padStart(3, '0')}`

  // Parse Title
  const titleMatch = raw.match(/^# Lesson \d+:\s*(.*?)$/m)
  const title = titleMatch ? titleMatch[1].trim() : `Lesson ${lessonNumber}`

  // Parse Learning Path Table
  const pathDetails = parseLearningPath(raw)
  const moduleStr = pathDetails['Module'] || '1 — Foundations'
  const modNumMatch = moduleStr.match(/\d+/)
  const moduleNumber = modNumMatch ? parseInt(modNumMatch[0], 10) : 1
  const moduleName = moduleStr.replace(/^\d+\s*—\s*/, '').trim()

  const diffStr = pathDetails['Difficulty'] || '1 / 10'
  const diffVal = parseInt(diffStr.split('/')[0].trim(), 10) || 1

  const timeStr = pathDetails['Estimated Study Time'] || '25 minutes'
  const estReadMatch = timeStr.match(/(\d+)\s*minutes?\s*\(reading\)/i) || timeStr.match(/(\d+)\s*minutes?/)
  const estMinutesReading = estReadMatch ? parseInt(estReadMatch[1], 10) : 25

  const estReflectMatch = timeStr.match(/(\d+)\s*minutes?\s*\(reflection/i)
  const estMinutesReflection = estReflectMatch ? parseInt(estReflectMatch[1], 10) : 10

  const prerequisites = pathDetails['Prerequisites'] || 'None'
  const nextLessonStr = pathDetails['Next Lesson'] || ''
  const nextNumMatch = nextLessonStr.match(/Lesson\s+(\d+)/i)
  const nextLessonSlug = nextNumMatch ? `lesson-${String(nextNumMatch[1]).padStart(3, '0')}` : ''

  const futureTopicsUnlocked = pathDetails['Future Topics Unlocked'] || ''

  // Objectives
  const learningObjectives = parseLearningObjectives(raw)

  // Theory
  const theory = extractSection(raw, /## Theory\n/)

  // Mistakes
  const mistakes = extractSection(raw, /## Common Beginner Mistakes\n|## Common Mistakes\n/)

  // Mental Model
  const mentalModelRaw = extractSection(raw, /## Mental Model:[^\n]*\n/)
  const mmTitleMatch = raw.match(/## Mental Model:\s*([^\n]+)/)
  const mmDiagramMatch = mentalModelRaw.match(/```mermaid\n([\s\S]*?)\n```/)
  const mentalModel = {
    title: mmTitleMatch ? mmTitleMatch[1].trim() : 'Mental Model',
    content: mentalModelRaw,
    diagramMermaid: mmDiagramMatch ? mmDiagramMatch[1].trim() : undefined,
  }

  // Case Study
  const caseStudyRaw = extractSection(raw, /## Detailed Case Study:[^\n]*\n|## Case Study:[^\n]*\n/)
  const csTitleMatch = raw.match(/## (?:Detailed )?Case Study:\s*([^\n]+)/)
  const caseStudy = {
    title: csTitleMatch ? csTitleMatch[1].trim() : 'Case Study',
    content: caseStudyRaw,
  }

  // Framework
  const frameworkRaw = extractSection(raw, /## Framework Explanation:[^\n]*\n|## Framework:[^\n]*\n/)
  const fwTitleMatch = raw.match(/## Framework(?: Explanation)?:\s*([^\n]+)/)
  const framework = {
    title: fwTitleMatch ? fwTitleMatch[1].trim() : 'Framework',
    content: frameworkRaw,
  }

  // Real World Perspective
  const rwpRaw = extractSection(raw, /## Real World Perspective:[^\n]*\n/)
  const rwpTitleMatch = raw.match(/## Real World Perspective:\s*([^\n]+)/)
  const realWorldPerspective = {
    title: rwpTitleMatch ? rwpTitleMatch[1].trim() : 'Real World Perspective',
    content: rwpRaw,
  }

  // Quizzes
  const quiz = parseQuizzes(raw, lessonNumber)

  // Flashcards from master_flashcards.json for this lesson
  const lessonFlashcards = masterFlashcards.filter((f) => f.lesson === lessonNumber)
  const flashcards: FlashcardItem[] = lessonFlashcards.map((f, i) => ({
    id: `fc-${String(lessonNumber).padStart(3, '0')}-${i + 1}`,
    front: f.front,
    back: f.back,
    difficulty: f.difficulty || 'Medium',
    tags: f.tags ? f.tags.split(/\s+/).filter(Boolean) : [],
    lessonNumber,
  }))

  // Reflection Prompt
  const reflectionPrompt = extractSection(raw, /## Reflection Exercise\n|## Reflection Prompt\n/)

  // Connections
  const connections = extractSection(raw, /## Connections\n/)

  return {
    meta: {
      slug,
      number: lessonNumber,
      title,
      moduleNumber,
      moduleName,
      difficulty: diffVal,
      estMinutesReading,
      estMinutesReflection,
      prerequisites,
      nextLessonSlug,
      futureTopicsUnlocked,
    },
    learningObjectives,
    theory,
    mistakes,
    mentalModel,
    caseStudy,
    framework,
    realWorldPerspective,
    quiz,
    flashcards,
    reflectionPrompt,
    connections,
    rawMarkdownPath: `content/lessons/${fileName}`,
  }
}

export function parseAllContent() {
  console.log('🚀 Parsing PM Academy content...')

  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
  if (!fs.existsSync(LESSONS_OUTPUT_DIR)) {
    fs.mkdirSync(LESSONS_OUTPUT_DIR, { recursive: true })
  }

  // Load master flashcards and glossary if available
  let masterFlashcards: any[] = []
  if (fs.existsSync(MASTER_FLASHCARDS_PATH)) {
    masterFlashcards = JSON.parse(fs.readFileSync(MASTER_FLASHCARDS_PATH, 'utf-8'))
  }

  if (fs.existsSync(MASTER_GLOSSARY_PATH)) {
    fs.copyFileSync(MASTER_GLOSSARY_PATH, path.resolve(OUTPUT_DIR, 'glossary.json'))
  }
  if (fs.existsSync(MASTER_FLASHCARDS_PATH)) {
    fs.copyFileSync(MASTER_FLASHCARDS_PATH, path.resolve(OUTPUT_DIR, 'flashcards.json'))
  }

  const files = fs
    .readdirSync(LESSONS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()

  const allLessons: ParsedLesson[] = []
  const lessonSummaries: LessonMeta[] = []

  for (const file of files) {
    const filePath = path.join(LESSONS_DIR, file)
    const parsed = parseLessonFile(filePath, masterFlashcards)
    allLessons.push(parsed)
    lessonSummaries.push(parsed.meta)

    // Save individual lesson JSON
    const outputPath = path.join(LESSONS_OUTPUT_DIR, `${parsed.meta.slug}.json`)
    fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2))
  }

  // Save lesson metadata index
  fs.writeFileSync(path.join(OUTPUT_DIR, 'lessons.json'), JSON.stringify(lessonSummaries, null, 2))

  console.log(`✅ Successfully parsed ${allLessons.length} lessons into ${LESSONS_OUTPUT_DIR}`)
  return allLessons
}

if (require.main === module) {
  parseAllContent()
}
