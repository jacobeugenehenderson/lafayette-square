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
 *   ① `INSTANCE.domain` is read nowhere but `src/lib/townOrigin.js` (and the instance modules that
 *      declare it).
 *   ② `location.origin` builds no URL. It may only be the BASE of `new URL(x, window.location.origin)`,
 *      which parses a relative reference and names no town. ⛔ Anything else is a URL made from
 *      whatever host the page happens to be on — the staging address on a card printed from staging.
 * ⛔ There is no exception list. A use that fails is a finding; route it through the helper.
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

const findings = []
for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/')
  if (rel === HELPER || rel.startsWith('src/instances/')) continue
  readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
    // ⛔ A line comment only where `//` is not part of a URL: the first draft stripped `//.*`
    // and so deleted the `https://${INSTANCE.domain}` it exists to find (caught by its mutation test).
    const code = line.replace(/(^|[^:'"`])\/\/.*$/, '$1')
    if (/^\s*\*/.test(line)) return
    if (/INSTANCE\s*(\?\.|\.)\s*domain\b/.test(code)) findings.push(`${rel}:${i + 1}  reads INSTANCE.domain — use townOrigin()/townHost()`)
    const bare = code.replace(/new URL\([^,()]+,\s*(window\.)?location\.origin\s*\)/g, '')
    if (/location\.origin/.test(bare)) findings.push(`${rel}:${i + 1}  builds a URL from location.origin — the host the page is on, not the town`)
  })
}

console.log(`Public URLs take the town's domain from ${HELPER} — ${files.length} files under src/\n`)
if (!findings.length) { console.log('  ✅ no public URL is built from INSTANCE.domain or location.origin outside the helper'); process.exit(0) }
for (const f of findings) console.error(`  ⛔ ${f}`)
process.exit(2)
