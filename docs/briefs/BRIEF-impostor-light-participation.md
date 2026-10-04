# BRIEF — the impostors must participate in the scene's lighting

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-03 · re-scoped 2026-10-04 (Boz, Jacob's go)
evict-when: STEP A — the HERO cards take the scene's light diffusely (sun and moon direction, the lamps' light, AO folded into the direction), the trunk meets the ground through the ported blend, the sun direction is published once, the comparison flag is deleted after Jacob's eye, and the checks are green; step B (baked normals, shadows) and the overhead discs are recorded, not built
-->

Root, measured 2026-09-03: the cards are `MeshBasicMaterial` — UNLIT
(`HeroImpostorTrees.jsx:182`, `OverheadTrees.jsx:204`). Mesh trees are
`MeshStandardMaterial` (`treeAtlasMaterial.js:1438`). That one difference is the
symptom. The cards get a global dimmer instead of light:
`diffuseColor.rgb *= (uAmbient + uSun * ovAO)` — SCALARS, not directions
(`treeAtlasMaterial.js:2040` and `:2101`).

The capture is deliberately flat-lit and that is CORRECT (`captureImpostor.js:28`).
The gap is named in the same file: *"per-azimuth octahedral capture + normal-map
relight are the accepted v1 deferrals."* Retired design doc:
`arborist/_archive/BATON-tree-render-next-RETIRED-2026-07-22.md` — read it first;
archived means retired for CURRENCY, not truth.

The lights are real and numerous: `CelestialBodies.jsx:143/169/1339/1345/1351/1359`
plus 583 baked street lamps (`BakedLamps.jsx` → `StreetLights.jsx`). Mesh trees see
all of it. Cards see none.

⛔⛔ **THE MESH PATH IS NOT A FALLBACK AND MUST NOT BE PROPOSED AS ONE.**
*(Jacob, 2026-09-03, correcting the first draft of this brief.)* "The real meshes
weighted everything down **and** didn't look right and caused significant flickering."
Raising `meshTopN` to restore a front row of geometry is NOT a safe stopping point,
NOT a degraded-but-acceptable mode, and NOT a comparison baseline worth building.
⭐ The impostor is the intended representation of a tree in this product. It is not a
cost compromise standing in for a mesh. So the deliverable is impostors that take
light correctly — there is no second path to retreat to, and a brief that offers one
is offering to undo a decision the operator already made on his own eye.

Pool today: 426 pages, 22.3 MB KTX2 (hero 360 / 20.6 MB, overhead 66 / 1.7 MB).

⛔ The docs OVERSTATE this: `arborist/ARCHITECTURE.md:117` claims "full optical
parity… weather relight"; `ACCORDANCE-REVIEW.md:69` says "relightable impostors."
True only as a global dimmer. This is the ASPIRATION case — surface it as work, do not
quietly rewrite it.

## ⭐⭐⭐ RE-SCOPED 2026-10-04 (Jacob: "I *do* want to fix the lighting on the impostors now"). READ THIS FIRST; it overrides "The work" below

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to `/rename`). **Agent: FRESH.**

⛔⛔ **CORRECTION 2026-10-04 (found by Lumen at the premise check): STEP A WAS ALREADY BUILT on 2026-09-04** (`25dd03a6`, `16ee869e`, `ef2f8f1e`): a directional matte relight from `keyDirection` (a sun→moon blend, not `sunDir`), AO gating, a lamp term, and the trunk multiply-blend on the bark card. It ships as the **Canopy Light** look setting, but `directional` is **0** in the kit default and no town sets it, so nothing changed on screen. ⇒ **The real scope is:** Jacob picks the default by eye (noon, dusk, night; before/after pairs), measure its frame cost, remove `?litCards`, run the shadow check, and correct the docs that call it unbuilt. Whether `keyDirection` should become the one published sun/moon direction is a question to raise, not a rebuild. The paragraph below is the original (wrong) premise, kept only as the design intent.

**STEP A, build now: the HERO cards** (the side-on impostors seen in Hero and Street, where low sun, dusk and lamps make flat lighting obvious): `src/components/HeroImpostorTrees.jsx` and the hero stamp in `treeAtlasMaterial.js` (`injectHeroImpostorStamp`).
- **Diffuse only.** Jacob: *"I don't want shiny arbors."* ⛔ No specular, no gloss. That rules out swapping to `MeshStandardMaterial` (it brings sheen); keep a custom matte term.
- **A real directional term without new pages:** a synthetic rounded normal from the card's own UV (cards are Y-billboards, so view-space facing is +Z), lit by the sun's and moon's directions taken into view space. Fold the baked AO into the directional term rather than replacing it. Measure it before considering baked normals.
- **The sun's direction has ONE source:** publish it from `CelestialBodies.jsx` (the `lighting` memo's `sunDir`, the value the sky dome and the directional light already use). ⛔ Never recompute it. This is Phase 2's "one explicit authority" applied to light.
- **The lamps' light** reaches the cards through the existing light model (`src/lib/lampPool.js`, the baked nearest-lamp map and `lamps.json#reach`), not 3,000 real lights.
- **Port the trunk/ground joint blend** to the hero BARK layer (section below), so trees stop meeting the ground with a hard edge.
- **The flag dies.** `?litCards=1` (default off) exists only so Jacob can compare before and after. After his eye passes, the flag is **deleted** and lit cards are simply how trees draw. ⛔ A permanent flag would be a second quality regime, which the Phase 2 spec forbids.
- **The look is signed off; only the lighting response changes** (acceptance below): the test is a before/after pair at the same camera, frame and time, at noon, dusk and night. Remember: trees are the main GPU cost today (Grain's verdict, `scratch/tree-cost/VERDICT.md`), so measure the frame cost of the lighting with E's gauges (`frameCost.js`) and report it.

**Not yours, and why:**
- **The overhead discs.** **Grain** is rewriting them now (`docs/briefs/BRIEF-overhead-impostor-redesign.md`: drop the wiggle grid, wind sheet, deep core), and **Gale** is building the wind sheet those shaders will sample (`docs/briefs/BRIEF-wind-sheet.md`). The same lighting goes onto the NEW overhead impostor after Grain lands. Agree with Grain and Gale before touching `treeAtlasMaterial.js`, which all three of you edit; work only in the hero stamp's parts of it.
- **STEP B, recorded, later (Arborist depth work):** baked normal pages per card (Q2–Q5 below: capture, KTX2 normal encoding, `CAPTURE_FORMAT` bump, +50% pages) and trees casting and receiving shadows.

**Bounds:** ⛔ no pours or bakes; `node scripts/bake-in-flight.mjs` before saving anything the dev servers import; ports 5173 / 5180; commit only your own paths through a private index. A kit change reaches the Ward at the next pin move; batch it, and the push and bundle publish need Jacob's confirmation in your window. Shader linking: `node checks/claims-shader-fragments-declare-what-they-use.mjs` and a live `VALIDATE_STATUS` check, since a uniform declared in the wrong half makes the canopy vanish silently. **Three-part fix:** `arborist/FEATURES.md`, and the two overclaims named below (`arborist/ARCHITECTURE.md`, `ACCORDANCE-REVIEW.md`) corrected to what's true after step A.

**Read this, the sections below and the code, tell Jacob what you found, then build. If the code contradicts the brief, stop and flag him.** Line numbers below date from 2026-09-03; re-derive them.

## ⭐⭐ THE ACCEPTANCE, IN THE OPERATOR'S WORDS

*"The trees look excellent right now; just not lit correctly."* (Jacob, 2026-09-03,
after the 0-mesh / all-impostor pour with corrected scale.)

⛔ **THE LOOK IS SIGNED OFF. ONLY THE LIGHTING RESPONSE IS IN SCOPE.** Silhouette,
density, scale, species mix, card count, azimuth variety and colour-under-neutral-light
are all FINISHED and are not yours to improve. If your change alters any of them, it is
a regression however good the lighting looks — and you will not be able to tell, because
a canopy that lights correctly is exactly the thing that makes a silhouette change look
intentional.
⭐ So the test is a PAIR: same camera, same frame, before and after. The trees must be
recognisably the same trees, differing only in how the light falls on them.

## Wiring already traced (2026-09-03) — confirm, don't re-derive

- **The sun's world direction exists and is NOT published.** `CelestialBodies.jsx:1280`
  returns `sunDir: _sunD` from the `lighting` useMemo — the same value the sky dome and the
  directional light consume. Nothing outside that component can see it.
  ⛔ **PUBLISH IT FROM THERE; DO NOT RECOMPUTE IT.** Two derivations of one physical fact is
  the exact defect class that produced BOTH the tree-height bug and the capture-frame bug
  the same night — a second `sunAlt/sunAz` computation will drift and nothing will notice.
- The card relight is bound in exactly **two** places, `injectOverheadStamp` and
  `injectHeroImpostorStamp`, and both read the same `overheadLightUniforms {uAmbient, uSun}`
  (`treeAtlasMaterial.js:2016`). That object is where a direction and a feature flag belong.
- `OverheadLightDriver` (`OverheadTrees.jsx`) drives those scalars per frame off the weather's
  `lightDome.ambientFloor` — CONTRAST only; they sum to 1. ✅ **BRIGHTNESS landed 2026-09-27:** the same
  driver sums the live rig's light on an up-facing surface (`uSceneLight`) and the relight multiplies by
  it, so cards darken with the scene (measured 7 pm: cards were 0.34–1.0 against the ground's 0.047).
  ⚠️ **What still reads as "dark trees too dark, light too bright" is the SPECIES, not the light:** front-shell
  leaf luminance spans ×13–17 across species (oak_black / oak_white near-black), shaded→lit inside a crown
  only ~2–2.5×. Known to Jacob; the answer is elaborating the Arborist, not a Stage knob (2026-09-27, not
  started). ▶ `node scratch/card-tone.mjs <scene>`
- **A card is a Y-axis billboard**, so it always faces camera: in VIEW space its facing is
  +Z. A synthetic normal from the card UV (a hemisphere bulge) plus the sun direction taken
  into view space is a real directional term needing NO new pages — worth measuring as a
  first step before committing to a baked normal channel.

⛔⛔ **SHIP IT BEHIND A FLAG, DEFAULTING TO TODAY'S LOOK.** The rule, from
`InstancedTrees.jsx:938`: *a shared change ships as a knob defaulting to TODAY'S values, so
the map is unchanged until someone turns it.* I broke that rule on the hero band the same
night and it cost the operator two rounds of vanished trees. `?litCards=1` + a
`window.__setLitCards()` setter, default 0.

⚠️ **AND VERIFY THE SHADER LINKS.** GLSL here is assembled by string concatenation: a
uniform declared in the wrong half links to nothing and the canopy silently DOES NOT DRAW —
no exception, no error, just no trees. That happened twice tonight.
▶ `node checks/claims-shader-fragments-declare-what-they-use.mjs` before you ship.

## AO and CAST SHADOWS are in scope too (Jacob: "there should be AO and cast shadows in addition to whatever normals")

**AO already exists and is already consumed — but light-independently.** Every hero layer
and overhead band carries an `ao` page beside its `albedo`, and both stamps apply
`albedo x (uAmbient + uSun * ao)`. So occlusion is baked and real; what it never does is
respond to WHERE the light is. Folding AO into a directional term (rather than replacing
it) is the job — it is the one channel you do not have to capture.

**⛔ TREES CAST AND RECEIVE NOTHING IN REAL TIME, BY EXPLICIT SETTING.** All four tree draw
sites hard-code `castShadow={false} receiveShadow={false}`:
`HeroImpostorTrees.jsx:246`, `OverheadTrees.jsx:288`, `InstancedTrees.jsx:423` and `:526`.
The scene DOES have soft shadow maps (`Scene.jsx:980` `shadows='soft'`, sun `castShadow` at
`CelestialBodies.jsx:148`) — buildings and ground use them. Trees are simply excluded.
⚠️ Cards are `MeshBasicMaterial`, which cannot receive a shadow at all, so "receive" is
blocked until the material question (Q1) is answered. "Cast" is not blocked the same way.

**✅ FIXED 2026-09-03 (`b29201cc`) — the ground contact shadow now covers 5146/5146.** It
had been `trees.filter(t => t.heroTier !== 'cull')` — 1408 of 5146 — a predicate that was
correct when heroTier gated rendering and became the exact inverse of its own intent once
the hero foundation took over. Recorded here because the LESSON is yours to inherit, not
the bug: ⛔ **`heroTier` reaches no pixel on a foundation-on slab.** If you find yourself
reading it, you are reading the wrong field; the ones that decide are `meshTier` and
`heroRole`.
⚠️ **Still owed:** `checks/claims-every-shadowed-placement-renders.mjs` passes on LS and
always would have — it asks whether SHADOWED placements render, never whether RENDERED
placements are shadowed. Blind in exactly the direction that broke. Sharpening it is in
scope for you.

## ⭐ THE TRUNK/GROUND JOINT BLEND — built, still in the code, and MESH-ONLY

Jacob, 2026-09-03: *"before when the trees were meshes we had a blurred contact shadow disc
baked into the ground under the trees AND we had a sample of the shadowed ground multiplied
onto the trunk of the tree to blend the 'joint'/connection point."*

Both halves are real and only ONE survived the move to all-impostor:

- **The ground disc** — the FX map's G channel, `bake-ground-ao.js`. Alive, and as of
  2026-09-03 it covers all 5146 placements instead of 1408 (see that commit).
- **The trunk blend** — `injectFoliageSway` in `treeAtlasMaterial.js` (~:1020): samples the
  baked ground COLOUR map at the tree's world XZ, multiplies by the FX map's **G contact
  shadow**, adds the **R lamp pool**, and blends the trunk base toward that combined
  EFFECTIVE ground colour — gated by `vBark` and by height
  (`smoothstep(uTrunkBlendTop, 0.0, vLocalY)`), so it fades out up the trunk.
  ⛔ **It exists only in the MESH material.** `injectOverheadStamp` and
  `injectHeroImpostorStamp` have nothing like it, so with meshes at zero the effect is gone
  from the map entirely — every card now meets the ground as a hard edge.

⭐ **It is portable, and cheaply.** The hero card stack already carries a dedicated BARK
layer (`kind:'bark'`, `cardDepthFrac 1.0`) — the trunk is its own draw with its own
material, which is exactly the gate `vBark` was providing. The card vertex shader already
resolves world XZ (`instanceMatrix[3].xz`) and has local Y. The uniforms are module-level
(`treeTrunkGround`, and the `_groundColor` map/min/span/fx set), so a card stamp can bind
the same ones — no new data, no capture change, no manifest change.

⚠️ Do not assume it transfers unchanged: the mesh gates on a per-vertex `vBark` attribute
and the card gates on being the bark LAYER, and the card is billboarded while the mesh is
not. Measure before claiming parity.

## The work

**Q1 — decide the lighting path and justify it.** (a) card material → MeshStandard /
MeshLambert + a baked NORMAL page per card, so the existing rig reaches it; or (b) keep
a custom shader fed real light uniforms. Say what each costs per fragment with 583
lamps in frame. ⭐ Smooth pan is the only perf target.

**Q2 — capture the normal.** `renderTreeToTexture` (`captureImpostor.js:551`, `:682`)
already emits albedo + AO per layer/band; add a normal pass on the same path. ⚠️ The
card is a Y-axis cylindrical BILLBOARD and the hero pool has 6 azimuths: a view-space
normal must be rotated by (card yaw − `azimuthDeg`). Get it wrong and the canopy lights
from the wrong side while looking plausible, which is worse than looking broken.

**Q3 — carry it end to end.** Manifest (`layers[]`/`bands[]` gain `normal`), the
packer's `pagePaths()` (`arborist/pack-impostor-ktx2.mjs`), and encode-on-write
(`arborist/encode-ktx2.mjs` — pages are BORN compressed; a `.png` in the manifest is now
a hard failure). ⚠️ ETC1S chroma-subsamples and is bad for normal maps — investigate
`basisu -normal_map` / UASTC and MEASURE the error. Do not assume the default is fine.

**Q4 — bump `CAPTURE_FORMAT`** (`src/arborist/captureKey.js`, at 3 today). The capture
changes what a page contains, so every record must go dirty by construction. That
constant exists for exactly this.

**Q5 — report the cost.** Pages 426 → ~639 (+50%). MB before/after, and the frame cost
of the material change. The impostor system exists to make the canopy cheap; a fix that
erases that is not a fix.

## Rules

- ⛔ KIT, not LS. It must work on a town nobody has looked at. No skip lists.
- ⛔ NO FALLBACKS. A missing normal page fails LOUDLY; it never silently renders unlit.
- ⛔ Keep the flat-lit capture. It is deliberate and correct.
- ⛔ Unmeasured mechanism ⇒ write "cause not established" and stop.
- ⭐ Eye-gate on STAGING, which has its own slab prefix now: bake → `staging/baked/…`
  → look → promote with `upload-baked-to-r2.mjs --env=prod`. ⛔ Never upload to prod
  unless Jacob says so.

## Deliverable

Working code, the cost numbers, and one line each for `arborist/FEATURES.md` and the two
doc claims above. Eye-gate with Jacob before promoting.
