#!/usr/bin/env node
// ONE-SHOT MIGRATION — the Arch stands where it is (BRIEF-the-arch-stands-where-it-is, 2026-10-28; Zob's ruling: a script
// with Jacob's go, never a hydrate shim). Every Look in public/looks/index.json; prints the diff, writes only on --write.
// ⛔ Run with Stage CLOSED (or reload it after): an open tab autosaves its in-memory design over the file.
//
// THE ARCH (a Look carrying `arch`): where it stands is derived from its real feet (src/setpieces/gatewayArch.js), so the
//   authored `distance`, `bearingX` and `bearingZ` retire. Scale, rotation, yOffset and footFade are kept exactly as
//   authored (Jacob: "the arch can keep all the height, foot, rotation, scale controls it already has").
//
// THE SURVEY HERO RETIRES (focus lives only on the keyframes): a Look's `heroSubject` becomes its first key's `focus`
//   — arch → 'arch', landmark/building → its id — unless that key names its own; a key whose focus is 'hero' takes the
//   same id (or none). Then the field goes. ⛔ Refused by name: a hero of another kind (centroid, landscape: no object),
//   or an object hero with no key to carry it — nothing authored is lost silently. A null hero is simply removed.
//
//   node scripts/migrate-arch-stands.mjs [--write]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runMigration, stampIndex } from './archStandsMigration.mjs'

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
  const write = process.argv.includes('--write')
  const index = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8'))
  const pathOf = (id) => join(ROOT, 'public/looks', id, 'design.json')
  const looks = index.looks.map(({ id }) => ({ id, design: existsSync(pathOf(id)) ? JSON.parse(readFileSync(pathOf(id), 'utf8')) : null }))
  const changed = runMigration(looks, { write, save: (id, out) => writeFileSync(pathOf(id), JSON.stringify(out, null, 2)) })   // serve.js#writeJson's format
  // The run's record: every Look is stamped with when it ran, so a slab baked before it reads as owed a re-bake, not wrong.
  if (write) writeFileSync(join(ROOT, 'public/looks/index.json'), JSON.stringify(stampIndex(index, Date.now()), null, 2))
  for (const { id, notes } of changed) console.log(`${write ? '✍️ ' : '👁 '} ${id}:\n    ${notes.join('\n    ')}`)
  console.log(changed.length ? (write ? `\nwrote ${changed.length} Look(s)` : `\n${changed.length} Look(s) would change — re-run with --write`) : '\nnothing to migrate')
}
