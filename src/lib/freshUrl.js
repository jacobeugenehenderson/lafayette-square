/**
 * freshUrl — a URL for the asset host that its edge has never cached: our own reads of what is IN THE BUCKET (the
 * uploader's dirty check and index read, verify, the prod-slab backup, the compression gate) must never get the
 * edge's copy. ⭐ The query is unique per call: R2 ignores it, and the edge's cache key includes it.
 * ⛔ Measured on assets.theward.online (2026-10-30): a request's `cache-control: no-cache`, `max-age=0`, `pragma` and
 * fetch's `cache: 'no-store'` are all ignored by the edge (a cached .png stayed HIT); a fresh query is a MISS, the
 * same query again a HIT, so it may never be reused. Today HEADs answer DYNAMIC and .json is not cached at all —
 * neither is promised, so no reader leans on them. Visitors' reads are not this: they go by content names.
 * ▶ node checks/claims-our-reads-bypass-the-edge.mjs --mutants
 */
export const freshUrl = (url) => `${url}${url.includes('?') ? '&' : '?'}fresh=${crypto.randomUUID()}`
