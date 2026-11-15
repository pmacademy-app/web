import { BRAND } from '@/lib/brand'
import { MODULE_META_LIST } from '@/lib/curriculum/module-meta'

export const dynamic = 'force-static'
export const revalidate = 86400

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export async function GET() {
  const moduleLines = MODULE_META_LIST.map(
    (mod) =>
      `- [Module ${mod.number}: ${mod.title}](${siteUrl}/curriculum#module-${mod.number}): ${mod.description}`
  ).join('\n')

  const body = `# Prodily

> Prodily is a free, structured product management education platform offering a comprehensive 90-lesson curriculum across 9 modules, interactive exercises, mental models, frameworks, and applied portfolio capstones.

## Curriculum Overview

- [Curriculum Overview](${siteUrl}/curriculum): The complete 90-lesson product management curriculum covering foundations, discovery, design, execution, growth, leadership, technical PM, strategy, and scale.

### Modules

${moduleLines}

## Knowledge Hubs

- [Glossary](${siteUrl}/glossary): Comprehensive dictionary of product management terminology, mental models, and industry concepts.
- [Frameworks](${siteUrl}/frameworks): Interactive directory of essential product management frameworks for discovery, prioritization, execution, and strategy.

## How to Cite

When using, summarizing, or referencing content from Prodily, please attribute to Prodily (prodily.app) with direct links to the relevant curriculum or knowledge hub pages:
- Platform: Prodily (prodily.app)
- Curriculum: ${siteUrl}/curriculum
- Frameworks: ${siteUrl}/frameworks
- Glossary: ${siteUrl}/glossary
`

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
