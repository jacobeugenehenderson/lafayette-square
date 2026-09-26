#!/usr/bin/env node
/**
 * claims-hero-degrade-static.mjs — the opening view of a town with no keyframes.
 * (A11-c gate, agent Vantage 2026-08-07; re-founded 2026-09-26 on
 * BRIEF-camera-regimes, when the camera stopped reading a hero subject.)
 *
 * H-7 (Jacob, 2026-09-25): "Where a town has no keyframes yet, the default
 * opening view MAY point at its set-piece, else the town centre: a starting
 * suggestion, not a rule." This proves that view, for EVERY baked Look, in a
 * town nobody has looked at:
 *
 *   1. STATIC   — a Look with no authored heroKeyframes plays exactly one
 *                 keyframe, and heroKeyframeAnim returns the SAME pose at every
 *                 phase of the period (no motion, not "slow motion").
 *   2. TRACKS   — the pose is derived from the scene's OWN disc
 *                 (ground.json#stencil): scale the disc, the pose scales; move
 *                 it, the pose moves. A constant that ignores its input is the
 *                 defect this check exists to catch (the seven-in-a-day class).
 *   3. LOUD     — a published-but-degenerate disc refuses and shouts, rather
 *                 than substituting a plausible frame.
 *   4. AUTHORED — a Look WITH heroKeyframes is passed through untouched.
 *
 * ⭐ Imports the one deriver every runtime uses (src/lib/cameraRegimes.js) and
 * the one playback (src/preview/heroAnim.js) — nothing restated here.
 * Enumerates public/baked/ * /scene.json — no scene names in this file.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'
import { heroKeyframeAnim } from '../src/preview/heroAnim.js'
import { derivedOpeningKeyframe, resolveHeroKeyframes } from '../src/lib/cameraRegimes.js'
import { requireArtifact } from './_scenes.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HERO_MOTION = { period: 720, easing: 'sine' }   // the runtimes' default when scene.json omits heroMotion

let fails = 0
const bad = (msg) => { console.log(`  ✗ ${msg}`); fails++ }
const ok  = (msg) => console.log(`  ✓ ${msg}`)

// ── 3. LOUD ──────────────────────────────────────────────────────────────────
console.log('\n[loud] a degenerate disc must refuse, not substitute')
{
  const quiet = console.error; let shouted = 0
  console.error = () => { shouted++ }
  const degenerate = [{}, { radius: 0, center: [0, 0] }, { radius: NaN, center: [0, 0] },
    { radius: -5, center: [0, 0] }, { radius: 500 }, { radius: 500, center: [NaN, 0] }]
  const results = degenerate.map(s => derivedOpeningKeyframe(s, 22))
  const pending = derivedOpeningKeyframe(null, 22)
  console.error = quiet
  if (results.every(r => r === null)) ok(`${results.length}/${results.length} degenerate discs refused`)
  else bad(`a degenerate disc produced a pose: ${JSON.stringify(results.find(r => r !== null))}`)
  if (shouted === results.length) ok(`each refusal shouted on console.error (${shouted})`)
  else bad(`silent refusal — ${shouted} of ${results.length} shouted`)
  if (pending === null) ok('an unpublished disc (still loading) yields no pose')
  else bad('an unpublished disc produced a pose')
}

// ── 2. TRACKS ────────────────────────────────────────────────────────────────
console.log('\n[tracks] the pose must follow the disc it is given')
{
  const small = derivedOpeningKeyframe({ center: [0, 0], radius: 250 }, 22)
  const big   = derivedOpeningKeyframe({ center: [0, 0], radius: 2500 }, 22)
  const dist = (p) => Math.hypot(p[0], p[2])
  if (dist(big.position) > dist(small.position) * 9) ok(`10× disc ⇒ ${(dist(big.position) / dist(small.position)).toFixed(1)}× standoff`)
  else bad(`standoff ignores the disc's size (${dist(small.position).toFixed(0)} → ${dist(big.position).toFixed(0)})`)
  if (big.position[1] > small.position[1] * 9) ok(`10× disc ⇒ ${(big.position[1] / small.position[1]).toFixed(1)}× eye height`)
  else bad('eye height ignores the disc\'s size')
  const off = derivedOpeningKeyframe({ center: [500, -250], radius: 250 }, 22)
  const moved = Math.abs(off.position[0] - small.position[0] - 500) < 1e-6 && Math.abs(off.position[2] - small.position[2] + 250) < 1e-6
    && off.target[0] === 500 && off.target[2] === -250
  if (moved) ok('pose and aim are anchored on the disc centre, not on a world literal')
  else bad('pose does not translate with the disc centre')
}

// ── Per-scene sweep ──────────────────────────────────────────────────────────
const bakedDir = join(ROOT, 'public/baked')
requireArtifact(bakedDir.replace(process.cwd() + '/', ''), 'public/baked')
const looks = readdirSync(bakedDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(bakedDir, d.name, 'scene.json')))
  .map(d => d.name)

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const V = () => new THREE.Vector3()

console.log(`\n[scenes] ${looks.length} baked Looks`)
for (const look of looks) {
  const scene = readJson(join(bakedDir, look, 'scene.json'))
  const stencil = readJson(join(bakedDir, look, 'ground.json'))?.stencil ?? null
  const authored = !!scene.heroKeyframes?.length
  const fov = scene.shots?.values?.hero?.fov ?? 22
  let kfs
  try { kfs = resolveHeroKeyframes(scene.heroKeyframes, stencil, fov, look) }
  catch (e) { bad(`${look}: ${e.message}`); continue }

  if (authored) {
    if (kfs !== scene.heroKeyframes) bad(`${look}: authored path did not pass through by identity`)
    else console.log(`  · ${look.padEnd(26)} AUTHORED (${kfs.length} kf) — passed through`)
    continue
  }
  if (!kfs) { bad(`${look}: no keyframes and no scene disc — nothing to open on`); continue }

  // 1. STATIC — sample the whole period; every pose identical.
  const motion = scene.heroMotion || HERO_MOTION
  const period = motion.period || 720
  const samples = Array.from({ length: 24 }, (_, i) => {
    const p = V(), q = V()
    const { fov: f } = heroKeyframeAnim((i / 24) * period, kfs, motion, p, q)
    return [p.x, p.y, p.z, q.x, q.y, q.z, f]
  })
  const moved = samples.some(s => s.some((v, j) => Math.abs(v - samples[0][j]) > 1e-9))
  const verdict = !moved && kfs.length === 1
  const p = samples[0].slice(0, 3).map(v => Math.round(v))
  console.log(`  ${verdict ? '✓' : '✗'} ${look.padEnd(26)} OPENING VIEW 1 kf @ [${p}] → disc r=${stencil.radius}` +
    `${moved ? '  ⛔ MOVES' : ''}`)
  if (!verdict) fails++
}

console.log(fails === 0 ? '\nPASS — the opening view is static, disc-derived, and loud on refusal'
                        : `\nFAIL — ${fails} problem(s)`)
process.exit(fails === 0 ? 0 : 1)
