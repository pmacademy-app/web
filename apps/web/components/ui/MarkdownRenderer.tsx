'use client'

import { useEffect, useRef } from 'react'
import { Marked } from 'marked'
import mermaid from 'mermaid'

// ─── Custom Marked renderers ──────────────────────────────────────────────────

const customRenderer = {
  // Mermaid diagrams inside markdown code fences
  code({ text, lang }: { text: string; lang?: string; escaped?: boolean }) {
    if (lang === 'mermaid') {
      return `<div class="mermaid-diagram my-6 flex justify-center overflow-x-auto bg-muted/40 p-4 rounded-xl border border-border" data-diagram="${encodeURIComponent(text)}"></div>`
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
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse during render on both server (for SEO) and client (hydration)
  const html = markedInstance.parse(content) as string

  useEffect(() => {
    if (!containerRef.current) return

    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
      })

      const containers = containerRef.current.querySelectorAll('.mermaid-diagram')
      containers.forEach((container, index) => {
        if (container.getAttribute('data-processed')) return
        container.setAttribute('data-processed', 'true')

        const diagramCode = decodeURIComponent(container.getAttribute('data-diagram') || '')
        if (!diagramCode) return

        const uniqueId = `mermaid-svg-${index}-${Math.random().toString(36).substring(2, 9)}`

        mermaid.render(uniqueId, diagramCode)
          .then(({ svg }) => {
            container.innerHTML = svg
          })
          .catch((err) => {
            console.error('[MarkdownRenderer] Mermaid rendering error:', err)
            container.innerHTML = `<pre class="text-xs text-red-500 bg-red-500/10 p-2 rounded">${escapeHtml(diagramCode)}</pre>`
          })
      })
    } catch (err) {
      console.error('[MarkdownRenderer] Failed to initialize/render mermaid:', err)
    }
  }, [html])

  return (
    <div
      ref={containerRef}
      className={`prose prose-neutral dark:prose-invert max-w-none prose-p:text-foreground/85 prose-strong:text-foreground prose-em:text-foreground/80 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-headings:font-serif prose-headings:text-foreground prose-li:text-foreground/85 prose-li:leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
