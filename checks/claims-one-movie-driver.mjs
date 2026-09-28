#!/usr/bin/env node
/**
 * "IS THE TOWN'S MOVIE PLAYED BY ONE COMPONENT?"
 *
 * WHY (BRIEF-one-movie-driver; Warden's rulings 2026-09-28). The movie shot plays the slab's authored camera path
 * (heroKeyframes) through heroKeyframeAnim. Production (Scene.jsx CameraRig), Preview (ShotCamera) and Stage
 * (HeroPreview) each wrapped it in their own driver — their own clock, start phase and near plane — so one town was
 * framed through three sets of optics (camera.near 10 in production, 1 elsewhere). One driver now plays it:
 * src/camera/MovieCamera.jsx. An app owns ENTERING and LEAVING the movie (its tween, its gestures, Stage's scrub),
 * and samples the path through the driver's handle, never on its own clock.
 *
 * THE RULES, read from source:
 *   · no file under src/ calls heroKeyframeAnim( except MovieCamera.jsx (and heroAnim.js, which defines it);
 *   · no second start phase: randomizeHeroStart / _startOffsetSec exist nowhere;
 *   · the movie's near plane is the quality profile's `movieNear`, a finite number in EVERY profile, and no app
 *     writes camera.near itself (the harness excepted);
 *   · EXACTLY ONE module mounts <MovieCamera>, and it is <Town> (Warden, 2026-09-28: the Ward may import only Town, and a
 *     Town with shot='movie' played nothing — the per-app mounts in Scene/Preview/Stage are gone). Apps reach the
 *     driver only through <Town movie={{ start, onTime, playing, hold, handle }}>.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-one-movie-driver.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const DRIVER = 'src/camera/MovieCamera.jsx'
const ANIM = 'src/preview/heroAnim.js'
const PROFILE = 'src/lib/qualityProfile.js'
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|\{\s*\/\*[\s\S]*?\*\/\s*\}|\/\/.*$/gm, '')
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(n)) out.push(p) }
  return out
}
const harness = (x) => x.path.startsWith('src/harness/') && /⛔ HARNESS ONLY/.test(x.src.slice(0, 1500))

export function audit(files) {
  const f = [], info = []
  if (!files.some(x => x.path === DRIVER)) f.push(`${DRIVER} does not exist — there is no one movie driver`)
  for (const x of files) {
    const c = code(x.src)
    if (x.path !== DRIVER && x.path !== ANIM && /\bheroKeyframeAnim\s*\(/.test(c)) f.push(`${x.path} plays the movie path itself (heroKeyframeAnim) — sample it through <MovieCamera handle>`)
    if (/\brandomizeHeroStart\b|\b_startOffsetSec\b/.test(c)) f.push(`${x.path} keeps a second start phase (randomizeHeroStart / _startOffsetSec) — the phase is MovieCamera's`)
    if (x.path !== DRIVER && !harness(x) && /(?<![.\w])camera\.near\s*=[^=]/.test(c)) f.push(`${x.path} writes camera.near — the movie's near plane is quality.movieNear, written by ${DRIVER}`)
  }
  const prof = files.find(x => x.path === PROFILE)
  if (!prof) f.push(`${PROFILE} does not exist`)
  else {
    const blocks = [...code(prof.src).matchAll(/^\s{2}(\w+):\s*\{([\s\S]*?)^\s{2}\},/gm)]
    if (!blocks.length) f.push(`${PROFILE}: no profiles found — the check cannot see them`)
    for (const [, id, body] of blocks) {
      const m = body.match(/\bmovieNear:\s*([\d.]+)/)
      if (!m || !(Number(m[1]) > 0)) f.push(`${PROFILE}: profile "${id}" has no finite movieNear`)
      else info.push(`profile ${id}: movieNear ${m[1]}`)
    }
  }
  const driver = files.find(x => x.path === DRIVER)
  if (driver && !/\bmovieNear\b/.test(code(driver.src))) f.push(`${DRIVER} does not read quality.movieNear`)
  const TOWN = 'src/components/Town.jsx'
  const mounts = files.filter(x => /<MovieCamera\b/.test(code(x.src))).map(x => x.path)
  if (mounts.length !== 1 || mounts[0] !== TOWN) f.push(`<MovieCamera> is mounted by ${mounts.join(', ') || 'nothing'} — exactly one module mounts it, and it is ${TOWN} (the Ward imports only Town)`)
  else info.push(`<MovieCamera> is mounted once, by ${TOWN}`)
  const town = files.find(x => x.path === TOWN)
  if (town && !/shot\s*===\s*'movie'/.test(code(town.src))) f.push(`${TOWN} does not tie <MovieCamera> to shot === 'movie'`)
  if (town && !/heroKeyframes/.test(code(town.src))) f.push(`${TOWN} does not play the town's own baked heroKeyframes`)
  return { f, info }
}

const files = walk(join(ROOT, 'src')).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))

if (process.argv.includes('--self-test')) {
  const swap = (path, fn) => files.map(x => x.path === path ? { ...x, src: fn(x.src) } : x)
  const base = audit(files).f.length
  const cases = [
    ['an app plays the path itself', () => audit([...files, { path: 'src/fake/App.jsx', src: 'heroKeyframeAnim(t, k, m, p, q)' }])],
    ['a second start phase', () => audit([...files, { path: 'src/fake/App.jsx', src: 'randomizeHeroStart(m)' }])],
    ['an app writes the near plane', () => audit([...files, { path: 'src/fake/App.jsx', src: 'camera.near = 10' }])],
    ['a profile loses movieNear', () => audit(swap(PROFILE, s => s.replace(/movieNear:\s*[\d.]+,?/, '')))],
    ['an app mounts its own <MovieCamera> again', () => audit([...files, { path: 'src/fake/App.jsx', src: '<Canvas><Town /><MovieCamera /></Canvas>' }])],
    ['Town drops <MovieCamera>', () => audit(swap('src/components/Town.jsx', s => s.replace(/<MovieCamera\b/g, '<Nothing')))],
    ['the driver is deleted', () => audit(files.filter(x => x.path !== DRIVER))],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run().f.length > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, info } = audit(files)
console.log(info.join('\n'))
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ one movie driver, mounted once by <Town>: it plays the town\'s path, owns its phase and its near plane')
