#!/usr/bin/env node
/**
 * "DOES EVERY BUILDING CARRY THE ADDRESS ITS TOWN'S INPUTS GIVE IT — AND IS A MISSING ONE SAID, NEVER GUESSED?"
 *
 * WHY (Jacob, 2026-09-29: "I think we need addresses… that's barely private"; Boz's rulings). The slab carries each
 * building's street address (cartograph/building-address.mjs → buildings.json `address`, `addressSource`,
 * `addressCandidates`, and the manifest's `addressCensus`). The Ward's card and "This is my house" read it.
 *
 * Two halves:
 *   A. THE RULES, on fixtures, every run: authored > osm-building (own, then twins) > osm-poi-in-footprint; a lower source
 *      never overwrites (its disagreement is counted); several different → null + candidates, never one picked; an address
 *      point is joined by CONTAINMENT only — one a metre outside is not the building's; the source's words, whitespace
 *      collapsed, nothing expanded; an offered-but-missing address is counted LOST.
 *   B. THE CENSUS, per town, from its slab. RED for each building without an address, in three named classes:
 *        · LOST       — the input offers one (containment) and the bake did not carry it: the JOIN's defect
 *        · incomplete — the pour predates the OSM twin join; the bake says to re-pour
 *        · none       — the input offers none: the town needs an address source (county points, its own record)
 *        · ambiguous  — the inputs disagree; the candidates are carried, none picked
 *      A slab baked before addresses is red with "re-bake". Honest red is the deliverable; nothing is skipped.
 * ⛔ Mutation-tested 2026-09-29: picking the first of several candidates → A red; joining an address point by nearest
 *    instead of containment → A red; the census not counting lost → A red.
 *
 * Usage: node checks/claims-every-building-has-an-address.mjs [<town> …]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { resolveAddress, addressCensus, addressOfTags, offeredBy } from '../cartograph/building-address.mjs'

const fails = []
const sq = (x, z, s = 5) => [{ x, z }, { x: x + s, z }, { x: x + s, z: z + s }, { x, z: z + s }]
const eq = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`rule: ${what} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
const tags = (n, s) => ({ 'addr:housenumber': n, 'addr:street': s })

// ── A. The rules ────────────────────────────────────────────────────────────
const ring = [sq(0, 0)]
const poiIn = [{ address: '9 Inside Street', x: 2, z: 2 }]
eq('authored beats OSM', resolveAddress({ authored: '1732   CHOUTEAU AV', ownTags: tags('5', 'Elm'), rings: ring }, poiIn).address, '1732 CHOUTEAU AV')
eq('whitespace collapsed, words kept', addressOfTags(tags('4', 'Johnson   Street')), '4 Johnson Street')
eq('own OSM beats twin', resolveAddress({ ownTags: tags('5', 'Elm'), twinTags: [tags('7', 'Oak')], rings: ring }, []).address, '5 Elm')
eq('twin beats a point inside', resolveAddress({ twinTags: [tags('7', 'Oak')], rings: ring }, poiIn).address, '7 Oak')
eq('a lower disagreeing source is counted, not applied', (({ address, disagrees }) => ({ address, disagrees }))(resolveAddress({ twinTags: [tags('7', 'Oak')], rings: ring }, poiIn)), { address: '7 Oak', disagrees: true })
const amb = resolveAddress({ twinTags: [tags('7', 'Oak'), tags('9', 'Oak')], rings: ring }, [])
eq('two twins disagree → null + candidates', { a: amb.address, c: amb.addressCandidates }, { a: null, c: ['7 Oak', '9 Oak'] })
eq('a point inside the footprint', resolveAddress({ rings: ring }, poiIn).addressSource, 'osm-poi-in-footprint')
eq('a point one metre OUTSIDE is not the building\'s (never nearest)', resolveAddress({ rings: ring }, [{ address: '1 Next Door', x: 6, z: 2 }]).address, null)
eq('a twin ring counts as the building', resolveAddress({ rings: [sq(0, 0), sq(20, 0)] }, [{ address: '3 Twin Way', x: 22, z: 2 }]).address, '3 Twin Way')
const offer = offeredBy([{ x: 2, z: 2 }])
const cen = addressCensus([{ address: null, addressSource: null, offered: offer(ring), id: 'lost-1' }, { address: '5 Elm', addressSource: 'osm-building', offered: true }])
eq('an offered, uncarried address is LOST', { lost: cen.lost, ids: cen.lostIds }, { lost: 1, ids: ['lost-1'] })

// ── B. The census, per town ─────────────────────────────────────────────────
let towns = []
try { towns = scenes('public/baked/<scene>/buildings.json') } catch (e) { console.error(`⛔ NOT CHECKED — ${e.message}`); process.exit(2) }
for (const t of towns) {
  const m = JSON.parse(readFileSync(join(ROOT, 'public/baked', t, 'buildings.json'), 'utf8'))
  const c = m.addressCensus
  if (!c) { fails.push(`${t}: its slab was baked before addresses — re-bake its buildings`); continue }
  const pct = (n) => `${n}/${c.buildings} (${(100 * n / c.buildings).toFixed(1)}%)`
  const src = Object.entries(c.bySource).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'
  console.log(`  ${t.padEnd(26)} carried ${pct(c.withAddress)} · ${src}${c.disagreements ? ` · ${c.disagreements} lower-source disagreements` : ''}`)
  if (c.incomplete) fails.push(`${t}: INCOMPLETE — ${c.incomplete}`)
  if (c.lost) fails.push(`${t}: ${c.lost} building(s) LOST — the input offers an address the bake did not carry (the join's defect): ${c.lostIds.join(', ')}${c.lost > c.lostIds.length ? ' …' : ''}`)
  const bare = c.none - c.lost
  if (bare > 0) fails.push(`${t}: ${pct(bare)} with no address in any input — the town needs an address source`)
  if (c.ambiguous) fails.push(`${t}: ${c.ambiguous} ambiguous — the inputs disagree; candidates carried, none picked`)
}

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ every building carries the address its inputs give it')
