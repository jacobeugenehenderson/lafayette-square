# doc-sweep-3 — CLUSTER 3 "The tools" (`SURVEY.md` · `SECTION.md` · `RIBBONS.md`)

**Sweeper: Plumb.** Read-only. Findings only — nothing changed.

**Claims extracted: 44 load-bearing.** CONFIRMED 22 · FALSE 15 · UNVERIFIABLE 7.

**Headline:** the *doctrine* in all three docs held up almost everywhere I could test it. What has
rotted is the **as-built layer** — three docs describe a `tileGround.js` that is two months and
several landings out of date, and two of the rotted claims say a thing does not exist when it does
(the frozen tile substrate) or does exist when it does not (the spur outline). Both are the exact
failure the brief was written for.

**Could not check:** the `classify.js` park attribution numbers (needs replaying the classifier over
`raw/osm.json`); the `n=951` treelawn distribution (measured against a `survey.json` denominator I
could not reconstruct); anything requiring a re-bake or the operator's eye.

---

## SURVEY.md

### SURVEY.md §5.1 ("Where the cure lives: prebake") — **FALSE**
CLAIM: *"Today prebake is a thin compile — it emits `ribbons.json`, still **chains** — and defers the
chain→polygon conversion (`extractFaces` + silhouette) into Survey's per-build construction. The move
is to do that conversion once, in prebake, and freeze the polygon substrate."*
ACTUAL: **already done for the tile half.** `src/data/ribbons.json` carries `tiles: [{ring, edges}]`
— **101 entries**, the frozen block-face topology. `tileGround.js:2197`:
`let tiles = smooth > 0 ? null : tilesFromFrozen(ribbons?.tiles, streets)` — and `STREET_SMOOTH === 0`
(`smoothCenterline.js:150`), so **the frozen path is the live path**; `extractFaces` runs only as a
no-artifact fallback (toy / pre-D2). `tileGround.js:757`: *"ribbons.tiles is the prebake artifact
(derive.js runs extractFaces once…)"*; `derive.js:4495` writes it; `promote-ribbons.js:80` reports it.
IMPACT: the highest-cost finding in this cluster. This paragraph is cited as the standing
architectural target, and it tells a reader to go **build infrastructure that shipped**. What is
actually still unfrozen is the *silhouette/curb*, not the tile topology — the doc conflates them.

### SURVEY.md §3 (opening) — **FALSE**
CLAIM: *"The live construction is the tile model… **1. `extractFaces(streets)` → the Tiles.**"*
ACTUAL: same evidence as above — the default live construction reads frozen tiles.
IMPACT: anyone instrumenting or "fixing" the face walk is editing a fallback branch LS never enters.

### SURVEY.md §3 (opening) — **FALSE**
CLAIM: *"**LS runs it unflagged** (`isTileScene = true`, `BlockGeometryV2Debug.jsx:253`)."*
ACTUAL: `isTileScene` no longer exists. Only two references survive, both comments recording its
deletion: `buildBlockGeometryV2.js:1815`, `BlockGeometryV2Debug.jsx:1128` (*"deleted at T4
(2026-07-15) along with the isTileScene flag"*).
IMPACT: minor on its own; it is the tell that §3–§4 were written pre-T4 and never revisited.

### SURVEY.md §3 (the pull-quote under the numbered list) — **FALSE**
CLAIM: *"**The only chain reach-back in the SHAPE pass** is `runMeasure`/`runSegOrd`… That is
**authoring identity, not geometry**."*
ACTUAL: `freezeCurbEdgeFacts({ring, runs, streetsOrig, measures, …})` (`tileGround.js:185`) is a
second, **geometric** chain reach-back inside the shape loop — it reads `streetsOrig[].outerHWProfile`,
`phase.role`, `throughId/roadId` and per-run base half-widths to stamp one fact per ring edge, and it
is what the curb producer offsets from (`tileGround.js:3280`).
IMPACT: this sentence is the doc's evidence that the SHAPE pass is nearly chain-free. It is used to
argue where the Wall effectively sits; the argument is weaker than stated.

### SURVEY.md §5 + §7 (the Wall, stated twice) — **FALSE**
CLAIM: *"`sectionPass(shapeTiles, cw, stripMat)` … takes only the frozen per-tile polygons + scalars
— **zero handle on streets, chains, measures, or `blockCustoms`.**"*
ACTUAL: `tileGround.js:1862` — `export function sectionPass(shapeTiles, cw, stripMat, blockCustoms = null)`.
`blockCustoms` **is** the 4th parameter and is used (`tileGround.js:1098` `sectionPassTile(st, cw,
stripMat, blockCustoms)`).
IMPACT: direct contradiction with `SECTION.md §3`, which states the 4-arg form and explains *why*
design intent may cross the wall while chain geometry may not. A reader taking SURVEY's version would
treat any `blockCustoms` read in Section as a wall breach and "fix" a landed feature. Code decides:
SECTION is right, SURVEY is stale.

### SURVEY.md §6 (the residual "d" bulge — the named mechanism) — **FALSE**
CLAIM: *"it is the **curb PRODUCED by stroking the chains** (`buildTileGround`: `iA = tile.ring −
asphalt-union`, and that union swells at the transition)."*
ACTUAL: that is the **legacy** path. Default since D6a is the per-edge parallel offset:
`tileGround.js:3269` *"DEFAULT: iA = the per-edge parallel OFFSET polygon (offsetRingVariable) … NOT
carved from the junction-swelled asphalt (that bows the curb where the windows pile in).
opts.iaCarveLegacy = today's swelled carve, kept for A/B."* The carve now runs only where the offset
is gated off (see the RIBBONS finding below).
IMPACT: names the wrong mechanism for an open defect — the same shape as the brief's "wrong mechanism,
wrong by 6×" example. `RIBBONS.md §2` states this correctly; the two docs disagree.

### SURVEY.md §4 (Migration state) + §4.1 (Perf) — **FALSE**
CLAIM: *"the authoring overlays still **compute** the dead figure-ground (`buildBlockGeometryV2`)
**every authoring frame** to position handles — a per-frame perf drag… that full-map redraw is why the
tools feel **sticky**."*
ACTUAL: it is a `useMemo` keyed on `[liveRibbons, stencil, debouncedInputs, useRingBandEmitter,
surveyActive, measureActive]` (`BlockGeometryV2Debug.jsx:399`), **gated to the surveyor/measure tools
only**, and the comment records the post-T4 cost: *"That geometry is gone and the build is now ~0.5 s,
so the gate is no longer load-bearing."* The 285 s/320 s drag was deleted 2026-07-15.
IMPACT: points a perf investigation at a cost that was already paid. The whole-map `buildTileGround`
re-run (the *other* half of the claim) is real and remains the live perf item.

### SURVEY.md §3 item 3 (corner radius) — **CONFIRMED**
3-tier per-corner → per-IX → default 4.5 m × `cornerRadiusScale`: `tileGround.js:2080`
(`baseR = opts.cornerR ?? 4.5`, `scale = opts.cornerRadiusScale ?? 1`), resolved per-vertex at `:3255`.
`cornerFillets` is emitted (`:3453`) and is what the authoring handle reads
(`BlockGeometryV2Debug.jsx:810/873`) — no re-derivation, as claimed.

### SURVEY.md §3 item 4 (capacity guard) — **CONFIRMED**
*"Engages only on FULL collapse… a tile that pinches to a thin non-empty sliver keeps `cap = WB`."*
`tileGround.js:3484`: `if (WBnom > 1e-6 && !offsetRings(iA, -(WBnom/0.9), bandJoin).length)` — bisect
only when the offset returns **empty**. Exactly as documented.

### SURVEY.md §4 (handle anchoring / `rayHitCurb`) — **CONFIRMED**
Cap at `pavHW + curb + 8 m`: `MeasureOverlay.jsx:441` passes `maxT = pavHW + cwSide + RAY_CURB_MARGIN`
with `RAY_CURB_MARGIN = 8` (`:206`), against `rayHitCurb(…, maxT = Infinity)` (`:185`).

### SURVEY.md §2 (artifact paths) — **UNVERIFIABLE (a) / misleading**
CLAIM: Survey authors → `clean/overlay.json`.
ACTUAL: there is no repo-root `clean/`. The real homes are `cartograph/data/<scene>/clean/overlay.json`
— **and** a scene-less `cartograph/data/clean/overlay.json`, which is the shared-default path
`ORIENTATION` flags as the LS-is-the-fallback hazard. Same for `clean/park-polygon.json` (RIBBONS §6.2a).
IMPACT: a reader looking for the authored overlay finds nothing, or finds the shared default and edits
the fallback.

---

## SECTION.md

### SECTION.md §7 (LANDED list, last bullet) + §8 (doctrine) — **FALSE** (and self-contradictory)
CLAIM: *"⚠️ The **corner** construction is OPEN (§6) — a bent-polygon attempt was reverted."* (repeated
in §8: *"A robust construction … are **OPEN** (§6) — a bent-polygon attempt was reverted 2026-06-10."*)
ACTUAL: the same document's §0 status line and §6.1 say **LANDED 2026-06-10**, and the code agrees:
`arcSectorPoly` is defined (`tileGround.js:585`) and called in the FILL (`:1579`,
`arcSectorPoly(best.C, best.r, best.tA, best.tB, sectorDepth, c.trim)`) off the frozen `fillets`
(present on **93 of 101** tiles in `shape.json`).
IMPACT: the doc simultaneously claims the corner construction landed and that it is open and was
reverted. A reader who reaches §7/§8 first would rebuild a shipped feature.

### SECTION.md §6.3 (the South-18th mouth table) — **CONFIRMED**
Re-ran `scratch/coupler-slit-anatomy.mjs` on trunk: `south-18th-street-3`, tile#10, mouth vertex
`(386.30, 149.10)` visited twice; pass 1 `kennett-place/right → south-18th-street-3/right` = corner,
pass 2 `south-18th-street-3/left → south-18th-street-3/left` = **no corner**. "CORNERS BUILT AT THE
MOUTH: 1 of 2." The table reproduces exactly, coordinate for coordinate.

### SECTION.md §6.3 ("ALL 50 tips are zero-width slits") — **CONFIRMED**
`scratch/coupler-slit-universal.mjs`: *"FACE ring is a zero-width slit at the tip: 50 / 0."*
Mouth-disc coverage: 40 with, 10 without (the doc says 9; the probe's own name list prints 9 chains for
10 tips — `waverly-place-1` contributes two).

### SECTION.md §6.3 (the generalization) — **FALSE**
CLAIM: *"⇒ **A dead-end spur gets a corner on ONE side of its mouth and NONE on the other.**"* — stated
as the class rule, and it is what "the test for any proposed fix" is built on.
ACTUAL: `coupler-slit-anatomy.mjs` Check 5, map-wide: **spurs with a corner at EVERY mouth pass: 41/50;
spurs missing at least one mouth corner: 9/50; spurs with a leg running THROUGH the mouth: 9/50.**
IMPACT: the missing-mouth-corner defect is real but affects **9 of 50**, not all 50. The doc's own
adjacent correction ("98 of 107 leg slots ARE clickable — the defect is BOUNDING, not EXISTENCE")
over-corrected in the other direction: bounding also holds on 41 of 50. Sizing a prebake re-founding
off "all 50 are unbounded" over-states the prize by ~5×.

### SECTION.md §6.3 (fe coverage) — **CONFIRMED**
Re-ran `scratch/coupler-fe-coverage.mjs`: **98 / 107** dead-end leg slots have a clickable frontage
edge, 9 do not, all 9 with an fe on the opposite side. Matches the doc's correction verbatim,
including the 9 street names.

### SECTION.md §6.3 (footnote, directed keys) — **CONFIRMED**
`freezeCurbEdgeFacts` (`tileGround.js:205-212`): forward key authoritative, reverse written **only**
if absent — *"the dead-end slit is traversed twice, once per leg, and an unconditional reverse write
collapsed both legs to one width."* The fix is in place and the comment states the ordering is
load-bearing.

### SECTION.md §7 (capacity guard / G12) — **CONFIRMED**, precisely
CLAIM: *"the `cap` clamp only fires on **full collapse**, and the `thinTile` signal that flags the
partial case is **computed but orphaned** (wired only to `bandJoin`, never to the depth clamp)."*
ACTUAL: `tileGround.js:3471` computes `thinTile`; `:3472` uses it for `bandJoin` **only**; the `cap`
bisect at `:3484` never reads it. Exactly as written — the sharpest as-built claim in the cluster.

### SECTION.md §7 (T4 landed / T3 owed) — **CONFIRMED**
Every symbol the doc says was deleted appears in the tree **only inside comments**:
`silhouetteStraightEmitter`, `emitBlockRingBands`, `buildFrontageBandsV2`, `buildChainBandsLive`,
`blockFill`, `ribbonUnion`, `applyRoundCornersToRing`, `buildV2BakeShape`. `buildBlockGeometryV2` is
still called, once, for `frontageEdges` (`BlockGeometryV2Debug.jsx:414`). `scratch/t4-fe-parity.mjs`
exists as claimed. (But see the RIBBONS §5 finding — "the file dies" does not follow.)

### SECTION.md §3.1 (the default fill) — **CONFIRMED** on mechanism, **UNVERIFIABLE (b)** on the counts
CONFIRMED: `TREELAWN_YN_THRESHOLD = 0.6`, `STD_TREELAWN = 1.5`, `ADA_SIDEWALK = 1.5`
(`tileGround.js:923-925`); `resolvePedDepths` defaults **both** strips to the same standard and
returns `hasTL` as a material-only signal (`:1002`) — the "two strips always, EQUAL width, swap not
collapse" doctrine is real in code, comment and all.
UNVERIFIABLE (b) / stale: the cited distribution *"n=951: 391 ≈ 0, 508 ≥ 0.75, ~50 in the valley"* does
not reproduce — it was measured on a `survey.json` denominator I could not reconstruct. Over the
shipped `ribbons.json` (418 street-sides): **269 N · 127 Y · 22 valley**. The doc's *"~95 % decided
automatically"* survives (22/418 = 5 % valley), but treelawn-Y went from the stated **majority (53 %)**
to a **minority (30 %)**. Three sources disagree on the ambiguous count: doc "~50", code comment
(`tileGround.js:926`) "~92 ambiguous run-sides", measured 22.
IMPACT: the §7 "DEFAULT-FILL FRONT" work is sized off these numbers.

### SECTION.md §5 / §5.1 (panel + revert) — **CONFIRMED**
`revertSectionToDefault` (`stores/useCartographStore.js:933`) + `revertFeSectionToDefault` (`:958`,
field-scoped via `_SECTION_FE_FIELDS`), the confirm-gated footer button (`MeasurePanel.jsx:226`), the
⌃/right-click per-edge revert (`MeasureOverlay.jsx:811`), and `nearestFeForSide`
(`MeasureOverlay.jsx:288`) all exist as described.

---

## RIBBONS.md

### RIBBONS.md §1 (the spur-outline answer, "ANSWERED IN THE NARROW") — **FALSE**
CLAIM: *"**Both halves built (still flag-off)**… assert the spur as a closed two-sided outline before
the walk runs (`spurOutline.js`, `PREBAKE §4.0a`)… block faces stay at 101… junction band comes out
net better than baseline (101 → 110 clean)."*
ACTUAL: **reverted out of trunk.** `git log`: `152e7734` built it, `7b5b87a3` *reverted* it. There is
no `spurOutline.js` anywhere in the tree and no `SPUR_OUTLINE` in any source file (only in `README.md`,
`ROADMAP.md`, `PREBAKE.md`, and the archive). `PREBAKE.md §4.0a` — the section RIBBONS points at —
now reads *"asserting the spur BEFORE polygonization: **TRIED, REVERTED (2026-07-31)** … `SPUR_OUTLINE`
is not in the code. Every probe was green and the eye still said no."*
IMPACT: highest-consequence status rot in the cluster. RIBBONS §1 is the doc a geometry agent reads
first; it says the dead-end substrate question is answered and the code is sitting behind a flag.
A reader would go looking for the flag, or build on an answer the operator's eye rejected.

### RIBBONS.md §2 / §8 ("the curb SHAPE — `iA`") — **FALSE as stated (unqualified)**
CLAIM: *"The curb is the per-edge **parallel offset** of the centerline: `iA = chain ⊕ pavementHW` per
side (`offsetRingVariable`; D6a — the curb is an offset, not an asphalt-union carve)."* (§8 glossary
repeats it unconditionally.)
ACTUAL: `tileGround.js:3326` — `if (opts.iaOffset !== false && !isMedianTile && ringArea > 1500)`, and
even then the result is accepted only if it passes an area post-check, **else `blockRings =
legacyBlock()`** = `differenceRings([tile.ring], aFill)` — the asphalt-union carve. Measured on
`public/baked/lafayette-square/shape.json`: **41 of 101 LS tiles** (30 `isMedian` + 30 with
ring area ≤ 1500 m², overlapping) are ineligible for the offset and take the legacy carve;
60 are eligible. Staging: 46 of 116.
IMPACT: two things. (1) Roughly **40 % of the map's curb** is produced by the mechanism the doctrine
says was replaced — so "the curb is a concentric offset" is true of the majority, not of the map, and a
defect on a median or small tile will not respond to offset-side reasoning. (2) The code comment
*"Falling back to legacy is never a regression"* is a **silent substitution**: a degenerate offset
quietly becomes a carve with no signal. That is the `CLAUDE.md` Layer 0 NO-FALLBACKS shape, in the
SHAPE producer, on the kit's most-cited invariant. Flagging it, not fixing it.

### RIBBONS.md §2 (`ribbons.json` data shape) — **FALSE by omission**
CLAIM: the documented input schema is `{ streets, intersections, faces }`.
ACTUAL (`src/data/ribbons.json`): `streets (209) · alleys · paths · intersections (**length 0**) ·
faces (173) · medians (52) · corridors (0) · junctionMap · junctions (277) · nameTransitions (21) ·
**tiles (101)**`.
IMPACT: two live traps. The documented `intersections: [{point, streets}]` "emergent IX list" is
**empty** in the shipped artifact — a consumer written from this schema silently gets nothing
(`tileGround.js:2122` already notes it sources corners elsewhere, *"not off `ribbons.intersections`"*).
And the omitted key is `tiles` — the frozen polygon substrate whose *existence* SURVEY §5.1 denies.
The schema section is where that denial would have been caught.

### RIBBONS.md §2 (`shape.json` size) — **FALSE**
CLAIM: *"`64K` on LS."*
ACTUAL: `public/baked/lafayette-square/shape.json` = **1,055,013 bytes (~1.03 MB)**; staging 1,094,212.
16× the stated figure.
IMPACT: small, but it is a payload budget number sitting in the canonical reference, and the doc is
otherwise the place a slab-size question gets answered.

### RIBBONS.md §2 (`shape.json` format) — **CONFIRMED**
`{ tiles, highway }`: **101 tiles**, **11 highway rings**. Per-tile keys
`ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, roundTipKeys, runs, bandJoin, cap, fillets,
isMedian` — matches SURVEY §3 item 6 and SECTION §4, except both omit `fillets`, which §6.1's corner
construction depends on. Run keys carry more than documented (`roadId, throughId, thruEnds, anchor,
measure` beyond the stated `skelId/side/segOrd/poly/baseMeasure`).

### RIBBONS.md §3.1 (`STREET_SMOOTH`, one knob) — **CONFIRMED**
`smoothCenterline.js:150` `export const STREET_SMOOTH = 0`; the only importers are
`SurveyorOverlay.jsx:6`, `MeasureOverlay.jsx:8`, `bake-ground.js:38` — one constant, live and bake
reading the same one, as claimed.

### RIBBONS.md §3.5 (the median is a walked face; identity) — **CONFIRMED**
`tileGround.js:3227-3242`: `medPairs` keyed by `phase.pairKey`, tile is a median iff bounded by both
carriageways of one pair — **no left/right side test**, exactly as the doc's "tried and reverted" note
says. Loop-body medians are still the separate Clipper-inset `med` ring
(`isMedianTile = isDividedMedian || (isLoopInterior && medArea > 0.5)`, and only `isDividedMedian` sets
the frozen `isMedian` flag) — the doc's "not yet unified" is accurate. 30 of 101 LS tiles carry
`isMedian`.

### RIBBONS.md §5 ("the file dies" at T3) — **FALSE**
CLAIM: *"T3 is still owed, and it is now the **ONLY** reason `buildBlockGeometryV2` exists… T3 unifies
them and **the file dies**."*
ACTUAL: `buildBlockGeometryV2.js` is also a live utility module for the tile path.
`tileGround.js:35` imports `pickLuFromHash, hashKey, blockKeyFromRing, resolveChainSegmentation` from
it; `buildPathRibbons.js:29` imports `differenceRings, intersectRings`; `SurveyorOverlay.jsx:11` and
`MeasureOverlay.jsx:9` import `resolveChainSegmentation`.
IMPACT: T3 is scoped as "migrate the fe key and delete the file." Deleting it breaks the live tile
construction, land-use hashing and the path ribbons. The task needs an extraction step nobody has
budgeted.

### RIBBONS.md §6.1 (G12, band-fold-fix stranded) — **CONFIRMED**
`8e1e414` is a real commit and `git merge-base --is-ancestor 8e1e414 HEAD` → **not an ancestor**. Still
stranded, as written.

### RIBBONS.md §6.2 (phantom park) — **CONFIRMED** on mechanism, **UNVERIFIABLE (b)** on the attribution
CONFIRMED: `classify.js:60-62` — `leisure=park || leisure=garden || landuse=grass ||
landuse=recreation_ground` → `type='park'`, first match wins. So the doc's central correction (the fix
must drop **grass**, not just garden) rests on real code. Also confirmed: **29** faces ship
`use='park'` in `src/data/ribbons.json`, and the real Lafayette Park face is **122,502 m²** — both
exact.
UNVERIFIABLE (b): the 512/895 overlay split, the 31/32 first-match attribution, the 92,869 m² phantom
area and the face#12 figure all require replaying the classifier's overlay loop against
`raw/osm.json`, which I did not run. Note for whoever does: the 28 non-real `use='park'` faces sum to
**123,304 m²**, not 92,869 — the doc's category split (25 phantom + 1 real + 1 no-hit + 2 other)
excludes some of that, so this is not a contradiction, but the headline number is not directly
reproducible from the artifact alone.

### RIBBONS.md §6.2a (`layers.park[0]` is authored) — **CONFIRMED**, one discrepancy
`cartograph/data/lafayette-square/clean/park-polygon.json`: `tiltDegrees: -9.2`,
`halfWidthMeters: 175`, 4 corners summing to a centroid of exactly `(0, 0)`.
`derive.js:1103-1113` prefers it over the OSM trace and warns *"corner plugs will degrade"* on
fallback. `derive.js:1075` `PARK_CENTER = {x: -15, z: -15}` → **21.2 m** from the authored centre.
Every load-bearing element of this section checks out.
DISCREPANCY: the doc says the fallback is a **65-vertex** OSM trace (twice, including in the bearing
table); `derive.js`'s own comment and warning both say **41-vertex**. One of them is wrong; I could not
settle which without the raw OSM, so treat the vertex count as unconfirmed. It does not change the
conclusion (don't delete the authored polygon).

### RIBBONS.md §6.4 / SECTION §7 (dead-end mouth wrap) — **CONFIRMED** (count drifted)
The wrap ships in the frozen artifact: **41 mouths across 20 tiles** (doc says 39/20), **101 tiles**
as claimed. Staging: 38 mouths.

---

## Cross-cutting

**1. All three docs' code pointers are drifted far enough to mislead.** Not reported per-claim (the
brief excludes line numbers), but flagged once because two of these docs *instruct* the reader to
verify against `tileGround.js` by line: SURVEY §3 cites `buildTileGround()` at `:591` and
`extractFaces` at `:303` (actual `:1967` / `:656`); RIBBONS §3 says "~2650 LOC total" (actual **3797**)
and cites `extractFaces` at `:508`. Every numbered pointer in SURVEY §3 is off by ~1000–1400 lines.
The practical effect is that a reader who follows a pointer lands in unrelated code and either
re-derives or gives up.

**2. The three docs disagree about the same code in two places, and in both the code sides with the
newer doc.** The `sectionPass` signature (SURVEY says 3 args / no `blockCustoms`; SECTION says 4 args —
code: 4). The curb producer (SURVEY §6 says asphalt-union carve; RIBBONS §2 says D6a offset — code:
offset by default, carve on 41/101 tiles). SURVEY is the doc to distrust: its status line says
"Grounded in code, verified against the live path **2026-06-05**", and it has not absorbed D6a, T4,
the frozen tile substrate, or the `blockCustoms` wall refinement.

**3. SECTION.md contradicts itself on whether the corner construction landed** (§0/§6.1 LANDED vs
§7/§8 OPEN-and-reverted). Code: landed.
