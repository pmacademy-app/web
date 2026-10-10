/**
 * A learner's "proof" state and the single next step toward it (Growth R5 / B1).
 *
 * Pure and client-safe. The nudges (B6, B7), the weekly recap (B9) and the lifecycle emails (B10)
 * all phrase their next step from `selectProofNextStep`, so the copy logic lives in one place.
 * Loaders that read the inputs live in `proof-state-db.ts`.
 */
import { calculatePortfolioReadiness, portfolioReadinessInputFromUserRow } from '@/lib/portfolio-readiness'
import { deriveFellowRequestState, type FellowRequestRowStatus, type FellowRequestUiState } from '@/lib/fellow'
import { CAPSTONE_DEFINITIONS, getCurriculumModuleForCapstone, getCapstoneHref } from '@/config/capstones'
import { CURRICULUM_LESSON_COUNT, getLessonIdsForModule } from '@/lib/curriculum-registry'

export interface ProofUserRow {
  username: string | null
  name: string | null
  bio: string | null
  avatar_url: string | null
  linkedin_url: string | null
  github_url: string | null
  website_url: string | null
  is_portfolio_public: boolean | null
  is_fellow: boolean | null
}

export interface ProofStateInput {
  userId: string
  user: ProofUserRow
  capstones: ReadonlyArray<{ module_slug: string; status: string; is_public: boolean | null }>
  latestFellowRequestStatus: FellowRequestRowStatus | null
  completedLessonIds: Iterable<string>
  hasFullCurriculumCertificate: boolean
}

export interface ProofState {
  portfolio: {
    isPublic: boolean
    /** Every essential readiness item except visibility is done: publishing is the last step. */
    readyButPrivate: boolean
    readinessPercent: number
  }
  fellowState: FellowRequestUiState
  /** The first capstone whose module is finished and that has not been submitted. */
  nextCapstone: { slug: string; title: string; href: string } | null
  certificate: { completedLessons: number; totalLessons: number; earned: boolean }
}

const isSubmitted = (status: string) => status === 'submitted' || status === 'reviewed'

export function deriveProofState(input: ProofStateInput): ProofState {
  const completed = new Set(input.completedLessonIds)
  const publicCapstones = input.capstones.filter((c) => isSubmitted(c.status) && c.is_public === true).length

  const readinessInput = portfolioReadinessInputFromUserRow(input.user, input.userId, publicCapstones)
  const readiness = calculatePortfolioReadiness(readinessInput)
  const isPublic = readinessInput.isPortfolioPublic === true
  // Same checklist with visibility treated as done: what is left besides publishing?
  const readinessIfPublic = calculatePortfolioReadiness({ ...readinessInput, isPortfolioPublic: true })

  const { state: fellowState } = deriveFellowRequestState({
    isFellow: input.user.is_fellow === true,
    readiness,
    latestRequestStatus: input.latestFellowRequestStatus,
  })

  const submittedSlugs = new Set(input.capstones.filter((c) => isSubmitted(c.status)).map((c) => c.module_slug))
  const next = Object.values(CAPSTONE_DEFINITIONS).find((def) => {
    if (submittedSlugs.has(def.moduleSlug)) return false
    const lessonIds = getLessonIdsForModule(getCurriculumModuleForCapstone(def.moduleSlug))
    return lessonIds.length > 0 && lessonIds.every((id) => completed.has(id))
  })

  return {
    portfolio: {
      isPublic,
      readyButPrivate: !isPublic && readinessIfPublic.isReadyToShare,
      readinessPercent: readiness.totalCount > 0 ? Math.round((readiness.completedCount / readiness.totalCount) * 100) : 0,
    },
    fellowState,
    nextCapstone: next
      ? { slug: next.moduleSlug, title: next.title, href: getCapstoneHref(getCurriculumModuleForCapstone(next.moduleSlug)) }
      : null,
    certificate: {
      completedLessons: Math.min(completed.size, CURRICULUM_LESSON_COUNT),
      totalLessons: CURRICULUM_LESSON_COUNT,
      earned: input.hasFullCurriculumCertificate,
    },
  }
}

export type ProofNextStepKind = 'publish_portfolio' | 'request_fellow' | 'submit_capstone' | 'continue_lessons' | 'none'

export interface ProofNextStep {
  kind: ProofNextStepKind
  /** One sentence, safe for email and in-app. Fellow is never called a certificate or credential. */
  text: string
  /** App path, relative to the site origin. */
  path: string
}

const PORTFOLIO_SETTINGS_PATH = '/settings?tab=portfolio'

/**
 * The one next step that moves the learner's proof forward, in priority order:
 * publish a ready portfolio → request Fellow when eligible → submit the next capstone →
 * continue lessons toward the certificate → nothing (all done).
 */
export function selectProofNextStep(state: ProofState): ProofNextStep {
  if (state.portfolio.readyButPrivate) {
    return {
      kind: 'publish_portfolio',
      text: 'Your portfolio is ready. Make it public so recruiters and peers can see your work.',
      path: PORTFOLIO_SETTINGS_PATH,
    }
  }
  if (state.fellowState === 'eligible') {
    return {
      kind: 'request_fellow',
      text: 'Your portfolio qualifies you for PM Fellow. Request it from your portfolio settings.',
      path: PORTFOLIO_SETTINGS_PATH,
    }
  }
  if (state.nextCapstone) {
    return {
      kind: 'submit_capstone',
      text: `You finished the lessons for "${state.nextCapstone.title}". Submit the capstone to add it to your portfolio.`,
      path: state.nextCapstone.href,
    }
  }
  const { completedLessons, totalLessons, earned } = state.certificate
  if (!earned && completedLessons < totalLessons) {
    return {
      kind: 'continue_lessons',
      text: `You have completed ${completedLessons} of ${totalLessons} lessons toward your certificate.`,
      path: '/academy',
    }
  }
  return { kind: 'none', text: '', path: '/dashboard' }
}
