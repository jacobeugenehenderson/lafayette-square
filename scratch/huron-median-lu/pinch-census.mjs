// Forensic (Sward, 2026-10-04): ① blocks that are TWO regions joined through a THROAT — two non-adjacent
// ring vertices closer than 4·ε (ε = the mint's own stroke half-width, read from the artifact) where
// cutting the ring there leaves two lobes that BOTH enclose area. A dead-end slit also has close vertex
// pairs, but one of its lobes is ~0 m², so it is reported separately, not as a throat.
// Reads each town's frozen ribbons.json protopolygon. Usage: node scratch/huron-median-lu/pinch-census.mjs [town ...]
import fs from 'fs'
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const MIN_LOBE = +(process.env.MIN_LOBE ?? 1000)
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'lafayette-square-staging', 'hipointedemun', 'huron', 'provincetown', 'altadena']
for (const town of towns) {
  const path = town === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${town}/clean/ribbons.json`
  const P = JSON.parse(fs.readFileSync(path)).protopolygon
  if (!P?.blocks) { console.log(`${town}: no frozen ① protopolygon in ${path}`); continue }
  const tol = 4 * (P.eps ?? 0.005), throats = []
  P.blocks.forEach((b, k) => {
    const n = b.length, L = P.blockLabels?.[k] || [], seen = new Set()
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (Math.hypot(b[i][0] - b[j][0], b[i][1] - b[j][1]) > tol) continue
      const s1 = A(b.slice(i, j + 1)), s2 = A([...b.slice(j), ...b.slice(0, i + 1)]), S = A(b)
      // ⭐ BOTH LOBES WOUND LIKE THE BLOCK = two pieces of block meeting at a throat. A lobe wound the
      // OTHER way is the ring walking round something that is NOT block (a stem's slit leading to a
      // loop street's island) — a keyhole, not a throat.
      if (Math.sign(s1) !== Math.sign(S) || Math.sign(s2) !== Math.sign(S)) continue
      const a1 = Math.abs(s1), a2 = Math.abs(s2)
      if (Math.min(a1, a2) < 1) continue                                   // a slit: one lobe is no area
      // ⭐ one entry per distinct LOBE: every vertex pair along a slit names the same cut
      const key = Math.round(Math.min(a1, a2)); if (seen.has(key)) continue; seen.add(key)
      const o = (x) => { const w = P.owners[L[x]]; return w ? `${w.skelId}/${w.side}` : '(minted)' }
      throats.push({ k, at: `${b[i][0].toFixed(1)},${b[i][1].toFixed(1)}`, lobes: [a1, a2].sort((x, y) => x - y), who: `${o(i)} ⟷ ${o(j)}`, cls: P.blockClass?.[k] })
    }
  })
  console.log(`\n${town}: ${P.blocks.length} ① blocks · ${new Set(throats.map(t => t.k)).size} joined through a throat (≤ ${tol} m), ${throats.length} throat(s)`)
  const big = throats.filter(t => t.lobes[0] >= MIN_LOBE)
  console.log(`   ${big.length} with BOTH lobes ≥ ${MIN_LOBE} m² (the cut-off is this report's, not the kit's):`)
  for (const t of big.sort((x, y) => y.lobes[0] - x.lobes[0])) console.log(`   block ${t.k} [${t.cls}] at (${t.at}) lobes ${(t.lobes[0] / 1e4).toFixed(3)} ha + ${(t.lobes[1] / 1e4).toFixed(2)} ha · ${t.who}`)
}
