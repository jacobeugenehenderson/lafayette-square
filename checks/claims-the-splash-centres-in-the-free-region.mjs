#!/usr/bin/env node
/**
 * "DOES THE SPLASH'S MARK AND TITLE CENTRE IN THE PART OF THE CANVAS THE HOST LEAVES FREE — AND REFUSE, BY NAME, AN INSET
 *  THAT LEAVES NONE?"
 *
 * WHY (Jacob, 2026-10-27: on a phone the splash is "centered in the *browser* screen but need[s] to be centered … between
 * the on-screen elements"). The free region is ONE fact, Town's `viewInset`, the same the plan frames into: the splash
 * takes it through the same prop and planPose.js#freeRegion, never a splash-only inset (a second copy of the layout).
 *
 * Reads the source, never restates it:
 *   1. freeRegion (planPose.js), run: no inset → the whole canvas; an inset → that padding; top + bottom ≥ H or
 *      left + right ≥ W → `{ why }` naming the four numbers and the canvas size; a canvas with no size yet (0×0) → null,
 *      no verdict, never a refusal (staging, 2026-10-28: a false refusal on every cold load).
 *   2. TownSplash.jsx: takes `viewInset`, asks freeRegion with it against its own box, pads its centring box by the
 *      region, draws the mark and title only inside that box and only when the region exists, and console.errors a
 *      refusal carrying the `why` (Ward, 2026-10-28: a refused inset draws the sky and stars only).
 *   3. Town.jsx hands TownSplash its own `viewInset`.
 * The live half (the title's centre inside the free region on a real phone page, every published town) is the Ward's:
 * theward checks/splash-centres-in-the-free-region.mjs.
 *
 * ⭐ MUTANTS (--mutants), each must go RED: (a) the splash asks freeRegion without the inset · (b) freeRegion's guard
 * removed, so a degenerate inset (top + bottom > H) is padded silently · (c) the refusal's console.error removed · (d) the
 * mark and title drawn on a refused region · (e) Town stops passing viewInset · (f) the 0×0 canvas judged, so a real inset
 * on an unsized canvas is refused.
 *   node checks/claims-the-splash-centres-in-the-free-region.mjs [--mutants]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const POSE = 'src/camera/planPose.js', SPLASH = 'src/components/TownSplash.jsx', TOWN = 'src/components/Town.jsx'
const read = (f) => readFileSync(join(ROOT, f), 'utf8')

// 1. freeRegion, run from (a copy of) its own source.
async function judgePose(src) {
  const dir = mkdtempSync(join(tmpdir(), 'free-region-'))
  try {
    writeFileSync(join(dir, 'planPose.mjs'), src)
    const { freeRegion } = await import(pathToFileURL(join(dir, 'planPose.mjs')).href)
    if (typeof freeRegion !== 'function') return ['planPose.js exports no freeRegion']
    const why = []
    const eq = (a, b) => ['top', 'right', 'bottom', 'left'].every((k) => a?.[k] === b[k]) && !a?.why
    if (!eq(freeRegion(undefined, 390, 844), { top: 0, right: 0, bottom: 0, left: 0 })) why.push('no inset does not give the whole canvas')
    if (!eq(freeRegion({ top: 108, bottom: 240 }, 390, 844), { top: 108, right: 0, bottom: 240, left: 0 })) why.push('an inset is not the padding it names')
    for (const [inset, W, H] of [[{ top: 500, bottom: 400 }, 390, 844], [{ top: 422, bottom: 422 }, 390, 844], [{ left: 200, right: 190 }, 390, 844]]) {
      const r = freeRegion(inset, W, H)
      if (!r?.why) why.push(`a degenerate inset ${JSON.stringify(inset)} on ${W}×${H} is not refused`)
      else if (!r.why.includes(`${W}×${H}`) || !Object.values(inset).every((v) => r.why.includes(String(v)))) why.push(`the refusal of ${JSON.stringify(inset)} does not carry its numbers and the canvas size: "${r.why}"`)
    }
    for (const [W, H] of [[0, 0], [1288, 0], [0, 926]]) {
      const r = freeRegion({ top: 108, right: 0, bottom: 0, left: 440 }, W, H)
      if (r !== null) why.push(`a real inset on an unsized ${W}×${H} canvas is ${r?.why ? `refused ("${r.why}")` : 'given a region'} — it must be null, no verdict`)
    }
    return why
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// 2. The splash pads its centring box by the region, and refuses by name.
function judgeSplash(src) {
  const why = []
  if (!/import \{ freeRegion \} from '\.\.\/camera\/planPose\.js'/.test(src)) why.push('TownSplash does not import planPose.js#freeRegion')
  if (!/export default function TownSplash\(\{[^}]*\bviewInset\b[^}]*\}\)/.test(src)) why.push('TownSplash takes no viewInset')
  if (!/freeRegion\(viewInset, size\.W, size\.H\)/.test(src)) why.push('TownSplash does not ask freeRegion with its viewInset against its own box')
  const box = src.match(/\{region && !region\.why \? <div data-town-splash="region" style=\{\{([\s\S]*?)\}\}>([\s\S]*?)<\/div> : null\}\s*<\/div>\s*\)\s*\}\s*$/)
  if (!box) why.push('the mark and title are not drawn inside a centring box gated on a free region (`region && !region.why`)')
  else {
    for (const k of ['Top', 'Right', 'Bottom', 'Left']) if (!new RegExp(`padding${k}: region\\.${k.toLowerCase()}\\b`).test(box[1])) why.push(`the centring box's padding${k} is not the region's ${k.toLowerCase()}`)
    if (!/TownMarkGlyph/.test(box[2]) || !/data-town-splash="title"/.test(box[2])) why.push('the mark or the title sits outside the centring box')
  }
  if (!/console\.error\([^)]*\$\{region\.why\}/.test(src)) why.push('a refused region is not console.error-ed with its why')
  return why
}

// 3. Town hands the splash its inset.
const judgeTown = (src) => /<TownSplash [^>]*\bviewInset=\{viewInset\}[^>]*\/>/.test(src) ? [] : ['Town.jsx does not pass viewInset to TownSplash']

let bad = 0
const report = (label, why) => { console.log(`${why.length ? '⛔' : '✅'} ${label}`); for (const w of why) console.log(`      ⛔ ${w}`); if (why.length) bad++ }
const P = await judgePose(read(POSE)), S = judgeSplash(read(SPLASH)), T = judgeTown(read(TOWN))
report('1 freeRegion: the inset is the region; an inset leaving none is refused with its numbers; an unsized canvas is no verdict', P)
report('2 TownSplash pads its centring box by the region and refuses a degenerate one by name', S)
report('3 Town passes its viewInset to TownSplash', T)

if (process.argv.includes('--mutants')) {
  const res = []
  const verdict = (name, ran, red) => { res.push(`${name}: ${!ran ? '⛔ not run (the site moved — re-aim the mutant)' : red ? 'RED, as it must be' : '⛔ still GREEN'}`); if (!ran || !red) bad++ }
  const sp = read(SPLASH), po = read(POSE), tw = read(TOWN)
  const a = sp.replace('freeRegion(viewInset, size.W, size.H)', 'freeRegion(undefined, size.W, size.H)')
  verdict('a · the splash ignores the inset', a !== sp, judgeSplash(a).length > S.length)
  const b = po.replace(/\n  if \(i\.top \+ i\.bottom >= H \|\| i\.left \+ i\.right >= W\) \{[\s\S]*?\n  \}\n/, '\n')
  verdict('b · a degenerate inset (top + bottom > H) padded silently', b !== po, (await judgePose(b)).length > P.length)
  const c = sp.replace(/\n\s*console\.error\(`\[splash\] refused:[^\n]*\n/, '\n')
  verdict('c · the refusal not logged', c !== sp, judgeSplash(c).length > S.length)
  const d = sp.replace('{region && !region.why ? <div data-town-splash="region"', '{region ? <div data-town-splash="region"')
  verdict('d · the mark and title drawn on a refused region', d !== sp, judgeSplash(d).length > S.length)
  const e = tw.replace(' viewInset={viewInset} />', ' />')
  verdict('e · Town stops passing viewInset', e !== tw, judgeTown(e).length > T.length)
  const f = po.replace(/\n  if \(!\(W > 0 && H > 0\)\) return null\n/, '\n')
  verdict('f · the 0×0 canvas judged (a real inset refused on an unsized canvas)', f !== po, (await judgePose(f)).length > P.length)
  for (const r of res) console.log(`   mutant ${r}`)
}
console.log(bad ? '\n⛔ RED — the splash does not centre in the free region, or does not refuse an inset that leaves none'
  : '\n✅ GREEN — the splash centres in the free region and refuses, by name, an inset that leaves none')
process.exit(bad ? 1 : 0)
