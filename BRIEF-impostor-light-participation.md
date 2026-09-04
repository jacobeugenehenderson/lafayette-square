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
