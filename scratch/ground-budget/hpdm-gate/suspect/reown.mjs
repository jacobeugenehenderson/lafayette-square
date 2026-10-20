// per mesh vertex copy, by group: is its position inside a band piece of its own class (point-in-polygon, even-odd per
// piece)? A band-group copy in no piece of its class is one the per-position ask cannot own by its piece; a lot copy inside
// a piece is one it reads as band. Read-only on slab-bb-base + bands-blend.json.
import { readFileSync } from 'fs'
const G = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/scratch/ground-budget/hpdm-gate/'
const gj = JSON.parse(readFileSync(G + 'slab-bb-base/ground.json', 'utf8')), b = readFileSync(G + 'slab-bb-base/' + gj.bin)
const dump = JSON.parse(readFileSync(G + 'bands-blend.json', 'utf8'))
const C = 16, grid = new Map()
for (const t of Object.values(dump.bandPieces)) if (t) for (const q of t.pieces) { let a = [1e9, 1e9, -1e9, -1e9]; for (const r of q.rings) for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]
  q.bb = a; for (let x = Math.floor(a[0] / C); x <= Math.floor(a[2] / C); x++) for (let z = Math.floor(a[1] / C); z <= Math.floor(a[3] / C); z++) { const k = x * 1e7 + z; (grid.get(k) || grid.set(k, []).get(k)).push(q) } }
const pip = (x, z, rings) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const classOf = (id) => id === 'sidewalk' ? 'walk' : id === 'curb' ? 'curb' : id.startsWith('treelawn') ? 'lawn' : null
const lot = (id) => ['residential', 'commercial', 'institutional', 'underived', 'recreation', 'industrial', 'bare'].includes(id)
const out = []
for (const g of gj.groups) { if (g.rawByteOffset == null) continue; const cls = classOf(g.id); if (!cls && !lot(g.id)) continue
  const P = new Float32Array(b.buffer, b.byteOffset + g.vertexByteOffset, g.vertexCount * 3); let own = 0, other = 0, none = 0
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2]; let hit = null
    for (const q of grid.get(Math.floor(x / C) * 1e7 + Math.floor(z / C)) || []) { if (x < q.bb[0] || x > q.bb[2] || z < q.bb[1] || z > q.bb[3]) continue; if (pip(x, z, q.rings)) { hit = q; if (q.cls === cls) break } }
    if (!hit) none++; else if (hit.cls === cls) own++; else other++ }
  out.push(`${g.id} ${g.vertexCount}: in a piece of its own class ${own} · in another class's piece ${other} · in no piece ${none}`) }
console.log(out.join('\n'))
