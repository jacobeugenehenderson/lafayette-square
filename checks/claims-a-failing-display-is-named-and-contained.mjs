#!/usr/bin/env node
/**
 * "WHEN A DISPLAY FAILS AT RUNTIME, IS IT CONTAINED AND NAMED?" (Boz's ruling, 2026-10-31.)
 *
 * The last line, src/displays/DisplayBoundary.js, driven directly:
 *   1. NAMED: a throwing display emits one console error naming the display and the reason, and lands in the kit's one
 *      sink, src/lib/failures.js, as layer `display:<id>` (Stage's banner reads it);
 *   2. CONTAINED: the failed display renders nothing, without throwing on, so what it hangs on keeps rendering; a
 *      healthy one renders its children;
 *   3. WIRED: Displays.jsx renders every plugin, AND its own refusals (unknown kind, bad attach), inside the display's own
 *      DisplayBoundary (keyed by the display); the Light Show's frame loop catches its throws and rethrows them at render
 *      (R3F calls useFrame in a bare loop, so an uncaught throw there freezes the whole canvas and never reaches React);
 *      failures are keyed by town and display; SetPiece mounts
 *      <Displays> as a sibling of the uplights inside the renderer (never wrapping the set-piece), and Stage's Displays
 *      section shows the failures;
 *   4. ACROSS ORIGINS: a look frame on another host (the published path: staging's asset host) is read through
 *      src/displays/lightShow/drawerRead.js, driven on a PLANTED browser whose canvas taints as Chrome's does: the
 *      frame draws (fetched, then decoded from a same-origin object URL), its object URL is released, a failed status
 *      refuses by name, and a canvas that throws REJECTS naming the frame (never a promise left hanging); LightShow.jsx
 *      reads its frames through it alone. The drawer's own read (readDrawerJson, the same module) builds each failure as
 *      the kind it is: not JSON, a 404 → Refusal ("refused"); no answer, a 5xx, a body broken off → Transient ("failed").
 *      The module names no global, so it reaches only what it is handed: the property its safe tier rests on.
 *
 * Usage: node checks/claims-a-failing-display-is-named-and-contained.mjs [--mutants]
 *   --mutants: a boundary that swallows the error → (1) red; one that throws on → (2) red; Displays without it, a refusal
 *   thrown outside it, a frame loop that lets its throws escape → (3) red; the frame's URL given to the Image, the
 *   drawing back inside onload, the status unread → (4) red.
 */
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { importSource, sourceOf } from './_importSource.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const failures = (await import(pathToFileURL(join(ROOT, 'src/lib/failures.js')))).default

async function verdict({ boundary, displays, frame, raster } = {}) {
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
  if (failures.getState().failed['a-town/display:monument-lights']?.reason !== 'not retried: the drawer answered 404') fails.push('a failed display is not recorded for Stage\'s banner under its town and id')
  if (rendered !== null && rendered !== undefined) fails.push('a failed display still renders its children')
  // 3. wired
  const disp = code(displays ? displays(sourceOf('src/displays/Displays.jsx')) : sourceOf('src/displays/Displays.jsx'))
  if (!/<DisplayBoundary\s+key=\{d\.id\}\s+lookId=\{lookId\}\s+id=\{d\.id\}>[\s\S]*?<Refuse[\s\S]*?<P\.Renderer[\s\S]*?<\/DisplayBoundary>/.test(disp)) fails.push('Displays.jsx does not render each plugin, and its refusals, inside the display\'s own DisplayBoundary')
  if (/throw new (?:Error|Refusal)\(`\[Displays\][^`]*\$\{where\}/.test(disp.slice(0, disp.indexOf('function Refuse')))) fails.push('Displays.jsx throws a refusal outside the display\'s boundary')
  let ls = code(sourceOf('src/displays/lightShow/LightShow.jsx')); if (frame) ls = frame(ls)
  const loop = ls.slice(ls.search(/useFrame\(\([^)]*\) => \{/), ls.indexOf('if (frameErr) throw'))
  if (!/useFrame\(\([^)]*\) => \{\s*if \(frameDead\.current\) return\s*try \{[\s\S]*\} catch \(e\) \{ frameDead\.current = true; setFrameErr\(e\) \}\s*\}\)\s*$/.test(loop)) fails.push('LightShow.jsx: the frame loop does not catch its throws (an uncaught throw there freezes the whole canvas and never reaches the boundary)')
  if (!/if \(frameErr\) throw/.test(ls)) fails.push('LightShow.jsx does not rethrow a frame-loop failure at render, so the boundary never sees it')
  const sp = code(sourceOf('src/components/SetPiece.jsx'))
  if (!/<SetPieceUplights[^>]*\/>\s*\{?[\s\S]{0,200}?<Displays\b[^>]*\/>/.test(sp)) fails.push('SetPiece.jsx does not mount <Displays> beside the uplights, inside the renderer')
  if (!/lib\/failures\.js/.test(sourceOf('src/stage/StageApp.jsx')) || !/failed:\s*\{failed\[`\$\{lookId\}\/display:\$\{d\.id\}`\]\.reason\}/.test(sourceOf('src/stage/StageApp.jsx'))) fails.push('Stage\'s Displays section does not show a display\'s failure under its town and id')
  // 4. across origins, on a planted browser
  const RF = await importSource('src/displays/lightShow/drawerRead.js', raster ? { transform: raster } : {})
  const { Refusal } = await importSource('src/lib/refusal.js')
  const PAGE = 'https://staging.example', ASSET = 'https://assets.example/content/displays/a/looks/0.svg'
  const browser = ({ canvasDies = false } = {}) => {
    const live = new Set(); let n = 0
    class Image { set src(v) { this._s = v } get src() { return this._s } async decode() { if (!this._s) throw new Error('no source') } }
    const tainting = (u) => !String(u).startsWith('blob:') && new URL(u).origin !== PAGE
    const ctx = { tainted: false, clearRect() {}, drawImage(im) { if (tainting(im.src)) this.tainted = true },
      getImageData() { if (canvasDies) throw new Error('canvas lost'); if (this.tainted) { const e = new Error("Failed to execute 'getImageData': The canvas has been tainted by cross-origin data"); e.name = 'SecurityError'; throw e } return { data: new Uint8ClampedArray(4) } } }
    const env = { Image, URL: { createObjectURL: () => { const u = `blob:${PAGE}/${++n}`; live.add(u); return u }, revokeObjectURL: (u) => live.delete(u) },
      get: async (u) => u.endsWith('broken.svg') ? { ok: true, status: 200, blob: async () => { throw new TypeError('network error') } } : u.endsWith('unanswered.svg') ? Promise.reject(new TypeError('Failed to fetch')) : u.endsWith('missing.svg') ? { ok: false, status: 404 } : { ok: true, status: 200, blob: async () => ({ from: u }) } }
    return { env, ctx, live }
  }
  const settle = (p) => Promise.race([p.then(v => ({ v }), e => ({ e })), new Promise(ok => setTimeout(() => ok({ hung: true }), 200))])
  { const b = browser(), r = await settle(RF.rasterFrame(ASSET, 1, 1, b.ctx, b.env))
    if (!r.v) fails.push(`a frame on another host does not draw (${r.hung ? 'the read never settled' : r.e?.message}): the canvas is tainted, as on staging 2026-11-01`)
    if (b.live.size) fails.push('a frame\'s object URL is never released') }
  { const b = browser(), r = await settle(RF.rasterFrame(ASSET.replace('0.svg', 'missing.svg'), 1, 1, b.ctx, b.env))
    if (!(r.e instanceof Refusal && r.e.message.includes('missing.svg') && r.e.message.includes('404'))) fails.push(`a frame answering 404 is not refused by name (${r.hung ? 'never settled' : r.e?.message ?? 'it drew'})`) }
  { const b = browser({ canvasDies: true }), r = await settle(RF.rasterFrame(ASSET, 1, 1, b.ctx, b.env))
    if (!(r.e instanceof Refusal && r.e.message.includes('0.svg'))) fails.push(`a canvas that throws ${r.hung ? 'leaves the read hanging (the display silently absent)' : 'does not reject as a Refusal naming the frame'}`) }
  { const b = browser(), r = await settle(RF.rasterFrame(ASSET.replace('0.svg', 'unanswered.svg'), 1, 1, b.ctx, b.env))
    const { Transient: T } = await importSource('src/lib/refusal.js')
    if (!(r.e instanceof T && r.e.message.includes('unanswered.svg'))) fails.push(`a frame that does not answer (a dead network, or a host that does not admit the origin) is not a Transient naming the frame (${r.hung ? 'never settled' : r.e?.message ?? 'it drew'})`) }
  { const b = browser(), r = await settle(RF.rasterFrame(ASSET.replace('0.svg', 'broken.svg'), 1, 1, b.ctx, b.env))
    const { Transient: T } = await importSource('src/lib/refusal.js')
    if (!(r.e instanceof T && r.e.message.includes('broken.svg'))) fails.push(`a frame whose body breaks off is not a Transient naming the frame (${r.hung ? 'never settled' : r.e?.message ?? 'it drew'})`) }
  { const r = await settle(RF.rasterFrame(ASSET, 1, 1, browser().ctx))
    if (!(r.e instanceof Refusal)) fails.push(`rasterFrame called with no env does not refuse (${r.hung ? 'never settled' : r.e?.message ?? 'it drew'}): it must reach only what it is handed`) }
  // the drawer's own read, each answer with its kind
  { const drawerAns = (status, text) => ({ ok: status >= 200 && status < 300, status, text: async () => text })
    const kindOf = async (p) => { const r = await settle(p); return r.hung ? 'hung' : r.v !== undefined ? 'read' : r.e instanceof Refusal ? 'refusal' : r.e?.constructor?.name === 'Transient' ? 'transient' : 'untyped' }
    for (const [name, answerOf, want] of [
      ['a drawer that is JSON', () => drawerAns(200, '{"frame":{}}'), 'read'],
      ['a drawer that is not JSON (the dev server\'s own page for a missing file, 200 text/html)', () => drawerAns(200, '<!DOCTYPE html>'), 'refusal'],
      ['a drawer answering 404', () => drawerAns(404, ''), 'refusal'],
      ['a drawer answering 503', () => drawerAns(503, ''), 'transient'],
      ['a drawer that does not answer', () => Promise.reject(new TypeError('Failed to fetch')), 'transient'],
      ['a drawer whose body breaks off', () => ({ ok: true, status: 200, text: async () => { throw new TypeError('network error') } }), 'transient'],
    ]) { const got = await kindOf(RF.readDrawerJson('looks.json', { get: async () => answerOf() })); if (got !== want) fails.push(`${name} reads as ${got}, not ${want}`) }
    if (await kindOf(RF.readDrawerJson('looks.json')) !== 'refusal') fails.push('readDrawerJson called with no env does not refuse: it must reach only what it is handed') }
  // NO ROUTE OUT: the module names no global, so it can reach only the env it is handed. The tier (safe) rests on this.
  const rfs = code(raster ? raster(sourceOf('src/displays/lightShow/drawerRead.js')) : sourceOf('src/displays/lightShow/drawerRead.js'))
  const route = rfs.match(/\b(globalThis|window|self)\b|(?<![.\w])fetch\s*\(/)
  if (route) fails.push(`drawerRead.js names "${route[0]}": it has a route to the network the check did not hand it (its tier rests on having none)`)
  // …and a frame that 404s reaches the SINK, as a refusal: rasterFrame's rejection, through useDrawer's own rethrow (read
  // from LightShow.jsx, not copied), into DisplayBoundary, into src/lib/failures.js.
  { const b = browser(), r = await settle(RF.rasterFrame(ASSET.replace('0.svg', 'missing.svg'), 1, 1, b.ctx, b.env))
    const { Transient } = await importSource('src/lib/refusal.js')
    const hook = code(sourceOf('src/displays/lightShow/LightShow.jsx')).match(/  if \(err instanceof Refusal\) throw [^\n]*\n  if \(err\) throw [^\n]*\n/)?.[0]
    let thrown = null
    if (!hook) fails.push("useDrawer's rethrow (a Refusal stays one) is not where the check reads it")
    else try { new Function('err', 'where', 'Refusal', 'Transient', hook)(r.e, '"a-town" display "monument-lights"', Refusal, Transient) } catch (e) { thrown = e }
    failures.setState({ failed: {} })
    const was2 = console.error; console.error = () => {}
    try { const bd = new B({ lookId: 'a-town', id: 'monument-lights', children: 'CHILD' }); if (thrown) { bd.state = { ...bd.state, ...B.getDerivedStateFromError(thrown) }; bd.componentDidCatch(thrown) } } finally { console.error = was2 }
    const got = failures.getState().failed['a-town/display:monument-lights']
    if (!(got?.kind === 'refusal' && /missing\.svg/.test(got.reason) && /404/.test(got.reason))) fails.push(`a frame that 404s does not reach the sink as a refusal naming it (${got ? `${got.kind}: ${got.reason}` : 'nothing in the sink'})`) }
  const lsx = code(sourceOf('src/displays/lightShow/LightShow.jsx'))
  const fetches = lsx.match(/\bfetch\(/g) || []
  if (!/const env = \{ get: \(u\) => fetch\(u\), Image, URL \}\s*const d = await readDrawerJson\(url, env\)/.test(lsx) || !/const raster = \(rel\) => rasterFrame\(frame\(rel\), w, h, ctx, env\)/.test(lsx) || /new Image\(/.test(lsx) || fetches.length !== 1)
    fails.push(`LightShow.jsx does not read its drawer and frames through drawerRead.js alone (${fetches.length} fetch( sites; the one allowed is the get it hands)`)
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ a failing display is not contained and named:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a failing display is contained and named: it renders nothing and throws no further, the console names it and its reason, Stage shows it; every display has its own boundary beside the uplights; a frame on another host draws, and a failed one rejects by name; each drawer read fails as the kind it is')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['a boundary that swallows the error', { boundary: (s) => s.replace(/componentDidCatch\(error\) \{[\s\S]*?\n  \}/, 'componentDidCatch() {}') }],
    ['a boundary that throws on', { boundary: (s) => s.replace("return this.state.failed ? null : this.props.children", "if (this.state.failed) throw new Error(this.state.failed)\n    return this.props.children") }],
    ['Displays without the boundary', { displays: (s) => s.replace(/<DisplayBoundary key=\{d\.id\} lookId=\{lookId\} id=\{d\.id\}>|<\/DisplayBoundary>/g, '') }],
    ['a refusal thrown outside the boundary', { displays: (s) => s.replace("    const where = `\"${lookId}\" display \"${d.id}\"`\n", "    const where = `\"${lookId}\" display \"${d.id}\"`\n    if (!P) throw new Error(`[Displays] ⛔ ${where} has no plugin`)\n") }],
    ["the frame's own URL given to the Image (no-CORS: the canvas taints)", { raster: (s) => s.replace('im.src = env.URL.createObjectURL(blob)', 'im.src = src') }],
    ['the drawing back inside onload (a throw there never rejects)', { raster: (s) => s.replace(/  try \{\n    await im\.decode\(\)\n    ctx\.clearRect\(0, 0, w, h\); ctx\.drawImage\(im, 0, 0, w, h\)\n    return ctx\.getImageData\(0, 0, w, h\)\.data\n  \}/, '  try {\n    return await new Promise((ok) => { im.onload = () => { ctx.clearRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h); ok(ctx.getImageData(0, 0, w, h).data) }; im.decode().then(() => { try { im.onload() } catch { /* the browser reports an onload throw to window.onerror, never to the promise */ } }) })\n  }') }],
    ['a frame that does not draw left untyped (it reaches the sink as gave-up)', { raster: (s) => s.replace('throw new Refusal(`the look frame ${src} did not draw', 'throw new Error(`the look frame ${src} did not draw') }],
    ['a read that does not answer left unnamed', { raster: (s) => s.replace(/  try \{ res = await env\.get\(url\) \} catch \(e\) \{[^\n]*\n/, '  res = await env.get(url)\n') }],
    ['a drawer that is not JSON read as a Transient', { raster: (s) => s.replace('throw new Refusal(`the drawer ${url} is not JSON', 'throw new Transient(`the drawer ${url} is not JSON') }],
    ['the drawer read with a default env (a route to the network)', { raster: (s) => s.replace('export async function readDrawerJson(url, env) {', 'export async function readDrawerJson(url, env = globalThis) {') }],
    ['the default env restored (a route to the network)', { raster: (s) => s.replace('export async function rasterFrame(src, w, h, ctx, env) {', 'export async function rasterFrame(src, w, h, ctx, env = globalThis) {') }],
    ['a body that breaks off left unnamed', { raster: (s) => s.replace(/  try \{ return await res\[read\]\(\) \} catch \(e\) \{[^\n]*\n/, '  return await res[read]()\n') }],
    ['the status unread', { raster: (s) => s.replace("  if (!res.ok) throw httpFailure(res, `${what} ${url} answered ${res.status}`)\n", '') }],
    ['a frame loop that lets its throws escape', { frame: (s) => s.replace('    if (frameDead.current) return\n    try {\n', '    if (frameDead.current) return\n    {\n').replace(' catch (e) { frameDead.current = true; setFrameErr(e) }', '') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
