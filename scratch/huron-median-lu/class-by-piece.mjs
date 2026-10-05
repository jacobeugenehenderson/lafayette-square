// Forensic (Sward): which ground-mesh face groups draw inside each PIECE of a tile's iA, against the piece's own
// class (`luByPiece`), on the BAKED slab. Lists every piece where a face:<class> group other than its own draws
// ≥ MIN m². Also lists the crop fields (face:agricultural `fields`) and the piece holding each one's centre.
// Usage: node scratch/huron-median-lu/class-by-piece.mjs [town] [MIN m², default 100]
import fs from 'fs'
const town = process.argv[2] || 'huron', MIN = +(process.argv[3] ?? 100), D = `public/baked/${town}/`
const S = JSON.parse(fs.readFileSync(D + 'shape.json')), T = S.tiles, g = JSON.parse(fs.readFileSync(D + 'ground.json'))
const bin = fs.readFileSync(D + 'ground.bin'), buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const bb = r => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]; return b }
const pieces = []
T.forEach((t, ti) => { const holes = t.iA.filter(r => A(r) < 0); t.iA.forEach((r, k) => { if (A(r) > 0) pieces.push({ ti, k, r, bb: bb(r), holes: holes.filter(h => pip(h[0][0], h[0][1], r)), lu: t.luByPiece?.[k] ?? t.lu, a: A(r), by: {} }) }) })
const pieceAt = (x, z) => pieces.find(p => x >= p.bb[0] && x <= p.bb[1] && z >= p.bb[2] && z <= p.bb[3] && pip(x, z, p.r) && !p.holes.some(h => pip(x, z, h)))
for (const grp of g.groups.filter(q => q.kind === 'face')) {
  const P = new Float32Array(buf, grp.vertexByteOffset, grp.vertexCount * 3), I = new Uint32Array(buf, grp.indexByteOffset, grp.indexCount)
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3
    const p = pieceAt((P[a] + P[b] + P[c]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3); if (!p) continue
    p.by[grp.id] = (p.by[grp.id] || 0) + Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2
  }
}
console.log(`${town}: pieces where a face group OTHER than the piece's own class draws ≥ ${MIN} m²:`)
for (const p of pieces) for (const [id, m2] of Object.entries(p.by)) if (id !== p.lu && m2 >= MIN)
  console.log(`   tile ${p.ti} piece #${p.k} (${(p.a / 1e4).toFixed(2)} ha, class ${p.lu}) — face:${id} draws ${Math.round(m2)} m²`)
const ag = g.groups.find(q => q.id === 'agricultural')
console.log(`\ncrop fields in face:agricultural: ${ag?.fields?.length ?? 0}`)
for (const [i, f] of (ag?.fields || []).entries()) { const p = pieceAt(f.cx, f.cz); console.log(`   field ${i}: ${Math.round(f.areaM2)} m², centre (${f.cx.toFixed(0)}, ${f.cz.toFixed(0)}) → ${p ? `tile ${p.ti} piece #${p.k} class ${p.lu}` : 'NO piece'}`) }
