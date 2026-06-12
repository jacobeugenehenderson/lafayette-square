# Loop Streets

**The two enclosed-face streets — Benton Place (teardrop) and Waverly Place (couplet) — and why we've never gotten both rendering well at once.** This is their single home: the topologies, the per-role cross-sections, what's live vs dead, the "never both at once" tension, and the current Benton collapse.

> ⚠️ **RESOLVED by the grounding (2026-06-06, `OSM2STREETS-GROUNDING.md`).** **"Loop street" is NOT a standard concept.** In the reference model Benton is just `Roads` + a `LandUseBlock`; the roles compile down to asymmetric per-side lane lists. **Keep "loop" as an authoring-card NAME only**, not a geometry concept — the topology/median is standard road-casing + the LandUseBlock. And **18th's "loop" was never a loop**: it was a divided MIS-detection (a `motorway_link` ramp + a service drive mis-paired by our *geometric* detector) — fixed data-first (`HANDOFF-divided-detection-data-first.md`). Read the rest of this doc as the authoring-card reference, not a model.

> **Status: v0.1 (2026-06-05) — consolidated.** Moves the **L.0 architecture lock (2026-05-10)** up from `_archive/notes/NOTES-2026-04-07_to_2026-05-18.md` (it was the authoritative spec, stranded in the archive), augments it with the live tile handling + the bad-data collapse, and flags the dead figure-ground paths. The archive copy stays in git. Loop work is a **skeleton + construction** concern (detect in the frame, render in tiles), so it cross-refs `SKELETON.md` and `RIBBONS.md` rather than living inside either.

---

## 0. What a loop street is

A **loop street** = a set of same-named OSM chains that bound an **enclosed face** the operator wants painted as **median** (grass, no sidewalk). Identified by a `loopId`; each member chain carries a `role`. The median is **emergent** (the enclosed face, painted `lu='park'`), never a separately-authored polygon — and both LS loops **emit from the centerline** (the ribbon strokes off the chain, like any street).

LS has (at least) **three** — Benton (teardrop), Waverly (couplet), and **South 18th**, a **U/horseshoe dead-end** discovered **2026-06-06** *mis-detected as a DIVIDED corridor*: its two parallel legs read as carriageways, so E1 gave it divided widths (the "weird width all the way down") and E2 split its block with a constructed median (the "big polygon split"). 18th doesn't even reach Lafayette — it's a dead-end U with an arc at the Dolman end. **The fix is in the SKELETON: loop detection must catch the U and take PRECEDENCE over divided detection** (a loop's legs are not divided carriageways). This was latent before the E-series and lit up by E1/E2.

> ⚠️ **18th is a NEW loop SUBTYPE — interior = REGULAR BLOCK, not median.** Benton/Waverly enclose a **grass median** (inner side zeroed, no sidewalk). 18th encloses a **normal city block** (treelawns, sidewalks, parcels) — so its legs are **normal streets with sidewalks on BOTH sides** (the inner side faces the block), the *opposite* cross-section from Benton's body. The mis-detection did the worst thing: a **median where a normal block belongs**. Also: **18th's loop crosses a NAME-SHIFT** (chains change names around the U), so same-name grouping won't detect it — needs `continuesAs`/collinearity. ⇒ **This broadens the loop definition:** the enclosed face is *either* a median *or* a regular block; the loop's job is just to (a) be detected (incl. across name-shifts) and (b) NOT be mis-paired as divided.

> ✅ **RESOLVED — 18th is NOT a constructed loop (2026-06-12, Spline forensic, `SPLINE-18TH-FINDINGS.md`).** It already renders as **coherent normal streets enclosing regular block faces, curbs present** — exactly the §2-target end state — *without* any loop construction. The divided mis-detection was un-fabricated by the data-first gates (`870a1fd`); the legs are all `anchor:center`, no `pairId`, **permanently un-re-pairable** (legs share no endpoint, rejoin bridge 93 m ≫ the 35 m gate). The dead-end legs render **woven** (the §0/§1 default), not as a constructed loop. **`interior:'block'` would be a no-op** — the loop-median emitter (`derive.js`) fires only on a *single self-closing* chain (Benton/Park Place); 18th is multi-chain + open, so there is nothing to suppress. The 2026-06-11 "curb absent / handles floating" symptoms were a **transient state** (the active dead-end prune + the un-capped `rayHitCurb`), fixed by `dd4ddb6` + `646b8b1`, **not** a loop defect. **So: 18th does not need loop detection.** The skeleton brief is OBE (`HANDOFF-18th-loop-skeleton.md`). The `interior:'block'` SUBTYPE option stays a valid part of the loop *model* (for a future place that genuinely has a self-closing block-loop), just not needed for 18th.

The standing problem: get **all of them** right simultaneously (each has opposing demands; §5).

---

## 1. The topologies (auto-detect)

| Type | Name | Composition | Example | Detect |
|---|---|---|---|---|
| **A — teardrop** | stem + closed body sharing the loop-joint node | 1 stem chain + 1 closed body chain | **Benton Place** | body `points[0]≈points[-1]` (spatial close) + a same-name chain endpoint-coincident at the closure |
| **B — couplet** | ≥2 parallel one-way carriageways enclosing a face (optional cut-thru) | ≥2 same-name `oneway` chains forming a planar cycle | **Waverly Place** | ≥2 same-name oneway chains sharing endpoints into a cycle; the median is the face *between* them (topological, not a single closed chain) |
| **C — ring** | closed body, no stem | — | none in LS | — |

---

## 2. Per-role cross-sections (the L.0 visual spec)

| Role (type) | Outer side | Inner (median-facing) side |
|---|---|---|
| **body** (A — Benton) | full ROW: curb + treelawn + **sidewalk** + lawn | curb + treelawn only — **no sidewalk**; treelawn flows into the median |
| **stem** (A) | normal residential ROW both sides | — |
| **outer** (B — Waverly carriageway) | full residential ROW (treelawn + sidewalk) | full residential ROW (unchanged) |
| **cut-thru** (B — bare cross-street through the median) | curb + asphalt only | curb + asphalt only |
| **connector** (same-name normal piece) | full ROW | full ROW (grouped for naming only) |

**Benton, in Jacob's words:** *all-grass median, sidewalk on the outer edge.* That's the **body** role above — outer edge carries the sidewalk, inner edge has none (the grass median fills inward).

---

## 3. Data shape

`overlay.loops[]` (per-scene, canonical) → denormalized per chain as `chain.loop = { loopId, role }` for the hot path. Auto-detect runs in the pipeline; operator override via Survey UI (the loop card). *(The detect + override UI is L.3, not yet built — see §6 status.)*

---

## 4. Live vs dead

- ✅ **LIVE — skeleton loop guard.** `skeleton.js isClosedLoop` (`hypot(first,last) < 1 m`) → tighter `RDP_EPS_LOOP = 0.3` (vs 1.0) so a tight loop body keeps its curve instead of faceting (`SKELETON.md §3 step 8`).
- ✅ **LIVE — tile handling.** `tileGround.js`: median-tile detection (`isMedianTile`, >40% median-facing boundary → ped zeroed); the **thin-tile capacity guard** (`thinTile = 2·area/perimeter < cw+tl+sw` → `bandJoin='round'`); single-run-loop rounding. These keep a thin loop interior from thorning.
- ✅ **LIVE — the endpoint-weld closes the enclosed face (2026-06-11, `e8cc310`).** ⭐ **The fix that finally made the emergent-median model work.** `tileGround.extractFaces` welds near-coincident chain **endpoints** (within `ENDPOINT_SNAP = 0.15 m`) to a shared node *before* the face walk. A body that closes **above** the 0.1 mm node quantization — Benton **3.2 cm**, Saint Vincent **2.2 cm** — otherwise reads as an **open chain whose two endpoints are distinct nodes**, so its ring never closes and its interior face never forms. The weld gives the near-closed loops the footing **Park Place (gap 0.000) always had** — Park Place closed on its own and rendered right the whole time; that was the tell. With the face closed: the loop **road** emerges from the interior+exterior tile pavement strips, and the interior ped-zeros to **grass**. ENDPOINTS only (mid-chain geometry untouched), tolerance well below junction separation, so **general** — any near-miss endpoint slit closes, not just the named loops. **Audited clean** (`scratch/weld-audit.mjs`): only Benton + Saint Vincent welded, max 3.2 cm, **no spurious junction merges**; faces 101→103 (+2 = the two interiors), verts 795→881 (peeling still removes genuine dead-end spurs).
- ✅ **LIVE — loop interior emitted as `kind:'median'` (2026-06-11, `e8cc310`).** `derive.js` emits each snap-closed loop interior as a constructed `kind:'median'` ring (inset pavement+curb+sidewalk ≈ **5.6 m** to the inner-sidewalk grass edge, guarded by a 20 m² min so a tiny turning circle that collapses stays paved). This is the **`isMedianTile` trigger** — post-E2, median-tile detection keys on `ribbons.medians` overlap (the >40%-median-facing heuristic retired at E2). Per-loop override `overlay.loops[loopId].interior` (`'median'` default | `'block'` = the 18th-St subtype, emit nothing). *(The pragmatic reconciliation of L.0's "median is emergent, never a separately-authored polygon" with E2's constructed medians: the **FACE** is emergent from the weld; the median **RING** is just the detection trigger painted onto it — geometry still comes from the face, not the ring.)*
- ⛔ **DEAD — `derive.js LOOP_STREET_NAMES` (`:1297`)** = `['Benton Place','Mackay Place']` — wrong (Mackay isn't a loop; Waverly is missing) and all its loop-cut/median-creation paths are figure-ground-dead. **Delete** (the L.6 cleanup; ledger item).

---

## 5. ⭐ The "never both at once" tension + the Benton collapse

**The two loops pull opposite ways:**
- **Benton (A)** needs **aggressive RDP** to clean its over-dense body (29 raw pts where ~5 suffice) — fixed by `RDP_EPS_LOOP`/`smooth=0`. Its body is a *thin* tile (the asphalt edges are close), so it sits near the capacity threshold.
- **Waverly (B)** is **inherently a thin median tile** (the inter-carriageway gap is narrow by design) → the capacity guard fires and rounds the ped band (the "thorn"/degraded-strip symptom).
- **The bind:** both are capacity-bounded. A width change that helps one can flip the other across the `thinTile` threshold — so they've never both rendered cleanly at the same time.

**The current Benton collapse (2026-06-05, post-E1) — a DATA bug:** `survey.json` gives Benton `rowWidth: 4` (assessor) → block-edge half 2 m → E1's asphalt clamp pinned `pavementHW` to **0.5 m** → the loop body collapsed. Same class as Park Ave's contaminated `2.99`. E1 correctly *trusted* the custom data; the data is wrong for Benton.

**Fix direction (the Benton-guard brief):**
1. **Sanity-guard the custom-width tier** — an implausibly small custom ROW/width (a residential street can't be a 4 m ROW) **floors or falls back to OSM lanes** (Benton `lanes:2` → AASHTO ~7 m). Defensive base-loading; fixes Benton + Park Ave + any future bad custom data (the kit needs it).
2. **Honor the loop cross-sections** (§2) so Benton renders all-grass-median + outer-sidewalk and Waverly renders couplet+emergent-median — **verify BOTH at once on the live tool** (the standing goal).
3. ⚠️ **Rebuilding `ribbons.json` requires eyes on the Benton + Waverly renders** — loop renders drift on pipeline rebuild even with byte-identical inputs (`SKELETON.md §5a`, the reverted straightener). Verify, don't trust the rebuild.

---

## 6. Status (L.0–L.6)

- **L.0** ✅ architecture lock (2026-05-10; this doc consolidates it).
- **L.1–L.4** ⏸ toy fixtures · V2/tile emitter for the role cross-sections · Survey loop card (detect + override) · Measure inner/outer relabel — **status mostly unverified** (some role-handling rides the tile path; the explicit loop model isn't fully built).
- **L.5** 🔧 LS: Benton + Waverly both **render at sane widths now** (the bad-data guard, Stadia `8cdc0d4`) — collapse fixed, Waverly pills gone. **✅ The enclosed FACE now forms (2026-06-11, `e8cc310`, §4):** the endpoint-weld closes Benton's 3.2 cm / Saint Vincent's 2.2 cm gap so all three teardrop/bulb loops emit a proper loop road + grass interior (Park Place was already right). **✅ The §2 BODY cross-section now renders (2026-06-11, `ed250b3`):** the loop median ring insets to the CURB's inner edge (`hw + curb`, not past a sidewalk) so the grass fills the interior face → `isMedianTile` fires (now also via `isLoopInterior = runs.length === 1`, a single-street enclosed face, independent of the >50% area ratio) → the inner ped band zeros. **Benton's inner sidewalk ring is gone** — outer side = full ROW (treelawn + sidewalk + curb), inner side = curb + grass, treelawn flowing into the median, exactly §2. **REMAINING:** **Waverly's cut-thru** (type B) is a different topology (not a single closed chain) and still renders full ROW (§2 says curb+asphalt only) — the couplet role is the open piece. The small turning-circle bulbs (Park Place, Saint Vincent) keep a thin walk ring around their island, which reads fine for a roundabout. A full `chain.loop{loopId,role}` tag would generalize this (Waverly, cut-thrus); the targeted `isLoopInterior` detection covers the teardrop/bulb body without it. **Also: Benton's stem-joint shows the perpendicular-join protrusion** (Jacob 2026-06-05) — a junction-construction artifact (NOT a loop/width issue), the same class as the T-base bulges → **E3** (BACKLOG). Benton's full bless waits on E3 (the stem-joint).
- **L.6** ⏭ cleanup: delete `LOOP_STREET_NAMES` + dead V1 loop paths.

---

## Cross-references
- `SKELETON.md §3 step 8` — the `isClosedLoop` RDP guard.
- `RIBBONS.md` — the thin-tile capacity guard (the loop-interior thorn class) · `HANDOFF-band-fold-fix.md`.
- `src/lib/tileGround.js` — median-tile detection + thin-tile guard (the live render).
- `_archive/notes/NOTES-2026-04-07_to_2026-05-18.md` 2026-05-10 — the original L.0 lock (archived; this doc supersedes it as the live home).
- Memory: `[[feedback_geometry_bugs_may_be_data_bugs]]` (Benton's collapse is a data bug), `[[feedback_remove_functionality_excise_knobs_wiring_docs]]` (the L.6 dead-path delete).
