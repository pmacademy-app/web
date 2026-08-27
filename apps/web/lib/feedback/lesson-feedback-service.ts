import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const ALLOWED_FEEDBACK_TAGS = [
  'great_breakdown',
  'clear_and_actionable',
  'too_technical',
  'confusing_example',
  'outdated',
  'pacing_too_fast',
] as const

export type FeedbackTag = (typeof ALLOWED_FEEDBACK_TAGS)[number]

export const ISSUE_TAGS = new Set<FeedbackTag>([
  'too_technical',
  'confusing_example',
  'outdated',
  'pacing_too_fast',
])

export interface LessonFeedbackInput {
  rating: number // 1 to 5
  tags?: string[]
  comment?: string | null
}

export interface LessonFeedbackRecord {
  id: string
  userId: string
  lessonId: string
  rating: number
  tags: string[]
  comment: string | null
  createdAt: string
}

export interface LessonQualityMetrics {
  lessonId: string
  averageClarityScore: number | null // 1.0 to 5.0
  clarityPct: number | null // 0 to 100% (% ratings >= 4)
  totalFeedback: number
  flaggedIssuesCount: number
  needsReview: boolean
}

// Untyped helper chain for Supabase queries with dynamic schema fields
interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Records or updates a learner's feedback for a specific lesson.
 * Enforces:
 * - 1 submission per user per lesson per 24 hours (updates existing within window)
 * - Integer rating between 1 and 5
 * - Whitelisted clarity tags
 * - Sanitized comment (max 500 characters)
 */
export async function recordLessonFeedback(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  input: LessonFeedbackInput
): Promise<{ success: boolean; feedback: LessonFeedbackRecord; isUpdate: boolean }> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated user ID is required.')
  }

  if (!lessonId || typeof lessonId !== 'string' || !lessonId.trim()) {
    throw new Error('Valid lesson ID is required.')
  }

  const cleanLessonId = lessonId.trim()
  const rawRating = Number(input.rating)

  if (!Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) {
    throw new Error('Rating must be an integer between 1 and 5.')
  }

  // Sanitize tags against allowed whitelist
  const rawTags = Array.isArray(input.tags) ? input.tags : []
  const sanitizedTags: string[] = Array.from(
    new Set(
      rawTags
        .filter((t): t is FeedbackTag => typeof t === 'string' && ALLOWED_FEEDBACK_TAGS.includes(t as FeedbackTag))
    )
  )

  // Sanitize comment
  const cleanComment = typeof input.comment === 'string' && input.comment.trim()
    ? input.comment.trim().slice(0, 500)
    : null

  // 1. Check for existing feedback within the last 24 hours to prevent duplicate ballot-stuffing
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: recentExisting } = (await (supabase
    .from('user_feedback') as unknown as DBChain)
    .select('id, rating, tags, content, created_at')
    .eq('user_id', userId)
    .eq('lesson_id', cleanLessonId)
    .eq('type', 'lesson_rating')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as unknown as {
      data: { id: string; rating: number; tags: string[]; content: string; created_at: string } | null
    }

  if (recentExisting) {
    // Update the existing submission within the 24-hour window
    const { error: updateError } = await (supabase
      .from('user_feedback') as unknown as DBChain)
      .update({
        rating: rawRating,
        tags: sanitizedTags,
        content: cleanComment || '',
      })
      .eq('id', recentExisting.id)
      .eq('user_id', userId)

    if (updateError) {
      console.error('[lesson-feedback-service] Error updating existing feedback:', updateError)
      throw new Error('Failed to update lesson feedback.')
    }

    return {
      success: true,
      isUpdate: true,
      feedback: {
        id: recentExisting.id,
        userId,
        lessonId: cleanLessonId,
        rating: rawRating,
        tags: sanitizedTags,
        comment: cleanComment,
        createdAt: recentExisting.created_at,
      },
    }
  }

  // 2. Insert new feedback record
  const { data: newRecord, error: insertError } = (await (supabase
    .from('user_feedback') as unknown as DBChain)
    .insert({
      user_id: userId,
      lesson_id: cleanLessonId,
      type: 'lesson_rating',
      category: 'curriculum',
      source_event: 'lesson_feedback',
      rating: rawRating,
      tags: sanitizedTags,
      content: cleanComment || '',
      status: 'new',
    })
    .select('id, created_at')
    .single()) as unknown as {
      data: { id: string; created_at: string } | null
      error: unknown
    }

  if (insertError || !newRecord) {
    console.error('[lesson-feedback-service] Error inserting feedback:', insertError)
    throw new Error('Failed to record lesson feedback.')
  }

  return {
    success: true,
    isUpdate: false,
    feedback: {
      id: newRecord.id,
      userId,
      lessonId: cleanLessonId,
      rating: rawRating,
      tags: sanitizedTags,
      comment: cleanComment,
      createdAt: newRecord.created_at,
    },
  }
}

/**
 * Retrieves the learner's most recent feedback for a lesson (if any).
 */
export async function getLearnerLessonFeedback(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string
): Promise<LessonFeedbackRecord | null> {
  if (!userId || !lessonId) return null

  try {
    const { data } = (await (supabase
      .from('user_feedback') as unknown as DBChain)
      .select('id, user_id, lesson_id, rating, tags, content, created_at')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId.trim())
      .eq('type', 'lesson_rating')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as unknown as {
        data: {
          id: string
          user_id: string
          lesson_id: string
          rating: number | null
          tags: string[] | null
          content: string | null
          created_at: string
        } | null
      }

    if (!data || data.rating === null) return null

    return {
      id: data.id,
      userId: data.user_id,
      lessonId: data.lesson_id,
      rating: data.rating,
      tags: Array.isArray(data.tags) ? data.tags : [],
      comment: data.content && data.content.trim() ? data.content.trim() : null,
      createdAt: data.created_at,
    }
  } catch (err) {
    console.warn('[lesson-feedback-service] Warning fetching learner feedback:', err)
    return null
  }
}

/**
 * Computes aggregated quality metrics for a single lesson.
 */
export async function getLessonQualityMetrics(
  supabase: SupabaseClient<Database>,
  lessonId: string
): Promise<LessonQualityMetrics> {
  const defaultMetrics: LessonQualityMetrics = {
    lessonId,
    averageClarityScore: null,
    clarityPct: null,
    totalFeedback: 0,
    flaggedIssuesCount: 0,
    needsReview: false,
  }

  try {
    const { data: rows } = (await (supabase
      .from('user_feedback') as unknown as DBChain)
      .select('rating, tags')
      .eq('lesson_id', lessonId.trim())
      .eq('type', 'lesson_rating')) as unknown as {
        data: Array<{ rating: number | null; tags: string[] | null }> | null
      }

    if (!rows || rows.length === 0) {
      return defaultMetrics
    }

    const validRatings = rows
      .map((r) => r.rating)
      .filter((r): r is number => typeof r === 'number' && r >= 1 && r <= 5)

    if (validRatings.length === 0) {
      return defaultMetrics
    }

    const sum = validRatings.reduce((acc, r) => acc + r, 0)
    const avg = Math.round((sum / validRatings.length) * 10) / 10 // 1 decimal place

    const helpfulCount = validRatings.filter((r) => r >= 4).length
    const clarityPct = Math.round((helpfulCount / validRatings.length) * 100)

    let flaggedCount = 0
    for (const row of rows) {
      const isLowRating = typeof row.rating === 'number' && row.rating <= 2
      const hasIssueTag = Array.isArray(row.tags) && row.tags.some((t) => ISSUE_TAGS.has(t as FeedbackTag))
      if (isLowRating || hasIssueTag) {
        flaggedCount += 1
      }
    }

    // Master Plan criteria: clarity < 3.5 automatically flags for review
    const needsReview = avg < 3.5

    return {
      lessonId,
      averageClarityScore: avg,
      clarityPct,
      totalFeedback: validRatings.length,
      flaggedIssuesCount: flaggedCount,
      needsReview,
    }
  } catch (err) {
    console.warn('[lesson-feedback-service] Error calculating quality metrics:', err)
    return defaultMetrics
  }
}

/**
 * Fetches all lesson quality metrics mapped by lesson_id for Admin Curriculum workspace.
 */
export async function getAllLessonsQualityMetrics(
  supabase: SupabaseClient<Database>
): Promise<Map<string, LessonQualityMetrics>> {
  const result = new Map<string, LessonQualityMetrics>()

  try {
    const { data: rows } = (await (supabase
      .from('user_feedback') as unknown as DBChain)
      .select('lesson_id, rating, tags')
      .eq('type', 'lesson_rating')
      .not('lesson_id', 'is', null)) as unknown as {
        data: Array<{ lesson_id: string; rating: number | null; tags: string[] | null }> | null
      }

    if (!rows || rows.length === 0) {
      return result
    }

    // Group by lesson_id
    const grouped = new Map<string, Array<{ rating: number | null; tags: string[] | null }>>()
    for (const r of rows) {
      if (!r.lesson_id) continue
      const list = grouped.get(r.lesson_id) || []
      list.push(r)
      grouped.set(r.lesson_id, list)
    }

    for (const [lessonId, lessonRows] of grouped.entries()) {
      const validRatings = lessonRows
        .map((r) => r.rating)
        .filter((r): r is number => typeof r === 'number' && r >= 1 && r <= 5)

      if (validRatings.length === 0) continue

      const sum = validRatings.reduce((acc, r) => acc + r, 0)
      const avg = Math.round((sum / validRatings.length) * 10) / 10

      const helpfulCount = validRatings.filter((r) => r >= 4).length
      const clarityPct = Math.round((helpfulCount / validRatings.length) * 100)

      let flaggedCount = 0
      for (const row of lessonRows) {
        const isLowRating = typeof row.rating === 'number' && row.rating <= 2
        const hasIssueTag = Array.isArray(row.tags) && row.tags.some((t) => ISSUE_TAGS.has(t as FeedbackTag))
        if (isLowRating || hasIssueTag) {
          flaggedCount += 1
        }
      }

      result.set(lessonId, {
        lessonId,
        averageClarityScore: avg,
        clarityPct,
        totalFeedback: validRatings.length,
        flaggedIssuesCount: flaggedCount,
        needsReview: avg < 3.5,
      })
    }

    return result
  } catch (err) {
    console.warn('[lesson-feedback-service] Error calculating all quality metrics:', err)
    return result
  }
}
