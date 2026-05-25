#!/usr/bin/env node
/**
 * generate-salon.js — Salon composition generator (Brief 1, baby Sequoia, 2026-05-21).
 *
 * Mirrors `generate-procedural.js` shape exactly. The Salon is the fourth
 * authoring surface in the Arborist (alongside Procedural / LiDAR / Grove).
 * Instead of *synthesizing* a tree from procedural parameters, the operator
 * *composes* one by picking chassis + bark + leaves from existing libraries:
 *   - chassis: de-leafed vendor lod0 GLBs from `public/trees/_chassis/`
 *              (Whittle, Brief 0)
 *   - bark:    photo-PBR materials from `public/textures/bark/<ref>/`
 *   - leaves:  shape packs from `public/textures/leaves/shapes/<pack>/`
 *              (with v1 fallback to `public/textures/leaves/<pack>.png` —
 *              the `shapes/` directory pre-dates Phase F and is currently
 *              flat PNGs by morphology)
 *
 * Per-species overlays live at `arborist/state/<species>/compositions.json`.
 * Fresh checkouts with no overlay synthesize an empty composition list per
 * species — the operator authors compositions in the Salon workstage.
 *
 * Brief 1 scope: chassis-load + bark-rebind + multi-node GLB + publish chain.
 * Deformers (Brief 3), gradient-map bark (Brief 2), hemisphere cull (Brief 4)
 * are explicitly out of scope. `composition.deformer` is reserved-but-empty.
 *
 * Leaf emission: chassis `leafAttachmentTags` are operator-authoring fields
 * populated post-Brief-1 (see `<chassis>.meta.json#leafAttachmentTags`). When
 * the array is empty, we sample a deterministic placement set from the
 * chassis's upper-bbox volume so the operator has visible leaves to author
 * against. The lifted D.1b helpers consume that point set just as they
 * consume terminal-tip positions in the procedural path.
 *
 * Determinism: same `{composition + chassis + bark + leaves}` + same on-disk
 * source files → byte-identical GLB. Stochastic placement uses mulberry32
 * (lifted from `spaceColonization.js`) seeded by `hash(chassis|bark|pack)`.
 *
 * Usage:  node arborist/generate-salon.js [--species <id>]
 *
 * Importing this module is side-effect-free (arborist/serve.js consumes its
 * exports for the workstage live-preview endpoint).
 */
import { NodeIO, Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { weld, dedup, simplify as gltfSimplify } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

// Chassis GLBs (from Whittle's survey-deleaf.js) preserve vendor source
// extensions including EXT_texture_webp; matching ALL_EXTENSIONS registration
// is required to read them. Mirror the pattern survey-deleaf.js + publish-glb.js use.
function makeIO() { return new NodeIO().registerExtensions(ALL_EXTENSIONS) }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CHASSIS_DIR = path.join(REPO_ROOT, 'public/trees/_chassis')
const BARK_DIR    = path.join(REPO_ROOT, 'public/textures/bark')
const LEAF_SHAPES_DIR_NEW = path.join(REPO_ROOT, 'public/textures/leaves/shapes')
const LEAF_SHAPES_DIR_FLAT = path.join(REPO_ROOT, 'public/textures/leaves')
const STATE_ROOT = path.join(__dirname, 'state')

// ── Mulberry32 + hash (lifted from spaceColonization.js) ────────────────
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5) | 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hashString(s) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

// ── Kit-wide DEFAULTS (lowest layer; merged below chassis-defaults + overlay)
//
// Per `feedback_effective_payload_layering`: `DEFAULTS → CHASSIS_DEFAULTS → operator overlay`.
// These are the values the kernel falls back to when neither the chassis
// sidecar nor the operator's overlay specifies a field. Mirrors the role
// `DEFAULT_SCA_BY_PRESET` plays in the procedural path.
export const DEFAULTS = {
  bark: {
    ref: 'Bark007',
    uvScale: [1.5, 4],
    tintBase: '#ffffff',
    // Brief 1.5a: numeric amplitude (0..0.3 typical), NOT a hex color.
    // Drives per-instance world-XZ-hashed bark hue variation at runtime
    // via `uBarkTintJitterRange`. The Brief 1 schema mis-typed this as a
    // color picker; corrected here so bake-look#flatten (which expects
    // typeof === 'number') surfaces the value into trees-atlas.json.
    tintJitterRange: 0.08,
    roughnessOverride: 0.85,
  },
  leaves: {
    pack: 'palmate',
    // Brief 5: Workstage-only inspection toggle. true = render leaves
    // (vendor cards or spray fallback); false = bare chassis in the
    // Workstage preview ONLY. The publish path ignores this — baked
    // artifact always carries leaves.
    show: true,
    occupancy: 0.7,
    // Brief 1.5a: operator-tunable card-size multiplier. Default 1.0 with
    // BASE_CARD_SIZE=0.1m yields ~10cm cards at world scale (verified
    // against the obelisk human-height reference). Range 0.5..3.0.
    scale: 1.0,
    tintFront: '#3a7530',
    tintBack:  '#a8b89a',
  },
  deformer: {},   // reserved-but-empty — Brief 3 fills
  // Brief 19 (Quartz): authored chassis transform (Salon gizmo → bake).
  // Identity = no-op. `rotation` is [tiltX, rotationY, tiltZ] radians in the
  // gizmo's Euler XYZ order; `scale` is uniform. Applied LIVE by the viewport
  // gizmo at preview; BAKED into the published geometry at publish
  // (writeMultiCompositionGLB → buildCompositionDocument), so the chassis
  // ships oriented/placed/scaled exactly as the operator authored it.
  transform: { posOffset: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
}

// Base card extent in metres. Multiplied by composition.leaves.scale at
// emission time. 0.5m (50cm) lands each card as a leaf-CLUSTER (not single
// leaf) — the right read for 15–30m-tall mature chassis where individual
// 10cm leaves disappear into pinpoints. Operator session 2026-05-22 (Linden
// at 30.7m) confirmed: cards as clusters are the right granularity.
const BASE_CARD_SIZE = 0.5

// ── Chassis library ─────────────────────────────────────────────────────
//
// Whittle populated `public/trees/_chassis/<name>.{glb,meta.json}`. The
// directory is gitignored — regenerable via `node arborist/survey-deleaf.js`.
// Brief 1 reads `meta.morphology` + `meta.heightRange` + `meta.source.species`
// for UI rendering; `scaffoldCount` / `canopyStart` / `leafAttachmentTags`
// stay null until operator authoring lands.

async function chassisExists() {
  try { await fs.access(CHASSIS_DIR); return true }
  catch { return false }
}

export async function listChassis() {
  if (!await chassisExists()) return []
  const entries = await fs.readdir(CHASSIS_DIR)
  const out = []
  for (const name of entries) {
    if (!name.endsWith('.meta.json')) continue
    const stem = name.replace(/\.meta\.json$/, '')
    try {
      const meta = JSON.parse(await fs.readFile(path.join(CHASSIS_DIR, name), 'utf8'))
      out.push({
        name: stem,
        glb: `/trees/_chassis/${stem}.glb`,
        morphology: meta.morphology || 'unknown',
        heightRange: meta.heightRange || null,
        source: meta.source || null,
        scaffoldCount: meta.scaffoldCount ?? null,
        canopyStart:   meta.canopyStart ?? null,
        leafAttachmentTags: meta.leafAttachmentTags || [],
      })
    } catch { /* skip malformed */ }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

async function loadChassisMeta(chassisName) {
  const p = path.join(CHASSIS_DIR, `${chassisName}.meta.json`)
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

// ── Bark + leaf libraries ───────────────────────────────────────────────

export async function listBarkRefs() {
  try {
    const entries = await fs.readdir(BARK_DIR, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort()
  } catch { return [] }
}

// Leaf packs: prefer `public/textures/leaves/shapes/<pack>/` (Phase F target).
// If absent, fall back to the flat PNGs at `public/textures/leaves/*.png`
// (the source of truth pre-Phase-F). Each return entry carries `{packId,
// kind: 'dir'|'flat'}` so the GLB writer knows which texture to read.
export async function listLeafPacks() {
  const out = []
  try {
    const entries = await fs.readdir(LEAF_SHAPES_DIR_NEW, { withFileTypes: true })
    for (const e of entries) if (e.isDirectory()) out.push({ packId: e.name, kind: 'dir' })
  } catch { /* no shapes/ dir yet */ }
  try {
    const entries = await fs.readdir(LEAF_SHAPES_DIR_FLAT, { withFileTypes: true })
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.png')) {
        const id = e.name.replace(/\.png$/, '')
        if (!out.some(p => p.packId === id)) out.push({ packId: id, kind: 'flat' })
      }
    }
  } catch { /* leaves dir missing */ }
  return out.sort((a, b) => a.packId.localeCompare(b.packId))
}

async function readBarkBundle(ref) {
  const dir = path.join(BARK_DIR, ref)
  const [colorBytes, normalBytes] = await Promise.all([
    fs.readFile(path.join(dir, 'color.jpg')),
    fs.readFile(path.join(dir, 'normal.jpg')),
  ])
  return { ref, colorBytes, normalBytes }
}

async function readLeafPackMeta(packId) {
  // Surface per-pack tile-grid metadata so leaf-card UVs can sample a single
  // tile from multi-leaf atlases (heart=3×2, palmate=2×2, etc.) — kills the
  // monotonous "every card shows the same 6-leaf clump" reading.
  try {
    const raw = await fs.readFile(path.join(LEAF_SHAPES_DIR_NEW, packId, 'meta.json'), 'utf8')
    const m = JSON.parse(raw)
    const grid = Array.isArray(m.tileGrid) && m.tileGrid.length === 2
      ? [Math.max(1, m.tileGrid[0] | 0), Math.max(1, m.tileGrid[1] | 0)]
      : [1, 1]
    return { tileGrid: grid }
  } catch {
    return { tileGrid: [1, 1] }
  }
}

async function readLeafBytes(packId) {
  // Brief 1.5a item 2: prefer shapes/<pack>/shape.png (composed RGBA: Color
  // RGB + Opacity A from the LeafSet vendor packs). The shape.png convention
  // is the Salon-curated entry point; Color.jpg + Opacity.jpg side-by-side
  // (Phase F target) remains a recognized fallback for packs that drop
  // straight from the vendor without compositing.
  try {
    const p = await fs.readFile(path.join(LEAF_SHAPES_DIR_NEW, packId, 'shape.png'))
    return { bytes: p, mime: 'image/png' }
  } catch { /* fall through */ }
  try {
    const c = await fs.readFile(path.join(LEAF_SHAPES_DIR_NEW, packId, 'Color.jpg'))
    return { bytes: c, mime: 'image/jpeg' }
  } catch { /* fall through */ }
  // Flat fallback (pre-Phase-F source-of-truth): <pack>.png with built-in alpha.
  const p = await fs.readFile(path.join(LEAF_SHAPES_DIR_FLAT, `${packId}.png`))
  return { bytes: p, mime: 'image/png' }
}

// ── Composition state ───────────────────────────────────────────────────
//
// `arborist/state/<species>/compositions.json` is the operator-overlay; paired
// with `compositions.defaults.json` per `feedback_json_stringify_loses_hand-
// authored_format` (the .json file is machine-written; .defaults.json is
// hand-authored reference values, never touched by the server).

function compositionsStatePath(species) {
  return path.join(STATE_ROOT, species, 'compositions.json')
}

async function readOverlay(species) {
  try {
    const json = JSON.parse(await fs.readFile(compositionsStatePath(species), 'utf8'))
    if (Array.isArray(json.compositions)) return json.compositions
  } catch { /* fall through to empty */ }
  return []
}

// Resolve a single composition's `effective` field — DEFAULTS → CHASSIS_DEFAULTS
// → operator overlay. UI binds to `effective`; controlled selects mirror
// patches into both `params` and `effective` in the store so changes reflect
// without a server round-trip (per the procedural-mode pattern).
function resolveEffective(composition, chassisMeta) {
  const chassisDefaults = (chassisMeta && chassisMeta.defaults) || {}
  return {
    chassis: composition.chassis || null,
    bark: {
      ...DEFAULTS.bark,
      ...(chassisDefaults.bark || {}),
      ...(composition.bark || {}),
    },
    leaves: {
      ...DEFAULTS.leaves,
      ...(chassisDefaults.leaves || {}),
      ...(composition.leaves || {}),
    },
    deformer: {
      ...DEFAULTS.deformer,
      ...(chassisDefaults.deformer || {}),
      ...(composition.deformer || {}),
    },
    // Brief 19 (Quartz): authored gizmo transform. Whole-key replace (arrays
    // overwrite, not element-merge) — the client always writes the full
    // {posOffset, rotation, scale}. Absent → identity (back-compat).
    transform: {
      ...DEFAULTS.transform,
      ...(chassisDefaults.transform || {}),
      ...(composition.transform || {}),
    },
  }
}

export async function readEffectiveCompositions(species) {
  const overlay = await readOverlay(species)
  const out = []
  for (const c of overlay) {
    let meta = null
    if (c.chassis) {
      try { meta = await loadChassisMeta(c.chassis) } catch { /* stale ref */ }
    }
    out.push({
      slot: c.slot,
      name: c.name || `Slot ${c.slot}`,
      chassis: c.chassis || null,
      bark:    c.bark    || {},
      leaves:  c.leaves  || {},
      deformer: c.deformer || {},
      transform: c.transform || {},
      effective: resolveEffective(c, meta),
    })
  }
  return out
}

// POST merges with absent-keys-preserved per
// `feedback_absence_means_inherit_in_authored_blocks`: if the incoming
// composition leaves a key off entirely, the prior value is preserved
// (rather than wiped to `undefined`). This is the behavior the workstage
// wants — partial patches don't destroy adjacent state.
export async function writeCompositions(species, compositions) {
  const stateDir = path.dirname(compositionsStatePath(species))
  await fs.mkdir(stateDir, { recursive: true })
  const sanitized = compositions.map(c => ({
    slot: c.slot,
    name: c.name || `Slot ${c.slot}`,
    chassis: c.chassis || null,
    bark:    c.bark    || {},
    leaves:  c.leaves  || {},
    deformer: c.deformer || {},
    transform: c.transform || {},
  }))
  await fs.writeFile(
    compositionsStatePath(species),
    JSON.stringify({ species, compositions: sanitized, savedAt: Date.now() }, null, 2),
  )
}

// listSalonSpecies — species available in the Salon mode.
//
// FILTER DECISION (surfaced per brief): a species qualifies if EITHER (a) it
// has at least one chassis available in `_chassis/` (so the operator can
// start authoring from zero), OR (b) it already has a compositions.json on
// disk (so existing authoring stays reachable even if the chassis library
// is regenerated with different output). Union, not intersection — operator
// never loses a species they were working on, and discovers new species the
// moment Whittle's de-leaf produces chassis for them.
//
// Brief 15 (2026-05-23): Salon is the composer's space for vendor +
// hand-composed trees. Procedural species own ProceduralWorkstage; LiDAR
// Scan-mode species own LidarWorkstage. Both are EXCLUDED here so the Salon
// picker only shows species the operator authors compositionally.
//   - Procedural: name matches /^procedural_/ OR /_procedural$/
//   - LiDAR Scan-mode: `arborist/state/<species>/seedlings.json` exists
//     (Scan-mode operator state)
function isProceduralSpecies(speciesId) {
  return /^procedural_/.test(speciesId) || /_procedural$/.test(speciesId)
}
async function hasLidarSeedlings(speciesId) {
  try {
    await fs.access(path.join(STATE_ROOT, speciesId, 'seedlings.json'))
    return true
  } catch { return false }
}
export async function listSalonSpecies() {
  const chassis = await listChassis()
  const speciesIds = new Set()
  for (const c of chassis) {
    if (c.source && c.source.species) speciesIds.add(c.source.species)
  }
  try {
    const stateEntries = await fs.readdir(STATE_ROOT, { withFileTypes: true })
    for (const e of stateEntries) {
      if (!e.isDirectory()) continue
      try {
        await fs.access(path.join(STATE_ROOT, e.name, 'compositions.json'))
        speciesIds.add(e.name)
      } catch { /* no compositions yet */ }
    }
  } catch { /* state dir missing */ }
  // Brief 15: filter out procedural + LiDAR species (they have their own
  // workspaces). Done AFTER the union so the union logic stays unchanged.
  for (const speciesId of [...speciesIds]) {
    if (isProceduralSpecies(speciesId)) { speciesIds.delete(speciesId); continue }
    if (await hasLidarSeedlings(speciesId)) { speciesIds.delete(speciesId) }
  }
  const out = []
  for (const speciesId of [...speciesIds].sort()) {
    const chassisForSpecies = chassis.filter(c => c.source && c.source.species === speciesId)
    // Species morphology is derived from the most-common chassis morphology,
    // matching how the Salon picker ranks chassis. If no chassis exist (entry
    // exists only because of compositions.json), fall back to 'unknown'.
    const morphCounts = {}
    for (const c of chassisForSpecies) morphCounts[c.morphology] = (morphCounts[c.morphology] || 0) + 1
    const morphology = Object.entries(morphCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'
    let label = speciesId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    let compositionCount = 0
    try {
      const overlay = JSON.parse(
        await fs.readFile(compositionsStatePath(speciesId), 'utf8'),
      )
      compositionCount = (overlay.compositions || []).length
    } catch { /* no overlay yet */ }
    out.push({
      speciesId,
      label,
      morphology,
      chassisCount: chassisForSpecies.length,
      compositionCount,
    })
  }
  return out
}

// ── Composition GLB authoring ────────────────────────────────────────────
//
// Load the chassis GLB, rebind bark texture per composition.bark, re-stamp
// `extras.atlasKind = 'bark'` on the retained wood primitives (already
// stamped by Whittle but we set defensively), emit a leaf primitive at
// chassis attachment tags (or upper-bbox sampled fallback), and write the
// final multi-node GLB to disk for the publish chain.

const TAU = Math.PI * 2

// Per `feedback_unique_program_cache_key_before_wrappers`: we are NOT
// mutating runtime materials here. The bark + leaf materials are baked into
// the published GLB at author-time; `treeAtlasMaterial.js` reads
// `extras.atlasKind` at runtime and gates the existing retint program. No
// new uniforms, no shader variants — Brief 1 preserves the single program.

async function chassisToBarkPrimSummary(chassisDoc) {
  // Returns [{primNode, primIdx, oldMat, bbox}]
  // Used by `buildCompositionDocument` to know which prims to rebind.
  return chassisDoc.getRoot().listMeshes().flatMap((mesh) =>
    mesh.listPrimitives().map((prim) => ({ mesh, prim })),
  )
}

function getUpperBboxSamples(allPositions, count, seedR) {
  // Sample `count` deterministic points biased to the upper 40% of the
  // chassis bbox. Used when leafAttachmentTags is empty (Brief 1 default).
  // The lifted D.1b helpers expect one "tip" position per attachment; here
  // we synthesize tips by picking vertices that sit in the upper bbox band.
  if (allPositions.length === 0) return []
  let minY = Infinity, maxY = -Infinity
  for (let i = 1; i < allPositions.length; i += 3) {
    if (allPositions[i] < minY) minY = allPositions[i]
    if (allPositions[i] > maxY) maxY = allPositions[i]
  }
  const yThresh = minY + (maxY - minY) * 0.6   // upper 40%
  const upperVerts = []
  for (let i = 0; i < allPositions.length; i += 3) {
    if (allPositions[i + 1] >= yThresh) {
      upperVerts.push([allPositions[i], allPositions[i + 1], allPositions[i + 2]])
    }
  }
  if (upperVerts.length === 0) return []
  const out = []
  for (let k = 0; k < count; k++) {
    const idx = Math.floor(seedR() * upperVerts.length) % upperVerts.length
    out.push(upperVerts[idx])
  }
  return out
}

// Lifted from generate-procedural.js D.1b — produce a flat leaf-card geometry
// from a set of attachment positions. Each attachment emits a small spray of
// outward-facing quads. We keep it deterministic by routing all randomness
// through the supplied `rng` (mulberry32).
function buildLeafGeometryFromAttachments(attachments, opts, rng) {
  const {
    cardsPerAttachment = 5,
    cardSize = 0.4,
    spread = 0.35,
    yCompression = 0.6,
    tileGrid = [1, 1],   // [cols, rows] in the leaf-pack atlas
    inwardBias = 0,      // 0..1 — shift card scatter toward trunk axis
  } = opts || {}
  const [gridCols, gridRows] = tileGrid
  const tileW = 1 / gridCols
  const tileH = 1 / gridRows
  const N = attachments.length * cardsPerAttachment
  if (N === 0) return null
  const positions = new Float32Array(N * 4 * 3)
  const normals   = new Float32Array(N * 4 * 3)
  const uvs       = new Float32Array(N * 4 * 2)
  const indices   = new Uint32Array(N * 6)

  let q = 0
  for (const att of attachments) {
    // Anchor's XZ direction from the trunk axis (world origin). Cards
    // scatter biased opposite this direction — pulls cloud inward toward
    // the canopy interior so edge anchors don't spray cards past the
    // outer silhouette.
    const axDist = Math.hypot(att[0], att[2]) || 1
    const inwardX = -att[0] / axDist
    const inwardZ = -att[2] / axDist
    for (let k = 0; k < cardsPerAttachment; k++) {
      const r1 = rng() * 2 - 1
      const r2 = rng() * 2 - 1
      const r3 = rng() * 2 - 1
      const biasMag = inwardBias * spread
      const cx = att[0] + r1 * spread + inwardX * biasMag
      const cy = att[1] + r2 * spread * yCompression
      const cz = att[2] + r3 * spread + inwardZ * biasMag
      const sx = cardSize * (0.7 + rng() * 0.6)
      const sy = cardSize * (0.7 + rng() * 0.6)
      const yaw = rng() * TAU
      const pitch = (rng() - 0.5) * 0.7
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw)
      const sinP = Math.sin(pitch), cosP = Math.cos(pitch)
      // Card lies in a plane oriented by (yaw, pitch); local XY axes:
      const ax = cosY * sx,     ay = 0,         az = -sinY * sx
      const bx = sinY * sinP * sy, by = cosP * sy, bz = cosY * sinP * sy
      // Normal = ax × bx (cross), but we only need vCard-facing; cheap proxy.
      const nx = sinY * cosP, ny = -sinP, nz = cosY * cosP
      const corners = [
        [-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5],
      ]
      // Per-card random tile from the pack's grid — gives N distinct
      // leaf images visible across the canopy without needing N atlases.
      const tileCol = Math.floor(rng() * gridCols)
      const tileRow = Math.floor(rng() * gridRows)
      const u0 = tileCol * tileW
      const v0 = tileRow * tileH
      const u1 = u0 + tileW
      const v1 = v0 + tileH
      const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
      for (let i = 0; i < 4; i++) {
        const lx = corners[i][0], ly = corners[i][1]
        const x = cx + ax * lx + bx * ly
        const y = cy + ay * lx + by * ly
        const z = cz + az * lx + bz * ly
        const pi = (q * 4 + i) * 3, ui = (q * 4 + i) * 2
        positions[pi]     = x
        positions[pi + 1] = y
        positions[pi + 2] = z
        normals[pi]       = nx
        normals[pi + 1]   = ny
        normals[pi + 2]   = nz
        uvs[ui]     = uv[i][0]
        uvs[ui + 1] = uv[i][1]
      }
      const ii = q * 6, base = q * 4
      indices[ii]     = base
      indices[ii + 1] = base + 1
      indices[ii + 2] = base + 2
      indices[ii + 3] = base
      indices[ii + 4] = base + 2
      indices[ii + 5] = base + 3
      q++
    }
  }
  return { positions, normals, uvs, indices, count: N }
}

// Brief 5: rewrite a vendor leaf primitive's TEXCOORD_0 so the chassis
// renders with the picked pack's content. Two topology classes show up in
// vendor stock:
//
//   1. CARD-BASED — each card is 4 consecutive verts in the vertex buffer
//      with corner-pattern UVs (vendor's "uniform UV [0,1] per card"). The
//      indices buffer slices them into triangles, often interleaved across
//      cards. Detection: max vertex-use in the index buffer == 1 (each vert
//      appears in exactly one triangle) AND vertCount is divisible by 4.
//      Example: Robinia (580k verts / 4 = 145k cards, each card = 2 tris,
//      6 verts referenced once each — wait, that's 4 verts × 2 tris = 8
//      vert refs per card if quads share corners. Robinia avg-use is 1.0
//      so each tri has its own 3 verts → triangle-cards, 580k/3 ≈ 193k
//      tri-cards with the vert buffer holding 4 verts per quad-shape but
//      only 3 referenced per tri. The 4-vert grouping still holds because
//      vendor lays them out card-by-card.)
//   2. CONNECTED MESH — sculpted 3D leaf geometry with continuous UVs
//      across the canopy. Verts are heavily shared between triangles
//      (max-use > 1). Vendor UVs span a small sub-region of the vendor
//      leaf atlas (not [0,1]). Per-card UV rewriting is meaningless;
//      instead, rescale the whole UV cluster into a single random pack
//      tile so the existing leaf-shape geometry samples valid pack
//      content (no alpha cutoffs eating the leaves).
//      Example: Linden (470k verts, max-use=8, UV range
//      [0.445,0.989]×[0.619,0.770]).
//
// Both paths write pack-texture-local UVs — atlas-survey at bake time
// remaps onto the master atlas (`feedback_atlas_subregion_uv_recovery`).
// `rng` is the per-composition mulberry32 stream so re-runs are byte-
// identical (determinism, AC #8).
function rewriteLeafPrimUVs(prim, tileGrid, rng, doc) {
  const idx = prim.getIndices()
  const uvAttr = prim.getAttribute('TEXCOORD_0')
  if (!idx || !uvAttr) return // missing UVs → skip per brief edge case
  const [cols, rows] = tileGrid || [1, 1]
  if (cols < 1 || rows < 1) return
  const indices = idx.getArray()
  const uvs = uvAttr.getArray()
  const vertCount = uvs.length / 2
  // Topology classifier — single pass over the index buffer.
  let maxUse = 0
  const use = new Uint8Array(vertCount)
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i]
    const next = use[v] + 1
    use[v] = next > 255 ? 255 : next
    if (next > maxUse) maxUse = next
  }
  const cardBased = (maxUse === 1) && (vertCount % 4 === 0)
  if (cardBased) {
    rewriteCardUVs(prim, uvs, vertCount, cols, rows, rng, doc)
  } else {
    rescaleConnectedUVsToTile(prim, uvs, cols, rows, rng, doc)
  }
}

function rewriteCardUVs(prim, uvs, vertCount, cols, rows, rng, doc) {
  // Per-card random tile assignment. Vert layout: card K occupies verts
  // [4K, 4K+1, 4K+2, 4K+3]. Vendor UVs at those verts are corner-pattern
  // (typically (0,0)/(0,1)/(1,0)/(1,1) in some order — see Robinia).
  // Remap: new_uv = tile_origin + vendor_uv * tile_size.
  if (cols === 1 && rows === 1) return // 1×1 grid is identity on [0,1] inputs
  const tileW = 1 / cols
  const tileH = 1 / rows
  const newUvs = new Float32Array(uvs.length)
  const cardCount = vertCount / 4
  for (let k = 0; k < cardCount; k++) {
    const tileCol = Math.floor(rng() * cols)
    const tileRow = Math.floor(rng() * rows)
    const u0 = tileCol * tileW
    const v0 = tileRow * tileH
    for (let i = 0; i < 4; i++) {
      const ui = (k * 4 + i) * 2
      newUvs[ui]     = u0 + uvs[ui]     * tileW
      newUvs[ui + 1] = v0 + uvs[ui + 1] * tileH
    }
  }
  const acc = doc.createAccessor().setType('VEC2').setArray(newUvs)
  prim.setAttribute('TEXCOORD_0', acc)
}

function rescaleConnectedUVsToTile(prim, uvs, cols, rows, rng, doc) {
  // Connected sculpted-mesh fallback. Find the used UV range, rescale it
  // to fill one random tile. Without this, vendor UVs (often a tiny
  // sub-region of the vendor's atlas) sample whatever happens to be at
  // that spot in the Salon pack — usually empty alpha, giving the
  // "leaves cut off" symptom Tendril hit on Linden 2026-05-22.
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let i = 0; i < uvs.length; i += 2) {
    const u = uvs[i], v = uvs[i + 1]
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  const rangeU = maxU - minU
  const rangeV = maxV - minV
  if (!isFinite(rangeU) || !isFinite(rangeV) || rangeU < 1e-6 || rangeV < 1e-6) return
  const tileW = 1 / cols
  const tileH = 1 / rows
  const tileCol = Math.floor(rng() * cols)
  const tileRow = Math.floor(rng() * rows)
  const u0 = tileCol * tileW
  const v0 = tileRow * tileH
  const newUvs = new Float32Array(uvs.length)
  for (let i = 0; i < uvs.length; i += 2) {
    const nU = (uvs[i] - minU) / rangeU
    const nV = (uvs[i + 1] - minV) / rangeV
    newUvs[i]     = u0 + nU * tileW
    newUvs[i + 1] = v0 + nV * tileH
  }
  const acc = doc.createAccessor().setType('VEC2').setArray(newUvs)
  prim.setAttribute('TEXCOORD_0', acc)
}

// Bake every node's accumulated world transform into its mesh's POSITION
// and NORMAL accessors, then reset all node TRS chains to identity. After
// this, mesh-space == chassis-root-local space across every mesh in the
// document. Mirrors the recipe `survey-deleaf.js#processBundleGlb` runs
// per-bundle-root (lines 504–521); duplicated here so that script stays
// untouched per Brief 2.1c's constraints.
function bakeAllNodeTransforms(doc) {
  const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
  function mul(a, b) {
    const o = new Array(16)
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3]
      }
    }
    return o
  }
  const baked = new Set()
  function bakeInto(prim, m) {
    const pos = prim.getAttribute('POSITION')
    if (pos) {
      const src = pos.getArray()
      const out = new Float32Array(src.length)
      for (let i = 0; i < src.length; i += 3) {
        const x = src[i], y = src[i+1], z = src[i+2]
        out[i]   = m[0]*x + m[4]*y + m[8] *z + m[12]
        out[i+1] = m[1]*x + m[5]*y + m[9] *z + m[13]
        out[i+2] = m[2]*x + m[6]*y + m[10]*z + m[14]
      }
      const acc = doc.createAccessor().setType('VEC3').setArray(out)
      prim.setAttribute('POSITION', acc)
    }
    const nrm = prim.getAttribute('NORMAL')
    if (nrm) {
      // Upper-3×3 transform, then renormalize. Adequate for rotation +
      // uniform scale; vendor packs use uniform scale (chassis-wide).
      const src = nrm.getArray()
      const out = new Float32Array(src.length)
      for (let i = 0; i < src.length; i += 3) {
        const x = src[i], y = src[i+1], z = src[i+2]
        const nx = m[0]*x + m[4]*y + m[8] *z
        const ny = m[1]*x + m[5]*y + m[9] *z
        const nz = m[2]*x + m[6]*y + m[10]*z
        const len = Math.hypot(nx, ny, nz) || 1
        out[i] = nx/len; out[i+1] = ny/len; out[i+2] = nz/len
      }
      const acc = doc.createAccessor().setType('VEC3').setArray(out)
      prim.setAttribute('NORMAL', acc)
    }
  }
  function walk(node, parentM) {
    const m = mul(parentM, node.getMatrix() || identity)
    const mesh = node.getMesh()
    if (mesh && !baked.has(mesh)) {
      baked.add(mesh)
      for (const prim of mesh.listPrimitives()) bakeInto(prim, m)
    }
    for (const c of node.listChildren()) walk(c, m)
  }
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getParentNode()) walk(node, identity)
  }
  // Safety net: orphan meshes (held by nodes not reachable from any root)
  // get baked with identity — better than leaving them with a stale
  // transform-after-reset.
  for (const mesh of doc.getRoot().listMeshes()) {
    if (baked.has(mesh)) continue
    for (const prim of mesh.listPrimitives()) bakeInto(prim, identity)
  }
  // Reset every node's TRS to identity (and matrix if the API exposes it).
  for (const node of doc.getRoot().listNodes()) {
    node.setTranslation([0, 0, 0])
    node.setRotation([0, 0, 0, 1])
    node.setScale([1, 1, 1])
    if (node.setMatrix) {
      try { node.setMatrix([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) } catch {}
    }
  }
}

// ── Brief 19 (Quartz): authored-transform bake ─────────────────────────────
//
// Persists + bakes the Salon gizmo's authored transform into the published
// geometry. The CORRECTNESS requirement (AC #3) is that the bake replicate
// the viewport's transform composition EXACTLY (project_preview_equals_ls_
// literally). The viewport does NOT compose a plain T·R·S about the group
// origin — `SpecimenViewport.jsx` Skeleton composes (outer→inner):
//
//     display(v) = R · S · T_posOffset · T_autocenter · v
//
// where T_autocenter (= translate(-trunk.x, -trunk.minY, -trunk.z), from
// `computeDominantTrunk`) re-centers the dominant-trunk base on the bullseye
// BEFORE the authored transform, so rotation/scale pivot about the trunk
// base, not the group origin. Real chassis are meaningfully off-origin
// (chassis_frame_not_origin_centered), so this distinction is load-bearing.
//
// To match the viewport AND keep identity byte-identical (AC #4), we bake the
// CONJUGATED transform — operator-approved "in-place" semantics (the trunk
// base stays where it was; the viewport's centering is framing-only):
//
//     v' = T_autocenter⁻¹ · R · S · T_posOffset · T_autocenter · v
//
// Identity authoring → T_autocenter⁻¹·T_autocenter = I → geometry untouched.

// Column-major 4×4 multiply (matches bakeAllNodeTransforms#mul + bakeInto's
// element convention: m[12..14] = translation).
function mat4Mul(a, b) {
  const o = new Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3]
    }
  }
  return o
}
function mat4Translate(tx, ty, tz) {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]
}
function mat4Scale(s) {
  return [s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]
}
// Euler XYZ → column-major rotation matrix, byte-for-byte the same formula
// three.js Matrix4.makeRotationFromEuler uses for order 'XYZ' (the order a
// single <group rotation={[rx,ry,rz]}> applies). Replicating it exactly is
// what makes the baked rotation match what the operator saw.
function eulerXYZToMat4(rx, ry, rz) {
  const a = Math.cos(rx), b = Math.sin(rx)
  const c = Math.cos(ry), d = Math.sin(ry)
  const e = Math.cos(rz), f = Math.sin(rz)
  const ae = a*e, af = a*f, be = b*e, bf = b*f
  const m = new Array(16).fill(0)
  m[0] = c*e;        m[4] = -c*f;       m[8]  = d
  m[1] = af + be*d;  m[5] = ae - bf*d;  m[9]  = -b*c
  m[2] = bf - ae*d;  m[6] = be + af*d;  m[10] = a*c
  m[15] = 1
  return m
}

// Port of SpecimenViewport.jsx#computeDominantTrunk, operating on the
// post-bakeAllNodeTransforms doc (node TRS already identity, so POSITION
// accessors ARE world coords). Traverses ALL prims (bark + leaf), matching
// the viewport's anchorScene. Returns { x, z, minY } — the trunk-base pivot.
//
// ⚠ KEEP IN SYNC with computeDominantTrunk: the bake matches the viewport
// ONLY if both find the same pivot. If you retune one (GRID, slab %, the
// densest-3×3-cell rule), retune the other or AC #3 silently breaks. A
// shared-helper lift is a tracked follow-up (BACKLOG Brief 20 note).
function computeAutoCenterPivot(doc) {
  const meshes = doc.getRoot().listMeshes()
  let minY = Infinity, maxY = -Infinity
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const arr = pos.getArray()
      for (let i = 1; i < arr.length; i += 3) {
        if (arr[i] < minY) minY = arr[i]
        if (arr[i] > maxY) maxY = arr[i]
      }
    }
  }
  if (!isFinite(minY)) return null
  const total = maxY - minY
  const slabHi = minY + Math.max(0.05 * total, 0.05)
  const GRID = 0.5
  const cells = new Map()
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const arr = pos.getArray()
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i], y = arr[i+1], z = arr[i+2]
        if (y > slabHi) continue
        const ix = Math.floor(x / GRID), iz = Math.floor(z / GRID)
        const key = `${ix},${iz}`
        let cl = cells.get(key)
        if (!cl) { cl = { ix, iz, count: 0, sx: 0, sz: 0 }; cells.set(key, cl) }
        cl.count++; cl.sx += x; cl.sz += z
      }
    }
  }
  if (cells.size === 0) return { x: 0, z: 0, minY }
  let bestSum = -1, bestCell = null
  for (const cl of cells.values()) {
    let sum = 0
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = cells.get(`${cl.ix+dx},${cl.iz+dz}`)
      if (n) sum += n.count
    }
    if (sum > bestSum) { bestSum = sum; bestCell = cl }
  }
  let sx = 0, sz = 0, n = 0
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const cl = cells.get(`${bestCell.ix+dx},${bestCell.iz+dz}`)
    if (!cl) continue
    sx += cl.sx; sz += cl.sz; n += cl.count
  }
  return { x: sx / n, z: sz / n, minY }
}

function isIdentityTransform(t) {
  if (!t) return true
  const po  = Array.isArray(t.posOffset) ? t.posOffset : [0, 0, 0]
  const rot = Array.isArray(t.rotation)  ? t.rotation  : [0, 0, 0]
  const s   = typeof t.scale === 'number' ? t.scale : 1
  return po[0] === 0 && po[1] === 0 && po[2] === 0
    && rot[0] === 0 && rot[1] === 0 && rot[2] === 0
    && s === 1
}

// Bake the authored transform into every prim's POSITION + NORMAL. No-op
// (geometry untouched → byte-identical) for identity authoring.
function bakeAuthoredTransform(doc, transform) {
  if (isIdentityTransform(transform)) return
  const po  = Array.isArray(transform.posOffset) ? transform.posOffset : [0, 0, 0]
  const rot = Array.isArray(transform.rotation)  ? transform.rotation  : [0, 0, 0]
  // Uniform scale only — the gizmo emits a scalar (scaleOverride). Coerce +
  // guard so an accidental array can't smuggle in a non-uniform scale (which
  // the upper-3×3 normal bake below does NOT handle correctly).
  const s = typeof transform.scale === 'number' ? transform.scale : 1

  const pivot = computeAutoCenterPivot(doc)
  // T_autocenter centers the trunk base on the origin (centerX=-x, ground=
  // -minY, centerZ=-z), exactly as the viewport's <Skeleton> inner group.
  const Tc    = pivot ? mat4Translate(-pivot.x, -pivot.minY, -pivot.z) : mat4Translate(0, 0, 0)
  const TcInv = pivot ? mat4Translate( pivot.x,  pivot.minY,  pivot.z) : mat4Translate(0, 0, 0)
  const Toff  = mat4Translate(po[0], po[1], po[2])
  const S     = mat4Scale(s)
  const R     = eulerXYZToMat4(rot[0], rot[1], rot[2])

  // M = TcInv · R · S · Toff · Tc   (compose inner→outer)
  let m = Tc
  m = mat4Mul(Toff, m)
  m = mat4Mul(S, m)
  m = mat4Mul(R, m)
  m = mat4Mul(TcInv, m)

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (pos) {
        const src = pos.getArray()
        const out = new Float32Array(src.length)
        for (let i = 0; i < src.length; i += 3) {
          const x = src[i], y = src[i+1], z = src[i+2]
          out[i]   = m[0]*x + m[4]*y + m[8] *z + m[12]
          out[i+1] = m[1]*x + m[5]*y + m[9] *z + m[13]
          out[i+2] = m[2]*x + m[6]*y + m[10]*z + m[14]
        }
        prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(out))
      }
      const nrm = prim.getAttribute('NORMAL')
      if (nrm) {
        // Upper-3×3 + renormalize. Exact for rotation + uniform scale (the
        // scale factor drops out under renormalization).
        const src = nrm.getArray()
        const out = new Float32Array(src.length)
        for (let i = 0; i < src.length; i += 3) {
          const x = src[i], y = src[i+1], z = src[i+2]
          const nx = m[0]*x + m[4]*y + m[8] *z
          const ny = m[1]*x + m[5]*y + m[9] *z
          const nz = m[2]*x + m[6]*y + m[10]*z
          const len = Math.hypot(nx, ny, nz) || 1
          out[i] = nx/len; out[i+1] = ny/len; out[i+2] = nz/len
        }
        prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(out))
      }
    }
  }
}

async function buildCompositionDocument({ chassis, bark, leaves, slotName, hideLeaves = false, transform = null }) {
  const chassisPath = path.join(CHASSIS_DIR, `${chassis}.glb`)
  const io = makeIO()
  const chassisDoc = await io.read(chassisPath)
  const meta = await loadChassisMeta(chassis)

  // Brief 2.1c (Sorrel): bake every chassis node's world transform into
  // its primitives' POSITION/NORMAL accessors, then reset all node TRS
  // chains to identity. See prior comment for rationale.
  bakeAllNodeTransforms(chassisDoc)

  // Brief 5 (Tendril, 2026-05-22) — vendor-card-preservation pivot:
  // Partition prims by survey-deleaf's atlasKind stamp. Bark prims get the
  // Salon bark material; leaf prims (when present) keep their vendor-baked
  // geometry and get the Salon pack texture bound + per-card UV rewrites.
  // Chassis with NO leaf prims (LiDAR-derived, wood-only) fall back to the
  // spray-at-attachment path below.
  const vendorLeafPrims = []
  const barkPrims = []
  for (const mesh of chassisDoc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const ex = prim.getExtras() || {}
      if (ex.atlasKind === 'leaf') {
        vendorLeafPrims.push({ prim, mesh })
      } else {
        if (!ex.atlasKind) prim.setExtras({ ...ex, atlasKind: 'bark' })
        barkPrims.push({ prim, mesh })
      }
    }
  }

  // Gather bark positions for fallback leaf-attachment sampling (only used
  // when vendor leaf prims are absent and the spray path runs).
  const positionsCombined = []
  for (const { prim } of barkPrims) {
    const acc = prim.getAttribute('POSITION')
    if (acc) {
      const arr = acc.getArray()
      for (let i = 0; i < arr.length; i++) positionsCombined.push(arr[i])
    }
  }

  // Rebind bark material: create a fresh material with bark textures and
  // assign it to bark prims only.
  const barkBundle = await readBarkBundle(bark.ref)
  const barkColorTex = chassisDoc.createTexture(`salon_bark_${bark.ref}_color`)
    .setImage(barkBundle.colorBytes).setMimeType('image/jpeg')
  const barkNormalTex = chassisDoc.createTexture(`salon_bark_${bark.ref}_normal`)
    .setImage(barkBundle.normalBytes).setMimeType('image/jpeg')
  const barkMat = chassisDoc.createMaterial('salonBark')
    .setBaseColorTexture(barkColorTex)
    .setNormalTexture(barkNormalTex)
    .setAlphaMode('OPAQUE')
    .setRoughnessFactor(typeof bark.roughnessOverride === 'number' ? bark.roughnessOverride : 0.85)
    .setMetallicFactor(0)
  for (const { prim } of barkPrims) prim.setMaterial(barkMat)

  // Brief 5: leaves.show=false in the workstage preview drops vendor leaf
  // prims AND skips the spray-fallback emission. Operator sees the bare
  // chassis for structure inspection. Per brief Out-of-Scope: this never
  // reaches the bake — the publish path (writeMultiCompositionGLB) does
  // not pass hideLeaves, so the baked artifact always carries leaves.
  if (hideLeaves) {
    for (const { prim, mesh } of vendorLeafPrims) {
      mesh.removePrimitive(prim)
      prim.dispose()
    }
    vendorLeafPrims.length = 0
    const scene = chassisDoc.getRoot().getDefaultScene() || chassisDoc.getRoot().listScenes()[0]
    if (scene) for (const n of scene.listChildren()) n.setName(slotName)
    return chassisDoc
  }

  // Determinism: hash(chassis|bark.ref|leaves.pack) seeds mulberry32 for
  // both UV-rewrite (vendor path) and spray (fallback) so byte-identical
  // GLB across re-runs.
  const seed = hashString(`${chassis}|${bark.ref}|${leaves.pack}`)
  const rng = mulberry32(seed)

  if (vendorLeafPrims.length > 0) {
    // Vendor-card path. Bind the picked pack texture to a fresh Salon leaf
    // material; rewrite per-card UVs to sample one tile from the tile grid
    // per card. Material settings mirror the spray-path material so the
    // shader-program cache key matches (Bloom stability, AC #7).
    const leafBlob = await readLeafBytes(leaves.pack)
    const leafTex = chassisDoc.createTexture(`salon_leaf_${leaves.pack}`)
      .setImage(leafBlob.bytes).setMimeType(leafBlob.mime)
    const leafMat = chassisDoc.createMaterial('salonLeaves')
      .setBaseColorTexture(leafTex)
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.5)
      .setDoubleSided(true)
      .setRoughnessFactor(0.85)
      .setMetallicFactor(0)
    const packMeta = await readLeafPackMeta(leaves.pack)
    for (const { prim } of vendorLeafPrims) {
      prim.setMaterial(leafMat)
      rewriteLeafPrimUVs(prim, packMeta.tileGrid, rng, chassisDoc)
    }
    // Slot label + return early — vendor path doesn't run the spray code.
    const scene = chassisDoc.getRoot().getDefaultScene() || chassisDoc.getRoot().listScenes()[0]
    if (scene) {
      const nodes = scene.listChildren()
      for (let i = 0; i < nodes.length; i++) nodes[i].setName(slotName)
    }
    return chassisDoc
  }

  // ── Fallback spray path (chassis has no vendor LEAF prims) ──────────────
  // Use chassis-authored attachment tags if present; else sample upper-bbox
  // vertices.
  const authoredTags = Array.isArray(meta.leafAttachmentTags) ? meta.leafAttachmentTags : []
  const occ = Math.max(0, Math.min(1, leaves.occupancy ?? 0.7))
  let attachments
  if (authoredTags.length > 0) {
    // 2026-05-22: occupancy now subsamples the authored tags (was bypassed
    // entirely when tags exist). Deterministic Fisher-Yates shuffle then
    // slice. At occ=1.0 use all; at occ=0.5 use half; at occ=0.0 keep
    // a minimum of 4 so the tree isn't entirely bare.
    const all = authoredTags.map(t => t.pos || t)
    const keep = Math.max(4, Math.round(all.length * occ))
    if (keep >= all.length) {
      attachments = all
    } else {
      const arr = [...all]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      attachments = arr.slice(0, keep)
    }
  } else {
    // Density driven by occupancy: 0..1 maps to ~8..80 attachment points.
    const attachmentCount = Math.round(8 + occ * 72)
    attachments = getUpperBboxSamples(positionsCombined, attachmentCount, rng)
  }
  // 2026-05-22 tuning: card size scales with leaves.scale, but spread stays
  // fixed (was 0.35 × scale — coupled spread to scale meant leaves spilled
  // past branch tips when operator scaled up). cardsPerAttachment bumped from
  // 5 → 12 for denser clusters that read as foliage mass.
  const scale = typeof leaves.scale === 'number' ? leaves.scale : 1.0
  const packMeta = await readLeafPackMeta(leaves.pack)
  const leafGeo = buildLeafGeometryFromAttachments(attachments, {
    cardsPerAttachment: 35,
    cardSize: BASE_CARD_SIZE * scale,
    spread: 0.7,
    yCompression: 0.7,
    tileGrid: packMeta.tileGrid,
    inwardBias: 0.35,  // bias card-cloud toward trunk axis — kills edge floaters
  }, rng)

  if (leafGeo) {
    const leafBlob = await readLeafBytes(leaves.pack)
    const leafTex = chassisDoc.createTexture(`salon_leaf_${leaves.pack}`)
      .setImage(leafBlob.bytes).setMimeType(leafBlob.mime)
    const leafMat = chassisDoc.createMaterial('salonLeaves')
      .setBaseColorTexture(leafTex)
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.5)
      .setDoubleSided(true)
      .setRoughnessFactor(0.85)
      .setMetallicFactor(0)

    // GLB spec: 0–1 buffers. The chassis already carries one buffer with
    // vendor geometry; reuse it for our leaf accessors so writeBinary doesn't
    // refuse to emit. Fall back to creating one only if the chassis is
    // somehow buffer-less.
    const buf = chassisDoc.getRoot().listBuffers()[0] || chassisDoc.createBuffer()
    const posAcc = chassisDoc.createAccessor()
      .setType('VEC3').setArray(leafGeo.positions).setBuffer(buf)
    const norAcc = chassisDoc.createAccessor()
      .setType('VEC3').setArray(leafGeo.normals).setBuffer(buf)
    const uvAcc = chassisDoc.createAccessor()
      .setType('VEC2').setArray(leafGeo.uvs).setBuffer(buf)
    const idxArr = leafGeo.count * 4 > 65535
      ? leafGeo.indices
      : new Uint16Array(leafGeo.indices)
    const idxAcc = chassisDoc.createAccessor()
      .setType('SCALAR').setArray(idxArr).setBuffer(buf)

    const leafPrim = chassisDoc.createPrimitive()
      .setAttribute('POSITION', posAcc)
      .setAttribute('NORMAL',   norAcc)
      .setAttribute('TEXCOORD_0', uvAcc)
      .setIndices(idxAcc)
      .setMaterial(leafMat)
    leafPrim.setExtras({ atlasKind: 'leaf' })

    // Add the leaf primitive to the chassis's single mesh (or create one
    // if the chassis somehow has zero meshes — defensive). After the
    // upstream transform-bake (see top of this function), every chassis
    // mesh sits under identity-transform nodes, so adding the leaf prim to
    // meshes[0] inherits the right (identity) transform. Authored tag
    // coords are in chassis-root-local space (v2 contract); after bake,
    // mesh-space == chassis-root-local space.
    const meshes = chassisDoc.getRoot().listMeshes()
    const targetMesh = meshes[0] || chassisDoc.createMesh('salonMesh')
    targetMesh.addPrimitive(leafPrim)
  }

  // Ensure scene + node naming carries the composition slot label so
  // `publish-glb.js` variant detection has something to chew on. If the
  // chassis was already named, we override the top-level node name only.
  const scene = chassisDoc.getRoot().getDefaultScene() || chassisDoc.getRoot().listScenes()[0]
  if (scene) {
    const nodes = scene.listChildren()
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].setName(slotName)
    }
  }

  // Brief 19 (Quartz): bake the authored gizmo transform into POSITION +
  // NORMAL, AFTER bark + leaf prims are in place (so leaves rotate/scale with
  // the chassis) and AFTER node transforms are identity (POSITION == chassis-
  // root-local == the frame the viewport renders). Only the PUBLISH path
  // passes `transform`; the live preview leaves it null and the viewport
  // gizmo applies it for display (so the preview GLB is NOT pre-baked — no
  // double-transform). Identity authoring is a geometry no-op.
  if (transform) bakeAuthoredTransform(chassisDoc, transform)

  return chassisDoc
}

// Write a multi-node GLB at `outPath` carrying every composition as a
// top-level node — same shape `generate-procedural.js#buildSourceGLB` produces
// so `publish-glb.js`'s `namesSuggestVariants` splits them automatically.
async function writeMultiCompositionGLB({ species, compositions, outPath }) {
  if (compositions.length === 0) {
    throw new Error(`no compositions to publish for species ${species}`)
  }
  const io = makeIO()
  // Build each composition's document, then merge into a single master doc.
  // gltf-transform's Document API doesn't expose a clean cross-doc merge,
  // so we round-trip via binary buffers (small extra cost; preserves
  // texture & material identity inside each composition).
  const masterDoc = new Document()
  const masterScene = masterDoc.createScene()
  for (let i = 0; i < compositions.length; i++) {
    const c = compositions[i]
    const slotName = `${species}_${c.slot}`
    const sub = await buildCompositionDocument({
      chassis: c.effective.chassis || c.chassis,
      bark: c.effective.bark,
      leaves: c.effective.leaves,
      slotName,
      transform: c.effective.transform,
    })
    // Serialize the sub-doc and reload into the master as an embedded
    // subtree. We deep-copy primitives by re-creating accessors so they
    // share the master buffer.
    const subBytes = await io.writeBinary(sub)
    const subReloaded = await io.readBinary(subBytes)
    const subBuffer = masterDoc.createBuffer()
    for (const subMesh of subReloaded.getRoot().listMeshes()) {
      const mesh = masterDoc.createMesh(slotName)
      for (const subPrim of subMesh.listPrimitives()) {
        const prim = masterDoc.createPrimitive()
          .setExtras(subPrim.getExtras())
        // Copy the material with its textures.
        const subMat = subPrim.getMaterial()
        if (subMat) {
          const mat = masterDoc.createMaterial(subMat.getName())
            .setAlphaMode(subMat.getAlphaMode())
            .setAlphaCutoff(subMat.getAlphaCutoff())
            .setDoubleSided(subMat.getDoubleSided())
            .setRoughnessFactor(subMat.getRoughnessFactor())
            .setMetallicFactor(subMat.getMetallicFactor())
          const subBaseTex = subMat.getBaseColorTexture()
          if (subBaseTex) {
            const tex = masterDoc.createTexture(subBaseTex.getName())
              .setImage(subBaseTex.getImage())
              .setMimeType(subBaseTex.getMimeType())
            mat.setBaseColorTexture(tex)
          }
          const subNormalTex = subMat.getNormalTexture()
          if (subNormalTex) {
            const tex = masterDoc.createTexture(subNormalTex.getName())
              .setImage(subNormalTex.getImage())
              .setMimeType(subNormalTex.getMimeType())
            mat.setNormalTexture(tex)
          }
          prim.setMaterial(mat)
        }
        for (const semantic of subPrim.listSemantics()) {
          const subAcc = subPrim.getAttribute(semantic)
          const acc = masterDoc.createAccessor()
            .setType(subAcc.getType())
            .setArray(subAcc.getArray().slice())
            .setBuffer(subBuffer)
          prim.setAttribute(semantic, acc)
        }
        const subIdx = subPrim.getIndices()
        if (subIdx) {
          const idx = masterDoc.createAccessor()
            .setType(subIdx.getType())
            .setArray(subIdx.getArray().slice())
            .setBuffer(subBuffer)
          prim.setIndices(idx)
        }
        mesh.addPrimitive(prim)
      }
      const node = masterDoc.createNode(slotName).setMesh(mesh)
      masterScene.addChild(node)
    }
  }
  await io.write(outPath, masterDoc)
}

// ── Single-composition preview GLB (workstage live preview) ─────────────

export async function generateSingleCompositionGLB({ chassis, bark, leaves, lod = 0, slotLabel = 'preview' }) {
  if (!chassis) throw new Error('chassis is required')
  const effective = {
    chassis,
    bark:    { ...DEFAULTS.bark,    ...(bark    || {}) },
    leaves:  { ...DEFAULTS.leaves,  ...(leaves  || {}) },
    deformer: { ...DEFAULTS.deformer, ...(/* reserved */ {}) },
  }
  // Brief 5: workstage-only leaves.show toggle. When false, drop vendor
  // leaf prims from the preview. Publish path (writeMultiCompositionGLB)
  // never sets this — baked artifact always carries leaves.
  const hideLeaves = effective.leaves.show === false
  const doc = await buildCompositionDocument({
    chassis,
    bark: effective.bark,
    leaves: effective.leaves,
    slotName: slotLabel,
    hideLeaves,
  })
  const io = makeIO()
  let buf = Buffer.from(await io.writeBinary(doc))
  if (lod === 1 || lod === 2) buf = await simplifyGlbBytes(buf, lod)
  return buf
}

const LOD_PRESETS = {
  1: { ratio: 0.40, error: 0.0020 },
  2: { ratio: 0.10, error: 0.0080 },
}
async function simplifyGlbBytes(buf, lod) {
  const preset = LOD_PRESETS[lod]
  if (!preset) return buf
  await MeshoptSimplifier.ready
  const io = makeIO()
  const doc = await io.readBinary(buf)
  await doc.transform(
    weld(),
    dedup(),
    gltfSimplify({ simplifier: MeshoptSimplifier, ratio: preset.ratio, error: preset.error }),
  )
  return Buffer.from(await io.writeBinary(doc))
}

// ── writeIfChanged — touches mtime on no-op (project_writeifchanged_touches_mtime)

async function writeIfChanged(p, bytes) {
  try {
    const existing = await fs.readFile(p)
    if (existing.equals(bytes)) {
      // No-op write: still touch mtime so downstream rebuild predicates
      // see "this file participated in this publish."
      const now = new Date()
      await fs.utimes(p, now, now)
      return false
    }
  } catch { /* file doesn't exist yet */ }
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, bytes)
  return true
}

// ── Post-publish manifest patch (Brief 1.5a item 1) ─────────────────────
//
// `bake-look.js` reads each species's `public/trees/<species>/manifest.json#bark`
// when it builds `trees-atlas.json#barkBySpecies`, which `InstancedTrees.jsx`
// then feeds to `applyBarkUniforms` at runtime. Without this patch step,
// `publish-glb.js` emits the manifest with no `bark` field → bake-look surfaces
// no entry → runtime falls back to identity uniforms → operator's tintBase /
// uvScale / roughnessOverride / tintJitterRange knobs visibly do nothing.
// Mirrors `generate-procedural.js#patchManifestForFillTier` exactly.
//
// Salon publishes a single bark spec per species (the first composition's
// effective bark). Per-composition bark *texture* variation lives in each
// variant's GLB (each composition's bark image is baked into the published
// GLB by `buildCompositionDocument`); per-composition tint/jitter/roughness
// at runtime would require runtime path changes that are out of scope.
// This matches procedural's single-bark-per-species model exactly.
async function patchManifestForSalon(species, compositions) {
  const p = path.join(REPO_ROOT, 'public/trees', species, 'manifest.json')
  const m = JSON.parse(await fs.readFile(p, 'utf8'))
  const first = compositions[0]?.effective?.bark
  if (first) {
    m.bark = {
      // Field name MATCHES bake-look#flatten + procedural's BARK_BY_SPECIES
      // shape exactly: `materialRef` (not `ref`). Salon's internal field is
      // `ref` (mirrors the brief's compositions schema); transform here.
      materialRef: first.ref || null,
      uvScale: first.uvScale || [1, 1],
      tintBase: first.tintBase || '#ffffff',
      tintJitterRange: typeof first.tintJitterRange === 'number' ? first.tintJitterRange : 0,
      roughnessOverride: typeof first.roughnessOverride === 'number' ? first.roughnessOverride : -1,
    }
  }
  // Mark every published variant as `qualityOverride: 4` (Hero tier). Salon
  // is operator-composed, hand-curated work — the heroes-on-fillers doctrine
  // (ARCHITECTURE.md "Two-tier substitution") puts hand-tuned compositions
  // at 4 so they win their bucket's quality lottery vs the procedural
  // fillers at 2. publish-glb.js writes `quality: 0` by default;
  // `build-index.js` filters those out, so without this step Salon species
  // would publish but never land in `index.json` → never reach LS.
  for (const v of m.variants ?? []) v.qualityOverride = 4
  // Brief 2 (Holm): per-variant gradient stops. publish-glb.js assigns
  // variantId = i+1 over composition iteration order (compositions are
  // pre-filtered to `ready` in main(), so the index here matches the GLB
  // ordering exactly). Each composition that authored gradientStops gets
  // its block written to the matching variant; absent → variant.bark stays
  // unset → bake-look falls back to legacy single-tint runtime for that
  // variant. Existing variant.bark blocks are preserved so a re-publish
  // doesn't blow away unrelated per-variant data future briefs might add.
  for (let i = 0; i < compositions.length; i++) {
    const compBark = compositions[i]?.effective?.bark
    const stops = compBark?.gradientStops
    // Brief 2.1 (Birch): per-composition cross-tree hash amp authored
    // alongside gradientStops. Default 0 = pure per-pixel luminance.
    // Only written when gradient is active; cleared with the stops.
    const hashAmp = typeof compBark?.gradientHashAmp === 'number'
      ? compBark.gradientHashAmp
      : 0
    const variantId = i + 1
    const variant = m.variants?.find(v => v.id === variantId || String(v.id) === String(variantId))
    if (!variant) continue
    if (Array.isArray(stops) && stops.length >= 2) {
      variant.bark = { ...(variant.bark || {}), gradientStops: stops, gradientHashAmp: hashAmp }
    } else if (variant.bark?.gradientStops) {
      // Composition toggled gradient OFF → clear stops + hashAmp on disk;
      // preserve any sibling per-variant bark fields a future brief may add.
      const { gradientStops: _drop, gradientHashAmp: _drop2, ...rest } = variant.bark
      variant.bark = Object.keys(rest).length ? rest : undefined
      if (variant.bark === undefined) delete variant.bark
    }
  }
  await fs.writeFile(p, JSON.stringify(m, null, 2))
}

// Lafayette Square roster sync — same idempotent shape as
// `generate-procedural.js#syncLookRoster`. Adds Salon-published variants
// so they appear in LS placements after the next bake-look + bake-trees.
async function syncLookRoster(lookName, speciesList) {
  const p = path.join(REPO_ROOT, 'public/looks', lookName, 'design.json')
  let design
  try { design = JSON.parse(await fs.readFile(p, 'utf8')) }
  catch { return 0 /* look doesn't exist — operator hasn't picked one */ }
  const trees = Array.isArray(design.trees) ? design.trees : []
  const haveKeys = new Set(trees.map(t => `${t.species}|${t.variantId}`))
  const newRoster = [...trees]
  let added = 0
  for (const species of speciesList) {
    const manifestPath = path.join(REPO_ROOT, 'public/trees', species, 'manifest.json')
    try {
      const m = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
      for (const v of m.variants ?? []) {
        const key = `${species}|${v.id}`
        if (!haveKeys.has(key)) {
          newRoster.push({ species, variantId: v.id })
          haveKeys.add(key)
          added++
        }
      }
    } catch { /* species not published yet — skip */ }
  }
  if (added > 0) {
    design.trees = newRoster
    await fs.writeFile(p, JSON.stringify(design, null, 2))
  }
  return added
}

// ── CLI ──────────────────────────────────────────────────────────────────

function parseCliFilter(argv) {
  const i = argv.indexOf('--species')
  if (i === -1 || !argv[i + 1]) return null
  return argv[i + 1]
}

async function main() {
  console.log('[generate-salon] composition-based publish (Brief 1, Sequoia)')

  const onlySpecies = parseCliFilter(process.argv)
  const allSpecies = await listSalonSpecies()
  const speciesToBuild = onlySpecies
    ? allSpecies.filter(s => s.speciesId === onlySpecies)
    : allSpecies.filter(s => s.compositionCount > 0)

  if (onlySpecies && speciesToBuild.length === 0) {
    console.error(`[generate-salon] unknown --species ${onlySpecies}; available: ${allSpecies.map(s => s.speciesId).join(', ')}`)
    process.exit(1)
  }

  if (speciesToBuild.length === 0) {
    console.log('[generate-salon] no species with authored compositions — nothing to do')
    return
  }

  for (const sp of speciesToBuild) {
    const compositions = await readEffectiveCompositions(sp.speciesId)
    const ready = compositions.filter(c => c.effective.chassis)
    console.log(`\n[generate-salon] === ${sp.speciesId} (${ready.length}/${compositions.length} compositions ready) ===`)
    if (ready.length === 0) {
      console.log('  skipped (no compositions reference a chassis yet)')
      continue
    }
    const tmpGlb = path.join('/tmp', `salon-${sp.speciesId}.glb`)
    await writeMultiCompositionGLB({ species: sp.speciesId, compositions: ready, outPath: tmpGlb })
    const stat = await fs.stat(tmpGlb)
    console.log(`  → ${tmpGlb} (${(stat.size / 1024).toFixed(0)} KB)`)

    execFileSync('node', [
      path.join(__dirname, 'publish-glb.js'),
      '--source', tmpGlb,
      '--species', sp.speciesId,
      '--label', sp.label,
    ], { stdio: 'inherit', cwd: REPO_ROOT })

    // Brief 1.5a item 1: write the bark spec into the species manifest so
    // bake-look surfaces it into trees-atlas.json#barkBySpecies and the
    // runtime applyBarkUniforms path drives visible bark appearance.
    await patchManifestForSalon(sp.speciesId, ready)
  }

  // Add published variants to the lafayette-square Look's roster (same
  // idempotent pattern as generate-procedural). Surfaced in Brief 1 as a
  // Salon-side gap; addressed here as a Brief 1.5a side-fix because
  // bark-knob acceptance testing requires the tree to actually appear in
  // LS placements after Grove bake.
  const rosterSpecies = onlySpecies
    ? [onlySpecies]
    : speciesToBuild.map(s => s.speciesId)
  const added = await syncLookRoster('lafayette-square', rosterSpecies)
  console.log(`[generate-salon] roster: added ${added} variant(s) to lafayette-square/design.json`)

  console.log('\n[generate-salon] done. Next:')
  console.log('  node arborist/bake-look.js  --look lafayette-square')
  console.log('  node arborist/bake-trees.js --look lafayette-square')
}

const invokedAsScript = (() => {
  try { return fileURLToPath(import.meta.url) === process.argv[1] }
  catch { return false }
})()
if (invokedAsScript) {
  main().catch(err => {
    console.error('[generate-salon] FAILED:', err)
    process.exit(1)
  })
}

// Surface unused — silence noisy linter false positive on the helper.
void chassisToBarkPrimSummary
void writeIfChanged
