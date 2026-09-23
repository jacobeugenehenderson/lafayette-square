<!-- BRIEF-STATE
status: SUPERSEDED 2026-09-22 — read the correction below before anything else
dispatched: yes
evict-when: H-24 closes; this brief's live remnant is `docs/briefs/BRIEF-texture-unit-headroom.md`
-->

# ⛔⛔ THIS BRIEF'S CENTRAL PREMISE WAS WRONG. READ THIS FIRST.

> **It treated the TEETH and the FLASH as one defect** — *"the flash fix pinned the camera
> to the worst row"*. They are unrelated, and that conflation cost a full day on 2026-09-22.

- ⛔ **THE FLASH WAS NEVER SHADOWS.** It survived `castShadow = false` outright — no shadow
  map, no frustum, no sampling matrix. Root: `light.position` has two writers and only one ran
  every frame, so the sun shone from a direction nobody chose. Fixed `5a54ddbc`; see `H-16`.
  ⭐ The operator's own observation is what found it: *"Sun-hit places are flashing, I don't
  think the shadows are."* A wrong light DIRECTION re-shades lit surfaces and leaves
  already-black shadows alone — no shadow-side hypothesis predicts that asymmetry.
- ✅ **THE TEETH WERE ARITHMETIC, as §1 says**, and are fixed — but by an authored
  **metres-per-texel cap**, not cascades. §5's "max shadow distance" alternative had the right
  instinct and the wrong unit: 512 m is a third of LS and a seventh of huron.
- ⛔ **CASCADES ARE BLOCKED**, and not on cost: 3 cascades = 3 extra fragment samplers on every
  receiver ⇒ `MAX_TEXTURE_IMAGE_UNITS(16)` exceeded ⇒ the program does not link ⇒
  **nothing draws**. ▶ **`BRIEF-texture-unit-headroom.md`** is the live successor.
- ⚠️ **§3's frame-rate warning was aimed at the wrong thing too.** The frame rate was
  9–13 FPS and it was the TREES — the hero impostor card was 800 tris ×3 layers = 42.18 M
  tris/frame. The shadow pass costs **0.00 FPS** (measured: 77 full 4096² passes suppressed,
  no change). See `H-9`.

⭐ **WHAT STANDS:** §1's arithmetic (with the corrected 1.806 m/texel), §2's blast radius,
and §3's two hard-won properties — texel-snapped focus and power-of-two buckets with
hysteresis. ⚠️ **§5's "premises deliberately not established" was the most valuable
section in the file and was under-read.** Everything it refused to assert turned out to be the
thing that mattered.

---

*(Original brief follows, unedited, as the record of what was believed on 2026-09-21.)*

# One shadow map cannot serve a 7 km town

> **The ask (Jacob, 2026-09-21, ~23:15):** *"flashing with the jagged shadow pyramid teeth
> all over the buildings… Let's hit the cascaded shadow maps now."*

⭐ **This is not a bug hunt. The cause is arithmetic and is already measured.** Read §1,
confirm the four numbers, build §3.

---

## 1 · THE ARITHMETIC, MEASURED 2026-09-21

`SHADOW_MAP_SIZE = 4096` (`src/components/sceneStencilState.js`), one directional caster
(`PrimaryOrb`), one box fitted to what the camera sees. Ground resolution is therefore
`2 × half / 4096`:

⛔ **AND `half` IS NOT THE DISC RADIUS.** `shadowHalfExtent()` is `radius + hypot(center) + 100`
— the frustum is centred on the light→origin axis, not on the disc, plus a rim margin. The
first draft of this brief put the RADIUS in the `box half` column and published 1.73 / 0.44;
the correct figures are below and `CelestialBodies.jsx:186,199` already carried them in
prose. ⭐ **The code was right and the brief was wrong — re-derive, never quote:**
`node -e "const s=require('./public/baked/<look>/ground.json').stencil; const h=s.radius+Math.hypot(...s.center)+100; console.log(h, 2*h/4096)"`

| town | radius | half | **m/texel** | a building's shadow edge |
|---|---|---|---|---|
| **huron** | 3539 | **3697.9** | **1.806** | a staircase you can count — **the teeth** |
| altadena | 4161 | 4261.0 | 2.081 | worse still, and nobody has looked |
| hipointe-demun | 1251 | 1351.0 | 0.660 | visibly stepped |
| Lafayette Square | 892 | 1013.2 | 0.495 | soft — which is why this was never seen |

Design table for a fitted box of any size (`2·half/4096` = `half/2048`):

| box half | m/texel | edge |
|---|---|---|
| 2048 m | 1.00 | visibly stepped |
| 1024 m | 0.50 | soft, acceptable |
| 512 m | 0.25 | clean |
| 128 m | 0.06 | clean |

⛔ **AND THE NEAR-LEVEL CAMERA IS PINNED TO THE WORST ROW, BY A FIX MADE THE SAME NIGHT.**
The fit used to fall back to the point straight *below* the camera when the view ray missed
the ground — the smallest extent at the angle that sees furthest — giving a **55× step in
texel size across 0.1° of pitch**, which was the flash (`ROADMAP` H-16, `c8bb79d9`). The fix
makes the grazing case the whole town, which **guarantees 1.806 m texels whenever the
camera is near level**. ⇒ the flash became teeth. ⛔ Do not revert it; it is the right
shape for a single map and the single map is the problem. ⚠️ **It was continuous in SIZE
only** — the box's CENTRE had an unbounded cliff in the same place (573 km in one step of
pitch, closed 2026-09-22; `ROADMAP` H-16), so a near-level camera was ALSO losing every
shadow in frame. The teeth are what is left once that is gone.

⚠️ **huron is 3,539 m of disc against Lafayette Square's 892.** At LS the same code gives
0.495 m/texel and nobody ever saw this. Signature kit shape: fine on town #1.

## 2 · WHAT ELSE READS THE TEXEL — the blast radius, so nothing is discovered late

- **`PostProcessing.jsx:214`** — the PCSS penumbra radius is computed **from `mPerTexel`**
  and capped against the sample budget, *"or the penumbra stops being soft and becomes
  NOISE."* ⛔ Cascades give texels of several different sizes at once; this consumer assumes
  exactly one. **It must be answered, not left to pick a cascade arbitrarily.**
- **`sceneStencilState.js`** — `shadowHalfExtent` / `shadowMetresPerTexel` are the shared
  vocabulary. If a cascade split makes "the" texel meaningless, these need a defined answer
  (the near cascade? a per-cascade accessor?) rather than a silent one.
- **`CelestialBodies.jsx:370`** — `shadow-mapSize` is set on the one light.
- Every caster/receiver: `CityModel`, `SlabBuildings`, `InstancedTrees`,
  `HeroImpostorTrees`, `OverheadTrees`, `BakedGround`, the toy and harness scenes.

## 3 · THE JOB

Split the view range into cascades, each with its own map and its own fitted box, so the
foreground resolves finely and the distance stays cheap.

- ⛔ **KEEP THE TWO PROPERTIES THE CURRENT FIT ALREADY EARNED**, per cascade:
  (a) **texel-snapped focus** — or shadows crawl as the box slides; (b) **power-of-two
  size buckets with hysteresis** — or a camera on a boundary flaps and the flash returns
  worse. Both are in `CelestialBodies`; both have comments explaining what they cost to
  learn. ⛔ Do not reimplement from scratch and rediscover them.
- ⛔ **AND NO CLIFFS.** `claims-the-shadow-box-has-no-cliff` pins continuity for the single
  box; the same property must hold for every cascade boundary and for the transition
  between them. Extend that check rather than writing a second one.
- **Answer the penumbra question explicitly** and write the answer down. It is the one
  place where "cascades" stops being a local change.
- ⚠️ **Report the cost.** `H-9` has the frame rate at 8.5 FPS in Preview / 6.3 in Stage,
  unexplained. Cascades mean N shadow passes instead of one. ⭐ But note H-9's own
  elimination: removing **all 144 instanced meshes (~138 M tris)** moved it 8.5 → 8.8, which
  also empties the shadow pass — **so the unaccounted ~130 ms is not drawing triangles**, in
  either pass. Do not assume cascades will be free; do not assume they will be the problem.

## 4 · ACCEPTANCE

1. `node checks/claims-the-shadow-box-has-no-cliff.mjs` — extended to cascades, still green,
   still mutation-tested (restoring the old fallback must fail it).
2. A number, not an adjective: **m/texel in the foreground of a near-level huron shot.**
   It is **1.806** today. Say what it becomes.
3. 👁️ **Jacob's eye, on the shot he actually wants** — a near-level 360 sweep of huron from
   the bay, half water and sky. ⛔ Overhead proves nothing; the whole defect is at grazing
   angles. The verdict records its scene (`A17`).
4. ⛔ No visible shadow horizon — a line where shadows simply stop — or if there is one,
   say where it falls and why it is acceptable.

## 5 · PREMISES DELIBERATELY NOT ESTABLISHED

- That cascades are the right answer at all. A **max shadow distance** (one authored cap,
  512 m ⇒ 0.25 m texels) was the cheap alternative offered and NOT chosen; it remains the
  fallback if cascades prove too costly, and a cap is the first cascade's far plane anyway.
- Whether the residual "sometimes" flash Jacob still saw after `c8bb79d9` is the ordinary
  2× bucket steps or something else. **One candidate was measured and closed since — the
  box's 573 km CENTRE cliff (`ROADMAP` H-16) — but ⛔ NOBODY HAS MATCHED ANY on-screen
  flash to ANY mechanism**, because Preview currently renders no scene at all on either
  town (H-16's eye-gate note). Do not assume cascades fix what is left.
- The frame-rate cost. Uncosted on purpose.
