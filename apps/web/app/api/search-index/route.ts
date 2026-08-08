import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/search-index
 *
 * Serves the pre-compiled FlexSearch-friendly search index produced by the
 * content compiler at `content/dist/search-index.json`.
 *
 * This route is intentionally not cached aggressively — the index is re-generated
 * on every `content:compile` run. A 1-hour CDN cache is sufficient for production.
 */
export async function GET() {
  try {
    const indexPath = path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'search-index.json')

    if (!fs.existsSync(indexPath)) {
      return NextResponse.json({ error: 'Search index not found' }, { status: 404 })
    }

    const raw = fs.readFileSync(indexPath, 'utf-8')

    return new NextResponse(raw, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 1 hour in CDN, 5 minutes in browser
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
      },
    })
  } catch (err) {
    console.error('[search-index] Failed to serve search index:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
