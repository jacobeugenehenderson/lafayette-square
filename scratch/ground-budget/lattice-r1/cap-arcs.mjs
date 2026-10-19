// cap-arcs.mjs — every dead-end cap's eased arcs, classed by IDENTITY (Boz, 2026-10-18): an arc is a SHOULDER when an edge of
// it, or the edge just before or after it, carries a stamp run (a LEG — cap edges carry none, `iaStamp` null); a BULB arc when
// it and both flanks are cap edges. Also the arcs' keys (iaArcKey) and how many shoulders each cap has. Read-only, frozen tile.
//   node scratch/ground-budget/lattice-r1/cap-arcs.mjs <shape.json>
import { readFileSync } from 'fs'
const tiles = JSON.parse(readFileSync(process.argv[2], 'utf8')).tiles
const seen = new Set(); let caps = 0; const byShoulders = {}, cls = { shoulder: 0, bulb: 0 }, ex = [], keyForm = {}
for (const [ti, st] of tiles.entries()) { const ck = JSON.stringify(st.iaFull); if (seen.has(ck)) continue; seen.add(ck)
  ;(st.iaCap || []).forEach((cap, si) => { if (!cap) return; const n = cap.length, arc = st.iaArc?.[si] || [], stp = st.iaStamp?.[si] || [], keys = (Array.isArray(st.iaArcKey) ? st.iaArcKey[si] : st.iaArcKey) || {}
    const byCap = new Map(); cap.forEach((c, e) => { if (c != null) (byCap.get(c) || byCap.set(c, []).get(c)).push(e) })
    for (const [c, edges] of byCap) { caps++
      const ids = [...new Set(edges.map(e => arc[e]).filter(u => u != null))]
      let sh = 0; const row = []
      for (const u of ids) { const own = []; for (let e = 0; e < n; e++) if (arc[e] === u) own.push(e)
        const flank = [...own, (Math.min(...own) - 1 + n) % n, (Math.max(...own) + 1) % n]
        const leg = flank.some(e => stp[e] != null), k = leg ? 'shoulder' : 'bulb'; cls[k]++; if (leg) sh++
        const key = keys[u] || '', p = key.split('|'), form = !key ? 'no key' : p[1]?.split(':')[0] !== p[2]?.split(':')[0] ? 'two chains' : p[1] === p[2] ? 'one chain, one side' : 'one chain, two sides'
        keyForm[`${k}: ${form}`] = (keyForm[`${k}: ${form}`] || 0) + 1; row.push(`${u}:${k}(${form})`) }
      byShoulders[sh] = (byShoulders[sh] || 0) + 1
      if (sh !== 2 && ex.length < 12) ex.push(`tile ${ti} ring ${si} cap ${c} (${st.caps?.[c]?.skelId}|${st.caps?.[c]?.side}): ${edges.length} cap edge(s), arcs ${row.join(' ') || 'none'}`) } }) }
console.log(`CA: ${caps} cap(s) · arcs classed shoulder ${cls.shoulder} · bulb ${cls.bulb} · caps by number of shoulders ${JSON.stringify(byShoulders)}`)
console.log(`CA: arc key form by class ${JSON.stringify(keyForm)}`)
for (const x of ex) console.log(`CA   not two shoulders: ${x}`)
