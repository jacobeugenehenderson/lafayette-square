#!/usr/bin/env node
/**
 * claims-a-slab-ships-under-content-names — every slab upload names its files by their content, and every read of what an
 * environment serves goes through the town's manifest (OPERATIONS "Slab names"; src/lib/slabNames.js).
 *
 * ⭐ WHY: a share card's image must have an address a preview cache cannot confuse (src/lib/shareCard.js refuses a town
 * whose manifest is not `names: "sha256-16"`), and a content-named file is never overwritten, so a visitor holding an older
 * manifest keeps resolving. Publish shipped plain names, so staging's link card had no image ("its slab is not published
 * under content names", Provincetown, 2026-10-26).
 *
 * Pinned, all from cartograph/serve.js's CODE (line comments dropped):
 *  1. Every `upload-baked-to-r2.mjs` call carries `--names=${HASHED}`, the scheme read from slabNames.js, never a literal.
 *  2. No route reads a slab's `scene.json` at its plain key: what an environment serves is read through `servedPour`,
 *     which asks the manifest — the one key the retirement sweep never deletes.
 *  3. Publish's proof that the slab landed asks for the manifest, not `scene.json`: a town is live by its manifest.
 * ⭐ MUTATIONS, run every time (each must go red): `--names` stripped from each upload; a plain `scene.json` read put back
 * into /deployed; Publish's proof pointed back at `scene.json`.
 *   node checks/claims-a-slab-ships-under-content-names.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = readFileSync(path.join(ROOT, process.env.SERVE || 'cartograph/serve.js'), 'utf8')
const HASHED = (readFileSync(path.join(ROOT, 'src/lib/slabNames.js'), 'utf8').match(/export const HASHED = '([^']+)'/) || [])[1]
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)
const code = (src) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')

/** The judge: the offences in one copy of serve.js. Empty is clean. */
function judge(src) {
  const c = code(src), out = []
  // 1. every upload call, by its env
  const ups = [...c.matchAll(/node scripts\/upload-baked-to-r2\.mjs([^`]*)`/g)].map((m) => m[1])
  if (!ups.length) out.push('serve.js calls no `upload-baked-to-r2.mjs` — update this check')
  for (const a of ups) {
    const env = (a.match(/--env=(\w+)/) || [])[1] || '?'
    if (!/--names=\$\{HASHED\}/.test(a)) out.push(`the ${env} upload carries no --names=\${HASHED}: it ships plain names`)
  }
  if (!/import \{[^}]*\bHASHED\b[^}]*\} from '\.\.\/src\/lib\/slabNames\.js'/.test(c)) out.push('serve.js does not import HASHED from src/lib/slabNames.js')
  // 2. no plain scene.json read of a served slab outside servedPour
  const pour = c.indexOf('async function servedPour(')
  const pourEnd = pour >= 0 ? c.indexOf('\n}\n', pour) : -1
  const outside = pour >= 0 && pourEnd > pour ? c.slice(0, pour) + c.slice(pourEnd) : c
  if (pour < 0) out.push('serve.js has no servedPour — nothing reads a served slab through its manifest')
  for (const m of outside.matchAll(/fetch\(`[^`]*baked\/\$\{[^}]+\}\/scene\.json[^`]*`/g)) out.push(`a served slab is read at its plain key: ${m[0].slice(0, 90)}`)
  // 3. Publish's proof asks the manifest
  const pub = c.slice(c.indexOf("path.match(/^\\/looks\\/([^/]+)\\/publish$/)"), c.indexOf("path.match(/^\\/looks\\/([^/]+)\\/promote$/)"))
  const key = (pub.match(/const slabKey = `([^`]+)`/) || [])[1]
  if (!key) out.push("Publish names no slabKey for its proof — update this check")
  else if (!/manifestPath\(id\)/.test(key)) out.push(`Publish proves the slab landed by \`${key}\`, not by its manifest`)
  return out
}

console.log('\nA slab ships under content names, and is read through its manifest')
if (!HASHED) bad('src/lib/slabNames.js exports no HASHED — update this check')
const hits = judge(SRC)
if (hits.length) for (const h of hits) bad(h)
else ok(`every upload carries --names=${HASHED} · every served-slab read goes through servedPour · Publish's proof asks manifest.json`)

// ── mutations
const MUT = [
  ['--names stripped from the staging upload', (s) => s.replace(/(--env=staging --look=\$\{id\}) --names=\$\{HASHED\}/, '$1')],
  ['--names stripped from the prod upload', (s) => s.replace(/(--env=prod --look=\$\{id\}) --names=\$\{HASHED\}/, '$1')],
  ['a plain scene.json read put back into /deployed', (s) => s.replace('const { bakedAt } = await servedPour(base, id)', 'const r = await fetch(`${base}baked/${id}/scene.json?t=${Date.now()}`); const { bakedAt } = await r.json()')],
  ["Publish's proof pointed back at scene.json", (s) => s.replace(/const slabKey = `\$\{ASSET_ENV_PREFIX\.staging\}\$\{manifestPath\(id\)\}`/, 'const slabKey = `${ASSET_ENV_PREFIX.staging}baked/${id}/scene.json`')],
]
for (const [name, f] of MUT) {
  const m = f(SRC)
  if (m === SRC) { bad(`mutation "${name}" could not be applied — update this check`); continue }
  if (judge(m).length > hits.length) ok(`mutation: ${name} → caught`)
  else bad(`mutation: ${name} → NOT caught, the judge is blind`)
}
console.log(failed ? `\n⛔ RED — ${failed} problem(s)` : '\n✅ GREEN')
process.exit(failed ? 1 : 0)
