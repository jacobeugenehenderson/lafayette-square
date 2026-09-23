// Read-only (Keel, 2026-09-23): Jacob's hypothesis on the FROZEN ①. For each closed-loop street:
// is the loop's island a ① BLOCK (a face bounded by the loop's own inner stroke), and is the ink
// band continuous around the loop (a point on the centreline at every vertex lies in no block)?
import fs from 'fs'
const town = process.argv[2] || 'huron'
const rP = `cartograph/data/${town}/clean/ribbons.json`, sP = `cartograph/data/${town}/clean/skeleton.json`
for (const f of [rP, sP]) console.log('#', f, fs.statSync(f).mtime.toISOString())
const pr = JSON.parse(fs.readFileSync(rP)).protopolygon, streets = JSON.parse(fs.readFileSync(sP)).streets
const P = p => Array.isArray(p) ? p : [p.x, p.z]
const pip = (p, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [xi, zi] = R[i], [xj, zj] = R[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) c = !c } return c }
const inBlock = p => { for (let b = 0; b < pr.blocks.length; b++) if (pip(p, pr.blocks[b]) && !(pr.blockHoles[b] || []).some(h => pip(p, h))) return b; return -1 }
const loops = streets.filter(x => { const a = P(x.points[0]), b = P(x.points.at(-1)); return x.points.length > 2 && Math.hypot(a[0]-b[0], a[1]-b[1]) < 1 })
let islandIsBlock = 0, bandLeaks = 0
for (const L of loops) {
  const pts = L.points.map(P); let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1] } cx /= pts.length; cz /= pts.length
  const b = inBlock([cx, cz])
  // who owns that block's edges? the loop's own skelId should be among the labels
  let owned = '-'
  if (b >= 0) { const labs = new Set((pr.blockLabels[b] || []).map(l => l >= 0 ? pr.owners[l]?.skelId : null)); owned = [...labs].filter(Boolean).join(',') }
  const leaks = pts.filter(p => inBlock(p) >= 0).length   // centreline vertices that fall inside a block ⇒ ink missing there
  if (b >= 0) islandIsBlock++; if (leaks) bandLeaks++
  console.log(`${L.id.padEnd(28)} island→block ${String(b).padStart(4)}  ringVerts ${b >= 0 ? pr.blocks[b].length : '-'}  owners {${owned}}  centreline-verts-in-a-block ${leaks}/${pts.length}`)
}
console.log(`\n${loops.length} loops · island is a ① block: ${islandIsBlock} · ink band broken somewhere: ${bandLeaks}`)
