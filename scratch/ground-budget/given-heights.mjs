// given-heights.mjs — THE ② CARRIER HEIGHTS, BEFORE AND AFTER THE NEIGHBOUR FILL IS DELETED (Tern, 2026-10-13; Boz's rulings).
// READ-ONLY. Over a served shape.json, stamped by the bake's own stamper (`lineHeight.mjs#stampRunHeights`), per ② ring:
//   TODAY    — the deleted algorithm, verbatim (stamped → arcs blended between straight tangents → the rest FILLED from
//              ring neighbours in place, left to right)
//   JOINED   — the shipped `carrierHeights` with the arc's own tangent fallback switched OFF (Boz's joined span alone)
//   SHIPPED  — `groundDeformer.mjs#carrierHeights`, imported (given = a stamped straight OR an arc's stamped tangent)
// It prints, per rule: filled vertices · vertices whose H CHANGED from today where today was already given (stamped or
// blended; should be 0) · STEPS (a ② segment rising more than it runs, Brace's census definition) and their ΣΔH · and,
// for the shipped rule, THE EASE (Boz's ruling (b)): from every given vertex beside a declared one, H along ② eases into the
// terrain over the deformer's own ease B (`design.json#groundBlendM`, else one terrain step), evaluated by the deformer's
// own `carrierHeightAt` every 1 cm; the steepest |dH/ds| over that ease, and the top sites by run.
//   node --max-old-space-size=8000 scratch/ground-budget/given-heights.mjs <town> [<shape.json>]
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const { carrierHeights, carrierHeightAt, hOfRunIn } = await import(R + 'cartograph/groundDeformer.mjs')
const { lineHeights, stampRunHeights } = await import(R + 'cartograph/lineHeight.mjs')
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { waterLevels } = await import(R + 'cartograph/waterLevel.mjs')
const { ribbonsPathOf } = await import(R + 'cartograph/scene.js')
const { readBakeDesign } = await import(R + 'cartograph/lookDesign.mjs')
const [town, shapePath] = process.argv.slice(2)
const tiles = JSON.parse(readFileSync(shapePath || R + `public/baked/${town}/shape.json`, 'utf8')).tiles
const T = loadSceneTerrain(town), design = readBakeDesign(town, town, 'given-heights')
const sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const B = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const ribbons = JSON.parse(readFileSync(ribbonsPathOf(town), 'utf8'))
stampRunHeights({ tiles, LH: lineHeights({ streets: ribbons.streets, raw: T.getElevationRaw, sigma }), water: T.water ? waterLevels(T.water) : null, streets: ribbons.streets, scene: town })

// TODAY, verbatim from groundDeformer.mjs before this change (the tile loop's H pass)
function today({ ring, arc, stamp, hOfRun }) {
  const n = ring.length, H = new Array(n).fill(null), origin = new Array(n).fill(null)
  for (let i = 0; i < n; i++) if (arc[i] == null && stamp[i] != null) { const h = hOfRun(stamp[i], ring[i]); if (h != null) { H[i] = h; origin[i] = 'stamped' } }
  for (let i = 0; i < n; i++) {
    if (arc[i] == null || arc[(i + n - 1) % n] === arc[i]) continue
    let j = i; const id = arc[i], span = []
    while (arc[j % n] === id && span.length < n) { span.push(j % n); j++ }
    const before = (i + n - 1) % n, after = j % n
    const hb = H[before] ?? (stamp[before] != null ? hOfRun(stamp[before], ring[before]) : null), ha = H[after] ?? (stamp[after] != null ? hOfRun(stamp[after], ring[after]) : null)
    if (hb == null || ha == null) continue
    const pts = [before, ...span, after]; let L = 0; const cum = [0]
    for (let k = 1; k < pts.length; k++) { L += Math.hypot(ring[pts[k]][0] - ring[pts[k - 1]][0], ring[pts[k]][1] - ring[pts[k - 1]][1]); cum.push(L) }
    span.forEach((v, k) => { H[v] = L > 0 ? hb + (ha - hb) * cum[k + 1] / L : hb; origin[v] = 'blended' })
  }
  if (!H.some(h => h != null)) return { H: null, origin }
  for (let pass = 0; pass < n && H.some(h => h == null); pass++) for (let i = 0; i < n; i++) if (H[i] == null) {
    const a = H[(i + n - 1) % n], b = H[(i + 1) % n]; if (a != null || b != null) { H[i] = a != null && b != null ? (a + b) / 2 : (a ?? b); origin[i] = 'filled' } }
  return { H, origin }
}
// JOINED: the shipped function's own SOURCE with its two tangent-fallback lines removed (Boz's joined span alone)
const src = readFileSync(R + 'cartograph/groundDeformer.mjs', 'utf8')
const body = src.slice(src.indexOf('const DECLARED = '), src.indexOf('\n}\n', src.indexOf('export function carrierHeights')) + 3)
const cut = body.split('\n').filter(l => !/if \(h[ba] == null && span\.length > 1\)/.test(l))
if (cut.length !== body.split('\n').length - 2) throw new Error('given-heights: the tangent fallback is not two lines any more — re-aim JOINED')
const joined = new Function(cut.join('\n').replace('export function carrierHeights', 'function carrierHeights') + '\nreturn carrierHeights')()
const NOCAP = (a) => carrierHeights({ ...a, capOf: () => null })                // d63b43ea: a cap blended between its legs
const rules = { TODAY: today, JOINED: joined, NOCAP, SHIPPED: carrierHeights }
const out = {}
for (const k of Object.keys(rules)) out[k] = { changedBy: {}, filled: 0, changed: 0, refused: 0, steps: 0, sumDH: 0, maxStep: null, origins: {} }
const boundary = [], capDiff = []
const q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : NaN
tiles.forEach((t, ti) => {
  if (!(t?.ring?.length >= 3) || !t.iA?.length || !t.iaFull?.length || !t.iaStamp?.length) return
  const runs = t.runs || [], hOfRun = hOfRunIn(runs), noLineOf = (ri) => runs[ri]?.noLine ?? null, tcaps = t.capCouplers || []
  t.iaFull.forEach((ring, ri) => {
    if (!(ring?.length >= 3)) return
    const ic = t.iaCap?.[ri] || []
    const a = { ring, arc: t.iaArc?.[ri] || [], stamp: t.iaStamp?.[ri] || [], hOfRun, noLineOf, capOf: (i) => (ic[i] != null ? tcaps[ic[i]] : null) }
    let nocap = null; try { nocap = NOCAP(a) } catch {}
    const base = today(a)
    for (const [k, fn] of Object.entries(rules)) {
      let r; try { r = fn(a) } catch { out[k].refused++; continue }
      const O = out[k], n = ring.length
      for (const o of r.origin) O.origins[o ?? 'none'] = (O.origins[o ?? 'none'] || 0) + 1
      O.filled += r.origin.filter(o => o === 'filled').length
      if (!r.H) continue
      for (let i = 0; i < n; i++) {
        if (k !== 'TODAY' && base.H && (base.origin[i] === 'stamped' || base.origin[i] === 'blended') && Math.abs((r.H[i] ?? NaN) - base.H[i]) > 1e-9) { O.changed++; const w = `${base.origin[i]}→${r.origin[i]}${a.arc[i] != null ? ' (on an arc)' : ''}`; O.changedBy[w] = (O.changedBy[w] || 0) + 1 }
        const j = (i + 1) % n, ds = Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1])
        if (r.H[i] == null || r.H[j] == null) continue
        const dH = Math.abs(r.H[j] - r.H[i])
        if (dH > ds) { O.steps++; O.sumDH += dH; if (!O.maxStep || dH > O.maxStep.dH) O.maxStep = { dH, ds, at: ring[i].map(c => +c.toFixed(1)), tile: ti } }
      }
      if (k === 'SHIPPED' && nocap?.H) for (let i = 0; i < n; i++) if (r.origin[i] === 'cap' && nocap.H[i] != null) {
        const c = tcaps[ic[i]]; capDiff.push({ d: Math.abs(r.H[i] - nocap.H[i]), at: ring[i].map(v => +v.toFixed(1)), tile: ti, name: `${c.skelId} (${c.end})` }) }
      if (k === 'SHIPPED') {
        const end = (i) => r.H[i] != null ? { h: r.H[i] } : { h: null, side: r.side[i] }
        const segAt = (i) => [ring[i], ring[(i + 1) % n]]
        for (let i = 0; i < n; i++) for (const dir of [1, -1]) {
          if (r.H[i] == null || r.H[(i + dir + n) % n] != null) continue           // a given vertex whose next one (this way) has none
          // walk the ease away from i, segment by segment, every 1 cm, until H is null (the terrain shows) or B is passed
          let v = i, s = 0, prev = r.H[i], worst = 0, dropped = Math.abs(r.H[i] - T.getElevationRaw(...ring[i]))
          while (s < B + 1e-6) { const w = (v + dir + n) % n, a = dir > 0 ? v : w, [p, q] = segAt(a), L = Math.hypot(q[0] - p[0], q[1] - p[1])
            let done = false
            for (let t = 0.01; t <= L + 1e-9; t += 0.01) { const u = dir > 0 ? t / L : 1 - t / L, h = carrierHeightAt(end(a), end((a + 1) % n), p, q, u, T.getElevationRaw, B)
              if (h == null) { done = true; break }
              worst = Math.max(worst, Math.abs(h - prev) / 0.01); prev = h; if (s + t > B) { done = true; break } }
            if (done) break; s += L; v = w; if (v === i) break }
          const run = runs[a.stamp[i]]
          boundary.push({ grade: worst, gap: dropped, at: ring[i].map(c => +c.toFixed(1)), tile: ti, name: run ? `${run.skelId}/${run.side}/${run.segOrd}` : 'arc', kind: r.origin[(i + dir + n) % n] })
        }
      }
    }
  })
})
console.log(`${town}: ② carrier heights, three rules (served shape.json, stamped at this tree)`)
for (const [k, O] of Object.entries(out)) {
  console.log(`  ${k.padEnd(8)} filled ${O.filled} · changed where today was given ${k === 'TODAY' ? '—' : O.changed} · rings refused ${O.refused} · steps ${O.steps}, ΣΔH ${O.sumDH.toFixed(1)} m${O.maxStep ? `, max ${O.maxStep.dH.toFixed(3)} m over ${O.maxStep.ds.toFixed(2)} m at (${O.maxStep.at}) tile ${O.maxStep.tile}` : ''}`)
  if (O.changed) console.log(`           changed where today was given, by origin: ${JSON.stringify(O.changedBy)}`)
  console.log(`           ${Object.entries(O.origins).sort((x, y) => y[1] - x[1]).map(([o, c]) => `${o} ${c}`).join(' · ')}`)
}
capDiff.sort((x, y) => y.d - x.d); const CD = capDiff.map(c => c.d).sort((x, y) => x - y)
console.log(`  THE CAPS: ${capDiff.length} cap vertices · their chain's end height vs the blend between the legs (d63b43ea) |ΔH| p50 ${q(CD, .5).toFixed(3)} · p90 ${q(CD, .9).toFixed(3)} · max ${q(CD, 1).toFixed(3)} m`)
for (const c of capDiff.filter((c, i, A) => A.findIndex(x => x.name === c.name) === i).slice(0, 5)) console.log(`     ${c.d.toFixed(3)} m at (${c.at}) tile ${c.tile} · ${c.name}`)
const G = boundary.map(b => b.grade).sort((x, y) => x - y), D = boundary.map(b => b.gap).sort((x, y) => x - y)
console.log(`  THE EASE, SHIPPED (B ${B.toFixed(2)} m, ${design.groundBlendM > 0 ? 'design.json groundBlendM' : 'one terrain step'}): ${boundary.length} boundaries · the steepest grade along each ease p50 ${(100 * q(G, .5)).toFixed(1)}% · p90 ${(100 * q(G, .9)).toFixed(1)}% · max ${(100 * q(G, 1)).toFixed(1)}% · (what it takes up: |H − terrain| at the given vertex p50 ${q(D, .5).toFixed(3)} · p90 ${q(D, .9).toFixed(3)} · max ${q(D, 1).toFixed(3)} m)`)
for (const b of boundary.sort((x, y) => y.grade - x.grade).slice(0, 5)) console.log(`     ${(100 * b.grade).toFixed(1)}% (|H − terrain| ${b.gap.toFixed(3)} m) at (${b.at}) tile ${b.tile} · ${b.name} → ${b.kind}`)
