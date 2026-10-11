#!/usr/bin/env node
/**
 * claims-a-town-shares-its-own-picture — a shared link shows the town's own picture, at the time of day it is
 * opened there (BRIEF-share-image-by-time-of-day §5).
 *
 *   1. Every town that publishes has a share image for every slot, in its slab. The slots are read from
 *      src/lib/shareCard.js#SHARE_IMAGE_RELS and the files from public/baked/<town>/, never restated.
 *      Red until the town's set is captured in Stage; the same red is what Publish refuses on (cartograph/serve.js).
 *   2. The Workers' slot IS the kit's slot, for every registered town at instants sampled across a year, including
 *      each slot's own minute and the minutes either side of every hand-over between slots. Where the kit's
 *      playhead names a slot (animatedParam.js#todSlotAtMinute), the card names the same; everywhere, the card's
 *      slot is the one whose kit minute (getTodSlotMinutes) is nearest. Both Workers get their card from
 *      shareCard.js#cardFor and hold no slot logic of their own.
 *   3. No kit or Worker file names a town's share image: no `og-preview.jpg`, no `ogImage`.
 * Mutations, run every time: (1) one slot's file missing → red naming the town and slot; (2) a fixed-hour slot
 * table in place of the kit's → red; (3) an `ogImage` line in a scanned file → red.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { SHARE_IMAGE_RELS, shareSlotAt } from '../src/lib/shareCard.js'
import { TOD_SLOT_IDS } from '../src/lib/todSlots.js'
import { setTownPlace } from '../src/lib/townPlace.js'
import { townMinuteOf } from '../src/lib/townClock.js'
import { getTodSlotMinutes, todSlotAtMinute } from '../src/cartograph/animatedParam.js'
import { registeredMaps, instanceForMap } from '../src/instances/registry.js'

const ROOT = path.resolve(import.meta.dirname, '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

// ── 1. Every publishing town has its set ─────────────────────────────────────────────────────────────────────────
console.log('\n1. every town that publishes has a share image for every time of day')
const missingShare = (town, has) => SHARE_IMAGE_RELS.filter((rel) => !has(rel)).map((rel) => `${town}: ${rel}`)
const looks = JSON.parse(readFileSync(path.join(ROOT, 'public/looks/index.json'), 'utf8')).looks || []
const towns = looks.filter((l) => l.scene === l.id && existsSync(path.join(ROOT, 'public/baked', l.id))).map((l) => l.id)
if (!towns.length) bad('no town has a slab on disk — nothing to read')
for (const t of towns) {
  const miss = missingShare(t, (rel) => existsSync(path.join(ROOT, 'public/baked', t, rel)))
  if (miss.length === SHARE_IMAGE_RELS.length) bad(`"${t}" has no share images — press Capture share images in Stage`)
  else if (miss.length) bad(`"${t}" is missing ${miss.map((m) => m.split(': ')[1]).join(', ')}`)
  else ok(`"${t}" has all ${SHARE_IMAGE_RELS.length}`)
}
{ // mutation: a full set with one slot taken away
  const gone = SHARE_IMAGE_RELS[3]
  const miss = missingShare('mutant', (rel) => rel !== gone)
  if (miss.length === 1 && miss[0] === `mutant: ${gone}`) ok(`mutation (one slot's file deleted) is caught, by town and slot: ${miss[0]}`)
  else bad(`mutation (deleted ${gone}) not caught: ${JSON.stringify(miss)}`)
}

// ── 2. The Workers' slot is the kit's ────────────────────────────────────────────────────────────────────────────
console.log('\n2. the share card\'s slot is the kit\'s slot, across a year')
function compare(picker) {
  const wrong = []
  let n = 0
  for (const map of registeredMaps()) {
    const g = instanceForMap(map).geography
    setTownPlace(g, map)
    const manifest = { town: map, identity: { geography: g } }
    for (let day = 0; day < 365; day += 9) {
      const noon = new Date(Date.UTC(2026, 0, 1, 12) + day * 86400000)
      const kit = getTodSlotMinutes(noon)
      const present = TOD_SLOT_IDS.filter((id) => kit[id] != null).map((id) => ({ id, m: kit[id] })).sort((a, b) => a.m - b.m)
      const probes = []
      for (let m = 0; m < 1440; m += 7) probes.push(m)
      present.forEach((s, i) => {
        const next = present[(i + 1) % present.length]
        const gap = ((next.m - s.m) + 1440) % 1440
        const mid = s.m + gap / 2
        probes.push(s.m, mid - 0.5, mid + 0.5)
      })
      for (const raw of probes) {
        const minute = ((raw % 1440) + 1440) % 1440
        const at = new Date(noon.getTime() + (minute - townMinuteOf(noon)) * 60000)
        const mins = getTodSlotMinutes(at), m = townMinuteOf(at)
        const dist = (id) => { const d = Math.abs(mins[id] - m); return Math.min(d, 1440 - d) }
        const ids = TOD_SLOT_IDS.filter((id) => mins[id] != null)
        const nearest = Math.min(...ids.map(dist))
        const got = picker(manifest, at)
        const parked = todSlotAtMinute(m, at)
        n++
        if (got == null || dist(got) !== nearest) wrong.push(`${map} ${at.toISOString()}: card ${got}, kit's nearest ${ids.find((id) => dist(id) === nearest)}`)
        else if (parked && parked !== got) wrong.push(`${map} ${at.toISOString()}: card ${got}, kit's playhead ${parked}`)
      }
    }
  }
  return { n, wrong }
}
const real = compare(shareSlotAt)
if (real.wrong.length) bad(`${real.wrong.length} of ${real.n} instants differ, e.g.\n       ${real.wrong.slice(0, 4).join('\n       ')}`)
else ok(`${real.n} instants, ${registeredMaps().length} towns: the card names the kit's slot every time`)
{ // mutation: a fixed-hour table, the second copy this forbids
  const HOURS = [[5, 'dawn'], [6, 'sunrise'], [11, 'noon'], [17, 'golden'], [19, 'sunset'], [20, 'dusk'], [21, 'night'], [24, 'deep']]
  const fixed = (manifest, at) => {
    const h = new Date(at.toLocaleString('en-US', { timeZone: manifest.identity.geography.timezone })).getHours()
    return HOURS.find(([end]) => h < end)?.[1] ?? 'deep'
  }
  const mut = compare(fixed)
  if (mut.wrong.length) ok(`mutation (fixed-hour slot table) is caught: ${mut.wrong.length} of ${mut.n} instants differ`)
  else bad('mutation (fixed-hour slot table) passed — the comparison cannot tell the kit\'s slot from a copy')
}
for (const w of ['workers/staging-sites/src/index.js', 'workers/production-sites/src/index.js']) {
  const src = readFileSync(path.join(ROOT, w), 'utf8')
  if (!/import \{ cardFor \} from '\.\.\/\.\.\/\.\.\/src\/lib\/shareCard\.js'/.test(src)) bad(`${w} does not take its card from src/lib/shareCard.js#cardFor`)
  else if (/suncalc|SunCalc|'(sunrise|sunset|golden|dusk|dawn)'/.test(src)) bad(`${w} holds slot logic of its own`)
  else ok(`${w} takes its card from cardFor and holds no slot logic`)
}

// ── 3. No file names a town's share image ────────────────────────────────────────────────────────────────────────
console.log('\n3. no kit or Worker file names a town\'s share image')
const NAMED = /og-preview\.jpg|\bogImage\b/
const scan = (files, read) => files.filter((f) => NAMED.test(read(f)))
const CODE = /\.(m?js|jsx|html)$/
function* walk(rel, deep) {
  for (const name of readdirSync(path.join(ROOT, rel))) {
    const r = `${rel}/${name}`
    if (name === 'node_modules' || name.startsWith('.')) continue
    if (statSync(path.join(ROOT, r)).isDirectory()) { if (deep) yield* walk(r, deep) } else if (CODE.test(name)) yield r
  }
}
const files = ['index.html', ...['src', 'workers', 'scripts'].flatMap((d) => [...walk(d, true)]), ...walk('cartograph', false)]
const hits = scan(files, (f) => readFileSync(path.join(ROOT, f), 'utf8'))
if (hits.length) bad(`named in ${hits.join(', ')}`)
else ok(`${files.length} files, none names one`)
if (existsSync(path.join(ROOT, 'public/photos/og-preview.jpg'))) bad('public/photos/og-preview.jpg exists — the shared image is back')
else ok('public/photos/og-preview.jpg is gone')
if (scan(['mutant.js'], () => "  branding: { ogImage: 'x' },").length === 1) ok('mutation (an ogImage line) is caught')
else bad('mutation (an ogImage line) passed')

console.log(failed ? `\n⛔ ${failed} failure(s)` : '\n✅ all passed')
process.exit(failed ? 1 : 0)
