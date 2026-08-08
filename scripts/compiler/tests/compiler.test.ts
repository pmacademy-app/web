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
    it('compiles mermaid code fences to static SVG (no runtime mermaid path)', () => {
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

      const blocks = mdastToBlocks([node], 'les_test');
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'mermaid');
      assert.ok(typeof blocks[0].svg === 'string' && blocks[0].svg.length > 0, 'expected compiled svg');
      assert.ok(blocks[0].svg.includes('<svg'), 'expected svg markup');
      assert.ok(blocks[0].svg.includes('Problem Statement'), 'expected node label in svg');
      assert.strictEqual(blocks[0].staticSvg, blocks[0].svg);
    });

    it('compiles top-level mental model / framework mermaid blocks to static SVG', () => {
      const rootDir = path.resolve(__dirname, '../../..');
      const filePath = path.join(rootDir, 'content/lessons/lesson-004.md');
      const { lesson } = compileLesson(filePath, { [filePath]: 'les_abc123' }, {});

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

  describe('Mermaid static SVG rendering quality', () => {
    const textWidth = (text: string, fontSize: number) => Array.from(text).length * fontSize * 0.6 + 1;

    function parseSvgGeometry(svg: string) {
      // Node shapes are emitted as either <rect> or <polygon> (rhombus), one per
      // node, in the same document order as the matching <text> elements.
      const shapes = [...svg.matchAll(/<(rect|polygon)\b([^>]*?)class="m-node[^"]*"/g)].map((m) => {
        const attrs = m[2];
        if (m[1] === 'rect') {
          const x = +attrs.match(/x="([\d.-]+)"/)![1];
          const y = +attrs.match(/y="([\d.-]+)"/)![1];
          const width = +attrs.match(/width="([\d.-]+)"/)![1];
          const height = +attrs.match(/height="([\d.-]+)"/)![1];
          return { x, y, width, height };
        }
        const pts = attrs.match(/points="([^"]*)"/)![1].trim().split(/\s+/).map((p) => p.split(',').map(Number));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
      });
      const texts = [...svg.matchAll(/<text x="([\d.-]+)"[^>]*class="m-text"[^>]*>(.*?)<\/text>/g)].map((m) =>
        [...m[2].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((t) => t[1])
      );
      const vb = svg.match(/viewBox="([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+)"/);
      const font = svg.match(/\.m-text \{[^}]*font-size: ([\d.]+)px/);
      const labelFont = svg.match(/\.m-label \{[^}]*font-size: ([\d.]+)px/);
      const style = svg.match(/<svg[^>]*style="([^"]*)"/);
      return { rects: shapes, texts, viewBox: vb ? { x: +vb[1], y: +vb[2], width: +vb[3], height: +vb[4] } : null, font: font?.[1], labelFont: labelFont?.[1], style: style?.[1] };
    }

    it('emits a consistent base font size across diagrams', () => {
      const sources = [
        'graph LR\n  A[Growth] --> B[Acquisition] --> C[Activation] --> D[Retention] --> E[Revenue] --> F[Referral]',
        'graph TD\n  A[Start] --> B[Plan] --> C[Build] --> D[Measure] --> E[Learn] --> F[Loop]',
        'graph TD\n  A[Very long node label that should wrap onto multiple lines without overflowing the box] --> B[X]',
      ];
      for (const src of sources) {
        const { font, labelFont } = parseSvgGeometry(compileMermaidToSvg(src));
        assert.strictEqual(font, '14', `expected 14px node font for: ${src}`);
        assert.strictEqual(labelFont, '11.5', `expected 11.5px label font for: ${src}`);
      }
    });

    it('is responsive and never forces horizontal overflow (no fixed min-width)', () => {
      const wide = 'graph LR\n  A[Growth] --> B[Acquisition] --> C[Activation] --> D[Retention] --> E[Revenue] --> F[Referral] --> G[Product-Led] --> H[Expansion]';
      const { style } = parseSvgGeometry(compileMermaidToSvg(wide));
      assert.ok(style, 'expected inline width style');
      assert.ok(!style.includes('min-width'), `min-width forces horizontal overflow: ${style}`);
      assert.ok(style.includes('max-width:100%'), 'expected responsive max-width:100%');
      assert.ok(style.includes('height:auto'), 'expected height:auto');
    });

    it('sizes node boxes to fit their wrapped text (no clipping)', () => {
      const sources = [
        'graph TD\n  A[Start] --> B[Plan] --> C[Build] --> D[Measure] --> E[Learn] --> F[Loop]',
        'graph LR\n  A[Growth] --> B[Acquisition] --> C[Activation] --> D[Retention] --> E[Revenue] --> F[Referral]',
        'graph TD\n  A[User research, competitive analysis, and continuous discovery form the evidence base for every product decision] --> B[Validate]',
        'graph TD\n  A[Supercalifragilisticexpialidocious] --> B[X]',
        'graph TD\n  A[Decision] --> B{Is the risk acceptable?} --> C[Proceed]',
      ];
      for (const src of sources) {
        const { rects, texts } = parseSvgGeometry(compileMermaidToSvg(src));
        assert.ok(rects.length > 0 && texts.length === rects.length, `rect/text count mismatch for: ${src}`);
        for (let i = 0; i < rects.length; i++) {
          const maxLine = Math.max(...texts[i].map((t) => textWidth(t, 14)));
          assert.ok(
            maxLine + 40 <= rects[i].width + 0.001,
            `text (${maxLine.toFixed(1)}px) overflows node box (${rects[i].width}px) in: ${src}`
          );
        }
      }
    });

    it('contains all node content within the SVG viewBox (no clipping)', () => {
      const sources = [
        'graph TD\n  A[Start] --> B[Plan] --> C[Build] --> D[Measure] --> E[Learn] --> F[Loop]',
        'graph LR\n  A[Growth] --> B[Acquisition] --> C[Activation] --> D[Retention] --> E[Revenue] --> F[Referral] --> G[Product-Led] --> H[Expansion]',
      ];
      for (const src of sources) {
        const { rects, viewBox } = parseSvgGeometry(compileMermaidToSvg(src));
        assert.ok(viewBox, 'expected viewBox');
        for (const r of rects) {
          assert.ok(r.x >= viewBox.x - 0.001, `node left edge outside viewBox: ${src}`);
          assert.ok(r.y >= viewBox.y - 0.001, `node top edge outside viewBox: ${src}`);
          assert.ok(r.x + r.width <= viewBox.x + viewBox.width + 0.001, `node right edge outside viewBox: ${src}`);
          assert.ok(r.y + r.height <= viewBox.y + viewBox.height + 0.001, `node bottom edge outside viewBox: ${src}`);
        }
      }
    });
  });
});
