import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

import { RouteError, withRoute } from '@/lib/api/with-route'

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

/**
 * Public: the search index is compiled lesson metadata served to the curriculum
 * search box, and it is cached at the edge for an hour. Requiring a session here
 * would make every response private and defeat that cache.
 */
export const GET = withRoute(
  {
    actor: { allow: ['anonymous', 'learner', 'admin'] },
    operation: 'search_index.read',
    summary: 'Unexpected failure serving the search index',
  },
  async () => {
    const raw = await getCachedSearchIndex()

    if (!raw) {
      throw new RouteError(404, 'NOT_FOUND', 'Search index not found')
    }

    return new NextResponse(raw, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
      },
    })
  }
)
