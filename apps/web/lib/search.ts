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
  try {
    const res = await fetch('/content/search-index.json')
    if (!res.ok) return []
    const data: SearchDoc[] = await res.json()
    cachedIndex = data
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
