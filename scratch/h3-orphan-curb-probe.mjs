// READ-ONLY probe (H-3, 2026-09-23): the highway-owned curb vertices with NO frozen `highway` polygon within ~60 m.
// Groups them by owning skelId (by STAMP: iaStamp[r][k] → runs[i].skelId) and prints the owner's class, measure,
// distance from the disc centre vs radius, and the distance to the nearest frozen `asphalt`-side evidence is not
// available in shape.json, so it reports whether the owner is a HIGHWAY_CLASSES road (→ `highway` output) or not
// (→ city asphalt, `Aacc`, per tileGround's stroke loop).
import fs from 'node:fs'
const t = process.argv[2] || 'huron'
const skP = `cartograph/data/${t}/clean/skeleton.json`, shP = `public/baked/${t}/shape.json`
const sk = JSON.parse(fs.readFileSync(skP)).streets, sh = JSON.parse(fs.readFileSync(shP))
const nb = JSON.parse(fs.readFileSync(`cartograph/data/${t}/neighborhood_boundary.json`))
const by = new Map(sk.map(s => [s.id, s])), HC = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
const segs = [], G = new Map(), C = 20
for (const ring of sh.highway || []) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const k = segs.push([a, b]) - 1
  for (let gx = Math.floor(Math.min(a[0], b[0]) / C); gx <= Math.floor(Math.max(a[0], b[0]) / C); gx++) for (let gz = Math.floor(Math.min(a[1], b[1]) / C); gz <= Math.floor(Math.max(a[1], b[1]) / C); gz++) { const g = `${gx},${gz}`; if (!G.has(g)) G.set(g, []); G.get(g).push(k) } }
const near = p => { const gx = Math.floor(p[0] / C), gz = Math.floor(p[1] / C); for (let x = gx - 3; x <= gx + 3; x++) for (let z = gz - 3; z <= gz + 3; z++) if (G.has(`${x},${z}`)) return true; return false }
const out = new Map()
for (const tl of sh.tiles) { if (!tl.iaFull || !tl.iaStamp) continue
  tl.iaFull.forEach((ia, r) => ia.forEach((p, k) => { const s = tl.runs?.[tl.iaStamp[r]?.[k]]?.skelId; const st = by.get(s); if (!st?.gradeSeparated || near(p)) return
    if (!out.has(s)) out.set(s, { n: 0, rr: [] }); const o = out.get(s); o.n++; o.rr.push(Math.hypot(p[0] - nb.center[0], p[1] - nb.center[1]) / nb.radius) })) }
console.log(`${t} [skeleton ${fs.statSync(skP).mtime.toISOString()} · shape ${fs.statSync(shP).mtime.toISOString()}] frozen highway rings ${sh.highway?.length || 0}`)
for (const [s, o] of [...out].sort((a, b) => b[1].n - a[1].n)) { const st = by.get(s); o.rr.sort((a, b) => a - b)
  console.log(`   ${s}: ${o.n} vtx · ${st.highway}${st.bridge ? ' bridge' : ''} · → ${HC.has(st.highway) ? 'HIGHWAY output' : 'CITY ASPHALT (Aacc)'} · r/R ${o.rr[0].toFixed(2)}–${o.rr.at(-1).toFixed(2)}`) }
