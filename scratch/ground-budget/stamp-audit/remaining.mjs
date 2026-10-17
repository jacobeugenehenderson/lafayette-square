// remaining.mjs — after (a): which ② vertices still have no height, counted per vertex, from run2.sh's dump. Builds the
// counting copy of the deformer (the throw recorded, not thrown) on the dumped tiles, then lists every heightless vertex by
// class, and joins the unstamped ones to offsetRingByRects' null-label probe (why the ② edge took no label).
//   node scratch/ground-budget/stamp-audit/remaining.mjs stamp2-<town>.json <town>
import { readFileSync } from 'fs'
import { buildDeformer } from './groundDeformer.count.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
const [file, town] = process.argv.slice(2), D0 = JSON.parse(readFileSync(file, 'utf8')), T = loadSceneTerrain(town)
const D = buildDeformer({ town, tiles: D0.tiles, bands: { curb: [], lawn: [], walk: [] }, raw: T.getElevationRaw, limits: { walkMax: 0.02, lawnMax: 0.29, exag: T.exag, blend: 5, sigma: 5 } })
console.log(`rings refused ${D.stats.missing?.length || 0} · onTerrain reads ${D.stats.onTerrain} · arcBlended ${D.stats.arcBlended}`)
// per vertex: every ② vertex that is neither stamped with a line-bearing run nor a cap with a height
let unst = 0, capNo = 0, runNo = 0; const unstPts = []
for (const t of D0.tiles) (t.iaFull || []).forEach((ring, ri) => ring.forEach((p, i) => {
  const s = t.iaStamp?.[ri]?.[i], c = t.iaCap?.[ri]?.[i]
  if (s == null && c == null) { unst++; unstPts.push(p) }
  else if (s == null && t.iaCapH?.[ri]?.[i] == null && !['highway', 'bridge'].includes(t.caps[c].noLine)) capNo++
  else if (s != null && !Array.isArray(t.runs[s].h) && !['highway', 'bridge'].includes(t.runs[s].noLine)) runNo++ }))
console.log(`② vertices with no height source: unstamped (no run, no cap) ${unst} · cap whose chain has no line ${capNo} · run with no line and no rule ${runNo}`)
// the probe: a null-label edge's start vertex, before the ease and the merges — join by exact coordinate, else nearest within 1 mm
const off = D0.offNull || [], key = (p) => `${p[0]},${p[1]}`, byP = new Map(off.map(o => [key(o.p), o]))
const cls = new Map(), ex = []
for (const p of unstPts) { let o = byP.get(key(p))
  if (!o) { let bd = 1e-3; for (const q of off) { const d = Math.hypot(q.p[0] - p[0], q.p[1] - p[1]); if (d < bd) { bd = d; o = q } } }
  const k = !o ? 'no probe record within 1 mm (label lost after labelOf: merge/ease)' : o.cands === 0 ? 'no contributor in the cell' : o.eL <= o.TOLC ? `edge shorter than TOLC (${(o.TOLC * 1000).toFixed(0)} mm)` : o.nb.mo > o.TOLC ? 'edge lies on no contributor (off its line > TOLC)' : 'on a contributor\'s line, outside its extent'
  cls.set(k, (cls.get(k) || 0) + 1); if (ex.length < 400) ex.push({ p, k, o }) }
console.log(`probe records ${off.length} (every null-label ② edge offsetRingByRects emitted, before filtering)`)
for (const [k, v] of [...cls].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
const offs = ex.filter(e => e.o?.nb).map(e => e.o.nb.mo).sort((a, b) => a - b), eLs = ex.filter(e => e.o).map(e => e.o.eL).sort((a, b) => a - b)
if (offs.length) console.log(`  off-line distance p50 ${(offs[offs.length >> 1] * 1000).toFixed(2)} mm · max ${(offs.at(-1) * 1000).toFixed(2)} mm · edge length p50 ${(eLs[eLs.length >> 1] * 1000).toFixed(1)} mm · max ${(eLs.at(-1)).toFixed(3)} m`)
const kinds = new Map(); for (const e of ex) if (e.o?.nb) kinds.set(e.o.nb.kind, (kinds.get(e.o.nb.kind) || 0) + 1); console.log(`  nearest contributor kind: ${[...kinds].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
for (const e of ex.slice(0, 8)) console.log(`   (${e.p[0].toFixed(3)}, ${e.p[1].toFixed(3)}) ${e.k}${e.o ? ` · edge ${(e.o.eL * 1000).toFixed(1)} mm · nearest kind ${e.o.nb?.kind} off ${(e.o.nb?.mo * 1000).toFixed(2)} mm overlap ${(e.o.nb?.ov * 1000).toFixed(2)} mm` : ''}`)
