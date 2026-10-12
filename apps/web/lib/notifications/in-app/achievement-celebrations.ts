/**
 * Achievement celebration claim (server-only).
 *
 * A certificate, a published capstone, a Fellow grant or a completed module earns the learner a
 * one-time celebration. The source of truth for "has it been shown" is the achievement's own
 * in-app notification: claiming it sets that row's `celebrated_at` with a compare-and-set, so
 * when several tabs or devices ask at once exactly one of them is told to celebrate. Reading the
 * notification in the bell only sets `is_read`, so it no longer uses up the celebration
 * (Growth R5 P2); a claim also marks the row read.
 *
 * `in_app_notifications` has no event-type column — the idempotency key (the event id) is
 * the only type signal, so the three emitters' id prefixes are restated here. A key alone
 * is never trusted: every candidate is re-verified against its source row, scoped to the
 * caller, before anything is written. That is what keeps a rejected capstone, an admin
 * TEST- certificate or a revoked Fellow from celebrating. A candidate that fails
 * verification is left uncelebrated and untouched, so it still shows in the bell.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import type {
  AchievementCelebration,
  AchievementCelebrationKind,
  CelebrationPortfolio,
  ModuleCelebration,
} from '@/lib/api/contracts/achievement-celebration'
import { BRAND } from '@/lib/brand'
import { isTestCertificateCode } from '@/lib/certificates-db'
import { getCapstoneDefinition } from '@/config/capstones'
import { describeDbError } from '@/lib/monitoring/db-error'
import { getLessonIdsForModule } from '@/lib/curriculum-registry'
import { getCapstoneForModule, getModuleTitle, isCanonicalModuleSlug } from '@/lib/academy/module-completion'

/**
 * Event-id prefixes written by the emitters: `certificate.generated`
 * (lib/certificates/issue-flow.ts), `capstone.reviewed` (lib/admin/moderation-service.ts),
 * `fellow.granted` (lib/admin/service.ts) and `module.completed` (lib/academy/module-completion.ts). Restated rather than imported because
 * those modules pull in the notification dispatcher; a test pins them to the sources.
 */
export const ACHIEVEMENT_CELEBRATION_KEY_PREFIXES: Record<AchievementCelebrationKind, string> = {
  certificate: 'certificate-generated-',
  capstone: 'capstone-reviewed-',
  fellow: 'fellow-granted-',
  module: 'module-completed-',
}

/**
 * Claim priority: the rarest achievement first. Within a kind, oldest first. A module is the
 * most common, so when the last lesson completes a module and the curriculum at once, the
 * certificate is celebrated first and the module on a later call.
 */
const CLAIM_ORDER: readonly AchievementCelebrationKind[] = ['fellow', 'certificate', 'capstone', 'module']

/** An achievement older than this is no longer worth interrupting the learner for. */
const CELEBRATION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/** Uncelebrated achievement rows considered per call. One learner never has more than a handful. */
const MAX_CANDIDATES = 25

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A re-review that publishes a capstone the first review left unpublished has its own event id,
 * `capstone-reviewed-<submission id>-published` (lib/admin/moderation-service.ts), so one
 * submission can own two rows.
 */
const CAPSTONE_PUBLISHED_SUFFIX = '-published'

export interface ClaimAchievementCelebrationOptions {
  /** Injected clock, for tests. */
  now?: Date
  /** Origin for the certificate verification link. Defaults to the configured site url. */
  siteOrigin?: string
}

interface Candidate {
  notificationId: string
  kind: AchievementCelebrationKind
  /**
   * The idempotency key with its prefix removed: a certificate code, a submission id (with
   * `-published` for a publishing re-review), a user id, or `<user id>-<module slug>`.
   */
  subject: string
  createdAt: string
  /** Already read in the bell: the claim then keeps its read_at. */
  isRead: boolean
}

/** A candidate that passed verification, with the celebration it would produce. */
interface VerifiedCandidate {
  notificationId: string
  celebration: AchievementCelebration
  /**
   * Other uncelebrated rows for the same achievement (older Fellow grants, a capstone's other
   * review notice). Retired once this one is claimed, so the achievement never celebrates twice.
   */
  supersededIds?: string[]
}

type Client = SupabaseClient<Database>

/** Mirrors `resolveSiteOrigin` in lib/certificates/issue-flow.ts, which is not importable here. */
function resolveSiteOrigin(siteOrigin?: string): string {
  return (siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')
}

/** Never logs ids, codes or names — only which read failed and the redacted database error. */
function warnReadFailed(step: string, error: unknown): void {
  console.warn(`[achievement-celebrations] ${step} failed:`, describeDbError(error))
}

function toCandidate(
  row: { id: string; idempotency_key: string | null; created_at: string; is_read: boolean },
  kinds: readonly AchievementCelebrationKind[]
): Candidate | null {
  const key = row.idempotency_key
  if (!key) return null
  for (const kind of kinds) {
    const prefix = ACHIEVEMENT_CELEBRATION_KEY_PREFIXES[kind]
    if (key.startsWith(prefix) && key.length > prefix.length) {
      return {
        notificationId: row.id,
        kind,
        subject: key.slice(prefix.length),
        createdAt: row.created_at,
        isRead: row.is_read === true,
      }
    }
  }
  return null
}

/** The caller's uncelebrated, recent, unexpired achievement notifications; null when the read failed. */
async function loadCandidates(
  supabase: Client,
  userId: string,
  now: Date,
  kinds: readonly AchievementCelebrationKind[]
): Promise<Candidate[] | null> {
  const prefixFilter = kinds.map(
    (kind) => `idempotency_key.like.${ACHIEVEMENT_CELEBRATION_KEY_PREFIXES[kind]}%`
  ).join(',')

  const { data, error } = await supabase
    .from('in_app_notifications')
    .select('id, idempotency_key, created_at, is_read')
    .eq('user_id', userId)
    .is('celebrated_at', null)
    .gte('created_at', new Date(now.getTime() - CELEBRATION_WINDOW_MS).toISOString())
    .gt('expires_at', now.toISOString())
    .or(prefixFilter)
    .order('created_at', { ascending: true })
    .limit(MAX_CANDIDATES)

  if (error) {
    warnReadFailed('candidate read', error)
    return null
  }

  // The prefix is re-checked here rather than trusted from the filter alone.
  return (data || []).flatMap((row) => toCandidate(row, kinds) ?? [])
}

async function verifyCertificates(
  supabase: Client,
  userId: string,
  candidates: Candidate[],
  portfolio: CelebrationPortfolio,
  siteOrigin: string
): Promise<VerifiedCandidate[]> {
  // Admin dev TEST- certificates are never a learner's real credential.
  const real = candidates.filter((candidate) => !isTestCertificateCode(candidate.subject))
  if (real.length === 0) return []

  const { data, error } = await supabase
    .from('certificates')
    .select('certificate_code, type, module_slug, issued_at, career_title')
    .eq('user_id', userId)
    .in('certificate_code', [...new Set(real.map((candidate) => candidate.subject))])

  if (error) {
    warnReadFailed('certificate verification', error)
    return []
  }

  const byCode = new Map((data || []).map((row) => [row.certificate_code, row]))
  return real.flatMap((candidate) => {
    const row = byCode.get(candidate.subject)
    if (!row) return []

    const isFullCurriculum = row.type === 'full_curriculum'
    const moduleSlug = isFullCurriculum ? null : row.module_slug || null
    return {
      notificationId: candidate.notificationId,
      celebration: {
        kind: 'certificate',
        notificationId: candidate.notificationId,
        portfolio,
        certificate: {
          code: row.certificate_code,
          type: isFullCurriculum ? 'full_curriculum' : 'module',
          moduleSlug,
          moduleTitle: moduleSlug ? getCapstoneDefinition(moduleSlug)?.moduleTitle ?? null : null,
          issuedAt: row.issued_at,
          careerTitle: row.career_title,
          verificationUrl: `${siteOrigin}/verify/${encodeURIComponent(row.certificate_code)}`,
        },
      },
    }
  })
}

/** The submission a capstone key names, lower-cased; null when the key is not `<uuid>` or `<uuid>-published`. */
function capstoneSubmissionId(subject: string): string | null {
  const id = subject.endsWith(CAPSTONE_PUBLISHED_SUFFIX) ? subject.slice(0, -CAPSTONE_PUBLISHED_SUFFIX.length) : subject
  return UUID_PATTERN.test(id) ? id.toLowerCase() : null
}

/**
 * One submission is one celebration, whichever of its two rows carries it:
 * - if either row is already celebrated, the capstone has had its celebration: nothing more;
 * - otherwise the published notice celebrates when it is a candidate (the first review's row may
 *   be past the 14 day window by then), else the first review's row;
 * - the row that does not celebrate is retired with the claim.
 *
 * A first-review row that the celebrated_at backfill stamped (a rejection notice read before
 * Growth R5 went live) cannot be told from one that really celebrated, so a capstone published on
 * re-review after that still gets no celebration. That is the safe side of the ambiguity.
 */
async function verifyCapstones(
  supabase: Client,
  userId: string,
  candidates: Candidate[],
  portfolio: CelebrationPortfolio
): Promise<VerifiedCandidate[]> {
  // Shape-checked before it reaches the query: `id` is a uuid column.
  const wellFormed = candidates.flatMap((candidate) => {
    const submissionId = capstoneSubmissionId(candidate.subject)
    return submissionId ? [{ candidate, submissionId }] : []
  })
  if (wellFormed.length === 0) return []

  // `capstone.reviewed` also fires for a rejection (status 'reviewed', is_public false),
  // so only a reviewed AND published submission is something to celebrate.
  const { data, error } = await supabase
    .from('capstone_submissions')
    .select('id, module_slug')
    .eq('user_id', userId)
    .eq('status', 'reviewed')
    .eq('is_public', true)
    .in('id', [...new Set(wellFormed.map((entry) => entry.submissionId))])

  if (error) {
    warnReadFailed('capstone verification', error)
    return []
  }

  const byId = new Map((data || []).map((row) => [row.id.toLowerCase(), row]))
  const published = wellFormed.filter((entry) => byId.has(entry.submissionId))
  if (published.length === 0) return []

  // Both rows of each submission, whatever their age or state: a row outside the candidate window
  // still says whether the capstone has celebrated, and still has to be retired.
  const prefix = ACHIEVEMENT_CELEBRATION_KEY_PREFIXES.capstone
  const groupKeys = published.flatMap(({ candidate }) => {
    const firstReviewKey = candidate.subject.endsWith(CAPSTONE_PUBLISHED_SUFFIX)
      ? candidate.subject.slice(0, -CAPSTONE_PUBLISHED_SUFFIX.length)
      : candidate.subject
    return [`${prefix}${firstReviewKey}`, `${prefix}${firstReviewKey}${CAPSTONE_PUBLISHED_SUFFIX}`]
  })
  const { data: groupRows, error: groupError } = await supabase
    .from('in_app_notifications')
    .select('id, idempotency_key, celebrated_at')
    .eq('user_id', userId)
    .in('idempotency_key', [...new Set(groupKeys)])

  if (groupError) {
    warnReadFailed('capstone notice read', groupError)
    return []
  }

  const groups = new Map<string, { celebrated: boolean; uncelebratedIds: string[] }>()
  for (const row of groupRows || []) {
    const submissionId = row.idempotency_key ? capstoneSubmissionId(row.idempotency_key.slice(prefix.length)) : null
    if (!submissionId) continue
    const group = groups.get(submissionId) ?? { celebrated: false, uncelebratedIds: [] }
    if (row.celebrated_at) group.celebrated = true
    else group.uncelebratedIds.push(row.id)
    groups.set(submissionId, group)
  }

  return published.flatMap(({ candidate, submissionId }) => {
    const row = byId.get(submissionId)
    const group = groups.get(submissionId)
    if (!row || !group || group.celebrated) return []

    // The published notice wins over the first review's row when both are candidates.
    const isPublishedNotice = candidate.subject.endsWith(CAPSTONE_PUBLISHED_SUFFIX)
    const publishedNoticeWaiting = published.some(
      (other) => other.submissionId === submissionId && other.candidate.subject.endsWith(CAPSTONE_PUBLISHED_SUFFIX)
    )
    if (!isPublishedNotice && publishedNoticeWaiting) return []

    return {
      notificationId: candidate.notificationId,
      supersededIds: group.uncelebratedIds.filter((id) => id !== candidate.notificationId),
      celebration: {
        kind: 'capstone',
        notificationId: candidate.notificationId,
        portfolio,
        capstone: {
          moduleSlug: row.module_slug,
          moduleTitle: getCapstoneDefinition(row.module_slug)?.moduleTitle || row.module_slug,
        },
      },
    }
  })
}

function capstoneFor(slug: string, submitted: ReadonlySet<string>): ModuleCelebration['capstone'] {
  const capstone = getCapstoneForModule(slug)
  return capstone ? { ...capstone, submitted: submitted.has(capstone.slug) } : null
}

async function verifyModules(
  supabase: Client,
  userId: string,
  candidates: Candidate[],
  portfolio: CelebrationPortfolio
): Promise<VerifiedCandidate[]> {
  // The key must name the caller and a real module: `module-completed-<user id>-<slug>`.
  const ownPrefix = `${userId}-`
  const bySlug = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    if (!candidate.subject.startsWith(ownPrefix)) continue
    const slug = candidate.subject.slice(ownPrefix.length)
    if (!isCanonicalModuleSlug(slug)) continue
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), candidate])
  }
  if (bySlug.size === 0) return []

  // Re-verified against progress: a module reset since the event no longer celebrates.
  const lessonIds = [...bySlug.keys()].flatMap((slug) => getLessonIdsForModule(slug))
  const { data, error } = await supabase
    .from('user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('lesson_id', lessonIds)

  if (error) {
    warnReadFailed('module verification', error)
    return []
  }

  const completed = new Set((data || []).map((row) => row.lesson_id))

  // Capstones unlock before the module's last lesson, so one may already be in. A failed read
  // only costs the 'already submitted' hint, never the celebration.
  const capstoneSlugs = [...bySlug.keys()].flatMap((slug) => getCapstoneForModule(slug)?.slug ?? [])
  const submittedCapstones = new Set<string>()
  if (capstoneSlugs.length > 0) {
    const { data: submissions, error: submissionsError } = await supabase
      .from('capstone_submissions')
      .select('module_slug, status')
      .eq('user_id', userId)
      .in('module_slug', capstoneSlugs)
    if (submissionsError) warnReadFailed('module capstone read', submissionsError)
    for (const row of submissions || []) {
      if (row.status === 'submitted' || row.status === 'reviewed') submittedCapstones.add(row.module_slug)
    }
  }
  return candidates.flatMap((candidate) => {
    const slug = candidate.subject.slice(ownPrefix.length)
    if (!bySlug.get(slug)?.includes(candidate)) return []
    if (!getLessonIdsForModule(slug).every((id) => completed.has(id))) return []

    return {
      notificationId: candidate.notificationId,
      celebration: {
        kind: 'module',
        notificationId: candidate.notificationId,
        portfolio,
        module: { slug, title: getModuleTitle(slug) },
        capstone: capstoneFor(slug, submittedCapstones),
      },
    }
  })
}

/**
 * A Fellow key names the caller: `<userId>` (grants before Growth R5) or `<userId>-<grant epoch>`.
 */
function isOwnFellowGrantSubject(subject: string, userId: string): boolean {
  if (subject === userId) return true
  return subject.startsWith(`${userId}-`) && /^\d+$/.test(subject.slice(userId.length + 1))
}

/**
 * Marks the other rows of an achievement celebrated once one of them has been (older Fellow grant
 * rows, a capstone's other review notice), so the same achievement never celebrates twice. Only
 * `celebrated_at` is set: a retired row stays unread in the bell. Best-effort: a failure is
 * logged. An older Fellow row could then still celebrate on a later call; a capstone row could
 * not, because its submission's other row is already celebrated (see verifyCapstones).
 */
async function retireSupersededRows(
  supabase: Client,
  userId: string,
  notificationIds: string[],
  now: string
): Promise<void> {
  const { error } = await supabase
    .from('in_app_notifications')
    .update({ celebrated_at: now })
    .eq('user_id', userId)
    .in('id', notificationIds)
    .is('celebrated_at', null)
    .select('id')
  if (error) warnReadFailed('retire superseded rows', error)
}

/**
 * Marks one notification celebrated if — and only if — it is not celebrated yet, and read.
 *
 * `celebrated_at IS NULL` is part of the write's own predicate, so the database decides the
 * winner: a second tab's update matches zero rows and reports `lost`. A row the learner already
 * read in the bell keeps its original read_at.
 */
async function claimNotification(
  supabase: Client,
  userId: string,
  candidate: Pick<Candidate, 'notificationId' | 'isRead'>,
  now: string
): Promise<'claimed' | 'lost' | 'error'> {
  const { data, error } = await supabase
    .from('in_app_notifications')
    .update(candidate.isRead ? { celebrated_at: now, is_read: true } : { celebrated_at: now, is_read: true, read_at: now })
    .eq('id', candidate.notificationId)
    .eq('user_id', userId)
    .is('celebrated_at', null)
    .select('id')

  if (error) {
    warnReadFailed('claim write', error)
    return 'error'
  }
  return Array.isArray(data) && data.length > 0 ? 'claimed' : 'lost'
}

/**
 * Claims the caller's next unseen achievement and returns what to celebrate, or null.
 *
 * At most one celebration per call, and one notification row claimed (the other rows of that
 * same achievement, if any, are retired with it). `userId`
 * must come from the authenticated session: every read and the claiming write are scoped
 * to it, so the result only ever describes the caller's own achievements.
 *
 * "Nothing to celebrate" is null, never a throw. A failed read is never treated as a
 * verification: the candidates it covers stay uncelebrated and are retried on the next call.
 */
export async function claimNextAchievementCelebration(
  supabase: Client,
  userId: string,
  opts: ClaimAchievementCelebrationOptions = {}
): Promise<AchievementCelebration | null> {
  if (!userId) return null
  const now = opts.now ?? new Date()

  const candidates = await loadCandidates(supabase, userId, now, CLAIM_ORDER)
  if (!candidates || candidates.length === 0) return null

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('username, name, is_portfolio_public, is_fellow')
    .eq('id', userId)
    .maybeSingle()

  if (userError) {
    warnReadFailed('caller profile read', userError)
    return null
  }
  if (!user) return null

  const portfolio: CelebrationPortfolio = {
    username: user.username || null,
    displayName: user.name || null,
    isPublic: user.is_portfolio_public === true,
  }

  for (const kind of CLAIM_ORDER) {
    // Already oldest-first from the read; the filter keeps that order.
    const ofKind = candidates.filter((candidate) => candidate.kind === kind)
    if (ofKind.length === 0) continue

    let verified: VerifiedCandidate[]
    if (kind === 'fellow') {
      // The key must name the caller, and the grant must still stand. One Fellow status is one
      // celebration: only the newest grant row is celebrated, even when a revoke and re-grant (or
      // a pre-R5 row) left several. The older ones are retired once it is claimed.
      const grants = ofKind.filter(
        (candidate) => isOwnFellowGrantSubject(candidate.subject, userId) && user.is_fellow === true
      )
      const newest = grants[grants.length - 1]
      verified = newest
        ? [
            {
              notificationId: newest.notificationId,
              celebration: { kind: 'fellow', notificationId: newest.notificationId, portfolio },
              supersededIds: grants.slice(0, -1).map((candidate) => candidate.notificationId),
            },
          ]
        : []
    } else if (kind === 'certificate') {
      verified = await verifyCertificates(supabase, userId, ofKind, portfolio, resolveSiteOrigin(opts.siteOrigin))
    } else if (kind === 'capstone') {
      verified = await verifyCapstones(supabase, userId, ofKind, portfolio)
    } else {
      verified = await verifyModules(supabase, userId, ofKind, portfolio)
    }

    for (const entry of verified) {
      const isRead = ofKind.find((candidate) => candidate.notificationId === entry.notificationId)?.isRead ?? false
      const outcome = await claimNotification(
        supabase,
        userId,
        { notificationId: entry.notificationId, isRead },
        now.toISOString()
      )
      if (outcome === 'claimed') {
        if (entry.supersededIds && entry.supersededIds.length > 0) {
          await retireSupersededRows(supabase, userId, entry.supersededIds, now.toISOString())
        }
        return entry.celebration
      }
      // The write path is failing, so stop rather than work through the rest of the list.
      if (outcome === 'error') return null
      // 'lost': another tab or device claimed it first — try the next candidate.
    }
  }

  return null
}
