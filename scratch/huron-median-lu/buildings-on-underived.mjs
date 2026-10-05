// Forensic (Sward): what buildings stand on ground the land evidence leaves `underived` — the only ground a
// building-derived land use (BRIEF-land-use-derivation Phase 3) could reach. Counts footprints (raw msbf + OSM) by
// centroid, and what OSM's `building=*` tag says of those that carry one. No pour; evidence built in memory.
// Usage: CARTOGRAPH_SCENE=<town> node scratch/huron-median-lu/buildings-on-underived.mjs <town>
import fs from 'fs'
import { evidenceFor } from './evidence-smoke.mjs'
const town = process.argv[2], raw = `cartograph/data/${town}/raw`
const S = JSON.parse(fs.readFileSync(`public/baked/${town}/shape.json`)), E = evidenceFor(town).evidence
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const bbx = r => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]; return b }
const inside = (x, z, L) => L.filter(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && pip(x, z, o.r)).length % 2 === 1
const pieces = S.tiles.flatMap(t => t.iA).map(r => ({ r, bb: bbx(r) }))
const ev = E.map(e => e.rings.map(r => ({ r, bb: bbx(r) })))
const isUnderived = (x, z) => inside(x, z, pieces) && !ev.some(q => inside(x, z, q))
const cen = (cs) => [cs.reduce((a, q) => a + (q.x ?? q[0]), 0) / cs.length, cs.reduce((a, q) => a + (q.z ?? q[1]), 0) / cs.length]
const osmB = (JSON.parse(fs.readFileSync(`${raw}/osm.json`)).buildings || []).filter(b => (b.coords || b.ring)?.length >= 3)
const msbf = fs.existsSync(`${raw}/msbf.json`) ? JSON.parse(fs.readFileSync(`${raw}/msbf.json`)).buildings.filter(b => b.coords?.length >= 3) : []
let all = 0, onU = 0; const tag = {}
for (const b of osmB) { const [x, z] = cen(b.coords || b.ring); all++; if (isUnderived(x, z)) { onU++; const t = b.tags?.building || '(none)'; tag[t] = (tag[t] || 0) + 1 } }
let mAll = 0, mU = 0; for (const b of msbf) { const [x, z] = cen(b.coords); mAll++; if (isUnderived(x, z)) mU++ }
console.log(`${town}: OSM buildings ${all}, on underived ground ${onU} · their building=* tags: ${Object.entries(tag).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`)
console.log(`   raw footprints (msbf, untyped) ${mAll}, on underived ground ${mU}`)
