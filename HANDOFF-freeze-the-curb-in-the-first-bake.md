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
