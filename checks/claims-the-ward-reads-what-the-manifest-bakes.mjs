#!/usr/bin/env node
/**
 * "DOES THE WARD READ EVERY IDENTITY FIELD THE MANIFEST BAKES?" — continuity map §7 #8 (Phase 2 C, 2026-10-04).
 *
 * `cartograph/bake-manifest.mjs` freezes the town's identity (its `src/instances/<map>.js`) into `manifest.identity`,
 * and the Ward reads identity only from there. A baked field nothing reads is either a feature not built yet or
 * machinery the bake should not carry ("bake the answer, not the machinery").
 * ⭐ Jacob, 2026-10-04: `cary`, `commerce`, `legal`, `contact`, `profile` and `modules` each get a Ward reader as the
 * feature using it is built; until then they are BAKED, AWAITING A READER, ⛔ not dropped. That ruling is AWAITING below.
 *
 * Fails when:
 *   · a baked field has no Ward reader and is not on AWAITING (a new field shipped to nobody, unsaid);
 *   · an AWAITING field now has a reader (the ruling is satisfied: take it off the list);
 *   · an AWAITING field is no longer baked (stale).
 *
 * ⭐ READS THE SOURCE: the baked keys are every registered town's module minus the keys bake-manifest's own
 * destructure drops (parsed from it); the readers are `identity.<k>` in the Ward's src/, and `town.<k>` in the import
 * closure of the pinned kit files the Ward imports (the Ward hands `manifest.identity` to them, e.g. `placeTown`).
 *
 *   node checks/claims-the-ward-reads-what-the-manifest-bakes.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const WARD = process.env.WARD_DIR || path.resolve(ROOT, '../dev.nosync/theward')
const AWAITING = ['cary', 'commerce', 'legal', 'contact', 'profile', 'modules']   // Jacob, 2026-10-04 — see header

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
console.log("\nThe Ward reads what the manifest bakes")
if (!existsSync(path.join(WARD, 'src'))) { console.log(`⛔ NOT CHECKED — no Ward at ${WARD} (set WARD_DIR)`); process.exit(2) }

// ── what is baked ─────────────────────────────────────────────────────────────
const bm = readFileSync(path.join(ROOT, 'cartograph/bake-manifest.mjs'), 'utf8')
const drop = bm.match(/const \{([^}]*?),\s*\.\.\.identity \} = inst/)
if (!drop) { console.log('⛔ NOT CHECKED — bake-manifest no longer builds identity as `const { …, ...identity } = inst`'); process.exit(2) }
const dropped = new Set(drop[1].split(',').map(s => s.trim()).filter(Boolean))
const { registeredMaps, instanceForMap } = await import(path.join(ROOT, 'src/instances/registry.js'))
const baked = new Set()
for (const m of registeredMaps()) for (const k of Object.keys(instanceForMap(m))) if (!dropped.has(k)) baked.add(k)

// ── who reads it ──────────────────────────────────────────────────────────────
const walk = (d) => readdirSync(d).flatMap(n => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(m?js|jsx)$/.test(n) ? [p] : [] })
const readers = new Map()   // key -> Set(file)
const note = (k, f) => { if (!readers.has(k)) readers.set(k, new Set()); readers.get(k).add(f) }
const wardFiles = walk(path.join(WARD, 'src'))
const kitEntries = new Set()
export const readsOf = (src, rx) => [...src.matchAll(rx)].map(m => m[1])
for (const f of wardFiles) {
  const src = readFileSync(f, 'utf8')
  for (const k of readsOf(src, /\bidentity\??\.(\w+)/g)) note(k, path.relative(WARD, f))
  for (const m of src.matchAll(/['"]([^'"]*ward-kit\/src\/[^'"]+)['"]/g)) kitEntries.add(path.resolve(path.dirname(f), m[1]))
}
const { importClosure } = await import(path.join(ROOT, 'cartograph/pour-code.mjs'))
const kitFiles = importClosure([...kitEntries]).filter(existsSync)
for (const f of kitFiles) for (const k of readsOf(readFileSync(f, 'utf8'), /\btown\??\.(\w+)/g)) note(k, `kit:${path.basename(f)}`)

// ⭐ The detector must fire before its silence means anything.
if (readsOf("const n = manifest.identity?.name", /\bidentity\??\.(\w+)/g)[0] !== 'name') { console.log('⛔ the reader scan does not see a planted `identity?.name`'); process.exit(2) }
if (!kitEntries.size || !kitFiles.length) bad('the Ward imports no pinned kit file, or its closure is empty — the kit half of the scan read nothing')

console.log(`  baked identity fields (${baked.size}): ${[...baked].sort().join(', ')}`)
console.log(`  scanned: ${wardFiles.length} Ward files · ${kitFiles.length} pinned-kit files\n`)
for (const k of [...baked].sort()) {
  const r = readers.get(k)
  if (r) {
    if (AWAITING.includes(k)) bad(`${k} — on AWAITING but now read (${[...r].slice(0, 3).join(', ')}): the ruling is satisfied, take it off the list`)
    else console.log(`  ✅ ${k.padEnd(12)} read by ${[...r].slice(0, 3).join(', ')}${r.size > 3 ? ` +${r.size - 3}` : ''}`)
  } else if (AWAITING.includes(k)) console.log(`  · ${k.padEnd(12)} baked, awaiting a reader (Jacob, 2026-10-04)`)
  else bad(`${k} — baked into every manifest and read by nothing in the Ward. Give it a reader, put it on AWAITING with a ruling, or stop baking it.`)
}
for (const k of AWAITING) if (!baked.has(k)) bad(`${k} — on AWAITING but no longer baked: take it off the list`)

console.log(failed ? `\n⛔ ${failed} failed\n` : '\nall held\n')
process.exit(failed ? 1 : 0)
