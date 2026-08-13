// READ-ONLY. DOES `bodyOf` HAND THE SAME LEG TO BOTH SHOULDERS?
//
// Replicates tileGround.js:2362-2380 exactly (bodyOf + the two-sign pick) against
// each scene's own frozen shape.json + its own authored design.json. Nothing here
// is LS-specific: every number comes out of the scene's own artifact.
//
// Per cap it reports:
//   axis          the averaged tip→body direction (:1671-1683)
//   offs          each candidate leg's offset across perp(axis), from `node`
//   pick+/pick-   which leg each shoulder resolves to
//   SAME          both shoulders resolved to the same rr entry  ⇒ the defect
//   DECIDES       the two candidate legs differ in parity or total  ⇒ the pick
//                 changes the built geometry (otherwise SAME is harmless)
//
//   node scratch/tessel-bodyof-pairing.mjs [scene]      (default all scenes)
import fs from 'node:fs'
import { resolvePedDepths } from '../src/lib/tileGround.js'

const o = console.log
const SCENES = process.argv[2] ? [process.argv[2]]
  : fs.readdirSync('public/baked').filter(d => fs.existsSync(`public/baked/${d}/shape.json`))
const H = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])

for (const scene of SCENES) {
  const sh = JSON.parse(fs.readFileSync(`public/baked/${scene}/shape.json`, 'utf8'))
  const design = (() => { try { return JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`, 'utf8')) } catch { return {} } })()
  const bc = design.blockCustoms || null
  const CW = design.curbWidth ?? 0.1524
  const TILES = Array.isArray(sh) ? sh : (sh.tiles || [])

  const runCustom = (run) => {
    if (!bc || !run.skelId || run.segOrd == null) return null
    return bc?.[run.skelId]?.[run.side]?.[run.segOrd] ?? null
  }
  const edgeA = (m, side) => {
    const v = m?.[side]?.pavementHW
    return Math.max(0, Number.isFinite(v) ? v : 0)
  }

  let nCaps = 0, nSame = 0, nSameDecides = 0, nNoAxis = 0, nNoOwners = 0
  const rows = []
  TILES.forEach((st, ti) => {
    const runs = st.runs || []
    for (const t of (st.roundTips || [])) {
      if (!t.skelId || !t.capEnd) continue
      nCaps++
      // ── axis: averaged over both owning legs (:1671-1683) ──
      let ax = 0, az = 0, nAx = 0
      for (const run of runs) {
        const nP = run.poly.length
        for (const ix of [0, nP - 1]) {
          if (H(run.poly[ix], t.p) >= 1.5) continue
          const b = run.poly[ix === 0 ? 1 : nP - 2]
          if (!b) continue
          const l = H(b, t.p) || 1
          ax += (b[0] - t.p[0]) / l; az += (b[1] - t.p[1]) / l; nAx++
          break
        }
      }
      if (!nAx) { nNoAxis++; continue }
      const l = Math.hypot(ax, az) || 1
      const a = [ax / l, az / l]
      const node = t.p
      const perp0 = [-a[1], a[0]]

      // ── rr entries for this tile's runs (only what the pick + firing test need) ──
      const rr = runs.map((run, ri) => {
        const aBase = edgeA(run.baseMeasure, run.side)
        const noPed = aBase <= 1e-6
        const c = runCustom(run)
        const ped = noPed ? { tl: 0, sw: 0, hasTL: false } : resolvePedDepths(run.baseMeasure, run.side, c)
        const oD = ped.hasTL ? ped.tl : ped.sw
        const inn = ped.hasTL ? ped.sw : ped.tl
        const defMat = ped.hasTL ? { outer: 'LU', inner: 'SW' } : { outer: 'SW', inner: 'LU' }
        const cm = c?.materials
        const mat = cm ? { outer: cm.outer === 'SW' ? 'SW' : 'LU', inner: cm.inner === 'LU' ? 'LU' : 'SW' } : defMat
        return { ri, run, aBase, total: oD + inn, mat }
      })

      // ── bodyOf (:2362-2367) ──
      const bodyOf = (run) => {
        const nP = run.poly.length
        if (H(run.poly[0], node) < 1.5) return run.poly[1]
        if (H(run.poly[nP - 1], node) < 1.5) return run.poly[nP - 2]
        return null
      }
      const owners = []
      for (const e of rr) {
        const b = bodyOf(e.run)
        if (b) owners.push({ e, off: (b[0] - node[0]) * perp0[0] + (b[1] - node[1]) * perp0[1] })
      }
      if (!owners.length) { nNoOwners++; continue }

      // ── the two-sign pick (:2374-2380) ──
      const picks = {}
      for (const sign of [1, -1]) {
        let pick = null
        for (const ow of owners) { const s = ow.off * sign; if (!pick || s > pick.s) pick = { e: ow.e, s } }
        picks[sign] = pick.e
      }
      const same = picks[1] === picks[-1]
      // Does the pick DECIDE anything? Only if the candidate legs differ in what
      // the coupler reads: walk parity (mat.outer) or band total.
      const parities = new Set(owners.map(ow => ow.e.mat.outer === 'SW'))
      const totals = owners.map(ow => ow.e.total)
      const decides = parities.size > 1 || (Math.max(...totals) - Math.min(...totals) > 1e-6)
      if (same) { nSame++; if (decides) nSameDecides++ }
      rows.push({
        ti, id: t.skelId, end: t.capEnd, same, decides,
        offs: owners.map(ow => `${ow.e.run.side[0]}${ow.e.run.segOrd}:${ow.off.toFixed(3)}`).join(' '),
        aBases: owners.map(ow => ow.e.aBase.toFixed(2)).join('/'),
        totals: totals.map(v => v.toFixed(2)).join('/'),
        pars: owners.map(ow => ow.e.mat.outer).join('/'),
      })
    }
  })
  o(`\n══ ${scene}   (${Object.keys(bc || {}).length} authored blockCustoms entries)`)
  if (!nCaps) { o('   no round caps in this scene'); continue }
  o(`   round caps ${nCaps}   both shoulders → SAME leg ${nSame}   of those, the pick DECIDES ${nSameDecides}   (no axis ${nNoAxis}, no owners ${nNoOwners})`)
  const ctrl = rows.filter(r => !r.same && r.decides); if (ctrl.length) { o(`   CONTROL — legs differ, pairing OK: ${ctrl.length}`); for (const r of ctrl.slice(0,10)) o(`      ${String(r.id).padEnd(24)}${String(r.end).padEnd(6)} offs[${r.offs}] total ${r.totals} outer ${r.pars}`) }
  const show = rows.filter(r => r.same).sort((x, y) => (y.decides ? 1 : 0) - (x.decides ? 1 : 0))
  for (const r of show.slice(0, 40)) {
    o(`   ${r.decides ? '⛔' : '  '} ${String(r.id).padEnd(24)}${String(r.end).padEnd(6)} offs[${r.offs}] aBase ${r.aBases}  total ${r.totals}  outer ${r.pars}`)
  }
}
// (appended) CONTROL LIST — caps whose legs DIFFER but which resolve to TWO
// distinct legs. Same authoring situation, correct pairing ⇒ the control.
