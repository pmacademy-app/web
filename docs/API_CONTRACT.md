# API Contract — Pagination and Versioning

**Batch:** B13-B · **Status:** 🟢 Current · **Established:** 2026-09-17

This document is the answer to two questions B13-B was opened to settle: what a list
endpoint returns, and whether `/api/v2` means anything. Both were previously unstated,
and the absence showed — nine list endpoints with five different envelopes between them,
and a version prefix on four routes out of 128.

---

## 1. API versioning policy

> **This application has no API versioning scheme, and will not adopt one until a
> non-web client exists.**

### `/api/v2` is not a version boundary

Four routes sit under `/api/v2/`:

```
app/api/v2/lessons/[lessonId]/feedback/route.ts
app/api/v2/lessons/[lessonId]/progress/route.ts
app/api/v2/lessons/[lessonId]/quiz/route.ts
app/api/v2/lessons/[lessonId]/theory-read/route.ts
```

They are an artifact of a **data** migration, not an API version. Migration
`20260802000001` renamed `lesson_slug` to `lesson_id` and moved the curriculum onto
stable `les_XXXXXX` identifiers; the routes that read the new column were written
alongside the old slug-based ones and marked `v2` to tell the pair apart during the
cutover. The cutover finished and the v1 routes were deleted.

**There is no `/api/lessons/[slug]/*` any more.** `/v2` is therefore a version of
nothing — a label that outlived the thing it distinguished.

### What this means in practice

| Question | Answer |
|---|---|
| Where does a new route go? | `/api/<resource>` — unversioned, like the other 124 |
| Should `/api/v2/lessons/*` be renamed? | **No.** Renaming live routes is explicitly out of scope for B13-B, and the churn buys nothing while the only client is this app |
| Is `/v2` the "current version"? | No. It carries no version semantics and must not be extended |
| When do we get real versioning? | **D-04**, which the locked plan gates on **D-01** (mobile platform choice) |

### Why defer rather than decide

`docs/FINAL_IMPLEMENTATION_PLAN.md` already records this as **D-04 — "API versioning
policy · Only meaningful once a non-web client exists · Revisit when D-01 resolved"**,
and **D-01** defers the mobile platform choice with the instruction to *"build
client-agnostic contracts meanwhile; build no mobile-specific infrastructure now"*.

A versioning scheme chosen now would be chosen with no second client to serve, which is
how you get a scheme that fits nothing. What actually unblocks mobile is a *stable,
uniform* contract — which is the rest of this document, and what B13-A did to the session
model — not a prefix.

When D-01 resolves and a versioning scheme is genuinely needed, the options remain open:
a path prefix, an `Accept-Version` header, or dated versions. Nothing in the current
contract forecloses any of them.

### Rules that follow from this policy

1. **Do not add routes under `/api/v2/`.** New work goes at `/api/<resource>`.
2. **Do not treat the absence of a version as permission to break a contract.** Until a
   scheme exists, every route is effectively "v1 forever" to the deployed app — a
   breaking change must ship with its client, in the same deploy.
3. **Additive changes are safe**; removing or retyping a response field is not.

---

## 2. Pagination contract

Every list-returning endpoint uses the same request parameters, the same response
envelope, and the same server-side caps. The implementation is
`apps/web/lib/api/pagination.ts`.

### Request

| Parameter | Type | Default | Bound |
|---|---|---:|---|
| `limit` | integer | `20` (`DEFAULT_PAGE_SIZE`) | clamped to `1 … 100` (`MAX_PAGE_SIZE`) |
| `offset` | integer | `0` | clamped to `0 … 10000` (`MAX_OFFSET`) |

```
GET /api/notifications?limit=20&offset=40
```

A malformed value (`?limit=abc`) falls back to the default rather than returning 400 —
a broken client is not an attack, and a usable page is a friendlier answer than an
error. A value that is merely *too large* is clamped, never honoured.

### Response

```jsonc
{
  "items": [ /* … */ ],
  "pagination": {
    "limit":   20,      // the page size actually applied, after clamping
    "offset":  40,      // the offset actually applied, after clamping
    "total":   137,     // total matching rows, or null when not counted
    "hasMore": true     // whether another page exists
  }
}
```

**`total` is nullable by design.** It needs an exact `count` from PostgREST, which is a
second scan. An endpoint that cannot afford one reports `null` rather than passing off
`items.length` as a total — a confident lie a client would render as a page count.

**`hasMore` is always present.** It is what a "load more" control actually needs, and it
is answerable without a count: when `total` is known it is `offset + items.length <
total`; otherwise a short page is the signal that the last page was reached.

`limit` and `offset` are echoed back **as applied**, not as requested. A client that asks
for `limit=100000` gets `100`, and can see that it did.

### Why limit/offset rather than cursors

Cursors are more robust when rows shift between pages and cheaper at depth. They were not
chosen because the admin console renders page numbers and totals, which a cursor cannot
supply without the count query a cursor exists to avoid — and because the existing routes
already did offset arithmetic, making migration mechanical rather than a rewrite of every
consumer.

The envelope is additive-friendly: a `nextCursor` field can join `pagination` later
without breaking a client reading `limit`/`offset`/`total`.

### The cap is a security control

The roadmap states it directly: *"Pagination is also an abuse control — cap page size
server-side."*

An unbounded list endpoint is a cheap amplification primitive — one small request, an
arbitrarily large response, paid for by the server and the database. The clamp is
therefore **not** a default a caller may override. `clampPagination()` is exported
separately from the zod schema precisely so a route that reads `searchParams` by hand
still reaches the same bound; the clamp is the control, and the schema is a convenience
on top of it.

`MAX_OFFSET` exists for the same reason at the other end: an offset instructs the
database to count and discard that many rows, so an unbounded offset is a slow query
anyone can request. Past 10,000 rows deep, a filter is the right tool.

### Usage

```ts
import {
  clampPagination,
  paginated,
  toRange,
} from '@/lib/api/pagination'

export const GET = withRoute({ /* … */ }, async ({ request, actor }) => {
  const { searchParams } = new URL(request.url)
  const page = clampPagination({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  })
  const { from, to } = toRange(page)

  const { data, count } = await supabase
    .from('table')
    .select('*', { count: 'exact' })
    .range(from, to)

  return NextResponse.json(paginated(data ?? [], page, count))
})
```

`toRange()` exists because PostgREST's `.range()` is **inclusive at both ends**, so the
last index is `offset + limit - 1`. Getting that off by one returns one extra row on
every page — a defect that survives review because each page still looks right.

---

## 3. Endpoints on the contract

| Endpoint | Previous ad-hoc contract |
|---|---|
| `GET /api/notifications` | `page` + `limit`, capped at 50, envelope `items` |
| `GET /api/admin/contact` | hard-coded `.limit(100)`, no parameters, envelope `messages` |
| `GET /api/admin/emails/broadcasts` | `page` + `pageSize`, capped at 100, envelope `data` |
| `GET /api/admin/fellow-requests` | **unbounded**, envelope `requests` |
| `GET /api/admin/system/alerts` | `limit` only, capped at 100, envelope `alerts` |
| `GET /api/announcements/active` | **unbounded**, envelope `announcements` |

### Deliberately not on the contract

- **`GET /api/admin/search`** — a typeahead that returns at most 5 rows per category by
  construction. It is bounded, and paging a search-as-you-type box is not a thing anyone
  does. Left as is rather than fitted with an envelope it would never use.
- **Single-object endpoints** (`.single()` / `.maybeSingle()`) — not lists.
- **Server-side full reads** using `fetchAllRows()` from `lib/db/pagination.ts` — a
  different concern. That helper walks PostgREST's 1,000-row cap to build a *complete*
  internal answer (F-COR-2 / F-COR-4) and never reaches a client unpaged.
- **Cron routes** — no external caller, and their `errors` arrays are diagnostic output
  bounded by the size of the job.

---

## 4. Related

- `apps/web/lib/api/pagination.ts` — the implementation
- `apps/web/lib/__tests__/b13b-pagination-contract.test.ts` — the tests, including the
  clamp cases that are this batch's security tests
- `apps/web/lib/db/pagination.ts` — `fetchAllRows()`, the *server-side* complete-read
  helper; unrelated to this contract
- `docs/AUTHENTICATION.md` §1 — the client-agnostic session model (B13-A), the other half
  of what makes a non-web client possible
- `docs/FINAL_IMPLEMENTATION_PLAN.md` — **D-01** (mobile platform) and **D-04** (API
  versioning), the deferrals this policy defers to
