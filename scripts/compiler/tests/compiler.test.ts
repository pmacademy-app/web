;
import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { generateBlockId, getOrCreateLessonId } from '../registry';
import { validateCompiledLesson } from '../validation';
import { CompilerContext } from '../plugins/remark-plugins';
import { extractQuizBlock, extractFlashcardBlock, mdastToBlocks } from '../plugins/extractors';
import { compileLesson, compileAllContent } from '../compile';
import { compileMermaidToSvg } from '../mermaid-svg';

describe('PM Academy Content Compiler Test Suite', () => {
  
  describe('Stable ID Generator', () => {
    it('generates consistent lesson ID for path', () => {
      const rootDir = path.resolve(__dirname, '../../..');
      const path1 = path.join(rootDir, 'content/lessons/lesson-001.md');
      const path2 = path.join(rootDir, 'content/lessons/lesson-001.md');
      
      const id1 = getOrCreateLessonId(path1);
      const id2 = getOrCreateLessonId(path2);
      
      assert.strictEqual(id1, id2);
      assert.match(id1, /^les_[a-z0-9]{6}$/);
    });

    it('generates deterministic and position-independent block IDs', () => {
      const lessonId = 'les_xyz123';
      const block1 = {
        type: 'paragraph',
        text: 'This is some text content for a paragraph.',
      };
      const block2 = {
        type: 'paragraph',
        text: 'This is some text content for a paragraph.',
      };
      
      const id1 = generateBlockId(lessonId, block1);
      const id2 = generateBlockId(lessonId, block2);
      
      assert.strictEqual(id1, id2);
      assert.strictEqual(id1.startsWith('blk_'), true);
    });
  });

  describe('Block Extractors', () => {
    it('compiles mermaid code fences to static SVG (no runtime mermaid path)', async () => {
      const node = {
        type: 'code',
        lang: 'mermaid',
        value: 'graph TD\n  A[Problem Statement] --> B[Understanding]',
        data: {
          mermaid: {
            source: 'graph TD\n  A[Problem Statement] --> B[Understanding]',
            normalized: 'graph TD\n  A[Problem Statement] --> B[Understanding]',
          },
        },
      };

      const blocks = await mdastToBlocks([node], 'les_test');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'mermaid');
      assert.ok(typeof blocks[0].svg === 'string' && blocks[0].svg.length > 0, 'expected compiled svg');
      assert.ok(blocks[0].svg.includes('<svg'), 'expected svg markup');
      assert.ok(blocks[0].svg.includes('Problem Statement'), 'expected node label in svg');
      assert.strictEqual(blocks[0].staticSvg, blocks[0].svg);
    });

    it('compiles top-level mental model / framework mermaid blocks to static SVG', async () => {
      const rootDir = path.resolve(__dirname, '../../..');
      const filePath = path.join(rootDir, 'content/lessons/lesson-004.md');
      const { lesson } = await compileLesson(filePath, { [filePath]: 'les_abc123' }, {});

      const mermaidBlocks = lesson.blocks.filter((b) => b.type === 'mermaid');
      assert.ok(mermaidBlocks.length > 0, 'expected at least one top-level mermaid block in lesson-004');

      for (const block of mermaidBlocks) {
        assert.ok(
          typeof block.svg === 'string' && block.svg.length > 0,
          `block ${block.blockId} missing static svg`
        );
        assert.ok(block.svg.includes('<svg'), `block ${block.blockId} svg is not valid markup`);
      }
    });

    it('extracts quiz questions correctly', () => {
      const mockQuizNodes = [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: '**1. What is product management?**\nA) Coding\nB) Decision making and value delivery\nC) Design\nD) Sales\n\n*Correct answer: B*\n*Explanation: PMs decide what to build and why.*\n*Learning objective tested: #1*\n*Difficulty: Easy*',
            }
          ]
        }
      ];

      const block = extractQuizBlock(mockQuizNodes, 'les_test', {
        filePath: 'test.md',
        lessonId: 'les_test',
        issues: [],
        assets: [],
        glossaryTerms: [],
      });

      assert.strictEqual(block.type, 'quiz');
      assert.strictEqual(block.questions.length, 1);
      assert.strictEqual(block.questions[0].question, 'What is product management?');
      assert.strictEqual(block.questions[0].correctAnswer, 1);
      assert.strictEqual(block.questions[0].difficulty, 'easy');
    });

    it('extracts flashcards correctly', () => {
      const mockFlashcardNodes = [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: '**Card 1**\n- Front: Question Front\n- Back: Answer Back\n- Difficulty: 1\n- Tags: tag1, tag2',
            }
          ]
        }
      ];

      const block = extractFlashcardBlock(mockFlashcardNodes, 'les_test', {
        filePath: 'test.md',
        lessonId: 'les_test',
        issues: [],
        assets: [],
        glossaryTerms: [],
      });

      assert.strictEqual(block.type, 'flashcardDeck');
      assert.strictEqual(block.cards.length, 1);
      assert.strictEqual(block.cards[0].front, 'Question Front');
      assert.strictEqual(block.cards[0].back, 'Answer Back');
      assert.strictEqual(block.cards[0].difficulty, 1);
      assert.deepStrictEqual(block.cards[0].tags, ['tag1', 'tag2']);
    });

    it('extracts flashcards correctly (new format)', () => {
      const mockFlashcardNodes = [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: '**Front:** What is the "who creates the value" test?\n**Back:** Ask who built...\n**Difficulty:** Easy\n**Tags:** #platform-thinking #diagnostic',
            }
          ]
        }
      ];

      const block = extractFlashcardBlock(mockFlashcardNodes, 'les_test', {
        filePath: 'test.md',
        lessonId: 'les_test',
        issues: [],
        assets: [],
        glossaryTerms: [],
      });

      assert.strictEqual(block.type, 'flashcardDeck');
      assert.strictEqual(block.cards.length, 1);
      assert.strictEqual(block.cards[0].front, 'What is the "who creates the value" test?');
      assert.strictEqual(block.cards[0].back, 'Ask who built...');
      assert.strictEqual(block.cards[0].difficulty, 'Easy');
      assert.deepStrictEqual(block.cards[0].tags, ['platform-thinking', 'diagnostic']);
    });
  });

  describe('Validator Registry', () => {
    it('catches invalid blocks and structural errors', () => {
      const invalidLesson = {
        id: 'les_test',
        title: 'Test Lesson',
        slug: 'test-lesson',
        blocks: [
          {
            type: 'invalidBlockType',
            blockId: 'blk_123',
          }
        ]
      };

      const ctx: CompilerContext = {
        filePath: 'test.md',
        lessonId: 'les_test',
        issues: [],
        assets: [],
        glossaryTerms: [],
      };

      const issues = validateCompiledLesson(invalidLesson, ctx);
      
      // Zod schema check should fail due to invalidBlockType
      const zodFailures = issues.filter((i) => i.id === 'zod-schema-validation');
      assert.strictEqual(zodFailures.length > 0, true);
      
      // Required blocks validator should trigger
      const requiredBlockFailures = issues.filter((i) => i.id === 'required-blocks');
      assert.strictEqual(requiredBlockFailures.length > 0, true);
    });

    it('catches missing flashcard deck', () => {
      const invalidLesson = {
        id: 'les_test',
        title: 'Test Lesson',
        slug: 'test-lesson',
        blocks: [
          {
            type: 'theory',
            blockId: 'blk_123',
            children: [],
          }
        ]
      };

      const ctx: CompilerContext = {
        filePath: 'test.md',
        lessonId: 'les_test',
        issues: [],
        assets: [],
        glossaryTerms: [],
      };

      const issues = validateCompiledLesson(invalidLesson, ctx);
      const flashcardFailures = issues.filter((i) => i.id === 'flashcard-deck-check');
      assert.strictEqual(flashcardFailures.length > 0, true);
    });

    it('rejects mermaid blocks that lack compiled static SVG', () => {
      const invalidLesson = {
        id: 'les_test',
        title: 'Test Lesson',
        slug: 'test-lesson',
        blocks: [
          {
            type: 'mermaid',
            blockId: 'blk_123',
            id: 'mer-1',
            source: 'graph TD\n  A --> B',
            normalized: 'graph TD\n  A --> B',
          },
          {
            type: 'theory',
            blockId: 'blk_456',
            children: [],
          }
        ]
      };

      const ctx: CompilerContext = {
        filePath: 'test.md',
        lessonId: 'les_test',
        issues: [],
        assets: [],
        glossaryTerms: [],
      };

      const issues = validateCompiledLesson(invalidLesson, ctx);
      const svgFailures = issues.filter((i) => i.id === 'mermaid-svg');
      assert.strictEqual(svgFailures.length > 0, true);
    });
  });

  describe('Mermaid static SVG rendering quality (real engine)', () => {
    it('emits valid responsive SVG with viewBox and max-width style', async () => {
      const sources = [
        'graph LR\n  A[Growth] --> B[Acquisition] --> C[Activation]',
        'graph TD\n  A[Start] --> B[Plan] --> C[Build] --> D[Measure]',
        'graph TD\n  A[Product Decision] --> B[Desirability User Want?]\n  A --> C[Feasibility Can Build?]\n  B --> D{PM Synthesizes}\n  C --> D\n  D --> E[Sound Decision]',
      ];
      for (const src of sources) {
        const svg = await compileMermaidToSvg(src);
        assert.ok(svg.includes('<svg'), `expected valid svg markup for: ${src}`);
        assert.ok(svg.includes('viewBox='), `expected viewBox attribute for: ${src}`);
        assert.ok(svg.includes('width: auto'), `expected natural-size width style for: ${src}`);
        assert.ok(svg.includes('role="img"'), `expected role="img" accessibility attribute for: ${src}`);
      }
    });

    it('is responsive and never forces horizontal overflow (no fixed min-width)', async () => {
      const wide = 'graph LR\n  A[Growth] --> B[Acquisition] --> C[Activation] --> D[Retention] --> E[Revenue] --> F[Referral] --> G[Product-Led] --> H[Expansion]';
      const svg = await compileMermaidToSvg(wide);
      assert.ok(!svg.includes('min-width'), 'min-width forces horizontal overflow');
      // Diagrams render at natural size (explicit width/height + width:auto) so text stays
      // readable; the MermaidBlock container scrolls horizontally when the diagram overflows.
      assert.ok(svg.includes('width="'), 'expected explicit natural width attribute');
      assert.ok(svg.includes('height="'), 'expected explicit natural height attribute');
      assert.ok(svg.includes('width: auto'), 'expected natural-size width style');
      assert.ok(svg.includes('height: auto') || svg.includes('height="100%"'), 'expected height auto/100%');
    });

    it('uses green/white design tokens for styling', async () => {
      const src = 'graph TD\n  A[Decision] --> B{Is the risk acceptable?} --> C[Proceed]';
      const svg = await compileMermaidToSvg(src);
      assert.ok(svg.includes('#166534') || svg.includes('#FFFFFF') || svg.includes('#EFF6F2') || svg.includes('#F4F0E6'), 'expected design token colors in svg');
    });

    it('correctly calculates multiline node dimensions and aspect ratio for labels with <br> tags', async () => {
      const src = `graph BT
    A[Weakest: Stated Preference, from an<br/>Unrepresentative, Self-selected Sample,<br/>Gathered with Leading Questions] --> B[Strong: Revealed Preference]`;
      const svg = await compileMermaidToSvg(src);
      assert.ok(svg.includes('<svg'), 'expected valid svg');
      const wMatch = svg.match(/width="([\d.]+)"/);
      assert.ok(wMatch, 'expected width attribute');
      const width = parseFloat(wMatch![1]);
      assert.ok(width < 900, `expected node box width to reflect line breaks (< 900px), got ${width}px`);
    });

    it('correctly calculates diamond shape polygon bounds and non-overlapping edge routing', async () => {
      const src = `graph TD
    A[Research Question] --> B{Why or How? Understanding<br/>Depth, Mental Models, Motivation}
    A --> C{How Many or How Much? Scale,<br/>Prevalence, Statistical Confidence}
    B --> D[Qualitative Methods]`;
      const svg = await compileMermaidToSvg(src);
      assert.ok(svg.includes('<svg'), 'expected valid svg');

      const matchA = svg.match(/id="[^"]*flowchart-A-[^"]*"[^>]*transform="translate\(\s*[\d.-]+\s*,\s*([\d.-]+)\s*\)"/);
      const matchB = svg.match(/id="[^"]*flowchart-B-[^"]*"[^>]*transform="translate\(\s*[\d.-]+\s*,\s*([\d.-]+)\s*\)"/);
      assert.ok(matchA && matchB, 'expected transform attributes for nodes A and B');
      const yA = parseFloat(matchA[1]);
      const yB = parseFloat(matchB[1]);
      assert.ok(yB - yA > 150, `expected rank separation > 150px between rect A and diamond B, got ${yB - yA}px`);
    });
  });

  describe('Markdown -> JSON Pipeline Regressions & Formatting Preservation', () => {
    it('extracts and preserves blockquote nodes', async () => {
      const mockBlockquoteNode = {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                value: 'A PM is accountable for outcomes that no single other function can be accountable for alone.',
              },
            ],
          },
        ],
      };

      const blocks = await mdastToBlocks([mockBlockquoteNode], 'les_test');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'blockquote');
      assert.strictEqual(
        blocks[0].text,
        'A PM is accountable for outcomes that no single other function can be accountable for alone.'
      );
      assert.ok(blocks[0].blockId.startsWith('blk_'));
    });

    it('preserves inline formatting (bold, italic, code) inside blockquotes', async () => {
      const mockFormattedBlockquote = {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'For ' },
              {
                type: 'strong',
                children: [{ type: 'text', value: '[target audience]' }],
              },
              { type: 'text', value: ', who ' },
              {
                type: 'emphasis',
                children: [{ type: 'text', value: '[statement of problem]' }],
              },
            ],
          },
        ],
      };

      const blocks = await mdastToBlocks([mockFormattedBlockquote], 'les_test');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'blockquote');
      assert.strictEqual(
        blocks[0].text,
        'For **[target audience]**, who *[statement of problem]*'
      );
    });

    it('preserves inline formatting (bold, italic, code) inside headings', async () => {
      const mockHeadingNode = {
        type: 'heading',
        depth: 3,
        children: [
          { type: 'text', value: 'The ' },
          {
            type: 'strong',
            children: [{ type: 'text', value: 'Core' }],
          },
          { type: 'text', value: ' Definition and ' },
          {
            type: 'inlineCode',
            value: 'PM',
          },
        ],
      };

      const blocks = await mdastToBlocks([mockHeadingNode], 'les_test');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'heading');
      assert.strictEqual(blocks[0].level, 3);
      assert.strictEqual(blocks[0].text, 'The **Core** Definition and `PM`');
    });

    it('distinguishes bold paragraphs from headings', async () => {
      const mockBoldParagraph = {
        type: 'paragraph',
        children: [
          {
            type: 'strong',
            children: [
              {
                type: 'text',
                value: 'A quadrant A classification at launch means high viability and high desirability.',
              },
            ],
          },
        ],
      };

      const blocks = await mdastToBlocks([mockBoldParagraph], 'les_test');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'paragraph');
      assert.strictEqual(
        blocks[0].text,
        '**A quadrant A classification at launch means high viability and high desirability.**'
      );
    });

    it('compiles lesson-001.md and verifies the famous blockquote is preserved', async () => {
      const rootDir = path.resolve(__dirname, '../../..');
      const filePath = path.join(rootDir, 'content/lessons/lesson-001.md');
      const { lesson } = await compileLesson(filePath, { [filePath]: 'les_001test' }, {});

      const theoryBlock = lesson.blocks.find((b: any) => b.type === 'theory');
      assert.ok(theoryBlock, 'lesson-001 must have a theory block');
      assert.ok(theoryBlock.children && theoryBlock.children.length > 0);

      const blockquote = theoryBlock.children.find((b: any) => b.type === 'blockquote');
      assert.ok(blockquote, 'lesson-001 theory block must contain the blockquote');
      assert.strictEqual(
        blockquote.text,
        'A PM is accountable for outcomes that no single other function can be accountable for alone.'
      );
    });

    it('validates that all lessons with blockquotes in source markdown retain blockquote blocks in JSON', async () => {
      const rootDir = path.resolve(__dirname, '../../..');
      const lessonsDir = path.join(rootDir, 'content/lessons');
      const fs = await import('fs');
      const files = fs.readdirSync(lessonsDir).filter((f) => f.endsWith('.md'));

      let totalBlockquotesFound = 0;

      for (const file of files) {
        const fullPath = path.join(lessonsDir, file);
        const mdSource = fs.readFileSync(fullPath, 'utf-8');

        // Check if file contains markdown blockquote lines (lines starting with '>')
        const hasBlockquoteInSource = /^>\s+/m.test(mdSource);
        if (hasBlockquoteInSource) {
          const { lesson } = await compileLesson(fullPath, { [fullPath]: `les_${file}` }, {});
          
          // Function to recursively search for blockquote blocks
          const findBlockquotes = (blocks: any[]): any[] => {
            const found: any[] = [];
            for (const b of blocks) {
              if (b.type === 'blockquote') found.push(b);
              if (b.children) found.push(...findBlockquotes(b.children));
            }
            return found;
          };

          const blockquotesInJson = findBlockquotes(lesson.blocks);
          assert.ok(
            blockquotesInJson.length > 0,
            `Lesson ${file} has blockquotes in markdown source but none in compiled blocks!`
          );
          totalBlockquotesFound += blockquotesInJson.length;
        }
      }

      assert.ok(
        totalBlockquotesFound >= 10,
        `Expected at least 10 blockquotes across the corpus, found ${totalBlockquotesFound}`
      );
    });
  });
});

