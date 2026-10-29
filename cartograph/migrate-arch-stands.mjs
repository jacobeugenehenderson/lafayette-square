#!/usr/bin/env node
// ONE-SHOT MIGRATION — the Arch stands where it is (BRIEF-the-arch-stands-where-it-is, 2026-10-28; Zob's ruling: a script
// with Jacob's go, never a hydrate shim). Every Look in public/looks/index.json; prints the diff, writes only on --write.
// ⛔ Run with Stage CLOSED (or reload it after): an open tab autosaves its in-memory design over the file.
//
// THE ARCH (a Look carrying `arch`): where it stands is derived from its real feet (src/setpieces/gatewayArch.js), so the
//   authored `distance`, `bearingX` and `bearingZ` retire. Scale, rotation, yOffset and footFade are kept exactly as
//   authored (Jacob: "the arch can keep all the height, foot, rotation, scale controls it already has").
//
//   node cartograph/migrate-arch-stands.mjs [--write]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RETIRED_ARCH_FIELDS = ['distance', 'bearingX', 'bearingZ']

/** The `arch` block without its retired placement, or null when it has none. Pure; refuses a block it cannot read. */
export function migrateArch(arch, look) {
  const v = arch?.values
  if (!v || arch.animated) throw new Error(`[migrate] ⛔ ${look}: \`arch\` is not a flat { values } block — not migrated`)
  if (!RETIRED_ARCH_FIELDS.some(k => k in v)) return null
  const out = { ...v }
  for (const k of RETIRED_ARCH_FIELDS) delete out[k]
  return { ...arch, values: out }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
  const write = process.argv.includes('--write')
  const index = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8'))
  let changed = 0
  for (const { id } of index.looks) {
    const p = join(ROOT, 'public/looks', id, 'design.json')
    if (!existsSync(p)) { console.log(`➖ ${id}: no design.json`); continue }
    const d = JSON.parse(readFileSync(p, 'utf8')), out = { ...d }, notes = []
    const a = d.arch ? migrateArch(d.arch, id) : null
    if (a) { out.arch = a; notes.push(`arch ${JSON.stringify(d.arch.values)} → ${JSON.stringify(a.values)}`) }
    if (!notes.length) { console.log(`➖ ${id}: nothing to migrate`); continue }
    changed++
    console.log(`${write ? '✍️ ' : '👁 '} ${id}:\n    ${notes.join('\n    ')}`)
    if (write) writeFileSync(p, JSON.stringify(out, null, 2))   // serve.js#writeJson's format
  }
  console.log(changed ? (write ? `\nwrote ${changed} Look(s)` : `\n${changed} Look(s) would change — re-run with --write`) : '\nnothing to migrate')
}
