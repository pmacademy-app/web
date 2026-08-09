'use client'

import React, { useState, useEffect } from 'react'
import { useUsageTimeTracker } from '@/hooks/useUsageTimeTracker'
import { ContextualFeedbackModal } from './ContextualFeedbackModal'

/**
 * Contextual feedback prompts are triggered by three sources:
 *  1. 1-hour usage milestone (via useUsageTimeTracker)
 *  2. Module completion (via 'learner:feedback:prompt' CustomEvent with key='module_complete')
 *  3. Capstone completion (via 'learner:feedback:prompt' CustomEvent with key='capstone_complete')
 *
 * Completion pages dispatch: new CustomEvent('learner:feedback:prompt', { detail: { key: 'module_complete' } })
 */
export function LearnerFeedbackProvider() {
  const [modalOpen, setModalOpen] = useState(false)
  const [promptKey, setPromptKey] = useState('usage_1hr')
  const [title, setTitle] = useState('Help Us Improve PM Academy')

  const triggerPrompt = (key: string) => {
    if (key === 'module_complete') {
      setTitle('Congratulations on Completing the Module!')
    } else if (key === 'capstone_complete') {
      setTitle('Amazing Job Completing Your Capstone!')
    } else {
      setTitle('Enjoying PM Academy?')
    }
    setPromptKey(key)
    setModalOpen(true)
  }

  // Trigger 1: 1-hour active usage via polling hook
  useUsageTimeTracker({
    onPromptTriggered: (key) => triggerPrompt(key),
  })

  // Trigger 2 & 3: Module/capstone completion via CustomEvent bridge
  // Completion pages dispatch: new CustomEvent('learner:feedback:prompt', { detail: { key } })
  useEffect(() => {
    const handlePromptEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail
      if (detail?.key) {
        triggerPrompt(detail.key)
      }
    }
    window.addEventListener('learner:feedback:prompt', handlePromptEvent)
    return () => window.removeEventListener('learner:feedback:prompt', handlePromptEvent)
  }, [])

  return (
    <ContextualFeedbackModal
      isOpen={modalOpen}
      promptKey={promptKey}
      title={title}
      onClose={() => setModalOpen(false)}
    />
  )
}
