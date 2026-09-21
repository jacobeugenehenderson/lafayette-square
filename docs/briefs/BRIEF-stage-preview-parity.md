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
