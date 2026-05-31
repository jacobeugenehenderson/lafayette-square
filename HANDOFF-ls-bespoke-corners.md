# HANDOFF — LS bespoke-corner catalog (C5 intel)

> ⛔ **OPERATOR-CONTRADICTED — DO NOT TRUST THE OPTIMISM BELOW (Jacob, 2026-05-31).**
> This catalog was built from a **self-authored rasterizer** (`scratch/plan-render.js`) of baked triangles, **never confirmed against the production render or the operator's eye.** Jacob's verdict on the *actual app*: **"Visually, nothing worked. Success rate 0%."** The "corner geometry is RIGHT / 97% good / wall-move dissolves Axes A & B" conclusions are therefore **unreliable** — they describe what the proxy tool drew, not what the production path renders. Retained only as a record of the proxy reading and the IX inventory. The toy-works / LS-0%-on-the-same-emitter gap is the real, *unexplained* signal — resolve it through the production render path before betting anything on it. Lesson: [[feedback_proxy_render_is_not_the_operator_eye]].

**Status:** intel, read-only — **operator-contradicted (see banner).** **Author:** Transit (C5, 2026-05-31), captured by Boz.
**Purpose:** the riff-raff map for the wall-move + the post-wall bespoke-corner arc. No repairs were attempted — this charts *what's broken and where*, per the C5 rescope.

> **Render method:** faithful top-down orthographic rasterization of the real baked `ground.bin` triangles, painted in `renderOrder` (tool: `scratch/plan-render.js`). Plan view is the right lens for corners. Original crops were in `/tmp/ix-*.png` (ephemeral — regenerate from the tool if needed).
>
> **Caveats (Transit, time-boxed):** the numerical per-fe band-entry audit was NOT run (drift class is wall-move-deleted anyway); live-drag parity (`buildChainBandsLive` vs post-release bake) was NOT checked (can't drive the 3D Designer headless) — **Jacob should spot-check one LS chain drag.**

---

## Headline

**Corner geometry is RIGHT; the band *fill* is the fault.** Across every IX the curb-rounding outline is correct (Clipper handles it; no clamps needed). What breaks is the band fill inside the corner slice. Two different axes, as flagged.

## Axis A — band drop / notch ("4th-corner" residual at LS scale) — MOST COMMON

The §6.9 "one corner per IX drops its pad" residual is alive at LS scale. The corner rounds, but one corner's sidewalk band fails to close → a square notch/hook juts into the asphalt.

- **#154 Lafayette × Mississippi** (near-orthogonal 4-way): 3 clean, SE corner notched.
- **#177 Lafayette × S Jefferson** (6-leg): block corners clean, NW notched.
- **#8 Mississippi × Park** (§6.9 ref, offset/dog-leg 4-way): 2 west corners clean, both east corners notched — offset topology compounds it.
- **Fix route:** NOT operator-authorable — the operator can't author a pad the construction silently drops. Upstream input-prep variance → **the wall-move (frozen `blockRounded` + per-fe measure) is the natural fix**, or a narrow per-corner bespoke path. Do not chase pre-wall.

## Axis B — band-nesting disorder at complex/acute IXs

- **#179 Lafayette × S 14th** (5-leg, parking LU): right-side corners show curb↔sidewalk↔treelawn bands interleaving/notching disorderly (checkerboard at the seam where ring-band curb meets the per-chain asphalt). Fillet outline fine; nesting order breaks.
- **Fix route:** construction-level — wall-move or bespoke; not operator-side.

## Axis C — offset / multi-leg topology (true riff-raff)

- **#8 Mississippi × Park** — dog-legged offset; blocks on each side don't align, so independent-per-block construction can't make the corners meet. Bespoke (per-corner override may reduce the notch but won't fix the offset).
- **#113 S 12th × Tucker × Gravois** (5-leg, edge-of-stencil) & **#238 S Jefferson × motorway-link** (freeway ramp): arterial/freeway, sidewalk sparse-to-fragmented by nature. Low priority. NB: the "whisker" spikes here are on the **highway/asphalt** material (`emitChain`, unchanged path), **not** the ring-band emitter — pre-existing, out of scope.

## Minor / cosmetic

- Tiny detached band fragments (stray sidewalk/curb/treelawn slivers) near a few complex IXs (#204 NE, #183/#206 SE). Construction-level minor.

## Confirmed GOOD — the "97%"

- Regular orthogonal grid + clean Ts: uniform-width rounded fillets, continuous block-to-block. The keeper delivering; the bulk of LS.
- Per-block LU routing (`fe.blockKey`→map) visually correct at LS parcel density (residential/commercial/parking treelawn tints all right).
- Foundation-fault (fe-drop) appears **dissolved** — ribbons run continuous along block edges, no systemic black gaps. *Visual-level only* — instrumented per-fe band-count audit not run.

---

## For wall-move scoping (the bet this catalog supports)

The keeper's **geometry is sound**; the residual faults are **all band-fill emission at corners**, concentrated exactly where the pre-wall two-pass / customs-key drift lives (offset IXs, complex multi-leg). Strong evidence that the **wall-move dissolves Axes A & B wholesale** (freeze `blockRounded` + per-fe measure, kill the re-emit join), leaving **only Axis C** (true topology riff-raff) for the bespoke-corner arc.

**Recommendation (Transit, endorsed by Boz):** do NOT build per-corner code paths pre-wall. Re-bake + re-catalog **post-wall**; only the surviving Axis-C cases need bespoke helpers.

---

## ⚠️ LS `blockCustoms` is a two-regime graveyard — never got the V1.6 cleanup (Boz, 2026-05-31, verified from `public/looks/lafayette-square/design.json`)

Diagnosing "ribbon-handle edits don't update the LS render," I read the live `blockCustoms` and found **two incompatible keying regimes piled together**:

| Scheme | Example keys | Value shape | Origin |
|---|---|---|---|
| **Integer** | `'1'`, `'12'`, `'15'`, `'31'`, `'167'` | `{left:{…}, right:{…}}` (per-side) | **legacy chain-scope** authoring (pre-V2-Measure) |
| **Coordinate** | `'-131.0,265.0'`, `'305.5,-2.0'` | `{pavementHW, treelawn, …}` (flat per-fe) | **V2-Measure** polygon-only (`blockKeyFromRing`) |

This is the same disease V1.6 cured on **toy** (Trammel cleared toy's `blockCustoms` to `{}` — "accumulated stale customs were the flood driver, not the geometry") — **but LS was never cleaned.** Consequences, both observed:
1. **New edits don't render** — the coordinate-key scheme is the drift-prone one ([[feedback_block_key_rounded_vs_sharp_diverges]]): key computed off the *sharp* ring on write vs the *rounded* ring on read disagree on LS → lookup misses → render never sees the drag.
2. **The render is contaminated** by orphaned legacy integer-keyed customs the current emitter can't address.

**This is wall-move territory — specifically census HARD §H4 (the stable id scheme + `blockCustoms` keying migration).** The wall-move must (a) assign stable ids so the write→read round-trip can't drift, and (b) clean/migrate the accumulated LS customs as part of the freeze. A cheap pre-wall *diagnostic* exists (clear LS `blockCustoms` → `{}`, re-bake, eyeball — does LS render clean like post-cleanup toy did?) but we deliberately deferred it: we're doing the wall-move regardless, and LS re-evaluation is built into the post-wall plan. Captured here so the wall-move agent inherits the finding.
