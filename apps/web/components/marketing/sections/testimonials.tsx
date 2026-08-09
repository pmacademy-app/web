'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { Quote, Star, MessageSquarePlus } from 'lucide-react'
import { ContextualFeedbackModal } from '@/components/feedback/ContextualFeedbackModal'

interface PublishedTestimonial {
  id: string
  authorName: string
  role?: string
  content: string
  createdAt: string
}

export function TestimonialsSection() {
  const prefersReducedMotion = useReducedMotion()
  const [testimonials, setTestimonials] = useState<PublishedTestimonial[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [modalOpen, setModalOpen] = useState<boolean>(false)

  useEffect(() => {
    async function loadTestimonials() {
      setLoading(true)
      try {
        const res = await fetch('/api/testimonials')
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.testimonials)) {
            setTestimonials(data.testimonials)
          }
        }
      } catch (err) {
        console.warn('Failed to load live testimonials:', err)
      } finally {
        setLoading(false)
      }
    }
    void loadTestimonials()
  }, [])

  const hasLiveTestimonials = testimonials.length > 0

  // Quadruple the array for continuous smooth CSS marquee loop if items exist
  const carouselItems = hasLiveTestimonials
    ? [...testimonials, ...testimonials, ...testimonials, ...testimonials]
    : []

  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="py-20 lg:py-28 bg-surface-muted border-t border-border overflow-hidden relative"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          className="text-center mb-12 space-y-4"
        >
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-wider">
            <Star className="w-3.5 h-3.5 fill-current" /> Learner Stories & Reviews
          </div>
          <h2
            id="testimonials-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground"
          >
            Real feedback from active PM Academy learners.
          </h2>
          <p className="text-body-lg text-locked max-w-[600px] mx-auto leading-relaxed">
            Verified learner reviews submitted directly through our product experience and moderated by our team.
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>Submit a Learner Review</span>
            </button>
          </div>
        </motion.div>

        {/* Testimonials Display */}
        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground">Loading learner reviews...</div>
        ) : !hasLiveTestimonials ? (
          <div className="p-8 rounded-2xl border border-dashed border-border bg-card/60 text-center max-w-xl mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Be One of the First Learners to Submit a Review</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Complete curriculum modules, earn certificates, and share your experience with our community.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              Write First Review
            </button>
          </div>
        ) : (
          /* Continuous Right-to-Left Review Stream Carousel */
          <div className="relative w-full overflow-hidden group py-4">
            {/* Left & Right Gradient Fades */}
            <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-surface-muted to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-surface-muted to-transparent z-10 pointer-events-none" />

            <div className="flex gap-6 w-max animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
              {carouselItems.map((item, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  className="w-80 sm:w-96 p-6 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-4 shrink-0 hover:border-primary/40 transition-all"
                >
                  <div className="space-y-3">
                    <Quote className="w-6 h-6 text-primary/40" />
                    <p className="text-body-sm text-foreground leading-relaxed font-sans line-clamp-4">
                      &ldquo;{item.content}&rdquo;
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <p className="font-bold text-foreground">{item.authorName}</p>
                      <p className="text-[11px] text-primary">{item.role || 'Verified PM Academy Learner'}</p>
                    </div>
                    {item.createdAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Review Submission Modal */}
      <ContextualFeedbackModal
        isOpen={modalOpen}
        promptKey="public_review_submission"
        title="Submit a Public Learner Review"
        description="Share your learning experience with the PM Academy community."
        onClose={() => setModalOpen(false)}
      />
    </section>
  )
}
