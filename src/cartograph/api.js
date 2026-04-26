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
