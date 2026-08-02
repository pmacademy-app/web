import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';

import {
  CompilerContext,
  remarkNormalizeWhitespace,
  remarkMermaidExtract,
  remarkAssetResolve,
  remarkHeadingIds,
  remarkA11yLint,
  ValidationIssue,
} from './plugins/remark-plugins';
import {
  segmentByH2,
  parseTableNode,
  toMarkdown,
  mdastToBlocks,
  extractQuizBlock,
  extractFlashcardBlock,
  extractGlossaryBlock,
  extractConnectionsBlock,
  extractCommonMistakesBlock,
  extractRealWorldPerspectiveBlock,
  extractInterviewPerspectiveBlock,
} from './plugins/extractors';
import { getOrCreateLessonId, loadRegistry, normalizePath, generateBlockId } from './registry';
import { validateCompiledLesson } from './validation';
import { RawLearningPathMetadataSchema, ParsedLessonMetadataSchema } from './schema/lesson-metadata.schema';

const ROOT_DIR = path.resolve(__dirname, '../..');
const SOURCE_DIR = path.join(ROOT_DIR, 'content/lessons');
const DIST_DIR = path.join(ROOT_DIR, 'content/dist');
const DIST_LESSONS_DIR = path.join(DIST_DIR, 'lessons');
const CACHE_MANIFEST_PATH = path.join(ROOT_DIR, 'content/.cache/manifest.json');

interface CacheManifest {
  version: string;
  files: Record<string, {
    sourceHash: string;
    outputHash: string;
  }>;
}

export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function compileLesson(
  filePath: string,
  registry: Record<string, string>,
  numToId: Record<number, string>
): { lesson: any; context: CompilerContext } {
  const sourceContent = fs.readFileSync(filePath, 'utf-8');
  const lessonId = getOrCreateLessonId(filePath);

  const ctx: CompilerContext = {
    filePath,
    lessonId,
    issues: [],
    assets: [],
    glossaryTerms: [],
  };

  // 1. Parse markdown into MDAST
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkNormalizeWhitespace)
    .use(remarkMermaidExtract, ctx)
    .use(remarkAssetResolve, ctx)
    .use(remarkHeadingIds)
    .use(remarkA11yLint, ctx);

  const mdast = processor.parse(sourceContent);
  const transformedAst = processor.runSync(mdast);

  // 2. Segment document by H2 headings
  const segments = segmentByH2(transformedAst);

  // 3. Extract Front Matter and Title
  const titleNode = (transformedAst.children || []).find((n: any) => n.type === 'heading' && n.depth === 1);
  let title = 'Untitled Lesson';
  if (titleNode) {
    let tText = '';
    visitText(titleNode, (v) => { tText += v; });
    title = tText.replace(/^Lesson\s+\d+:\s*/i, '').trim();
  }

  // Find the slug from filename
  const fileName = path.basename(filePath, '.md');
  const numMatch = fileName.match(/\d+/);
  const lessonNumber = numMatch ? parseInt(numMatch[0], 10) : 1;
  const slug = fileName;

  // Extract metadata from the Learning Path table segment
  const learningPathSegment = segments.find((s) => s.heading.toLowerCase().includes('learning path'));
  let metadata: any = {
    module: 'foundations',
    order: lessonNumber,
    totalInModule: 90,
    difficulty: 1,
    estimatedReadingTime: 25,
    estimatedCompletionTime: 35,
    prerequisites: [],
  };

  let prerequisitesRaw = 'None';
  let nextLessonRaw = '';
  let futureTopicsUnlockedRaw = '';

  if (learningPathSegment) {
    const tableNode = learningPathSegment.nodes.find((n) => n.type === 'table');
    if (tableNode) {
      const rawMeta = parseTableNode(tableNode);
      
      // Map raw keys to schema expected labels
      const moduleStr = rawMeta['Module'] || '1 — Foundations';
      const currentStr = rawMeta['Current Lesson'] || `${lessonNumber} of 90`;
      const diffStr = rawMeta['Difficulty'] || '1 / 10';
      const timeStr = rawMeta['Estimated Study Time'] || '25 minutes (reading) + 10 minutes';
      prerequisitesRaw = rawMeta['Prerequisites'] || 'None';
      nextLessonRaw = rawMeta['Next Lesson'] || '';
      futureTopicsUnlockedRaw = rawMeta['Future Topics Unlocked'] || '';

      // Parse current lesson, order, difficulty, and study times
      const currentLessonParts = currentStr.split(/\s+of\s+/i);
      const order = parseInt(currentLessonParts[0], 10) || lessonNumber;
      const totalInModule = parseInt(currentLessonParts[1], 10) || 90;

      const diffVal = parseInt(diffStr.split('/')[0].trim(), 10) || 1;

      const estReadMatch = timeStr.match(/(\d+)\s*minutes?\s*\(reading\)/i) || timeStr.match(/(\d+)\s*minutes?/);
      const estimatedReadingTime = estReadMatch ? parseInt(estReadMatch[1], 10) : 25;

      const estReflectMatch = timeStr.match(/(\d+)\s*minutes?\s*\(reflection/i) || timeStr.match(/\+\s*(\d+)\s*minutes?/);
      const estMinutesReflection = estReflectMatch ? parseInt(estReflectMatch[1], 10) : 10;
      const estimatedCompletionTime = estimatedReadingTime + estMinutesReflection;

      // Resolve canonical module slug based on the module number
      const modNumMatch = moduleStr.match(/^\s*(\d+)/);
      const modNumber = modNumMatch ? parseInt(modNumMatch[1], 10) : Math.ceil(order / 10);
      
      const moduleMap: Record<number, string> = {
        1: 'foundations',
        2: 'discovery',
        3: 'design',
        4: 'execution',
        5: 'growth',
        6: 'leadership',
        7: 'technical',
        8: 'strategy',
        9: 'capstone',
      };
      
      const moduleSlug = moduleMap[modNumber] || 'foundations';

      metadata = {
        module: moduleSlug,
        order,
        totalInModule,
        difficulty: diffVal,
        estimatedReadingTime,
        estimatedCompletionTime,
        prerequisites: [],
      };
    }
  }

  // Parse prerequisites: resolve lesson references to IDs
  if (prerequisitesRaw && prerequisitesRaw.toLowerCase() !== 'none') {
    const pMatches = prerequisitesRaw.match(/\bLesson\s+(\d+)\b/gi) || prerequisitesRaw.match(/\b\d+\b/g);
    if (pMatches) {
      for (const match of pMatches) {
        const num = parseInt(match.replace(/[^\d]/g, ''), 10);
        if (num && numToId[num]) {
          metadata.prerequisites.push(numToId[num]);
        }
      }
    }
  }

  // 4. Extract blocks for all segments
  const blocks: any[] = [];
  const searchableTextParts: string[] = [];

  for (const segment of segments) {
    const headingLower = segment.heading.toLowerCase();

    // Skip the learning path metadata segment from inline block rendering since it's now root-level lesson metadata
    if (headingLower.includes('learning path')) {
      continue;
    }

    if (headingLower.includes('learning objectives')) {
      const objectives: string[] = [];
      const listNode = segment.nodes.find((n) => n.type === 'list');
      if (listNode) {
        for (const item of listNode.children || []) {
          objectives.push(toMarkdown(item).trim());
        }
      }
      const block: any = {
        type: 'learningObjectives',
        objectives,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      searchableTextParts.push(...objectives);
    } else if (headingLower === 'theory') {
      const children = mdastToBlocks(segment.nodes, lessonId);
      const block: any = {
        type: 'theory',
        children,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      collectSearchableText(children, searchableTextParts);
    } else if (headingLower.includes('common mistakes') || headingLower.includes('beginner mistakes')) {
      const block = extractCommonMistakesBlock(segment.nodes, lessonId);
      blocks.push(block);
      block.mistakes?.forEach((m: any) => {
        searchableTextParts.push(m.title, m.body);
      });
    } else if (headingLower.includes('mental model')) {
      const titleMatch = segment.heading.match(/Mental Model:\s*(.*)/i);
      const mmTitle = titleMatch ? titleMatch[1].trim() : 'Mental Model';
      const children = mdastToBlocks(segment.nodes.filter((n) => !(n.type === 'code' && n.lang === 'mermaid')), lessonId);
      
      const mermaidNode = segment.nodes.find((n) => n.type === 'code' && n.lang === 'mermaid');
      let diagram: any = undefined;
      if (mermaidNode) {
        diagram = {
          blockId: `mer-${lessonId}`,
          type: 'mermaid',
        };
        // Build and push the actual mermaid block separately in child blocks
        const mBlock: any = {
          type: 'mermaid',
          id: `mer-${lessonId}`,
          source: mermaidNode.value,
          normalized: mermaidNode.data?.mermaid?.normalized || mermaidNode.value,
          authorTheme: mermaidNode.data?.mermaid?.authorTheme,
        };
        mBlock.blockId = getOrCreateBlockId(lessonId, mBlock);
        mBlock.id = mBlock.blockId;
        diagram.blockId = mBlock.blockId;
        blocks.push(mBlock);
      }

      const block: any = {
        type: 'mentalModel',
        name: mmTitle,
        diagram,
        children,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      searchableTextParts.push(mmTitle);
      collectSearchableText(children, searchableTextParts);
    } else if (headingLower.includes('company example') || headingLower.includes('real company example')) {
      // Find the first bold word in paragraphs to treat as company name, or heading text
      let company = 'Spotify';
      const firstPara = segment.nodes.find((n) => n.type === 'paragraph');
      if (firstPara) {
        const textStr = toMarkdown(firstPara);
        const boldMatch = textStr.match(/^\*\*([^*]+)\*\*/);
        if (boldMatch) {
          company = boldMatch[1].trim();
        }
      }
      
      // Parse assumption flags
      const assumptionFlags: string[] = [];
      const nonAssumptionNodes = segment.nodes.filter((n) => {
        const str = toMarkdown(n);
        const match = str.match(/\(Assumption flagged:\s*(.*?)\)/i) || str.match(/\*\(Assumption flagged:\s*(.*?)\)\*/i);
        if (match) {
          assumptionFlags.push(match[1].trim());
          return false;
        }
        return true;
      });

      const children = mdastToBlocks(nonAssumptionNodes, lessonId);
      const block: any = {
        type: 'companyExample',
        company,
        children,
        assumptionFlags: assumptionFlags.length > 0 ? assumptionFlags : undefined,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      searchableTextParts.push(company);
      collectSearchableText(children, searchableTextParts);
    } else if (headingLower.includes('real world perspective')) {
      const block = extractRealWorldPerspectiveBlock(segment.nodes, lessonId);
      blocks.push(block);
      block.segments?.forEach((s: any) => {
        searchableTextParts.push(s.context, s.body);
      });
    } else if (headingLower.includes('case study')) {
      const titleMatch = segment.heading.match(/(?:Detailed\s+)?Case Study:\s*(.*)/i);
      const csTitle = titleMatch ? titleMatch[1].trim() : 'Case Study';
      const children = mdastToBlocks(segment.nodes, lessonId);
      const block: any = {
        type: 'caseStudy',
        title: csTitle,
        children,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      searchableTextParts.push(csTitle);
      collectSearchableText(children, searchableTextParts);
    } else if (headingLower.includes('framework')) {
      const titleMatch = segment.heading.match(/(?:Framework\s+Explanation|Framework):\s*(.*)/i);
      const fwTitle = titleMatch ? titleMatch[1].trim() : 'Framework';
      const children = mdastToBlocks(segment.nodes.filter((n) => !(n.type === 'code' && n.lang === 'mermaid')), lessonId);

      const mermaidNode = segment.nodes.find((n) => n.type === 'code' && n.lang === 'mermaid');
      let diagram: any = undefined;
      if (mermaidNode) {
        diagram = {
          blockId: `mer-fw-${lessonId}`,
          type: 'mermaid',
        };
        // Build and push actual mermaid block
        const mBlock: any = {
          type: 'mermaid',
          id: `mer-fw-${lessonId}`,
          source: mermaidNode.value,
          normalized: mermaidNode.data?.mermaid?.normalized || mermaidNode.value,
          authorTheme: mermaidNode.data?.mermaid?.authorTheme,
        };
        mBlock.blockId = getOrCreateBlockId(lessonId, mBlock);
        mBlock.id = mBlock.blockId;
        diagram.blockId = mBlock.blockId;
        blocks.push(mBlock);
      }

      const block: any = {
        type: 'framework',
        name: fwTitle,
        diagram,
        children,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      searchableTextParts.push(fwTitle);
      collectSearchableText(children, searchableTextParts);
    } else if (headingLower.includes('interview perspective')) {
      const block = extractInterviewPerspectiveBlock(segment.nodes, lessonId);
      blocks.push(block);
      block.questions?.forEach((q: any) => {
        searchableTextParts.push(q.question, q.whatItEvaluates);
      });
    } else if (headingLower === 'summary') {
      const children = mdastToBlocks(segment.nodes, lessonId);
      const block: any = {
        type: 'summary',
        children,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      collectSearchableText(children, searchableTextParts);
    } else if (headingLower.includes('key takeaways')) {
      const items: string[] = [];
      const listNode = segment.nodes.find((n) => n.type === 'list');
      if (listNode) {
        for (const item of listNode.children || []) {
          items.push(toMarkdown(item).trim());
        }
      }
      const block: any = {
        type: 'keyTakeaways',
        items,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      searchableTextParts.push(...items);
    } else if (headingLower.includes('cheat sheet')) {
      const items: string[] = [];
      const listNode = segment.nodes.find((n) => n.type === 'list');
      if (listNode) {
        for (const item of listNode.children || []) {
          items.push(toMarkdown(item).trim());
        }
      } else {
        // Collect paragraphs as items
        segment.nodes.forEach((node) => {
          if (node.type === 'paragraph') items.push(toMarkdown(node).trim());
        });
      }
      const block: any = {
        type: 'cheatSheet',
        items,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      searchableTextParts.push(...items);
    } else if (headingLower.includes('glossary')) {
      const block = extractGlossaryBlock(segment.nodes, lessonId, ctx);
      blocks.push(block);
      block.entries?.forEach((e: any) => {
        searchableTextParts.push(e.term, e.definition);
      });
    } else if (headingLower.includes('resources') || headingLower.includes('further reading')) {
      const items: any[] = [];
      const listNode = segment.nodes.find((n) => n.type === 'list');
      if (listNode) {
        for (const item of listNode.children || []) {
          const rawText = toMarkdown(item).trim();
          // Resource link matches: - [Title](URL) — note
          const parts = rawText.split(/\s*[-—]\s*/);
          const citation = parts[0].trim();
          const note = parts.slice(1).join(' — ').trim();
          items.push({
            citation,
            note: note.length > 0 ? note : undefined,
          });
          searchableTextParts.push(citation, note);
        }
      }
      const block: any = {
        type: 'resources',
        items,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
    } else if (headingLower.includes('flashcards')) {
      const block = extractFlashcardBlock(segment.nodes, lessonId, ctx);
      blocks.push(block);
      block.cards?.forEach((c: any) => {
        searchableTextParts.push(c.front, c.back);
      });
    } else if (headingLower.includes('reflection')) {
      const prompts: string[] = [];
      segment.nodes.forEach((n) => {
        if (n.type === 'paragraph') {
          prompts.push(toMarkdown(n).trim());
        } else if (n.type === 'list') {
          for (const item of n.children || []) {
            prompts.push(toMarkdown(item).trim());
          }
        }
      });
      const block: any = {
        type: 'reflection',
        prompts,
      };
      block.blockId = getOrCreateBlockId(lessonId, block);
      blocks.push(block);
      searchableTextParts.push(...prompts);
    } else if (headingLower.includes('quiz')) {
      const block = extractQuizBlock(segment.nodes, lessonId, ctx);
      blocks.push(block);
      block.questions?.forEach((q: any) => {
        searchableTextParts.push(q.question, q.explanation);
      });
    } else if (headingLower.includes('connections')) {
      const block = extractConnectionsBlock(segment.nodes, lessonId, ctx);
      
      // Resolve Connection target IDs using numToId map
      if (block.previous && block.previous.id === 'placeholder_prev') {
        const prevNum = lessonNumber - 1;
        if (numToId[prevNum]) block.previous.id = numToId[prevNum];
      }
      if (block.next && block.next.id === 'placeholder_next') {
        const nextNum = lessonNumber + 1;
        if (numToId[nextNum]) block.next.id = numToId[nextNum];
      }
      block.unlocks?.forEach((u: any) => {
        const idParts = u.lesson.id.split('_');
        const num = parseInt(idParts[idParts.length - 1], 10);
        if (num && numToId[num]) {
          u.lesson.id = numToId[num];
        }
      });

      blocks.push(block);
    } else {
      // Treat any other custom section as a theory sub-block or callout if matching callout syntax
      const children = mdastToBlocks(segment.nodes, lessonId);
      if (children.length > 0) {
        // Just push them as generic blocks in the lesson body
        blocks.push(...children);
        collectSearchableText(children, searchableTextParts);
      }
    }
  }

  // Populate actual connections details in the Lesson JSON
  const headingList = segments.map((s) => s.heading);

  const searchableText = searchableTextParts.join(' ').replace(/\s+/g, ' ').trim();

  // Create full lesson output
  const lessonObj: any = {
    schemaVersion: 2,
    id: lessonId,
    contentHash: 'hash_placeholder', // to be computed on stringified body
    title,
    slug,
    module: metadata.module,
    order: metadata.order,
    totalInModule: metadata.totalInModule,
    difficulty: metadata.difficulty,
    estimatedReadingTime: metadata.estimatedReadingTime,
    estimatedCompletionTime: metadata.estimatedCompletionTime,
    prerequisites: metadata.prerequisites,
    sourceFile: normalizePath(filePath),
    blocks,
    assets: ctx.assets.map((a) => ({
      assetId: a.assetId,
      sourcePath: a.sourcePath,
      hash: a.hash,
    })),
    searchable: {
      plainText: searchableText,
      headings: headingList,
    },
    glossaryTermsIntroduced: ctx.glossaryTerms.map((t) => t.term),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  lessonObj.contentHash = computeHash(JSON.stringify(lessonObj.blocks));

  return { lesson: lessonObj, context: ctx };
}

function getOrCreateBlockId(lessonId: string, block: Record<string, any>): string {
  return generateBlockId(lessonId, block);
}

function collectSearchableText(blocks: any[], target: string[]) {
  for (const block of blocks) {
    if (block.text) {
      target.push(block.text);
    }
    if (block.items) {
      target.push(...block.items);
    }
    if (block.children) {
      collectSearchableText(block.children, target);
    }
  }
}

function visitText(node: any, callback: (v: string) => void) {
  if (node.type === 'text') {
    callback(node.value);
  }
  if (node.children) {
    for (const child of node.children) {
      visitText(child, callback);
    }
  }
}

function loadCacheManifest(): CacheManifest {
  if (fs.existsSync(CACHE_MANIFEST_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_MANIFEST_PATH, 'utf-8'));
    } catch {
      // ignore
    }
  }
  return { version: '2', files: {} };
}

function saveCacheManifest(manifest: CacheManifest) {
  const cacheDir = path.dirname(CACHE_MANIFEST_PATH);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  fs.writeFileSync(CACHE_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function compileAllContent(validateOnly = false): boolean {
  console.log('🚀 Running PM Academy Content Compiler v2...');
  
  if (!fs.existsSync(DIST_LESSONS_DIR)) {
    fs.mkdirSync(DIST_LESSONS_DIR, { recursive: true });
  }

  // Load registry and build backfill indices
  const registryMap = loadRegistry();
  const numToId: Record<number, string> = {};
  for (const [filePath, lessonId] of Object.entries(registryMap)) {
    const fileName = path.basename(filePath);
    const numMatch = fileName.match(/\d+/);
    if (numMatch) {
      numToId[parseInt(numMatch[0], 10)] = lessonId;
    }
  }

  // Scan source files
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(SOURCE_DIR, f))
    .sort();

  // Load build cache
  const cache = loadCacheManifest();
  const compiledLessons: any[] = [];
  const errorsReport: ValidationIssue[] = [];
  const warningsReport: ValidationIssue[] = [];
  
  let hasErrors = false;

  console.log(`Scanning ${files.length} source lessons...`);

  // First pass: verify and compile files
  for (const file of files) {
    const relativePath = normalizePath(file);
    const fileContent = fs.readFileSync(file, 'utf-8');
    const sourceHash = computeHash(fileContent);

    const cached = cache.files[relativePath];
    const lessonId = getOrCreateLessonId(file);
    const outputPath = path.join(DIST_LESSONS_DIR, `${lessonId}.json`);

    // Check cache: if hash matches and target JSON exists on disk, we can reuse it
    if (cached && cached.sourceHash === sourceHash && fs.existsSync(outputPath)) {
      try {
        const cachedJson = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        compiledLessons.push(cachedJson);
        continue; // Cache hit!
      } catch {
        // Fallback to compile
      }
    }

    // Compile
    try {
      const { lesson, context } = compileLesson(file, registryMap, numToId);
      
      // Validate
      const issues = validateCompiledLesson(lesson, context);
      const fileErrors = issues.filter((i) => i.severity === 'error');
      const fileWarnings = issues.filter((i) => i.severity === 'warning');

      errorsReport.push(...fileErrors);
      warningsReport.push(...fileWarnings);

      if (fileWarnings.length > 0) {
        console.warn(`⚠️ ${relativePath}: Compiled with ${fileWarnings.length} validation warnings.`);
        fileWarnings.forEach((w) => console.warn(`   - [${w.id}] Line ${w.line || 'unknown'}: ${w.message}`));
      }

      if (fileErrors.length > 0) {
        console.error(`❌ ${relativePath}: Compiled with ${fileErrors.length} validation errors.`);
        fileErrors.forEach((e) => console.error(`   - [${e.id}] Line ${e.line || 'unknown'}: ${e.message}`));
        hasErrors = true;
        // Do not push / emit this lesson
      } else {
        compiledLessons.push(lesson);
        
        if (!validateOnly) {
          // Emit JSON output
          fs.writeFileSync(outputPath, JSON.stringify(lesson, null, 2), 'utf-8');
          // Update cache manifest
          cache.files[relativePath] = {
            sourceHash,
            outputHash: computeHash(JSON.stringify(lesson)),
          };
        }
      }
    } catch (e) {
      console.error(`💥 Fatal error compiling ${relativePath}:`, e);
      hasErrors = true;
    }
  }

  // Second pass: cross-lesson referential validation
  console.log('🔍 Running cross-lesson validations...');
  for (const lesson of compiledLessons) {
    const relativePath = lesson.sourceFile;
    
    const context: CompilerContext = {
      filePath: lesson.sourceFile,
      lessonId: lesson.id,
      issues: [],
      assets: [],
      glossaryTerms: [],
    };
    
    const issues = validateCompiledLesson(lesson, context, compiledLessons);
    const fileErrors = issues.filter((i) => i.severity === 'error');
    const fileWarnings = issues.filter((i) => i.severity === 'warning');

    errorsReport.push(...fileErrors);
    warningsReport.push(...fileWarnings);

    if (fileWarnings.length > 0) {
      console.warn(`⚠️ ${relativePath}: Cross-validation warnings:`);
      fileWarnings.forEach((w) => console.warn(`   - [${w.id}]: ${w.message}`));
    }
    if (fileErrors.length > 0) {
      console.error(`❌ ${relativePath}: Cross-validation errors:`);
      fileErrors.forEach((e) => console.error(`   - [${e.id}]: ${e.message}`));
      hasErrors = true;
    }
  }

  if (validateOnly) {
    console.log(`🔍 Validation checks finished. Errors: ${errorsReport.length}, Warnings: ${warningsReport.length}`);
    return !hasErrors;
  }

  // Save Cache Manifest
  saveCacheManifest(cache);

  // Stage 8 - Aggregation
  console.log('📦 Aggregating curriculum indices...');
  
  // 1. Generate curriculum.json
  const moduleLessons: Record<string, any[]> = {};
  const allModules: any[] = [];
  const lessonSummaries: any[] = [];

  // Deduplicate and group lessons by module
  compiledLessons.forEach((l) => {
    lessonSummaries.push({
      id: l.id,
      slug: l.slug,
      title: l.title,
      module: l.module,
      order: l.order,
      difficulty: l.difficulty,
      estimatedReadingTime: l.estimatedReadingTime,
      estimatedCompletionTime: l.estimatedCompletionTime,
      prerequisites: l.prerequisites,
    });

    if (!moduleLessons[l.module]) {
      moduleLessons[l.module] = [];
    }
    moduleLessons[l.module].push(l);
  });

  // Sort lessons in each module by order
  Object.keys(moduleLessons).forEach((modSlug) => {
    moduleLessons[modSlug].sort((a, b) => a.order - b.order);
    allModules.push({
      id: modSlug,
      title: modSlug.charAt(0).toUpperCase() + modSlug.slice(1).replace(/-/g, ' '),
      lessons: moduleLessons[modSlug].map((l) => l.id),
    });
  });

  const curriculum = {
    lessons: lessonSummaries,
    modules: allModules,
  };

  fs.writeFileSync(path.join(DIST_DIR, 'curriculum.json'), JSON.stringify(curriculum, null, 2), 'utf-8');

  // 2. Generate module-graph.json
  const moduleGraph: Record<string, string[]> = {};
  lessonSummaries.forEach((l) => {
    moduleGraph[l.id] = l.prerequisites;
  });
  fs.writeFileSync(path.join(DIST_DIR, 'module-graph.json'), JSON.stringify(moduleGraph, null, 2), 'utf-8');

  // 3. Generate glossary-index.json
  const glossaryIndex: Record<string, any[]> = {};
  compiledLessons.forEach((l) => {
    const glossaryBlock = l.blocks.find((b: any) => b.type === 'glossary');
    if (glossaryBlock) {
      glossaryBlock.entries?.forEach((entry: any) => {
        const key = entry.term.trim().toLowerCase();
        if (!glossaryIndex[key]) {
          glossaryIndex[key] = [];
        }
        glossaryIndex[key].push({
          term: entry.term,
          definition: entry.definition,
          lessonId: l.id,
          lessonTitle: l.title,
        });
      });
    }
  });
  fs.writeFileSync(path.join(DIST_DIR, 'glossary-index.json'), JSON.stringify(glossaryIndex, null, 2), 'utf-8');

  // 4. Generate search-index.json
  console.log('🔎 Generating FlexSearch-friendly search index...');
  const searchDocs: any[] = [];
  
  compiledLessons.forEach((l) => {
    // 1. Index lesson root
    searchDocs.push({
      id: `lesson-${l.id}`,
      type: 'lesson',
      title: l.title,
      snippet: l.searchable.plainText.slice(0, 300),
      lessonId: l.id,
      moduleName: l.module,
      lessonNumber: l.order,
    });

    // 2. Index specific blocks: Glossary, Quizzes, Flashcards
    l.blocks.forEach((b: any) => {
      if (b.type === 'glossary') {
        b.entries?.forEach((entry: any) => {
          searchDocs.push({
            id: `glossary-${l.id}-${slugify(entry.term)}`,
            type: 'glossary',
            title: entry.term,
            snippet: entry.definition,
            lessonId: l.id,
            moduleName: l.module,
            lessonNumber: l.order,
          });
        });
      } else if (b.type === 'quiz') {
        b.questions?.forEach((q: any) => {
          searchDocs.push({
            id: `quiz-q-${q.id}`,
            type: 'quiz',
            title: `Quiz Question in: ${l.title}`,
            snippet: q.question,
            lessonId: l.id,
            moduleName: l.module,
            lessonNumber: l.order,
          });
        });
      } else if (b.type === 'flashcardDeck') {
        b.cards?.forEach((c: any) => {
          searchDocs.push({
            id: `flashcard-${c.id}`,
            type: 'flashcard',
            title: `Flashcard in: ${l.title}`,
            snippet: c.front,
            lessonId: l.id,
            moduleName: l.module,
            lessonNumber: l.order,
            tags: c.tags,
          });
        });
      }
    });
  });

  fs.writeFileSync(path.join(DIST_DIR, 'search-index.json'), JSON.stringify(searchDocs, null, 2), 'utf-8');

  console.log(`✅ Compilation PASSED! Emitted ${compiledLessons.length} lessons to ${DIST_LESSONS_DIR}`);
  if (warningsReport.length > 0) {
    console.log(`⚠️ Build finished with ${warningsReport.length} warnings.`);
  }

  return !hasErrors;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Watch mode implementation
export function watchAndCompile() {
  console.log(`👀 Watching ${SOURCE_DIR} for changes...`);
  fs.watch(SOURCE_DIR, (eventType, filename) => {
    if (filename && filename.endsWith('.md')) {
      console.log(`⚡ Change detected in: ${filename}`);
      compileAllContent();
    }
  });
}

// Run CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate-only');
  const watch = args.includes('--watch');

  if (watch) {
    compileAllContent();
    watchAndCompile();
  } else {
    const success = compileAllContent(validateOnly);
    if (!success) {
      process.exit(1);
    }
  }
}
