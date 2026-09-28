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
 *   · its <Canvas> spreads townCanvasProps(Q), where Q is the SAME expression it passes as <Town quality={Q}>;
 *   · the <Canvas> tag hand-sets none of antialias / logarithmicDepthBuffer / dpr / shadows (literal values);
 *   · Town.jsx re-exports townCanvasProps;
 *   · Preview's tiers draw with the profile their LABEL names (Jacob: "The entire Preview authoring space is designed to
 *     test these things for use in a mobile space") — every tier in TIER_QUALITY maps desktop → the desktop profile and
 *     phone-* → the phone profile, and Preview's quality comes from that map.
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
    const spread = tag && (tag.match(/\{\s*\.\.\.\s*townCanvasProps\(([^)]*)\)\s*\}/) || [])[1]?.trim()
    const via = !spread && tag && /\.\.\.\s*(\w+)\s*\}/.test(tag) ? tag.match(/\.\.\.\s*(\w+)\s*\}/)[1] : null
    const viaArg = via && (c.match(new RegExp(`const\\s+${via}\\s*=\\s*[^;\\n]*townCanvasProps\\(([^)]*)\\)`)) || [])[1]?.trim()
    const arg = spread ?? viaArg
    if (arg == null) f.push(`${x.path}: its <Canvas> does not spread townCanvasProps(quality) — it hand-builds the Canvas <Town> needs`)
    else if (q && arg !== q) f.push(`${x.path}: the Canvas is built for townCanvasProps(${arg}) but <Town> is given quality={${q}} — two profiles, one frame`)
    else info.push(`${x.path}: <Canvas {...townCanvasProps(${arg})}> · <Town quality={${q}}>`)
    for (const [re, what] of [[/\bantialias\s*:\s*(true|false)/, 'antialias'], [/logarithmicDepthBuffer\s*:\s*(true|false)/, 'logarithmicDepthBuffer'], [/\bdpr=\{?\s*[\[\d]/, 'dpr'], [/\bshadows=["']/, 'shadows']])
      if (tag && re.test(tag)) f.push(`${x.path}: its <Canvas> hand-sets ${what} — it is the quality profile's (townCanvasProps)`)
  }
  // Preview's tiers: the profile each label names.
  const preview = files.find(x => x.path === 'src/preview/PreviewApp.jsx')
  if (preview) {
    const c = code(preview.src)
    const map = (c.match(/const\s+TIER_QUALITY\s*=\s*\{([^}]*)\}/) || [])[1]
    if (!map) f.push('src/preview/PreviewApp.jsx has no TIER_QUALITY — its tiers do not name the profile they draw with')
    else {
      for (const m of map.matchAll(/['"]?([\w-]+)['"]?\s*:\s*([\w.]+)/g)) {
        const [, tier, profile] = m
        const want = /phone/.test(tier) ? 'phone' : /desktop/.test(tier) ? 'desktop' : null
        if (want && !profile.endsWith(`.${want}`)) f.push(`Preview's "${tier}" tier draws with ${profile} — its label names the ${want} profile`)
      }
      if (!/=\s*TIER_QUALITY\[\s*mode\s*\]/.test(c)) f.push('Preview\'s quality does not come from TIER_QUALITY[mode] — the tier toggle and the profile can disagree')
    }
  }
  return { f, info }
}

const files = walk(join(ROOT, 'src')).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))
if (process.argv.includes('--self-test')) {
  const base = audit(files).f.length
  const add = (src) => audit([...files, { path: 'src/fake/App.jsx', src }]).f.length
  const cases = [
    ['an app hand-builds its Canvas', () => add(`<Canvas gl={{ antialias: true }}><Town quality={Q} /></Canvas>`)],
    ['an app spreads another profile than Town gets', () => add(`<Canvas {...townCanvasProps(QUALITY.phone)}><Town quality={QUALITY} /></Canvas>`)],
    ['an app pins shadows beside the spread', () => add(`<Canvas {...townCanvasProps(Q)} shadows="soft"><Town quality={Q} /></Canvas>`)],
    ['a phone tier draws with the desktop profile', () => audit(files.map(x => x.path === 'src/preview/PreviewApp.jsx' ? { ...x, src: x.src.replace("'phone-lo': QUALITY_PROFILES.phone", "'phone-lo': QUALITY_PROFILES.desktop") } : x)).f.length],
    ['Town stops re-exporting it', () => audit(files.map(x => x.path === TOWN ? { ...x, src: x.src.replace(/\btownCanvasProps\b/g, 'x') } : x)).f.length],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run() > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}
const { f, info } = audit(files)
console.log(info.join('\n'))
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ every app draws its town through the Canvas its quality profile asks for (townCanvasProps), one source')
