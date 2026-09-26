#!/usr/bin/env node
/**
 * claims-tree-drawn-height-by-window — how tall is each placed tree DRAWN, against its species'
 * STREET height and its FOREST height?
 *
 * Jacob, 2026-09-26: *"Provincetown's trees … seem possibly too large."* The frame is
 * `arborist/BACKLOG.md` "A SPECIES HAS TWO SIZE WINDOWS, AND THE TOWN PICKS ONE": a street-grown
 * sugar maple is 60 ft and a forest-grown one 120 ft, and neither source is wrong. This check
 * does not choose a window (that is a standup — it touches the rubric keystone); it reports
 * which one each town is EFFECTIVELY drawing at today. (`docs/briefs/BRIEF-tree-density-and-size.md`
 * measurement 2.)
 *
 * WHAT "DRAWN" MEANS — ground to top, read off the slab's own GLBs, never the dossier:
 *   stands = the placed variant's baked GLB, lowest vertex at the ground (y = 0) to its highest
 *            (`tree-bounds#topM`), over every mesh LOD the runtime may draw (lod0/lod1/lod1far/lod2).
 *   drawn  = stands × the instance's `scale` (absent ⇒ 1:1, exactly as every tree path treats it).
 *
 * ⛔⛔ ONE TREE, ONE SIZE, HOWEVER IT IS DRAWN. Every other path that draws a placement stands a
 *   card of the atlas record's `heightM` on the ground and scales it by the SAME `scale` — the hero
 *   card (`heroImpostorBySpecies`), the overhead snapshot (`overheadBySpecies`), the legacy card
 *   (`impostorBySpecies`) — and `canopyByVariant` sizes the bake's prominence spheres. Each record
 *   must sit inside the mesh's own LOD span, give or take half the 0.1 m step `topM` is rounded to.
 *   ⛔ Its predecessor read `impostorBySpecies.heightM` as a drawn height: that was lod2's Y EXTENT,
 *   and lod2 is trunk-cut (7.9 m up a pitch pine), so it printed 10.3 m for an 18.3 m tree and a
 *   brief was written against the ratio. Fixed at the source in bake-look (2026-09-26).
 *
 *   node checks/claims-tree-drawn-height-by-window.mjs --self-test   # feed it the trunk-cut span; it must fail
 *
 * THE TWO WINDOWS — read from the harvest, with provenance:
 *   street = selectree `height_high`       (a landscape / street planting figure)
 *   forest = ncsu `Dimensions` Height, top (species potential, forest-grown)
 *   from every `scratch/dossier-raw-*.jsonl`, joined to the placed species through the bake's own
 *   dossier resolver (`dossierFileForSalonSpecies`) and each row's `_taxon_queried` binomial.
 *   Window = whichever figure the drawn height is nearer to on a log scale; above the forest
 *   figure by more than the sources' one-foot resolution is called out on its own, and a species
 *   whose harvest puts street ≥ forest is printed as `unordered` (the two windows cannot be told apart).
 *
 * ⛔ IT FAILS ON a record that draws a placement at a different height from its mesh, and on a
 *    placed species whose drawn height, street figure or forest figure cannot be read — that tree's window is unknowable, and a size study that skips it is blind exactly
 *    where it matters. It does NOT fail on which window a town uses; that is Jacob's ruling.
 *
 *   node checks/claims-tree-drawn-height-by-window.mjs               # every town
 *   node checks/claims-tree-drawn-height-by-window.mjs provincetown
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { scenes, ROOT } from './_scenes.mjs'
import { dossierFileForSalonSpecies } from '../arborist/salon-options.js'
import { computeTreeBounds } from '../arborist/tree-bounds.js'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const SELF_TEST = process.argv.includes('--self-test')
const LODS = ['lod0', 'lod1', 'lod1far', 'lod2']
// Every path but the mesh, and the record it stands its tree by.
const RECORDS = ['heroImpostorBySpecies', 'overheadBySpecies', 'impostorBySpecies', 'canopyByVariant']
const STEP = 0.1                 // topM is rounded to 0.1 m (tree-bounds) — its own resolution, not a tolerance
const HALF_STEP = STEP / 2
const recordHeight = (atlas, key, sp, vid) =>
  key === 'canopyByVariant' ? atlas.canopyByVariant?.[sp]?.[vid]?.heightM : atlas[key]?.[sp]?.heightM

/** The mesh's own ground→top span over the LODs present, plus the trunk-cut lod2 extent (for the self-test). */
async function meshSpan(scene, sp, vid) {
  const tops = [], at = {}
  let lod2Extent = null
  for (const lod of LODS) {
    const f = join(ROOT, 'public', 'baked', scene, 'trees', sp, `skeleton-${vid}-${lod}.glb`)
    if (!existsSync(f)) continue
    const b = computeTreeBounds(await io.read(f))
    if (b.topM > 0) { tops.push(b.topM); at[lod] = b.topM }
    if (lod === 'lod2') lod2Extent = b.heightM
  }
  return tops.length ? { lo: Math.min(...tops), hi: Math.max(...tops), at, lod2Extent } : null
}
/** Records that would draw this placement at a height outside its mesh's span. */
const disagreements = (atlas, sp, vid, span) => RECORDS.flatMap(key => {
  const h = recordHeight(atlas, key, sp, vid)
  if (!Number.isFinite(h)) return []   // that path does not carry this species — it cannot draw it
  return (h < span.lo - HALF_STEP || h > span.hi + HALF_STEP) ? [{ key, h }] : []
})

const FT = 0.3048
let failed = 0
let selfCaught = 0, selfMissed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }

// ── The harvest: every raw observation file, grouped by the binomial it was asked about ──
const binomial = (s) => (typeof s === 'string' ? s : '').trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase()
const harvestFiles = readdirSync(join(ROOT, 'scratch')).filter(f => /^dossier-raw-.*\.jsonl$/.test(f))
if (!harvestFiles.length) {
  console.error('⛔ NOT MEASURED — no scratch/dossier-raw-*.jsonl; the street/forest figures are unreadable.')
  process.exit(2)
}
const rows = harvestFiles.flatMap(f => readFileSync(join(ROOT, 'scratch', f), 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l)))
const taxonOf = new Map()   // harvest species label → binomial
for (const r of rows) if (r.field === '_taxon_queried') taxonOf.set(r.species, binomial(r.value))
const figures = new Map()   // binomial or lowercased label → { street:Set, forest:Set }
const fig = (k) => figures.get(k) || figures.set(k, { street: new Set(), forest: new Set() }).get(k)
for (const r of rows) {
  let street = null, forest = null
  if (r.source === 'selectree' && r.field === 'height_high' && Number.isFinite(+r.value)) street = +r.value * FT
  const m = r.source === 'ncsu' && r.field === 'Dimensions' && /^Height:\s*([\d.]+)\s*ft[^-]*-\s*([\d.]+)\s*ft/.exec(r.value)
  if (m) forest = +m[2] * FT
  if (street == null && forest == null) continue
  for (const k of [taxonOf.get(r.species), binomial(r.species), r.species.toLowerCase()].filter(Boolean)) {
    if (street != null) fig(k).street.add(street)
    if (forest != null) fig(k).forest.add(forest)
  }
}

/** The street + forest figures for a placed (library) species, via its dossier. */
function windowsFor(species) {
  const p = dossierFileForSalonSpecies(species)
  if (!p) return { why: 'no dossier' }
  const d = JSON.parse(readFileSync(p, 'utf8'))
  const nameOf = (x) => (typeof x === 'string' ? x : x?.name) || null
  const keys = [binomial(d.scientific), ...[d.commonName, ...(d.akas || []), ...(d.inventoryNames || [])]
    .map(nameOf).filter(Boolean).map(s => s.toLowerCase())]
  const street = new Set(), forest = new Set()
  for (const k of keys) { const f = figures.get(k); if (f) { f.street.forEach(v => street.add(v)); f.forest.forEach(v => forest.add(v)) } }
  return { dossier: p.split('/').pop(), street: [...street], forest: [...forest] }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null }
const f1 = (x) => (x == null ? '—' : x.toFixed(1))
// "Above" means above by more than the SOURCES' OWN RESOLUTION — they publish whole feet — so a
// 24.43 m tree is not "above" a 24.38 m (80 ft) figure. Not a tolerance: the unit's own step.
// A pair whose street figure is not below its forest figure cannot say which window is which.
const windowOf = (h, S, F) => {
  if (!(S < F)) return 'unordered'
  if (h > F + FT) return 'ABOVE FOREST'
  return Math.abs(Math.log(h / S)) <= Math.abs(Math.log(h / F)) ? 'street' : 'forest'
}

for (const scene of scenes('public/baked/<scene>/trees.json')) {
  console.log(`\n── ${scene}`)
  const trees = JSON.parse(readFileSync(join(ROOT, 'public', 'baked', scene, 'trees.json'), 'utf8'))
  const atlasPath = join(ROOT, 'public', 'baked', scene, 'trees-atlas.json')
  if (!existsSync(atlasPath)) { bad(`no trees-atlas.json — no drawn height is readable for ${trees.instances.length} placements`); continue }
  const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'))
  const when = trees.generatedAt ? new Date(trees.generatedAt).toISOString().slice(0, 16) : 'unknown'
  console.log(`  trees.json baked ${when} · ${trees.instances.length} placements · ` +
    `${trees.instances.filter(i => i.scale != null).length} carry a per-tree scale`)

  const bySp = new Map()
  for (const i of trees.instances) (bySp.get(i.species) || bySp.set(i.species, []).get(i.species)).push(i)
  console.log(`  ${'species'.padEnd(22)} ${'n'.padStart(5)}  ${'scale med [min–max]'.padEnd(20)} ` +
    `${'stands'.padStart(6)} ${'drawn med [min–max]'.padEnd(19)} paths │ ${'street'.padStart(6)} ${'forest'.padStart(6)} │ window`)
  const share = {}
  for (const [sp, list] of [...bySp].sort((a, b) => b[1].length - a[1].length)) {
    const scales = list.map(i => (Number.isFinite(+i.scale) && +i.scale > 0 ? +i.scale : 1))
    const sMed = median(scales), sMin = Math.min(...scales), sMax = Math.max(...scales)
    // A species may be placed as several variants; each is its own mesh and must agree with the records.
    const vids = [...new Set(list.map(i => i.variantId))]
    let stands = null, pathsCol = 'ok'
    for (const vid of vids) {
      const span = await meshSpan(scene, sp, vid)
      if (!span) { bad(`${sp} v${vid} (${list.filter(i => i.variantId === vid).length}): no baked mesh GLB with a height — drawn height unknowable`); pathsCol = '?'; continue }
      stands ??= span.at.lod1 ?? span.hi
      let off = disagreements(atlas, sp, vid, span)
      if (SELF_TEST) {
        // Mutation: the trunk-cut span this check's predecessor read. A green check that stays green
        // under it proves nothing. Only meaningful where lod2 is shorter than the tree by more than the
        // unit's step — judged WITHOUT the tolerance under test, or weakening it hides the mutation.
        const mutated = { ...atlas, heroImpostorBySpecies: { ...atlas.heroImpostorBySpecies, [sp]: { heightM: span.lod2Extent } } }
        const caught = span.lod2Extent < span.lo - STEP
          ? disagreements(mutated, sp, vid, span).some(d => d.key === 'heroImpostorBySpecies') : null
        if (caught === false) selfMissed++, console.log(`  ⛔ SELF-TEST: ${sp} v${vid} — hero record set to the trunk-cut ${f1(span.lod2Extent)} m and the check did NOT fail`)
        if (caught) selfCaught++
        off = []
      }
      for (const d of off) {
        bad(`${sp} v${vid} (${list.length}): ${d.key}.heightM ${f1(d.h)} m, but its mesh stands ${f1(span.lo)}–${f1(span.hi)} m ` +
          `— this tree changes size when the camera changes which path draws it`)
        pathsCol = 'SPLIT'
      }
    }
    const w = windowsFor(sp)
    const S = w.street?.length ? Math.max(...w.street) : null
    const F = w.forest?.length ? Math.max(...w.forest) : null
    const dMed = stands != null ? stands * sMed : null
    const win = dMed != null && S && F ? windowOf(dMed, S, F) : '?'
    if (win !== '?') share[win] = (share[win] || 0) + list.length
    const scaleCol = sMin === sMax ? `${sMed.toFixed(2)} (flat)` : `${sMed.toFixed(2)} [${sMin.toFixed(2)}–${sMax.toFixed(2)}]`
    const drawnCol = stands == null ? '—' : `${f1(dMed)} [${f1(stands * sMin)}–${f1(stands * sMax)}]`
    console.log(`  ${sp.padEnd(22)} ${String(list.length).padStart(5)}  ${scaleCol.padEnd(20)} ` +
      `${f1(stands).padStart(6)} ${drawnCol.padEnd(19)} ${pathsCol.padEnd(5)} │ ${f1(S).padStart(6)} ${f1(F).padStart(6)} │ ${win}`)
    if (w.why) bad(`${sp} (${list.length}): ${w.why} — no street or forest figure`)
    else {
      if (S == null) bad(`${sp} (${list.length}): ${w.dossier} has no STREET figure (selectree height_high) in the harvest`)
      if (F == null) bad(`${sp} (${list.length}): ${w.dossier} has no FOREST figure (ncsu Dimensions) in the harvest`)
    }
    if (w.street?.length > 1 || w.forest?.length > 1)
      console.log(`      ↳ several published figures — street ${w.street.map(f1).join('/')} · forest ${w.forest.map(f1).join('/')} (the largest is used)`)
  }
  const fmt = (o) => {
    const n = Object.values(o).reduce((a, b) => a + b, 0)
    return n ? Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join(' · ') + ` (of ${n} classifiable)` : 'none classifiable'
  }
  console.log(`  ▶ effective window, by placements (median drawn height): ${fmt(share)}`)
}

if (SELF_TEST) {
  // Only the mutation's verdict counts here — the dossier/harvest problems above are the normal run's.
  console.log(!selfCaught && !selfMissed ? '\n⛔ SELF-TEST: no species had a trunk-cut lod2 to mutate with — nothing was proven.'
    : `\n${selfMissed ? '⛔' : '✓'} SELF-TEST: trunk-cut span caught on ${selfCaught} variant(s), missed on ${selfMissed}.`)
  process.exit(selfMissed || !selfCaught ? 1 : 0)
}
console.log(failed ? `\n⛔ ${failed} problem(s) — a tree drawn at two sizes, or a window that is unknowable.` : '\n✓ every placed tree draws at one size on every path, and reads against both windows.')
process.exit(failed ? 1 : 0)
