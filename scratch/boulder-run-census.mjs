// boulder-run-census.mjs — RUNS, HOLES AND ISLANDS along the armoured shore.
// The shape of the patchiness, in one line each. ▶ node scratch/boulder-run-census.mjs
import { readFileSync } from 'node:fs'
const doc = JSON.parse(readFileSync(process.argv[2] || 'public/baked/huron/revetment.json', 'utf8'))
const A = [], B = [], holes = [], islands = []
let longM = 0, shortM = 0
for (const a of doc.arcs) {
  const st = a.stations, segs = []; let i = 0
  while (i < st.length) {
    const v = !!st[i].armour; let j = i, len = 0
    while (j < st.length && !!st[j].armour === v) { if (j > i) len += Math.hypot(st[j].x - st[j-1].x, st[j].z - st[j-1].z); j++ }
    segs.push({ v, len }); i = j
  }
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k]
    if (s.v) { A.push(s.len); s.len >= 50 ? longM += s.len : shortM += s.len
      if (s.len < 15 && k > 0 && k < segs.length - 1) islands.push(s.len) }
    else { B.push(s.len)
      if (k > 0 && k < segs.length - 1 && segs[k-1].v && segs[k+1].v && s.len < 25) holes.push(s.len) }
  }
}
const med = a => { a = [...a].sort((x,y)=>x-y); return a.length ? a[a.length>>1] : 0 }
const sum = a => Math.round(a.reduce((p,c)=>p+c,0))
console.log(`armouredM (artifact)      ${doc.totals.armouredM} of ${doc.totals.ruledM} ruled`)
console.log(`armoured runs             ${A.length}, median ${med(A).toFixed(1)} m, max ${Math.round(Math.max(...A))} m`)
console.log(`  in runs >=50 m (WALL)   ${Math.round(longM)} m`)
console.log(`  in runs  <50 m (SPECK)  ${Math.round(shortM)} m`)
console.log(`HOLES  <25 m, armour both sides   ${holes.length}  (${sum(holes)} m)`)
console.log(`ISLANDS <15 m, bare both sides    ${islands.length}  (${sum(islands)} m)`)
