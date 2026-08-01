import { visit } from 'unist-util-visit';
import { Node } from 'unist';
import crypto from 'crypto';
import path from 'path';

// Define custom node types for TypeScript compile safety
interface CodeNode extends Node {
  type: 'code';
  lang?: string;
  value: string;
  data?: Record<string, any>;
}

interface HeadingNode extends Node {
  type: 'heading';
  level: number;
  data?: Record<string, any>;
  children: Array<{ type: string; value?: string }>;
}

interface ImageNode extends Node {
  type: 'image';
  url: string;
  alt?: string;
  data?: Record<string, any>;
}

export interface AssetRecord {
  assetId: string;
  sourcePath: string;
  hash: string;
  dimensions?: { width: number; height: number };
  mimeType?: string;
}

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  filePath: string;
  line?: number;
}

export interface CompilerContext {
  filePath: string;
  lessonId: string;
  issues: ValidationIssue[];
  assets: AssetRecord[];
  glossaryTerms: Array<{ term: string; definition: string; sourceFile: string }>;
}

// 1. remark-normalize-whitespace
export function remarkNormalizeWhitespace() {
  return (tree: Node) => {
    visit(tree, 'text', (node: any) => {
      if (node.value) {
        // Normalize CRLF to LF, and clean trailing spaces on lines
        node.value = node.value
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+\n/g, '\n');
      }
    });
  };
}

// 2. remark-mermaid-extract
export function remarkMermaidExtract(ctx: CompilerContext) {
  return (tree: Node) => {
    visit(tree, 'code', (node: CodeNode) => {
      if (node.lang === 'mermaid') {
        const source = node.value;
        const initRegex = /%%\s*\{\s*init\s*:\s*([\s\S]*?)\}\s*%%\n?/;
        const match = source.match(initRegex);

        let authorTheme: Record<string, any> | undefined = undefined;
        let normalized = source;

        if (match) {
          try {
            // Standardize JSON keys if single quotes or unquoted keys are used
            let jsonText = match[1].trim();
            const config = JSON.parse(jsonText);
            if (config.themeVariables) {
              authorTheme = config.themeVariables;
            }
            // Remove the configuration header from normalized source
            normalized = source.replace(initRegex, '').trim();
          } catch (e) {
            ctx.issues.push({
              id: 'mermaid-theme-parse-fail',
              severity: 'warning',
              message: `Failed to parse Mermaid config JSON header: ${(e as Error).message}`,
              filePath: ctx.filePath,
              line: node.position?.start?.line,
            });
          }
        }

        node.data = node.data || {};
        node.data.mermaid = {
          source,
          normalized,
          authorTheme,
        };
      }
    });
  };
}

// Helper to slugify heading text
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-word chars
    .replace(/[\s_-]+/g, '-') // swap space/underscore to dash
    .replace(/^-+|-+$/g, ''); // trim dashes
}

// 3. remark-heading-ids
export function remarkHeadingIds() {
  return (tree: Node) => {
    visit(tree, 'heading', (node: HeadingNode) => {
      let text = '';
      visit(node, 'text', (textNode: any) => {
        text += textNode.value || '';
      });

      const id = slugify(text);
      node.data = node.data || {};
      node.data.id = id;
    });
  };
}

// 4. remark-asset-resolve
export function remarkAssetResolve(ctx: CompilerContext) {
  return (tree: Node) => {
    visit(tree, 'image', (node: ImageNode) => {
      if (node.url && !node.url.startsWith('http://') && !node.url.startsWith('https://') && !node.url.startsWith('data:')) {
        // Resolve relative path to absolute
        const dir = path.dirname(ctx.filePath);
        const absolutePath = path.resolve(dir, node.url);
        const relativePathFromRoot = path.relative(path.resolve(__dirname, '../../..'), absolutePath).replace(/\\/g, '/');

        // Create deterministic hash for asset name
        const hash = crypto.createHash('sha256').update(relativePathFromRoot).digest('hex').slice(0, 16);
        const ext = path.extname(node.url);
        const assetId = `ast_${hash}`;

        ctx.assets.push({
          assetId,
          sourcePath: relativePathFromRoot,
          hash,
          mimeType: getMimeType(ext),
        });

        // Store resolved info in node
        node.data = node.data || {};
        node.data.assetId = assetId;
        // Rewrite node URL to use asset ID
        node.url = assetId;
      }
    });
  };
}

function getMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.avif': return 'image/avif';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}

// 5. remark-a11y-lint
export function remarkA11yLint(ctx: CompilerContext) {
  return (tree: Node) => {
    let lastHeadingLevel = 1; // starts at h1

    visit(tree, (node: any) => {
      // Image alt tag check
      if (node.type === 'image') {
        if (!node.alt || node.alt.trim().length === 0) {
          ctx.issues.push({
            id: 'a11y-missing-alt',
            severity: 'error',
            message: `Accessibility Error: Image is missing non-empty alt text`,
            filePath: ctx.filePath,
            line: node.position?.start?.line,
          });
        }
      }

      // Heading hierarchy check
      if (node.type === 'heading') {
        const currentLevel = node.level;
        if (currentLevel > lastHeadingLevel + 1) {
          ctx.issues.push({
            id: 'a11y-skipped-heading-level',
            severity: 'warning',
            message: `Accessibility Warning: Skipped heading level from h${lastHeadingLevel} to h${currentLevel}`,
            filePath: ctx.filePath,
            line: node.position?.start?.line,
          });
        }
        lastHeadingLevel = currentLevel;
      }
    });
  };
}
