/**
 * bake-trees.js — resolve the live picker into a static placement file.
 *
 * Reads:
 *   public/trees/index.json      — rated runtime pool
 *   <scene>/clean/park_census.json — authored park census (LS default well)
 *   <scene>/tree-species-map.json — species-id → preferred library subset
 *   public/baked/<heroLook>/scene.json       — hero pan (heroTier classifier)
 *   public/baked/<heroLook>/trees-atlas.json — canopyByVariant dims (bake-look)
 *   --scene <name>               — NEIGHBOURHOOD whose census is baked (def 'lafayette-square')
 *   --styles realistic[,winter…] — active style set (defaults 'realistic')
 *   --lod lod0|lod1|lod2         — LOD to ship (defaults 'lod2')
 *   --heroLook <name>            — Look whose hero pan drives heroTier (def 'lafayette-square')
 *   --zone-shape <path>          — baked shape.json: the FROZEN Section surfaces that
 *                                  answer "may a tree stand here" (poured scenes)
 *   --boundary <path>            — neighborhood_boundary.json: the hood's edge. Inside
 *                                  the street polygon = literal; outside = dissolve + heroTier
 *
 * TWO AXES, and they are NOT the same thing: `scene` is the neighbourhood (whose
 * census + roster + assets these are — species don't change because the sky does);
 * `heroLook` is the Look (whose authored camera tracks decide the per-placement
 * hero role). They read identical today only because every Look's `scene` field
 * currently equals its `id` — history, not a constraint. `--scene` was named
 * `--look` until 2026-07-15; it always meant the scene.
 *
 * Writes:
 *   public/baked/<scene>/trees.json
 *
 * Schema:
 *   { generatedAt, scene, lod, activeStyles, count, heroTierMeta, heroBandMeta,
 *     tiles: { cols, rows, minX, minZ, tileW, tileD,
 *              instancesByTile: [{ tileX, tileZ, instances: [...] }, ...] } | null,
 *     instances: [{ x, z, url, scale, rotY, species, variantId, heroTier?,
 *                  heroRole?('mesh'|'impostor'), panDist? }] }
 *
 * `heroTier` ('mesh'|'opaque'|'impostor'|'cull') is a purely DERIVED per-tree visibility class
 * for the Hero shot (no authored override). Omitted when no hero pan is found.
 *
 * Stage / Mobile read this file and instance directly. No live picker,
 * no index.json, no overrides — just placements.
 */
import { promises as fs } from 'node:fs'
import { readFileSync, existsSync } from 'node:fs'
import { makeZoneTester } from '../cartograph/forbidden-surface.mjs'
import { makeMembership } from '../cartograph/neighborhood-membership.mjs'
import { DEFAULT_SCENE } from '../cartograph/config.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// Shared hero-pan math — the SAME Catmull-Rom the runtime plays
// (src/preview/heroAnim.js: pure, allocation-free, no React/DOM). Importing it
// (vs reimplementing) keeps the bake-time classifier's camera locus in lock-step
// with what Scene/Preview/Stage actually render. Node-safe ESM.
import { catmullRom } from '../src/preview/heroAnim.js'
import { resolveHeroSubject } from '../src/lib/heroSubject.js'
import { assignHeroBand, glbTriangleCount } from './hero-band.mjs'

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
// ⭐ The lamp set is PER SCENE and loaded at bake time — never module-level.
//
// This was `const _lamps = readFileSync('src/data/street_lamps.json')`: LS's own
// 80 park lamps, read unconditionally at import, then stamped as `lampGlow` onto
// every instance of EVERY scene — evaluated in that scene's own coordinate frame,
// so a Łódź tree took its night glow from Lafayette Square's park geometry at
// geographically meaningless spots. There was no flag to override it. It is the
// same file as the bake-lamps bleed, entering by a second, independent door
// (`BRIEF-ls-bleed-excision.md` site 4).
//
// The scene's OWN baked lamps are the honest source. Absent → no glow, which is
// correct: a town with no lamp census has no lamp light.
// ⚠️ ORDERING: this reads a bake OUTPUT, so bake-lamps must run before trees for
// glow to land. Absent is honest (zero), not an error — same contract as the
// frozen-shape mask above.
let _lamps = []
function loadLampsForScene(scene) {
  const p = path.join(REPO_ROOT, 'public', 'baked', scene, 'lamps.json')
  if (!existsSync(p)) {
    console.warn(`[bake-trees] scene=${scene}: no baked lamps.json — tree lampGlow is ZERO. ` +
      `(Run bake-lamps first if this scene has a lamp census.)`)
    return []
  }
  try {
    const j = JSON.parse(readFileSync(p, 'utf-8'))
    const lamps = j.lamps || j
    return Array.isArray(lamps) ? lamps : []
  } catch (e) {
    console.warn(`[bake-trees] scene=${scene}: lamps.json unreadable (${e.message}) — lampGlow ZERO.`)
    return []
  }
}
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
// Forbidden-surface filter (a tree can never stand on hardscape/water/building)
// lives in cartograph/forbidden-surface.mjs — shared with the canopy-fill
// scatter (scripts/17), which uses it to RELOCATE candidates off hardscape.

// Canonical census-well filename → per-tree provenance `source` (Move 4). A well
// may override with `meta.well`; unnamed wells fall back to their __kind.
const SOURCE_BY_BASENAME = {
  'park_census.json':        'park',           // authored park census (hand-curated)
  'park_trees.json':         'city-inventory', // City Forestry layer 1 (whole hood)
  'forest_park_trees.json':  'forest-park',    // City Forestry layer 4 (Forest Park, rich species)
  'osm_trees.json':          'osm',            // OSM natural=tree (real positions)
  'derived_trees.json':      'derived',        // NLCD canopy fill (invented)
}

// Cross-well dedup priority: the same physical trunk recorded by two sources is
// ONE tree, and we keep the RICHEST record. Real-species inventories (city /
// Forest Park / authored park) beat OSM's real-but-sampled positions, which beat
// synthetic canopy fill. Wells fetched independently (e.g. OSM's generic point +
// Forest Park's Scientific_Name record for the same tree) overlap; this ranks the
// survivor. Unknown source → mid (real-position) rank.
const SOURCE_RANK = { 'city-inventory': 3, 'forest-park': 3, 'park': 3, 'osm': 2, 'derived': 1 }
// Which sources carry a REAL trunk-diameter (DBH) measurement — the standard
// forestry size/age proxy. The municipal inventories do; OSM ships a constant
// placeholder (all `1`) and synthetic fill has none. DBH is emitted to the slab
// ONLY for these, so anything computing a size/age distribution off the slab
// (and a 2D/authoring view sizing trees by trunk width) sees real values, never a
// placeholder masquerading as data. The rest omit it and a consumer defaults them.
const REAL_DBH_SOURCES = new Set(['city-inventory', 'forest-park', 'park'])
const DEDUP_M = 3   // same trunk if within this (matches scripts/14's OSM↔city dedup)

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

// ⛔ A numeric flag with no value parses as `true`, and Number(true) is 1 — a
// budget of one triangle that bakes an all-impostor slab and says nothing. Any
// non-finite/non-positive value is a LOUD failure, never a quiet default.
function numFlag(name, raw) {
  const v = typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`[bake-trees] --${name} needs a positive number, got ${JSON.stringify(raw)}`)
  }
  return v
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
// and label it by the 3-tier depth model — `mesh` (front row, full geometry),
// `opaque` (2nd row, articulated trunk/branches + solid opaque canopy shell),
// `impostor` (3rd row + periphery, cheap billboard), or `cull` (never/always-
// occluded, dropped). Purely DERIVED — no authored override, no knobs.
//
// The hero "arc" is whatever the camera ACTUALLY traverses; the pan is read from
// the slab, so the classification self-adjusts when the operator re-polishes the
// shot (NOT pinned to any fixed angle). Tier is the MAX over sampled poses ⇒
// constant through the pan ⇒ no mid-pan popping.
//
// Tunables — calibrated against the operator's eye at the A→B seam (QC overlay):
const HERO_TIER = {
  POSES: 24,             // camera samples along the keyframe path
  PROM_THRESHOLD: 0,     // ⭐ DEMO / SHIP (2026-06-25): EVERY visible tree → full MESH
                         // (no impostor, no opaque ellipsoid). The aggressive thresholds
                         // (0.06/0.07) were chasing the GPU GAUGE, which we found is a
                         // COUNT-vs-fake-budget verdict (draws/200, tris/1M, INTERIM) that
                         // ignores actual frame-ms — it was red even with NO trees, so it
                         // was never a real perf signal. The full-foliage forest is the
                         // look; real perf is gated on the device/staging, not this gauge.
                         // (Occlusion-cull + per-tile frustum cull stay — real wins, no
                         // look change.) Restore a front-row dial later if a REAL signal
                         // demands it: 0.02→469 mesh · 0.05→194 · 0.07→38.
  PROM_OPAQUE: 0,        // empty opaque band (== mesh floor) → no opaque ellipsoids ship.
                         // (Parked: was 0.05 — the [PROM_OPAQUE, PROM_THRESHOLD) band that
                         // routed near-but-not-front trees to the opaque canopy shell.
                         // Re-enable with the front-row dial when a REAL perf signal asks.)
  OCC_FRAC: 0.7,         // a nearer canopy covering ≥ this fraction of a tree's
                         // projected disk occludes it at that pose
  ASPECT: 16 / 9,        // viewport aspect for the horizontal frustum bound
  CENTER_Y_FRAC: 0.6,    // canopy vertical centre as a fraction of tree height
  // `cull` tier (operator request 2026-05-26): a tree NEVER inside the frustum
  // (expanded by this guard) across the whole pan is dropped entirely in the
  // hero shot — strictly cheaper than an impostor. Guard is generous so cull is
  // CONSERVATIVE: only trees well outside the view for the entire sweep go. The
  // pan is read from the slab, so widening the hero shot re-classifies on rebake.
  CULL_FRUSTUM_GUARD: 1.3,
}
// Hero target resolves via the shared resolveHeroSubject (imported above) — the
// SAME resolver every runtime camera uses. No local fallback literal: the old
// [400,45,-100] diverged from the runtime's arch default (Vernier's camera fix),
// so the classifier scored heroTier for a shot ~1200m off the real arch. This
// was the last unmigrated consumer of project_camera_framing_slab_contract.

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
// placed instances. Returns { tiers: ('mesh'|'opaque'|'impostor'|'cull')[], meta }.
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
  const target = resolveHeroSubject(heroPan.subject, { archValues: heroPan.archValues })
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
  const everSeen = new Uint8Array(n)   // ever inside the guard-expanded frustum
  // Occlusion as a DISTANCE-INDEPENDENT cull trigger (Jacob, 2026-06-25): a
  // canopy that is in-frustum but ≥OCC_FRAC-occluded by NEARER canopies in
  // EVERY pose it appears is "a speck behind a speck" — pure clutter, dropped.
  // Set when a tree is in-frustum AND not occluded in at least one pose.
  const unoccludedSeen = new Uint8Array(n)
  const hGuard = hHalf * HERO_TIER.CULL_FRUSTUM_GUARD
  const vGuard = vHalf * HERO_TIER.CULL_FRUSTUM_GUARD
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
      // Looser, guard-expanded test for the cull tier (conservative drop).
      if (Math.abs(ah) < hGuard + ar && Math.abs(av) < vGuard + ar) everSeen[i] = 1
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
      // Reached here ⇒ this pose: in-frustum AND not occluded → the tree has at
      // least one clear sightline, so it's NOT a "speck behind a speck."
      unoccludedSeen[i] = 1
      const coverage = (2 * pr.r) / (2 * vHalf)               // angular diameter / vfov
      const centrality = Math.max(0, 1 - Math.hypot(pr.h, pr.v) / diagHalf)
      const prom = coverage * centrality
      if (prom > maxProm[i]) maxProm[i] = prom
    }
  }

  let meshN = 0, opaqueN = 0, impostorN = 0, cullN = 0
  const hist = new Array(20).fill(0)                          // 0.005-wide buckets [0,0.1)
  for (let i = 0; i < n; i++) {
    const m = maxProm[i]
    hist[Math.min(19, Math.floor(m * 200))]++
    if (!everSeen[i]) { tiers[i] = 'cull'; cullN++ }          // never in frustum → dropped
    else if (!unoccludedSeen[i]) { tiers[i] = 'cull'; cullN++ } // always occluded by nearer trees → dropped (speck-behind-speck)
    else if (m >= HERO_TIER.PROM_THRESHOLD) { tiers[i] = 'mesh'; meshN++ }   // front row → real mesh
    else if (m >= HERO_TIER.PROM_OPAQUE) { tiers[i] = 'opaque'; opaqueN++ }  // 2nd row → opaque-articulated
    else { tiers[i] = 'impostor'; impostorN++ }              // 3rd row + periphery → billboard
  }
  // Calibration curve: how many trees stay `mesh` at each candidate threshold,
  // so the A→B seam can pick the split by intent ("keep the crisp X%") rather
  // than guessing an absolute prominence value.
  const sweep = {}
  for (const th of [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08]) {
    let c = 0
    for (let i = 0; i < n; i++) if (maxProm[i] >= th) c++
    sweep[th] = c
  }
  return {
    tiers,
    meta: {
      poses: N, promThreshold: HERO_TIER.PROM_THRESHOLD, promOpaque: HERO_TIER.PROM_OPAQUE,
      occFrac: HERO_TIER.OCC_FRAC, cullFrustumGuard: HERO_TIER.CULL_FRUSTUM_GUARD,
      fovDeg, target, mesh: meshN, opaque: opaqueN, impostor: impostorN, cull: cullN, promHistogram: hist,
      thresholdSweep: sweep,
    },
  }
}

export async function bakeTrees({
  scene = DEFAULT_SCENE,
  styles = ['realistic'],
  lod = 'lod2',
  // Which Look's baked hero pan + canopy dims drive heroTier. Defaults to the
  // scene's OWN Look — never a literal 'lafayette-square', which would tier a
  // poured scene's trees against LS's camera in LS's coordinate frame (garbage).
  heroLook = null,
  // ⭐ THE GEOMETRY BUDGET, in TRIANGLES — the hero band's only real dial, and
  // the thing LEDGER §E1 says the left-column bar should have been wired to all
  // along ("wire it to geometry weight, or remove it"). A count-based budget lets
  // one heavy species eat the frame; this cannot.
  heroTriangleBudget = 15e6,
  // Hard distance ceiling: never promote past this even with budget to spare, so
  // an empty foreground cannot spend the whole budget on trees nobody can see.
  heroBandMaxM = 250,
  placements,    // override path (string) or paths (array, unioned)
  output,        // override output path; defaults to public/baked/<scene>/trees.json
  speciesMapPath, // override COMMON->library routing; defaults to LS's global map
  forbiddenMapPath, // poured scene's clean/map.json — obstructions (+ legacy mask)
  zoneShapePath, // poured scene's baked shape.json — the FROZEN Section surfaces
  boundaryPath, // poured scene's neighborhood_boundary.json — the literal/GPU line
  verbose = false,
} = {}) {
  const sceneName = scene
  const activeStyles = new Set(styles)
  const targetLod = lod

  const indexPath = path.join(REPO_ROOT, 'public', 'trees', 'index.json')
  // placements may be a single path OR an array of paths to UNION — a poured
  // scene's City Forestry census + OSM County-side floor are two spatially-
  // disjoint layers baked together. Each file is {meta, trees:[]}; concat trees.
  // This scene's own lamps drive `lampGlow` below (see loadLampsForScene).
  _lamps = loadLampsForScene(scene)

  // ⭐ Defaults resolve against THIS SCENE, never a literal 'lafayette-square'.
  // Both of these used to fall back to LS's files, so a town with no census of
  // its own silently planted LS's 756 park trees under its name, routed through
  // a St-Louis species-collapse table. For LS the resolved paths are unchanged
  // (they are LS's own files); for every other scene absence now means absence.
  // (`BRIEF-ls-bleed-excision.md` sites 2 + 3.)
  // ⚠️ The default is EVERY canonical well this scene has, unioned — not just
  // `park_census.json`. Reading one well was the 2026-07-22 regression: LS baked
  // 729 placements, all `source:'park'`, while its own `park_trees.json` (2,635)
  // and `osm_trees.json` (3,376) sat unread on disk — trees in the park and a
  // bare neighbourhood. The wells are spatially DISJOINT layers of one census,
  // so a bake that reads one of them silently deletes the others' trees.
  // `SOURCE_BY_BASENAME` above is the enumeration; `cartograph/tree-bake-inputs.mjs`
  // must list the same set (it is the other entry point — keep them in lockstep).
  const sceneCleanDir = path.join(REPO_ROOT, 'cartograph', 'data', scene, 'clean')
  const sceneDefaultWells = Object.keys(SOURCE_BY_BASENAME)
    .map(basename => path.join(sceneCleanDir, basename))
    .filter(existsSync)
  const parkPaths = placements
    ? (Array.isArray(placements) ? placements : [placements]).map(p => path.resolve(REPO_ROOT, p))
    : sceneDefaultWells
  if (!parkPaths.length) {
    console.warn(
      `[bake-trees] scene=${scene}: no placements given and no census well in clean/ — ` +
      `baking ZERO trees. Acquire a census via the Intake panel (municipal inventory, ` +
      `OSM natural=tree, or canopy fill). Refusing to plant another scene's trees.`)
  }

  // The COMMON→library routing map. Absent → an EMPTY map, not LS's: `pickVariant`
  // reads it as `speciesMap.map?.[species]`, so an empty map simply expresses no
  // preference and the variant picker falls through — graceful, and honest about
  // the fact that this scene has no species routing yet.
  const sceneSpeciesMap = path.join(REPO_ROOT, 'cartograph', 'data', scene, 'tree-species-map.json')
  const mapPath = speciesMapPath
    ? path.resolve(REPO_ROOT, speciesMapPath)
    : (existsSync(sceneSpeciesMap) ? sceneSpeciesMap : null)
  if (!mapPath) {
    console.warn(
      `[bake-trees] scene=${scene}: no tree-species-map.json — species routing is EMPTY ` +
      `(variants fall through to the picker's own choice). Derive one from this scene's ` +
      `census (scripts/15-derive-tree-mix.py). Refusing to route through LS's map.`)
  }

  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  const park = { trees: [] }
  for (const p of parkPaths) {
    const layer = JSON.parse(await fs.readFile(p, 'utf8'))
    // Is this well SURVEYED reality or INVENTED fill? It decides whether a tree
    // on hardscape gets nudged (reality — our strips are guesses) or dropped
    // (invention — it has no standing). The well declares itself via meta.kind;
    // the canopy fill is the only invented layer, so its filename is the
    // fallback for wells written before `kind` existed.
    const kind = layer.meta?.kind
      ?? (path.basename(p) === 'derived_trees.json' ? 'derived' : 'census')
    // Provenance (Move 4): a finer label than __kind — the ORIGINATING well. The
    // authored park is addressable on its own ('park' vs the fetched
    // 'city-inventory'), so richer real species data can later supersede synthetic
    // in exactly those spots. Declared by the well (meta.well) or read off the
    // canonical filename; falls back to __kind for an unnamed well.
    const source = layer.meta?.well ?? (SOURCE_BY_BASENAME[path.basename(p)] || kind)
    for (const t of (layer.trees || [])) park.trees.push({ ...t, __kind: kind, __source: source })
  }
  // `mapPath` is null when this scene has no species routing of its own (warned
  // above). An empty map is the honest zero — `pickVariant` reads it through
  // optional chaining, so no routing simply means no preference.
  const speciesMap = mapPath ? JSON.parse(await fs.readFile(mapPath, 'utf8')) : { map: {} }

  // ── Cross-well proximity dedup ────────────────────────────────────────────
  // One physical trunk can appear in two wells (OSM's generic point AND Forest
  // Park's species record; measured HPDM: 594/1319 Forest Park trees within 3m of
  // an OSM point). Keep the richest record per DEDUP_M cell — greedy in source-
  // rank order (real species > OSM position > synthetic). Near no-op when wells
  // are already disjoint (LS: OSM was deduped vs city in scripts/14).
  let deduped = 0
  if (park.trees.length) {
    const ranked = park.trees
      .map((t, i) => ({ t, i, r: SOURCE_RANK[t.__source] ?? 2 }))
      .sort((a, b) => b.r - a.r || a.i - b.i)   // richest first, stable
    const cell = DEDUP_M, occ = new Map()
    const gk = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`
    const near = (x, z) => {
      const gx = Math.floor(x / cell), gz = Math.floor(z / cell)
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        for (const [ox, oz] of (occ.get(`${gx + dx},${gz + dz}`) || []))
          if ((ox - x) ** 2 + (oz - z) ** 2 < DEDUP_M * DEDUP_M) return true
      return false
    }
    const kept = []
    for (const { t } of ranked) {
      if (near(t.x, t.z)) { deduped++; continue }
      const k = gk(t.x, t.z); (occ.get(k) || occ.set(k, []).get(k)).push([t.x, t.z])
      kept.push(t)
    }
    park.trees = kept
  }

  // ── Empirical DBH distribution — dress synthetic trees with a believable size ──
  // The same "derive from real, distribute over the rest" move we use for SPECIES
  // (scripts/14 mix-samples COMMON from the City census), applied to trunk width.
  // Real inventory keeps its MEASURED dbh; OSM/derived get one sampled (determin-
  // istic by position seed) from their OWN species' real distribution, falling back
  // to the neighborhood's global pool for species the inventory never measured.
  // Built from THIS scene's real trees only — the census is per-hood, so HPDM
  // samples HPDM's own trees, never LS's. `source` still marks measured vs
  // estimated, so a size/age BENCHMARK reads only the real ones.
  // ⭐⭐ PER-TREE SIZE FROM THE SPECIES BAND × THIS TREE'S OWN DBH (Jacob, 2026-08-25):
  // "if a tree is placed 300x it should be a bunch of sizes within that band."
  // Both halves are MEASURED: the band is the union of the sources' published height
  // ranges (NCSU ships `Height: 80 ft - 120 ft` — that IS the band, and taking only its
  // high threw half the measurement away), and each placement carries its own census DBH.
  // ⛔ Nothing is invented: a tree is never scaled outside what a source actually claimed.
  const bandBySpecies = new Map()
  let dossierLookup = null
  try { ({ dossierForSalonSpecies: dossierLookup } = await import('./salon-options.js')) }
  catch (err) { console.error('[bake-trees] ⛔ dossier lookup unavailable — every tree renders 1:1:', err.message) }
  // Resolved lazily per species, so this needs no variant list in scope. ⛔ The failure
  // that hid here was `variants is not defined` swallowed by a bare catch — a load error
  // reading exactly like "no bands found".
  const bandFor = (sp) => {
    if (bandBySpecies.has(sp)) return bandBySpecies.get(sp)
    let band = null, via = null
    try {
      const req = dossierLookup?.(sp)?.required
      band = req?.['chassis.size']?.band ?? null
      if (band && band.hi > band.lo) via = 'chassis.size.band'
      // ⛔⛔ THE BAND WE ALREADY HAD AND NEVER READ (Jacob, 2026-08-28: "I feel there's no
      // way we didn't get the values for silver maple, for instance. We have a study, and
      // we could go look again." He was right.)
      // `chassis.size.band` came from ncsu/selectree and only 22 of 33 dossiers got it, so
      // 7 of the 10 species on LS fell through to 1:1 — 69.4% of placements rendered at a
      // FLAT scale. But EVERY dossier was hydrated with the USDA pair:
      //     chassis.size_20yr  "usda: Height at 20 Years, Maximum (feet)"   → lo
      //     chassis.size_max   "usda: Height, Mature (feet)"                → hi
      // both carrying `sourced: true`. A real street population genuinely spans 20-year-old
      // trees to mature ones, so this is not a substitute for the band — it IS one, from a
      // citable source, which is what `Nothing is invented` requires.
      if (!(band && band.hi > band.lo)) {
        const lo = req?.['chassis.size_20yr']?.target
        const hi = req?.['chassis.size_max']?.target
        if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) { band = { lo, hi }; via = 'usda 20yr–mature' }
      }
    } catch { band = null }
    if (band && !(band.hi > 0)) band = null
    bandBySpecies.set(sp, band)
    if (band) bandVia.set(sp, via)
    return band
  }
  const bandVia = new Map()

  // Sorted per-species DBH, for the percentile lookup above.
  const dbhSorted = new Map()
  let dbhGlobalSorted = null
  const fillDbhSorted = () => {
    for (const [sp, arr] of dbhBySpecies) dbhSorted.set(sp, [...arr].sort((a, b) => a - b))
    dbhGlobalSorted = [...dbhGlobal].sort((a, b) => a - b)
  }
  const dbhBySpecies = new Map()
  const dbhGlobal = []
  for (const t of park.trees) {
    if (REAL_DBH_SOURCES.has(t.__source) && Number.isFinite(t.dbh)) {
      dbhGlobal.push(t.dbh)
      if (!dbhBySpecies.has(t.species)) dbhBySpecies.set(t.species, [])
      dbhBySpecies.get(t.species).push(t.dbh)
    }
  }
  const DBH_MIN_SAMPLES = 8   // per-species pool must reach this, else use global
  const sampleDbh = (species, seed) => {
    const per = dbhBySpecies.get(species)
    const pool = (per && per.length >= DBH_MIN_SAMPLES) ? per : dbhGlobal
    return pool.length ? pool[Math.floor(hash01(seed, 7) * pool.length)] : null
  }

  // ⭐⭐ THE SELECTION IS THE PALETTE (Jacob, 2026-08-25): "Demand is 80, supply is 20,
  // we select 10 … then out of the 1000 or however many, we split that number by the
  // statistical value split using the library we provide as the whole pie."
  // ⛔ The pool was EVERY published variant, so the bars selected 13 species and the bake
  // drew from 22 — 1,715 placements (33% of the map) dressed as species nobody selected.
  // Those species were never in the impostor capture pool either, so they rendered as
  // GEOMETRY, which is how the mesh bar came to order 166 and the slab render 1,896.
  // One omission, three symptoms.
  // ⛔ Fails OPEN and loudly: if the selection cannot be computed we bake with the full
  // pool exactly as before, rather than silently emptying the map.
  let variantPool = index.variants
  const meshTierSpecies = new Set()
  try {
    const [{ resolveGrove }, { computeCoverage }] = await Promise.all([
      import('./grove-eligibility.mjs'), import('./roster-coverage.js'),
    ])
    const design = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'public/looks', scene, 'design.json'), 'utf8'))
    const board = resolveGrove((await computeCoverage(scene)).species, design.groveThreshold || {})
    const selected = new Set()
    for (const b of board) if (b.tier !== 'out') for (const l of (b.ownsLibIds || [])) selected.add(l)
    // ⭐⭐ THE MESH BAR OWNS THE GEOMETRY BUDGET (Jacob, 2026-08-25). Only species above the
    // MESH bar may carry geometry at all; heroGeomFraction then chooses WHICH of their
    // placements do. Decided at BAKE per the role-at-bake doctrine — the runtime must not
    // re-derive eligibility from a roster it cannot read.
    // ⛔ Before this the bar controlled nothing: InstancedTrees never read meshTopN, so
    // dragging a bar labelled "mesh" left the geometry count unmoved.
    for (const b of board) if (b.tier === 'mesh') for (const l of (b.ownsLibIds || [])) meshTierSpecies.add(l)
    let dressableCheck = null
    try {
      const atlasJson = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'public/baked', scene, 'trees-atlas.json'), 'utf8'))
      const imp = atlasJson.impostorBySpecies || {}
      dressableCheck = new Set(Object.keys(imp).filter(k => imp[k]?.leafRect))
    } catch { /* first pour: no atlas yet */ }
    if (!selected.size) {
      console.warn('[bake-trees] ⚠️ selection is EMPTY — baking with the full pool (bars not applied)')
    } else {
      // ⛔ The atlas-dressable guard that stood here is RETIRED. It existed only because
      // bake-look built rects from `design.trees` while the pool came from the bars — two
      // lists, so a selected species could arrive undressed. Both now read THE SELECTION
      // (arborist/selection.mjs), so a species in this pool has a rect by construction.
      // ⚠️ The check below is the receipt: if it ever fires again the two sets have drifted
      // apart, which is the bug, not the trees.
      if (dressableCheck) {
        const undressed = [...selected].filter(sp => !dressableCheck.has(sp))
        if (undressed.length) {
          console.warn(`[bake-trees] ⛔ ${undressed.length} selected species have NO leaf UV rect: ${undressed.join(', ')}`)
          console.warn('[bake-trees]    bake-look and bake-trees have DRIFTED — they must read the same selection. Excluding to keep the map textured.')
          for (const sp of undressed) selected.delete(sp)
        }
      }
      const filtered = index.variants.filter(v => selected.has(v.species))
      if (!filtered.length) {
        console.warn(`[bake-trees] ⚠️ selection (${selected.size} species) matched NO published variant — baking with the full pool`)
      } else {
        console.log(`[bake-trees] selection: ${selected.size} species → ${filtered.length} of ${index.variants.length} variants`)
        variantPool = filtered
      }
    }
  } catch (err) {
    console.warn('[bake-trees] ⚠️ could not compute the selection — baking with the full pool:', err.message)
  }

  if (verbose) {
    console.log(`[bake-trees] scene=${sceneName} styles=[${[...activeStyles].join(',')}] lod=${targetLod}`)
    console.log(`[bake-trees] pool: ${variantPool.length} variants, ${park.trees.length} placements`)

    if (deduped) console.log(`[bake-trees] cross-well dedup: dropped ${deduped} coincident records (kept the richest source per trunk)`)
    if (dbhGlobal.length) console.log(`[bake-trees] dbh: ${dbhGlobal.length} measured (${dbhBySpecies.size} species) → ${park.trees.length - dbhGlobal.length} estimated by empirical sampling`)
  }

  // Surface tester:
  //   • FROZEN Section surfaces (shape.json) — the one honest model. It sees the
  //     road (the grout between tiles) and paints curb/treelawn/sidewalk/LU.
  //   • None — ONLY the toy fixture (hand-authored centerlines, no hardscape).
  // A poured scene missing its shape.json is an ERROR, not a fallback: there is no
  // honest forbidden-surface without the frozen shape, and the old paint-layer mask
  // it used to fall through to scattered trees into the carriageway. Bake the
  // ground first. (`forbidden-surface.mjs` header — the legacy tester is deleted.)
  const membership = boundaryPath
    ? makeMembership(path.resolve(REPO_ROOT, boundaryPath))
    : null
  if (forbiddenMapPath && !zoneShapePath) {
    throw new Error(`[bake-trees] no shape.json for '${sceneName}' — bake the ground first. ` +
      `There is no honest forbidden-surface without the frozen shape; refusing to place trees against a wrong mask.`)
  }
  // ⚠️ No zone shape at all → NO allow-test runs and every tree lands wherever its
  // census row says, roads and rooftops included. That is never a legitimate bake
  // for a scene whose ground HAS been baked; it means the caller didn't resolve
  // its scene inputs (the bare CLI did exactly this on 2026-07-22 and wiped the
  // allow-zone — the tell was `0 forbidden-surface drops`). Refuse, loudly.
  if (!zoneShapePath) {
    const bakedShape = path.join(REPO_ROOT, 'public', 'baked', sceneName, 'shape.json')
    if (existsSync(bakedShape)) {
      throw new Error(
        `[bake-trees] scene='${sceneName}' has a baked shape.json but no zoneShapePath was passed — ` +
        `that would place trees with NO allowed-zone test (bare plantable LU is the only legal ground). ` +
        `Resolve inputs via cartograph/tree-bake-inputs.mjs#treeBakeInputsForScene, or pass --zone-shape explicitly.`)
    }
  }
  // The Look's design.json — its blockCustoms + curbWidth so the rebuilt Section
  // surfaces match what the operator authored (WYSIWYG with the Design view).
  const _designPath = path.join(REPO_ROOT, 'public', 'looks', heroLook || sceneName, 'design.json')
  const isForbidden = zoneShapePath
    ? makeZoneTester({
        shapePath: path.resolve(REPO_ROOT, zoneShapePath),
        mapPath: forbiddenMapPath ? path.resolve(REPO_ROOT, forbiddenMapPath) : undefined,
        designPath: existsSync(_designPath) ? _designPath : undefined,
        // Left FALSE deliberately. The tester's "outside every curb" bucket can't
        // yet separate carriageway from un-poured, so allowing it would put trees
        // back in the road — the whole bug. It costs nothing here: the greater
        // circle IS poured (tiles reach 1256 m of a 1251 m disc), so it gets its
        // trees from real tiles. Only the ~7.8% genuinely-untiled holes go bare,
        // and those sit in the annulus where the dissolve governs anyway.
      })
    : null   // toy fixture only

  const instances = []
  // Parallel to `instances` (pushed in lock-step) — per-tree canopy bounding
  // sphere {x, z, centerY, R} in world metres for the hero-tier prominence pass.
  const canopies = []
  let unmatched = 0
  const forbiddenCounts = {}
  const nudged = {}   // surveyed trees moved to legal ground, by the zone they came from
  let dissolved = 0   // invented trees thinned out in the greater circle
  let outside = 0     // placed trees standing outside the neighborhood proper

  // Hero pan + canopy dims for the heroTier classifier, both read from the active
  // Look's baked slab (render-truth — the SAME hero the runtime plays + the dims
  // bake-look measured from the rendered roster trees). Skipped for the toy
  // fixture (no hero shot). Absent → heroTier omitted; runtime falls back to
  // all-mesh (version-agnostic tree path).
  // ⭐ Gated on "does this Look HAVE a hero pan", never on `placements`.
  //
  // This read `if (!placements)` until 2026-07-15. The intent was to skip the toy
  // fixture (no hero shot) — but `placements` is also how EVERY poured scene feeds
  // its census, so the toy-skip silently disabled the optimizer for every
  // neighbourhood we pour. It ran on LS (745 trees, culling 44% as
  // never-meaningfully-visible) and was off on Hi-Pointe/DeMun's 6,967. Backwards:
  // switched on where it barely mattered, off where it mattered most. The toy is
  // still skipped — correctly, and for the real reason: it has no hero keyframes.
  const effHeroLook = heroLook || sceneName
  let heroPan = null
  let resolveCanopy = null
  try {
    const s = JSON.parse(await fs.readFile(
      path.join(REPO_ROOT, 'public', 'baked', effHeroLook, 'scene.json'), 'utf8'))
    if (Array.isArray(s.heroKeyframes) && s.heroKeyframes.length) {
      heroPan = { keyframes: s.heroKeyframes, subject: s.heroSubject, archValues: s.arch?.values, tension: s.heroMotion?.tension }
    }
  } catch (e) {
    if (verbose) console.log(`[bake-trees] hero pan unavailable for '${effHeroLook}' (${e.code || e.message}) — heroTier skipped`)
  }
  if (heroPan) {
    let canopyByVariant = {}
    try {
      canopyByVariant = JSON.parse(await fs.readFile(
        path.join(REPO_ROOT, 'public', 'baked', effHeroLook, 'trees-atlas.json'), 'utf8')).canopyByVariant || {}
    } catch { /* dims absent → resolver falls back to global mean */ }
    const r = buildCanopyResolver(canopyByVariant, index.variants)
    resolveCanopy = r.resolve
    if (!r.haveDims && verbose) {
      console.log(`[bake-trees] canopyByVariant empty for '${effHeroLook}' — heroTier uses fallback dims`)
    }
  }

  for (let i = 0; i < park.trees.length; i++) {
    const tree = park.trees[i]
    const cat = SHAPE_TO_CATEGORY[tree.shape] || 'broadleaf'
    const seed = treeSeed(tree, i)
    const v = pickVariant(tree.species, cat, variantPool, activeStyles, speciesMap, seed)
    if (!v) { unmatched++; continue }
    const lodUrl = v.skeletons[targetLod] || v.skeletons.lod1 || v.skeletons.lod0
    if (!lodUrl) { unmatched++; continue }
    // Surface filter, applied BEFORE positionOverride (that override is a
    // variant-local nudge, a different thing).
    //
    // SURVEYED trees are NUDGED, invented ones are DROPPED. A recorded tree
    // sitting a metre inside our sidewalk is near-certainly our strip widths
    // being soft (tl/sw are seeded 1.5 m defaults, not measured) rather than the
    // city having planted a tree in a footpath — so reality gets moved to the
    // nearest legal ground, never deleted for disagreeing with a guess. The
    // canopy fill gets no such courtesy: it is invented, and inventions that
    // land on hardscape are simply wrong.
    let tx = tree.x, tz = tree.z
    // The DISSOLVE. Inside the neighborhood proper every tree stands — literal.
    // Outside, thin toward the rim over the ground's fade band so the greater
    // circle dissolves instead of ending at a seam. Surveyed trees are exempt:
    // a real recorded tree is never deleted for taste, only invented ones thin.
    if (membership && tree.__kind === 'derived' && !membership.keep(tx, tz, 11)) {
      dissolved++
      continue
    }
    if (isForbidden) {
      const reason = isForbidden(tx, tz)
      if (reason) {
        const canNudge = tree.__kind !== 'derived' && typeof isForbidden.nudge === 'function'
        const moved = canNudge ? isForbidden.nudge(tx, tz) : null
        if (moved) {
          tx = moved[0]; tz = moved[1]
          nudged[reason] = (nudged[reason] || 0) + 1
        } else {
          forbiddenCounts[reason] = (forbiddenCounts[reason] || 0) + 1
          continue
        }
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
    const finalX = tx + px
    const finalZ = tz + pz
    // DBH: measured for real inventory, else sampled from the empirical per-species
    // distribution (deterministic by seed) so OSM/derived trees get a believable size.
    if (!dbhSorted.size) fillDbhSorted()
    const measuredDbh = (REAL_DBH_SOURCES.has(tree.__source) && Number.isFinite(tree.dbh)) ? tree.dbh : null
    const dbh = measuredDbh ?? sampleDbh(tree.species, seed)
    // Where this tree sits in its species' DBH spread → where it sits in the size band.
    let instScale = null
    const band = bandFor(v.species)
    if (band && band.hi > band.lo) {
      // ⚠️ dbhBySpecies is keyed by the CENSUS species (`tree.species`), the variant by the
      // LIBRARY id (`v.species`) — they are not the same key and looking up the wrong one
      // silently yielded undefined, so every tree stayed 1:1. Try the census key, then the
      // library key, then the global distribution; a species substituted onto another
      // still deserves a size drawn from its OWN measured trunks.
      const per = dbhSorted.get(tree.species) || dbhSorted.get(v.species) || dbhGlobalSorted
      if (per && per.length) {
        let lo = 0, hi = per.length
        while (lo < hi) { const mid = (lo + hi) >> 1; if (per[mid] < dbh) lo = mid + 1; else hi = mid }
        const pct = per.length > 1 ? lo / (per.length - 1) : 1
        const h = band.lo + Math.max(0, Math.min(1, pct)) * (band.hi - band.lo)
        instScale = +(h / band.hi).toFixed(4)
      }
    }
    instances.push({
      x: +finalX.toFixed(4),
      // Ground reverted to flat (#19); trees plant at y=0 + override.
      y: +py.toFixed(4),
      z: +finalZ.toFixed(4),
      url: lodUrl,
      // The three LOD URLs (the LsoD, 2026-06-23). publish emits lod0/1/2 and
      // bake-look UV-rewrites all three into baked/, but the bake used to ship
      // only one. The runtime selects per camera context — street→lod0,
      // hero→lod1, browse→lod2 — bound to the same signal as the bark tier.
      // `url` stays the default-shipped LOD for back-compat with older runtimes.
      lods: {
        lod0: v.skeletons.lod0 || lodUrl,
        lod1: v.skeletons.lod1 || v.skeletons.lod0 || lodUrl,
        lod2: v.skeletons.lod2 || v.skeletons.lod1 || lodUrl,
        // The hero band's distance tier — lod2 canopy density, lod1 INTACT TRUNK.
        // ⛔ Falls back to lod1, never to lod2: lod2 is trunk-cut and would float.
        lod1far: v.skeletons.lod1far || v.skeletons.lod1 || lodUrl,
      },
      // ⭐ MESH ELIGIBILITY from the mesh bar. `false` means this species may NEVER carry
      // geometry however tall the tree; the runtime's dbh cut then chooses only among
      // species the operator already put above the bar.
      // ⛔ Absent (no selection computed) → the runtime keeps its previous behaviour
      // rather than silently forbidding geometry everywhere.
      ...(meshTierSpecies.size ? { meshTier: meshTierSpecies.has(v.species) } : {}),
      // ⭐ PER-INSTANCE SCALE. The GLB is normalised at publish to the band's HIGH — the
      // mature specimen — so every instance scales DOWN from it by where its own DBH sits
      // in that species' measured DBH distribution. A tree is therefore never rendered
      // larger than the tallest figure any source published for its species.
      // ⛔ Absent band → scale omitted → 1:1, exactly the previous behaviour.
      ...(instScale != null ? { scale: instScale } : {}),
      rotY: +rotY.toFixed(4),
      species: v.species,
      variantId: v.variantId,
      category: v.category,
      // Provenance (Move 4): where this placement came from — 'park' /
      // 'city-inventory' / 'osm' (all real) vs 'derived' (synthetic canopy fill).
      // A permanent data-layer fact per instance; no runtime toggle (deferred).
      // Surveyed sources are nudged onto legal ground, derived is dropped.
      source: tree.__source,
      // Trunk diameter (DBH) — the standard forestry size/age proxy. MEASURED for
      // real inventory; SAMPLED from the empirical per-species distribution for
      // OSM/derived (the same derive-from-real move as species). `source` marks
      // which is measured vs estimated, keeping the benchmark honest.
      ...(dbh != null ? { dbh } : {}),
      // Pre-sampled lamp gaussian at this tree's world position. Runtime
      // multiplies by `uLampGlow` (per-Look TOD-curve slider) for the
      // final emissive contribution.
      lampGlow: +lampGlowAt(finalX, finalZ).toFixed(4),
      // Which side of the hood's edge this tree stands on. `false` = the greater
      // circle, where the runtime may spend less on it. Omitted when the scene
      // has no boundary (nothing to be outside OF).
      ...(membership ? { inHood: membership.isInside(finalX, finalZ) } : {}),
    })
    if (membership && !membership.isInside(finalX, finalZ)) outside++
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

  // ── Eligibility guard ──────────────────────────────────────────────────────
  // The last time trees ended up on the sidewalk/curb, nothing caught it but the
  // operator's eye. Re-classify every KEPT instance at its FINAL position against
  // the same frozen surfaces and FAIL the bake if any tree sits on forbidden
  // ground (a nudge that landed badly, an override that pushed a tree off legal
  // ground, a future policy drift). Loud, with a per-zone breakdown — so a wrong
  // mask can never quietly ship a slab that plants on hardscape again.
  if (isForbidden) {
    const illegal = {}
    for (const inst of instances) {
      const reason = isForbidden(inst.x, inst.z)
      if (reason) illegal[reason] = (illegal[reason] || 0) + 1
    }
    const illegalTotal = Object.values(illegal).reduce((a, b) => a + b, 0)
    if (illegalTotal) {
      const breakdown = Object.entries(illegal).sort((a, b) => b[1] - a[1])
        .map(([z, n]) => `${z}:${n}`).join(', ')
      throw new Error(`[bake-trees] eligibility guard FAILED for '${sceneName}': ` +
        `${illegalTotal} placed tree(s) on forbidden ground (${breakdown}). ` +
        `A kept tree must stand on exposed, plantable Land Use — refusing to write a slab that plants on hardscape.`)
    }
  }

  // Hero-tier classification (Phase A). Assign `heroTier` per instance in
  // lock-step with `canopies`. Skipped (field omitted) when no hero pan/dims.
  let heroTierMeta = null
  if (heroPan && canopies.length === instances.length && canopies.length) {
    // ⭐ The HERO shot culls by CAMERA — no hood exception (Jacob, 2026-07-15).
    //
    // The two shots have different jobs, and neither needs the other's trees:
    //   HERO   — a camera path. Cull by frustum; only what the shot sees is paid for.
    //   BROWSE — the whole impostor neighborhood at once. Shows ALL trees, cheaply,
    //            because they're flat cards seen from overhead.
    //
    // So a hero cull loses nothing: the tree still exists in the census, still
    // stands in browse. "Literal inside the neighborhood proper" is a claim about
    // the DATA — real census, honest surfaces — not a licence to render everything
    // in every shot. (An earlier pass here promoted in-hood culls back to mesh on
    // exactly that confusion; removed.)
    const { tiers, meta } = classifyHeroTiers(canopies, heroPan)
    for (let i = 0; i < instances.length; i++) instances[i].heroTier = tiers[i]
    heroTierMeta = { heroLook: effHeroLook, ...meta }
    if (verbose) {
      console.log(`[bake-trees] heroTier: ${meta.mesh} mesh / ${meta.opaque} opaque / ${meta.impostor} impostor / ${meta.cull} cull `
        + `(mesh≥${meta.promThreshold}, opaque≥${meta.promOpaque}, guard ${meta.cullFrustumGuard}, ${meta.poses} poses, fov ${meta.fovDeg}°)`)
    }
  }

  // ── HERO GEOMETRY BAND (the ∩-foreground axis, 2026-08-24) ─────────────────
  // Decide WHO KEEPS GEOMETRY in the hero shot here, at bake, by distance to the
  // authored camera path — spending a TRIANGLE budget, not a tree count.
  // See hero-band.mjs for why dbh was the wrong axis on both cost and visibility.
  // ⛔ No hero pan → emit NOTHING and say so. The runtime keeps its old dbh split
  // and warns; a guessed band would look like a working budget while misplacing
  // every tree in a town nobody has inspected.
  let heroBandMeta = null
  if (heroPan && instances.length) {
    const triCache = new Map()   // lod1 url -> triangle count (or null)
    const trisFor = (inst) => {
      const rel = inst?.lods?.lod1
      if (!rel) return null
      if (!triCache.has(rel)) {
        // The band must weigh what the HERO shot actually draws: the baked lod1
        // in this Look's slab, not the authoring-pool copy under public/trees/.
        const abs = path.join(REPO_ROOT, 'public', 'baked', effHeroLook, rel.replace(/^\//, ''))
        triCache.set(rel, existsSync(abs) ? glbTriangleCount(abs) : null)
      }
      return triCache.get(rel)
    }
    const band = assignHeroBand(instances, heroPan, {
      triangleBudget: heroTriangleBudget,
      bandMaxM: heroBandMaxM,
      trisFor,
    })
    if (band) {
      for (let i = 0; i < instances.length; i++) {
        instances[i].heroRole = band.roles[i]
        instances[i].panDist = Math.round(band.dists[i] * 10) / 10
      }
      heroBandMeta = { heroLook: effHeroLook, ...band.meta }
      const m = band.meta
      console.log(`[bake-trees] heroBand: ${m.mesh} mesh / ${m.impostor} impostor — `
        + `${(m.trianglesSpent / 1e6).toFixed(1)}M of ${(m.triangleBudget / 1e6).toFixed(1)}M tris, `
        + `cutoff ${m.bandCutoffM}m`)
      const unk = Object.entries(m.unmeasurableBySpecies)
      if (unk.length) {
        console.warn(`[bake-trees] ⛔ heroBand could not weigh ${unk.reduce((n, [, c]) => n + c, 0)} placement(s) — `
          + `no readable baked lod1, so they were LEFT AS IMPOSTORS rather than given free budget: `
          + unk.map(([sp, c]) => `${sp}(${c})`).join(' '))
      }
    }
  } else if (instances.length) {
    console.warn('[bake-trees] ⛔ no authored hero pan — heroRole NOT emitted; the runtime will fall back to its dbh split')
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
    // The NEIGHBOURHOOD these placements are of. Was `look` until 2026-07-15,
    // which was never true — it always carried the scene.
    scene: sceneName,
    lod: targetLod,
    activeStyles: [...activeStyles],
    count: instances.length,
    unmatched,
    uniqueVariants: variantUseCount.size,
    // Hero-tier classification summary (Phase A). null when no hero pan/dims;
    // per-instance `heroTier` lives on each entry in `instances`.
    heroTierMeta,
    heroBandMeta,
    tiles,
    instances,
  }

  // Every scene's placements are baked/<scene>/trees.json — the path the runtime
  // fetches. The flat baked/<scene>.json this used to default to is the fossil
  // convention that produced the phantom baked/lafayette-square.json nobody read;
  // retired 2026-07-15. An explicit --output still wins.
  const outPath = output
    ? path.resolve(REPO_ROOT, output)
    : path.join(REPO_ROOT, 'public', 'baked', sceneName, 'trees.json')
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, JSON.stringify(out, null, 2))

  const totalForbidden = Object.values(forbiddenCounts).reduce((a, b) => a + b, 0)
  const totalNudged = Object.values(nudged).reduce((a, b) => a + b, 0)
  if (verbose) {
    console.log(`[bake-trees] placed ${instances.length}/${park.trees.length} (${unmatched} unmatched, ${totalForbidden} forbidden-surface drops)`)
    if (totalForbidden) {
      const breakdown = Object.entries(forbiddenCounts).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`).join(' ')
      console.log(`[bake-trees]   forbidden: ${breakdown}`)
    }
    if (totalNudged) {
      const breakdown = Object.entries(nudged).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`).join(' ')
      console.log(`[bake-trees]   nudged onto legal ground (surveyed trees kept): ${breakdown}`)
    }
    if (membership) {
      const inHood = instances.length - outside
      console.log(`[bake-trees]   hood: ${inHood} inside the neighborhood proper (literal) / ${outside} in the greater circle (GPU-managed)`)
      if (dissolved) console.log(`[bake-trees]   dissolved ${dissolved} invented trees toward the rim`)
      if (!membership.hasPolygon) console.log(`[bake-trees]   ⚠️  no boundary-street polygon — the disc is standing in for the neighborhood`)
    }
    // ⛔⛔ SAY WHICH SPECIES RENDER FLAT, AND HOW MANY TREES THAT IS (2026-08-28).
    // There was a loud error when the dossier MODULE failed to load ("every tree renders
    // 1:1") and complete silence when an individual species simply had no band — which is
    // how 7 of 10 species and 69.4% of LS's placements went to a flat scale unnoticed.
    // A per-species absence is the common case and the invisible one; it gets named.
    {
      const flat = new Map()
      for (const inst of instances) if (inst.scale == null) flat.set(inst.species, (flat.get(inst.species) || 0) + 1)
      if (flat.size) {
        const n = [...flat.values()].reduce((a, b) => a + b, 0)
        const worst = [...flat.entries()].sort((a, b) => b[1] - a[1])
        console.log(`[bake-trees] ⛔ ${n} of ${instances.length} placements (${(100 * n / instances.length).toFixed(1)}%) render at a FLAT 1:1 — ` +
          `no size band for: ` + worst.map(([sp, c]) => `${sp}(${c})`).join(' '))
        console.log(`[bake-trees]    A band needs EITHER dossier chassis.size.band (ncsu/selectree) OR the USDA pair ` +
          `chassis.size_20yr + chassis.size_max. A species with neither has no dossier at all — author one.`)
      }
      const viaCount = new Map()
      for (const [, v] of bandVia) viaCount.set(v, (viaCount.get(v) || 0) + 1)
      if (viaCount.size) console.log(`[bake-trees] size bands by source: ` + [...viaCount].map(([k, v]) => `${k}=${v}sp`).join(' · '))
    }
    console.log(`[bake-trees] ${variantUseCount.size} unique variants in use`)
    console.log(`[bake-trees] → ${outPath}`)
  }
  return { count: instances.length, unmatched, forbidden: totalForbidden, forbiddenCounts, nudged: totalNudged, uniqueVariants: variantUseCount.size, outPath }
}

// CLI entry: only run when invoked directly (not when imported).
const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  const args = parseArgs()
  // ⭐ The CLI resolves its scene inputs through the SAME resolver the Cartograph
  // pour and the Grove's Bake→Slab use — census wells, species routing, the
  // forbidden map, the frozen shape (the allow-zone) and the boundary. It used to
  // pass only what you typed, so `--scene X` alone silently baked with no
  // allow-zone and no boundary: trees in the carriageway and on rooftops. A third
  // entry point that answers "what does scene X's tree bake read" differently is
  // exactly the palimpsest the resolver exists to prevent
  // (`project_the_palimpsest_code_path_multiplicity`). Explicit flags still win,
  // so any single input can be overridden for a one-off.
  const { treeBakeInputsForScene } = await import('../cartograph/tree-bake-inputs.mjs')
  const resolved = args.scene ? (treeBakeInputsForScene(args.scene) || {}) : {}
  const { inputs: _dirty, ...sceneInputs } = resolved
  bakeTrees({
    ...sceneInputs,
    scene: args.scene,
    styles: (args.styles || 'realistic').split(',').map(s => s.trim()).filter(Boolean),
    lod: args.lod,
    heroLook: args.heroLook,
    // ⭐ The geometry budget + its distance ceiling, reachable from the CLI. Both
    // default to the function's own defaults when the flag is absent, so a bake
    // with no flags is byte-identical to one before they existed.
    ...(args['hero-triangle-budget'] != null
      ? { heroTriangleBudget: numFlag('hero-triangle-budget', args['hero-triangle-budget']) } : {}),
    ...(args['hero-band-max-m'] != null
      ? { heroBandMaxM: numFlag('hero-band-max-m', args['hero-band-max-m']) } : {}),
    placements: typeof args.placements === 'string'
      ? args.placements.split(',').map(s => s.trim()).filter(Boolean)
      : sceneInputs.placements,
    output: args.output ?? sceneInputs.output,
    speciesMapPath: args['species-map'] ?? sceneInputs.speciesMapPath,
    forbiddenMapPath: args['forbidden-map'] ?? sceneInputs.forbiddenMapPath,
    zoneShapePath: args['zone-shape'] ?? sceneInputs.zoneShapePath,
    boundaryPath: args['boundary'] ?? sceneInputs.boundaryPath,
    verbose: true,
  }).catch(e => { console.error('[bake-trees] fatal:', e); process.exit(1) })
}
