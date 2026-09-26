/**
 * library-builder.js — the filesystem counterpart of the rubric
 * (Forest Builder Stage 1A, FOREST-BUILDER-KIT-MATCHER.md §4.5; _archive/LIBRARY-BUILDER-2026-08-23.md).
 *
 * A background concern of ingest, NOT a one-time migration: each part handed in
 * is PLACED canonically under public/library/<partTree>/<rubricValue>/<id>/ with
 * a paired meta.json (tags + conformReport + source), and MANIFEST.json is
 * regenerated. Converges the on-disk mess (split leaves / opaque Bark0NN / flat
 * 241-chassis pile) toward "one canonical folder per part-type, named by rubric
 * value, never vendor id" — incrementally, only for parts touched, never blocking.
 *
 * Stage-1 scope decision (documented): we place the canonical META + a sourcePath
 * POINTER, and do NOT duplicate binaries by default (241 GLBs + bark texture sets
 * would bloat the repo for zero matcher benefit — the matcher reads tags, not
 * pixels). opts.copyBinaries copies the small leaf shape.png. Binary relocation
 * is the incremental follow-on (§4.5 "never a blocking migration"). The Builder
 * owns the indirection: sourcePath keeps every reference valid.
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { dirname, join } from 'path'

const LIB_ROOT = 'public/library'
const TREE = { chassis: 'chassises', bark: 'barks', leaf: 'leaves', overlay: 'overlays' }
// the axis whose value names the canonical folder for each part-type
// ⛔ These are the LIVE rubric axes. They named the pre-cutover `bark.type` / `leaf.silhouette`
// (the 19→31 cutover migrated the artifacts, not this producer), so a re-import resolved every
// bark and leaf to `_unassigned` and reaped the curated placements. ▶ checks/claims-a-reimport-keeps-curation.mjs
const PRIMARY_AXIS = { chassis: 'chassis.habit', bark: 'bark.texture', leaf: 'leaf.shape', overlay: 'overlay.type' }

/** The category a part already holds in the library, if it is ASSIGNED (not `_unassigned`). */
function assignedPlacement(part, root) {
  const treeDir = join(root, TREE[part.partType] || part.partType)
  if (!existsSync(treeDir)) return null
  for (const value of readdirSync(treeDir)) {
    if (value === '_unassigned') continue
    if (safeIsDir(join(treeDir, value, part.partId))) return value
  }
  return null
}

/** sourcePath → the id the library already gives it. An id is AUTHORED once minted (the
 *  2026-08-25 form rename: `gray_poplar_a_trunk22.glb` is `columnar_01`, and compositions
 *  say `columnar_01`), so a re-import keeps it instead of re-minting from the filename. */
export function assignedIds(root = LIB_ROOT) {
  const out = new Map()
  for (const tree of Object.values(TREE)) {
    const td = join(root, tree)
    if (!existsSync(td)) continue
    for (const value of readdirSync(td)) {
      if (!safeIsDir(join(td, value))) continue
      for (const id of readdirSync(join(td, value))) {
        const m = join(td, value, id, 'meta.json')
        if (!existsSync(m)) continue
        try { const sp = JSON.parse(readFileSync(m, 'utf8')).sourcePath; if (sp) out.set(sp, id) } catch { /* unreadable meta keys nothing */ }
      }
    }
  }
  return out
}

// ⛔ A re-import never downgrades an ASSIGNED category to `_unassigned`: a category is the
// operator's curation, and a tag the tagger cannot draft today is not evidence against it.
// An assigned tag still wins (a re-tag moves the part); only "no value" defers to what is there.
const canonicalValue = (part, root = LIB_ROOT) => {
  const t = part.tags && part.tags[PRIMARY_AXIS[part.partType]]
  return (t && t.value) || assignedPlacement(part, root) || '_unassigned'
}

export function canonicalDir(part, root = LIB_ROOT) {
  return join(root, TREE[part.partType] || part.partType, String(canonicalValue(part, root)), part.partId)
}

/**
 * place(part, opts) — write the canonical meta (+ optional binary copy) and
 * return the canonical dir. Idempotent (write-if-changed). `part.sourcePath` is
 * the original asset (a GLB / a pack dir / a Bark dir); we point at it.
 */
export function place(part, opts = {}) {
  const root = opts.libRoot || LIB_ROOT
  const dir = canonicalDir(part, root)
  mkdirSync(dir, { recursive: true })
  const meta = {
    partId: part.partId,
    partType: part.partType,
    source: part.source,
    canonicalValue: canonicalValue(part, root),
    sourcePath: part.sourcePath || null,
    tags: part.tags,
    conformReport: part.conformReport || null,
  }
  writeIfChanged(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  // small, readable binary: copy the leaf card so leaves/<silhouette>/ is real.
  if (opts.copyBinaries && part.partType === 'leaf' && part.sourcePath) {
    const shape = join(part.sourcePath, 'shape.png')
    if (existsSync(shape)) copyFileSync(shape, join(dir, 'shape.png'))
  }
  return dir
}

/** Regenerate MANIFEST.json — the back-end "what's where, by rubric value" doc. */
export function regenerateManifest(parts, root = LIB_ROOT) {
  const byTree = {}
  for (const p of parts) {
    const t = TREE[p.partType] || p.partType
    const v = String(canonicalValue(p, root))
    byTree[t] = byTree[t] || {}
    byTree[t][v] = byTree[t][v] || []
    byTree[t][v].push({ partId: p.partId, source: p.source, sourcePath: p.sourcePath || null })
  }
  const manifest = {
    _doc: 'Generated by library-builder.js (Forest Builder §4.5). Canonical part tree by rubric value. sourcePath points at the original asset (binaries not duplicated this stage).',
    generatedFrom: 'arborist/ingest.js',
    counts: Object.fromEntries(Object.entries(byTree).map(([t, vs]) => [t, Object.values(vs).reduce((n, a) => n + a.length, 0)])),
    tree: byTree,
  }
  mkdirSync(root, { recursive: true })
  writeIfChanged(join(root, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

/**
 * reapOrphans(parts) — when a part re-tags to a new rubric value, place() writes
 * its NEW canonical dir but the OLD one is left behind (e.g. Bark007 furrowed→
 * plated leaves barks/furrowed/Bark007). Reap removes any <tree>/<value>/<partId>
 * placement dir that isn't a CURRENT placement, so re-tagging self-heals. Only
 * touches partId-level dirs we own (the canonical leaf of the tree); never the
 * value or tree dirs, never anything outside public/library.
 */
export function reapOrphans(parts, root = LIB_ROOT) {
  const valid = new Set(parts.map(p => canonicalDir(p, root)))
  let reaped = 0
  for (const tree of Object.values(TREE)) {
    const treeDir = join(root, tree)
    if (!existsSync(treeDir)) continue
    for (const value of readdirSync(treeDir)) {
      const valueDir = join(treeDir, value)
      if (!safeIsDir(valueDir)) continue
      for (const partId of readdirSync(valueDir)) {
        const dir = join(valueDir, partId)
        if (safeIsDir(dir) && !valid.has(dir)) { rmSync(dir, { recursive: true, force: true }); reaped++ }
      }
      if (readdirSync(valueDir).length === 0) rmSync(valueDir, { recursive: true, force: true }) // drop now-empty value dir
    }
  }
  return reaped
}
const safeIsDir = (p) => { try { return statSync(p).isDirectory() } catch { return false } }

function writeIfChanged(path, content) {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return true
}

/**
 * What the operator SEES for a plate: an anonymised id + its trait, never a source filename
 * (Jacob, 2026-09-25: "filenames internal … can't get to the user that way").
 *   `rounded_06` → "rounded 06" (a form id already is anonymised) · a bark in `furrowed/` →
 *   "furrowed 02" · an unsorted chassis → "unsorted 07".
 * Keyed by partId AND by the source key the Salon catalogs use (chassis GLB stem, bark/leaf dir),
 * so either id space finds the same label. Numbers are stable for a given library; they are a
 * label, never an identity — the partId is.  ▶ checks/claims-no-filename-reaches-a-plate-label.mjs
 */
export function plateIdentities(parts) {
  const out = { chassis: {}, bark: {}, leaf: {} }
  const groups = new Map()   // `${type}|${category}` -> parts
  for (const p of parts) {
    if (!out[p.partType]) continue
    const seg = String(p.path || '').split('/').filter(Boolean)
    const cat = seg.length >= 2 ? seg[seg.length - 2] : '_unassigned'
    const k = `${p.partType}|${cat}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(p)
  }
  for (const [k, ps] of groups) {
    const [type, cat] = k.split('|')
    const word = cat === '_unassigned' ? 'unsorted' : cat
    const own = (p) => { const m = p.partId.match(/^(.+)_(\d+)$/); return m && m[1] === cat ? Number(m[2]) : null }
    let next = Math.max(0, ...ps.map(own).filter(n => n != null))
    for (const p of ps.slice().sort((a, b) => a.partId.localeCompare(b.partId))) {
      const n = own(p) ?? ++next
      const ident = { id: p.partId, label: `${word} ${String(n).padStart(2, '0')}` }
      out[type][p.partId] = ident
      const src = p.sourcePath ? p.sourcePath.split('/').pop().replace(/\.glb$/, '') : null
      if (src) out[type][src] = ident
    }
  }
  return out
}
