# Channel Variant Cascade — build journal (agent: Lumen)

Arc: `HANDOFF-channel-variant-cascade.md` ⭐ LOCKED DESIGN (whole-look fork per shot).
Branch: `curb-offset-draw`. Started 2026-06-29.

## Doctrine deltas for Boz to fold into canon (after the arc lands)

### Phase 1 (✅ EYE-GATE CONFIRMED 2026-06-29, Jacob: "near-black and magenta in browse, normal in hero") — the single resolve point is `useSceneJson`
The handoff named "a `useShotResolvedScene(scene, viewMode)` at the scene-provision
point." In the as-built architecture there is **no single scene-provision point that
passes `scene` down as a prop** — instead **every production consumer independently
calls the shared adapter `useSceneJson(lookId)`** (`src/lib/useSceneJson.js`):
PostProcessing, NeonBands, CelestialBodies, GatewayArch, BakedGround, LafayetteScene,
InstancedTrees, StreetLights, BakedLamps, LafayettePark, Atmosphere,
useAtmosphereDirective.

So the faithful realization of "resolve ONCE, consumers unchanged" is to **fold the
per-shot resolve into `useSceneJson` itself**. It now reads the live
`useCamera(s => s.viewMode)`, maps it to a shot key, and returns the effective scene.
Every consumer is **byte-unchanged**. This does add one runtime-store dependency
(`useCamera`) to the "deliberately thin slab adapter" — judged acceptable: it's a
production-render concern (which look is active), not an authoring concern, and the
merge stays a pure function in a separate module.

New files / edits:
- `src/lib/shotScene.js` (NEW) — pure resolver: `shotKeyForViewMode(viewMode)`
  (`browse`→browse, `street`→street, `hero` + all special modes → base/null) and
  `resolveShotScene(scene, shotKey)` = `{...base, ...shotLooks[shotKey]}`, returning the
  **same object identity** when there's no fork (so unforked Looks are byte-identical and
  add zero render churn). Shareable with Stage in Phase 2.
- `src/lib/useSceneJson.js` — imports the resolver + useCamera; `useMemo` over
  `(scene, viewMode)`.

Shot vocabulary note: production `viewMode` is `hero | browse | planetarium | cloud |
skeleton` — there is **no `street` viewMode in production today** (Street is a Stage
authoring shot only). So `shotLooks.street` authored in Stage won't resolve in production
until a Street viewMode exists. `shotLooks.browse` and base (hero) are fully live now.

### Schema note for SLAB-CONTRACT (Boz to add when bake lands — Phase 3)
`scene.json` / `design.json` gain optional sparse `shotLooks: { browse?: {<all
channels>}, street?: {…} }`. Present only for forked shots; absent = byte-identical to
today. Resolve = `{...base, ...shotLooks[shot]}`, channel-wise (top-level key) merge.

## Kit firming — "many locations of the slab read" audit (Jacob, 2026-06-29)
Triggered by the multi-writer debug noise. The slab is read in many places; for a
kit, audit dupes + bypasses of the single resolver.

- ✅ **The per-shot resolve IS firmed**: every production consumer reads
  `<override> ?? scene?.<channel> ?? DEFAULT` where `scene` comes from
  `useSceneJson`. Folding the shot-fork into that one hook = single source of
  truth; the ~13 call sites are callers of ONE resolver (fine, like many useState
  callers), not 13 implementations.
- ⛔ **BYPASS to firm — `SlabBuildings.jsx:132`**: does its OWN `fetch(scene.json)`
  (private `?t=Date.now()`), reads `materialPhysics` / `materialColors` /
  `layerVis.building` off it. → those building channels would **never fork per
  shot**, AND it's a duplicate fetch. FIRM: read scene channels via `useSceneJson`
  (shot-resolved); keep its private fetch only for `buildings.json`/`.bin` (geometry,
  not look channels). *(Not in the handoff's Phase-2 consumer list — a new finding.)*
- ⚠️ **DUPE to firm — `cacheBust = bakeLastMs ?? scene?.bakedAt`** in
  `BakedGround`/`BakedLamps`/`InstancedTrees`: 2 fetches per slab per consumer
  (first `@development`, then `@<bakedAt>`), different cache keys. The adapter
  should own the bakedAt revalidation once. (Separate cleanup; not blocking the
  cascade, but a kit smell — flag for Boz.)
- OK: Preview/Stage own scene paths (neonState/PreviewPostFx/store) — intentional
  authoring↔runtime seam per `useSceneJson` doctrine.

### ⚠️ Channel-shape gotcha (matters for Phase 2 store + Phase 3 bake)
A forked channel in `shotLooks[shot]` MUST use the same wire shape as a base
channel — `{ values: {…} }` (flat) or `{ animated:'tod', values:{ slot:{…} } }`.
The resolver (`resolveGroupAtMinute`) reads `channel.values`; a top-level
`{value: …}` resolves to DEFAULTS (silently no-ops). The whole-look fork is a
channel-wise merge, so each forked channel is a complete channel object — Phase 2
must seed forks by *duplicating the base channel objects*, and Phase 3 bake must
emit them in this shape. (Cost us a long debug loop hand-authoring a test fork
with the un-nested shape — looked like a resolve bug, was malformed test data.)

### Dev-freshness fix shipped alongside Phase 1
`useSceneJson` now fetches with `{ cache: 'no-store' }` in DEV only (prod keeps
normal caching; the bakedAt cacheBust busts the URL per bake). Fixes the recurring
"edited the slab / re-baked but the dev app shows the old look" footgun — the
constant dev cacheBust (`development`) let the browser memory-cache serve stale
scene.json. Same rationale as the Section shape.json no-store. (This footgun ate
several rounds during the Phase-1 eye-gate.)

## Standup decision (Jacob, 2026-06-29) — whole-look fork, building-firming deferred
Jacob confirmed the whole-look fork ("it all is exactly the same"): a fork copies
the ENTIRE channel set; unused channels just sit at base. No curated forkable-subset
(that allow-list is the complexity trap). Keep all controls incl. building color —
he won't use per-shot building color (the fork is about **readability/utility**:
exposure/bloom/fog/AO/grade/lighting/neon/sky). Those all fork live already (read
through useSceneJson). **Building color/material is the one channel that won't
render per-shot** until SlabBuildings reads through the adapter (it bypasses today)
— DEFERRED + flagged, not built this arc (not needed for the purpose; small known
fix if ever wanted). So: fork seed = whole channel set; SlabBuildings firming = later.

## ⭐ DESIGN PIVOT (Jacob, 2026-06-29, mid-Phase-2) — implicit per-channel override, NOT explicit whole-look fork
The LOCKED DESIGN said whole-look fork + a "make this shot its own look" toggle.
On contact with the UI Jacob rejected the toggle: *"I hate that. Why can't it
just record changes as the new fork?"* + *"On edit: a button appears that says
Reset to Hero."* So the model is now the IMPLICIT sparse cascade (closer to the
original superseded notes, but UI-driven): **editing any LOOK channel while a
browse/street shot is active records THAT channel as the shot's override; every
untouched channel inherits base (Hero).** No explicit fork step. A **"Reset to
Hero"** banner appears at the top of the panel only once the shot has overrides
(clears them all); per-channel revert drops a single channel's override. Boz:
the LOCKED DESIGN's "whole-look fork / duplicate the interface" is SUPERSEDED —
update the handoff + SLAB-CONTRACT note to "sparse per-channel override per shot,
recorded implicitly on edit, inherit base otherwise." Consequence to note:
because untouched channels INHERIT base, editing the Hero/base look propagates to
all shots except where they've overridden (CSS-like; intended).

## Phase 2 (built, eye-gate pending) — Stage authoring is shot-aware (implicit override)
Stateless redirect (NOT a stateful shot-swap): base = top-level store channels,
forks = `shotLooks[shot]`; reads/writes RESOLVE the active shot. Core logic
test: 17/17 (`scratch/test-store-fork.mjs`) — forked Browse edits stay in the
fork, Hero/base untouched; non-fork channels always write base; reset restores
base-following; unforked = byte-identical.

- `useCartographStore.js`: helpers `SHOT_LOOK_CHANNELS` (the look set — opt-in,
  exported), `forkedShotKey`, `activeChannel` (exported), `channelPatch`. Factory
  `createGroupChannelActions` + hand-rolled lampGlow/clouds/sky actions all read
  via `activeChannel`, write via `channelPatch`. New state `shotLooks:{}` +
  DESIGN_FIELDS entry (round-trips design.json via the existing serialize/hydrate).
  New actions `forkShot(shotKey)` (deep-copies the whole look set) / `resetShotToBase`.
- Read sites (the convergence) all → `activeChannel`: panel edits (`CartographPost`
  + `CartographSkyLight` StoreChannel, `CartographSurfaces` layerColors/luColors/
  lampGlow, `SkyGradientGrid` sky), Stage render overrides (`CartographApp` ~25 +
  backdrop layerColors/luColors), and the `LampGlowPump`/`NeonPump` frame loops.
- UI: `ShotLookFork` (CartographApp) → new `lookForkSlot` on `StagePanel`
  (StageApp.jsx, top of panel). Hero = base (no toggle); browse/street get
  "Make its own look" / "Reset to base".
- NOT forked (documented in the SHOT_LOOK_CHANNELS comment): shape/geometry,
  framing (shots/hero*/arch/horizon/browseHeading), building material
  (SlabBuildings bypass — deferred), and layerVis/labels/layerStrokes (global for
  now). `stars` is a pre-existing gap (factory + bake read it but it's missing
  from DESIGN_FIELDS → never serialized; flag for Boz, not this arc).

## Phase 3 (✅ verified) — bake emits shotLooks
`cartograph/bake-scene.js`: after building `scene`, emit `scene.shotLooks =
design.shotLooks` ONLY when present + non-empty (sparse → unforked Looks bake
byte-identical, no key). Verified on a temp look: shotLooks round-trips verbatim
(browse: mist/skyGain/ambient/exposure/dof/bloom, full channel-def shapes); a
design with shotLooks removed bakes WITHOUT the key. The full chain now works:
Stage edit (records shotLooks) → bake (emits to scene.json) → production
(useSceneJson resolves active shot).

### ⚑ BOZ — SLAB-CONTRACT note to add (canon is read-only for me)
`scene.json` / `design.json` gain optional `shotLooks: { browse?, street? }`,
each a sparse `{ <channel>: <channel-def> }` of per-shot LOOK overrides recorded
implicitly on edit (inherit base/Hero otherwise). Absent = byte-identical to a
pre-cascade slab. Resolve = `{...base, ...shotLooks[shot]}` (channel-wise), at
one point: production's `useSceneJson` (off camera viewMode), Stage's
`activeChannel` (off the active shot). Not overridable: shape, framing, building
material (SlabBuildings bypass — deferred). `stars` is a pre-existing serialize
gap (factory + bake read it but it's missing from DESIGN_FIELDS).

## Open / next
- Phase 2 (Stage authoring) — **STANDUP WITH JACOB FIRST** (highest-convergence edit:
  `useCartographStore.createGroupChannelActions` + every panel read site + fork/reset
  toggle). Stage render must also resolve off the active `shot` store field via the same
  `resolveShotScene`.
- Phase 3 (bake) — `cartograph/bake-scene.js` emits `shotLooks`.
