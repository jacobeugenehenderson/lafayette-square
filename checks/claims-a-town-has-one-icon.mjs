#!/usr/bin/env node
// claims-a-town-has-one-icon.mjs — IS EVERY TOWN'S ICON ITS OWN BAKED LOOK'S MARK, AS A data: URI, FROM ONE SOURCE?
//
// ⭐ THE CLAIM (BRIEF-a-town-has-one-icon; Jacob, 2026-10-31: "Get rid of the arch" · "All kit now"). The icon a
// crawler's share card and a browser tab show is the town's Look `identity.mark`, read from its BAKED manifest when the
// player is published (scripts/towns-record.mjs → towns.json `icon`), drawn by src/lib/townIdentity.js#townIcon as a
// data: URI, and read by the card from that field ALONE (src/lib/shareCard.js#cardFor). Found 2026-10-31 by Ward: LS
// and HPDM served `https://lafayette-square.com/favicon.svg` — the instances' old-player branding — which 404s since
// the .com redirect.
// Four judges, each reading the source of truth rather than restating it:
//   1 · THE SOURCE — publish-towns-record writes the record from towns-record.mjs#buildTownsRecord, and neither file reads the
//       instances' branding, a faviconUrl/markSvg, or the Look's design.json (authoring); towns-record reads the baked
//       manifest's `look` and draws with townIcon.
//   2 · THE RECORD — buildTownsRecord, RUN: every registered town's icon is a data:image/svg+xml URI (never a URL) equal
//       to the icon of ITS OWN baked manifest's look.mark (read here from the manifest), or of its own initial when its
//       baked Look has none, said in `iconFrom`; a town with NO baked manifest has `icon: null` (never an initial); a
//       manifest with no `look` block REFUSES (lookFromManifest throws, "re-bake"); no entry carries
//       faviconUrl/mark/markSvg. ⛔ Nothing baked here = nothing judged = a failure, never a pass.
//   3 · THE CARD — cardFor takes `town.icon` and nothing else: an entry with only the old fields gets no icon, and an
//       unbaked town's card names why it has none (iconWhy → the ward-share-card header).
//   4 · NO INSTANCE CARRIES BRANDING FOR AN ICON — no registered instance's branding names faviconUrl, markSvg or mark.
// ⭐ MUTANTS (--mutants), each must go RED: (a) a URL back in one town's icon → 2 · (b) another town's mark in one town's
// icon → 2 · (c) the instance branding restored as towns.json's source, in publish, instead of or (c2) over the record → 1 · (d) the same, in towns-record →
// 1 · (e) towns-record reading the Look's design.json instead of the bake → 1 · (f) cardFor falling back to faviconUrl →
// 3 · (g) a faviconUrl back in an instance's branding → 4 · (h) a stale manifest drawn as unbaked instead of refused → 2
// · (i) an unbaked town given an icon → 2 (Zob, 2026-10-31: the initial means one thing).
//   node checks/claims-a-town-has-one-icon.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iconFor, initialOf } from '../src/lib/townIdentity.js'
import { buildTownsRecord, lookFromManifest } from '../scripts/towns-record.mjs'
import { cardFor } from '../src/lib/shareCard.js'
import { registeredMaps, instanceForMap } from '../src/instances/registry.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLISH = 'scripts/publish-towns-record.mjs', RECORD = 'scripts/towns-record.mjs'
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const OLD = /\b(faviconUrl|markSvg)\b|\.branding\b|\bbranding\s*[.?]/

// ── 1 · THE SOURCE ───────────────────────────────────────────────────────────
function judgeSource(publish, record) {
  const why = []
  if (!/import \{[^}]*\bbuildTownsRecord\b[^}]*\} from '\.\/towns-record\.mjs'/.test(publish)) why.push(`${PUBLISH} does not import buildTownsRecord from ./towns-record.mjs`)
  if (!/const towns = await buildTownsRecord\(repoRoot\)/.test(publish)) why.push(`${PUBLISH} does not build towns from buildTownsRecord(repoRoot)`)
  if (!/const buf = Buffer\.from\(JSON\.stringify\(towns\b/.test(publish)) why.push(`${PUBLISH} does not publish that record`)
  for (const [f, t] of [[PUBLISH, publish], [RECORD, record]]) {
    const hit = t.split('\n').find((l) => !/^\s*(\/\/|\*)/.test(l) && OLD.test(l))
    if (hit) why.push(`${f} reads the instances' old branding: ${hit.trim().slice(0, 120)}`)
    if (t.split('\n').some((l) => !/^\s*(\/\/|\*)/.test(l) && /design\.json/.test(l))) why.push(`${f} reads a Look's design.json (authoring) — the icon is the BAKED Look's`)
  }
  if (!/'public', 'baked', map, 'manifest\.json'/.test(record) || !/\.look\b/.test(record)) why.push(`${RECORD} does not read the baked manifest's look block`)
  if (!/\btownIcon\(/.test(record)) why.push(`${RECORD} does not draw the icon with townIdentity.js#townIcon`)
  return why
}

// ── 2 · THE RECORD ───────────────────────────────────────────────────────────
const bakedMark = (m) => {
  const p = join(ROOT, 'public/baked', m, 'manifest.json')
  if (!existsSync(p)) return { baked: false }
  return { baked: true, mark: JSON.parse(readFileSync(p, 'utf8')).look?.mark ?? null }
}
function judgeRecord(towns, bakedMark, fromManifest) {
  const why = [], seen = []
  let judged = 0
  let stale
  try { stale = fromManifest('x', { files: {} }) } catch (e) { stale = /re-bake/.test(e.message) ? 'refused' : e.message }
  if (stale !== 'refused') why.push(`a manifest with no look block is not refused by name (lookFromManifest gave ${JSON.stringify(stale)}) — a stale bake would wear the neutral initial`)
  if (fromManifest('x', null)?.baked !== false) why.push('a town with no manifest is not reported as unbaked by lookFromManifest')
  for (const m of registeredMaps()) {
    const t = towns[m]
    if (!t) { why.push(`towns.json has no entry for registered town "${m}"`); continue }
    for (const k of ['faviconUrl', 'mark', 'markSvg']) if (k in t) why.push(`"${m}"'s entry carries ${k} — the old-player branding`)
    const b = bakedMark(m)
    if (!b.baked) {
      if (t.icon != null || !t.iconFrom?.startsWith('not baked')) why.push(`"${m}" has no baked manifest but its entry draws an icon (${JSON.stringify(t.iconFrom)}) — an unbaked town has none; the initial means only "its Look authors no mark"`)
      else seen.push(`${m}: no icon — ${t.iconFrom}`)
      continue
    }
    if (typeof t.icon !== 'string' || !t.icon.startsWith('data:image/svg+xml,')) { why.push(`"${m}"'s icon is ${JSON.stringify(String(t.icon).slice(0, 60))}, not a data:image/svg+xml URI`); continue }
    judged++
    const want = b.mark ? iconFor({ mark: b.mark }) : iconFor({ initial: initialOf(t.title) })
    if (t.icon !== want) why.push(`"${m}"'s icon is not its own baked Look's ${b.mark ? `mark ${b.mark}` : 'initial'} (it draws ${JSON.stringify(decodeURIComponent(t.icon).replace(/^.*<text[^>]*>|<\/text>.*$/g, ''))})`)
    else if ((t.iconFrom === 'look.mark') !== !!b.mark) why.push(`"${m}"'s iconFrom ${JSON.stringify(t.iconFrom)} does not say the rule that drew it`)
    else seen.push(`${m}: ${b.mark ? `mark ${b.mark}` : `initial ${initialOf(t.title)}`} (${t.iconFrom})`)
  }
  if (!judged) why.push('no registered town has a baked manifest in this checkout — nothing was judged (bake, or run where the slabs are)')
  return { why, seen }
}

// ── 3 · THE CARD ─────────────────────────────────────────────────────────────
function judgeCard(card) {
  const why = [], base = { map: 'x', path: '/', manifest: null, slabBase: '', pageUrl: '', when: new Date() }
  const icon = iconFor({ mark: '🦞' })
  if (card({ ...base, town: { title: 'T', icon } }).icon !== icon) why.push('cardFor does not take town.icon')
  const old = card({ ...base, town: { title: 'T', faviconUrl: 'https://lafayette-square.com/favicon.svg', mark: '⚜️', markSvg: 'arch' } }).icon
  if (old != null) why.push(`cardFor still draws an icon from the old fields (${String(old).slice(0, 60)})`)
  const unbaked = card({ ...base, town: { title: 'T', icon: null, iconFrom: 'not baked: no public/baked/T/manifest.json' } })
  if (unbaked.icon != null || !/not baked/.test(unbaked.iconWhy || '')) why.push(`an unbaked town's card does not name its missing icon (icon ${JSON.stringify(unbaked.icon)}, why ${JSON.stringify(unbaked.iconWhy)})`)
  return why
}

// ── 4 · NO INSTANCE BRANDING ────────────────────────────────────────────────
function judgeInstances(instOf) {
  const why = []
  for (const m of registeredMaps()) for (const k of ['faviconUrl', 'markSvg', 'mark']) if (instOf(m)?.branding && k in instOf(m).branding) why.push(`src/instances "${m}" branding.${k} — the old-player branding is deleted; the mark is the Look's`)
  return why
}

const texts = { publish: read(PUBLISH), record: read(RECORD) }
const towns = await buildTownsRecord(ROOT)
const run = (S) => ({ 1: judgeSource(S.publish, S.record), 2: judgeRecord(S.towns, S.bakedMark, S.fromManifest).why, 3: judgeCard(S.card), 4: judgeInstances(S.instOf) })
const S0 = { ...texts, towns, card: cardFor, instOf: instanceForMap, bakedMark, fromManifest: lookFromManifest }

const res = run(S0)
const NAMES = { 1: 'the source', 2: 'the record', 3: 'the card', 4: 'no instance branding' }
let bad = 0
console.log('\nA town has one icon')
for (const s of judgeRecord(towns, bakedMark, lookFromManifest).seen) console.log(`   ${s}`)
for (const [k, why] of Object.entries(res)) {
  if (why.length) { bad++; console.log(`  ⛔ ${k} · ${NAMES[k]}`); for (const w of why) console.log(`       ${w}`) }
  else console.log(`  ✅ ${k} · ${NAMES[k]}`)
}

if (process.argv.includes('--mutants')) {
  const maps = Object.keys(towns)
  const marked = maps.filter((m) => bakedMark(m).mark)
  const [a, b] = marked.filter((m, i) => marked.findIndex((n) => bakedMark(n).mark === bakedMark(m).mark) === i)
  const swap = (m, icon) => ({ ...towns, [m]: { ...towns[m], icon } })
  const MUTANTS = [
    ['a · a URL back', 2, { towns: swap(a, 'https://lafayette-square.com/favicon.svg') }],
    ['b · another town\'s mark', 2, { towns: b ? swap(a, towns[b].icon) : null }],
    ['c · instance branding as the source, in publish', 1, { publish: texts.publish.replace('const towns = await buildTownsRecord(repoRoot)',
      "const towns = {}\n  for (const m of registeredMaps()) { const b = instanceForMap(m).branding || {}; towns[m] = { faviconUrl: b.faviconUrl || null, mark: b.mark || null } }") }],
    ['c2 · instance branding laid over the record, in publish', 1, { publish: texts.publish.replace('const towns = await buildTownsRecord(repoRoot)',
      'const towns = await buildTownsRecord(repoRoot)\n  for (const m in towns) towns[m].faviconUrl = instanceForMap(m).branding.faviconUrl') }],
    ['d · instance branding as the source, in towns-record', 1, { record: texts.record.replace('b.baked ? townIcon({ look: b.look, title })',
      'b.baked ? townIcon({ look: { mark: t.branding.mark }, title })') }],
    ['e · the Look\'s design.json instead of the bake', 1, { record: texts.record.replace("join(repoRoot, 'public', 'baked', map, 'manifest.json')",
      "join(repoRoot, 'public', 'looks', map, 'design.json')") }],
    ['f · cardFor falls back to faviconUrl', 3, { card: (o) => { const c = cardFor(o); return { ...c, icon: c.icon || o.town?.faviconUrl || null } } }],
    ['h · a stale manifest drawn as unbaked, not refused', 2, { fromManifest: (m, man) => (man && !man.look ? { baked: false } : lookFromManifest(m, man)) }],
    ['i · an unbaked town given an icon', 2, { bakedMark: (m) => (m === a ? { baked: false } : bakedMark(m)) }],
    ['g · a faviconUrl back in an instance', 4, { instOf: (m) => (m === maps[0] ? { ...instanceForMap(m), branding: { ...instanceForMap(m).branding, faviconUrl: 'https://lafayette-square.com/favicon.svg' } } : instanceForMap(m)) }],
  ]
  console.log('\n  mutants:')
  for (const [name, judge, patch] of MUTANTS) {
    if (Object.values(patch).some((v) => v == null || v === texts.publish || v === texts.record)) { bad++; console.log(`  ⛔ ${name} — could not be planted (fewer than two towns with distinct baked marks, or its anchor text moved)`); continue }
    const r = run({ ...S0, ...patch })[judge]
    if (r.length) console.log(`  ✅ ${name} → judge ${judge} red: ${r[0].slice(0, 110)}`)
    else { bad++; console.log(`  ⛔ ${name} — planted and judge ${judge} STAYED GREEN`) }
  }
}

console.log(bad ? `\n⛔ ${bad} failure(s)\n` : '\n✅ every town wears one icon: its own baked Look\'s\n')
process.exit(bad ? 1 : 0)
