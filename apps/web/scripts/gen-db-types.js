/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process')
const fs = require('fs')

try {
  const output = execSync('npx supabase gen types typescript --project-id dkyasxwpunswfxfchjcn', {
    maxBuffer: 10 * 1024 * 1024,
    encoding: 'utf-8',
  })
  fs.writeFileSync('types/database.ts', output, 'utf-8')
  console.log('Successfully generated types/database.ts (UTF-8)')
} catch (err) {
  console.error('Failed to generate database types:', err)
  process.exit(1)
}
