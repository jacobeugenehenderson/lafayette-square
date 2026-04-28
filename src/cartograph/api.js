const BASE = '/api/cartograph'

export async function fetchMarkers() {
  const res = await fetch(`${BASE}/markers`)
  return res.json()
}

export async function saveMarkers(strokes) {
  await fetch(`${BASE}/markers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(strokes),
  })
}

export async function fetchCenterlines() {
  const res = await fetch(`${BASE}/centerlines`)
  return res.json()
}

export async function fetchSkeleton() {
  const res = await fetch(`${BASE}/skeleton`)
  return res.json()
}

export async function fetchMeasurements() {
  const res = await fetch(`${BASE}/measurements`)
  return res.json()
}

export async function saveMeasurements(data) {
  await fetch(`${BASE}/measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// Operator-intent overlay: keyed by skelId, stores caps, couplers,
// measure, and segmentMeasures. Layered on top of the skeleton at load.
export async function fetchOverlay() {
  const res = await fetch(`${BASE}/overlay`)
  return res.json()
}

export async function saveOverlay(data) {
  await fetch(`${BASE}/overlay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function rebuild() {
  const res = await fetch(`${BASE}/rebuild`, { method: 'POST' })
  return res.json()
}

// Run the cartograph bake step — produces public/cartograph-ground.svg
// from the current ribbons.json. The server runs `node bake-svg.js` and
// returns timing + relative path. The cartograph's only publish artifact.
export async function bakeSvg() {
  const res = await fetch(`${BASE}/bake`, { method: 'POST' })
  if (!res.ok) throw new Error(`bake failed: ${res.status}`)
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

// Re-bake a specific Look's ground.svg from its design.json. Replaces the
// older bakeSvg() for the active-Look workflow.
export async function bakeLook(lookId) {
  const res = await fetch(`${BASE}/looks/${encodeURIComponent(lookId)}/bake`, { method: 'POST' })
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
