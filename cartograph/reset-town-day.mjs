#!/usr/bin/env node
// reset-town-day — return a town's time-of-day channels to THE KIT'S DAY (Jacob, 2026-09-27: "All maps get reset to
// this new overridable defaults").
//
// Removes, from each named Look's design.json, exactly the channels the kit's day owns
// (skyLightChannels.js#KIT_DAY_CHANNELS — read, never listed here), the same channels inside its per-shot forks
// (`shotLooks`), and the retired flat lamp swatch (`layerColors.lamp`, now the Lantern's keyed Colour). An absent
// channel hydrates, bakes and first-paints as the kit's day, so the town then follows the kit; anything the operator
// authors afterwards is the town's own again.
// ⛔ Touches nothing else: no widths, corners, land use, trees, materials, shots or camera. The list of fields it
// touches is printed before anything is written.
// ⭐ Recoverable: commit the Looks' current state first; the reset's own commit names the restore command.
//
//   node cartograph/reset-town-day.mjs                    # dry run: every town-bound Look, what would change
//   node cartograph/reset-town-day.mjs --write            # write it
//   node cartograph/reset-town-day.mjs --look=provincetown [--write]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KIT_DAY_CHANNELS } from '../src/cartograph/skyLightChannels.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOOKS = join(ROOT, 'public/looks')
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const WRITE = process.argv.includes('--write')
const index = JSON.parse(readFileSync(join(LOOKS, 'index.json'), 'utf8'))
// Town-bound Looks only: the kit's 0-state binds no scene and is `{}` by construction.
const looks = (index.looks || []).filter(l => l.scene).map(l => l.id)
const only = arg('look')
if (only && !looks.includes(only)) throw new Error(`⛔ "${only}" is not a town-bound Look in public/looks/index.json`)
const targets = only ? [only] : looks

console.log(`Fields this reset touches (from KIT_DAY_CHANNELS): ${KIT_DAY_CHANNELS.join(', ')}`)
console.log(`  + the same channels inside shotLooks.<shot> · + layerColors.lamp`)
console.log(`${WRITE ? 'WRITING' : 'DRY RUN (add --write)'} — ${targets.length} Look(s)\n`)

const keys = (ch) => !ch ? '—' : ch.animated ? `K ${Object.keys(ch.values || {}).join(' ')}` : 'flat'
for (const id of targets) {
  const path = join(LOOKS, id, 'design.json')
  const d = JSON.parse(readFileSync(path, 'utf8'))
  const lines = []
  for (const k of KIT_DAY_CHANNELS) if (k in d) { lines.push(`  ${k.padEnd(15)} ${keys(d[k])} → the kit's day`); delete d[k] }
  for (const [shot, block] of Object.entries(d.shotLooks || {})) {
    for (const k of KIT_DAY_CHANNELS) if (block && k in block) { lines.push(`  shotLooks.${shot}.${k} → removed (the shot follows Hero)`); delete block[k] }
    if (block && !Object.keys(block).length) delete d.shotLooks[shot]
  }
  if (d.shotLooks && !Object.keys(d.shotLooks).length) delete d.shotLooks
  if (d.layerColors && 'lamp' in d.layerColors) { lines.push(`  layerColors.lamp ${d.layerColors.lamp} → removed (Lantern › Colour)`); delete d.layerColors.lamp }
  console.log(`${id}: ${lines.length ? lines.length + ' change(s)' : 'already on the kit day'}`)
  for (const l of lines) console.log(l)
  if (WRITE && lines.length) writeFileSync(path, JSON.stringify(d, null, 2) + '\n')
}
