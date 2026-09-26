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
 * WHAT "DRAWN" MEANS — read off the slab, never the dossier:
 *   drawn = the atlas record's `heightM` (measured by bake-look from the scale-applied GLB)
 *         × the instance's `scale` (absent ⇒ 1:1, exactly as `InstancedTrees` treats it).
 *   The atlas carries TWO records per species and they need not agree — `impostorBySpecies`
 *   and `heroImpostorBySpecies` — so both are printed, side by side. Which placements draw
 *   through which is NOT established here; the ratio between them is printed, not judged.
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
 * ⛔ IT FAILS ON a placed species whose drawn height, street figure or forest figure cannot be
 *    read — that tree's window is unknowable, and a size study that skips it is blind exactly
 *    where it matters. It does NOT fail on which window a town uses; that is Jacob's ruling.
 *
 *   node checks/claims-tree-drawn-height-by-window.mjs               # every town
 *   node checks/claims-tree-drawn-height-by-window.mjs provincetown
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { scenes, ROOT } from './_scenes.mjs'
import { dossierFileForSalonSpecies } from '../arborist/salon-options.js'

const FT = 0.3048
let failed = 0
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
    `${'far'.padStart(5)} ${'hero'.padStart(5)} hero/far │ ${'street'.padStart(6)} ${'forest'.padStart(6)} │ window(far) window(hero)`)
  const share = { far: {}, hero: {} }
  for (const [sp, list] of [...bySp].sort((a, b) => b[1].length - a[1].length)) {
    const scales = list.map(i => (Number.isFinite(+i.scale) && +i.scale > 0 ? +i.scale : 1))
    const sMed = median(scales), sMin = Math.min(...scales), sMax = Math.max(...scales)
    const far = atlas.impostorBySpecies?.[sp]?.heightM ?? null
    const hero = atlas.heroImpostorBySpecies?.[sp]?.heightM ?? null
    const dFar = far != null ? far * sMed : null, dHero = hero != null ? hero * sMed : null
    const w = windowsFor(sp)
    const S = w.street?.length ? Math.max(...w.street) : null
    const F = w.forest?.length ? Math.max(...w.forest) : null
    const wf = dFar != null && S && F ? windowOf(dFar, S, F) : '?'
    const wh = dHero != null && S && F ? windowOf(dHero, S, F) : '?'
    if (wf !== '?') share.far[wf] = (share.far[wf] || 0) + list.length
    if (wh !== '?') share.hero[wh] = (share.hero[wh] || 0) + list.length
    const ratio = far && hero ? (hero / far).toFixed(2) : '—'
    const scaleCol = sMin === sMax ? `${sMed.toFixed(2)} (flat)` : `${sMed.toFixed(2)} [${sMin.toFixed(2)}–${sMax.toFixed(2)}]`
    console.log(`  ${sp.padEnd(22)} ${String(list.length).padStart(5)}  ${scaleCol.padEnd(20)} ` +
      `${f1(dFar).padStart(5)} ${f1(dHero).padStart(5)} ${ratio.padStart(8)} │ ${f1(S).padStart(6)} ${f1(F).padStart(6)} │ ${wf.padEnd(11)} ${wh}`)
    if (far == null && hero == null) bad(`${sp} (${list.length}): no atlas height record on either path — drawn height unknowable`)
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
  console.log(`  ▶ effective window, by placements — far path: ${fmt(share.far)}`)
  console.log(`  ▶ effective window, by placements — hero path: ${fmt(share.hero)}`)
}

console.log(failed ? `\n⛔ ${failed} problem(s) — those trees' windows are unknowable.` : '\n✓ every placed species reads against both windows.')
process.exit(failed ? 1 : 0)
