# Prebake polygon-ization — forensic scope + spike report

> 🗄️ **CLOSED SCOPE+SPIKE (D2 face-freeze folded-live) — archive PENDING (2026-06-14, doc cleanup).** Held back per the lift-first gate: **`POLYGON-FIRST.md §0.1` depends on this doc's §1 for the L1/L2/L3 polygon-ization layer definition** — that fact must be lifted into `PREBAKE.md` before the physical move. Needs Jacob's eye. Live home for the curb-freeze program: `PREBAKE.md §4.1`/`§5` · `POLYGON-FIRST.md`.

**Deliverable of `HANDOFF-prebake-polygonization-scope.md` (Mercator, 2026-06-05).** Answers the brief's four questions, reports the validated spike on Mississippi×Lafayette, and decomposes the build into dispatchable sub-briefs. **Scope + spike only — no production change landed.** Spike code: `scratch/mercator-*.mjs`; proof render: `scratch/mercator-spike-proof.png`.

> **Verdict up front:** the brief's framing **holds** — freeze at prebake, detect via `phase.spineAt*`, corner the corridor outer-edge legs. The forensics **sharpen** it in two ways the build must absorb: **(a) the false corner has a third, *data*-level cause** — the carriageway measures have their sides scrambled (carriageway-B's outer `pavementHW` is 0; its width datum sits on the median side) — so the cure = **data fix + corner identity together**, not identity alone; **(b) C5 (the two-source seam) is lower-risk than the ledger implies** — the raw-OSM faces are consumed *only* as a land-use paint lookup, never as geometry, so its retire can sequence last.

---

> ## ⛔⛔ BANNER, 2026-08-04 — **D1's datum is GONE; this document's forensic conclusions are superseded.**
> Cause #1 below, and the whole §5 spike table keyed to it, rest on `lafayette-avenue-6` carrying
> `pavementHW = 0` on its outer side and `6.70` median-side (and carriageway-A `10.56 / 6.86`).
> **Measured on `src/data/ribbons.json` today: `lafayette-avenue-5` and `-6` are each `4.6738 / 4.6738`.
> No zero, no 6.70, no 10.56, no scramble** — superseded by `8fd3485d` (*"survey-based divided median —
> carriageway = surveyHW/2 per side"*). **D1 as written is not actionable, and §6.1's push-back on the
> parent brief (*"without D1 the corner can only land within ~10 m"*) no longer follows.** The mechanism
> narrative is kept as the record of how the false corner was diagnosed; ⛔ **do not cost work off its
> numbers.**

## 0. New forensic ground truth — the false corner's full mechanism

The docs say "`filletRing` corners the carriageway stub." The instrumented reality (`mercator-fillet-trace.mjs`) is sharper — **three stacked causes**:

1. **DATA — the block touches the chain.** Carriageway-B (`lafayette-avenue-6`) carries `pavementHW = 0` on its **park-facing (outer)** side, and `6.70` on its **median-facing** side. With outer asphalt depth 0, the park tile's boundary runs **flush along the carriageway chain** — Jacob's *"the parcel touches the centerline"* verbatim. (Carriageway-A is also scrambled: 10.56 median-side / 6.86 outer.)
2. **TOPOLOGY — the stub taper ends in a needle.** The face boundary follows the chain's final **taper segment** into the corridor-center node; Mississippi's asphalt stadium (butt-capped at the node) is then subtracted, leaving the pre-fillet ring with a **needle vertex AT the node: turn 179.1°, θ = 0.9°** (`legIn` 15.2 m of chain, `legOut` 7.5 m of butt-cap).
3. **CONSTRUCTION — `filletRing` amplifies the needle ~45 m.** Inset = R/tan(θ/2) = **581 m**, clamped to 0.45 × gap-to-neighbor-corner ≈ **45 m**. The fillet then (i) extrapolates its tangent **off-polyline** along the taper segment's heading — placing the apex at **(214.4, 216.6) = the false corner**, ~9 m off the chain; (ii) **drops every vertex within 45 m** on both legs — including the *only* vertex defining the Mississippi curb edge — so the ring jumps in one ~90 m chord from the false corner to the Kennett fillet, **erasing the entire west curb of the block** (production ring #20 never gets within 40.7 m of the true corner).

∴ the false corner is a **degenerate-input amplifier**, same family as the thorns: `filletRing` is fine on clean corners and catastrophic on θ≈0 needles. The cure is upstream — **never hand it a needle** — which is exactly the polygon-first program. *(Cross-ref: the same needle-amplifier mechanism plausibly participates in other thorn sites — `HANDOFF-band-fold-fix.md`'s class; out of scope here but worth one shared forensic pass.)*

**Bonus finding (new, needs Jacob's eye):** the scrambled inboard widths also mean the **median tile floods to asphalt** — cw-A inboard 10.56 + cw-B inboard 6.70 > the 8.06 m chain gap — so the Lafayette median region renders as one solid asphalt band, not a bare median. Second visible symptom of the same data defect (D1 below).

---

## 1. Q1 — Where should the freeze live? **Prebake. Not a `tileGround` cache.**

**Recommendation: the chain→polygon conversion runs once in prebake (`derive.js`, orchestrated by `pipeline.js`) and the polygon substrate freezes into the artifact (`ribbons.json` or its successor).** `extractFaces` is already a pure exported function of `streets[].points` — it *moves* upstream rather than being rewritten.

Why not a `tileGround` cache:
- **Caching ≠ freezing.** A cache re-derives on every miss; the corner decision would still live in per-build code and the false corner is re-born whenever inputs wiggle. The wall freezes *trust* (`WALL.md §1`); a cache freezes nothing.
- **The wall lands at ~P3 only if prebake owns the conversion.** Chains then die at the prebake→Survey boundary; Survey receives polygons and *reshapes* (offset by width, round by radius). A cache leaves chains load-bearing inside Survey — the wall stays late, the doctrine stays violated.
- **C5 can only be killed at prebake** — LU classification needs raw-OSM/parcel sources that exist in `derive.js`, not in the browser (§3).
- **Perf (the activated-block model, `SURVEY.md §4.1`)** needs a *stable substrate identity* to know what "everything else stays frozen" means. Block-independence is verified; the frozen substrate is what lets us exploit it.

**What exactly freezes (the granularity):** freeze **topology + identity**, not stroked geometry —
- **L1 — the tiles:** `extractFaces` output over the *skeleton* chains: per tile, the ring + per-edge `(skelId, side)` tags. Pure function of the frame → belongs with the frame's compile.
- **L2 — the corner identities:** per tile-vertex, which two legs the corner pairs — including the divided-transition resolution (§2), where the identity *replaces the stub taper* with the corridor outer-edge leg. Decided once, frozen.
- **NOT L3 — the stroked silhouette.** Asphalt offsets + fillets stay in Survey's live reshape (they consume operator-authored widths/radii, which change interactively). This is `PREBAKE.md §5`'s split verbatim: *corner identity (topology) = prebake; curb position (width/radius) = Survey.*

**One design wrinkle for the build brief:** `buildTileGround` smooths centerlines *before* face extraction (`smooth` default 0.5 live). Freezing unsmoothed topology is correct — `smoothChain` is interpolating and junction-pinned, so smoothing is a **pure per-edge geometric map that cannot change topology**; apply it at reshape time to the frozen rings' edge runs. (Alternative — bake the smooth into the frozen rings — couples a designer knob into the artifact; rejected.) Decide explicitly in D2's brief.

---

## 2. Q2 — Corner identity at the divided transition

**The decision, expressed as a polygon fact made once at prebake:**

> At a transition node (known from the frozen `phase.spineAtStart/spineAtEnd` — no node-matching at build time), the carriageway's **stub taper belongs to the intersection interior, not to any block.** Each block-side face boundary swaps the taper run for the **corridor outer-edge leg** — the carriageway's *straight body* line — extended to its intersection with the cross-street; the corner identity stamps the pair `(crossStreet·side, carriageway·side @ straight-body)` on that vertex. *(`SKELETON.md §5d`'s IP made operational: intersection variable, street/corner simple — this swap IS the declared boundary between them.)*

Mechanics validated in the spike (`mercator-spike.mjs`):
- **Detection** — `spineAt*` enumerates **47 carriageway transition ends at 24 distinct nodes** map-wide (both park corners included ✓). Sufficient; no other signal needed.
- **Taper isolation** — walk outward from the node; drop trailing segments whose heading deviates > ~4° from the established body heading. At Mississippi×Lafayette exactly **1 taper segment** drops; the remaining chain is straight to < 0.5°.
- **Cross-street** — the street holding the node as an *interior* vertex (Mississippi, vertex 11/21). Reversal-proof side selection: pick the measure side whose perp points into the block quadrant — and **ground it in the DCEL tags, not the eye** (the spike initially picked the wrong side via visual reasoning; the forensic's `mississippi/left` was the truth. The axis trap is alive — `[[reference_ls_local_frame_axes]]`).
- **The corner** — curb-line × curb-line intersection of the two legs. With Survey's authored widths applied at reshape, `filletRing` then rounds a clean ~90° corner at the authored R — the needle **cannot exist** because the taper is no longer a face boundary.
- **What was NOT done** — no `tileGround` keep-out, no carriageway reasoning inside Survey, no per-build reconstruction. The spike consumes only frame facts (chains, `phase`, measures) — prebake's inputs.

**The data prerequisite (D1) is inseparable.** The corner needs the carriageway's **outer half-width** to place the corridor curb; today that datum is 0 (scrambled sides). The leg-pairing *structure* is right even with broken data (10.7 m vs production's 40.7 m), but landing on the operator's point requires the width: see the spike table (§5). The chains sit at the carriageways' **inner (median-facing) edges** (chain gap 8.06 m ≈ `medianWidth` 7.92 — which is, note, just the *chain gap*, mislabeled), so the intended model is `anchor='inner-edge'`: outer side carries the full carriageway width, median side effectively 0. The data has them swapped (B) / polluted (A). Fix at the source (skeleton/derive measure assignment, keyed point-order-forward), never patched downstream.

---

## 3. Q3 — Retiring the two-source seam (C5): smaller than the ledger implies

**Forensic re-rank:** `ribbons.faces` (raw-OSM `nodeEdges`→`polygonize`→`classify`, `derive.js:1056–1178`) is consumed in exactly **one live place: `tileGround.luForRing` (:802–814), as a land-use *paint lookup*** — point-in-smallest-containing-face. It is **not geometry**; the block shape never touches it. The two-source seam's geometric danger was already retired *de facto* by the tile re-pour. What remains is conceptual debt + the `intersections[]` legacy.

**What the retire entails:**
1. **Stamp `use` per frozen tile at prebake.** Run the *same* LU vote (`osmLUPolys` centroid-in-ring area vote → parcel majority fallback, `derive.js:2724–2769`) against the **skeleton-derived tile rings** at prebake-time. The artifact's tiles carry `use`; `luForRing` dies; `blockLandUse` overrides keep working (`blockKeyFromRing(tile.ring)` unchanged).
   - ⚠️ **One real risk — composite faces.** Skeleton tiles can be *coarser* than OSM faces: tile #11 spans the park **plus** several blocks (pendant/dead-end streets don't split faces). A single per-tile `use` would smear LU across the composite. Today the per-tile interior-point lookup against *finer* OSM faces masks this. Mitigations (pick in D4's brief): keep the OSM LU polygons as a **classification overlay** consulted per-tile at prebake exactly as `luForRing` does today (no behavior change, still one *geometry* source), or sub-classify composite tiles. Don't silently coarsen.
2. ✅ **Re-source `intersections[]` consumers — DONE BY ATTRITION, do not cost this.** `ribbons.intersections` is `length 0` in **every** scene checked (LS, LS-staging, altadena, centrum, hipointe-demun, ksi-y-m-yn), so the marker read is already a no-op, and `BlockGeometryV2Debug` records that corners now come from the tile graph "not legacy `ribbons.intersections`". *(Also: `ribbons.junctions` is **277**, not 329 — 329 is the skeleton's count.)*
3. **Delete** the raw-OSM face path (`vehicularStreets`→`densify`→`nodeEdges`→`polygonize`→`classify` as a *faces* source) + `ribbons.faces`/`intersections` from the artifact.
   > ⛔ **DO NOT delete `medians[]` — this step used to say to, and it was false.** *(Corrected 2026-08-02.)* The "zero `src/` consumers / vestigial decoy" reading came from the Truman forensic and was **overtaken by E2** (`LOOP-STREETS §4`, 2026-06-11 `e8cc310`): the median became a **constructed polygon frozen at prebake**, and `medians[]` is now its home. Verified on trunk: **52 entries** in `src/data/ribbons.json` (63 in Altadena) with **live dereferences** at `tileGround.js:2230` (E2 median polys), `:2335` (`medRings`), `:2611` (per-median lookup) plus the `isMedianTile` path at `:3240`. **Deleting it removes the divided/loop median construction.**

**Sequence + risk: LOW; do it LAST** (D4). It is independent of the corner cure and gated by a cheap A/B (LU colors byte-identical map-wide). The palimpsest cleanup is real but it is not the cure's critical path.

---

## 4. Q4 — Decomposition: dispatchable sub-briefs

| # | Brief | Depends | Risk | Eyeball gate (operator = final verdict) |
|---|---|---|---|---|
| **D1** | **Carriageway measure hygiene (data).** Forensic on `skeleton.js`/`derive.js` measure assignment for divided pairs; key sides **point-order-forward** (reversal-proof); outer = carriageway width, median-facing = 0 effective. Includes: rename/annotate `medianWidth` (it is the **chain gap**). | — | M (touches all 22+ divided corridors) | Jacob, live Survey: Lafayette park-side curb appears ~7 m south of the chain; the park block no longer touches the centerline; **the median strip stops rendering as solid asphalt.** A/B over all divided corridors (Truman incl.). |
| **D2** | ✅ **LANDED — do not re-plan.** *(Verified 2026-08-02: `ribbons.json` carries `tiles[]` — **101** LS / **694** Altadena — and `tilesFromFrozen` (`tileGround.js:774`) is the live consumer at `:2197`, `smooth > 0 ? null : tilesFromFrozen(…)`, with `STREET_SMOOTH` pinned 0.)* Prebake face freeze (topology): `extractFaces` over skeleton chains; `tiles[]` frozen into the artifact; `tileGround` consumes them. ⚠️ The **smoothing wrinkle (§1) is still open** — `smooth > 0` re-derives and bypasses the freeze. | — | M | **Byte-identical render A/B** (frozen-vs-derived assert harness + screenshot diff). The freeze must be invisible. |
| **D3** | **Corner identities at divided transitions (the cure).** At prebake, per transition node (`spineAt*`): isolate the taper, swap the block-side face boundaries to the straight-body leg, stamp `cornerIdentity{legs}`; Survey reshape pairs the identified legs (offset by authored widths, fillet at authored R). | D1 + D2 | M-H | Jacob, **live tool**: Mississippi×Lafayette + Park×S-18th corners clean against the aerial; sweep the **24 enumerated transition nodes** for regressions (the spike prints the list). |
| **D4** | **LU at prebake + retire raw-OSM faces (C5).** §3's three steps. ⛔ **`medians[]` stays** — it is E2's constructed-median home, 52 live entries (§3). | D2 | L | LU-color A/B byte-identical; IX markers/corner handles unchanged. |
| **D5** | **Activated-block live reshape (perf).** Recompute only activated tiles on edit; the rest render from the frozen substrate. | D2 (D3 for corners) | M | Designer feel on the high-res aerial (the sticky-tools complaint); no visual diff when idle. *(Overlaps the Wall Phase-D arc — coordinate, don't duplicate.)* |

**Order:** D1 ∥ D2 (independent, both dispatchable now) → D3 (the cure; needs both) → D4 ∥ D5. The Wall milestone's "(b) correct data" gate (`WALL.md §5`) is satisfied by D1+D3 for the false-corner class; the thorns (band-fold) stay a separate prerequisite as already ledgered.

---

## 5. The spike — Mississippi×Lafayette (validated)

`scratch/mercator-spike.mjs` + proof render `scratch/mercator-spike-proof.png`. Construction: **leg A** = Mississippi chain ⊕ 7.52 (its authored park-side `pavementHW`, side grounded in the DCEL forensic) × **leg B** = carriageway-B straight body (1 taper segment dropped) ⊕ outer width. Operator truth: the correct-target strokes meet at **(174.1, 208.3)**.

| construction | corner lands | distance to operator's true corner |
|---|---|---|
| **production (live tileGround)** | (214.0, 216.2) | **40.7 m** |
| corridor legs, hwB = 0 *(today's frozen outer datum)* | (173.7, 219.0) | 10.7 m |
| corridor legs, hwB = 6.70 *(B's width datum, currently filed on the median side)* | **(172.8, 212.1)** | **4.0 m** |
| corridor legs, hwB = 9.0 *(operator-stroke-implied width)* | (172.6, 209.7) | 2.1 m |

The Mississippi-axis residual is **< 1.5 m in every row** — the leg-pairing structure is correct; the remaining error is purely the carriageway outer-width *datum* (D1). The proof render shows the green construction tracking the operator's dashed strokes against production's 90 m wedge.

> ⚠️ **Final verdict is Jacob's eye on the live Survey tool** — these are proxy measurements/renders, and proxy renders have repeatedly misled on this map (`[[feedback_proxy_render_is_not_the_operator_eye]]`; the spike itself tripped the axis trap once, §2). The numbers are line-vs-point distances and axis-flip-independent, but the *gate* is the operator.

---

## 6. Where this pushes back on the brief (per its own instruction)

1. **"Corner the corridor outer-edge legs" is necessary but not sufficient.** Without D1 (the width datum) the corner can only land within ~10 m. The cure is **D1 + D3 together**; a build brief that ships leg-pairing alone will look "still broken" on the operator's eye and invite another round of corner-patching.
2. **C5's billing as "highest-leverage cleanup" overstates its risk-priority today** — it's a paint lookup, not a geometry seam, post-re-pour (§3). Keep it (D4), but don't let it gate the cure.
3. Everything else in the brief's framing — freeze at prebake, `spineAt*` sufficiency, polygon-level decision, no `tileGround` patch — **confirmed by instrumented forensics.**

*Harness inventory: `mercator-forensic.mjs` (defect repro: ring#20 @ 40.7 m), `mercator-tile-edges.mjs` (face boundary ownership), `mercator-fillet-trace.mjs` (the needle: θ=0.9°, inset 581→45 m), `mercator-wedge.mjs` (negative: no stadium covers the wedge — it's fillet loss), `mercator-spike.mjs` (the construction + transition enumeration), `mercator-spike-svg.mjs`/`mercator-corner-svg.mjs` (renders).*
