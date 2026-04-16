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

export async function saveCenterlines(data) {
  await fetch(`${BASE}/centerlines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
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

export async function rebuild() {
  const res = await fetch(`${BASE}/rebuild`, { method: 'POST' })
  return res.json()
}
