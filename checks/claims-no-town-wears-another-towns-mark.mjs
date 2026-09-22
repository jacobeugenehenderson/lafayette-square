#!/usr/bin/env node
/**
 * claims-no-town-wears-another-towns-mark — no LS asset is hardcoded into a shared surface.
 *
 * ⛔⛔ ONE PLAYER SERVES EVERY TOWN, so anything hardcoded into it is worn by all of them.
 * Measured 2026-09-21 on huron's own staging address: the tab said "Lafayette Square", the
 * favicon was fetched from `lafayette-square.com`, the load screen drew LS's shared
 * `favicon.svg`, and every anonymous visitor's avatar was the GATEWAY ARCH. The address
 * was right and everything around it said St. Louis.
 *
 * ⭐ THE FIX IS AN AUTHORED GLYPH, not an asset: `branding.mark` is an emoji, so town #10
 * pastes a character and every badge follows — no file, no pipeline, no size variants.
 * `src/lib/townMark.js` resolves emoji → the town's own SVG → its INITIAL, and ⛔ never
 * another town's mark: an unauthored town must LOOK unauthored rather than look finished
 * and be wrong (`CLAUDE.md` Layer 0 q2).
 *
 * ⛔ THIS CHECKS THE SHARED SURFACES ONLY. `src/instances/lafayette-square.js` may name
 * lafayette-square.com all it likes — that is a town describing itself, which is the
 * product. The defect is a SHARED file naming one town.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nNo town wears another town’s mark')

// ⛔ A town's OWN module is exempt by definition — that is where a town says who it is.
const isTownModule = (p) => p.includes(`src${path.sep}instances${path.sep}`)
const EXT = new Set(['.js', '.jsx'])
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (EXT.has(path.extname(e.name))) yield p
  }
}

// 1. No shared source may hardcode a town-specific mark or domain as an ASSET source.
const OFFENDERS = [
  [/lafayette-square\.com\/favicon/i, "fetches Lafayette Square's favicon"],
  [/BASE_URL\s*\+\s*'favicon\.svg'/, 'draws the one shared favicon.svg as a town mark'],
]
for (const f of [...walk(path.join(ROOT, 'src'))]) {
  if (isTownModule(f)) continue
  const src = readFileSync(f, 'utf8')
  for (const [re, why] of OFFENDERS) {
    if (re.test(src)) bad(`${path.relative(ROOT, f)} ${why} — every town would wear it`)
  }
}

// 2. The resolver must exist and must not fall back to a town.
const tm = path.join(ROOT, 'src/lib/townMark.js')
let resolver = ''
try { resolver = readFileSync(tm, 'utf8') } catch { bad('src/lib/townMark.js is gone — nothing resolves a town mark') }
if (resolver) {
  if (!/kind:\s*'initial'/.test(resolver)) {
    bad("townMark has no 'initial' case — a town that authors nothing must draw its OWN "
      + 'placeholder, not inherit a mark')
  } else ok("townMark falls back to the town's own initial, never to a town")
}

// 3. Every registered town must resolve to something, and no two share an authored mark.
const reg = readFileSync(path.join(ROOT, 'src/instances/registry.js'), 'utf8')
// ⛔ Both forms: `'lafayette-square': lafayetteSquare,` AND the ES shorthand `huron,`.
// Reading only the first silently skipped huron — a check that misses a town is worse
// than no check, because the town it misses is the one nobody has looked at.
const body = (reg.match(/const INSTANCES = \{([\s\S]*?)\n\}/) || [, ''])[1]
const maps = body.split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean)
  .map((l) => (l.includes(':') ? l.split(':')[0] : l).replace(/'/g, '').trim())
  .filter((k) => /^[a-z][\w-]*$/.test(k))
const seen = new Map()
for (const m of maps) {
  let src
  try { src = readFileSync(path.join(ROOT, `src/instances/${m}.js`), 'utf8') } catch { continue }
  const mark = (src.match(/\bmark:\s*'([^']+)'/) || [])[1]
  const svg = (src.match(/\bmarkSvg:\s*'([^']+)'/) || [])[1]
  const authored = mark || svg
  if (!authored) { ok(`'${m}' authors no mark — draws its own initial, honestly`); continue }
  if (seen.has(authored)) bad(`'${m}' and '${seen.get(authored)}' both author the mark ${authored} — one is wearing the other's`)
  else { seen.set(authored, m); ok(`'${m}' authors ${authored}`) }
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ every town wears its own mark\n')
process.exit(failed ? 1 : 0)
