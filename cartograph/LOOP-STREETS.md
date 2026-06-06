# Loop Streets

**The two enclosed-face streets — Benton Place (teardrop) and Waverly Place (couplet) — and why we've never gotten both rendering well at once.** This is their single home: the topologies, the per-role cross-sections, what's live vs dead, the "never both at once" tension, and the current Benton collapse.

> **Status: v0.1 (2026-06-05) — consolidated.** Moves the **L.0 architecture lock (2026-05-10)** up from `_archive/notes/NOTES-2026-04-07_to_2026-05-18.md` (it was the authoritative spec, stranded in the archive), augments it with the live tile handling + the bad-data collapse, and flags the dead figure-ground paths. The archive copy stays in git. Loop work is a **skeleton + construction** concern (detect in the frame, render in tiles), so it cross-refs `SKELETON.md` and `RIBBONS.md` rather than living inside either.

---

## 0. What a loop street is

A **loop street** = a set of same-named OSM chains that bound an **enclosed face** the operator wants painted as **median** (grass, no sidewalk). Identified by a `loopId`; each member chain carries a `role`. The median is **emergent** (the enclosed face, painted `lu='park'`), never a separately-authored polygon — and both LS loops **emit from the centerline** (the ribbon strokes off the chain, like any street).

LS has exactly two, of two different topologies — and **the standing problem is getting both right simultaneously** (each has opposing demands; §5).

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
- **L.5** 🔧 LS: Benton + Waverly both **render at sane widths now** (the bad-data guard, Stadia `8cdc0d4`) — collapse fixed, Waverly pills gone. **BUT the role cross-sections (§2) are NOT modeled** — `chain.loop{loopId,role}` doesn't exist; `isMedianTile` ped-zeroing fires only for inner-edge divided carriageways, never loops. So **Benton's body renders symmetric** (a sidewalk ring inside the teardrop median where §2 says inner = no sidewalk) and **Waverly's cut-thru renders full ROW** (§2 says curb+asphalt only). → the **L.3 role-model follow-up brief** (after the joints E2/E3).
- **L.6** ⏭ cleanup: delete `LOOP_STREET_NAMES` + dead V1 loop paths.

---

## Cross-references
- `SKELETON.md §3 step 8` — the `isClosedLoop` RDP guard.
- `RIBBONS.md` — the thin-tile capacity guard (the loop-interior thorn class) · `HANDOFF-band-fold-fix.md`.
- `src/lib/tileGround.js` — median-tile detection + thin-tile guard (the live render).
- `_archive/notes/NOTES-2026-04-07_to_2026-05-18.md` 2026-05-10 — the original L.0 lock (archived; this doc supersedes it as the live home).
- Memory: `[[feedback_geometry_bugs_may_be_data_bugs]]` (Benton's collapse is a data bug), `[[feedback_remove_functionality_excise_knobs_wiring_docs]]` (the L.6 dead-path delete).
