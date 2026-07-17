# THRU-node gate fix — LANDING (Lintel, 2026-07-16)

> ❌ **VERIFICATION FAILED (Boz + Jacob, 2026-07-16, same day) — this cure does NOT fix the eye.**
> Eye-gated on the lit 2D Designer (hard-refresh + new tab, not cache): **Kennett + Mackay still
> broken.** Root (verified `scratch/thrunode-frozen-verify.mjs`): the marker keys the street with an
> *interior vertex* at the node as "through" — which marks the **side street** when the through-street
> is **split into 2 skelIds at the node** (Mackay: Hickory splits → both endpoints → marks `mackay-place`),
> and **misses Kennett** (node coord ≠ any frozen run endpoint). The proxy below (`thrunode-probe.mjs`)
> measured a sliver-COUNT on the **LIVE** `buildTileGround`/`sectionPass` path; the real defect is the
> through-street's trimmed treelawn on the **FROZEN** `sectionOpen` render — never tested (`proxy ≠
> operator eye`). **Re-fix:** correct through-street identification incl. the split-skelId case + the
> node-coord match; **verify on the frozen render + Jacob's eye**, not the sliver count. Everything below
> is the (invalid) original landing, kept for the record.

**Agent: Lintel (fresh, dispatched A1).** Landing on `HANDOFF-thrunode-gate-fix.md` /
`scratch/THRUNODE-GATE-FINDINGS.md`. **Status: CURE LANDED (first cut, Boz opt-c). The 5
named archetypes clear to 0 slivers on the proxy; no regression; A/B knob byte-identical
off. NOT baked (Jacob's eye + go still gated).** ⚠️ Read before continuing the arc.

## §2 THE CURE (Boz opt-c: the ped bridge) — landed
The window (cure a) alone was insufficient (see §1 below — it never reaches `iA`/ped). The
real defect was the **false corner**: on a genuine deg-3 T the mouth splits the through
frontage across two tiles, so the tile-local `isThrough` can't fire, so the through-street's
run-end **bids an ADA corner against the stem** and the corner machinery shatters it into
sub-8m² slivers. The cure is **Part A — suppress that false corner**:
1. **Freeze a per-node marker** (`thruNodeSet` → `st.thruNodeEnds`, shape pass) identifying
   the through-street's frontage run-end at each genuine deg-3 T — built **only on the stem
   side** (the mouth's side; `nodeStem.dir` picks it — the far side runs straight, building a
   window there notches a clean frontage).
2. **`sectionPass` reads it** (`isThruNode`) and adds it to the corner suppressor alongside
   `isThrough`/`isNameTransition` → the through-street runs straight past the mouth, the
   **stem** owns the corner. (The asphalt window from §1 rides along as cure-a substrate.)

**Result (`scratch/thrunode-probe.mjs`, `correctness-detector.mjs`):**
- **All 5 named archetypes → 0 throat slivers** (Kennett 4→0, Mackay 2→0, Rutger 7→0,
  Miss-Alley 7→0, Carroll 6→0). Eye (proxy SVG, `scratch/k-off.png`/`k-on.png`): the OFF
  corner slivers are gone, the band wraps clean.
- **Map-wide:** junction nodes flagged **64→33** (clean 108→**139**); through-node predicate
  **44→15**; junction-band names 45→37; cul-de-sac notch 19→9.
- **No regression:** every other invariant identical to baseline (max-turn 7, iA self-int 20
  **with 0 new**, curb-bump 13, curb∥chain 34, face-closure 0, divided-median 4…).
- **A/B knob `opts.thruTNode` (default ON):** flag-OFF is **byte-identical to pre-change**
  (asphalt+sidewalk+treelawn+curb) — a clean, reversible eye A/B for Jacob.

**Residual 15 (follow-up, NOT this artifact):** ~half are **divided-carriageway** through-T's
(lafayette-4, truman-0, south-14th-0, south-jefferson-5, park-avenue…) — the THRU loop excludes
carriageways by design (E2/E3 divided machinery owns those nodes); the rest are **wide-avenue
stem-corner over-fire** (missouri-2/albion renders visually clean — the detector's known
64-vs-4 over-count). Neither is the through-node break.

**Open for Boz:** (1) the divided-carriageway T sub-case (own ticket); (2) tighten the
detector's ped-sliver clause to the through-frontage line so it stops over-firing on stem
corners; (3) **bake + Jacob's eye** to promote the proxy result. Still uncommitted.

---

## §1 The prior scope finding (why the window alone was not enough) — kept for the record

## What I did (per brief)
1. Dropped the `:2461` gate for genuine deg-3 T's + sized the window to span the mouth
   (stem half-width floor). Gated behind **`opts.thruTNode`** (default ON) — the eye A/B
   knob, like `culDeSacKeyhole`/`iaOffset`. Exposed `_thruWins` in the emitArtifact return.
   (`src/lib/tileGround.js`, uncommitted.)
2. Baseline probe (`scratch/thrunode-probe.mjs`) reproduced the forensic exactly:
   every target (Kennett×S18th, Mackay×Hickory, Rutger, Mississippi-Alley, Carroll) is
   deg-3, exactly one through-street, `plain`/NOT-E3, **no window** (fell through the gate),
   ped throat FRAGMENTED.
3. Added the honest detector predicate (`scratch/correctness-detector.mjs`,
   `throughNodeBreakReport`) — RED-until-true on the **actual ped continuity**, not on
   "is a window built."

## The verdict (measured, single-process A/B — `thrunode-probe.mjs`)
| target node | window @ node (off→on) | ped throat slivers (off→on) |
|---|---|---|
| Kennett × S18th `(386.5,149)` | 0 → 2 ✔ | **4 → 4** ✗ |
| Mackay × Hickory `(29.3,-434.9)` | 0 → 2 ✔ | **2 → 2** ✗ |
| Rutger × S18th `(453.6,-197)` | 0 → 2 ✔ | **7 → 7** ✗ |
| Mississippi-Alley × S18 `(440.4,-148)` | 0 → 2 ✔ | **7 → 7** ✗ |
| Carroll × S18th `(394.5,99)` | 0 → 2 ✔ | **6 → 5** ✗ |

- Windows map-wide **113 → 224**. **Cure (a) asphalt bridge: delivered.**
- No regression: iA self-int **20 → 16**, junction nodes flagged **64 → 62**.
- **Ped throat: essentially unchanged.** The deg-3-T ped-break predicate goes **44 → 42**
  (not to 0). Every named archetype stays RED. **Cure (b) ped continuity: NOT delivered.**

## Why (the architectural reason — proven, not theorized)
The eye-defect is a **ped-layer** break ("green treelawn punches to the curb + pale
sliver"; the findings themselves note *"the curb `iA` is clean"*). The ped bands offset
inward from the frozen **`iA`**. At `tileGround.js:2757` the doctrine is explicit: on a
clean block **`iA` = the per-edge parallel OFFSET polygon (`offsetRingVariable`), NOT
carved from the junction-swelled asphalt.** The target tiles are large blocks
(54k–77k m²) → they take that offset path → **their `iA` is BYTE-IDENTICAL off vs on**
(verified: iA area 46146→46146, 48160→48160, 66699→66699, 46458→46458). The `:2461`
window lands only in `aFill` (asphalt) and **cannot reach the curb the ped follows.**

The findings' cure premise — *"the window records a split-station that makes the
tile-local `isThrough` fire → ped continuous"* — is contradicted by measurement **and by
the findings' own mechanism point 4**: the two through-frontage halves live in **two
different tiles** (the mouth splits them), so tile-local `isThrough` cannot fire in either;
and `splitRunAtStations` only cuts at an **interior** run vertex, but at these tiles the
node is a run **endpoint** → no split → `isThrough` stays false → `cornerAt` still reads
`south-18th ∩ kennett` as a real corner → the ADA corner-bid + `tangentTrim` still eat the
treelawn. **An asphalt window is necessary substrate but not sufficient.**

## The real cure (Boz's call — a bigger arc than "drop the gate")
The ped continuity across the mouth is the **un-built ped junction** that
`HANDOFF-junction-construction.md §2` already names as the GAP: *"the PED bands are NOT
[constructed] — plain nodes get NO apron."* The fix must construct a ped bridge across the
mouth (treelawn/sidewalk continuation), OR make the two facing `through∩stem` corners build
as one coherent junction ped-crossing — i.e. finish the plain-node apron for the ped layer,
not just asphalt. This is the same layer the junction-band scoreboard (62 nodes) tracks.

## Disposition / open questions for Boz
- **Code change is UNCOMMITTED, gated (`opts.thruTNode`, default ON), no regression.** It's
  the correct asphalt substrate cure (a) a ped-junction cure would build on. Keep as the
  substrate, or revert until the ped layer lands? — **Boz's call.**
- **Do NOT bake** (eye-defect not cured; uncommitted bakes in the tree).
- **A2 (freeze the curb):** unaffected by this finding — the curb `iA` here is already clean;
  the open work is the ped junction, downstream of the freeze.
- Detector predicate `throughNodeBreakReport` is the honest RED-until-true scoreboard for the
  ped-junction cure (currently 42 RED; drives to ~0 when the ped bridge is built).

*Harnesses: `scratch/thrunode-probe.mjs` (A/B), `scratch/correctness-detector.mjs`
(`throughNodeBreakReport`). Original root cause: `scratch/THRUNODE-GATE-FINDINGS.md` (intact).*
