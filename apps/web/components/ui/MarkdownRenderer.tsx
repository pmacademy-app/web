'use client'

import { useEffect, useRef } from 'react'
import { Marked } from 'marked'
import mermaid from 'mermaid'

// Initialize marked instance with custom options
const markedInstance = new Marked()

// Custom renderer for code block to handle mermaid diagrams and code classes
const customRenderer = {
  code({ text, lang, escaped }: { text: string; lang?: string; escaped?: boolean }) {
    if (lang === 'mermaid') {
      return `<div class="mermaid-diagram my-6 flex justify-center overflow-x-auto bg-muted/40 p-4 rounded-xl border border-border" data-diagram="${encodeURIComponent(text)}"></div>`
    }
    const cleanLang = lang || ''
    const formattedCode = escaped ? text : escape(text)
    return `<pre class="overflow-x-auto bg-muted/60 p-4 rounded-lg border border-border"><code class="language-${cleanLang}">${formattedCode}</code></pre>`
  }
}
markedInstance.use({ renderer: customRenderer })

// Helper to escape HTML characters
function escape(html: string) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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
        
        const diagramCode = decodeURIComponent(container.getAttribute('data-diagram') || '')
        if (!diagramCode) return

        const uniqueId = `mermaid-svg-${index}-${Math.random().toString(36).substring(2, 9)}`
        
        mermaid.render(uniqueId, diagramCode)
          .then(({ svg }) => {
            container.innerHTML = svg
            container.setAttribute('data-processed', 'true')
          })
          .catch((err) => {
            console.error('[MarkdownRenderer] Mermaid rendering error:', err)
            container.innerHTML = `<pre class="text-xs text-red-500 bg-red-500/10 p-2 rounded">${escape(diagramCode)}</pre>`
            container.setAttribute('data-processed', 'true')
          })
      })
    } catch (err) {
      console.error('[MarkdownRenderer] Failed to initialize/render mermaid:', err)
    }
  }, [html])

  return (
    <div
      ref={containerRef}
      className={`prose prose-neutral dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
