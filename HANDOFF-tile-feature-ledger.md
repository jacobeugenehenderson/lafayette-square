# Tile Re-pour — Feature Restoration Ledger

**The definition-of-done for the tile re-pour** (the umbrella `HANDOFF-pipeline-reconception.md` brief was retired to git — live state is `cartograph/BACKLOG.md` + this ledger). Every authored/visible capability the figure-ground map had, tracked through the re-pour so **nothing dies silently** and we stop surfacing them one at a time from memory. Adapted from the wall-move's F1–F10 ledger.

**Status legend:** ✅ landed on tiles · 🔜T2 = T2-finish pass (next dispatch) · 🔜T3 = authoring-into-Survey · ⏸ deferred slab-content (authorized regression, scheduled) · ⚠️ partial/verify.

**A row goes ✅ only on Jacob's eye on the LS production path** — not on an agent's data check or a proxy render (`[[feedback_proxy_render_is_not_the_operator_eye]]`).

## ⟢ T2-FINISH CLOSE-OUT (Tessera, commits `57c2912`→`993b499`, 2026-06-01)

**All eight 🔜T2 rows landed — the construction side of the re-pour is DONE on LS** (unflagged, live==bake). Already ✅ on Jacob's eye: **M1/M2** (per-LU colour + matching treelawn), **G3a** (median + the global side-convention fix → "closer than it's ever been"), **G5 pad** (the ❤️ corner). **Awaiting one consolidated LS eyeball to flip the rest green:** **A2** (Corners slider reshapes tile corners), **G9** (exterior roads now reach their ends), **G8** (round cul-de-sac vs flat edge-stub per authored `capEnds`). **M3** = data-only (no visual; strip-swap-ready for T3). **Still open + scheduled:** ADA tangents (⚠️ G5 construction watch) · per-corner/per-IX R (T3 UI) · the authoring channel onto tiles (T3) · slab-content D-rows · T4 figure-ground delete. P1 footprint now ~28.6MB (parked). **Next program phase: T3 (authoring → Survey).**

> Sources censused: `RIBBONS.md` §1/§5/§6.9 + §7 · `FEATURES.md` (corner-kit, data-flow, layering, treelawn-matches-parcel, non-street ribbons) · the V1.5/V1.6 record · current `src/lib/tileGround.js` + Tessera's T1/T2 reports. Statuses marked ⚠️ want a code re-verify before they're trusted.

---

## A. Construction / geometry

| ID | Capability | Status | Where / note |
|---|---|---|---|
| G1 | Asymmetric per-side **asphalt** widths (`pavementHW` per side) | ✅ | T2.3 per-edge; **side-convention fixed G3a/`84e6bd3` (right-perp); Jacob confirmed asymmetric reads right-way-round on LS — "closer than it's ever been"** |
| G2 | Per-side **treelawn/sidewalk** widths | ⚠️ | per-edge on straights; **uniformized per-block at corners.** Boz rec: **defer the deeper per-edge-at-corners cut** (high-effort/low-visual-return; matches the mono-ped spirit) — revisit only if Jacob's eye flags a specific corner. *Pending Jacob's confirm.* |
| G3 | Divided-carriageway **median** (`anchor:'inner-edge'`, `innerSign`, `pairId`) | ✅ | **Derived WALKED FACE (2026-06-16)** — face-read `isMedianTile` (a tile bounded by both carriageways of a pair), `luRemainder` painted grass; NOT a constructed ring. `RIBBONS §1`+§3.5 |
| G3a | **Median treelawn sliver** — residual treelawn in divided-road medians | ✅ | Tessera `84e6bd3` — root cause was the **global side-convention bug** ([[feedback_perp_side_convention]]); fixing it removed the sliver AND corrected asymmetric widths everywhere. Jacob confirmed on LS. |
| G4 | **Concentric rounded corners** | ✅ | T2.5 — "attractively rounded" (Jacob's eye) |
| G5 | **ADA corner ramp** — at the corner the **sidewalk FILLS the treelawn band** → one **solid sidewalk pad** from the curb's inner edge to the property line (full ped depth = treelawn+sidewalk, all sidewalk). Structural, not operator-overridable. | ✅ pad / ⚠️ tangents | **Solid pad confirmed on Jacob's eye (the ❤️ moment).** ⚠️ **WATCH: "weird things with the ADA tangents" (Jacob).** The tA/tB transition (treelawn→all-SW) is **CONSTRUCTION, not authoring** — so authoring tools will NOT fix it; if it persists it's a real G5 residual. Logged, not chased per Jacob; revisit (cheap peek while Tessera's in tileGround for M3, or post-T3). — *original spec:* **Jacob's precise spec (2026-06-01, supersedes my earlier arc-handedness guess — that was wrong):** the corner ped must be a **SOLID filled sidewalk region**, NOT separate concentric treelawn+sidewalk arcs (those collapse the inner sidewalk arc to a **point** → the "comes to a point, no ramp" bug). Treelawn ends at the tangents tA/tB; from there sidewalk takes the full depth. **Same in arc (rounded) AND square (R=0) versions — corner R curves the outer edge only, does NOT shrink the pad to a point; ramp fills the equivalent area either way ("the difference between the two").** Doctrine home: RIBBONS.md §6.9 (corner = all-SW, sidewalk curb→property-line). **Corners + sidewalks geometry are good — fix the corner FILL only, don't regress them.** |
| G6 | **Curb stroke** (continuous, wraps silhouette incl. corners) | ✅ | the curb band |
| G7 | **Centerline smoothing** (loops/curves round) | ✅ | T2.1 `smoothCenterline.js` (one source: tiles + figure-ground) |
| G8 | **Dead-end cap typology** — round-cap **or** flat/no-sidewalk-cap (ends at LU) | ✅* data-wired | Tessera: tile resolves `capEnds ?? caps.cap ?? round` — operator's Survey override wins, unauthored falls back to geometric default. Survey UI for the selector = T3; G8 = the data-wire. *Pending Jacob's eye on dead-ends.* |
| G9 | **Perimeter / edge-of-map tiles** (outermost streets stroked on their outer side) | 🔜T2 — **PULLED FORWARD** (Jacob's eye, 2026-06-01) | **NOT subtle** — Jacob's screen shows *whole exterior street-arms with no asphalt* ("roads don't continue to their dead ends"); the road just stops near the boundary and LU floods over it. (Tessera's render said "mostly intact" — proxy-render gap; Jacob's eye wins.) Cause: asphalt comes from a *tile's* grout strip; exterior streets have no tile on the outer side. **Min fix:** include the DCEL outer-face / stencil-annulus as a face and stroke its street-facing edges inward → exterior streets get asphalt. Full boundary treatment (crop-to-circle, feather, cull) still rides `HANDOFF-boundary-trio.md`. Do after M3, before T3. Check it's the deferral, not a side-flip/M3 regression. |
| G10 | **Full-flood LU** (no internal ring; LU = tile remainder) | ✅ | core tile model |
| G11 | WYSIWYG **live == bake** | ✅ | one `buildTileGround` for both |
| G12 | **Capacity guard — thin-feature degeneracy** (W-past-inscribed-reach): when a tile's interior pinches below the band depth `WB=cw+tl+sw`, the inward offsets collapse past the medial axis → degenerate spurs `filletRing` rounds into **"thorns."** ⚠️ **SYSTEMIC — ~100 instances across the map** (Jacob, 2026-06-02): every thin loop / narrow median / sliver / tight wrap, not just Benton (Benton was only the easy exemplar). | ⚠️ **PARTIAL — guard landed but thorns persist** (Jacob's eye 2026-06-04: "Benton place has thorns… the rest of the thorns are still there everywhere"; only the **highway** cleared, and that was **grade-sep** removing the tiles, not this guard) | **NOT a stale bake** — the current committed bake is D1's (`5348fbc`, *after* `d325c4b`), so the guard IS in the bake on screen; the thorns persist anyway. The guard (`tileGround.js:936-938`) **only engages on FULL collapse**: `if (WBnom>1e-6 && !offsetRings(iA,-(WBnom/0.9)).length)` runs the binary-search/clamp *only when the inward offset goes empty*. A tile that collapses to a **thin non-empty sliver** keeps `cap=WBnom` (no clamp) → offsets still run past the medial axis, `filletRing` thorns them. So it caught a subclass (full-collapse / d325c4b's 26→21MB), **not the general class** (Benton loops/slivers/medians = partial-degeneracy). **The census was right ("general guard isn't complete"); my 2026-06-04 "✅ done" flip was the proxy-eye error — corrected.** **FIX = `HANDOFF-band-fold-fix.md` — Option A, LOCAL capacity clamp (Bollard, in-flight 2026-06-04):** make the guard engage on partial-degeneracy (clamp depth where the **local** inscribed reach < band depth, not only all-empty tiles) **without over-clamping the in-spec rest of the block** (the per-tile clamp over-clamps — must be local). Covers Root A (T-mouth `iW`-fold) + Root B (thin-tile). ⛔ still NOT a corner-R clamp (`feedback_no_corner_radius_clamps_in_emit`). Test across MANY thin features, Jacob's eye. *(Forensic: `HANDOFF-junction-band-thorns-FINDINGS.md`.)* **⭐ 2026-06-11 reconciliation (`SECTION-CAP-CLAMP-FORENSIC.md`): G12 is TWO subclasses, conflated above. (1) self-intersecting blobs — addressed by the band-fold-fix but it's STRANDED on branch `8e1e414` (NOT an ancestor of HEAD; `declumpLayer`/`simplifyRings` absent from the code), so its RESULT's "flip G12 → DONE" never executed. (2) band-neck / partial-degeneracy — the `cap` clamp (now `tileGround:2396`, `d325c4b`) fires ONLY on full collapse; the `thinTile` signal (`:2383`) that flags the thin-but-non-empty case is computed but ORPHANED (drives only `bandJoin`), and the acute thin/trim clamp that would use it was built-then-reverted (`b464297`→`7a2e2db`, June 1). Live exemplar = the Albion cul-de-sac band-neck (un-masked by the `f908143` cap-wrap repair). So "PARTIAL" is correct; BOTH subclasses are open in this branch.** |

## B. Material / color

| ID | Capability | Status | Where / note |
|---|---|---|---|
| M1 | **Per-LU face color from metadata** (block colored by its land-use class, not all-residential) | ✅ | resolved (Jacob 2026-06-01) — each tile colors by its LU metadata |
| M2 | **Treelawn matches its block's LU color** | ✅ | resolved (Jacob 2026-06-01) — treelawn paints its own tile's LU |
| M3 | **Per-leg strip-material swap** (LU↔SW; `materials:{outer,inner}` per fe) | 🔜T2 (data) / 🔜T3 (gesture) | T2 keeps strip→material data-driven/overridable; T3 brings the ctrl-click flip into Survey |
| M4 | **Highway-class asphalt** (motorway vs residential color/width) | ⏸ | `ribbons.streets[].highway` carried; routing deferred |
| M5 | Curb / sidewalk / treelawn / asphalt materials via `BAND_TO_LAYER` + per-Look `design.json` colors | ⚠️ | verify the tile bake routes per-Look colors (not BAND_COLORS defaults) |

## C. Authoring (Designer)

| ID | Capability | Status | Where / note |
|---|---|---|---|
| A1 | Drag **handles** (`pavementHW` / `treelawnOuter` / `propertyLine`) | 🔜T3 | currently figure-ground overlays; migrate to Survey, drive tiles |
| A2 | **3-tier corner-R kit** (global Corners slider × per-IX × per-corner; gold=authored; right-click revert) | 🔜T3 | **The T2 down-payment did NOT take — "A2 no work" (Jacob's eye): the Corners slider doesn't reshape tile corners live.** Confirms the channel-on-figure-ground diagnosis (one-off wires don't hold on a half-migrated layer). **Folds fully into T3** (the authoring-channel migration). Don't isolate-debug — T3 fixes it with its siblings. |
| A3 | **R=0 authorable** (square ADA ramps) | 🔜T3 | with A2's authoring migration |
| A4 | **Cap selector authoring** (Survey round/blunt/none selectors *drive* the dead-end cap, live) | ✅ consume (T2/G8) · 🔜T3 (selector→live) | Bake **honors** `capEnds` (G8 — the *consume* end of the wall). Missing: the Survey **selector reaching the live tile construction** (the *author* end). Jacob (2026-06-01): this is the authoring↔construction↔slab seam = **the wall / helper-app division.** Same class as A1/A2/M3/A9 — authoring controls still on figure-ground; T3 migrates the whole channel onto tiles. |
| A5 | Edit-entire-row vs edit-block modes | 🔜T3 | Measure authoring scope |
| A6 | Symmetric/asymmetric mirror toggle (`editSidesSeparately`) | 🔜T3 | transient UI |
| A7 | Per-block-edge customs (W1 fe identity `feCustomKey`) | ✅ (identity) / 🔜T3 (write path) | identity shipped `6b83798`; authoring write rides T3 |
| A8 | Reset-toy button | ✅ | toy-specific, exists |
| A9 | **Measure translucency rules** (selected-chain / adjacent-block) | 🔜T3 | "messed up" (Jacob). ⚠️ **Consult RIBBONS §5 before touching** — the translucency-by-design is documented + has been *misdiagnosed as a bug before* (cost a cycle); don't guess. **Do NOT fix on figure-ground** — see A-note below. |

> ⚠️ **A-note — the authoring layer still runs FIGURE-GROUND, live, in the Designer.** The Measure/Corner overlays + handles still mount `buildBlockGeometryV2` (Tessera's T1: the figure-ground memo is still *computed* even though tiles render — only its meshes early-return). **This is the unifying cause of the cluster Jacob's seeing — strip-swap broken, ADA-tangent weirdness on the overlay, translucency messed up — AND a real perf/reliability drag** (redundant figure-ground compute every Designer frame; Jacob's suspicion confirmed). **T3's real job = migrate the authoring OFF figure-ground ONTO tiles** (handles, translucency, strip-swap, corner controls); **T4 then deletes figure-ground.** Until T3: **do NOT fix authoring-in-place on the dying path, do NOT delete it (it comes back in T3, migrated).** Keep going.

## D. Slab-content (other bake groups — authorized regression, scheduled)

| ID | Capability | Status | Where / note |
|---|---|---|---|
| S1 | Alley / footway / cycleway / steps / path ribbons (`buildPathRibbons`) | ⏸ | + the universal alley end-cap dial |
| S2 | Sub-block overlays (parking_lot, garden, playground, swimming_pool, pitch, sports_centre, wood, scrub, tree_row) | ⏸ | from `map.json` |
| S3 | Linear features (fence, wall, retaining_wall, hedge, edgeline, bikelane, stripe) | ⏸ | buffered polylines |

## E. Non-functional (footprint / perf)

| ID | Concern | Status | Where / note |
|---|---|---|---|
| P1 | **Slab footprint** — LS tile bake **~826k verts / 27MB** vs figure-ground **~480k / 15MB** (~1.7× heavier) | ⏸ **PARKED (Jacob, 2026-06-01) — low-urgency, do NOT chase now** | **Not an FPS problem** — 826k *static* ground verts + 35 draw calls ≈ trivial; mobile GPU spends on fill/transparency/live-3D, not the flat ground mesh. It's a download/memory cost only, and the app **loads in Hero** (ground mostly hidden) so first-paint barely sees it. **A working heavier map beats the broken lighter one — results first.** Recoverable later via known dials (kept here so it's a quick tune, not a rediscovery): coarsen `maxEdge` on flat LU flood tiles (the ~4–8× multiplier, biggest lever) · DP-simplify output rings (figure-ground did; tiles don't) · arc tolerance 5cm→20–50cm · future: distant/off-screen ground LOD/cull. **Profile before cutting.** Revisit when footprint actually bites (deploy/perf pass), not before. |
| P2 | **Stability** — failure classes eliminated by the method (no figure-ground subtraction / blockKey drift / two-pass / customs-flood / open-3pt-polygons / self-int rings) | ✅ (the method's real win) | predictability + fewer drawing-board resets; not FPS |
| P0 | **Toy Stage not hooked up correctly** (Jacob flagged 2026-06-01, not-vital) | ⏸ parked / housekeeping | Toy is the **regression fixture** now (we build LS-direct); a broken Toy Stage erodes its value as a "did the simple case still bake?" check. Likely the Stage transition / bake-target / render wiring (we've seen toy-bake fragility before — the bake-target ghost, the caps.degree gate). Get specifics from Jacob when picked up. Fix *before* relying on toy to settle a regression question. |
| P3 | **ALL curves béziér-smooth in street view** — corner arcs **and** smoothed centerlines (Jacob, 2026-06-01: the operator sees curves up close) | 🔜 (constraint) | jack up tessellation fineness on every curve to the extent the vert budget affords. ⭐ **Compatible with P1 footprint:** curves are a *small* vert fraction but *high* close-up value; the flat-LU `maxEdge` refinement is the *big* vert driver and *low* value → P1 pass **trims flat-LU bulk, KEEPS curves fine.** Don't coarsen the curve/`arcTolerance` fineness. |
| A10 | **Smoothing authoring affordance** — selected area renders **un-smoothed (raw)**, returns to smooth on `enter` (Jacob) | 🔜T3 | shows the operator the authored vertices + that smoothing is applied; commit (`enter`/deselect) → smooth. |
| M6 | **Curb = global width, editable, own shader/material** (Jacob) | 🔜T3 | global (not per-fe), but an editable width control + a distinct curb material (not asphalt/sidewalk). |

---

## The next dispatch falls out of this: **T2-finish** (warm → Tessera)

The 🔜T2 rows, as one pass (M1/M2 land-use color ✅ already resolved): **G5** ADA corner all-SW (arc-handedness fix) · **G8** dead-end cap typology · **G9** perimeter tiles · **A2** corner-R-wire · **A4** honor cap authoring · **M3** strip-material data-driven. (G2 per-edge-ped-at-corners: confirm acceptable or add.)

Then **T3** (authoring → Survey, the 🔜T3 rows) → **slab-content** (the ⏸ rows) → **T4** delete figure-ground.

*Maintained by Boz. Update a row's status only when Jacob's eye confirms it on LS. Provenance: 2026-06-01 capability census.*
