#!/usr/bin/env node
/**
 * claims-hero-degrade-static.mjs — A11-c gate (agent Vantage, 2026-08-07).
 *
 * Jacob's ruling: "the camera is a pan pointed at the hero object; with no hero
 * object set up, the pan defaults to OFF." This proves the undesignated hero
 * degrade, for EVERY baked Look, in a town nobody has looked at:
 *
 *   1. STATIC   — a Look with no authored heroKeyframes gets exactly one
 *                 keyframe, and heroKeyframeAnim returns the SAME pose at every
 *                 phase of the period (no motion, not "slow motion").
 *   2. NOT LS   — the derived pose is not Lafayette Square's literal, and it
 *                 tracks the scene's own hood extent: change the extent, the
 *                 pose must move. A constant that ignores its input is the
 *                 defect this check exists to catch.
 *   3. LOUD     — with no readable hood extent the deriver returns null and
 *                 shouts, rather than substituting a plausible frame.
 *   4. AUTHORED — a Look WITH heroKeyframes is passed through untouched.
 *
 * ⭐ Reads the constants and the deriver out of src/components/Scene.jsx source
 * rather than restating them, so it cannot go stale when the formula is tuned.
 * Enumerates public/baked/ * /scene.json — no scene names in this file.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { heroAnimPose } from '../src/preview/heroAnim.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCENE_JSX = join(ROOT, 'src/components/Scene.jsx')

// ── Lift the deriver + its constants out of Scene.jsx (never restate them) ───
const src = readFileSync(SCENE_JSX, 'utf8')
function lift(name, re) {
  const m = src.match(re)
  if (!m) { console.error(`FAIL — could not lift ${name} from Scene.jsx`); process.exit(1) }
  return m
}
const HERO_CENTER = JSON.parse(lift('HERO_CENTER', /const HERO_CENTER = (\[[^\]]*\])/)[1])
const fnSrc = lift('derivedHeroPose', /(function derivedHeroPose[\s\S]*?\n})/)[1]
const constsSrc = [
  lift('HERO_STANDOFF_RATIO', /const HERO_STANDOFF_RATIO\s*=\s*[-\d.]+/)[0],
  lift('HERO_EYE_RATIO',      /const HERO_EYE_RATIO\s*=\s*[-\d.]+/)[0],
  lift('HERO_BEARING',        /const HERO_BEARING\s*=\s*\[[^\]]*\]/)[0],
].join('\n')
const derivedHeroPose = new Function(`${constsSrc}\n${fnSrc}\nreturn derivedHeroPose`)()

// Scene.jsx's own default when scene.json omits heroMotion.
const HERO_MOTION = { period: 720, easing: 'sine' }
// Scene.jsx's hero-keyframe expression, replayed exactly (see the useMemo).
function keyframesFor(scene, heroSubject, bounds, fov) {
  if (scene?.heroKeyframes?.length) return scene.heroKeyframes
  const pos = derivedHeroPose(heroSubject, bounds)
  return [{ position: pos || HERO_CENTER, fov }]
}

let fails = 0
const bad = (msg) => { console.log(`  ✗ ${msg}`); fails++ }
const ok  = (msg) => console.log(`  ✓ ${msg}`)

// ── 3. LOUD: no readable extent ⇒ null, not a plausible pose ─────────────────
console.log('\n[loud] degenerate hood extent must refuse, not substitute')
{
  const quiet = console.error; let shouted = 0
  console.error = () => { shouted++ }
  const results = [undefined, null, {}, { w: 0, h: 0 }, { w: NaN, h: 100 }, { w: -5, h: 5 }]
    .map(b => derivedHeroPose([0, 40, 0], b))
  console.error = quiet
  if (results.every(r => r === null)) ok(`${results.length}/${results.length} degenerate extents refused`)
  else bad(`a degenerate extent produced a pose: ${JSON.stringify(results.find(r => r !== null))}`)
  if (shouted === results.length) ok(`each refusal shouted on console.error (${shouted})`)
  else bad(`silent refusal — ${shouted} of ${results.length} shouted`)
}

// ── 2b. The pose must TRACK the extent (a constant would pass everything else) ──
console.log('\n[tracks] pose must follow the scene it is given')
{
  const small = derivedHeroPose([0, 40, 0], { w: 400, h: 300 })
  const big   = derivedHeroPose([0, 40, 0], { w: 4000, h: 3000 })
  const dist = (p) => Math.hypot(p[0], p[2])
  if (dist(big) > dist(small) * 9) ok(`10× hood ⇒ ${(dist(big) / dist(small)).toFixed(1)}× standoff`)
  else bad(`standoff ignores hood size (${dist(small).toFixed(0)} → ${dist(big).toFixed(0)})`)
  const off = derivedHeroPose([500, 40, -250], { w: 400, h: 300 })
  if (Math.abs(off[0] - small[0] - 500) < 1e-6 && Math.abs(off[2] - small[2] + 250) < 1e-6)
    ok('pose is anchored on the resolved hero subject, not on a world literal')
  else bad('pose does not translate with the hero subject')
  if (big[1] > small[1] * 9) ok(`10× hood ⇒ ${(big[1] / small[1]).toFixed(1)}× eye height`)
  else bad('eye height ignores hood size')
}

// ── Per-scene sweep ──────────────────────────────────────────────────────────
const bakedDir = join(ROOT, 'public/baked')
const looks = readdirSync(bakedDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(bakedDir, d.name, 'scene.json')))
  .map(d => d.name)

console.log(`\n[scenes] ${looks.length} baked Looks`)
for (const look of looks) {
  const scene = JSON.parse(readFileSync(join(bakedDir, look, 'scene.json'), 'utf8'))
  const authored = !!scene.heroKeyframes?.length
  const fov = scene.shots?.values?.hero?.fov ?? 22
  const bounds = scene.shots?.values?.browse?.bounds
  // The undesignated look-at for a Look with no arch channel is the hood
  // centroid = the local frame origin, by construction (src/lib/heroSubject.js).
  const subject = [0, 40, 0]
  const kfs = keyframesFor(scene, subject, bounds, fov)
  const motion = scene.heroMotion || HERO_MOTION

  if (authored) {
    console.log(`  · ${look.padEnd(26)} AUTHORED (${kfs.length} kf) — passed through`)
    if (kfs !== scene.heroKeyframes) bad(`${look}: authored path did not pass through by identity`)
    continue
  }

  // 1. STATIC — sample the whole period; every pose identical.
  const poses = Array.from({ length: 24 }, (_, i) => heroAnimPose(i / 24, kfs, motion).position.slice())
  const moved = poses.some(p => p.some((v, j) => Math.abs(v - poses[0][j]) > 1e-9))
  const fovs = Array.from({ length: 24 }, (_, i) => heroAnimPose(i / 24, kfs, motion).fov)
  const fovMoved = fovs.some(f => Math.abs(f - fovs[0]) > 1e-9)

  // 2. NOT LS — must not be the LS literal.
  const isLs = poses[0].every((v, j) => Math.abs(v - HERO_CENTER[j]) < 1e-9)

  const p = poses[0].map(v => Math.round(v))
  const verdict = (!moved && !fovMoved && !isLs && kfs.length === 1)
  console.log(`  ${verdict ? '✓' : '✗'} ${look.padEnd(26)} DEGRADE 1 kf @ [${p}] fov ${fovs[0]}` +
    `${moved ? '  ⛔ MOVES' : ''}${fovMoved ? '  ⛔ FOV MOVES' : ''}${isLs ? '  ⛔ IS THE LS LITERAL' : ''}`)
  if (!verdict) fails++
}

console.log(fails === 0 ? '\nPASS — hero degrade is static, scene-derived, and loud on refusal'
                        : `\nFAIL — ${fails} problem(s)`)
process.exit(fails === 0 ? 0 : 1)
