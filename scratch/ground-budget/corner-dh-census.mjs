// THE ② LINE-HEIGHT CENSUS (Brace, 2026-10-13, Boz-approved; read-only). The deformer's H per ② vertex
// (`groundDeformer.mjs` tile loop, replicated verbatim: stamped through the vertex's run → corner arcs blended between their
// tangent vertices → any vertex still without H filled from its ring neighbours), each vertex tagged with its ORIGIN, and
// every ② segment's |ΔH| over its length. Measured on Huron tile 10 (ring-h.mjs): two ABUTTING arcs each have a tangent
// on the other arc with no stamp, so neither is blended; the fill runs in place, so one side's H crosses the whole gap and
// the change to the other side lands on the last segment.
// Line heights are stamped as bake-ground stamps them (`lineHeights` over the town's ribbons, σ = groundLineSigmaM else one
// grid step; __water__ at the high water; bridge/highway/rim/unknown carry none). Sites are named from the polygon: the
// nearest STAMPED vertex on each side along the ring, by its run's skelId/side/segOrd (never by nearest street, A15).
// Input: the served shape.json, or --dump=<dir> for a deform.json whose runs already carry h (the deformer's own input).
//   node --max-old-space-size=8000 scratch/ground-budget/corner-dh-census.mjs <town> [...] [--dump=<dir>]
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { lineHeights } = await import(R + 'cartograph/lineHeight.mjs')
const { waterLevels } = await import(R + 'cartograph/waterLevel.mjs')
const { ribbonsPathOf } = await import(R + 'cartograph/scene.js')
const { readBakeDesign } = await import(R + 'cartograph/lookDesign.mjs')
const { resolveWalkNorm } = await import(R + 'cartograph/curb-cut-norm.mjs')
const sq = x => x * x, pct = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : NaN
const dumpArg = process.argv.find(a => a.startsWith('--dump='))?.slice(7)
for (const town of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
  const ribbons = JSON.parse(readFileSync(ribbonsPathOf(town), 'utf8')), T = loadSceneTerrain(town)
  const bridgeIds = new Set((ribbons.streets || []).filter(s => s?.gradeSeparated).map(s => s.skelId ?? s.name))
  const kindOf = (run) => !run ? 'none' : run.skelId === '__water__' ? 'coast' : run.skelId === '__highway__' ? 'highway' : run.skelId === '__boundary__' ? 'rim' : bridgeIds.has(run.skelId) ? 'bridge' : Array.isArray(run.h) ? 'line' : 'unknown'
  let tiles, src
  if (dumpArg) { tiles = JSON.parse(readFileSync(dumpArg + '/deform.json', 'utf8')).tiles; src = `${dumpArg}/deform.json (h as baked)` }
  else {
    tiles = JSON.parse(readFileSync(R + `public/baked/${town}/shape.json`, 'utf8')).tiles
    const design = readBakeDesign(town, town, 'corner-dh-census')
    const sigma = Number.isFinite(design.groundLineSigmaM) && design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
    if (!(sigma > 0)) throw new Error(`${town}: no line window`)
    const LH = lineHeights({ streets: ribbons.streets, raw: T.getElevationRaw, sigma }), W = T.water ? waterLevels(T.water) : null
    for (const t of tiles) for (const run of t.runs || []) {
      if (run.skelId === '__water__') { if (!W) throw new Error(`${town} draws a coast with no water record`); run.h = run.poly.map(([x, z]) => W.highAt(x, z)); continue }
      const h = (run.poly || []).map(p => LH.heightAt(run.skelId, p)); run.h = h.length && h.every(v => v != null) ? h : null }
    src = `served shape.json, h stamped at HEAD (σ ${sigma.toFixed(2)} m)`
  }
  const tally = { rings: 0, arcs: 0, blended: 0, skipped: 0, skippedWhy: {}, verts: 0, stamped: 0, filled: 0 }
  const segs = []
  tiles.forEach((t, ti) => {
    if (!(t?.ring?.length >= 3) || !t.iA?.length || !t.iaFull?.length || !t.iaStamp?.length) return
    const runs = t.runs || []
    const hOfRun = (ri, p) => { const run = runs[ri]; if (!run || !Array.isArray(run.h)) return null
      let best = Infinity, out = null
      for (let i = 0; i + 1 < run.poly.length; i++) { const a = run.poly[i], b = run.poly[i + 1], ha = run.h[i], hb = run.h[i + 1]; if (ha == null || hb == null) continue
        const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
        const d2 = sq(p[0] - a[0] - u * dx) + sq(p[1] - a[1] - u * dz); if (d2 < best) { best = d2; out = ha + u * (hb - ha) } }
      if (out == null && run.poly.length === 1 && run.h[0] != null) out = run.h[0]
      return out }
    t.iaFull.forEach((ring, ri) => {
      if (!(ring?.length >= 3)) return
      const n = ring.length, H = new Array(n).fill(null), arc = t.iaArc?.[ri] || [], stamp = t.iaStamp?.[ri] || [], O = new Array(n).fill(null)
      for (let i = 0; i < n; i++) if (arc[i] == null && stamp[i] != null) { const h = hOfRun(stamp[i], ring[i]); if (h != null) { H[i] = h; O[i] = 'S' } }
      for (let i = 0; i < n; i++) {
        if (arc[i] == null || arc[(i + n - 1) % n] === arc[i]) continue
        let j = i; const id = arc[i], span = []
        while (arc[j % n] === id && span.length < n) { span.push(j % n); j++ }
        const before = (i + n - 1) % n, after = j % n; tally.arcs++
        const hb = H[before] ?? (stamp[before] != null ? hOfRun(stamp[before], ring[before]) : null), ha = H[after] ?? (stamp[after] != null ? hOfRun(stamp[after], ring[after]) : null)
        if (hb == null || ha == null) { tally.skipped++
          const why = (v, h) => h != null ? 'ok' : arc[v] != null ? 'on-another-arc' : stamp[v] == null ? 'no-stamp' : kindOf(runs[stamp[v]])
          const k = [why(before, hb), why(after, ha)].sort().join('+'); tally.skippedWhy[k] = (tally.skippedWhy[k] || 0) + 1; continue }
        tally.blended++
        const pts = [before, ...span, after]; let L = 0; const cum = [0]
        for (let k = 1; k < pts.length; k++) { L += Math.hypot(ring[pts[k]][0] - ring[pts[k - 1]][0], ring[pts[k]][1] - ring[pts[k - 1]][1]); cum.push(L) }
        span.forEach((v, k) => { H[v] = L > 0 ? hb + (ha - hb) * cum[k + 1] / L : hb; O[v] = 'B' })
      }
      if (!H.some(h => h != null)) return
      tally.rings++
      for (let pass = 0; pass < n && H.some(h => h == null); pass++) for (let i = 0; i < n; i++) if (H[i] == null) {
        const a = H[(i + n - 1) % n], b = H[(i + 1) % n]; if (a != null || b != null) { H[i] = a != null && b != null ? (a + b) / 2 : (a ?? b); O[i] = 'F' } }
      tally.verts += n; tally.stamped += O.filter(o => o === 'S').length; tally.filled += O.filter(o => o === 'F').length
      const nameAt = (i, dir) => { for (let k = 0; k < n; k++) { const v = (i + dir * k + n * n) % n; if (O[v] === 'S') { const r = runs[stamp[v]]; return `${r.skelId}/${r.side}/${r.segOrd} [${kindOf(r)}]` } } return '—' }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, ds = Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]), dH = Math.abs(H[j] - H[i])
        if (dH > 0) segs.push({ dH, ds, g: ds > 0 ? dH / ds : Infinity, o: [O[i], O[j]].sort().join(''), at: ring[i], ti, ri, i, names: () => `${nameAt(i, -1)} ↔ ${nameAt(j, 1)}` }) }
    })
  })
  const walk = resolveWalkNorm(town, null)
  console.log(`\n== ${town} · ${src} · exag ${T.exag} · walk limit ${walk.crossSlopeMaxText ?? 'none named'}`)
  console.log(`   ② rings ${tally.rings} · vertices ${tally.verts}: stamped ${tally.stamped} · filled ${tally.filled} · corner arcs ${tally.arcs}: blended ${tally.blended} · NOT blended ${tally.skipped} ${JSON.stringify(tally.skippedWhy)}`)
  for (const o of ['SS', 'BS', 'BB', 'FS', 'BF', 'FF']) { const g = segs.filter(s => s.o === o).map(s => s.g).sort((p, q) => p - q)
    if (g.length) console.log(`   grade along ②, ${o.padEnd(2)} segments (S stamped · B blended · F filled): n ${g.length} · p50 ${(100 * pct(g, .5)).toFixed(2)}% · p99 ${(100 * pct(g, .99)).toFixed(1)}% · max ${(100 * g.at(-1)).toFixed(0)}% · > 100%: ${g.filter(x => x > 1).length}`) }
  const steps = segs.filter(s => s.g > 1)
  const sum = (o) => steps.filter(s => s.o === o).reduce((a, s) => a + s.dH, 0)
  console.log(`   STEPS (a ② segment rising more than it runs, > 100%): ${steps.length} · by origin ${['SS', 'FS', 'FF', 'BS', 'BB', 'BF'].map(o => `${o} ${steps.filter(s => s.o === o).length} (ΣΔH ${sum(o).toFixed(1)} m)`).join(' · ')} · ΔH p50 ${pct(steps.map(s => s.dH).sort((p, q) => p - q), .5).toFixed(3)} m · max ${Math.max(0, ...steps.map(s => s.dH)).toFixed(3)} m`)
  const top = [...steps].sort((p, q) => q.dH - p.dH).slice(0, 20)
  for (const s of top) console.log(`   ΔH ${s.dH.toFixed(3)} m over ${s.ds.toFixed(2)} m (${(100 * s.g).toFixed(0)}%) · ${s.o} · (${s.at.map(v => v.toFixed(1))}) tile ${s.ti} ring ${s.ri} v ${s.i} · ${s.names()}`)
}
