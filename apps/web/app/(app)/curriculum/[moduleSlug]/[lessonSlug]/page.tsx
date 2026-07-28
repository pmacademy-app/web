import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import type { ParsedLesson } from '@/types'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import LessonViewShell from '@/components/lesson/LessonViewShell'
import { Lock } from 'lucide-react'
import { isLessonUnlocked } from '@/lib/lessons-completion-service'

interface PageProps {
  params: Promise<{
    moduleSlug: string
    lessonSlug: string
  }>
}

function getLessonData(slug: string): ParsedLesson | null {
  const filePath = path.resolve(process.cwd(), `public/content/lessons/${slug}.json`)
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lessonSlug } = await params
  const lesson = getLessonData(lessonSlug)
  if (!lesson) return { title: 'Lesson Not Found | PM Academy' }

  return {
    title: `Lesson ${lesson.meta.number}: ${lesson.meta.title} | PM Academy`,
    description: `Interactive lesson viewer, quiz flow, and spaced repetition flashcards.`,
  }
}

export default async function AuthenticatedLessonPage({ params }: PageProps) {
  const { lessonSlug } = await params
  const lesson = getLessonData(lessonSlug)

  if (!lesson) {
    notFound()
  }

  // 1. Authenticate user from session cookies
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value

  if (!accessToken) {
    redirect('/login')
  }

  const authClient = createAuthenticatedServerClient(accessToken)
  const user = await getAuthenticatedUser(authClient)
  if (!user) {
    redirect('/login')
  }

  // 2. Perform sequential unlock check
  const lessonNum = lesson.meta.number
  let isLocked = false
  let prevLessonSlug = ''
  let prevModuleNumber = 1
  let prevNum = 1

  if (lessonNum > 1) {
    prevNum = lessonNum - 1
    prevLessonSlug = `lesson-${String(prevNum).padStart(3, '0')}`
    prevModuleNumber = Math.ceil(prevNum / 10)

    const serviceSupabase = createServerSupabaseClient()
    const unlocked = await isLessonUnlocked(serviceSupabase, user.id, lessonNum)
    if (!unlocked) {
      isLocked = true
    }
  }

  // 3. Render Locked screen if prerequisite is unmet
  if (isLocked) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-xl text-center space-y-8 animate-fade-in">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Lock className="h-8 w-8" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold font-serif text-foreground">Lesson Locked</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
            You must complete the previous lesson first before unlocking{' '}
            <span className="font-semibold text-foreground">
              Lesson {lessonNum}: {lesson.meta.title}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={`/curriculum/module-${prevModuleNumber}/${prevLessonSlug}`}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all"
          >
            Go to Required Lesson ({prevNum})
          </Link>
          <Link
            href="/curriculum"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-accent/40 transition-all"
          >
            Return to Curriculum Map
          </Link>
        </div>
      </div>
    )
  }

  // 4. Render main interactive lesson view shell
  return <LessonViewShell lesson={lesson} />
}
