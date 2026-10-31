# BRIEF — the scene says why it failed (the Ward)

**Owner:** Ward. **Reviewer:** Zob (co-signed below). **Repo:** `~/Desktop/dev.nosync/theward` only.

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.** No live window holds this work, and the fix is self-contained in the Ward.

## The defect (read in source by Ward and Zob, 2026-10-31; ⛔ NOT MEASURED — your first act is to measure it)

- `src/app/App.jsx#App` renders `<Scene />` as a SIBLING of `<Broken>`. `src/app/Broken.jsx` wraps only `<Body>`.
  `src/main.jsx`'s `boot().catch` covers start-up only.
- `@react-three/fiber` 8.18: `<Canvas>` holds its tree in an internal `ErrorBoundary { set: setError }` and does
  `if (error) throw error` on its next render, so a render throw inside the canvas is rethrown into the Ward's tree,
  where nothing catches it. **Inferred** (React 18 `createRoot`): the root unmounts and the visitor sees a **blank page**.
- **Which throws reach it:** the kit's `Town.jsx` wraps 15 layers in `src/components/R3FErrorBoundary.jsx` (InstancedTrees,
  SetPiece, SlabBuildings, BakedGround, BakedLamps, …). A throw inside one of those NEVER reaches the Ward: the layer
  renders null (the kit's own finding, out of bounds here, below). **The blank-page class is a throw OUTSIDE those
  15:** `Town`'s own body and hooks, and its unwrapped children (PostProcessing, NeonDriver, LampGlowDriver, RevealGate,
  WeatherEffects/Poller, TowerLight, CanvasOverlay, DrawnAnchor, MapCredit). Read the list from `Town.jsx` at the pin
  (`.claude/worktrees/ward-kit`); don't trust this copy of it.

## Read first

- `theward/README.md` and `OPERATIONS.md` "Where things stand".
- `src/app/App.jsx`, `src/app/Broken.jsx`, `src/main.jsx` (`TownErrorScreen`), `src/scene/Scene.jsx` (Ward's ruling of
  2026-09-28 at the top: ONE persistent `<Town>` canvas, the slab read once, screens FLY the camera), `src/scene/mapState.js`.
- The kit at the pin: `src/components/Town.jsx` and `src/components/R3FErrorBoundary.jsx`.
- `checks/run.mjs`, `checks/devTown.mjs`, `checks/happening-has-a-place.mjs` for how a check drives the page.

## The work

1. **Measure first, at TWO named sites** (temporary local edits, never committed), on the Ward dev server (`npm run dev`,
   :5180; Jacob starts it with `! npm run dev`; ⛔ never a second server):
   - a throw inside a WRAPPED layer. Expected: no blank, the layer vanishes, console only.
   - a throw in an UNWRAPPED child of `<Town>`. Expected: a blank page.
   Record both. If either differs from what's expected, **stop and tell Ward**.
2. **The fix:** a boundary around `<Scene>` ALONE (⛔ not one above Scene and Body: a Body error would take down the
   canvas, and a reset would remount it and re-read the slab). On any error that reaches it, it shows the error's own
   words in the Ward's register (reuse `Broken`'s markup and `unbuilt.css`, or `TownErrorScreen`'s; ⛔ not a third look),
   and Body and Band stay alive.
   - ⛔ **It does NOT reset on a route change.** A refusal is deterministic and would just throw again.
   - The reason renders **outside** Scene's `aria-hidden="true"` root, with `role="alert"`, so a screen reader hears it.
   - After a failure, mapState's refs (`cameraRef`, `sceneRef`, `flightRef`, `bearingRef`, `insetRef`) read **null**,
     so no reader (the list's `--rise`, the rose, `SelectionDot`, the checks) treats a dead canvas as live.
   - ⛔ **NO FALLBACK:** never a blank canvas, a placeholder map, a retry or a swallowed error.
3. **The check, from source:** a browser check in `checks/` (wired into `checks/run.mjs`) that makes an unwrapped child
   throw by a route the check controls (not by editing src), and asserts the reason is shown with `role="alert"`, the
   page isn't blank, and the refs are null. **Mutation-test it:** with the boundary removed it must FAIL; report both runs.

## Bounds

- Write only in `theward`. ⛔ No kit edits.
- **Out of bounds: surface it, don't absorb it.** The kit's `R3FErrorBoundary` silently drops a layer after retries
  (raised with Boz by Zob as a kit finding). Also: throws in `useFrame`, in event handlers and in async loader
  rejections, which no React boundary catches. And the storage-denied start-up in OPERATIONS "Parked".
- Commit with `git commit -- <paths>` on a branch `ward/scene-says-why` off `ward-pin/2026-10-30`. ⛔ No publish, no pin move.
- The commit message names the register it reached (`FEATURES`/`OPERATIONS`), or says "Reaches no register."

**Confirm, then build:** read the code, tell Ward what you found, and if it contradicts this brief, stop and flag. The
stop is the deliverable, not a failure of the brief.

## Zob's co-sign

Zob, 2026-10-31: co-signed with changes A (measure a wrapped and an unwrapped throw) and B (the boundary around Scene
alone, no reset on route); the per-layer R3FErrorBoundary silent fallback is a kit finding, out of bounds here.
