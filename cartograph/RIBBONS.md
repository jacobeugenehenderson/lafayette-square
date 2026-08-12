# Ribbons & Corners — canonical reference (the TILE model)

**Status: v1.0 (2026-06-15) — the tile-model rewrite.** This is the central reference for how the visible street geometry — asphalt, curb, treelawn, sidewalk, corners — is constructed. **The live model is the TILE construction in `src/lib/tileGround.js`.** (v1.0: promoted the tile model from banner-warnings + the feature ledger into the body; the retired **figure-ground / `buildBlockGeometryV2` emitter** reference was migrated to [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md); the 13-month corner saga stays in [`_archive/RIBBONS-history-2026-06-12.md`](_archive/RIBBONS-history-2026-06-12.md).)

> Part of the cartograph quintet alongside `FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`. **Read this before any geometry / corner / curb / intersection / ribbon work.** Most regressions in this repo trace to someone re-deriving a points-and-chains framing for a problem this system already answers. The doctrine in §1 is load-bearing.
>
> **Where the rest lives:** the **frame** (centerlines, divided pairs, the across-intersection organ) is `SKELETON.md`; the **ped FILL** (treelawn/sidewalk depths, the bent corner fill, ADA pads, caps, the authoring panel) is `SECTION.md` (the FILL SSoT); the **execution order** is `PIPELINE.md`. This doc owns the **geometry doctrine + the tile construction** that connects them.

---

## §0. Scope + how to use this doc

**This doc covers:** the derivation chain (centerline → polygon → ribbon), the tile (the block face between streets), the curb as a concentric offset, the corner as a bent band, the divided-road model, and the live `tileGround.js` construction at a function level.

**This doc does NOT cover:** centerline derivation (`SKELETON.md` + `skeleton.js`); the ped FILL detail + Section authoring panel (`SECTION.md`); Stage look authoring (`STAGE.md`); Preview QA (`PREVIEW.md`); Arborist/Meteorologist.

**How to use it:**
- Touching ribbons/corners/curb → read §1 (the regime + invariants) first. It is the load-bearing part.
- Implementing → read §3 for the live function, then verify against `src/lib/tileGround.js` (the doc points at it; the code is the truth).
- **Don't re-derive from code or memory.** If §3 conflicts with the code, the code moved — flag it and update this doc.

---

## §1. The regime, in plain words

### ⭐ The model in one sentence

**The map is made of TILES — the block faces of the centerline graph. The centerlines are the grout; each tile is painted INWARD from its own edges (asphalt → curb → treelawn → sidewalk → land-use); the corner is the band BENT around the curb arc, never a constructed primitive.** Everything visible is a pure derivation of the centerline.

> ⚠️ **"Faces of the centerline graph" is the assumption now under challenge (2026-07-25).** A graph face
> cannot close around a **degree-1** chain: `extractFaces` walks a dead-end spur out and back over the
> same vertices, so **ALL 50 LS dead-end tips are zero-width slits** — a chain traversal, not a shape
> (`PREBAKE §4.0`, `PIPELINE §Wall`). Proposed replacement (Jacob): the SSoT radius as the **outer
> polygon**, everything inside **punched out** — blocks = boundary − stroked roads — which closes a spur
> into a real notch and makes the concentric law literal (the block boundary IS the curb). Not ratified;
> it re-founds the tile substrate and this sentence changes with it. Spike + risks:
> **`_handoffs/HANDOFF-deadend-face-resolution.md`**.
>
> ## ⭐⭐⭐ RULED 2026-08-12 (Jacob) — THE SUBSTRATE IS THE PUNCH-OUT, WALKED WITH IDENTITY CARRIED. The 2026-08-06 banner is CLOSED.
>
> **The ruling, in one sentence: blocks = boundary − stroked roads — but computed as a DIRECTED HALF-EDGE
> WALK over identity-carrying side-chains, never as an anonymous boolean.**
>
> ⭐ **Each authored chain derives into TWO directed side-chains**, each owning exactly one side and
> emitting only to its right; they are joined at every node by a **coupler** — a permutation saying which
> incoming side hands off to which outgoing side. **The datum is the left EDGE of the right lane**, which
> for an undivided street IS the centerline (the two side-chains are *coincident*, so they cannot cross);
> a divided corridor is the same construction with the pair separated by the median. ⇒ **"divided" stops
> being a special case — it is separation 0 vs N.**
> ⛔ **AUTHORING DOES NOT CHANGE.** The operator still authors ONE chain per street, street-keyed
> (`A15`). The split is a **derived step**, downstream of authoring, upstream of the walk ⇒ **zero
> `blockCustoms` migration.**
>
> ### Why this is not a third option — it is the ANSWER to punch-out's blocking risk
> `_handoffs/HANDOFF-deadend-face-resolution.md §4.1` risk 1 is what kept punch-out unshipped: *"a boolean
> gives you RINGS, not which chain and which side bounds this edge… ⛔ this is exactly where identity can
> quietly become re-derived-from-geometry again."* **Walking side-chains eliminates that risk rather than
> mitigating it:** every ring edge is owned by one `(skelId, side)` **by construction**, so identity is
> never lost and never has to be recovered. That is `§C6`'s own 2026-07-30 ruling — *"build the compound
> path from STAMPED strokes… identity must be carried THROUGH the boolean, never recovered from ring
> geometry afterward"* — finally given a mechanism. ⇒ **The `PIPELINE §Tile` "figure-ground is dead"
> contradiction dissolves:** the objection to figure-ground was that streets-subtracted loses identity.
> This does not.
>
> ### It passes §2.1's one-line test BY CONSTRUCTION
> *Does it create the second mouth corner?* **Yes.** Today both mouth passes are the **same coordinate**,
> so the second reads `south-18th → south-18th` and `cornerAt(a,b)` correctly declines. **Give the spur
> width and the two mouth vertices are different points**, each a genuine `kennett × south-18th` meeting —
> two real corners, one per side, every leg bounded corner-to-corner.
>
> ### ⭐⭐ THE SPLIT THAT MAKES IT BUILDABLE — combinatorial at prebake, geometric after authoring
> Punching with the *stroked* road makes tile topology **width-dependent** (risk 2). Prebake is blind to
> `design.json`/`blockCustoms` (`ORIENTATION §3`, `POLYGON-FIRST §3`), so freezing a width-dependent
> topology there would freeze **bare-default widths** — Layer 0 q3, baked into an artifact. **Therefore:**
> - **The COUPLER RELATION is width-INDEPENDENT** — which side hands off to which is a graph property.
>   Prebake, frozen once. ⭐ **It already exists: `junctionMap.nodes[].cornersAdjacent`** — complete at
>   every T and cross, **read by nothing** (`POLYGON-FIRST §2.1`).
> - **The GEOMETRY is width-DEPENDENT** — where the side-chain lands. Resolves AFTER width authoring.
>
> ⭐ This is `PREBAKE §5`'s own unexecuted sentence: *"corner identity (topology) = prebake, frozen once;
> curb position (width/radius) = Survey, authored on top."* ⚠️ **Consequence to accept deliberately: the
> SHAPE freeze must sit firmly after width authoring** — a width edit re-topologises.
>
> ### The ONE genuinely new build
> `cornersAdjacent` is complete at every ordinary intersection and **absent at all 29 dead ends.** The
> missing piece is **a coupler record at a degree-1 tip** — the end cap as a coupler that wraps the two
> side-chains around the spike. That is the build, and it aims exactly at the rings that retrace.
>
> ### ⛔⛔ THE RETIREMENT LIST — write it now, execute it as ONE window (Jacob, 2026-08-12: *"we have laid down so much defunct wiring, once we solve this we'll have to do a real cleanup"*)
> **Each of these exists ONLY to describe the absence this ruling closes. ⛔ Do not extend any of them.**
> `walkOrd` / the walk-ordinal coupler · the inverted `side` law (34/34) · the mouth disc + the mouth-wrap
> snap · the synthetic negative-`segOrd` cap fe · `innerSign` (face adjacency replaces the vote —
> `OSM2STREETS §2`) · `innerEdgeAssign`'s ped-zeroing hack (a one-sided chain faked with a two-sided one)
> · `[THRU-T]` (`tileGround.js:3589-3613`, **already dead — `opts.thruTNode` is never passed**) ·
> `detectTileCaps` as an identity source (it is a slit detector wearing a cap detector's name).
> **· `clean/park-polygon.json` — a PRE-TILE-MODEL SURVIVAL** *(measured 2026-08-12, from Jacob's
> question "why do we need that polygon at all?")*. ⭐ **`tile #8` IS the park** — bounded by
> `mississippi-avenue · lafayette-avenue-3 · missouri-avenue-2 · park-avenue-1`, centroid **4 m** from
> the authored polygon's. The park has been an ordinary block face since the tile model landed.
> What the polygon still drives, and what replaces it:
> | use | site | replaced by |
> |---|---|---|
> | the park face | `derive.js:2308` | **tile #8** |
> | a **bespoke sidewalk** | `derive.js:2313-2322` | the ordinary inward band |
> | fence corners | `LafayettePark.jsx:49-58` | inset from `corners` directly |
> | label position + text rotation | `LafayettePark.jsx:65-67` | the tile's own centroid/axis |
> | bridge + steps clip region | `LafayettePark.jsx:234`,`:290` | the tile ring |
> - ⛔⛔ **The bespoke sidewalk offsets with `jtRound` — the method INVARIANT 2 forbids, applied to a
>   SQUARE, which is the exact case that invariant says `jtRound` CORRUPTS.** It is a second, parallel
>   sidewalk mechanism that is not the tile band.
> - ⛔ **`parkAxisToCompass` (`:42-47`) IS AN APPLIED ROTATION** — a matrix built from `tiltDegrees`,
>   used for the fence and the label. ⭐ **Gratuitous:** `parkPolygon.corners` are already real-world
>   coordinates; the fence is a 2 m inset, so it could inset from `corners` and need no rotation.
>   Instead it **discards the corners, rebuilds a square from `halfWidthMeters`, and rotates it back.**
>   *(This is the survival Jacob suspected when he said "early on we applied a rotation to different
>   things before we settled on a real-world orientation." Outputs still land at true position, so
>   `ORIENTATION`'s no-trick-rotations OUTCOME holds — the MECHANISM is the leftover.)*
> - ⛔ **Three files import it by hardcoded LS path** — `LafayettePark.jsx:17`,
>   `loadInstanceData.js:58`, `BlockGeometryV2Debug.jsx:30` — a live LS-bleed vector of exactly the
>   kind `EXTENT-DESIGN §2.1` names as the root of that class.
> - ⚠️ **What genuinely still needs a park identity is the CONTENT** (fence, water, paths, stairs) —
>   and that hangs off **which tile is the park**, which `blockLandUse` already keys. ⭐ The only
>   remaining geometric argument is the corner plugs, and that reduces to *"simplify a park face
>   automatically"* — the junction-protected simplifier the kit already owns for streets
>   (`SKELETON`: *a city block should be ~4 corners, not 30 wiggles*). Town #2 has **no**
>   `park-polygon.json` and takes the OSM 41-vertex fallback that `derive.js:1114` warns degrades.
>
> ⭐ **Excise knobs, wiring AND docs together, in one window** (`[[feedback_remove_functionality_excise_knobs_wiring_docs]]`);
> the standing removal-queue discipline is `SHOW-BIBLE §4`. ⛔ A retirement list written later is a
> retirement list that never runs — this one was written at the moment of the decision on purpose.
>
> ### ⛔ THE FOUR GATES — and ⭐⭐ ONLY ONE OF THEM SHAPES THE BUILD. THE OTHER THREE JUDGE IT.
> *(Corrected 2026-08-12, hours after it was written: this block first said "none of these is optional,
> and the first move is NOT a build." **That sentence converts a calibration into a stop sign** and it
> stalls the work for nothing. ⛔ Do not restore it. `1` informs the build's shape and can run
> ALONGSIDE it; `2–4` govern how the result is JUDGED and cannot block starting. **The slit is real in
> the frozen artifact — closing it is correct whatever these return.**)*
> 1. ✅ **RECONCILED 2026-08-12 (agent Quire) — `node scratch/reconcile-punchout-vs-faces.mjs`. ⛔ "~115"
>    was itself wrong** (the 4th number in that lineage): under the spike's own settings the compound path
>    closes to **121 = 1 outer + 5 holes + 108 islands + 7 slivers**, so the block count is **108**.
>    **And the comparison was not apples-to-apples in two ways that pull opposite directions** — the spike
>    punches with all 209 streets **including the 57 `gradeSeparated`** (which `tileGround.js:2618`
>    excludes from the face graph, Δ **29 islands**, shattering `frozen[12]` into 12 pieces), and it uses
>    a stencil scaled **×1.1771** where `derive.js` freezes against the **raw boundary** (Δ **14**).
>    - **Apples-to-apples (grade-sep excluded, raw boundary, authoring loaded): 93 islands ↔ 101 tiles,
>      a CLEAN INJECTION — 0 merges, 0 splits, 0 straddlers.** ⭐ The punch-out reproduces the face
>      topology; it does not re-topologise the map.
>    - **The 8 tiles with no island are ONE class, not eight:** narrow gores whose width is less than the
>      sum of the two facing `pavementHW` — **the two carriageways' asphalt overlaps and annihilates the
>      land between them** (8/8; the 8 narrowest tiles, 2.39–7.48 m).
>    - ⛔⛔ **THIS KILLS AND INVERTS THE MEDIAN HYPOTHESIS** (`HANDOFF §4.1`: *"divided medians become
>      leftover islands, probably MORE correct"*). **Measured: the punch-out ERASES 6 of 30 `isMedian`
>      tiles and shrinks the survivors to 0.06–0.90 of frozen area (median 0.41)**, where ordinary blocks
>      shrink to 0.83 — and that 0.83 is *correct* (curb-to-curb vs centreline-to-centreline; the
>      333,193 m² delta is the road footprint).
>
> ### ⭐⭐⭐ AND THIS IS WHY THE RULING SAYS **WALKED**, NOT BOOLEAN — now MEASURED, not argued
> > **A union cannot represent overlap as anything but ABSENCE.** Two carriageways whose strokes overlap
> > produce one merged blob and the land between them **ceases to exist — no ring, no warning, no record
> > that anything was there.**
>
> ⭐ **A directed side-chain walk cannot reproduce that**: the median's two bounding edges are one directed
> side-chain each, and the face between them is emitted from two half-edges **whether or not they cross**.
> If authored widths genuinely push them past each other the walk yields a self-intersecting / negative-area
> face — **a LOUD failure at a named `(skelId, side)` pair.** The boolean yields silence.
> ⛔⛔ **That is `CLAUDE.md` Layer 0 q2 committed by the substrate itself**, and it lands on **32 tiles**
> that are most likely the operator's authored `pavementHW` — i.e. **the boolean's response to authoring it
> dislikes is to DELETE the polygon.** ⇒ *"divided is separation 0 vs N"* is exactly the property that
> makes the class vanish: **at the lane-edge datum there is no double-stroke to overlap.**
> *(Also boolean-only, and a walk produces neither: 5 co-linear slivers ≤1 m², and 4 enclosed holes of
> 4.5–35 m² sitting 1.4–4.0 m from degree-1 tips — the same rings the tip-coupler build aims at. Hole
> mechanism NOT established.)*
>
> ### ✅ TIGHT vs LOOSE — SETTLED. It is **LOOSE**, and TIGHT is not a variant.
> V2 **structurally cannot** produce TIGHT (its only ring set is `entry.asphaltRings`; there is no
> ribbon-outer union in the file). And at real LS ped depths (~6 m/side) TIGHT **destroys a third of the
> block set and starts splitting blocks LOOSE keeps whole**. ⭐ TIGHT is also the **wrong cut under this
> ruling**: the datum is the left edge of the right lane — **the asphalt edge, not the sidewalk edge.**
> *(Closes `HANDOFF §C2`'s "confirm which variant" question.)*
>
> ### ⚠️ THE OUTER POLYGON IS NOW A DECISION JACOB OWES — it is structural, not cosmetic
> **(a) raw `neighborhood_boundary.json`** (what `derive.js:4632-4648` already freezes against;
> 2,499,401 m²) → **93 islands, clean**, every rim block closing against the boundary with `__boundary__`
> identity available by construction. **(b) `streetFade.outer + 50`** (the spike, `CartographApp.jsx:669`,
> `bake-ground.js:992`; 3,463,258 m²) → **79 islands, badly**; 31 frozen perimeter tiles have no
> counterpart, merging into a road-free annulus. ⛔ **`streetFade` is a RENDER parameter** (a shader fade,
> `BakedGround.jsx:117`) — adopting (b) lets **a look knob decide block topology at the rim.**
> `ORIENTATION`'s *"the inclusion polygon DECIDES, the disc RENDERS"* points at (a). ⚠️ **(a)'s cost, to
> accept deliberately: with the raw boundary the roads cut the rim, so there is NO single outer contour —
> the boundary stops being an "outer ring" and becomes just another set of ring edges.** ⭐ A **third
> option nobody has costed**: the inclusion polygon from `design.json`. **Not decided.**
>
> ### ⭐⭐⭐ THE RIM IS A SECOND UNOWNED CLASS, AND IT IS 4× THE DEAD-END ONE (2026-08-12)
> **DECIDED (Jacob): Slice 2 takes the outer ring as an ARGUMENT — ⛔ never a reach into
> `neighborhood_boundary.json`.** Today `derive.js:4632-4648` closes the faces against that file's
> `boundary[256]`, and **`EXTENT-DESIGN §5.1` says that artifact welds THREE JOBS** — the render disc
> (`center`,`radius`,`boundary[256]`,`fade`,`streetFade`), the membership polygon, and the exclusions —
> with `makeCircleBoundary` **regenerating the disc fields from hardcoded constants on every
> commit/rescope** (the same mechanism that clobbers LS's authored `center:[-15,-15]`).
> ⛔ **So the substrate today closes against the DISC — the thing `ORIENTATION` says must only RENDER,
> never DECIDE.** The Extent-authored shape is `polygon`, and **LS HAS NONE** (HPDM 4 · centrum 815 ·
> LS/ksi/altadena absent). ⇒ Taking it as an argument keeps the swap to the authored polygon a one-line
> change on any town the day `EXTENT-DESIGN §5.1`'s schema split lands (**worklist item 1, "no
> dependency, unblocks the rest"**) — without pulling LS's plumbing forward against `ROADMAP`'s ordering.
>
> ⭐⭐ **AND THE STRUCTURAL FINDING (Jacob: *"we didn't then know we were going to HAVE that boundary edge
> to pull from"*).** Extent produced a disc for **rendering + membership**; the 2026-08-08 compound-path
> ruling then promoted the rim to **an edge of the drawing, never an absence** — and `derive.js` had to
> **invent an owner** to make the perimeter faces close. Nobody told Extent it now supplies structural
> geometry. **Measured on LS:**
> ```
> tiles with a __boundary__ edge   31 of 101
> __boundary__ ring edges          290
> side value                       'right' × 290   (a CONSTANT filler, not a real side)
> __boundary__ in ribbons.streets  NO — synthetic id, no chain behind it
> ```
> ⛔⛔ **Under this ruling every ring edge is owned by exactly one `(skelId, side)` directed side-chain.
> THE RIM HAS NO CHAIN.** So the walked substrate has a **second genuinely-new piece**: a rim owner /
> rim coupler, **290 edges — 4× the dead-end class's 67.** ⭐ This is `A15`'s already-logged *"rim (no
> `skelId`, 34/34)"* failure class, re-measured at its true size.
> ⚠️ **Live risk regardless of the ruling: a look-side regeneration of the disc silently moves 31 tiles'
> ring edges**, because a render artifact is load-bearing geometry and nothing says so.
>
> ### ✅✅ RULED 2026-08-12 (Jacob) — THE BOUNDARY IS AN ORDINARY CHAIN AND GETS AN ORDINARY BAND
> > *"The edge boundary polygon is treated as equal to chains, and their intersection is treated exactly
> > the same. If it helps you, we can just **continue the sidewalk/tree lawn × corner config around the
> > boundary edge**, because the last step is the map within the boundary gets **feathered** at the edge,
> > and we feather it far enough to swallow whatever customs might show."*
>
> ⭐⭐ **THIS DELETES THE RIM SPECIAL CASE OUTRIGHT — it is a simplification, not an extra feature.**
> The rim run takes a **normal `baseMeasure`**, paints a **normal treelawn/sidewalk**, and corners with
> its neighbours by the **same** rule as any other pair. Nothing downstream needs to know the edge is
> special, because **the feather is applied last, as a look, and is sized to swallow it.**
> ⇒ **What this retires, by construction:**
> - the `__boundary__` **no-`baseMeasure`** case, and with it **4271.8 m of "derived-zero" exclusions
>   across 20 tiles** — the *entire* derived-zero population on LS (measured, Quill);
> - **12 of the 16** topological-only severances that *"stop against a NO-PED arc"* — there is no
>   NO-PED arc at the rim any more;
> - the filler `side:'right'` on all 290 rim edges, and every consumer branch that tests for a rim.
>
> ⭐ **It also settles `EXTENT-DESIGN §8` Q4** (*"what does a boundary street's SIDE mean?"*) for the
> geometry layer: the boundary chain's inward side is an ordinary side and carries an ordinary
> cross-section. ⛔ **Do not build a rim-kind, a rim branch, or a rim exception.** If a construction needs
> to ask "is this the rim?", that is the signal it has diverged from this ruling.
> ⚠️ **Verify the feather actually covers it before shipping** — the ruling rests on the fade being wide
> enough to hide the rim band, and that is an *eye* check on the real render, not a probe.
>
> ### Dead-end notches change SHAPE, not COUNT — ⛔ on LS, and do not carry it as a law
> 0 cap-tiles are split into more than one island; a punched spur is a **concavity**, adding vertices not
> rings. It *would* change the count if a spur reached clean across a block, which does not happen on LS.
> ⭐ **That is a property of this map, not of the construction** — the check that generalises is
> islands → dominant frozen tile, flagging any tile dominant for more than one island.
> 2. ✅ **MEASURED 2026-08-12 — the ruling is CORRECT and NOT SUFFICIENT.** `node
>    scratch/overlap-retrace-x-severed.mjs --lists` (banded tiles only):
>    ```
>                  retrace   no retrace   total
>    severed          15          24        39
>    not severed       4          24        28
>    ```
>    ⭐⭐ **24 of 39 severed tiles retrace NOTHING** ⇒ closing the dead-end class touches **at most 15 of
>    39**, and there is a second, larger cause of severance. ⛔ **15 is a CEILING, not a forecast — the
>    table contains its own disproof: 4 tiles retrace and do NOT sever**, so retrace alone does not cause
>    severance. Retracing tiles sever more often (15/19 = 79% vs 24/48 = 50%) — suggestive, nothing more.
>    **Cause not established for any of the 15.**
>    - **"Dead-end tile" and "retracing tile" are the same 21 tiles** — `ribbons.tiles[].caps` is present
>      on exactly 21 tiles (50 cap records), set-identical member-for-member to the retrace set.
>    - **Severance is an OFFSET-producer phenomenon** — 37 of 39; but so is the banded population
>      (59 of 61 offset tiles are banded, 34 of 42 carve tiles have no band). As a share of banded:
>      offset 37/59 = 63%, carve 2/8 = 25%. ⛔ Small carve denominator — do not lean on the contrast.
>    - ⛔ **The two artifacts' rings are BIT-IDENTICAL** (`shape.json` carries the frozen `ribbons` ring
>      through unchanged); the join is 1:1 and total at 101↔101. *(A brief asserted they were differently
>      ordered. False for this scene — but do not assume it holds after a re-pour or on another town.)*
>    - ⛔⛔ **THE 39 MEASURES THE WRONG PROPERTY — verified 2026-08-12 (agent Rung,
>      `node scratch/bandgate-parameterisation.mjs`).** The **parameters are the producer's** (`0.381` IS
>      LS's authored `curbWidth`; `{outer:'LU', inner:'SW'}` IS the real default; substituting the live
>      values yields the **identical severed set**). ⭐ **But the invariant is stated as *"a continuous
>      strip around every block"* — CONNECTIVITY — while the predicate is *"count of positive-area rings
>      in a Clipper union"* — TOPOLOGY.** A zero-width point contact violates the predicate while the paint
>      is continuous. `SEVERED` is documented *"exact, no threshold"*; it is **exact about the wrong
>      quantity for 35 of the 39** (`POLYGON-FIRST §5` **RULE 1b**).
>      ```
>      severed                                    39
>        materially separated (>1 µm)              4   (1.26 / 2.61 / 3.16 / 6.38 m)
>        touching at 0.000                        35
>          point pinch (<1 cm border)             23
>          sharing a real border up to 3.0 m      16   ← two rings from a ≤1 µm contact. CAUSE NOT ESTABLISHED.
>      ```
>      ⭐ **THREE NUMBERS, NOT A CONTRADICTION — they measure different defects:** union rings **39** ·
>      materially separated **4** (Rung) · tiles with an unpainted band arc >0.5 m **14** (Quill,
>      `sever24-taxonomy.mjs`). A tile can touch at 0.000 somewhere *and* have a 222 m unpainted stretch
>      elsewhere. ⛔ **The two agents never reconciled their criteria and said so — do not merge the counts.**
>      ⚠️ **RULING OWED (Jacob's eye, not an agent): what does "continuous" mean?** Look at one point-pinch
>      tile and one material-hole tile. If a pinch reads unbroken, the acceptance predicate is *unpainted
>      arc* (≈14) and this gate gets rewritten; if it reads broken, 39 stands.
>      **"39" and "4" cannot both be the acceptance number.**
>      - ✅ **14 RE-DERIVED AND UNCHANGED (Quill, 2026-08-12)** — per-tile delta **zero**; not inflated,
>        now resolved the producer's way. **Exclusions on LS are degenerate:** authored-zero **0.0 m**
>        (30 `blockCustoms` entries, none resolve to zero ped) · derived-zero **4271.8 m / 20 tiles**, all
>        one cause — *no `baseMeasure` at all*, i.e. **the rim**. ⭐ **LS cannot exercise the authored
>        branch; town #2 is where that half first gets tested.**
>      - ⛔⛔ **A BOZ DIAGNOSIS THAT WOULD HAVE MASKED A REAL HOLE — do not repeat it.** Boz read
>        `truman-parkway-0|right` as `treelawn 0 · sidewalk 0 · terminal 'none'` and briefed excluding it
>        as no-ped-by-design. **`resolvePedDepths` (`tileGround.js:1234`) NEVER READS those fields for
>        depth** — it takes `custom?.treelawn ?? STD_TREELAWN` / `custom?.sidewalk ?? ADA_SIDEWALK`, both
>        **1.5**; `measure.{treelawn,sidewalk,terminal}` feed only `gleanTreelawn`, which picks strip
>        ORDERING (`SECTION §3.1`: the standard depths deliberately replaced the averaged measures).
>        ⇒ that side resolves to a **full 3.00 m expected band and its 222 m IS a hole.** ⭐ **Asserted
>        from two measurements without reading the resolution path** — the agent checked instead of
>        building on it. [[feedback_measure_before_writing_ask_before_building]]
>      - ⚠️ **RULING OWED, SEPARATE: `terminal:'none'` is consulted by NOTHING.** A side marked no-ped is
>        painted a full band anyway. If it *should* zero the strips that is a change to the derivation and
>        it moves numbers on every town. [[project_a_sentinel_is_not_a_value]]
>      - ⭐⭐ **THE 25 ARE NOT PINCHES — measured at 0.05 m spacing within 3 m of every contact, the band
>        runs at 2.95–3.00 m on a 3.00 m band right up to it. ZERO pinch notches in 39 tiles.** They are
>        **full-depth abutments the union fails to fuse.** ⛔ **Cause not established** — it is not a width
>        collapse, and beyond that there are measurements, not a mechanism.
>      - ⛔⛔ **AND THE GATE UNDER-REPORTS AS WELL AS OVER-REPORTS — "39" IS WRONG IN BOTH DIRECTIONS.**
>        **10 tiles the band gate PASSES as one clean ring carry material holes**, up to **47.5 m**
>        (`655d3f2d4e`, `grattan-street|right|1`). So the severed set is neither a superset nor a subset of
>        the defect: 25 false positives *and* 10 false negatives. ⭐ **A tile can have one continuous union
>        ring and still be missing metres of band** — ring-count and unpainted-arc are orthogonal, which is
>        the whole reason the predicate has to change. *(Quill, unasked — `scratch/sever24-mechanism.mjs`.)*
>      - ⚠️ **`shape.json` MOVED MID-SESSION** (`59886df6…` → `05666e18…`, uncommitted). Re-derived on the
>        new bytes: severed **39**, material holes **14** — both unchanged. ⛔ But `sever24-taxonomy.mjs`
>        as committed was measured on the OLDER bytes. **State the artifact hash with any count from here.**
>      - ▶ **THE TWO OPEN MECHANISMS, both Section-layer, both unexplained:** *(i)* why **expected,
>        full-depth-capable arc goes unpainted** — 483 m (`truman-parkway-0|right` + `grattan-street|left`)
>        · 28.5 m (`chouteau-avenue-0|right`) · 24.2 m (`rutger-street-1|right`); *(ii)* why a **full-depth
>        abutment yields two union rings.** ⭐ **The count is no longer the story.**
>    - ⛔ **KIT DEFECT IN THE INSTRUMENT, separate and small: `curbWidth` is a LITERAL `0.381`.** A scene
>      whose operator has not authored one gets `CURB_WIDTH = 0.1524` ⇒ **33 severed, 20 tiles changing
>      class.** On town #2 it measures a curb the producer never poured — Check A's blindness, recurring.
>    - ⚠️ **The live render and the bake disagree on `blockCustoms`** — the Designer expands a split fe's
>      custom across its segOrds (`feCustomKey.js:107-138`), the bake does not. Bounded at **zero effect on
>      LS's 39**; unmeasured elsewhere. Own ticket.
>    - ✅ Not the problem, tested and excluded: per-tile vs global union (all 39 stay in different global
>      components, and the stencil clip is an intersect — it can only cut, never join).
> 3. **Do not regress the June render.** `tileGround.js:620-627` records dead-end pendants as deliberately
>    unpruned because the render is *"verified clean map-wide."* June measured the RENDER; July measured
>    AUTHORING/IDENTITY. **Both are true.** State which layer you are claiming.
> 4. **The eye-gate must record its scene** — the one prior attempt was judged on `lafayette-square` while
>    the work sat on `lafayette-square-staging` (52 vs 177 authored streets), and that contaminated verdict
>    still reads as "tried and failed."
>
> *(Superseded by this ruling: the "OPEN AND UNRULED — do not build on either side" banner of 2026-08-06,
> and the three-way framing of face-walk vs punch-out vs spur-assert. The evidence that closed it: the slit
> is real in the frozen artifact — rings that walk an edge A→B then B→A — and `cornersAdjacent` is the
> coupler relation, already frozen, unconsumed. Both re-derivable via `POLYGON-FIRST §2.1`.)*
>
> ---
>
> ## ⭐⭐ 2026-08-06 — the evidence and cautions that survive the ruling. Read before building.
>
> ⛔ **The "tried and reverted" note below is about `SPUR_OUTLINE`, which `ROADMAP A0` describes as asserting
> the spur *"rather than punching the whole map."* It was the ALTERNATIVE to `blocks = boundary − stroked
> roads`, not that construction.** That construction has never been the render path and the eye has never
> seen it.
>
> ⚠️ **AND THE CORPUS CONTRADICTS ITSELF HERE — this is the seam, not a stale count.** `PIPELINE §Tile` says
> *"NOT figure-ground (blocks-as-positive, streets-subtracted) — that regime is dead"*; `ARCHITECTURE §2.1`
> defines the polygons Survey receives as *"faces of the centreline graph"*; `OSM2STREETS-GROUNDING §1.4/§1.6`
> records that the field standard face-walks for blocks **and rejected boolean clipping** for intersections.
> **Jacob (2026-08-06): the tile regime is correct; the curb is derived from the tiles' edges; "the polygon"
> means THE DERIVED CURB, and corners must be identified off it — if they don't fall out, we're in chains.**
> ✅ **RESOLVED by the 2026-08-12 ruling above** — walking identity-carrying side-chains satisfies both
> readings at once: the walk survives (so identity is carried, not recovered) and the roads have width
> (so the spur closes). The corners *do* fall out, and they fall out off the derived curb.
>
> **What is measured, with the commands (⛔ do not quote these numbers without re-running):**
> `node scratch/punchout-spike.mjs` — the punch-out already computes: `blockSharp = differenceRings([stencil],
> asphaltSharp)` (`buildBlockGeometryV2.js`), gated behind `__debugRings`, and **`frontageEdges` is already
> sliced from it.** ⛔ **Read its output as a COMPOUND PATH** — boundary contour + holes + islands, winding-
> encoded — never as a flat block list; that misread is recorded in the spike's own header.
>
> **What broke it, two commits a week apart, neither saying so:** `4044bca1` (7/15, *"perf(designer)!: T4"*)
> deleted the rounded primitive `applyRoundCornersToRing`/`blockRounded`; `cd062388` (7/22) emptied
> `ribbons.intersections` **258 → 0**, which is what `cornersAtIx` walks. ⚠️ The primitive was restored
> 2026-08-06 (`090a68cf`) and **reverted the same day on Jacob's call** — it rounded nothing anyway, because
> its input is that empty array. Recover it from `4044bca1^` if the substrate question rules that way.
>
> ⛔ **INVARIANT 2 governs any move here:** `filletRing` and `applyRoundCornersToRing` round the same object
> from opposite sides — **alternatives, never both.** Running both is the second rounding mechanism §1 forbids.
>
> ---
>
> ⛔⛔ **TRIED AND REVERTED, 2026-07-31 — but the verdict is UNRELIABLE, not reversed.** Asserting the spur as
> a closed two-sided outline before the walk (`spurOutline.js`, `SPUR_OUTLINE`) was built and then
> **reverted out of trunk** (`152e7734` built it, `7b5b87a3` reverted it, taking the corner registry and
> the probes with it). There is **no `spurOutline.js` in the tree and no `SPUR_OUTLINE` in any source
> file** — verified 2026-08-04. ⛔ **Do not go looking for the flag; there is nothing behind it.**
> ⭐⭐ **THE LESSON IS THE LOAD-BEARING PART, AND IT IS NOT "the probes don't predict the eye" — that
> over-read it.** Named 2026-08-06: **Jacob was looking at `lafayette-square` while the work was on
> `lafayette-square-staging`, and neither party knew all day.** Different maps (overlay-authored
> **52 vs 177**), so the verdict was taken on the scene the change was *not* on. ⛔ **Do not cite the
> revert as proof the construction fails, and do not read this as licence to re-land it** — the probes
> are neither vindicated nor discredited. ⭐ **An eye verdict must record the SCENE it was taken on**,
> as strictly as a measurement records its authoring state (`PREBAKE §4.0a`, `ROADMAP A0`).
> The dead-end substrate question was therefore **OPEN** on that evidence — ✅ **and is now RULED
> (2026-08-12, the block at the top of this section).** ⭐ **The revert still must not be cited as proof
> the construction fails**; the ruling does not rest on it either way.

> The tile model replaced the **figure-ground** regime (blocks-as-positive, streets-as-subtracted-void) in the ~2026-06-01 re-pour, and **T4 (2026-07-15) deleted figure-ground's geometry outright** — the tile construction is now the only one. The emitter reference is archived at [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md); `silhouetteStraightEmitter` and the band emitters no longer exist in the tree. `buildBlockGeometryV2` survives as a **frontage-edge identity builder only** (§1's T3 note below).

> ## ⭐⭐ DOCTRINE (2026-06-15, Jacob — the construction campaign): CONSTRUCT the hard polygons; DERIVE only the simple block faces.
> The derivation chain below holds for a **simple block face** — a tile bounded by ordinary street legs derives correctly (centerline → offset → ribbon). It **fails at the two HARD polygons**, and that failure is one root, not many: **the junction and the divided median must be CONSTRUCTED positively, not left to emerge from the face-walk.** ⛔ **A purely emergent junction IS the bug family** — that is the posture this doctrine replaced, and `tileGround.js`'s header now says so.
> - **Why (canon × the median deep-research × osm2streets):** the standard (`OSM2STREETS-GROUNDING §2`, "the defining divergence") **constructs the intersection polygon positively at every node** — roads trimmed back, the node neighborhood *replaced* by construction; *"every E3 artifact lives in this gap."* And the median research (2026-06-15) found **no production system *derives* a median** — A/B Street calls a centerline-derived median a **known limitation that "doesn't fit"** — the right move is to **construct a generic median positively**. Both findings are the same principle from two sides.
> - **The unification:** junction-curb bumps + 4-way sliver corners (emergent junction tile) · median needles + the "d" bulge (emergent median face) · divided-transition scallops/width-steps (tiles inheriting messy node geometry) are **ONE root** — *we build ribbons against tiles that are emergent at the hard cases, not constructed.* The concentric-ribbon FILL is sound; it just needs **correct polygons to build against.**
> - **The campaign (now ONE move):** **intersection-everywhere** — construct the intersection polygon at EVERY node (trim-back + corners-by-clockwise-adjacency). The junction MAP already spans every node + the corner-adjacency pairs are frozen; only the GEOMETRY (apron + edge-collision trim) is still divided-only (forensic 2026-06-16). The `OSM2STREETS-GROUNDING §4` recommendation #2. **Brief: `HANDOFF-junction-construction.md`.** *(The second half — ~~constructed generic median~~ — is RETRACTED; the median is DERIVED, see the update below.)*
> - **LOCKED (do not reopen):** the two-carriageway model (no merge-to-spine); the concentric-ribbon FILL (`sectionPass`); custom > OSM > AASHTO widths. **Separate layers, NOT tile/median geometry:** pedestrian refuge islands (a footway layer, `footway=traffic_island`/`crossing:island=yes`) and signal hardware (instanced assets from `highway=traffic_signals`).
>
> ### ⭐⭐ UPDATE (2026-06-15, Jacob — *"why aren't we using the same make-polygon / walk-polygon process as everywhere else?"*): the MEDIAN is DERIVED, not constructed.
> The median half of the campaign is **retracted.** A divided median is **NOT a hard polygon to construct** — it is the **block face `extractFaces` already walks between the two carriageway chains**, painted by the **existing Section ribbon model** (`SECTION §3`): a tile with both ped strips off is the **"open field"** (`SECTION §3.1` line 89), its **`luRemainder` flooding curb-to-center** (`SECTION §3` line 111) — route that flood to the `median` class and that *is* the median. Liftable, no new geometry. What made it *look* like a construction problem was a **WIDTHS** bug — the carriageways overran the gap and annihilated the median; once each carriageway is `surveyHW/2` per side (the landed `3a` widths, `8fd3485`), the median = the gap between the inner asphalt edges = `luRemainder`, and the **nose, cross-street crossings, and Lafayette's no-median all fall out for free.** Even the nose **rounds with the same cap/fillet strategy as every other tile end** (Jacob) — no bespoke primitive. The old chain-to-chain median **stamp RING** is deleted. **Mechanics + the as-built identity: §3.5.**
>   - ⚠️ **CORRECTION (2026-07-22):** the E2 **merge patches** (`derive.js` `stamp('merge', …)`, the divided-corridor loop ~L3306–3440 — the nose-taper + cross-street-crossing *corridor asphalt*) are **NOT deleted**; they still emit. The median **body** is a derived walked face (the lock below holds), but the transition-taper/crossing merge *asphalt* is still constructed. At a divided-into-through-road **shared-node convergence** one of these nose-taper stamps collapses to a **degenerate duplicated-vertex needle** on the through-edge — the class `SKELETON §5h` fixes, upstream of E2, via the prevailing-direction overlay (`strokePoints`). So: median body = derived; merge asphalt = still constructed; the "~:3135–3354 deleted" line ref was stale.
> - **The deeper pattern (bank it):** BOTH recent hard cases dissolved the same way — the **junction-curb bump** was fixed by correcting the *survey* (name-aware `roadId` + width reconciliation), not by constructing a junction polygon; the **median** by correcting the *widths*, not by constructing a median polygon. **Fix the derivation → the universal walk produces the right polygon.** This *narrows* the "construct the hard polygons" campaign: construction is the last resort, after the derivation is verified correct. Whether intersection-everywhere (campaign half 1) is still needed, or also dissolves once the survey/identity is right, is the open question — do NOT assume construction before exhausting the derivation fix.
> - **New LOCK:** the median is a WALKED FACE, derived by the universal pipeline — **never a constructed polygon.**

### ⭐ THE DERIVATION CHAIN — the centerline is the root source (FUNDAMENTAL; Jacob)

Everything the operator sees is a **pure derivation of the centerline**, in strict order: **centerline → polygon (curb/tile) → ribbon (asphalt · curb · treelawn · sidewalk)**. The ribbon reads off the *polygon*, but the polygon is *itself* nothing but the centerline's concentric offset, so the **centerline is the ROOT**. Two consequences bind every fix:

1. **The polygon is BOTH the geometry source AND the identity source.** The ribbon reads off the polygon not just *where the edges are* but *what they mean*: **"what is a straight leg?"** (a maximal run of same-street edges — `groupRuns`), **"what is a corner?"** (a run seam / sharp vertex — `vertR` / `filletRing`), and **"is this treelawn or sidewalk?"** (the per-frontage material — `gleanTreelawn`). So a rough centerline corrupts not only the *shape* but the *identity*: facet vertices get misread as corners (each taking a fillet → lumps), one frontage shatters across facet-edges, the material assignment fragments. **A broken sidewalk at a faceted curve is an identity failure, not only a geometry one.**

2. **Fix at the centerline, FIRST, and at its source.** Because the polygon and the ribbon are *derivations*, any defect in either originates upstream. Patching the polygon — or the ribbon/sidewalk/treelawn — while the centerline is rough is **editing a shadow**. ⛔ **Diagnostic corollary:** if you change something and the *polygon moves but the centerline does not*, you are at the wrong (downstream) layer — stop and go up.

The **concentric law** (the curb is *always* a concentric offset of the centerline) is the **geometry half** of this. The **identity half** — leg/corner/material descend from the same root — is just as binding. Together: **get the centerline right and the entire ribbon, shape *and* identity, follows for free.** Cross-refs: `ORIENTATION.md`, `README §START HERE`, **`SKELETON.md §3.5`** (the concrete frame→render flow: where the points live, the single `ribbons.json` source, the `STREET_SMOOTH` knob, the curve-fit), `SECTION.md §7.1` (the SHAPE/FILL which-layer frame).

### ⭐ THE FOUR INVARIANTS (read before touching corners — these bind the construction)

These are substrate-independent corner principles. Building against them is mandatory; if your construction can't honor one, **stop and flag Boz** rather than improvising a parallel mechanism.

1. **The corner is the band BENT around the arc** — a slice of the same continuous concentric offsets — **never a separately-constructed primitive** (no per-corner pad, no per-vertex fillet *as the corner*). §3.4, `SECTION.md §6`.
2. **Concentric offsets use `jtMiter`, never `jtRound`** — jtMiter inherits an already-rounded ring's arcs as concentric nested arcs AND passes operator-authored R=0 squares through sharp; jtRound re-rounds every corner by radius=depth (a second rounding mechanism) and corrupts squares. The curb silhouette is rounded **once** by `filletRing`; the inward bands then `jtMiter`-inherit it. §3.3.
3. **The ADA corner pad is a band-slice**, not predicated on the arc — so it works square OR round. (`SECTION.md §6` owns the ADA fill.)
4. **Mono-width** per block/run, not per-leg stitched. "Ribbon monowidth, strips variable" — the *outer* depth is uniform per block (clean concentric corners); what varies per-edge is the *divider* (where treelawn ends) and the *materials*.

### The ribbon as the entire object

The visible "street" is a cross-section running along the chain: asphalt, then curb, then treelawn, then sidewalk, terminating at the property line. The same cross-section persists from straight-spans into the corner — *the corner is the ribbon's WRAP around the IX*, same materials, same depths, bent around an arc. The corner is **not** a separate primitive gluing two ribbons together; it is what naturally happens when the band follows the rounded curb silhouette around the IX.

### Anti-patterns this regime forbids

- ❌ Snapping or editing chain endpoints to "clean up" a corner. The corner comes from the offset of the centerline; chain endpoints are descriptive, not prescriptive.
- ❌ Per-IX special-case extension math (extending a chain segment to find where it meets another).
- ❌ Authoring a fillet-wedge primitive at a corner as a separately-constructed polygon.
- ❌ Re-deriving geometry from chains *past the Wall*. Section is a pure consumer of the frozen shape (`WALL.md`).
- ❌ Smoothing/simplifying the **polygon** (curb) while the centerline stays faceted — the wrong layer (the Derivation Chain corollary).
- ❌ Splitting a chain at every slight bend. Slight bends are OSM noise; the junction-protected RDP already collapses them (`SKELETON.md §3 step 8`).

### Diagnostic order when something looks wrong

1. **Is the CENTERLINE clean at this location?** (Survey navy line, `SurveyorOverlay`.) A faceted/kinked centerline corrupts shape *and* identity downstream. If rough → fix the frame (`SKELETON.md`), not the polygon.
2. **Does the polygon move but the centerline doesn't?** → you're at the wrong (downstream) layer. Go up.
3. **Is this SHAPE (Survey, pre-Wall) or FILL (Section, post-Wall)?** A wrong silhouette is upstream; how the ribbon *bends* is Section. "Is this chains again?" (`PIPELINE §Wall`).
4. **Only then, the construction:** the tile curb-builder (`tileGround.filletRing` / `offsetRingVariable`) or the FILL (`sectionPass`). The legs are almost always clean (`SKELETON.md §5d`); the bug is usually which legs the corner-builder paired, or a width datum (`SKELETON.md §5a/§5g`), not the input.

---

## §2. Data shapes

### Input: `ribbons.json` (the First Bake — `src/data/ribbons.json` or per-scene)

```js
{
  streets: [
    {
      id, skelId,        // chain identity (skelId canonical post-skeleton.js)
      name, type, highway,
      points: [[x, z], ...],     // chain centerline polyline (denser than skeleton: derive.js inserts an IX vertex at every intersection)
      measure: {
        left:  { pavementHW, treelawn, sidewalk, terminal, curb? },
        right: { pavementHW, treelawn, sidewalk, terminal, curb? },
        symmetric: bool,
      },
      segmentMeasures: { [segOrd]: { left, right, symmetric } },  // per-run overrides
      capStart, capEnd, capEnds,    // 'round' | 'blunt' | 'none'
      anchor,                       // 'center' | 'inner-edge'
      innerSign, pairId,            // divided carriageways (which perp side faces the median; mate's skelId)
      phase,                        // divided structure {kind, role, corridorName, spineAtStart, spineAtEnd, ...} — see SKELETON §2
      gradeSeparated,               // excluded from the face graph (else the 2D crossing bowties extractFaces)
      intersections: [{ ix, ... }], // ⚠️ ix are INDICES into points — stale if you densify the stored array (SKELETON §3.5)
      disabled,
    },
  ],
  intersections: [ { point: [x, z], streets: [...] } ],   // ⛔ SHIPPED EMPTY — length 0. Corners come
                                                          //    from the tile graph, not from here.
  faces:  [ { ring: [[x, z], ...], use: 'residential' | 'park' | ... } ],  // 173 on LS — read for LU coloring
  tiles:  [ { ring, edges: [{skelId, side}], caps } ],    // ⭐ 101 FROZEN BLOCK FACES — the polygon
                                                          //    substrate, frozen at prebake by derive.js
                                                          //    and consumed by tilesFromFrozen(). The
                                                          //    live extractFaces walk is the FALLBACK
                                                          //    for artifacts that carry none (toy/pre-D2).
  medians: [...],        // 52 — CONSTRUCTED at prebake, load-bearing (tileGround dereferences it)
  corridors: [...],      // 0 on LS
  junctionMap: { nodes: [...] },   // 233 nodes on LS
  junctions: [...],      // 277
  nameTransitions: [...],// 21
  alleys, paths,
}
```
⚠️ **Two traps this schema used to set.** `intersections` is documented as the "emergent IX list" and is **empty in the shipped artifact** — a consumer written from it silently gets nothing. And `tiles` was **omitted entirely**, which is how the corpus came to assert in two other docs that no block polygon exists in `ribbons.json`. *(Both corrected 2026-08-04, measured off `src/data/ribbons.json`.)*

**Field semantics:** `pavementHW` — perp half-width from centerline to asphalt outer edge (the curb is this offset). `terminal` — `'sidewalk'` (ped zone present) or `'none'` (bare median, etc.). `anchor: 'inner-edge'` — ⛔ **NOT an authoring mode** (corrected 2026-08-11, `SKELETON.md:183`): it is the **prebake width-side normalizer**, stamped at prebake and **not** in `overlay.json` — reading the operator's overlay for it reports "unset" on every carriageway, which is how this was first mis-measured. The chain sits at the carriageway's **inner edge**; `innerEdgeAssign` sets both sides to `surveyHW/2` and zeroes the inboard ped. `intersections.ix` are **indices** — the fragile key; `segOrd` (IX-count-before-a-run) and `cornerKeyAt` (IX coord + leg skelIds) are the densify-robust keys (`SKELETON §3.5`).

### The TILE — the block face (`extractFaces`)

`extractFaces(streets)` (`tileGround.js:508`) builds a planar graph from the **shared vertices** of `streets[].points` (grade-separated streets excluded) and walks its faces. Each enclosed face is a **tile** — a city block, bounded by the centerlines that surround it. The tile is the unit everything is painted onto.

- **The grout is the centerline**, not a drawn line. A tile's edges ARE segments of the bounding streets' centerlines.
- **Near-coincident endpoints are welded** before the walk (`ENDPOINT_SNAP`) so a loop body that closes within a few cm reads as a closed face, not an open pendant — this is what makes a loop's **median = the emergent enclosed face** (`LOOP-STREETS.md`).
- **Dead-ends** render woven with their authored cap; the pendant-prune was reverted (asphalt is tile-sourced — pruning deletes the road; `SECTION.md §6`).

### The curb SHAPE — `iA` (the frozen polygon)

The curb is the per-edge **parallel offset** of the centerline: `iA = chain ⊕ pavementHW` per side (`offsetRingVariable`; D6a — the curb is an offset, not an asphalt-union carve) — **for the tiles that qualify.** ⛔ **The offset is GATED:** `tileGround.js` takes it only when `opts.iaOffset !== false && !isMedianTile && ringArea > 1500`; everything else takes `legacyBlock()`, the asphalt-union carve, **as its primary path** — correctly, since a median or a sliver is not an edge-offset. ✅ **The choice is no longer silent — every tile carries `producer` + `producerReason` in `shape.json`** (A07, `0464c136`), and a qualifying offset that comes back degenerate is now a **loud, separately-counted failure** rather than a quiet swap. ⛔ So *"the curb is a concentric offset"* is true of the **majority, not of the map** — the carved share runs from single digits to three quarters depending on the town's block geometry — **and a defect on a median or a small tile will not respond to offset-side reasoning. Read the tile's `producer` before you reason about its curb** (`node scratch/a07-producer-disclosure.mjs`; ⛔ don't quote a share without re-running it). `ROADMAP A07`. Corners are rounded **once** by `filletRing` (`tileGround.js:262`) — the single legitimate rounding (analogous to figure-ground's `applyRoundCornersToRing`). The curb's render differs by tool:
- **Survey (live, pre-Wall):** re-stroked every frame by `buildTileGround` (`sectionFrozen=false` → `tileGeos`).
- **Section (frozen, post-Wall):** read from `shape.json` (`sectionOpen` off the frozen `_shapeArtifact`); the live stroke is gated OFF. (`SKELETON §3.5` — the render-path map.)

### `shape.json` — the frozen per-tile SHAPE (`_shapeArtifact`) + sibling groups

The Wall freezes the SHAPE here: each tile's `runs[]` = `{skelId, side, segOrd, poly, baseMeasure}` (the curb edge + run identity). This is Section's frozen input (`SECTION.md §2`). **~1.03 MB on LS** (measured 2026-08-04; the `64K` this line carried for months was 16× low, and it is the number a slab-payload question gets answered with here).

**Format (`{ tiles, highway }`, 2026-06-16 G1).** The artifact is now an OBJECT wrapping the per-tile array plus **sibling groups that aren't tile-shaped**: `{ tiles: _shapeArtifact[], highway: rings[] }`. The `highway` group holds the grade-separated highway-class strokes (motorway/trunk + links/ramps) — frozen alongside the tiles so the non-Survey frozen views (Section/Design) restore them. *Legacy bare-array `shape.json` is still read* (treated as `{ tiles: d, highway: [] }`) so an un-re-baked scene degrades gracefully. Readers: `BlockGeometryV2Debug` fetch + `freezeShape` (`useCartographStore`); writers: the Survey-exit freeze + `bake-ground.js:923`. Grade-sep centerlines are smoothed unconditionally at 1.5 m before stroking (independent of `STREET_SMOOTH=0`, which exists only to spare the fragile *concentric curb* offset — highways stroke flat) so the frozen ramps are facet-free (`tileGround.js` gradeSep loop). *(Was: a bare array; 4924d9a routed non-Survey views to the frozen path, which dropped the top-level highway group → highways vanished from Design/Measure. Restored (G1, landed) → `_archive/handoffs/HANDOFF-surface-and-wire-geometry-LANDED-2026-06-22.md`.)*

### `blockCustoms[skelId][side][segOrd]` — operator overrides

Per-run cross-section override authored in Survey/Section, keyed by `feCustomKey` = `[skelId, side, min(segOrds)]`.
⛔⛔ **CORRECTED 2026-08-12 — this line said "keyed by the frozen run identity, NEVER chain geometry." THAT IS THE OPPOSITE OF THE CODE, and the whole index question turns on it** (agent Ferrule). **BOTH components are positional:**
- **`segOrd` is a point-array ordinal.** `naturalSegments()` (`buildBlockGeometryV2.js:660`) partitions the chain's point array via `resolveChainSegmentation`, which decides an IX by **bucketing coordinates into 0.5 m bins**. ⇒ **inserting one vertex renumbers every later slot on that chain.**
- **`skelId` is positional too for any multi-chain street.** `skeleton.js:1681` — `chains.length === 1 ? slugify(name) : slugify(name)+'-'+i` — **`i` is the ARRAY INDEX of the chain within its street.** On LS: **78 streets emit one chain (no suffix) · 35 emit many (indexed).** ⇒ welding an earlier fragment renumbers every later one, and a street that welds 2→1 **changes id SHAPE** (`carroll-street-0` → `carroll-street`).
⭐ **This is exactly the `msbfId: i` = fetch-array-index disease `EXTENT-DESIGN §0` calls "history, not a live defect" FOR BUILDINGS — it is still live for CHAINS.**
⚠️ **`shape.json`'s `tile.runs` carries the SAME `skelId·side·segOrd` key**, so a renumber silently re-points **the frozen SHAPE** as well as the authoring — with no operator in the loop. **Any index must freeze both in one breath.**
### ⛔⛔ AND THEREFORE CHAINS PERSIST INTO **MEASURE** — THE WALL DOES NOT HOLD (Jacob, 2026-08-12)
> *"If chains persist at Ribbons in Measure, it is NOT fixed. That must be fixed."* — and his opening
> constraint the same morning: ***"The Measure Tool should NEVER encounter nodes or chains."***

⛔ **Correcting a doc's description of the key is not fixing the defect.** Measured:
`MeasureOverlay.jsx:9` **imports `resolveChainSegmentation`** and `:264` calls it on
`centerlineData.streets` — **the Measure tool walks the CENTERLINES**; `:19`/`:25` read `chainMeasure` /
`chainPavementHW`; `:270` matches "by chain identity (`skelId`)"; `MeasurePanel.jsx:13` names it outright
— *"the fe's **chain-anchored** identity."*

⭐⭐ **This is `POLYGON-FIRST §2.1`'s distinction, live: the Wall is a HANDLE rule, not a CONTENT rule.**
`sectionOpen` genuinely has no chain in scope — and it doesn't matter, because **the KEY the operator
authors against IS a chain**, so Measure must resolve chain segmentation to find a slot. **The artifact
passes the handle test while BEING a chain.**

⇒ ⭐⭐⭐ **THE RIGID INDEX AND "CHAINS DIE AT THE WALL" ARE THE SAME DELIVERABLE.** Key a run to two
permanent NODE ids instead of a chain ordinal and Measure never needs a chain — `resolveChainSegmentation`
has nothing left to do there, and the key stops moving when the geometry does. ⛔ Do not treat the index
as only a re-pour-survival device; **it is the Wall cure, and the Wall is why it cannot be deferred.**

▶ Measured blast radius of the ruled subtraction (`node scratch/index-skelid-fragility.mjs`): simulating step ② (streets weld to one chain) orphans **21 of 30 authored slots by the ID CHANGE ALONE**, before `segOrd` is considered; **42 of 51 `overlay.json` entries** are positional-or-absent. ⇒ **the index must freeze chain identity BEFORE anything reconnects** — mint after, and you mint against already-renumbered chains. Same shape as `measure[side]`. A width drag **fans across every `segOrd` the frontage `fe` owns** (so a far-side T does not step the near frontage — `SKELETON §5g`).

### `runs` / `groupRuns` — the leg identity

`groupRuns(tile)` (`tileGround.js:764`) groups a tile's edges into **runs** — maximal spans of same-street edges. A run is a *leg*; a run seam (street changes) is a *corner*. This is the identity read of the Derivation Chain: `cornerAt(a,b)` = real corner iff `a !== b` (different street both sides), else a through-node. The same test governs construction (`filletRing`) AND authoring scope (`SKELETON §5g`).

---

## §3. The pipeline, function-by-function (`tileGround.js`)

`buildTileGround(ribbons, opts)` (`tileGround.js:1185`) is the single entry for **both** the live 2D Survey render and the offline bake → WYSIWYG by construction (`bake-ground.js:294`, `BlockGeometryV2Debug.jsx:681`). ~2650 LOC total. Opts: `{ stencil, curbWidth, smooth, blockLandUse, cornerRadiusScale, cornerRadiusOverrides, cornerCornerRadiusOverrides, blockCustoms, emitArtifact }`.

### 3.1 The frame, divided roads, and the smooth knob

- **Centerline smoothing rides ONE knob.** `smoothCenterline.js` exports `STREET_SMOOTH` (`:150`, currently `0`) + `junctionKeysOf` (`:159`); `buildTileGround` takes `opts.smooth = STREET_SMOOTH`. `smoothChain` (`:101`) is an interpolating centripetal Catmull-Rom, **corner-protected** (30° splits sharp corners as hard vertices) + **junction-pinned** + **arc-length-uniform** (no scallop on sparse input). Applied at **consume time** on a COPY — it must never bake into the frozen frame (the IX-index constraint, `SKELETON §3.5`). One constant + one pin-set ⇒ one smooth curve, concentric by construction.
- **Divided carriageways stay two centerlines; the median is an emergent geometric face (this line is now the WHOLE model — see the §1 update).** ⛔ **CORRECTED 2026-08-11 — "the chain stays at carriageway CENTER" is the REFUTED center-chain model; do not restore it** (`SKELETON.md:183`, which retired it when D1 landed `innerEdgeAssign`). **The carriageway chains sit at the carriageways' INNER EDGES** — `anchor:'inner-edge'`, measured on **all 38** LS carriageways — and `innerEdgeAssign` sets both sides to `surveyHW/2` while **zeroing the inboard ped**. ⭐ **That is a one-sided chain being faked with a two-sided one plus a suppression hack, and the 2026-08-12 ruling (§1) makes it honest** — it is also the evidence that Jacob's left-edge datum is already the live model for divided roads. The median is whatever face `extractFaces` walks between the two carriageways, and its grass is the ordinary `luRemainder` of that tile (ped-zeroed by **face-read identity**: a tile bounded by BOTH carriageways of one pair — §3.5) — **not** a chain-identity consequence, **not** an authored object, **not** a constructed ring. The E2 stamp ring that briefly contradicted this is **deleted** (§3.5). The two-carriageway model is **LOCKED** (no pair synthesis, no collapse to a single spine). Frame topology (longitudinal weld, station-overlap pairing, `phase.spineAt*` the frozen transition link) lives in `SKELETON.md §2/§3` + `_archive/TRUMAN-FORENSICS.md`.
- **Divided↔undivided transition (the "special sauce", `SKELETON §5d/§5e`).** At a transition the outer curb must run **straight through**; the median opens **inward**. The corner-builder must round the **two corridor outer-edge legs** (treat the divided corridor as ONE road at the corner), never the carriageway *stubs* — rounding a stub against the cross-street fabricates the **false corner**. Detect via `phase.spineAt*` (a frozen frame fact, never re-derived by node-matching at construction). This cured the live false corner (`9c275ce`). The residual transition "d" bulge comes from the **PRODUCER** — the curb is minted by stroking chains and then snapshotted, so the bow is frozen *into* the artifact (**Check C, RED**). ⚠️ *Precision fix 2026-07-31: this is not "the curb is unfrozen for consumers" — every non-Survey view already reads the frozen `shape.json` (`WALL.md §31`).* Fixed by building the curb once in prebake from the frozen frame (`HANDOFF-freeze-the-curb-in-the-first-bake.md` D6b/c), not by more construction.

### 3.2 Tiles — `extractFaces` (`:508`)

Builds the planar graph from shared vertices of `streets[].points` (excludes `gradeSeparated`), welds near-coincident endpoints (`ENDPOINT_SNAP`), walks the enclosed faces. Output: the tiles, each carrying its bounding-street edges (skelId/side per edge). Loop interiors emerge as faces (→ median, `LOOP-STREETS.md`). ⛔ **CORRECTED 2026-08-12 — "the outer/perimeter face is INCLUDED so exterior streets get asphalt (G9)" is FALSE, and `PIPELINE §Wall` carries the same false sentence.** `tileGround.js:984` drops **every** non-positive-area face, the outer face included (its only filter is `signedArea > 1e-3`). **What actually happens:** `derive.js:4632-4648` clips the face-streets to the boundary and **injects the boundary ring as closing edges** (`skelId: '__boundary__'`), so the perimeter faces close into real bounded tiles — **31 of the 101 carry a `__boundary__` edge.** ⭐ The mechanism matters: it is exactly what the punch-out reproduces for free against the raw boundary (§1's outer-polygon note).

### 3.3 The curb SHAPE — `offsetRingVariable` + `filletRing`

Per tile, per edge: stroke the centerline outward by `pavementHW` (per-side, per-run via `runMeasure`) → `iA`, the curb edge. `offsetRingVariable(ring, depthAt, cornerAt, capAt)` (`:147`) does the variable-depth parallel offset; `cornerAt` uses the run-seam test (real corner vs through-node) so a width step doesn't appear at a through-node. `filletRing(ring, Rfn, sink)` (`:262`) rounds the curb corners **once** (radius from the authored corner-R kit: global scale × per-IX × per-corner). `strokeOpen(polyline, delta)` (`:371`) handles open/perimeter runs. **jtMiter throughout** (invariant 2). This is the SHAPE that freezes at the Wall.

> ⭐ **Name-aware identity (2026-06-15) — `cornerAt`/`isThrough` key on the canonical `roadId`, not raw `skelId`.** A `continuesAs` name-transition is ONE continuous road (*the road is the line, the name a label*), so its seam is a **through-node, not a corner** — `cornerAt` reads the same `roadId` both sides and runs the offset straight through; `sectionPass`'s `isNameTransition` suppresses the corner/ADA bid there. The `roadId` (a `continuesAs` union) is frozen in `derive.js` and rides the frozen `runMeta` so Section reads it post-Wall. Keying on `skelId` mis-read the West-18th↔Dolman / South-18th↔West-18th seam as a corner → an unstable offset-line intersection between near-tangent legs → the junction-curb **bump** + a phantom mid-curve ADA ramp (the resolved `HANDOFF-curve-primitive-skeleton.md` defect). The companion is the **width datum**: a through-road must carry one `pavementHW` per side (next §, the width-step line).

### 3.4 The ped FILL — `sectionPass` / `sectionOpen` (`:801` / `:1161`)

`sectionPass(shapeTiles, cw, stripMat, blockCustoms)` strokes the ped cross-section **INWARD** off the frozen curb `iA`: treelawn (outer strip) + sidewalk (inner strip) + the bent corner fill + the ADA pad + the dead-end cap wraps; LU is the flooded remainder. **Mono-width** (one total depth per block → clean concentric outer edge; the divider varies per-edge). The corner is the band **bent** (invariant 1) — a slice of the same continuous offsets, all-SW at the corner (ADA), tangent-trimmed onto the legs. `sectionOpen` is the open-side mate (Wall Phase-D) composing block/curb/asphalt off the frozen `iA` with **no chain handle**.

> **`SECTION.md` is the SSoT for the FILL** — the strip swap, the bent-SECTOR corner construction, the ADA "slide-to-curb", the cap-wrap, the "how to change the corners" guide, and the Section authoring panel all live there. This doc owns only the geometry doctrine; §3.4 is the pointer.

### 3.5 Materials / LU / median

- **Per-LU color:** each tile colors by its own land-use metadata (M1); the treelawn paints its tile's LU color (M2). LU = `blockLandUse[blockKey]` override → `face.use` → weighted hash.
- **Median (divided) — a WALKED FACE, derived (the as-built home; §1 update is the doctrine).** The median is the block face `extractFaces` produces between the two carriageway chains. **Identity (`isMedianTile`, `tileGround.js`):** a tile bounded by **BOTH carriageways of one divided pair** (read off `phase.role`/`phase.pairKey`). ⛔ **No left/right side test** — tried and reverted: the measure side is point-order-relative *per chain*, so a pair's two carriageways disagree on which side faces the median (Lafayette: A's side matches the inboard oracle, B's doesn't). "Bounded by both members of the pair" is the convention-free signal; `pairKey` rules out cross-pair junction tiles. **Grass:** the tile's `luRemainder` (the open-field flood, `SECTION §3`) routed to the `median` class via a frozen `isMedian` flag (ped bands already zeroed) — no clip, no ring. **Curb:** the universal carve `differenceRings([tile.ring], aFill)` (tile − asphalt = the inner-edge gap). **The nose, crossings, and no-median all fall out** once the carriageway widths are `surveyHW/2` per side: where the carriageways converge or a cross-street crosses, their asphalt closes the gap → `luRemainder` empty. `derive.js` keeps only `noseRecs` (junction map) + corridor **merge asphalt** (crossing windows + nose tapers); the median STAMP RING is deleted. *(OPEN: nose rounds with the standard cap/fillet — pending; the merge-asphalt may be removable once the junction lands — `HANDOFF-junction-construction.md`.)*
- **Median (loop-body):** the enclosed loop interior (Benton / Park Place, `LOOP-STREETS.md`) is the analogous case, still on a Clipper-inset `kind:'median'` ring (frozen `med`, clipped) — **not yet unified** to the walked-face/`luRemainder` path. Separate from the divided median above.
- **Curb stroke** is one continuous polygon per tile, wrapping the silhouette incl. corners (G6), painted OVER the bands so the band-to-asphalt seam hides under it.

### 3.6 The Wall + the bake

Survey-exit freezes the live smoothed `_shapeArtifact` → `shape.json` (`serve.js` POST `/shape`); the full slab bake (`bake-ground.js`) runs the same `buildTileGround` (+ `STREET_SMOOTH`) → the slab. WYSIWYG: live == bake, one module. (`WALL.md`, `BAKE.md`.)

---

## §4. The corner specifically

The corner is the highest-stakes, most-re-derived topic. Hold the chain of homes:

- **Geometry doctrine (the 4 invariants):** §1 above. The corner is the band bent; jtMiter; ADA band-slice; mono-width.
- **The SHAPE corner (curb arc):** `filletRing` rounds the curb offset once; radius from the 3-tier kit (`SKELETON §4` — Corners subsection). The corner is *two things in two tools*: **SHAPE in Survey, FILL in Section** (`ARCHITECTURE §2.1`).
- **The FILL corner (ped bend + ADA):** `SECTION.md §6` — the bent SECTOR off the frozen fillet, exact tangent-trimmed legs, street-edge always concrete (ADA), the set-back walk sliding to the curb on its leg.
- **The divided false corner:** `SKELETON §5e` — the corner-builder must pair the corridor outer-edge legs, not the carriageway stubs. (Figure-ground skipped these IXs via the now-dead `cornersAtIx`; the tile path must build the *right* corner. The retired skip is documented in the figure-ground archive.)
- **The width-step "dogleg":** `SKELETON §5a/§5g` — a per-fe `pavementHW` step at a through-node, usually a datum-data defect (drop/reconcile the deviating value), not a construction one. **Now reconciled by construction across `continuesAs` seams** (2026-06-15): `derive.js` sets each canonical `roadId`'s base `pavementHW` to one value per side (MAX across its chains), so a through-road carries one curb width — the seam no longer steps. ⚠️ A per-fe `blockCustoms` `pavementHW` override still wins over the base, so a deviating override on a through-road must still be corrected in the Survey/SHAPE SSoT (`blockCustoms`, `SURVEY.md:76`) — the residual curated-override gap. Detector: `through-width` (regression guard) + `curb-bump` (symptom) in `scratch/correctness-detector.mjs`.

---

## §5. The render side + authoring

The 2D Survey/Section render reads `buildTileGround` live (Survey) or `sectionOpen` off the frozen shape (Section). The **authoring panels** (the handles, the corner-R kit, the strip-material swap, the cap selector, translucency) are catalogued at their stage homes:
- **Survey SHAPE authoring** (asphalt-edge drag, corner-R kit, anchor, caps, name/type) → `SKELETON.md §4`.
- **Section FILL authoring** (treelawn/sidewalk depths, strip material LU↔SW swap, revert UI) → `SECTION.md §3`.

> ✅ **T4 LANDED (2026-07-15) — figure-ground's geometry is deleted.** The warning that stood here was right and the bill came due: the "real perf/reliability drag" was **285 s of Altadena's 320 s Designer load, drawing nothing** (`DESIGNER-LOAD-FORENSIC.md`). Deleted: the unreachable render branch + the `isTileScene` flag that had short-circuited it, `buildChainBandsLive` (the drag sidecar — the census's "residual third representation"), `emitOneBlockRingBands` / `emitBlockRingBands` / `buildFrontageBandsV2` / `silhouetteStraightEmitter`, `blockFill` / `ribbonUnion` / `applyRoundCornersToRing`, the `_v2Blocks` + `measureDragging` wiring, and `buildV2BakeShape` in the bake. ≈1,900 lines. `blockSharp` / `asphaltRounded` / `cornersAtIx` survive **only** as inputs to the fe builder.
>
> ⚠️ **T3 is still owed, and it is now the ONLY reason `buildBlockGeometryV2` exists.** What's left of it builds the **frontage-edge identity** — `feCustomKey` = `[chainSkelId, side, min(segOrds)]` — that SurveyorOverlay / MeasureOverlay / MeasurePanel resolve `blockCustoms` against. The tile `runs` already carry the identical triple (`tileGround.js:935`: `blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd]`), so this is a **duplicate derivation** — the last of the three representations. T3 unifies them. ⛔ **It does NOT end with "the file dies"** — `buildBlockGeometryV2.js` is also a live utility module: `tileGround.js` imports `pickLuFromHash`/`hashKey`/`blockKeyFromRing`/`resolveChainSegmentation` from it, `buildPathRibbons.js` imports `differenceRings`/`intersectRings`, and both overlays import `resolveChainSegmentation`. Deleting it breaks the live tile construction, land-use hashing and the path ribbons; T3 needs an **extraction** step nobody has budgeted. **Gate: prove the tile-derived key is byte-identical to `feCustomKey` for every fe on LS *and* Altadena BEFORE cutting** — `blockCustoms` hashes off it, so a drifted segOrd doesn't error, it **silently orphans** every authored custom (the LS re-center failure mode). `scratch/t4-fe-parity.mjs` is the harness.

---

## §6. Active failure modes — LIVE

> The front of the work. The figure-ground-era modes (SELFINT band rings, curb-stroke Clipper gaps, dblclick-vs-spec) are retired to the figure-ground archive; the live thorn/degeneracy class is tracked as **G12** in `HANDOFF-tile-feature-ledger.md`.

### 6.1 G12 — thin-feature degeneracy ("thorns") — OPEN (PARTIAL) · ⭐⭐ SUBCLASS 2 **CONFIRMED AND SIZED** 2026-08-12

> **`node scratch/sever24-mechanism.mjs` (agent Quill), LS, authored.** Inward ray from each curb sample
> to the far side of the tile, 0.05 m spacing, threshold **2·WB** (the band occupies WB inward from *each*
> side, so below 2·WB the offsets pass the medial axis — WB alone is "cannot fit at all"; 2·WB is the
> collision):
> ```
>                 width < 2·WB    width ≥ 2·WB
>   unpainted        510.0 m         397.1 m
>   painted          292.7 m      22 846.6 m
>   unpainted rate     63.5%            1.7%     ← risk ratio 37.2×
> ```
> ⭐ **Subclass 2 owns 510 m — 56% of all unpainted band metres.** Median local width along the unpainted
> arc: **1.3 / 1.0 / 2.0 / 0.3 m against a 6.76 m threshold.** These are the **tapering wedges Jacob's eye
> picked out** on the render (Rutger/Park, chouteau, lafayette/mississippi — "same shaped", 2026-08-12).
> ⇒ **LAYER: SHAPE, not FILL.** The tile's own geometry pinches below band capacity; the FILL is being
> asked for something the region cannot hold. ⛔ The cure is `§6.1`'s **LOCAL capacity clamp**
> (`HANDOFF-band-fold-fix.md`) and is explicitly **not** a FILL patch and **not** a corner-R clamp.
>
> ⛔⛔ **A PRIOR "G12 IS KILLED" IS RETRACTED — and the retraction is the lesson.** It was killed on
> *"every one of the 24 has `cap === WB` exactly, so no tile is capacity-limited."* **`cap === WB` means
> the CLAMP DID NOT FIRE — which is precisely what subclass 2 looks like**, because (per this section) the
> clamp fires only on FULL collapse and `thinTile` is computed but orphaned. **The test measured the clamp,
> not the thinness.** ⭐ And a whole-tile mean width (`2A/P`) cannot see it either — Boz ran it and got
> 64 m and 67 m on two of the affected tiles, because **a tapering block reads as ordinary on an average.**
> **The only valid test is LOCAL width along the arc.**
>
> ⛔ **THE OTHER 397 m IS NOT THIN AND G12 DOES NOT TOUCH IT.** 20 tiles sit at 0% below threshold with
> local widths of **43–364 m** — including both standing leads, `rutger-street-1|right` (43.2 m wide) and
> `chouteau-avenue-0|right` (78.7 m). `iA` is present and well-formed, the arc is **owned**, the region is
> wide, and nothing paints it. **CAUSE NOT ESTABLISHED.** Killed on the way: unowned arc (unpainted is
> *less* unowned than painted, 8.9% vs 19.7%) · "whole leg ⇒ the run was excluded" (1 of 34 runs is ≥95%
> unpainted; 33 are partial) · co-claim (**0%** of unpainted samples are painted by a neighbour — not a
> partition defect) · corner over-trim (killed by scale).
>
> ⛔ **SIDE-SKEW IS DEAD — and it inverted.** Normalised over every banded tile: left **450.0 m / 20,424 m
> = 2.20%**, right **457.2 m / 29,294 m = 1.56%**; ratio **0.71 — right is the LOWER rate.** The raw
> right-side majority in the first five samples was **the denominator talking** (right-side runs carry 43%
> more arc). ⭐ Boz proposed this hunt off those five; **it is the third time in one day a shape was read
> off an un-normalised sample** (cf. the offset-producer share, the median hypothesis).
When a tile's interior pinches below the band depth `WB = cw+tl+sw`, the inward offsets collapse past the medial axis → degenerate spurs `filletRing` rounds into thorns. **Two subclasses, both open** (`SECTION-CAP-CLAMP-FORENSIC.md`): (1) self-intersecting blobs (the band-fold-fix is STRANDED on a non-ancestor branch); (2) band-neck / partial-degeneracy (the `cap` clamp fires only on FULL collapse; the `thinTile` signal is computed but orphaned). The fix is the **LOCAL** capacity clamp (engage on partial-degeneracy without over-clamping the in-spec rest of the block — `HANDOFF-band-fold-fix.md`). ⛔ **Not** a corner-R clamp. Verify map-wide, zoomed-out, on Jacob's eye (the pulled-in view hides them).

### 6.2 Phantom park from `classify.js` — OPEN (data/classification) · ⭐ **MEASURED 2026-07-30, and the prescribed fix was aimed at the WRONG TAG**
`classify.js:60` stamps `type='park'` on any face whose centroid falls inside a park-stamping overlay, **first match wins** — and the bucket is `leisure=park` **OR `leisure=garden` OR `landuse=grass` OR `landuse=recreation_ground`**. Residential yards therefore capture whole blocks.

**Measured on the current `ribbons.json` + `raw/osm.json` (replaying the classifier's own overlay loop):**

| | |
|---|---|
| overlays that stamp `park` | **512 of 895** (258 `landuse=grass` · 249 `leisure=garden` · 4 real parks · 1 recreation_ground) |
| faces whose first match is a park-stamper | 32 — **31 caught by a residential yard, 1 by a real park** |
| faces shipping `use='park'` | 29 — **25 phantom** (all via `landuse=grass`), 1 real, 1 no-hit, 2 other |
| phantom `use='park'` area | **92,869 m²** (the real Lafayette Park face is 122,502 m²) |
| worst single capture | **face#12, 136,234 m² — the 2nd-largest face on the map — stamped by a 4,899 m² lawn** (its final `use` recovers to `residential`; the `type` stamp does not) |

⛔ **The documented "~3 LOC: drop `leisure=garden`" fix would repair 3 of 28.** The dominant offender is **`landuse=grass`** (28 of the 31 phantom catches; gardens account for 3). Any fix must narrow the bucket to genuine parkland (`leisure=park`, `landuse=recreation_ground`) and drop **grass and garden both** — and grass is the one that matters.

⚠️ **Changing this moves land use map-wide** → re-run prebake, re-bake, and gate on Jacob's eye (`[[feedback_shape_pass_fix_needs_rebake_before_the_eye]]`). Still independent of the geometry work. Reproduce: the attribution replays `classify.js`'s overlay loop against `raw/osm.json`; see the 2026-07-30 session.

### 6.2a ⛔ `layers.park[0]` is AUTHORED — it is NOT the phantom (read this before "getting rid of" it)
**The recurring trap (Jacob: *"a piece of phantom geometry that always trips us up"* — 2026-07-30).** `map.json layers.park` holds exactly **one** object, and it reads synthetic on sight: a **perfect 350 × 350 m square, 4 vertices, no tags, centred on the origin, rotated 9.2°, area 122,502 m²** (= 350²). It looks like junk. **It is not.**

It is `clean/park-polygon.json` — an authored 4-corner polygon (`tiltDegrees: -9.2`, `halfWidthMeters: 175`) that `derive.js:1060` **deliberately prefers over the OSM `leisure=park` trace**, because 4-corner topology is what lets the round-corners op and the three corner-plug components (asphalt / curb / concrete) reconcile cleanly. `derive.js` warns on fallback: *"corner plugs will degrade."* Consumers: `parkFeats` · `parkSidewalk` · `parkPaths` · the face-retag at `derive.js:3008`. **Deleting it drops the map onto the 41-vertex OSM trace the doctrine rejects** (`derive.js` says 41 in both its warning and its comment; this doc said 65) (`FEATURES.md` "The ribbon doctrine"); `[[feedback_dont_undo_a_decision_the_operator_made]]`.

⭐ **And it is NOT misaligned — measured 2026-07-30:**

| | bearing off axis |
|---|---|
| the authored square | **9.20°** (all four edges) |
| OSM Lafayette Park (65 verts) | **9°** (1,379 m length-weighted) |
| Park Ave · Lafayette Ave · Mississippi · Missouri | **9–9.5°** |

It agrees with the street grid to within ~0.3°. *(Boz mis-identified this face as "the real park, legitimate" by matching area+centroid alone — 122,502 vs the OSM overlay's 133,443 m² at (3,0) — and only caught it when Jacob challenged the object. **Match a suspicious polygon on its VERTEX COUNT and edge lengths, not its area.**)*

⚠️ **Two real correctables — correct these; do not delete:**
1. **The square is ~8% small.** 350 m a side vs the OSM trace's ~365 m (122,502 vs 133,443 m²) ⇒ the authored edge sits **~7 m inside** the true park edge all round. If that is a slip rather than intent, the fix is `halfWidthMeters`, not the polygon.
2. **`PARK_CENTER` disagrees with it.** `derive.js:1033` uses `{x: -15, z: -15}` for the park-parcel exclusion test while the authored polygon centres on `(0,0)` — a **21 m** offset. Harmless inside a 250 m radius today; it is latent drift.

### 6.3 Curb-as-offset residuals — see the correctness suite
The robust-offset program (D6a) is partial; the RED-until-true detector (`scratch/correctness-detector.mjs`) + `POLYGON-FIRST.md §5` gate the curve-fit cleanliness + corner-roundness. Live state in `BACKLOG.md`.

### 6.4 Dead-end mouth-collapse — ✅ LANDED via the FILL-side lever (eye-confirmed 2026-06-22)
Where a side street **dead-ends/T's into a through street**, `extractFaces` walks it as a **zero-width out-and-back spur** — the face's mouth vertex collapses (tile[53] Albion: `ring[1]==ring[3]`, 0.0 m). The FILL keys corners **by vertex** (`cornerT`), so the two mouth corners collapsed onto one key → one fillet wrapped, the other **butt-capped** (Section-only; curb smooth in Survey, `iA` already carries both mouth fillets). ✅ **FIXED, FILL-side, `iA` BYTE-IDENTICAL** (`spliceDeadEndMouths`-equiv, `opts.deadEndMouthWrap`, `tileGround.js`): (1) **snap** the two spur run-ends to their two fillet apexes → two `cornerT` keys; (2) **trim** the through-road's leg-sector back by a per-mouth disc so the corner wedge (`bandRem`) is free → the bent sector builds at each apex; (3) **synthesize the missing through-leg** on each mouth `cornerT` so the existing **Idea-A deep-leg slide** (`§6.1` step 5) fires → the set-back straight leg dips in. **Bounded per-mouth disc** (centered on the asymmetric fillet midpoint) keeps it local → iA byte-identical on all 101 tiles, multi-spur safe (tile[11]/[43] independent), no 98 m blow-up. **41 mouths / 20 tiles** in the frozen artifact (this line said 39; re-counted 2026-08-04); Benton/Waverly/SV loops excluded (deg-1-tip gate); `kennett-place`/`park-avenue-1` customs segOrd-stable. ⛔ **THE LESSON:** every proxy LIED — two false "LANDED" reports off unfaithful proxy renders; **the operator's eye was the only gate.** And the forensic's "iA-unachievable" blocking constraint was true for *ring-reshape* but moot — **don't reshape the face; the FILL-side lever wins.** ⚠️ **OPEN:** +5 `junction-band` detector flags = the slide's LU ramp-wedge fragments at mouths (eye-call, iA untouched); **8 single-fillet fallback mouths** unwrapped; **strip-swappable** dead-ends not yet rebuilt. Full forensic + wrong turns: `DEAD-END-MOUTH-FORENSIC.md`.

---

## §7. History

- The **13-month corner saga** (what was tried/failed/why, the figure-ground graveyard): [`_archive/RIBBONS-history-2026-06-12.md`](_archive/RIBBONS-history-2026-06-12.md).
- The **retired figure-ground emitter reference** (`buildBlockGeometryV2` data shapes + function-by-function + the dual emitter): [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md).
- git holds the verbatim pre-rewrite `RIBBONS.md`.

## §8. Glossary

- **tile** — a block face of the centerline graph (`extractFaces`); the unit everything is painted onto.
- **grout** — the centerlines, which form the tile edges (the tiles are the faces between them).
- **iA** — the curb edge: the centerline's per-side parallel offset by `pavementHW` (`offsetRingVariable`), rounded once by `filletRing`. The frozen SHAPE.
- **run / leg** — a maximal span of same-street edges on a tile (`groupRuns`); a run seam (street changes) is a **corner**, same street both sides is a **through-node** (`cornerAt`).
- **fe / frontage edge** — a block-edge between two REAL corners; owns `skelId`, `side`, and the `segOrd`s spanning its through-nodes. The authoring unit (`feCustomKey`).
- **segOrd** — count of IX vertices before a run; the densify-robust run key (vs `intersections.ix`, the fragile index key).
- **mono-width** — one total ped depth per block (clean concentric corners); the divider + materials vary per-edge. "Ribbon monowidth, strips variable."
- **terminal** — `'sidewalk'` (ped zone present) or `'none'` (no ped zone — bare median).
- **anchor** — `'center'` (default) or `'inner-edge'` (divided-carriageway authoring mode; inboard ped zone zeroed).
- **STREET_SMOOTH** — the single smoothing constant (`smoothCenterline.js`), read by every consumer; one curve, concentric by construction. Currently `0`.
- **cw / tl / sw** — curb width / treelawn / sidewalk depths (m), perpendicular, outboard inward.

---

*Updated 2026-06-15 — the tile-model rewrite (v1.0). Promoted the live `tileGround.js` construction into the body; migrated the figure-ground emitter reference to the dated archive. Live siblings: `SKELETON.md` (frame), `SECTION.md` (FILL SSoT), `PIPELINE.md` (execution spine). Verify §3 against `src/lib/tileGround.js` before building.*
