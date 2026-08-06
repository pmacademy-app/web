import { Marked } from 'marked'

// ─── Custom Marked renderers ──────────────────────────────────────────────────

const customRenderer = {
  // Mermaid diagrams are pre-compiled to static SVG by the content pipeline and
  // rendered via MermaidBlock. Raw Mermaid source must never reach the browser,
  // so any mermaid fence arriving here is dropped silently rather than rendered.
  code({ text, lang }: { text: string; lang?: string; escaped?: boolean }) {
    if (lang === 'mermaid') {
      return ''
    }
    const cleanLang = lang || ''
    const formattedCode = escapeHtml(text)
    const langBadge = cleanLang
      ? `<div class="bg-muted/80 px-4 py-1.5 border-b border-border"><span class="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">${cleanLang}</span></div>`
      : ''
    return `<div class="my-5 rounded-xl overflow-hidden border border-border shadow-sm">${langBadge}<pre class="overflow-x-auto bg-muted/40 p-4"><code class="font-mono text-sm leading-relaxed text-foreground language-${cleanLang}">${formattedCode}</code></pre></div>`
  },
}

// Initialize marked instance
const markedInstance = new Marked()
markedInstance.use({ renderer: customRenderer })

// ─── HTML escaping helper ─────────────────────────────────────────────────────

function escapeHtml(html: string) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MarkdownRendererProps {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  // Parse during render on both server (for SEO) and client
  const html = markedInstance.parse(content) as string

  return (
    <div
      className={`prose prose-neutral dark:prose-invert max-w-none prose-p:text-foreground/85 prose-strong:text-foreground prose-em:text-foreground/80 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-headings:font-serif prose-headings:text-foreground prose-li:text-foreground/85 prose-li:leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
