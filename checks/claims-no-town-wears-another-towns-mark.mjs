#!/usr/bin/env node
/**
 * claims-no-town-wears-another-towns-mark — no LS asset is hardcoded into a shared surface, and no town wears a mark it
 * did not author that another town wears.
 *
 * ⛔⛔ ONE PLAYER SERVES EVERY TOWN, so anything hardcoded into it is worn by all of them.
 * Measured 2026-09-21 on huron's own staging address: the tab said "Lafayette Square", the
 * favicon was fetched from `lafayette-square.com`, the load screen drew LS's shared
 * `favicon.svg`, and every anonymous visitor's avatar was the GATEWAY ARCH. The address
 * was right and everything around it said St. Louis.
 *
 * ⭐ THE FIX IS AN AUTHORED GLYPH, not an asset: the Look's `identity.mark` is an emoji, so town #10
 * pastes a character and every badge follows — no file, no pipeline, no size variants.
 * `src/lib/townIdentity.js#townIcon` draws the mark, or the town's own INITIAL, and ⛔ never
 * another town's mark: an unauthored town must LOOK unauthored rather than look finished
 * and be wrong (`CLAUDE.md` Layer 0 q2).
 *
 * ⛔ THIS CHECKS THE SHARED SURFACES ONLY. `src/instances/lafayettesquare.js` may name
 * lafayette-square.com all it likes — that is a town describing itself, which is the
 * product. The defect is a SHARED file naming one town.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nNo town wears another town’s mark')

// ⛔ A town's OWN module is exempt by definition — that is where a town says who it is.
const isTownModule = (p) => p.includes(`src${path.sep}instances${path.sep}`)
const EXT = new Set(['.js', '.jsx'])
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (EXT.has(path.extname(e.name))) yield p
  }
}

// 1. No shared source may hardcode a town-specific mark or domain as an ASSET source. index.html is the one document
// every town's page is served from, so it is a shared surface too (it carried LS's favicon URL until 2026-10-31).
const OFFENDERS = [
  [/lafayette-square\.com\/favicon/i, "fetches Lafayette Square's favicon"],
  [/BASE_URL\s*\+\s*'favicon\.svg'/, 'draws the one shared favicon.svg as a town mark'],
]
for (const f of [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'index.html')]) {
  if (isTownModule(f)) continue
  const src = readFileSync(f, 'utf8')
  for (const [re, why] of OFFENDERS) {
    if (re.test(src)) bad(`${path.relative(ROOT, f)} ${why} — every town would wear it`)
  }
}

// 2. The icon must fall back to the town's OWN initial, never to a town. Run, not regex'd.
const { townIcon, iconFor } = await import(path.join(ROOT, 'src/lib/townIdentity.js'))
const unmarked = townIcon({ look: { mark: null }, title: 'Zanzibar Heights' })
const marked = townIcon({ look: { mark: '🦞' }, title: 'Zanzibar Heights' })
if (unmarked.icon !== iconFor({ initial: 'Z' }) || !unmarked.from.startsWith('initial')) {
  bad(`townIcon for a town with no mark draws ${JSON.stringify(unmarked.from)}, not its own initial — a town that authors nothing must draw its OWN placeholder, not inherit a mark`)
} else if (marked.icon !== iconFor({ mark: '🦞' })) bad("townIcon does not draw a town's own mark")
else ok("townIcon draws the town's own mark, else its own initial, never a town's")

// 3. No town wears a mark it did not AUTHOR that another town wears. Jacob, 2026-10-31 ("they're free to choose any
// emoji"; registry r-a-town-may-choose-any-mark): two towns MAY author the same mark (LS and HPDM both author ⚜️), so a
// shared AUTHORED mark is the product and never fails. What fails is an INHERITED or defaulted one: a town wearing
// another town's mark that no one authored for it (`markAuthored` not true — a seed copy, or a kit neutral that is some
// town's glyph). READ, never regex'd: what a town wears is its BAKED manifest's `look` (mark + markAuthored, resolved by
// src/lib/townIdentity.js#resolveIdentity at the bake); the registry is imported, and a declared alias is the same
// module, so the same town. A town with no baked manifest wears nothing yet: reported, not judged.
// ⛔ Found 2026-09-28: the old text-match read single quotes only and skipped a map without a file of its own silently.
// ⛔ Corrected 2026-10-31: it failed LS and HPDM for both authoring ⚜️ — an instrument calling authoring a defect.
const { registeredMaps, instanceForMap } = await import(path.join(ROOT, 'src/instances/registry.js'))
const worn = (m) => {
  const p = path.join(ROOT, `public/baked/${m}/manifest.json`)
  if (!existsSync(p)) return null                        // not baked; a manifest that does not parse throws, by name
  const l = JSON.parse(readFileSync(p, 'utf8')).look
  return l ? { mark: l.mark ?? null, authored: l.markAuthored === true } : { stale: true }
}
const towns = new Map()                                  // module → { maps, mark, authored }
for (const m of registeredMaps()) {
  const inst = instanceForMap(m)
  if (!inst) { bad(`'${m}' is registered but resolves to no module`); continue }
  if (towns.has(inst)) { towns.get(inst).maps.push(m); continue }
  const w = worn(m)
  if (!w) { console.log(`  · '${m}' is not baked — it wears no mark yet, not judged`); continue }
  if (w.stale) { bad(`'${m}'s baked manifest predates the identity block — re-bake it; what it wears cannot be read`); continue }
  towns.set(inst, { maps: [m], mark: w.mark, authored: w.authored })
}
function inherited(list) {
  const out = []
  for (const t of list) {
    if (!t.mark || t.authored) continue
    const other = list.find((u) => u !== t && u.mark === t.mark)
    if (other) out.push(`'${t.maps.join('/')}' wears ${other.maps.join('/')}'s ${t.mark} mark and did not author it (markAuthored false) — an inherited mark, not a choice`)
  }
  return out
}
const list = [...towns.values()]
for (const t of list) ok(`'${t.maps.join("' = '")}' wears ${t.mark ? `${t.mark} (${t.authored ? 'authored' : 'NOT authored'})` : 'no mark — draws its own initial, honestly'}`)
for (const c of inherited(list)) bad(c)
// Mutations, every run, both directions:
const [m1, m2] = list.filter((t) => t.mark)
if (!m1 || !m2) bad('MUTATIONS NOT PLANTED — fewer than two baked towns wear a mark')
else {
  // (a) an AUTHORED shared mark must NOT be flagged;
  const sharedAuthored = inherited([m1, { maps: m2.maps, mark: m1.mark, authored: true }]).length === 0
  // (b) an INHERITED copy (same mark, not authored) must be flagged. ⛔ NOT DEAD: today resolveIdentity maps an
  // unauthored mark to null, but Looks are SEEDED (Extent's pour seeds from kit-default, 86ed044e), and a seed that
  // copies a mark with markAuthored false is exactly this; judging the published result is what catches it (Zob).
  const copyCaught = inherited([m1, { maps: m2.maps, mark: m1.mark, authored: false }]).length > 0
  if (sharedAuthored) console.log(`  mutation (${m2.maps[0]} AUTHORS ${m1.maps[0]}'s ${m1.mark}) passes ✓ — authoring is the product`)
  else bad(`MUTATION: ${m2.maps[0]} authoring ${m1.maps[0]}'s mark was flagged — the check calls authoring a defect`)
  if (copyCaught) console.log(`  mutation (${m2.maps[0]} INHERITS ${m1.maps[0]}'s ${m1.mark}) caught ✓`)
  else bad('MUTATION NOT CAUGHT: an inherited copy of another town\'s mark passed — the check is blind')
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ every town wears its own mark\n')
process.exit(failed ? 1 : 0)
