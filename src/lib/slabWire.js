/**
 * slabWire — WHAT A FILE IS ON THE WIRE: its content type and how it is stored, for the uploaders and both Workers.
 * (BRIEF-the-slab-ships-compressed, 2026-10-30.) One table, read by `scripts/upload-baked-to-r2.mjs` (what it stores),
 * `scripts/verify-baked-in-r2.mjs` (what it expects back), `scripts/promote-player-to-prod.mjs` (the type it writes) and
 * `workers/{production,staging}-sites#serve` (what they send). ⛔ No second copy of "which files compress".
 *
 * ⭐ HOW A TYPE TRAVELS — a property of the TYPE, never a list of file names:
 *   · EDGE   — Cloudflare compresses it on the way out by default (developers.cloudflare.com/speed/optimization/
 *              content/compression: the default content-type list). Stored raw; the edge picks zstd/br/gzip per visitor.
 *   · PACKED — the format carries its own compression (png, jpg, webp, woff, woff2; ktx2 as the kit bakes it,
 *              supercompressed — measured: brotli takes a PTown ktx2 to 100%). Stored raw; compressing again buys nothing.
 *   · 'br'   — neither: nothing on the way would compress it (application/octet-stream is not on the edge's list), so it
 *              is STORED brotli with `content-encoding: br` in its R2 metadata and served as stored. PTown's six .bin were
 *              85.86 MB on the wire uncompressed (Ward, 2026-10-30).
 * A visitor whose browser does not take br gets the body decoded at the edge (cache/reference/etag-headers; seen on the
 * staging host in the one-object trial: identity and gzip clients got the raw bytes, weak ETag).
 * ⛔ Storing a body encoded makes R2's ETag and content-length the ENCODED bytes'. Whatever compares them (the uploader's
 * dirty check, verify, the prod-slab backup) compares against `encodeForWire`'s bytes — and must ask with
 * `accept-encoding: br`, or the edge answers decoded with a weak ETag and no length. The manifest keeps the RAW bytes and
 * sha256: a content name is the content's, whatever it is stored as.
 * ▶ node checks/claims-the-slab-ships-compressed.mjs
 */

const EDGE = 'edge', PACKED = 'packed', BR = 'br'

/** ext → [content-type, how it travels]. An extension not here is application/octet-stream, stored br. */
const TYPES = {
  html: ['text/html; charset=utf-8', EDGE], js: ['text/javascript; charset=utf-8', EDGE],
  mjs: ['text/javascript; charset=utf-8', EDGE], css: ['text/css; charset=utf-8', EDGE],
  json: ['application/json; charset=utf-8', EDGE], map: ['application/json', EDGE],
  svg: ['image/svg+xml', EDGE], txt: ['text/plain; charset=utf-8', EDGE], ico: ['image/x-icon', EDGE],
  ttf: ['font/ttf', EDGE], wasm: ['application/wasm', EDGE],
  png: ['image/png', PACKED], jpg: ['image/jpeg', PACKED], jpeg: ['image/jpeg', PACKED], webp: ['image/webp', PACKED],
  woff: ['font/woff', PACKED], woff2: ['font/woff2', PACKED], ktx2: ['image/ktx2', PACKED],
  glb: ['model/gltf-binary', BR], bin: ['application/octet-stream', BR],
}
const OTHER = ['application/octet-stream', BR]
const entryOf = (path) => TYPES[(String(path).split('/').pop().split('.').pop() || '').toLowerCase()] || OTHER

/** The content type a file is stored and served under. */
export const typeFor = (path) => entryOf(path)[0]

/** 'br' when the file is stored brotli-encoded, else null (stored raw: the edge or the format compresses it). */
export const storedEncodingFor = (path) => (entryOf(path)[1] === BR ? BR : null)

/** The accept-encoding to read a stored object back with, so the answer is the stored bytes (length, strong ETag). */
export const readBackEncoding = (path) => (storedEncodingFor(path) || 'identity')

/** The brotli quality a stored body is written at (Boz/Jacob, 2026-10-30: br-5 — PTown's bins 85.86 → 29.96 MB in
 *  2.2 s; br-11 is 24.76 MB in 347 s, a later follow-up cached by sha at bake time). */
export const BR_QUALITY = 5

/**
 * The response headers a Worker sends for an R2 object: its stored type (else the table's) and, when the object was
 * stored encoded, that encoding. An object stored without one says nothing about encoding.
 */
export function wireHeaders(obj) {
  const h = { 'content-type': obj.httpMetadata?.contentType || typeFor(obj.key) }
  if (obj.httpMetadata?.contentEncoding) h['content-encoding'] = obj.httpMetadata.contentEncoding
  return h
}
