import { Reveal } from '@/components/marketing/motion/reveal'
import {
  CARD,
  CONTAINER,
  EYEBROW,
  EYEBROW_RULE,
  SECTION_TITLE,
  SECTION_Y,
} from '@/components/marketing/styles'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'

/**
 * Published learner testimonials — Phase 0.C.
 *
 * ## The rule this component exists to enforce
 *
 * `docs/IMPLEMENTATION_PLAN.md` §Phase 0.C sets a binding claims policy: no invented
 * testimonials, statistics or outcomes. Prodily does have a real source — testimonials
 * a learner submitted and an admin approved and published, served by
 * `FeedbackAdminService.getPublishedTestimonials()` — and the homepage was not using it.
 *
 * So this renders real rows or nothing at all. The `MINIMUM_TO_RENDER` threshold is the
 * important part: one or two approved quotes on a landing page reads as "we found
 * someone who liked it", which is weaker than showing no social proof and letting the
 * sample lessons carry the argument. Below the threshold the section returns `null` and
 * the page closes up around it.
 *
 * ## Why this does not regress LCP
 *
 * The service wraps its query in `unstable_cache`, the homepage is `revalidate = 3600`,
 * and this section renders well below the fold. It also returns `[]` when Supabase env
 * vars are absent, so a preview build with no database renders the page without it
 * rather than failing.
 */

/**
 * Below this, no section. Three is the point at which a set of quotes reads as a
 * pattern rather than an anecdote.
 */
const MINIMUM_TO_RENDER = 3

/** More than this and the section becomes a wall; the page is meant to stay short. */
const MAXIMUM_TO_RENDER = 6

export async function PublishedTestimonialsSection() {
  const testimonials = await FeedbackAdminService.getPublishedTestimonials()

  if (!testimonials || testimonials.length < MINIMUM_TO_RENDER) return null

  const shown = testimonials.slice(0, MAXIMUM_TO_RENDER)

  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className={`${SECTION_Y} bg-transparent border-t border-border/80 scroll-mt-24 lg:scroll-mt-28`}
    >
      <div className={CONTAINER}>
        <Reveal amount={0.25} className="max-w-[640px] mb-12">
          <div className={`${EYEBROW} mb-4`}>
            <span aria-hidden="true" className={EYEBROW_RULE} />
            FROM LEARNERS
          </div>
          <h2
            id="testimonials-heading"
            className={SECTION_TITLE}
          >
            What people say after using it.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 items-stretch">
          {shown.map((testimonial, index) => (
            <Reveal key={testimonial.id} amount={0.15} delay={index * 60} className="h-full">
              <figure className={`h-full flex flex-col gap-5 p-6 ${CARD}`}>
                <span aria-hidden="true" className="font-display text-h1 leading-none text-primary/30 select-none">&ldquo;</span>
                <blockquote className="-mt-4 text-body-sm text-foreground/85 leading-relaxed flex-1">
                  {testimonial.content}
                </blockquote>
                <figcaption className="pt-4 border-t border-border text-caption text-ink-muted">
                  <span className="font-semibold text-foreground">{testimonial.authorName}</span>
                  {testimonial.role ? <span> · {testimonial.role}</span> : null}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
