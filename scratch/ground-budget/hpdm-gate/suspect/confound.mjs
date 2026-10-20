// the 89,590 band copies > 1 cm outside their own class's pieces (reown-bins.mjs): by tile, and by distance to the nearest
// UNPADDED ② arc (iaJunction 'bend' or null on an iaArc span — what 50a64997 changed), against the same distances for every
// band copy (the base rate). Read-only: slab-bb-base (dac3525d's mesh + shape) against bands-blend.json (fdcf0bfc's pieces).
import { readFileSync } from 'fs'
const G = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/scratch/ground-budget/hpdm-gate/'
const gj = JSON.parse(readFileSync(G + 'slab-bb-base/ground.json', 'utf8')), b = readFileSync(G + 'slab-bb-base/' + gj.bin)
const sh = JSON.parse(readFileSync(G + 'slab-bb-base/shape.json', 'utf8')), dump = JSON.parse(readFileSync(G + 'bands-blend.json', 'utf8'))
const segD = (px, pz, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz) }
const pip = (x, z, rings) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const addGrid = (grid, C, a, c, val, pad) => { for (let x = Math.floor((Math.min(a[0], c[0]) - pad) / C); x <= Math.floor((Math.max(a[0], c[0]) + pad) / C); x++) for (let z = Math.floor((Math.min(a[1], c[1]) - pad) / C); z <= Math.floor((Math.max(a[1], c[1]) + pad) / C); z++) { const k = x * 1e7 + z; (grid.get(k) || grid.set(k, []).get(k)).push(val) } }
// unpadded arc edges, and padded ones for contrast
const MAXD = 20, AC = 10, arcs = { unpadded: new Map(), padded: new Map() }
for (const t of sh.tiles) (t.iaFull || []).forEach((ring, ri) => { const A = t.iaArc?.[ri] || [], J = t.iaJunction?.[ri] || [], n = ring.length
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (A[i] == null || A[j] !== A[i]) continue
    const kind = J[i] === 'bend' || J[i] == null ? 'unpadded' : 'padded'; addGrid(arcs[kind], AC, ring[i], ring[j], [ring[i], ring[j]], MAXD) } })
const near = (grid, x, z) => { let d = Infinity; for (const [a, c] of grid.get(Math.floor(x / AC) * 1e7 + Math.floor(z / AC)) || []) d = Math.min(d, segD(x, z, a, c)); return d }
// pieces (own-class membership + edge distance), as reown-bins.mjs
const C = 16, grid = new Map(), SC = 2, sgrid = new Map(), pv = new Map()
for (const t of Object.values(dump.bandPieces)) if (t) for (const q of t.pieces) { let a = [1e9, 1e9, -1e9, -1e9]; for (const r of q.rings) for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]
  q.bb = a; for (let x = Math.floor(a[0] / C); x <= Math.floor(a[2] / C); x++) for (let z = Math.floor(a[1] / C); z <= Math.floor(a[3] / C); z++) { const k = x * 1e7 + z; (grid.get(k) || grid.set(k, []).get(k)).push(q) }
  for (const r of q.rings) for (let i = 0; i < r.length; i++) { const p = r[i], s = r[(i + 1) % r.length]; const vk = Math.fround(p[0]) + ',' + Math.fround(p[1]); (pv.get(vk) || pv.set(vk, new Set()).get(vk)).add(q.cls); addGrid(sgrid, SC, p, s, [p, s, q.cls], 0.01) } }
const classOf = (id) => id === 'sidewalk' ? 'walk' : id === 'curb' ? 'curb' : id.startsWith('treelawn') ? 'lawn' : null
const TB = sh.tiles.map((t, ti) => { let a = [1e9, 1e9, -1e9, -1e9]; for (const [x, z] of t.ring) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return { ti, a, ring: t.ring } })
const tileOf = (x, z) => TB.find(t => x >= t.a[0] && x <= t.a[2] && z >= t.a[1] && z <= t.a[3] && pip(x, z, [t.ring]))?.ti ?? -1
const BIN = [2, 5, 10, 20], binOf = (d) => { const i = BIN.findIndex(b => d <= b); return i < 0 ? `>${MAXD}` : `≤${BIN[i]}` }
const mk = () => Object.fromEntries([...BIN.map(b => `≤${b}`), `>${MAXD}`].map(k => [k, 0]))
const all = { unpadded: mk(), padded: mk() }, sus = { unpadded: mk(), padded: mk() }, byTile = new Map(); let nAll = 0, nSus = 0
for (const g of gj.groups) { if (g.rawByteOffset == null) continue; const cls = classOf(g.id); if (!cls) continue
  const P = new Float32Array(b.buffer, b.byteOffset + g.vertexByteOffset, g.vertexCount * 3)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2]; nAll++
    const du = near(arcs.unpadded, x, z), dp = near(arcs.padded, x, z); all.unpadded[binOf(du)]++; all.padded[binOf(dp)]++
    let own = false; for (const q of grid.get(Math.floor(x / C) * 1e7 + Math.floor(z / C)) || []) { if (q.cls !== cls || x < q.bb[0] || x > q.bb[2] || z < q.bb[1] || z > q.bb[3]) continue; if (pip(x, z, q.rings)) { own = true; break } }
    if (own || pv.get(x + ',' + z)?.has(cls)) continue
    let d = Infinity; for (const [p, s, c] of sgrid.get(Math.floor(x / SC) * 1e7 + Math.floor(z / SC)) || []) if (c === cls) d = Math.min(d, segD(x, z, p, s))
    if (d < 0.01) continue
    nSus++; sus.unpadded[binOf(du)]++; sus.padded[binOf(dp)]++; const ti = tileOf(x, z); byTile.set(ti, (byTile.get(ti) || 0) + 1) } }
const pct = (o, n) => Object.entries(o).map(([k, v]) => `${k} m ${v} (${(100 * v / n).toFixed(1)}%)`).join(' · ')
console.log(`band copies ${nAll} · the suspect set (> 1 cm outside their own class's pieces) ${nSus}`)
console.log(`distance to the nearest UNPADDED arc — suspect: ${pct(sus.unpadded, nSus)}\n                                      all:     ${pct(all.unpadded, nAll)}`)
console.log(`distance to the nearest PADDED arc   — suspect: ${pct(sus.padded, nSus)}\n                                      all:     ${pct(all.padded, nAll)}`)
const tt = [...byTile].sort((a, b) => b[1] - a[1]); let cum = 0
console.log(`by tile: ${byTile.size} tiles · top 10: ${tt.slice(0, 10).map(([t, n]) => { cum += n; return `${t}:${n}` }).join(' ')} (top 10 = ${(100 * cum / nSus).toFixed(1)}%)`)
