// the suspect band copies (> 1 cm outside their own class's pieces), split by whether the DUMP's own painted rings
// (bandPieces[].painted, same pour as the pieces) hold them; per tile for 182 and 173, and in total. Writes the copies of
// the two tiles for the pictures. Read-only.
import { readFileSync, writeFileSync } from 'fs'
const G = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/scratch/ground-budget/hpdm-gate/'
const gj = JSON.parse(readFileSync(G + 'slab-bb-base/ground.json', 'utf8')), b = readFileSync(G + 'slab-bb-base/' + gj.bin)
const sh = JSON.parse(readFileSync(G + 'slab-bb-base/shape.json', 'utf8')), dump = JSON.parse(readFileSync(G + 'bands-blend.json', 'utf8'))
const segD = (px, pz, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz) }
const pip = (x, z, rings) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const bbOf = (rings) => { let a = [1e9, 1e9, -1e9, -1e9]; for (const r of rings) for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return a }
const ringsOf = (p) => p.outer ? [p.outer, ...(p.holes || [])] : Array.isArray(p[0]?.[0]) ? p : [p]
const C = 16, grid = new Map(), SC = 2, sgrid = new Map(), pv = new Map(), pgrid = new Map()
const put = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v)
const gridBB = (m, a, v) => { for (let x = Math.floor(a[0] / C); x <= Math.floor(a[2] / C); x++) for (let z = Math.floor(a[1] / C); z <= Math.floor(a[3] / C); z++) put(m, x * 1e7 + z, v) }
for (const t of Object.values(dump.bandPieces)) if (t) { for (const q of t.pieces) { q.bb = bbOf(q.rings); gridBB(grid, q.bb, q)
    for (const r of q.rings) for (let i = 0; i < r.length; i++) { const p = r[i], s = r[(i + 1) % r.length]; const vk = Math.fround(p[0]) + ',' + Math.fround(p[1]); (pv.get(vk) || pv.set(vk, new Set()).get(vk)).add(q.cls)
      for (let x = Math.floor((Math.min(p[0], s[0]) - 0.01) / SC); x <= Math.floor((Math.max(p[0], s[0]) + 0.01) / SC); x++) for (let z = Math.floor((Math.min(p[1], s[1]) - 0.01) / SC); z <= Math.floor((Math.max(p[1], s[1]) + 0.01) / SC); z++) put(sgrid, x * 1e7 + z, [p, s, q.cls]) } }
  for (const cls of ['curb', 'walk', 'lawn']) for (const p of t.painted?.[cls] || []) { const rings = ringsOf(p); gridBB(pgrid, bbOf([rings[0]]), { cls, rings, bb: bbOf([rings[0]]), tile: t.tile }) } }
const classOf = (id) => id === 'sidewalk' ? 'walk' : id === 'curb' ? 'curb' : id.startsWith('treelawn') ? 'lawn' : null
const TB = sh.tiles.map((t, ti) => ({ ti, a: bbOf([t.ring]), ring: t.ring }))
const tileOf = (x, z) => TB.find(t => x >= t.a[0] && x <= t.a[2] && z >= t.a[1] && z <= t.a[3] && pip(x, z, [t.ring]))?.ti ?? -1
const WANT = null, tot = { paintedOwn: 0, paintedOther: 0, unpainted: 0 }, per = {}, pts = {}, HOST = {}
for (const g of gj.groups) { if (g.rawByteOffset == null) continue; const cls = classOf(g.id); if (!cls) continue
  const P = new Float32Array(b.buffer, b.byteOffset + g.vertexByteOffset, g.vertexCount * 3)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2], ck = Math.floor(x / C) * 1e7 + Math.floor(z / C)
    let own = false; for (const q of grid.get(ck) || []) { if (q.cls !== cls || x < q.bb[0] || x > q.bb[2] || z < q.bb[1] || z > q.bb[3]) continue; if (pip(x, z, q.rings)) { own = true; break } }
    if (own || pv.get(x + ',' + z)?.has(cls)) continue
    let d = Infinity; for (const [p, s, c] of sgrid.get(Math.floor(x / SC) * 1e7 + Math.floor(z / SC)) || []) if (c === cls) d = Math.min(d, segD(x, z, p, s))
    if (d < 0.01) continue
    let pc = null; for (const p of pgrid.get(ck) || []) { if (x < p.bb[0] || x > p.bb[2] || z < p.bb[1] || z > p.bb[3]) continue; if (pip(x, z, p.rings)) { pc = p.cls; if (pc === cls) break } }
    const k = pc === cls ? 'paintedOwn' : pc ? 'paintedOther' : 'unpainted'; tot[k]++
    const ti = tileOf(x, z); { let host = null; for (const q of grid.get(ck) || []) { if (x < q.bb[0] || x > q.bb[2] || z < q.bb[1] || z > q.bb[3]) continue; if (pip(x, z, q.rings)) { host = q.cls; break } } const hk = `${cls} in ${host ?? 'no'} piece`; HOST[hk] = (HOST[hk] || 0) + 1; const r = per[ti] ??= { paintedOwn: 0, paintedOther: 0, unpainted: 0, byCls: {} }; r[k]++; r.byCls[cls] = (r.byCls[cls] || 0) + 1; (pts[ti] ??= []).push([+x.toFixed(3), +z.toFixed(3), cls, k]) } } }
console.log('suspect copies by the dump\'s OWN painted rings (same pour as the pieces): in a painted ring of their class / of another class / in none —', JSON.stringify(tot))
console.log('by class and host piece:', JSON.stringify(HOST)); const top = Object.entries(per).sort((a, b) => (b[1].paintedOwn + b[1].paintedOther + b[1].unpainted) - (a[1].paintedOwn + a[1].paintedOther + a[1].unpainted)); console.log(`tiles ${top.length} · top 8:`, top.slice(0, 8).map(([t, r]) => `${t}:${r.paintedOwn + r.paintedOther + r.unpainted} ${JSON.stringify(r.byCls)}`).join(' · '))
writeFileSync(G + 'suspect/points-fixed.json', JSON.stringify(pts))
