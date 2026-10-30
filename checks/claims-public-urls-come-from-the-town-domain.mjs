/**
 * EVERY PUBLIC URL THE PLAYER BUILDS TAKES THE TOWN'S DOMAIN FROM ONE HELPER.
 *
 * ⛔ THE DEFECT (found 2026-09-26, BRIEF-production-sites). The check-in QR, the Guardian claim QR
 * that is PRINTED ON A PHYSICAL CARD, the place share and the bulletin share were each built from
 * `https://${INSTANCE.domain}` — and `domain` is null for every town but Lafayette Square, so on
 * huron and provincetown they read `https://null/…`. ⭐ The domain's one home is Operations; the
 * serving Worker writes it into the page and `src/lib/townOrigin.js` is the only reader.
 *
 * What this asserts, over every file under src/ (walked, never listed):
 *   ① `INSTANCE.domain` is read nowhere, the helper included (Lafayette Square's cutover, 2026-10-30,
 *      deleted the last instance that declared one, and the helper's branch that read it).
 *   ② `location.origin` builds no URL outside the helper. It may only be the BASE of
 *      `new URL(x, window.location.origin)`, which parses a relative reference and names no town.
 *      ⛔ Anything else is a URL made from whatever host the page happens to be on — the staging
 *      address on a card printed from staging.
 *   ③ No registered instance declares `domain` (each is asked, through src/instances/registry.js): a
 *      domain held in code is a second home for what Operations owns, and the one that won.
 * ⛔ There is no exception list. A use that fails is a finding; route it through the helper.
 * ⭐ Mutants, run every time, each must turn it RED: an instance that declares `domain` · the helper
 *    reading `INSTANCE.domain` again.
 *
 *   node checks/claims-public-urls-come-from-the-town-domain.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { registeredMaps, instanceForMap } from '../src/instances/registry.js'
import { importSource } from './_importSource.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
const HELPER = 'src/lib/townOrigin.js'

const files = []
;(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(m?js|jsx|ts|tsx)$/.test(e)) files.push(p)
  }
})(SRC)

/** ① and ② over one file's text. */
function scan(rel, text) {
  const out = []
  text.split('\n').forEach((line, i) => {
    // ⛔ A line comment only where `//` is not part of a URL: the first draft stripped `//.*`
    // and so deleted the `https://${INSTANCE.domain}` it exists to find (caught by its mutation test).
    const code = line.replace(/(^|[^:'"`])\/\/.*$/, '$1')
    if (/^\s*\*/.test(line)) return
    if (/INSTANCE\s*(\?\.|\.)\s*domain\b/.test(code)) out.push(`${rel}:${i + 1}  reads INSTANCE.domain — use townOrigin()/townHost()`)
    if (rel === HELPER) return
    const bare = code.replace(/new URL\([^,()]+,\s*(window\.)?location\.origin\s*\)/g, '')
    if (/location\.origin/.test(bare)) out.push(`${rel}:${i + 1}  builds a URL from location.origin — the host the page is on, not the town`)
  })
  return out
}

/** ③ over one instance: an own `domain`, whatever its value (null included), is a finding. */
const declaresDomain = (map, inst) => inst && Object.hasOwn(inst, 'domain')
  ? [`src/instances/${map}.js  declares domain: ${JSON.stringify(inst.domain)} — a town's domain lives in Operations`] : []

const findings = []
const maps = registeredMaps()
for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/')
  if (rel.startsWith('src/instances/')) continue
  findings.push(...scan(rel, readFileSync(abs, 'utf8')))
}
for (const map of maps) findings.push(...declaresDomain(map, instanceForMap(map)))

// The mutants: each must be seen to fail, or the check above is blind to it.
let reAim = false
const mutant = await importSource('src/instances/provincetown.js', { transform: (t) => {
  if (!t.includes('export default {')) { reAim = true; return t }
  return t.replace('export default {', "export default {\n  domain: 'mutant.example',")
} })
if (reAim) findings.push('src/instances/provincetown.js no longer opens `export default {` — re-aim the instance mutant')
else if (!declaresDomain('provincetown', mutant.default).length) findings.push('BLIND: an instance declaring domain passed ③')
const helperSrc = readFileSync(path.join(ROOT, HELPER), 'utf8')
if (!helperSrc.includes('function readDomain() {')) findings.push(`${HELPER} no longer has readDomain() — re-aim the helper mutant`)
else if (!scan(HELPER, helperSrc.replace('function readDomain() {', 'function readDomain() {\n  if (INSTANCE.domain) return INSTANCE.domain')).length) findings.push('BLIND: the helper reading INSTANCE.domain passed ①')

console.log(`Public URLs take the town's domain from ${HELPER} — ${files.length} files under src/\n`)
if (!findings.length) { console.log(`  ✅ no public URL is built from INSTANCE.domain or location.origin outside the helper; none of ${maps.length} registered instances declares a domain; both mutants caught`); process.exit(0) }
for (const f of findings) console.error(`  ⛔ ${f}`)
process.exit(2)
