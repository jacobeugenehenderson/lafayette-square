// the band-group copies whose position is in no piece / in another class's piece (reown.mjs), binned by distance to the
// nearest piece ring edge of THEIR OWN class: a piece vertex (exact float32) · on an edge, d = 0 · < 1 mm · < 1 cm · beyond.
import { readFileSync } from 'fs'
const G = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/scratch/ground-budget/hpdm-gate/'
const gj = JSON.parse(readFileSync(G + 'slab-bb-base/ground.json', 'utf8')), b = readFileSync(G + 'slab-bb-base/' + gj.bin)
const dump = JSON.parse(readFileSync(G + 'bands-blend.json', 'utf8'))
const C = 16, grid = new Map(), SC = 2, sgrid = new Map(), pv = new Map()
for (const t of Object.values(dump.bandPieces)) if (t) for (const q of t.pieces) { let a = [1e9, 1e9, -1e9, -1e9]; for (const r of q.rings) for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]
  q.bb = a; for (let x = Math.floor(a[0] / C); x <= Math.floor(a[2] / C); x++) for (let z = Math.floor(a[1] / C); z <= Math.floor(a[3] / C); z++) { const k = x * 1e7 + z; (grid.get(k) || grid.set(k, []).get(k)).push(q) }
  for (const r of q.rings) for (let i = 0; i < r.length; i++) { const p = r[i], s = r[(i + 1) % r.length]
    const vk = Math.fround(p[0]) + ',' + Math.fround(p[1]); (pv.get(vk) || pv.set(vk, new Set()).get(vk)).add(q.cls)
    for (let x = Math.floor((Math.min(p[0], s[0]) - 0.01) / SC); x <= Math.floor((Math.max(p[0], s[0]) + 0.01) / SC); x++) for (let z = Math.floor((Math.min(p[1], s[1]) - 0.01) / SC); z <= Math.floor((Math.max(p[1], s[1]) + 0.01) / SC); z++) { const k = x * 1e7 + z; (sgrid.get(k) || sgrid.set(k, []).get(k)).push([p, s, q.cls]) } } }
const pip = (x, z, rings) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const segD = (px, pz, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz) }
const classOf = (id) => id === 'sidewalk' ? 'walk' : id === 'curb' ? 'curb' : id.startsWith('treelawn') ? 'lawn' : null
const bins = () => ({ vertex: 0, 'd=0': 0, '<1mm': 0, '<1cm': 0, beyond: 0 })
const T = { none: bins(), other: bins() }, byC = {}
for (const g of gj.groups) { if (g.rawByteOffset == null) continue; const cls = classOf(g.id); if (!cls) continue
  const P = new Float32Array(b.buffer, b.byteOffset + g.vertexByteOffset, g.vertexCount * 3)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2]; let hit = null
    for (const q of grid.get(Math.floor(x / C) * 1e7 + Math.floor(z / C)) || []) { if (x < q.bb[0] || x > q.bb[2] || z < q.bb[1] || z > q.bb[3]) continue; if (pip(x, z, q.rings)) { hit = q; if (q.cls === cls) break } }
    if (hit && hit.cls === cls) continue
    const kind = hit ? 'other' : 'none'; let bin
    if (pv.get(x + ',' + z)?.has(cls)) bin = 'vertex'
    else { let d = Infinity; for (const [p, s, c] of sgrid.get(Math.floor(x / SC) * 1e7 + Math.floor(z / SC)) || []) if (c === cls) d = Math.min(d, segD(x, z, p, s))
      bin = d === 0 ? 'd=0' : d < 0.001 ? '<1mm' : d < 0.01 ? '<1cm' : 'beyond' }
    T[kind][bin]++; const k = `${cls}/${kind}`; (byC[k] ??= bins())[bin]++ } }
console.log('band-group copies not in a piece of their own class, by distance to their own class\'s nearest piece edge:')
for (const [k, v] of Object.entries(T)) console.log(`  ${k}: ${JSON.stringify(v)} · total ${Object.values(v).reduce((a, b) => a + b, 0)}`)
for (const [k, v] of Object.entries(byC)) console.log(`    ${k}: ${JSON.stringify(v)}`)
