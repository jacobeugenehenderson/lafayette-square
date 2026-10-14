// unlabelled.mjs — THE ② VERTICES ① NEVER LABELLED: no run stamp (`iaStamp`) and no cap (`iaCap`). READ-ONLY (Tern, 2026-10-13; Boz).
// Over a shape.json, per ② ring (`iaFull`): every maximal run of such vertices (cyclic), with what the POLYGON says about it —
// the owners of the stamped runs on either side (`runs[iaStamp]`: skelId · side · segOrd), the vertex's arc / corner / junction
// marks, how far the run reaches along ②, and the turn at its ends. A ring frozen onto several tiles (SURVEY: one iaFull on
// consecutive tiles) is counted ONCE; the repeats are reported. ⛔ No street graph: owners are read off the polygon.
//   node scratch/ground-budget/unlabelled.mjs <shape.json> [top N]
import { readFileSync } from 'fs'
const [path, topN = 40] = process.argv.slice(2)
const tiles = JSON.parse(readFileSync(path, 'utf8')).tiles
const own = (t, r) => { const run = r == null ? null : t.runs?.[r]; return run ? `${run.skelId}|${run.side}|${run.segOrd}` : '—' }
const turn = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]
  return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI }
const groups = []
let verts = 0, un = 0, ringsAllUn = 0, repeats = 0, repeatUn = 0; const seen = new Set()
tiles.forEach((t, ti) => (t.iaFull || []).forEach((ring, ri) => {
  const S = t.iaStamp?.[ri] || [], C = t.iaCap?.[ri] || [], n = ring.length
  const isU = (i) => S[i] == null && C[i] == null
  const sig = JSON.stringify(ring); if (seen.has(sig)) { repeats++; repeatUn += ring.filter((_, i) => isU(i)).length; return } seen.add(sig)
  verts += n
  const U = ring.map((_, i) => isU(i)); const nu = U.filter(Boolean).length; un += nu
  if (!nu) return
  if (nu === n) { ringsAllUn++; groups.push({ ti, ri, n, len: n, all: true, at: ring[0], before: '—', after: '—', arc: 0, corner: 0, junction: 0, lenM: 0 }); return }
  let s = U.findIndex((u, i) => !u && U[(i + 1) % n]); // a labelled vertex followed by an unlabelled one
  for (let k = 0; k < n; k++) { const i0 = (s + 1 + k) % n
    if (!U[i0] || U[(i0 - 1 + n) % n]) continue
    let len = 0; while (U[(i0 + len) % n]) len++
    const idx = Array.from({ length: len }, (_, j) => (i0 + j) % n), pv = (i0 - 1 + n) % n, nx = (i0 + len) % n
    let lenM = 0; for (let j = 0; j <= len; j++) { const a = ring[(pv + j) % n], b = ring[(pv + j + 1) % n]; lenM += Math.hypot(b[0] - a[0], b[1] - a[1]) }
    const before = S[pv] != null ? own(t, S[pv]) : `cap:${t.capCouplers?.[C[pv]]?.skelId}`, after = S[nx] != null ? own(t, S[nx]) : `cap:${t.capCouplers?.[C[nx]]?.skelId}`
    groups.push({ ti, ri, n, len, lenM, at: ring[i0].map(v => +v.toFixed(2)), before, after,
      arc: idx.filter(i => t.iaArc?.[ri]?.[i] != null).length, corner: idx.filter(i => t.iaCorner?.[ri]?.[i]).length,
      junction: idx.filter(i => t.iaJunction?.[ri]?.[i] != null).length,
      turnMax: Math.max(...idx.map(i => turn(ring[(i - 1 + n) % n], ring[i], ring[(i + 1) % n]))) })
  }
}))
console.log(`${path}\n② vertices ${verts.toLocaleString()} (distinct rings) · unlabelled ${un} in ${groups.length} run(s) · rings wholly unlabelled ${ringsAllUn} · repeated rings skipped ${repeats} (holding ${repeatUn} unlabelled)`)
const hist = {}; for (const g of groups) hist[g.len] = (hist[g.len] || 0) + 1
console.log(`  run length (vertices): ${Object.entries(hist).map(([k, v]) => `${k}×${v}`).join(' · ')}`)
const kind = (g) => g.all ? 'whole ring' : g.before === g.after ? 'same owner both sides' : g.before.split('|')[0] === g.after.split('|')[0] ? 'same chain, other side/segOrd' : g.before.startsWith('cap:') || g.after.startsWith('cap:') ? 'beside a cap' : 'between two owners'
const byKind = {}; for (const g of groups) { const k = kind(g); (byKind[k] ??= { runs: 0, v: 0, arc: 0, corner: 0, junction: 0 }); byKind[k].runs++; byKind[k].v += g.len; byKind[k].arc += g.arc; byKind[k].corner += g.corner; byKind[k].junction += g.junction }
for (const [k, b] of Object.entries(byKind)) console.log(`  ${k}: ${b.runs} run(s), ${b.v} vertices (on an arc ${b.arc} · corner ${b.corner} · junction ${b.junction})`)
const ownerPair = {}; for (const g of groups) { const k = [g.before, g.after].map(s => s.split('|').slice(0, 1).join()).join(' ↔ '); ownerPair[k] = (ownerPair[k] || 0) + g.len }
console.log(`  by owner pair (chain ↔ chain, vertices): ${Object.entries(ownerPair).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`  runs (top ${topN} by length):`)
for (const g of groups.sort((a, b) => b.len - a.len).slice(0, +topN))
  console.log(`    tile ${g.ti} ring ${g.ri} (${g.n} v) · ${g.len} v over ${g.lenM.toFixed(2)} m at (${g.at.join(', ')}) · ${g.before} → ${g.after} · arc ${g.arc} corner ${g.corner} junction ${g.junction} · max turn ${g.turnMax?.toFixed(1)}°`)
