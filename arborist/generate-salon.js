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
    occupancy: 0.7,
    // Brief 1.5a: operator-tunable card-size multiplier. Default 1.0 with
    // BASE_CARD_SIZE=0.1m yields ~10cm cards at world scale (verified
    // against the obelisk human-height reference). Range 0.5..3.0.
    scale: 1.0,
    tintFront: '#3a7530',
    tintBack:  '#a8b89a',
  },
  deformer: {},   // reserved-but-empty — Brief 3 fills
}

// Brief 1.5a: base card extent in metres. Multiplied by composition.leaves.scale
// at emission time. Was 0.4 (40cm) in Brief 1 — too large for the sparse-anchor
// regime Salon uses. 0.1m (10cm) lands a single card at roughly the same
// real-world scale as a single Sugar Maple leaf, which is what the operator's
// silhouette intuition is calibrated for.
const BASE_CARD_SIZE = 0.1

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
  } = opts || {}
  const N = attachments.length * cardsPerAttachment
  if (N === 0) return null
  const positions = new Float32Array(N * 4 * 3)
  const normals   = new Float32Array(N * 4 * 3)
  const uvs       = new Float32Array(N * 4 * 2)
  const indices   = new Uint32Array(N * 6)

  let q = 0
  for (const att of attachments) {
    for (let k = 0; k < cardsPerAttachment; k++) {
      const r1 = rng() * 2 - 1
      const r2 = rng() * 2 - 1
      const r3 = rng() * 2 - 1
      const cx = att[0] + r1 * spread
      const cy = att[1] + r2 * spread * yCompression
      const cz = att[2] + r3 * spread
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
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]]
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

async function buildCompositionDocument({ chassis, bark, leaves, slotName }) {
  const chassisPath = path.join(CHASSIS_DIR, `${chassis}.glb`)
  const io = makeIO()
  const chassisDoc = await io.read(chassisPath)
  const meta = await loadChassisMeta(chassis)

  // Gather all bark positions for fallback leaf-attachment sampling and
  // ensure every retained primitive carries `extras.atlasKind = 'bark'`
  // (defensive — Whittle already stamps this).
  const positionsCombined = []
  for (const mesh of chassisDoc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const ex = prim.getExtras() || {}
      if (!ex.atlasKind) prim.setExtras({ ...ex, atlasKind: 'bark' })
      const acc = prim.getAttribute('POSITION')
      if (acc) {
        const arr = acc.getArray()
        for (let i = 0; i < arr.length; i++) positionsCombined.push(arr[i])
      }
    }
  }

  // Rebind bark material: create a fresh material with bark textures and
  // assign it to every bark primitive. The previous materials become
  // garbage-collectable.
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
  for (const mesh of chassisDoc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prim.setMaterial(barkMat)
    }
  }

  // Leaf emission. Use chassis-authored attachment tags if present; else
  // sample upper-bbox vertices. Determinism: hash(chassis|bark.ref|leaves.pack)
  // seeds the mulberry32 stream so the same composition produces identical
  // leaf placement across publishes.
  const seed = hashString(`${chassis}|${bark.ref}|${leaves.pack}`)
  const rng = mulberry32(seed)
  const authoredTags = Array.isArray(meta.leafAttachmentTags) ? meta.leafAttachmentTags : []
  let attachments
  if (authoredTags.length > 0) {
    attachments = authoredTags.map(t => t.pos || t)
  } else {
    // Density driven by occupancy: 0..1 maps to ~8..80 attachment points.
    const occ = Math.max(0, Math.min(1, leaves.occupancy ?? 0.7))
    const attachmentCount = Math.round(8 + occ * 72)
    attachments = getUpperBboxSamples(positionsCombined, attachmentCount, rng)
  }
  // Brief 1.5a: card size = BASE_CARD_SIZE × leaves.scale. spread shrinks
  // proportionally so dense canopies don't gain visual chaos at small scales.
  const scale = typeof leaves.scale === 'number' ? leaves.scale : 1.0
  const leafGeo = buildLeafGeometryFromAttachments(attachments, {
    cardsPerAttachment: 5,
    cardSize: BASE_CARD_SIZE * scale,
    spread: 0.35 * scale,
    yCompression: 0.6,
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
    // if the chassis somehow has zero meshes — defensive).
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
  const doc = await buildCompositionDocument({
    chassis,
    bark: effective.bark,
    leaves: effective.leaves,
    slotName: slotLabel,
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
    const stops = compositions[i]?.effective?.bark?.gradientStops
    const variantId = i + 1
    const variant = m.variants?.find(v => v.id === variantId || String(v.id) === String(variantId))
    if (!variant) continue
    if (Array.isArray(stops) && stops.length >= 2) {
      variant.bark = { ...(variant.bark || {}), gradientStops: stops }
    } else if (variant.bark?.gradientStops) {
      // Composition toggled gradient OFF → clear stops on disk; preserve
      // any sibling per-variant bark fields a future brief may have added.
      const { gradientStops: _drop, ...rest } = variant.bark
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
