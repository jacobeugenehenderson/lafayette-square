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

## Checks
`claims-the-town-reads-no-player-store` tightened: no leaf in `Town`'s closure imports `useCamera`,
`useSelectedBuilding` or `useListings`, and `TownBridge` no longer exists. Seen to fail first.
