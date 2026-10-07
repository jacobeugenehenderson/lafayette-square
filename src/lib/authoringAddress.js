/**
 * WHERE AM I — the authoring page's one answer (Phase 2 A, 2026-10-04).
 *
 * An authoring page (`<meta name="ward-authoring">`: Designer/Stage, Preview) is addressed by `?scene=&look=&shot=`, or —
 * for Stage — by the clean path `/stage/<town>/<shot>` (`?look=` only when it is not the town's own; `stagePath`),
 * and remembers the same three in localStorage. Two readers used to answer "which town is this page" from them
 * separately — `src/instance.js#readLookParam` at module load, the cartograph store's `_loadLooks` once the index came
 * back — and Preview parsed `?look=` a third time. They disagreed on a refused link (the page wore the `?look=` town
 * while the store opened none) and on a town with no Look (the page wore the stored Look's town). Now both call this.
 *
 * ⭐ The steps are sequential: wherever the operator lands, the preceding step's bake is assumed done. Stage's slab-age
 * bar (`_measureSlabAge`) is what makes that assumption visible when it is false.
 * ▶ OPERATIONS.md §"Open Stage by URL" · node checks/claims-a-look-link-opens-that-town.mjs
 */

export const ADDRESS_STORAGE = { scene: 'cartograph-scene', look: 'cartograph-active-look', shot: 'cartograph-shot' }

export const isValidMapId = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s)

/** `/stage/<town>[/<shot>]` → { scene, shot } (a bare town opens on Hero, the opening keyframe), else null. */
export function parseStagePath(pathname) {
  const m = /^\/stage\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname || '')
  return m ? { scene: decodeURIComponent(m[1]), shot: m[2] ? decodeURIComponent(m[2]) : 'hero' } : null
}

/**
 * The clean Stage address for a town and shot: `/stage/<town>/<shot>`, plus `?look=` only when the Look is not the one
 * the town opens on (`lookForScene`). Built here, beside its reader, so the two cannot disagree.
 */
export function stagePath(looks, { scene, lookId, shot }) {
  const own = lookForScene(looks, scene, null)
  return `/stage/${encodeURIComponent(scene)}/${encodeURIComponent(shot)}${lookId && lookId !== own ? `?look=${encodeURIComponent(lookId)}` : ''}`
}

/**
 * The page's address for where it is: a Stage shot → `/stage/<town>/<shot>` (`stagePath`); the Designer or Extent →
 * `/cartograph?scene=&look=&shot=`. Same app either way. Other query parameters (inspection flags) are kept.
 * The one builder for every writer (the address effect, the town-switch reload), so none writes a stale form.
 */
export function addressUrl(href, looks, { scene, lookId, shot, stage }) {
  const url = new URL(href)
  for (const k of ['scene', 'look', 'shot']) url.searchParams.delete(k)
  if (stage && scene && shot) {
    const clean = new URL(stagePath(looks, { scene, lookId, shot }), url.origin)
    url.pathname = clean.pathname
    clean.searchParams.forEach((v, k) => url.searchParams.set(k, v))
    return url
  }
  url.pathname = '/cartograph'
  for (const [k, v] of [['scene', scene], ['look', lookId], ['shot', shot]]) if (v) url.searchParams.set(k, v)
  return url
}

/** The address as written: the URL's three and the remembered three. Nothing is resolved here. */
export function readAddress() {
  const url = { scene: null, look: null, shot: null }
  const stored = { scene: null, look: null, shot: null }
  try {
    const q = new URLSearchParams(window.location.search)
    for (const k of Object.keys(url)) url[k] = q.get(k) || null
    // ⭐ The path names the town and shot; `?look=` may still name another Look of it. ⛔ A query that names a
    // different town or shot than the path is the path's to answer: said, and ignored.
    const p = parseStagePath(window.location.pathname)
    if (p) {
      for (const k of ['scene', 'shot']) if (url[k] && url[k] !== p[k]) console.error(`[address] ⛔ ?${k}=${url[k]} disagrees with the path's "${p[k]}" — the path wins`)
      url.scene = p.scene; url.shot = p.shot
    }
  } catch { /* no window: a node importer */ }
  try {
    for (const [k, key] of Object.entries(ADDRESS_STORAGE)) stored[k] = localStorage.getItem(key) || null
  } catch { /* no storage */ }
  return { url, stored }
}

/** The Look a scene opens on: the remembered Look when it is that scene's, else its first. None ⇒ null. */
export function lookForScene(looks, scene, lookId) {
  const own = looks.filter(l => l.scene === scene)
  return (own.find(l => l.id === lookId) || own[0])?.id || null
}

/**
 * Which town and Look the address names, against the Looks index.
 * → { scene, lookId, refused, missing, dropped }
 *   refused — a `?look=` that names no Look, or whose town disagrees with `?scene=`: NO town, and this says why.
 *   missing — the scene no Look belongs to (its Designer edits have nowhere to save).
 *   dropped — a remembered Look the index no longer has (it resolves nothing).
 * ⛔ Never a default town: nothing named and nothing remembered resolves to no town.
 */
export function resolveTown(looks, { url, stored }) {
  if (url.look) {
    const entry = looks.find(l => l.id === url.look)
    const refused = !entry ? `?look=${url.look} names no Look in the index (have: ${looks.filter(l => l.scene).map(l => l.id).join(', ')})`
      : (url.scene && entry.scene !== url.scene) ? `?look=${url.look} is ${entry.scene ? `a Look of "${entry.scene}"` : 'the town-less kit default'}, but ?scene=${url.scene} asks for another town`
      : null
    if (refused) return { scene: null, lookId: null, refused, missing: url.scene || url.look, dropped: null }
    return { scene: entry.scene || null, lookId: url.look, refused: null, missing: null, dropped: null }
  }
  const dropped = stored.look && !looks.some(l => l.id === stored.look) ? stored.look : null
  const storedLook = dropped ? null : stored.look
  const scene = isValidMapId(url.scene) ? url.scene
    : isValidMapId(stored.scene) ? stored.scene
    : looks.find(l => l.id === storedLook)?.scene || null
  if (!scene) return { scene: null, lookId: storedLook, refused: null, missing: null, dropped }
  const lookId = lookForScene(looks, scene, storedLook)
  return { scene, lookId, refused: null, missing: lookId ? null : scene, dropped }
}
