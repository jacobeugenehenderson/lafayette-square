/**
 * freshUrl — a URL the edge has never cached: our own reads of what we PUBLISHED (the uploader's dirty check and
 * index read, verify, the prod-slab backup, the compression gate, the player and kit copies, the sweep, Operations'
 * panel reads of a served town) must never get the edge's copy. ⛔ A player copy that read it pinned a stale build into
 * a live town (the check's ③). ⭐ The query is unique per call: R2 ignores it, and the edge's cache key includes it.
 * ⛔ Measured on assets.theward.online (2026-10-30): a request's `cache-control: no-cache`, `max-age=0`, `pragma` and
 * fetch's `cache: 'no-store'` are all ignored by the edge (a cached .png stayed HIT); a fresh query is a MISS, the
 * same query again a HIT, so it may never be reused. Today HEADs answer DYNAMIC and .json is not cached at all —
 * neither is promised, so no reader leans on them. Visitors' reads are not this: they go by content names.
 * ▶ node checks/claims-our-reads-bypass-the-edge.mjs --mutants
 */
export const freshUrl = (url) => `${url}${url.includes('?') ? '&' : '?'}fresh=${crypto.randomUUID()}`
