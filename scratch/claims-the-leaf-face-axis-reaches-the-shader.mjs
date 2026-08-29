/**
 * AN AUTHORED AXIS MUST REACH A PIXEL — leaf.face, front to back.
 *
 * ⛔ THE DEFECT THIS CLOSES (2026-08-28). `leaf.face` (the paler leaf UNDERSIDE — silver
 * maple's "the whole canopy flashes silver in wind") was a DECLARED rubric axis, AUTHORED on
 * 10 of 34 dossiers, with a Salon colour picker for each of its two ramps — and it reached
 * nothing. No producer read it, `gl_FrontFacing` appeared nowhere in the repo, and the
 * operator could pick an underside colour that touched no pixel. It was an ASPIRATION filed
 * as done: `SALON-INTERFACE.md` described the technique as decided 2026-06-25.
 *
 * ⭐ WHY THIS IS THE CHECK, and why it is not "does silver maple look right". It walks the
 * whole chain in the only direction that matters — from the thing a human AUTHORED to the
 * uniform a GPU reads — and it does that for every species in every town. An axis that
 * resolves for LS and dies in town #2 fails here. Three questions:
 *   ① IS THE CHAIN INTACT — dossier → resolver → manifest → slab → uniform → shader (pins).
 *   ② IS EVERY DRAW SITE BOUND — the shared material carries the PREVIOUS species' values,
 *      so a site that binds bark but not the face paints one tree with its neighbour's
 *      underside. Source-read, so a NEW draw site added tomorrow fails this without anyone
 *      remembering to add it to a list.
 *   ③ DOES THE SLAB CARRY WHAT THE DOSSIER AUTHORS — an authored axis missing from a baked
 *      look is a stale slab, and it says so rather than rendering a plain green tree.
 *
 * ⚠️ ③ IS A REACHABILITY CHECK, NOT AN EYE. It proves the colours arrive at the uniform. It
 * cannot tell you the underside reads as silver rather than grey — that is the operator's
 * gate, in the Salon at Street distance (`SALON-INTERFACE.md`'s standing eye-gate).
 *
 *   node scratch/claims-the-leaf-face-axis-reaches-the-shader.mjs [look ...]
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { dossierForSalonSpecies } from '../arborist/salon-options.js'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

let failed = 0
const fail = (...m) => { failed++; console.error(...m) }

// ── ① THE CHAIN, PINNED AT EVERY LINK ────────────────────────────────────────────
// Each pin names the rule, not the line — but if the rule moves, this check is modelling
// something that no longer exists and must exit 2 rather than report a comfortable green.
const PINS = [
  ['arborist/generate-salon.js', 'the dossier is read through the ONE shared resolver',
    /import \{ dossierForSalonSpecies \} from '\.\/salon-options\.js'/],
  ['arborist/generate-salon.js', 'the face resolves from the RAW composition, not the merged one',
    /function resolveFace\(species, rawLeaves, mergedLeaves\)/],
  ['arborist/generate-salon.js', 'strength with no colour pair resolves to 0, never a dead control',
    /if \(!front \|\| !back\) return \{ front: null, back: null, strength: 0 \}/],
  ['arborist/generate-salon.js', 'the resolved face is written to the manifest',
    /m\.leafFace = \{/],
  ['arborist/bake-look.js', 'bake-look surfaces leafFaceBySpecies into the slab',
    /leafFaceBySpecies\[v\.species\] = \{/],
  ['src/components/treeAtlasMaterial.js', 'the per-draw binder exists and is a SIBLING, not a widened applyBarkUniforms',
    /export function applyLeafFaceUniforms\(material, leafFace\)/],
  ['src/components/treeAtlasMaterial.js', 'the shader selects by FACE and is gated to leaves',
    /uLeafFaceStrength > 0\.0 && vBark < 0\.5 && !gl_FrontFacing/],
  ['src/components/treeAtlasMaterial.js', 'the front face is identity (only the back is recast)',
    /vec3 backLit = uLeafFaceBack \* \(la \/ max\(lf, 0\.001\)\)/],
]
for (const [file, what, re] of PINS) {
  if (!re.test(read(file))) fail(`⛔ PIN DRIFT — ${file} no longer does: "${what}".\n   The chain has moved; update this check before trusting it.`)
}
if (failed) process.exit(2)
console.log(`✅ the chain is intact — ${PINS.length} links pinned, dossier → resolver → manifest → slab → uniform → shader\n`)

// ── ② EVERY DRAW SITE THAT BINDS BARK MUST BIND THE FACE ─────────────────────────
// Discovered by reading the tree, never listed: a draw site added tomorrow is covered.
const SRC = path.join(ROOT, 'src')
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name))
    : /\.(js|jsx)$/.test(e.name) ? [path.join(d, e.name)] : [])
const unbound = []
for (const f of walk(SRC)) {
  const src = readFileSync(f, 'utf8')
  // a CALL, not the definition or the import line
  const calls = (src.match(/(?<!function )applyBarkUniforms\(/g) || []).length
    - (src.match(/export function applyBarkUniforms\(/g) || []).length
  if (calls <= 0) continue
  if (!/applyLeafFaceUniforms\(/.test(src)) unbound.push([path.relative(ROOT, f), calls])
}
if (unbound.length) {
  fail(`⛔ ${unbound.length} draw site(s) bind bark but NOT the leaf face — each will paint a species`)
  console.error(`   with the PREVIOUS draw's underside, because the material is shared:`)
  for (const [f, n] of unbound) console.error(`       ${f}  (${n} applyBarkUniforms call(s))`)
} else {
  console.log('✅ every draw site that binds bark also binds the leaf face\n')
}

// ── ③ WHAT THE DOSSIER AUTHORS, THE SLAB MUST CARRY ──────────────────────────────
const looks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(BAKED).filter(d => existsSync(path.join(BAKED, d, 'trees-atlas.json')))

for (const look of looks) {
  const atlas = JSON.parse(read(path.join('public/baked', look, 'trees-atlas.json')))
  const treesPath = path.join(BAKED, look, 'trees.json')
  if (!existsSync(treesPath)) { console.log(`  ${look.padEnd(22)} — no trees.json`); continue }
  const placed = new Map()
  for (const i of JSON.parse(readFileSync(treesPath, 'utf8')).instances || []) {
    placed.set(i.species, (placed.get(i.species) || 0) + 1)
  }
  const slab = atlas.leafFaceBySpecies || {}
  const stale = []
  let carried = 0
  for (const [sp, n] of [...placed].sort((a, b) => b[1] - a[1])) {
    let d = null
    try { d = dossierForSalonSpecies(sp) } catch { /* unresolved ⇒ nothing authored */ }
    const f = d?.required?.['leaf.face'] || d?.optional?.['leaf.face']
    const authored = !!(f?.front && f?.back && f.strength && f.strength !== 'none')
    const inSlab = Number.isFinite(slab[sp]?.strength) && slab[sp].strength > 0
    if (inSlab) carried++
    if (authored && !inSlab) stale.push([sp, n, f.strength])
  }
  if (!stale.length) {
    console.log(`  ✅ ${look.padEnd(22)} ${carried} species carry an underside; nothing authored is missing`)
    continue
  }
  fail(`  ⛔ ${look.padEnd(22)} ${stale.length} species have an AUTHORED underside the slab does not carry —`)
  for (const [sp, n, str] of stale) console.error(`       ${sp.padEnd(22)} ${String(n).padStart(5)} placements   dossier says "${str}", slab says nothing`)
  console.error(`       ▶ the axis is resolved at publish: Grove "Bake → Slab" for this Look.`)
}

process.exit(failed ? 2 : 0)
