// For each in-hood dark side: cast a ray from the centreline toward that side; report the first OTHER chain hit
// (by ribbons centreline), its distance, and whether that chain is this chain's pair. Plus the side's authoring.
import fs from 'fs'
const [,, ribP, rowsP, designP] = process.argv
const r = JSON.parse(fs.readFileSync(ribP, 'utf8')), rows = JSON.parse(fs.readFileSync(rowsP, 'utf8'))
const design = JSON.parse(fs.readFileSync(designP, 'utf8'))
const by = new Map(r.streets.map(s => [s.skelId || s.name, s]))
const hit = (O, D, pts) => { let best = Infinity
  for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], B = pts[i], ex = B[0] - A[0], ez = B[1] - A[1], den = ex * D[1] - ez * D[0]
    if (Math.abs(den) < 1e-12) continue; const wx = A[0] - O[0], wz = A[1] - O[1], t = (ex * wz - ez * wx) / den, s = (D[0] * wz - D[1] * wx) / den
    if (t > 0.05 && s >= 0 && s <= 1 && t < best) best = t } return best }
for (const row of rows.filter(x => x.dark && x.Lin > 0)) {
  const [skel, side] = row.k.split('|'), st = by.get(skel), sign = side === 'left' ? -1 : 1
  const tally = new Map(); let n = 0
  const pts = st.points
  for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], B = pts[i], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1e-6) continue
    const nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L
    for (let s = 0; s < L; s += 10) { const O = [A[0] + (B[0] - A[0]) * s / L, A[1] + (B[1] - A[1]) * s / L]; n++
      let best = [null, 40]
      for (const o of r.streets) { if (o === st || !o.points || o.points.length < 2) continue; const t = hit(O, [sign * nx, sign * nz], o.points); if (t < best[1]) best = [o.skelId || o.name, t] }
      const k = best[0] ? `${best[0]}${best[0] === st.pairId ? ' (its PAIR)' : ''}@${(Math.round(best[1] * 2) / 2).toFixed(1)}m` : 'nothing within 40 m'
      tally.set(k, (tally.get(k) || 0) + 1) } }
  const top = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join(', ')
  const bc = design.blockCustoms?.[skel]
  console.log(`${row.k.padEnd(28)} ${st.type.padEnd(11)} innerSign ${st.innerSign} anchor ${st.anchor} pavHW ${st.measure[side].pavementHW.toFixed(2)} gap ${st.phase?.chainGap ?? '-'} | ray→ ${top} | blockCustoms[skel]: ${bc ? Object.keys(bc).join('/') : 'none'}`)
}
