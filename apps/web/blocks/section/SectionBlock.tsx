import React from 'react';
import { BookOpen, AlertCircle } from 'lucide-react';
import { BlockProps } from '../../renderer/registry';

export default function SectionBlock({ block, children }: BlockProps) {
  const type = block.type;

  if (type === 'theory') {
    return <div className="my-6 space-y-4">{children}</div>;
  }

  if (type === 'learningObjectives') {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm my-6">
        <div className="flex items-center gap-2 text-primary font-semibold mb-3">
          <BookOpen className="h-5 w-5" />
          <h2 className="text-base font-bold text-foreground">Learning Objectives</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-foreground/80 list-disc list-inside leading-relaxed">
          {children}
        </div>
      </div>
    );
  }

  if (type === 'commonMistakes') {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 shadow-sm space-y-3 my-6">
        <div className="flex items-center gap-2 border-b border-destructive/10 pb-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <h3 className="text-lg font-bold font-serif">Common Pitfalls</h3>
        </div>
        <div className="leading-relaxed">{children}</div>
      </div>
    );
  }

  // Handle badges based on block type
  let badgeText = '';
  let badgeColor = '';
  const title = block.title || block.name || '';

  switch (type) {
    case 'mentalModel':
      badgeText = 'Mental Model';
      badgeColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      break;
    case 'caseStudy':
      badgeText = 'Case Study';
      badgeColor = 'bg-violet-500/10 text-violet-600 dark:text-violet-400';
      break;
    case 'framework':
      badgeText = 'Framework & Tools';
      badgeColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      break;
    case 'realWorldPerspective':
      badgeText = 'Real-World Perspective';
      badgeColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      break;
    case 'interviewPerspective':
      badgeText = 'Interview Perspective';
      badgeColor = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
      break;
    case 'companyExample':
      badgeText = 'Company Example';
      badgeColor = 'bg-sky-500/10 text-sky-600 dark:text-sky-400';
      break;
    case 'keyTakeaways':
      badgeText = 'Key Takeaways';
      badgeColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      break;
    case 'cheatSheet':
      badgeText = 'Cheat Sheet';
      badgeColor = 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
      break;
    case 'resources':
      badgeText = 'Additional Resources';
      badgeColor = 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400';
      break;
    case 'reflection':
      badgeText = 'Reflection';
      badgeColor = 'bg-pink-500/10 text-pink-600 dark:text-pink-400';
      break;
    case 'summary':
      badgeText = 'Summary';
      badgeColor = 'bg-teal-500/10 text-teal-600 dark:text-teal-400';
      break;
    default:
      break;
  }

  if (badgeText) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3 my-6">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${badgeColor}`}>
            {badgeText}
          </span>
          {title && (
            <h3 className="text-lg font-bold text-foreground font-serif">
              {title}
            </h3>
          )}
        </div>
        <div className="leading-relaxed space-y-3">{children}</div>
      </div>
    );
  }

  // Default section container fallback
  return (
    <div className="my-6 space-y-3 leading-relaxed">
      {title && <h3 className="text-lg font-bold text-foreground font-serif">{title}</h3>}
      {children}
    </div>
  );
}
