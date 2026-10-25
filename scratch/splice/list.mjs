// Splice probe: every ① block-ring edge under subInkLen, with both end owners and srcIdx (water↔water pairs counted, not listed).
import { readFileSync } from 'node:fs'
import { CLIP_SCALE } from '../../src/lib/lattice.js'
for (const f of process.argv.slice(2)) {
  const P = JSON.parse(readFileSync(f, 'utf8')).protopolygon, O = P.owners, sub = 2 * P.eps - 2 / CLIP_SCALE
  const rs = [...P.blocks.map((r, k) => [r, P.blockLabels[k]]), ...(P.blockHoles || []).flatMap((hs, k) => (hs || []).map((h, j) => [h, P.blockHoleLabels[k][j]]))]
  const out = []; let water = 0
  for (const [r, L] of rs) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l >= sub) continue
    const oa = O[L[i]], ob = O[L[(i + 1) % r.length]]
    if (oa.skelId === '__water__' && ob.skelId === '__water__' && !process.env.WATER) { water++; continue }
    out.push(`(${a[0].toFixed(3)}, ${a[1].toFixed(3)}) ${(l * 1000).toFixed(2)} mm ${oa.skelId}|${oa.side}|src${oa.srcIdx} → ${ob.skelId}|${ob.side}|src${ob.srcIdx}`) }
  console.log(`${f.split('/').pop()}: ${out.length + water} (${water} water↔water)`); for (const x of out) console.log('   ' + x)
}
