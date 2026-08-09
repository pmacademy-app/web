import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import fs from 'fs'
import path from 'path'

const getCachedSearchIndex = unstable_cache(
  async () => {
    const indexPath = path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'search-index.json')
    if (!fs.existsSync(indexPath)) {
      return null
    }
    return fs.readFileSync(indexPath, 'utf-8')
  },
  ['search-index-v1'],
  { revalidate: 3600, tags: ['search-index'] }
)

export async function GET() {
  try {
    const raw = await getCachedSearchIndex()

    if (!raw) {
      return NextResponse.json({ error: 'Search index not found' }, { status: 404 })
    }

    return new NextResponse(raw, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
      },
    })
  } catch (err) {
    console.error('[search-index] Failed to serve search index:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
