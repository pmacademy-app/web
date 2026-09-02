'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { Star, CheckCircle2, MessageSquarePlus } from 'lucide-react'
import { ContextualFeedbackModal } from '@/components/feedback/ContextualFeedbackModal'

export interface PublishedTestimonial {
  id: string
  authorName: string
  role?: string
  content: string
  createdAt?: string
}

interface ReviewsExplorerProps {
  initialReviews?: PublishedTestimonial[]
}

export function ReviewsExplorer({ initialReviews }: ReviewsExplorerProps) {
  const prefersReducedMotion = useReducedMotion()
  const [reviews, setReviews] = useState<PublishedTestimonial[]>(initialReviews || [])
  const [loading, setLoading] = useState<boolean>(initialReviews === undefined)
  const [modalOpen, setModalOpen] = useState<boolean>(false)

  // Fetch dynamic live testimonials if not provided via server props
  useEffect(() => {
    if (initialReviews !== undefined) return

    async function loadTestimonials() {
      setLoading(true)
      try {
        const res = await fetch('/api/testimonials')
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.testimonials)) {
            setReviews(data.testimonials)
          }
        }
      } catch (err) {
        console.warn('Failed to load dynamic testimonials:', err)
      } finally {
        setLoading(false)
      }
    }
    void loadTestimonials()
  }, [initialReviews])

  return (
    <div className="space-y-8">
      
      {/* ── Top Header Row ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[#DED8CB]/80 pb-4">
        <div className="text-xs font-mono font-semibold uppercase text-[#1F6B4E]">
          {loading ? 'Loading Reviews...' : `Verified Reviews (${reviews.length})`}
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="
            inline-flex items-center gap-1.5 px-3.5 py-1.5
            bg-[#1F6B4E] text-white font-semibold text-xs rounded-lg
            shadow-[0_2px_10px_rgba(31,107,78,0.2)]
            hover:bg-[#18553E] active:scale-95
            transition-all duration-150 cursor-pointer
          "
        >
          <MessageSquarePlus size={14} />
          <span>Write a Review</span>
        </button>
      </div>

      {/* ── Dynamic Reviews Display ─────────────────────────────────────── */}
      {loading ? (
        <div className="py-16 text-center text-xs text-[#70685A] font-mono">
          Loading live learner reviews...
        </div>
      ) : reviews.length === 0 ? (
        /* Empty State (When no published testimonials in DB) */
        <div className="p-10 sm:p-14 rounded-2xl border border-dashed border-[#DED8CB] bg-white text-center max-w-lg mx-auto space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#EAF5EF] text-[#1F6B4E] flex items-center justify-center mx-auto ring-4 ring-[#1F6B4E]/10">
            <Star className="w-6 h-6 fill-[#1F6B4E]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[#171A17]">
              Be one of the first learners to share your experience.
            </h3>
            <p className="text-xs text-[#70685A] leading-relaxed max-w-sm mx-auto">
              Your feedback helps us improve Prodily and gives future learners a clearer picture of the experience.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="
              inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl
              bg-[#1F6B4E] text-white text-xs font-bold
              shadow-sm hover:bg-[#18553E] active:scale-95
              transition-all duration-150 cursor-pointer
            "
          >
            <MessageSquarePlus size={14} />
            <span>Write a Review</span>
          </button>
        </div>
      ) : (
        /* Dynamic Reviews Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          <AnimatePresence mode="popLayout">
            {reviews.map((rev, index) => (
              <motion.article
                layout
                key={rev.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.22, delay: index * 0.04 }}
                className="
                  bg-white border border-[#DED8CB] rounded-2xl p-6 shadow-xs
                  hover:border-[#1F6B4E]/40 hover:shadow-[0_8px_30px_rgba(23,26,23,0.06)] hover:-translate-y-0.5
                  transition-all duration-200 flex flex-col justify-between space-y-4
                "
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-0.5 text-[#D97706]">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={14} className="fill-[#D97706]" />
                      ))}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-[#1F6B4E] bg-[#EAF5EF] px-2 py-0.5 rounded border border-[#1F6B4E]/20">
                      <CheckCircle2 size={11} />
                      <span>Verified Review</span>
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-[#171A17] leading-relaxed font-sans">
                    &ldquo;{rev.content}&rdquo;
                  </p>
                </div>

                <div className="pt-4 border-t border-[#DED8CB]/70 flex items-center justify-between text-xs">
                  <div>
                    <h3 className="font-bold text-[#171A17]">{rev.authorName}</h3>
                    <p className="text-[11px] text-[#70685A]">{rev.role || 'Verified PM Learner'}</p>
                  </div>
                  {rev.createdAt && (
                    <span className="text-[10px] text-[#8A8174] font-mono">
                      {new Date(rev.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    </span>
                  )}
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Contextual Review Feedback Modal ────────────────────────────── */}
      <ContextualFeedbackModal
        isOpen={modalOpen}
        promptKey="reviews_page_submission"
        title="Submit a Review for Prodily PM Academy"
        description="Share your feedback on the curriculum, assignments, and mental models to help other learners."
        sourceEvent="reviews_page_manual"
        onClose={() => setModalOpen(false)}
      />

    </div>
  )
}
