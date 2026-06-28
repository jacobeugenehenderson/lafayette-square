# TOD design notes (Wren, 2026-06-28)

Started as the **Dawn** pass per `HANDOFF-design-dawn.md`; Jacob then directed me
slot-by-slot through the **full day** — all 7 TOD slots are now authored and
eye-approved ("so graphic and pretty"). Data only
(`public/looks/lafayette-square/design.json`), authored via `scratch/set-slot.mjs`,
baked with `node cartograph/bake-scene.js --look=lafayette-square`.

## The full-day curve (all 7 slots)
| Slot | Story | Headline levers |
|---|---|---|
| **dawn** | cool, dim, lamps still on (photocell hasn't tripped) | ambient 1.8, hemi 1.6, exposure 0.72, skyGain 0.65, lantern 0.5 |
| **sunrise** | sun breaks horizon, warmer/brighter, lamps trip off | ambient 1.3, hemi 1.0, skyGain 0.9, lantern off, bloom warm 1.0 |
| **noon** | bright neutral midday | hemi 0, skyGain 1.0, ambient 1.0, exposure 0.56, bloom crisp 0.8 |
| **golden** | low warm western sun | hemi 0.4 (let gold dominate), bloom 1.2 warm, exposure 0.62 |
| **sunset** | DRAMATIC blaze | bloom 2.2/thr 0.16/spread 0.55, skyGain 1.0, warm halo #ff7a3c, warm mist |
| **dusk** | blue hour, lamps lead, afterglow fades | hemi 1.3, lantern 0.55, halo #b86a4e, cool mist, bloom 1.6 |
| **night** | deep lamp/neon-lit planetarium | skyGain 0, hemi 2, lantern 0.56/1.24, bloom 4.24, milkyWay on |

New channels promoted to TOD this pass: `lantern`, `ambient`, `exposure`, `halo`,
`mist` (each carries anchors so day/night don't bleed). `lampGlow`, `hemi`,
`skyGain`, `bloom` were already animated; updated their per-slot keyframes.

## Original Dawn pass detail

## The resolver gotcha that shaped this pass
`resolveAnimatedAtMinute` (src/cartograph/animatedParam.js) returns a channel's
value at ALL minutes when it has a **single** keyframe. So converting a flat
channel to `animated` with only a `dawn` slot would globally overwrite the
already-authored other slots. Rule: when a flat channel must differ at dawn,
seed an **anchor** slot with its current flat value too. Only `lantern` needed
that here; the rest were already animated.

## What I set (first try — eye-gate pending)
| Channel | Dawn value | Why |
|---|---|---|
| `lampGlow` | grass/trees/pool = **0** | Already animated (sunset/dusk/night). At dawn it fell back to sunset's amber ground-wash — killed it (no lamp glow at dawn). |
| `hemi` | **1.3** | Already animated (noon 0, night 2). At dawn it resolved to noon's 0 → no sky-fill, too dark. 1.3 = soft twilight skylight fill. |
| `skyGain` | 0.38 → **0.65** | Lift the dome so the warm horizon band reads; still below sunrise's 0.9. |
| `bloom` | intensity **0.7**, threshold **0.4**, warmCool **0.65**, spread **0.4** | Dawn was near-invisible (0.1). Gentle warm glow on the sky band + lit windows; threshold up so the whole dim scene doesn't wash. |
| `lantern` | dawn **off** (0/0); **night anchor** = current 0.56/1.24 | Auto sun-altitude ramp keeps lamps ~half-on at civil dawn (`t≈0.56`). Off at dawn; night byte-identical via the anchor; daytime stays gated off by the ramp. |

## Left flat on purpose (status quo, no regression) — candidates for iteration
These apply their value at all times, so I didn't touch them pass 1. If the
screenshots show a need, each requires an **anchor** slot (flag, don't just
single-keyframe them):
- **exposure** 0.56 — dawn is dim-but-legible; bump/cut by eye if needed.
- **ambient** 1.0 — night-fill multiplier; raise if the map reads black.
- **mist** density 0 — a touch of dawn ground-mist would sell it; held to avoid
  global fog. Add via dawn + 0-anchor if wanted.
- **stars** (default 1.0, not in design.json) — astronomyAlpha may already fade
  them as the sun rises; check the shots before authoring a dawn fade.
- **warmth** 0.86 / **halo** 0.39 — already warm/glowy; likely fine.
- **dirSun** 1.0 / **dirMoon** 0.96 — low warm sun from physics; moon still up.

## Unresolved (not a look issue — flagged, deferred)
- **Trees don't show in Browse until a dial is nudged** (Jacob, 2026-06-28). Same
  known render "wake-up" symptom across this project — nudge any look dial and the
  trees pop in. NOT a dawn-look/lighting problem: trees use `MeshStandardMaterial`
  (treeAtlasMaterial.js:941), lit by the same ambient/hemi fill that lit the
  ground. Render/cull layer — out of design.json scope. Added to unresolved.

## Next: operator eye-gate
Scrub to **Dawn** and screenshot **Hero / Browse / Street**. Evaluate for:
too dark? horizon hue/glow? lamps off? stars gone? bloom gentle vs. blown?
Then iterate the dawn values and re-bake.
