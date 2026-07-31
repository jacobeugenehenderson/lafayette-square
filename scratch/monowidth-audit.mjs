// monowidth-audit.mjs — RIBBONS §1 invariant 4: "Mono-width per block/run — the OUTER
// depth is uniform per block; what varies per-edge is the divider and the materials."
//
// A straight leg carrying TWO pavementHW values has to kink to get from one to the other.
// The centreline is straight, so the bend is ours, not the street's. This finds every leg
// that carries more than one width, which is the whole class.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const rib = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
let design = {}
try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const withCustoms = process.argv[2] !== 'plain'

const o = console.log; console.log = () => {}
const g = buildTileGround(rib, {
  smooth: 0, emitArtifact: true,
  blockCustoms: withCustoms ? (design.blockCustoms || null) : null,
  curbWidth: withCustoms ? (design.curbWidth ?? 0.15) : undefined,
})
console.log = o

// _shapeArtifact[].runs is the frozen per-run receipt (runMeta): skelId, side, and the
// measure the run actually resolved.
const byLeg = new Map()
for (let ti = 0; ti < (g._shapeArtifact || []).length; ti++) {
  for (const r of (g._shapeArtifact[ti].runs || [])) {
    if (!r?.skelId) continue
    const hw = r.measure?.[r.side]?.pavementHW
    if (!Number.isFinite(hw)) continue
    const k = `${r.skelId}|${r.side}`
    if (!byLeg.has(k)) byLeg.set(k, [])
    byLeg.get(k).push({ tile: ti, hw: +hw.toFixed(3), segOrd: r.segOrd })
  }
}

const rows = []
for (const [k, runs] of byLeg) {
  const ws = [...new Set(runs.map(r => r.hw))]
  if (ws.length < 2) continue
  const [sk, side] = k.split('|')
  rows.push({
    leg: sk, side,
    widths: ws.sort((a, b) => a - b).join(' / '),
    spreadM: +(Math.max(...ws) - Math.min(...ws)).toFixed(2),
    runs: runs.length,
    tiles: [...new Set(runs.map(r => r.tile))].join(','),
  })
}
rows.sort((a, b) => b.spreadM - a.spreadM)
console.log(`mode=${withCustoms ? 'design (authored customs)' : 'plain (no customs)'}`)
console.log(`legs carrying MORE THAN ONE width — each one must kink: ${rows.length} of ${byLeg.size}`)
console.table(rows.slice(0, 25))
