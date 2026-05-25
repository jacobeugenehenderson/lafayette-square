# Brief 14.1 — Decouple Procedural Re-publish from auto-bake

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name that has not already been used in this project.** Babies here pattern-match to names in NOTES.md / commits and pick collisions (Holm, Cambium were repeat misfires). **Do not reach for a name you see in adjacent code** — Lintel especially (this brief mirrors Lintel's Brief 14).

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Pick something novel** — a non-plant noun, a mineral, a tool, a star, a weather term, an architectural term, an invented word. The plant-adjacent namespace is saturated; reach further. State your name in your first message; sign your commits with it.

---

## Why this brief exists

Brief 14 (Lintel, commit `f8246a5`) decoupled the **Salon** Re-publish from the slab bake: `/salon/:species/publish` no longer fires `bakeLook` fire-and-forget — it stages species artifacts only, and the slab bake became the explicit Grove gesture. Per `[[project_authoring_is_live_production_is_static]]`, staging-to-library (authoring) and baking-the-slab (production) are opposite sides of the slab boundary; fusing them means rapid iteration spam-bakes the slab.

Lintel surfaced that **`/procedural/:species/publish` (serve.js ~1430-1470) has the identical auto-bake fire-and-forget** (lines ~1454-1458) that Brief 14 removed from the Salon path. This brief applies the same decouple to the Procedural endpoint for consistency. (No LiDAR `/publish` endpoint has the pattern — confirmed by Lintel.)

## Read first

- `arborist/BACKLOG.md` — Brief 14 entry (Lintel, shipped) — your exact precedent
- `arborist/serve.js` lines ~1426-1470 — the `/procedural/:species/publish` endpoint. Lines ~1454-1458 are the `bakeLook(lookName)` fire-and-forget you remove. Compare against the Salon endpoint (~1262-1296) Lintel already cleaned — mirror his change.
- `arborist/generate-procedural.js#main()` — **verify whether it calls a `syncLookRoster`-equivalent.** The Salon path keeps `syncLookRoster` (metadata-only roster sync) and only removes the bake. The procedural endpoint's comment (line ~1452-1453) says its auto-bake "mirrors the Grove roster save" — so procedural's roster sync may happen via Grove, not in `generate-procedural.js`. Confirm where procedural's roster sync lives so you don't accidentally orphan it.
- `src/arborist/ProceduralWorkstage.jsx` — the Re-publish button + copy. Note: post-Brief-18A, ProceduralWorkstage is legacy (reachable only via `?legacy=procedural`). A copy tweak is low-value but trivially mirrors Lintel's Salon copy — your call whether to bother; surface the decision.
- Memory: `[[project_authoring_is_live_production_is_static]]`, `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`.

## Goal — and what this phase explicitly does NOT do

**Goal:** `/procedural/:species/publish` stages species artifacts + rebuilds the index (+ whatever roster sync it does today) and returns — without firing `bakeLook`. The slab bake is the explicit Grove gesture, same as the Salon path post-Brief-14.

**Do NOT:**
- Touch the Salon publish path (Lintel already did it; don't re-edit).
- Touch `/atlas/bake` (Grove's bake trigger — stays).
- Remove or alter procedural's roster sync (if it has one) — only remove the `bakeLook` fire-and-forget. **Verify where the roster sync is first.**
- Touch `generate-procedural.js`'s generation logic.
- Add ceremony (dialogs, wizards). One behavioral deletion + optional copy tweak.

## Architecture

Surgical, mirrors Lintel's Brief 14:
- In `/procedural/:species/publish`, remove the `bakeLook(lookName)` fire-and-forget block (lines ~1454-1458). Keep: the `generate-procedural.js` shell-out, the `rebuildIndex()` call, the response shape.
- The `?look=` param can stay accepted + echoed (now vestigial, like Lintel left it on the Salon path) — dropping it would mean a client edit for zero gain. Mirror Lintel's choice for consistency.
- If `ProceduralWorkstage.jsx` has Re-publish copy implying a slab update, optionally reword to the two-gesture model ("stages to library; bake from Grove") — but it's legacy chrome, so low-priority. Surface whether you touched it.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/serve.js` | edit — remove `bakeLook` fire-and-forget from `/procedural/:species/publish` | -5 |
| `src/arborist/ProceduralWorkstage.jsx` | optional — Re-publish copy tweak (legacy chrome; your call) | +0-8 |
| `arborist/BACKLOG.md` | edit — mark Brief 14.1 shipped | +3 |
| `arborist/NOTES.md` | edit — short session entry (or fold into a one-liner under Brief 14's) | ~15 |

Estimated ~25 LOC, mostly docs.

## Acceptance criteria

1. **Procedural Re-publish writes artifacts without baking.** Trigger `/procedural/:species/publish` on a procedural species. Verify `public/trees/<species>/...` + index update, but the slab atlas (`public/baked/<look>/trees-atlas.json` + master PNG) does NOT change (sha1/mtime before-after). Same test Lintel ran on the Salon path.
2. **Grove bake still works** — unchanged.
3. **Procedural roster sync (if any) intact** — whatever metadata sync procedural did before (Grove-side or in-script) still happens. You only removed the bake.
4. **Salon path unaffected** — Lintel's Brief 14 behavior unchanged.
5. **No regression in procedural publish artifacts** — `generate-procedural.js` output byte-identical (you only removed a downstream trigger).
6. Clean console; publish completes; Grove bake completes.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`:
- **Where procedural's roster sync lives.** If removing the auto-bake orphans the roster sync (i.e. procedural relied on the bake to also sync the roster), surface immediately + preserve the sync.
- **Posterized auto-extract.** Vellum's posterized extraction rides `bake-look.js`. Lintel verified it relocated cleanly to the Grove bake on the Salon path. Confirm the same holds when procedural's auto-bake is removed (it should — the extract is tied to bake-look wherever it runs).
- **ProceduralWorkstage legacy status.** It's `?legacy=` only now. If the copy tweak feels like polishing a soon-to-retire surface, skip it + say so.

## Out of scope

- Salon publish path (done by Lintel)
- `/atlas/bake` endpoint
- LiDAR publish (no auto-bake pattern there)
- Procedural generation logic
- The 18B source-picker that will eventually fold ProceduralWorkstage into Salon

## Dispatch posture

Cold dispatch. **Parallel-safe with Brief 3A** (3A touches `treeAtlasMaterial.js` / `InstancedTrees.jsx` / `SalonWorkstage.jsx` / `SpecimenViewport.jsx` / `generate-salon.js`; 14.1 touches `serve.js` / `ProceduralWorkstage.jsx` — zero overlap). Single commit when AC 1-6 pass. Title: `arborist: Brief 14.1 (<your-name>) — decouple Procedural Re-publish from auto-bake`.

— Boz
