# BRIEF — The water is animated and reads as dead. Two reasons, both measured.

**Opened** 2026-09-20 · Jacob: *"water looks good but it's static and dead looking, we need
procedural animated glints especially from the sun and moon."*
**Owner** Fathom (holds `waterMaterial.js`) · **Depends on** nothing; both inputs already exist.

⛔ **It is not "not animated."** `uTime` is driven every frame — `BakedGround.jsx:457`,
`uniforms.uTime.value += delta`. Do not go looking for a missing driver.

---

## ① EVERY WAVE OCTAVE SCALES WITH THE BODY, SO A BIG LAKE HAS NO SMALL WAVES

`waterMaterial.js:76` — `uWaveK = (TUNED_AT_DIAG_M / extentDiag) ^ WAVE_FALLOFF_EXP`
(`TUNED_AT_DIAG_M = 105.7`, the LS pond; `WAVE_FALLOFF_EXP = 0.5`, which Fathom already flagged
as *a look, not measured*). `:188` — `vec2 wp = wpWorld * uWaveK` — and **every** octave then
reads from `wp`.

| | K | largest wave | smallest ripple (`wp*1.2`) | temporal period |
|---|---|---|---|---|
| LS pond, diag 105.7 m | 1.000 | 52 m | 5.2 m | 79 s |
| huron lake, diag ~7 km | 0.123 | 426 m | **43 m** | 79 s |

⇒ **The period is scale-invariant at 79 s**, so in the seconds an operator actually looks,
nothing moves. And huron's *finest* detail is a 43 m blob.

⭐⭐ **THE PHYSICAL FACT THE CODE CONTRADICTS: wavelet size does not scale with the size of the
body of water.** Lake Erie has the same centimetre-to-metre capillary waves a pond has — fetch
buys you BIGGER swell on top, it does not delete the small stuff. So:
- ⛔ `uWaveK` must scale **only the swell octave**, not the whole stack.
- The glitter octaves are a WORLD-CONSTANT size (sub-metre to a few metres) on every body of
  water in every town, pond and Great Lake alike.
- Drift must be an authored **speed in m/s**, converted at the seam — not a constant added to a
  coordinate that has already been rescaled, which is how the period ended up accidentally
  scale-free. *(Same correction as the shadow penumbra, 2026-09-20: a knob whose unit was
  "shader-space" instead of "metres" means a different real thing in every town.)*

## ② THE GLINTS ARE PAINTED, NOT REFLECTED — nothing in the shader knows where the sun is

`waterMaterial.js:234-236`, the shader's own words:

    // Specular-like highlights on ripple crests. ⭐ PAINTED, not reflected —
    // kept because it is half the pond's character, but it is albedo.

`wHighlight` is mixed in on a noise threshold. ⇒ It cannot move with the sun, cannot form a
sun-path, cannot become a moon-path, and looks identical at every hour. **That is the "dead".**

### ⭐ THE INPUT ALREADY EXISTS — DO NOT RECOMPUTE IT
`CelestialBodies.jsx:1428-1433` publishes **`keyDirection`** = `normalize(primary.lightPosition)`,
documented there as *"Sun by day, moon-blended at night… ONE derivation of one physical fact —
read it, never recompute it."* ⛔ A shader that derives its own sun vector from TOD will light
from below the horizon at midnight while every mesh lights from the moon.

### What a real glint is
Sun glitter is a **specular lobe against the distribution of wave slopes**, not a highlight on a
height threshold:
- perturb the normal with the **high-frequency, world-constant** octaves from ①
- evaluate a sharp lobe against `keyDirection` and the view vector
- the lobe's width comes from the slope variance ⇒ it naturally forms the elongated **sun-path
  streak running toward the viewer**, wide at the horizon, tight near the sun's reflection point.
  That streak IS the romance, and it is the thing that cannot be faked with noise: it must track
  the body's azimuth as the hours pass.
- the **moon path is the same lobe** with the same vector and a much lower intensity — which is
  why `keyDirection` being moon-blended matters, and why this is nearly free once ① is done.
- twinkle comes from the small octaves moving, not from an extra time term on the highlight.

⚠️ **`glint` already exists as a knob** (`waterMaterial.js:90`, default 0.35, documented at `:34`
as *"THIS IS THE SUN AND MOON ON THE WATER"*). It currently scales painted albedo. Keep the knob,
change what it drives. ⛔ And keep `glint: 0` meaning EXACTLY the pre-glint surface — `:48` says
that is the control, and it is how this stays falsifiable.

## Open judgment calls (Jacob's, already flagged once and still unruled)
- **`WAVE_FALLOFF_EXP = 0.5`** — a look, never measured. ① changes what it even applies to, so
  rule it as part of ① rather than separately.
- **Does LS's pond get the glint?** Currently `glint: 0` there.

## The check
⭐ `checks/claims-water-scales-with-its-body.mjs` exists (Fathom's). It must be extended or
paired so that **the glitter octaves are asserted NOT to scale** — the defect here is a knob that
scales something physical that is not supposed to scale, and only a check can hold that line on
town #3.

## Eye gate
Huron's lake at three times of day — and specifically **the sun-path streak at low sun**, which is
the whole point. ⛔ Not a still: the operator must see it move.

## Registers
`FEATURES` — "sun and moon lay a moving path on the water" is a capability worth naming.
`OPERATIONS` — the `glint` knob and what `0` means.
