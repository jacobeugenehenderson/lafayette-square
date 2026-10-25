// The sub-ink class of checks/claims-no-sub-ink-edge-between-two-owners.mjs, placed by node (file only, light).
// Each ① block-ring edge shorter than 2ε − 2 grid steps between two skelIds is classed by length (≤ 1.5 mm or more), by
// the chain ends within 2ε of it (both chains end here = a chain cut or a node; one ends, the other passes; neither), and
// by the skeleton's degree there (caps.*.degree). "Neither" edges are printed with coordinates: the named exhibits.
//   node scratch/zob-2026-10-22/place.mjs <ribbons.json …>
import { readFileSync } from 'fs'
import { CLIP_SCALE } from '../../src/lib/lattice.js'
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf8')), P = j.protopolygon, O = P.owners, sub = 2 * P.eps - 2 / CLIP_SCALE
  const ends = []; for (const s of [...(j.streets || []), ...(j.paths || []), ...(j.alleys || [])]) { const p = s.points; if (!p?.length) continue
    for (const [k, at] of [['start', p[0]], ['end', p[p.length - 1]]]) ends.push({ id: s.skelId ?? s.name, at, deg: s.caps?.[k]?.degree }) }
  const t = {}, exhibits = []
  P.blocks.forEach((r, bi) => r.forEach((a, i) => { const b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L >= sub) return
    const oa = O[P.blockLabels[bi][i]], ob = O[P.blockLabels[bi][(i + 1) % r.length]]; if (!oa?.skelId || !ob?.skelId || oa.skelId === ob.skelId) return
    const here = ends.filter(e => Math.hypot(e.at[0] - a[0], e.at[1] - a[1]) < 2 * P.eps + 2 / CLIP_SCALE)
    const ids = new Set(here.map(e => e.id)), endA = ids.has(oa.skelId), endB = ids.has(ob.skelId)
    const where = endA && endB ? 'both chains end here' : endA || endB ? 'one ends, other passes' : 'neither ends within 2ε'
    if (!endA && !endB) exhibits.push(`(${a.map(v => v.toFixed(3)).join(', ')}) ${(L * 1000).toFixed(2)} mm ${oa.skelId}|${oa.side} → ${ob.skelId}|${ob.side}`)
    const k = `${L <= 0.0015 ? '≤1.5mm' : '>1.5mm'} · ${where} · deg ${[...new Set(here.map(e => e.deg))].join('/') || '-'}`
    t[k] = (t[k] || 0) + 1 }))
  console.log(f); for (const [k, v] of Object.entries(t).sort()) console.log(`   ${v} × ${k}`)
  for (const x of exhibits) console.log(`   exhibit: ${x}`)
}
