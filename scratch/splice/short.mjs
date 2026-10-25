// Splice probe: every ① block-ring edge shorter than subInkLen (2ε − 2 grid steps), bucketed by its two end owners.
//   node scratch/splice/short.mjs <ribbons.json>…
import { readFileSync } from 'node:fs'
import { CLIP_SCALE as SCALE } from '../../src/lib/lattice.js'
for (const f of process.argv.slice(2)) {
  const P = JSON.parse(readFileSync(f, 'utf8')).protopolygon, O = P.owners, sub = 2 * P.eps - 2 / SCALE
  const rings = [...P.blocks.map((r, k) => [r, P.blockLabels[k]]), ...(P.blockHoles || []).flatMap((hs, k) => (hs || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j]]))]
  const b = { twoChains: 0, sameSkelSameSide: 0, sameSkelOtherSide: 0, unlabelled: 0 }, ex = { sameSkelSameSide: [], sameSkelOtherSide: [] }
  let verts = 0
  for (const [r, L] of rings) { verts += r.length
    for (let i = 0; i < r.length; i++) { const a = r[i], c = r[(i + 1) % r.length], len = Math.hypot(c[0] - a[0], c[1] - a[1])
      if (len >= sub) continue
      const oa = O[L[i]], ob = O[L[(i + 1) % r.length]]
      if (!oa?.skelId || !ob?.skelId) { b.unlabelled++; continue }
      const k = oa.skelId !== ob.skelId ? 'twoChains' : oa.side === ob.side ? 'sameSkelSameSide' : 'sameSkelOtherSide'
      b[k]++; if (ex[k] && ex[k].length < 2) ex[k].push(`(${a.map(v => v.toFixed(3)).join(', ')}) ${(len * 1000).toFixed(2)} mm ${oa.skelId}|${oa.side}|${oa.segOrd} → ${ob.side}|${ob.segOrd}`) } }
  console.log(`${f.split('/').pop()}: ${verts} block-ring vertices · sub-ink edges ${JSON.stringify(b)}`)
  for (const [k, v] of Object.entries(ex)) if (v.length) console.log(`   ${k}: ${v.join(' · ')}`)
}
