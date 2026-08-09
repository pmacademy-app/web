'use client'

import React, { useState } from 'react'
import { useUsageTimeTracker } from '@/hooks/useUsageTimeTracker'
import { ContextualFeedbackModal } from './ContextualFeedbackModal'

export function LearnerFeedbackProvider() {
  const [modalOpen, setModalOpen] = useState(false)
  const [promptKey, setPromptKey] = useState('usage_1hr')
  const [title, setTitle] = useState('Help Us Improve PM Academy')

  useUsageTimeTracker({
    onPromptTriggered: (key) => {
      setPromptKey(key)
      if (key === 'module_complete') {
        setTitle('Congratulations on Completing the Module!')
      } else if (key === 'capstone_complete') {
        setTitle('Amazing Job Completing Your Capstone!')
      } else {
        setTitle('Enjoying PM Academy?')
      }
      setModalOpen(true)
    },
  })

  return (
    <ContextualFeedbackModal
      isOpen={modalOpen}
      promptKey={promptKey}
      title={title}
      onClose={() => setModalOpen(false)}
    />
  )
}
