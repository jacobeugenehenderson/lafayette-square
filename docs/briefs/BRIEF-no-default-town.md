<!-- BRIEF-STATE
status: BUILT 2026-09-28 (authoring scope) — DEFAULT_LOOK remains only for non-authoring pages (the old player), which go at cutover
dispatched: yes (Mortise)
written: 2026-09-28
evict-when: node checks/claims-a-look-link-opens-that-town.mjs (extended by §4) is green with DEFAULT_LOOK gone from src/instance.js
-->
# BRIEF — No default town: the authoring apps start with no town, not Lafayette Square

**For:** Mortise, after Warden reads it. **Standing order (Jacob, via Warden, 2026-09-28):** Lafayette Square is never
the fallback, anywhere. **Written, not built** — Warden: "write it, don't build it."

## 1. Where it stands (landed 2026-09-28)
- A `?look=` link opens that town; a bad link opens none and says why (`31a503a8`).
- A cold Stage (no link, nothing stored) opens **no** town: the store's scene is null, no town's data is fetched,
  and the Look menu reads **Choose a town** and lists them all (`0c6de1da`). `townForLook(null)` throws.
- ▶ `node checks/claims-a-look-link-opens-that-town.mjs` (runtime; fresh storage per tab).

## 2. The seam left — `src/instance.js`'s `DEFAULT_LOOK`
`INSTANCE` is resolved **at module load** by `readLookParam()`: the production host's `<meta name="ward-look">`,
then `?look=`, then (authoring apps) the stored Look, then a path segment — **else `DEFAULT_LOOK`
(lafayette-square)**, logged loudly. So a cold authoring page still runs its module-load readers on LS's place
until a town is chosen (choosing reloads the page onto it — `Toolbar.jsx`), and Preview with no `?look=` draws LS
(`resolvePreviewLookId()` answers `INSTANCE.lookId`).

## 3. Scope — who reads `INSTANCE` (measured 2026-09-28: 38 files outside instance.js, by import closure)
- **Through `<Town>` (what The Ward reaches): 0.** `claims-the-town-reads-no-player-store` keeps it 0.
- **Authoring apps — IN SCOPE (7):** `cartograph/SkyGradientGrid.jsx` (`INSTANCE.geography` at load — the picker
  screen's sky), `cartograph/Toolbar.jsx` (`INSTANCE.mapId`, the reload-on-choose), `components/DawnTimeline.jsx`,
  `lib/dawnTimeline.js`, `data/buildings.js`, `hooks/useListings.js`, `preview/PreviewApp.jsx`.
- **Entries and harnesses — IN SCOPE (5):** `placeBootTown.js`, `hooks/useInit.js`, `harness/lab/{main.jsx,
  stage.js,legibility.jsx}`.
- **The old player only — OUT OF SCOPE (26): goes at cutover.** `App.jsx`, `Scene.jsx`, `SidePanel.jsx`,
  `PlaceCard.jsx`, the modals (Bulletin, Chat, CodeDesk, Contact), Cary/Courier, `LegalPage.jsx`,
  `instances/copy/*`, `lib/{api,assetUrl,commerceApi,resolveLookId,sources,townMark,townOrigin}.js`,
  `hooks/useEvents.js`, `AlmanacEmbed`, `SkyEmbed`, `TreeDiorama`. The old player is frozen to fixes; no effort
  goes into making it tolerate "no town".
▶ Re-derive the lists, never quote them: the classifier is the import-closure walk used for this brief (Town.jsx,
CartographApp.jsx, PreviewApp.jsx, main.jsx closures ∩ files reading `INSTANCE`).

## 4. The work
1. **An authoring page with no town has `INSTANCE = null`** (`readLookParam` returns null in the authoring apps
   instead of `DEFAULT_LOOK`). The production host path is untouched (its meta always names a town).
2. **Each in-scope reader takes the town it is drawing, or draws nothing:** SkyGradientGrid reads the placed town
   (`townPlace()`, which throws until placed) instead of `INSTANCE.geography` at load; `placeBootTown.js` places
   nothing when there is no town; Preview with no `?look=` shows the same **Choose a town** menu, not LS.
3. **`DEFAULT_LOOK` is deleted** from `src/instance.js` for every path except the old player's, which keeps its own
   named constant until cutover — named in the old player, not in the kit.
4. **Check:** extend `claims-a-look-link-opens-that-town` — a cold Stage and a cold Preview resolve no town AND load
   no town's place (`townPlace()` unplaced; no `/baked/<town>/` fetched). Seen red first.

## 5. Out of scope
The old player (§3). The production Worker's host→town resolution. Any Look authoring change.

## 6. Built (2026-09-28)
- **The harm, measured red first:** `cartograph.html?scene=huron` opened huron in the store with `INSTANCE` still
  lafayette-square — 0 of 83 listing buildings existed in huron's slab, so every neon drew UNKNOWN slate.
- `src/instance.js`: an authoring page (`<meta name="ward-authoring">` — Stage AND Preview now) resolves `?look=` →
  `?scene=` (that scene's Look) → the stored Look → **none** (INSTANCE = null). Non-authoring pages keep DEFAULT_LOOK
  until cutover.
- Content and place take the town or nothing: useListings, data/buildings.js load nothing for no town; placeBootTown
  places none; DawnTimeline, dawnTimeline.js, SkyGradientGrid read the placed town at use; Stage's still-minute sync
  waits for a placed town.
- ONE rule replaces the Toolbar's pick-only reload: when the store's town is not INSTANCE's (a pick, ?scene=, the Looks
  alignment) Stage reloads onto it — never over an unsaved edit (blocked loudly), once per town.
- Preview with no town offers a chooser.
- ▶ `node checks/claims-a-look-link-opens-that-town.mjs` — ?scene=huron: INSTANCE huron, listings 288/288 in its slab;
  cold Stage: INSTANCE null, picker 6/6; cold Preview: no town, chooser 6/6.
