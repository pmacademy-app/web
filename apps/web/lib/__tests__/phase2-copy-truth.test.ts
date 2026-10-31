import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { CAPSTONE_DEFINITIONS } from '@/config/capstones'
import { HOME_CAPSTONES, SAMPLE_PORTFOLIO_PATH } from '@/config/marketing'
import { renderEmailTemplate } from '@/emails'
import { TEST_CERTIFICATE_LABEL } from '@/lib/certificates/presentation'
import { getLessonPosition } from '@/lib/curriculum/lesson-position'

/**
 * Phase 2 (T7): the product says only what it does.
 *
 * Audit 02-market-pov "Claims vs reality" found copy that promised more than the product
 * delivers: a "real portfolio" link to an unfinished page, "Every lesson is public" when
 * only previews are, an interview-ready capstone, hard-coded XP amounts, global lesson
 * numbers on public pages and zero-padded module numbers. Owner decision D6 also bans the
 * em-dash (U+2014) in user-facing copy. These tests pin the corrected copy.
 */

const ROOT = path.resolve(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
/** Source with comments removed, so a note about old copy is not mistaken for the copy. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const EM_DASH = '—'

const HOME_PORTFOLIO = 'components/marketing/sections/portfolio.tsx'
const HOME_FAQ = 'components/marketing/sections/home-faq.tsx'
const HOME_HERO = 'components/marketing/sections/hero.tsx'
const HOME_LEAVE_WITH = 'components/marketing/sections/what-you-leave-with.tsx'
const PUBLIC_LESSON = 'app/(marketing)/lessons/[slug]/page.tsx'

describe('homepage makes no claim the product cannot back', () => {
  it('does not link the unfinished sample portfolio anywhere on the homepage', () => {
    for (const rel of [HOME_PORTFOLIO, HOME_FAQ]) {
      const source = code(read(rel))
      expect(source, rel).not.toContain('SAMPLE_PORTFOLIO_PATH')
      expect(source, rel).not.toContain(SAMPLE_PORTFOLIO_PATH)
      expect(source, rel).not.toContain('sample_portfolio')
    }
    expect(code(read(HOME_PORTFOLIO))).not.toContain('See a real portfolio')
    expect(code(read(HOME_FAQ))).not.toContain('Open one')
  })

  it('keeps the sample path in config, marked to restore once the exemplar is finished', () => {
    expect(SAMPLE_PORTFOLIO_PATH).toMatch(/^\/p\//)
    expect(read('config/marketing.ts')).toContain(
      'restore the link once the exemplar portfolio is finished'
    )
  })

  it('states lesson access as previews, not every lesson', () => {
    const faq = code(read(HOME_FAQ))
    expect(faq).not.toContain('Every lesson is public.')
    expect(faq).toContain('Lesson previews are public.')
  })

  it('names the hero outcome as a portfolio, not "proof"', () => {
    const hero = code(read(HOME_HERO))
    expect(hero).not.toContain('Leave with proof.')
    expect(hero).toContain('Leave with a portfolio you can share.')
  })

  it('describes PM Fellow as a portfolio review by an admin', () => {
    const leaveWith = code(read(HOME_LEAVE_WITH))
    expect(leaveWith).not.toContain('Earned, then reviewed.')
    expect(leaveWith).not.toContain('No fee, no shortcut.')
    expect(leaveWith).toContain('PM Fellow. Complete your portfolio, then an admin reviews it.')
    expect(leaveWith).toContain('Free. Every requirement still applies.')
  })
})

describe('capstone 9 is a case study, not interview prep', () => {
  it('stores the factual title and tagline at the source', () => {
    const ninth = CAPSTONE_DEFINITIONS.capstone
    expect(ninth.title).toBe('End-to-End Product Case Study')
    expect(ninth.tagline).toBe(
      'Synthesize all 9 modules into an end-to-end product case study for your portfolio.'
    )
    expect(`${ninth.title} ${ninth.tagline}`).not.toMatch(/interview/i)
  })

  it('reaches the homepage without a display override', () => {
    const ninth = HOME_CAPSTONES.find((capstone) => capstone.number === 9)
    expect(ninth?.title).toBe(CAPSTONE_DEFINITIONS.capstone.title)
    expect(read('config/marketing.ts')).not.toContain('DISPLAY_TITLE_OVERRIDES')
  })
})

describe('welcome email', () => {
  it('frames the portfolio as something the learner shares and names its real destination', async () => {
    const { html, text } = await renderEmailTemplate('auth.welcome', {
      userName: 'Jordan',
      appUrl: 'https://prodily.example',
    })
    expect(text).toContain("You're building a public PM portfolio you can share with recruiters.")
    expect(text).not.toMatch(/recruiters can see/)
    expect(text).toContain('Open your dashboard')
    expect(text).not.toContain('Start Lesson 1')
    expect(html).toContain('https://prodily.example/dashboard')
  })
})

describe('XP copy names no amount the server does not set', () => {
  it('capstones page and reflection field do not hard-code XP values', () => {
    const capstones = code(read('app/(app)/capstones/page.tsx'))
    expect(capstones).not.toContain('150 XP')
    expect(capstones).toContain('XP for every submission')

    const reflection = code(read('components/capstones/CapstoneReflection.tsx'))
    expect(reflection).not.toMatch(/\+\d+ XP/)
    expect(reflection).toContain('Reflections earn XP when submitted.')
  })
})

describe('module and lesson numbering', () => {
  it('module labels are not zero-padded', () => {
    for (const rel of [
      'app/(marketing)/curriculum/page.tsx',
      'components/capstones/CapstoneCard.tsx',
    ]) {
      const source = code(read(rel))
      expect(source, rel).not.toMatch(/Module \{String\([^)]*\)\.padStart/)
      expect(source, rel).not.toMatch(/Module 0[1-9]/)
    }
  })

  it('academy module headers read the lesson count from module meta', () => {
    const academy = code(read('app/(app)/academy/page.tsx'))
    expect(academy).not.toContain('10 Lessons')
    expect(academy).not.toContain('/10 Done')
    expect(academy).toContain('getModuleMeta(moduleSlug)?.lessonCount')
  })

  it('the public lesson page shows the module-local position, never the global number', () => {
    const page = code(read(PUBLIC_LESSON))
    expect(page).toContain('getLessonPosition(')
    expect(page).toContain('Start {position.label} free')
    expect(page).toContain('{position.label}')
    expect(page).not.toMatch(/Start Lesson \{globalOrder\}/)
    expect(page).not.toMatch(/>\s*Lesson \{globalOrder\}\s*</)
    expect(page).not.toMatch(/Lesson \{globalOrder\} and build/)
  })

  it('a deep public lesson resolves to its module-local label', () => {
    const curriculum = JSON.parse(read('../../content/dist/curriculum.json')) as {
      lessons: Array<{ id: string; module: string; slug: string }>
    }
    const lesson42 = curriculum.lessons.find((lesson) => lesson.slug === 'lesson-042')
    expect(lesson42).toBeDefined()
    const position = getLessonPosition(lesson42!, curriculum)
    expect(position.globalNumber).toBe(42)
    expect(position.label).toBe('Module 5 · Lesson 2')
  })
})

describe('no em-dash in user-facing copy (D6)', () => {
  it('certificate test label uses parentheses', () => {
    expect(TEST_CERTIFICATE_LABEL).toBe('Test certificate (not a valid credential)')
  })

  it('the files this phase corrected carry no em-dash', () => {
    for (const rel of [
      'components/layout/Topbar.tsx',
      'lib/certificates/presentation.ts',
      'lib/frameworks.ts',
      'components/admin/ExperimentReadoutView.tsx',
      HOME_PORTFOLIO,
      HOME_FAQ,
      HOME_HERO,
      HOME_LEAVE_WITH,
      PUBLIC_LESSON,
      'emails/templates/auth/Welcome.tsx',
      'app/(app)/capstones/page.tsx',
      'components/capstones/CapstoneReflection.tsx',
      'components/capstones/CapstoneCard.tsx',
      'app/(marketing)/curriculum/page.tsx',
      'app/(app)/academy/page.tsx',
      'config/marketing.ts',
    ]) {
      expect(read(rel), rel).not.toContain(EM_DASH)
    }
  })

  it('the topbar level reads "Lvl N: Title"', () => {
    expect(read('components/layout/Topbar.tsx')).toContain('Lvl {userProfile.level}: {levelTitle}')
  })
})
