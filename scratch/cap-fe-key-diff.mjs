// cap-fe-key-diff.mjs — the customs-identity question the strict t4 parity can't
// answer on its own: blockCustoms is keyed [skelId, side, min(segOrds)], NOT
// edgeOrd. So compare KEY SETS + each key's owned segOrds, baseline vs now. A
// lost key (or changed segOrds) is what silently orphans an authored edit.
//   node scratch/cap-fe-key-diff.mjs <baseline.json>
import fs from 'fs'
const base = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const rows = base.fes || base
const kOf = (r) => r.key ? r.key.join('|') : null
const baseMap = new Map()
for (const r of rows) { const k = kOf(r); if (k) baseMap.set(k, (r.segOrds || []).join(',')) }

const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const { feCustomKey } = await import('../src/lib/feCustomKey.js')
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const o = console.log; console.log = () => {}
const v2 = buildBlockGeometryV2(ribbons, { stencil, blockCustoms: design.blockCustoms || null,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, curbWidth: design.curbWidth ?? 0.15,
  blockLandUse: design.blockLandUse })
console.log = o
const nowMap = new Map()
for (const fe of v2.frontageEdges) { const k = feCustomKey(fe); if (k) nowMap.set(k.join('|'), (fe.segOrds || []).join(',')) }

const lost = [...baseMap.keys()].filter(k => !nowMap.has(k))
const added = [...nowMap.keys()].filter(k => !baseMap.has(k))
const changed = [...baseMap.keys()].filter(k => nowMap.has(k) && nowMap.get(k) !== baseMap.get(k))
console.log(`baseline keys ${baseMap.size} → now ${nowMap.size}`)
console.log(`  LOST (an authored custom here would orphan): ${lost.length}`)
lost.forEach(k => console.log(`     - ${k}  segOrds was [${baseMap.get(k)}]`))
console.log(`  ADDED (newly writable): ${added.length}`)
added.slice(0, 60).forEach(k => console.log(`     + ${k}  segOrds [${nowMap.get(k)}]`))
console.log(`  SEGORDS CHANGED: ${changed.length}`)
changed.forEach(k => console.log(`     ~ ${k}  [${baseMap.get(k)}] → [${nowMap.get(k)}]`))

// Which of these touch a chain that has an AUTHORED custom today?
const bc = design.blockCustoms || {}
const authored = new Set()
for (const skel of Object.keys(bc)) for (const side of Object.keys(bc[skel] || {})) for (const seg of Object.keys(bc[skel][side] || {})) authored.add(`${skel}|${side}|${seg}`)
console.log(`\nauthored custom slots in design.json: ${authored.size}`)
const hit = [...lost, ...changed].filter(k => authored.has(k))
console.log(hit.length ? `  ⚠️  ${hit.length} authored slot(s) affected: ${hit.join(', ')}` : '  ✓ no authored slot lost or re-keyed')
