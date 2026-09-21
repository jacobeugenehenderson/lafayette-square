#!/usr/bin/env node
/**
 * claims-the-ao-belongs-to-its-ground
 *
 * ⛔ THE CLASS: a DERIVED artifact that patches its producer's manifest, and a
 * producer that rebuilds that manifest from scratch. `bake-ground-ao` writes
 * `ground.lightmap.png` and patches `lightmap` into `ground.json`;
 * `bake-ground` REBUILDS `ground.json`, so every ground re-bake used to erase
 * the reference. Measured 2026-09-20: lafayette-square AND huron each had an AO
 * PNG on disk with no manifest pointing at it — every town rendering with no
 * ambient occlusion, silently, and nobody had noticed.
 *
 * ⛔⛔ AND THE STALENESS GATE READ GREEN IN EXACTLY THAT STATE. bake-ground-ao
 * deliberately writes the manifest BEFORE the PNG so ground.json ends up the
 * newer file (its own comment says so, to stop needsRebuild re-running a 25 s
 * pass). So "ground.json is newer than the PNG" means BOTH "the AO is current"
 * AND "a ground re-bake just invalidated the AO". ⭐ An mtime cannot separate
 * those. A key can — this is tree-anchors' `placementKey` applied to the AO.
 *
 * READS THE ARTIFACTS — no copied lists, no hardcoded town names.
 * Run: node checks/claims-the-ao-belongs-to-its-ground.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')

let fail = 0, legacy = 0, ok = 0, orphan = 0, phantom = 0
for (const look of readdirSync(BAKED)) {
  const gPath = join(BAKED, look, 'ground.json')
  if (!existsSync(gPath)) continue
  // ⛔ A baked dir with no `public/looks/<look>/` is a PHANTOM — bake-target.js
  // refuses to bake it ("would write a phantom baked/ that nothing reads"), so
  // demanding a re-bake here would send the operator at a command that errors.
  // Its own class, named rather than silently skipped: dead output on disk.
  if (!existsSync(join(ROOT, 'public/looks', look))) {
    console.warn(`⚠️  ${look}: baked output with NO public/looks/${look}/ — phantom, nothing reads it `
      + `and bake-target.js refuses to rebuild it. Not an AO failure; it is dead weight.`)
    phantom++
    continue
  }
  const m = JSON.parse(readFileSync(gPath, 'utf8'))
  const pngPath = join(BAKED, look, 'ground.lightmap.png')
  const pngOnDisk = existsSync(pngPath)

  // ⛔ An AO PNG on disk that the manifest does not reference IS the original
  // defect — the work was done and thrown away. Loud, not silent.
  if (pngOnDisk && !m.lightmap) {
    console.error(`⛔ ${look}: ground.lightmap.png EXISTS but ground.json has no \`lightmap\` — `
      + `the reference was erased by a ground re-bake. The scene renders with NO AO.`)
    console.error(`   ▶ node cartograph/bake-ground-ao.js --scene=${look} --look=${look}`)
    orphan++; fail++
    continue
  }
  if (!m.lightmap) continue

  const want = m.groundKey ?? null
  const got = m.lightmap.groundKey ?? null
  if (want && got && want !== got) {
    console.error(`⛔ ${look}: AO baked against DIFFERENT ground (lightmap.groundKey ${got} ≠ groundKey ${want}).`)
    console.error(`   ▶ node cartograph/bake-ground-ao.js --scene=${look} --look=${look}`)
    fail++
  } else if (!want || !got) {
    console.warn(`⚠️  ${look}: no groundKey on ${!want ? 'ground.json' : 'the lightmap'} — baked before `
      + `2026-09-20, so the AO CANNOT be proven to match this ground. Re-bake to get the key.`)
    legacy++
  } else {
    console.log(`  ok    ${look}  groundKey ${want}`)
    ok++
  }
}

console.log(`\n${ok} proven · ${legacy} unprovable (legacy) · ${orphan} orphaned PNG · ${phantom} phantom look`)
if (fail) { console.error('⛔ FAIL'); process.exit(1) }
if (legacy) console.log('⚠️  green, but only because legacy artifacts cannot be checked — re-bake them.')
process.exit(0)
