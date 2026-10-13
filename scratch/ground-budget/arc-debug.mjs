// H along tile ti's ② ring near a point, from the dump's own tiles (run.h as baked), with each vertex's stamp/arc (Brace).
import { readFileSync } from 'fs'
const [dump, ti, x, z, win = 6] = process.argv.slice(2)
const A = JSON.parse(readFileSync(dump + '/deform.json', 'utf8')), t = A.tiles[+ti]
t.iaFull.forEach((ring, ri) => {
  const arc = t.iaArc[ri], stamp = t.iaStamp[ri], key = t.iaArcKey?.[ri]
  ring.forEach((p, i) => { if (Math.hypot(p[0] - x, p[1] - z) > +win) return
    const run = t.runs[stamp[i]]
    console.log(`ring ${ri} v ${i} (${p.map(v => v.toFixed(2))}) arc ${arc[i]} arcKey ${key?.[i]} stamp ${stamp[i]} → ${run?.skelId}/${run?.side}/${run?.segOrd} h? ${Array.isArray(run?.h)}`) })
})
