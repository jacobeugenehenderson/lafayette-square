#!/usr/bin/env node
/**
 * "DOES EVERY ENTRY IN THE APPS SCRIPT'S LOOK → TENANT TABLE STILL HAVE A LIVE PLAYER WAITING ON IT?"
 *
 * WHY (Jacob, 2026-10-04). Every client names its town by its sealed id (`tenant`). A player already live that
 * predates that still sends `look=<map>`, so the Apps Script translates those looks (`LEGACY_LOOK_TENANT`). Jacob
 * approved it on condition each entry is deleted when its town stops serving such a player, and that something fails
 * if one outlives it. A translation table is how a fallback grows back: an entry nothing needs is a town keyed by its
 * name again.
 *
 * Each entry's comment names what it waits on, and that is what is measured:
 *   · `until: LS's cutover` — Lafayette Square's player on `main`. The signal is the one BRIEF-ls-cutover-to-its-address
 *     step 6 retires: `.github/workflows/deploy.yml`, the GitHub Pages deploy that serves `main`.
 *   · `until: host <domain> is re-promoted` — a town promoted with a Ward build older than the Ward's first
 *     tenant-sending commit. Its production record is read live (`<assets>/hosts/<domain>.json`); once it was
 *     promoted after that commit, its player sends `tenant` and the entry must go. ⛔ An unreadable record fails —
 *     it is never taken as "still needed".
 *   · anything else fails: an entry must say what it waits on.
 * And every entry maps to that town's sealed id.
 *
 *   node checks/claims-the-legacy-look-table-dies-at-ls-cutover.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const ASSETS = 'https://assets.theward.online/'
// The Ward's first commit that sends `tenant` (theward-player 954da7b). A promote after it pins a tenant-sending build.
const WARD_SENDS_TENANT_SINCE = Date.parse('2026-10-04T01:13:35-05:00')

const gas = readFileSync(path.join(ROOT, 'apps-script/Code.js'), 'utf8')
const m = gas.match(/var LEGACY_LOOK_TENANT = \{([^}]*)\}/)
let failed = 0
const bad = (s) => { failed++; console.log(`  ⛔ ${s}`) }
const ok = (s) => console.log(`  ✅ ${s}`)
const sealedId = (map) => {
  const f = path.join(ROOT, 'cartograph/data', map, 'town-id.json')
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).townId : null
}

console.log('\nEvery legacy look still has a live player waiting on it')
if (!m) {
  if (existsSync(path.join(ROOT, '.github/workflows/deploy.yml'))) bad('LS production still deploys from main (.github/workflows/deploy.yml) but apps-script/Code.js has no LEGACY_LOOK_TENANT — LS production would be refused')
  else ok('no legacy table, and nothing needs one')
} else {
  const entries = [...m[1].matchAll(/'([^']+)'\s*:\s*'([^']+)',?[ \t]*(?:\/\/[ \t]*(.*))?/g)].map(([, look, id, why]) => ({ look, id, why: (why || '').trim() }))
  for (const e of entries) {
    const sealed = sealedId(e.look)
    if (e.id !== sealed) { bad(`'${e.look}' translates to ${e.id}, but its sealed id is ${sealed}`); continue }
    if (/^until: LS's cutover\b/.test(e.why)) {
      if (existsSync(path.join(ROOT, '.github/workflows/deploy.yml'))) ok(`'${e.look}': LS production still deploys from main`)
      else bad(`'${e.look}': Lafayette Square has cut over (.github/workflows/deploy.yml is gone) — delete its entry`)
      continue
    }
    const host = e.why.match(/^until: host ([a-z0-9.-]+) is re-promoted\b/)?.[1]
    if (!host) { bad(`'${e.look}' says nothing the check can measure ("${e.why}") — every entry names what it waits on`); continue }
    let rec = null
    try { const r = await fetch(`${ASSETS}hosts/${host}.json`, { cache: 'no-store' }); if (r.ok) rec = await r.json() } catch {}
    if (!rec) { bad(`'${e.look}': could not read ${host}'s production record — cannot tell whether it is still needed`); continue }
    if (rec.look !== e.look) { bad(`'${e.look}': ${host} now serves look "${rec.look}" — the entry waits on nothing`); continue }
    if (Date.parse(rec.promotedAt) > WARD_SENDS_TENANT_SINCE) bad(`'${e.look}': ${host} was re-promoted ${rec.promotedAt}, after the Ward began sending tenant — delete its entry`)
    else ok(`'${e.look}': ${host} still serves the Ward build promoted ${rec.promotedAt}, which sends look`)
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall held')
process.exit(failed ? 1 : 0)
