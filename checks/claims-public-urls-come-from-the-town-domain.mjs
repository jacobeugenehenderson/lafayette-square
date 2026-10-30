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
 *   ③ No instance module under src/instances/ declares `domain` (each is imported and asked): a
 *      domain held in code is a second home for what Operations owns, and the one that won.
 * ⛔ There is no exception list. A use that fails is a finding; route it through the helper.
 * ⭐ Mutants, run every time, each must turn it RED: an instance that declares `domain` · the helper
 *    reading `INSTANCE.domain` again.
 *
 *   node checks/claims-public-urls-come-from-the-town-domain.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

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

const INSTANCES = path.join(SRC, 'instances')

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

/** ③ over one instance module's source: imported from a data URL (instance modules import nothing), so a mutant never touches the file. */
async function declaresDomain(rel, text) {
  const mod = await import(`data:text/javascript,${encodeURIComponent(text)}`)
  return mod.default && Object.hasOwn(mod.default, 'domain') ? [`${rel}  declares domain: ${JSON.stringify(mod.default.domain)} — a town's domain lives in Operations`] : []
}

const findings = []
const instanceFiles = readdirSync(INSTANCES).filter((e) => e.endsWith('.js') && e !== 'registry.js')
for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/')
  if (rel.startsWith('src/instances/')) continue
  findings.push(...scan(rel, readFileSync(abs, 'utf8')))
}
for (const e of instanceFiles) findings.push(...await declaresDomain(`src/instances/${e}`, readFileSync(path.join(INSTANCES, e), 'utf8')))

// The mutants: each must be seen to fail, or the check above is blind to it.
const first = instanceFiles[0], firstSrc = readFileSync(path.join(INSTANCES, first), 'utf8')
if (!firstSrc.includes('export default {')) findings.push(`src/instances/${first} no longer opens \`export default {\` — re-aim the instance mutant`)
else if (!(await declaresDomain(first, firstSrc.replace('export default {', "export default {\n  domain: 'mutant.example',"))).length) findings.push('BLIND: an instance declaring domain passed ③')
const helperSrc = readFileSync(path.join(ROOT, HELPER), 'utf8')
if (!helperSrc.includes('function readDomain() {')) findings.push(`${HELPER} no longer has readDomain() — re-aim the helper mutant`)
else if (!scan(HELPER, helperSrc.replace('function readDomain() {', 'function readDomain() {\n  if (INSTANCE.domain) return INSTANCE.domain')).length) findings.push('BLIND: the helper reading INSTANCE.domain passed ①')

console.log(`Public URLs take the town's domain from ${HELPER} — ${files.length} files under src/\n`)
if (!findings.length) { console.log(`  ✅ no public URL is built from INSTANCE.domain or location.origin outside the helper; none of ${instanceFiles.length} instance modules declares a domain; both mutants caught`); process.exit(0) }
for (const f of findings) console.error(`  ⛔ ${f}`)
process.exit(2)
