# BRIEF — How far is Stage from Preview, and what does staging actually ship?

**Opened** 2026-09-21 (00:20) · **Owner** unassigned — a specialist audit, dispatched by Jacob
**Jacob:** *"I want to deploy a specialist to determine how far off we are from Stage > Preview
parity… the truth is we need that Preview to function properly so we can properly deploy to staging."*

## ⭐ WHY THIS IS URGENT AND NOT COSMETIC
The pipeline is **sequential**: Stage → Preview → staging. Preview is where work is CONFIRMED, not
where it is developed. ⛔ So "it looks right in Stage" is worth nothing if Preview differs, and
"use Preview instead" is not a workaround for a broken Stage — it is skipping a step. Tonight both
failure directions happened in one evening:
· **Preview silently served a stale bake** for an unknown period — it passed NO cache-bust token to
  ANY of its nine baked consumers while Stage passed one to all of its. An operator eye-gate taken
  there reported the OPPOSITE of the truth and cost an A/B that concluded backwards. Fixed `ff6ff4ac`.
· **Fathom spent four rounds tuning water in Stage** that Preview would have rendered differently,
  then told Jacob "it is Preview or nothing" — which was the wrong conclusion drawn from a real
  divergence. ⇒ Nobody currently knows which view is authoritative for what.

---

## MEASURED DIVERGENCES — the starting point, not the answer
### 1. The Canvas is configured differently in almost every respect
| | Stage (`CartographApp`) | Preview (`PreviewApp`) |
|---|---|---|
| projection | `orthographic` **declared** | perspective |
| camera | `position [0,500,0] zoom 3` · **near 0.1 / far 2000** | `SHOTS.hero` · **near 1 / far 60000** |
| dpr | *(unset)* | `[1, 1.5]` |
⭐⭐ **A 30,000:1 difference in depth range.** That alone changes z-fighting, log-depth precision and
DoF. ⚠️ AND THE DECLARED PROJECTION IS A LIE: a live probe in Stage returned
`mainCam PerspectiveCamera` despite `orthographic` on the Canvas — a child camera with `makeDefault`
overrides it. ⇒ **Establish what camera each view ACTUALLY uses at runtime before comparing anything.**

### 2. Stage draws the Designer's live 2D layers ON TOP of the slab; Preview draws the slab alone
`CartographApp.jsx:1319` mounts `<MapLayers … inShot={!inDesigner}>`. Preview never mounts it.
⭐ **This is the big one.** It means Stage is showing slab + live `map.json` composited, and Preview
is showing the shipped artifact. Any difference between the pour and the slab is INVISIBLE in Stage
and appears only in Preview — or vice versa.
⛔ It is also live: `MapLayers`' ground-water block reads `hideIn`, not `hide`, so `SHOT_SKIP` does
not suppress it and the Designer's flat water swatch drew in Stage shots. That is what sent Fathom
in circles, and what `110d5034` / `bfe7bdba` fought over twice.

### 3. Different lighting and post stacks
Preview-only: `BasicLights`, `SceneNeon`, `ExposureTicker`, `LampGlowDriver`, `ForceDaytimeOnMount`.
Stage-only: `CartographPost`, `CartographSkyLight`, `PreviewPostFx`, `ShotLookFork`, `NeonPump`,
`LampGlowPump`. Both mount `CelestialBodies`, `StageShadows`, `StageFog`, `PostProcessing`.
⚠️ `ForceDaytimeOnMount` in Preview alone means the two views can disagree on TIME OF DAY at load.

### 4. Preview has its own hardcoded LS-sized shadow light — NOT fixed tonight
`PreviewApp.jsx:67-71` — `shadow-camera-near 1 / far 1800`, `left/right/top/bottom ±900`. That is
Lafayette Square's 892 m radius. Stage now derives its frustum from the scene stencil and refits it
to the camera each frame (`3dcb5dd3`). ⇒ **Shadows are a different feature in the two views.**

⚠️ **A GREP UNDERSTATES THE OVERLAP.** Stage mounts its CONTENT (buildings, city model, lamps)
indirectly via `sceneCfg.StageEnvironment`, not as literal JSX, so a naive component diff lists
`SlabBuildings` / `CityModel` / `BakedLamps` as "Preview only" when both mount them. ⛔ Resolve the
component sets AT RUNTIME (walk both scene graphs), not by reading JSX.

---

## ▶ WHAT THE AUDIT MUST DELIVER
1. **A table: for each rendered population, which view draws it, from which source.** Slab or live
   `map.json`? Same component or two? ⛔ Runtime-resolved, not grepped.
2. **The authoritative-view ruling, per concern.** For each of ground / buildings / trees / water /
   shadows / sky / post — which view is the one to trust, and what must change so the other agrees.
3. **The list of divergences that would change what STAGING SHIPS.** That is the only class that
   blocks deployment; separate it from the merely cosmetic.
4. ⭐ **A CHECK, and it is the deliverable.** Parity cannot be a one-off report — it rots the first
   time someone edits one app. Something that compares the two runtime scene graphs (populations,
   camera, depth range, light rig) and fails when they diverge in a way that matters.

## ⛔ RULES FOR WHOEVER TAKES THIS
· **Verify at RUNTIME.** Three of tonight's four worst errors came from reading source and inferring
  behaviour: a list read without its consumer, a counter aimed at a fresh load when the app opens in
  Designer, a parse check treated as proof a module loads. `window.__r3f` is live in the Cartograph.
· **When a surface draws NOTHING, read the browser console FIRST.** A non-linking GLSL program is
  invisible, silent in every JS-side check, and identical to a missing mesh. It cost six rounds
  tonight, and the rule was already written down and unread.
· **An instrument reporting "nothing happened" is the reading you must never accept without a
  second, differently-shaped measurement.** Network traffic and causation are differently shaped;
  another counter is not.
· ⛔ **Do not "fix" parity by deleting a capability from one view.** Some divergence is legitimate —
  Stage is an authoring surface and shows authoring aids. Say which differences are INTENDED.

---

# AUDIT RESULT — 2026-09-21, runtime-resolved

**Method.** Both views walked at runtime off the live R3F fiber tree (`_roots` → store →
`scene.traverse`, each Object3D attributed to the nearest owning React component), Chrome,
same dev server, same town (`?scene=lafayette-square`), same shot (Hero), one tab brought to
the front for each measurement in turn. ⛔ Nothing below is grepped.

## ⚠️ FIRST, A SIDE EFFECT I CAUSED — JACOB, READ THIS BEFORE ANYTHING ELSE
Opening `/cartograph.html?scene=lafayette-square` and pressing **Stage →** in the Designer
**rewrote two tracked files at 00:23:43**:
`cartograph/data/lafayette-square/clean/map.json` (gained a `water` layer; `leisure`,
`natural`, `ribbons` layers changed) and `src/data/ribbons.json` (`faces`, `protopolygon`
changed; street count unchanged at 343). Both are semantic changes, not reformatting.
The bake that produced them **failed**: the UI showed `Bake failed — bake look failed: 500`,
which is `src/cartograph/api.js#bakeLook` on `POST /looks/<id>/bake`.
⛔ **I did not revert them** — `cartograph/bake-ground.js` is dirty AND staged from another
session (mtime 00:19:01), so the 500 may simply be that session's work in progress, and
reverting could destroy it. **Cause not established.** To undo my two files:
`git checkout -- cartograph/data/lafayette-square/clean/map.json src/data/ribbons.json`
⭐ Consequence for this brief either way: **while that bake 500s, the operator cannot leave
the Designer for the Stage at all** (the transition runs a bake; `cartograph-shot` stays
`designer`). I reached the Stage by setting `localStorage.cartograph-shot = 'hero'` directly.

## (a) WHO DRAWS WHAT — resolved at runtime, LS / Hero
`o`=objects `m`=meshes `×N`=instances `t`=triangles. Identical rows are the parity that already holds.

| population | STAGE (`/cartograph`, Hero) | PREVIEW (`/preview`, Hero) | source | verdict |
|---|---|---|---|---|
| terrain | `Terrain` 1m / 284 258t | `Terrain` 1m / 284 258t | `baked/<scene>/terrain.json+.bin` | ✅ same |
| ground (grass) | `BakedGround>GroundMeshes>GrassMesh` 6m / 91 380t | identical | baked slab | ✅ same |
| ground (fade) | `BakedGround>GroundMeshes>FadeMesh` 29m / 163 983t | identical | baked slab | ✅ same |
| **buildings** | **`LafayetteScene>Building` 1082m / 25 629t** | **`SlabBuildings>GroupMesh` 9m / 33 696t** | **live `src/data/buildings.json` vs `baked/<scene>/buildings.json`** | ⛔ **two producers** |
| building foundations | `LafayetteScene>Foundations` 1m / 22 240t | — | live | ⛔ Stage only |
| trees | `InstancedTrees>ParkPopulation>{HeroImpostor,Overhead}Species` 189 instanced ×15 327 | identical | baked slab | ✅ same |
| lamps | `BakedLamps>StreetLights` 3 instanced ×1 749 / 2 557 038t | identical | baked slab | ✅ same |
| water | `LafayettePark>ParkWater>PondGroup` 5m / 262t | identical | `src/data/lafayette-square/park_water.json` | ✅ same |
| park fence | `LafayettePark>PerimeterFence` 184m / 2 208t | identical | live | ✅ same |
| landmark | `GatewayArch` + `GroundDisc` 2m / 848t | identical | live | ✅ same |
| sky | `CelestialBodies>GradientSky` 1m / 10 238t + `CloudDome` 1m / 3 968t | identical | — | ✅ same |
| neon | — | `LafayetteScene>SceneNeon>NeonBands` 1m / 8 384t | slab `design.json` | ⛔ Preview only |
| designer layers | `MapLayers` 10m / 9 548t (**in the Hero shot**) | — | live `clean/map.json` | ⚠️ intended-ish, see below |
| light rig | `CelestialBodies` ×8 | `CelestialBodies` ×8 **+ `BasicLights` ×3** | — | ⛔ Preview only |
| shadows | 1 caster: `PrimaryOrb` map4096 `-2613…2613` ±1013 | **2 casters**: that one **+ `BasicLights` map2048 `1…1800` ±900** | — | ⛔ diverges |
| post | `PostProcessing>RenderPipeline` | `PostProcessing>RenderPipeline` | — | ✅ same component |

### ⭐ THREE OF THE BRIEF'S OPENING PREMISES ARE WRONG AT RUNTIME. Correct them.
1. **"A 30 000:1 difference in depth range" — NO.** In the Hero shot both views render through
   `PerspectiveCamera near 1 far 60000 fov 22`, and both have `logarithmicDepthBuffer: true`.
   The Canvas's declared `orthographic near 0.1 far 2000` is the **Designer** camera and is
   correct there (measured: `OrthographicCamera 0.1–2000`). There is no depth-range divergence
   between the two shot surfaces.
2. **"dpr unset in Stage" — NO.** Both report `getPixelRatio() === 1.5`.
3. **"Preview draws the slab alone" — NOT quite.** Preview fetches and draws live source too:
   `src/data/street_lamps.json`, `park_water.json`, `ribbons.json`, `buildingOverrides.json`,
   `clean/park-polygon.json`. The slab/live split is per-population, not per-view — the table
   above is the real split.
4. **Tone mapping: NOT ESTABLISHED as a divergence.** One early read had Preview at
   `ACESFilmic(4)` and Stage-Hero at `NoToneMapping(0)`; a later clean read had **both at 0**.
   It moves between reads. Do not act on it until it is measured twice the same way.

## (b) WHAT WOULD CHANGE WHAT STAGING SHIPS

### ⛔ BLOCKING — the operator's eye is on the wrong object
1. **Buildings have two producers.** Stage draws 1 082 separate `Building` meshes from live
   `src/data/buildings.json`; Preview draws 9 merged `GroupMesh` from the baked slab, 8 067
   triangles' worth of different geometry. Every building judgement made in Stage — massing,
   material, roof, height — is made against something staging does not ship. ⭐ This is the
   `claims-both-surfaces-draw-the-same-water` failure in a second population, and that check's
   own doctrine names the repair: **where the two surfaces draw the same object they must mount
   the same component.** `LafayetteScene>Foundations` (22 240t, Stage-only) rides along with it.
2. **Preview has a second, hardcoded, LS-sized shadow caster.** `BasicLights` mounts a
   `DirectionalLight` at `intensity 2.2, map 2048, near 1, far 1800, ±900` — 900 m is Lafayette
   Square's radius. It is **absent from Stage**. So: shadows are doubled in the confirming view,
   and ⭐ **±900 does not scale with the town** — Huron's slab carries 18 616 tree placements to
   LS's 5 109; anything outside a 900 m box loses its shadow in Preview with no error. This is
   the one item on this list that is a kit defect and not just a parity defect.
3. **Neon ships and cannot be seen while authoring.** `SceneNeon>NeonBands` (8 384t) draws in
   Preview only. A neon change cannot be judged on the Stage at all.
4. **The bake between Designer and Stage returns 500** (above). Nothing reaches staging from a
   Designer session while that holds.

### ⚠️ WOULD CHANGE THE PICTURE, NOT THE SHIPPED ARTIFACT
5. **`MapLayers` still draws inside the Hero shot** — 10 meshes / 9 548 t of live `map.json`
   composited over the slab. It stands *partly* down (Designer 14m/54 133t → shot 10m/9 548t;
   the 39 864 t asphalt sheet at y −0.08 drops out), so `claims-both-surfaces-draw-the-same-water`
   is still true for water. But what remains sits at y 0.12–0.27 over the slab and is invisible
   in Preview. ⭐ Not a call I should make alone: some of it is the authoring overlay doing its
   job, some of it is a second ground surface in a shot. **Needs Jacob's ruling per layer.**
6. **The two views disagree on the time of day at load.** Measured: Stage's caster at
   `intensity 0.224` (01:20 local), Preview's at `1.989` (forced daytime). Every look judgement
   crossing the two crosses a different sun. This is `ForceDaytimeOnMount`, Preview-only.

### ✅ INTENDED — do not "fix" by deletion
Designer mode's whole population (`OrthographicCamera 0.1–2000`, `BlockGeometryV2Debug` 26m,
`MapLayers` 14m, `DesignerTrees` ×5 109, `DesignerLamps` ×583, `DesignerArch`) is the authoring
surface. It should never be compared to Preview and the check does not compare it.
`CelestialBodies>Moon` is clock-dependent, not a divergence.

### ⓘ MEASURED, CAUSE NOT ESTABLISHED
- `CelestialBodies` logs `no scene stencil — sun shadows OFF … nothing has published it yet`
  in **both** views, while `PrimaryOrb.castShadow === true` in both. The console line and the
  object disagree. Not chased.
- One Stage page-load fetched **two towns' slabs** (`baked/lafayette-square/*` *and*
  `baked/huron/*`, 18 616 huron placements instanced) after an in-app scene switch. A clean load
  with `?scene=` touches one. The check fails loudly on `bakedScenesTouched.length > 1`.
- `InstancedTrees` warns on every load that the LS slab has an **unstamped y column** (all 5 109
  placements `y:0`) and **no baked `heroRole`**. Same in both views, so not a parity item.

## (c) THE CHECK — `checks/claims-stage-preview-parity.mjs`
Compares two **runtime censuses** (it carries its own browser probe: `--probe` prints it,
`--record stage|preview` stores it). It fails on: a missing census · a census taken in a tab
that was not rendering (`live.advancing`) · a census older than any of the five watched app
files · two censuses from different towns · a view that touched more than one town's slab ·
any population in one view and not the other that is not in the **declared ledger** of
authoring aids · differing instance/mesh/triangle counts for a shared population · camera
type/near/far/fov · `shadows/shadowType/toneMapping/colorSpace/logDepth/dpr` · fog · the number
and frustum of shadow casters · any light lit in one view only.
⛔ There is no fallback: "parity unknown" is a failure, not a skip.

**Run it:** `node checks/claims-stage-preview-parity.mjs` — today it exits **1** with the eight
divergences above. Censuses committed at `scratch/parity-census-{stage,preview}.json`.

**MUTATION-TESTED, four ways, each seen red then restored green:**
| mutation | result |
|---|---|
| `preview.cam.far 60000 → 2000` | red: `camera.far: Stage 60000, Preview 2000` |
| `stage.live.advancing → false` | red: `taken in a tab that was NOT rendering` |
| `touch src/preview/PreviewApp.jsx` | red: both censuses `predate src/preview/PreviewApp.jsx` |
| feed two **identical** censuses | **green, exit 0** — the pass is reachable, not vacuous |
