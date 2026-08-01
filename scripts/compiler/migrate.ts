import fs from 'fs';
import path from 'path';
import { backfillRegistry, renameLessonInRegistry, loadRegistry } from './registry';

const ROOT_DIR = path.resolve(__dirname, '../..');
const SOURCE_DIR = path.join(ROOT_DIR, 'content/lessons');
const IDS_DIR = path.join(ROOT_DIR, 'content/.ids');
const LEGACY_MAP_PATH = path.join(IDS_DIR, 'legacy-id-map.json');

export function runMigration() {
  const args = process.argv.slice(2);

  if (args.includes('--backfill-ids')) {
    console.log('🔄 Backfilling lesson ID registry...');
    
    if (!fs.existsSync(SOURCE_DIR)) {
      console.error(`❌ Source directory ${SOURCE_DIR} not found.`);
      process.exit(1);
    }

    const files = fs
      .readdirSync(SOURCE_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(SOURCE_DIR, f));

    if (files.length === 0) {
      console.warn('⚠️ No markdown files found in content/lessons.');
      process.exit(0);
    }

    const { registry, legacyMap } = backfillRegistry(files);

    if (!fs.existsSync(IDS_DIR)) {
      fs.mkdirSync(IDS_DIR, { recursive: true });
    }

    fs.writeFileSync(LEGACY_MAP_PATH, JSON.stringify(legacyMap, null, 2), 'utf-8');
    
    console.log(`✅ Backfilled registry with ${Object.keys(registry).length} lessons.`);
    console.log(`✅ Emitted legacy ID map to ${LEGACY_MAP_PATH}`);
    process.exit(0);
  }

  if (args.includes('--rename')) {
    const renameIdx = args.indexOf('--rename');
    const oldPath = args[renameIdx + 1];
    const newPath = args[renameIdx + 2];

    if (!oldPath || !newPath) {
      console.error('❌ Error: --rename requires <old-path> and <new-path> arguments.');
      process.exit(1);
    }

    const success = renameLessonInRegistry(oldPath, newPath);
    if (!success) {
      process.exit(1);
    }
    process.exit(0);
  }

  console.log(`
ℹ️ PM Academy Migration CLI
Available commands:
  --backfill-ids       Scan source lessons and generate stable base36 IDs
  --rename <old> <new> Rename a lesson file path in the ID registry safely
  `);
}

if (require.main === module) {
  runMigration();
}
