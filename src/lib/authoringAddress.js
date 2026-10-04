/**
 * WHERE AM I — the authoring page's one answer (Phase 2 A, 2026-10-04).
 *
 * An authoring page (`<meta name="ward-authoring">`: Designer/Stage, Preview) is addressed by `?scene=&look=&shot=`,
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

/** The address as written: the URL's three and the remembered three. Nothing is resolved here. */
export function readAddress() {
  const url = { scene: null, look: null, shot: null }
  const stored = { scene: null, look: null, shot: null }
  try {
    const q = new URLSearchParams(window.location.search)
    for (const k of Object.keys(url)) url[k] = q.get(k) || null
  } catch { /* no window: a node importer */ }
  try {
    for (const [k, key] of Object.entries(ADDRESS_STORAGE)) stored[k] = localStorage.getItem(key) || null
    if (stored.scene === 'neighborhood') stored.scene = 'lafayette-square'   // the legacy stored name of that one town
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
