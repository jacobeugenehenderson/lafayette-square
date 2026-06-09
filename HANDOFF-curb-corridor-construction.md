# HANDOFF — Draw the Curb as a Corridor-Continuous Parallel Offset (the `iA` rebuild)

**State:** Solutions-Architect design (2026-06-09), dispatch-ready. **Supersedes the per-tile approach in `HANDOFF-curb-offset-draw.md`** (that one is structurally insufficient — see §0). This is the **DRAW** (live in `tileGround.js`, eye-gated, no artifact rebuild). The freeze (D6b/c) is out of scope and only must-not-be-foreclosed. Branch `curb-offset-draw` (tree is known-good carve; attempt #1 reverted).

---

## 0. Thesis (why attempt #1 failed, and the fix)

Attempt #1 (`offsetRingVariable(tile.ring, depths)`) had the right math, wrong **operand**. Offsetting the *tile ring* cannot fix the "d" because the tile ring at a divided transition is already carriageway-stub + median geometry — the corridor's continuity isn't expressible from the perimeter. Bench proof: vs the carve baseline it **fixed 0, added 4** (wide-avenue noise), **never touched the bulge tiles** (they carry tips/medians → fall back), and broke all dead-end caps.

**The fix: build the curb from the corridor CHAINS, not the tile perimeter.** Stroke each street side as a continuous run (`chain ⊕ pavementHW`), **pre-welding each carriageway to its spine continuation** (via the frozen `phase.spineAtStart/spineAtEnd`) so the **outer curb of a divided corridor is one unbroken offset line running straight THROUGH the transition node**, with the median opening inward as the *absence* of an inner-side stroke. Then `iA = tile.ring − aFill` exactly as today — but `aFill` no longer bows. It is **identical in form to today**, differing only inside a box at the transition node → strict, low-regression, converges everywhere else.

NOT the rejected per-tile offset. NOT a corner patch. A **corridor-level pre-pass producing the asphalt silhouette**, consumed unchanged by the existing `iA = filletRings(tile.ring − aFill)` tail.

---

## 1. Construction model (chosen: corridor pre-pass + per-tile substitution)

Rejected alternatives: (B) modifying `extractFaces`/tile topology — that re-opens D2/D3 and the corner-identity contract (`cornerKeyAt`/T3/`sectionPass`); it's topology, not draw. (C) a fully separate per-corridor offset tiles consume — duplicates the working asphalt logic.

**Chosen — Candidate A:**

**Pre-pass (once, before the tile loop):** `buildCorridorOuterStrokes(streets, measures, junctionMap) → {rings, boxes, byCorridor}`:
1. Enumerate divided corridors: `streets[]` with `phase.role` `/^carriageway/` + `phase.spineAt*` set; group by `corridorName`/`pairKey`.
2. Per carriageway, build its **continuous outer polyline**: carriageway `points`, and at each `spineAt*` end **append the spine's points** (read the frozen link id, never re-derive; orient on the shared endpoint node). Outer side = non-median: `outboard = innerSign === +1 ? 'left' : 'right'` (mirror `effectiveMeasure`).
3. Stroke that welded polyline at the outer `pavementHW` (reuse two-sided `strokeOpen`; the per-tile `intersectRings(...,[tile.ring])` discards the median half). **No new offset primitive — continuity comes from welding the polyline before stroking.**
4. **Self-limit:** clip the substitution's effect to a **transition box** around each transition node (radius ≈ `max(chainGap, outerHW) + cornerR + margin`, ~12–15 m). Outside the box the welded stroke ≡ the per-run stub stroke (no-op). **This box is the §5d intersection/street boundary and the thing that stops sprawl.**

**In the per-tile loop** (`aStads` assembly, ~`tileGround.js:1934`):
5. For a tile with a carriageway run on its outer side touching a transition box, **substitute `corridorOuterStrokes ∩ tile.ring` for that run's `strokeOpen`** (bbox-indexed like `junctionClipFor`). Inner side still strokes at `pavementHW=0` (median opens inward, free). All non-carriageway runs unchanged.
6. `aFill = intersect(union(aStads ∪ corridorStrokeForTile), tile.ring)`; the existing `cCut`/`jClip`/`tClip`/`medClip` run unchanged (now on a non-bulging base).
7. `iA = filletRings(tile.ring − aFill, cornerRfn, fSink)` — **tail untouched** → caps, medians, capacity, T3 `cornerSet`/`fSink` all keep working.

---

## 2. Where it lives / freeze-compatibility

In `buildTileGround` near the `thruWins` block (~`:1725`, shares the needed `streets`/`measures`/`nodeDeg` scope) + the ~6-line substitution at `:1934`. Survey reload, no bake. **Write the pre-pass as a pure `buildCorridorOuterStrokes(...)` with no closure on per-frame `opts`** — that's the exact seam D6b lifts into `derive.js` and freezes (POLYGON-FIRST Check C). Relocation later is a move, not a rewrite.

---

## 3. Special cases — survive by construction (each broke/excluded in #1)

1. **Medians** — free. Inner carriageway side is already `pavementHW=0`; we only substitute the OUTER stroke; `isMedianTile`/`medianClipFor` orthogonal. Median "opens inward" = we never stroke the inner side (the §5d rule realized).
2. **Dead-end caps** — untouched. We keep `tile.ring − aFill`; caps flow through `aStads`/`roundTips`/`vertR=0`. Only carriageway-outer runs in a transition box are substituted; dead-ends aren't in a box.
3. **Capacity guard (thin tiles)** — untouched; operates on `iA` after build. #1's "+4 wide-avenue" was perimeter self-intersection; we never offset the perimeter.
4. **Normal intersections** — untouched; non-carriageway runs + `thruClipFor`/`junctionClipFor` fire as today; gate is narrow (carriageway AND box).
5. **⚠️ The `9c275ce` corner cure — MUST NOT regress (the delicate one).** Suppress E3 construction **only for the welded carriageway-outer legs inside the transition box** — the corridor stroke *is* the outer leg; the cross-street's corner against it is still built by `cornerCutFor` using the corridor stroke's straight edge as the curb line (§5e "round the corridor outer-edge legs; treat the divided corridor as one road"). Every other leg at the node stays with E3. **Reuse the existing `jmNodeKeys`/`thruClipFor` exclusion pattern (`:1735`)** — extend the exclusion set, don't invent arbitration. Verify on Jacob's eye: cross-street corner still rounds; non-transition `9c275ce` corners byte-identical.
6. **T3 (`fSink`/`cornerSet`)** — untouched; same `filletRings` call produces `iA`.

---

## 4. Convergence (strict superset)

(1) **Gate narrowness** — substitution only when carriageway-outer-run AND transition-box; ~95% of tiles take the byte-identical path. (2) **No-op away from node** — welded stroke ≡ stub stroke outside the box; `aFill` changes only inside the box. (3) **Litmus = anti-regression** — its 9 m blind spot means it can't *see* the transition win but *can* see any straight-run regression → the 38 violations must shrink, never grow. **Fallback:** a corridor that won't weld (missing `spineAt*`, unpairable) → do nothing, keep today's stroke. Never worse than today.

---

## 5. Verification (necessary litmus + sufficient eye; "d" dies first)

- **V0 baseline:** litmus → record 38; capture Jacob's eye on the 3 "d" sites.
- **V1 — ONE corridor (Lafayette×Mississippi), hard-scoped.** Gate (sufficient): Jacob's eye — "d" gone, curb straight through, cross-street corner still rounds, median opens inward. Gate (necessary): litmus no new violations; deviation vs `marker_strokes.json` stroke `[1]` → 0. **If V1 fails, STOP — model is wrong before generalizing.**
- **V2** — all `spineAt*` corridors (eye on all 3 + litmus no-regress).
- **V3** — map-wide eye: medians/caps/thin-tiles/normal-intersections/`9c275ce` all intact; litmus ≤ 38.
- **V4** — T3 smoke: drag a corner radius handle at a transition + a normal corner; magenta arc still rides the curb.
- ⚠️ **No SVG proxies.** Litmus + Jacob's eye on `:5173` only.

---

## 6. Decomposition

| # | Step | Gate |
|---|---|---|
| D6a.0 | Welded outer polyline for ONE corridor (print it) | continuous through node, no stub tip |
| D6a.1 | `buildCorridorOuterStrokes(...)` pre-pass + bbox index | rings parallel to chains at `pavementHW` |
| D6a.2 | Substitution at `:1934`, scoped to ONE corridor + box; E3 suppression for substituted legs | **V1** |
| D6a.3 | Lift to all `spineAt*` corridors | **V2** |
| D6a.4 | Map-wide hardening: fallback, cap/median/thin/T3 audit | **V3 + V4** |
| D6a.5 | (optional) confirm `cCut`/`jClip`/`tClip` degenerate cleanly at transitions; remove dead transition-E3 paths ONLY if Jacob confirms on the diff | eye + litmus unchanged |

Do **not** rip E3 paths speculatively (the §5e lesson: verify removals on the eye + in the diff).

---

## 7. Risks + the one sprawl risk

**Sprawl risk: the E3/`9c275ce` interaction at the transition node** — both the corner cure and the corridor stroke want to own the box geometry. Naive union → double-build with two curb models (the `:1729` warning). Over-suppress → kill the cross-street corner. **Bound it:** suppression is **per-leg, inside the box only**, reusing the existing `jmNodeKeys` exclusion. **Never touch `extractFaces`/`tilesFromFrozen`/D2 topology** — the moment you need to change tile *edges*, you've left the DRAW (stop, that's D6b). The fallback caps blast radius.

**Secondary:** orientation/side-sign (`innerSign`, `+x=WEST` frame — mirror `effectiveMeasure:441`/`extractFaces:374` exactly; gate on the eye, not a mental axis model). `spineAt*` may be one-ended (weld only the linked end). `[THRU]` already excludes carriageways (`:1746`) — no conflict; confirm it holds.

---

## 8. Open questions for Jacob (genuine decisions — for fresh pickup)

1. **Transition-box radius** (~12–15 m proposed) — the §5d "intersection variable / street simple" boundary; Jacob's eye sets it.
2. **E3-at-transition disposition** — remove the now-redundant transition windows (leaner, a diff to verify) or leave inert (safer)? Recommend leave-inert through V3, remove only on confirmed diff.
3. **Spine continuation reach** — weld exactly one spine chain (the `spineAt*` target), stop at its next node? Recommend yes; V1 confirms it kills the visible "d".

---

## Critical files
- `src/lib/tileGround.js` — shape pass `aStads`/`aFill`/`iA` `:1934–2003`; E3 `cornerCutFor`/`junctionClipFor`/`thruClipFor` `:1682/:1673/:1810`; `effectiveMeasure:438`; `strokeOpen:223`; `jmNodeKeys` exclusion `:1735`.
- `src/data/ribbons.json` — `streets[].phase.spineAt*`/`role`/`corridorName`/`chainGap`, `tiles[]`, `medians[]`, `junctions[]`.
- `cartograph/litmus-curb-parallel.mjs` — Check A (necessary anti-regression gate; blind in the 9 m junction zone).
- `cartograph/derive.js:3490–3540` — where `spineAt*` pairs/corners are authored (D6b freeze home).
- `src/cartograph/BlockGeometryV2Debug.jsx:661–686` — Survey's live `buildTileGround` consumer (the eye-gated render).
