// claims-the-street-eye-stands-on-the-ground.mjs — IS EVERY STREET CAMERA 5′8″ ABOVE THE DRAWN GROUND?
//
// Jacob, 2026-09-26: "the street camera is supposed to be about 5' 8" off the finished
// ground elevation." Stage placed it at an ABSOLUTE 1.73 m, so on raised terrain
// (huron) it stood underground; production and Preview read the ground through the
// EXAGGERATED sampler while the street view draws the ground at exag 1, so the eye
// floated (exag − 1) × elevation above it.
//
// The claim, per app: every source that places a Street eye (reads the authored
// `street…eyeHeight`) takes the ground from `getElevationRaw` (the street view is
// drawn at exag 1) and never from the exaggerated `getElevation(`.
//
// ⭐ Reads the tree; restates nothing. A new app that places a Street eye is covered
// the day it is written. ⛔ A source-level claim: the eye gate is Jacob's, in Street.
//
//   node checks/claims-the-street-eye-stands-on-the-ground.mjs
// Read-only. Exits 1 on any failure.
import fs from 'fs'
import path from 'path'

const ROOTS = ['src']
const EXT = /\.(m?js|jsx)$/
// Where the default lives, and a comment that only names the number: not placements.
const NOT_PLACEMENTS = new Set(['src/cartograph/skyLightChannels.js', 'src/components/InstancedTrees.jsx'])
const READS_EYE = /street\??\.eyeHeight/

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (EXT.test(e.name)) out.push(p)
  }
  return out
}

const placers = []
const fails = []
for (const f of ROOTS.flatMap(r => walk(r))) {
  if (NOT_PLACEMENTS.has(f)) continue
  const src = fs.readFileSync(f, 'utf8')
  if (!READS_EYE.test(src)) continue
  placers.push(f)
  if (!/getElevationRaw\(/.test(src)) fails.push(`${f}: places a Street eye without reading the ground (getElevationRaw)`)
  if (/\bgetElevation\(/.test(src)) fails.push(`${f}: reads the EXAGGERATED ground (getElevation) — the street view is drawn at exag 1`)
}

if (placers.length === 0) fails.push('no source places a Street eye — the claim reads nothing (did the eyeHeight field move?)')
console.log(`Street eye placements: ${placers.length} (${placers.join(', ')})`)
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('  ✓ every Street eye stands on the drawn ground')
