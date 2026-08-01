import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Lock, Key } from 'lucide-react';
import { BlockProps } from '../../renderer/registry';

export default function ConnectionsBlock({ block }: BlockProps) {
  const { previous, current, next, unlocks } = block;

  return (
    <div className="border-t border-border pt-8 mt-12 space-y-6">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Module Connections & Context
      </h4>

      {/* Prev / Next Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {previous ? (
          <Link
            href={`/academy/l/${previous.id}`}
            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card text-left transition-all hover:bg-accent/30 hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-5 w-5 text-primary shrink-0" />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Prerequisite Lesson
              </span>
              <h5 className="text-sm font-semibold text-foreground leading-snug mt-0.5">
                {previous.title}
              </h5>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/20 opacity-60">
            <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Prerequisite Lesson
              </span>
              <h5 className="text-sm font-semibold text-muted-foreground leading-snug mt-0.5">
                None (Module Starter)
              </h5>
            </div>
          </div>
        )}

        {next ? (
          <Link
            href={`/academy/l/${next.id}`}
            className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card text-right transition-all hover:bg-accent/30 hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex-1 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block text-right">
                Next Lesson
              </span>
              <h5 className="text-sm font-semibold text-foreground leading-snug mt-0.5 block text-right">
                {next.title}
              </h5>
            </div>
            <ArrowRight className="h-5 w-5 text-primary shrink-0" />
          </Link>
        ) : (
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/20 opacity-60">
            <div className="flex-1 text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Next Lesson
              </span>
              <h5 className="text-sm font-semibold text-muted-foreground leading-snug mt-0.5 block">
                Module Complete
              </h5>
            </div>
            <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        )}
      </div>

      {/* Unlocked Topics */}
      {unlocks && unlocks.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Key className="h-4 w-4 text-amber-500" />
            <span>Future Concepts Unlocked</span>
          </div>
          <ul className="space-y-3">
            {unlocks.map((u: any, idx: number) => (
              <li key={idx} className="text-sm text-foreground/80 leading-relaxed flex items-start gap-2.5">
                <span className="inline-flex shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                <div>
                  <Link
                    href={`/academy/l/${u.lesson.id}`}
                    className="font-bold text-primary hover:underline"
                  >
                    {u.lesson.title}
                  </Link>
                  <span className="text-muted-foreground"> — {u.coreIdea}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
