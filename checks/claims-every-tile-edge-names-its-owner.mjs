#!/usr/bin/env node
// claims-every-tile-edge-names-its-owner.mjs — EACH ① EDGE OF A TILE CARRIES THE OWNER ① STRUCK IT WITH (`tile.ringOwner`).
//
// The road side of the ground reads its line from `ringOwner` (BRIEF-the-ground-knows-its-height §5). The producer refuses a
// null; this check catches the other failure, a WRONG owner (an owner one edge out, which a reversed ring or a vertex label
// gives silently). Read off the frozen ① itself — `protopolygon.blocks` + `blockLabels` → `owners` — never off the producer:
//   · a tile edge that IS a frozen block edge (both ends, either way round) must name that block edge's owner;
//   · an edge the disc cut shortened must name the owner of the one block edge containing both its ends (within 1 mm);
//   · a `rim` edge must lie on the boundary ring, and no other edge may.
//   node checks/claims-every-tile-edge-names-its-owner.mjs [--scene=<town> …]
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'

const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const nm = (o) => !o ? 'NONE' : o.water ? 'water' : o.skelId === '__boundary__' ? 'rim' : o.kind || `${o.skelId}|${o.side}|${o.segOrd}`
let bad = 0, towns = 0
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { bad++; continue }
  const fp = f.ribbons?.protopolygon
  if (!fp?.blocks?.length || !fp.blockLabels || !fp.boundaryRing?.length) { console.log(`⛔ ${scene}: its frozen ① carries no blocks / blockLabels / boundaryRing — nothing to check against`); bad++; continue }
  const warn = console.warn; console.warn = () => {}
  let R; try { R = buildProto(f, { quiet: true, protoArtifact: true }) }
  catch (e) { console.warn = warn; console.log(`⛔ ${scene}: the producer refused, so nothing was checked — ${String(e.message).split('\n')[0].slice(0, 200)}`); bad++; continue }
  console.warn = warn
  towns++
  const key = (v) => v.join(','), whole = new Map(), G = 25, cells = new Map()
  fp.blocks.forEach((r, k) => r.forEach((v, i) => { const w = r[(i + 1) % r.length], o = fp.owners[fp.blockLabels[k][i]]
    whole.set(key(v) + '>' + key(w), o); whole.set(key(w) + '>' + key(v), o)
    for (let x = Math.floor(Math.min(v[0], w[0]) / G); x <= Math.floor(Math.max(v[0], w[0]) / G); x++) for (let z = Math.floor(Math.min(v[1], w[1]) / G); z <= Math.floor(Math.max(v[1], w[1]) / G); z++) (cells.get(x + ',' + z) || cells.set(x + ',' + z, []).get(x + ',' + z)).push({ a: v, b: w, o }) }))
  const B = fp.boundaryRing, onB = (p) => B.some((a, i) => sd(p, a, B[(i + 1) % B.length]) <= 1e-3)
  let edges = 0, wholeN = 0, cutN = 0, wrong = 0, noRef = 0, rimOff = 0, onRimNotRim = 0, missing = 0; const at = []
  for (const t of R.protoShapeTiles) { const n = t.ring.length
    if (!Array.isArray(t.ringOwner) || t.ringOwner.length !== n) { missing++; continue }
    for (let i = 0; i < n; i++) { const v = t.ring[i], w = t.ring[(i + 1) % n], o = t.ringOwner[i], mid = [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2]; edges++
      if (o?.kind === 'rim') { if (!(onB(mid) && onB(v) && onB(w))) rimOff++; continue }
      let exp = whole.get(key(v) + '>' + key(w))
      if (exp) wholeN++
      else { const c = new Set((cells.get(Math.floor(mid[0] / G) + ',' + Math.floor(mid[1] / G)) || []).filter(s => sd(v, s.a, s.b) <= 1e-3 && sd(w, s.a, s.b) <= 1e-3).map(s => nm(s.o)))
        if (c.size !== 1) { if (onB(mid) && onB(v) && onB(w)) onRimNotRim++; else noRef++; continue }
        cutN++; exp = { _n: [...c][0] } }
      const e = exp._n ?? nm(exp)
      if (e !== nm(o)) { wrong++; if (at.length < 3) at.push(`(${v.map(c => c.toFixed(2))}) → (${w.map(c => c.toFixed(2))}) names ${nm(o)}, ① struck it ${e}`) } } }
  const ok = !wrong && !rimOff && !onRimNotRim && !missing
  if (!ok) bad++
  console.log(`${ok ? '✅' : '⛔'} ${scene}: ${R.protoShapeTiles.length} tiles, ${edges} ① edges · whole block edges ${wholeN} · shortened by the disc ${cutN} · WRONG owner ${wrong}${at.length ? ` (${at.join(' · ')})` : ''} · rim edges off the boundary ${rimOff} · on the boundary but not rim ${onRimNotRim} · tiles with no ringOwner ${missing} · edges on no single block edge (reported, not failed) ${noRef}`)
}
if (!towns) { console.log('⛔ no town produced ① tiles — nothing was checked'); bad++ }
console.log(`\n${bad ? '⛔ RED — a tile edge names the wrong owner' : '✅ GREEN — every ① edge of every tile names the owner ① struck it with'}`)
process.exit(bad ? 1 : 0)
