#!/usr/bin/env node
/**
 * The GAS backend's real shape, READ FROM SOURCE — never restated.
 *
 * `backend/schema.json` used to carry a hand-maintained copy of this and rotted
 * into describing a backend that does not exist (a `Businesses` tab that was
 * renamed `Listings`; `Buildings`/`Categories`/`CommunityPosts` that Code.js
 * never opens; 9 real tabs undocumented). A copy of a source list cannot be kept
 * true. This parses `apps-script/Code.js` instead, so it cannot go stale.
 *
 *   node checks/claims-gas-schema.mjs
 */
import { readFileSync } from 'node:fs'

const SRC = 'apps-script/Code.js'
const src = readFileSync(new URL(`../${SRC}`, import.meta.url), 'utf8')

const tabs = new Map()
for (const m of src.matchAll(/getSheet\('([A-Za-z]+)'\)/g)) {
  tabs.set(m[1], (tabs.get(m[1]) || 0) + 1)
}

const listBlock = (name) => {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`))
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : []
}
const mapBlock = (name) => {
  const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\s*\\}`))
  return m ? [...m[1].matchAll(/(\w+):\s*'([^']+)'/g)].map(x => `${x[1]} -> ${x[2]}`) : []
}

const out = (label, rows) => {
  console.log(`\n${label} (${rows.length})`)
  for (const r of rows) console.log('  ' + r)
}

console.log(`GAS backend shape — parsed from ${SRC} @ ${new Date().toISOString().slice(0, 10)}`)
out('Sheet tabs opened', [...tabs].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}  (${n} call${n > 1 ? 's' : ''})`))
out('Listing fields a guardian may edit (EDITABLE)', listBlock('EDITABLE'))
out('Client shorthand -> sheet column (JSON_FIELD_MAP)', mapBlock('JSON_FIELD_MAP'))
out('Staff-permission-gated columns (STAFF_PERM_MAP)', mapBlock('STAFF_PERM_MAP'))
out('Stripped before the listing leaves the server', [...src.matchAll(/delete out\.(\w+)/g)].map(m => m[1]))
console.log('\nLive prose homes: ls/reference/INVENTORY-API.md (endpoints) · ls/reference/INVENTORY-DATA.md (data sources).')
