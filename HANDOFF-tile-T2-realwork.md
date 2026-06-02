# HANDOFF — Tile re-pour · T2: the real-work pieces (LS-direct, unflagged)

**Agent: WARM → Tessera.** You built `tileGround.js` (T1) and the spike before it; T2 evolves the uniform inset into the real per-edge construction. The tile module *is* your work — warm is the obvious call.

This is **T2 of the re-poured program** (`HANDOFF-pipeline-reconception.md`). T1 proved the tile model renders live + bake, WYSIWYG, on toy (the core Jacob confirmed). T2 makes it **correct on LS's real topology** and **switches LS onto it**. **Reads first:** `src/lib/tileGround.js` + your T1 report + spike report; the program brief's T2 entry.

## Goal (one line)

The tile model draws **LS** correctly — asymmetric widths, divided-road medians, filled neighborhood-edge strokes, round loops — rendered live + baked, **for all scenes (LS included), unflagged.** Jacob's eye on LS production is the gate.

## The four pieces

These map exactly to the gaps Jacob saw on toy + your own three spike flags:

1. **Smoothing — wire it in first (quick win, fixes the loops).** `tileGround` has no centerline smoothing, so loops/curves render faceted. **Reuse Camber's Phase-2a centripetal Catmull-Rom** (in `buildBlockGeometryV2.js` — extract/import it; don't rewrite) and smooth the centerlines/grout **before** face extraction, so the grout → tiles → strips all come out smooth. Loops round, curves round. Land this first — it's separable and immediately visible.

2. **Per-edge asymmetric widths (the real work).** Today one `offsetRings(tile, −d)` insets every edge of a tile by the same depth. The general case: **each grout edge inset inward by *its own* side's widths** (`asphalt-hw | curb | treelawn | sidewalk` for the street on that side). Offset each edge as a half-plane by its own depths, intersect; corners miter/round between differing depths. Each grout edge = a street-side = an **fe** → reuse the existing per-fe width resolution (`chain.measure[side]` / `blockCustoms`, via the W1 identity `feCustomKey`). This is the one place "one Clipper call per tile" doesn't suffice.

3. **Divided-road medians — they fall out of #2 + #4.** A divided street is two parallel carriageways; the thin tile between them is the **median tile**, both of whose grout edges are asphalt-facing (carriageways). Tag those edges as median-facing → no ped zone, flood to **median** material. With per-edge insets (#2) + edge tagging (#4), the median emerges with no special median-construction code. (This is why "split pavement doesn't work anymore" — uniform inset can't express it; per-edge can.)

4. **Edge tagging — fills the neighborhood-edge strokes.** The DCEL already knows each edge's origin (street vs stencil vs median). **Map-boundary (stencil) edges get no asphalt and no ped zone** (the map just ends — that's the "3-point strokes don't fill" fix); **street edges get the normal strips**; **median edges** per #3. Replace T1's `perimeter = stencil − tiles` placeholder with proper per-edge-tagged perimeter tiles.

5. **Corner construction — CONCENTRIC at an authored R, not stroke-relative (Jacob's eye, 2026-06-01 — the corner-quality piece).** The current `strokeOpen` path strokes each run as a **round-capped stadium** (cap radius = the band's *full depth from the centerline*, ~5–8m) and unions them → corners read **"stretched"/distorted, a rounded-rectangle with a thick bend**, because the corner is a *union of per-run caps at the inset depth*, not a clean wrap. **Fix:** round the corner **once at an authored curb R** (the real ~4.5m radius, at the asphalt's inner edge) and emit the bands as **true concentric arcs** from that center (`R, R+cw, R+cw+tl, R+cw+tl+sw`) — uniform width, right radius, one nested wrap. Reuse the **R-kit**. ⚠️ **This is the hard one:** concentric corners *with* per-edge variable widths (#2) is the asymmetric-corner reconciliation that dogged figure-ground for 13 months — two edges of different widths meeting, resolved into one wrap. The stroke-per-run cap was a *robustness* shortcut (it's why #2/#3 fell out without collapse); the fix must keep that robustness on noisy LS runs (the smoothing from #1 helps stabilize a half-plane-offset-then-round-at-R approach). Corner **quality**, distinct from #2's per-edge **widths**.

> *(The four pieces above became five — #5 is the corner-quality refinement surfaced by Jacob's eye on the partial-T2 render. Also still outstanding from the code: the perimeter is the `stencil − tiles` placeholder — piece #4's per-edge-tagged perimeter tiles aren't built yet.)*

## Carry-forward: strip materials MUST stay overridable (Jacob, 2026-06-01)

The existing **per-leg strip-material swap** (V1.5: ctrl-click flips a ped strip's material **LU↔SW**; stored as `materials: {outer, inner}` per fe, default `{outer:'LU', inner:'SW'}`) **must survive the re-pour.** T2 does **not** build the gesture (that's T3) — but T2 **must tag the ped strips (treelawn/sidewalk) with per-fe material tags read from that same overridable `materials` source.** Do **NOT** hard-code "inner strip = sidewalk, outer = LU" into the tile geometry — keep the strip→material mapping data-driven off the existing `materials` model, so T3's flip gesture plugs in with zero geometry rework. (Asphalt + curb are fixed; the swap is about the ped strips.)

## LS adoption (the unflagged switch)

T1 left a **temporary** `scene === 'toy'` gate (toy→tiles, LS→figure-ground). T2 **dissolves it**: route **all scenes** (LS included) through the tile path, in both the bake (`bake-ground`) and the live render (`BlockGeometryV2Debug`). Figure-ground (`buildV2BakeShape`/`buildBlockGeometryV2`) stays in the tree **dead-in-place** — it is **not deleted** until T4 (replace-then-delete, `ARCHITECTURE §7`). After T2 the tile path is the one construction; the scene-conditional is gone.

⚠️ This is where **LS visibly transitions** onto the tile model — it will look rough mid-flight until the four pieces land. That's the authorized regression on the real map; iterate on Jacob's eye. LS is already broken on figure-ground, so this is forward motion, not loss.

## Develop on LS — that's where the real cases live

Toy can't exercise divided carriageways, the park, the Mackay/Benton loops, or the real neighborhood edge. **Develop against LS directly** (the real cases), `node cartograph/bake-ground.js` (~8s) + live in Design. Toy stays a passing regression check (re-bake it occasionally to confirm you didn't break the simple case).

## Reuse (retrofit, don't reinvent)

- `tileGround.js` — extend (the DCEL face-walk + inset are yours already).
- **W1 fe identity** (`feCustomKey` / `readFeCustom`) + existing measure resolution (`chain.measure`, `blockCustoms`) — for the per-edge widths.
- Clipper (`dilateRings`/`differenceRings`/half-plane offsets); the **R-kit** for the curb radius (round at authored R at the asphalt's inner edge, concentric outward — *not* at the inset depth).
- Camber's centripetal Catmull-Rom (from `buildBlockGeometryV2.js`) for #1.

## Boundaries — do NOT cross in T2

- ❌ **No authoring migration** — handles + corner controls stay where they are; bringing them into Survey (and the live-tile authoring) is **T3**. (So Measure/Corner overlays will still target figure-ground geometry on LS during T2 — known, fine.)
- ❌ **Do NOT delete figure-ground** — dead-in-place until T4.
- ❌ Don't touch `design.json` customs; don't edit canonical docs.

## Suggested internal sequence (land incrementally, Jacob's eye between)

(1) smoothing wire → loops round (quick, visible) → (2) edge tagging + LS adoption → neighborhood edges fill, LS on tiles → (3) per-edge widths + median → asymmetric streets + medians correct. Each is a sane commit + eyeball point.

## Gate

Jacob's eye on **LS** (Design live = bake): asymmetric street widths, divided-road medians render, neighborhood-edge strokes fill, loops are round. The tile model draws the real map correctly. That greenlights **T3** (authoring into Survey).

## Commit / report

- Commits on `cartograph-looks-pass-ab`, signed, Co-Authored-By line — one per the internal-sequence steps is fine.
- Report: each of the four pieces (approach + what landed); how per-edge widths resolve from fe identity; confirmation the scene-conditional is gone (all → tiles); the LS A/B (what draws right now vs figure-ground); toy still passes; anything that fought the per-edge geometry (the hard part).

*Provenance: Boz, 2026-06-01. T2 of the re-poured `HANDOFF-pipeline-reconception.md`. Tile model validated by the spike + T1.*
