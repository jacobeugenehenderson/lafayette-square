# BAKE.md §5 — the DONE list, retired 2026-09-25

Retired from `cartograph/BAKE.md` in the docs pass of 2026-09-25 (Jacob: *"net down to a
pristine documentation of truth only"*). Every line below was TRUE and shipping; that is
precisely why it no longer belongs in canon, which carries live doctrine and open state.
⛔ Nothing here is superseded — do not read it as a record of things that stopped being true.
The two lines that carried live doctrine (the bake-svg absence, and the terrain step) were
not moved here: the first was deleted as a note about a script that no longer exists, and
the second was rewritten in place.

**DONE (shipping, verified in code):**
- ✅ The full chain runs incrementally, dirty-skipped, with mtime discipline (`writeIfChanged`, `serve.js` `runIfDirty`). No-op bakes ~1ms; layer-vis bake-gating live.
- ✅ `ground` / `buildings` / `lamps` / `scene` / `trees` / `ground-ao` all emit and are consumed by production (the L1.1/L1.3 cutovers — `SLAB-CONTRACT.md §11`).
- ✅ `shape.json` (WALL artifact) emitted by `bake-ground.js` when `emitArtifact:true`; Section opens it chain-free (`ef460d1`, `PIPELINE.md` §5 (the Wall)).
- ✅ The slab is **look-complete** for the shipped channels (SC.1–SC.3 + SC.7 baked into `scene.json` — see `STAGE.md §5`).
- ✅ **Scene-generic bake (2026-07-03/04).** A poured neighborhood bakes a full slab (ground/lightmap/buildings/scene/shape) from its own OSM via the Pour tool; the "scene-specific pipeline not yet implemented" comment was conservative (§1). Poured scenes get **polygon + activate/hide building membership** — applied in `pipeline.js` (the single filtered `map.json` source), belt-and-suspendered in `bake-buildings.js` (step 4; `NEIGHBORHOOD-INPUTS §5.2`). Buildings load via a per-scene **render ledger** (`data/<scene>/buildings.json`), retiring the LS source hardwire.

Also retired in the same pass, from §1:

> **`bake-svg.js` is not in the chain — the script no longer exists at all** (`serve.js`
> carries only a note where it used to run). The runtime consumes `ground.json`/`bin`/
> `lightmap` exclusively; a stale `public/looks/lafayette-square/ground.svg` remains on
> disk, read by nothing.
