#!/usr/bin/env node
// Guardrail checks for agent changes. Zero dependencies, Node 22+, works from any
// directory inside the repository and from PowerShell, cmd or bash (no shell is used).
//
// Fails (exit code 1) when the working tree, compared with HEAD, has:
//   1. any new, modified, renamed, deleted or staged top-level supabase/migrations/*.sql
//      (top-level files auto-apply to production on merge; new SQL belongs in pending-approval/)
//   2. an em-dash (U+2014) in an added line, or in an untracked, non-ignored text file
//   3. a new Tailwind `dark:` class in apps/web (.ts, .tsx, .css), added lines or untracked files
//   4. any tracked or untracked path under backups/ or named .env* (except apps/web/.env.example)
// Prints "guards: OK" when nothing is found.

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const EM_DASH = String.fromCharCode(0x2014) // built from its code so this file contains no em-dash
const TOP_LEVEL_MIGRATION = /^supabase\/migrations\/[^/]+\.sql$/
const DARK_CLASS = /(^|[\s"'`{(:])dark:[a-z[]/
const DARK_SCOPE = /^apps\/web\/.*\.(tsx|ts|css)$/
const ENV_ALLOWED = new Set(['apps/web/.env.example'])
const MAX_TEXT_BYTES = 2 * 1024 * 1024

// Run git with arguments (no shell) and return stdout as a string.
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim()
const problems = []

// --- 1. Top-level migrations -------------------------------------------------------
// Porcelain v1 with -z: each entry is "XY <path>\0"; for renames and copies (R or C in
// either column) the next NUL-separated field is the original path.
const porcelain = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], root).split('\0')
for (let i = 0; i < porcelain.length; i++) {
  const entry = porcelain[i]
  if (entry.length < 4) continue
  const xy = entry.slice(0, 2)
  const paths = [entry.slice(3)]
  if (/[RC]/.test(xy)) paths.push(porcelain[++i] ?? '')
  for (const p of paths) {
    if (TOP_LEVEL_MIGRATION.test(p)) {
      problems.push(`[migration] ${xy.trim() || '??'} ${p}: top-level migrations apply to production on merge. Use supabase/migrations/pending-approval/.`)
    }
  }
}

// --- 2 and 3. Added lines in the diff against HEAD ---------------------------------
let diff = ''
try {
  diff = git(['diff', 'HEAD', '-U0', '--no-color', '--no-ext-diff'], root)
} catch {
  diff = '' // no HEAD yet (fresh repository): nothing to compare
}
let currentFile = null
let lineNo = 0
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) {
    currentFile = line === '+++ /dev/null' ? null : line.slice(6) // strip "+++ b/"
    continue
  }
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line)
  if (hunk) { lineNo = Number(hunk[1]); continue }
  if (!currentFile || !line.startsWith('+')) continue
  const text = line.slice(1)
  checkText(currentFile, lineNo, text)
  lineNo++
}

// --- 2 and 3. Untracked, non-ignored files -----------------------------------------
const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], root).split('\0').filter(Boolean)
for (const rel of untracked) {
  const abs = path.join(root, rel)
  let buf
  try {
    if (statSync(abs).size > MAX_TEXT_BYTES) continue
    buf = readFileSync(abs)
  } catch { continue }
  if (buf.subarray(0, 8000).includes(0)) continue // binary
  buf.toString('utf8').split('\n').forEach((text, idx) => checkText(rel, idx + 1, text))
}

// --- 4. backups/ and .env* files, tracked or untracked -----------------------------
const tracked = git(['ls-files', '-z'], root).split('\0').filter(Boolean)
for (const rel of [...tracked, ...untracked]) {
  const base = rel.split('/').pop()
  if (rel.startsWith('backups/')) problems.push(`[secrets] ${rel}: backups/ must never be tracked or added.`)
  else if (base.startsWith('.env') && !ENV_ALLOWED.has(rel)) problems.push(`[secrets] ${rel}: .env files must never be tracked or added.`)
}

// Shared per-line checks for items 2 and 3.
function checkText(file, line, text) {
  if (text.includes(EM_DASH)) problems.push(`[em-dash] ${file}:${line}: replace the em-dash with a comma, colon or full stop.`)
  if (DARK_SCOPE.test(file) && DARK_CLASS.test(text)) problems.push(`[dark-mode] ${file}:${line}: dark mode is not supported; remove the dark: class.`)
}

if (problems.length) {
  console.error(`guards: FAILED (${problems.length})`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log('guards: OK')
