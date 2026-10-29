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

/** The design's keyframes carrying its retired hero, or null when it has no `heroSubject`. Pure; refuses by name. */
export function migrateHero(design, look) {
  if (!('heroSubject' in design)) return null
  const hs = design.heroSubject, keys = design.heroKeyframes || []
  let id = null
  if (hs) {
    if ((hs.kind === 'arch')) id = 'arch'
    else if ((hs.kind === 'landmark' || hs.kind === 'building') && hs.id) id = hs.id
    else throw new Error(`[migrate] ⛔ ${look}: heroSubject ${JSON.stringify(hs)} is no focus object — not migrated; say what its first key should focus`)
    if (!keys.length) throw new Error(`[migrate] ⛔ ${look}: heroSubject ${JSON.stringify(hs)} and no keyframe to carry it — not migrated; key the shot first`)
  }
  const out = keys.map((k, i) => {
    if (k?.focus === 'hero') { const { focus, ...rest } = k; return id ? { ...rest, focus: id } : rest }
    if (i === 0 && id && !(typeof k?.focus === 'string' && k.focus)) return { ...k, focus: id }
    return k
  })
  return { heroKeyframes: out }
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
    const h = migrateHero(d, id)
    if (h) {
      delete out.heroSubject
      if (d.heroKeyframes) out.heroKeyframes = h.heroKeyframes
      notes.push(`heroSubject ${JSON.stringify(d.heroSubject)} → retired; key focus ${JSON.stringify((d.heroKeyframes || []).map(k => k.focus ?? null))} → ${JSON.stringify(h.heroKeyframes.map(k => k.focus ?? null))}`)
    }
    if (!notes.length) { console.log(`➖ ${id}: nothing to migrate`); continue }
    changed++
    console.log(`${write ? '✍️ ' : '👁 '} ${id}:\n    ${notes.join('\n    ')}`)
    if (write) writeFileSync(p, JSON.stringify(out, null, 2))   // serve.js#writeJson's format
  }
  console.log(changed ? (write ? `\nwrote ${changed} Look(s)` : `\n${changed} Look(s) would change — re-run with --write`) : '\nnothing to migrate')
}
