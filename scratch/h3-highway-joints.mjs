// READ-ONLY probe (H-3 design review, 2026-09-23). The highway fragments' JOINTS, per town:
// endpoint degree among gs chains (exact-coord key), heading change at degree-2 joints, lane change across
// them, oneway mix, and endpoints that touch a NON-gs street (at-grade join) or nothing (loose end).
import fs from 'node:fs'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['huron', 'lafayette-square', 'hipointe-demun', 'altadena']
const P = p => Array.isArray(p) ? p : [p.x, p.z], K = p => `${P(p)[0].toFixed(2)},${P(p)[1].toFixed(2)}`
const lanes = s => { const v = parseInt(s.lanes ?? s.tags?.lanes, 10); return Number.isFinite(v) ? v : null }
for (const t of towns) {
  const f = `cartograph/data/${t}/clean/skeleton.json`, all = JSON.parse(fs.readFileSync(f)).streets
  const gs = all.filter(s => s.gradeSeparated && s.points.length >= 2), hw = gs.filter(s => /^(motorway|trunk)/.test(s.highway))
  const ends = new Map(), anyV = new Map()
  for (const s of gs) for (const [e, i] of [['s', 0], ['e', s.points.length - 1]]) { const k = K(s.points[i]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ s, e }) }
  for (const s of all.filter(s => !s.gradeSeparated)) for (const p of s.points) anyV.set(K(p), s.id)
  const deg = {}, turns = [], laneSteps = [], atGrade = [], loose = []
  for (const [k, L] of ends) {
    deg[L.length] = (deg[L.length] || 0) + 1
    if (L.length === 1) (anyV.has(k) ? atGrade : loose).push(`${L[0].s.id}@${k}`)
    if (L.length === 2) {
      const [a, b] = L, dir = ({ s, e }) => { const p = s.points, i = e === 's' ? 0 : p.length - 1, j = e === 's' ? 1 : p.length - 2; const A = P(p[i]), B = P(p[j]); return Math.atan2(B[1] - A[1], B[0] - A[0]) }
      let d = Math.abs(dir(a) - dir(b)) * 180 / Math.PI; d = d > 180 ? 360 - d : d; turns.push(180 - d)
      const la = lanes(a.s), lb = lanes(b.s); if (la != null && lb != null && la !== lb) laneSteps.push(`${a.s.id}(${la})→${b.s.id}(${lb})`)
    }
  }
  turns.sort((x, y) => x - y)
  const ow = hw.filter(s => s.oneway).length
  const lc = {}; for (const s of hw) { const l = lanes(s) ?? 'NONE'; lc[`${s.highway}:${l}`] = (lc[`${s.highway}:${l}`] || 0) + 1 }
  console.log(`${t} [skeleton ${fs.statSync(f).mtime.toISOString()}] gs ${gs.length} · hwy ${hw.length} (oneway ${ow})`)
  console.log(`   endpoint degree among gs: ${JSON.stringify(deg)} · deg-2 joint turn° p50/p90/max ${turns.length ? [.5, .9, 1].map(q => turns[Math.floor(q * (turns.length - 1))].toFixed(1)).join('/') : '-'}`)
  console.log(`   lane step across a deg-2 joint: ${laneSteps.length}${laneSteps.length ? ' e.g. ' + laneSteps.slice(0, 4).join(', ') : ''}`)
  console.log(`   deg-1 end touching a town street (at-grade join): ${atGrade.length} · touching nothing (loose): ${loose.length}${loose.length ? ' e.g. ' + loose.slice(0, 4).join(', ') : ''}`)
  console.log(`   class:lanes ${JSON.stringify(lc)}`)
}
