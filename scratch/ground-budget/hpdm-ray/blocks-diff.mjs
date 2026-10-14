// blocks-diff.mjs <blocks A.json> <blocks B.json> <town> — READ-ONLY (Tern, 2026-10-14; Boz). The per-block record two HPDM pours wrote
// (blocks-*.json: `blk[k]` = the ② curb rings easedByBlock[k] yielded, |area| and vertex-mean of ① block k's ring; `outside` = the blocks
// whose tile the circle stamp dropped as wholly outside the disc; `tiles` = the block behind each artifact tile). Prints every block
// whose curb-ring count differs, with its distance from the disc's centre against the disc radius (neighborhood_boundary.json).
// The record is written by instrumenting tileGround (three lines: the `mine` read, the push, the `kept` cut; see this file's commit).
import { readFileSync } from 'fs'
const [a, b, town] = process.argv.slice(2), H = JSON.parse(readFileSync(a, 'utf8')), D = JSON.parse(readFileSync(b, 'utf8'))
const nb = JSON.parse(readFileSync(`cartograph/data/${town}/neighborhood_boundary.json`, 'utf8')), c = nb.center || [0, 0]
const oH = new Set(H.outside), oD = new Set(D.outside), ks = new Set([...Object.keys(H.blk), ...Object.keys(D.blk)])
console.log(`blocks ${ks.size} · disc radius ${nb.radius} m · artifact tiles by block identical: ${JSON.stringify(H.tiles) === JSON.stringify(D.tiles)} · dropped by the stamp ${H.outside.length} vs ${D.outside.length}`)
for (const k of ks) { const h = H.blk[k], d = D.blk[k]; if ((h?.curb ?? -1) === (d?.curb ?? -1)) continue; const at = (h || d).at
  console.log(`  block ${k}: curb rings ${h?.curb} → ${d?.curb} · ${(h || d).area} m² · vertex-mean (${at.join(', ')}) at ${Math.hypot(at[0] - c[0], at[1] - c[1]).toFixed(0)} m · dropped by the stamp: ${oH.has(+k) ? 'yes' : h?.curb ? 'no' : 'never reached it (no curb)'} → ${oD.has(+k) ? 'yes' : d?.curb ? 'no' : 'never reached it (no curb)'}`) }
