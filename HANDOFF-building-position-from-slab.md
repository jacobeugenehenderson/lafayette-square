# HANDOFF / BRIEF — building positions from the slab (fix HiPointe clicks + map pins)

> **Agent: FRESH → name yourself.** **Foreground** (background writes are denied — you must be able to write). **Worktree** (`isolation: worktree`): trunk `curb-offset-draw` is live with an impostor agent editing *tree* files — you touch the reader's building-position path (`LafayetteScene`, `SidePanel`, `GlassSearch`, `data/buildings.js`), no overlap, but isolate anyway.

## Route first (the CLAUDE.md gate — do not skip)
`ORIENTATION.md` → `README.md §⭐ START HERE` → then `SLAB-CONTRACT.md §6.3` (the render-scoped per-building index) + `ls/ARCHITECTURE.md §2` (the **three payloads**: slab = render, content = names/listings, config = INSTANCE) + the `slab-render-vs-content-boundary` doctrine. You are fixing a **render/content boundary leak**; read the model, don't re-derive it.

## The bug (one line + root cause)
On `?look=hipointe-demun`, clicking a Society establishment does **nothing** (no camera fly-to, no place card) and **no map pins draw**. Root cause: both paths read each building's scene **`position`** from the **content** `buildingMap` — LS's legacy `buildings.json` carries `position`, but HiPointe's `roster.json` is pure content (no coordinates). `computeCenterOn(building)` reads `building.position[0]` → `undefined[0]` → the click handler throws; `MapPin` sits at `building.position` → no pin. **Position is a RENDER fact and belongs to the slab, not content — the reader has been sourcing it from content and only got away with it because LS conflates the two.** The building ids match fine (201/225 HiPointe listings resolve to slab ids); it's purely the missing coordinates.

## The design to build to (settled — build to THIS)
**Source building positions from the SLAB index, with LS's content-position kept as the preferred value so LS stays byte-identical.** A single resolver, routed into the content-side consumers:

- **The resolver** — `resolveBuildingPosition(building)` (put it where the consumers can share it; a small util or a hook that reads the slab index):
  1. If `building.position` exists (LS legacy content) → return it **unchanged** (LS zero-change).
  2. Else look up `useSlabBuildingIndex.getState().index?.byId.get(building.id)` → compute the **XZ centroid of `entry.footprint`** (`footprint` is `[x,z]` pairs), `y = entry.baseY ?? 0` → return `[x, y, z]`.
  3. Else (id not in the slab — ~24/225 HiPointe listings from dropped/curated buildings) → return **null**.
- **The slab index is ASYNC** (published by `SlabBuildings` after it parses the `.bin`). Consumers that render (the pins) must **subscribe reactively** to `useSlabBuildingIndex` so pins appear once it publishes; consumers on user-action (a click, after the scene is up) can read `getState()`.
- **Graceful null** — when the resolver returns null, the **click opens the place card directly** (no fly-to) instead of throwing, and **no pin** draws for that listing. This also fixes the current `if (building) { fly — throws }` path: resolve position → if present highlight + fly; else open the card.

## Exact anchors (route these consumers through the resolver)
- **Fly-to:** `computeCenterOn(building)` — `src/components/SidePanel.jsx:106` **and** the duplicate in `src/components/GlassSearch.jsx:10` (unify them — `feedback_customs_identity_must_unify_across_consumers`). Both read `building.position[0]`/`[2]`.
- **The click handler:** `handleSelectPlace` in `SidePanel.jsx` (~L493) — `const building = _buildingMap[biz.building_id]; if (building) {highlight; computeCenterOn}` → resolve position, fly only if non-null, else open the card (`useSelectedBuilding.getState().select(...)`, the existing else branch).
- **Map pins:** `MapPin` (`src/components/LafayetteScene.jsx:1035`) — its `<group position={[building.position[0]+xOffset, 0, building.position[2]+zOffset]}>` (~L1072); rendered by `LandmarkMarkers` (~L1145, maps `filteredLandmarks` → `<MapPin listing building>`). Trace how `LandmarkMarkers` resolves each `building` (likely `_buildingMap[listing.building_id]`) and give it the resolved position; a listing whose position is null is **skipped** (no pin).
- **The slab index (position source):** `src/hooks/useSlabBuildingIndex.js` — `index.byId: Map(stringId → { footprint, roofOutline, centroidY, baseY, … })`, published in `src/components/SlabBuildings.jsx` (~L142–172; `footprint[i] = [fpView[...], fpView[...]]`).
- **The content map (content-only for HiPointe):** `src/data/buildings.js` — `buildingMap` keyed by `b.id`. **Do not** add geometry here.
- **Lower priority (delivery-gated, do LAST or note-and-skip):** `PlaceCard.jsx:4031` `buildingPosition={building?.position}` feeds the Cary "deliver from here" button — HiPointe delivery is off, so this is inert there; route it through the resolver for correctness if cheap, else flag it.

## ⛔ Out of scope — do NOT touch (surface drift before crossing)
- **The LIVE per-`<Building>` render path in `LafayetteScene`** (the many `building.position` reads at ~L116–702: Foundations, extruded geometry). That path is **hidden in slab mode** (both LS and HiPointe render via `SlabBuildings`) — it's not the bug and not your job. Only the **pins + fly-to + card** are.
- **Do NOT stamp `position` into `roster.json`** (or any content) — that re-duplicates render geometry into content, the exact conflation we're untangling.
- **Do NOT fully migrate LS off its content-position** onto the slab in this pass — the resolver *prefers* `building.position` when present precisely to keep LS untouched. Unifying LS onto the slab is a future cleanup; note it, don't do it.
- Backend/tenancy, trees, and the Phase-4 copy are other arcs.

## Verification (the eye-gate — drive the real app, don't trust a proxy)
- **LS byte/visual-identical** (`?look=lafayette-square`, the hard gate): pins land in the same spots, clicking a business flies the camera identically, place cards open as before. The resolver returns LS's own `building.position`, so this must be unchanged — prove it by eye (`feedback_proxy_render_is_not_the_operator_eye`).
- **HiPointe fixed** (`?look=hipointe-demun`): map pins draw for establishments; clicking one in Society flies the camera + opens the place card; the ~24 slab-less listings open a card with no fly-to (no crash, no console throw).
- `vite build` green. Don't claim "confirmed" without driving both looks in the lit app (`feedback_dont_claim_confirmed_without_verifying`).

## Commit boundaries
Worktree branch; **canon docs off-limits** (Boz folds the outcome into `ls/ARCHITECTURE.md` + `SLAB-CONTRACT.md` after eye-gate). Commit only your own files. No collision with the impostor agent (tree files). Surface any scope drift before crossing it (`feedback_baby_must_surface_scope_drift`).
