import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Target,
  Lightbulb,
  Building2,
  Users,
  MessageSquare,
  BookMarked,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { BlockProps } from '../../renderer/registry';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';

// Helper to check if children contains non-null renderable elements
function hasRenderableChildren(children: React.ReactNode): boolean {
  if (!children) return false;
  if (Array.isArray(children)) return children.length > 0;
  return true;
}

// ─── LearningObjectives ──────────────────────────────────────────────────────

function LearningObjectivesSection({ block, children }: BlockProps) {
  const objectives: string[] = (block.objectives as string[]) || [];

  if (objectives.length === 0) {
    if (!hasRenderableChildren(children)) return null;
    return <div className="my-6 space-y-4">{children}</div>;
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
        <Target className="h-5 w-5 shrink-0" />
        <h2 className="text-base font-bold text-foreground">Learning Objectives</h2>
      </div>
      <ol className="space-y-3">
        {objectives.map((obj, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-foreground/80 leading-relaxed">
            <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">
              {i + 1}
            </span>
            <MarkdownRenderer content={obj} className="flex-1 mt-0 [&>p]:m-0" />
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── CommonMistakes ──────────────────────────────────────────────────────────

interface MistakeItem {
  title: string;
  body: string;
}

function CommonMistakesSection({ block, children }: BlockProps) {
  const mistakes = (block.mistakes as MistakeItem[]) || [];

  if (mistakes.length === 0) {
    if (!hasRenderableChildren(children)) return null;
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

  return (
    <div className="my-6 space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
        <h3 className="text-lg font-bold font-serif text-foreground">Common Mistakes to Avoid</h3>
      </div>
      <div className="space-y-3">
        {mistakes.map((mistake, i) => (
          <div
            key={i}
            className="rounded-xl border border-destructive/15 bg-destructive/5 p-5 space-y-2"
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 mt-0.5 text-destructive font-bold text-base">✕</span>
              <h4 className="font-bold text-foreground text-sm leading-snug font-serif">{mistake.title}</h4>
            </div>
            <MarkdownRenderer
              content={mistake.body}
              className="text-sm text-foreground/75 leading-relaxed pl-6 [&>p]:m-0 [&>p]:mb-2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── KeyTakeaways ────────────────────────────────────────────────────────────

function KeyTakeawaysSection({ block, children }: BlockProps) {
  const items = (block.items as string[]) || [];

  if (items.length === 0) {
    if (!hasRenderableChildren(children)) return null;
    return (
      <SectionCard
        badgeText="Key Takeaways"
        badgeColor="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
        borderColor="border-l-emerald-500"
        title={String(block.title || block.name || '')}
      >
        {children}
      </SectionCard>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-emerald-500/15">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <h3 className="text-lg font-bold font-serif text-foreground">Key Takeaways</h3>
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="shrink-0 mt-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <MarkdownRenderer
              content={item}
              className="text-sm text-foreground/80 leading-relaxed flex-1 [&>p]:m-0"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── CheatSheet ──────────────────────────────────────────────────────────────

function CheatSheetSection({ block, children }: BlockProps) {
  const items = (block.items as string[]) || [];

  if (items.length === 0) {
    if (!hasRenderableChildren(children)) return null;
    return (
      <SectionCard
        badgeText="Cheat Sheet"
        badgeColor="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
        borderColor="border-l-yellow-500"
        title={String(block.title || block.name || '')}
      >
        {children}
      </SectionCard>
    );
  }

  return (
    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-yellow-500/15">
        <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
        <h3 className="text-lg font-bold font-serif text-foreground">Quick Reference Cheat Sheet</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 py-2 border-b border-yellow-500/10 last:border-0">
            <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-400" />
            <MarkdownRenderer
              content={item}
              className="text-sm text-foreground/80 leading-relaxed flex-1 [&>p]:m-0"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Resources ───────────────────────────────────────────────────────────────

interface ResourceItem {
  citation?: string;
  note?: string;
}

function ResourcesSection({ block, children }: BlockProps) {
  const items = (block.items as ResourceItem[]) || [];

  if (items.length === 0) {
    if (!hasRenderableChildren(children)) return null;
    return (
      <SectionCard
        badgeText="Additional Resources"
        badgeColor="bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20"
        borderColor="border-l-neutral-400"
        title={String(block.title || block.name || '')}
      >
        {children}
      </SectionCard>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <BookMarked className="h-5 w-5 text-muted-foreground shrink-0" />
        <h3 className="text-lg font-bold font-serif text-foreground">Additional Resources</h3>
      </div>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <li key={i} className="space-y-1">
            {item.citation && (
              <p className="text-sm font-semibold text-foreground leading-snug">
                <MarkdownRenderer content={item.citation} className="inline [&>p]:inline [&>p]:m-0" />
              </p>
            )}
            {item.note && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {item.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── InterviewPerspective ─────────────────────────────────────────────────────

interface InterviewQuestion {
  question?: string;
  whatItEvaluates?: string;
}

function InterviewPerspectiveSection({ block, children }: BlockProps) {
  const questions = (block.questions as InterviewQuestion[]) || [];
  const hasContent = questions.some((q) => q.question || q.whatItEvaluates);

  if (!hasContent) {
    if (!hasRenderableChildren(children)) return null;
    return (
      <SectionCard
        badgeText="Interview Perspective"
        badgeColor="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
        borderColor="border-l-indigo-500"
        title={String(block.title || block.name || '')}
      >
        {children}
      </SectionCard>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-indigo-500/15">
        <MessageSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <h3 className="text-lg font-bold font-serif text-foreground">Interview Perspective</h3>
      </div>
      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="space-y-2 font-sans text-sm">
            {q.question && (
              <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1.5">
                  Sample Question
                </p>
                <p className="text-sm font-semibold text-foreground leading-snug">{q.question}</p>
              </div>
            )}
            {q.whatItEvaluates && (
              <MarkdownRenderer
                content={q.whatItEvaluates}
                className="text-sm text-foreground/75 leading-relaxed pl-2 [&>p]:m-0 [&>p]:mb-2"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RealWorldPerspective ─────────────────────────────────────────────────────

interface PerspectiveSegment {
  context: string;
  body: string;
}

function RealWorldPerspectiveSection({ block, children }: BlockProps) {
  const segments = (block.segments as PerspectiveSegment[]) || [];

  if (segments.length === 0) {
    if (!hasRenderableChildren(children)) return null;
    return (
      <SectionCard
        badgeText="Real-World Perspective"
        badgeColor="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
        borderColor="border-l-amber-500"
        title={String(block.title || block.name || '')}
      >
        {children}
      </SectionCard>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-5 pb-3 border-b border-amber-500/15">
        <Users className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <h3 className="text-lg font-bold font-serif text-foreground">Real-World Perspective</h3>
      </div>
      <div className="space-y-5">
        {segments.map((seg, i) => (
          <div key={i} className="space-y-2">
            {seg.context && (
              <MarkdownRenderer
                content={seg.context}
                className="font-semibold text-sm text-foreground [&>p]:m-0 [&>p]:leading-snug [&>strong]:text-foreground"
              />
            )}
            {seg.body && (
              <MarkdownRenderer
                content={seg.body}
                className="text-sm text-foreground/75 leading-relaxed pl-4 border-l-2 border-amber-500/30 [&>p]:m-0 [&>p]:mb-2"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CompanyExample ───────────────────────────────────────────────────────────

function CompanyExampleSection({ block, children }: BlockProps) {
  const company = String(block.company || 'Company Example');
  const assumptionFlags = (block.assumptionFlags as string[]) || [];

  if (!hasRenderableChildren(children) && !company) return null;

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-sky-500/15">
        <Building2 className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            Company Example
          </span>
          <h3 className="text-lg font-bold font-serif text-foreground leading-snug">{company}</h3>
        </div>
      </div>
      <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
        {children}
      </div>
      {assumptionFlags.length > 0 && (
        <div className="mt-5 pt-4 border-t border-sky-500/15">
          {assumptionFlags.map((flag, i) => (
            <p key={i} className="text-[11px] text-muted-foreground/70 leading-relaxed italic">
              ⚠️ Note: {flag}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MentalModel ─────────────────────────────────────────────────────────────

function MentalModelSection({ block, children }: BlockProps) {
  const name = String(block.name || block.title || '');
  if (!hasRenderableChildren(children) && !name) return null;

  return (
    <div className="rounded-xl border-l-4 border-l-emerald-500 border border-emerald-500/20 bg-emerald-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          Mental Model
        </span>
      </div>
      {name && (
        <h3 className="text-xl font-bold font-serif text-foreground mt-2 mb-4">{name}</h3>
      )}
      <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

// ─── CaseStudy ───────────────────────────────────────────────────────────────

function CaseStudySection({ block, children }: BlockProps) {
  const title = String(block.title || block.name || '');
  if (!hasRenderableChildren(children) && !title) return null;

  return (
    <div className="rounded-xl border-l-4 border-l-violet-500 border border-violet-500/20 bg-violet-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
          Case Study
        </span>
      </div>
      {title && (
        <h3 className="text-xl font-bold font-serif text-foreground mt-2 mb-4">{title}</h3>
      )}
      <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

// ─── Framework ───────────────────────────────────────────────────────────────

function FrameworkSection({ block, children }: BlockProps) {
  const name = String(block.name || block.title || '');
  if (!hasRenderableChildren(children) && !name) return null;

  return (
    <div className="rounded-xl border-l-4 border-l-blue-500 border border-blue-500/20 bg-blue-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          Framework &amp; Tools
        </span>
      </div>
      {name && (
        <h3 className="text-xl font-bold font-serif text-foreground mt-2 mb-4">{name}</h3>
      )}
      <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function SummarySection({ children }: BlockProps) {
  if (!hasRenderableChildren(children)) return null;

  return (
    <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-teal-500/15">
        <Lightbulb className="h-5 w-5 text-teal-600 dark:text-teal-400 shrink-0" />
        <h3 className="text-lg font-bold font-serif text-foreground">Lesson Summary</h3>
      </div>
      <div className="text-sm text-foreground/80 leading-relaxed space-y-3">
        {children}
      </div>
    </div>
  );
}

// ─── Reflection ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReflectionSection(_props: BlockProps) {
  return (
    <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-6 shadow-sm my-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
          Reflection
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Switch to the <strong>Reflection</strong> tab to answer this lesson&apos;s reflection prompt and earn XP.
      </p>
    </div>
  );
}

// ─── Generic Section Card ─────────────────────────────────────────────────────

interface SectionCardProps {
  badgeText: string;
  badgeColor: string;
  borderColor: string;
  title: string;
  children?: React.ReactNode;
}

function SectionCard({ badgeText, badgeColor, borderColor, title, children }: SectionCardProps) {
  if (!hasRenderableChildren(children) && !title) return null;

  return (
    <div className={`rounded-xl border-l-4 ${borderColor} border border-border bg-card p-6 shadow-sm space-y-3 my-6`}>
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
          {badgeText}
        </span>
        {title && (
          <h3 className="text-lg font-bold text-foreground font-serif">{title}</h3>
        )}
      </div>
      <div className="leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

// ─── Theory ──────────────────────────────────────────────────────────────────

function TheorySection({ children }: BlockProps) {
  if (!hasRenderableChildren(children)) return null;
  return (
    <div className="my-6 space-y-5">{children}</div>
  );
}

// ─── Main SectionBlock dispatch ───────────────────────────────────────────────

export default function SectionBlock({ block, children, lessonId }: BlockProps) {
  const type = block.type;

  switch (type) {
    case 'theory':
      return <TheorySection block={block} lessonId={lessonId}>{children}</TheorySection>;
    case 'learningObjectives':
      return <LearningObjectivesSection block={block} lessonId={lessonId}>{children}</LearningObjectivesSection>;
    case 'commonMistakes':
      return <CommonMistakesSection block={block} lessonId={lessonId}>{children}</CommonMistakesSection>;
    case 'keyTakeaways':
      return <KeyTakeawaysSection block={block} lessonId={lessonId}>{children}</KeyTakeawaysSection>;
    case 'cheatSheet':
      return <CheatSheetSection block={block} lessonId={lessonId}>{children}</CheatSheetSection>;
    case 'resources':
      return <ResourcesSection block={block} lessonId={lessonId}>{children}</ResourcesSection>;
    case 'interviewPerspective':
      return <InterviewPerspectiveSection block={block} lessonId={lessonId}>{children}</InterviewPerspectiveSection>;
    case 'realWorldPerspective':
      return <RealWorldPerspectiveSection block={block} lessonId={lessonId}>{children}</RealWorldPerspectiveSection>;
    case 'companyExample':
      return <CompanyExampleSection block={block} lessonId={lessonId}>{children}</CompanyExampleSection>;
    case 'mentalModel':
      return <MentalModelSection block={block} lessonId={lessonId}>{children}</MentalModelSection>;
    case 'caseStudy':
      return <CaseStudySection block={block} lessonId={lessonId}>{children}</CaseStudySection>;
    case 'framework':
      return <FrameworkSection block={block} lessonId={lessonId}>{children}</FrameworkSection>;
    case 'summary':
      return <SummarySection block={block} lessonId={lessonId}>{children}</SummarySection>;
    case 'reflection':
      return <ReflectionSection block={block} lessonId={lessonId}>{children}</ReflectionSection>;
    default: {
      const title = String(block.title || block.name || '');
      if (!hasRenderableChildren(children) && !title) return null;
      return (
        <div className="my-6 space-y-3 leading-relaxed">
          {title && <h3 className="text-lg font-bold text-foreground font-serif">{title}</h3>}
          {children}
        </div>
      );
    }
  }
}
