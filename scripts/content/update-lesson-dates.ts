/**
 * Helper script to update content/lesson-dates.json from git commit history.
 * Run locally with a full git clone when lessons are updated.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT_DIR = path.resolve(__dirname, '../..')
const REGISTRY_PATH = path.join(ROOT_DIR, 'content/.ids/lesson-id-registry.json')
const DATES_PATH = path.join(ROOT_DIR, 'content/lesson-dates.json')

export function updateLessonDates(): void {
  if (!fs.existsSync(REGISTRY_PATH)) {
    throw new Error(`Lesson registry not found at ${REGISTRY_PATH}`)
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) as Record<string, string>
  const dates: Record<string, string> = {}

  for (const [file, id] of Object.entries(registry)) {
    const fullPath = path.join(ROOT_DIR, file)
    let dateStr = ''
    try {
      dateStr = execSync(`git log -1 --format=%cs -- "${fullPath}"`, { encoding: 'utf-8' }).trim()
    } catch (err) {
      console.warn(`Warning: Could not get git log date for ${file}:`, err)
    }

    dates[id] = dateStr || '2026-10-31'
  }

  fs.writeFileSync(DATES_PATH, JSON.stringify(dates, null, 2) + '\n', 'utf-8')
  console.log(`Updated ${Object.keys(dates).length} lesson dates in ${DATES_PATH}`)
}

if (require.main === module) {
  updateLessonDates()
}
