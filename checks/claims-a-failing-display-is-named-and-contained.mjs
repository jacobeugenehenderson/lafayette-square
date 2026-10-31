#!/usr/bin/env node
/**
 * "WHEN A DISPLAY FAILS AT RUNTIME, IS IT CONTAINED AND NAMED?" (Boz's ruling, 2026-10-31.)
 *
 * The last line, src/displays/DisplayBoundary.js, driven directly:
 *   1. NAMED: a throwing display emits one console error naming the display and the reason, and lands in
 *      src/displays/failures.js (Stage's banner reads it);
 *   2. CONTAINED: the failed display renders nothing, without throwing on, so what it hangs on keeps rendering; a
 *      healthy one renders its children;
 *   3. WIRED: Displays.jsx renders every plugin, AND its own refusals (unknown kind, bad attach), inside the display's own
 *      DisplayBoundary (keyed by the display); the Light Show's frame loop catches its throws and rethrows them at render
 *      (R3F calls useFrame in a bare loop, so an uncaught throw there freezes the whole canvas and never reaches React);
 *      failures are keyed by town and display; SetPiece mounts
 *      <Displays> as a sibling of the uplights inside the renderer (never wrapping the set-piece), and Stage's Displays
 *      section shows the failures.
 *
 * Usage: node checks/claims-a-failing-display-is-named-and-contained.mjs [--mutants]
 *   --mutants: a boundary that swallows the error → (1) red; one that throws on → (2) red; Displays without it, a refusal
 *   thrown outside it, a frame loop that lets its throws escape → (3) red.
 */
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { importSource, sourceOf } from './_importSource.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const failures = (await import(pathToFileURL(join(ROOT, 'src/displays/failures.js')))).default

async function verdict({ boundary, displays, frame } = {}) {
  const fails = []
  const B = (await importSource('src/displays/DisplayBoundary.js', boundary ? { transform: boundary } : {})).default
  // 1 + 2, driven: a healthy display, then one that throws.
  const ok = new B({ id: 'healthy', children: 'CHILD' })
  if (ok.render() !== 'CHILD') fails.push('a healthy display does not render its children')
  failures.setState({ failed: {} })
  const err = new Error('the drawer answered 404'), logged = [], was = console.error
  console.error = (...a) => logged.push(a.join(' '))
  const b = new B({ lookId: 'a-town', id: 'monument-lights', children: 'CHILD' })
  let rendered
  try {
    b.state = { ...b.state, ...B.getDerivedStateFromError(err) }
    b.componentDidCatch(err)
    try { rendered = b.render() } catch (e) { fails.push(`a failed display throws on when it renders (${e.message}): it would take what it hangs on down with it`) }
  } finally { console.error = was }
  if (!logged.some(l => l.includes('monument-lights') && l.includes('the drawer answered 404'))) fails.push('a failed display is not named in the console (its id and the reason)')
  if (failures.getState().failed['a-town/monument-lights'] !== 'the drawer answered 404') fails.push('a failed display is not recorded for Stage\'s banner under its town and id')
  if (rendered !== null && rendered !== undefined) fails.push('a failed display still renders its children')
  // 3. wired
  const disp = code(displays ? displays(sourceOf('src/displays/Displays.jsx')) : sourceOf('src/displays/Displays.jsx'))
  if (!/<DisplayBoundary\s+key=\{d\.id\}\s+lookId=\{lookId\}\s+id=\{d\.id\}>[\s\S]*?<Refuse[\s\S]*?<P\.Renderer[\s\S]*?<\/DisplayBoundary>/.test(disp)) fails.push('Displays.jsx does not render each plugin, and its refusals, inside the display\'s own DisplayBoundary')
  if (/throw new Error\(`\[Displays\][^`]*\$\{where\}/.test(disp.slice(0, disp.indexOf('function Refuse')))) fails.push('Displays.jsx throws a refusal outside the display\'s boundary')
  let ls = code(sourceOf('src/displays/lightShow/LightShow.jsx')); if (frame) ls = frame(ls)
  const loop = ls.slice(ls.search(/useFrame\(\([^)]*\) => \{/), ls.indexOf('if (frameErr) throw'))
  if (!/useFrame\(\([^)]*\) => \{\s*if \(frameDead\.current\) return\s*try \{[\s\S]*\} catch \(e\) \{ frameDead\.current = true; setFrameErr\(e\) \}\s*\}\)\s*$/.test(loop)) fails.push('LightShow.jsx: the frame loop does not catch its throws (an uncaught throw there freezes the whole canvas and never reaches the boundary)')
  if (!/if \(frameErr\) throw/.test(ls)) fails.push('LightShow.jsx does not rethrow a frame-loop failure at render, so the boundary never sees it')
  const sp = code(sourceOf('src/components/SetPiece.jsx'))
  if (!/<SetPieceUplights[^>]*\/>\s*\{?[\s\S]{0,200}?<Displays\b[^>]*\/>/.test(sp)) fails.push('SetPiece.jsx does not mount <Displays> beside the uplights, inside the renderer')
  if (!/failures\.js/.test(sourceOf('src/stage/StageApp.jsx')) || !/failed:\s*\{failed\[`\$\{lookId\}\/\$\{d\.id\}`\]/.test(sourceOf('src/stage/StageApp.jsx'))) fails.push('Stage\'s Displays section does not show a display\'s failure under its town and id')
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ a failing display is not contained and named:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a failing display is contained and named: it renders nothing and throws no further, the console names it and its reason, Stage shows it; every display has its own boundary beside the uplights')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['a boundary that swallows the error', { boundary: (s) => s.replace(/componentDidCatch\(error\) \{[\s\S]*?\n  \}/, 'componentDidCatch() {}') }],
    ['a boundary that throws on', { boundary: (s) => s.replace("return this.state.failed ? null : this.props.children", "if (this.state.failed) throw new Error(this.state.failed)\n    return this.props.children") }],
    ['Displays without the boundary', { displays: (s) => s.replace(/<DisplayBoundary key=\{d\.id\} lookId=\{lookId\} id=\{d\.id\}>|<\/DisplayBoundary>/g, '') }],
    ['a refusal thrown outside the boundary', { displays: (s) => s.replace("    const where = `\"${lookId}\" display \"${d.id}\"`\n", "    const where = `\"${lookId}\" display \"${d.id}\"`\n    if (!P) throw new Error(`[Displays] ⛔ ${where} has no plugin`)\n") }],
    ['a frame loop that lets its throws escape', { frame: (s) => s.replace('    if (frameDead.current) return\n    try {\n', '    if (frameDead.current) return\n    {\n').replace(' catch (e) { frameDead.current = true; setFrameErr(e) }', '') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
