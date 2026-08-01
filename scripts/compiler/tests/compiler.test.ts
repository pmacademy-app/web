import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateBlockId, getOrCreateLessonId } from '../registry';
import { validateCompiledLesson } from '../validation';
import { CompilerContext } from '../plugins/remark-plugins';
import { extractQuizBlock, extractFlashcardBlock } from '../plugins/extractors';

describe('PM Academy Content Compiler Test Suite', () => {
  
  describe('Stable ID Generator', () => {
    it('generates consistent lesson ID for path', () => {
      const path1 = 'content/lessons/lesson-001.md';
      const path2 = 'content/lessons/lesson-001.md';
      
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
  });
});
