#!/usr/bin/env node
/**
 * "DOES EVERY APP DRAW ITS TOWN THROUGH THE CANVAS THE TOWN'S QUALITY PROFILE ASKS FOR?"
 *
 * WHY (Warden, 2026-09-28). <Town> needs things from its Canvas that no component can change once the Canvas exists —
 * the depth buffer (log or linear), antialiasing, the pixel ratio, the shadow map. Every app hand-set them, and they
 * had drifted: Preview and Stage hard-coded the DESKTOP Canvas whatever profile they handed <Town>, and the Ward's
 * Canvas had none of them (it also drew a black sky — the far plane, Town's since b5f0af41). One source now:
 * `townCanvasProps(quality)` (src/lib/qualityProfile.js, re-exported by Town — the Ward imports only Town), which the
 * apps spread. They add only what is theirs (frameloop, the opening camera pose, onCreated, preserveDrawingBuffer).
 *
 * Asserts, reading the sources, for every app that mounts <Town> (harnesses excepted):
 *   · its <Canvas> spreads townCanvasProps(Q, { composer }), where Q is the SAME expression it passes as <Town quality={Q}>;
 *   · it SAYS { composer: true | false }, and says true only when its <Town> is mounted unconditionally: an app that draws
 *     the canvas without <Town> (Cartograph's Designer) has no composer then, and with `true` it had no AA at all, every
 *     edge stair-stepped (Jacob's screenshot, 2026-10-28; off since 095dec54); and never a literal true in an app that
 *     turns post off (`post: false`: no composer then);
 *   · <Town> ASSERTS it at mount: Town.jsx calls qualityProfile.js#canvasAAMismatch with the canvas's ACTUAL anti-aliasing
 *     (its context) and on('post'), and throws what it returns; and that rule, CALLED, refuses an un-anti-aliased canvas
 *     with no composer, and allows the other three cases (Stage's redundant MSAA among them) (Ward's point, 2026-10-28);
 *   · the <Canvas> tag hand-sets none of antialias / logarithmicDepthBuffer / dpr / shadows (literal values);
 *   · Town.jsx re-exports townCanvasProps;
 *   · Preview's tiers draw with the profile their LABEL names (Jacob: "The entire Preview authoring space is designed to
 *     test these things for use in a mobile space"): qualityProfile.js#surfaceQuality, CALLED for every surface, maps
 *     desktop → the desktop profile and phone-* → the phone profile, and Preview's quality comes from it.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-the-canvas-is-the-towns.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const TOWN = 'src/components/Town.jsx'
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|\{\s*\/\*[\s\S]*?\*\/\s*\}|\/\/.*$/gm, '')
function walk(d, out = []) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(n)) out.push(p) } return out }
const harness = (x) => x.path.startsWith('src/harness/') && /⛔ HARNESS ONLY/.test(x.src.slice(0, 1500))

// The <Canvas …> opening tag: from `<Canvas` to the first `>` that closes it (brace-aware).
function canvasTag(c) {
  const i = c.indexOf('<Canvas'); if (i < 0) return null
  let depth = 0
  for (let j = i + 7; j < c.length; j++) {
    const ch = c[j]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '>' && depth === 0) return c.slice(i, j + 1)
  }
  return null
}

export function audit(files) {
  const f = [], info = []
  const town = files.find(x => x.path === TOWN)
  if (!town || !/export\s*\{[^}]*\btownCanvasProps\b/.test(code(town.src))) f.push(`${TOWN} does not re-export townCanvasProps — the Ward may import only Town`)
  for (const x of files) {
    const c = code(x.src)
    if (x.path === TOWN || !/<Canvas\b/.test(c) || !/<Town\b/.test(c) || harness(x)) continue
    const tag = canvasTag(c)
    const q = (c.match(/<Town\b[^>]*?\bquality=\{([^}]+)\}/) || [])[1]?.trim()
    const spread = tag && (tag.match(/\{\s*\.\.\.\s*townCanvasProps\(([^)]*\}?)\s*\)\s*\}/) || [])[1]?.trim()
    const via = !spread && tag && /\.\.\.\s*(\w+)\s*\}/.test(tag) ? tag.match(/\.\.\.\s*(\w+)\s*\}/)[1] : null
    const viaArg = via && (c.match(new RegExp(`const\\s+${via}\\s*=\\s*[^;\\n]*townCanvasProps\\(([^)]*\\}?)\\s*\\)`)) || [])[1]?.trim()
    const call = spread ?? viaArg
    const arg = call?.split(',')[0].trim()
    const composer = call == null ? null : (call.match(/\{\s*composer\s*:\s*([^}]+?)\s*\}/) || [])[1] ?? null
    // <Town> behind a condition (`cond && (`, a ternary): the canvas also draws frames that are not <Town>'s, with no composer
    const before = c.slice(0, c.search(/<Town\b/)).replace(/[\s(]+$/, '')
    const conditional = /(&&|\?|:)$/.test(before)
    if (arg == null) f.push(`${x.path}: its <Canvas> does not spread townCanvasProps(quality) — it hand-builds the Canvas <Town> needs`)
    else if (q && arg !== q) f.push(`${x.path}: the Canvas is built for townCanvasProps(${arg}) but <Town> is given quality={${q}} — two profiles, one frame`)
    else info.push(`${x.path}: <Canvas {...townCanvasProps(${arg}, { composer: ${composer} })}> · <Town quality={${q}}>${conditional ? ' (mounted conditionally)' : ''}`)
    if (call != null && composer == null) f.push(`${x.path}: townCanvasProps(${arg}) says no { composer: true | false } — whether every frame goes through <Town>'s composer decides the canvas's AA`)
    if (composer === 'true' && conditional) f.push(`${x.path}: townCanvasProps(…, { composer: true }), but its <Town> is mounted conditionally — the frames without it (no composer) get no AA at all`)
    if (composer === 'true' && /\bpost\s*:\s*false\b/.test(c)) f.push(`${x.path}: townCanvasProps(…, { composer: true }), but it turns post off (\`post: false\`) — <Town> then draws no composer, and refuses the canvas`)
    for (const [re, what] of [[/\bantialias\s*:\s*(true|false)/, 'antialias'], [/logarithmicDepthBuffer\s*:\s*(true|false)/, 'logarithmicDepthBuffer'], [/\bdpr=\{?\s*[\[\d]/, 'dpr'], [/\bshadows=["']/, 'shadows']])
      if (tag && re.test(tag)) f.push(`${x.path}: its <Canvas> hand-sets ${what} — it is the quality profile's (townCanvasProps)`)
  }
  // <Town> asserts the canvas and its composer agree, from the canvas's own context
  if (town && !/canvasAAMismatch\(\s*quality\s*,\s*\{\s*contextAntialias\s*,\s*composer\s*:\s*on\('post'\)\s*\}\s*\)/.test(code(town.src))) f.push(`${TOWN} does not assert canvasAAMismatch(quality, { contextAntialias, composer: on('post') }) — the host's { composer } and Town's post can disagree silently`)
  else if (town && !/getContextAttributes\(\)/.test(code(town.src))) f.push(`${TOWN}: contextAntialias is not read off the canvas's context — a second statement, not the fact`)
  // Preview's tiers: the profile each label names.
  const preview = files.find(x => x.path === 'src/preview/PreviewApp.jsx')
  if (preview) {
    const c = code(preview.src)
    // The tier → profile map is qualityProfile.js#surfaceQuality's (checked below, by calling it); Preview must draw through it.
    if (!/surfaceQuality\(\s*mode\s*,/.test(c)) f.push('Preview\'s quality does not come from surfaceQuality(mode, …) — the tier toggle and the profile can disagree')
  }
  return { f, info }
}

const files = walk(join(ROOT, 'src')).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))
// The surface → profile map, by calling the one function that holds it.
{
  const { surfaceQuality } = await import(join(ROOT, 'src/lib/qualityProfile.js'))
  const { SURFACES } = await import(join(ROOT, 'src/lib/deployment.js'))
  for (const sfc of SURFACES) {
    const want = sfc === 'desktop' ? 'desktop' : 'phone'
    const got = surfaceQuality(sfc, { authored: false }).id
    if (got !== want) { console.error(`⛔ surface "${sfc}" draws with the ${got} profile — its label names ${want}`); process.exit(1) }
  }
}
// The rule, CALLED: refuse only an un-anti-aliased canvas with no composer, on a profile that wants AA.
async function ruleFaults(fn) {
  const { QUALITY } = await import(join(ROOT, 'src/lib/qualityProfile.js'))
  const out = [], D = QUALITY.desktop, P = QUALITY.phone
  const cases = [[D, false, false, true, 'desktop, no MSAA, no composer'], [D, true, true, false, "desktop, MSAA and a composer (Stage's shots)"],
    [D, false, true, false, 'desktop, a composer canvas'], [D, true, false, false, "desktop, MSAA and no composer (the Designer's)"]]
  if (!P.antialias) cases.push([P, false, false, false, 'phone (its profile takes no AA)'])
  for (const [q, contextAntialias, composer, refuse, what] of cases) {
    const got = !!fn(q, { contextAntialias, composer })
    if (got !== refuse) out.push(`canvasAAMismatch, ${what}: ${got ? 'refuses' : 'allows'} — it should ${refuse ? 'refuse' : 'allow'}`)
  }
  return out
}
{
  const { canvasAAMismatch } = await import(join(ROOT, 'src/lib/qualityProfile.js'))
  const r = typeof canvasAAMismatch === 'function' ? await ruleFaults(canvasAAMismatch) : ['qualityProfile.js exports no canvasAAMismatch']
  if (r.length && !process.argv.includes('--self-test')) { console.log(`⛔ FAIL — ${r.length}\n   ${r.join('\n   ')}`); process.exit(1) }
}
if (process.argv.includes('--self-test')) {
  const base = audit(files).f.length
  const add = (src) => audit([...files, { path: 'src/fake/App.jsx', src }]).f.length
  const cases = [
    ['an app hand-builds its Canvas', () => add(`<Canvas gl={{ antialias: true }}><Town quality={Q} /></Canvas>`)],
    ['an app spreads another profile than Town gets', () => add(`<Canvas {...townCanvasProps(QUALITY.phone)}><Town quality={QUALITY} /></Canvas>`)],
    ['an app pins shadows beside the spread', () => add(`<Canvas {...townCanvasProps(Q)} shadows="soft"><Town quality={Q} /></Canvas>`)],
    ['Preview draws a tier without surfaceQuality', () => audit(files.map(x => x.path === 'src/preview/PreviewApp.jsx' ? { ...x, src: x.src.replace(/surfaceQuality\(\s*mode\s*,/g, 'pickProfile(mode,') } : x)).f.length],
    ['Cartograph says composer: true (the Designer stair-steps again)', () => audit(files.map(x => x.path === 'src/cartograph/CartographApp.jsx' ? { ...x, src: x.src.replace('townCanvasProps(QUALITY, { composer: false })', 'townCanvasProps(QUALITY, { composer: true })') } : x)).f.length],
    ['an app says no composer', () => add(`const tc = townCanvasProps(Q)\n<Canvas {...tc}><Town quality={Q} /></Canvas>`)],
    ["a host passes composer: true and turns post off (LS's ground-only player)", () => audit(files.map(x => x.path === 'src/components/Scene.jsx' ? { ...x, src: x.src.replace('{ composer: !IS_GROUND }', '{ composer: true }') } : x)).f.length],
    ['Town stops asserting the canvas', () => audit(files.map(x => x.path === TOWN ? { ...x, src: x.src.replace(/canvasAAMismatch\(quality, \{ contextAntialias, composer: on\('post'\) \}\)/, 'null') } : x)).f.length],
    ['Town stops re-exporting it', () => audit(files.map(x => x.path === TOWN ? { ...x, src: x.src.replace(/\btownCanvasProps\b/g, 'x') } : x)).f.length],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run() > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  for (const [n, fn] of [['the rule never refuses', () => null], ['the rule refuses Stage\'s redundant MSAA', (q, o) => (!o.composer && !o.contextAntialias) || (o.composer && o.contextAntialias) ? 'x' : null]]) {
    const c = (await ruleFaults(fn)).length > 0; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`)
  }
  process.exit(bad ? 1 : 0)
}
const { f, info } = audit(files)
console.log(info.join('\n'))
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ every app draws its town through the Canvas its quality profile asks for (townCanvasProps), one source')
