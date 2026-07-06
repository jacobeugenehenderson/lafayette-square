#!/usr/bin/env node
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { join, extname, dirname } from 'path'
import { spawn } from 'child_process'
import { DEFAULT_SCENE, sceneRawDir, sceneCleanDir } from './config.js'
import { writeIfChanged } from './io.js'

// Promise wrapper around spawn with shell: true. Matches execSync's
// command-string semantics + timeout option, but the event loop keeps
// serving other requests while the child runs — so `/api/cartograph/*`
// requests don't pend during a long bake.
function runShell(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      shell: true,
      stdio: 'inherit',
      cwd: opts.cwd,
      env: opts.env,
    })
    let timer = null
    if (opts.timeout) {
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Command timed out after ${opts.timeout}ms: ${cmd}`))
      }, opts.timeout)
    }
    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Command failed (code=${code}, signal=${signal}): ${cmd}`))
    })
  })
}

// Like runShell, but CAPTURES stdout/stderr and RESOLVES with the exit code
// instead of rejecting on non-zero — so git callers can inspect the result
// (e.g. "nothing to commit" is code 1, not an exception). Used by the Publish
// ceremony endpoints below.
function runCapture(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, cwd: opts.cwd, env: opts.env })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    let timer = null
    if (opts.timeout) timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Command timed out after ${opts.timeout}ms: ${cmd}`))
    }, opts.timeout)
    child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err) })
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

// ── Publish ceremony (DEV-ONLY) ────────────────────────────────────────────
// Preview's "Publish to Staging" / "Promote to Prod" buttons call the git
// endpoints below. They ship the baked slab the canon way — staging (its own
// URL) → verify → prod — per PREVIEW.md §0.2 (Preview is the publish gate) +
// OPERATIONS §Save→ship (strategy B). serve.js runs ONLY under `npm run dev`,
// never in the CI/prod build, so these endpoints simply don't exist in a
// deployed context — the live app can't reach them.
const STAGING_BRANCH = 'cartograph-looks-pass-ab'
const PROD_BRANCH = 'main'
const STAGING_SITE_URL = 'https://jacobeugenehenderson.github.io/lafayette-square-staging/'
const PROD_SITE_URL = 'https://lafayette-square.com/'
// The coherent slab set a publish commits (SLAB-CONTRACT §9): the per-look
// bundle + its source design + the registry + shared derived geometry/trees.
// SCOPED git pathspecs — a publish NEVER sweeps unrelated dirty files (e.g.
// in-flight authoring code under src/cartograph or src/components).
function slabPathspecs(id) {
  return [
    `public/baked/${id}`,
    `public/looks/${id}/design.json`,
    `public/looks/index.json`,
    `public/baked/default.json`,
    `src/data/ribbons.json`,
    `public/photos/og-preview.jpg`,   // the link-preview image (captured from Preview)
  ]
}

// Per-look bake lock. A double-click on the Stage button would otherwise
// kick off two simultaneous bakes against the same `public/baked/<id>/`
// directory; the second loses races against the first's writes.
const _bakesInFlight = new Set()

// Per-scene file resolver. Phase 0a only wires the default scene
// (lafayette-square) and toy through here; further scenes follow the same
// pattern. The raw/ + clean/ split inside each scene matches the existing
// LS layout (raw = OSM ingestion / authored input; clean = derived).
function sceneDataPaths(scene) {
  const raw = sceneRawDir(scene)
  const clean = sceneCleanDir(scene)
  return {
    raw, clean,
    markers:      join(clean, 'marker_strokes.json'),
    measurements: join(raw,   'measurements.json'),
    centerlines:  join(raw,   'centerlines.json'),
    skeleton:     join(clean, 'skeleton.json'),
    overlay:      join(clean, 'overlay.json'),
    map:          join(clean, 'map.json'),
    ribbons:      join(clean, 'ribbons.json'),
    // Per-installation fixed-truth, at the scene root (clean/.. = data/<scene>).
    geography:    join(clean, '..', 'geography.json'),
    boundary:     join(clean, '..', 'neighborhood_boundary.json'),
  }
}

// Default-scene aliases — preserved so the static-file serving path and
// the analyze() routine keep working without per-request scene plumbing.
// Per-scene routes resolve via sceneDataPaths(scene) instead.
const DEFAULT_PATHS = sceneDataPaths(DEFAULT_SCENE)
const DIR     = DEFAULT_PATHS.clean
const RAW     = DEFAULT_PATHS.raw
const MARKERS = DEFAULT_PATHS.markers
const MEASUREMENTS = DEFAULT_PATHS.measurements
const CENTERLINES  = DEFAULT_PATHS.centerlines
const SKELETON     = DEFAULT_PATHS.skeleton
const OVERLAY      = DEFAULT_PATHS.overlay
const PARCEL_FILE = join(import.meta.dirname, '..', 'scripts', 'raw', 'stl_parcels.json')

// mtime-based dirty check used by the bake chain. Returns true if any output
// is missing or any input is newer than the oldest output. Missing inputs
// are treated as mtime=0 (won't force a rebuild on their own); missing
// outputs always force a rebuild. Both inputs and outputs lists may include
// .js source paths so script edits invalidate downstream artifacts.
function needsRebuild(inputs, outputs) {
  const outMtimes = outputs.map(o => existsSync(o) ? statSync(o).mtimeMs : 0)
  if (outMtimes.some(t => t === 0)) return true
  const minOut = Math.min(...outMtimes)
  const inMtimes = inputs.map(i => existsSync(i) ? statSync(i).mtimeMs : 0)
  const maxIn = inMtimes.length ? Math.max(...inMtimes) : 0
  return maxIn > minOut
}
// ── Extent editor: OSM label extraction ─────────────────────────────────────
// One label per named street, from raw/osm.json's ground.highway (coords carry
// the scene's local x/z). Mirrors src/lib/streetLabels.js's placement (longest
// way per name → arclength-midpoint + local angle normalized to read L→R), but
// scene-agnostic and PRE-skeleton. `major` = the arterial classes a neighborhood
// is bounded on. Cached by file mtime (the 18 MB parse runs once per fetch).
const OSM_LABEL_MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
const _osmLabelCache = new Map()   // scene → { mtime, labels }
function computeLabelsFromOsm(osm) {
  const feats = (osm.ground && osm.ground.highway) || []
  const byName = new Map()
  for (const f of feats) {
    const name = f.tags && f.tags.name
    const coords = f.coords
    if (!name || !coords || coords.length < 2) continue
    const segLens = []
    let total = 0
    for (let i = 0; i < coords.length - 1; i++) {
      const L = Math.hypot(coords[i + 1].x - coords[i].x, coords[i + 1].z - coords[i].z)
      segLens.push(L); total += L
    }
    if (total === 0) continue
    const prev = byName.get(name)
    if (prev && prev._total >= total) continue
    let acc = 0, si = 0
    const half = total / 2
    for (; si < segLens.length - 1; si++) { if (acc + segLens[si] >= half) break; acc += segLens[si] }
    const t = segLens[si] > 0 ? (half - acc) / segLens[si] : 0
    const a = coords[si], b = coords[si + 1]
    let angle = Math.atan2(b.z - a.z, b.x - a.x)
    if (angle > Math.PI / 2) angle -= Math.PI
    if (angle < -Math.PI / 2) angle += Math.PI
    // Return the midpoint as lon/lat (frame-independent). The baked x/z here may
    // be in a STALE projection (fetched before a re-center), so the client
    // re-projects lon/lat through the LIVE geography — the same frame the aerial
    // uses — guaranteeing labels sit on their roads. Angle is translation-
    // invariant so the metric value is safe to pass through.
    byName.set(name, {
      name,
      lon: a.lon + (b.lon - a.lon) * t,
      lat: a.lat + (b.lat - a.lat) * t,
      angle,
      major: OSM_LABEL_MAJOR.has(f.tags.highway),
      cls: f.tags.highway,
      _total: total,
    })
  }
  return [...byName.values()].map(({ _total, ...l }) => l)
}
function getOsmLabels(scene) {
  const p = join(sceneRawDir(scene), 'osm.json')
  if (!existsSync(p)) return []
  const mtime = statSync(p).mtimeMs
  const cached = _osmLabelCache.get(scene)
  if (cached && cached.mtime === mtime) return cached.labels
  const labels = computeLabelsFromOsm(JSON.parse(readFileSync(p, 'utf-8')))
  _osmLabelCache.set(scene, { mtime, labels })
  return labels
}

// ── Extent editor: boundary corners from named sides (the REAL path) ─────────
// The corner between two consecutive boundary streets is a typed skeleton
// JUNCTION both streets pass through — the protocol's own intersection, not an
// ad-hoc raw-OSM segment crossing. Marks are not needed: the operator names the
// sides in order (reading them off the labeled aerial); the tool finds the
// junction where each consecutive pair meets, clusters near-duplicates, and
// returns the polygon + its area-weighted centroid (the neighborhood's
// geographic center) + a circumscribing radius. A pair that shares no junction
// returns no corner → the polygon won't close → the operator fixes the list by
// eye. Reads the CURRENT-frame skeleton (reproject-raw + skeleton must be fresh).
// Synthetic names the skeleton mints for UNNAMED vehicular ways ("primary_link
// 2", "motorway 3") — noise for a boundary picker. A REAL name (Forest Park
// Parkway, Daniel Boone Expressway) never matches, so named expressways/parkways
// — legit boundaries — are kept. (Filtering by highway CLASS wrongly dropped
// those; filter by the synthetic-name shape instead.)
const SYNTHETIC_NAME = /^(motorway|trunk|primary|secondary|tertiary)(_link)? \d+$/i
const _skelCache = new Map()   // scene → { mtime, skel }
function getSkeleton(scene) {
  const p = join(sceneCleanDir(scene), 'skeleton.json')
  if (!existsSync(p)) return null
  const mtime = statSync(p).mtimeMs
  const cached = _skelCache.get(scene)
  if (cached && cached.mtime === mtime) return cached.skel
  const skel = JSON.parse(readFileSync(p, 'utf8'))
  _skelCache.set(scene, { mtime, skel })
  return skel
}
function distPointToChains(j, chains) {
  let best = Infinity
  for (const s of chains) {
    const pts = s.points
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const dx = b.x - a.x, dz = b.z - a.z
      const len2 = dx * dx + dz * dz || 1
      let t = ((j.x - a.x) * dx + (j.z - a.z) * dz) / len2
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(j.x - (a.x + t * dx), j.z - (a.z + t * dz))
      if (d < best) best = d
    }
  }
  return best
}
const CORNER_EPS = 12       // a junction is "on" a street if within this (m)
const CORNER_CLUSTER = 45   // merge junctions closer than this into one corner
function computeExtentCorners(scene, sides) {
  const skel = getSkeleton(scene)
  if (!skel) return { error: `no skeleton.json for scene '${scene}'` }
  // Match by exact name OR by corridor (the directional-corridor kit link), so a
  // side named "Big Bend Boulevard" gathers both North + South Big Bend chains.
  const chainsOf = (nm) => skel.streets.filter(s => (s.name === nm || s.corridor === nm) && s.points && s.points.length >= 2)
  const junctions = skel.junctions.filter(j => j.degree >= 3)
  const edges = [], corners = []
  for (let i = 0; i < sides.length; i++) {
    const A = sides[i], B = sides[(i + 1) % sides.length]
    const cA = chainsOf(A), cB = chainsOf(B)
    const hits = (cA.length && cB.length)
      ? junctions.filter(j => distPointToChains(j, cA) < CORNER_EPS && distPointToChains(j, cB) < CORNER_EPS)
      : []
    // Cluster near-duplicate junctions (a complex/divided node splits into a few).
    const clusters = []
    for (const j of hits) {
      let put = false
      for (const cl of clusters) {
        if (Math.hypot(cl.x - j.x, cl.z - j.z) < CORNER_CLUSTER) {
          cl.x = (cl.x * cl.n + j.x) / (cl.n + 1); cl.z = (cl.z * cl.n + j.z) / (cl.n + 1); cl.n++; put = true; break
        }
      }
      if (!put) clusters.push({ x: j.x, z: j.z, n: 1 })
    }
    // Two long arterials can cross more than once (e.g. Big Bend × Clayton near
    // the neighborhood AND again far south). The boundary corner is the crossing
    // that bounds the neighborhood — nearest the framed center (origin = the
    // geography center = what the operator framed), not the biggest cluster.
    clusters.sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z))
    const corner = clusters.length ? { x: Math.round(clusters[0].x * 100) / 100, z: Math.round(clusters[0].z * 100) / 100 } : null
    edges.push({ from: A, to: B, corner, candidates: clusters.length })
    if (corner) corners.push(corner)
  }
  // Area-weighted polygon centroid — the geographic center of the shape.
  let centroid = null
  if (corners.length >= 3) {
    let Ar = 0, cx = 0, cz = 0
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i], q = corners[(i + 1) % corners.length]
      const cr = p.x * q.z - q.x * p.z
      Ar += cr; cx += (p.x + q.x) * cr; cz += (p.z + q.z) * cr
    }
    Ar *= 0.5
    if (Math.abs(Ar) > 1) centroid = { x: cx / (6 * Ar), z: cz / (6 * Ar) }
  }
  if (!centroid && corners.length) {
    let cx = 0, cz = 0
    for (const c of corners) { cx += c.x; cz += c.z }
    centroid = { x: cx / corners.length, z: cz / corners.length }
  }
  let radius = 0
  if (centroid) for (const c of corners) radius = Math.max(radius, Math.hypot(c.x - centroid.x, c.z - centroid.z))
  if (centroid) { centroid.x = Math.round(centroid.x * 100) / 100; centroid.z = Math.round(centroid.z * 100) / 100 }
  // Each named side's resolved geometry, so the client can HIGHLIGHT it on the
  // aerial — the operator sees exactly which street they picked (and catches a
  // wrong one, e.g. Clayton Avenue vs Clayton Road, that won't close).
  const r2 = (v) => Math.round(v * 100) / 100
  const streets = sides.map((nm) => ({
    name: nm,
    polylines: (chainsOf(nm) || []).map(c => c.points.map(p => [r2(p.x), r2(p.z)])),
  }))
  return { corners, centroid, radius: Math.round(radius), edges, streets, closed: corners.length === sides.length && sides.length >= 3 }
}

// Aerial labels for the Extent view — sourced from the SKELETON (welded chains,
// corridor-collapsed) so a directional corridor shows ONE label ("Big Bend
// Boulevard") instead of North/South separately. One label per corridor/street
// at the longest chain's arclength-midpoint + local angle (normalized to read
// L→R). Coords are the skeleton's current-frame x/z (reproject-raw keeps them
// aligned to the live geography / aerial). `major` = arterial class.
function skeletonLabelsFor(scene) {
  const skel = getSkeleton(scene)
  if (!skel) return []
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
  const groups = new Map()   // label → { chains, major }
  for (const s of skel.streets) {
    if (!s.name || !s.points || s.points.length < 2) continue
    const hw = s.highway || ''
    if (SYNTHETIC_NAME.test(s.name)) continue
    const label = s.corridor || s.name
    let g = groups.get(label)
    if (!g) { g = { chains: [], major: false }; groups.set(label, g) }
    g.chains.push(s)
    if (MAJOR.has(hw)) g.major = true
  }
  const labels = []
  for (const [label, g] of groups) {
    let best = null
    for (const s of g.chains) {
      const pts = s.points, segLens = []
      let total = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
        segLens.push(L); total += L
      }
      if (total === 0 || (best && total <= best.total)) continue
      let acc = 0, si = 0
      const half = total / 2
      for (; si < segLens.length - 1; si++) { if (acc + segLens[si] >= half) break; acc += segLens[si] }
      const t = segLens[si] > 0 ? (half - acc) / segLens[si] : 0
      const a = pts[si], b = pts[si + 1]
      let angle = Math.atan2(b.z - a.z, b.x - a.x)
      if (angle > Math.PI / 2) angle -= Math.PI
      if (angle < -Math.PI / 2) angle += Math.PI
      best = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, angle, total }
    }
    if (best) labels.push({
      name: label,
      x: Math.round(best.x * 100) / 100,
      z: Math.round(best.z * 100) / 100,
      angle: Math.round(best.angle * 1000) / 1000,
      major: g.major,
    })
  }
  return labels
}

// ── Extent editor: ZIP seed (intake head) ───────────────────────────────────
// zip → centroid (geocode) → provisional geography.json → fetch.js → skeleton.js.
// The cold-start for a new hood; also the re-scope for an existing one. A fresh
// fetch projects x/z through the just-written geography, so no reproject-raw is
// needed here (that lever is for a re-center WITHOUT a re-fetch, §11).
const _seedsInFlight = new Set()
// Frame-then-fetch: the operator frames the neighborhood on the (global) aerial;
// we fetch over EXACTLY that bbox, centered on it. Guarantee: a street visible in
// the framed view falls in the bbox → is fetched → is nameable. Center = bbox
// midpoint; a re-center within this bbox later = reproject-raw + skeleton (no
// re-fetch), growing beyond it needs a re-fetch (§11).
function writeGeographyFromBbox(scene, bbox) {
  const r5 = (v) => Math.round(v * 1e5) / 1e5
  const lat = (bbox.minLat + bbox.maxLat) / 2, lon = (bbox.minLon + bbox.maxLon) / 2
  const lonToMeters = Math.round(111320 * Math.cos((lat * Math.PI) / 180))
  const latToMeters = 111000
  const geo = {
    _comment: `Provisional — the operator FRAMED this extent on the aerial; fetched over exactly this bbox (frame-then-fetch: a street visible in-frame is in the data). Re-center to the boundary-polygon centroid on commit. ⚠️ timezone is a Central-US default — set per location when tz lookup lands.`,
    lat: r5(lat), lon: r5(lon),
    timezone: 'America/Chicago',
    lonToMeters, latToMeters,
    bbox: { minLat: r5(bbox.minLat), maxLat: r5(bbox.maxLat), minLon: r5(bbox.minLon), maxLon: r5(bbox.maxLon) },
  }
  const p = sceneDataPaths(scene).geography
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(geo, null, 2))
  return geo
}

// One street's geometry (its chains, corridor-aware) for the Extent dropdown
// HOVER preview — the operator sees exactly where a candidate lies before
// selecting it (Clayton Road vs Clayton Avenue), so they never have to guess.
function streetGeom(scene, name) {
  const skel = getSkeleton(scene)
  if (!skel || !name) return { polylines: [] }
  const r2 = (v) => Math.round(v * 100) / 100
  const chains = skel.streets.filter(s => (s.name === name || s.corridor === name) && s.points && s.points.length >= 2)
  return { polylines: chains.map(c => c.points.map(p => [r2(p.x), r2(p.z)])) }
}

// The neighborhood stencil — a 256-gon circle of radius R around local [0,0]
// (the geo center after re-center), with the two feather bands the slab clip
// reads (SLAB-CONTRACT §2.1). center is ALWAYS [0,0] == the geo center.
function makeCircleBoundary(radius) {
  const R = Math.round(radius)
  const r2 = (v) => Math.round(v * 100) / 100
  const boundary = []
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * 2 * Math.PI
    boundary.push([r2(R * Math.cos(a)), r2(R * Math.sin(a))])
  }
  return {
    version: 2,
    center: [0, 0],
    radius: R,
    innerFadeOffset: 200,
    fade: { inner: Math.max(0, R - 200), outer: R },
    streetFade: { inner: Math.max(0, R - 140), outer: R + 160 },
    boundary,
  }
}

// Street names for the Extent dropdown — sourced from the skeleton (welded,
// corridor-collapsed) so a directional corridor shows as ONE entry ("Big Bend
// Boulevard", not North/South separately). Grouped major (arterials) / minor,
// each A→Z; synthetic motorway/link names excluded (not boundary streets).
function streetNamesFor(scene) {
  const skel = getSkeleton(scene)
  if (!skel) return { major: [], minor: [] }
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
  const byLabel = new Map()   // label → isMajor (a corridor is major if any member is)
  for (const s of skel.streets) {
    if (!s.name) continue
    const hw = s.highway || ''
    if (SYNTHETIC_NAME.test(s.name)) continue
    const label = s.corridor || s.name
    byLabel.set(label, (byLabel.get(label) || false) || MAJOR.has(hw))
  }
  const major = [], minor = []
  for (const [label, isMajor] of byLabel) (isMajor ? major : minor).push(label)
  const az = (a, b) => a.localeCompare(b)
  return { major: major.sort(az), minor: minor.sort(az) }
}

// Building footprints for the Extent tool's live overlay + roster editor — every
// MSBF footprint as a CURRENT-FRAME (x/z) ring, tagged `msbf-<id>` (the same id
// space the pour bakes + buildingOverrides keys on). Reads raw/msbf.json, whose
// x/z reproject-raw keeps aligned to the live geography/aerial (no projection
// here). mtime-cached — the 9.5 MB parse runs once per fetch, not per request.
const _footprintCache = new Map()   // scene → { mtime, payload }
function buildingFootprintsFor(scene) {
  const p = join(sceneRawDir(scene), 'msbf.json')
  if (!existsSync(p)) return { buildings: [] }
  const mtime = statSync(p).mtimeMs
  const cached = _footprintCache.get(scene)
  if (cached && cached.mtime === mtime) return cached.payload
  const msbf = JSON.parse(readFileSync(p, 'utf-8'))
  const buildings = []
  for (const b of (msbf.buildings || [])) {
    const ring = (b.coords || []).map(c => [c.x, c.z])
    if (ring.length >= 3) buildings.push({ id: `msbf-${b.msbfId}`, ring })
  }
  const payload = { buildings }
  _footprintCache.set(scene, { mtime, payload })
  return payload
}

// Looks: each Look is a styling snapshot — a complete material palette plus
// the per-Look bake bundle (ground.json + bin + lightmap + buildings + lamps
// + scene snapshot) under public/baked/<id>/. design.json (authoring state)
// lives under public/looks/<id>/. index.json tracks names + order; the
// default Look 'lafayette-square' is the project's 0-state and can't be
// deleted.
const PUBLIC_DIR = join(import.meta.dirname, '..', 'public')
const LOOKS_DIR = join(PUBLIC_DIR, 'looks')
const LOOKS_INDEX = join(LOOKS_DIR, 'index.json')
const DEFAULT_LOOK_ID = 'lafayette-square'
const PORT = Number(process.env.CARTO_PORT) || 3333

// ── Looks helpers ──────────────────────────────────────────────────────────
function readJsonOrNull(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}
function writeJson(path, obj) {
  // Content-aware: skip the write (and the mtime bump) when bytes match.
  // Critical for the bake chain's incremental dirty-skip — a "save with
  // no changes" must NOT invalidate downstream artifacts.
  writeIfChanged(path, JSON.stringify(obj, null, 2))
}
function lookDir(id) { return join(LOOKS_DIR, id) }
function lookDesignPath(id) { return join(lookDir(id), 'design.json') }
function readLooksIndex() {
  return readJsonOrNull(LOOKS_INDEX) || { default: DEFAULT_LOOK_ID, looks: [] }
}
function saveLooksIndex(idx) { writeJson(LOOKS_INDEX, idx) }
function slugify(name) {
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'look'
}
function uniqueLookId(base, existingIds) {
  let id = base, n = 2
  while (existingIds.includes(id)) { id = `${base}-${n}`; n++ }
  return id
}

// One-time migration: if public/looks/ doesn't exist, create it and seed the
// default Look from overlay.json's design block (or empty if absent). Strip
// the design block from overlay.json so it stops drifting from the Look.
function migrateLooksOnBoot() {
  if (existsSync(LOOKS_INDEX)) return
  mkdirSync(lookDir(DEFAULT_LOOK_ID), { recursive: true })
  const overlay = readJsonOrNull(OVERLAY) || {}
  const design = overlay.design || {}
  writeJson(lookDesignPath(DEFAULT_LOOK_ID), design)
  saveLooksIndex({
    default: DEFAULT_LOOK_ID,
    looks: [
      { id: DEFAULT_LOOK_ID, name: 'Lafayette Square', scene: DEFAULT_SCENE, createdAt: Date.now() },
    ],
  })
  if (overlay.design) {
    delete overlay.design
    writeJson(OVERLAY, overlay)
  }
  console.log(`[looks] migrated overlay.design → ${DEFAULT_LOOK_ID}`)
}
migrateLooksOnBoot()

// Idempotent migration: stamp `scene` on any pre-existing Look entry that
// lacks it. Defaults to the project's 0-state scene (Lafayette Square).
// Runs every boot but only writes if something needed stamping.
function backfillLookScenesOnBoot() {
  const idx = readJsonOrNull(LOOKS_INDEX)
  if (!idx || !Array.isArray(idx.looks)) return
  let changed = false
  for (const entry of idx.looks) {
    if (!entry.scene) { entry.scene = DEFAULT_SCENE; changed = true }
  }
  if (changed) {
    saveLooksIndex(idx)
    console.log(`[looks] backfilled scene field on ${idx.looks.length} entr${idx.looks.length === 1 ? 'y' : 'ies'}`)
  }
}
backfillLookScenesOnBoot()

const MIME = {
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
}

if (!existsSync(MARKERS)) writeFileSync(MARKERS, '[]')
if (!existsSync(MEASUREMENTS)) writeFileSync(MEASUREMENTS, '{"measurements":[]}')
if (!existsSync(CENTERLINES)) writeFileSync(CENTERLINES, '{"streets":[]}')
if (!existsSync(OVERLAY)) writeFileSync(OVERLAY, '{"version":1,"streets":{}}')

function pointInRing(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function strokeBBox(strokes) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
  }
  return { minX, maxX, minZ, maxZ }
}

function analyzeMarkers() {
  const strokes = JSON.parse(readFileSync(MARKERS, 'utf-8'))
  if (!strokes.length) return { strokes: 0, message: 'No marker strokes' }

  const bbox = strokeBBox(strokes)
  const result = { strokes: strokes.length, bbox }

  // Find parcels overlapping the marker bbox
  if (existsSync(PARCEL_FILE)) {
    const parcelData = JSON.parse(readFileSync(PARCEL_FILE, 'utf-8'))
    const overlapping = []
    for (const p of parcelData.parcels) {
      const ring = p.rings?.[0]
      if (!ring || ring.length < 3) continue
      const xs = ring.map(pt => pt[0]), zs = ring.map(pt => pt[1])
      const pMinX = Math.min(...xs), pMaxX = Math.max(...xs)
      const pMinZ = Math.min(...zs), pMaxZ = Math.max(...zs)
      // BBox overlap test
      if (pMaxX < bbox.minX || pMinX > bbox.maxX || pMaxZ < bbox.minZ || pMinZ > bbox.maxZ) continue
      overlapping.push({
        address: (p.address || '').trim(),
        bounds: { minX: +pMinX.toFixed(1), maxX: +pMaxX.toFixed(1), minZ: +pMinZ.toFixed(1), maxZ: +pMaxZ.toFixed(1) },
        centroid: { x: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1), z: +(zs.reduce((a, b) => a + b, 0) / zs.length).toFixed(1) },
        vertexCount: ring.length,
        ring
      })
    }
    result.parcels = overlapping.map(p => ({ ...p, ring: undefined }))
    result.parcelCount = overlapping.length
  }

  // Find blocks overlapping the marker bbox
  const mapFile = join(DIR, 'map.json')
  if (existsSync(mapFile)) {
    const map = JSON.parse(readFileSync(mapFile, 'utf-8'))
    const blocks = map.layers?.block || []
    const overlappingBlocks = []
    for (let i = 0; i < blocks.length; i++) {
      const ring = blocks[i].ring
      const xs = ring.map(p => p.x), zs = ring.map(p => p.z)
      const bMinX = Math.min(...xs), bMaxX = Math.max(...xs)
      const bMinZ = Math.min(...zs), bMaxZ = Math.max(...zs)
      if (bMaxX < bbox.minX || bMinX > bbox.maxX || bMaxZ < bbox.minZ || bMinZ > bbox.maxZ) continue
      overlappingBlocks.push({
        index: i,
        bounds: { minX: +bMinX.toFixed(1), maxX: +bMaxX.toFixed(1), minZ: +bMinZ.toFixed(1), maxZ: +bMaxZ.toFixed(1) }
      })
    }
    result.blocks = overlappingBlocks
    result.blockCount = overlappingBlocks.length
  }

  return result
}

createServer(async (req, res) => {
  // Strip query string for route matching. Clients add cache-busting
  // ?t=... that would otherwise miss exact-equality checks.
  const path = (req.url || '').split('?')[0]
  // GET /analyze — report what's under the marker strokes (LS-only helper).
  if (req.method === 'GET' && path === '/analyze') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(analyzeMarkers(), null, 2))
    return
  }

  // ── Per-scene data routes ──────────────────────────────────────────────
  // Canonical: /<scene>/<verb> (e.g. /lafayette-square/centerlines, /toy/overlay).
  // Legacy: /<verb> with no scene prefix resolves to the default scene; this
  // alias exists so older clients keep working through Phase 0c's store
  // migration. Once every caller is scene-aware we can retire it.
  //
  // Verbs split by allowed methods to match the prior per-route behavior
  // exactly: skeleton is GET-only (derived artifact), the rest accept POST
  // for autosave. Empty-payload defaults match the boot-time inits.
  const READ_VERBS = ['markers', 'measurements', 'skeleton', 'centerlines', 'overlay', 'ribbons', 'map', 'geography', 'boundary']
  const WRITE_VERBS = ['markers', 'measurements', 'centerlines', 'overlay']
  const EMPTY = {
    markers:      '[]',
    measurements: '{"measurements":[]}',
    centerlines:  '{"streets":[]}',
    overlay:      '{"version":1,"streets":{}}',
    ribbons:      '{"streets":[],"tiles":[],"faces":[]}',
    map:          '{"buildings":[],"layers":{}}',
    geography:    'null',
    boundary:     'null',
  }
  // Reserved top-level prefixes that must NOT be mistaken for scene names.
  const RESERVED_PREFIXES = new Set(['looks', 'analyze', 'rebuild'])
  const sceneRouteMatch = path.match(/^\/(?:([a-z0-9][a-z0-9-]*)\/)?(markers|measurements|skeleton|centerlines|overlay|ribbons|map|geography|boundary)$/)
  if (sceneRouteMatch && !RESERVED_PREFIXES.has(sceneRouteMatch[1])) {
    const scene = sceneRouteMatch[1] || DEFAULT_SCENE
    const verb = sceneRouteMatch[2]
    const paths = sceneDataPaths(scene)
    const filePath = paths[verb]

    if (req.method === 'GET' && READ_VERBS.includes(verb)) {
      if (!existsSync(filePath)) {
        if (verb === 'skeleton') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `skeleton.json not found for scene '${scene}' — run skeleton.js` }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(EMPTY[verb] || '{}')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(readFileSync(filePath))
      return
    }

    if (req.method === 'POST' && WRITE_VERBS.includes(verb)) {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          mkdirSync(dirname(filePath), { recursive: true })
          // Content-aware: a save-with-no-changes must not bump mtime,
          // or the bake chain treats every downstream artifact as stale.
          writeIfChanged(filePath, JSON.stringify(parsed, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{"ok":true}')
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
  }

  // ── The SHAPE freeze (the Data Wall, autosaved) ──────────────────────────
  // POST /<scene>/shape — write the frozen SHAPE artifact (the per-tile
  // curb/corner silhouette Section opens). The client autosaves this on
  // Survey-exit (WALL.md §4) with the live `_shapeArtifact` it just rendered,
  // so the freeze always tracks the eye-gated Survey shape WITHOUT the heavy
  // slab bake. Lands at public/baked/<scene>/shape.json — exactly where the
  // Section surface fetches it. Scene-keyed; reserved prefixes excluded.
  const shapeMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/shape$/)
  if (req.method === 'POST' && shapeMatch && !RESERVED_PREFIXES.has(shapeMatch[1])) {
    const scene = shapeMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        JSON.parse(body)   // validate — never persist non-JSON as the freeze
        const dir = join(PUBLIC_DIR, 'baked', scene)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'shape.json'), body)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // ── Extent editor: OSM street labels ────────────────────────────────────
  // GET /<scene>/osm-labels — the label set for the Neighborhood Perimeter
  // Builder (Cartograph step 0). Extracted PRE-skeleton from raw/osm.json's
  // ground.highway (coords already in the scene's local frame), so labels are
  // available the moment a hood is fetched — before any pipeline runs. One
  // label per named street (longest way's arclength-midpoint + local angle);
  // `major` flags the arterial classes the operator frames boundaries on. The
  // payload is a few KB even though raw OSM is ~18 MB; cached by file mtime so
  // the 18 MB parse happens once per fetch, not per request.
  const osmLabelsMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/osm-labels$/)
  if (req.method === 'GET' && osmLabelsMatch && !RESERVED_PREFIXES.has(osmLabelsMatch[1])) {
    const scene = osmLabelsMatch[1]
    try {
      const labels = getOsmLabels(scene)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ labels: labels || [] }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message, labels: [] }))
    }
    return
  }

  // POST /<scene>/extent-corners — body { sides: [orderedStreetNames] } →
  // { corners, centroid, radius, edges, closed }. The Neighborhood Perimeter
  // Builder's corner resolver (skeleton junctions; see computeExtentCorners).
  const cornersMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/extent-corners$/)
  if (req.method === 'POST' && cornersMatch && !RESERVED_PREFIXES.has(cornersMatch[1])) {
    const scene = cornersMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { sides } = JSON.parse(body || '{}')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(computeExtentCorners(scene, Array.isArray(sides) ? sides : [])))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /<scene>/street-names — { major, minor } for the Extent side dropdown
  // (skeleton-sourced, corridor-collapsed, alphabetized).
  const namesMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/street-names$/)
  if (req.method === 'GET' && namesMatch && !RESERVED_PREFIXES.has(namesMatch[1])) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(streetNamesFor(namesMatch[1])))
    return
  }

  // GET /<scene>/building-footprints — current-frame footprint rings for the
  // Extent overlay + roster editor (one merged geometry client-side).
  const bldgFpMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/building-footprints$/)
  if (req.method === 'GET' && bldgFpMatch && !RESERVED_PREFIXES.has(bldgFpMatch[1])) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(buildingFootprintsFor(bldgFpMatch[1])))
    return
  }

  // GET/POST /<scene>/building-overrides — per-scene building membership overrides
  // { activate: [msbf-id…], hide: [msbf-id…] }. `activate` forces an outside-polygon
  // building IN; `hide` forces an inside one OUT. Layers OVER the geometric default
  // (centroid in the boundary polygon) — feedback_effective_payload_layering — so it
  // survives radius/polygon edits; the bake applies it. Never merged into the ledger.
  const bldgOvMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/building-overrides$/)
  if (bldgOvMatch && !RESERVED_PREFIXES.has(bldgOvMatch[1])) {
    const scene = bldgOvMatch[1]
    const ovPath = join(sceneCleanDir(scene), '..', 'building-overrides.json')
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(existsSync(ovPath) ? readFileSync(ovPath) : '{"activate":[],"hide":[]}')
      return
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}')
          const activate = Array.isArray(parsed.activate) ? parsed.activate : []
          const hide = Array.isArray(parsed.hide) ? parsed.hide : []
          mkdirSync(dirname(ovPath), { recursive: true })
          writeIfChanged(ovPath, JSON.stringify({ activate, hide }, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
  }

  // POST /<scene>/fetch-extent — body { bbox:{minLat,maxLat,minLon,maxLon} } →
  // write geography.json (centered on the framed bbox) → fetch.js → skeleton.js.
  // The Phalanges over the operator-framed square. Long-running (a fresh OSM
  // fetch); the client awaits with a spinner. Guarded per scene.
  const fetchExtentMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/fetch-extent$/)
  if (req.method === 'POST' && fetchExtentMatch && !RESERVED_PREFIXES.has(fetchExtentMatch[1])) {
    const scene = fetchExtentMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      if (_seedsInFlight.has(scene)) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'a fetch is already running for this scene' }))
        return
      }
      _seedsInFlight.add(scene)
      try {
        const { bbox } = JSON.parse(body || '{}')
        const ok = bbox && ['minLat', 'maxLat', 'minLon', 'maxLon'].every(k => Number.isFinite(bbox[k]))
          && bbox.maxLat > bbox.minLat && bbox.maxLon > bbox.minLon
        if (!ok) throw new Error('need a valid bbox {minLat,maxLat,minLon,maxLon}')
        const geo = writeGeographyFromBbox(scene, bbox)
        const here = import.meta.dirname
        const env = { ...process.env, CARTOGRAPH_SCENE: scene }
        mkdirSync(sceneRawDir(scene), { recursive: true })
        mkdirSync(sceneCleanDir(scene), { recursive: true })
        await runShell('node fetch.js', { cwd: here, env, timeout: 240000 })
        await runShell('node skeleton.js', { cwd: here, env, timeout: 120000 })
        _skelCache.delete(scene)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, center: { lat: geo.lat, lon: geo.lon }, bbox: geo.bbox }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      } finally {
        _seedsInFlight.delete(scene)
      }
    })
    return
  }

  // GET /<scene>/skeleton-labels — corridor-collapsed aerial labels for Extent.
  const skLabelsMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/skeleton-labels$/)
  if (req.method === 'GET' && skLabelsMatch && !RESERVED_PREFIXES.has(skLabelsMatch[1])) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ labels: skeletonLabelsFor(skLabelsMatch[1]) }))
    return
  }

  // POST /<scene>/street-geom — body { name } → { polylines } for the dropdown
  // hover-preview (see which street a candidate is before selecting it).
  const geomMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/street-geom$/)
  if (req.method === 'POST' && geomMatch && !RESERVED_PREFIXES.has(geomMatch[1])) {
    const scene = geomMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body || '{}')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(streetGeom(scene, name)))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message, polylines: [] }))
      }
    })
    return
  }

  // GET/POST /<scene>/neighborhood — the extent DRAFT + descriptive metadata
  // (name/blurb/border streets/radius). Auto-saved from the Extent panel; loaded
  // on open to restore the operator's selections across reloads.
  const nbdMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/neighborhood$/)
  if (nbdMatch && !RESERVED_PREFIXES.has(nbdMatch[1])) {
    const scene = nbdMatch[1]
    const nPath = join(sceneCleanDir(scene), '..', 'neighborhood.json')
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(existsSync(nPath) ? readFileSync(nPath) : '{}')
      return
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}')
          mkdirSync(dirname(nPath), { recursive: true })
          writeIfChanged(nPath, JSON.stringify(parsed, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
  }

  // POST /<scene>/commit-extent — the deliberate finalize: re-center geography to
  // the boundary-polygon centroid → reproject-raw + skeleton (neighborhood lands
  // at origin) → write neighborhood_boundary.json (the circle) + neighborhood.json.
  // Body { center:{lat,lon}, radius, sides, name, blurb }. Long-running; guarded.
  const commitMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/commit-extent$/)
  if (req.method === 'POST' && commitMatch && !RESERVED_PREFIXES.has(commitMatch[1])) {
    const scene = commitMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      if (_seedsInFlight.has(scene)) {
        res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'busy' })); return
      }
      _seedsInFlight.add(scene)
      try {
        const { center, radius, sides, name, blurb } = JSON.parse(body || '{}')
        if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) throw new Error('need center {lat,lon}')
        if (!Number.isFinite(radius) || radius <= 0) throw new Error('need a positive radius')
        const r5 = (v) => Math.round(v * 1e5) / 1e5
        const geoPath = sceneDataPaths(scene).geography
        const geo = JSON.parse(readFileSync(geoPath, 'utf8'))
        geo.lat = r5(center.lat); geo.lon = r5(center.lon)
        geo.lonToMeters = Math.round(111320 * Math.cos((center.lat * Math.PI) / 180))
        geo._comment = 'Committed extent — center = the boundary-polygon centroid; bbox = the fetch extent.'
        writeFileSync(geoPath, JSON.stringify(geo, null, 2))
        const here = import.meta.dirname
        const env = { ...process.env, CARTOGRAPH_SCENE: scene }
        await runShell('node reproject-raw.js', { cwd: here, env, timeout: 60000 })
        await runShell('node skeleton.js', { cwd: here, env, timeout: 120000 })
        _skelCache.delete(scene)
        // Persist the boundary-street polygon (re-resolved in the NOW re-centered
        // frame, so it aligns with the reprojected buildings) alongside the circle.
        // The bake culls building MEMBERSHIP by point-in-this-polygon; the circle
        // stays the slab disc / fade.
        const boundary = makeCircleBoundary(radius)
        const cornerRes = computeExtentCorners(scene, (sides || []).map(s => (s || '').trim()).filter(Boolean))
        if (cornerRes && Array.isArray(cornerRes.corners) && cornerRes.corners.length >= 3) boundary.polygon = cornerRes.corners
        writeFileSync(sceneDataPaths(scene).boundary, JSON.stringify(boundary, null, 2))
        const nPath = join(sceneCleanDir(scene), '..', 'neighborhood.json')
        writeFileSync(nPath, JSON.stringify({ name: name || '', blurb: blurb || '', sides: sides || [], radius: Math.round(radius), committed: true }, null, 2))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, center: { lat: geo.lat, lon: geo.lon }, radius: Math.round(radius) }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
      } finally {
        _seedsInFlight.delete(scene)
      }
    })
    return
  }

  // POST /<scene>/pour — the one-click pour: pipeline.js (derive → map.json,
  // clipped to the committed boundary) → promote-ribbons.js (→ clean/ribbons.json
  // the Designer renders). Long-running (the derive stage); guarded per scene.
  const pourMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/pour$/)
  if (req.method === 'POST' && pourMatch && !RESERVED_PREFIXES.has(pourMatch[1])) {
    const scene = pourMatch[1]
    if (_seedsInFlight.has(scene)) {
      res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'busy' })); return
    }
    _seedsInFlight.add(scene)
    ;(async () => {
      try {
        const here = import.meta.dirname
        const env = { ...process.env, CARTOGRAPH_SCENE: scene }
        await runShell('node pipeline.js --skip-elevation', { cwd: here, env, timeout: 600000 })
        await runShell(`node promote-ribbons.js --scene=${scene}`, { cwd: here, env, timeout: 60000 })
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message }))
      } finally {
        _seedsInFlight.delete(scene)
      }
    })()
    return
  }

  // ── Looks ───────────────────────────────────────────────────────────────
  // Each Look is a styling snapshot: design.json (material palette + shader
  // params) + the per-Look bake bundle (public/baked/<id>/). The default
  // Look is the project's 0-state and can't be deleted.

  // GET /looks — list of {id, name, createdAt} + the default id.
  if (req.method === 'GET' && path === '/looks') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(readLooksIndex()))
    return
  }

  // GET /looks/<id>/design — the Look's autosaved design block.
  // Returns {} (not 404) for an existing Look without a design yet, so the
  // client can hydrate without a special-case error path.
  let m
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/design$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    const design = readJsonOrNull(lookDesignPath(id)) || {}
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(design))
    return
  }

  // POST /looks/<id>/design — autosave write. Body: design block JSON.
  // Preserves keys Cartograph doesn't author (notably `trees`, written
  // by Arborist) so a Cartograph autosave can't clobber Arborist's
  // roster. Co-authoring across apps relies on this merge.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/design$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        const existing = readJsonOrNull(lookDesignPath(id)) || {}
        // Preserve Arborist-owned keys if the incoming payload omits them.
        const merged = { ...parsed }
        for (const k of ['trees']) {
          if (!(k in parsed) && k in existing) merged[k] = existing[k]
        }
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), merged)
        // Touch updatedAt so clients can show "last edited" if they want.
        const idx2 = readLooksIndex()
        const entry = idx2.looks.find(l => l.id === id)
        if (entry) { entry.updatedAt = Date.now(); saveLooksIndex(idx2) }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /looks/<id>/trees — Arborist's tree roster for this Look.
  // Returns [] when the Look hasn't been curated yet.
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/trees$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    const design = readJsonOrNull(lookDesignPath(id)) || {}
    const trees = Array.isArray(design.trees) ? design.trees : []
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ trees }))
    return
  }

  // POST /looks/<id>/trees — replace this Look's tree roster. Body:
  // { trees: [{species, variantId}, …] }. Read-merge-write so a
  // concurrent Cartograph autosave can't drop the trees field.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/trees$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}')
        const trees = Array.isArray(parsed.trees) ? parsed.trees : []
        // Normalize: drop entries missing species or variantId.
        const clean = trees
          .filter(t => t && t.species && (t.variantId != null))
          .map(t => ({ species: String(t.species), variantId: Number(t.variantId) }))
        const existing = readJsonOrNull(lookDesignPath(id)) || {}
        const merged = { ...existing, trees: clean }
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), merged)
        const idx2 = readLooksIndex()
        const entry = idx2.looks.find(l => l.id === id)
        if (entry) { entry.updatedAt = Date.now(); saveLooksIndex(idx2) }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, count: clean.length }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /looks/<id>/bake — re-bake this Look's bundle (ground / buildings
  // / lamps / scene / trees / ground-ao) from its design.json. Steps run
  // via `runShell` (async spawn) so other API requests keep flowing during
  // the bake. Per-look lock rejects concurrent bakes against the same Look.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/bake$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    if (_bakesInFlight.has(id)) {
      res.writeHead(409, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'bake already in progress for this look', lookId: id }))
      return
    }
    _bakesInFlight.add(id)
    try {
      const t0 = Date.now()
      // Full bake chain — every step the operator might forget rolled into
      // the Bake button so "edit, bake, see" actually works:
      //
      //   1. pipeline.js + promote-ribbons.js — re-derive map.json + ribbons
      //      from the latest measurements/overlay/centerlines edits.
      //   2. cartograph bakes — ground / buildings / lamps / scene from
      //      the freshly-derived map.json.
      //   3. arborist tree bake — public/baked/default.json placements;
      //      reads map.json for forbidden-surface polygons.
      //   4. ground-ao bake last — slowest (~25 sec), benefits from
      //      stable upstream geometry.
      //
      // Each step is incremental: skipped when all outputs are newer than
      // every declared input (including its own .js source). Pass
      // `?force=1` on the bake URL to force a full rebuild.
      //
      // bake-svg.js is intentionally NOT run here — it's demoted to a
      // CLI-only QA artifact (human-readable / diffable); the runtime
      // consumes ground.json + ground.bin + ground.lightmap exclusively.
      const force = /[?&]force=1\b/.test(req.url || '')
      const REPO_ROOT = join(import.meta.dirname, '..')
      const here = import.meta.dirname
      // Bake inputs come from the active Look's scene. Looks without an
      // explicit scene fall back to the default; pipeline.js + promote-
      // ribbons.js + arborist trees are skipped for non-LS scenes today
      // (toy doesn't have an OSM-derived pipeline yet — its centerlines
      // are hand-authored, so the pipeline step is a no-op for now).
      const bakeLookEntry = idx.looks.find(l => l.id === id)
      const bakeScene = bakeLookEntry?.scene || DEFAULT_SCENE
      const isDefaultScene = bakeScene === DEFAULT_SCENE
      const bakePaths = sceneDataPaths(bakeScene)
      // overlay.json + skeleton.json are operator-edited / derived
      // (Survey/Measure write to /overlay → clean/overlay.json; skeleton
      // is derived). Everything else is raw inputs.
      const RAW_PATHS = [
        join(bakePaths.raw,   'osm.json'),
        bakePaths.measurements,
        bakePaths.centerlines,
        join(bakePaths.raw,   'elevation.json'),
        bakePaths.overlay,
        bakePaths.skeleton,
        join(REPO_ROOT, 'src', 'data', 'buildings.json'),
      ]
      const PIPELINE_SRC = ['pipeline.js', 'derive.js', 'snap.js', 'classify.js', 'standards.js', 'config.js'].map(f => join(here, f))
      const MAP_JSON   = bakePaths.map
      const RIBBONS    = join(REPO_ROOT, 'src', 'data', 'ribbons.json')
      const PARK_TREES = join(REPO_ROOT, 'src', 'data', 'park_trees.json')
      const PARK_WATER = join(REPO_ROOT, 'src', 'data', 'park_water.json')
      const STREET_LAMPS = join(REPO_ROOT, 'src', 'data', 'street_lamps.json')
      const DESIGN    = join(REPO_ROOT, 'public', 'looks', id, 'design.json')
      const LOOK_DIR  = join(REPO_ROOT, 'public', 'baked', id)
      const sceneFlag = `--scene=${bakeScene}`
      const ranSteps = []
      const skipped = []
      const runIfDirty = async (label, inputs, outputs, cmd, opts) => {
        if (!force && !needsRebuild(inputs, outputs)) { skipped.push(label); return }
        await runShell(cmd, opts)
        ranSteps.push(label)
      }
      // Bake only ACTIVATED content: a hidden layer (layerVis=false) doesn't get
      // its (often heavy) sub-bake run at all — the operator's visibility is a
      // bake lever, not just a render toggle. Mirrors the ground-bake group prune.
      // Render already mount-gates hidden decorations off the scene.json snapshot,
      // so a stale artifact (if one exists from when it was last shown) is never
      // fetched; re-showing flips design.json → the sub-bake is dirty → re-runs.
      let bakeLayerVis = {}
      try { bakeLayerVis = JSON.parse(readFileSync(DESIGN, 'utf-8')).layerVis || {} } catch {}
      const layerOn = (layerId) => bakeLayerVis[layerId] !== false

      // pipeline.js is LS-specific (reads OSM ingest → derives map.json).
      // For toy we skip — the toy fixture is hand-authored centerlines +
      // overlay; a future toy-pipeline.js will derive map.json from those.
      if (isDefaultScene) {
        await runIfDirty('pipeline',
          [...RAW_PATHS, ...PIPELINE_SRC],
          [MAP_JSON],
          `node pipeline.js`,
          { cwd: here, timeout: 120000 })
        await runIfDirty('promote-ribbons',
          [MAP_JSON, join(here, 'promote-ribbons.js')],
          [RIBBONS],
          `node promote-ribbons.js ${sceneFlag}`,
          { cwd: here, timeout: 30000 })
      } else {
        skipped.push('pipeline (scene-specific pipeline not yet implemented)')
        skipped.push('promote-ribbons (depends on pipeline)')
      }
      // terrain — the installation's own heightfield (clean/terrain.*), lifted
      // at runtime. Bake from the scene's elevation.tif when present + stale, so
      // bake-ground's adaptive refine (next) samples the right relief; then copy
      // it into this Look's slab so the runtime fetches terrain by lookId, like
      // ground.bin. A scene with no elevation.tif has no terrain → renders flat.
      const ELEVATION_TIF      = join(bakePaths.raw,   'elevation.tif')
      const SCENE_TERRAIN_JSON = join(bakePaths.clean, 'terrain.json')
      const SCENE_TERRAIN_BIN  = join(bakePaths.clean, 'terrain.bin')
      if (existsSync(ELEVATION_TIF)) {
        await runIfDirty('terrain',
          [ELEVATION_TIF, bakePaths.boundary, bakePaths.geography, join(here, 'bake-terrain.js')],
          [SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN],
          `node bake-terrain.js ${sceneFlag}`,
          { cwd: here, timeout: 120000 })
      } else {
        skipped.push('terrain (no elevation.tif — flat)')
      }
      // terrain-slab: publish the scene terrain into this Look's slab (the
      // runtime fetches /baked/<look>/terrain.* by lookId; writeIfChanged keeps
      // the dirty-graph mtime honest).
      if (existsSync(SCENE_TERRAIN_JSON) && existsSync(SCENE_TERRAIN_BIN)) {
        const tsj = join(LOOK_DIR, 'terrain.json'), tsb = join(LOOK_DIR, 'terrain.bin')
        if (force || needsRebuild([SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN], [tsj, tsb])) {
          mkdirSync(LOOK_DIR, { recursive: true })
          writeIfChanged(tsj, readFileSync(SCENE_TERRAIN_JSON))
          writeIfChanged(tsb, readFileSync(SCENE_TERRAIN_BIN))
          ranSteps.push('terrain-slab')
        } else { skipped.push('terrain-slab') }
      }
      await runIfDirty('ground',
        [MAP_JSON, DESIGN, join(here, 'bake-ground.js'), join(REPO_ROOT, 'src', 'lib', 'ribbonsGeometry.js'), SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN],
        [join(LOOK_DIR, 'ground.json'), join(LOOK_DIR, 'ground.bin')],
        `node bake-ground.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 60000 })
      if (layerOn('building')) {
        await runIfDirty('buildings',
          [MAP_JSON, DESIGN, join(here, 'bake-buildings.js')],
          [join(LOOK_DIR, 'buildings.json'), join(LOOK_DIR, 'buildings.bin')],
          `node bake-buildings.js --look=${id} ${sceneFlag}`,
          { cwd: here, timeout: 60000 })
      } else {
        skipped.push('buildings (layer hidden)')
      }
      if (layerOn('lamp') && isDefaultScene) {
        // bake-lamps' SOURCE is still LS's street_lamps.json (terrain is
        // scene-aware; source is scene-keyed in step C). Gate to the default
        // scene so a poured installation doesn't inherit LS's lamps — it bakes
        // NONE (→ BakedLamps 404s → empty) until its own lamp intake lands.
        await runIfDirty('lamps',
          [STREET_LAMPS, DESIGN, join(here, 'bake-lamps.js')],
          [join(LOOK_DIR, 'lamps.json')],
          `node bake-lamps.js --look=${id} ${sceneFlag}`,
          { cwd: here, timeout: 30000 })
      } else if (!isDefaultScene) {
        skipped.push('lamps (source not yet scene-keyed — step C)')
      } else {
        skipped.push('lamps (layer hidden)')
      }
      await runIfDirty('scene',
        [DESIGN, join(here, 'bake-scene.js')],
        [join(LOOK_DIR, 'scene.json')],
        `node bake-scene.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 30000 })
      // Trees: LS-only today (the LS scene's PARK_TREES + PARK_WATER are
      // hardcoded inputs, and tree placements are shared across LS Looks).
      // Toy has its own ToyTrees component fed by a static JSON; no bake
      // step is needed for it yet.
      if (isDefaultScene && layerOn('tree')) {
        await runIfDirty('trees',
          [PARK_TREES, PARK_WATER, MAP_JSON, join(REPO_ROOT, 'arborist', 'bake-trees.js')],
          [join(REPO_ROOT, 'public', 'baked', 'default.json')],
          `node arborist/bake-trees.js --look default`,
          { cwd: REPO_ROOT, timeout: 60000 })
      } else if (!isDefaultScene && layerOn('tree')) {
        // Poured installation: union whichever census layers exist — the City
        // Forestry census (13-fetch-city-trees.py) + the OSM County-side floor
        // (14-fetch-osm-trees.py), spatially disjoint — into a LOOK-SCOPED
        // baked/<id>/trees.json (never LS's global default.json). No census on
        // disk yet → honest zero (skip). InstancedTrees mounts in the generic
        // env reading this scoped path, so no LS ghost.
        const censusLayers = [
          join(bakePaths.clean, 'park_trees.json'),  // City (Hi-Pointe)
          join(bakePaths.clean, 'osm_trees.json'),   // County (DeMun) floor
        ].filter(existsSync)
        if (censusLayers.length) {
          await runIfDirty('trees',
            [...censusLayers, join(REPO_ROOT, 'arborist', 'bake-trees.js')],
            [join(LOOK_DIR, 'trees.json')],
            `node arborist/bake-trees.js --look ${id} --placements ${censusLayers.join(',')} --output public/baked/${id}/trees.json`,
            { cwd: REPO_ROOT, timeout: 60000 })
        } else {
          skipped.push('trees (no scene census on disk — honest zero)')
        }
      } else {
        skipped.push('trees (layer hidden)')
      }
      // AO bake last — slowest, benefits from updated geometry.
      await runIfDirty('ground-ao',
        [MAP_JSON, DESIGN, join(LOOK_DIR, 'ground.json'), join(here, 'bake-ground-ao.js')],
        [join(LOOK_DIR, 'ground.lightmap.png')],
        `node bake-ground-ao.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 120000 })
      const ms = Date.now() - t0
      const idx2 = readLooksIndex()
      const entry = idx2.looks.find(l => l.id === id)
      if (entry) { entry.bakedAt = Date.now(); saveLooksIndex(idx2) }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ms, lookId: id, ran: ranSteps, skipped, force }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    } finally {
      _bakesInFlight.delete(id)
    }
    return
  }

  // GET /looks/<id>/publish/status — the Publish panel's state read. Fetches
  // the remote (never trust a stale local ref — OPERATIONS §Save→ship) and
  // reports: unbaked edits? dirty slab files? how far HEAD is ahead of staging
  // and prod. Pure read — no writes.
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/publish\/status$/))) {
    const id = m[1]
    const REPO_ROOT = join(import.meta.dirname, '..')
    try {
      await runCapture(`git fetch origin --quiet`, { cwd: REPO_ROOT, timeout: 30000 })
      const branch = (await runCapture(`git rev-parse --abbrev-ref HEAD`, { cwd: REPO_ROOT })).stdout.trim()
      const specs = slabPathspecs(id).join(' ')
      const dirty = (await runCapture(`git status --porcelain -- ${specs}`, { cwd: REPO_ROOT })).stdout
        .trim().split('\n').map(l => l.slice(3)).filter(Boolean)
      // "<behind>\t<ahead>" — commits in the ref but not HEAD, and vice-versa.
      const parse = (s) => { const [b, a] = s.trim().split(/\s+/).map(Number); return { behind: b || 0, ahead: a || 0 } }
      const vsStaging = parse((await runCapture(`git rev-list --left-right --count origin/${STAGING_BRANCH}...HEAD`, { cwd: REPO_ROOT })).stdout)
      const vsProd = parse((await runCapture(`git rev-list --left-right --count origin/${PROD_BRANCH}...HEAD`, { cwd: REPO_ROOT })).stdout)
      let unbaked = false
      try {
        const dMs = statSync(join(REPO_ROOT, `public/looks/${id}/design.json`)).mtimeMs
        const sMs = statSync(join(REPO_ROOT, `public/baked/${id}/scene.json`)).mtimeMs
        unbaked = dMs > sMs
      } catch { /* missing files → leave false */ }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, branch, unbaked, dirty, vsStaging, vsProd }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /og-image — save a captured SLAB frame (the hero render, not the UI) as
  // the static link-preview image at public/photos/og-preview.jpg, referenced by
  // index.html + worker.js. Body: { dataUrl: "data:image/jpeg;base64,..." }.
  // Dev-only (serve.js). Ships on the next Publish (it's in the slab pathspecs).
  if (req.method === 'POST' && path === '/og-image') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      try {
        const { dataUrl } = JSON.parse(body || '{}')
        const mimg = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || '')
        if (!mimg) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'bad dataUrl' })); return }
        const buf = Buffer.from(mimg[1], 'base64')
        const out = join(import.meta.dirname, '..', 'public', 'photos', 'og-preview.jpg')
        mkdirSync(dirname(out), { recursive: true })
        writeFileSync(out, buf)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, bytes: buf.length, path: 'public/photos/og-preview.jpg' }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /og-deployed — is the captured OG image live on prod yet? Compares the
  // live prod image's byte size to the local committed one (server-side → no
  // browser CORS). The "Push SMS Hero" button polls this for its ✓ Live state.
  if (req.method === 'GET' && path === '/og-deployed') {
    let localBytes = null
    try { localBytes = statSync(join(import.meta.dirname, '..', 'public', 'photos', 'og-preview.jpg')).size } catch { /* none */ }
    let prodStatus = null, prodBytes = null
    try {
      const r = await fetch(`${PROD_SITE_URL}photos/og-preview.jpg?cb=${Date.now()}`, { cache: 'no-store' })
      prodStatus = r.status
      if (r.ok) prodBytes = (await r.arrayBuffer()).byteLength
    } catch { /* offline */ }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, live: localBytes != null && prodBytes === localBytes, prodStatus, localBytes, prodBytes }))
    return
  }

  // GET /looks/<id>/deployed?target=staging|prod — server-side read of the LIVE
  // site's slab bakedAt (node fetch → no browser CORS). The Publish panel polls
  // this after a push to detect when the deploy has actually propagated.
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/deployed$/))) {
    const id = m[1]
    const target = (req.url.match(/[?&]target=([^&]+)/) || [])[1]
    const base = target === 'prod' ? PROD_SITE_URL : STAGING_SITE_URL
    try {
      const r = await fetch(`${base}baked/${id}/scene.json?t=${Date.now()}`, { cache: 'no-store' })
      let bakedAt = null
      if (r.ok) { try { bakedAt = (await r.json()).bakedAt ?? null } catch { /* HTML/404 while building */ } }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, target: target || 'staging', bakedAt }))
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, target: target || 'staging', bakedAt: null, error: err.message }))
    }
    return
  }

  // POST /looks/<id>/publish — commit the look's slab (scoped pathspecs only)
  // and push the current branch to the STAGING trunk. The UI bakes first (the
  // existing /bake endpoint), then calls this. Staging is the dry-run: its own
  // URL, not prod. Promote-to-prod is the separate, gated step below.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/publish$/))) {
    const id = m[1]
    const REPO_ROOT = join(import.meta.dirname, '..')
    try {
      await runCapture(`git fetch origin --quiet`, { cwd: REPO_ROOT, timeout: 30000 })
      const branch = (await runCapture(`git rev-parse --abbrev-ref HEAD`, { cwd: REPO_ROOT })).stdout.trim()
      // Only pass pathspecs that actually exist — `git commit -- <path>` errors
      // ("pathspec did not match any file(s)") on a spec that matches nothing,
      // e.g. the optional og-preview.jpg before a capture has been made.
      const specs = slabPathspecs(id).filter(p => existsSync(join(REPO_ROOT, p)))
      if (!specs.length) throw new Error('no slab files found to publish')
      const changed = (await runCapture(`git status --porcelain -- ${specs.join(' ')}`, { cwd: REPO_ROOT })).stdout
        .trim().split('\n').map(l => l.slice(3)).filter(Boolean)
      let committed = false
      if (changed.length) {
        // Stage first: `git commit -- <paths>` only knows TRACKED files, so a
        // newly-captured (untracked) og-preview.jpg fails "pathspec did not match
        // any file(s) known to git". `git add` stages new + modified; the scoped
        // pathspecs still mean we never sweep unrelated dirty files. Then commit
        // restricted to the same paths (ignores anything else already staged).
        const add = await runCapture(`git add -- ${specs.join(' ')}`, { cwd: REPO_ROOT })
        if (add.code !== 0) throw new Error(`git add failed: ${add.stderr || add.stdout}`)
        const commit = await runCapture(`git commit -m 'chore(slab): publish ${id} → staging' -- ${specs.join(' ')}`, { cwd: REPO_ROOT })
        if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`)
        committed = true
      }
      const push = await runCapture(`git push origin ${branch}:${STAGING_BRANCH}`, { cwd: REPO_ROOT, timeout: 60000 })
      if (push.code !== 0) throw new Error(`push to staging failed: ${push.stderr}`)
      // bakedAt of the just-shipped slab — the UI polls the live site for this
      // exact value to know when the deploy has actually propagated.
      let bakedAt = null
      try { bakedAt = JSON.parse(readFileSync(join(REPO_ROOT, `public/baked/${id}/scene.json`), 'utf-8')).bakedAt ?? null } catch { /* leave null */ }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, committed, changed, branch, bakedAt, stagingUrl: STAGING_SITE_URL }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /looks/<id>/promote — fast-forward PROD (main) from the current branch.
  // The gated final step: only after staging is verified. Guards against a
  // non-fast-forward (prod carries commits HEAD doesn't) and a no-op.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/promote$/))) {
    const id = m[1]
    const REPO_ROOT = join(import.meta.dirname, '..')
    try {
      await runCapture(`git fetch origin --quiet`, { cwd: REPO_ROOT, timeout: 30000 })
      const branch = (await runCapture(`git rev-parse --abbrev-ref HEAD`, { cwd: REPO_ROOT })).stdout.trim()
      const [behind, ahead] = (await runCapture(`git rev-list --left-right --count origin/${PROD_BRANCH}...HEAD`, { cwd: REPO_ROOT }))
        .stdout.trim().split(/\s+/).map(Number)
      if (behind > 0) throw new Error(`prod has ${behind} commit(s) not in this branch — not a clean fast-forward; reconcile first`)
      if (!ahead) throw new Error('nothing to promote — prod already matches this branch')
      const push = await runCapture(`git push origin ${branch}:${PROD_BRANCH}`, { cwd: REPO_ROOT, timeout: 60000 })
      if (push.code !== 0) throw new Error(`push to prod failed: ${push.stderr}`)
      let bakedAt = null
      try { bakedAt = JSON.parse(readFileSync(join(REPO_ROOT, `public/baked/${id}/scene.json`), 'utf-8')).bakedAt ?? null } catch { /* leave null */ }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, promoted: ahead, branch, bakedAt, prodUrl: PROD_SITE_URL }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /looks — create a new Look. Body: { name, fromLookId?, scene? }.
  // Seeds the new Look's design.json from `fromLookId` (defaults to the
  // currently-active or default Look). The new Look's scene defaults to
  // the seed Look's scene — cloning a Look keeps you in its scene unless
  // the caller explicitly passes a different one. Caller bakes separately.
  if (req.method === 'POST' && path === '/looks') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { name, fromLookId, scene } = JSON.parse(body || '{}')
        if (!name || !String(name).trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'name required' }))
          return
        }
        const idx = readLooksIndex()
        const seedEntry = (fromLookId && idx.looks.find(l => l.id === fromLookId))
          || idx.looks.find(l => l.id === idx.default)
        const seedId = seedEntry ? seedEntry.id : idx.default
        const newScene = (scene && String(scene).trim()) || (seedEntry && seedEntry.scene) || DEFAULT_SCENE
        const id = uniqueLookId(slugify(name), idx.looks.map(l => l.id))
        mkdirSync(lookDir(id), { recursive: true })
        const seedDesign = readJsonOrNull(lookDesignPath(seedId)) || {}
        writeJson(lookDesignPath(id), seedDesign)
        idx.looks.push({ id, name: String(name).trim(), scene: newScene, createdAt: Date.now() })
        saveLooksIndex(idx)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, id }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // DELETE /looks/<id> — remove a Look. Forbidden for the default 0-state.
  if (req.method === 'DELETE' && (m = path.match(/^\/looks\/([^/]+)$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (id === idx.default) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'cannot delete default look' }))
      return
    }
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    try {
      rmSync(lookDir(id), { recursive: true, force: true })
      idx.looks = idx.looks.filter(l => l.id !== id)
      saveLooksIndex(idx)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /rebuild — re-run render.js and reload preview
  if (req.method === 'POST' && path === '/rebuild') {
    try {
      await runShell('node render.js', { cwd: import.meta.dirname, timeout: 30000 })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // Static file serving — uses the query-stripped path so cache-busting
  // suffixes don't break file resolution.
  const file = path === '/' ? '/preview.html' : path
  const filePath = join(DIR, file)
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return }
  const ext = extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(readFileSync(filePath))
}).listen(PORT, () => {
  console.log(`Cartograph preview → http://localhost:${PORT}`)
})
