#!/usr/bin/env node
/**
 * claims-two-listings-are-not-one-place — no two listings share an address AND a phone.
 *
 * ⛔⛔ A DIRECTORY THAT LISTS ONE PLACE TWICE IS WRONG IN A WAY NOBODY REPORTS. The map
 * looks full, the Society Pages look busy, and a visitor is sent to a business that closed
 * three years ago. Nothing errors, nothing is missing, and the town looks better stocked
 * than it is — which is the plausible-looking success `CLAUDE.md` Layer 0 q2 names as the
 * worst available outcome.
 *
 * ⭐ TWO FIELDS WE ALREADY HAVE CATCH FOUR DIFFERENT KINDS OF WRONG. Found 2026-09-22 by a
 * research agent noticing two pizzerias with one phone number; running the same test over
 * all 285 of huron's listings returned SEVEN pairs, and they are not one defect:
 *   · the same place listed twice        — Holiday Harbor Marina ↔ Holiday Harbor Marina
 *   · SUCCESSIVE TENANTS at one address  — Huron Iga ↔ Cornell's Foods · Emmie.Styled ↔ Corner Cuts
 *                                          (Wink's Pizza ↔ Bruno's Pizzeria — and the unit now
 *                                           trades as a THIRD name, so both listings are dead)
 *   · a PRODUCT listed as a business     — Shell ↔ Blue Rhino Propane Exchange · Blimpie ↔ Blue Rhino
 *   · a PERSON beside their practice     — NOMS Family Practice ↔ Christopher Emery
 *
 * ⛔ THIS CHECK DOES NOT RULE ON WHICH IS WHICH, and must not start. "Two tenants" and "a
 * product sold on the forecourt" are the operator's call, made through the ONE mechanism the
 * bake has for "these listings are one place" (cartograph/listing-places.js; Boz, 2026-10-30):
 * `places.merge` in `content/listings.overrides.json` absorbs the listing that should not exist
 * into the one that should (a dead tenant, a product, a person into their practice; any names),
 * and `places.apart` says two places really share the address and phone. A pair the operator
 * marked apart is answered here; an absorbed listing is gone from the next bake. The check's job
 * is to make an unanswered collision impossible to not see.
 *
 * ⭐ It runs over every town's listings on disk, so a town nobody has opened is checked by
 * the same command — and the test needs no new data, only the `address` and `phone` the
 * intake already collects.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'cartograph/data')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nNo two listings are one place')

const scenes = existsSync(DATA)
  ? readdirSync(DATA, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : []
if (!scenes.length) bad(`no scenes under ${DATA} — nothing measured`)

// ⛔ Normalise before comparing, or "Rd E" and "Rd East" and "+1419…" hide the collision.
// Both of those are REAL in huron's data and both would have slipped a naive compare.
const normAddr = (s) => String(s || '').toLowerCase()
  .replace(/\b(east|e)\b/g, 'e').replace(/\b(west|w)\b/g, 'w')
  .replace(/\b(north|n)\b/g, 'n').replace(/\b(south|s)\b/g, 's')
  .replace(/\b(road|rd)\b/g, 'rd').replace(/\b(street|st)\b/g, 'st')
  .replace(/\b(avenue|ave)\b/g, 'ave').replace(/[.,]/g, '')
  .replace(/\s+/g, ' ').trim()
const normPhone = (s) => String(s || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')

let scanned = 0
for (const scene of scenes) {
  const p = path.join(DATA, scene, 'content/listings.json')
  if (!existsSync(p)) continue
  let raw
  try { raw = JSON.parse(readFileSync(p, 'utf8')) } catch (e) { bad(`${scene}: listings.json unreadable (${e.message})`); continue }
  const listings = Array.isArray(raw) ? raw : (raw.listings || raw.landmarks || [])
  if (!listings.length) continue
  scanned++

  const byKey = new Map()
  for (const l of listings) {
    const a = normAddr(l.address), ph = normPhone(l.phone)
    if (!a || !ph) continue                       // ⛔ a missing field is not a collision
    const k = `${a}|${ph}`
    byKey.set(k, [...(byKey.get(k) || []), l])
  }
  // the operator's answer: a pair marked apart, by source key or id (listing-places.js names them the same way)
  const ov = path.join(DATA, scene, 'content/listings.overrides.json')
  const apart = new Set((existsSync(ov) ? JSON.parse(readFileSync(ov, 'utf8')).places?.apart || [] : []).map((p) => [...p].sort().join('|')))
  const refOf = (l) => [l.source_key, l.id].filter(Boolean)
  const answered = (a, b) => refOf(a).some((x) => refOf(b).some((y) => apart.has([x, y].sort().join('|'))))
  const collisions = [...byKey.values()].filter((v) => v.length > 1 && v.some((a, i) => v.slice(i + 1).some((b) => !answered(a, b))))
  if (!collisions.length) { ok(`${scene}: ${listings.length} listings, no address+phone collision`); continue }
  bad(`${scene}: ${collisions.length} address+phone collision(s) among ${listings.length} listings — `
    + `each is one place listed twice, two tenants, a product, or a person beside their practice:`)
  for (const c of collisions) {
    console.log(`       ${c[0].address} · ${c[0].phone}`)
    for (const l of c) console.log(`         ${l.id}  ${l.name}`)
  }
  console.log(`     ▶ resolve in cartograph/data/${scene}/content/listings.overrides.json `
    + `(\`places.merge\` for one place listed twice or a listing that should not exist, \`places.apart\` for two places).`)
}
if (scanned === 0) bad('no scene has a content/listings.json — nothing measured')

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : `\n✅ ${scanned} town(s): no listing is another listing\n`)
process.exit(failed ? 1 : 0)
