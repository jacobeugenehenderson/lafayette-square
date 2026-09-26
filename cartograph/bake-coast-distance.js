/**
 * bake-coast-distance.js — the coast-distance context channel: at every texel of the
 * town's terrain grid, the distance in metres to the nearest shoreline.
 *
 *   reads   public/baked/<look>/shape.json              (the `__water__` runs, via shoreRuns)
 *           cartograph/data/<scene>/clean/terrain.json  (the grid: bounds + sample count)
 *   writes  public/baked/<look>/context.json            { version, look, channels: { coastDist } }
 *           public/baked/<look>/context.coastDist.bin   Uint16, row-major, metres = v × mPerUnit
 *
 * UNSIGNED metres to the nearest run — land and water alike; a consumer masks by its own
 * surface. Surfaces read it through their declared band parameters (cartograph/surfaces.mjs).
 *
 * TEXEL: the smallest band in use, when one is resolved; while every band that reads this
 * channel is [U] (references q-beach-band-width), the terrain's own grid step — the manifest
 * records which (`texelFrom`).
 * NO COAST: a town with no `__water__` runs gets `coastDist: { absent: true, why }` — a named
 * absence, never a zero field.
 *
 * ▶ node cartograph/bake-coast-distance.js --scene=<scene> [--look=<look>] [--data-root=<dir>]
 * ▶ node checks/claims-coast-distance-is-the-coast.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { waterRuns } from './shoreRuns.mjs'
import { SURFACES, resolveSurfaceParams } from './surfaces.mjs'
import { requireExplicitMap } from './scene.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Bands (metres) any surface declares against this channel, and whether each is resolved. */
export function bandsInUse(surfaces = SURFACES) {
  const out = []
  for (const [surface, def] of Object.entries(surfaces))
    for (const [name, p] of Object.entries(def.params || {}))
      if (p.channel === 'coastDist') out.push({ surface, name, value: Number.isFinite(p.value) ? p.value : null, question: p.question ?? null })
  return out
}

// Felzenszwalb–Huttenlocher 1-D squared distance transform, in place over `f` (length n).
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]] }
}

/**
 * The field, from runs + grid. Exact point-to-segment distance for texels within two cells of
 * a run; beyond, the Euclidean distance transform to the texels the runs pass through
 * (error bounded by one texel diagonal, recorded as `farErrorBoundM`).
 * @returns {{ field: Float32Array, W, H, stepX, stepZ, errBoundM }}
 */
export function coastDistanceField(runs, { bounds, width: W, height: H }) {
  const stepX = (bounds.maxX - bounds.minX) / (W - 1), stepZ = (bounds.maxZ - bounds.minZ) / (H - 1)
  const near = new Float32Array(W * H).fill(Infinity)
  const nearCells = 2
  const nearR = nearCells * Math.min(stepX, stepZ)          // exact band radius
  const seedR = 0.5 * Math.hypot(stepX, stepZ)               // a run passes through this texel
  for (const poly of runs) for (let i = 1; i < poly.length; i++) {
    const [ax, az] = poly[i - 1], [bx, bz] = poly[i]
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - bounds.minX) / stepX) - nearCells)
    const i1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) - bounds.minX) / stepX) + nearCells)
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - bounds.minZ) / stepZ) - nearCells)
    const j1 = Math.min(H - 1, Math.ceil((Math.max(az, bz) - bounds.minZ) / stepZ) + nearCells)
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const px = bounds.minX + ii * stepX, pz = bounds.minZ + j * stepZ
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0
      const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
      const k = j * W + ii
      if (d <= nearR && d < near[k]) near[k] = d
    }
  }
  // EDT (in texel units) to every texel the exact pass reached; then metres.
  const g = new Float64Array(W * H)
  for (let k = 0; k < W * H; k++) g[k] = near[k] <= seedR ? 0 : 1e20
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  for (let ii = 0; ii < W; ii++) { for (let j = 0; j < H; j++) f[j] = g[j * W + ii]; edt1d(f, H, d, v, z); for (let j = 0; j < H; j++) g[j * W + ii] = d[j] }
  for (let j = 0; j < H; j++) { for (let ii = 0; ii < W; ii++) f[ii] = g[j * W + ii]; edt1d(f, W, d, v, z); for (let ii = 0; ii < W; ii++) g[j * W + ii] = d[ii] }
  const step = Math.min(stepX, stepZ)
  const field = new Float32Array(W * H)
  for (let k = 0; k < W * H; k++) field[k] = Number.isFinite(near[k]) ? near[k] : Math.sqrt(g[k]) * step
  return { field, W, H, stepX, stepZ, errBoundM: Math.hypot(stepX, stepZ) }
}

export function bakeCoastDistance({ scene, look, dataRoot = ROOT, outRoot = ROOT }) {
  const lookId = look || scene
  const shapePath = join(dataRoot, 'public', 'baked', lookId, 'shape.json')
  const tMetaPath = join(dataRoot, 'cartograph', 'data', scene, 'clean', 'terrain.json')
  for (const [p, what] of [[shapePath, 'shape.json'], [tMetaPath, 'clean/terrain.json']])
    if (!existsSync(p)) throw new Error(`bake-coast-distance: ${scene} has no ${what} (${p}). Pour the town first.`)
  const shape = JSON.parse(readFileSync(shapePath, 'utf8'))
  const tm = JSON.parse(readFileSync(tMetaPath, 'utf8'))

  const all = waterRuns(shape)
  // A run whose vertices are all one point has no extent to measure from; name it.
  const refused = [], runs = []
  all.forEach((poly, index) => {
    const L = poly.reduce((s, p, i) => i ? s + Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]) : 0, 0)
    if (L === 0) refused.push({ index, why: 'zero length — every vertex is the same point' }); else runs.push(poly)
  })

  const outDir = join(outRoot, 'public', 'baked', lookId)
  mkdirSync(outDir, { recursive: true })
  const bands = bandsInUse()
  const resolved = bands.filter(b => b.value != null)
  let channel
  let derivedSand = { beachBandM: { absent: true, why: 'no coastline (coastDist absent)' }, beachSlopeDeg: { absent: true, why: 'no coastline (coastDist absent)' } }
  if (!runs.length) {
    channel = { absent: true, why: all.length ? `all ${all.length} __water__ run(s) refused` : 'no __water__ runs in shape.json — this town has no shoreline', refused }
    console.log(`[bake-coast-distance] ${lookId}: ⛔ coastDist ABSENT — ${channel.why}`)
  } else {
    const smallest = resolved.length ? Math.min(...resolved.map(b => b.value)) : null
    // ⛔ A resolved band finer than the terrain grid is not honoured yet: say so, loudly.
    const gridStep = Math.min((tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1), (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1))
    if (smallest != null && smallest / 2 < gridStep) console.error(`[bake-coast-distance] ⛔ smallest band ${smallest} m needs ≤ ${smallest / 2} m texels; this bake samples the ${gridStep.toFixed(2)} m terrain grid.`)
    const texelFrom = smallest != null ? `terrain grid (smallest band in use: ${smallest} m)` : `terrain grid — no band reading coastDist is resolved (${bands.map(b => `${b.surface}.${b.name}: ${b.question ?? '[U]'}`).join(', ') || 'none declared'})`
    const t0 = Date.now()
    const { field, W, H, stepX, stepZ, errBoundM } = coastDistanceField(runs, tm)
    let maxM = 0; for (const v of field) if (v > maxM) maxM = v
    const mPerUnit = maxM / 65535
    const q = new Uint16Array(W * H); for (let k = 0; k < q.length; k++) q[k] = Math.round(field[k] / mPerUnit)
    writeFileSync(join(outDir, 'context.coastDist.bin'), Buffer.from(q.buffer))
    const lenM = runs.reduce((s, poly) => s + poly.reduce((a, p, i) => i ? a + Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]) : 0, 0), 0)
    channel = {
      bin: 'context.coastDist.bin', format: 'uint16', width: W, height: H, bounds: tm.bounds,
      mPerUnit, maxM: +maxM.toFixed(2), texelM: [+stepX.toFixed(4), +stepZ.toFixed(4)], texelFrom,
      farErrorBoundM: +errBoundM.toFixed(2), runs: runs.length, shorelineM: +lenM.toFixed(1), refused,
    }
    console.log(`[bake-coast-distance] ${lookId}: ${runs.length} run(s), ${(lenM / 1000).toFixed(2)} km → ${W}×${H} at ${stepX.toFixed(2)} m (${texelFrom}), max ${maxM.toFixed(0)} m, ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    // The sand surface's per-town parameters, from THIS town's beach against THIS coast.
    const mapPath = join(dataRoot, 'cartograph', 'data', scene, 'clean', 'map.json')
    const tBinPath = join(dataRoot, 'cartograph', 'data', scene, 'clean', 'terrain.bin')
    const natural = existsSync(mapPath) ? (JSON.parse(readFileSync(mapPath, 'utf8')).layers?.natural || []) : null
    const hb = existsSync(tBinPath) ? readFileSync(tBinPath) : null
    const heights = hb && hb.byteLength === W * H * 4 ? new Float32Array(hb.buffer, hb.byteOffset, W * H) : null
    derivedSand = natural ? deriveSand({ field, W, H, bounds: tm.bounds, heights, natural })
      : { beachBandM: { absent: true, why: 'no clean/map.json' }, beachSlopeDeg: { absent: true, why: 'no clean/map.json' } }
    // The band that drives the texel is now DERIVED here; say which, and whether the grid honours it.
    if (derivedSand.beachBandM.value) channel.texelFrom = `terrain grid (sand.beachBandM derived at ${derivedSand.beachBandM.value} m; the ${stepX.toFixed(2)} m texel ${stepX <= derivedSand.beachBandM.value / 2 ? 'resolves' : '⛔ does NOT resolve'} it)`
    for (const [k, v] of Object.entries(derivedSand)) console.log(`  sand.${k}: ${v.absent ? '⛔ ABSENT — ' + v.why : v.value + ' ' + v.unit + ' (n=' + v.n + ')'}`)
    for (const r of refused) console.log(`  ⛔ refused run #${r.index}: ${r.why}`)
  }
  const manifestPath = join(outDir, 'context.json')
  const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { channels: {} }
  // ⭐ RESOLVED here, where the registry is readable: physics (findings) + this town's derived
  // values → { values, absent }. The runtime lays the operator's authored layer over it and
  // never reads references/ itself.
  const regPath = join(dataRoot, 'references', 'registry.json')
  const registry = existsSync(regPath) ? JSON.parse(readFileSync(regPath, 'utf8')) : null
  const resolvedSand = registry ? resolveSurfaceParams('sand', registry, {}, derivedSand)
    : { values: {}, absent: ['every physics param (no references/registry.json at bake)'] }
  const out = { version: 1, look: lookId, channels: { ...prev.channels, coastDist: channel },
    derived: { ...(prev.derived || {}), sand: derivedSand }, resolved: { ...(prev.resolved || {}), sand: resolvedSand } }
  writeFileSync(manifestPath, JSON.stringify(out, null, 1))
  return out
}

/**
 * The sand surface's DERIVED parameters for one town (surfaces.mjs sand: beachBandM, beachSlopeDeg).
 * Reads the percentile and the ground each is taken over from the param defs — nothing restated.
 * `natural` = clean/map.json layers.natural ({ ring, use }); `heights` = the terrain grid (Float32,
 * same bounds + size as the field). Each result is { value, unit, n, from } or { absent, why }.
 */
export function deriveSand({ field, W, H, bounds, heights, natural, defs = SURFACES.sand.params }) {
  const stepX = (bounds.maxX - bounds.minX) / (W - 1), stepZ = (bounds.maxZ - bounds.minZ) / (H - 1)
  const inside = (ring, x, z) => { let c = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const A = ring[i], B = ring[j]
      if ((A.z > z) !== (B.z > z) && x < (B.x - A.x) * (z - A.z) / (B.z - A.z) + A.x) c = !c }
    return c }
  const texelsOver = (uses) => {
    const ks = new Set()
    for (const f of natural || []) {
      if (!uses.includes(f.use) || !(f.ring?.length > 2)) continue
      const xs = f.ring.map(p => p.x), zs = f.ring.map(p => p.z)
      const i0 = Math.max(1, Math.ceil((Math.min(...xs) - bounds.minX) / stepX)), i1 = Math.min(W - 2, Math.floor((Math.max(...xs) - bounds.minX) / stepX))
      const j0 = Math.max(1, Math.ceil((Math.min(...zs) - bounds.minZ) / stepZ)), j1 = Math.min(H - 2, Math.floor((Math.max(...zs) - bounds.minZ) / stepZ))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        if (inside(f.ring, bounds.minX + i * stepX, bounds.minZ + j * stepZ)) ks.add(j * W + i)
    }
    return [...ks]
  }
  const pct = (arr, p) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))] }
  const out = {}
  const B = defs.beachBandM
  const band = texelsOver(B.over)
  out.beachBandM = band.length
    ? { value: +pct(band.map(k => field[k]), B.percentile).toFixed(1), unit: 'm', n: band.length, from: B.from }
    : { absent: true, why: `no ${B.over.join('/')}-tagged ground in clean/map.json — this town's coast has no mapped beach` }
  const S = defs.beachSlopeDeg
  if (out.beachBandM.absent) out.beachSlopeDeg = { absent: true, why: `needs ${S.within}, which is absent` }
  else if (!heights) out.beachSlopeDeg = { absent: true, why: 'no terrain grid (clean/terrain.bin)' }
  else {
    const lim = out.beachBandM.value
    const slopes = texelsOver(S.over).filter(k => field[k] <= lim).map(k => {
      const dx = (heights[k + 1] - heights[k - 1]) / (2 * stepX), dz = (heights[k + W] - heights[k - W]) / (2 * stepZ)
      return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI
    })
    out.beachSlopeDeg = slopes.length
      ? { value: +pct(slopes, S.percentile).toFixed(2), unit: '°', n: slopes.length, from: S.from }
      : { absent: true, why: `no ${S.over.join('/')} ground within ${lim} m of the waterline` }
  }
  return out
}

function main() {
  // The one resolver for --scene= and CARTOGRAPH_SCENE. Inside main(), never at module
  // level: checks import this file, and a module-level guard would exit them.
  const scene = requireExplicitMap('bake-coast-distance.js (writes public/baked/<look>/context.*)')
  const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
  bakeCoastDistance({ scene, look: arg('look'), dataRoot: arg('data-root') || ROOT })
}

if (import.meta.url === `file://${process.argv[1]}`) main()
