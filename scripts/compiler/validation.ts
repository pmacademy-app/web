import { LessonJSON, LessonJSONSchema } from './schema/block-schema';
import { CompilerContext, ValidationIssue } from './plugins/remark-plugins';

export interface ValidationRule {
  id: string;
  severity: 'error' | 'warning' | 'info';
  check(lesson: any, ctx: CompilerContext, allLessons?: any[]): ValidationIssue[];
}

const validationRules: ValidationRule[] = [
  // 1. Zod Schema check
  {
    id: 'zod-schema-validation',
    severity: 'error',
    check(lesson, ctx) {
      const issues: ValidationIssue[] = [];
      const result = LessonJSONSchema.safeParse(lesson);
      if (!result.success) {
        for (const error of result.error.issues) {
          const blockIdx = error.path[0] === 'blocks' ? error.path[1] : null;
          const blockObj = typeof blockIdx === 'number' ? lesson.blocks[blockIdx] : null;
          const blockInfo = blockObj ? `[type: ${blockObj.type}]` : '';
          
          issues.push({
            id: 'zod-schema-validation',
            severity: 'error',
            message: `Schema error: path "${error.path.join('.')}" ${blockInfo} — ${error.message} (${JSON.stringify(error.keys || error)})`,
            filePath: ctx.filePath,
          });
        }
      }
      return issues;
    },
  },

  // 2. Structural: Required blocks check
  {
    id: 'required-blocks',
    severity: 'error',
    check(lesson, ctx) {
      const issues: ValidationIssue[] = [];
      const hasLearningObjectives = lesson.blocks.some((b: any) => b.type === 'learningObjectives');
      const hasTheory = lesson.blocks.some((b: any) => b.type === 'theory');
      const hasQuiz = lesson.blocks.some((b: any) => b.type === 'quiz');
      const hasConnections = lesson.blocks.some((b: any) => b.type === 'connections');

      if (!hasLearningObjectives) {
        issues.push({
          id: 'required-blocks',
          severity: 'error',
          message: 'Missing required block: Learning Objectives',
          filePath: ctx.filePath,
        });
      }
      if (!hasTheory) {
        issues.push({
          id: 'required-blocks',
          severity: 'error',
          message: 'Missing required block: Theory',
          filePath: ctx.filePath,
        });
      }
      if (!hasQuiz) {
        issues.push({
          id: 'required-blocks',
          severity: 'error',
          message: 'Missing required block: Quiz',
          filePath: ctx.filePath,
        });
      }
      if (!hasConnections) {
        issues.push({
          id: 'required-blocks',
          severity: 'error',
          message: 'Missing required block: Connections',
          filePath: ctx.filePath,
        });
      }
      return issues;
    },
  },

  // 3. Quiz structure constraints (exactly 15 questions per lesson)
  {
    id: 'quiz-question-count',
    severity: 'error',
    check(lesson, ctx) {
      const issues: ValidationIssue[] = [];
      const quizBlock = lesson.blocks.find((b: any) => b.type === 'quiz');
      if (quizBlock) {
        const count = quizBlock.questions?.length || 0;
        if (count !== 15) {
          issues.push({
            id: 'quiz-question-count',
            severity: 'error',
            message: `Quiz must have exactly 15 questions, found ${count}`,
            filePath: ctx.filePath,
          });
        }

        // Validate individual questions
        quizBlock.questions?.forEach((q: any, idx: number) => {
          if (!q.question || q.question.trim().length === 0) {
            issues.push({
              id: 'quiz-invalid-question',
              severity: 'error',
              message: `Quiz Question #${idx + 1} is empty`,
              filePath: ctx.filePath,
            });
          }
          if (!q.options || q.options.length !== 4) {
            issues.push({
              id: 'quiz-invalid-options-count',
              severity: 'error',
              message: `Quiz Question #${idx + 1} must have exactly 4 options, found ${q.options?.length || 0}`,
              filePath: ctx.filePath,
            });
          }
          if (q.correctAnswer < 0 || q.correctAnswer >= 4) {
            issues.push({
              id: 'quiz-invalid-correct-answer',
              severity: 'error',
              message: `Quiz Question #${idx + 1} has invalid correctAnswer index: ${q.correctAnswer}`,
              filePath: ctx.filePath,
            });
          }
          if (!q.explanation || q.explanation.trim().length === 0) {
            issues.push({
              id: 'quiz-missing-explanation',
              severity: 'error',
              message: `Quiz Question #${idx + 1} is missing an explanation`,
              filePath: ctx.filePath,
            });
          }
        });
      }
      return issues;
    },
  },

  // 4. Content Quality: Duplicate paragraph check
  {
    id: 'duplicate-paragraphs',
    severity: 'warning',
    check(lesson, ctx) {
      const issues: ValidationIssue[] = [];
      const paragraphs: string[] = [];

      const collectParagraphs = (blocks: any[]) => {
        for (const block of blocks) {
          if (block.type === 'paragraph') {
            paragraphs.push(block.text);
          } else if (block.children) {
            collectParagraphs(block.children);
          }
        }
      };

      collectParagraphs(lesson.blocks);

      const seen = new Set<string>();
      for (const p of paragraphs) {
        const normalized = p.trim().toLowerCase();
        if (normalized.length > 30 && seen.has(normalized)) {
          issues.push({
            id: 'duplicate-paragraphs',
            severity: 'warning',
            message: `Duplicate paragraph content detected: "${p.slice(0, 50)}..."`,
            filePath: ctx.filePath,
          });
        }
        seen.add(normalized);
      }
      return issues;
    },
  },

  // 5. Content Quality: Mermaid validation
  {
    id: 'mermaid-syntax',
    severity: 'warning',
    check(lesson, ctx) {
      const issues: ValidationIssue[] = [];
      const checkMermaid = (blocks: any[]) => {
        for (const block of blocks) {
          if (block.type === 'mermaid') {
            const source = block.source;
            if (source && !source.match(/(graph\s+(TD|LR|TB|BT|RL)|sequenceDiagram|classDiagram|stateDiagram|gantt|pie|erDiagram|journey)/i)) {
              issues.push({
                id: 'mermaid-syntax',
                severity: 'warning',
                message: `Mermaid diagram might have invalid structure / syntax descriptor`,
                filePath: ctx.filePath,
              });
            }
          }
          if (block.children) {
            checkMermaid(block.children);
          }
          if (block.diagram) {
            checkMermaid([block.diagram]);
          }
        }
      };
      checkMermaid(lesson.blocks);
      return issues;
    },
  },

  // 5b. Static SVG rendering: every mermaid block must carry compiled SVG output.
  // The browser must never receive raw Mermaid source — this is the build-time gate.
  {
    id: 'mermaid-svg',
    severity: 'error',
    check(lesson, ctx) {
      const issues: ValidationIssue[] = [];
      const checkMermaid = (blocks: any[]) => {
        for (const block of blocks) {
          if (block.type === 'mermaid' && typeof block.source === 'string') {
            const hasSvg = typeof block.svg === 'string' && block.svg.length > 0;
            const hasStaticSvg = typeof block.staticSvg === 'string' && block.staticSvg.length > 0;
            if (!hasSvg && !hasStaticSvg) {
              issues.push({
                id: 'mermaid-svg',
                severity: 'error',
                message: `Mermaid block (${block.blockId || block.id || 'unknown'}) is missing compiled static SVG — compileMermaidToSvg must run at content:compile time`,
                filePath: ctx.filePath,
              });
            }
          }
          if (block.children) {
            checkMermaid(block.children);
          }
          if (block.diagram) {
            checkMermaid([block.diagram]);
          }
        }
      };
      checkMermaid(lesson.blocks);
      return issues;
    },
  },

  // 6. Accessibility image check
  {
    id: 'a11y-image-alt',
    severity: 'error',
    check(lesson, ctx) {
      // In Stage 2, remark-a11y-lint already flags missing alt texts at the MDast level
      // We can also double-check in compiled blocks here if needed
      return [];
    },
  },

  // 7. Referential validation: Glossary consistency (run site-wide)
  {
    id: 'glossary-consistency',
    severity: 'warning',
    check(lesson, ctx, allLessons) {
      const issues: ValidationIssue[] = [];
      if (!allLessons || allLessons.length === 0) return [];

      // Run exactly once on the first lesson to avoid duplicate site-wide scans
      if (allLessons[0].id !== lesson.id) return [];

      const glossaryMap = new Map<string, { definition: string; lessonTitle: string; sourceFile: string }>();

      for (const l of allLessons) {
        const glossaryBlock = l.blocks.find((b: any) => b.type === 'glossary');
        if (glossaryBlock) {
          for (const entry of glossaryBlock.entries || []) {
            const termLower = entry.term.trim().toLowerCase();
            const defNormalized = entry.definition.trim().toLowerCase();
            const existing = glossaryMap.get(termLower);

            if (existing) {
              if (existing.definition !== defNormalized) {
                issues.push({
                  id: 'glossary-consistency',
                  severity: 'warning',
                  message: `Glossary conflict: "${entry.term}" has differing definitions in "${l.title}" and "${existing.lessonTitle}"`,
                  filePath: l.sourceFile || ctx.filePath,
                });
              }
            } else {
              glossaryMap.set(termLower, {
                definition: defNormalized,
                lessonTitle: l.title,
                sourceFile: l.sourceFile || '',
              });
            }
          }
        }
      }
      return issues;
    },
  },
  // 8. Flashcard presence
  {
    id: 'flashcard-deck-check',
    severity: 'error',
    check(lesson, ctx) {
      const issues: ValidationIssue[] = [];
      const flashcardBlock = lesson.blocks.find((b: any) => b.type === 'flashcardDeck');
      if (!flashcardBlock) {
        issues.push({
          id: 'flashcard-deck-check',
          severity: 'error',
          message: 'Missing required block: Flashcard Deck',
          filePath: ctx.filePath,
        });
      } else {
        const cardsCount = flashcardBlock.cards?.length || 0;
        if (cardsCount === 0) {
          issues.push({
            id: 'flashcard-deck-check',
            severity: 'error',
            message: 'Flashcard deck is empty, must have at least one card',
            filePath: ctx.filePath,
          });
        }
      }
      return issues;
    },
  },

  // 9. Curriculum-wide structural integrity
  {
    id: 'curriculum-integrity',
    severity: 'error',
    check(lesson, ctx, allLessons) {
      const issues: ValidationIssue[] = [];
      if (!allLessons || allLessons.length === 0) return [];
      
      // Only execute once (on the first lesson in the array) to avoid duplicate prints
      if (allLessons[0].id !== lesson.id) return [];
      
      // 1. Total lesson count
      if (allLessons.length !== 90) {
        issues.push({
          id: 'curriculum-integrity',
          severity: 'error',
          message: `Curriculum size mismatch: expected exactly 90 lessons, found ${allLessons.length}`,
          filePath: ctx.filePath,
        });
      }
      
      // 2. Module checks
      const canonicalModules = ['foundations', 'discovery', 'design', 'execution', 'growth', 'leadership', 'technical', 'strategy', 'capstone'];
      const moduleLessons: Record<string, any[]> = {};
      for (const m of canonicalModules) {
        moduleLessons[m] = [];
      }
      
      for (const other of allLessons) {
        if (!canonicalModules.includes(other.module)) {
          issues.push({
            id: 'curriculum-integrity',
            severity: 'error',
            message: `Lesson "${other.title}" has invalid module slug "${other.module}"`,
            filePath: other.sourceFile || ctx.filePath,
          });
        } else {
          moduleLessons[other.module].push(other);
        }
      }
      
      for (const m of canonicalModules) {
        const count = moduleLessons[m].length;
        if (count !== 10) {
          issues.push({
            id: 'curriculum-integrity',
            severity: 'error',
            message: `Module "${m}" size mismatch: expected exactly 10 lessons, found ${count}`,
            filePath: ctx.filePath,
          });
        }
        // Verify ordering within module is exactly 1 to 10
        const orders = moduleLessons[m].map((l) => l.order).sort((a, b) => a - b);
        for (let i = 0; i < 10; i++) {
          if (orders[i] !== i + 1) {
            issues.push({
              id: 'curriculum-integrity',
              severity: 'error',
              message: `Module "${m}" has missing or duplicate lesson orders (expected 1..10, found orders: [${orders.join(', ')}])`,
              filePath: ctx.filePath,
            });
            break;
          }
        }
      }
      
      // 3. Lesson IDs uniqueness
      const seenIds = new Set<string>();
      for (const other of allLessons) {
        if (seenIds.has(other.id)) {
          issues.push({
            id: 'curriculum-integrity',
            severity: 'error',
            message: `Duplicate lesson ID detected: "${other.id}"`,
            filePath: other.sourceFile || ctx.filePath,
          });
        }
        seenIds.add(other.id);
      }
      
      // 4. Prerequisites resolution
      for (const other of allLessons) {
        for (const prereq of other.prerequisites || []) {
          if (!seenIds.has(prereq)) {
            issues.push({
              id: 'curriculum-integrity',
              severity: 'error',
              message: `Lesson "${other.title}" has unresolved prerequisite ID "${prereq}"`,
              filePath: other.sourceFile || ctx.filePath,
            });
          }
        }
      }

      return issues;
    },
  },
];

export function validateCompiledLesson(
  lesson: any,
  ctx: CompilerContext,
  allLessons?: any[],
  crossLessonsOnly = false
): ValidationIssue[] {
  const allIssues: ValidationIssue[] = [...ctx.issues];

  for (const rule of validationRules) {
    const isCrossRule = rule.id === 'curriculum-integrity' || rule.id === 'glossary-consistency';
    
    // Split validation runs: if crossLessonsOnly is true, skip single-lesson rules.
    // If crossLessonsOnly is false, skip cross-lesson rules.
    if (crossLessonsOnly && !isCrossRule) continue;
    if (!crossLessonsOnly && isCrossRule) continue;

    try {
      const ruleIssues = rule.check(lesson, ctx, allLessons);
      allIssues.push(...ruleIssues);
    } catch (e) {
      allIssues.push({
        id: `rule-execution-${rule.id}`,
        severity: 'error',
        message: `Validation rule crashed: ${(e as Error).message}`,
        filePath: ctx.filePath,
      });
    }
  }

  // Update compiler context issues
  ctx.issues = allIssues;
  return allIssues;
}
