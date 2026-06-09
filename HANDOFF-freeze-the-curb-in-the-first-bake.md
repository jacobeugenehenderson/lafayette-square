# HANDOFF — Freeze the curb in the First Bake (the divided-transition "d" bulge is a symptom)

**State:** dispatch-ready, architecture-level. **Supersedes** `HANDOFF-divided-transition-block-tongue.md` (that brief's premise — "fix the transition in the frame/skeleton" — was right about the layer but wrong about the artifact; see "What this session ruled out" below). **Read this whole brief before touching code** — it is the distilled result of a long session that bounced off this bug from five wrong angles. The reframe at the end is Jacob's, and it is the actual diagnosis.

---

## The reframe (Jacob's, and it's the answer)

The visible bug is the **"d" protrusion** in the Survey block silhouette at a divided→undivided transition (Lafayette × Mississippi, Park × S-18th, Park × S-Jefferson): the block's straight front-face curb bows out into a bulge where the split carriageway tapers to a point in the intersection.

**But the bug is not "the curb bows." The bug is that the curb is built from the chains at all — live, downstream, every frame.** That is precisely the thing the skeleton exists to abolish:

> The skeleton's reason for being: chaotic OSM chains → cleaned **once** into a rigid frozen body → every downstream consumer reads that body and **never touches a chain again.**

Today, `buildTileGround` re-strokes the chains **live in Survey** (and again in the bake) to produce the curb. That re-stroke — a union of per-chain strokes + corner keep-out cuts + node aprons — *can* bow the curb, and at the transition it does. The bow is just what the violation looks like. **The curb of a clean straight chain is a pure function of the skeleton — `chain ⊕ halfWidth` (a parallel offset), with genuine corners as the intersection of two offsets.** There is nothing in a correct curb the chains + widths don't already fix. So the curb *belongs in the frozen body*, and the fix is to put it there.

**The parallelism test that proves it (do this first to confirm you're looking at the same thing):** read the baked `iA` along Mississippi's SW-block edge, north→south. The chain is dead-straight, so a correct curb is a straight parallel line. Instead:
```
z=215.2  x=177.1
z=212.9  x=173.3
z=209.7  x=172.6   ← bows ~4 m in
z=207.1  x=173.5
z=205.5  x=176.5
```
A bowl, not a parallel offset. **A curb's correctness has a *definition* (parallel to its chain); measure deviation from that definition rather than reconstructing the corner from nodes** — that tells you exactly which side drifted, and it's not circular. A curb leaves parallel only at a *genuine* corner (two chains' offsets meeting); anything else is a construction artifact.

---

## The fix — finish the First Bake: freeze the curb polygon

PREBAKE.md §4/§5 already names this program ("do the chain→polygon conversion once, in prebake, and freeze the polygon substrate"). **D2 already froze the face *topology* (`ribbons.tiles[]`). What's still missing is the *curb geometry*.** That's the remaining half, and it's where the bulge leaks through.

**Target:** the First Bake emits and freezes the **clean curb polygon** — straight runs as parallel offsets (`chain ⊕ per-side halfWidth`), corners as the offset-intersections (the genuine-corner construction, done **once**) — into the frozen body. Then:
- **Survey *consumes* the frozen curb.** It does not re-stroke chains. The only thing live is the **single element under the operator's hand** (the street/corner being edited reshapes; everything else is the frozen render — Jacob's UX point, and the perf win PREBAKE §5 already wants).
- **Section/Stage consume the same frozen curb** (they already consume the frozen `shape.json` via `sectionOpen`; the seam moves up so the curb is frozen, not re-baked).
- The divided-transition corner is decided **once, upstream**, as the offset-intersection of the corridor's straight outer edges (§5d "outer curb runs straight through; median opens inward"), using the frozen `phase.spineAt*` link — never reconstructed per-build.

**This is architecture-level work, not a corner patch.** Do NOT try to surgically de-bow the live stroke (that keeps building from chains — the violation). The whole point is to stop re-deriving the curb downstream.

---

## Authoring integration — the live re-stroke exists FOR the tools, so freeze must serve them (NOT optional)

The live re-stroke isn't only a perf wart; **it's how the authoring tools work.** Today `buildTileGround(liveRibbons, {blockCustoms, cornerRadiusOverrides, measures})` recomputes the curb from chains **+ the authoring overlay** every frame, and the Survey/Measure handles anchor to the resulting curb rings (`setSectionCurbRings` → "one geometry truth" — the handle reads the achieved geometry, never re-derives). Drag a width/radius handle → the overlay updates in the store → re-stroke → curb + handle move in real time. So freezing the curb must be designed **around** the tools, not bolt them on after. Three requirements:

1. **The frozen curb is a function of the AUTHORED state, not bare defaults.** Freeze `chain ⊕ authored-halfWidth` with authored corner radii / `blockCustoms` applied — i.e. run the freeze *with* the current overlay. The frozen body *is* the authored curb materialized; "parallel offset" means parallel-to-chain at the *authored* width.
2. **Handle anchoring stays "one geometry truth."** Handles read the governing curb rings. With a freeze, that source is the **frozen** rings for inactive elements and the **live re-stroke** for the one under the operator's hand. The handle code (`CornerEditHandles`, `MeasureOverlay`, `setSectionCurbRings`) must read whichever governs the element it's on — no second geometry truth.
3. **The edit→commit→re-freeze loop.** During a drag, re-stroke **only the active element + its adjacent blocks live** (block-independence is already verified — PREBAKE §5 — so this is scoped, not a full-map redraw). On **accept**, persist the authoring change AND **re-freeze the affected blocks** so the frozen body stays the authored state and the edit survives reload. The frozen body is not static — it's the live authored state, materialized; editing just defers its re-freeze to commit.

**Net:** frozen base = the authored curb; live re-stroke = only the element under the operator's hand; commit re-freezes. The tools keep working *better* (everything else is the clean frozen render, no full-map re-derive on every drag over the high-res aerial). If a step here can't be made block-local, that's the real risk to surface early — flag it before building.

## Where the curb is re-stroked live (the seam to cut)

- **Survey draws the curb live:** `src/cartograph/BlockGeometryV2Debug.jsx:661–686` — `tileGeos = buildTileGround(liveRibbons, …)`, then `curb: tg.curb`, `curbOutline: …` ("Survey wireframe stroke"). It reads `centerlineData.streets` from the store (i.e. `ribbons.json`), **not** the baked `shape.json`. (`buildBlockGeometryV2` is imported too but is the *non-tile* path — NOT what draws LS's curb. Don't chase it; I did, it's a dead end.)
- **The bake runs the *same* `buildTileGround`** and freezes to `public/baked/<scene>/shape.json` (`cartograph/bake-ground.js`). So Survey and the bake are the **same engine at two times** — which is why rebaking changes nothing you can see in Survey (it recomputes live), yet `shape.json`'s `iA` *is* a faithful copy of the Survey curb (same engine, same input). Use `shape.json` for offline analysis; verify on Survey.
- **The curb construction itself** lives in `src/lib/tileGround.js` `buildTileGround` — the shape pass strokes each chain, the E3 junction construction (§5e) trims with de-taper windows + builds corner keep-out cuts + one apron per node, and `filletRing` rounds. The curb (`iA`) is the asphalt-silhouette boundary that falls out of that union. **This is the construction to retire** for non-edited elements — replaced by "consume the frozen offset curb."

**The split to build:** corner identity (topology) = prebake, frozen — **already done** (D2). Curb geometry (offsets + corner intersections) = prebake, **frozen (NEW)**. Width/radius authoring = Survey, reshapes only the active element on top of the frozen curb.

---

## What this session ruled out (do NOT repeat these)

1. **Not a stale-bake of the bulge.** Rebuilding does not change the bulge — it's invariant (Jacob: "rebuilt, nothing changes"). *(Separately, the committed baked artifacts genuinely WERE stale across the board — see "Landed this session" — but that's repo hygiene, not the bulge.)*
2. **The frame de-taper nose lever is INERT here.** Lengthening the carriageway de-taper nose (`derive.js` noseRecs → `junctionMap.deTaper`) changed the data (3.5→5.4 m) but the baked `iA` was byte-identical at the marked nodes. Not the lever.
3. **Moving the frozen FACE-RING vertex (D2 topology) does not fix it.** The curb is the *stroke*, not an offset of the face ring; moving the face vertex shifts the clip but the stroke bulge survives (and worsened the fit). Wrong boundary.
4. **It is NOT `buildBlockGeometryV2`/`cornersAtIx`/the §437 skip.** That's the figure-ground path, dead for LS's bake/Survey curb (LS uses `buildTileGround`). I wrongly chased it mid-session; don't.
5. **The E3 corner construction DOES fire at these nodes — it is not a "missing corner."** Instrumented at Lafayette × Mississippi: the spine-link window builds (`laf-6 ↔ laf-3` at `X=[166.6,216.4]`), and the cross-street corner builds (`Mississippi × laf-6` keep-out at `P=[173.3,215.6]`, ≈0.7 m off Jacob's drawn line). The *north* corner `Mississippi × laf-5` is *skipped* ("no span", `S1=1.1 / S2=-6.0`). So the residual is the live union producing a **non-parallel curb**, not an absent corner — which is exactly why the patch-the-corner approach is the wrong altitude. **Freeze the curb; don't keep tuning the live construction.**

---

## Refined by investigation (2026-06-09 PM) — three corrections that sharpen the scope

A three-path code trace (curb construction / bake-freeze-consume / block-locality) confirmed the diagnosis and tightened the scope:

1. **The curb is already a frozen artifact: the per-tile `iA` ring in `shape.json` — and the chain-free consumer already exists.** In Measure/Section mode the app opens it via `sectionOpen` (`tileGround.js:825`) and composes block + curb + asphalt from `iA` alone, with **no chain in scope** (the wall, physically enforced). So "freeze the curb + a chain-free consumer" is *half-built*. The remaining halves: (a) produce `iA` **correctly + once, upstream**; (b) extend the frozen consumer to **Survey** (today only Section reads it; Survey always live-strokes via `tileGeos`, `BlockGeometryV2Debug.jsx:661`).

2. **⭐ Freezing today's `iA` as-is would freeze the bulge — because `iA` is built the wrong way.** Today `iA = filletRings(tile.ring − aFill)` (`tileGround.js:1994`): the tile face minus the asphalt **union** (`aFill` = every per-edge stroke + junction windows/aprons/keep-out cuts). For a normal straight run, `tile.ring − (pavementHW strip)` *equals* the parallel offset — so the two constructions **agree everywhere except where `aFill` swells** (junctions/transitions, where the tapering stub + windows pile asphalt in and the curb carved from it bows). **Cure = build `iA` directly as the per-edge parallel offset (`chain ⊕ pavementHW`), cornered at offset-intersections — never carved from the asphalt union.** A strict improvement that converges to today's geometry everywhere but the bug sites → **low-regression by construction.**

3. **Block-locality does not exist today — one edit rebuilds the whole map** (`tileGeos` = one whole-map `useMemo`). The per-tile shape loop *is* local, but it's bookended by whole-map passes: the **junction builder reads every leg at a shared node** (a corner is co-built by two streets), a **final `unionRings` melts every tile's curb into one un-addressable blob** (`:2075`), + a map-wide perimeter pass + stencil clip. **The true unit of locality is not "one block" — it's "the tiles around the junction you touched" (~3–4).** This is the Authoring-section risk, surfaced *before* building. Raw material is on our side: the per-tile shape loop and the frozen `_shapeArtifact` are already per-tile; the head (junction passes) and tail (the union/perimeter melt) are what aren't.

---

## The plan — Phase 1 (visible fix → freeze+consume), Phase 2 (block-local edit loop)

**Phase 1a — the bulge fix (correctness; fast, visible, low-regression).** Switch `iA` construction from *tile − asphalt-union* to the **per-edge parallel offset** (`chain ⊕ pavementHW`, cornered at offset-intersections; at a divided transition corner the corridor outer-edge legs via the frozen `phase.spineAt*` link — §5d/§5e's "right legs," now a clean offset, not a keep-out cut). Survey runs `buildTileGround` live, so **the "d" dies on Jacob's eye immediately**, before any freeze. Converges to today's curb everywhere but the bug sites → safe map-wide. *The de-risking step: prove the geometry first.*

**Phase 1b — freeze + Survey-consume (the architecture move).** Factor the offset-`iA` construction so prebake (`derive.js`) produces it **once** and freezes it into `ribbons.tiles[]` beside the D2 topology — with its load-bearing companions (`ring`, `vertR`, `bandJoin`, `cap`, `runs[].measure`, `med`, tips; freeze the **authored** state per the Authoring section). Survey's `tileGeos` **consumes the frozen `iA`** for inactive tiles (the Section pattern, extended to Survey); the active element live-strokes its own tiles. Wall moves to the prebake→Survey boundary (~P3). *(Editing still re-strokes whole-map on commit here — accepted; that's Phase 2.)*

**Phase 2 — the block-local edit loop.** Build (a) the edit-key→tile index (`tiles[].edges[].skelId` is the raw material), (b) junction construction that re-runs **per-node, not per-map**, (c) a **per-tile-addressable** output model (stop melting tiles into one `unionRings` blob; union on demand for render). Then edit → re-freeze only the touched junction's incident tiles — the perf/authoring-fluidity win, an independently large restructure.

---

## Verification (Jacob's eye is the gate — proxies misled me repeatedly)

- The gate is **Jacob's eye on the live Survey (`:5173`)**, reloaded. Survey is live JS — a `buildTileGround`/prebake code change shows on reload (no bake needed for Survey).
- Jacob's **drawn target** is the straight curb: `cartograph/data/lafayette-square/clean/marker_strokes.json` (stroke `[1]`, the long one, x172–185 / z129–211). The correct curb is parallel to the Mississippi chain through there, meeting Lafayette at one clean corner. Use it as the numeric target (point→nearest-`iA`-edge deviation should collapse toward 0).
- ⚠️ **Do NOT verify by spamming SVG proxy renders** — Jacob is (rightly) done with them, and they misled me about which artifact/layer mattered more than once. Make a change, let Jacob reload, read his eye.

---

## Landed this session (separate from the program above)

- **`fc42a51` (this branch `divided-transition-tongue`) — regenerate doubly-stale committed artifacts.** The committed `ribbons.json`/`shape.json`/`map.json` were stale: a fresh deterministic rebuild gives 89→91 medians AND carries the **Vernier datum repair widths** (committed had the deviating `design.json` override widths the repair dropped; the regen has the uniform surveyed widths). Street *points*/buildings/junctions/tiles byte-identical; 65 ground tiles updated; alleys benign (+6% length, a low-stakes Design-stage toggle). **This is a real repo-hygiene fix** — the committed bake had drifted from source. Verify on Jacob's eye before landing; it's a map-wide re-bake.
- **Known gap Jacob flagged:** the **paths/alleys are not Skeleton-managed like the streets** — they drift on rebuild. A separate future Skeleton-Reader task (make the path data as clean/rigid as the street chains).

---

## Coordination

- Branch `divided-transition-tongue` off trunk `cartograph-looks-pass-ab`. Carries `fc42a51` (the regen) + the doc updates landing alongside this brief. **No live-stroke surgery was committed** (all attempts reverted; tree clean apart from the regen + docs).
- This is **frame/prebake** work (`derive.js` / the First-Bake freeze) + a `tileGround`/Survey consumer change (consume the frozen curb instead of re-stroking). It is large; scope it as the PREBAKE §5 program, not a one-shot.
- Two-step rebuild to regenerate the frame: `skeleton.js` → `pipeline.js` → `promote-ribbons.js` (→ `bake-ground.js` for the Section/Stage bake). Survey picks up code changes on dev-server reload.

## On landing (Boz)

- Fold the curb-freeze finding into `PREBAKE.md §4/§5` (D2 froze topology; the *curb* is the remaining unfrozen half; the divided-transition bulge is the symptom; the parallel-offset definition is the spec) and add the pointer in `SKELETON.md §5e`. *(Done in the commit that carries this brief — verify it reads right.)*
- Retire `HANDOFF-divided-transition-block-tongue.md` → NOTES (superseded by this).
- The regen `fc42a51` is independent — land it on its own merits (Jacob's eye on the map-wide re-bake) regardless of when the curb-freeze program is scheduled.
