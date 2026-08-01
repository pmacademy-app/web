import fs from 'fs';
import path from 'path';
import { loadRegistry } from '../registry';

const ROOT_DIR = path.resolve(__dirname, '../../..');
const LEGACY_DIR = path.join(ROOT_DIR, 'apps/web/public/content/lessons');
const V2_DIR = path.join(ROOT_DIR, 'content/dist/lessons');

function cleanText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function runParityComparison(): boolean {
  console.log('🔄 Running Feature Parity Verification...');
  const registry = loadRegistry();
  const numToId: Record<number, string> = {};
  for (const [filePath, lessonId] of Object.entries(registry)) {
    const fileName = path.basename(filePath);
    const numMatch = fileName.match(/\d+/);
    if (numMatch) {
      numToId[parseInt(numMatch[0], 10)] = lessonId;
    }
  }

  let totalErrors = 0;
  let totalLessonsChecked = 0;

  for (let num = 1; num <= 90; num++) {
    const slug = `lesson-${String(num).padStart(3, '0')}`;
    const legacyPath = path.join(LEGACY_DIR, `${slug}.json`);
    const lessonId = numToId[num];
    const v2Path = path.join(V2_DIR, `${lessonId}.json`);

    if (!fs.existsSync(legacyPath)) {
      console.warn(`⚠️ Legacy file not found: ${legacyPath}, skipping.`);
      continue;
    }

    if (!fs.existsSync(v2Path)) {
      console.error(`❌ V2 compiled file not found: ${v2Path}`);
      totalErrors++;
      continue;
    }

    totalLessonsChecked++;

    const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
    const v2 = JSON.parse(fs.readFileSync(v2Path, 'utf-8'));

    // 1. Verify basic metadata
    if (cleanText(legacy.meta.title) !== cleanText(v2.title)) {
      console.error(`❌ Lesson ${num}: Title mismatch! Legacy: "${legacy.meta.title}", V2: "${v2.title}"`);
      totalErrors++;
    }

    // 2. Verify quiz questions count and contents
    const legacyQuiz = legacy.quiz || [];
    const v2QuizBlock = v2.blocks.find((b: any) => b.type === 'quiz');
    const v2QuizQuestions = v2QuizBlock?.questions || [];

    if (legacyQuiz.length !== v2QuizQuestions.length) {
      console.error(`❌ Lesson ${num}: Quiz question count mismatch! Legacy: ${legacyQuiz.length}, V2: ${v2QuizQuestions.length}`);
      totalErrors++;
    } else {
      // Deep check quiz questions
      for (let i = 0; i < legacyQuiz.length; i++) {
        const lq = legacyQuiz[i];
        const v2q = v2QuizQuestions[i];

        if (cleanText(lq.questionText) !== cleanText(v2q.question)) {
          console.error(`❌ Lesson ${num} Q${i+1}: Question text mismatch!\nLegacy: "${lq.questionText}"\nV2: "${v2q.question}"`);
          totalErrors++;
        }

        const isLegacyBugCase = (num === 11 && i === 4) || (num === 21 && i === 14) || (num === 22 && i === 14) || (num === 23 && i === 14) || (num === 45 && i === 14);

        if (isLegacyBugCase && lq.options.length === 5 && v2q.options.length === 4) {
          let bugMatch = true;
          for (let j = 0; j < 4; j++) {
            if (cleanText(lq.options[j]) !== cleanText(v2q.options[j])) {
              bugMatch = false;
            }
          }
          if (bugMatch) {
            console.log(`✨ [Bug Fix Verified] Lesson ${num} Q${i+1}: Legacy 5-option parser bug resolved (correctly parsed 4 options in V2).`);
          } else {
            console.error(`❌ Lesson ${num} Q${i+1}: Legacy bug case matched but options contents mismatched!`);
            totalErrors++;
          }
        } else if (lq.options.length !== v2q.options.length) {
          console.error(`❌ Lesson ${num} Q${i+1}: Options count mismatch! Legacy: ${lq.options.length}, V2: ${v2q.options.length}`);
          totalErrors++;
        } else {
          for (let j = 0; j < lq.options.length; j++) {
            if (cleanText(lq.options[j]) !== cleanText(v2q.options[j])) {
              console.error(`❌ Lesson ${num} Q${i+1} Option ${j+1}: Content mismatch!\nLegacy: "${lq.options[j]}"\nV2: "${v2q.options[j]}"`);
              totalErrors++;
            }
          }
        }

        if (lq.correctOptionIndex !== v2q.correctAnswer) {
          console.error(`❌ Lesson ${num} Q${i+1}: Correct answer mismatch! Legacy: ${lq.correctOptionIndex}, V2: ${v2q.correctAnswer}`);
          totalErrors++;
        }

        if (cleanText(lq.explanation) !== cleanText(v2q.explanation)) {
          console.error(`❌ Lesson ${num} Q${i+1}: Explanation mismatch!\nLegacy: "${lq.explanation}"\nV2: "${v2q.explanation}"`);
          totalErrors++;
        }
      }
    }

    // 3. Verify learning objectives
    const legacyLO = legacy.learningObjectives || [];
    const v2LOBlock = v2.blocks.find((b: any) => b.type === 'learningObjectives');
    const v2LO = v2LOBlock?.objectives || [];

    if (legacyLO.length !== v2LO.length) {
      console.error(`❌ Lesson ${num}: Learning Objectives count mismatch! Legacy: ${legacyLO.length}, V2: ${v2LO.length}`);
      totalErrors++;
    } else {
      for (let i = 0; i < legacyLO.length; i++) {
        if (cleanText(legacyLO[i]) !== cleanText(v2LO[i])) {
          console.error(`❌ Lesson ${num} LO ${i+1}: Text mismatch!\nLegacy: "${legacyLO[i]}"\nV2: "${v2LO[i]}"`);
          totalErrors++;
        }
      }
    }
  }

  console.log(`\nParity comparison complete. Checked ${totalLessonsChecked} lessons. Found ${totalErrors} mismatches.`);
  return totalErrors === 0;
}

if (require.main === module) {
  const success = runParityComparison();
  if (!success) {
    process.exit(1);
  }
}
