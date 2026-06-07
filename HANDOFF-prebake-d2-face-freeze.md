# HANDOFF — D2: Prebake face freeze (topology) — move `extractFaces` upstream, freeze `tiles[]`

**Goal:** make the block-face **topology** a frozen prebake artifact instead of a per-build derivation. Today `tileGround.extractFaces` walks the skeleton chains' shared-vertex graph **on every render and bake** to build the tiles. D2 runs that **once, in prebake**, freezes the result into `ribbons.json` as `tiles[]`, and has `tileGround` **consume the frozen tiles** — no behavior change, **byte-identical render**. This is the structural move that lets the Data Wall sit at **~P3** (chains die at the prebake→Survey boundary) and unlocks the activated-block perf model (D5) downstream.

**Agent: FRESH** (name yourself — one word, joins the name-trail). **`isolation: worktree`**, general-purpose. **Runs parallel to `HANDOFF-wall-phase-d.md`** — both edit `tileGround.js` but in *different functions* (Phase-D: `sectionPass` ~`:515`/`:1827` + `BlockGeometryV2Debug`; you: `extractFaces` `:324`/`:833` + the prebake compile). Low conflict; Boz lands via targeted checkout. Don't touch Phase-D's files.

**This is L1 ONLY.** Freeze the **tile topology** (ring + per-edge tags). **Do NOT** touch corner construction / corner identity — that's L2 = **D3, deliberately deferred to BACKLOG §HARDENING** (the false-corner cure is already live + working via intersection-everywhere `9c275ce`; relocating it risks regressing a working fix). Corners stay live and untouched. This keeps D2 byte-identical.

---

## Read first (to the section)
- **`cartograph/PREBAKE-POLYGONIZATION-PLAN.md §1`** — "Where the freeze lives" + **"What exactly freezes (the granularity)"**: L1 = `extractFaces` output (ring + per-edge `(skelId, side)`), and **the smoothing wrinkle** (the one design decision you must make — see below). **`§4` D2 row** — the gate.
- **`cartograph/PREBAKE.md §5`** — the target (freeze the polygon substrate from the skeleton, once). **`§6`** — the two-step rebuild law.
- **`cartograph/WALL.md §6`** — why the wall belongs at ~P3 (what this enables).
- ⛔ Skip the corner sections (`§2`/D3) — out of scope.

## Verified code anchors (re-checked 2026-06-07)
- `src/lib/tileGround.js:324` — `export function extractFaces(streets)`. **Pure** function of `streets[].points`; returns `faces[]`, each `{ ring, edges[] }` where `edges[i]` is the directed half-edge `ring[i]→ring[i+1]` carrying **`(streetIdx, forward)`** (forward half-edge ⇒ tile on the street's measure-RIGHT; reversed ⇒ LEFT — see the comment at `:374-378`). Called **once** at `:833` (`const tiles = extractFaces(streets)`), over the (optionally smoothed) `streets`.
- `src/lib/tileGround.js:640,669,1843` — `smooth` handling. Default `0`; bake passes `smooth:0` (`bake-ground.js:296`); live may pass `streetSmooth`. `smoothChain` is **junction-pinned + interpolating** → a pure per-edge geometric map that **cannot change topology**.
- `cartograph/derive.js` — the prebake compile (the skeleton→ribbons derivation). ⚠️ Note `derive.js:1173` `polygonize(nodedSegments)` builds the **raw-OSM** `faces[]` — that is the *two-source seam* (`ribbons.faces`, consumed only as an LU paint lookup). **That is NOT your topology** and **C5 is D4, not D2** — leave `ribbons.faces` alone. Your `tiles[]` is a NEW, skeleton-derived field alongside it.
- `cartograph/promote-ribbons.js` / `cartograph/pipeline.js` — the compile orchestration; `ribbons.json` is the artifact.

## The task
1. **Run `extractFaces` at prebake** over the **skeleton chains** (the same `streets` topology `tileGround` feeds it today — unsmoothed; see the wrinkle). Emit a frozen **`tiles[]`** into `ribbons.json`: per tile `{ ring, edges:[{ skelId, side }] }`.
   - ⚠️ **Stable identity (the crux).** `extractFaces` tags edges with `streetIdx` (an *array index*). Freeze a **stable `skelId`** instead (resolve `streets[streetIdx]` → its skeleton id at freeze time), so frozen tiles survive across builds where array order may shift. `side` = the measure side derived from `forward` (per the `:374-378` convention).
2. **Consume the frozen `tiles[]` in `tileGround`** — at `:833`, when `ribbons.tiles` is present, use it instead of calling `extractFaces`. Map each frozen edge's `skelId` back to the current `streets` entry so all downstream lookups (`edgeDepth` / `effectiveMeasure` / median detection / measure-side) resolve **identically** to today. Keep `extractFaces` as the fallback when `ribbons.tiles` is absent (older artifacts).
3. **Decide the smoothing wrinkle** (`PLAN §1`, explicitly): freeze **unsmoothed** topology (correct — smoothing can't change topology), and apply `smoothChain` at reshape time to the frozen rings' edge runs, junction-pinned as today. Do **not** bake the smooth into the frozen rings. Document the choice in your report.
4. **Two-step rebuild** to regenerate the artifact: `skeleton.js → pipeline.js → promote-ribbons.js` (`PREBAKE.md §6`). Confirm `ribbons.json` now carries `tiles[]`.

## The gate (definition of done) — BYTE-IDENTICAL
The freeze must be **invisible**. Prove it both ways:
- **Assert harness** (scratch): for every tile, frozen-consumed topology == live `extractFaces` topology (same rings, same per-edge `(skelId→streetIdx, side)` after id-mapping). Zero diff.
- **Screenshot A/B**: LS Survey render (and the bake) frozen-tiles-ON vs OFF — pixel-identical (or report any diff with the exact tile + cause). ⚠️ Proxy renders have misled on this map — but byte-identical is a *machine* check, not an eye check, so the harness is the real gate here; the screenshot is the backstop.

## Boundaries
- Code on your worktree. ⛔ **No corner change** (D3/hardening). ⛔ **No LU / `ribbons.faces` / `polygonize` change** (C5 = D4). ⛔ **No Phase-D files** (`sectionPass`, `BlockGeometryV2Debug`, `shape.json` load). ⛔ **No canonical-doc edits** — report findings, Boz folds them.
- If you find that freezing can't be made byte-identical (e.g. an id-mapping ambiguity, a smooth-order subtlety), **STOP and flag Boz** — do not paper over a diff. A non-invisible freeze fails the gate.

## Report back
What you wired (the `tiles[]` schema you chose + the skelId resolution), the smoothing decision, the assert-harness result (the zero-diff proof), the A/B screenshot, and anything that pushed back on this brief. Commit on your worktree.

## Out of scope (the sequence after you)
D3 corner-identity-at-prebake (→ §HARDENING) · D4 LU-at-prebake + retire C5 two-source seam · D5 activated-block reshape (the perf payoff this freeze unlocks; overlaps Wall Phase-D — coordinate later).
