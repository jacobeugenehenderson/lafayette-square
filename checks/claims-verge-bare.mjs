#!/usr/bin/env node
// CLAIM — A VERGE IS BARE GRASS, AND A BLOCK'S HIGHWAY EDGE IS BARE (H-3 check 6, `r-highway-verge`).
//
// Land bounded entirely by highway is VERGE: grass, no curb, no sidewalk, no land-use choice. A block that
// is only partly bounded by highway keeps its town frontage and is BARE on its highway edge. Classified at
// the mint (derive.js, frozen per block as `blockClass`) and painted by `sectionPassProtoTile`.
// The fill is not frozen (`SECTION §4`), so this check runs the REAL painter on every frozen tile — it
// reads `shape.json`, never a copy of the painter's rules.
// ASSERTS, per frozen tile:
//   · a VERGE tile paints 0 curb, 0 sidewalk, 0 treelawn, and its land use is `verge`;
//   · on every other tile, just inside each highway-owned contour edge (half a curb width in) there is no
//     curb, sidewalk or treelawn OF A HIGHWAY — the land use reaches H's edge. ⭐ Judged by OWNER, never by distance
//     (Boz, 2026-10-21): the painter is run in pieces mode, and a sample is a finding only where the band it lies in
//     is held by no town run (every piece there names a highway run, or no run). At a sharp town↔highway corner the
//     town's sidewalk runs up to H by design and its piece names the town run, so it passes by identity. ⛔ The old
//     test excused a sample within the widest town band (WB) of a town edge, by point-to-segment distance: a mitred
//     corner reaches ≈ WB / sin(θ/2), and LS tile 44 (a junction residual, an edge that nearly doubles back) was
//     judged 0.177 m past the reach — town walk, called a highway's.
// A frozen shape with highways but no `hwy` stamp predates H-3 and is NOT CHECKED, loudly.
//
//   node checks/claims-verge-bare.mjs [look…] [--shape=path] [--selftest]
//
// ⭐ MUTATION TEST (`--selftest`): `isHighwayRun` returns false in a mutated copy of tileGround.js (ped paints on highway
//   edges); the samples then lie in pieces owned by highway runs → RED, through the piece's owner.
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT, scenes } from './_scenes.mjs'
import { resolveCurbWidth } from '../src/cartograph/streetProfiles.js'

const SELF = process.argv.includes('--selftest')
const shapeOverride = process.argv.find(a => a.startsWith('--shape='))?.slice('--shape='.length)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a / 2) }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
  if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const inAny = (x, z, rings) => rings.some(r => r?.length >= 3 && pip(x, z, r))

// one loader, one parameter (checks/tier.mjs follows the import to its source)
const loadTG = async (tgUrl) => import(tgUrl)
const TGF = join(ROOT, 'src/lib/tileGround.js')
const ANCHOR = 'const isHighwayRun = (run) => !!run?.hwy'
const NOHWY = 'const isHighwayRun = (run) => false'
const CLIP = pathToFileURL(join(ROOT, 'node_modules/clipper-lib/clipper.js')).href
const RE_PKG = /from 'clipper-lib'/g, RE_LIB = /from '\.\/([^']+)'/g, RE_SRC = /from '\.\.\/([^']+)'/g
const toLib = (_, m) => `from '${pathToFileURL(join(ROOT, 'src/lib', m)).href}'`, toSrc = (_, m) => `from '${pathToFileURL(join(ROOT, 'src', m)).href}'`
const mutantTG = () => { const tgSrc = readFileSync(TGF, 'utf8')
  if (tgSrc.split(ANCHOR).length !== 2) throw new Error('selftest: tileGround.js no longer defines isHighwayRun as read — re-aim the mutation')
  const tgPath = join(mkdtempSync(join(tmpdir(), 'verge-bare-')), 'tileGround.js')
  writeFileSync(tgPath, tgSrc.replace(ANCHOR, NOHWY).replace(RE_PKG, `from '${CLIP}'`).replace(RE_LIB, toLib).replace(RE_SRC, toSrc))
  return pathToFileURL(tgPath).href }

// a band piece's owner run on this tile: `r<t>/…` and an arc's `a<arc>/<t>` name the stamp run t; a cap `c<k>/…` its cap
const ownerRun = (t, span) => { const s = String(span), r = s.match(/^r(\d+)\//) || s.match(/^a\d+\/(\d+)/)
  if (r) return (t.runs || [])[+r[1]] || null
  const c = s.match(/^c(\d+)/); return c ? (t.caps || [])[+c[1]] || null : null }
const isTown = (run) => !!run && !run.hwy && !String(run.skelId).startsWith('__')

// one look, judged with tileGround module TG: { line, bad: [..] } or { notChecked }
function judge(TG, look) {
  const p = shapeOverride || join(ROOT, 'public/baked', look, 'shape.json')
  if (!existsSync(p)) return { notChecked: `no ${p}` }
  const shape = JSON.parse(readFileSync(p, 'utf8')), tiles = shape.tiles || []
  const stamped = tiles.some(t => (t.runs || []).some(r => r.hwy))
  if (!(shape.highway || []).length) return { none: 'no highway in this town' }
  if (!stamped) return { notChecked: 'highways but no `hwy` stamp: frozen before H-3. Re-bake.' }
  const lookEntry = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8')).looks.find(l => l.id === look)
  const designP = join(ROOT, 'public/looks', look, 'design.json')
  if (!existsSync(designP)) return { notChecked: `no ${designP}` }
  const design = JSON.parse(readFileSync(designP, 'utf8'))
  const blockCustoms = design.blockCustoms || null
  // ⭐ THE PRODUCT'S DOOR: buildTileGround → sectionOpen → sectionPassProtoTile(tile, cw, mat, blockCustoms, cornerOverrides),
  // cornerOverrides being the town's cornerCornerRadiusOverrides (the corner flags) — both, as the bake passes them; in
  // pieces mode, so each sample's band names its owner.
  const cornerOverrides = (design.cornerCornerRadiusOverrides && typeof design.cornerCornerRadiusOverrides === 'object') ? design.cornerCornerRadiusOverrides : null
  const cw = resolveCurbWidth(design).value   // the bake's curb: authored, else the kit's
  const warnNoEntry = !lookEntry
  const o = console.log, w = console.warn; console.log = console.warn = () => {}
  let verge = 0, vergeBad = [], edges = 0, edgeBad = [], townHeld = 0
  try {
    for (const [ti, t] of tiles.entries()) {
      const out = TG.sectionPassProtoTile(t, cw, { outer: 'LU', inner: 'SW' }, blockCustoms, cornerOverrides, { pieces: true })   // WITH the look's authoring (Layer 0 q3)
      const bands = [...(out.curb || []), ...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()]
      if (t.blockClass === 'verge') {
        verge++
        const a = bands.reduce((s, r) => s + area(r), 0)
        const lus = TG.tilePieceLus(t).filter(Boolean)   // ⭐ EVERY piece of a verge is verge
        if (a > 1e-3 || lus.some(l => l !== 'verge')) vergeBad.push(`tile ${ti} (lu ${[...new Set(lus)].join('+')}, ${a.toFixed(2)} m² of curb/ped)`)
        continue
      }
      const runs = t.runs || [], pieces = out.bandPieces || []
      ;(t.iaFull || []).forEach((ring, ri) => ring.forEach((a, i) => {
        const r = t.iaStamp?.[ri]?.[i]; if (r == null || !runs[r]?.hwy) return
        const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) return
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L
        // the inward side is the one inside the tile's own contour
        const s = inAny(mx + nx * cw / 2, mz + nz * cw / 2, t.iaFull.filter(q => q?.length >= 3)) ? 1 : -1
        const x = mx + s * nx * cw / 2, z = mz + s * nz * cw / 2
        edges++
        if (!inAny(x, z, bands)) return
        // ⭐ BY OWNER: a band a TOWN run holds is that town edge's (a sharp town↔highway corner runs its ped up to H)
        const holding = pieces.filter(q => q.rings.some(rr => rr?.length >= 3 && pip(x, z, rr)))
        if (holding.some(q => (q.owners || []).some(o => isTown(ownerRun(t, o.span))))) { townHeld++; return }
        const names = [...new Set(holding.flatMap(q => (q.owners || []).map(o => ownerRun(t, o.span)?.skelId ?? String(o.span))))]
        edgeBad.push(`tile ${ti} @(${mx.toFixed(1)}, ${mz.toFixed(1)}) ${runs[r].skelId}: in ${holding.length ? `a band held by ${names.join('+')}` : 'paint no band piece holds'}`)
      }))
    }
  } finally { console.log = o; console.warn = w }
  return { verge, vergeBad, edges, edgeBad, townHeld, warnNoEntry }
}
const report = (look, j) => {
  if (j.notChecked) { console.log(`── ${look}   ⛔ NOT CHECKED — ${j.notChecked}`); return true }
  if (j.none) { console.log(`── ${look}   ${j.none}`); return false }
  if (j.warnNoEntry) console.log(`   ⚠️ ${look} is not in public/looks/index.json — judged without authoring`)
  const bad = j.vergeBad.length + j.edgeBad.length
  console.log(`── ${look} ── ${j.verge} verge tile(s)${j.vergeBad.length ? ` · ⛔ ${j.vergeBad.length} carry curb/ped or another land use` : ' bare, land use verge'} · ${j.edges} highway-owned edge(s) on other tiles${j.edgeBad.length ? ` · ⛔ ${j.edgeBad.length} have a highway's curb/ped against H` : ' bare'}${j.townHeld ? ` (${j.townHeld} sample(s) in a town run's band, by owner: a sharp corner's)` : ''} ${bad ? '⛔' : '✅'}`)
  for (const b of [...j.vergeBad, ...j.edgeBad].slice(0, 8)) console.log(`   ⛔ ${b}`)
  return bad > 0
}

const TG = await loadTG(pathToFileURL(TGF).href)
const looks = shapeOverride ? named : scenes('public/baked/<scene>/shape.json')
if (SELF) {
  const tgCopy = mutantTG()
  const TGm = await loadTG(tgCopy)
  let ran = 0, missed = 0
  for (const look of looks) { const live = judge(TG, look), mut = judge(TGm, look)
    if (live.notChecked || live.none || !live.edges) { console.log(`  ⚪ ${look}: no highway edge to judge — the mutant cannot be seen here, said`); continue }
    ran++; const caught = mut.edgeBad.length > live.edgeBad.length
    if (!caught) missed++
    console.log(`  ${caught ? '✅' : '⛔'} ${look}: isHighwayRun → false paints ped on H's edges, held by highway runs → ${mut.edgeBad.length} edge(s) (live ${live.edgeBad.length})${mut.edgeBad[0] ? ` — e.g. ${mut.edgeBad[0]}` : ''}`) }
  const ok = ran && !missed
  console.log(ok ? '\n✅ selftest: a highway\'s ped on H\'s edge is RED, through its owner' : '\n⛔ selftest: the instrument missed the mutant (or no town could show it)')
  process.exit(ok ? 0 : 1)
}
let red = false
for (const look of looks) if (report(look, judge(TG, look))) red = true
console.log(red ? '\n⛔ A verge or a highway edge carries curb or ped — or a shape could not be judged.' : '\n✅ Every verge is bare grass, and every highway edge is bare.')
process.exit(red ? 1 : 0)
