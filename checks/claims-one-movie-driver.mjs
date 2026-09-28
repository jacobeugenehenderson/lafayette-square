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
 *   · every app that mounts <Town> mounts <MovieCamera> (a src/harness/ file marked ⛔ HARNESS ONLY is exempt).
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
  for (const x of files) {
    const c = code(x.src)
    if (x.path === 'src/components/Town.jsx' || !/<Canvas\b/.test(c) || !/<Town\b/.test(c)) continue
    if (harness(x)) { info.push(`exempt: ${x.path} (harness)`); continue }
    // Mounted here, or by a component this app imports from a local file and renders (Stage: HeroPreview).
    const via = [...x.src.matchAll(/^import\s+(?:(\w+)|\{([^}]*)\})[^'\n]*from\s+'(\.[^']+)'/gm)].flatMap(m => {
      const names = m[1] ? [m[1]] : m[2].split(',').map(n => n.trim().split(/\s+as\s+/).pop()).filter(Boolean)
      const target = files.find(y => y.path.replace(/\.(jsx?|mjs)$/, '') === join(x.path, '..', m[3]).replace(/\.(jsx?|mjs)$/, ''))
      return target && /<MovieCamera\b/.test(code(target.src)) ? names.filter(n => new RegExp(`<${n}\\b`).test(c)).map(n => `${n} (${target.path})`) : []
    })
    if (via.length) { info.push(`app: ${x.path} mounts <MovieCamera> through ${via.join(', ')}`); continue }
    if (!/<MovieCamera\b/.test(c)) f.push(`${x.path} mounts <Town> but not <MovieCamera> — its movie shot has no driver, or a private one`)
    else info.push(`app: ${x.path} mounts <MovieCamera>`)
  }
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
    ['Preview drops <MovieCamera>', () => audit(swap('src/preview/PreviewApp.jsx', s => s.replace(/<MovieCamera\b/g, '<Nothing')))],
    ['Stage\'s HeroPreview drops <MovieCamera>', () => audit(swap('src/stage/StageApp.jsx', s => s.replace(/<MovieCamera\b/g, '<Nothing')))],
    ['the driver is deleted', () => audit(files.filter(x => x.path !== DRIVER))],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run().f.length > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, info } = audit(files)
console.log(info.join('\n'))
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ one movie driver: MovieCamera plays the path, owns its phase and its near plane, in every app')
