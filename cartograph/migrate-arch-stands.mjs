#!/usr/bin/env node
// ONE-SHOT MIGRATION — the Arch stands where it is (BRIEF-the-arch-stands-where-it-is, 2026-10-28; Zob's ruling: a script
// with Jacob's go, never a hydrate shim). Every Look in public/looks/index.json; prints the diff, writes only on --write.
// ⛔ Run with Stage CLOSED (or reload it after): an open tab autosaves its in-memory design over the file.
//
// THE ARCH (a Look carrying `arch`): placement is derived from the Arch's real feet (src/setpieces/gatewayArch.js), so
//   distance / bearingX / bearingZ go. The pivot moves from the APEX to the BASE, so yOffset's meaning changes (apex
//   rule → base height) and is rewritten so the base stays where it was drawn: base = yOffset + PEAK·(1 − scale).
//   scale → presence (same value); rotation → turn = rotation − the real facing in the Look's own frame.
//   `--presence <look>=<value>` then sets an authored presence (the base holds; Jacob's first: lafayettesquare=4.2).
//
//   node cartograph/migrate-arch-stands.mjs [--presence lafayettesquare=4.2] [--write]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { geographyFor } from './geography.mjs'
import { archSite, PEAK_HEIGHT } from '../src/setpieces/gatewayArch.js'

const r3 = (v) => Math.round(v * 1000) / 1000

/** The `arch` block under the new rule, from the old one. Pure; refuses by name on a block it cannot read. */
export function migrateArch(arch, geo, look) {
  const v = arch?.values
  if (!v || arch.animated) throw new Error(`[migrate] ⛔ ${look}: \`arch\` is not a flat { values } block — not migrated`)
  if ('presence' in v) return null   // already under the new rule
  for (const k of ['scale', 'rotation', 'yOffset', 'footFade']) {
    if (!Number.isFinite(v[k])) throw new Error(`[migrate] ⛔ ${look}: arch.${k} is ${v[k]} — not migrated`)
  }
  const { facing } = archSite(geo)
  let turn = v.rotation - facing
  turn = Math.atan2(Math.sin(turn), Math.cos(turn))
  return { values: { presence: v.scale, turn: r3(turn), yOffset: r3(v.yOffset + PEAK_HEIGHT * (1 - v.scale)), footFade: v.footFade } }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
  const args = process.argv.slice(2), write = args.includes('--write')
  const presence = new Map()
  for (let i = 0; i < args.length; i++) if (args[i] === '--presence') {
    const [look, val] = (args[++i] || '').split('='), n = Number(val)
    if (!look || !(n > 0)) throw new Error(`[migrate] ⛔ --presence wants <look>=<positive number>, got "${args[i]}"`)
    presence.set(look, n)
  }
  const index = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8'))
  let changed = 0
  for (const { id, scene } of index.looks) {
    const p = join(ROOT, 'public/looks', id, 'design.json')
    if (!existsSync(p)) { console.log(`➖ ${id}: no design.json`); continue }
    const d = JSON.parse(readFileSync(p, 'utf8')), out = { ...d }, notes = []
    if (d.arch) {
      if (!scene) throw new Error(`[migrate] ⛔ ${id} carries \`arch\` and names no scene — no frame to place it in`)
      const geo = geographyFor(scene)
      let a = migrateArch(d.arch, geo, id) ?? d.arch
      if (presence.has(id)) a = { values: { ...a.values, presence: presence.get(id) } }
      if (JSON.stringify(a) !== JSON.stringify(d.arch)) { out.arch = a; notes.push(`arch ${JSON.stringify(d.arch.values)} → ${JSON.stringify(a.values)}`) }
    }
    for (const k of presence.keys()) if (k === id && !d.arch) throw new Error(`[migrate] ⛔ --presence ${k}: that Look carries no \`arch\``)
    if (!notes.length) { console.log(`➖ ${id}: nothing to migrate`); continue }
    changed++
    console.log(`${write ? '✍️ ' : '👁 '} ${id}:\n    ${notes.join('\n    ')}`)
    if (write) writeFileSync(p, JSON.stringify(out, null, 2))   // serve.js#writeJson's format
  }
  console.log(changed ? (write ? `\nwrote ${changed} Look(s)` : `\n${changed} Look(s) would change — re-run with --write`) : '\nnothing to migrate')
}
