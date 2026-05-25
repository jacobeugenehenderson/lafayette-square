# Brief 14 — Decouple Salon Re-publish from auto-bake

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name that has not already been used in this project.** Babies here pattern-match heavily to names in NOTES.md / BACKLOG.md / commits and pick collisions; Jacob has had to redirect repeated misfires (Holm, Cambium). **Do not reach for a name you see in adjacent code.**

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Pick something novel.** A word, a symbol, a string of sounds, another language, something invented, a non-plant noun, a mineral, a tool, a star name, a piece of weather, a body of water, an architectural term. The project has saturated the plant-adjacent namespace; reach further. State your name in your first message back; sign your commits with it.

---

## Why this brief exists

Today Salon's **Re-publish** does two implicit operations in one gesture:

1. **Stage to library** (authoring side): `generate-salon.js` + `publish-glb.js` write species artifacts to `public/trees/<species>/...`, then `build-index.js` rebuilds the roster index. This is the operator iterating on a composition.
2. **Ship to slab** (production side): the `/salon/:species/publish` endpoint fires `bakeLook(lookName)` **fire-and-forget** (`arborist/serve.js` line ~1280-1284), which runs `bake-look.js` + `bake-trees.js` — rebuilding the master per-Look atlas / slab artifact.

Per `[[project_authoring_is_live_production_is_static]]`, operation (1) is authoring-side ("stage to library") and operation (2) is production-side ("ship to slab"). **Conflating them in one gesture means rapid chassis iteration in Salon spam-bakes the slab** — every Re-publish triggers a full atlas rebake, even when the operator is mid-iteration and nowhere near ready to ship. It also muddies the operator's mental model about *when LS is actually changing.*

**Decouple them.** Re-publish ships species artifacts only (authoring side). Grove becomes the explicit bake trigger (production side) — Grove already has the `/atlas/bake?look=<id>` UX wired (`serve.js` line ~1018). Operator workflow shifts from one-click (publish + bake fused) to two intentional gestures: **Salon Re-publish (stage to library) → Grove bake (ship to slab).**

## Read first

- `arborist/BACKLOG.md` — Brief 14 entry
- `arborist/serve.js` lines ~1260-1296 — the `/salon/:species/publish` endpoint. Line ~1280-1284 is the `bakeLook(lookName)` fire-and-forget you remove. Line ~1015-1018 is the existing `/atlas/bake?look=<name>` endpoint Grove already drives — confirm it's intact.
- `src/arborist/SalonWorkstage.jsx` — the Re-publish button + any "publishing…" status copy. You'll adjust the button's affordance/tooltip to reflect the new authoring-only semantics.
- `src/arborist/Grove.jsx` — confirm the existing bake trigger (`/atlas/bake`) is discoverable; this brief does NOT add new Grove UI unless the bake trigger is hidden (surface if so). Grove is the explicit ship-to-slab gesture now.
- `arborist/generate-salon.js#main()` — the `syncLookRoster(...)` call. **This stays** — it's metadata-only (adds the variant to the Look's design.json roster; harmless, doesn't rebake the atlas). Don't remove it.
- Memory: `[[project_authoring_is_live_production_is_static]]` (the doctrine this enforces), `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_salon_preview_is_authoring_surface]]`.

## Goal — and what this phase explicitly does NOT do

**Goal:** `/salon/:species/publish` writes species artifacts + rebuilds the index + syncs the Look roster (metadata), but **does NOT** fire `bakeLook`. The slab bake happens only via the explicit Grove `/atlas/bake` gesture. The Salon Re-publish button's copy/tooltip communicates the new semantics ("stages to library; bake the slab from Grove").

**Do NOT:**
- Remove `syncLookRoster` from `generate-salon.js#main()` — it's metadata-only roster sync, not an atlas bake. Keep it.
- Touch the `/atlas/bake?look=<name>` endpoint (line ~1018) — Grove's bake trigger stays exactly as-is.
- Touch `bake-look.js` / `bake-trees.js` / the atlas pipeline internals — this is purely about *when* the bake fires, not *how*.
- Change the Procedural or LiDAR publish endpoints' auto-bake behavior. Scope is the Salon publish path only. (Surface if you think they should follow — but don't ship it here.)
- Add a confirmation dialog or multi-step wizard to Re-publish. One button, new semantics, clear copy. No ceremony.
- Build new Grove UI unless the existing bake trigger is genuinely undiscoverable (surface first).

## Architecture

**Server (`arborist/serve.js`, the surgical change):**

In `/salon/:species/publish` (line ~1262-1296), remove the `bakeLook(lookName)` fire-and-forget block (line ~1280-1284). Keep: the `generate-salon.js` shell-out, the `rebuildIndex()` call, the response shape. The `lookName` query param can stay accepted (harmless) or be dropped from the response — your call; if you keep it, the response just no longer implies a bake happened. Surface which you chose.

After the change, the endpoint's contract is: "write species artifacts + rebuild index + (via generate-salon's main) sync the Look roster metadata. Returns when artifacts are on disk. Does not touch the slab atlas."

**Client (`src/arborist/SalonWorkstage.jsx`):**

The Re-publish button + its status copy should communicate the new mental model. Minimal change — adjust the button label/tooltip so the operator knows Re-publish stages to the library and the slab bake is a separate Grove gesture. Examples (pick what reads cleanly in the existing chrome):
- Button tooltip: "Stage this composition to the species library. Bake the slab from Grove when ready to ship to LS."
- Optionally a small inline hint after a successful publish: "Staged to library — bake from Grove to update LS."

Don't over-design the copy; one clear sentence is enough. The behavioral change (no auto-bake) is the substance; the copy just keeps the operator's mental model aligned.

**Grove (`src/arborist/Grove.jsx`):**

Confirm the `/atlas/bake?look=<id>` trigger is present + discoverable. If it's already a clear button (it should be — Grove is the roster-curation + bake surface), no change. If it's buried, surface that to Boz/operator — a small "Bake slab for this Look" affordance might be warranted, but don't build it speculatively; flag first.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/serve.js` | edit — remove `bakeLook` fire-and-forget from `/salon/:species/publish` | -6 |
| `src/arborist/SalonWorkstage.jsx` | edit — Re-publish button copy/tooltip + optional post-publish hint | +15 |
| `arborist/FEATURES.md` | edit — document the authoring/production gesture split | +10 |
| `arborist/ARCHITECTURE.md` | edit — note the decouple under the publish-loop section | +8 |
| `arborist/BACKLOG.md` | edit — mark Brief 14 shipped | +3 |
| `arborist/NOTES.md` | edit — session entry | ~30 |

Estimated total: ~55 LOC net (mostly doc + copy; the behavioral change is a 6-line deletion).

## Acceptance criteria

1. **Re-publish writes artifacts without baking.** Trigger Salon Re-publish on a species. Verify `public/trees/<species>/...` updates + `public/trees/index.json` rebuilds, but `public/baked/<look>/trees-atlas.json` + the master atlas PNG do NOT change (check mtime or sha1 before/after).
2. **Grove bake still works.** Trigger the Grove `/atlas/bake?look=<id>` gesture. Verify the master atlas rebuilds (mtime/sha1 changes). This path is unchanged from today.
3. **`syncLookRoster` still fires.** After Re-publish, the variant appears in the Look's `design.json` roster (metadata sync intact). This is the harmless metadata operation that stays.
4. **Re-publish copy communicates the split.** The button tooltip / post-publish hint tells the operator that Re-publish stages to library and Grove bakes the slab. Operator's mental model stays aligned.
5. **No regression in the publish artifacts.** `generate-salon.js` + `publish-glb.js` output is byte-identical to pre-Brief-14 (you only removed the downstream bake trigger, not the artifact generation).
6. **Procedural / LiDAR publish paths unchanged** (unless you surfaced + got approval to change them).
7. `npm run dev` clean console; Salon Re-publish completes without error; Grove bake completes without error.

## Composition with in-flight work

- **Brief 6.3 (in flight, parallel)** — touches `decimate-tree.mjs` + `publish-glb.js` + defaults. **Zero overlap** with 14's `serve.js` + `SalonWorkstage.jsx`. Parallel-safe.
- **Brief 18B (queued)** — will also touch `SalonWorkstage.jsx`. Not dispatched yet; if it dispatches while you're in flight, **serialize** per `[[feedback_load_bearing_files_serial_dispatch]]` — flag to Boz. As of dispatch, 18B is not running, so you're clear.
- **Brief 10B (Vellum — shipped)** — the posterized substrate auto-triggers from `bake-look.js`. Note: with auto-bake removed from Re-publish, the posterized extract auto-trigger now fires on the *Grove* bake gesture instead of the Salon Re-publish gesture (since that's where `bake-look.js` runs). This is correct — extraction stays tied to the bake step wherever it lives. Verify the posterized auto-trigger still fires when Grove bakes; surface if it doesn't.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`:

- **`lookName` param fate.** The endpoint accepts `?look=` today only to drive the auto-bake. With the bake removed, the param is vestigial. Surface whether you dropped it, kept it accepted-but-ignored, or repurposed it for the roster sync. Either is fine; just document.
- **Posterized auto-trigger relocation.** Per the composition note above — confirm Vellum's posterized extract still fires on the Grove bake path. If removing the Salon auto-bake accidentally orphans the posterized extraction, surface immediately.
- **Other auto-bake call sites.** If you find the Procedural / LiDAR publish endpoints have the same fire-and-forget pattern, surface them — operator may want the same decouple, but it's out of THIS brief's scope.
- **Grove bake discoverability.** If Grove's bake trigger is buried or unclear now that it's the *only* path to the slab, surface a recommendation (don't build speculatively).
- **Operator muscle-memory.** This changes a one-click habit into two gestures. If you spot a place where the old fused behavior is assumed elsewhere (docs, tooltips, other UI), surface it.

## Out of scope

- Atlas pipeline internals (`bake-look.js`, `bake-trees.js`, `unifyAtlases`)
- The `/atlas/bake` endpoint itself
- Procedural / LiDAR publish auto-bake (surface only)
- New Grove UI (unless bake trigger is undiscoverable — flag first)
- Confirmation dialogs / wizards
- Brief 18B's source-picker work

## Dispatch posture

Cold dispatch. Parallel-safe with Brief 6.3 (zero file overlap). Single commit when AC 1-7 pass. Title: `arborist: Salon — Brief 14 (<your-name>) — decouple Re-publish from auto-bake`.

— Boz
