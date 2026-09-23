// READ-ONLY probe (H-3 design review, 2026-09-23): "the block's edge equals the highway's edge" — how far apart
// are they TODAY, on the frozen shape.json? For every curb vertex (iaFull, uncut) whose stamp (iaStamp[r][k] = run index) is a gradeSeparated run, measure the distance to the frozen `highway` polygon's
// boundary. Owner by STAMP, never by proximity. Signed: + = the curb stands off the highway (a gap), − = inside it.
import fs from 'node:fs'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['huron', 'lafayette-square']
const K = p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`
for (const t of towns) {
  const skP = `cartograph/data/${t}/clean/skeleton.json`, shP = `public/baked/${t}/shape.json`
  const gs = new Set(JSON.parse(fs.readFileSync(skP)).streets.filter(s => s.gradeSeparated).map(s => s.id))
  const sh = JSON.parse(fs.readFileSync(shP))
  // ⛔ The frozen `highway` output is STENCIL-CLIPPED to the disc; `iaFull` is the UNCUT contour. Compare inside the disc
  // only, or every curb vertex past the rim reads as a gap against the clip line (found 2026-09-23: the "orphans").
  const nb = JSON.parse(fs.readFileSync(`cartograph/data/${t}/neighborhood_boundary.json`)), inDisc = p => Math.hypot(p[0] - nb.center[0], p[1] - nb.center[1]) < nb.radius
  const segs = [], G = new Map(), C = 20
  for (const ring of sh.highway || []) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const k = segs.push([a, b]) - 1
    for (let gx = Math.floor(Math.min(a[0], b[0]) / C); gx <= Math.floor(Math.max(a[0], b[0]) / C); gx++) for (let gz = Math.floor(Math.min(a[1], b[1]) / C); gz <= Math.floor(Math.max(a[1], b[1]) / C); gz++) { const g = `${gx},${gz}`; if (!G.has(g)) G.set(g, []); G.get(g).push(k) } }
  const inside = (p) => { let c = false; for (const ring of sh.highway) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
  const dist = (p) => { let best = Infinity; const gx = Math.floor(p[0] / C), gz = Math.floor(p[1] / C)
    for (let r = 0; r <= 3 && best === Infinity; r++) for (let x = gx - r; x <= gx + r; x++) for (let z = gz - r; z <= gz + r; z++) for (const k of G.get(`${x},${z}`) || []) { const [a, b] = segs[k]; const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const u = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; best = Math.min(best, Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dz)) }
    return best }
  const d = []; let unstamped = 0, far = 0
  for (const tl of sh.tiles) {
    if (!tl.iaFull || !tl.iaStamp) continue
    tl.iaFull.forEach((ia, r) => ia.forEach((p, k) => { const ri = tl.iaStamp[r]?.[k]; if (ri == null) { unstamped++; return }
      const sk = tl.runs?.[ri]?.skelId; if (!gs.has(sk)) return
      if (!inDisc(p)) return
      const e = dist(p); if (!Number.isFinite(e)) { far++; return } d.push(inside(p) ? -e : e) }))
  }
  d.sort((a, b) => a - b); const q = f => d[Math.floor(f * (d.length - 1))]?.toFixed(2)
  console.log(`${t} [shape ${fs.statSync(shP).mtime.toISOString()}] highway-owned curb vertices ${d.length} · signed gap to highway edge p05/p50/p95 ${q(.05)}/${q(.5)}/${q(.95)} m · |gap|>0.5 m: ${d.filter(x => Math.abs(x) > .5).length} · no highway within 60 m: ${far} · unstamped ${unstamped}`)
}
