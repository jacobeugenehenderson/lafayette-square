const BASE = '/api/cartograph'

// Scene-aware route helper. The server accepts both /<verb> (default scene)
// and /<scene>/<verb> (explicit). Pass scene='lafayette-square' or 'toy'.
// Omitting scene falls through to the server's default-scene alias — kept
// for any caller that genuinely shouldn't care (currently none in the store
// after Phase 0c, but the alias keeps small CLIs / probes working).
function sceneUrl(scene, verb) {
  return scene ? `${BASE}/${encodeURIComponent(scene)}/${verb}` : `${BASE}/${verb}`
}

export async function fetchMarkers(scene) {
  const res = await fetch(sceneUrl(scene, 'markers'))
  return res.json()
}

export async function saveMarkers(strokes, scene) {
  await fetch(sceneUrl(scene, 'markers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(strokes),
  })
}

// The post-bake ribbons artifact (streets/intersections/faces/tiles). LS + toy
// ship this as a bundled vite import; a non-bundled scene (e.g. hipointe-demun)
// fetches it per-scene from the server instead of bloating the bundle.
export async function fetchRibbons(scene) {
  const res = await fetch(sceneUrl(scene, 'ribbons'))
  return res.json()
}

// The full derived map (buildings + land-use / paths / parking / barriers). LS
// bundles this as a static import; a non-bundled scene fetches it per-scene for
// the Designer building + land-use overlay.
export async function fetchMap(scene) {
  const res = await fetch(sceneUrl(scene, 'map'))
  return res.json()
}

export async function fetchCenterlines(scene) {
  const res = await fetch(sceneUrl(scene, 'centerlines'))
  return res.json()
}

export async function fetchSkeleton(scene) {
  const res = await fetch(sceneUrl(scene, 'skeleton'))
  return res.json()
}

export async function fetchMeasurements(scene) {
  const res = await fetch(sceneUrl(scene, 'measurements'))
  return res.json()
}

export async function saveMeasurements(data, scene) {
  await fetch(sceneUrl(scene, 'measurements'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// Operator-intent overlay: keyed by skelId, stores caps, couplers,
// measure, and segmentMeasures. Layered on top of the skeleton at load.
export async function fetchOverlay(scene) {
  const res = await fetch(sceneUrl(scene, 'overlay'))
  return res.json()
}

export async function saveOverlay(data, scene) {
  await fetch(sceneUrl(scene, 'overlay'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function rebuild() {
  const res = await fetch(`${BASE}/rebuild`, { method: 'POST' })
  return res.json()
}

// ── Looks ──────────────────────────────────────────────────────────────────
// A Look is a styling snapshot: a complete material palette + its baked SVG.
// Geometry (centerlines, measures, caps, couplers) is shared across Looks
// and lives in overlay.json — Looks vary *styling*, not shape.

export async function fetchLooks() {
  const res = await fetch(`${BASE}/looks`)
  if (!res.ok) throw new Error(`fetch looks failed: ${res.status}`)
  return res.json()
}

export async function fetchLookDesign(lookId) {
  const res = await fetch(`${BASE}/looks/${encodeURIComponent(lookId)}/design`)
  if (!res.ok) throw new Error(`fetch look design failed: ${res.status}`)
  return res.json()
}

export async function saveLookDesign(lookId, design) {
  const res = await fetch(`${BASE}/looks/${encodeURIComponent(lookId)}/design`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(design),
  })
  if (!res.ok) throw new Error(`save look design failed: ${res.status}`)
  return res.json()
}

// Autosave the frozen SHAPE artifact — the Section-enabling freeze (the
// per-tile curb/corner silhouette). Written on Survey-exit (WALL.md §4
// "freeze at Survey-exit"), decoupled from the heavy slab bake. Section
// opens it via shape.json. `artifact` = the `_shapeArtifact` from the live
// Survey build (WYSIWYG: freeze exactly what Survey rendered).
export async function saveShapeFreeze(artifact, scene) {
  const res = await fetch(sceneUrl(scene, 'shape'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(artifact),
  })
  if (!res.ok) throw new Error(`freeze shape failed: ${res.status}`)
  return res.json()
}

// Re-bake a specific Look's bundle (ground.json + bin + lightmap +
// buildings + lamps + scene) from its design.json. Pass `force: true`
// to bypass the server's dirty-check and rebuild every step (the
// cache-bust escape hatch).
export async function bakeLook(lookId, { force = false } = {}) {
  const url = `${BASE}/looks/${encodeURIComponent(lookId)}/bake${force ? '?force=1' : ''}`
  const res = await fetch(url, { method: 'POST' })
  // 409 = the server's per-look lock: a bake is already running for this Look
  // (a concurrent request, a second tab, a fast re-fire). It is BENIGN — the
  // running bake will finish — so surface a friendly, tagged error instead of
  // the scary "bake look failed: 409". runBake treats BAKE_IN_PROGRESS gently.
  if (res.status === 409) {
    const err = new Error('A bake is already running for this Look — give it a moment.')
    err.code = 'BAKE_IN_PROGRESS'
    throw err
  }
  if (!res.ok) throw new Error(`bake look failed: ${res.status}`)
  return res.json()
}

// Create a new Look. Body: { name, fromLookId? } — fromLookId seeds the new
// Look's design.json (defaults to the active/default Look). Returns { id }.
export async function createLook({ name, fromLookId }) {
  const res = await fetch(`${BASE}/looks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, fromLookId }),
  })
  if (!res.ok) throw new Error(`create look failed: ${res.status}`)
  return res.json()
}

export async function deleteLook(lookId) {
  const res = await fetch(`${BASE}/looks/${encodeURIComponent(lookId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`delete look failed: ${res.status}`)
  return res.json()
}
