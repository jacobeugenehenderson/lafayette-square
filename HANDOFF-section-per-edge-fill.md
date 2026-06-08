# HANDOFF — Section: the per-edge FILL (depth + divider + bent corner)

**Goal:** make Section's authoring *work* — per-edge ped depths and the treelawn/sidewalk divider, so a depth handle drags the strip live and the strips line up with the handles; corners take `cw + max-adjacent` depth (SW↔SW → sidewalk-deep). This is the last piece of "Section up and running."

**Agent: FRESH** (name yourself — one word, joins the name-trail). **`isolation: worktree`**, general-purpose (geometry build). Runs solo on `sectionPass` + the Measure overlay; coordinate with Boz before landing (it touches `tileGround.js`, where Ashlar's D2 also sits — different functions).

> ⛔ **SACROSANCT — the mono-width ribbon.** It was the hardest-won step in this whole project (`RIBBONS §3.9a`, the V1 keystone; the multi-month corner saga ended on it). **You build the per-edge variation INSIDE the mono-width band — you do NOT re-architect or replace the uniform outer offset that gives the clean bent corners.** If you find yourself rewriting the band offsets or constructing a corner primitive, stop and flag Boz — that is the forbidden move.

---

## Read first — to the section (the canon IS the spec; this brief just aims you)
- **`cartograph/SECTION.md §3.3`** — **the dispatch target.** The per-edge model, step by step (one depth resolution → mono-width + per-edge divider → corner = `cw + max-adjacent` → bent quad = `fullBand` slice), with the build boundaries.
- **`SECTION.md §3.1`** — the best-effort defaults you build over: treelawn Y/N gleaned + ADA depths, **and the two-strip ordering** (treelawn-Y `TL→SW→LU`; treelawn-N `SW→TL→LU`; two strips *always*, never collapse N to all-SW; both-LU = open field).
- **`SECTION.md §3.2`** — the override layer (material-swap, **already landed + live**); you extend the *same* per-run resolution to depths.
- **`SECTION.md §5`** — ⭐ **the one-depth-truth rule:** the FILL stroke and the handle placement must read the *same* per-edge depth, or they diverge. This is the root of *both* handle symptoms (don't match + don't respond) — one wire.
- **`SECTION.md §4`** — why this stays inside the Wall (frozen `iA` + frozen run identity + `blockCustoms` design intent; no chain).
- **`RIBBONS.md §3.9a`** (esp. **step 10**, sector slicing) + **§6.9/§6.10** — the V1 construction you build to. The corner is the band **bent**, a slice — `fullBand ∩ corner-sector`, never a built primitive.

## Verified code anchors (`src/lib/tileGround.js`, 2026-06-07; the §3.1/§3.2 work is LANDED uncommitted on trunk — branch off the commit Boz lands first)
- `sectionPass(shapeTiles, cw, stripMat, blockCustoms)` — the FILL pass. The per-run loop (`~:560`) builds the treelawn slabs + (already) captures `overrideRuns` for materials; the routing (`~:625`) peels overridden runs off the default remainder. **Extend this per-run resolution from materials → depths.**
- `runMatOverride` (`~:536`) — the pattern for reading `blockCustoms[run.skelId][run.side][run.segOrd]`; mirror it for `.treelawn`/`.sidewalk`.
- `gleanTreelawn` + constants (`:441`), per-run `td` (`:565`), per-tile `tl`/`sw` seed (`:1798`) — the best-effort depths to resolve *over*.
- `sectionOpen` / `sectionGeos` (`BlockGeometryV2Debug.jsx:636`) already pass `blockCustoms` and re-stroke live off the frozen silhouette — so a depth override will re-render live once `sectionPass` reads it.
- Handles: `MeasureOverlay.jsx` (`sideToStripes`/`resolveStripHit`, the handle placement + the strip-hit) currently read **chain measures** — re-point them at the resolved per-edge depth (§5).

## The task (build to `SECTION.md §3.3`)
1. **One per-edge depth resolution** — `blockCustoms[run].{treelawn,sidewalk}` (override) else best-effort (gleaned-Y ? `STD_TREELAWN` : 0; `ADA_SIDEWALK`). Expose it so **both** `sectionPass` and the handle placement read it (the one-depth-truth wire, §5).
2. **Per-edge divider inside the mono-width** — keep `WB` uniform per block; slice each leg's divider at `cw + that edge's treelawn`; two strips always, default ordering per §3.1, then the material override.
3. **Corner = `cw + max-adjacent`** — the bent pad goes as deep as the deeper adjacent leg (SW↔SW → sidewalk-deep); always SW; a `fullBand` slice, never constructed.
4. **Handle alignment** — position the treelawn-outer / property-line handles from the resolved depth (#1) so they sit on the rendered strip and the drag moves it.

## Gate (definition of done)
- **Machine:** byte-identical render when nothing is overridden **and** all gleaned-Y depths equal the standard (the no-author map is unchanged). Mono-width ribbon untouched on un-authored blocks.
- **Jacob's eye, live Measure tool:** a treelawn/sidewalk handle **sits on its strip** and **drags it live** (off the frozen curb — the curb doesn't move); ctrl-click swap still works; an SW↔SW corner is sidewalk-deep; both-strips-LU paints an open field. Then a bake matches the live view.

## Boundaries
- ⛔ Mono-width ribbon sacrosanct (above). ⛔ Don't touch the silhouette / `iA` / `vertR` (Survey's, frozen) or the wall signature beyond the `blockCustoms` already threaded. ⛔ No chain geometry — frozen `iA` + frozen `runs[]` + `blockCustoms` only. ⛔ No canonical-doc edits (report findings; Boz folds them).
- **Out of scope:** the FILL geometry tail (ADA-tangent G5, point-ramp, the G12 thorns, the Bentley-Pl dead-end cap), smoothing (deferred), the upstream intersection-everywhere corner residuals (Survey/skeleton). Just the per-edge depth/divider/corner + handle alignment.

## Report back
What you wired (the depth resolution + where the one-depth-truth is shared), the byte-identical proof, the live-tool result, and anything that pushed back on `SECTION.md §3.3`. Commit on your worktree.
