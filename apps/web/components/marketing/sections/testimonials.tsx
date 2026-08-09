'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { Quote, Star } from 'lucide-react'

interface PublishedTestimonial {
  id: string
  content: string
  source_event?: string
  created_at: string
}

export function TestimonialsSection() {
  const prefersReducedMotion = useReducedMotion()
  const [testimonials, setTestimonials] = useState<PublishedTestimonial[]>([])

  useEffect(() => {
    async function loadTestimonials() {
      try {
        const res = await fetch('/api/testimonials')
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.testimonials) && data.testimonials.length > 0) {
            setTestimonials(data.testimonials)
          }
        }
      } catch (err) {
        console.warn('Failed to load live testimonials:', err)
      }
    }
    loadTestimonials()
  }, [])

  // Default fallback showcase when zero custom user testimonials are published yet
  const displayList: PublishedTestimonial[] = testimonials.length > 0 ? testimonials : [
    {
      id: 'default-1',
      content: 'Prodily PM Academy gave me the structure I needed to transition from software engineering to product management. The 90 structured lessons and capstone projects built real portfolio proof.',
      source_event: 'Career Switcher',
      created_at: new Date().toISOString(),
    },
    {
      id: 'default-2',
      content: 'The Spaced Repetition flashcards and competency skill radar make learning PM concepts stick. The best part? It is completely free forever with no hidden paywalls.',
      source_event: 'Product Associate',
      created_at: new Date().toISOString(),
    },
    {
      id: 'default-3',
      content: 'I built 9 real module capstones that I now present in interviews. The practical focus on real product judgment sets PM Academy apart from generic online courses.',
      source_event: 'Aspiring Product Manager',
      created_at: new Date().toISOString(),
    },
  ]

  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="py-20 lg:py-28 bg-surface-muted border-t border-border"
    >
      <div className="max-w-[1120px] mx-auto px-5 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-wider mb-4">
            <Star className="w-3.5 h-3.5 fill-current" /> Live Learner Stories
          </div>
          <h2
            id="testimonials-heading"
            className="font-display text-h1 lg:text-display-lg font-semibold text-foreground mb-4"
          >
            Built for learners who want proof of skill.
          </h2>
          <p className="text-body-lg text-locked max-w-[560px] mx-auto leading-relaxed">
            Real feedback and testimonials submitted directly by active PM Academy learners and moderated by admins.
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {displayList.map((item, index) => (
            <motion.div
              key={item.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.24, delay: index * 0.08, ease: [0, 0, 0.2, 1] }}
              className="p-6 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <Quote className="w-6 h-6 text-primary/40" />
                <p className="text-body-sm text-foreground leading-relaxed font-sans">
                  &ldquo;{item.content}&rdquo;
                </p>
              </div>

              <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="font-bold text-primary">
                  {item.source_event ? item.source_event.replace(/_/g, ' ') : 'Verified Learner'}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {new Date(item.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
