#!/usr/bin/env node
// @scene-independent: LOOK-KEYED, AND IT REFUSES ON THAT AXIS. Publishing writes variants into
//   <look>/design.json, so the axis is --look; requireExplicitMap resolves the SCENE axis and
//   would demand a value this tool never uses. `requireLookArg` (in main) exits 2 when --look
//   is absent. ⛔ THAT REFUSAL REPLACED A HARDCODED `syncLookRoster('lafayette-square', …)`,
//   which edited LS's authoring SSoT whichever Look you were in — ruled a Class C bleed by
//   Jacob 2026-09-20 ("there is no reason for LS to be the fallback here EITHER"). If the
//   refusal is ever removed this exemption is void and the bleed is back.
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
import { promises as fs, default as fsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { smoothWeldBark } from './decimate-tree.mjs'
// ⛔ ONE resolver, shared with the readiness checks — never a second species→dossier
// mapping (salon ids like `maple_silver` reach `acer_saccharinum` only through it).
import { dossierForSalonSpecies, matureHeightFor } from './salon-options.js'

// Chassis GLBs (from Whittle's survey-deleaf.js) preserve vendor source
// extensions including EXT_texture_webp; matching ALL_EXTENSIONS registration
// is required to read them. Mirror the pattern survey-deleaf.js + publish-glb.js use.
function makeIO() { return new NodeIO().registerExtensions(ALL_EXTENSIONS) }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CHASSIS_DIR = path.join(REPO_ROOT, 'public/trees/_chassis')
const PART_INDEX_PATH = path.join(REPO_ROOT, 'arborist/state/part-index.json')
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

/**
 * The composition RNG seed. Exported so a check can call the real thing instead of
 * restating the formula (a check that copies its subject cannot catch its subject
 * drifting). `chassisAsset` is the resolved GLB basename — see the call site for why
 * it is the asset and not the chassis identity.
 */
export function compositionSeed({ chassisAsset, bark, leaves }) {
  return hashString(`${chassisAsset}|${bark?.ref}|${leaves?.pack}`)
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
    // Leaf source: 'authored' = the chassis's own vendor-baked leaves, retextured
    // (Ways/size N/A); 'synthesized' = the kit spray (pack + Ways + leaf.size).
    // Default authored (no regression); de-leafed chassis are always synthesized.
    mode: 'authored',
    // §5 Leaf Ways — the attach/orient grammar: alternate (default scatter) ·
    // opposite (maple/ash pairs) · all-one-direction (willow droop) · sprays
    // (compound fronds) · clusters (ginkgo fans). Seeded from the dossier's
    // required["leaf.ways"]; operator-overridable.
    ways: 'alternate',
    tintFront: '#3a7530',
    tintBack:  '#a8b89a',
  },
  // Brief 3A (Cant): per-instance procedural-fill deformer. `range` carries
  // three [lo,hi] pairs sampled per-instance by a world-XZ hash in the vertex
  // shader: `lean`/`twist` in RADIANS (tilt-toward-azimuth + about-Y, angle
  // grows base→top), `wander` in METRES (sinusoidal XZ drift along height).
  // Empty (or all-zero ranges) → identity (no deformation; regression-safe).
  // Runtime-only: applied as per-draw uniforms, nothing baked into GLB/atlas.
  // (3B = designed slots/PlaceCard binding; 3C = canopy asymmetry/branch jitter.)
  deformer: {},   // { range?: { lean:[lo,hi], twist:[lo,hi], wander:[lo,hi] } }
  // Brief 19 (Quartz): authored chassis transform (Salon gizmo → bake).
  // Identity = no-op. `rotation` is [tiltX, rotationY, tiltZ] radians in the
  // gizmo's Euler XYZ order; `scale` is uniform. Applied LIVE by the viewport
  // gizmo at preview; BAKED into the published geometry at publish
  // (writeMultiCompositionGLB → buildCompositionDocument), so the chassis
  // ships oriented/placed/scaled exactly as the operator authored it.
  // No scale: a tree's size is its species' mature height (publish-glb normalizeScale). The
  // gizmo's scale was retired 2026-09-28 — publish re-normalised it away, so it only misled.
  transform: { posOffset: [0, 0, 0], rotation: [0, 0, 0] },
}

// ── leaf.size derivation (§2.3) ──────────────────────────────────────────
// Each card is a leaf-CLUSTER, not a single leaf (operator 2026-05-22, the
// 30.7m Linden: single 10cm leaves vanish into pinpoints on mature chassis —
// clusters are the right granularity). The OLD `BASE_CARD_SIZE = 0.5` × scale
// was UNIFORM across species + tree size (Espalier §3.1 bug): the same cluster
// on a 30m Linden and an 8m ornamental. Now the cluster scales with the
// chassis canopy radius AND the species' natural leaf size, floored so it never
// vanishes and capped so it never reads absurd. Knobs are EYE-TUNABLE.
//   cardSize = clamp( canopyR × FRAC × leafFactor × multiplier, FLOOR, CAP )
// Calibrated so a ~4.5m-radius mature maple lands ≈ the old 0.5m (no regression).
const LEAF_CLUSTER_FRAC   = 0.11   // cluster size as a fraction of canopy radius
const LEAF_NATURAL_REF_CM = 12     // reference leaf; bigger/smaller species nudge the cluster (sqrt-damped)
const LEAF_SIZE_FLOOR_M   = 0.12   // absolute floor — a real leaf; never vanish
const LEAF_SIZE_CAP_M     = 0.90   // absolute cap — never absurd
const LEAF_MULT_MIN = 0.4, LEAF_MULT_MAX = 2.5   // operator slider = bounded multiplier (§2.3; matches the Salon Leaf-size range)

// Canopy radius (m) from a flat [x,y,z,…] vertex array. Chassis is recentered to
// trunk-base at origin (Brief 20), so hypot(x,z) from the axis IS the radius.
function canopyRadiusFromPositions(p) {
  let maxR = 0
  for (let i = 0; i < p.length; i += 3) { const r = Math.hypot(p[i], p[i + 2]); if (r > maxR) maxR = r }
  return maxR
}
// Derive the per-card cluster size for a chassis + leaf pack.
function deriveLeafCardSize(positionsCombined, packMeta, scale) {
  const mult = Math.max(LEAF_MULT_MIN, Math.min(LEAF_MULT_MAX, typeof scale === 'number' ? scale : 1.0))
  const naturalCm = packMeta?.naturalSize || LEAF_NATURAL_REF_CM
  const leafFactor = Math.max(0.7, Math.min(1.6, Math.sqrt(naturalCm / LEAF_NATURAL_REF_CM)))
  const canopyR = canopyRadiusFromPositions(positionsCombined) || 3.0
  const raw = canopyR * LEAF_CLUSTER_FRAC * leafFactor * mult
  return Math.max(LEAF_SIZE_FLOOR_M, Math.min(LEAF_SIZE_CAP_M, raw))
}

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
        woodCoverage: meta.woodCoverage ?? null,   // wood Y-span / tree Y-span; <~0.65 = stub wood (leaves-first vendor proxy)
      })
    } catch { /* skip malformed */ }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

async function loadChassisMeta(chassisName) {
  // Same identity-then-provenance resolution as the GLB — the sidecar sits beside it and
  // is named the same way, so it must be found the same way. Missing this was the second
  // half of the same bug and it failed one line later.
  const p = resolveChassisPath(chassisName).replace(/\.glb$/, '.meta.json')
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

// Brief 23 (Mistral, 2026-05-25): single-mesh FOREST chassis (group shots — one
// merged mesh holding 11–57 trunks, never auto-split because Riven's detector is
// root-based) are suppressed from the Salon catalog until Brief 23a splits them
// into per-tree singles. The list is producer-derived by survey-deleaf.js at
// `state/_chassis-forests.json`; returns a Set of chassis stems (no `.glb`).
export async function listForestChassis() {
  try {
    const data = JSON.parse(await fs.readFile(path.join(STATE_ROOT, '_chassis-forests.json'), 'utf8'))
    return new Set(Object.keys(data?.forests || {}).map(k => k.replace(/\.glb$/, '')))
  } catch { return new Set() }
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
    for (const e of entries) if (e.isDirectory()) {
      // A generated pack carries one-leaf `thumb.png` + `quality: 'procedural'`: the plate shows ONE leaf
      // (its variants, seasons and age are the generator's business, not the picker's).
      let meta = {}; try { meta = JSON.parse(await fs.readFile(path.join(LEAF_SHAPES_DIR_NEW, e.name, 'meta.json'), 'utf8')) } catch { /* scanned/vendor packs may have none */ }
      out.push({ packId: e.name, kind: 'dir', quality: meta.quality || null, thumb: meta.channels?.thumb || 'shape.png' })
    }
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
    // `stalk`: where the leaf's stalk END sits in each cell (glTF UV, v down). Declared by a
    // generated pack (leaf-generator.mjs); a scanned/vendor pack without it keeps the vendor's
    // own orientation on the card.
    const stalk = Array.isArray(m.stalk) && m.stalk.length === 2 ? m.stalk : null
    // `cellMetres` + `source.dossier`: a generated pack knows its real size and whose twigs it hangs on.
    return { tileGrid: grid, stalk, normal: m.channels?.normal || null, cellMetres: Array.isArray(m.cellMetres) ? m.cellMetres : null, dossier: m.source?.dossier || null }
  } catch {
    return { tileGrid: [1, 1], stalk: null, normal: null, cellMetres: null, dossier: null }
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
// A1 (2026-06-25) — deformer ranges are MORPHOLOGY-DERIVED, not per-species
// authored. The Salon DeformerPanel is retired (SALON-INTERFACE.md §3-B/§4):
// per-instance lean/twist/wander variation is now a single automatic default
// keyed on the chassis meta `morphology` (broadleaf | conifer | columnar |
// weeping; the real 4-value vocabulary in public/trees/_chassis/*.meta.json).
// This table is THE knob — tune magnitudes here (eye-gate pending). lean/twist
// in radians (angle grows base→top), wander in metres. Identity-safe: an old
// composition that still carries an authored `deformer.range` overrides this
// (back-compat). Mirrors the per-morphology default model of
// spaceColonization.js#DEFAULT_SCA_BY_PRESET. Consumed only at runtime (per-draw
// uniforms via deformerBySpecies → applyDeformerUniforms; nothing baked).
const DEFORMER_BY_MORPHOLOGY = {
  broadleaf: { lean: [0, 0.08],  twist: [0, 0.10],  wander: [0, 0.15] },
  weeping:   { lean: [0, 0.10],  twist: [0, 0.14],  wander: [0, 0.30] },
  columnar:  { lean: [0, 0.03],  twist: [0, 0.05],  wander: [0, 0.06] },
  conifer:   { lean: [0, 0.025], twist: [0, 0.035], wander: [0, 0.05] },
}
const DEFORMER_DEFAULT = DEFORMER_BY_MORPHOLOGY.broadleaf
function deformerForMorphology(morphology) {
  return { range: DEFORMER_BY_MORPHOLOGY[morphology] || DEFORMER_DEFAULT }
}

// ── leaf.face — the paler UNDERSIDE, resolved from the species DOSSIER ────────
// Second instance of the rubric-forward rule (author coordinates, resolve parts),
// after DEFORMER_BY_MORPHOLOGY above: the machine pours the axis from the dossier
// and ⭐ THE OPERATOR MAY OVERRIDE ANY OF IT through the Salon's leaf tints.
//
// ⛔ STRENGTH IS DOSSIER-ONLY UNLESS THE OPERATOR SETS IT, AND THAT IS DELIBERATE.
// `tintFront`/`tintBack` carry NON-NULL DEFAULTS on every composition ever made
// (DEFAULTS.leaves below, and the client store's) — so "the composition has tints"
// does NOT mean an operator chose them. Keying the effect off those defaults would
// silently give all 34 species a pale-green underside nobody authored. The colours
// are overridable; the DECISION TO HAVE THE EFFECT AT ALL comes from a dossier axis
// a human wrote, or from an explicit `leaves.faceStrength`.
const FACE_STRENGTH = { none: 0, mild: 0.45, strong: 1 }
function faceFromDossier(species) {
  if (!species) return null
  let d = null
  try { d = dossierForSalonSpecies(species) } catch { return null }
  const f = d?.required?.['leaf.face'] || d?.optional?.['leaf.face']
  if (!f?.front || !f?.back) return null
  const strength = typeof f.strength === 'number' ? f.strength : FACE_STRENGTH[f.strength]
  if (!(strength > 0)) return { front: f.front, back: f.back, strength: 0 }
  return { front: f.front, back: f.back, strength }
}
// ⛔⛔ TAKES THE **RAW** COMPOSITION, NOT THE MERGED ONE, AND THAT IS THE WHOLE TRICK.
// `merged` has already absorbed DEFAULTS.leaves, whose tints are non-null on every
// composition ever made — so reading tints off it means the generic #3a7530 beats the
// dossier's authored #5A8C4A and the axis silently resolves to a default nobody wrote.
// (Measured: it did exactly that on the first run of this code.) The RAW composition
// carries only what a human actually set, which is what an override means.
// Precedence, top wins:  operator's explicit part  >  the species dossier  >  the generic default.
function resolveFace(species, rawLeaves, mergedLeaves) {
  const base = faceFromDossier(species)
  const override = typeof rawLeaves?.faceStrength === 'number' ? rawLeaves.faceStrength : null
  const strength = override !== null ? override : (base?.strength ?? 0)
  if (!(strength > 0)) return { front: null, back: null, strength: 0 }
  const front = rawLeaves?.tintFront || base?.front || mergedLeaves?.tintFront || null
  const back  = rawLeaves?.tintBack  || base?.back  || mergedLeaves?.tintBack  || null
  // ⛔ Strength with no pair to interpolate is a control that does nothing. Say 0.
  if (!front || !back) return { front: null, back: null, strength: 0 }
  return { front, back, strength }
}

// patches into both `params` and `effective` in the store so changes reflect
// without a server round-trip (per the procedural-mode pattern).
function resolveEffective(composition, chassisMeta, species = null) {
  const chassisDefaults = (chassisMeta && chassisMeta.defaults) || {}
  return {
    chassis: composition.chassis || null,
    bark: {
      ...DEFAULTS.bark,
      ...(chassisDefaults.bark || {}),
      ...(composition.bark || {}),
    },
    leaves: (() => {
      const merged = {
        ...DEFAULTS.leaves,
        ...(chassisDefaults.leaves || {}),
        ...(composition.leaves || {}),
      }
      // `face` is DERIVED, never authored as a blob — the operator authors its
      // parts (tintFront / tintBack / faceStrength) and this resolves them.
      // ⭐ The resolved pair is written BACK onto the effective tints, so the Salon's
      // colour pickers show the colour actually in use (the dossier's, until the
      // operator overrides it) rather than a default the render is not using.
      const face = resolveFace(species, composition.leaves || {}, merged)
      return {
        ...merged,
        tintFront: face.front || merged.tintFront,
        tintBack: face.back || merged.tintBack,
        face,
      }
    })(),
    deformer: {
      ...DEFAULTS.deformer,
      ...deformerForMorphology(chassisMeta && chassisMeta.morphology),
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
      ...(c.derivedFrom ? { derivedFrom: c.derivedFrom } : {}),
      ...(c.auto ? { auto: c.auto } : {}),
      effective: resolveEffective(c, meta, species),
    })
  }
  return out
}

// POST merges with absent-keys-preserved per
// `feedback_absence_means_inherit_in_authored_blocks`: if the incoming
// composition leaves a key off entirely, the prior value of that slot is preserved
// (rather than wiped to `undefined`). This is the behavior the workstage
// wants — partial patches don't destroy adjacent state.
// ⛔ That includes keys the workstage never sends: `derivedFrom` (the form rename's
// provenance) and `auto` (a system build's per-plate picks). Until 2026-09-25 this
// rebuilt each slot from a fixed field list, so ANY Salon edit erased both.
// ▶ checks/claims-a-salon-save-keeps-provenance.mjs
const DERIVED_KEYS = new Set(['effective'])   // computed on read, never persisted
export async function writeCompositions(species, compositions) {
  const stateDir = path.dirname(compositionsStatePath(species))
  await fs.mkdir(stateDir, { recursive: true })
  const prior = new Map((await readOverlay(species)).map(c => [c.slot, c]))
  const sanitized = compositions.map(c => {
    const p = prior.get(c.slot) || {}
    const has = (k) => c[k] !== undefined
    const merged = { ...p }
    for (const [k, v] of Object.entries(c)) if (v !== undefined && !DERIVED_KEYS.has(k)) merged[k] = v
    return {
      ...merged,
      slot: c.slot,
      name: (has('name') ? c.name : p.name) || `Slot ${c.slot}`,
      chassis: (has('chassis') ? c.chassis : p.chassis) || null,
      bark:    (has('bark') ? c.bark : p.bark) || {},
      leaves:  (has('leaves') ? c.leaves : p.leaves) || {},
      deformer: (has('deformer') ? c.deformer : p.deformer) || {},
      transform: (has('transform') ? c.transform : p.transform) || {},
    }
  })
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
  // Sample `count` attachment points across the whole CROWN — the branch shell —
  // not just the upper 40% of the bbox. The old upper-40% band left the wide
  // LOWER branches bare (the upper-blob bug). canopyStart is usually null on
  // stock chassis, so we infer the crown geometrically: wood verts with
  // meaningful XZ radius (i.e. branches, NOT the central trunk column) above the
  // bare lower trunk. Falls back to the upper band only if no crown is found.
  if (allPositions.length === 0) return []
  let minY = Infinity, maxY = -Infinity, maxR = 0
  for (let i = 0; i < allPositions.length; i += 3) {
    const y = allPositions[i + 1]
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    const r = Math.hypot(allPositions[i], allPositions[i + 2])
    if (r > maxR) maxR = r
  }
  const range = (maxY - minY) || 1
  const yFloor = minY + range * 0.18   // skip the bare lower trunk
  const rFloor = maxR * 0.10           // skip the central trunk column → branches only
  const crown = []
  const upperBand = []
  const yUpper = minY + range * 0.6
  for (let i = 0; i < allPositions.length; i += 3) {
    const x = allPositions[i], y = allPositions[i + 1], z = allPositions[i + 2]
    if (y >= yFloor && Math.hypot(x, z) >= rFloor) crown.push([x, y, z])
    if (y >= yUpper) upperBand.push([x, y, z])
  }
  const pool = crown.length >= 8 ? crown : upperBand
  if (pool.length === 0) return []
  const out = []
  for (let k = 0; k < count; k++) {
    out.push(pool[Math.floor(seedR() * pool.length) % pool.length])
  }
  return out
}

// Anchored synthesis (operator 2026-06-23): sample `count` attachment points
// directly from the chassis's OWN vendor leaf vertices — so synthesized cards
// land where the model actually has foliage (its real placement + density),
// not at random bbox-crown samples that "blob in irrelevantly". Used in the
// synthesized path whenever the chassis shipped vendor leaves; falls back to
// getUpperBboxSamples only for truly de-leafed (LiDAR/wood-only) chassis.
function sampleLeafAnchors(flatLeafPositions, count, rng) {
  const n = flatLeafPositions.length / 3
  if (n === 0) return []
  const out = []
  for (let k = 0; k < count; k++) {
    const i = Math.floor(rng() * n) % n
    out.push([flatLeafPositions[i * 3], flatLeafPositions[i * 3 + 1], flatLeafPositions[i * 3 + 2]])
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
    ways = 'alternate',  // §5 Leaf Ways — the per-card ATTACH/ORIENT grammar
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
    const biasMag = inwardBias * spread
    const outwardYaw = Math.atan2(att[0], att[2])      // faces away from the trunk axis
    const outX = Math.sin(outwardYaw), outZ = Math.cos(outwardYaw)
    for (let k = 0; k < cardsPerAttachment; k++) {
      // §5 Leaf Ways — the orientation/grouping grammar layered over the anchor.
      // 'alternate' is the default cloud-scatter (unchanged distribution).
      let cx, cy, cz, sx, sy, yaw, pitch
      if (ways === 'all-one-direction') {              // willow — drooping curtain
        cx = att[0] + (rng() * 2 - 1) * spread * 0.5 + inwardX * biasMag
        cy = att[1] - rng() * spread * 1.4 * yCompression
        cz = att[2] + (rng() * 2 - 1) * spread * 0.5 + inwardZ * biasMag
        sx = cardSize * (0.55 + rng() * 0.35); sy = cardSize * (1.1 + rng() * 0.7)
        yaw = outwardYaw + (rng() - 0.5) * 0.5
        pitch = -0.9 - rng() * 0.5
      } else if (ways === 'sprays') {                  // compound fronds — leaflets along an axis
        const t = cardsPerAttachment > 1 ? k / (cardsPerAttachment - 1) : 0.5
        const along = (t - 0.5) * spread * 3
        cx = att[0] + outX * along + inwardX * biasMag
        cy = att[1] + (rng() - 0.5) * spread * 0.4 * yCompression - t * spread * 0.3
        cz = att[2] + outZ * along + inwardZ * biasMag
        sx = cardSize * (0.45 + rng() * 0.3); sy = cardSize * (0.6 + rng() * 0.3)
        yaw = outwardYaw + Math.PI / 2 + (rng() - 0.5) * 0.3
        pitch = (k % 2 ? 1 : -1) * 0.4
      } else if (ways === 'clusters') {                // ginkgo — tight fan on spur shoots
        cx = att[0] + (rng() * 2 - 1) * spread * 0.25 + inwardX * biasMag
        cy = att[1] + (rng() * 2 - 1) * spread * 0.25 * yCompression
        cz = att[2] + (rng() * 2 - 1) * spread * 0.25 + inwardZ * biasMag
        sx = cardSize * (0.7 + rng() * 0.5); sy = cardSize * (0.7 + rng() * 0.5)
        yaw = outwardYaw + (k / cardsPerAttachment) * 1.2 - 0.6
        pitch = 0.2 + (rng() - 0.5) * 0.3
      } else if (ways === 'opposite') {                // maple/ash — paired across the twig
        const side = (k % 2) ? 0 : Math.PI
        cx = att[0] + (rng() * 2 - 1) * spread * 0.7 + inwardX * biasMag
        cy = att[1] + (rng() * 2 - 1) * spread * 0.5 * yCompression
        cz = att[2] + (rng() * 2 - 1) * spread * 0.7 + inwardZ * biasMag
        sx = cardSize * (0.7 + rng() * 0.5); sy = cardSize * (0.7 + rng() * 0.5)
        yaw = outwardYaw + side + (rng() - 0.5) * 0.3
        pitch = (rng() - 0.5) * 0.4
      } else {                                         // alternate (default) — scatter, unchanged
        const r1 = rng() * 2 - 1, r2 = rng() * 2 - 1, r3 = rng() * 2 - 1
        cx = att[0] + r1 * spread + inwardX * biasMag
        cy = att[1] + r2 * spread * yCompression
        cz = att[2] + r3 * spread + inwardZ * biasMag
        sx = cardSize * (0.7 + rng() * 0.6); sy = cardSize * (0.7 + rng() * 0.6)
        yaw = rng() * TAU; pitch = (rng() - 0.5) * 0.7
      }
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

// One leaf = one CONNECTED COMPONENT of a leaf primitive (union-find over triangle
// verts). Every vendor leaf topology splits this way — independent quad cards (4 verts,
// 2 tris sharing an edge), triangle cards, sculpted multi-vertex leaves — so nothing
// downstream has to guess the topology. Returns the root id of every vertex.
function leafComponents(prim) {
  const posAttr = prim.getAttribute('POSITION')
  const idxAcc = prim.getIndices()
  if (!posAttr || !idxAcc) return null
  const vc = posAttr.getCount()
  const idx = idxAcc.getArray()
  const par = new Int32Array(vc)
  for (let i = 0; i < vc; i++) par[i] = i
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x] } return x }
  const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) par[ra] = rb }
  for (let i = 0; i + 2 < idx.length; i += 3) { uni(idx[i], idx[i + 1]); uni(idx[i + 1], idx[i + 2]) }
  const root = new Int32Array(vc)
  for (let v = 0; v < vc; v++) root[v] = find(v)
  return root
}

// Re-skin a vendor leaf primitive with the picked pack: EACH LEAF gets its own random
// pack cell, its vendor UV rect fitted into that cell. Orientation within the rect is
// the vendor's. Pack-local UVs — atlas-survey remaps onto the master atlas at bake
// (`feedback_atlas_subregion_uv_recovery`). `rng` is the per-composition mulberry32
// stream, drawn once per leaf in first-vertex order, so re-runs are byte-identical.
//
// ⛔ REPLACED 2026-09-28: a topology guess (`maxUse === 1` ⇒ cards) routed every real
// quad-card chassis (whose two triangles share two verts, maxUse 2) to a whole-PRIM
// rescale, so an entire tree drew ONE pack cell and a pack's variety never showed.
function rewriteLeafPrimUVs(prim, packMeta, rng, doc, root, attach) {
  const uvAttr = prim.getAttribute('TEXCOORD_0')
  if (!uvAttr) return // missing UVs → skip per brief edge case
  const [cols, rows] = packMeta.tileGrid || [1, 1]
  if (cols < 1 || rows < 1) return
  if (!root) return
  const uvs = uvAttr.getArray()
  const vc = root.length
  // Per-leaf UV rect.
  const rect = new Map() // root → [minU, minV, maxU, maxV]
  for (let v = 0; v < vc; v++) {
    const u = uvs[v * 2], w = uvs[v * 2 + 1]
    let r = rect.get(root[v])
    if (!r) { r = [u, w, u, w]; rect.set(root[v], r); continue }
    if (u < r[0]) r[0] = u; if (w < r[1]) r[1] = w
    if (u > r[2]) r[2] = u; if (w > r[3]) r[3] = w
  }
  // One cell per leaf, drawn in first-vertex order (Map preserves insertion order).
  const tileW = 1 / cols, tileH = 1 / rows
  const cell = new Map()
  for (const k of rect.keys()) {
    cell.set(k, [Math.floor(rng() * cols) * tileW, Math.floor(rng() * rows) * tileH])
  }
  // ⭐ STALK TO TWIG. When the pack declares where its stalk ends, each leaf is turned (a
  // quarter-turn at a time — a rotation, never a mirror) so that edge of the picture lands on
  // the edge of its card nearest the wood. Without it the picture keeps the vendor card's
  // orientation, whose stalk may point anywhere (about half of red maple's pointed away).
  const turn = new Map()
  if (packMeta.stalk && attach) {
    const stalkEdge = nearestEdge(packMeta.stalk[0], packMeta.stalk[1])
    for (const [k, v] of attach) {
      const r = rect.get(k); const du = r[2] - r[0], dv = r[3] - r[1]
      if (!(du > 1e-6 && dv > 1e-6)) continue
      const woodEdge = nearestEdge((uvs[v * 2] - r[0]) / du, (uvs[v * 2 + 1] - r[1]) / dv)
      turn.set(k, (woodEdge - stalkEdge + 4) % 4)
    }
  }
  const out = new Float32Array(uvs.length)
  for (let v = 0; v < vc; v++) {
    const r = rect.get(root[v]), c = cell.get(root[v])
    const du = r[2] - r[0], dv = r[3] - r[1]
    // A degenerate rect (all verts share one UV) samples the cell centre, not a corner.
    let a = du > 1e-6 ? (uvs[v * 2] - r[0]) / du : 0.5
    let b = dv > 1e-6 ? (uvs[v * 2 + 1] - r[1]) / dv : 0.5
    ;[a, b] = rotateInCell(a, b, turn.get(root[v]) || 0)
    out[v * 2]     = c[0] + a * tileW
    out[v * 2 + 1] = c[1] + b * tileH
  }
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(out))
}

// A leaf with no UVs gets them from its own shape: each leaf is flattened onto its best-fit
// plane (its two widest directions). rewriteLeafPrimUVs then fits that rect into a pack cell
// and turns it stalk-to-wood, exactly as for a vendor card.
function projectLeafUVs(prim, root, doc) {
  const pos = prim.getAttribute('POSITION').getArray()
  const members = new Map()
  for (let v = 0; v < root.length; v++) { let a = members.get(root[v]); if (!a) members.set(root[v], a = []); a.push(v) }
  const uv = new Float32Array(root.length * 2).fill(0.5)
  for (const vs of members.values()) {
    if (vs.length < 3) continue
    let c = [0, 0, 0]; for (const v of vs) for (let k = 0; k < 3; k++) c[k] += pos[v * 3 + k] / vs.length
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for (const v of vs) { const d = [pos[v * 3] - c[0], pos[v * 3 + 1] - c[1], pos[v * 3 + 2] - c[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j] }
    // the two widest directions: power iteration, then again with the first removed
    const top = (M, not) => {
      let x = [1, 0.7, 0.3]
      for (let it = 0; it < 24; it++) {
        let y = [0, 1, 2].map(i => M[i][0] * x[0] + M[i][1] * x[1] + M[i][2] * x[2])
        if (not) { const dp = y[0] * not[0] + y[1] * not[1] + y[2] * not[2]; y = y.map((q, i) => q - dp * not[i]) }
        const n = Math.hypot(...y) || 1; x = y.map(q => q / n)
      }
      return x
    }
    const e1 = top(C, null), e2 = top(C, e1)
    for (const v of vs) {
      const d = [pos[v * 3] - c[0], pos[v * 3 + 1] - c[1], pos[v * 3 + 2] - c[2]]
      uv[v * 2] = d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2]
      uv[v * 2 + 1] = d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2]
    }
  }
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv))
}

// Edges of a unit cell, numbered clockwise in UV (v down): 0 top, 1 right, 2 bottom, 3 left.
function nearestEdge(a, b) {
  const d = [b, 1 - a, 1 - b, a]
  let best = 0; for (let i = 1; i < 4; i++) if (d[i] < d[best]) best = i
  return best
}
// Card-local (a,b) → where to sample the picture, turned k quarter-turns clockwise so the
// picture's edge e lands on card edge (e + k) mod 4.
function rotateInCell(a, b, k) {
  switch (k) {
    case 1: return [b, 1 - a]
    case 2: return [1 - a, 1 - b]
    case 3: return [1 - b, a]
    default: return [a, b]
  }
}

// A spatial hash over the wood's vertices: the nearest wood to any point — its distance² and the
// wood vertex itself, so a twig can start ON the wood.
function woodProximity(barkPositions) {
  if (!barkPositions.length) return null
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < barkPositions.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], barkPositions[i + c]); hi[c] = Math.max(hi[c], barkPositions[i + c]) }
  const cell = Math.max(1e-3, Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 100)
  const grid = new Map()
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  for (let i = 0; i < barkPositions.length; i += 3) {
    const k = key(barkPositions[i], barkPositions[i + 1], barkPositions[i + 2])
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i)
  }
  // Search shells of cells outward until the nearest wood is certainly found — a shell at ring R
  // can only hold points ≥ (R−1)·cell away — or MAX_RING is reached (∞: genuinely far from wood).
  const MAX_RING = 12
  return (x, y, z) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell)
    let best = Infinity, at = -1
    for (let R = 0; R <= MAX_RING; R++) {
      if (best < ((R - 1) * cell) ** 2) break
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== R) continue
        const a = grid.get(`${cx + i},${cy + j},${cz + k}`); if (!a) continue
        for (const o of a) { const d = (barkPositions[o] - x) ** 2 + (barkPositions[o + 1] - y) ** 2 + (barkPositions[o + 2] - z) ** 2; if (d < best) { best = d; at = o } }
      }
    }
    return [best, at]   // distance², and the wood vertex's offset into barkPositions
  }
}
// Each leaf's attach vertex = its vertex nearest the wood. A leaf with no wood within reach has
// none, and keeps its vendor orientation and centroid pivot.
function leafAttachVertices(prim, root, nearWood) {
  if (!root || !nearWood) return null
  const pos = prim.getAttribute('POSITION').getArray()
  const best = new Map() // root → [dist², vertex]
  for (let v = 0; v < root.length; v++) {
    const [d] = nearWood(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
    if (!Number.isFinite(d)) continue
    const b = best.get(root[v]); if (!b || d < b[0]) best.set(root[v], [d, v])
  }
  const out = new Map(); for (const [k, [, v]] of best) out.set(k, v)
  return out
}

// Leaf size on the AUTHORED/natural-leaf path (operator 2026-06-23): resize
// the model's OWN leaves in place — keep their authored placement, stem
// attachment, and UVs, just grow/shrink each leaf. scale=1 is the shipped
// size; <1 shrinks, >1 enlarges.
//
// Works on ANY leaf topology by scaling each CONNECTED COMPONENT (= one leaf)
// about its own centroid. Union-find over triangle vertices groups a leaf's
// verts regardless of whether the prim is independent quad cards (maple,
// 4 verts/leaf) or a connected sculpted mesh (blackgum, ~5–8 verts/leaf) —
// verified: every species splits into thousands of small components, never
// one blob, so this never moves leaves around, only resizes them.
function scaleLeafCardsInPlace(prim, scale, doc, root = leafComponents(prim), attach = null) {
  if (!(scale > 0) || Math.abs(scale - 1) < 1e-4) return
  const posAttr = prim.getAttribute('POSITION')
  if (!posAttr || !root) return
  const pos = posAttr.getArray()
  const vc = pos.length / 3
  // Pivot per leaf: its ATTACH vertex when known (it grows from the twig), else its centroid.
  const pivot = new Map() // root → [x, y, z, count]
  for (let v = 0; v < vc; v++) {
    const r = root[v]
    let s = pivot.get(r); if (!s) { s = [0, 0, 0, 0]; pivot.set(r, s) }
    s[0] += pos[v * 3]; s[1] += pos[v * 3 + 1]; s[2] += pos[v * 3 + 2]; s[3]++
  }
  for (const [r, s] of pivot) {
    const a = attach?.get(r)
    if (a != null) { s[0] = pos[a * 3]; s[1] = pos[a * 3 + 1]; s[2] = pos[a * 3 + 2]; s[3] = 1 }
  }
  const out = new Float32Array(pos.length)
  for (let v = 0; v < vc; v++) {
    const s = pivot.get(root[v])
    const cx = s[0] / s[3], cy = s[1] / s[3], cz = s[2] / s[3]
    out[v * 3]     = cx + (pos[v * 3]     - cx) * scale
    out[v * 3 + 1] = cy + (pos[v * 3 + 1] - cy) * scale
    out[v * 3 + 2] = cz + (pos[v * 3 + 2] - cz) * scale
  }
  const acc = doc.createAccessor().setType('VEC3').setArray(out).setBuffer(posAttr.getBuffer())
  prim.setAttribute('POSITION', acc)
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
  return po[0] === 0 && po[1] === 0 && po[2] === 0
    && rot[0] === 0 && rot[1] === 0 && rot[2] === 0
}

// Bake the authored transform into every prim's POSITION + NORMAL. No-op
// (geometry untouched → byte-identical) for identity authoring.
function bakeAuthoredTransform(doc, transform) {
  if (isIdentityTransform(transform)) return
  const po  = Array.isArray(transform.posOffset) ? transform.posOffset : [0, 0, 0]
  const rot = Array.isArray(transform.rotation)  ? transform.rotation  : [0, 0, 0]
  const pivot = computeAutoCenterPivot(doc)
  // T_autocenter centers the trunk base on the origin (centerX=-x, ground=
  // -minY, centerZ=-z), exactly as the viewport's <Skeleton> inner group.
  const Tc    = pivot ? mat4Translate(-pivot.x, -pivot.minY, -pivot.z) : mat4Translate(0, 0, 0)
  const TcInv = pivot ? mat4Translate( pivot.x,  pivot.minY,  pivot.z) : mat4Translate(0, 0, 0)
  const Toff  = mat4Translate(po[0], po[1], po[2])
  const R     = eulerXYZToMat4(rot[0], rot[1], rot[2])

  // M = TcInv · R · Toff · Tc   (compose inner→outer)
  let m = Tc
  m = mat4Mul(Toff, m)
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

/**
 * ⭐⭐ A CHASSIS ID IS AN IDENTITY; THE FILE ON DISK KEEPS ITS ORIGINAL NAME.
 * Chassis were renamed to FORMS on 2026-08-25 (`red_maple_c` → `oval_28`) so a chassis
 * stops claiming to be a species and correct compositions stop reading as mistakes. The
 * 1.8 GB of GLBs under public/trees/_chassis are GIT-IGNORED and therefore unrecoverable,
 * so renaming them would risk assets that cannot be restored — and it is unnecessary:
 * `derivedFrom` on the part IS the filename. Identity and path are two different facts.
 * ⛔ Resolve by identity first, then by provenance, and FAIL LOUDLY naming both if neither
 * exists — never silently skip a chassis, which would compose a tree with no trunk.
 */
export function resolveChassisPath(chassis) {
  const direct = path.join(CHASSIS_DIR, `${chassis}.glb`)
  if (fsSync.existsSync(direct)) return direct
  let derivedFrom = null
  try {
    const pi = JSON.parse(fsSync.readFileSync(PART_INDEX_PATH, 'utf8'))
    const rec = (pi.parts || []).find(p => p.partId === chassis)
    derivedFrom = rec?.derivedFrom || null
  } catch { /* no part index → nothing to map through */ }
  if (derivedFrom) {
    const viaProvenance = path.join(CHASSIS_DIR, `${derivedFrom}.glb`)
    if (fsSync.existsSync(viaProvenance)) return viaProvenance
  }
  throw new Error(
    `chassis "${chassis}" has no GLB — looked for ${path.basename(direct)}` +
    (derivedFrom ? ` and ${derivedFrom}.glb (its derivedFrom)` : ' and it records no derivedFrom') +
    ` in ${CHASSIS_DIR}`)
}

// ── THE TWIG LAYER ────────────────────────────────────────────────────────
// A generated leaf pack does not re-skin the chassis's leaf cards — it hangs its own leaves
// on drawn twigs, so SIZE (real metres), COUNT (the density knob) and PLACEMENT (the species'
// arrangement) come from the species, not from whoever modelled the chassis.
//   · SITES: where the chassis's own leaves meet its wood — the modeller's map of where foliage
//     lives — thinned on a grid whose spacing is the density knob (twigModel.site_spacing_m,
//     sparse→dense across occupancy 0→1). The vendor leaves are then dropped.
//   · TWIG: from the site, outward and a little up, curving toward the light; `pairs` nodes an
//     internode apart; thickness by the PIPE RULE — a segment's radius is the petiole radius ×
//     √(leaves it carries).
//   · LEAVES: at each node, per the dossier's leaf.arrangement — opposite pairs turning 90° node
//     to node (decussate), or one leaf per node on the golden angle (alternate). Each leaf is a
//     card whose stalk end (pack `stalk`) sits ON the node, at its cell's real size
//     (pack `cellMetres`) × the size knob, blade angled out from the twig and faced to the sky.
// ⛔ Throws when the species cannot be measured: no mature height, no twigModel, no arrangement.
function buildTwigLayer({ sites, packMeta, twig, arrangement, occupancy, scale, unitsPerMetre, rng }) {
  const U = unitsPerMetre
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] },
  }
  const draw = (r) => Array.isArray(r) ? r[0] + (r[1] - r[0]) * rng() : r
  const UP = [0, 1, 0]
  const rotAbout = (v, axis, ang) => { // Rodrigues
    const c = Math.cos(ang), s = Math.sin(ang), k = axis
    return v3.add(v3.add(v3.mul(v, c), v3.mul(v3.cross(k, v), s)), v3.mul(k, v3.dot(k, v) * (1 - c)))
  }
  const [cols, rows] = packMeta.tileGrid
  const L = { pos: [], nor: [], uv: [], idx: [] }   // leaves
  const T = { pos: [], nor: [], uv: [], idx: [] }   // twigs
  const opposite = arrangement === 'opposite' || arrangement === 'whorled'
  const perNode = opposite ? 2 : 1
  const GOLDEN = Math.PI * (3 - Math.sqrt(5))

  // thin the sites on the density grid
  const [sparse, dense] = twig.site_spacing_m
  const spacing = (sparse + (dense - sparse) * Math.max(0, Math.min(1, occupancy))) * U
  const kept = new Map()
  for (const s of sites) {
    const k = `${Math.floor(s.target[0] / spacing)},${Math.floor(s.target[1] / spacing)},${Math.floor(s.target[2] / spacing)}`
    if (!kept.has(k)) kept.set(k, s)
  }

  for (const site of kept.values()) {
    const pairs = Math.round(draw(twig.pairs))
    const internode = draw(twig.internode_m) * U
    let d = v3.norm(v3.add(site.out, v3.mul(UP, twig.twig_up)))
    let side = v3.norm(v3.cross(d, Math.abs(d[1]) > 0.95 ? [1, 0, 0] : UP))
    side = rotAbout(side, d, rng() * Math.PI)
    // A bare stem carries the shoot out toward its target; the leafy part clusters at the end,
    // as it does on a real shoot. Then nodes along a gently up-curving leafy length.
    const leafy = pairs * internode
    const stem = Math.max(0, (site.reach || 0) - leafy)
    const nodes = [site.at]
    let p = site.at
    if (stem > 0) { p = v3.add(p, v3.mul(d, stem)); nodes.push(p) }
    const first = nodes.length
    for (let i = 1; i <= pairs; i++) {
      d = v3.norm(v3.add(d, v3.mul(UP, twig.curve / pairs)))
      p = v3.add(p, v3.mul(d, internode))
      nodes.push(p)
    }
    const leafNodes = new Set(); for (let i = first; i < nodes.length; i++) leafNodes.add(i)
    const leafCount = pairs * perNode
    // twig tube: 5 sides, pipe-rule radius from the leaves each segment carries
    const base = T.pos.length / 3
    const SIDES = 5
    for (let i = 0; i < nodes.length; i++) {
      let carried = 0; for (const k of leafNodes) if (k > i || (k === i && i === nodes.length - 1)) carried += perNode
      carried = Math.max(1, carried)
      const r = twig.petiole_radius_m * Math.sqrt(carried) * U
      const dir = v3.norm(i < nodes.length - 1 ? v3.sub(nodes[i + 1], nodes[i]) : v3.sub(nodes[i], nodes[i - 1]))
      const a1 = v3.norm(v3.cross(dir, Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : UP)), a2 = v3.cross(dir, a1)
      for (let k = 0; k < SIDES; k++) {
        const ang = (k / SIDES) * 2 * Math.PI
        const n = v3.add(v3.mul(a1, Math.cos(ang)), v3.mul(a2, Math.sin(ang)))
        const q = v3.add(nodes[i], v3.mul(n, r))
        T.pos.push(...q); T.nor.push(...n); T.uv.push(k / SIDES, (i ? v3.dot(v3.sub(nodes[i], nodes[0]), dir) : 0) / (2 * Math.PI * r))
      }
    }
    for (let i = 0; i < nodes.length - 1; i++) for (let k = 0; k < SIDES; k++) {
      const a = base + i * SIDES + k, b = base + i * SIDES + (k + 1) % SIDES
      const c = a + SIDES, e = b + SIDES
      T.idx.push(a, c, b, b, c, e)
    }
    // leaves, from the tip back: node i carries `perNode` leaves
    for (const i of leafNodes) {
      const node = nodes[i]
      const tw = v3.norm(v3.sub(node, nodes[i - 1]))
      const turn = opposite ? (i % 2) * Math.PI / 2 : i * GOLDEN
      for (let j = 0; j < perNode; j++) {
        const around = rotAbout(side, tw, turn + j * Math.PI + (rng() - 0.5) * 0.3)
        const ang = draw(twig.leaf_angle_deg) * Math.PI / 180
        let b = v3.norm(v3.add(v3.mul(tw, Math.cos(ang)), v3.mul(around, Math.sin(ang))))
        b = v3.norm(v3.sub(b, v3.mul(UP, draw(twig.droop))))
        let n = v3.sub(UP, v3.mul(b, v3.dot(UP, b)))
        n = Math.hypot(...n) < 1e-3 ? around : v3.norm(n)
        n = rotAbout(n, b, (rng() - 0.5) * 2 * twig.tilt_deg * Math.PI / 180)
        const sv = v3.norm(v3.cross(b, n))
        const cell = Math.floor(rng() * cols * rows)
        const E = packMeta.cellMetres[cell] * scale * U
        const c0 = (cell % cols) / cols, r0 = Math.floor(cell / cols) / rows
        const [su, sv0] = packMeta.stalk
        const lb = L.pos.length / 3
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const q = v3.add(node, v3.add(v3.mul(sv, (u - su) * E), v3.mul(b, (sv0 - v) * E)))
          L.pos.push(...q); L.nor.push(...n); L.uv.push(c0 + u / cols, r0 + v / rows)
        }
        L.idx.push(lb, lb + 1, lb + 2, lb, lb + 2, lb + 3)
      }
    }
  }
  return { leaves: L, twigs: T, sites: kept.size, candidates: sites.length }
}

// Sites from the chassis's own leaves, then the twig layer in their place.
function hangTwigs({ chassisDoc, vendorLeafPrims, barkMat, leafMat, packMeta, leaves, species, chassis, positionsCombined, nearWood, rng }) {
  if (!species) throw new Error(`the "${leaves.pack}" pack hangs leaves at real size, which needs the species being composed — none was passed`)
  const mature = matureHeightFor(species)
  if (!(mature > 0)) throw new Error(`${species}: no mature height (dossier chassis.size or mature-heights.json) — the twig layer cannot tell how big a metre is`)
  const leafDossier = JSON.parse(fsSync.readFileSync(path.join(REPO_ROOT, packMeta.dossier), 'utf8'))
  const twig = leafDossier.twigModel
  const arrangement = leafDossier.required?.['leaf.arrangement']?.target
  if (!twig) throw new Error(`${packMeta.dossier}: no twigModel — the "${leaves.pack}" leaves have no shoot to hang on`)
  if (!arrangement) throw new Error(`${packMeta.dossier}: no leaf.arrangement — opposite or alternate is the twig's first question`)
  if (!nearWood) throw new Error(`chassis "${chassis}" has no wood to hang twigs on`)
  // metres: the chassis is scaled to the species' mature height at publish (publish-glb normalizeScale)
  let lo = Infinity, hi = -Infinity
  for (const mesh of chassisDoc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION').getArray()
    for (let i = 1; i < P.length; i += 3) { if (P[i] < lo) lo = P[i]; if (P[i] > hi) hi = P[i] }
  }
  const unitsPerMetre = (hi - lo) / mature
  // sites: every vertex of the chassis's own foliage is a TARGET — somewhere a leaf lives — and its
  // shoot starts on the nearest wood. The density grid thins the targets, so a chassis modelled
  // as a thousand sculpted clumps fills its crown as fully as one modelled as fifty thousand cards.
  const sites = []
  for (const { prim } of vendorLeafPrims) {
    const pos = prim.getAttribute('POSITION').getArray()
    for (let v = 0; v < pos.length; v += 3) {
      const [d2, o] = nearWood(pos[v], pos[v + 1], pos[v + 2])
      if (!Number.isFinite(d2) || o < 0) continue
      const at = [positionsCombined[o], positionsCombined[o + 1], positionsCombined[o + 2]]
      const target = [pos[v], pos[v + 1], pos[v + 2]]
      let out = [target[0] - at[0], target[1] - at[1], target[2] - at[2]]
      const reach = Math.hypot(...out)
      if (reach < 1e-6) out = [at[0], 0, at[2]]
      const l = Math.hypot(...out) || 1
      sites.push({ at, target, reach, out: out.map(x => x / l) })
    }
  }
  // A CANOPY IS A SHELL: leaves crowd the lit outside; the shaded interior is bare wood, which is why
  // a tree shows its branches. Per height band, the crown's radius is measured from the chassis's own
  // foliage; a target is kept only in the outer `crown_shell` of it (dossier twigModel).
  const shell = typeof twig.crown_shell === 'number' ? twig.crown_shell : null
  if (shell == null) throw new Error(`${packMeta.dossier}: twigModel has no crown_shell — how deep the leaves reach into the crown is the species'`)
  const bands = 24, rMax = new Float64Array(bands)
  const yLo = lo, ySpan = (hi - lo) || 1
  const band = y => Math.min(bands - 1, Math.max(0, Math.floor(((y - yLo) / ySpan) * bands)))
  const rOf = p => Math.hypot(p[0], p[2])
  for (const st of sites) { const b = band(st.target[1]); rMax[b] = Math.max(rMax[b], rOf(st.target)) }
  const shelled = sites.filter(st => rOf(st.target) >= (1 - shell) * rMax[band(st.target[1])])
  sites.length = 0; for (const st of shelled) sites.push(st)
  for (const { prim, mesh } of vendorLeafPrims) { mesh.removePrimitive(prim); prim.dispose() }
  vendorLeafPrims.length = 0
  const occupancy = typeof leaves.occupancy === 'number' ? leaves.occupancy : DEFAULTS.leaves.occupancy
  const scale = typeof leaves.scale === 'number' ? leaves.scale : 1
  const built = buildTwigLayer({ sites, packMeta, twig, arrangement, occupancy, scale, unitsPerMetre, rng })
  const buf = chassisDoc.getRoot().listBuffers()[0] || chassisDoc.createBuffer()
  const prim = (g, mat, kind) => chassisDoc.createPrimitive()
    .setAttribute('POSITION', chassisDoc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buf))
    .setAttribute('NORMAL', chassisDoc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nor)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', chassisDoc.createAccessor().setType('VEC2').setArray(new Float32Array(g.uv)).setBuffer(buf))
    .setIndices(chassisDoc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.idx)).setBuffer(buf))
    .setMaterial(mat).setExtras({ atlasKind: kind })
  const mesh = chassisDoc.createMesh('salonTwigs')
    .addPrimitive(prim(built.twigs, barkMat, 'bark'))
    .addPrimitive(prim(built.leaves, leafMat, 'leaf'))
  const scene = chassisDoc.getRoot().getDefaultScene() || chassisDoc.getRoot().listScenes()[0]
  scene.addChild(chassisDoc.createNode('salonTwigs').setMesh(mesh))
  console.log(`[twigs] ${species} on ${chassis}: ${built.sites} twigs (of ${built.candidates} leaf sites), ${built.leaves.idx.length / 6} leaves, ${(1 / unitsPerMetre).toFixed(3)} m per unit`)
}

// The Salon leaf material: the pack's colour+alpha, and its normal map when the pack carries
// one (the atlas bake reads both off this material). One builder for the vendor-card and the
// spray paths, so they cannot drift.
async function createSalonLeafMaterial(doc, packId, packMeta) {
  const leafBlob = await readLeafBytes(packId)
  const leafTex = doc.createTexture(`salon_leaf_${packId}`).setImage(leafBlob.bytes).setMimeType(leafBlob.mime)
  const mat = doc.createMaterial('salonLeaves')
    .setBaseColorTexture(leafTex)
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.5)
    .setDoubleSided(true)
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)
  if (packMeta.normal) {
    const nBytes = await fs.readFile(path.join(LEAF_SHAPES_DIR_NEW, packId, packMeta.normal))
    mat.setNormalTexture(doc.createTexture(`salon_leaf_${packId}_normal`).setImage(nBytes).setMimeType('image/png'))
  }
  return mat
}

async function buildCompositionDocument({ chassis, bark, leaves, slotName, hideLeaves = false, species = null }) {
  const chassisPath = resolveChassisPath(chassis)
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

  // ⛔ WOOD WITH NO UV CANNOT WEAR A BARK PHOTO — say so, by name. (21 of 241 chassis on
  // 2026-09-28: the willows, the garden mixes, the procedural sugar maples, white_fir_a.) It
  // used to reach the atlas with UVs of 0 and paint one flat texel; the bark contract now paints
  // it magenta, which is loud but says nothing. Generating bark UVs waits on a real-world bark size.
  const bareWood = barkPrims.filter(({ prim }) => !prim.getAttribute('TEXCOORD_0')).length
  if (bareWood) {
    const err = new Error(`chassis "${chassis}" has ${bareWood} wood primitive(s) with no UVs — it cannot wear a bark photo yet. Choose another chassis.`)
    err.statusCode = 422
    throw err
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

  // Capture the chassis's OWN leaf-vertex positions BEFORE any synthesized
  // strip — these are the model's real foliage placement, used as the spray
  // anchors so synthesized leaves land where the model has leaves (anchored
  // synthesis, operator 2026-06-23). Empty for truly de-leafed chassis.
  const vendorLeafAnchorPool = []
  for (const { prim } of vendorLeafPrims) {
    const acc = prim.getAttribute('POSITION')
    if (acc) {
      const arr = acc.getArray()
      for (let i = 0; i < arr.length; i++) vendorLeafAnchorPool.push(arr[i])
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

  // Determinism: the seed drives BOTH the vendor UV-rewrite (which leaf-pack cell a
  // canopy samples) and the spray fallback, so re-runs are byte-identical.
  //
  // ⭐⭐ SEED ON THE ASSET, NOT ON THE IDENTITY. Which cell a canopy draws is a property
  // of THIS GEOMETRY with this bark and this pack — and `resolveChassisPath` above
  // already settles that identity and path are two different facts ("`derivedFrom` on
  // the part IS the filename").
  //
  // ⛔ THE DEFECT THAT PAID FOR THIS (Jacob's eye, 2026-08-26). This hashed `chassis`,
  // the IDENTITY. The 2026-08-25 rename to forms (`white_oak_a` → `rounded_06`, 154
  // chassis) declared itself pure identity movement with provenance preserved — and
  // silently re-rolled every one of those compositions' cell draws. White Oak moved off
  // the single green cell of the four-cell `eastern_black_oak` pack onto a red one and
  // began shipping autumn leaves in August. Nothing in a rename says it may repaint the
  // map, and no operator in town #2 will connect a red tree to a rename days earlier.
  //
  // ⭐ Keyed on the resolved FILE, a rename cannot move the draw — by construction, in
  // any town: the renamed chassis resolve through `derivedFrom` to the same GLB they
  // always did (154 of them), and a chassis that was never renamed resolves to itself,
  // so nothing else in the library repaints.
  // ▶ node scratch/claims-a-rename-cannot-repaint.mjs
  const seed = compositionSeed({ chassisAsset: path.basename(chassisPath, '.glb'), bark, leaves })
  const rng = mulberry32(seed)

  // Leaf source (operator 2026-06-19 compromise): leaves render either as
  // AUTHORED — the chassis's own vendor-baked leaf cards, retextured to the
  // picked pack (labeled as such; Ways/leaf.size do NOT apply, the cards keep
  // their authored placement) — or SYNTHESIZED — the kit spray from pack + Ways
  // + derived leaf.size (the rubric leaf model, authoritative). Default authored
  // when the chassis HAS vendor leaves (no regression); 'synthesized' strips them
  // so only the kit leaves render. (A de-leafed chassis has no vendor prims → it
  // is always synthesized regardless.)
  if (leaves.mode === 'synthesized' && vendorLeafPrims.length > 0) {
    for (const { prim, mesh } of vendorLeafPrims) { mesh.removePrimitive(prim); prim.dispose() }
    vendorLeafPrims.length = 0
  }

  if (vendorLeafPrims.length > 0) {
    // Vendor-card path. Bind the picked pack texture to a fresh Salon leaf
    // material; rewrite per-card UVs to sample one tile from the tile grid
    // per card. Material settings mirror the spray-path material so the
    // shader-program cache key matches (Bloom stability, AC #7).
    const packMeta = await readLeafPackMeta(leaves.pack)
    const leafMat = await createSalonLeafMaterial(chassisDoc, leaves.pack, packMeta)
    // Where the wood is — each leaf's ATTACH point is its vertex nearest to it. The pack's
    // stalk is turned to that point, and the size knob scales the leaf about it, so a leaf
    // grows and shrinks from its twig instead of drifting off it.
    const nearWood = woodProximity(positionsCombined)
    // Operator leaf-size knob applies to authored leaves too (2026-06-23):
    // a direct multiplier on the model's own card size, in place.
    const vendorLeafScale = typeof leaves.scale === 'number' ? leaves.scale : 1.0
    if (packMeta.cellMetres) {
      // A generated pack hangs its own leaves on drawn twigs — see buildTwigLayer.
      hangTwigs({ chassisDoc, vendorLeafPrims, barkMat, leafMat, packMeta, leaves, species, chassis, positionsCombined, nearWood, rng })
    } else for (const { prim } of vendorLeafPrims) {
      prim.setMaterial(leafMat)
      const leavesOf = leafComponents(prim)
      if (!prim.getAttribute('TEXCOORD_0')) projectLeafUVs(prim, leavesOf, chassisDoc)
      const attach = leafAttachVertices(prim, leavesOf, nearWood)
      rewriteLeafPrimUVs(prim, packMeta, rng, chassisDoc, leavesOf, attach)
      scaleLeafCardsInPlace(prim, vendorLeafScale, chassisDoc, leavesOf, attach)
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
  // cards per anchor — fewer when anchored to the model's own (already dense,
  // well-placed) leaf positions; more for the sparse bbox-spray fallback.
  let cardsPerAttachment = 35
  if (vendorLeafAnchorPool.length >= 12) {
    // Anchored synthesis (2026-06-23): the model's own leaf vertices ARE the
    // foliage shape — sample them so synthesized cards sit on the real leaves
    // (placement + density), not random bbox points. Occupancy drives count.
    const anchorCount = Math.round(120 + occ * 480)
    attachments = sampleLeafAnchors(vendorLeafAnchorPool, anchorCount, rng)
    cardsPerAttachment = 5
  } else if (authoredTags.length > 0) {
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
    // Density driven by occupancy: 0..1 maps to ~10..100 attachment points,
    // now spread across the whole crown (not just the upper band).
    const attachmentCount = Math.round(10 + occ * 90)
    attachments = getUpperBboxSamples(positionsCombined, attachmentCount, rng)
  }
  // 2026-05-22 tuning: card size scales with leaves.scale, but spread stays
  // fixed (was 0.35 × scale — coupled spread to scale meant leaves spilled
  // past branch tips when operator scaled up). cardsPerAttachment bumped from
  // 5 → 12 for denser clusters that read as foliage mass.
  const scale = typeof leaves.scale === 'number' ? leaves.scale : 1.0
  const packMeta = await readLeafPackMeta(leaves.pack)
  // §2.3 leaf.size: cluster size derived from canopy radius + the pack's natural
  // leaf size (was the uniform BASE_CARD_SIZE × scale). EYE-TUNABLE knobs above.
  const cardSize = deriveLeafCardSize(positionsCombined, packMeta, scale)
  const leafGeo = buildLeafGeometryFromAttachments(attachments, {
    cardsPerAttachment,
    cardSize,
    spread: 0.7,
    yCompression: 0.7,
    tileGrid: packMeta.tileGrid,
    inwardBias: 0.35,  // bias card-cloud toward trunk axis — kills edge floaters
    ways: leaves.ways || 'alternate',   // §5 Leaf Ways
  }, rng)

  if (leafGeo) {
    const leafMat = await createSalonLeafMaterial(chassisDoc, leaves.pack, packMeta)

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

  // Brief 19 (Quartz): the authored gizmo transform (de-lean / center / scale)
  // is baked into POSITION + NORMAL by the CALLER (writeMultiCompositionGLB),
  // AFTER this returns — NOT here. This function has THREE return paths
  // (hideLeaves L1221, vendor-card L1273, spray below); baking inside only the
  // spray path silently skipped the vendor path, which is exactly the bug that
  // shipped vendor-leaf chassis (e.g. maple_sugar) WITHOUT their authored
  // de-lean. Baking at the caller is path-independent: by the time we return,
  // node transforms are already identity (bakeAllNodeTransforms above) and every
  // bark/leaf prim is in place, so the caller sees root-local geometry on every
  // path. The live preview never bakes (the viewport gizmo applies it live).
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
  // Botanical height (2026-06-25): the species' mature height is applied
  // downstream by publish-glb's normalizeScale (now dossier-targeted, not the
  // category default), not here — see publish-glb.js#TARGET_HEIGHT.
  for (let i = 0; i < compositions.length; i++) {
    const c = compositions[i]
    const slotName = `${species}_${c.slot}`
    const sub = await buildCompositionDocument({
      chassis: c.effective.chassis || c.chassis,
      bark: c.effective.bark,
      leaves: c.effective.leaves,
      slotName,
      species,
      // Leaf Source 'bare' (2026-07-07) ships leafless — an authored state, not
      // a preview-only peek. Drops vendor + skips spray in buildCompositionDocument.
      hideLeaves: c.effective.leaves?.mode === 'bare',
    })
    // Bake the authored gizmo transform (de-lean / center / scale) into the
    // fully-built doc HERE — path-independent, so buildCompositionDocument's
    // vendor/hideLeaves early returns can't skip it (the bug that shipped
    // vendor-leaf chassis, e.g. maple_sugar, with their de-lean silently dropped).
    if (c.effective.transform) bakeAuthoredTransform(sub, c.effective.transform)
    // Serialize the sub-doc and reload into the master as an embedded
    // subtree. We deep-copy primitives by re-creating accessors so they
    // share the master buffer.
    const subBytes = await io.writeBinary(sub)
    const subReloaded = await io.readBinary(subBytes)
    const subBuffer = masterDoc.createBuffer()
    // ONE node per COMPOSITION — every sub-mesh's primitives land on a single
    // mesh. A node per sub-mesh emitted N same-named top-level nodes for any
    // shading-group chassis (american_linden_a = BranchesSG/CapsSG/LeavesSG, the
    // "parts of one tree" case publish-glb's own variant-detection comment
    // describes), which `namesSuggestVariants` then read as N variants → the
    // linden published + shipped 3 byte-identical trees per scene, and the
    // roster believed it had 3 variants when it had one. Primitives, not nodes,
    // are what publish-glb decimates, so collapsing them is lossless.
    const mesh = masterDoc.createMesh(slotName)
    const node = masterDoc.createNode(slotName).setMesh(mesh)
    masterScene.addChild(node)
    for (const subMesh of subReloaded.getRoot().listMeshes()) {
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
    }
  }
  await io.write(outPath, masterDoc)
}

// ── Single-composition preview GLB (workstage live preview) ─────────────

export async function generateSingleCompositionGLB({ chassis, bark, leaves, lod = 0, slotLabel = 'preview', species = null }) {
  if (!chassis) throw new Error('chassis is required')
  const effective = {
    chassis,
    bark:    { ...DEFAULTS.bark,    ...(bark    || {}) },
    leaves:  { ...DEFAULTS.leaves,  ...(leaves  || {}) },
    deformer: { ...DEFAULTS.deformer, ...(/* reserved */ {}) },
  }
  // Leaf Source 'bare' (2026-07-07): no leaves — an authored state now (ships
  // bare via the same flag in the publish path), not a preview-only toggle.
  const hideLeaves = effective.leaves.mode === 'bare'
  const doc = await buildCompositionDocument({
    chassis,
    bark: effective.bark,
    leaves: effective.leaves,
    slotName: slotLabel,
    hideLeaves,
    species,
  })
  // Linden 2026-06-23: smooth-weld the bark in the PREVIEW too, so the Salon
  // shows the same unlocked/smooth bark as the published artifact (closes the
  // preview≠published shading gap for this change). Self-gated to flat-normal
  // soup; clean bark untouched.
  smoothWeldBark(doc)
  const io = makeIO()
  let buf = Buffer.from(await io.writeBinary(doc))
  if (lod === 1 || lod === 2) buf = await simplifyGlbBytes(buf, lod)
  return buf
}

// Linden 2026-06-23: errors matched to publish-glb's LODS (lod1 0.02, lod2 0.05)
// so the preview's distant LODs collapse leaf cards like the published ladder.
const LOD_PRESETS = {
  1: { ratio: 0.40, error: 0.0200 },
  2: { ratio: 0.10, error: 0.0500 },
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
  // Brief 3A (Cant): per-species deformer range. Single spec per species (the
  // first composition's effective deformer), matching bark's single-spec model.
  // bake-look surfaces this into trees-atlas.json#deformerBySpecies; the runtime
  // sets per-draw uniforms. Runtime-consumed only — nothing baked into GLB/atlas.
  const firstDef = compositions[0]?.effective?.deformer?.range
  if (firstDef && (firstDef.lean || firstDef.twist || firstDef.wander)) {
    const pair = (p) => (Array.isArray(p) && p.length >= 2) ? [p[0], p[1]] : [0, 0]
    m.deformer = { range: {
      lean:   pair(firstDef.lean),
      twist:  pair(firstDef.twist),
      wander: pair(firstDef.wander),
    } }
  }
  // leaf.face — single spec per species (first composition's effective face),
  // matching the deformer + bark single-spec model. bake-look surfaces it into
  // trees-atlas.json#leafFaceBySpecies; the runtime binds it per draw. Nothing is
  // baked into the GLB or the atlas — it is a uniform, so re-authoring is instant.
  // ⛔ Write it even when OFF: `{strength: 0}` is the honest record of "this species
  // has no underside", and it lets the check tell "authored none" from "never asked".
  const firstFace = compositions[0]?.effective?.leaves?.face
  if (firstFace) {
    m.leafFace = {
      front: firstFace.front || null,
      back: firstFace.back || null,
      strength: Number.isFinite(firstFace.strength) ? firstFace.strength : 0,
    }
  }
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

// Look roster sync — same idempotent shape as
// `generate-procedural.js#syncLookRoster`.
//
// ⭐ THE GROVE IS WHAT WE AFFIRMATIVELY HAVE. It holds the trees that appear in
// THIS landscape, grouped together, apart from the rest of the library — so a
// species earns a place in it by being GREEN: something the kit can actually
// compose. (Jacob, 2026-08-24: "If the light isn't green or isn't otherwise
// promoted to the grove, this is not a real conversation.")
//
// ⛔ This gated on "does public/trees/<species>/manifest.json exist" — i.e. does
// it have PUBLISHED GEOMETRY — which is not the same question. A literal
// imported asset has geometry and no composition, so it was auto-promoted into
// the roster, and then the impostor bakers correctly refused to capture it
// (HeroImpostorBaker: "refusing to ship an invisible species" — capture renders
// through the shared atlas material and a species with no composition has no
// barkBySpecies record). The result was a species admitted by one gate and
// rejected by the next, permanently mesh-only, showing up as a red capture
// FAILURE for a promotion that should never have happened.
// On LS that was platanus_acerifolia x4 variants = 921 placements stuck on mesh.
//
// The gate is now the composition itself. An uncomposed species is not promoted,
// and is NAMED — it belongs on the Coverage list as RED (a real gap to author),
// never in the Grove as a broken green.
async function speciesIsComposed(species) {
  try {
    const raw = await fs.readFile(path.join(REPO_ROOT, 'arborist/state', species, 'compositions.json'), 'utf8')
    const c = JSON.parse(raw)
    const arr = Array.isArray(c) ? c : (c.compositions || Object.values(c))
    return arr.some(x => x && x.chassis)
  } catch { return false }
}

/**
 * The species a Look's town ROUTES TO: every library id in cartograph/data/<scene>/tree-species-map.json
 * (the town's own grove — FIA- or census-derived). `null` when the Look has no scene or no map.
 */
export function routedSpeciesForLook(lookName, root = REPO_ROOT) {
  let scene = null
  try {
    const idx = JSON.parse(fsSync.readFileSync(path.join(root, 'public/looks/index.json'), 'utf8'))
    scene = (idx.looks || idx).find(l => l.id === lookName)?.scene || null
  } catch { /* no index → no scene */ }
  if (!scene) return null
  try {
    const m = JSON.parse(fsSync.readFileSync(path.join(root, 'cartograph/data', scene, 'tree-species-map.json'), 'utf8')).map || {}
    return new Set(Object.values(m).flat())
  } catch { return null }
}

/**
 * ⛔ WHICH SPECIES A ROSTER MAY GAIN (Jacob, 2026-09-25: "The LS species should come out of ALL LISTS
 * FOREVER EVERYWHERE"). A Grove bake regenerates EVERY composed species (no --species), and this used
 * to add all of them to the Look — so a town's first Grove bake planted Lafayette Square's trees on its
 * roster, where its own bake built no GLB for them (Provincetown's six red sticks).
 *   · full regen   → only species the town ROUTES TO; a town with no routing gains nothing, loudly.
 *   · `--species X` → the operator's explicit publish: X is added, and a town that doesn't route X says so.
 * Pure. ▶ checks/claims-a-look-holds-only-its-towns-grove.mjs
 */
export function rosterAdditions({ lookName, speciesList, onlySpecies = null, routed = routedSpeciesForLook(lookName) }) {
  if (onlySpecies) {
    if (!routed?.has(onlySpecies)) console.warn(`[generate-salon] ⚠️ ${lookName} does not route "${onlySpecies}" (its tree-species-map) — added because you published it by name; it will not be PLACED until the town routes to it.`)
    return [onlySpecies]
  }
  if (!routed) {
    console.warn(`[generate-salon] ⛔ ${lookName} has no tree routing (no scene or no tree-species-map.json) — adding NOTHING to its roster. Derive its likely grove first (scripts/15-fia-tree-mix.mjs).`)
    return []
  }
  const skipped = speciesList.filter(sp => !routed.has(sp))
  if (skipped.length) console.log(`[generate-salon] roster: ${skipped.length} composed species NOT added to ${lookName} (its town doesn't route to them): ${skipped.join(' ')}`)
  return speciesList.filter(sp => routed.has(sp))
}

async function syncLookRoster(lookName, speciesList) {
  const p = path.join(REPO_ROOT, 'public/looks', lookName, 'design.json')
  let design
  try { design = JSON.parse(await fs.readFile(p, 'utf8')) }
  catch { return 0 /* look doesn't exist — operator hasn't picked one */ }
  const trees = Array.isArray(design.trees) ? design.trees : []
  const haveKeys = new Set(trees.map(t => `${t.species}|${t.variantId}`))
  const newRoster = [...trees]
  let added = 0
  const ungreen = []
  for (const species of speciesList) {
    // ⛔ GREEN GATE — published geometry is not the same as a composed species.
    if (!(await speciesIsComposed(species))) {
      if (!haveKeys.has(`${species}|1`)) ungreen.push(species)
      continue
    }
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
  if (ungreen.length) {
    console.log(`[generate-salon] roster: NOT promoted (no composition — RED on Coverage, not a Grove failure): ${ungreen.join(' ')}`)
  }
  // ⛔ Say when the roster ALREADY holds an uncomposed species. It cannot be
  // captured, so it is permanently mesh-only; this is authored state, so it is
  // reported for the operator to decide, never silently removed.
  const stale = []
  for (const t of newRoster) {
    if (!stale.includes(t.species) && !(await speciesIsComposed(t.species))) stale.push(t.species)
  }
  if (stale.length) {
    console.warn(`[generate-salon] ⛔ roster holds ${stale.length} UNCOMPOSED species — they cannot be captured as impostors and will render as MESH forever: ${stale.join(' ')}. Compose them in the Salon, or remove them from ${lookName}/design.json#/trees.`)
  }
  return added
}

// ── CLI ──────────────────────────────────────────────────────────────────

function parseCliFilter(argv) {
  const i = argv.indexOf('--species')
  if (i === -1 || !argv[i + 1]) return null
  return argv[i + 1]
}


// ⛔⛔ THE LOOK IS NAMED BY THE OPERATOR, NEVER DEFAULTED TO LAFAYETTE SQUARE.
// This was `syncLookRoster('lafayette-square', …)` with the town typed into the source, so
// publishing a variant wrote into LS's design.json — the authoring SSoT — whichever Look you
// were actually working in. A Class C write: it does not show a wrong map, it edits a right one.
// (BRIEF-ls-bleed-excision; Jacob 2026-09-20: "There is no reason for LS to be the fallback
// here EITHER" · "all LS fallbacks are stupid and annoying and counterlogical.")
//
// ⭐ AND IT IS NOT PROTECTED BY "DON'T CALL THE OPERATOR'S AUTHORING A DEFECT". An authoring
// gesture lives in DATA the operator edited; a hardcoded literal in a .js file is a DEVELOPER'S
// DEFAULT. The test: could the operator have changed this without editing code? No ⇒ not
// authoring ⇒ the standing no-fallback rule applies.
function requireLookArg(argv, who) {
  const i = argv.indexOf('--look')
  const v = i !== -1 ? argv[i + 1] : null
  if (v && !v.startsWith('--')) return v
  console.error(`
⛔ ${who} refuses to publish without an explicit Look.

   Publishing adds the built variants to <look>/design.json — the AUTHORING SSoT.
   Defaulting would edit another town's roster, most likely Lafayette Square's.

     node arborist/${who}.js --look <id> [--species <id>]
`)
  process.exit(2)
}

async function main() {
  console.log('[generate-salon] composition-based publish (Brief 1, Sequoia)')

  const lookId = requireLookArg(process.argv, 'generate-salon')
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

  // Add published variants to the ACTIVE Look's roster (same idempotent pattern as
  // generate-procedural; see requireLookArg for why the town is never defaulted).
  // Surfaced in Brief 1 as a Salon-side gap; addressed here as a Brief 1.5a side-fix
  // because bark-knob acceptance testing requires the tree to actually appear in that
  // look's placements after Grove bake.
  const rosterSpecies = onlySpecies
    ? [onlySpecies]
    : speciesToBuild.map(s => s.speciesId)
  const added = await syncLookRoster(lookId, rosterAdditions({ lookName: lookId, speciesList: rosterSpecies, onlySpecies }))
  console.log(`[generate-salon] roster: added ${added} variant(s) to ${lookId}/design.json`)

  console.log('\n[generate-salon] done. Next:')
  console.log(`  node arborist/bake-look.js  --look ${lookId}`)
  console.log(`  node arborist/bake-trees.js --scene=${lookId}`)
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
