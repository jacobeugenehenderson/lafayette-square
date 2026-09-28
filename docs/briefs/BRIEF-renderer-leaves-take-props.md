<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-28
evict-when: node checks/claims-the-town-reads-no-player-store.mjs --census-empty
-->
# BRIEF — The renderer's leaves take their state from Town, not from player stores

**For:** a fresh agent, in the kit. **Written:** 2026-09-28 (Warden, from Mortise's census).
**Follows:** `BRIEF-one-town-assembly.md` (landed `55fdab64`), which put ONE writer — `TownBridge.jsx` —
between `Town`'s props and the player stores the leaves still read. This brief removes the bridge's reason
to exist: each leaf takes what it needs from `Town`, and the bridge is deleted.

## The leaves still reading a player store — re-derive, don't trust
▶ `node checks/claims-the-town-reads-no-player-store.mjs` prints the census. At writing:
- `useCamera` (the town's shot only): `src/lib/useSceneJson.js`, `CelestialBodies`, `CloudDome`, `OverheadTrees`
- `useSelectedBuilding`: `LafayetteScene`, `SlabBuildings`, `CityModel`, `SetPiece`
- `useListings`: `SceneNeon`

## The work
- Each leaf receives its input from `Town` — as a prop, or through ONE renderer-internal context that
  `Town` provides. Never the old player's store.
- `useSceneJson` stops reading the camera at all: a scene document does not depend on where the camera is.
  If a consumer needs per-shot values, it asks for them by shot.
- When no leaf reads a player store, `TownBridge.jsx` is **deleted**, and the check's census is empty.
- `LafayetteScene` may be gone by then (the live-building path goes with `BRIEF-live-building-palette`) —
  sequence after it, or do its part first; say which.

## What the census knows better (Mortise, 2026-09-28, before executing)
- ⛔ **The bridge does more than feed stores.** Since `aff1ef21` it also PLACES the town (`townPlace`), loads its
  TERRAIN, and writes the town's CLOCK from `<Town time>`. Those are Town's own jobs and stay: they move to
  `src/components/TownPlace.jsx` (Stage and `placeBootTown.js` import them from there), and `TownBridge.jsx` is then
  deleted. So the death condition is **the census being empty**, not the file's absence alone.
- **Hover is renderer-internal.** Only renderer pieces read `hoveredId` (plus arborist's Grove, not the renderer). It
  becomes renderer-owned state, not a Town prop.
- **Selection** leaves the store: `SlabBuildings`, `CityModel`, `SetPiece` read `selectedId` from Town and report a
  click through `onSelectBuilding`. The kit's apps pass their store's value and `select` — so their UI (PlaceCard,
  pins) is untouched.
- **useListings → a `listings` prop.** Neon reads each place's category and hours (`useNeonLookup`). Town takes the
  app's listings array (the content `listings.json` shape the manifest carries); the kit's apps pass their store's.
- **useSceneJson** stops reading the camera: inside `<Town>` the per-shot fork comes from Town's context (no town
  authors `shotLooks` today — measured on every Look), outside it the base document.
- **Sequence with the retint brief:** `LafayetteScene`'s store read is its LIVE Building only, and `SceneNeon`'s
  no-slab fallback (`data/buildings.js`) serves only Stage-on-LS's hand-assembly. Both die with
  `BRIEF-live-building-palette`; everything else goes first, and the check names those two as that brief's.

## Checks
`claims-the-town-reads-no-player-store` tightened: no leaf in `Town`'s closure imports `useCamera`,
`useSelectedBuilding` or `useListings`, and `TownBridge` no longer exists. Seen to fail first.
