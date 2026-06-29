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

## Open / next
- Phase 2 (Stage authoring) — **STANDUP WITH JACOB FIRST** (highest-convergence edit:
  `useCartographStore.createGroupChannelActions` + every panel read site + fork/reset
  toggle). Stage render must also resolve off the active `shot` store field via the same
  `resolveShotScene`.
- Phase 3 (bake) — `cartograph/bake-scene.js` emits `shotLooks`.
