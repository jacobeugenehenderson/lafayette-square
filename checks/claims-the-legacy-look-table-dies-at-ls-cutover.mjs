#!/usr/bin/env node
/**
 * "IS THE APPS SCRIPT'S LOOK → TENANT TABLE STILL ONE ENTRY, AND GONE ONCE LAFAYETTE SQUARE HAS CUT OVER?"
 *
 * WHY (Jacob, 2026-10-04). Every client names its town by its sealed id (`tenant`). Lafayette Square's production
 * player on `main` predates that and sends `look=lafayette-square`, so the Apps Script translates that ONE look
 * (`LEGACY_LOOK_TENANT`). Jacob approved it on condition it is deleted at LS's cutover and that something fails if it
 * outlives it. A translation table is how a fallback grows back: a second entry would be a town keyed by its name again.
 *
 * The cutover's signal is the one BRIEF-ls-cutover-to-its-address step 6 retires: `.github/workflows/deploy.yml`,
 * the GitHub Pages deploy that serves `main` to lafayette-square.com.
 *
 * Asserts:
 *   · while the Pages deploy exists, the table holds exactly `lafayette-square`, mapped to LS's sealed id;
 *   · once it is gone, the table — and its comment — are gone from apps-script/Code.js.
 *
 *   node checks/claims-the-legacy-look-table-dies-at-ls-cutover.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const gas = readFileSync(path.join(ROOT, 'apps-script/Code.js'), 'utf8')
const pagesLive = existsSync(path.join(ROOT, '.github/workflows/deploy.yml'))
const m = gas.match(/var LEGACY_LOOK_TENANT = \{([^}]*)\}/)
let failed = 0
const bad = (s) => { failed++; console.log(`  ⛔ ${s}`) }
const ok = (s) => console.log(`  ✅ ${s}`)

console.log('\nThe legacy look table dies at LS\'s cutover')
if (!pagesLive) {
  if (m || /LEGACY_LOOK_TENANT/.test(gas)) bad('Lafayette Square has cut over (.github/workflows/deploy.yml is gone) but apps-script/Code.js still has LEGACY_LOOK_TENANT — delete it, and resolveTenant\'s look argument with it')
  else ok('LS has cut over and the table is gone')
} else if (!m) {
  bad('LS production still deploys from main (.github/workflows/deploy.yml) but apps-script/Code.js has no LEGACY_LOOK_TENANT — LS production would be refused')
} else {
  const entries = [...m[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)].map(([, look, id]) => [look, id])
  const lsId = JSON.parse(readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/town-id.json'), 'utf8')).townId
  if (entries.length !== 1 || entries[0][0] !== 'lafayette-square') bad(`the table must hold only 'lafayette-square'; it holds [${entries.map(e => e[0]).join(', ')}] — another town is being keyed by its name again`)
  else if (entries[0][1] !== lsId) bad(`'lafayette-square' translates to ${entries[0][1]}, but LS's sealed id is ${lsId}`)
  else ok(`LS production still deploys from main; the table is its one entry → ${lsId}`)
}
console.log(failed ? `\n${failed} FAILED` : '\nall held')
process.exit(failed ? 1 : 0)
