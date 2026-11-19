import React from 'react';
import type { CompiledBlock } from '@/types';
import DefaultMarkdown from '@/blocks/default/DefaultMarkdown';
import SectionBlock from '@/blocks/section/SectionBlock';
import MermaidBlock from '@/blocks/mermaid/MermaidBlock';
import ConnectionsBlock from '@/blocks/connections/ConnectionsBlock';
import GlossaryBlock from '@/blocks/glossary/GlossaryBlock';
import QuizBlock from '@/blocks/quiz/QuizBlock';
import FlashcardDeckBlock from '@/blocks/flashcards/FlashcardDeckBlock';
import { BlockErrorBoundary } from './block-error-boundary';

/**
 * Server Component block tree. Renders lesson blocks to HTML on the server: markdown is
 * parsed and sanitized here (MarkdownRenderer: marked + DOMPurify), so neither library is
 * shipped to the browser. Interactive pieces (InlineConceptCheck, quiz, flashcards) stay
 * client components inside this tree. Each block is wrapped in a client error boundary that
 * receives only primitives, so a failing block degrades alone without serializing block data.
 */
interface BlockTreeServerProps {
  blocks: CompiledBlock[];
  lessonId: string;
  previewMode?: boolean;
}

const PROSE_SECTION_TYPES = new Set([
  'learningObjectives',
  'theory',
  'commonMistakes',
  'mentalModel',
  'companyExample',
  'realWorldPerspective',
  'caseStudy',
  'framework',
  'interviewPerspective',
  'summary',
  'keyTakeaways',
  'cheatSheet',
  'resources',
  'reflection',
]);

function ServerBlockRenderer({
  block,
  lessonId,
  previewMode,
}: {
  block: CompiledBlock;
  lessonId: string;
  previewMode?: boolean;
}) {
  const children =
    block.children && Array.isArray(block.children) && block.children.length > 0 ? (
      <BlockTreeServerRenderer
        blocks={block.children}
        lessonId={lessonId}
        previewMode={previewMode}
      />
    ) : undefined;

  const type = block.type;

  if (type === 'quiz') {
    return <QuizBlock block={block} lessonId={lessonId} previewMode={previewMode}>{children}</QuizBlock>;
  }

  if (type === 'flashcardDeck') {
    return <FlashcardDeckBlock block={block} lessonId={lessonId} previewMode={previewMode}>{children}</FlashcardDeckBlock>;
  }

  if (type === 'mermaid') {
    return <MermaidBlock block={block} lessonId={lessonId} previewMode={previewMode}>{children}</MermaidBlock>;
  }

  if (type === 'connections') {
    return <ConnectionsBlock block={block} lessonId={lessonId} previewMode={previewMode}>{children}</ConnectionsBlock>;
  }

  if (type === 'glossary') {
    return <GlossaryBlock block={block} lessonId={lessonId} previewMode={previewMode}>{children}</GlossaryBlock>;
  }

  if (PROSE_SECTION_TYPES.has(type)) {
    return <SectionBlock block={block} lessonId={lessonId} previewMode={previewMode}>{children}</SectionBlock>;
  }

  return <DefaultMarkdown block={block} lessonId={lessonId} previewMode={previewMode}>{children}</DefaultMarkdown>;
}

export function BlockTreeServerRenderer({ blocks, lessonId, previewMode }: BlockTreeServerProps) {
  if (!blocks || !Array.isArray(blocks)) return null;

  return (
    <>
      {blocks.map((block) => (
        <BlockErrorBoundary
          key={block.blockId}
          blockId={block.blockId}
          blockType={block.type}
          lessonId={lessonId}
        >
          <ServerBlockRenderer block={block} lessonId={lessonId} previewMode={previewMode} />
        </BlockErrorBoundary>
      ))}
    </>
  );
}
