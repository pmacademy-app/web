'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  X,
  BookOpen,
  FileText,
  Layers,
  ArrowRight,
  GraduationCap,
  Trophy,
  Zap,
  BarChart3,
  Settings,
  Sparkles,
} from 'lucide-react'
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
  activeCategory: 'all' | 'lesson' | 'glossary' | 'quiz'
}

type Action =
  | { type: 'RESET' }
  | { type: 'SET_INDEX'; entries: SearchEntry[] }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_CATEGORY'; category: 'all' | 'lesson' | 'glossary' | 'quiz' }
  | { type: 'SET_RESULTS'; results: SearchEntry[]; selectedIdx: number }
  | { type: 'SELECT_IDX'; idx: number }

const INITIAL: State = {
  query: '',
  results: [],
  selectedIdx: 0,
  index: null,
  activeCategory: 'all',
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET':
      return { ...state, query: '', results: [], selectedIdx: 0, activeCategory: 'all' }
    case 'SET_INDEX':
      return { ...state, index: action.entries }
    case 'SET_QUERY':
      return { ...state, query: action.query, selectedIdx: 0 }
    case 'SET_CATEGORY':
      return { ...state, activeCategory: action.category, selectedIdx: 0 }
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

function searchEntries(
  entries: SearchEntry[],
  query: string,
  category: 'all' | 'lesson' | 'glossary' | 'quiz'
): SearchEntry[] {
  if (!query.trim()) return []
  const q = query.toLowerCase().trim()
  const terms = q.split(/\s+/).filter(Boolean)

  const filtered = category === 'all' ? entries : entries.filter((e) => e.type === category)

  const scored = filtered.map((entry) => {
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
    .slice(0, 16)
    .map((s) => s.entry)
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

const QUICK_LINKS = [
  {
    label: 'PM Curriculum',
    description: 'All 90 structured lessons across 9 modules',
    href: '/academy',
    icon: GraduationCap,
  },
  {
    label: 'Milestones & Badges',
    description: 'Track mastery credentials and progress achievements',
    href: '/badges',
    icon: Trophy,
  },
  {
    label: 'Review Hub',
    description: 'Spaced repetition flashcards & retention review',
    href: '/review',
    icon: Zap,
  },
  {
    label: 'Cohort Leaderboard',
    description: 'Compare weekly XP and study activity',
    href: '/leaderboard',
    icon: BarChart3,
  },
]

const POPULAR_SEARCHES = [
  'Jobs to Be Done',
  'Product Strategy',
  'PRD Writing',
  'A/B Testing',
  'User Research',
  'Growth Loops',
  'Technical Fluency',
]

// ─── SearchOverlay ────────────────────────────────────────────────────────────

export function SearchOverlay() {
  const { isOpen, closeSearch } = useSearch()
  const router = useRouter()
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const { query, results, selectedIdx, index, activeCategory } = state

  const inputRef = useRef<HTMLInputElement>(null)
  const prevOpenRef = useRef(false)

  const isLoading = isOpen && index === null

  // Lazy-load search index on open
  useEffect(() => {
    if (!isOpen || index !== null) return
    let cancelled = false
    loadSearchIndex().then((entries) => {
      if (!cancelled) dispatch({ type: 'SET_INDEX', entries })
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, index])

  // Focus and reset when opening
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      dispatch({ type: 'RESET' })
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    prevOpenRef.current = isOpen
  }, [isOpen])

  // Search execution
  useEffect(() => {
    if (!index) return
    const found = searchEntries(index, query, activeCategory)
    dispatch({ type: 'SET_RESULTS', results: found, selectedIdx: 0 })
  }, [query, index, activeCategory])

  const navigateTo = useCallback(
    (entry: SearchEntry) => {
      closeSearch()
      router.push(`/academy/${entry.moduleName}/${entry.lessonId}`)
    },
    [closeSearch, router]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
    },
    [results, selectedIdx, navigateTo, closeSearch]
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 pt-16 sm:pt-4"
      aria-modal="true"
      role="dialog"
      aria-label="Search curriculum"
    >
      {/* High-grade ambient backdrop with subtle blur */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs transition-opacity duration-200"
        onClick={closeSearch}
        aria-hidden="true"
      />

      {/* Modern Command Palette Panel */}
      <div className="relative w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Seamless Search Input Bar */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-border bg-card">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Search className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            id="search-overlay-input"
            type="text"
            value={query}
            onChange={(e) => dispatch({ type: 'SET_QUERY', query: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="Search 90 lessons, flashcard decks, glossary…"
            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
            className="flex-1 bg-transparent text-sm sm:text-base text-foreground placeholder:text-muted-foreground outline-none ring-0 border-0 p-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            aria-label="Search query"
            autoComplete="off"
            spellCheck="false"
          />

          {query && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_QUERY', query: '' })}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground bg-muted border border-border rounded-md shadow-xs">
            ESC
          </kbd>
        </div>

        {/* Category Pills Bar (when query is present) */}
        {query && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/60 bg-muted/20 text-xs overflow-x-auto">
            <span className="text-[10px] font-mono uppercase font-bold text-muted-foreground mr-1">
              Filter:
            </span>
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'lesson', label: 'Lessons' },
                { id: 'glossary', label: 'Glossary' },
                { id: 'quiz', label: 'Quizzes' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => dispatch({ type: 'SET_CATEGORY', category: cat.id })}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Content Body */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground gap-2.5">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span>Indexing curriculum resources…</span>
            </div>
          )}

          {/* Empty State: Quick Jumps & Popular Searches */}
          {!isLoading && !query && (
            <div className="p-4 sm:p-5 space-y-5">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground mb-2.5 px-1">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Quick Destinations</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {QUICK_LINKS.map((link) => (
                    <button
                      key={link.href}
                      type="button"
                      onClick={() => {
                        closeSearch()
                        router.push(link.href)
                      }}
                      className="flex items-start gap-3 p-3 rounded-xl border border-border/70 hover:border-primary/40 bg-card hover:bg-muted/40 transition-all text-left group/item cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover/item:scale-105 transition-transform mt-0.5">
                        <link.icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-foreground group-hover/item:text-primary transition-colors flex items-center justify-between">
                          <span>{link.label}</span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover/item:opacity-100 group-hover/item:translate-x-0.5 transition-all" />
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-1 mt-0.5">
                          {link.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-border/60">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  Suggested Topics
                </div>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {POPULAR_SEARCHES.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => dispatch({ type: 'SET_QUERY', query: topic })}
                      className="px-2.5 py-1 rounded-lg text-xs bg-muted/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 border border-border/60 transition-colors cursor-pointer"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* No Results */}
          {!isLoading && query && results.length === 0 && (
            <div className="py-14 text-center px-4 space-y-2">
              <p className="text-sm font-medium text-foreground">No matches found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No lessons or glossary entries match &ldquo;{query}&rdquo;. Try searching for core
                concepts like &ldquo;PRD&rdquo;, &ldquo;Discovery&rdquo;, or &ldquo;Metrics&rdquo;.
              </p>
            </div>
          )}

          {/* Results List */}
          {!isLoading && results.length > 0 && (
            <ul role="listbox" aria-label="Search results" className="py-1 divide-y divide-border/40">
              {results.map((entry, idx) => {
                const isSelected = idx === selectedIdx
                return (
                  <li key={entry.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => navigateTo(entry)}
                      onMouseEnter={() => dispatch({ type: 'SELECT_IDX', idx })}
                      className={`w-full flex items-start gap-3.5 px-4 sm:px-5 py-3 text-left transition-colors cursor-pointer border-l-2 ${
                        isSelected
                          ? 'bg-primary/10 border-primary'
                          : 'border-transparent hover:bg-muted/40'
                      }`}
                    >
                      <div className="mt-0.5 w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                        {entry.type === 'lesson' ? (
                          <BookOpen className="w-3.5 h-3.5 text-primary" />
                        ) : entry.type === 'glossary' ? (
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                        ) : (
                          <Layers className="w-3.5 h-3.5 text-amber-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                            {entry.title}
                          </span>
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground">
                            Lesson {entry.lessonNumber} · {MODULE_NAMES[entry.moduleName] ?? entry.moduleName}
                          </span>
                        </div>
                        {entry.snippet && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {entry.snippet}
                          </p>
                        )}
                      </div>

                      {isSelected ? (
                        <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0 mt-0.5">
                          ↵ Open
                        </kbd>
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 mt-1 shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
