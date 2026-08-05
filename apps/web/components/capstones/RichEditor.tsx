'use client'

import React, { useRef, useState, useMemo } from 'react'
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Table as TableIcon,
  Eye,
  Edit3,
} from 'lucide-react'
import { calculateCapstoneWordCount } from '@/lib/capstones'
import { marked } from 'marked'
import { cn } from '@/lib/utils'

interface RichEditorProps {
  value: string
  onChange: (val: string) => void
  isLocked?: boolean
  minWordCount?: number
  placeholder?: string
  id?: string
}

export function RichEditor({
  value,
  onChange,
  isLocked = false,
  minWordCount = 250,
  placeholder = 'Write your capstone submission here...',
  id = 'capstone-rich-editor',
}: RichEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isPreview, setIsPreview] = useState<boolean>(isLocked)

  const { wordCount, characterCount } = calculateCapstoneWordCount(value)
  const isWordCountMet = wordCount >= minWordCount

  // Parse markdown to HTML for preview/read-only mode via useMemo (pure render computation)
  const renderedHtml = useMemo(() => {
    try {
      return marked.parse(value || '*No content written yet.*') as string
    } catch {
      return value || '*No content written yet.*'
    }
  }, [value])

  // Helper to insert markdown tags around current selection in textarea
  const insertFormatting = (prefix: string, suffix: string = '', defaultText: string = '') => {
    if (isLocked || isPreview) return
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end) || defaultText

    const replacement = `${prefix}${selectedText}${suffix}`
    const newValue = value.substring(0, start) + replacement + value.substring(end)

    onChange(newValue)

    // Restore cursor focus & selection
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      )
    }, 0)
  }

  // Insert a block line prefix (e.g. #, ##, ###, -, 1., >)
  const insertLinePrefix = (prefix: string) => {
    if (isLocked || isPreview) return
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    // Find start of current line
    const lastNewline = value.lastIndexOf('\n', start - 1)
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1

    const newValue = value.substring(0, lineStart) + prefix + ' ' + value.substring(lineStart)
    onChange(newValue)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(end + prefix.length + 1, end + prefix.length + 1)
    }, 0)
  }

  const insertTable = () => {
    const tableSnippet = `\n| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n| Item 1 | Detail A | Status 1 |\n| Item 2 | Detail B | Status 2 |\n\n`
    insertFormatting('', '', tableSnippet)
  }

  const insertLink = () => {
    insertFormatting('[', '](https://example.com)', 'Link Title')
  }

  // Keyboard shortcut handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLocked || isPreview) return

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault()
        insertFormatting('**', '**', 'bold text')
      } else if (e.key === 'i') {
        e.preventDefault()
        insertFormatting('*', '*', 'italic text')
      } else if (e.key === 'k') {
        e.preventDefault()
        insertLink()
      }
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col transition-all">
      {/* Editor Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-muted/40 border-b border-border/80 text-xs">
        {/* Formatting Actions */}
        {!isLocked && !isPreview ? (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => insertLinePrefix('#')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Heading 1"
              aria-label="Heading 1"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('##')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Heading 2"
              aria-label="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('###')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Heading 3"
              aria-label="Heading 3"
            >
              <Heading3 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border/80 mx-1" aria-hidden="true" />
            <button
              type="button"
              onClick={() => insertFormatting('**', '**', 'bold')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Bold (Ctrl+B)"
              aria-label="Bold"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('*', '*', 'italic')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Italic (Ctrl+I)"
              aria-label="Italic"
            >
              <Italic className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border/80 mx-1" aria-hidden="true" />
            <button
              type="button"
              onClick={() => insertLinePrefix('-')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Bullet List"
              aria-label="Bullet List"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('1.')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Numbered List"
              aria-label="Numbered List"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('>')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Block Quote"
              aria-label="Block Quote"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('```\n', '\n```', 'code block')}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Code Block"
              aria-label="Code Block"
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={insertLink}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Insert Link (Ctrl+K)"
              aria-label="Insert Link"
            >
              <LinkIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={insertTable}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Insert Table"
              aria-label="Insert Table"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            {isLocked ? (
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono text-[11px]">
                LOCKED / SUBMITTED MODE
              </span>
            ) : (
              <span>PREVIEW MODE</span>
            )}
          </div>
        )}

        {/* Mode Toggle & Word Counter */}
        <div className="flex items-center gap-3 ml-auto">
          {!isLocked && (
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary/60 hover:bg-secondary text-foreground text-xs font-medium transition-colors"
            >
              {isPreview ? (
                <>
                  <Edit3 className="w-3.5 h-3.5" /> Write
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" /> Preview
                </>
              )}
            </button>
          )}

          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground border-l border-border/60 pl-3">
            <span
              className={cn(
                'font-bold',
                isWordCountMet ? 'text-emerald-500' : 'text-amber-500 font-semibold'
              )}
            >
              {wordCount} / {minWordCount} words
            </span>
            <span className="text-muted-foreground/50">({characterCount} chars)</span>
          </div>
        </div>
      </div>

      {/* Editor Body */}
      {isPreview || isLocked ? (
        <div
          className="p-6 min-h-[400px] prose dark:prose-invert max-w-none text-foreground leading-relaxed overflow-y-auto focus:outline-none"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLocked}
          rows={18}
          className="w-full p-6 bg-transparent text-foreground placeholder:text-muted-foreground/60 resize-y font-sans text-sm md:text-base leading-relaxed focus:outline-none focus:ring-0 border-0 font-medium tracking-normal"
          aria-label="Capstone Rich Text Content"
        />
      )}
    </div>
  )
}
