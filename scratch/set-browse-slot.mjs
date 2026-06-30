#!/usr/bin/env node
/**
 * set-browse-slot.mjs — author per-shot Browse look overrides into design.json.
 *
 * Companion to set-slot.mjs, but writes into the channel-variant cascade:
 *   design.shotLooks.browse[<channel>].values[<slot>] = { <field>: n, ... }
 *
 * Browse (overhead) inherits Hero for every channel we DON'T touch here — so we
 * override only the legibility levers (ambient/exposure/hemi/dof/bloom) and let
 * the mood channels (dirSun/dirMoon/sky/lampGlow/lantern/neon/halo/mist) inherit.
 *
 * Resolver note (src/cartograph/animatedParam.js): a channel with a SINGLE
 * keyframe resolves GLOBALLY (all minutes). The browse blocks below already
 * carry multiple slots, so adding/updating `dawn` is safe — but if you ever
 * seed a brand-new browse channel with only one slot, anchor it.
 *
 * Usage: node scratch/set-browse-slot.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'public/looks/lafayette-square/design.json')
const design = JSON.parse(readFileSync(FILE, 'utf8'))

const browse = (design.shotLooks ??= {}).browse ??= {}

/** Merge a Browse override slot keyframe for one channel. */
function setBrowse(name, slotId, fields) {
  const ch = (browse[name] ??= { animated: 'tod', values: {} })
  ch.animated = 'tod'
  ch.values ??= {}
  ch.values[slotId] = { ...(ch.values[slotId] || {}), ...fields }
}

// ── DAWN (Browse) — subdued but legible overhead; keep the cool, quiet mood ──
// Pass 1 (eye-gate pending). Deltas from Hero base only; mood inherits Hero.

// ambient — keep MODEST. The Ambient knob scales the flat white night-fill floor
// (CelestialBodies.jsx floorWhite #fff×0.45); cranking it (was 2.5) poured white
// over the map and washed the sky color out. Hold near 1 and let the sky-colored
// hemi carry the legibility lift instead.
setBrowse('ambient', 'dawn', { value: 1.0 })

// exposure — subdued-but-legible; below noon. Hero 0.72 → 0.9.
setBrowse('exposure', 'dawn', { value: 0.9 })

// hemi — THE sky-color fill lever (now driven by the live sky gradient + a
// stronger base). Drive it up so the overhead map reads, washed in dawn sky color.
setBrowse('hemi', 'dawn', { value: 1.5 })

// dof — OFF for the overhead map (see everything sharp). Hero on/blur 0.18 → off.
setBrowse('dof', 'dawn', { enabled: 0, blur: 0, focus: 320, heroBlur: 0.02, softness: 0.16 })

// bloom — gentle: let lamps/lit windows glow, don't wash the top-down read.
// Hero 0.7 → 0.5; keep threshold high so the dim scene doesn't bloom flat.
setBrowse('bloom', 'dawn', { intensity: 0.5, threshold: 0.42, smoothing: 0, warmCool: 0.65, spread: 0.3 })

writeFileSync(FILE, JSON.stringify(design, null, 2) + '\n')
console.log('Browse dawn overrides written:')
for (const c of ['ambient', 'exposure', 'hemi', 'dof', 'bloom']) {
  console.log(' ', c.padEnd(9), JSON.stringify(browse[c].values.dawn))
}
