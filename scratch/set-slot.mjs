#!/usr/bin/env node
/**
 * set-slot.mjs — author a named TOD slot keyframe into a Look's design.json.
 *
 * Per HANDOFF-design-dawn.md. Operates on the slot-keyed `animated:'tod'`
 * channel shape:
 *   { animated:'tod', values: { <slotId>: { <field>: n, ... }, ... } }
 *
 * IMPORTANT (resolver semantics, src/cartograph/animatedParam.js):
 *   a channel with a SINGLE keyframe returns that value at ALL minutes.
 *   So converting a flat channel to animated with only `dawn` would globally
 *   overwrite the already-authored other slots (e.g. night lamps). When a
 *   flat channel must differ at dawn, seed an ANCHOR slot with its current
 *   flat value too (see `lantern` below) so the rest of the day is preserved.
 *
 * This pass authors DAWN only. Usage: `node scratch/set-slot.mjs`
 */
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'public/looks/lafayette-square/design.json')
const design = JSON.parse(readFileSync(FILE, 'utf8'))

/** Merge a slot keyframe into an already-(or newly-)animated channel. */
function setSlot(name, slotId, fields) {
  const ch = (design[name] ??= {})
  ch.animated = 'tod'
  ch.values ??= {}
  ch.values[slotId] = { ...(ch.values[slotId] || {}), ...fields }
  return ch
}

/** Convert a FLAT channel to animated with clean slot-keyed values. The flat
 *  field keys are dropped (replaced by the given slots) so no stray siblings
 *  remain. `slots` = { <slotId>: {field:n}, ... }. Seed an anchor slot equal
 *  to the old flat value so the rest of the day is preserved (single-keyframe
 *  channels resolve globally — see resolver note above). */
function convertFlat(name, slots, transition = true) {
  design[name] = { animated: 'tod', ...(transition ? { transitionIn: 30, transitionOut: 30 } : {}), values: {} }
  for (const [slotId, fields] of Object.entries(slots)) setSlot(name, slotId, fields)
}

// 1) lampGlow — already animated (sunset/dusk/night). Lamps stay ON at civil
//    dawn (photocell hasn't tripped), so keep the canopy under-glow present.
setSlot('lampGlow', 'dawn', { grass: 0, trees: 0.02, pool: 0.4 })

// 2) hemi — already animated (noon:0, night:2). At dawn it resolved to noon's
//    0 (no hemisphere fill → black neighborhood). Strong twilight sky-fill —
//    with no direct sun yet, hemi + ambient are the ONLY ground light.
setSlot('hemi', 'dawn', { value: 1.6 })

// 3) skyGain — already animated; lift the dawn dome so the horizon glow reads
//    (still below sunrise's 0.9).
setSlot('skyGain', 'dawn', { value: 0.65 })

// 4) bloom — already animated with a near-invisible dawn (intensity 0.1).
//    Gentle warm highlight bloom on the sky band / lit windows; threshold up
//    so only highlights glow (not the whole dim scene → no wash).
setSlot('bloom', 'dawn', { intensity: 0.7, threshold: 0.4, warmCool: 0.65, spread: 0.4 })

// 5) lantern — FLAT (0.56/1.24). Photocell lamps are STILL ON at civil dawn
//    (they trip off near sunrise), so keep them lit at dawn; OFF at sunrise.
//    Night anchor preserves the evening; daytime stays gated off by the ramp.
convertFlat('lantern', {
  night:   { intensity: 0.56, glow: 1.24 },
  dawn:    { intensity: 0.5,  glow: 1.2  },
  sunrise: { intensity: 0,    glow: 0    },
  noon:    { intensity: 0,    glow: 0    }, // explicit off (ramp also zeroes it)
  golden:  { intensity: 0,    glow: 0    }, // still daylight — lamps off
  sunset:  { intensity: 0.4,  glow: 0.8  }, // photocell warming up as light fades
  dusk:    { intensity: 0.55, glow: 1.1  }, // lamps now the warm lead
})

// 6) ambient — the night-FILL lever (flat 1.0). The dominant fix for the black
//    Browse: lift ground ambient at dawn, step down at sunrise as the sun takes
//    over. Noon anchor = 1.0 keeps day/night.
convertFlat('ambient', {
  noon:    { value: 1.0 },
  dawn:    { value: 1.8 },
  sunrise: { value: 1.3 },
  golden:  { value: 1.1 }, // gentle warm fill under the low sun
  sunset:  { value: 1.2 }, // a touch more fill as direct light fades
  dusk:    { value: 1.3 }, // hold legibility as it darkens
  night:   { value: 1.0 }, // baseline night fill (hemi/lamps carry the rest)
}, false)

// 7) exposure — flat 0.56. Dawn lift for legibility; sunrise eases back toward
//    day as direct sun arrives. Noon anchor preserves the day/night exposure.
convertFlat('exposure', {
  noon:    { value: 0.56 },
  dawn:    { value: 0.72 },
  sunrise: { value: 0.66 },
  golden:  { value: 0.62 }, // sun lower than noon — slight lift
  sunset:  { value: 0.66 }, // lift as light fades
  dusk:    { value: 0.7 },  // lift further into the blue hour
  night:   { value: 0.56 }, // baseline night exposure — lamps/neon pop, deep shadows
}, false)

// ── Sunrise (slot 2) — sun breaks the horizon: warm + brighter than dawn,
//    lamps off (photocell tripped), no stars. skyGain.sunrise (0.9) already
//    authored. ────────────────────────────────────────────────────────────
// lamp ground/canopy wash off once lamps are off.
setSlot('lampGlow', 'sunrise', { grass: 0, trees: 0, pool: 0 })
// less hemi fill now the low sun contributes (between dawn 1.6 and noon 0).
setSlot('hemi', 'sunrise', { value: 1.0 })
// warm golden bloom on the horizon sun + windows; a touch stronger than dawn.
setSlot('bloom', 'sunrise', { intensity: 1.0, threshold: 0.5, warmCool: 0.7, spread: 0.4 })

// ── Noon (slot 3) — bright neutral middle. hemi 0 / skyGain 1.0 / ambient 1.0 /
//    exposure 0.56 already anchor here from the recipe above. Just make the
//    lamp washes explicitly off and clean up the bloom. ──────────────────────
setSlot('lampGlow', 'noon', { grass: 0, trees: 0, pool: 0 })
// REPLACE the stale experimental noon bloom (intensity 6, legacy smoothing/blend
// fields) with a clean, crisp daytime bloom — only near-white highlights glow,
// neutral tint. FLAG: revert if the old value was intentional.
design.bloom.animated = 'tod'
design.bloom.values.noon = { intensity: 0.8, threshold: 0.8, warmCool: 0.5, spread: 0.4 }

// ── Golden (slot 4) — low warm western sun, magic hour. Let the warm
//    directional sun dominate: pull hemi DOWN so the cool sky-fill doesn't
//    fight the gold. Lamps off (daylight). skyGain.golden (1.0) already set. ──
setSlot('hemi', 'golden', { value: 0.4 })
setSlot('lampGlow', 'golden', { grass: 0, trees: 0, pool: 0 })
setSlot('bloom', 'golden', { intensity: 1.2, threshold: 0.45, warmCool: 0.75, spread: 0.4 })

// ── Sunset (slot 5) — sun at the horizon, deepest warm; light fading, lamps
//    warming up. skyGain.sunset (0.86) + lampGlow.sunset already authored. ────
setSlot('hemi', 'sunset', { value: 0.7 }) // twilight fill grows, still warm-led
setSlot('lampGlow', 'sunset', { grass: 0.5, trees: 0.01, pool: 0.2 }) // canopy glow begins

// ── Sunset DRAMA (Jacob, make it dramatic) — push the levers that amplify the
//    blaze WITHOUT touching the sky gradient (off-limits). ───────────────────
// Big, low-threshold, broad warm bloom — the horizon/sky band really glows.
design.bloom.values.sunset = { intensity: 2.2, threshold: 0.16, warmCool: 0.88, spread: 0.55 }
// Full sky-layer gain so the dome blaze pops (brightness only — not the colors).
setSlot('skyGain', 'sunset', { value: 1.0 })
// Halo — the horizon-band haze (AerialPerspective post knob, NOT the sky
// gradient). Warm + strong at sunset; noon/night anchors keep the cool default
// elsewhere. FLAG: this is new color authoring on the halo channel.
convertFlat('halo', {
  noon:   { strength: 0.39, color: '#b8c8d8' },
  night:  { strength: 0.39, color: '#b8c8d8' },
  sunset: { strength: 0.75, color: '#ff7a3c' },
  dusk:   { strength: 0.5,  color: '#b86a4e' }, // fading afterglow band
}, false)
// Mist — a touch of warm low haze catching the light for atmosphere; 0 anchors
// keep the rest of the day clear. FLAG: new mist authoring.
convertFlat('mist', {
  noon:   { density: 0,    color: '#9dc5e0' },
  night:  { density: 0,    color: '#9dc5e0' },
  sunset: { density: 0.06, color: '#e89055' },
  dusk:   { density: 0.03, color: '#8a7a9e' }, // cool blue-hour haze
}, false)

// ── Dusk (slot 6) — blue hour: deep sky, lamps the warm lead, afterglow fading.
//    skyGain.dusk (0.5) + lampGlow.dusk already authored. ────────────────────
setSlot('hemi', 'dusk', { value: 1.3 }) // strong cool skylight fill (blue cast)
setSlot('lampGlow', 'dusk', { trees: 0.02 }) // canopy under-glow as lamps strengthen
// Warm lamp/window glow, between the sunset blaze and the night glow (not the wash).
design.bloom.values.dusk = { intensity: 1.6, threshold: 0.2, warmCool: 0.7, spread: 0.45 }

// ── Night (slot 7) — already authored (skyGain 0, hemi 2, lantern 0.56/1.24,
//    lampGlow, milkyWay on). ambient/exposure night anchors added above so dusk
//    doesn't bleed in. Clean the legacy `smoothing` field off the night bloom
//    (keep its authored values — the heavy lamp/neon/window glow). ────────────
design.bloom.values.night = { intensity: 4.24, threshold: 0.03, warmCool: 0.5, spread: 0.34 }

writeFileSync(FILE, JSON.stringify(design, null, 2) + '\n')
console.log('Authored Dawn slots → ' + FILE)
