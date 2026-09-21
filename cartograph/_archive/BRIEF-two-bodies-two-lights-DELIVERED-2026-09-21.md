<!-- BRIEF-STATE
status: DELIVERED
retired: 2026-09-21
landed: d360d749 (celestialLights.js — the lerp deleted) · 5e655ecc (only the sun and moon may cast a reflection)
-->

> # ✅ DELIVERED 2026-09-21 — retired for CURRENCY, not for truth.
> **The sun→moon position lerp is deleted.** Two directional lights at two real body
> positions; the brighter one casts; the drawn orb no longer inherits a phantom
> azimuth at 83× too close. The check this brief called its deliverable exists and was
> **written red first**, as instructed — `checks/claims-the-key-light-is-a-real-body.mjs`.
>
> ⭐ **AND IT WENT FURTHER THAN THE BRIEF ASKED, on Jacob's ruling** *"I don't think we
> should have lights that don't have operator facing knobs."* The remaining fills were
> the real culprits: a `floorDir` directional nailed due north in every town for all
> time, which a shiny surface reflected as a hotspot that never moved — **every "sun
> path" screenshot before that night was that lamp.** Both fills became hemispheres
> (irradiance-only, no specular lobe), which makes the invariant assertable:
> ⇒ **ONLY THE SUN AND THE MOON HAVE A SPECULAR LOBE, so a bright path on water is
> EVIDENCE OF A REAL BODY rather than set dressing.** Every light now carries exactly
> one operator channel.
>
> **Where the register went:** **`ls/FEATURES.md`** — *"the sun and moon each light the
> town from where they actually are."*
>
> ⚠️ **THE EYE GATE IS OWED, NOT MET — `ROADMAP` H-15.** This brief's gate is the
> crossover hour on huron's lake, two paths on two real azimuths, moving — ⛔ not a
> still. And `5e655ecc` declares its own: **night will look different**, because
> `dirMoon`'s night value now lands on the real moon. Eye-gate night in two towns.

---

# BRIEF — The sun and the moon must trace their REAL paths. Today one fake light traces neither.

**Opened** 2026-09-20 · **Owner** Fathom (holds the water; this is upstream of its glint)
**Jacob's ruling, and it settles every open call in here:** *"I want the sun and moon to trace their
real paths. We have the data for that, and part of the purpose of the app is a **weather and
environment tracker**."*

⛔ **THAT RULING CHANGES THE CLASS OF THIS DEFECT.** This is not a look preference to be tuned. In
a tracker, a body drawn where it is not **is the product being wrong**. Everything below follows
from that and should not be re-litigated as taste.

---

## ① THERE IS ONE BODY-DERIVED LIGHT, AND AT TWILIGHT IT POINTS AT NEITHER BODY

`CelestialBodies.jsx:1319`

    const blendedLP = _sunLP.clone().lerp(_nightLP, nightBlend)

The key light's POSITION is a linear interpolation between the sun's position and the moon's.

| when | `primary.lightPosition` | correct? |
|---|---|---|
| day | `_sunLP` — the real sun | ✅ |
| deep night (`nightBlend = 1`) | `_nightLP` — the real moon | ✅ |
| **twilight, `sunAlt` −0.12 → −0.25** | **a point between them** | ⛔ **no body is there** |

⇒ The glint path slides across the water between the two bodies, tracking a phantom. Jacob saw it
without being told: *"shouldn't it move along with the sun and moon?"*

⭐ **And two glints are impossible today**, because there is only one body light. Checked, so nobody
re-checks: `secondary` is a stylistic FILL at a hand-placed `(-150, 100, -150)` (`:1333`), and
`floorDir` is fixed at `[0, 100, -400]` (`:1511`). Neither is the moon.

## ② THE DRAWN ORB INHERITS THE PHANTOM — AND SITS 83× TOO CLOSE

`:1326` — `visualPosition: blendedLP`. Every other branch passes `_sunVP`, built at
`SUN_VISUAL_RADIUS = 50000`, whose own comment reads *"far enough to eliminate parallax"* (`:60`).
`blendedLP` is at `LIGHT_RADIUS = 600`.

⇒ Through twilight the **visible** body is at a fabricated azimuth **and** close enough to
parallax — it swims against the scene as the camera moves. ⛔ **For a tracker this is the more
serious of the two: the glint is a reflection of a lie, but the orb IS the lie.**
*(`orbSize: 12` at `:1330` is also computed on a different basis from the day branches' `× (SUN_VISUAL_RADIUS / LIGHT_RADIUS)` — fold it in rather than leaving a third convention.)*

---

## ▶ THE FIX IS SIMPLER THAN WHAT IS THERE: TWO BODIES, TWO LIGHTS

Park a directional light at **each body's real position**, each with its own intensity ramp. Delete
the lerp; nothing is averaged, so nothing can point at a phantom.

⭐ **The two glints then cost NOTHING.** three's PBR evaluates a specular lobe per light, and
`waterMaterial` already feeds it a wave normal (`:393-395`). Two lights ⇒ two paths on the water,
with no shader change at all. **The payoff shot — a low sun and a risen moon on opposite azimuths,
both laying a path across the lake — falls out of deleting a lerp.**

The ramps are already computed and can move as they are: `moonBrightness = (0.15 + moonIllum.fraction * 0.35) * moonAltFade` (`:1309`) — already phase- and altitude-aware, which is exactly what a tracker wants.

### The three consequences, RULED by "it is a tracker"
1. **Which light casts?** Brightest wins — one shadow map, not two. ⚠️ There is a visible handover
   at the crossover; accept it, or cross-fade shadow intensity, but ⛔ do not cast twice by default.
2. **`keyDirection`** (`:1428`, the impostor cards' input) becomes **the brighter body's** direction
   instead of the blend. ⭐ That is MORE correct — a card currently lights from a phantom at
   twilight too — but it is a published seam carrying a standing *"ONE derivation… read it, never
   recompute it"* note, so change it deliberately and update that note in the same edit.
3. **A daytime moon lays a faint path.** ⛔ KEEP IT. It is physically true, the moon is often up and
   lit by day, and a tracker that hides a real body to look tidy has stopped tracking. The existing
   `moonAltFade` + phase term already scales it to near-nothing when it should be.

### ⛔ DO NOT BREAK THE SHADOW FIT SHIPPED IN 3dcb5dd3
`PrimaryOrb` now derives its shadow frustum from the scene stencil and **re-centres it on the
camera's ground focus every frame**, and it takes the light's DIRECTION from the `lightPosition`
prop specifically because the pass MOVES `light.position` (`:216`, commented). Whichever light
ends up casting must keep that treatment. A second light that casts without it gets LS's old
±900 box back, silently.

---

## ⭐ THE CHECK IS THE DELIVERABLE
**Assert that the key light's direction equals an ACTUAL body's direction at every time of day.**
Walk TOD in small steps; at each step compute the sun and moon directions from SunCalc and require
the key light to match one of them within a tight angle. ⛔ Today this fails across the whole
twilight window — so **write it first and watch it go red**, then make it green. That is the
mutation test for free, and it is the only thing that stops a future "smooth the transition" commit
from quietly reintroducing an averaged position.
Second assertion, same file: every drawn orb sits at `SUN_VISUAL_RADIUS`, never at `LIGHT_RADIUS`.

## Eye gate
Huron's lake at the **crossover hour** — low sun, risen moon, both up. Two paths, on the two real
azimuths, moving. ⛔ Not a still.

## Registers
`FEATURES` — "the sun and moon are where they actually are, and each lays its own path on the
water" is a tracker claim, and it is the headline one.
`OPERATIONS` — nothing new unless the shadow handover becomes a knob.
