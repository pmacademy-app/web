import { z } from 'zod';

// Shared references
export const LessonRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  module: z.string().optional(),
});

export const GlossaryEntrySchema = z.object({
  term: z.string(),
  definition: z.string(),
  relatedConcepts: z.array(z.string()).optional(),
  difficulty: z.number().optional(),
});

export const FlashcardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  difficulty: z.number().or(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const QuizQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).min(2),
  correctAnswer: z.number(), // 0-indexed index
  explanation: z.string(),
  objectivesTested: z.array(z.number()).optional(),
  difficulty: z.enum(['easy', 'medium', 'medium-hard', 'hard']).or(z.string()).optional(),
});

// Mermaid reference inside framework / mentalModel
export const MermaidRefSchema = z.object({
  blockId: z.string(),
  type: z.literal('mermaid'),
});

// Recursive block definition
// We define a base schema first, then use z.lazy for recursive types
const baseBlockFields = {
  blockId: z.string(),
};

// Define specific non-recursive blocks
const headingBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('heading'),
  level: z.number(),
  text: z.string(),
});

const paragraphBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('paragraph'),
  text: z.string(),
});

const blockquoteBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('blockquote'),
  text: z.string(),
});

const listBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('list'),
  ordered: z.boolean(),
  items: z.array(z.string()),
});

const tableBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('table'),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

const codeBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('code'),
  language: z.string().optional(),
  code: z.string(),
});

const learningObjectivesBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('learningObjectives'),
  objectives: z.array(z.string()),
});

const commonMistakesBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('commonMistakes'),
  mistakes: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
    })
  ),
});

const realWorldPerspectiveBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('realWorldPerspective'),
  segments: z.array(
    z.object({
      context: z.string(),
      body: z.string(),
    })
  ),
});

const interviewPerspectiveBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('interviewPerspective'),
  questions: z.array(
    z.object({
      question: z.string(),
      whatItEvaluates: z.string(),
    })
  ),
});

const keyTakeawaysBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('keyTakeaways'),
  items: z.array(z.string()),
});

const cheatSheetBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('cheatSheet'),
  items: z.array(z.string()),
});

const glossaryBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('glossary'),
  entries: z.array(GlossaryEntrySchema),
});

const resourcesBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('resources'),
  items: z.array(
    z.object({
      citation: z.string(),
      note: z.string().optional(),
    })
  ),
});

const flashcardDeckBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('flashcardDeck'),
  id: z.string(),
  cards: z.array(FlashcardSchema),
});

const reflectionBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('reflection'),
  prompts: z.array(z.string()),
});

const quizBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('quiz'),
  id: z.string(),
  questions: z.array(QuizQuestionSchema),
});

const connectionsBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('connections'),
  previous: LessonRefSchema.nullable(),
  current: LessonRefSchema,
  next: LessonRefSchema.nullable(),
  unlocks: z.array(
    z.object({
      lesson: LessonRefSchema,
      coreIdea: z.string(),
    })
  ),
});

const mermaidBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('mermaid'),
  id: z.string(),
  source: z.string(),
  normalized: z.string(),
  authorTheme: z.record(z.string()).optional(),
  svg: z.string().optional(),
  staticSvg: z.string().optional(),
});

// Future block types
const timelineBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('timeline'),
  events: z.array(
    z.object({
      date: z.string(),
      title: z.string(),
      description: z.string(),
    })
  ),
});

const videoBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('video'),
  assetId: z.string(),
  captionsAssetId: z.string().optional(),
});

const aiPromptBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal('aiPrompt'),
  id: z.string(),
  promptTemplate: z.string(),
  mode: z.enum(['explain', 'quiz-me', 'socratic']),
});

// Recursive schemas setup
export type BlockType = z.infer<typeof BlockSchema>;

export const BlockSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    headingBlockSchema,
    paragraphBlockSchema,
    blockquoteBlockSchema,
    listBlockSchema,
    tableBlockSchema,
    codeBlockSchema,
    learningObjectivesBlockSchema,
    commonMistakesBlockSchema,
    realWorldPerspectiveBlockSchema,
    interviewPerspectiveBlockSchema,
    keyTakeawaysBlockSchema,
    cheatSheetBlockSchema,
    glossaryBlockSchema,
    resourcesBlockSchema,
    flashcardDeckBlockSchema,
    reflectionBlockSchema,
    quizBlockSchema,
    connectionsBlockSchema,
    mermaidBlockSchema,
    timelineBlockSchema,
    videoBlockSchema,
    aiPromptBlockSchema,
    z.object({
      ...baseBlockFields,
      type: z.literal('theory'),
      children: z.array(BlockSchema),
    }),
    z.object({
      ...baseBlockFields,
      type: z.literal('summary'),
      children: z.array(BlockSchema),
    }),
    z.object({
      ...baseBlockFields,
      type: z.literal('mentalModel'),
      name: z.string(),
      diagram: MermaidRefSchema.optional(),
      children: z.array(BlockSchema),
    }),
    z.object({
      ...baseBlockFields,
      type: z.literal('companyExample'),
      company: z.string(),
      children: z.array(BlockSchema),
      assumptionFlags: z.array(z.string()).optional(),
    }),
    z.object({
      ...baseBlockFields,
      type: z.literal('caseStudy'),
      title: z.string(),
      children: z.array(BlockSchema),
    }),
    z.object({
      ...baseBlockFields,
      type: z.literal('framework'),
      name: z.string(),
      diagram: MermaidRefSchema.optional(),
      children: z.array(BlockSchema),
    }),
    z.object({
      ...baseBlockFields,
      type: z.literal('callout'),
      variant: z.enum(['info', 'warning', 'tip', 'danger']),
      children: z.array(BlockSchema),
    }),
    z.object({
      ...baseBlockFields,
      type: z.literal('tabs'),
      children: z.array(
        z.object({
          label: z.string(),
          content: z.array(BlockSchema),
        })
      ),
    }),
    z.object({
      ...baseBlockFields,
      type: z.literal('accordion'),
      children: z.array(
        z.object({
          title: z.string(),
          content: z.array(BlockSchema),
        })
      ),
    }),
  ])
);

// Full Lesson JSON Schema
export const LessonJSONSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string(),
  contentHash: z.string(),
  title: z.string(),
  slug: z.string(),
  module: z.string(), // slugified module name
  order: z.number(),
  totalInModule: z.number(),
  difficulty: z.number(),
  estimatedReadingTime: z.number(),
  estimatedCompletionTime: z.number(),
  prerequisites: z.array(z.string()), // list of stable lessonId strings
  sourceFile: z.string(),
  blocks: z.array(BlockSchema),
  assets: z.array(
    z.object({
      assetId: z.string(),
      sourcePath: z.string(),
      hash: z.string(),
      dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
      mimeType: z.string().optional(),
    })
  ).default([]),
  searchable: z.object({
    plainText: z.string(),
    headings: z.array(z.string()),
  }),
  glossaryTermsIntroduced: z.array(z.string()).default([]),
  generator: z.object({
    model: z.string(),
    promptVersion: z.string(),
    generatedAt: z.string(),
  }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LessonJSON = z.infer<typeof LessonJSONSchema>;
