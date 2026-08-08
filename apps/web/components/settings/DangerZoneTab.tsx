'use client'

import React, { useState } from 'react'
import { AlertTriangle, RotateCcw, Zap, Flame, Compass, Award, UserX, CheckCircle2 } from 'lucide-react'
import { ConfirmDestructiveAction } from '@/components/settings/ConfirmDestructiveAction'

const MODULE_OPTIONS = [
  { slug: 'all', title: 'All Modules (Full Progress Reset)' },
  { slug: 'foundations', title: 'Module 1: PM Foundations' },
  { slug: 'discovery', title: 'Module 2: User Research & Discovery' },
  { slug: 'design', title: 'Module 3: Product Design & UX' },
  { slug: 'execution', title: 'Module 4: Product Analytics & Execution' },
  { slug: 'growth', title: 'Module 5: Growth & Monetization' },
  { slug: 'leadership', title: 'Module 6: Stakeholders & Leadership' },
  { slug: 'tech_ai', title: 'Module 7: Technical & AI PM' },
  { slug: 'platform', title: 'Module 8: Platform & Enterprise PM' },
  { slug: 'advanced_strategy', title: 'Module 9: Advanced Strategy & Capstone' },
]

export function DangerZoneTab() {
  const [selectedModule, setSelectedModule] = useState('all')
  const [activeDialog, setActiveDialog] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccessToast(msg)
    setTimeout(() => setSuccessToast(null), 4000)
  }

  // Action handlers calling API routes
  const handleResetProgress = async () => {
    const res = await fetch('/api/settings/reset/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_slug: selectedModule }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset progress.')
    showSuccess(
      selectedModule === 'all'
        ? 'Full curriculum progress reset successfully.'
        : `Progress reset for selected module.`
    )
  }

  const handleResetXp = async () => {
    const res = await fetch('/api/settings/reset/xp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset XP.')
    showSuccess('XP total reset to 0 (ledger audit entry recorded).')
  }

  const handleResetFlashcards = async () => {
    const res = await fetch('/api/settings/reset/flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset flashcards.')
    showSuccess('Flashcard SRS history reset successfully.')
  }

  const handleResetStreak = async () => {
    const res = await fetch('/api/settings/reset/streak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset streak.')
    showSuccess('Streak reset to 0 days.')
  }

  const handleResetSkillRadar = async () => {
    const res = await fetch('/api/settings/reset/skill-radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset Skill Radar.')
    showSuccess('Skill Radar competency state reset successfully.')
  }

  const handleDeleteAccount = async () => {
    const res = await fetch('/api/settings/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete account.')
    // Redirect to home on full account deletion
    window.location.href = '/'
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-600 font-semibold flex items-center gap-2 animate-in fade-in-0 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Danger Zone Container */}
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-destructive/20 pb-4">
          <div>
            <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </h2>
            <p className="text-xs text-muted-foreground">
              Irreversible and destructive actions. All operations create explicit audit entries.
            </p>
          </div>
        </div>

        {/* Action 1: Reset Progress */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                Reset Lesson Progress
              </h3>
              <p className="text-xs text-muted-foreground">
                Clear lesson completions and quiz scores for a specific module or the entire curriculum.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveDialog('reset-progress')}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              Reset Progress
            </button>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Select Scope:</label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {MODULE_OPTIONS.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action 2: Reset XP */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600" />
              Reset XP Total
            </h3>
            <p className="text-xs text-muted-foreground">
              Records an auditing negative XP entry to reduce total XP to 0 while preserving historical event log integrity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveDialog('reset-xp')}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
          >
            Reset XP
          </button>
        </div>

        {/* Action 3: Reset Flashcards */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-600" />
              Reset Flashcard SRS Queue
            </h3>
            <p className="text-xs text-muted-foreground">
              Clears your SM-2 flashcard repetition intervals so you can review flashcards from scratch.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveDialog('reset-flashcards')}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
          >
            Reset Flashcards
          </button>
        </div>

        {/* Action 4: Reset Streak */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-600" />
              Reset Daily Streak
            </h3>
            <p className="text-xs text-muted-foreground">
              Resets your active daily streak count to 0 days without affecting lesson completions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveDialog('reset-streak')}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
          >
            Reset Streak
          </button>
        </div>

        {/* Action 5: Reset Skill Radar */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-600" />
              Reset Skill Radar Scores
            </h3>
            <p className="text-xs text-muted-foreground">
              Resets competency scores across all 7 Skill Radar clusters until new lesson completions occur.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveDialog('reset-skill-radar')}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
          >
            Reset Skill Radar
          </button>
        </div>

        {/* Action 6: Delete Account */}
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
              <UserX className="w-4 h-4" />
              Delete Account Permanently
            </h3>
            <p className="text-xs text-muted-foreground">
              Permanently cascades user data across all tables, revokes public portfolio, delinks certificates, and cancels notifications.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveDialog('delete-account')}
            className="rounded-xl bg-destructive px-5 py-2.5 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 transition-all shadow-xs shrink-0"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Confirmation Dialog Modals */}
      <ConfirmDestructiveAction
        isOpen={activeDialog === 'reset-progress'}
        title="Reset Lesson Progress"
        description="Are you sure you want to reset lesson progress?"
        plainLanguageLossSummary={
          selectedModule === 'all'
            ? 'This will clear all 90 lesson completion records and quiz scores across every module. Your total XP, streak, and flashcards remain unchanged.'
            : `This will clear lesson completions and quiz scores for ${
                MODULE_OPTIONS.find((m) => m.slug === selectedModule)?.title
              }. Other modules, XP, and streak remain unchanged.`
        }
        confirmationKeyword="RESET"
        confirmButtonText="Confirm Progress Reset"
        onConfirm={handleResetProgress}
        onClose={() => setActiveDialog(null)}
      />

      <ConfirmDestructiveAction
        isOpen={activeDialog === 'reset-xp'}
        title="Reset XP Total"
        description="Are you sure you want to reset your total XP to 0?"
        plainLanguageLossSummary="This will record an auditing negative XP entry in the ledger to bring your total XP balance to 0. Your historical XP event logs, lesson completions, and streak remain intact."
        confirmationKeyword="RESET"
        confirmButtonText="Confirm XP Reset"
        onConfirm={handleResetXp}
        onClose={() => setActiveDialog(null)}
      />

      <ConfirmDestructiveAction
        isOpen={activeDialog === 'reset-flashcards'}
        title="Reset Flashcard SRS Queue"
        description="Are you sure you want to reset flashcard review history?"
        plainLanguageLossSummary="This will clear your SM-2 flashcard intervals and review count history. All flashcards will be scheduled as new unreviewed cards."
        confirmationKeyword="RESET"
        confirmButtonText="Confirm Flashcard Reset"
        onConfirm={handleResetFlashcards}
        onClose={() => setActiveDialog(null)}
      />

      <ConfirmDestructiveAction
        isOpen={activeDialog === 'reset-streak'}
        title="Reset Daily Streak"
        description="Are you sure you want to reset your daily streak?"
        plainLanguageLossSummary="This will set your current active streak to 0 days. Your longest streak record, XP, and lesson completions remain unchanged."
        confirmationKeyword="RESET"
        confirmButtonText="Confirm Streak Reset"
        onConfirm={handleResetStreak}
        onClose={() => setActiveDialog(null)}
      />

      <ConfirmDestructiveAction
        isOpen={activeDialog === 'reset-skill-radar'}
        title="Reset Skill Radar Scores"
        description="Are you sure you want to reset Skill Radar scores?"
        plainLanguageLossSummary="This will clear calculated scores across all 7 Skill Radar clusters. Completing new lessons or quizzes will re-populate competency scores."
        confirmationKeyword="RESET"
        confirmButtonText="Confirm Skill Radar Reset"
        onConfirm={handleResetSkillRadar}
        onClose={() => setActiveDialog(null)}
      />

      <ConfirmDestructiveAction
        isOpen={activeDialog === 'delete-account'}
        title="Delete Account Permanently"
        description="This action is PERMANENT and CANNOT BE UNDONE."
        plainLanguageLossSummary="This will delete your account across all user data tables. Your public portfolio handle will be revoked, issued certificates will be delinked from your profile, queued notifications will be dropped, and your session will terminate."
        confirmationKeyword="DELETE"
        confirmButtonText="Permanently Delete Account"
        onConfirm={handleDeleteAccount}
        onClose={() => setActiveDialog(null)}
        isDestructive={true}
      />
    </div>
  )
}
