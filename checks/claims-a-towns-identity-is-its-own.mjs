#!/usr/bin/env node
/**
 * claims-a-towns-identity-is-its-own.mjs — IS HOW A TOWN LOOKS AUTHORED IN ONE PLACE, AND CARRIED WHOLE?
 *
 * ⭐ The town's identity (mark, accent, rating mark, lit tint) is the Look's `design.json` `identity` block
 * (src/lib/townIdentity.js), baked into `scene.json` and published in the manifest's `look`. Asserts, per Look:
 *   · its identity block is well-formed (the module's own validator — a malformed channel is named);
 *   · its baked scene.json carries exactly that block — ABSENT (baked before the identity block) or STALE is a failure,
 *     never a pass: the manifest would publish neutral values the town did not choose;
 *   · ⛔ OLD PLAYER ONLY, UNTIL CUTOVER (Warden, 2026-09-28): the town's instance `branding.mark` is a copy the frozen old
 *     player still reads. It must EQUAL the Look's mark — the Look is the source, the copy follows — so the two cannot
 *     drift. The copy (and `markSvg`) is deleted when the new Ward cuts over;
 *   · no instance file carries any other identity channel (accent, litTint belong to the Look).
 * ⭐ MUTATION-TESTED EVERY RUN: one town's mark is flipped in memory and the drift test must then fail.
 *
 *   node checks/claims-a-towns-identity-is-its-own.mjs
 * Read-only. Exit 1 on a failure.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateIdentity, resolveIdentity, IDENTITY_CHANNELS, MARK_STYLES } from '../src/lib/townIdentity.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { registeredMaps, instanceForMap } = await import(join(ROOT, 'src/instances/registry.js'))
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

// A retired scene declares it in its own directory (cartograph/data/<scene>/RETIRED.md — the kit's convention, not a
// list here). Its Look is not a town's: reported, never judged.
const index = readJson('public/looks/index.json').looks
const isRetired = (scene) => !!scene && existsSync(join(ROOT, 'cartograph/data', scene, 'RETIRED.md'))
const retired = index.filter((l) => isRetired(l.scene ?? l.id)).map((l) => l.id)
const looks = index.map((l) => l.id).filter((id) => !retired.includes(id))
const fails = []
const identities = {}
for (const id of looks) {
  const p = `public/looks/${id}/design.json`
  if (!existsSync(join(ROOT, p))) continue
  let block
  try { block = validateIdentity(readJson(p).identity, p) } catch (e) { fails.push(e.message); continue }
  identities[id] = block
  const s = `public/baked/${id}/scene.json`
  if (!existsSync(join(ROOT, s))) continue                       // not baked at all: nothing published to disagree
  const baked = readJson(s).identity
  if (baked === undefined) fails.push(`${s} predates the identity block — re-bake the scene (node cartograph/bake-scene.js --look=${id})`)
  else if (JSON.stringify(baked) !== JSON.stringify(block)) fails.push(`${s} carries ${JSON.stringify(baked)} but the Look authors ${JSON.stringify(block)} — re-bake the scene`)
}

// The instance side: the old player's copy of the mark, and nothing else of the Look's.
const drift = (maps, markOf) => {
  const out = []
  for (const town of maps) {
    if (!(town in identities)) continue                          // a town with no Look of its own is claims-every-town-has-a-mark's
    const copy = markOf(town) ?? null, source = identities[town].mark ?? null
    if (copy !== source) out.push(`town "${town}"'s instance branding.mark ${JSON.stringify(copy)} ≠ the Look's identity.mark ${JSON.stringify(source)} — the Look is the source; make the copy follow it`)
  }
  return out
}
const maps = registeredMaps().filter((m) => !isRetired(m))
const markOf = (t) => instanceForMap(t)?.branding?.mark
fails.push(...drift(maps, markOf))
const others = IDENTITY_CHANNELS.filter((k) => k !== 'mark')
const keysIn = (o, path = '', out = []) => {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.push([k, path + k]); keysIn(v, path + k + '.', out) }
  return out
}
for (const town of maps) {
  for (const [k, at] of keysIn(instanceForMap(town))) if (others.includes(k)) fails.push(`town "${town}"'s instance carries ${at} — an identity channel belongs to the Look's design.json identity block`)
}

// Mutation: flip one town's copy of its mark; the drift test must catch it.
const victim = maps.find((t) => t in identities)
const caught = victim && drift([victim], () => (markOf(victim) === '🧪' ? '🔬' : '🧪')).length === 1
if (!caught) fails.push(`MUTATION NOT CAUGHT: flipping ${victim ?? '(no town with a Look)'}'s mark did not fail the drift test — the check is blind`)

// ⭐ MARK STYLE (Jacob, 2026-09-29; Boz: "a validator nobody has seen fail is a claim, not a check"). Every run:
//   · a value outside MARK_STYLES is REFUSED by name (an unknown style must never reach the Ward's ◉);
//   · every allowed value is accepted;
//   · the RETIRED values ('colour', 'white' — c894a485, superseded by Jacob's final) are refused by name;
//   · an UNCHOSEN style is REPORTED — markStyleAuthored: false beside the neutral — never a silent 'engraved'.
let refusedUnknown = false
try { validateIdentity({ markStyle: 'sepia' }, 'mutation') } catch (e) { refusedUnknown = /markStyle/.test(e.message) }
if (!refusedUnknown) fails.push('MUTATION NOT CAUGHT: identity.markStyle = "sepia" was accepted — an unknown mark style must be refused by name')
for (const old of ['colour', 'white']) {
  let refused = false
  try { validateIdentity({ markStyle: old }, 'retired') } catch (e) { refused = /markStyle/.test(e.message) }
  if (!refused) fails.push(`the retired markStyle "${old}" was accepted — it must be refused by name (the ruled values are ${MARK_STYLES.join(' | ')})`)
}
for (const v of MARK_STYLES) { try { validateIdentity({ markStyle: v }, 'check') } catch (e) { fails.push(`markStyle "${v}" is a ruled value but was refused: ${e.message}`) } }
const unchosen = resolveIdentity({})
if (unchosen.markStyleAuthored !== false) fails.push(`an unchosen markStyle resolves with markStyleAuthored ${JSON.stringify(unchosen.markStyleAuthored)} — it must be reported (false), never a silent '${unchosen.markStyle}'`)
const chosen = resolveIdentity({ markStyle: 'colored' })
if (chosen.markStyle !== 'colored' || chosen.markStyleAuthored !== true) fails.push(`a chosen markStyle "colored" resolves as ${JSON.stringify({ v: chosen.markStyle, a: chosen.markStyleAuthored })}`)
console.log(`   markStyle: unknown value ${refusedUnknown ? 'refused ✓' : 'ACCEPTED'} · unchosen ${unchosen.markStyleAuthored === false ? 'reported ✓' : 'NOT reported'}`)

if (retired.length) console.log(`   retired (their own RETIRED.md), not towns: ${retired.join(', ')}`)
console.log(`Looks ${Object.keys(identities).length} · towns ${maps.length} · authored: ${Object.entries(identities).map(([k, v]) => `${k}{${Object.keys(v).join(',') || '—'}}`).join(' ')}`)
console.log(`   mutation (flip ${victim}'s mark) ${caught ? 'caught ✓' : 'NOT caught'}`)
for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? '\n⛔ FAIL' : '\n✅ PASS — every town\'s identity is its Look\'s, carried whole')
process.exit(fails.length ? 1 : 0)
