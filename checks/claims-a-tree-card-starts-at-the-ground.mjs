// claims-a-tree-card-starts-at-the-ground.mjs — DOES EVERY HERO TREE CARD START AT THE GROUND?
//
// A hero card is a captured image of a tree on a vertical quad. Its frame must begin
// at y = 0 or the trunk ends in a cut in the air. Three parts, each read off the source:
//   ① the frame: the REAL buildHeroImpostorCard, on trees of every proportion, puts its
//      bottom edge at y = 0 and still contains the whole tree (top ≥ height, width ≥ crown);
//   ② one framing function: captureImpostor's side-on camera calls heroCardFrame, the
//      same function the card calls — no second copy of the arithmetic;
//   ③ what ships: every hero record in every baked town was shot with that frame.
//      A record without it is named, per town — it renders with its trunk above the
//      ground until the Grove re-shoots it (CAPTURE_FORMAT.hero makes it dirty).
//
// ▶ MUTATION-TEST IT:
//     · in heroCardFrame, `centerY: half` → `centerY: topM / 2 + 3`       → ① RED
//     · in captureImpostor's sideOn branch, replace the heroCardFrame call with its own
//       arithmetic                                                          → ② RED
//   Put each back.
//
//   node checks/claims-a-tree-card-starts-at-the-ground.mjs
// Read-only. Exits 1 when any card can start above the ground.
import fs from 'fs'
import path from 'path'
import { buildHeroImpostorCard, heroCardFrame, HERO_FRAME_VERSION } from '../src/components/impostorGeometry.js'

let red = 0
const bad = m => { red++; console.log(`   ⛔ ${m}`) }
const bottomOf = g => { const p = g.attributes.position.array; let lo = Infinity, hi = -Infinity, w = 0; for (let i = 0; i < p.length; i += 3) { lo = Math.min(lo, p[i + 1]); hi = Math.max(hi, p[i + 1]); w = Math.max(w, Math.abs(p[i])) } return { lo, hi, w } }

console.log('① THE FRAME STARTS AT THE GROUND')
// Tall-narrow, short-wide, and the proportions that failed on huron (blackgum, linden).
for (const [H, R] of [[21.3, 8.5], [24.4, 11.4], [30, 3], [8, 12], [15, 6.2], [2, 0.3]]) {
  const rec = { heightM: H, canopyRadiusM: R, canopyBaseNorm: 0.1, frame: { v: HERO_FRAME_VERSION, topM: H } }
  const { lo, hi, w } = bottomOf(buildHeroImpostorCard(rec, { cardDepthFrac: 0.5, grid: 2 }))
  const f = heroCardFrame({ topM: H, radiusM: R })
  const ok = Math.abs(lo) < 1e-6 && Math.abs(f.centerY - f.half) < 1e-9 && hi >= H && w >= R
  ok ? console.log(`   ✅ H ${H} m · R ${R} m → bottom ${lo.toFixed(3)} m, top ${hi.toFixed(1)} ≥ ${H}, half-width ${w.toFixed(1)} ≥ ${R}`)
     : bad(`H ${H} m · R ${R} m → bottom ${lo.toFixed(3)} m, top ${hi.toFixed(1)}, half-width ${w.toFixed(1)}`)
}

console.log('② ONE FRAMING FUNCTION')
{
  const src = fs.readFileSync('src/components/captureImpostor.js', 'utf8').replace(/\/\/.*$/gm, '')
  const branch = src.slice(src.indexOf('} else if (opts.sideOn) {'), src.indexOf('} else {', src.indexOf('} else if (opts.sideOn) {')))
  if (!branch) bad('captureImpostor has no sideOn branch to read')
  else if (!/heroCardFrame\(/.test(branch)) bad('captureImpostor\'s side-on capture does not call heroCardFrame — the image and the card can disagree about the ground')
  else if (/midY\s*=\s*\(/.test(branch)) bad('captureImpostor\'s side-on branch computes its own midY')
  else console.log('   ✅ the side-on capture frames with heroCardFrame')
}

console.log('③ WHAT SHIPS')
for (const look of fs.readdirSync('public/baked')) {
  const p = path.join('public/baked', look, 'trees-atlas.json')
  if (!fs.existsSync(p)) continue
  const recs = JSON.parse(fs.readFileSync(p, 'utf8')).heroImpostorBySpecies || {}
  const all = Object.keys(recs)
  if (!all.length) { console.log(`   · ${look}: no hero cards`); continue }
  const legacy = all.filter(s => recs[s]?.frame?.v !== HERO_FRAME_VERSION)
  legacy.length ? bad(`${look}: ${legacy.length}/${all.length} hero records shot before the ground frame — ${legacy.join(', ')} ▶ re-shoot: Grove → Bake → Slab for "${look}"`)
                : console.log(`   ✅ ${look}: ${all.length} hero records, all on the ground frame`)
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
