/**
 * slabNames — how a slab file is NAMED where it is served. Pure: no fetch, no env, so the
 * player's resolver (`slabUrl.js`), the uploader and the sweep all read this one rule.
 *
 * ⭐ A SLAB FILE PUBLISHED UNDER ITS CONTENT. On disk and in every JSON cross-reference a file
 * keeps its plain name (`ground.json`, `trees/oak/skeleton-1-lod1.glb`). In R2 it is ALSO
 * written at `<dir>/<name>.<sha256[0..16]>.<ext>`, immutable: the name IS the bytes, so a
 * visitor holding an older manifest keeps resolving the files that manifest named, and a
 * re-publish never overwrites anything a page is reading. `manifest.json` is the one file
 * whose URL never changes — it is the switch. `docs/briefs/BRIEF-slab-loading.md §3` step 3.
 *
 * ⛔ THE MANIFEST SAYS WHICH NAMES ARE SERVED. The uploader stamps `names: HASHED` on the
 * manifest it publishes when (and only when) it has written every hashed key. Without the
 * stamp the town's objects are served at their plain names — the state of every town until
 * its first hashed upload. The stamp is the town's own statement about its own objects, not
 * a guess made by the player.
 */

/** The manifest's `names` value when every file is published under its content. */
export const HASHED = 'sha256-16'

/** Cache headers the uploader stores, and the Workers pass through. */
export const CACHE = {
  hashed: 'public, max-age=31536000, immutable',
  manifest: 'no-cache',
  plain: 'public, max-age=300, must-revalidate',
}

/** `trees/oak/a.albedo.ktx2` + sha → `trees/oak/a.albedo.<16 hex>.ktx2`. */
export function contentName(rel, sha256) {
  if (!/^[0-9a-f]{64}$/.test(sha256 || '')) throw new Error(`[slabNames] "${rel}": not a sha256: ${sha256}`)
  const slash = rel.lastIndexOf('/')
  const dot = rel.lastIndexOf('.')
  if (dot <= slash + 1) throw new Error(`[slabNames] "${rel}" has no extension — a slab file always has one`)
  return `${rel.slice(0, dot)}.${sha256.slice(0, 16)}${rel.slice(dot)}`
}

/**
 * The sha256 the manifest records for a slab-relative path: `files` (the slab), `content`
 * (`content/<file>`), or `photos` (by the photo's published `path`). ⛔ A path the manifest
 * does not name throws — a hashed town serves nothing under a name nobody recorded.
 */
export function shaOf(manifest, rel) {
  const f = manifest?.files?.[rel]
  if (f) return f.sha256
  if (rel.startsWith('content/')) {
    const c = manifest?.content?.[rel.slice('content/'.length)]
    if (c) return c.sha256
    for (const p of Object.values(manifest?.photos || {})) if (p && p.path === rel) return p.sha256
  }
  throw new Error(`[slabNames] "${manifest?.town}" manifest names no "${rel}" — re-run `
    + `node cartograph/bake-manifest.mjs --town=${manifest?.town ?? '<town>'}`)
}

/**
 * The served path, relative to `baked/<look>/`. `hashed` is whether the town's published
 * manifest carries `names: HASHED`. ⛔ A rel carrying a query or fragment throws: a version
 * token in a slab URL is the scheme this replaced.
 */
export function servedRel(manifest, rel, hashed) {
  if (!rel || /[?#]/.test(rel) || rel.startsWith('/')) {
    throw new Error(`[slabNames] "${rel}" is not a slab-relative path — no leading slash, no ?query`)
  }
  return hashed ? contentName(rel, shaOf(manifest, rel)) : rel
}

/**
 * A file named INSIDE the slab's JSON → slab-relative. Three spellings are in use: a bare name
 * (`ground.json#bin`), look-root (`trees.json`'s `/trees/<sp>/…glb`, the atlas's impostor pages)
 * and absolute (`trees-atlas.json#atlas.colorPath` = `/baked/<look>/…`). The cross-reference
 * stays LOGICAL on disk; only the resolver decides the served name.
 * ⛔ An absolute ref into ANOTHER look's slab throws — a town never draws another town's file.
 */
export function refRel(look, ref) {
  if (typeof ref !== 'string' || !ref || /^[a-z]+:/i.test(ref)) throw new Error(`[slabNames] not a slab reference: ${ref}`)
  const abs = ref.match(/^\/baked\/([^/]+)\/(.+)$/)
  if (abs) {
    if (abs[1] !== look) throw new Error(`[slabNames] "${look}" names "${ref}" — another look's slab`)
    return abs[2]
  }
  return ref.replace(/^\//, '')
}

/** Where a town's manifest is served: its one plain, never-renamed key. */
export const manifestPath = (look) => `baked/${look}/manifest.json`

/**
 * The served path of a slab file under the asset base: `baked/<look>/<name>`.
 *   · remote + the manifest says HASHED → the content name; never a query.
 *   · remote, not hashed → the plain name; never a query.
 *   · on disk → the plain name, plus `?bake=<reread>` when the caller has a re-read key: a re-bake
 *     rewrites the file under the SAME name, and r3f's useLoader / drei's useGLTF cache in memory
 *     by URL, so without it Stage keeps drawing the previous bake. A content name needs no key.
 */
export function slabPath(look, ref, { remote, manifest = null, hashed = false, reread = null } = {}) {
  if (!look || typeof look !== 'string') throw new Error(`[slabNames] no look — a slab file belongs to a town (got ${look})`)
  const rel = servedRel(manifest, refRel(look, ref), remote && hashed)
  const q = !remote && reread != null ? `?bake=${encodeURIComponent(reread)}` : ''
  return `baked/${look}/${rel}${q}`
}
