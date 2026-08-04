import { motion } from 'framer-motion'
import { RotateCw, Sparkles, HelpCircle } from 'lucide-react'
import type { FlashcardItem } from '@/lib/srs'

interface FlashcardProps {
  card: FlashcardItem
  isFlipped: boolean
  onFlip: () => void
}

export function Flashcard({ card, isFlipped, onFlip }: FlashcardProps) {
  return (
    <div
      className="w-full max-w-xl mx-auto perspective-1000 cursor-pointer group"
      onClick={onFlip}
      role="button"
      tabIndex={0}
      aria-label={isFlipped ? 'Flashcard answer revealed. Click or press Space to flip.' : 'Flashcard concept question. Click or press Space to flip.'}
      onKeyDown={(e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          onFlip()
        }
      }}
    >
      <motion.div
        className="relative w-full min-h-[280px] md:min-h-[320px] rounded-2xl border border-border bg-card p-6 md:p-8 shadow-md transition-all group-hover:shadow-lg group-hover:border-primary/40 flex flex-col justify-between"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front Side */}
        <div
          className={`absolute inset-0 p-6 md:p-8 flex flex-col justify-between backface-hidden ${
            isFlipped ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-3">
            <span className="inline-flex items-center gap-1.5 font-semibold text-primary uppercase tracking-wider">
              <HelpCircle className="w-3.5 h-3.5" />
              {card.module ? card.module.replace('-', ' ') : 'Flashcard'}
            </span>
            <span className="font-mono text-[11px]">Click or press Space to flip</span>
          </div>

          <div className="my-auto py-4 space-y-3">
            {card.concept && (
              <span className="inline-block px-2.5 py-1 rounded-md bg-secondary text-xs font-semibold text-foreground/80">
                {card.concept}
              </span>
            )}
            <h3 className="text-xl md:text-2xl font-bold font-serif text-foreground leading-snug">
              {card.front}
            </h3>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary/80 group-hover:text-primary pt-2">
            <RotateCw className="w-3.5 h-3.5" />
            Reveal Answer
          </div>
        </div>

        {/* Back Side */}
        <div
          className={`absolute inset-0 p-6 md:p-8 flex flex-col justify-between backface-hidden [transform:rotateY(180deg)] ${
            isFlipped ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-3">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Key Takeaway / Answer
            </span>
            <span className="font-mono text-[11px]">Self-assess below</span>
          </div>

          <div className="my-auto py-4">
            <p className="text-base md:text-lg text-foreground font-medium leading-relaxed">
              {card.back}
            </p>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-2">
            Rate your recall quality below (0 to 5)
          </div>
        </div>
      </motion.div>
    </div>
  )
}
