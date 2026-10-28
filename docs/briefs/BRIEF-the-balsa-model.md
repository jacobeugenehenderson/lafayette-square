# BRIEF — the balsa model: the town looks finished and holds nothing until it is asked

<!-- BRIEF-STATE
status: OPEN (plan; not dispatched)
dispatched: no
written: 2026-10-27 night (Boz, at Jacob's request: "write the balsa model plan")
evict-when: a town's first paint and its pan/zoom carry no per-building identity, a click resolves one and loads its contents,
the measured budget (§3 step 1) is met on desktop and phone, the checks below are GREEN, merged, and Jacob passes it by eye.
Then this moves to cartograph/_archive/ dated.
-->

**Agent: FRESH, or Ward's seat.** **Report to Boz.** **Instruction: measure, then confirm-then-build.** The code sites below are
Boz's read at integration 5e242dce, not Zob's. Confirm each against the source before you build on it. If the code disagrees,
stop and flag it; the stop is the deliverable.

## 0. The ask, in Jacob's words (2026-10-27 night)

- *"We need the **entire** landscape to be made of balsa wood until a building is actually clicked. We have achieved some kind of
  interactivity but we need quick map ix and unfortunately that's not possible in our current regime. I think this is both
  encoder side and Ward."*
- *"It has to look good. It just doesn't need to 'contain' anything until it's asked to."*
- What it doesn't contain: *"Building ID."*

So **balsa is not a cheaper LOOK.** The town looks as it does today, or better. It is SOLID like an architect's model: nothing in
it knows which building is which until a click asks. Speed comes from what isn't loaded or tracked, never from a lower look. That
squares with `ORIENTATION §5`: photorealism is the destination, and inertness is how you move around it.

## 1. What the code does today (Boz's read; confirm by symbol)

- **Identity is loaded up front and stamped into the geometry.** `buildings.json` (v3, `SLAB-CONTRACT §6`) carries a per-building
  index (`buildings[]`: id, footprint and roof ranges, materials, zoning, address, neon faces and frontage, tint, vertex ranges),
  and the numeric id is stamped per vertex as `aBuildingId`. `SlabBuildings.jsx` parses the index and publishes it to
  `useSlabBuildingIndex`, which neon, selection, `SidePanel`, `LandmarkMarkers`, `SetPiece`, `Town` and `usePostFxDriver` read.
- **The geometry WAITS on the identity.** `CityModel.jsx`: *"Geometry build WAITS on the identity index — stamping aBuildingId
  needs idToNum"*, and each glTF tile fetches an `…_buildings.ids.json` sidecar. That is the regime Jacob names: the town can't be
  drawn before it knows who everyone is.
- **Two building renderers exist,** `SlabBuildings` (merged group meshes) and `CityModel` (glTF tiles, covering part of the town,
  with SlabBuildings drawing the rest). The balsa model has to be ONE answer across both, or the case for keeping two has to be
  stated. ⛔ Not two regimes.
- **Selection is a store** (`hooks/useSelectedBuilding.js`: `selectedId`, `hoveredId`, `select`, `highlight`) fed by a raycast that
  reads `aBuildingId` off the hit face (`CityModel`'s resolve, the same as SlabBuildings').
- **Hover is per-building identity on every pointer move** (`hoveredId`). Under balsa, hover has nothing to resolve.

## 2. The shape of it

**Encoder (the kit's bake):**
1. **The look:** the landscape and buildings as drawn today, with no per-building identity in it (no `aBuildingId`, no index in the
   first payload). Merged as far as the renderer allows.
2. **The address book:** a separate, small, on-demand file that answers *"what stands at this point?"* (footprints → id, a
   spatial index), fetched on the first click or idle after first paint. ⛔ Never in the first paint's critical path.
3. **The contents:** per-building records (today's index entry plus the content layer's card), fetched by id, one building at a time.

**Ward (the player):**
1. Draws the look straight away. Pan and zoom touch no per-building state.
2. **A click** → the address book (fetched if not yet) → an id → that building's contents → the card, plus the selection highlight
   drawn as an overlay from the building's own footprint, not by re-colouring vertices by id.
3. Search and deep links (`GlassSearch`, a shared building link) are "being asked" too: they resolve an id the same way.

## 3. The work, in order

1. **MEASURE FIRST, before any design is fixed.** "Quick map ix is not possible in our current regime" names a symptom. Measure
   where the time goes, on LS, HPDM and PTown, desktop and phone (the downres ladder's surfaces), through the buttons' routes:
   - first paint;
   - time until pan/zoom is smooth;
   - frame time while moving;
   - click-to-card latency;
   - how much of each is identity (index parse, sidecars, `aBuildingId` stamping, hover raycasts, neon) and how much is the look.
   ⛔ If identity isn't where the time goes, say so and stop: the plan changes. Reuse `BRIEF-hero-arrival-perf`'s instruments and
   `scratch/frame-timeline/` before building new ones.
2. **The contract:** a `SLAB-CONTRACT` revision splitting the look, the address book and the contents, with a version bump. A
   consumer refuses a version it doesn't know.
3. **Encoder:** bake the three. One producer.
4. **Ward:** draw the look without identity. Click and search resolve through the address book. Delete the per-vertex id path and
   the up-front index read in the same commits (the three-part fix), including the sidecar wait in `CityModel`.
5. **Every reader of `useSlabBuildingIndex` moves to "asked for"** or is named an exception in §4 with Jacob's ruling.

## 4. Jacob's rulings (2026-10-27 night)

1. **Neon comes from hours** (*"Neon is from hours"*). Which buildings glow is a fact of the look at a given time, not something
   asked. So the encoder bakes the glowing faces with their hours as a time-keyed layer that needs no building id at runtime. The
   Ward lights them by the clock. ⛔ The night glow must not pull the address book or the index into the first paint.
2. **No hover** (*"I do not like the light-up-when-mouse-passes-over-it in general, too much"*). Hover highlighting is DELETED,
   not disabled: `useSelectedBuilding`'s `hoveredId` / `setHovered` / `clearHovered`, and every per-move raycast that feeds them.
   A click is the first sign of life. No pointer-cursor change either (Jacob: *"let's just ditch for now"*).
3. **Pins and the side panel load when asked, prefetched nearby** (*"Loaded when asked, but nearby for quick access"*). Nothing is
   in the first paint. After it, at idle, the Ward prefetches the address book and the contents near the camera, so a click there
   is instant. ⛔ A prefetch never blocks or stutters a pan.
   **What is asked for is a TAB** (*"the idea is the 'category' and 'subcategory' tabs. We need two that are generic enough to
   encapsulate the active tiles"*). The side panel's two tiers (category → subcategory, `src/tokens/categories.js` `CATEGORY_LIST`,
   read by `SidePanel.jsx`) are what a viewer opens, and opening one loads its listings. Boz's reading, to confirm with Jacob: the
   two tiers become a KIT vocabulary, generic enough that every town's active listings fall under them. ⚠️ Today's vocabulary is
   LS's: a subtitle reads *"Lafayette Park, gardens, pool, playgrounds"* and the component is `LafayetteCategoryAccordion`. That is
   Layer 0's Class D bleed, and it is fixed in the same work.
   **Society Pages opens on the most generic listing of the neighbourhood** (Jacob: *"'All open establishments'? 'All
   establishments'?"*). ⟦open: the label⟧. Boz's suggestion: open on *All places*, with *Open now* as the first narrowing, which
   is the same fact the neon shows.
   *Open now* is never an empty page (Jacob: *"What if only one thing is open? None?"*). It lists what is open, then what opens
   NEXT, in order, with the time ("Opens 7:00"). With nothing open, it leads with the next to open.
4. **Trees, lamps and water are part of the look, always drawn.** They need no per-object identity, so balsa costs them nothing:
   they stay as they are, carrying nothing per object at runtime. (Boz, answering Jacob's *"trees lamps and water are mandatory?"*;
   confirm by measurement in step 1 that none of them reads building identity.)

## 5. Checks (each reads the source; each seen to fail)

- `claims-the-first-paint-carries-no-building-identity`: the first paint's requests and the parsed payloads hold no building id
  (mutant: put the index back in the first payload → RED).
- `claims-a-click-is-the-first-identity`: no building id is resolved before a click, search, deep link or nearby prefetch, and no
  pointer-move raycast exists (mutant: a hover raycast → RED).
- `claims-the-night-glow-needs-no-identity`: neon lights from the baked hours layer with no address book loaded (mutant: neon
  reads the index → RED).
- The measured budget from step 1, as a check on staging (the frame-timeline instrument), on desktop and phone.

## 6. Bounds

- Encoder and Ward both: branch off `integration/2026-10-20` in `.claude/worktrees/`; Boz merges on Zob's PASS (code) and Ward's
  green (player). Commit messages name the register reached; FEATURES gains "the town opens instantly and is solid until you
  touch it", in a marketer's words, when it ships.
- ⛔ No look downgrade is an answer. If a measurement says the look itself is the cost, bring it to Boz; that is the downres
  ladder's question (`qualityProfile.js`), not this brief's.
- One agent at a time (token budget). Measurement (step 1) is its own dispatch.
