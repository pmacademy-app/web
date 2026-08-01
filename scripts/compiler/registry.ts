import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const REGISTRY_DIR = path.resolve(__dirname, '../../content/.ids');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'lesson-id-registry.json');

export type RegistryMap = Record<string, string>; // filePath -> lessonId

let registry: RegistryMap = {};

// Helper to normalize paths to forward slashes for cross-OS stability in Git
export function normalizePath(p: string): string {
  // Make it relative to root to avoid absolute path differences
  const rootPath = path.resolve(__dirname, '../..');
  const absolutePath = path.resolve(p);
  const relativePath = path.relative(rootPath, absolutePath);
  return relativePath.replace(/\\/g, '/');
}

export function loadRegistry(): RegistryMap {
  if (fs.existsSync(REGISTRY_PATH)) {
    try {
      registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ Warning: Failed to parse lesson-id-registry.json, starting fresh.', e);
      registry = {};
    }
  } else {
    registry = {};
  }
  return registry;
}

export function saveRegistry(): void {
  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  }
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

function generateRandomBase36(length: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    result += chars[randomIndex];
  }
  return result;
}

export function getOrCreateLessonId(filePath: string): string {
  const normalized = normalizePath(filePath);
  loadRegistry();

  if (registry[normalized]) {
    return registry[normalized];
  }

  // Generate new stable ID: les_ + 6 random base36 characters
  let newId: string;
  const existingIds = new Set(Object.values(registry));
  do {
    newId = `les_${generateRandomBase36(6)}`;
  } while (existingIds.has(newId));

  registry[normalized] = newId;
  saveRegistry();
  return newId;
}

export function renameLessonInRegistry(oldPath: string, newPath: string): boolean {
  const normalizedOld = normalizePath(oldPath);
  const normalizedNew = normalizePath(newPath);
  loadRegistry();

  if (!registry[normalizedOld]) {
    console.error(`❌ Error: Path ${normalizedOld} not found in registry.`);
    return false;
  }

  const lessonId = registry[normalizedOld];
  delete registry[normalizedOld];
  registry[normalizedNew] = lessonId;
  saveRegistry();
  console.log(`✅ Renamed registry entry: ${normalizedOld} -> ${normalizedNew} (ID: ${lessonId})`);
  return true;
}

export function backfillRegistry(lessonFiles: string[]): { registry: RegistryMap; legacyMap: Record<string, string> } {
  loadRegistry();
  const legacyMap: Record<string, string> = {}; // lesson-NNN -> les_xxxxxx

  // Sort files by name to ensure numerical ordering backfills correspond to logical order
  const sortedFiles = [...lessonFiles].sort();

  for (const file of sortedFiles) {
    const normalized = normalizePath(file);
    const fileName = path.basename(file);
    const numMatch = fileName.match(/\d+/);
    const lessonNumber = numMatch ? parseInt(numMatch[0], 10) : 1;
    const legacySlug = `lesson-${String(lessonNumber).padStart(3, '0')}`;

    const lessonId = getOrCreateLessonId(file);
    legacyMap[legacySlug] = lessonId;
  }

  saveRegistry();
  return { registry, legacyMap };
}

/**
 * Generates a stable blockId based on the content of the block.
 * To ensure stability across unrelated edits, we hash only the block's core data fields.
 */
export function generateBlockId(lessonId: string, block: Record<string, any>): string {
  // Create a copy without blockId and children/diagram references (since they have their own IDs)
  const blockCopy = { ...block };
  delete blockCopy.blockId;
  delete blockCopy.children;
  delete blockCopy.diagram;

  // For container blocks that contain other elements, we serialize their structural parameters (e.g. titles, metadata)
  const dataToHash = JSON.stringify({
    lessonId,
    type: block.type,
    content: blockCopy,
  });

  const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
  // Use first 8 characters of sha256 hex
  return `blk_${hash.slice(0, 10)}`;
}
