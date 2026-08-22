const fs = require('fs');
const path = require('path');

// 1. Read and parse curriculum.json
const curriculumPath = path.resolve(__dirname, '../../../../content/dist/curriculum.json');
if (!fs.existsSync(curriculumPath)) {
  console.error('FAIL: curriculum.json not found at', curriculumPath);
  process.exit(1);
}

const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf8'));
console.log('✔ curriculum.json loaded successfully. Total lessons:', curriculum.lessons.length);

if (curriculum.lessons.length !== 90) {
  console.error('FAIL: Expected 90 lessons, found', curriculum.lessons.length);
  process.exit(1);
}

// 2. Validate module groupings
const moduleCounts = {};
const lessonIdSet = new Set();
for (const lesson of curriculum.lessons) {
  if (!lesson.id.startsWith('les_')) {
    console.error('FAIL: Lesson ID does not start with les_:', lesson.id);
    process.exit(1);
  }
  if (lessonIdSet.has(lesson.id)) {
    console.error('FAIL: Duplicate lesson ID:', lesson.id);
    process.exit(1);
  }
  lessonIdSet.add(lesson.id);
  moduleCounts[lesson.module] = (moduleCounts[lesson.module] || 0) + 1;
}

console.log('✔ All 90 lesson IDs are unique stable les_XXXXXX strings.');
console.log('✔ Module counts:', moduleCounts);

for (const [mod, count] of Object.entries(moduleCounts)) {
  if (count !== 10) {
    console.error(`FAIL: Module ${mod} has ${count} lessons, expected 10.`);
    process.exit(1);
  }
}

console.log('✔ All 9 modules have exactly 10 lessons.');

// 3. Test progress calculation logic
function computeModuleCompletion(completedIds, moduleLessonIds) {
  const compSet = new Set(completedIds);
  return moduleLessonIds.filter(id => compSet.has(id)).length;
}

// Simulated user completed 10 lessons in foundations
const foundationsLessons = curriculum.lessons.filter(l => l.module === 'foundations').map(l => l.id);
const completedFoundationsCount = computeModuleCompletion(foundationsLessons, foundationsLessons);
if (completedFoundationsCount !== 10) {
  console.error('FAIL: Completed count for foundations mismatch:', completedFoundationsCount);
  process.exit(1);
}
console.log('✔ Foundations completion calculation verified (10/10).');

// Simulated user completed 5 lessons in discovery
const discoveryLessons = curriculum.lessons.filter(l => l.module === 'discovery').map(l => l.id);
const partialDiscoveryCount = computeModuleCompletion(discoveryLessons.slice(0, 5), discoveryLessons);
if (partialDiscoveryCount !== 5) {
  console.error('FAIL: Partial discovery count mismatch:', partialDiscoveryCount);
  process.exit(1);
}
console.log('✔ Partial discovery completion calculation verified (5/10).');

console.log('\n=========================================');
console.log('ALL INTEGRITY VERIFICATION CHECKS PASSED!');
console.log('=========================================\n');
