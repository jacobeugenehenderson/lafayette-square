// READ-ONLY: which parcels lie UNDER the streets — sample OSM highway centrelines every 5 m, find the parcel containing each
// sample (point in ring), tally by class of way and by the parcel's land_use_code. A code that holds street centrelines is a
// right-of-way candidate, read off the data's own code, never by shape.   node scratch/footprint-census/row-parcels.mjs <town>
import fs from 'node:fs'
const town = process.argv[2], R = `/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/${town}/raw`
const osm = JSON.parse(fs.readFileSync(`${R}/osm.json`, 'utf8'))
const P = []; for (const f of fs.readdirSync(R).filter(f => /_parcels\.json$/.test(f))) for (const p of JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8')).parcels) for (const r of p.rings || []) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } P.push({ r, a, b, c, d, code: String(p.land_use_code), src: f }) }
const G = 50, grid = new Map(); P.forEach((p, i) => { for (let x = Math.floor(p.a / G); x <= Math.floor(p.c / G); x++) for (let z = Math.floor(p.b / G); z <= Math.floor(p.d / G); z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(i) } })
const pip = (x, z, r) => { let w = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) w = !w } return w }
const cls = (t) => t.service === 'alley' ? 'alley' : ['living_street', 'pedestrian'].includes(t.highway) ? t.highway : ['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'tertiary_link', 'secondary_link', 'primary_link'].includes(t.highway) ? 'street' : null
const T = {}
for (const w of osm.ground.highway || []) { const c = cls(w.tags || {}); if (!c) continue; const C = w.coords
  for (let i = 0; i + 1 < C.length; i++) { const L = Math.hypot(C[i + 1].x - C[i].x, C[i + 1].z - C[i].z), n = Math.max(1, Math.floor(L / 5))
    for (let s = 0; s < n; s++) { const t = (s + 0.5) / n, x = C[i].x + (C[i + 1].x - C[i].x) * t, z = C[i].z + (C[i + 1].z - C[i].z) * t
      const hit = (grid.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || []).filter(j => pip(x, z, P[j].r)).map(j => P[j].code)
      const k = hit.length ? hit[0] : '(no parcel)'; (T[c] ||= { n: 0, codes: {} }); T[c].n++; T[c].codes[k] = (T[c].codes[k] || 0) + 1 } } }
for (const [c, v] of Object.entries(T)) { const inP = v.n - (v.codes['(no parcel)'] || 0)
  console.log(`${town} ${c}: ${v.n} samples · in a parcel ${(100 * inP / v.n).toFixed(1)}% · by code: ${Object.entries(v.codes).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${(100 * n / v.n).toFixed(1)}%`).join(' · ')}`) }
