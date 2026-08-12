import { Block, GlossaryEntrySchema, FlashcardSchema, QuizQuestionSchema } from '../schema/block-schema';
import { CompilerContext, ValidationIssue } from './remark-plugins';
import { generateBlockId } from '../registry';
import { compileMermaidToSvg } from '../mermaid-svg';
import { z } from 'zod';

export function toMarkdown(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  if (node.type === 'strong') return `**${(node.children || []).map(toMarkdown).join('')}**`;
  if (node.type === 'emphasis') return `*${(node.children || []).map(toMarkdown).join('')}*`;
  if (node.type === 'inlineCode') return `\`${node.value}\``;
  if (node.type === 'link') return `[${(node.children || []).map(toMarkdown).join('')}](${node.url})`;
  if (node.type === 'image') return `![${node.alt || ''}](${node.url})`;
  if (node.type === 'paragraph') return (node.children || []).map(toMarkdown).join('');
  if (node.type === 'list') {
    return (node.children || []).map((item: any, idx: number) => {
      const bullet = node.ordered ? `${idx + 1}. ` : '- ';
      return `${bullet}${toMarkdown(item)}`;
    }).join('\n');
  }
  if (node.type === 'listItem') {
    return (node.children || []).map(toMarkdown).join('');
  }
  if (node.type === 'code') {
    return `\`\`\`${node.lang || ''}\n${node.value}\n\`\`\``;
  }
  if (node.children) {
    return node.children.map(toMarkdown).join('');
  }
  return '';
}

export async function mdastToBlocks(nodes: any[], lessonId: string): Promise<any[]> {
  const blocks: any[] = [];
  for (const node of nodes) {
    if (node.type === 'heading') {
      let text = '';
      visitText(node, (val) => { text += val; });
      const block: any = {
        type: 'heading',
        level: node.depth,
        text: text.trim(),
      };
      block.blockId = generateBlockId(lessonId, block);
      blocks.push(block);
    } else if (node.type === 'paragraph') {
      const text = toMarkdown(node);
      if (text.trim().length === 0) continue;
      const block: any = {
        type: 'paragraph',
        text,
      };
      block.blockId = generateBlockId(lessonId, block);
      blocks.push(block);
    } else if (node.type === 'list') {
      const items = (node.children || []).map((item: any) => toMarkdown(item));
      const block: any = {
        type: 'list',
        ordered: !!node.ordered,
        items,
      };
      block.blockId = generateBlockId(lessonId, block);
      blocks.push(block);
    } else if (node.type === 'table') {
      const headers = (node.children[0]?.children || []).map(toMarkdown);
      const rows = (node.children.slice(1) || []).map((row: any) =>
        (row.children || []).map(toMarkdown)
      );
      const block: any = {
        type: 'table',
        headers,
        rows,
      };
      block.blockId = generateBlockId(lessonId, block);
      blocks.push(block);
    } else if (node.type === 'code') {
      if (node.lang === 'mermaid') {
        const source = node.value;
        const normalized = node.data?.mermaid?.normalized || node.value;
        const authorTheme = node.data?.mermaid?.authorTheme;
        const svg = await compileMermaidToSvg(source, authorTheme);
        const block: any = {
          type: 'mermaid',
          id: `mer-${lessonId}`,
          source,
          normalized,
          authorTheme,
          svg,
          staticSvg: svg,
        };
        block.blockId = generateBlockId(lessonId, block);
        // Sync ID of mermaid block
        block.id = block.blockId;
        blocks.push(block);
      } else {
        const block: any = {
          type: 'code',
          language: node.lang || undefined,
          code: node.value,
        };
        block.blockId = generateBlockId(lessonId, block);
        blocks.push(block);
      }
    }
  }
  return blocks;
}

function visitText(node: any, callback: (val: string) => void) {
  if (node.type === 'text') {
    callback(node.value);
  }
  if (node.children) {
    for (const child of node.children) {
      visitText(child, callback);
    }
  }
}

// Extract table keys and values from an mdast Table node
export function parseTableNode(tableNode: any): Record<string, string> {
  const result: Record<string, string> = {};
  if (!tableNode || tableNode.type !== 'table') return result;

  for (const row of tableNode.children) {
    const cells = row.children || [];
    if (cells.length >= 2) {
      const rawKey = toMarkdown(cells[0]);
      // Remove strong tags or other formatting from the key name
      const key = rawKey.replace(/\*/g, '').trim();
      const val = toMarkdown(cells[1]).trim();
      result[key] = val;
    }
  }
  return result;
}

// Segmentation helper: cuts nodes based on h2 headings
export function segmentByH2(rootNode: any): Array<{ heading: string; nodes: any[] }> {
  const segments: Array<{ heading: string; nodes: any[] }> = [];
  let currentHeading = 'Front Matter';
  let currentNodes: any[] = [];

  for (const child of rootNode.children || []) {
    if (child.type === 'heading' && child.depth === 2) {
      if (currentNodes.length > 0 || currentHeading !== 'Front Matter') {
        segments.push({ heading: currentHeading, nodes: currentNodes });
      }
      let text = '';
      visitText(child, (val) => { text += val; });
      currentHeading = text.trim();
      currentNodes = [];
    } else {
      currentNodes.push(child);
    }
  }

  if (currentNodes.length > 0 || currentHeading !== 'Front Matter') {
    segments.push({ heading: currentHeading, nodes: currentNodes });
  }

  return segments;
}

// Extract Quiz Block
export function extractQuizBlock(nodes: any[], lessonId: string, ctx: CompilerContext): any {
  const quizId = `quiz-${lessonId}`;
  const quizMarkdown = nodes.map(toMarkdown).join('\n\n');
  
  // Split by quiz question headers, e.g., "**1. Question...**" or "1. **Question...**"
  const questionBlocks = quizMarkdown.split(/\n(?=\*\*\d+\.|\d+\.\s+\*\*)/);
  const questions: any[] = [];

  for (const block of questionBlocks) {
    const headerMatch = block.match(/\*?\*?(\d+)\.\s*(.*?)(?:\*?\*?\n|\n)/);
    if (!headerMatch) continue;

    const qNum = parseInt(headerMatch[1], 10);
    const qText = headerMatch[2].replace(/^\*\*/, '').replace(/\*\*$/, '').trim();

    // Extract options A), B), C), D)
    const optionMatches = [...block.matchAll(/(?:^|\n)(?:-\s*)?([A-D])\)\s*(.*?)(?=\n(?:-\s*)?[A-D]\)|\n\*|\n\n|$)/gs)];
    const options: string[] = [];
    optionMatches.forEach((m) => {
      options.push(m[2].trim().replace(/\s+/g, ' '));
    });

    // Extract Correct Answer
    const correctMatch = block.match(/\*Correct answer:\s*([A-D])\*/i);
    const correctLetter = correctMatch ? correctMatch[1].toUpperCase() : 'A';
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(correctLetter);

    // Extract Explanation
    const expMatch = block.match(/\*Explanation:\s*(.*?)\*/is) || block.match(/\*Explanation:\s*([^*]*)/is);
    const explanation = expMatch ? expMatch[1].trim() : '';

    // Extract Learning Objective
    const loMatch = block.match(/\*Learning objective tested:\s*(.*?)\*/i);
    const learningObjectiveStr = loMatch ? loMatch[1].trim() : '';
    const objectivesTested: number[] = [];
    const loNumbers = learningObjectiveStr.match(/\d+/g);
    if (loNumbers) {
      loNumbers.forEach((n) => objectivesTested.push(parseInt(n, 10)));
    }

    // Extract Difficulty
    const diffMatch = block.match(/\*Difficulty:\s*(.*?)\*/i);
    const difficulty = diffMatch ? diffMatch[1].trim().toLowerCase() : 'medium';

    if (qText && options.length >= 2) {
      questions.push({
        id: `q-${lessonId}-${qNum}`,
        question: qText,
        options,
        correctAnswer: correctIndex >= 0 ? correctIndex : 0,
        explanation,
        objectivesTested,
        difficulty,
      });
    }
  }

  const block: any = {
    type: 'quiz',
    id: quizId,
    questions,
  };
  block.blockId = generateBlockId(lessonId, block);
  return block;
}

// Extract Flashcard Block
export function extractFlashcardBlock(nodes: any[], lessonId: string, ctx: CompilerContext): any {
  const flashcardsMarkdown = nodes.map(toMarkdown).join('\n\n');
  const cards: any[] = [];
  
  // Split on Card N or Front: boundaries
  const cardBlocks = flashcardsMarkdown.split(/\n(?=\*\*Card\s+\d+\*\*|\*\*Card\s+\d+|\*\*Front\b|\*\*Front:|Front:)/i);
  
  let cardIndex = 0;
  for (const block of cardBlocks) {
    if (!block.trim()) continue;

    // Extract Front
    const frontMatch = block.match(/(?:-\s*|\*?\*?)Front(?::\s*|\*\*:\s*|\s*:\s*)(.*?)(?=\r?\n(?:-\s*|\*?\*?)(?:Back|Difficulty|Tags):|\r?\n\r?\n|$)/is);
    // Extract Back
    const backMatch = block.match(/(?:-\s*|\*?\*?)Back(?::\s*|\*\*:\s*|\s*:\s*)(.*?)(?=\r?\n(?:-\s*|\*?\*?)(?:Difficulty|Tags):|\r?\n\r?\n|$)/is);

    if (!frontMatch || !backMatch) continue;

    cardIndex++;
    
    // Check if there is an explicit card number
    const cardMatch = block.match(/^\*?\*?Card\s*(\d+)/i) || block.match(/Card\s*(\d+)/i);
    const finalCardIndex = cardMatch ? parseInt(cardMatch[1], 10) : cardIndex;

    const clean = (val: string) => val.trim().replace(/^\*?\*?/, '').replace(/\*?\*?$/, '').trim();

    const front = clean(frontMatch[1]);
    const back = clean(backMatch[1]);

    // Extract Difficulty
    const diffMatch = block.match(/(?:-\s*|\*?\*?)Difficulty(?::\s*|\*\*:\s*|\s*:\s*)(.*?)(?=\r?\n(?:-\s*|\*?\*?)Tags:|\r?\n\r?\n|$)/is);
    const difficultyStr = diffMatch ? clean(diffMatch[1]) : 'medium';
    let difficulty: any = parseInt(difficultyStr, 10);
    if (isNaN(difficulty)) {
      difficulty = difficultyStr;
    }

    // Extract Tags
    const tagsMatch = block.match(/(?:-\s*|\*?\*?)Tags(?::\s*|\*\*:\s*|\s*:\s*)(.*?)(?:\r?\n\r?\n|$)/is);
    const tags = tagsMatch
      ? clean(tagsMatch[1]).split(/[\s,]+/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean)
      : [];

    cards.push({
      id: `fc-${lessonId}-${finalCardIndex}`,
      front,
      back,
      difficulty,
      tags,
    });
  }

  const block: any = {
    type: 'flashcardDeck',
    id: `fc-deck-${lessonId}`,
    cards,
  };
  block.blockId = generateBlockId(lessonId, block);
  return block;
}

// Extract Glossary Block
export function extractGlossaryBlock(nodes: any[], lessonId: string, ctx: CompilerContext): any {
  const entries: any[] = [];
  const tableNode = nodes.find((n) => n.type === 'table');

  if (tableNode) {
    const parsedTable = tableNode.children || [];
    // Skip headers (row 0)
    for (let r = 1; r < parsedTable.length; r++) {
      const cells = parsedTable[r].children || [];
      if (cells.length >= 2) {
        const term = toMarkdown(cells[0]).replace(/\*\*/g, '').trim();
        const definition = toMarkdown(cells[1]).trim();
        const related = cells[2] ? toMarkdown(cells[2]).split(',').map((c) => c.trim()).filter(Boolean) : [];
        const difficulty = cells[3] ? parseInt(toMarkdown(cells[3]).trim(), 10) : undefined;

        entries.push({
          term,
          definition,
          relatedConcepts: related.length > 0 ? related : undefined,
          difficulty: isNaN(difficulty as any) ? undefined : difficulty,
        });

        // Register globally in CompilerContext
        ctx.glossaryTerms.push({
          term,
          definition,
          sourceFile: ctx.filePath,
        });
      }
    }
  }

  const block: any = {
    type: 'glossary',
    entries,
  };
  block.blockId = generateBlockId(lessonId, block);
  return block;
}

// Extract Connections Block
export function extractConnectionsBlock(nodes: any[], lessonId: string, ctx: CompilerContext): any {
  let previous: any = null;
  let current: any = { id: lessonId, title: '' }; // Will be populated later
  let next: any = null;
  const unlocks: any[] = [];

  const tableNode = nodes.find((n) => n.type === 'table');
  if (tableNode) {
    const rows = tableNode.children || [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r].children || [];
      if (cells.length >= 2) {
        const key = toMarkdown(cells[0]).replace(/\*\*/g, '').replace(/\*/g, '').trim();
        const val = toMarkdown(cells[1]).trim();
        
        // Parse Title and ID if possible
        // Lesson reference is written like "Lesson 2 — Product vs. Project" or "Lesson 6 (Jobs to Be Done)"
        const lessonMatch = val.match(/Lesson\s+(\d+)\s*[-—(]\s*(.*?)(?:\)|$)/i) || val.match(/Lesson\s+(\d+)/i);
        const refTitle = lessonMatch ? lessonMatch[2]?.trim() || val : val;
        
        if (key.includes('Previous Lesson')) {
          if (!val.toLowerCase().includes('none')) {
            previous = { id: `placeholder_prev`, title: refTitle };
          }
        } else if (key.includes('Current Lesson')) {
          current = { id: lessonId, title: refTitle };
        } else if (key.includes('Next Lesson')) {
          if (!val.toLowerCase().includes('none') && val.length > 0) {
            next = { id: `placeholder_next`, title: refTitle };
          }
        } else if (key.includes('Future Concepts Unlocked') || key.includes('Future Topics Unlocked')) {
          // Unlocks can contain multiple comma separated or bullet items.
          // e.g. "Lesson 6 (Jobs to Be Done), Lesson 8 (Product Discovery)"
          const items = val.split(/,|\n/).map((item) => item.trim()).filter(Boolean);
          for (const item of items) {
            const itemMatch = item.match(/Lesson\s+(\d+)\s*[-—(]\s*(.*?)(?:\)|$)/i) || item.match(/Lesson\s+(\d+)/i);
            if (itemMatch) {
              const itemTitle = itemMatch[2]?.trim() || item;
              const coreIdea = toMarkdown(cells[2]) || '';
              unlocks.push({
                lesson: { id: `placeholder_unlock_${itemMatch[1]}`, title: itemTitle },
                coreIdea: coreIdea.trim(),
              });
            }
          }
        }
      }
    }
  }

  const block: any = {
    type: 'connections',
    previous,
    current,
    next,
    unlocks,
  };
  block.blockId = generateBlockId(lessonId, block);
  return block;
}

// Extract Common Mistakes
export function extractCommonMistakesBlock(nodes: any[], lessonId: string): any {
  const mistakes: any[] = [];
  let currentMistake: any = null;

  for (const node of nodes) {
    const text = toMarkdown(node).trim();
    const lines = text.split('\n');
    const firstLine = lines[0].trim();
    const mistakeMatch = firstLine.match(/^\*?\*?Mistake\s*(\d+):\s*(.*)/i);

    if (mistakeMatch) {
      if (currentMistake) {
        mistakes.push(currentMistake);
      }
      let rawTitle = mistakeMatch[2].trim();
      rawTitle = rawTitle.replace(/\*?\*?$/, '').trim();
      const bodyText = lines.slice(1).join('\n').trim();
      currentMistake = {
        title: rawTitle.replace(/^["'“”]/, '').replace(/["'“”]$/, '').trim(),
        body: bodyText,
      };
    } else if (currentMistake) {
      currentMistake.body += (currentMistake.body ? '\n\n' : '') + text;
    }
  }

  if (currentMistake) {
    mistakes.push(currentMistake);
  }

  const block: any = {
    type: 'commonMistakes',
    mistakes,
  };
  block.blockId = generateBlockId(lessonId, block);
  return block;
}

// Extract Real World Perspective Block
export function extractRealWorldPerspectiveBlock(nodes: any[], lessonId: string): any {
  const segments: any[] = [];
  let currentSegment: any = null;

  for (const node of nodes) {
    const text = toMarkdown(node).trim();
    // Subheadings like: **At a startup (roughly pre-seed to Series B):**
    // or ### Startup (roughly pre-seed to Series B)
    const contextMatch = text.match(/^\*?\*?(At a\s+[^*\n]+|At\s+[^*\n]+)\*?\*?(?::\s*|\n|:\s*\n|$)([\s\S]*)/i) || (node.type === 'heading' && node.depth === 3);

    if (contextMatch) {
      if (currentSegment) {
        segments.push(currentSegment);
      }
      let contextText = '';
      let bodyText = '';
      if (node.type === 'heading') {
        visitText(node, (v) => { contextText += v; });
      } else if (Array.isArray(contextMatch)) {
        contextText = contextMatch[1].trim().replace(/:$/, '').trim();
        bodyText = contextMatch[2].trim();
      }

      currentSegment = {
        context: contextText,
        body: bodyText,
      };
    } else if (currentSegment) {
      currentSegment.body += (currentSegment.body ? '\n\n' : '') + text;
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  const block: any = {
    type: 'realWorldPerspective',
    segments,
  };
  block.blockId = generateBlockId(lessonId, block);
  return block;
}

export function extractInterviewPerspectiveBlock(nodes: any[], lessonId: string): any {
  const questions: any[] = [];
  let currentQuestion: any = null;

  for (const node of nodes) {
    const text = toMarkdown(node).trim();
    if (!text) continue;

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const qMatch = line.match(/^\*?\*?(?:Typical question(?:\s*\d+)?|Question(?:\s*\d+)?):\s*(.*?)(?:\*?\*?\s*$|$)/i);

      if (qMatch) {
        if (currentQuestion) {
          questions.push(currentQuestion);
        }
        let qStr = qMatch[1].replace(/^\*?\*?/, '').replace(/\*?\*?$/, '').trim();
        qStr = qStr.replace(/^["'“”]/, '').replace(/["'“”]$/, '').trim();
        currentQuestion = {
          question: qStr,
          whatItEvaluates: '',
        };
      } else {
        const directMatch = line.match(/^\*?\*?\s*["'“](.*?)["'”]\s*\*?\*?\s*(.*)/i);
        if (directMatch && directMatch[1].length > 10 && !currentQuestion) {
          if (currentQuestion) {
            questions.push(currentQuestion);
          }
          currentQuestion = {
            question: directMatch[1].trim(),
            whatItEvaluates: directMatch[2].trim(),
          };
        } else if (currentQuestion) {
          currentQuestion.whatItEvaluates += (currentQuestion.whatItEvaluates ? '\n\n' : '') + line;
        }
      }
    }
  }

  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  const block: any = {
    type: 'interviewPerspective',
    questions,
  };
  block.blockId = generateBlockId(lessonId, block);
  return block;
}
