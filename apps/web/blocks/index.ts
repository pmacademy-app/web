import dynamic from 'next/dynamic';
import { registerBlock } from '../renderer/registry';
import DefaultMarkdown from './default/DefaultMarkdown';
import SectionBlock from './section/SectionBlock';

// Lazily load large or interactive client components to optimize bundle size and page load speed
const QuizBlock = dynamic(() => import('./quiz/QuizBlock'));
const FlashcardDeckBlock = dynamic(() => import('./flashcards/FlashcardDeckBlock'));
const MermaidBlock = dynamic(() => import('./mermaid/MermaidBlock'), { ssr: false });
const ConnectionsBlock = dynamic(() => import('./connections/ConnectionsBlock'));
const GlossaryBlock = dynamic(() => import('./glossary/GlossaryBlock'));

// Active block registrations
registerBlock('__default__', DefaultMarkdown);
registerBlock('quiz', QuizBlock as any);
registerBlock('flashcardDeck', FlashcardDeckBlock as any);
registerBlock('mermaid', MermaidBlock as any);
registerBlock('connections', ConnectionsBlock as any);
registerBlock('glossary', GlossaryBlock as any);

// Prose section types all share the wrapper block SectionBlock
const PROSE_SECTION_TYPES = [
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
];

for (const type of PROSE_SECTION_TYPES) {
  registerBlock(type, SectionBlock);
}
