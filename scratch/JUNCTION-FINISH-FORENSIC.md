# JUNCTION FINISH FORENSIC — the no-mouth-side T-junction dogleg

**Agent:** Sextant (fresh, cold-eyes; read-only). **Date:** 2026-06-08.
**Production path:** `buildTileGround(ribbons, {smooth:0, curbWidth:0.381, cornerRadiusScale:1, blockCustoms:design})` on the trunk `src/data/ribbons.json` + `public/looks/lafayette-square/design.json`. Harnesses: `scratch/sextant-{probe,probe2,probe3,scope,proxy}.mjs`; proxy `scratch/sextant-mackay-proxy.{svg,png}`.

> ⚠️ **The brief's central hypothesis is REFUTED by the code + data.** The dogleg is **not** an E3.2 junction construction artifact — at all five marked nodes E3.2/E3.3 construct **nothing**. The dogleg is the **[THRU] through-node blend window** (`tileGround.js:1694–1800`) faithfully rendering an **authored per-fe `pavementHW` step** in `design.json blockCustoms`. The centerline is straight (confirmed); the *curb* steps because the *width datum* steps across the node. Same family as Voussoir's E3.4 datum-repair list, surfaced by the THRU pass.

---

## 0. TL;DR (the one paragraph)

At a degree-3 stem-T the through-avenue carries **two per-fe segments** that meet at the node (the node is an IX vertex, so `segOrd` increments there). When the avenue's authored `pavementHW` differs between those two segments on a given side — `wA ≠ wB` — the **[THRU] through-node construction** splits the run at the node, trims each span back by a window `W`, and inserts a **blend window polygon** whose curb edge ramps `cpA → cpB` from `wA` to `wB`. The window is sized `W = min(8, max(2, 1.7·dw, 2.5·kink))` **specifically so the blend slope is held at `atan(dw/2W) ≈ 16.4° < FILLET_TURN_TOL 18°`** — i.e. by design it slides *just under* the fillet gate so `filletRing` will **not** round it. The result is a literal sharp ~16° vertex at each window end: a **visible Z-jog** where the avenue curb steps laterally by `dw` across the node. It reads as a dogleg on the **no-mouth side** because there is no cross-street there to absorb/hide it — the bare avenue curb is exposed. **The exact insertion is `tileGround.js:1788`** (the window ring `[...seam, cpB, cpA]`), with the step read at `:1770–1771` and the kink-preserving sizing at `:1775`. The root cause is the **per-fe `pavementHW` discontinuity in `blockCustoms`** (seeded survey widths) across a continuous avenue — `dw` on the no-mouth side equals the observed curb step **exactly** (Vail 0.66 m, Mackay 2.20 m, Albion 0.60 m; Kennett & Waverly `dw=0` → already straight).

---

## 1. The marked nodes are `kinds:["plain"]` — E3 is a NO-OP there

The five park-perimeter marks, looked up in `ribbons.junctionMap` (238 nodes):

| mark | node | kind | continuity | deTaper | apron | corners |
|---|---|---|---|---|---|---|
| Vail→Park | [340.0,−120.6] | `plain` | `[]` | — | — | `{outer:[]}` |
| Kennett→Mississippi | [179.9,115.9] | `plain` | `[]` | — | — | `{outer:[]}` |
| Mackay→Park | [−48.0,−203.9] | `plain` | `[]` | — | — | `{outer:[]}` |
| Albion→Missouri | [−177.5,−78.7] | `plain` | `[]` | — | — | `{outer:[]}` |
| Waverly→Lafayette | [−25.3,191.6] | `plain` | `[]` | — | — | `{outer:[]}` |

Each is represented as **two legs**: the stem (`end:'start'`/`'end'`) + the avenue (`end:'through'`) — i.e. a degree-3 T in the `{through chain, stem}` representation.

The `consumeJM` block (`tileGround.js:1156–1663`) does work **only** where a node carries `continuity`, `deTaper`, or `apron`:
- continuity pairs → window polys + trims (`:1206`) — **empty here**;
- the node apron (`:1430`) — **`nd.apron` undefined here**;
- E3.3 corner cuts gate on `nd.kinds?.includes('divided-transition')` (`:1480`) — these are `'plain'`, so **no corner cuts**.

**So `jPolys`, `jTrims`, `jCornerCuts` are all empty at these nodes.** The brief's "apron fan / window polygon / corner-identity on the no-mouth side" candidates are all ruled out — E3.2/E3.3 never fire. (And `filletRing` already gates straight verts at 18°, as the brief verified — so it isn't that either.)

---

## 2. The deg-3 T op-by-op — what actually draws the no-mouth curb (THRU)

Because the node is `plain`, it belongs to the **[THRU] through-node construction** (`tileGround.js:1694–1800`). Its own gate confirms ownership: `jmNodeKeys` (`:1727`) excludes nodes that carry E3 construction, so plain identity-only nodes "stay ours" (`:1726`).

Walk for the through-avenue chain `idx` at node vertex `vi` (e.g. Mackay→Park, `park-avenue-1`, `vi=3`):

1. **Find stations** (`:1742–1746`): `vi` is a degree-≥3 node not in `jmNodeKeys` → a station.
2. **Off-chord kink** (`:1760–1763`): `kink = ⊥distance(v, chord(a,b))`. Measured **0.004 m** at Mackay (dead straight — matches the brief's "0.0–0.3°").
3. **Per-fe width step** (`:1770–1772`), per side:
   `wA = feWidthAt(idx, side, segOrdAtVertex(idx, vi−1))`,
   `wB = feWidthAt(idx, side, segOrdAtVertex(idx, vi))`, `dw = |wA−wB|`.
   `segOrd` increments at `vi` because `vi` is an IX vertex (`segOrdAtVertex` counts IX indices `≤ lower`, `:957`). `feWidthAt` (`:948`) returns the `blockCustoms[skelId][side][segOrd].pavementHW` override, else the per-street base `pavementHW`.
4. **Gate** (`:1773`): `if (dw < 0.02 && kink < 0.3) continue` — nothing to construct. **Kennett (dw=0, kink=0.022) and Waverly (dw=0, kink=0.008) bail here → straight, no window.** Mackay no-mouth side `dw=2.204` passes.
5. **Window size** (`:1775`): `Wn = min(8, max(2, 1.7·dw, 2.5·kink))`. Mackay: `1.7·2.204 = 3.75` → `W ≈ 3.75` each side.
6. **Construct the blend** (`:1778–1791`): sample the chain at `cum[vi]∓W` → points `A,B`; curb points `cpA = A + nhA·wA`, `cpB = B + nhB·wB`; seam runs the chain ±(W+0.6); **window ring `[...seam, cpB, cpA]` pushed to `thruWins` (`:1788`)**.
7. **Split the run** (`:1794–1795`): `thruSplits[idx|side] += {vi, W:{A,B}}`. In the shape loop the avenue run is split at the station (`splitRunAtStations`, `:1811` via `:1895`) so each span strokes at its **own** per-fe width and is trimmed back by `W` (`jTrimmed`/`trimPolyline`, `:1934`).
8. **Land as asphalt** (`:1962–1963`): `tClip = thruClipFor(tile.ring)` → `aFill = union(aFill, tClip)`.
9. **Block = tile − asphalt** (`:1994`) → `filletRing` (`:1995`). The blend's two end-vertices turn `atan(dw/2W) ≈ 16.4° < 18°` → **passed through unrounded** → the bare Z-jog.

The asphalt silhouette on the no-mouth curb is therefore: straight stroke at `wA` (trimmed) → **blend ramp `cpA→cpB`** → straight stroke at `wB` (trimmed). The two joints (`cpA`, `cpB`) are the dogleg.

---

## 3. The exact insertion (file:line) + the labelled proxy

| what | file:line |
|---|---|
| per-fe step read (`wA`,`wB`,`dw`) | `tileGround.js:1770–1772` |
| the gate that lets a step through | `tileGround.js:1773` |
| window sizing that **pins the kink at ~16.4° < 18°** | `tileGround.js:1775` |
| `cpA`,`cpB` curb-blend points | `tileGround.js:1780–1781` |
| **the inserted window ring** `[...seam, cpB, cpA]` | **`tileGround.js:1788`** |
| run split (so each span strokes its own width) | `tileGround.js:1794–1795` → `:1811`, `:1895` |
| land as positive asphalt | `tileGround.js:1962–1963` |
| (NOT rounded) fillet gate it slips under | `FILLET_TURN_TOL` `tileGround.js:84` |

**Measured vs predicted (exact match)** — the no-mouth curb's lateral step == the authored `dw`:

| node | no-mouth side | `wA → wB` (m) | `dw` | observed curb step | observed kink | blend° |
|---|---|---|---|---|---|---|
| Vail→Park | left | 9.992 → 10.655 | **0.663** | 9.99 → 10.65 (0.66) | 9.1°/9.4° | atan(.66/4)=9.4 ✓ |
| Mackay→Park | right | 11.618 → 13.822 | **2.204** | 11.62 → 13.82 (2.20) | 16.4°/16.4° | atan(2.2/7.5)=16.4 ✓ |
| Albion→Missouri | left | 8.985 → 8.386 | **0.599** | 8.99 → 8.39 (0.60) | 8.5°/8.5° | atan(.6/4)=8.5 ✓ |
| Kennett→Miss | right | 11.876 → 11.876 | **0.000** | straight (1 vert, no kink) | — | — |
| Waverly→Laf | left | 10.592 → 10.592 | **0.000** | straight (1 vert, no kink) | — | — |

**Proxy render (labelled — NOT the operator eye):** `scratch/sextant-mackay-proxy.png`. The north (no-mouth) cyan curb runs straight, ramps across the two yellow kink points (the THRU window, ±3.75 m about the node), then resumes a straight line offset outward by 2.20 m — the Z-jog. The amber avenue centerline is dead straight through the red node. (Proxy is mirrored E–W vs the live map: LS frame is +x=WEST/+z=NORTH; `reference_ls_local_frame_axes`.)

Where the step comes from (`blockCustoms`, `sextant-probe3.mjs`): the values are high-precision seeded widths (e.g. `9.992264409631261`), and the step is typically **one fe overridden, its colinear neighbour not** (falls back to base) — e.g. Vail-left segOrd 5 = custom 9.992, segOrd 6 = base 10.655; Albion-left segOrd 0 = custom 8.985, segOrd 1 = base 8.386. Mackay has customs on **both** segOrds that differ by 2.2 m. This is a **per-fe survey-width datum discontinuity on a physically-continuous avenue.**

---

## 4. The WHY — the construction's wrong assumption

The THRU pass assumes **a per-fe `pavementHW` difference at a through-node is a real width transition that should be drawn as a (gated-invisible) blend.** That assumption is sound for an avenue that genuinely changes width — but at these stem-Ts the avenue is **one continuous carriageway of one width**, and the `dw` is a **datum artifact** (seeded per-segment, one side overridden and the other not). The construction therefore manufactures a transition where the physical curb is straight.

Two compounding facts make it *visible* rather than silently absorbed:
- **The window is sized to ride the fillet gate, not to vanish** (`:1775`): `W = max(2, 1.7·dw)` fixes the blend slope at `atan(dw/2W) = atan(1/3.4) ≈ 16.4°`, perpetually just under the 18° tol. So `filletRing` never softens it; every dw-driven step renders at the *same* sharp ~16° kink (bigger `dw` only lengthens the window and deepens the step). The comment at `:1714–1716` states this is deliberate ("no spurious corner can be minted at a blend kink") — correct for *corner-minting*, but it also guarantees the *real* step stays a hard visible jog.
- **No-mouth exposure:** on the mouth side the stem asphalt + the intersection fill swallow the jog; on the no-mouth side the avenue curb is bare, so the same step reads as a naked dogleg. Hence "the no-mouth-side facet."

This **refutes** `HANDOFF-band-fold-fix.md §31`'s mechanism guess ("the per-vertex fillet pass corner-treats that collinear vertex"). `filletRing` does **not** touch it — the kink is a literal sub-18° sharp vertex left by the THRU blend, with legs >7 m (not an arc). The *symptom* description in §28 ("a corner where the centerline is straight") is right; the *named mechanism* is wrong.

---

## 5. Same root as Root A (band-fold)? — SEPARATE (confirmed)

`HANDOFF-band-fold-fix.md` claimed "distinct… Option A's clamp won't touch it." **Confirmed — the conclusion is right, the reasoning was wrong:**

| | Root A (band-fold) | the no-mouth dogleg |
|---|---|---|
| layer | `sectionPass` `iW` ped-band offset (behind the wall) | SHAPE asphalt silhouette (`tileGround` THRU) |
| cause | deep offset `−WB` folds past local medial axis (capacity) | authored per-fe `pavementHW` step blended by THRU |
| where | the **mouth** side (band wraps the tight wedge) | the **no-mouth** side (bare avenue curb) |
| corner-R sensitive | yes (Bollard's sweep) | no (it's a width datum + window geometry) |
| fix | local capacity clamp | width-datum reconciliation |

They share neither layer, cause, nor lever. The cure plan (`JUNCTION-CURE-PLAN.md §2`) already classed the band-fold OUT of the shape cure and parked it with `band-fold-fix`; this finding is consistent with that and **also** distinct from JUNCTION-CURE-PLAN's E3.2 (continuity-pair) construction — these nodes are `plain`, not transition/continuation nodes. It belongs to **JUNCTION-CURE-PLAN's E3.4 "datum repair"** family and the **THRU through-node** machinery, not E3.2.

---

## 6. The fix locus (where, not how)

The disease is a **width datum**, not a drawing op. Two loci, in order of correctness:

**(A) PRIMARY — reconcile colinear through-fe widths (the datum).** A continuous avenue crossing a *plain* stem-T should carry **one** `pavementHW` per side through the node. Where the two fe's flanking the node are colinear + same-name + same-side, their `pavementHW` should be equalized (or a single value owned per continuous run). Locus candidates:
- the **seed** that writes per-fe `pavementHW` into `blockCustoms` — `cartograph/seed-centerlines.js` / the survey→seed step (E1) — so colinear through-segments share a width at seed time; **or**
- a **prebake reconcile** (the JUNCTION-CURE-PLAN **E3.4** datum-repair row) that, at a plain through-node with no real transition, snaps `wA`/`wB` together.
This is the cure Jacob's doctrine points to (`feedback_geometry_bugs_may_be_data_bugs`: a circled Survey issue may root in DATA; fix systemically/invisibly, no user controls). **Equal datums make the THRU pass self-gate** — `:1773` `dw < 0.02 → continue` — and the curb runs straight, exactly as its own comment promises ("equal datums + straight chain degenerate to today's geometry").

**(B) SECONDARY / fallback — the THRU pass itself** (`tileGround.js:1769–1796`). If a residual datum step must be tolerated, the window policy is the lever — but note **it is currently doing its designed job**, so any change here is policy, not bug-fix:
- the sizing at **`:1775`** is what pins the kink at ~16.4° (forever sub-18°, forever visible). A genuinely *de-tapering* window (W large enough to drop the blend well under, say, ~6–8°, or a multi-segment ease) would make small steps visually vanish — but at the cost of a longer ramp; **or**
- a **continuity-aware gate**: where the through chain is one continuous same-name corridor (no authored transition intent), treat a sub-threshold `dw` as datum noise and **don't construct** (snap to the larger/continuing width). This is really (A) implemented at draw time.

**Recommendation:** fix at **(A)** — the seeded per-fe `pavementHW` reconciliation (E3.4 datum repair / seed) — because it is the true root, it removes the step rather than disguising it, and it leaves the THRU machinery (which correctly handles *real* transitions and the 93 centerline-kink stations) untouched.

---

## 7. Scope (the affected-junction list + magnitude)

Sweep of all **156 plain through-nodes** (`sextant-scope.mjs`): **107** chain·side THRU stations fire (`dw≥0.02` or `kink≥0.3`). But the population is overwhelmingly invisible:

`dw` distribution (per fired station): `0.02–0.25 m: 95` · `0.25–0.5: 2` · `0.5–1: 5` · `1–2: 3` · `2+: 2`.

So **~95 of 107 are sub-25 cm** (imperceptible micro-blends); the **visible** no-mouth doglegs are a handful, dominated by **`park-avenue-1`** (Park Ave has large authored per-fe width swings, base 8.26 m but customs 10–14 m):

| `dw` (m) | chain | side | node | in original 5 marks? |
|---|---|---|---|---|
| **3.36** | park-avenue-1 | right | [−154.0,−220.9] | **no** (worst on the map) |
| 2.20 | park-avenue-1 | right | [−48.0,−203.9] | yes (Mackay) |
| 1.73 | park-avenue-1 | right | [340.0,−120.6] | yes (Vail, mouth side) |
| 1.32 | park-avenue-1 | left | [−48.0,−203.9] | yes (Mackay, both sides) |
| 1.22 | dolman-street-1 | left | [522.8,−55.6] | no |
| 0.66 | park-avenue-1 | left | [340.0,−120.6] | yes (Vail no-mouth) |
| 0.60 | missouri-avenue-2 | left | [−177.5,−78.7] | yes (Albion no-mouth) |

**The 5 park-perimeter marks are representative but NOT special** — they are the visible tail of a 107-station population, and the single **worst** instance (`park-avenue-1` right @ [−154,−220.9], `dw=3.36 m`) was **not** among the marked five. Kennett & Waverly are **already cured** (`dw=0` → no window). This matches the memory's "much-better-not-totally-fixed finish."

**A second, distinct THRU sub-class** (same pass, different trigger): **93** stations fire on `kink ≥ 0.3 m` with `dw ≈ 0` — these are **off-chord centerline doglegs** (SKELETON §5a), mostly on the outer perimeter avenues (e.g. `park-avenue-5` kink 1.60 m @ [−1025.5,−370.6], `nebraska-avenue` 0.71 m). Those are a *centerline*-datum matter (name-logic skeleton pass), **not** the width-step facet the operator marked — keep them separate.

---

## 8. Verdict against the brief's six questions

1. **Op-by-op at a deg-3 T:** §2 — but the relevant op is **[THRU]** (`:1694–1800`), not E3.2. E3.2/E3.3 are no-ops at these `plain` nodes.
2. **Where geometry is inserted on the no-mouth side:** the **THRU blend window ring** `tileGround.js:1788` (`[...seam, cpB, cpA]`), with the curb ramp `cpA→cpB`. Not an apron, not an E3 window, not a corner identity.
3. **Why:** the construction blends an **authored per-fe `pavementHW` step** that shouldn't exist (uniform avenue), and sizes the window (`:1775`) to hold the blend at ~16.4° — perpetually just under the 18° fillet gate, so the step stays a visible sharp jog.
4. **Same as Root A?** **Separate** (§5) — confirmed; band-fold-fix's conclusion right, its mechanism guess (filletRing cornering a collinear vertex) **wrong**.
5. **Fix locus:** **(A)** reconcile colinear through-fe widths at the **seed / E3.4 datum-repair** (`seed-centerlines.js` / prebake) so `dw→0` and THRU self-gates (`:1773`); **(B)** fallback = the THRU window policy at `:1775`/`:1773`. (§6)
6. **Scope:** 107 fired stations, ~95 sub-25 cm; visible class ≈ 5–8, concentrated on `park-avenue-1`; worst is unmarked ([−154,−220.9], 3.36 m); Kennett/Waverly already straight; plus 93 separate centerline-kink stations. (§7)

---
*Sextant, 2026-06-08. Read-only forensic; no production code/docs/bakes touched. Numbers are proxy evidence (the production `buildTileGround` path); the live :5173 Survey wireframe + the operator's eye remain the gate.*
