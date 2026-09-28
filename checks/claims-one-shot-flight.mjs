#!/usr/bin/env node
/**
 * "IS THE FLIGHT BETWEEN SHOTS ONE MOTION, OWNED BY THE TOWN?"
 *
 * WHY (BRIEF-town-shot-flight, 2026-09-28; Jacob: "When the map goes from Hero to Browse/Society, it should do the
 * same camera transition it used to"). The old player flew hero → plan in one continuous move; the Ward cut, because
 * the move lived in each app (Scene's hand-rolled beginTransition, Preview's tween without the chase, Stage's). Now
 * <Town> flies a shot change itself, with the one tween, and reports its progress to the app.
 *
 * Asserts, reading src/:
 *   · ONE tween module: src/camera/cameraTween.js exports createCameraTween; src/preview/cameraTween.js is gone;
 *   · ONE easing: easeInOutCubic is DEFINED once (src/lib/ease.js);
 *   · no camera lerp (`lerpVectors(<from…>`) and no `beginTransition` outside src/camera/;
 *   · <Town> mounts the flight (src/camera/ShotFlight.jsx), which takes its durations from transitions.js and the
 *     plan's destination from frameDensest; Town takes `flight`, `streetAt`, `viewInset`, `flightRef`, `onFlightEnd`
 *     (the interface agreed with Quire, 2026-09-28);
 *   · the plan's one move and the rose (Quire, 2026-09-28): Town takes `frameKey` (the plan frames on entry or a key
 *     change, never on litIds alone), `onFramed` (frameDensest's disclosure), `planHeading` ('town' | 'north') and
 *     `bearingRef`; the in-plan move's duration is transitions.js' named `frame` entry, not a literal;
 *   · under prefers-reduced-motion every flight is a cut (ShotFlight) and the controls do not ease (RegimeControls);
 *   · the rose's arithmetic: bearingOf(an overhead camera under browseUpFromHeading(d)) = d, and a camera looking east
 *     reads 90 (every baked town's heading is 0 today, so the runtime check cannot see a turn);
 *   · Preview keeps no tween, no duration and no movie link of its own; Stage passes flight={false}.
 * SANCTIONED EXCEPTION, BY NAME: src/components/Scene.jsx — the old player (lafayette-square.com), frozen to fixes;
 * its motion is the REFERENCE feel and dies at the cutover (Warden, 2026-09-28). Printed every run.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-one-shot-flight.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SANCTIONED = { 'src/components/Scene.jsx': 'the old player, frozen; its motion is the reference feel; retired at the cutover (BRIEF-town-shot-flight §4)' }
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const read = (p) => (existsSync(join(ROOT, p)) ? code(readFileSync(join(ROOT, p), 'utf8')) : null)
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [join(d, e.name)] : [])

// The rules, as pure functions of { path: source } so the self-test can prove each one fires.
export function audit(files) {
  const f = []
  const src = (p) => files[p] ?? null
  if (!src('src/camera/cameraTween.js') || !/export function createCameraTween/.test(src('src/camera/cameraTween.js'))) f.push('src/camera/cameraTween.js does not export createCameraTween — there is no one tween')
  if (src('src/preview/cameraTween.js') != null) f.push('src/preview/cameraTween.js still exists — a second tween module')
  const easeDefs = Object.entries(files).filter(([p, s]) => !(p in SANCTIONED) && /(function\s+easeInOutCubic\s*\(|const\s+easeInOutCubic\s*=)/.test(s)).map(([p]) => p)
  if (easeDefs.join() !== 'src/lib/ease.js') f.push(`easeInOutCubic is defined in [${easeDefs.join(', ')}] — once, in src/lib/ease.js`)
  for (const [p, s] of Object.entries(files)) {
    if (p in SANCTIONED || p.startsWith('src/camera/')) continue
    if (/\.lerpVectors\(\s*_?from/i.test(s)) f.push(`${p} lerps a camera pose by hand — use src/camera/cameraTween.js`)
    if (/\bbeginTransition\b/.test(s)) f.push(`${p} has a beginTransition — a hand-rolled flight`)
    if (/from '\.\.?\/(preview\/)?cameraTween(\.js)?'/.test(s) && !/camera\/cameraTween/.test(s)) f.push(`${p} imports the retired preview tween`)
  }
  const town = src('src/components/Town.jsx') || ''
  if (!/<ShotFlight\b/.test(town) || !/from '\.\.\/camera\/ShotFlight\.jsx'/.test(town)) f.push('Town.jsx does not mount <ShotFlight> — the town does not fly its shot changes')
  for (const prop of ['flight', 'streetAt', 'viewInset', 'flightRef', 'onFlightEnd', 'frameKey', 'onFramed', 'planHeading', 'bearingRef', 'controls']) if (!new RegExp(`\\b${prop}\\b`).test(town)) f.push(`Town.jsx takes no \`${prop}\``)
  const flight = src('src/camera/ShotFlight.jsx') || ''
  if (!/from '\.\/transitions\.js'/.test(flight)) f.push('ShotFlight.jsx does not take its durations from transitions.js')
  if (!/\bframeDensest\b/.test(flight)) f.push("ShotFlight.jsx does not take the plan's destination from frameDensest")
  if (!/from '\.\/cameraTween\.js'/.test(flight)) f.push('ShotFlight.jsx does not fly with the one tween')
  if (!/transitionMs\(\s*'frame'\s*\)|SHOT_TRANSITION_MS\.frame/.test(flight)) f.push("ShotFlight.jsx does not take the in-plan move's duration from transitions.js' `frame` entry")
  if (!/\bframe\s*:\s*\d+/.test(src('src/camera/transitions.js') || '')) f.push('transitions.js has no named `frame` entry (the in-plan move)')
  const rm = /prefersReducedMotion\(\)/, rmImport = /from '\.\.\/lib\/reducedMotion\.js'/
  if (!/prefers-reduced-motion/.test(src('src/lib/reducedMotion.js') || '')) f.push('src/lib/reducedMotion.js does not ask (prefers-reduced-motion)')
  if (!rm.test(flight) || !rmImport.test(flight)) f.push('ShotFlight.jsx flies under prefers-reduced-motion — it must cut')
  const rc = src('src/components/RegimeControls.jsx') || ''
  if (!rm.test(rc) || !rmImport.test(rc)) f.push('RegimeControls eases under prefers-reduced-motion')
  const preview = src('src/preview/PreviewApp.jsx') || ''
  for (const [re, what] of [[/createCameraTween/, 'a tween'], [/transitionMs|SHOT_TRANSITION_MS/, 'a flight duration'], [/movie\.hold|movie\.handle|movieLink/, 'a movie link']]) {
    if (re.test(preview)) f.push(`PreviewApp.jsx keeps ${what} of its own — the town flies`)
  }
  const stage = src('src/cartograph/CartographApp.jsx') || ''
  if (!/flight=\{false\}/.test(stage)) f.push('Stage does not pass flight={false} — Stage places its own camera (ruled 2026-09-28)')
  const old = src('src/components/Scene.jsx') || ''
  if (/<Town\b/.test(old) && !/<Town\b[^>]*flight=\{false\}/.test(old)) f.push('Scene.jsx mounts <Town> without flight={false} — its own motion and the town\'s would both drive the camera')
  return f
}

// ── the rose's arithmetic (every baked town's heading is 0 today, so no runtime can see a turn) ──────────
const { browseUpFromHeading, bearingOf } = await import('../src/lib/browseHeading.js')
const roseFails = []
for (const deg of [0, 37, 90, 200, 315]) {
  const u = browseUpFromHeading(deg), [x, y, z] = u
  const b = bearingOf({ x: 0, y: -1, z: 0 }, { x, y, z })
  if (Math.abs(((b - deg) % 360 + 540) % 360 - 180) > 1e-9) roseFails.push(`bearingOf(overhead, browseUpFromHeading(${deg})) = ${b}`)
}
if (Math.abs(bearingOf({ x: 1, y: -0.2, z: 0 }, { x: 0, y: 1, z: 0 }) - 90) > 1e-9) roseFails.push('a camera looking east does not read bearing 90')
const flightSrc = readFileSync(join(ROOT, 'src/camera/ShotFlight.jsx'), 'utf8')
if (!/\.follow\b/.test(flightSrc)) roseFails.push("ShotFlight.jsx does not take planHeading { follow: headingRef } (the rose freed: the map follows the reader's true heading)")

// ── self-test: each rule fires on a fixture ─────────────────────────────────────────
const good = {
  'src/camera/cameraTween.js': "import { easeInOutCubic } from '../lib/ease.js'\nexport function createCameraTween() { a.lerpVectors(fromPos, toPos, e) }",
  'src/lib/ease.js': 'export function easeInOutCubic(t) { return t }',
  'src/camera/ShotFlight.jsx': "import { transitionMs } from './transitions.js'\nimport { createCameraTween } from './cameraTween.js'\nframeDensest()\ntransitionMs('frame')\nimport { prefersReducedMotion } from '../lib/reducedMotion.js'\nprefersReducedMotion()",
  'src/lib/reducedMotion.js': "matchMedia('(prefers-reduced-motion: reduce)')",
  'src/camera/transitions.js': 'export const SHOT_TRANSITION_MS = { hero: 2500, frame: 1200 }',
  'src/components/RegimeControls.jsx': "import { prefersReducedMotion } from '../lib/reducedMotion.js'\nprefersReducedMotion()",
  'src/components/Town.jsx': "import ShotFlight from '../camera/ShotFlight.jsx'\nfunction Town({ flight, streetAt, viewInset, flightRef, onFlightEnd, frameKey, onFramed, planHeading, bearingRef, controls }) { return <ShotFlight /> }",
  'src/preview/PreviewApp.jsx': 'export default function PreviewApp() {}',
  'src/cartograph/CartographApp.jsx': '<Town flight={false} />',
  'src/components/Scene.jsx': 'function easeInOutCubic(t) {} function beginTransition() {} _l.lerpVectors(_fromPos, _toPos, e)\n<Town shot={shot} flight={false} />',
}
const bad = [
  ['second tween module', { 'src/preview/cameraTween.js': 'export function createCameraTween() {}' }],
  ['second easing', { 'src/components/X.jsx': 'function easeInOutCubic(t) {}' }],
  ['hand lerp', { 'src/preview/PreviewApp.jsx': 'p.lerpVectors(fromPos, toPos, e)' }],
  ['Preview tween', { 'src/preview/PreviewApp.jsx': "import { createCameraTween } from '../camera/cameraTween.js'" }],
  ['Town without flight', { 'src/components/Town.jsx': 'function Town({ flight, streetAt, viewInset, flightRef, onFlightEnd, frameKey, onFramed, planHeading, bearingRef, controls }) {}' }],
  ['frame move with a literal duration', { 'src/camera/ShotFlight.jsx': "import { transitionMs } from './transitions.js'\nimport { createCameraTween } from './cameraTween.js'\nframeDensest()\nconst d = 1200\nimport { prefersReducedMotion } from '../lib/reducedMotion.js'\nprefersReducedMotion()" }],
  ['flies under reduced motion', { 'src/camera/ShotFlight.jsx': "import { transitionMs } from './transitions.js'\nimport { createCameraTween } from './cameraTween.js'\nframeDensest()\ntransitionMs('frame')" }],
  ['controls ease under reduced motion', { 'src/components/RegimeControls.jsx': 'export default function RegimeControls() {}' }],
  ['Stage flies', { 'src/cartograph/CartographApp.jsx': '<Town />' }],
  ['old player and town both fly', { 'src/components/Scene.jsx': 'function beginTransition() {}\n<Town shot={shot} />' }],
]
if (audit(good).length) { console.error(`⛔ SELF-TEST — a conforming fixture fails:\n   ${audit(good).join('\n   ')}`); process.exit(2) }
for (const [name, patch] of bad) if (!audit({ ...good, ...patch }).length) { console.error(`⛔ SELF-TEST — "${name}" is not caught`); process.exit(2) }

// ── the tree ───────────────────────────────────────────────────────────────────────
const files = {}
for (const abs of walk(join(ROOT, 'src'))) files[relative(ROOT, abs)] = code(readFileSync(abs, 'utf8'))
const fails = [...audit(files), ...roseFails]
for (const [p, why] of Object.entries(SANCTIONED)) console.log(`ⓘ exempt by name: ${p} — ${why}`)
if (fails.length) { console.error(`⛔ ${fails.length} failure(s):`); for (const x of fails) console.error('   ' + x); process.exit(1) }
console.log('✅ one flight between shots: the town flies it with the one tween')
