# BRIEF — the impostors must participate in the scene's lighting

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
- `OverheadTrees.jsx:60-68` drives those scalars per frame off
  `useAtmosphere.getState().tweenedDirective.lightDome.ambientFloor`. Weather already
  reaches the cards; only DIRECTION is missing.
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
▶ `node scratch/claims-shader-fragments-declare-what-they-use.mjs` before you ship.

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

**⛔⛔ AND A LIVE BUG, MEASURED 2026-09-03: 73% OF RENDERED TREES CAST NO GROUND SHADOW.**
`cartograph/bake-ground-ao.js:335` splats the baked ground contact shadow for
`trees.filter(t => t.heroTier !== 'cull')` — **1408 of 5146**. Its reasoning was sound when
written ("cull placements draw nothing, so splatting their shadow leaves an orphan soft
circle on bare grass", 2026-06-29) and is now FALSE: `heroTier` reaches no pixel on a
foundation-on slab (it drives only the QC tint), it marks 3850 as cull, and all 5146
placements render as impostors. The filter is the exact inverse of its own intent — it now
REMOVES shadows from trees that are there.
⭐ The honest predicate is "does this placement draw", which after 2026-09-03 is
`meshTier`/`heroRole`, not `heroTier`. ⛔ Fix the predicate; do not delete the filter — the
orphan-circle defect it prevents is real and will come straight back.
▶ `node scratch/claims-every-shadowed-placement-renders.mjs` is the existing check for this
class and it passes on LS today — because it asks whether shadowed placements RENDER, not
whether rendered placements are SHADOWED. It is blind to this direction; sharpen it.

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
