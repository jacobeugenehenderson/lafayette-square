// THE BASE-VS-COAST TABLE (Boz, 2026-10-13): two pours of one town, each with its map.json and its pour log (stdout of
// pipeline.js), side by side. Read-only. The counts are read off the pour's own [①] lines and its frozen protopolygon.
//   node scratch/coast/compare-pours.mjs <base map.json> <base pour.log> <coast map.json> <coast pour.log>
import fs from 'fs'
const [bm, bl, cm, cl] = process.argv.slice(2)
if (!cl) { console.error('usage: compare-pours.mjs <base map.json> <base pour.log> <coast map.json> <coast pour.log>'); process.exit(2) }
const read = (m, l) => {
  const P = JSON.parse(fs.readFileSync(m, 'utf8')).layers.ribbons.protopolygon, log = fs.readFileSync(l, 'utf8')
  const num = (re) => { const x = log.match(re); return x ? +x[1].replace(/,/g, '') : 0 }
  const water = P.owners.map(o => o?.skelId === '__water__')
  return {
    'ε-residue faces dropped': num(/(\d+) face\(s\) are THINNER THAN ε/),
    'vertices, no containing edge': num(/\[①\] containment:[^\n]*?⛔ (\d+) with no single containing edge/),
    'blocks containment, no containing edge': num(/blocks containment:[^\n]*?⛔ (\d+) with no single containing edge/),
    'blocks': P.blocks.length,
    'blocks touching the shore': P.blocks.filter((b, k) => (P.blockLabels[k] || []).some(l => water[l])).length,
    '① rings': P.rings.length,
    'crossings': num(/froze the protopolygon:[^\n]*?, ([\d,]+) crossings/),
    'chain outlines': num(/froze the protopolygon: ([\d,]+) chain outline/),
  }
}
const B = read(bm, bl), C = read(cm, cl)
console.log('                                        BASE → COAST')
for (const k of Object.keys(B)) console.log(`  ${k.padEnd(40)} ${String(B[k]).padStart(6)} → ${String(C[k]).padEnd(6)} (${C[k] - B[k] >= 0 ? '+' : ''}${C[k] - B[k]})`)
