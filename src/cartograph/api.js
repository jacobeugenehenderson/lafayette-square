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

// A scene's fixed-truth geography (lat/lon/tz/projection/bbox) and silhouette
// (neighborhood_boundary.json). Every installation carries its OWN — the kit
// loads them BY ID so no module has to name a specific neighborhood.
export async function fetchGeography(scene) {
  // Cache-bust: after a re-fetch the geography.json is rewritten, and a stale
  // cached copy would put the aerial in a different frame than the fresh skeleton.
  const res = await fetch(`${sceneUrl(scene, 'geography')}?t=${Date.now()}`, { cache: 'no-store' })
  return res.json()
}
export async function fetchBoundary(scene) {
  const res = await fetch(sceneUrl(scene, 'boundary'))
  return res.json()
}

// Extent editor: the pre-skeleton street-label set (one per named street,
// local coords + `major` arterial flag). Extracted server-side from raw OSM
// so the client fetches a few KB, not the ~18 MB dump.
export async function fetchOsmLabels(scene) {
  const res = await fetch(sceneUrl(scene, 'osm-labels'))
  if (!res.ok) return { labels: [] }
  return res.json()
}

// Extent editor: ZIP → centroid (Zippopotam, keyless). Used only to JUMP the
// camera to the right area — the operator then frames the neighborhood by eye
// and fetches the framed view. No fetch/write here.
export async function geocodeZip(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`)
  if (!res.ok) throw new Error(`ZIP ${zip} not found`)
  const j = await res.json()
  const p = j.places && j.places[0]
  if (!p) throw new Error(`ZIP ${zip} has no centroid`)
  return { lat: parseFloat(p.latitude), lon: parseFloat(p.longitude) }
}

// Extent editor: the Phalanges over the operator-framed square — write
// geography (centered on the bbox) → fetch OSM → skeleton. Long-running.
export async function fetchExtent(scene, bbox) {
  const res = await fetch(sceneUrl(scene, 'fetch-extent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bbox }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `fetch-extent ${res.status}`)
  return j
}

// Extent editor: one street's geometry (corridor-aware) for the dropdown
// hover-preview — see where a candidate lies before selecting it.
export async function fetchStreetGeom(scene, name) {
  const res = await fetch(sceneUrl(scene, 'street-geom'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
  if (!res.ok) return { polylines: [] }
  return res.json()
}

// Extent editor: the extent DRAFT + metadata (name/blurb/sides/radius). Auto-
// saved from the panel; loaded on open to restore selections across reloads.
export async function fetchNeighborhood(scene) {
  const res = await fetch(`${sceneUrl(scene, 'neighborhood')}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return {}
  return res.json()
}
export async function saveNeighborhood(scene, data) {
  await fetch(sceneUrl(scene, 'neighborhood'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  })
}

// Extent editor: the one-click pour — pipeline (clipped to the boundary) →
// promote-ribbons → the map the Designer renders. Long-running.
export async function pourScene(scene) {
  const res = await fetch(sceneUrl(scene, 'pour'), { method: 'POST' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `pour ${res.status}`)
  return j
}

// Extent editor: the deliberate finalize — re-center to the centroid, reproject
// + skeleton, write the boundary circle + metadata. Long-running.
export async function commitExtent(scene, payload) {
  const res = await fetch(sceneUrl(scene, 'commit-extent'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `commit-extent ${res.status}`)
  return j
}

// Extent editor: corridor-collapsed aerial labels (skeleton-sourced, current-
// frame x/z). One label per corridor/street, `major` = arterial.
export async function fetchSkeletonLabels(scene) {
  const res = await fetch(sceneUrl(scene, 'skeleton-labels'))
  if (!res.ok) return { labels: [] }
  return res.json()
}

// Extent editor: the boundary-street dropdown pool — skeleton-sourced +
// corridor-collapsed ({ major, minor }, alphabetized). One entry per corridor
// (Big Bend Boulevard), not per directional segment.
export async function fetchStreetNames(scene) {
  const res = await fetch(sceneUrl(scene, 'street-names'))
  if (!res.ok) return { major: [], minor: [] }
  return res.json()
}

// Extent overlay / roster editor: every building footprint as a current-frame
// ring, tagged msbf-<id>. { buildings: [{ id, ring:[[x,z],…] }] }.
export async function fetchBuildingFootprints(scene) {
  const res = await fetch(sceneUrl(scene, 'building-footprints'))
  if (!res.ok) return { buildings: [] }
  return res.json()
}

// Roster editor: per-scene building membership overrides { activate:[], hide:[] }.
export async function fetchBuildingOverrides(scene) {
  const res = await fetch(sceneUrl(scene, 'building-overrides'))
  if (!res.ok) return { activate: [], hide: [] }
  return res.json()
}
export async function saveBuildingOverrides(scene, body) {
  const res = await fetch(sceneUrl(scene, 'building-overrides'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`save building-overrides ${res.status}`)
  return res.json()
}

// Extent editor: resolve the boundary corners from ordered side names via the
// scene's skeleton junctions (the real path — no marks). Returns
// { corners, centroid, radius, edges, closed }.
export async function fetchExtentCorners(scene, sides) {
  const res = await fetch(sceneUrl(scene, 'extent-corners'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sides }),
  })
  if (!res.ok) return { error: `extent-corners ${res.status}`, corners: [], edges: [] }
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
export async function createLook({ name, fromLookId, scene }) {
  const res = await fetch(`${BASE}/looks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, fromLookId, scene }),
  })
  if (!res.ok) throw new Error(`create look failed: ${res.status}`)
  return res.json()
}

export async function deleteLook(lookId) {
  const res = await fetch(`${BASE}/looks/${encodeURIComponent(lookId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`delete look failed: ${res.status}`)
  return res.json()
}
