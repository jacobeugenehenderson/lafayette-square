# HANDOFF — Rebuild the curb DRAW as a parallel offset (the shape pass, for real)

**State:** approach brief — Jacob's checkpoint before code. Branch `curb-offset-draw` off clean trunk `cartograph-looks-pass-ab` (T3 + meteorologist landed). All work is **live in `tileGround.js`** — Survey `:5173` reload, **no artifact rebuild.** Driver stays in the loop (eye-gated); the freeze is a *separate later step*, not this.

---

## Why — the step that was never taken

The curb has never been drawn correctly. Today it is **carved, not offset**:
```
let aFill = unionRings(aStads) ∩ tile.ring        // per-edge strokes …
aFill = differenceRings(aFill, cCut)              // … minus corner keep-out …
aFill = unionRings(aFill, jClip, tClip, mergeClip)// … plus junction windows/aprons/median patches
const blockRings = differenceRings([tile.ring], aFill)   // tileGround.js ~:2002
const iA = filletRings(blockRings, cornerRfn, fSink)     // the curb line
```
That union-of-strokes-minus-cuts-plus-windows **bows at junctions** → the "d" bulge. The polygon-first plan always called for the curb to be a **parallel offset of the frozen frame** — `chain ⊕ halfWidth`, corners = offset-intersections, a pure function of the skeleton (`PREBAKE-POLYGONIZATION-PLAN.md` L3, `PREBAKE.md §5`, `POLYGON-FIRST.md`). That step was categorized as "live reshape" and built as the carve instead. **This brief takes it: rebuild the DRAW so `iA` IS the parallel offset.**

---

## The target construction

Replace the carve. `iA` becomes the **variable inward offset of `tile.ring`**:
- each tile edge `i` is pushed inward by its own depth `d[i]` (the asphalt half-width for the street that owns that edge),
- each corner vertex = **intersection of the two neighboring offset lines** (the genuine offset-intersection corner),
- then `filletRings` rounds it (unchanged — so `fSink` still feeds the T3 `cornerSet` mapping).

Parallel by construction; the offset-intersection **is** the clean corner, so the junction windows / keep-out cuts / aprons are **no longer needed to shape the curb**. `asphalt = tile.ring − iA` still paves the corners (the per-edge strips meet at the offset-intersection). On a normal straight tile this offset **equals** today's `tile − asphalt-strip`, so it converges everywhere the carve was already right — it only changes the junction/transition sites that bow.

**The pure helper (delegate-able, eye-free):** `offsetRingVariable(ring, depths[]) → ring'` — inward offset of a closed polygon by a per-edge distance, vertices = consecutive offset-line intersections. Testable in isolation against the litmus; a worktree agent can build this while the driver does the integration.

---

## The seam to cut (exact)

In the shape-pass loop (`tileGround.js`, per `tile`):
- **Build `depths[]` per tile edge.** Each edge ↔ a run (`runMeta`/`groupRuns` already give `poly, side, measure` per run; `tile.edges` gives `skelId, side`). `d[i] = edgeDepth(run.measure, run.side, cw, 'A')` for the run owning edge `i`. (Carriageway median side has `pavementHW = 0` → `d = 0`, curb sits on the centerline there — correct.)
- **Replace** `const blockRings = differenceRings([tile.ring], aFill)…` with `blockRings = [offsetRingVariable(tile.ring, depths)]` (then the same `> 0.5 m²` filter).
- **Keep unchanged:** `const iA = filletRings(blockRings, cornerRfn, fSink)`; the `fSink → cornerFillets/cornerSet` tagging (T3); `Aacc = tile − iA`; `Cacc = iA − erode(iA)`; `cap`/`bandJoin`; `sectionPass`.
- `aFill` (the carve) can stay computed for the **asphalt fill paint** if needed, but it **no longer defines the curb**. Decouple: curb = offset; asphalt-fill = `tile − iA` (which equals the strips). Confirm the highway/asphalt layers still read correctly off the new `iA`.

---

## The special cases that MUST coexist (this is the real work, not the offset formula)

1. **Per-edge depth mapping** — ring edge → run → `pavementHW`. Get the owning run right for every edge (incl. `[THRU]`-split spans and per-fe overrides via `runMeasure`).
2. **Divided-transition leg-sub** — the carriageway edge's **outer** curb continues straight (its outer `pavementHW` offset); its offset-intersection with the cross-street edge is the clean corner. Verify the depths produce this (no taper, no keep-out). The frozen `phase.spineAt*` identifies the transition if explicit handling is needed.
3. **Medians** — median tiles (`isMedianTile` / the `med` field) must stay unpaved/handled; the offset must not pave the median. Preserve the median path.
4. **Dead-end caps** — `roundTips` stay round disks; the existing `vertR = 0` at tip nodes + the offset must wrap the cap cleanly (no scallops).
5. **Capacity guard** — on thin tiles neighboring offset lines cross (self-intersection); clamp via the existing `cap` / bisection logic so the curb degrades to a clean truncated ribbon instead of thorns.
6. **T3 downstream** — `filletRings` must keep producing `fSink` so the injective `cornerSet` mapping (just landed, `c84366a`) keeps working.

---

## Verification — the gate (necessary AND sufficient pair)

- **Litmus** (`cartograph/litmus-curb-parallel.mjs`, runs vs live `buildTileGround`): (a) the divided-transition runs must drop **below tolerance** (run with a small margin to reach the junction zone); (b) **map-wide, no NEW violations** — the offset must equal the carve everywhere the carve was already parallel (convergence). The 38 conservative violations should shrink, not grow.
- ⚠️ **The litmus is BLIND in the junction zone at the conservative margin** — necessary, not sufficient. **Jacob's eye on `:5173` is the real gate** for the "d" and for map-wide correctness. **No SVG proxies** (they misled repeatedly).
- **Sequence:** (1) transitions-first — eye confirms the "d" is gone + litmus on those runs; (2) map-wide — eye on the whole map + litmus shows convergence (no new violations) + the special cases (medians/caps/thin tiles) intact.

---

## Out of scope (separate, later)

- **The FREEZE** — moving `iA` production into prebake (`derive.js`), Survey consuming the frozen curb (D6b/c). Comes **after** the draw is correct. This brief is the **DRAW only**.
- **The block-local edit loop** (D6d).

## Coordination

- Branch `curb-offset-draw` off `cartograph-looks-pass-ab`. Live `tileGround.js`; Survey reload, no bake.
- Optional worktree agent: build `offsetRingVariable` in isolation (objectively litmus-testable); driver integrates + handles the special cases + drives the eye-gating.
- Done = the litmus converges (transitions parallel, no new violations) **and** Jacob's eye confirms the "d" is gone map-wide. Then — and only then — the freeze step opens.
