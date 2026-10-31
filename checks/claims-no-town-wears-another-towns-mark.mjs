#!/usr/bin/env node
/**
 * claims-no-town-wears-another-towns-mark — no LS asset is hardcoded into a shared surface.
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
import { readFileSync, readdirSync, statSync } from 'node:fs'
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
const unmarked = townIcon({ look: null, title: 'Zanzibar Heights', why: 'check' })
const marked = townIcon({ look: { mark: '🦞' }, title: 'Zanzibar Heights' })
if (unmarked.icon !== iconFor({ initial: 'Z' }) || !unmarked.from.startsWith('initial')) {
  bad(`townIcon for a town with no mark draws ${JSON.stringify(unmarked.from)}, not its own initial — a town that authors nothing must draw its OWN placeholder, not inherit a mark`)
} else if (marked.icon !== iconFor({ mark: '🦞' })) bad("townIcon does not draw a town's own mark")
else ok("townIcon draws the town's own mark, else its own initial, never a town's")

// 3. No two TOWNS share the mark the Ward wears. READ, never regex'd: the registry is imported (a declared alias —
// LS's staging copy — is the same module, so the same town) and the mark is the Look's identity.mark, its source
// (src/lib/townIdentity.js).
// ⛔ Found 2026-09-28: the old text-match read single quotes only (provincetown's "⚓" was "no mark", hiding that it
// shares huron's) and skipped a map without a file of its own silently.
const { registeredMaps, instanceForMap } = await import(path.join(ROOT, 'src/instances/registry.js'))
const lookMark = (m) => {
  try { return JSON.parse(readFileSync(path.join(ROOT, `public/looks/${m}/design.json`), 'utf8')).identity?.mark ?? null }
  catch { return null }
}
const towns = new Map()                                  // module → { maps, marks }
for (const m of registeredMaps()) {
  const inst = instanceForMap(m)
  if (!inst) { bad(`'${m}' is registered but resolves to no module`); continue }
  const t = towns.get(inst) || { maps: [], marks: new Set() }
  t.maps.push(m)
  const lm = lookMark(m); if (lm) t.marks.add(`emoji ${lm}`)
  towns.set(inst, t)
}
function collisions(list) {
  const seen = new Map(), out = []
  for (const t of list) for (const k of t.marks) {
    if (seen.has(k)) out.push(`${t.maps.join('/')} and ${seen.get(k).maps.join('/')} both author the ${k} mark — two towns, one mark`)
    else seen.set(k, t)
  }
  return out
}
const list = [...towns.values()]
for (const t of list) ok(`'${t.maps.join("' = '")}' authors ${[...t.marks].join(' + ') || 'no mark — draws its own initial, honestly'}`)
for (const c of collisions(list)) bad(c)
// Mutation, every run: give a second town the first town's mark; the collision test must see it.
const [m1, m2] = list.filter((t) => t.marks.size)
const caught = m1 && m2 && collisions([m1, { maps: m2.maps, marks: new Set(m1.marks) }]).length > 0
if (caught) console.log(`  mutation (give ${m2.maps[0]} ${m1.maps[0]}'s mark) caught ✓`)
else bad('MUTATION NOT CAUGHT — the collision test is blind (or fewer than two towns author a mark)')

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ every town wears its own mark\n')
process.exit(failed ? 1 : 0)
