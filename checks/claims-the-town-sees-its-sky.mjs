#!/usr/bin/env node
/**
 * "DOES <Town> DRAW ITS SKY IN ANY APP'S CANVAS — OR ONLY IN ONE WHOSE CAMERA HAPPENS TO REACH IT?"
 *
 * WHY (Quire → Warden, 2026-09-28): in the Ward, <Town shot='movie' time={null}> drew a BLACK sky at 11:41 town time.
 * Measured (headless, the Ward on :5180): the clock was live and right, the sky state was day (sun elevation 0.81 rad,
 * nightFactor 0), the sky dome (GradientSky, 10238 tris) was mounted — and the camera's far plane was 1000, R3F's
 * default. The dome sits at SKY_RADIUS (55000 m); beyond the far plane it is clipped and the empty background shows.
 * The kit's apps never saw it because each created its Canvas with `far: 60000` — a number that worked only because
 * it happened to exceed the sky's radius. <Town> owns its far plane now, derived from the farthest thing it draws.
 *
 * Asserts, reading the sources:
 *   · Town.jsx sets the camera's far plane from SKY_RADIUS (the sky dome), not a literal;
 *   · no app that mounts <Town> sets its camera's `far` (Town owns it — a second writer is a stale constant);
 *   · Town reports, loudly, a Canvas whose depth buffer or shadow map disagrees with the quality profile (two things
 *     a component cannot change after the Canvas is created — the app must set them).
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-town-sees-its-sky.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const TOWN = 'src/components/Town.jsx'
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|\{\s*\/\*[\s\S]*?\*\/\s*\}|\/\/.*$/gm, '')
function walk(d, out = []) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(n)) out.push(p) } return out }

export function audit(files) {
  const f = []
  const town = files.find(x => x.path === TOWN)
  if (!town) return { f: [`${TOWN} does not exist`] }
  const t = code(town.src)
  // camera.far = <expr with SKY_RADIUS>, or = a const declared from SKY_RADIUS.
  const viaConst = [...t.matchAll(/const\s+(\w+)\s*=\s*[^;\n]*SKY_RADIUS/g)].some(m => new RegExp(`camera\\.far\\s*=\\s*${m[1]}\\b`).test(t))
  if (!/camera\.far\s*=\s*[^;\n]*SKY_RADIUS/.test(t) && !viaConst) f.push(`${TOWN} does not set the camera's far plane from SKY_RADIUS — the sky dome is clipped in any Canvas whose camera does not happen to reach it`)
  if (!/logarithmicDepthBuffer/.test(t) || !/shadowMap/.test(t)) f.push(`${TOWN} does not report a Canvas whose depth buffer / shadow map disagrees with the quality profile`)
  for (const x of files) {
    const c = code(x.src)
    if (x.path === TOWN || !/<Canvas\b/.test(c) || !/<Town\b/.test(c)) continue
    if (x.path.startsWith('src/harness/') && /⛔ HARNESS ONLY/.test(x.src.slice(0, 1500))) continue   // a harness frames its own measurement
    // The VIEW camera's far: a perspective <Canvas camera={{ … far }}> or a <PerspectiveCamera far=…>. (A shadow camera's
    // far, or an orthographic Designer camera Town never draws through, is not Town's.)
    const canvasFar = [...c.matchAll(/<Canvas\b([^>]*?)camera=\{\{([^}]*)\}\}/g)].some(m => !/orthographic/.test(m[1]) && /(^|[\s,{])far\s*:\s*\d/.test(m[2]))
    const perspFar = [...c.matchAll(/<PerspectiveCamera\b[^>]*>/g)].some(m => /\sfar=\{?\s*\d/.test(m[0]))
    if (canvasFar || perspFar) f.push(`${x.path} mounts <Town> and sets its camera's far plane — <Town> owns it (derived from its sky)`)
  }
  return { f }
}

const files = walk(join(ROOT, 'src')).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))
if (process.argv.includes('--self-test')) {
  const swap = (fn) => files.map(x => x.path === TOWN ? { ...x, src: fn(x.src) } : x)
  const base = audit(files).f.length
  const cases = [
    ['Town stops setting far', () => audit(swap(s => s.replace(/camera\.far\s*=/g, 'camera.farX ='))).f.length],
    ['an app pins far again', () => audit([...files, { path: 'src/fake/App.jsx', src: '<Canvas camera={{ near: 1, far: 60000 }}><Town /></Canvas>' }]).f.length],
    ['a PerspectiveCamera pins far', () => audit([...files, { path: 'src/fake/App.jsx', src: '<Canvas><PerspectiveCamera makeDefault near={1} far={60000} /><Town /></Canvas>' }]).f.length],
    ['Town stops reporting the Canvas', () => audit(swap(s => s.replace(/logarithmicDepthBuffer/g, 'x'))).f.length],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run() > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}
const { f } = audit(files)
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ <Town> reaches its own sky: it owns the far plane (from SKY_RADIUS), and says when the Canvas cannot give it what the profile asks')
