#!/usr/bin/env node
/**
 * "DOES EVERY SLAB URL IN THE PLAYER COME FROM THE ONE RESOLVER?"
 *
 * WHY (BRIEF-slab-loading §3 step 3, 2026-09-28). A published slab file is served under its
 * content (`<name>.<sha16>.<ext>`, immutable), and only `src/lib/slabUrl.js` knows the name —
 * it reads the town's manifest. A URL built by hand (`${ASSET_BASE}baked/${look}/ground.json`)
 * asks for a name that a content-named town does not serve, and a `?t=` token on it is the
 * cache scheme content names replaced (it was inconsistent: 38 MB of LS carried none).
 *
 * Asserts, reading every .js/.jsx under src/ (comments stripped):
 *   · no string or template outside the resolver spells `baked/` — every slab URL is
 *     `slabUrl(look, rel)` / `slabFetch(look, rel)`;
 *   · no file outside the resolver reads `ASSET_BASE` — a URL assembled from a base variable
 *     (`const base = ASSET_BASE; base + atlas.colorPath`) hides from the first rule. The two
 *     non-slab namespaces under the same origin are named below with why;
 *   · only src/lib/slabNames.js spells `baked/`; the resolver composes through its #slabPath
 *     (the naming rule itself is proven by checks/claims-a-slab-name-is-its-content.mjs).
 * The self-test proves the detector sees a hand-built URL in each of the three spellings
 * the renderer used (template, concatenation, base-variable) and ignores a comment.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-every-slab-url-is-resolved.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const RESOLVER = 'src/lib/slabUrl.js'
const NAMES = 'src/lib/slabNames.js'
const ALLOWED = new Set([NAMES])   // the one file that spells `baked/<look>/`
// ASSET_BASE readers that are NOT the slab. Each names its namespace; do not add one without it.
const NOT_SLAB = {
  'src/lib/bakedUrl.js': 'defines ASSET_BASE',
  [RESOLVER]: 'the resolver — prefixes slabNames.js#slabPath with the base',
  'src/lib/publishedLayer.js': 'live/<look>/ — the published listings layer, mutable, not the slab',
  'src/components/PilgrimMonument.jsx': 'setpieces/<look>/ — an artist model declared on the instance, not the slab',
}

// Comments out; strings kept. Good enough for this codebase's style (no regex literals with `//`).
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** Lines that read ASSET_BASE. */
export function readsBase(src) {
  const out = []
  code(src).split('\n').forEach((line, i) => { if (/\bASSET_BASE\b/.test(line)) out.push({ line: i + 1, text: line.trim() }) })
  return out
}

/** Lines that spell a slab path in a string, template or concatenation. */
export function handBuilt(src) {
  const out = []
  code(src).split('\n').forEach((line, i) => {
    if (/['"`][^'"`]*\bbaked\//.test(line) || /\bbaked\/\$\{/.test(line)) out.push({ line: i + 1, text: line.trim() })
  })
  return out
}

function selfTest() {
  const fixture = [
    "// a comment naming baked/<look>/ground.json is fine",
    "const a = `${ASSET_BASE}baked/${look}/ground.json?t=${bake}`",
    "const b = ASSET_BASE + 'baked/' + look + '/' + m.bin",
    "const c = `${base}baked/${lookId}/terrain.json`",
    "/* block: baked/x */ const d = slabUrl(look, 'ground.json')",
    "const base = ASSET_BASE; const e = base + atlas.colorPath",
  ].join('\n')
  for (const [name, fn, want] of [['hand-built', handBuilt, [2, 3, 4]], ['ASSET_BASE', readsBase, [2, 3, 6]]]) {
    const hits = fn(fixture).map(h => h.line)
    if (JSON.stringify(hits) !== JSON.stringify(want)) {
      console.error(`⛔ SELF-TEST — the ${name} detector flagged lines ${JSON.stringify(hits)}, expected ${JSON.stringify(want)}`)
      process.exit(2)
    }
  }
}

selfTest()

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(join(d, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [join(d, e.name)] : [])

const fails = []
for (const abs of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, abs)
  if (ALLOWED.has(rel)) continue
  const src = readFileSync(abs, 'utf8')
  for (const h of handBuilt(src)) fails.push(`${rel}:${h.line}  ${h.text.slice(0, 140)}`)
  if (!(rel in NOT_SLAB)) for (const h of readsBase(src)) if (!/baked\//.test(h.text)) fails.push(`${rel}:${h.line}  reads ASSET_BASE — ${h.text.slice(0, 110)}`)
}

let resolverSrc = ''
try { resolverSrc = readFileSync(join(ROOT, RESOLVER), 'utf8') } catch { fails.push(`${RESOLVER} does not exist — there is no resolver`) }
if (resolverSrc && !/\bslabPath\b[^\n]*from '\.\/slabNames\.js'/.test(resolverSrc)) fails.push(`${RESOLVER} does not name files through ./slabNames.js#slabPath`)

if (fails.length) {
  console.error(`⛔ ${fails.length} slab URL(s) built outside ${RESOLVER}:`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log(`✅ every slab URL in src/ comes from ${RESOLVER}`)
