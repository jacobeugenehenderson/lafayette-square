#!/usr/bin/env node
/**
 * Is there any way to write commercial state without GAS saying yes?
 *
 * `commerce_items` / `commerce_places` carry no write policy (migration 018), so
 * the ONLY door is the `commerce-write` edge function, which asks GAS whether
 * the device hash holds the `menu` permission. That is a security posture, not a
 * behaviour — there is no Deno or Postgres here to run it against — so it is
 * checked by reading the source for the properties that must hold.
 *
 * ⛔ Every assertion is about a way the gate could be REMOVED by a later edit
 * that still builds, still passes every other check, and still looks correct in
 * review. That is the only kind of regression this file can catch, and the only
 * kind likely to happen.
 *
 *   node scratch/claims-commerce-write-gate.mjs
 */
import { readFileSync } from 'node:fs'
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const FN = 'cary/supabase/functions/commerce-write/index.ts'
const GAS = 'apps-script/Code.js'
const MIGRATION = 'cary/supabase/migrations/018_commerce_menu.sql'
const CLIENT = ['src/lib/commerceApi.js', 'src/hooks/useCommerce.js', 'src/components/PlaceCard.jsx', 'src/lib/commerce.js']

const fails = []
const ok = []
const assert = (cond, label, why) => (cond ? ok : fails).push(cond ? label : `${label} — ${why}`)

// ── 1. The gate runs BEFORE any write ──────────────────────────────────────
const fn = read(FN)
const gateAt = fn.indexOf('await mayEditMenu(')
const firstWrite = Math.min(...['sb.from(', '.upsert(', '.insert('].map(t => { const i = fn.indexOf(t); return i === -1 ? Infinity : i }))
assert(gateAt !== -1, 'gate is called', 'commerce-write never calls mayEditMenu')
assert(gateAt !== -1 && gateAt < firstWrite, 'gate precedes every write',
  'a write appears before the guardianship check — an authorization check after the write is not one')

// ── 2. mayEditMenu fails closed on every path ──────────────────────────────
const body = fn.slice(fn.indexOf('async function mayEditMenu'), fn.indexOf('Deno.serve'))
const returnsTrue = [...body.matchAll(/return\s+([^\n;]+)/g)].map(m => m[1].trim())
// The only permissive return allowed is the one that reads GAS's own answer.
const badTrue = returnsTrue.filter(r => r === 'true' || /^body\?\.\w+\s*!==/.test(r))
assert(badTrue.length === 0, 'no unconditional allow', `mayEditMenu can return ${badTrue.join(', ')} without asking GAS`)
assert(/catch[\s\S]*return false/.test(body), 'unreachable GAS denies',
  'a network failure does not return false — "could not reach the authority, so allowed" is the one outcome forbidden')
assert(/if\s*\(!base \|\| !secret\) return false/.test(body), 'missing secrets deny',
  'an unconfigured function does not deny')
assert(/if\s*\(!res\.ok\) return false/.test(body), 'non-200 denies', 'a GAS error response is not treated as a denial')

// ── 3. The GAS oracle itself fails closed ──────────────────────────────────
const gas = read(GAS)
const oracle = gas.slice(gas.indexOf('function getGuardianCheck'), gas.indexOf('function getGuardianCheck') + 1400)
assert(oracle.length > 100, 'guardian-check exists', 'getGuardianCheck is missing from Code.js')
assert(/if\s*\(!expected \|\| secret !== expected\)/.test(oracle), 'oracle requires the shared secret',
  'guardian-check does not fail closed when COMMERCE_SHARED_SECRET is unset — an unconfigured deployment becomes an open oracle')
assert(/staffHasPermission\(/.test(oracle), 'oracle reuses staffHasPermission',
  'guardian-check rolls its own permission logic instead of reusing the one that resolves linked hashes')

// ── 4. No client-side direct write ─────────────────────────────────────────
for (const rel of CLIENT) {
  const src = read(rel)
  const direct = /\.from\(\s*['"]commerce_(items|places|item_events)['"]\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/.test(src)
  assert(!direct, `no direct write in ${rel}`, 'writes commerce tables directly, bypassing the guardianship gate')
}

// ── 5. The migration grants no write, and declares no write policy ─────────
const sql = read(MIGRATION)
assert(!/create policy[^;]*for\s+(insert|update|delete|all)/i.test(sql), 'no write policy exists',
  'a write policy was added — anon or authenticated can now write without GAS')
assert(/revoke\s+insert,\s*update,\s*delete\s+on\s+commerce_items/i.test(sql), 'write verbs revoked on commerce_items', 'the grant-level lock is gone')
assert(/revoke\s+all\s+on\s+commerce_item_events/i.test(sql), 'audit table fully revoked', 'the audit table is reachable by anon/authenticated')

// ── 6. tax_remitter is not guardian-settable ───────────────────────────────
assert(!/patch\.tax_remitter\s*=/.test(fn) && !/tax_remitter:\s*body\./.test(fn), 'tax_remitter not settable',
  'the edge function lets a guardian set tax_remitter — that is a legal determination pending the DOR ruling, not a restaurant setting')

console.log('commerce write-path gate')
for (const o of ok) console.log('  PASS  ' + o)
for (const f of fails) console.log('  FAIL  ' + f)
console.log(`\n${fails.length === 0 ? `PASS — ${ok.length} properties hold; there is no write path that skips GAS` : `FAIL — ${fails.length} of ${ok.length + fails.length}`}`)
process.exit(fails.length === 0 ? 0 : 1)
