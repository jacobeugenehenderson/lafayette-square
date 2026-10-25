// Splice probe: ① block-ring edges labelled `__boundary__` (the frame) that do NOT lie on the frame (the bb's four lines,
// within the lattice's rounding bound), and what the edge after/before them is labelled. File only.
//   node scratch/splice/rimoff.mjs <ribbons.json>…   (bb read off the frame-labelled edges' own extreme coordinates)
import { readFileSync } from 'node:fs'
for (const f of process.argv.slice(2)) {
  const P = JSON.parse(readFileSync(f, 'utf8')).protopolygon, O = P.owners
  const rs = [...P.blocks.map((r, k) => [r, P.blockLabels[k], 'b' + k]), ...(P.blockHoles || []).flatMap((hs, k) => (hs || []).map((h, j) => [h, P.blockHoleLabels[k][j], `h${k}.${j}`]))]
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [r] of rs) for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]) }
  const B = 0.0008, onF = (p) => Math.abs(p[0] - x0) <= B || Math.abs(p[0] - x1) <= B || Math.abs(p[1] - z0) <= B || Math.abs(p[1] - z1) <= B
  const out = []; let frame = 0
  for (const [r, L, id] of rs) for (let i = 0; i < r.length; i++) { const o = O[L[i]]; if (o?.skelId !== '__boundary__') continue
    const a = r[i], b = r[(i + 1) % r.length]; frame++
    if (onF(a) && onF(b) && (Math.abs(a[0] - b[0]) <= B || Math.abs(a[1] - b[1]) <= B)) continue
    const pv = O[L[(i - 1 + r.length) % r.length]], nx = O[L[(i + 1) % r.length]]
    out.push(`${id} (${a.map(v => v.toFixed(3))})→(${b.map(v => v.toFixed(3))}) ${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2)} m · before ${pv?.skelId}|${pv?.side} · after ${nx?.skelId}|${nx?.side}`) }
  console.log(`${f.split('/').pop()}: ${frame} frame-labelled edges · ${out.length} NOT on the frame`); for (const x of out.slice(0, 6)) console.log('   ' + x)
}
