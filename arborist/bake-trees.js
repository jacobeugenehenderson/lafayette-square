/**
 * bake-trees.js — resolve the live picker into a static placement file.
 *
 * Reads:
 *   public/trees/index.json      — rated runtime pool
 *   src/data/park_trees.json     — 644 placement positions
 *   src/data/park_species_map.json — species-id → preferred library subset
 *   public/baked/<heroLook>/scene.json       — hero pan (heroTier classifier)
 *   public/baked/<heroLook>/trees-atlas.json — canopyByVariant dims (bake-look)
 *   --look <name>                — Look name (defaults 'default')
 *   --styles realistic[,winter…] — active style set (defaults 'realistic')
 *   --lod lod0|lod1|lod2         — LOD to ship (defaults 'lod2')
 *   --heroLook <name>            — Look whose hero pan drives heroTier (def 'lafayette-square')
 *
 * Writes:
 *   public/baked/<look>.json
 *
 * Schema:
 *   { generatedAt, look, lod, activeStyles, count, heroTierMeta,
 *     tiles: { cols, rows, minX, minZ, tileW, tileD,
 *              instancesByTile: [{ tileX, tileZ, instances: [...] }, ...] } | null,
 *     instances: [{ x, z, url, scale, rotY, species, variantId, heroTier? }] }
 *
 * `heroTier` ('mesh'|'impostor') is a purely DERIVED per-tree visibility class
 * for the Hero shot (no authored override). Omitted when no hero pan is found.
 *
 * Stage / Mobile read this file and instance directly. No live picker,
 * no index.json, no overrides — just placements.
 */
import { promises as fs } from 'node:fs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// Shared hero-pan math — the SAME Catmull-Rom the runtime plays
// (src/preview/heroAnim.js: pure, allocation-free, no React/DOM). Importing it
// (vs reimplementing) keeps the bake-time classifier's camera locus in lock-step
// with what Scene/Preview/Stage actually render. Node-safe ESM.
import { catmullRom } from '../src/preview/heroAnim.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// Per-tree lamp-glow: sample the same gaussian splat the runtime
// `getLampLightmap()` builds in src/components/lampLightmap.js, but
// at each tree's world position. Bake-time pre-sample → one float per
// instance → leaf shader does one cheap multiply at render time, no
// per-fragment texture lookup. Same SIGMA/EXTENT/CUTOFF as runtime so
// per-tree intensity matches the grass shader's per-fragment intensity
// at the same point.
const LAMP_SIGMA = 12
const LAMP_SIGMA2 = 2 * LAMP_SIGMA * LAMP_SIGMA
const LAMP_CUTOFF2 = (4 * LAMP_SIGMA) * (4 * LAMP_SIGMA)
const LAMP_MAX = 1.5
const _lamps = JSON.parse(readFileSync(
  path.join(REPO_ROOT, 'src', 'data', 'street_lamps.json'), 'utf-8')).lamps
function lampGlowAt(wx, wz) {
  let acc = 0
  for (let l = 0; l < _lamps.length; l++) {
    const dx = wx - _lamps[l].x
    const dz = wz - _lamps[l].z
    const d2 = dx * dx + dz * dz
    if (d2 > LAMP_CUTOFF2) continue
    acc += Math.exp(-d2 / LAMP_SIGMA2)
  }
  return Math.min(acc, LAMP_MAX)
}
// ── Forbidden-surface filter ─────────────────────────────────────────────
// Trees can't occupy buildings, streets, alleys, sidewalks, footways, paths,
// or water. Tested in WORLD coords against polygons sourced from the
// cartograph clean map + park water capture. Returns a function (wx, wz) →
// reason string ('building'|'pavement'|'alley'|'sidewalk'|'footway'|'path'|
// 'water') or null when the location is allowed.
function pointInRing(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}
function pointInPolygon(px, pz, poly) {
  // poly: { ring, holes? } — outer ring with optional holes (e.g. water with island)
  const ring = poly.ring || poly
  if (!pointInRing(px, pz, ring)) return false
  if (poly.holes) for (const h of poly.holes) if (pointInRing(px, pz, h)) return false
  return true
}
function makeForbiddenTester() {
  // TODO(0e): resolve scene from the active Look's scene field.
  const map = JSON.parse(readFileSync(path.join(REPO_ROOT, 'cartograph', 'data', 'lafayette-square', 'clean', 'map.json'), 'utf-8'))
  const water = JSON.parse(readFileSync(path.join(REPO_ROOT, 'src', 'data', 'park_water.json'), 'utf-8'))

  // pointInRing below indexes ring[i][0] / [1]. park_water.json uses
  // [x, z] arrays directly; map.json uses {x, z} objects. Normalize to
  // arrays here so the test works against every polygon source.
  const toArr = (ring) => ring.map(p => Array.isArray(p) ? p : [p.x, p.z])

  // park_water.json is in compass frame, same as map.json.
  const lakeOuter  = water.lake?.outer  || []
  const lakeIsland = water.lake?.island || []
  const grotto     = water.grotto       || []
  const waterPolys = []
  if (lakeOuter.length) waterPolys.push({ ring: toArr(lakeOuter), holes: lakeIsland.length ? [toArr(lakeIsland)] : null })
  if (grotto.length)    waterPolys.push({ ring: toArr(grotto) })

  // map.json layers (compass frame). Each entry is { ring, holes? }.
  const buildings = (map.buildings || [])
    .map(b => ({ ring: toArr(b.footprint || b.ring || []) }))
    .filter(b => b.ring.length >= 3)
  const layer = (k) => (map.layers?.[k] || [])
    .map(p => ({ ring: toArr(p.ring || []), holes: p.holes ? p.holes.map(toArr) : null }))
    .filter(p => p.ring.length >= 3)
  const pavement = layer('pavement')
  const alley    = layer('alley')
  // Note: `parkSidewalk` is a single polygon covering the park interior,
  // not a perimeter strip — including it would forbid every park tree.
  // Trees on park-internal walks are filtered via `path` + `footway` instead.
  const sidewalk = layer('sidewalk')
  const footway  = layer('footway')
  const pathway  = layer('path')

  const checks = [
    ['water',    waterPolys],
    ['building', buildings],
    ['pavement', pavement],
    ['alley',    alley],
    ['sidewalk', sidewalk],
    ['footway',  footway],
    ['path',     pathway],
  ]
  return function classify(wx, wz) {
    for (const [reason, polys] of checks) {
      for (const p of polys) if (pointInPolygon(wx, wz, p)) return reason
    }
    return null
  }
}

const SHAPE_TO_CATEGORY = {
  broad: 'broadleaf',
  conifer: 'conifer',
  ornamental: 'ornamental',
  weeping: 'weeping',
  columnar: 'columnar',
}
const CATEGORY_FALLBACK = {
  ornamental: ['broadleaf'],
  weeping: ['broadleaf'],
  columnar: ['broadleaf', 'conifer'],
  conifer: ['broadleaf'],
  broadleaf: ['conifer'],
}

function parseArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) { args[key] = next; i++ }
      else args[key] = true
    }
  }
  return args
}

function hash01(seed, salt = 0) {
  let h = (seed | 0) ^ (salt * 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return ((h >>> 0) % 1_000_000) / 1_000_000
}

function treeSeed(tree, idx) {
  return Math.imul(((tree.x * 1000) | 0) ^ idx * 73856093,
                   ((tree.z * 1000) | 0) ^ 19349663)
}

function pickVariant(parkSpecies, category, pool, activeStyles, speciesMap, seed) {
  const preferred = speciesMap.map?.[parkSpecies]
  if (preferred?.length) {
    const speciesSet = new Set(preferred)
    const candidates = pool.filter(v =>
      speciesSet.has(v.species) &&
      v.styles?.some(s => activeStyles.has(s)),
    )
    if (candidates.length) {
      // Per ARCHITECTURE.md "Two-tier substitution": heroes win their
      // bucket's quality lottery automatically (`4 > 2`). Restrict the hash
      // lottery to the top-quality tier among preferred-list candidates so
      // an authored hero at quality 4 dominates vs vendor at quality 2.
      // Falls back to the full candidate set if there's only one tier.
      const maxQ = candidates.reduce((m, v) => Math.max(m, v.quality ?? 0), 0)
      const top = candidates.filter(v => (v.quality ?? 0) === maxQ)
      const pool2 = top.length ? top : candidates
      const idx = Math.floor(hash01(seed, 1) * pool2.length)
      return pool2[idx]
    }
  }
  for (const cat of [category, ...(CATEGORY_FALLBACK[category] || [])]) {
    const candidates = pool.filter(v =>
      v.category === cat &&
      v.styles?.some(s => activeStyles.has(s)),
    )
    if (candidates.length) {
      const idx = Math.floor(hash01(seed, 1) * candidates.length)
      return candidates[idx]
    }
  }
  return null
}

// ── Hero-shot visibility tiering (Phase A — Azimuth) ─────────────────────────
// Analytic prominence pass: score each placed tree across the authored hero pan
// and label it `mesh` (keep full lod2 geometry) or `impostor` (cheap billboard,
// consumed in later phases). Purely DERIVED — no authored override, no knobs.
//
// The hero "arc" is whatever the camera ACTUALLY traverses; the pan is read from
// the slab, so the classification self-adjusts when the operator re-polishes the
// shot (NOT pinned to any fixed angle). Tier is the MAX over sampled poses ⇒
// constant through the pan ⇒ no mid-pan popping.
//
// Tunables — calibrated against the operator's eye at the A→B seam (QC overlay):
const HERO_TIER = {
  POSES: 24,             // camera samples along the keyframe path
  PROM_THRESHOLD: 0.05,  // min screen-prominence (at ANY pose) to stay `mesh`
  OCC_FRAC: 0.7,         // a nearer canopy covering ≥ this fraction of a tree's
                         // projected disk occludes it at that pose
  ASPECT: 16 / 9,        // viewport aspect for the horizontal frustum bound
  CENTER_Y_FRAC: 0.6,    // canopy vertical centre as a fraction of tree height
}
// Mirror of StageApp.FALLBACK_HERO_SUBJECT / Scene.HERO_TARGET (both [400,45,-100]).
// Used when the slab's heroSubject is null (current LS state).
const FALLBACK_HERO_TARGET = [400, 45, -100]

const _clamp1 = (x) => (x < -1 ? -1 : x > 1 ? 1 : x)
// Fraction of circle i (radius ri) covered by circle j (radius rj), centres d apart.
function circleCoverFrac(d, ri, rj) {
  if (ri <= 0) return 0
  if (d >= ri + rj) return 0
  if (d <= Math.abs(rj - ri)) return rj >= ri ? 1 : (rj * rj) / (ri * ri)
  const ri2 = ri * ri, rj2 = rj * rj
  const a = (ri2 - rj2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, ri2 - a * a))
  const pi_ = ri2 * Math.acos(_clamp1(a / ri)) - a * h
  const b = d - a
  const pj_ = rj2 * Math.acos(_clamp1(b / rj)) - b * h
  return (pi_ + pj_) / (Math.PI * ri2)
}

// Resolve each placement's canopy dims (real metres) from bake-look's
// `trees-atlas.json#canopyByVariant`. 93% of placements are out-of-roster and
// substituted to a SAME-CATEGORY roster variant at RUNTIME (InstancedTrees), and
// bake-look only has dims for the (rendered) roster variants — so we use the
// exact roster dims when a placement is itself in-roster, else the category mean
// over roster variants (the substitute is always same-category). No lib→roster
// hash mirroring; real measured dims; correct in expectation. (Validated at the
// A→B QC seam — if substituted trees misclassify, escalate to a shared
// substitution fn.)
function buildCanopyResolver(canopyByVariant, indexVariants) {
  const categoryOf = new Map()  // "species:variantId" → category (from index pool)
  for (const v of indexVariants) categoryOf.set(`${v.species}:${v.variantId}`, v.category)
  const exact = new Map()       // "species:variantId" → { heightM, canopyRadiusM }
  const catAccum = new Map()    // category → { h, r, n }
  for (const [sp, vars] of Object.entries(canopyByVariant || {})) {
    for (const [vid, d] of Object.entries(vars)) {
      if (d?.canopyRadiusM == null) continue
      exact.set(`${sp}:${vid}`, d)
      const cat = categoryOf.get(`${sp}:${vid}`) || 'broadleaf'
      const a = catAccum.get(cat) || { h: 0, r: 0, n: 0 }
      a.h += d.heightM ?? 12; a.r += d.canopyRadiusM; a.n++
      catAccum.set(cat, a)
    }
  }
  const catMean = new Map()
  for (const [cat, a] of catAccum) catMean.set(cat, { heightM: a.h / a.n, canopyRadiusM: a.r / a.n })
  let gh = 0, gr = 0, gn = 0
  for (const d of exact.values()) { gh += d.heightM ?? 12; gr += d.canopyRadiusM; gn++ }
  const globalMean = gn ? { heightM: gh / gn, canopyRadiusM: gr / gn } : { heightM: 12, canopyRadiusM: 4 }
  const resolve = (species, variantId, category) =>
    exact.get(`${species}:${variantId}`) || catMean.get(category) || globalMean
  return { resolve, haveDims: exact.size > 0 }
}

// canopies: [{ x, z, centerY, R }] world-space bounding spheres, parallel to the
// placed instances. Returns { tiers: ('mesh'|'impostor')[], meta }.
function classifyHeroTiers(canopies, heroPan) {
  const n = canopies.length
  const tiers = new Array(n).fill('mesh')
  if (!heroPan?.keyframes?.length || n === 0) {
    return { tiers, meta: { skipped: 'no-hero-pan' } }
  }
  const positions = heroPan.keyframes.map((k) => k.position)
  const fovDeg = heroPan.keyframes[0].fov ?? 22
  const vHalf = (fovDeg * Math.PI / 180) / 2
  const hHalf = Math.atan(Math.tan(vHalf) * HERO_TIER.ASPECT)
  const target = Array.isArray(heroPan.subject) ? heroPan.subject : FALLBACK_HERO_TARGET
  const tension = heroPan.tension ?? 0.5
  const diagHalf = Math.hypot(hHalf, vHalf)

  // Camera positions sampled uniformly along the locus catmullRom(positions, t),
  // t∈[0,1]. The motion wave only changes dwell/speed, not the set of points the
  // camera occupies, so uniform-t covers the whole sweep for max-over-arc.
  const N = HERO_TIER.POSES
  const poses = []
  for (let s = 0; s < N; s++) {
    const t = N === 1 ? 0 : s / (N - 1)
    const p = catmullRom(positions, t, tension, [0, 0, 0])
    poses.push([p[0], p[1], p[2]])
  }

  const maxProm = new Float64Array(n)
  const proj = new Array(n)
  for (let i = 0; i < n; i++) proj[i] = { in: false, h: 0, v: 0, r: 0, depth: 0 }

  for (const cam of poses) {
    // Camera basis: forward = unit(target - cam); right = unit(forward × up);
    // up' = right × forward. Sign of `right` is irrelevant (we test |angle|).
    let fx = target[0] - cam[0], fy = target[1] - cam[1], fz = target[2] - cam[2]
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl
    let rx = -fz, ry = 0, rz = fx              // forward × (0,1,0)
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx

    for (let i = 0; i < n; i++) {
      const c = canopies[i]
      const dx = c.x - cam[0], dy = c.centerY - cam[1], dz = c.z - cam[2]
      const depth = dx * fx + dy * fy + dz * fz
      const pr = proj[i]
      if (depth <= 0.01) { pr.in = false; continue }
      const xc = dx * rx + dy * ry + dz * rz
      const yc = dx * ux + dy * uy + dz * uz
      const ah = Math.atan2(xc, depth)
      const av = Math.atan2(yc, depth)
      const ar = Math.atan2(c.R, Math.hypot(dx, dy, dz))
      pr.in = Math.abs(ah) < hHalf + ar && Math.abs(av) < vHalf + ar
      pr.h = ah; pr.v = av; pr.r = ar; pr.depth = depth
    }
    for (let i = 0; i < n; i++) {
      const pr = proj[i]
      if (!pr.in) continue
      let occ = 0
      for (let j = 0; j < n; j++) {
        if (j === i) continue
        const pj = proj[j]
        if (!pj.in || pj.depth >= pr.depth - 0.5) continue    // only nearer disks occlude
        const f = circleCoverFrac(Math.hypot(pr.h - pj.h, pr.v - pj.v), pr.r, pj.r)
        if (f > occ) occ = f
        if (occ >= HERO_TIER.OCC_FRAC) break
      }
      if (occ >= HERO_TIER.OCC_FRAC) continue
      const coverage = (2 * pr.r) / (2 * vHalf)               // angular diameter / vfov
      const centrality = Math.max(0, 1 - Math.hypot(pr.h, pr.v) / diagHalf)
      const prom = coverage * centrality
      if (prom > maxProm[i]) maxProm[i] = prom
    }
  }

  let meshN = 0, impostorN = 0
  const hist = new Array(10).fill(0)                          // 0.05-wide buckets
  for (let i = 0; i < n; i++) {
    const m = maxProm[i]
    hist[Math.min(9, Math.floor(m * 20))]++
    if (m >= HERO_TIER.PROM_THRESHOLD) { tiers[i] = 'mesh'; meshN++ }
    else { tiers[i] = 'impostor'; impostorN++ }
  }
  return {
    tiers,
    meta: {
      poses: N, promThreshold: HERO_TIER.PROM_THRESHOLD, occFrac: HERO_TIER.OCC_FRAC,
      fovDeg, target, mesh: meshN, impostor: impostorN, promHistogram: hist,
    },
  }
}

export async function bakeTrees({
  look = 'default',
  styles = ['realistic'],
  lod = 'lod2',
  heroLook = 'lafayette-square', // which Look's baked hero pan + canopy dims drive heroTier
  placements,    // override path, e.g. 'src/data/toy/toy-trees.json'
  output,        // override output path; defaults to public/baked/<look>.json
  verbose = false,
} = {}) {
  const lookName = look
  const activeStyles = new Set(styles)
  const targetLod = lod

  const indexPath = path.join(REPO_ROOT, 'public', 'trees', 'index.json')
  const parkPath = placements
    ? path.resolve(REPO_ROOT, placements)
    : path.join(REPO_ROOT, 'src', 'data', 'park_trees.json')
  const mapPath = path.join(REPO_ROOT, 'src', 'data', 'park_species_map.json')

  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  const park = JSON.parse(await fs.readFile(parkPath, 'utf8'))
  const speciesMap = JSON.parse(await fs.readFile(mapPath, 'utf8'))

  if (verbose) {
    console.log(`[bake-trees] look=${lookName} styles=[${[...activeStyles].join(',')}] lod=${targetLod}`)
    console.log(`[bake-trees] pool: ${index.variants.length} variants, ${park.trees.length} placements`)
  }

  // Forbidden-surface tester. Skip for non-default placements (toy fixture
  // doesn't have street/sidewalk polygons in the same world frame).
  const isForbidden = placements ? null : makeForbiddenTester()

  const instances = []
  // Parallel to `instances` (pushed in lock-step) — per-tree canopy bounding
  // sphere {x, z, centerY, R} in world metres for the hero-tier prominence pass.
  const canopies = []
  let unmatched = 0
  const forbiddenCounts = {}

  // Hero pan + canopy dims for the heroTier classifier, both read from the active
  // Look's baked slab (render-truth — the SAME hero the runtime plays + the dims
  // bake-look measured from the rendered roster trees). Skipped for the toy
  // fixture (no hero shot). Absent → heroTier omitted; runtime falls back to
  // all-mesh (version-agnostic tree path).
  let heroPan = null
  let resolveCanopy = null
  if (!placements) {
    try {
      const s = JSON.parse(await fs.readFile(
        path.join(REPO_ROOT, 'public', 'baked', heroLook, 'scene.json'), 'utf8'))
      if (Array.isArray(s.heroKeyframes) && s.heroKeyframes.length) {
        heroPan = { keyframes: s.heroKeyframes, subject: s.heroSubject, tension: s.heroMotion?.tension }
      }
    } catch (e) {
      if (verbose) console.log(`[bake-trees] hero pan unavailable for '${heroLook}' (${e.code || e.message}) — heroTier skipped`)
    }
    if (heroPan) {
      let canopyByVariant = {}
      try {
        canopyByVariant = JSON.parse(await fs.readFile(
          path.join(REPO_ROOT, 'public', 'baked', heroLook, 'trees-atlas.json'), 'utf8')).canopyByVariant || {}
      } catch { /* dims absent → resolver falls back to global mean */ }
      const r = buildCanopyResolver(canopyByVariant, index.variants)
      resolveCanopy = r.resolve
      if (!r.haveDims && verbose) {
        console.log(`[bake-trees] canopyByVariant empty for '${heroLook}' — heroTier uses fallback dims`)
      }
    }
  }

  for (let i = 0; i < park.trees.length; i++) {
    const tree = park.trees[i]
    const cat = SHAPE_TO_CATEGORY[tree.shape] || 'broadleaf'
    const seed = treeSeed(tree, i)
    const v = pickVariant(tree.species, cat, index.variants, activeStyles, speciesMap, seed)
    if (!v) { unmatched++; continue }
    const lodUrl = v.skeletons[targetLod] || v.skeletons.lod1 || v.skeletons.lod0
    if (!lodUrl) { unmatched++; continue }
    // Surface filter: drop trees that land in a forbidden polygon
    // (water/building/street/etc.). Applied BEFORE positionOverride since
    // the override is a variant-local nudge.
    if (isForbidden) {
      const reason = isForbidden(tree.x, tree.z)
      if (reason) {
        forbiddenCounts[reason] = (forbiddenCounts[reason] || 0) + 1
        continue
      }
    }
    // Rotation: operator's rotationOverride.y picks the variant's "best
    // face"; preserve it. Without an override, randomize for variety.
    const rotY = (v.rotationOverride?.y !== undefined)
      ? v.rotationOverride.y
      : hash01(seed, 3) * Math.PI * 2
    // Position: operator's positionOverride lets them nudge a variant
    // off-center (e.g. trunk centered at origin). Park placement supplies
    // the world-space target; override is the variant-local offset.
    const px = v.positionOverride?.x ?? 0
    const pz = v.positionOverride?.z ?? 0
    const py = v.positionOverride?.y ?? 0
    const finalX = tree.x + px
    const finalZ = tree.z + pz
    instances.push({
      x: +finalX.toFixed(4),
      // Ground reverted to flat (#19); trees plant at y=0 + override.
      y: +py.toFixed(4),
      z: +finalZ.toFixed(4),
      url: lodUrl,
      // Scale is baked into the GLB at Arborist publish (bake-look). Runtime
      // always renders at 1:1.
      rotY: +rotY.toFixed(4),
      species: v.species,
      variantId: v.variantId,
      category: v.category,
      // Pre-sampled lamp gaussian at this tree's world position. Runtime
      // multiplies by `uLampGlow` (per-Look TOD-curve slider) for the
      // final emissive contribution.
      lampGlow: +lampGlowAt(finalX, finalZ).toFixed(4),
    })
    // Canopy bounding sphere (parallel push) for the hero-tier prominence pass.
    if (resolveCanopy) {
      const dims = resolveCanopy(v.species, v.variantId, v.category)
      canopies.push({
        x: finalX, z: finalZ,
        centerY: (dims.heightM ?? 12) * HERO_TIER.CENTER_Y_FRAC,
        R: Math.max(0.5, dims.canopyRadiusM ?? 4),
      })
    }
  }

  // Hero-tier classification (Phase A). Assign `heroTier` per instance in
  // lock-step with `canopies`. Skipped (field omitted) when no hero pan/dims.
  let heroTierMeta = null
  if (heroPan && canopies.length === instances.length && canopies.length) {
    const { tiers, meta } = classifyHeroTiers(canopies, heroPan)
    for (let i = 0; i < instances.length; i++) instances[i].heroTier = tiers[i]
    heroTierMeta = { heroLook, ...meta }
    if (verbose) {
      console.log(`[bake-trees] heroTier: ${meta.mesh} mesh / ${meta.impostor} impostor `
        + `(thresh ${meta.promThreshold}, ${meta.poses} poses, fov ${meta.fovDeg}°)`)
    }
  }

  // Stats
  const variantUseCount = new Map()
  for (const i of instances) {
    const k = `${i.species}/${i.variantId}`
    variantUseCount.set(k, (variantUseCount.get(k) || 0) + 1)
  }

  // Spatial tiling. Bucket instances into a 4×4 grid (in park-local coords,
  // matching the runtime <group> the InstancedMeshes mount under). Runtime
  // emits one InstancedMesh per (url × tile), so off-screen tiles cull on
  // their natural bounding sphere. Flat `instances` is preserved for
  // back-compat with older runtimes.
  const TILE_COLS = 4
  const TILE_ROWS = 4
  let tiles = null
  if (instances.length > 0) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const inst of instances) {
      if (inst.x < minX) minX = inst.x
      if (inst.x > maxX) maxX = inst.x
      if (inst.z < minZ) minZ = inst.z
      if (inst.z > maxZ) maxZ = inst.z
    }
    // Pad by 1 unit so floor() bucketing never lands on COLS/ROWS exactly.
    const tileW = Math.max(1, (maxX - minX + 2)) / TILE_COLS
    const tileD = Math.max(1, (maxZ - minZ + 2)) / TILE_ROWS
    const originX = minX - 1
    const originZ = minZ - 1
    const buckets = new Map()  // tileId -> instances[]
    for (const inst of instances) {
      const tx = Math.min(TILE_COLS - 1, Math.max(0, Math.floor((inst.x - originX) / tileW)))
      const tz = Math.min(TILE_ROWS - 1, Math.max(0, Math.floor((inst.z - originZ) / tileD)))
      const tileId = tz * TILE_COLS + tx
      if (!buckets.has(tileId)) buckets.set(tileId, { tileX: tx, tileZ: tz, instances: [] })
      buckets.get(tileId).instances.push(inst)
    }
    tiles = {
      cols: TILE_COLS,
      rows: TILE_ROWS,
      minX: +originX.toFixed(4),
      minZ: +originZ.toFixed(4),
      tileW: +tileW.toFixed(4),
      tileD: +tileD.toFixed(4),
      instancesByTile: [...buckets.values()].sort((a, b) =>
        (a.tileZ - b.tileZ) || (a.tileX - b.tileX)),
    }
  }

  const out = {
    generatedAt: Date.now(),
    look: lookName,
    lod: targetLod,
    activeStyles: [...activeStyles],
    count: instances.length,
    unmatched,
    uniqueVariants: variantUseCount.size,
    // Hero-tier classification summary (Phase A). null when no hero pan/dims;
    // per-instance `heroTier` lives on each entry in `instances`.
    heroTierMeta,
    tiles,
    instances,
  }

  const outDir = path.join(REPO_ROOT, 'public', 'baked')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `${lookName}.json`)
  await fs.writeFile(outPath, JSON.stringify(out, null, 2))

  const totalForbidden = Object.values(forbiddenCounts).reduce((a, b) => a + b, 0)
  if (verbose) {
    console.log(`[bake-trees] placed ${instances.length}/${park.trees.length} (${unmatched} unmatched, ${totalForbidden} forbidden-surface drops)`)
    if (totalForbidden) {
      const breakdown = Object.entries(forbiddenCounts).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`).join(' ')
      console.log(`[bake-trees]   forbidden: ${breakdown}`)
    }
    console.log(`[bake-trees] ${variantUseCount.size} unique variants in use`)
    console.log(`[bake-trees] → ${outPath}`)
  }
  return { count: instances.length, unmatched, forbidden: totalForbidden, forbiddenCounts, uniqueVariants: variantUseCount.size, outPath }
}

// CLI entry: only run when invoked directly (not when imported).
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  const args = parseArgs()
  bakeTrees({
    look: args.look,
    styles: (args.styles || 'realistic').split(',').map(s => s.trim()).filter(Boolean),
    lod: args.lod,
    heroLook: args.heroLook,
    placements: args.placements,
    output: args.output,
    verbose: true,
  }).catch(e => { console.error('[bake-trees] fatal:', e); process.exit(1) })
}
