'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, BookOpen, FileText, Layers, ArrowRight } from 'lucide-react'
import { useSearch } from './SearchOverlayProvider'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchEntry {
  id: string
  type: 'lesson' | 'glossary' | 'quiz' | 'flashcard' | string
  title: string
  snippet: string
  lessonId: string
  moduleName: string
  lessonNumber: number
  blockId?: string
}

// ─── State ─────────────────────────────────────────────────────────────────

type State = {
  query: string
  results: SearchEntry[]
  selectedIdx: number
  index: SearchEntry[] | null
}

type Action =
  | { type: 'RESET' }
  | { type: 'SET_INDEX'; entries: SearchEntry[] }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_RESULTS'; results: SearchEntry[]; selectedIdx: number }
  | { type: 'SELECT_IDX'; idx: number }

const INITIAL: State = { query: '', results: [], selectedIdx: 0, index: null }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET':
      return { ...state, query: '', results: [], selectedIdx: 0 }
    case 'SET_INDEX':
      return { ...state, index: action.entries }
    case 'SET_QUERY':
      return { ...state, query: action.query, results: [], selectedIdx: 0 }
    case 'SET_RESULTS':
      return { ...state, results: action.results, selectedIdx: action.selectedIdx }
    case 'SELECT_IDX':
      return { ...state, selectedIdx: action.idx }
    default:
      return state
  }
}

// ─── Lazy Index Loader ────────────────────────────────────────────────────────

let _indexCache: SearchEntry[] | null = null
let _indexLoading = false
let _indexCallbacks: Array<(entries: SearchEntry[]) => void> = []

function loadSearchIndex(): Promise<SearchEntry[]> {
  if (_indexCache) return Promise.resolve(_indexCache)
  return new Promise((resolve) => {
    _indexCallbacks.push(resolve)
    if (_indexLoading) return
    _indexLoading = true
    fetch('/api/search-index')
      .then((r) => r.json())
      .then((data: SearchEntry[]) => {
        _indexCache = data
        _indexCallbacks.forEach((cb) => cb(data))
        _indexCallbacks = []
      })
      .catch((err) => {
        console.error('[SearchOverlay] Failed to load search index:', err)
        _indexLoading = false
        _indexCallbacks.forEach((cb) => cb([]))
        _indexCallbacks = []
      })
  })
}

// ─── Simple client-side search ───────────────────────────────────────────────

function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  if (!query.trim()) return []
  const q = query.toLowerCase().trim()
  const terms = q.split(/\s+/).filter(Boolean)

  const scored = entries.map((entry) => {
    const titleLower = entry.title.toLowerCase()
    const snippetLower = entry.snippet.toLowerCase()
    let score = 0
    for (const term of terms) {
      if (titleLower.includes(term)) score += 10
      if (snippetLower.includes(term)) score += 3
      if (entry.type === 'lesson' && titleLower.startsWith(term)) score += 5
    }
    return { entry, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((s) => s.entry)
}

// ─── Type Icons ───────────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'lesson':
      return <BookOpen className="w-3.5 h-3.5 shrink-0 text-primary" />
    case 'glossary':
      return <FileText className="w-3.5 h-3.5 shrink-0 text-blue-500" />
    case 'quiz':
      return <Layers className="w-3.5 h-3.5 shrink-0 text-amber-500" />
    default:
      return <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
  }
}

const MODULE_NAMES: Record<string, string> = {
  foundations: 'Foundations',
  discovery: 'Discovery',
  strategy: 'Strategy',
  execution: 'Execution',
  growth: 'Growth',
  leadership: 'Leadership',
  technical: 'Technical',
  design: 'Design',
  capstone: 'Capstone',
}

// ─── SearchOverlay ────────────────────────────────────────────────────────────

export function SearchOverlay() {
  const { isOpen, closeSearch } = useSearch()
  const router = useRouter()
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const { query, results, selectedIdx, index } = state

  const inputRef = useRef<HTMLInputElement>(null)
  const prevOpenRef = useRef(false)

  // Derived: index is loading when open but not yet fetched
  const isLoading = isOpen && index === null

  // Lazy-load the search index on first open (dispatch is stable and effect-safe)
  useEffect(() => {
    if (!isOpen || index !== null) return
    let cancelled = false
    loadSearchIndex().then((entries) => {
      if (!cancelled) dispatch({ type: 'SET_INDEX', entries })
    })
    return () => { cancelled = true }
  }, [isOpen, index])

  // Reset query/results and focus input when overlay opens
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      dispatch({ type: 'RESET' })
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    prevOpenRef.current = isOpen
  }, [isOpen])

  // Run search when query or index changes (dispatch is effect-safe)
  useEffect(() => {
    if (!index) return
    const found = searchEntries(index, query)
    dispatch({ type: 'SET_RESULTS', results: found, selectedIdx: 0 })
  }, [query, index])

  const navigateTo = useCallback((entry: SearchEntry) => {
    closeSearch()
    router.push(`/academy/${entry.moduleName}/${entry.lessonId}`)
  }, [closeSearch, router])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      dispatch({ type: 'SELECT_IDX', idx: Math.min(selectedIdx + 1, results.length - 1) })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      dispatch({ type: 'SELECT_IDX', idx: Math.max(selectedIdx - 1, 0) })
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      navigateTo(results[selectedIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
    }
  }, [results, selectedIdx, navigateTo, closeSearch])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      aria-modal="true"
      role="dialog"
      aria-label="Search curriculum"
    >
      {/* Click-outside backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={closeSearch}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            id="search-overlay-input"
            type="text"
            value={query}
            onChange={(e) => dispatch({ type: 'SET_QUERY', query: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="Search 90 lessons, flashcards, glossary…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            aria-label="Search query"
            autoComplete="off"
            spellCheck="false"
          />
          {query && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_QUERY', query: '' })}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted border border-border rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
              <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Loading search index…
            </div>
          )}

          {!isLoading && query && results.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No results for <span className="font-semibold text-foreground">&ldquo;{query}&rdquo;</span>
            </div>
          )}

          {!isLoading && !query && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Start typing to search across all 90 lessons, flashcard decks, and the glossary.
            </div>
          )}

          {!isLoading && results.length > 0 && (
            <ul role="listbox" aria-label="Search results" className="py-2">
              {results.map((entry, idx) => (
                <li key={entry.id} role="option" aria-selected={idx === selectedIdx}>
                  <button
                    type="button"
                    onClick={() => navigateTo(entry)}
                    onMouseEnter={() => dispatch({ type: 'SELECT_IDX', idx })}
                    className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                      idx === selectedIdx ? 'bg-primary/10' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="mt-0.5">
                      <TypeIcon type={entry.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {entry.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          Lesson {entry.lessonNumber} · {MODULE_NAMES[entry.moduleName] ?? entry.moduleName}
                        </span>
                      </div>
                      {entry.snippet && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {entry.snippet}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/50 mt-1 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
          <span>↑↓ navigate · Enter to open · Esc to close</span>
          <span className="font-medium">
            {results.length > 0 ? `${results.length} result${results.length !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
