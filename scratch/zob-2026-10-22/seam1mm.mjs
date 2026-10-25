// ① block rings: edges ≤ 1.5 mm whose two ends carry different skelIds — and what the skeleton says at the node there.
import { readFileSync } from 'fs'
const j = JSON.parse(readFileSync(process.argv[2], 'utf8')), P = j.protopolygon, O = P.owners
const all = [...(j.streets || []), ...(j.paths || []), ...(j.alleys || [])]
const ends = []; for (const s of all) { const p = s.points; if (!p?.length) continue; ends.push({ id: s.skelId ?? s.name, end: 'start', at: p[0], deg: s.caps?.start?.degree }, { id: s.skelId ?? s.name, end: 'end', at: p[p.length - 1], deg: s.caps?.end?.degree }) }
const tally = {}, ex = []
P.blocks.forEach((r, bi) => r.forEach((a, i) => { const b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 0.0015) return
  const oa = O[P.blockLabels[bi][i]], ob = O[P.blockLabels[bi][(i + 1) % r.length]]; if (!oa || !ob || oa.skelId === ob.skelId) return
  // the chain end at this point (within 1 cm): its degree; does the OTHER chain pass through (an interior point) or end here too?
  const here = ends.filter(e => Math.hypot(e.at[0] - a[0], e.at[1] - a[1]) < 0.012)
  const k = here.length ? `chain ends here: ${here.length} · degrees ${[...new Set(here.map(e => e.deg))].join('/')}` : 'no chain end within 12 mm'
  tally[k] = (tally[k] || 0) + 1; if (ex.length < 3) ex.push(`${a.map(v => v.toFixed(3))} ${oa.skelId}|${oa.side} → ${ob.skelId}|${ob.side} · ${(L * 1000).toFixed(2)} mm · ${k}`) }))
console.log(Object.entries(tally).map(([k, v]) => `   ${v} × ${k}`).join('\n')); ex.forEach(x => console.log('     e.g. ' + x))
