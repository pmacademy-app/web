export interface SearchDoc {
  id: string
  type: 'lesson' | 'glossary' | 'flashcard'
  title: string
  snippet: string
  slug?: string
  moduleName?: string
  lessonNumber?: number
  tags?: string[]
}

let cachedIndex: SearchDoc[] | null = null

export async function fetchSearchIndex(): Promise<SearchDoc[]> {
  if (cachedIndex) return cachedIndex

  // Load from sessionStorage if available
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('pm-academy-search-index')
      if (stored) {
        cachedIndex = JSON.parse(stored)
        return cachedIndex!
      }
    } catch (e) {
      // ignore
    }
  }

  try {
    const res = await fetch('/content/search-index.json')
    if (!res.ok) return []
    const data: SearchDoc[] = await res.json()
    cachedIndex = data

    // Store in sessionStorage for faster future lookups
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('pm-academy-search-index', JSON.stringify(data))
      } catch (e) {
        // ignore (quota limit etc.)
      }
    }

    return data
  } catch {
    return []
  }
}

export function searchClientIndex(docs: SearchDoc[], query: string): SearchDoc[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const terms = q.split(/\s+/).filter(Boolean)

  return docs.filter((doc) => {
    const textToMatch = `${doc.title} ${doc.snippet} ${doc.moduleName || ''} ${(doc.tags || []).join(' ')}`.toLowerCase()
    return terms.every((term) => textToMatch.includes(term))
  }).slice(0, 15) // Top 15 results
}
