// curb-cut-evidence.mjs — WHERE A TOWN'S RECORDS SAY THE KERB DROPS (`BRIEF-corner-ramps-and-kerb §0a` item 8, §3 step 2).
//
// The rung between the operator and the town's norm (`curb-cut-norm.mjs`): a recorded curb cut. Built at derive,
// frozen on `ribbons.curbCutEvidence`, LANDED on the frozen curb at the freeze (`tileGround.js#landCurbCutEvidence`),
// read per corner by Section (`curbCutsOnJunctionCorners`).
//
// ⭐ THE RECORD — the contract a city's file fills unchanged (NYC `CURB_CUT`, `BRIEF-nyc-adapter` step 5):
//   { source, osmId, kind, crossing, crossed: [skelId…], ray: [[x, z]…] }
//     source   — 'osm:kerb' here; a city file names itself
//     kind     — the kerb at that point: 'lowered' · 'flush' · 'no' (a drop) · 'raised' (no drop) · anything else
//                is carried as recorded and read as unreadable
//     crossed  — the road the cut serves, by IDENTITY (skeleton chains carrying the crossed way's OSM id)
//     ray      — from the crossed road's centreline node OUT to the recorded point, along the record's own line.
//                The freeze walks it, extended along its last segment, to the first frozen curb it meets.
//   ⛔ A city record with no ray (a polygon at the kerb) needs its own binder — the adapter's job, not invented here.
//
// ⭐ OSM, BY IDENTITY ONLY: a kerb node (`raw/osm_kerbs.json`, `fetch-kerbs.mjs`) binds to a `footway=crossing` way in
// `raw/osm.json` because it IS one of that way's vertices (the same OSM node: exact lon/lat, both rounded to 1e-7°).
// The crossing's ONE interior vertex shared with a road way names the road it crosses. Nothing is matched by distance.
// ⛔ Every node that cannot be bound is COUNTED by cause, never dropped quietly:
//   notOnCrossing        — a kerb node on no crossing way (a driveway, a mid-block kerb)
//   notOneRoadNode       — its crossing shares 0 or >1 interior vertices with roads (a divided road, a stub)
//   positionNotRecorded  — the kerb tag sits ON the crossing's road node: "this crossing's kerbs are lowered", with
//                          no position on either kerb. Counted as lowered; never used to place a cut (Boz, 2026-10-06).
//   roadNotInSkeleton    — the crossed way is in no skeleton chain's `sources`
// ▶ node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene>
import { existsSync, readFileSync } from 'fs'

export const ROAD = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service',
  'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'road', 'busway'])
const key = (lon, lat) => `${lon},${lat}`

// the raw OSM ways + the skeleton, indexed for identity binding (shared by both rungs)
function loadOsm(osmPath, skeletonPath) {
  const ways = JSON.parse(readFileSync(osmPath, 'utf8')).ground?.highway
  if (!Array.isArray(ways)) throw new Error(`${osmPath} has no ground.highway — OSM evidence cannot bind`)
  const streets = JSON.parse(readFileSync(skeletonPath, 'utf8')).streets || []
  const roadAt = new Map()           // lon,lat → OSM ids of the road ways through that node
  for (const w of ways) if (ROAD.has(w.tags?.highway)) for (const c of w.coords)
    (roadAt.get(key(c.lon, c.lat)) || roadAt.set(key(c.lon, c.lat), new Set()).get(key(c.lon, c.lat))).add(w.osmId)
  const crossingsAt = new Map()      // lon,lat → [{ way, i }] for every crossing way through that node
  for (const w of ways) if (w.tags?.footway === 'crossing') w.coords.forEach((c, i) =>
    (crossingsAt.get(key(c.lon, c.lat)) || crossingsAt.set(key(c.lon, c.lat), []).get(key(c.lon, c.lat))).push({ way: w, i }))
  const skelOf = new Map()           // OSM way id → skeleton chain ids
  for (const s of streets) for (const id of s.sources || []) (skelOf.get(id) || skelOf.set(id, new Set()).get(id)).add(s.id)
  // a crossing way's ONE interior road vertex and the chains it crosses; null + why when it has none, or several
  const crossed = (C) => {
    const inner = C.map((_, j) => j).filter(j => j > 0 && j < C.length - 1 && roadAt.has(key(C[j].lon, C[j].lat)))
    if (inner.length !== 1) return { why: 'notOneRoadNode' }
    const m = inner[0], S = [...new Set([...roadAt.get(key(C[m].lon, C[m].lat))].flatMap(id => [...(skelOf.get(id) || [])]))].sort()
    return S.length ? { m, crossed: S } : { why: 'roadNotInSkeleton' }
  }
  return { ways, crossingsAt, crossed }
}

/** Records + census for one scene. `kerbsPath` absent ⇒ `{ fetched: false }` — loud at the pour, never "none". */
export function buildCurbCutEvidence({ osmPath, kerbsPath, skeletonPath }) {
  if (!existsSync(kerbsPath)) return { fetched: false, file: kerbsPath, records: [], census: {} }
  const K = JSON.parse(readFileSync(kerbsPath, 'utf8'))
  if (!Array.isArray(K.nodes)) throw new Error(`${kerbsPath} has no \`nodes\` array — re-run fetch-kerbs.mjs`)
  const { crossingsAt, crossed } = loadOsm(osmPath, skeletonPath)

  const census = { nodes: K.nodes.length, byKind: {}, records: 0, notOnCrossing: 0, notOneRoadNode: 0, positionNotRecorded: 0, roadNotInSkeleton: 0 }
  const records = []
  for (const n of K.nodes) {
    const kind = n.tags?.kerb ?? 'unspecified'
    census.byKind[kind] = (census.byKind[kind] || 0) + 1
    const on = crossingsAt.get(key(n.lon, n.lat))
    if (!on) { census.notOnCrossing++; continue }
    for (const { way, i } of on) {
      const C = way.coords, X = crossed(C)
      if (X.why) { census[X.why]++; continue }
      const m = X.m
      if (i === m) { census.positionNotRecorded++; continue }
      const idx = i > m ? C.slice(m, i + 1) : C.slice(i, m + 1).reverse()
      records.push({ source: 'osm:kerb', osmId: n.osmId, kind, crossing: way.osmId, crossed: X.crossed, ray: idx.map(c => [c.x, c.z]) })
    }
  }
  census.records = records.length
  return { fetched: true, file: kerbsPath, fetchedAt: K.fetchedAt ?? null, records, census }
}

// ⭐ CROSSINGS AS CROSSWALK EVIDENCE (`BRIEF-corner-ramps-and-kerb §3` step 3; Boz, 2026-10-06). A `footway=crossing` way
// says where a crosswalk IS — its station along the street — never the cut's style (at a diagonal corner a square
// crosswalk also lands near the arc's end). Each crossing with ONE interior road vertex gives two rays, road node →
// each end; the freeze lands both on the frozen curb by ownership (`tileGround.js#landCrosswalkEvidence`).
// ⛔ Counted by cause: notOneRoadNode (a divided road, a stub) · roadNotInSkeleton.
export function buildCrosswalkEvidence({ osmPath, skeletonPath }) {
  const { ways, crossed } = loadOsm(osmPath, skeletonPath)
  const census = { crossings: 0, records: 0, notOneRoadNode: 0, roadNotInSkeleton: 0 }
  const records = []
  for (const w of ways) {
    if (w.tags?.footway !== 'crossing') continue
    census.crossings++
    const C = w.coords, X = crossed(C)
    if (X.why) { census[X.why]++; continue }
    const xz = (c) => [c.x, c.z]
    records.push({ source: 'osm:crossing', osmId: w.osmId, crossed: X.crossed,
                   rays: [C.slice(0, X.m + 1).reverse().map(xz), C.slice(X.m).map(xz)] })
  }
  census.records = records.length
  return { records, census }
}
