// claims-the-street-eye-stands-on-the-ground.mjs — IS EVERY STREET CAMERA 5′8″ ABOVE THE DRAWN GROUND?
//
// Jacob, 2026-09-26: "the street camera is supposed to be about 5' 8" off the finished
// ground elevation." Found wrong three ways in one day: Stage stood an ABSOLUTE 1.73 m
// (underground on raised terrain: LS's street point is ~30 m up); production read the
// EXAGGERATED sampler while the street view draws exag 1 (the eye floated); Preview
// used the absolute pose. ⛔ The first version of this check only asked whether a file
// NAMED the right sampler, and passed while Stage's LS branch stood 28 m underground
// (Plumb, 2026-09-26). So it now checks WHERE the method is applied, and runs it.
//
// Claims:
//  (a) ONE METHOD. `streetEyeY` is defined once (src/utils/elevation.js), reads the RAW
//      elevation (the street view draws exag 1), and THROWS on a missing sample —
//      no fallback.
//  (b) EVERY PLACER USES IT. Every source that places a Street eye (reads the authored
//      `street…eyeHeight`) calls streetEyeY and samples the ground no other way.
//  (c) NO HEIGHT TO COPY. The one stand point with no tap (src/camera/shots.js#streetStandOf)
//      is [x, z] off the town's own disc; no fixed pose table exists to copy a height —
//      or a town's coordinate — from (StageApp#SHOTS stood every town at LS's [0,-50]).
//  (d) EVERY TOWN, NOT ONE BRANCH. Stage and Preview both take the stand point from
//      streetStandOf, and Stage's camera code names no town.
//  (e) IT RUNS. For every town with terrain, the method at its stand point gives a
//      finite eye 1.73 m above the ground the street view draws.
//
//   node checks/claims-the-street-eye-stands-on-the-ground.mjs
// Read-only. Exits 1 on any failure.
import fs from 'fs'
import path from 'path'

const fails = []
const read = (f) => fs.readFileSync(f, 'utf8')
const EXT = /\.(m?js|jsx)$/
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (EXT.test(e.name)) out.push(p)
  }
  return out
}
const files = walk('src')

// (a) one method
const HOME = 'src/utils/elevation.js'
const defs = files.filter(f => /function streetEyeY\s*\(/.test(read(f)))
if (defs.length !== 1 || defs[0] !== HOME) fails.push(`(a) streetEyeY must be defined once, in ${HOME} (found: ${defs.join(', ') || 'none'})`)
const body = (read(HOME).match(/function streetEyeY[\s\S]*?\n}\n/) || [''])[0]
if (!/getElevationRaw\(/.test(body)) fails.push('(a) streetEyeY does not read the RAW elevation')
const guards = body.split('\n').filter(l => /isFinite\(/.test(l))
if (guards.length < 2 || guards.some(l => !/\bthrow\b/.test(l))) fails.push('(a) streetEyeY must THROW on a missing sample and a missing eye height — a guard that returns is a fallback')

// (b) every placer uses it
const NOT_PLACEMENTS = new Set(['src/cartograph/skyLightChannels.js', 'src/components/InstancedTrees.jsx'])
// A placer reads the authored eye height OR offers an Eye Height control (Stage's
// Street camera card set an absolute 1–5 m Y and this check did not see it).
const placers = files.filter(f => !NOT_PLACEMENTS.has(f) && /street\??\.eyeHeight|Eye Height/.test(read(f)))
if (!placers.length) fails.push('(b) no source places a Street eye — the claim reads nothing')
for (const f of placers) {
  const src = read(f)
  if (!/streetEyeY\(/.test(src)) fails.push(`(b) ${f} places a Street eye without streetEyeY`)
  if (/\bgetElevation(Raw)?\(/.test(src)) fails.push(`(b) ${f} samples the ground itself — use streetEyeY`)
}

// (c) no height to copy, and no pose table
const shots = read('src/camera/shots.js')
if (!/export function streetStandOf\(/.test(shots)) fails.push('(c) src/camera/shots.js has no streetStandOf — where does a Street eye with no tap stand?')
if (/^\s*street:\s*\{\s*position:/m.test(read('src/stage/StageApp.jsx'))) fails.push('(c) StageApp carries a fixed Street pose again')

// (d) every town: both no-tap placers take the one stand point, and Stage's camera names no town
const app = read('src/cartograph/CartographApp.jsx')
for (const p of ['src/cartograph/CartographApp.jsx', 'src/preview/PreviewApp.jsx']) {
  if (!/\bstreetStandOf\(/.test(read(p))) fails.push(`(d) ${p} stands the Street eye without streetStandOf`)
}
if (/mapKey\s*[!=]==?\s*'/.test(app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) fails.push('(d) Stage\'s camera code gates on a town name')

// (e) it runs, on every town's own terrain (raw = exag 1, what the street view draws)
const EYE = 1.73
const { loadSceneTerrain } = await import('../cartograph/terrainLoad.js')
const { streetStandOf } = await import('../src/camera/shots.js')
for (const scene of fs.readdirSync('cartograph/data')) {
  if (!fs.existsSync(`cartograph/data/${scene}/clean/terrain.json`)) continue
  const t = loadSceneTerrain(scene)
  if (!t) { fails.push(`(e) ${scene}: terrain.json present but no sampler`); continue }
  const b = fs.existsSync(`cartograph/data/${scene}/neighborhood_boundary.json`)
    ? JSON.parse(read(`cartograph/data/${scene}/neighborhood_boundary.json`)) : null
  const at = b ? streetStandOf(b) : null
  if (!at) { fails.push(`(e) ${scene}: no disc, so no stand point`); continue }
  const pts = [['stand point', at]]
  for (const [name, [x, z]] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) { fails.push(`(e) ${scene}: ${name} has no x/z`); continue }
    const g = t.getElevationRaw(x, z)
    if (!Number.isFinite(g)) fails.push(`(e) ${scene}: no ground at ${name} (${x}, ${z})`)
    else console.log(`  ${scene.padEnd(26)} ${name.padEnd(18)} ground ${g.toFixed(2)} m → eye ${(g + EYE).toFixed(2)} m`)
  }
}

console.log(`Street eye placements: ${placers.length} (${placers.join(', ')})`)
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('  ✓ every Street eye stands on the drawn ground, through one method, in every town')
