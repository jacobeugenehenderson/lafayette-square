# Meteorologist Phase 4a — CanaryScene scaffold

Mount the viewport. Replace the dark placeholder divs in Teacup + ConditionEditor with a real `<Canvas>` rendering: sky from the active Look's `scene.json` + hero tree from Arborist's per-Look bake + flat ground + the **existing v1 `CloudDome`** as the cloud renderer. Two slot framings (CLOUD CHAMBER close + GROUND mid-distance) drive different camera setups.

**Phase 4a uses CloudDome as a placeholder.** The v3 `<Atmosphere />` raymarched shader is its own phase (4b). Phase 4a's value: prove the consume-from-Stage architecture works end-to-end, get clouds visible against real sky for the first time, replace the dead placeholder text. Per the v1-still-ships doctrine, CloudDome is the legitimate v1 cloud renderer until v3 lands.

---

## Read first, in this order

1. **`meteorologist/INTERFACE.md` §7** — what the viewport composes. The data-flow diagram in §2 of ARCHITECTURE.md (consume-from-Stage) is the spec.
2. **`meteorologist/ARCHITECTURE.md` §2** — the consume-from-Stage rationale + the visual flow chart.
3. **`src/preview/PreviewApp.jsx`** lines 14–25 (imports) and ~500–600 (Canvas + CanvasContents) — your reference for how to mount Canvas + the kit's standard consumers. Don't copy the full panel chrome; just the Canvas composition.
4. **`src/lib/useSceneJson.js`** — the hook you'll use to fetch the active Look's `scene.json`. Routes through `import.meta.env.BASE_URL` (memory `project_kit_deploy_path_agnostic`).
5. **`src/components/CelestialBodies.jsx`** docstring — confirms it's the shared sky consumer; no props needed for default behavior.
6. **`src/components/CloudDome.jsx`** lines 1–25 — note it pulls from `useSkyState` (a global zustand), not props. For Phase 4a it runs as-is; the operator doesn't yet author through it.
7. **Memory `feedback_raw_shadermaterial_needs_logdepth_chunks`** — Canvas MUST opt into `gl={{ logarithmicDepthBuffer: true }}` for compatibility with the kit's standard depth setup.

---

## Scope (Phase 4a only)

### Files to CREATE

```
src/meteorologist/
  CanaryScene.jsx                  ← the viewport: Canvas + sky + tree + ground + cloud + camera
  canaryCamera.js                  ← static camera config per slot (CLOUD CHAMBER vs GROUND)
```

### Files to MODIFY

```
src/meteorologist/Teacup.jsx              ← replace placeholder div with <CanaryScene slot={slot} />
src/meteorologist/ConditionEditor.jsx     ← replace placeholder div with <CanaryScene slot={slot} />
src/meteorologist/SlotTabs.jsx            ← (probably no change; just consumed via the slot prop)
src/meteorologist/stores/useMeteorologistStore.js  ← expose activeLookId as a selector consumed by CanaryScene
```

### What the viewport renders

```
┌── viewport ──────────────────────────────────────────────────────┐
│                                                                  │
│              sky gradient + sun + (moon at night)                │
│              + celestial bodies via <CelestialBodies>            │
│              all sourced from useSceneJson(activeLookId)         │
│                                                                  │
│                          \____/                                  │
│                          ----(--                                 │
│                         (- CloudDome -)                          │
│                          ----)---                                │
│                                                                  │
│   [GROUND slot only:]            🌳  ← hero tree                  │
│                                  ╱╲     <InstancedTrees-style    │
│   ────────────────────────────────────    or loose GLB>          │
│   flat tan/green ground plane                                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Camera framings (`canaryCamera.js`)

```js
export const CANARY_CAMERAS = {
  chamber: {
    // CLOUD CHAMBER: cloud-centric, mid-frame, no ground
    position: [0, 200, 300],    // y=200m to roughly look at cloud altitude (CloudDome's slab ~0-3000m)
    target:   [0, 600, 0],      // look up + forward into the sky
    fov: 35,
    showGround: false,
  },
  ground: {
    // GROUND: eye-level, tree mid-frame, sky fills upper 70%
    position: [-8, 1.7, 6],     // 1.7m = adult eye height; offset to show tree in 3/4 view
    target:   [0, 8, 0],        // tree canopy ~8m up
    fov: 50,
    showGround: true,
  },
}
```

These are starting values; the operator won't tune them in Phase 4a (no camera controls yet — keep it static). If the framings read wrong on first look, surface that and we'll adjust the constants — don't add orbit controls in Phase 4a.

---

## Composition details

### Canvas

```jsx
<Canvas
  camera={{ position: cam.position, fov: cam.fov, near: 0.1, far: 60000 }}
  gl={{ logarithmicDepthBuffer: true, antialias: true, alpha: false }}
  style={{ width: '100%', height: '100%' }}
>
  <PerspectiveCamera makeDefault {...cam} />
  <CelestialBodies />
  {cam.showGround && <GroundPlane />}
  {cam.showGround && <HeroTree lookId={activeLookId} />}
  <CloudDome />
</Canvas>
```

- **`logarithmicDepthBuffer: true`** — mandatory; matches the kit's Canvas convention.
- **`alpha: false`** — viewport is opaque; the dark backdrop comes from the sky shader, not the Canvas.
- **`near: 0.1, far: 60000`** — same range as Stage/Preview.

### CelestialBodies

Mounts with no props. It reads `useSceneJson(resolveLookId())` internally — but for Meteorologist's Look-picker integration, we want to override the lookId. Pass `lookId={activeLookId}` if the component accepts it (check the signature in `CelestialBodies.jsx`); if not, surface it as a scope-drift candidate (small refactor) and proceed with the default for now.

### GroundPlane (`<GroundPlane />` — inline component in CanaryScene.jsx)

```jsx
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#5c5040" roughness={0.95} />
    </mesh>
  )
}
```

Flat 200m × 200m plane, neutral grey-tan, high roughness. **Do NOT** import `BakedGround` — that's for production scenes; Meteorologist's canary is intentionally minimal.

### HeroTree

One tree, mid-frame in GROUND slot, no tree in CLOUD CHAMBER. Load directly via `useGLTF` from drei (don't go through InstancedTrees — that mounts the full park roster).

```jsx
import { useGLTF } from '@react-three/drei'

function HeroTree({ lookId }) {
  // Hero species pick: platanus_acerifolia/skeleton-1 — a well-known LS hero
  // from arborist's roster. Variant 1 is the canonical first specimen per
  // arborist's publish convention.
  const url = `${import.meta.env.BASE_URL}baked/${lookId}/trees/platanus_acerifolia/skeleton-1-lod0.glb`
  const { scene } = useGLTF(url)
  return <primitive object={scene} position={[0, 0, 0]} scale={1} />
}
```

**Fallback:** if the active Look's `platanus_acerifolia` bake doesn't exist (any non-LS Look might not include it yet), fetch fails. Wrap in `<Suspense fallback={null}>` so the rest of the scene still renders. Don't crash on missing tree.

**Path is BASE_URL-routed** per `project_kit_deploy_path_agnostic`.

### CloudDome

`<CloudDome />` mounts no-prop. Phase 4a accepts that the cloud's appearance is driven by `useSkyState` defaults, NOT by the active Teapot preset. The cloud is a visible placeholder — proves the architecture, not the cloud authoring loop. That loop lands in Phase 4b with `<Atmosphere />`.

### Slot prop

`CanaryScene` accepts `slot: 'chamber' | 'ground'` from its parent (Teacup or ConditionEditor). All it does with the slot prop is index `CANARY_CAMERAS[slot]` for camera config + the `showGround` flag.

### Look + bake-last-ms

`useMeteorologistStore` already tracks `activeLookId` (Phase 1). The store also needs a `bakeLastMs` getter — currently it doesn't. **Surface this**: either (a) add a bakeLastMs slice that fetches from `/api/cartograph/looks/<id>` and updates on Look change, or (b) pass `Date.now()` once at mount (no cache busting on bake — operator manually reloads). Option (b) is fine for Phase 4a; option (a) is Phase 5 polish.

---

## Mount points

In `Teacup.jsx`:

```jsx
// Before:
<main style={{ flex: 1, /* placeholder dark div */ }}>
  Phase 4: CanaryScene mounts here
</main>

// After:
<main style={{ flex: 1, minHeight: 0 }}>
  <CanaryScene slot={slot} />
</main>
```

Same swap in `ConditionEditor.jsx`. `slot` comes from the local state set by `<SlotTabs />`.

The `minHeight: 0` is important — without it, the Canvas may compute height: 0 in a flex column. Standard CSS gotcha.

---

## Out of scope (DO NOT in Phase 4a)

- **No `<Atmosphere />`.** Phase 4b. CloudDome is the placeholder.
- **No camera controls** (OrbitControls / drag-to-rotate). Camera is static per slot. Phase 4c or later.
- **No TodChannel-driven param binding to the rendered cloud.** The cloud renders generic defaults; scrubbing a TodChannel in the right rail does NOT visibly affect the viewport in Phase 4a. (Phase 4b changes this.)
- **No `BakedGround` mount.** Meteorologist's canary uses a simple plane.
- **No `<InstancedTrees>` mount.** One tree via direct GLB load.
- **No buildings, lamps, arch, neon, or any other LS-specific consumer.**
- **No new shader work.**
- **No post-FX** (Bloom, AO, grade, grain). Skip the entire post-FX stack for Phase 4a. We're proving sky + tree + cloud composition; adding post-FX is its own validation.
- **No interaction handlers in the viewport** (clicks, drags, hover). Static render.

---

## Verification

1. `npm run dev` boots; all four servers up.
2. `http://localhost:5173/meteorologist` → Teapot mode → click any cloud → Teacup mounts; viewport renders a sky + cloud (no ground, no tree in CLOUD CHAMBER slot).
3. Click GROUND slot tab → viewport reveals a ground plane + one tree mid-frame, camera at eye-level looking up.
4. Click back to CLOUD CHAMBER → viewport returns to the cloud-centric framing.
5. Change Look picker (e.g. lafayette-square → another Look if present) → sky updates (sun position / gradient changes); tree changes if that Look has a different bake (or fails gracefully if no platanus_acerifolia bake for that Look).
6. Switch to CONDITIONS mode → click any condition → ConditionEditor mounts; viewport renders the same canary (placeholder cloud, sky from active Look).
7. Switch back to TEAPOT → Teacup canary renders again; no errors in console.
8. Inspect console: no R3F mount errors, no useGLTF errors that weren't expected (a missing per-Look GLB is OK; a useGLTF crash on the default Look is NOT).
9. Sliders in the right rail still work (Teacup's cloud params + Condition editor's directive fields); they just don't visibly affect the viewport yet — that's expected for Phase 4a.
10. Reload the page on either editor → viewport re-renders cleanly.
11. Devtools network panel: GET `/baked/<look>/scene.json` returns 200 (you may see it cached after first load); GET `/baked/<look>/trees/platanus_acerifolia/skeleton-1-lod0.glb` returns 200.

---

## Stash-isolate per file

```bash
git stash push -- \
  src/meteorologist/CanaryScene.jsx \
  src/meteorologist/canaryCamera.js \
  src/meteorologist/Teacup.jsx \
  src/meteorologist/ConditionEditor.jsx \
  src/meteorologist/stores/useMeteorologistStore.js
```

(Plus `src/meteorologist/SlotTabs.jsx` if you touched it.)

Verify `git status --short` shows only these.

Memory: `feedback_stash_isolate_per_file`.

---

## Surface anything not in this brief

Likely small drifts that ARE OK (just disclose):
- A `useGLTF` preload hook if you find the tree GLB blocks first frame in a way that flashes badly.
- A `<Suspense fallback>` placeholder mesh that shows briefly while the GLB loads.
- A small lookId-prop surface added to `CelestialBodies` if it doesn't already accept one (this is a Phase 1 SC.1 contract that should already exist; surface if the prop isn't there).
- Wrapping `useFrame((_, d) => useSkyState.getState().tick(Math.min(d, 0.1)))` per PreviewApp:73 — CloudDome's animation likely needs this driver in Meteorologist's canvas too. If you find the cloud doesn't move at all without this, add it inside CanaryScene and disclose.

Likely drifts that are NOT OK:
- Building `<Atmosphere />` or any new shader work.
- Adding OrbitControls or camera-orbit affordances.
- Adding post-FX.
- Adding BakedGround / InstancedTrees / Buildings / Lamps / Arch.
- Touching CloudDome.jsx internals.

Memory: `feedback_baby_must_surface_scope_drift`.

---

## Memories to respect

- `feedback_raw_shadermaterial_needs_logdepth_chunks` — Canvas needs `logarithmicDepthBuffer: true`. CelestialBodies + CloudDome already chain logdepth chunks; you don't need to do anything beyond setting the Canvas option.
- `project_kit_deploy_path_agnostic` — GLB paths go through `import.meta.env.BASE_URL`. Don't hardcode `/baked/...`.
- `project_kit_helpers_pattern` — Meteorologist composes Cartograph's + Arborist's published artifacts. You're consuming them via the standard hooks; no parallel fetch logic.
- `feedback_preview_uses_production_pipeline` — Meteorologist's canary follows Preview's pattern: real artifacts, not parallel implementations.
- `feedback_kit_helper_css_import_index_not_tokens` — already correct since Phase 2; design tokens + `.glass-panel` already work.
- `feedback_stash_isolate_per_file` / `feedback_baby_must_surface_scope_drift` — per above.

---

## Phase 4b preview

`<Atmosphere />` v3 raymarched cloud shader. The five photoreal levers from SPEC §"Runtime" + atmosphere-materials.js factory. Mounts where CloudDome mounts today; CloudDome retires per STAGE_MIGRATION.md. Reads from active preset's params via `resolveGroupAtMinute(channel, minute)` to feed shader uniforms each frame. Phase 4b is the big shader sprint.

Phase 3b: TodChannel-promotion of directive numeric fields in Conditions. After 4b so the temporal modulation is visually validatable.

Phase 5: fixtures + Almanac evaluator hot-mount + fallback editor + cloud preset gallery + camera orbit affordances.

---

## Commit + report

```
meteorologist: Phase 4a — CanaryScene scaffold + viewport mount

Replaces the dark "Phase 4: CanaryScene mounts here" placeholder with a
real <Canvas> in Teacup + ConditionEditor. Composes:
- sky / sun / moon / celestials via <CelestialBodies> reading
  useSceneJson(activeLookId)
- flat ground plane (GROUND slot only)
- one hero tree (platanus_acerifolia/skeleton-1-lod0.glb from Arborist's
  per-Look bake) via direct useGLTF (GROUND slot only)
- existing v1 <CloudDome /> as the cloud renderer; v3 <Atmosphere />
  lands Phase 4b

Two slot framings (canaryCamera.js): CLOUD CHAMBER = cloud-centric, no
ground; GROUND = eye-level, tree mid-frame, sky fills upper viewport.
Camera is static per slot (no orbit controls yet).

Slider edits in the right rail still work (Phase 2/3 autosave intact);
they do NOT visibly affect the viewport in Phase 4a — that wiring lands
with <Atmosphere /> in Phase 4b.

Created:
- src/meteorologist/CanaryScene.jsx
- src/meteorologist/canaryCamera.js

Modified:
- src/meteorologist/Teacup.jsx — viewport mount
- src/meteorologist/ConditionEditor.jsx — viewport mount
- src/meteorologist/stores/useMeteorologistStore.js — (selector polish)

Verification:
- Sky renders against active Look's scene.json
- Tree loads from per-Look bake; missing-GLB falls back gracefully
- CLOUD CHAMBER and GROUND slot tabs swap camera/ground/tree
- No R3F mount errors

Co-Authored-By: <baby name> <…>
```

Report back with: commit hash, scope-drift disclosures, surprises, browser-side verification (1-11), and a thumbs-up.
