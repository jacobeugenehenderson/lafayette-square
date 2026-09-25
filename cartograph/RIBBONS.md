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

> ⛔ **THE PLAIN-LANGUAGE MODEL NOW LIVES IN `PIPELINE.md` (step 3a) — read that first.** What stays
> here is the **mechanism and the evidence**: how the substrate is built, what carries identity through
> it, and every open defect. ⛔ This section was **not** excised in the 2026-09-06 narrative scrub, unlike
> the other stage docs' openings, because it was rewritten the same day and is the live substrate ruling.
> ⚠️ If this section and `PIPELINE.md` step 3a disagree, **one of them is wrong and finding out which is
> the work** — do not settle it by trusting either.

### ⭐ The model in one sentence

**The map is made of TILES — the block faces of the centerline graph. The centerlines are the grout; each tile is painted INWARD from its own edges (asphalt → curb → treelawn → sidewalk → land-use); the corner is the band BENT around the curb arc, never a constructed primitive.** Everything visible is a pure derivation of the centerline.

> ⚠️ **"Faces of the centerline graph" is the assumption now under challenge (2026-07-25).** A graph face
> cannot close around a **degree-1** chain: `extractFaces` walks a dead-end spur out and back over the
> same vertices, so **ALL 50 LS dead-end tips are zero-width slits** — a chain traversal, not a shape
> (`PREBAKE §4.0`, `PIPELINE §5 (the Wall)`). Proposed replacement (Jacob): the SSoT radius as the **outer
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
> ### ⭐⭐⭐ THE LANES ARE PRIMITIVE, NOT DERIVED *(Jacob, 2026-08-13 — supersedes the derived-split wording below it; that read "each authored chain DERIVES INTO two side-chains")*
> > *"The right lane of traffic and the left should just be separate. In 2-way traffic, to the eye it
> > looks like one chain but it's not — it's two chains going opposite directions. Sometimes they
> > diverge, sometimes come back together. **0 interp required.**"*
>
> **A street IS two directed lane-chains, always** — opposite directions, each owning exactly one side and
> emitting only to its right, joined at every node by a **coupler** (a permutation: which incoming side
> hands off to which outgoing side). **The datum is the left EDGE of the right lane.** Undivided = the two
> run coincident (so they cannot cross); divided = the same two, separated by the median.
>
> ⛔⛔ **READ THAT SENTENCE AS AN IDENTITY, NOT AN INSTRUCTION — IT HAS ALREADY COST A SESSION** *(Jacob,
> 2026-08-14: "we were never emitting FROM the left edge, that was confusing and wrong. It's MAKING the
> centerline the left edge")*. **The centerline BECOMES the left edge because that is where the lane is
> cut. Nothing relocates, and nothing is emitted from an edge.**
> ⭐ **ALL POLYGONS ALREADY EMIT ASYMMETRICALLY FROM THE CENTERLINE — this is shipped behaviour, not a
> target** (`iA = chain ⊕ pavementHW` per side, left and right free to differ, `§2`).
> ⛔ **So there is no "datum move", no "emit from the inner curb" build, and no convergence ticket.** Read
> cold, the sentence above says *relocate the emitter*; a coordinator read it that way on 2026-08-14, built
> an (A)/(B) fork on top of it, and wrote a retirement ordering into this section that had to be struck the
> same day. **If you find yourself planning to move a chain's points to an edge, you have made this error.**
>
> ⭐⭐ **WHY PRIMITIVE BEATS DERIVED, AND IT IS THE WHOLE POINT: A DERIVATION HAS A MOMENT WHERE THE COUNT
> CHANGES, AND THAT MOMENT IS A CASE BOUNDARY.** Nothing decides *"here it becomes divided"*, so there is
> nothing to interpolate across and **no seam for a discontinuity to appear at.** Divergence and
> convergence are just the two chains' geometry. ⇒ **"divided" is not a special case and never was one.**
> ⛔ **The break the operator sees at a divided↔undivided transition is therefore UNCONSTRUCTIBLE under
> this model** — it exists today only because a chain ends there and the band is an area stroked from a
> line that has an end (`A10`'s ruling: *"ends exist only because we make areas out of lines that have
> ends"*). ⛔ **Do not patch that break. Any suppression is a patch on the symptom** — the same class as
> `innerSign`, `innerEdgeMeasure`, the mouth-wrap snap and the walk-ordinal coupler.
>
> ⛔ **AUTHORING DOES NOT CHANGE.** The operator authors the STREET, street-keyed (`A15`) — two chains
> underneath does not mean two handles on top ⇒ **zero `blockCustoms` migration.**
>
> ### Why this is not a third option — it is the ANSWER to punch-out's blocking risk
> `_handoffs/HANDOFF-deadend-face-resolution.md §4.1` risk 1 is what kept punch-out unshipped: *"a boolean
> gives you RINGS, not which chain and which side bounds this edge… ⛔ this is exactly where identity can
> quietly become re-derived-from-geometry again."* **Walking side-chains eliminates that risk rather than
> mitigating it:** every ring edge is owned by one `(skelId, side)` **by construction**, so identity is
> never lost and never has to be recovered. That is `§C6`'s own 2026-07-30 ruling — *"build the compound
> path from STAMPED strokes… identity must be carried THROUGH the boolean, never recovered from ring
> geometry afterward"* — finally given a mechanism. ⇒ **The `PIPELINE step 3a (what a block is)` "figure-ground is dead"
> contradiction dissolves:** the objection to figure-ground was that streets-subtracted loses identity.
> This does not.
>
> ### ⭐⭐⭐ RULED 2026-09-04 (Jacob) — THE GROUT IS A **POSITIVE OBJECT**, AND WE OFFSET FROM **IT**, NOT THE CHAINS.
> > *"In Illustrator we'd select the whole network of paths, give them a very small stroke, expand
> > appearance, and then pathfinder — **to the grout itself**, first."* · *"**We offset from the grout, not
> > the chains.**"*
>
> **The grout is a first-class COMPOUND PATH — stroke every chain at a very small width, unite, and the
> blocks are its HOLES.** ⛔ Not the negative space between painted tiles, which is what *"the centerlines
> are the grout"* has meant in the code since `PIPELINE step 3a (what a block is)`.
>
> #### ⭐⭐ ε IS A DECLARATION, NOT A TOLERANCE — and that is its entire content.
> A zero-width grout and an ε-width grout **render identically and are mathematically different objects.**
> Zero is an **ABSENCE**; ε is a **PRESENCE** with an interior, two sides, and **TWO nodes at every mouth**.
> ⛔ **The value of ε carries no information; its NON-ZERO-NESS is the whole of it** — so it is not a fudge,
> not a clamp, and not the forbidden cleanup shape. It asserts that the object exists.
> ⭐ The rim doctrine one level in — **the grout is an object, never an absence** (`ARCHITECTURE:170`).
> ⛔ And an absence that renders as a plausible presence is **Layer 0 q2 inside the geometry**, where there
> is no code fallback for a reader to spot.
> ⚠️ **THE ONE CONSTRAINT ON ε: it must exceed the integer floor of the stage that FREEZES it.** Clipper is
> integer-space and every converter rounds; prebake is the coarse one. Below the floor the object you
> asserted is silently rounded back into an absence **in the artifact**.
> ▶ `node checks/claims-zero-separation-offset.mjs` — floors read live from source, so they cannot go stale.
>
> #### ⭐⭐⭐ RULED 2026-09-05 (Jacob) — **SHARP. ROUNDING HAPPENS ONCE, DOWNSTREAM, WHERE IT ALREADY DOES.**
> > *"A protopolygon. The humunculus… it's .00001 symmetrical between nodes… That is **separate** from the
> > polygons of the curbs."* · *"Sharp, with curvature calculated for ADA like everything already is,
> > attached to override handles, also like everything already is. **I only said the humunculus was sharp
> > because we already do rounding and filleting at the other steps.**"*
>
> ### ⭐⭐⭐ RULED 2026-09-06 (Jacob) — ① IS MINTED FROM THE **SIMPLIFIED SKELETON**, NOT THE DERIVED CHAINS.
> > *"The protopoly is a simplified shape with no rounding!!!"* · *"Blocks are, for the most part,
> > quadrilateral and even when 'extreme' they're predictable."* · *"We're building these elaborate
> > scaffolds around these tiny edge cases."*
>
> ⛔ **`mintProtopolygon` was being handed `ribbons.json`'s streets — the post-`CURVE_FIT` densified
> trace — at BOTH call sites**, and `derive.js` said so in a comment: *"whether ① SHOULD take the
> corrected chains is a real question and it is NOT settled here."* It is settled. Same curves,
> **8.5× the points** (1,123 skeleton → 9,547 ribbons), and ① inherited every one.
> | ① minted from | blocks | median verts | p90 | max | >20 |
> |---|---|---|---|---|---|
> | ribbons *(was)* | 155 | 10 | 286 | 705 | 65 |
> | skeleton *(is)* | 145 | 6 | 25 | 55 | 18 |
> ⭐⭐ **Excluding grade-separated chains it lands on 102 blocks against the map's 101 tiles — ① from
> the skeleton REPRODUCES THE BLOCK COUNT.** The dense form invented ~54 phantom blocks; those are the
> *"homeless holes"* `claims-proto-tiles-vs-faces` fails on, which a prior session chased as a topology
> defect. ⛔ **Nothing about the shape is lost — only density.** Smoothness is SKELETON's and is already
> in those points; rounding is Survey's and happens after ② is offset. ① does neither.
> ⭐⭐⭐ **THE LESSON IS BIGGER THAN THE FIX: every guard built for corner clusters, exploding fillet
> setbacks and self-intersections was coping with vertices that do not belong in ① at all.** Changing
> the INPUT cut "too tight" 338→90, overlap 122→46, self-intersection 6→4. ⛔ When a construction needs
> elaborate scaffolding on a map of quadrilateral blocks, **suspect the substrate, not the edge cases.**
> ⛔ **NO FALLBACK:** a missing or unjoinable skeleton now REFUSES to freeze ① rather than minting the
> dense one, which renders and cannot be seen to be wrong. ▶ `derive.js`, the `[①]` block.
>
> #### ⛔⛔ AND THE OTHER HALF OF THE COUNT: **A HOLE IN ① IS NOT NECESSARILY A BLOCK.**
> ① carries the **HIGHWAYS as ink** — ruled 2026-09-05 and right, *"the canon pulls them out of the
> BLOCK GRID, which says nothing about the DRAWING"* — so the union also encloses regions bounded by
> motorways and ramps, and **those are not city blocks.** LS: **145 holes; excluding grade-separated
> chains, 102 — against the map's 101 tiles.** That ~44 is the entire *"① has more blocks than the
> map"* discrepancy, and it is not a topology defect.
> ⭐⭐ **IT IS ALSO WHY ② DREW LONG THIN RUNS.** A highway carries an 8.53 m default half-width, so
> striking a curb on both sides of a 0.6–9 m gap between two ramps collapses it. 48 blocks had their
> curbs meet — and **47 of the 48 carry NO authoring anywhere**, so Layer 0 q3 was asked first and the
> answer was no: this is not the operator's widths showing through.
> ⭐ **The shipped curb path builds NO highway curb at all** (a highway is its own swept object, `H` — its section
> built from its lanes, `BRIEF-highway-build`), so emitting one invented a curb production never had and then scored it against a
> baseline that does not exist. `protoCurbGs` already computed the tag and used it only to LABEL the
> ring; it now excludes it. ⇒ **107 curb rings against 101 tiles**, and "too tight" 90 → 39.
> ⛔ **STILL OPEN:** 28 holes bounded by ORDINARY streets also have their curbs meet. Unexplained —
> they may be alleys or medians closing legitimately (*"if the curbs touch, there's no block"*) or
> they may not. ⛔ Cause not established. ▶ `node checks/claims-proto-thin-curb-runs.mjs <scene>`,
> which reports every thin run with its authored-vs-base width so the two can never be merged.
>
> ① the **protopolygon** — width-free, permanent, never seen, never authored: every chain expanded at ε,
> united into ONE closed path. ② the **curb polygons** — separate, offset FROM ①. ⛔ **Not one object at
> two moments** — that conflation put the wrong construction in `src/` (`4be5e5c1`).
> ⛔ **① IS SHARP** — ⭐⭐ **because SMOOTHING IS SKELETON AND ROUNDING IS SURVEY** (*"the skeleton is
> smooth but the corners are rounded by the survey"*). The smooth is already in the chain's points
> before ① exists; the rounding is Survey's. **① sits between the two stages and does NEITHER** — a
> STAGE FACT, not a principle about protopolygons.
> ⭐ The ease runs inside ②'s construction (`offsetRingByRects`), after the bands — still ONE rounding, Survey's.
> ### ⭐⭐⭐ ② IS ① MINUS ITS DEPTH BANDS, THEN THE EASE — built 2026-09-25 (`offsetRingByRects`)
> The ease must never see a reversal vertex: `R·tan(θ/2)` diverges as θ→180° — the miter apex's `hw/sin(θ/2)`
> at a second site. ⭐ **By construction, not by a bound:** ② is the block minus each edge's depth band, so where
> bands overlap the curb is simply gone and no reversal is left to ease; each ② edge names the ① edge it lies on,
> and a corner eases through its ① vertex. ⛔ Easing ① before offsetting (at R + the half-width) was built and
> reverted — its setback folds any leg shorter than it. The offset→union→ease construction this replaced, and its
> measurements: `_archive/RIBBONS-offset-union-ease-2026-09-25.md`. ▶ `claims-marked-corners` ·
> `claims-proto-corner-is-authored-radius` · `claims-the-curb-never-enters-the-road`.
> ### ⭐⭐⭐ AND THE CORNERS WERE NOT SKIPPED — THEY WERE DRAWN AT A QUARTER OF THEIR RADIUS (2026-09-06)
> *Jacob, marking a fresh set: "sharp corners which look to be skipped altogether."* ⛔ **They were
> being planned, stamped at the authored 4.50 m, and DRAWN at 0.9–1.9 m** — which reads as sharp.
> **A majority of his marked corners were achieving well under their stamped radius** —
> ▶ `node checks/claims-proto-corner-is-authored-radius.mjs` measures the achieved-vs-authored split.
> ⭐⭐ **THE CAUSE: `easeContour` did not carry `filletRing`'s `FILLET_TURN_TOL`** — it planned a corner
> at every vertex wanting a radius, including curve samples, and those truncated the real corners' legs.
> ⛔ Not a new threshold: the constant already existed, at the other constructor, ruled. **`FILLET_TURN_TOL`
> now has three readers and is still one rule** (`filletRing` · `easeContour` · the corner test below).
> ⚠️⚠️ **AND THIS IS WHY THE RADIUS GATE STAYED GREEN THROUGH ALL OF IT — the live lesson, and the
> reason the narrative above is retired rather than kept:** the gate read the **stamped** `r`, which said
> 4.50 m the whole time. ⛔ **An instrument that reads the INTENTION cannot see the ACHIEVEMENT** — check
> an authored feature by DIMENSION on the drawn geometry (fit a circle to the arc), never by the value it
> was asked for. ▶ `node checks/claims-proto-corner-is-authored-radius.mjs`
> ⭐ Also closed the same day: **a cap apex is where ONE chain's two sides meet** — the cap branch fired
> on "either edge belongs to a tip", so in-disc street corners next to a dead end took the cap rule and a
> blunt default returned R = 0. Same `skelId` both sides is the apex.
> *(Mechanism, figures and the false "the owner changing is a corner" restatement: retired to
> `_archive/RIBBONS-corner-radius-collapse-2026-09-07.md`. ⛔ That phrase is superseded — see the
> corrected corner test in this §.)*
>
> ### ⛔⛔ AND IT SURFACED A SILENT ABSENCE THAT PREDATES IT: **66 blocks were already being dropped.**
> `if (!mine.length) continue` — a block whose curb came back empty was skipped **with no count**,
> the same shape as `litmus-curb-parallel`'s `if (!tile?.iA?.length) continue` that `POLYGON-FIRST §5`
> RULE 2 names as a fallback inside an instrument. **66 before this change, 67 after, ~348,000 m² of ①
> block area** — now `console.warn`ed per pour. ⛔ **The drop is correct; the silence was the defect.**
> ⚠️ **And the harness was hiding it: `scratch/_proto-feed.mjs` MUZZLES `console.log` during the build**,
> so every `console.log` disclosure is invisible to every probe that uses the feed. **Disclosures must be
> `console.warn`.**
> ⇒ **the offset does NOT round "naturally"**: an arc of radius = the offset distance (Illustrator's
> behaviour) is a third, unauthored place to round — the second mechanism this § already retires.
> Curvature stays where it is computed today, **for ADA, off the override handles**: nothing new is built,
> the dial is unchanged, **R=0 stays reachable**. ⭐ **Expand each segment to its own rectangle and
> unite** — no join style to choose, no miter limit to clamp. ⚠️ **The union must be WATERTIGHT at the joins** (Plumb, measured 2026-09-25): literal per-segment rectangles leave mm hairlines on the Clipper grid, and blocks leak and merge (huron 238→108). Quads that share each vertex's offset are watertight, and they are what the per-chain mint already builds (LS 336/283 blocks, identical). So today's mint IS this construction. ▶ Eye-gate: Benton's joint, one 53° corner.
>
> #### ⭐⭐⭐ WE OFFSET FROM THE GROUT. The corners, the caps and the mouths FALL OUT.
> ⛔ **`iA = chain ⊕ pavementHW` offsets from the CHAINS, and that is what this replaces.** Offset the
> grout's contour instead: a **corner** is a join in one contour, a **cap** is where the contour turns
> around, a **mouth** is two vertices because the object has width. **None of the three is constructed.**
> ⭐ ② offsets the grout's contour with `offsetRingByRects` (per-edge depth, a `[start,end]` ramp allowed). **`cornerAt`
> and `capAt` RETIRE on this path:** a grout contour already *is* its corners and caps.
> ⭐ Winding is free: the contour dilates and every hole erodes from the same call, and the directed
> side-chains supply the winding by construction.
> ⭐ **A cap is a COUPLER WITH TANGENT HANDLES, not a shape** (Jacob) — blunt = handles broken to 90°;
> round = handles continuing unbroken along the chain, symmetrically, bent back to the pair node. That is
> the existing curve primitive (`{type:'bezier',c1,c2}`, `derive.js:40`) used at the tip, and it dissolves
> the `roundTips`/`bluntTips` case split — 19 sites in `tileGround.js`, frozen into `shape.json` (`:4738`).
> ### ⭐⭐⭐ RULED BY MEASUREMENT 2026-09-06 — **THERE ARE 2 APEXES. THE HALF-TURN QUESTION NEVER AROSE.**
> > *"There are 2 apexes."* (Jacob.)
>
> **A tip is TWO ordinary corner vertices, not one node turning 180°** — ① butt-ends, so its left and
> right boundaries each stand ε off the centreline and the two vertices sit 2ε apart, each turning about
> a right angle. ▶ `node checks/claims-proto-tip-has-two-apexes.mjs`
> *(The half-turn framing this replaced — "a single cubic cannot hold a half-turn, so the coupler is two
> segments" — is retired to `_archive/RIBBONS-corner-radius-collapse-2026-09-07.md`. ⛔ Quoting a retired
> framing beside its correction is the anti-pattern `CLAUDE.md` names: the false sentence is shorter and
> gets read first.)*
> ⇒ **A cap is two ORDINARY corner nodes.** Nothing turns a half-turn, so no cubic is asked to.
> - **blunt = both apexes at R=0** (zero-length handles) · **round = both eased.** One dial, no case split.
> - ⭐ **`bbf4adf6`'s bulb is not an APPROXIMATION of anything** — it is what two full 90° eases produce.
> - ⭐⭐ **THIS IS WHAT UNBLOCKS THE HANDLES**, and it is §1's own prediction arriving: *"cap style, corner
>   radius and fillet stop being three things."* Caps needed no separate mechanism; the caveat above was
>   the last reason to think they did.
> ### ⛔⛔ A CORNER PASS (`easeRing`) WAS BUILT AND EXCISED, 2026-09-05 — and the corner is now built
> the OTHER way, at the node. ⭐ The one live sentence: **a corner constructor grows guards — a
> setback that diverges, a budget to stop it, a threshold the budget needs, a cluster-collapse to fix
> the threshold — and each fix aims at the previous fix. That pattern is the signal to stop.** The
> cure is the node's own handle configuration (below): no threshold, no budget, no decline, no revert.
> Full history: `_archive/RIBBONS-s1-retired-detail-2026-09-06.md §A`.
> ⭐ **THE WIDTH STEP AT A BLOCK BOUNDARY — RULED 2026-09-24 (Jacob): *"taper".*** Two adjacent grout edges
> carrying different `pavementHW` meet by a TAPER, not a step and not a miter carried to the lines' meeting
> (that needed the forbidden fold-spur cleanup). Rate = `f-caltrans-terminal-widening-taper` (10:1), `[U]` for a
> same-street width change; built with the `[start,end]` `depthAt` ramp in ②'s working copy (Plumb, `BRIEF-junction-shape-where-the-offset-crosses`).
> **Built** (`taperWorkingCopy`): the WIDER block gives way from the boundary; a leg shorter than its taper takes the
> whole leg, steeper, named per pour (Jacob: option A). A width step = a width change with no corner (same road, or a
> turn under `FILLET_TURN_TOL` even where the street changes — ruled by Jacob 2026-09-25); ⛔ a dead-end cap (one
> chain's two sides) is not one.
> ⚠️ **Cause not established for the offset's fold class under the new subject.** `POLYGON-FIRST D6a` marks
> the offset NOT robust (the averaged-normal branch; `scratch/fold-branch-forensic.mjs`). Dilating a grout
> fails by a narrow block **vanishing** — loud — rather than by a fold; **hypothesis, unmeasured.**
> ⚠️ **OPEN, not decided:** whether the grout is ONE compound path at neighbourhood scale, or one per
> connected component.
>
> #### ⭐⭐ AND THE ASYMMETRIC CASE DOES NOT EXIST — the grout has no sides.
> > *"There is NO asymmetrical case for the CHAIN ITSELF, for the GROUT ITSELF."*
>
> `bbf4adf6` already rules that the chain is not the road's centreline and that asymmetric `pavementHW` is
> what an off-centre trace looks like — but it applies that **only at the tip**. Applied to the whole chain
> (recentre by `(hwR−hwL)/2`, stroke at `hwL+hwR`), asymmetry stops existing and what remains is **VARIABLE
> WIDTH ALONG A STREET, WHICH IS AUTHORING.** ⛔ Two "cases" collapse into one authored parameter.
> ▶ `node checks/claims-recentre-removes-asymmetry.mjs` — ⛔ **town-dependent; re-run, never quote.** The
> direction holds on both safeguarded towns; the share does not.
>
> #### ⛔ AN OFFSET IS MEASURED FROM A LEG, NEVER FROM A CAP.
> A cap has **no authored value** — it is what falls out. Measuring one against an expected radius invents a
> specification and then reports deviations from the invention as findings; that is how a session's worth of
> cap "defects" was manufactured and struck (`fbf3fb84`). ⭐ **An AUTHORED feature is checked by DIMENSION; a
> DERIVED feature is checked by CONTINUITY.** ⛔ And a zero gap at a tip is the COLLAPSED-node signature, not
> a seamless join — `node scratch/coupler-slit-universal.mjs` prints `FACE=SLIT gap=0.000m` on every LS tip.
> ▶ `node checks/claims-spur-leg-offset.mjs` (leg offset, station-local, authoring-aware) ·
> `node checks/claims-deadend-notch-standoff.mjs` (the per-station ray-march form).
>
> #### ⭐⭐⭐ AND THE NODES BECOME BEZIER **INTENTIONS** — a blunt cap TURNS, a rounded cap EASES.
> > *"The nodes become bezier 'intentions' where a blunt cap turns and a rounded cap eases."* (Jacob, the
> > closing generalisation.)
>
> **A node is not a corner, a cap or a junction — it is a HANDLE CONFIGURATION.** Broken handles **turn**;
> continuous handles **ease**. ⇒ cap style, corner radius and fillet stop being three things. **R = 0 is
> zero-length handles**, so the operator's dial survives unchanged — NACTO-class seed × per-IX × per-corner,
> and R=0 stays authorable (`project_corner_radius_is_design_control`).
> ⭐ The node is then the carrier of the authoring, which is *the polygon must ask the stamp* at the one
> place the geometry actually bends (`A15`).
>
> ⭐⭐ **THIS RETIRES THE SECOND ROUNDING MECHANISM — AND WITH IT THE CLAMP §1 CALLS *THE* ARTIFACT.**
> Today the intention lives OUTSIDE the geometry, so the construction rounds once (`filletRing`) and must
> then be told not to round again (INVARIANT 2: `jtMiter`, never `jtRound`). With the intention **in the
> node** there is nothing to second-guess:
> - **`filletRing` / `filletRings` retire** — ✅ on the ① path: ② rounds at the node and the artifact
>   carries the achieved arcs as `fillets`, so nothing rounds twice. Still live on the legacy path.
> - **The `jtMiter`-vs-`jtRound` doctrine retires** — no second mechanism left to guard against.
> - **`bandJoin` retires** — ⚠️ NOT retired in fact: the ① tile carries `bandJoin:'miter'`, because the
>   consumer reads it. It is now a CONSTANT, not a per-tile case decision, which is the substance of
>   the retirement; the field survives as plumbing.
> - **The miter-limit bevel retires** (`:67`, `miterLimit 2`). It fires because two offset lines struck from a
>   SHARP vertex meet far away; an eased vertex has no such intersection. ⭐ **§3.3's U-seam measurement IS
>   this clamp firing** — it substitutes a bevel and the frozen curb swings metres off a line that should be
>   parallel. That is the worked example §1 names as *the* artifact, and it is a direct casualty.
> ⚠️ **The one caveat, and it is the curve handoff's own top risk:** the offset of a cubic is only
> APPROXIMATELY a cubic, and it degrades where depth approaches the fit radius — the tight turning circles.
> **Not measured under the grout subject.**
>
> #### ▶ STATE OF THE BUILD — ①②③ is the PRODUCER for Survey and Section (`protoProducer` +
> `protoArtifact`). The 2026-09-04 grout gates that asked whether it could be built at all are
> retired to `_archive/RIBBONS-s1-retired-detail-2026-09-06.md §B`; two rules from them stay live:
> ⛔ never copy GATE A's `jtRound`+`etOpenRound` stroke into ① (it ROUNDS; ① is sharp by ruling), and
> ⭐ offsetting a CONTOUR does not reproduce the fold class — a narrow block VANISHES instead, which
> is loud and countable.
> - ### ⛔⛔⛔ HOW ① IS LOOKED AT — **THE EXPANDED PATH IS THE WHOLE POINT** (Jacob, 2026-09-06)
>   ① is defined as *"**Expand appearance**, then **Pathfinder > JOIN**"*. **The EXPANSION is the
>   mechanism**; ε only makes the width nominal. So the readable object is the **expanded** ① —
>   the joins, the corners and the holes are the entire content, and any view that hides them is
>   not showing ①. ▶ `node scratch/draw-protopolygon.mjs [scene] [--at x,z] [--span m] --expand <m>`
>   - ⛔⛔ **A STROKE IS NOT AN EXPANSION, AND SUBSTITUTING ONE IS A NEW DEFECT CLASS WE INVENTED
>     TODAY.** Stroking the ring paints a band centred ON the outline and leaves every hole **the
>     same size**; expanding offsets the compound path so the ink grows and **every hole shrinks by
>     the same amount**. Only the second has trustworthy topology. Use `ClipperOffset` +
>     `jtMiter`/`etClosedPolygon` — ⛔ never `jtRound`; ① has sharp corners **by ruling**, and an
>     expansion may not invent round ones (the same trap `GATE A` above already warns about).
>   - ⛔ **AND A STROKE WIDTH IS NOT A WIDTH.** The first harness drew ① with a 1.5 px stroke
>     converted to WORLD units — **1.74 m at scene scale, 350× wider than ① itself** — so every
>     visible band was the stroke and ① was the hairline inside it. Jacob: *"This is a FAILED
>     protopolygon. I am looking at FUCKING paths with thicknesses."* ⭐ **The instrument was the
>     liar, not the geometry** — the same shape of error as the SVG that emitted each ring as its
>     own filled path and turned a 0.381 m curb into a filled block.
>   - ⛔ **An expanded ① is a DIFFERENT OBJECT from ①** and must say so — the harness stamps
>     `EXPANDED <m> m — NOT the ink width` into the SVG itself, not just the console. **Never
>     expand silently**; a legible picture that does not name its own distortion is how the
>     distortion gets quoted as a measurement.
>   ### ⭐⭐⭐ ① IS THE PRODUCER, AND IT IS ON — 2026-09-06. `protoProducer` + `protoArtifact`.
>   ⛔ **A change of CONSUMER, not of construction** — the distinction `5560cf6a` turns on. ②③ already
>   offset the grout contour; the artifact freezes what they made. No geometry was written to land it.
>   **The tile carries `bands` AND `runs` AND `SECTION §4`'s freeze list** (`ring · iA · vertR ·
>   fillets · runs`, each run with its `baseMeasure`). ⚠️ Two earlier claims here are STRUCK:
>   *"the tile carries BANDS, not `runs`"* — `§4` freezes run identity by ruling, and `§3.2` calls it
>   design intent, not chain geometry; and *"OFF BY DEFAULT, proven twice"* — both flags are ON in the
>   Designer, so **`a03-curb-identity` no longer guards this path** and the byte-identity proof covers
>   only the legacy build.
>   ⛔ Shipping `bands` freezes the FILL, which `SECTION §4` names as the Phase-D over-reach. Open
>   there, with the measurement and the one-line flip.
>   ### ⭐⭐⭐ AND THE AXIS IS **CHAINS vs ①**, NOT "FROZEN vs LIVE" — corrected 2026-09-06 (Jacob)
>   > *"It may be mechanically impossible to not use the chains, but the EFFECT needs to be we work
>   > from the simplified protopolygon."*
>
>   `sectionFrozen = !surveyActive`, so with the Survey tool selected the Designer does not read
>   `shape.json` — it live-builds. ⛔ **That is NOT a reason Survey must draw the chain curb, and
>   stating it as one is a defect dressed as a constraint.** ① is frozen into `ribbons.json`, which the
>   live build ALREADY LOADS, so **the live build can build from ①** without touching the frozen-shape
>   boundary at all. `opts.protoProducer` does exactly that, and the console proves the source:
>   `[tileGround][①] source: frozen`.
>   ⇒ **The requirement is that the SHAPE comes from ① everywhere** — frozen or live, Survey or
>   Section. Where the code happens to touch a chain to get there is secondary; what may not happen is
>   a curb whose shape is a traced chain.
>   ### ⭐⭐⭐ SURVEY **AND** SECTION ARE ON ① — LANDED 2026-09-06. `protoProducer` + `protoArtifact`.
>   ⛔⛔ **SWAPPING THE `curb` SLOT ALONE WAS NOT A HALF-STEP, IT WAS A WRONG STEP.** It painted one
>   ①-built line on top of a chain-built map and the two did not agree — and the slot holds a **BAND**,
>   not a ring, so handing it ② (the block's inner polygon) filled every block solid: **2,125,205 m²
>   against the legacy curb's 25,202 m².**
>   ⭐⭐ **THE CONSUMER ALREADY EXISTED.** `sectionOpen` consumes a tile that CARRIES ITS BANDS as-is
>   (`if (st.bands)`) and unions them into asphalt / curb / sidewalk / treelawn / LU / block; ③ produces
>   exactly that tile. ⇒ **`protoProducer` now runs `sectionOpen(protoShapeTiles, …)` and takes every
>   layer from it** — a change of CONSUMER, not of construction, with no per-layer reimplementation.
>   ⛔ `highway` is deliberately NOT swapped: a grade-separated road is its own swept object (`H`, `BRIEF-highway-build`)
>   and ② builds no highway curb, so swapping it would invent a production never had.
>   ▶ `node checks/claims-survey-and-section-agree.mjs` — LS: 118 tiles, all `producer:'proto'`,
>   all carrying bands; **asphalt, curb, sidewalk and block agree to 0 m²** and the LU class sets are
>   identical. That gate is the definition of "the same thing".
>
>   ### ⭐⭐⭐ AND THIS IS WHAT REMOVES THE RIM ARTIFACT — MEASURED, not argued
>   The bending at the map edge was never ①'s. Vertices within 5 cm of the boundary arc:
>   **① block faces have none** — they run PAST the rim, as ruled — while **the legacy D2 walk closes
>   its faces AGAINST the disc, a substantial share on the arc**, and `filletRing` then ROUNDS the corner the
>   circle made. ⇒ *"why are the sidewalks trying to bend and create corners at the edge of the
>   stencil?"* is the TILE WORLD, and the cure is to stop consuming it — not a rim patch.
>   ▶ `node checks/claims-ped-does-not-follow-the-rim.mjs` — ped boundary lying ON the arc:
>   **legacy 0 m** (its ribbon wraps the rounded corner and never reaches the edge) · **① 190 m of
>   sidewalk, longest unbroken run 6.6 m** — chords no longer than the band is wide, i.e. a CUT.
>
>   ### ⛔⛔ THE ONE THING ① LOSES, AND IT IS DISCLOSED PER POUR: **THERE IS NO `median` CLASS.**
>   ③ carries no median or loop concept (`LOOP-STREETS §2/§4`); the legacy carve exists largely FOR
>   those. LS: **20,362 m² of `median` land use → 0.** ⭐ A land-use key nothing consumes *"drops
>   silently from the slab — that is exactly how the divided median vanished"*; it is not vanishing
>   silently twice, so the producer swap WARNS by name when no `median` class comes out. **KNOWN GAP
>   in ③ — not a fallback, not a fix.**
>   ⚠️ **AND ONE NUMBER GOT WORSE.** `claims-proto-stack-disjoint`: overlapping stations **3341 → 1900**
>   (`curb&lu` **3006 → 285**, the ghost block going away) but **`treelawn&sidewalk` 92 → 1548**, now the
>   dominant class. ⛔ **Cause not established.** Isolated to the SUBSTRATE, not to ③: the committed ③
>   run against the new ① reproduces 1900/1548 exactly, and emitting bands per-part instead of pooled
>   changes nothing.
>   ⚠️ **COST, measured, not a guess:** the live full-map rebuild goes ~0.85 s → ~1.39 s, because ③ runs
>   under `grout:'proto'` whether or not anything consumes it. `SURVEY §4.1` already names the full-map
>   redraw as why the tools feel sticky; this adds to it.
>   ### ⭐⭐⭐ THE SMOOTHNESS LIVES IN THE **CURVE PRIMITIVE**, NOT IN THE POINTS — 2026-09-06
>   > *"The protopoly isn't smooth at all, anywhere."* (Jacob, on the render.)
>
>   ⛔⛔ **A SKELETON STREET'S `points` IS THE CONTROL POLYGON.** The curves are in `segments`
>   (`{type:'bezier',c1,c2}`), and both ① and the drawn centreline were reading the ANCHORS ALONE.
>   ▶ `node -e "const s=require('./cartograph/data/lafayette-square/clean/skeleton.json').streets;const w=s.filter(x=>x.segments&&x.segments.length);console.log(w.reduce((a,c)=>a+c.segments.filter(g=>g.type==='bezier').length,0),'bezier segments on',w.length,'of',s.length,'chains')"`
>   — so every curve was minted as a straight chord, throwing away a real sagitta on every one of them.
>   ⭐⭐ **THAT 20.80 m IS THE FIGURE THIS SECTION USED TO RECORD AS "the drawn centreline vs ①".**
>   It was never two lines diverging — it is **the discarded curve**, and converging them to 0.00 m
>   did not fix the divergence: **it deleted the curve from both sides.** *(The old block, with its
>   median 1.00 m / p90 7.50 m / 4,781-of-9,547 figures and its re-key warning, is excised — the
>   re-key it warned about is measured below and is nil.)*
>   ▶ `derive.js` `tessellateAdaptive` — de Casteljau subdivision to an ARC TOLERANCE (0.10 m), one
>   map feeding BOTH consumers (① and the emitted centreline), because a half-migrated source is
>   worse than none. **1,978 anchors → 3,086 points**; the old densified `CURVE_FIT` trace was 9,547.
>   ⛔ **THIS DOES NOT REOPEN THE DENSITY RULING.** `CURVE_FIT` densified *everything*, straight runs
>   included — that is what put 705 vertices on an 8-vertex block. An arc tolerance spends points
>   only where there is curvature: a straight street keeps its two anchors.
>   ⭐ **NOTHING IS SMOOTHED AND THE CHAIN DOES NOT MOVE** — measured: **no anchors absent**,
>   only points added between them, and every emitted point lies on the chain's own primitive at
>   **max 0.000737 m**. A change of SAMPLING, not of shape.
>   ⭐ **AND IT COSTS NO AUTHORING** — `segOrd` is an ordinal over the IX partition, the IX vertices
>   ARE anchors, and anchors all survive: **0 orphaned, 0 re-pointed of 88 slots.**
>   ▶ `node checks/claims-simplify-preserves-authoring.mjs <scene>`
>   ⭐ **The editor is untouched:** `SurveyorOverlay.controlVertices()` draws nodes off `segments`,
>   never off `points` — the architecture already separated the chain's NODES from its SAMPLING.
>
>   ### ⭐⭐⭐ THE CORNER: THE NODE IS A HANDLE CONFIGURATION — the ruled cure, BUILT 2026-09-06
>   `easeContour` (`tileGround.js`). Broken handles **turn**, continuous handles **ease**, and
>   **R = 0 leaves the contour byte-identical** — by construction, not by a branch.
>   ⛔⛔ **IT IS NOT `easeRing`, AND THE DIFFERENCE IS THE WHOLE POINT.** That pass was a corner
>   CONSTRUCTOR: an invented ~7° threshold, a budget against neighbouring corners, a decline when it
>   did not fit, a revert on self-intersection, a cluster-collapse to fix the budget. Here there is
>   **no threshold, no budget, no decline, no revert**; an R too big for its leg renders as what it
>   is (`§6.9.5`). The one bound is TOPOLOGICAL — a tangent point may not pass its leg's midpoint,
>   because past that the leg belongs to the next corner.
>   ### ⭐⭐⭐ THE CORNER TEST, IN ITS CORRECTED FORM — **THE SHAPE ANSWERS *WHETHER*, THE LABEL ANSWERS *WHOSE*.**
>   > *(Jacob, 2026-09-07, on the ADA pad eating a whole block: "Are you **positive** you are working
>   > from and only from the protopolygon? **The protopolygon doesn't have a node/corner there in the
>   > first place.**")*
>   **A corner is a vertex where ① TURNS — and that is the whole test.** ⛔ It read *"…**and** the
>   owner changes. Both, and for different reasons"* until 2026-09-08. **RETIRED, and excised rather
>   than bannered** (a false sentence is shorter than its correction and gets read first): the owner
>   is a chain identity, and see the retirement block below for what it cost.
>   ⛔ This section used to read *"the corner is found by carried identity: the OWNER CHANGING along
>   the ring… so no angle test"* — and that sentence, taken at its word, put a chain label in charge
>   of a question about a shape. It is **excised**, not bannered: an owner is `protoOwners[].skelId`
>   with the chain ordinal stripped, so *"the owner changed"* is chain world (the amendment below
>   already says so; what was missing was the positive rule to put in its place).
>   ⭐ **Where ① does not turn there is NO CORNER, whatever the labels say** — the contour runs
>   straight through, exactly as `① HAS NO NODES` states. ▶ measure it on ①'s own sharp ring, never
>   on ②: `node checks/claims-a-corner-is-where-one-turns.mjs <scene>`.
>   ### ⛔⛔⛔ THE CONJUNCTION IS RETIRED, 2026-09-08 — **"THE PROTOPOLYGON DOES NOT INCLUDE NODES."** *(Jacob)*
>   This read *"AND NOT THE TURN ALONE — a street that BENDS mid-block turns with no **intersection**
>   there."* ⛔ **That is a CHAIN-WORLD sentence.** An intersection is a graph concept; ① has no
>   nodes and no intersections, only a contour that turns. The worry imported a chain concern into
>   a shape and then let it veto the shape. **Excised, not bannered.**
>   ⛔ **AND ITS SAFETY ARGUMENT WAS BACKWARDS FOR A KIT.** *"It can only remove a corner, never
>   invent one, which is what makes it safe on a town nobody has inspected"* is blind to false
>   NEGATIVES — and a removed corner is a **MISSING ADA RAMP** on precisely that town. ⭐ **A
>   one-sided safety argument is not a safety argument; name the error it CANNOT catch.**
>   ▶ MEASURED at removal: of the arcs the ease actually made, the label refused **LS 580 of 1058
>   (54.8%) · HPDM 3035 of 6350 (47.8%)**, and the refused arcs carried the **same median turn as
>   the licensed ones, 90°** — square street corners, vetoed by a chain label. The operator found
>   two of them by eye in places every gate called green, and neither could respond to authoring
>   because there was nothing there to respond.
>   ⇒ **THE EASE IS THE CORNER TEST.** Where the contour turns past `FILLET_TURN_TOL` the ease made
>   an arc, and that arc IS the corner. The owner still answers **WHOSE**; it may not answer
>   **WHETHER**. ▶ `node checks/claims-the-ease-is-the-corner.mjs <scene>` — ⛔ re-run it; it keeps
>   its teeth after the fix (a residual arc with no ramp is still reported, with its turn).
>   ### ⛔⛔ AND READ IT OFF THE EASE'S OWN PER-VERTEX STAMP (`EC.arc`), NEVER OFF `protoTurns`
>   `protoTurns` holds **LABELS** (`protoTurns.add(L[q])`), and a label spans a whole ① edge — so
>   `protoTurns.has(labs[i])` marks **every ② vertex on that frontage** once its owner turns
>   anywhere. `end()` reads `iaCorner` to end a leg, so each one inserts a ramp **mid-block**:
>   LS went to **10,606 marked vertices of 14,651 (72.4%, from 3.6%)** — measured when `protoTurns`
>   was read for the mark; that read is RETIRED (`protoTurns` is computed and discarded, `void
>   protoTurns` in `tileGround.js`), so no command reproduces this figure — and the eye caught sawtooth
>   notches down straight streets — *"weird geometry everywhere; looks like contour nodes."*
>   ⭐⭐ **THE LESSON, AND IT GENERALISES PAST CORNERS: the owner-change half was doing TWO jobs —
>   wrongly answering WHETHER, and necessarily supplying WHERE.** Deleting a term that carries a
>   second, unnamed job deletes that job too, and the gates stayed green because none of them
>   measured locality. **Name every job a term is doing before removing it.**
>   ⇒ `iaCorner[i] = EC.arc[i] != null` — the ease stamped the locality at the moment it made the
>   arc. ▶ 0 vertices marked outside an arc, both towns; 100% of arcs carry a ramp.
>   ⛔ **The turn tolerance is `FILLET_TURN_TOL`, and it is not new** — `filletRing`'s ruled constant,
>   which `easeContour` already carries for the same reason (*"a near-straight vertex is a CURVE
>   SAMPLE, not a corner"*). A third READER of one rule, never a third rule.
>   ⭐ The blocks reading ZERO corners are still exactly the medians and loop interiors — one street,
>   so the owner never changes — and now also any face ① runs straight along.
>   ### ⛔⛔⛔ AMENDED 2026-09-07 (Jacob) — **THE CORNER IS ①'s, AND ① HAS NO NODES.**
>   > *"The ribbon is disrupted where nodes are, which means it's got nodes in there. Get Rid Of
>   > Them."* · *"Do you understand that the protopolygon doesn't have nodes?"* · *"That is a
>   > rectangle."* · *"Back to the protopolygon and not chains."*
>
>   Read as written, "the owner changing" is a **CHAIN** law, and the kit cuts one road into many
>   chains (LS: South 18th Street into **eleven**; a third of roads are multi-chain — ▶ `node -e "const s=require('./cartograph/data/lafayette-square/clean/skeleton.json').streets;const b={};for(const c of s)(b[c.name]=b[c.name]||[]).push(c);const n=Object.keys(b);console.log(n.filter(k=>b[k].length>1).length,'of',n.length)"`). A chain cut and a
>   `segOrd` boundary are chain-world bookkeeping — **①'s contour runs straight through them and the
>   only thing that changes is the LABEL.** ⇒ Taken literally it puts the chain graph's nodes back
>   into the one construction built to have none, and the ribbon is disrupted at every junction.
>   ⛔ **`hard` IS A CHAIN ARTIFACT AT A CUT** — a cut leaves a chain ENDPOINT, whose handles are
>   broken by default. Widening the identity test alone fixes nothing: **36 spurious arcs before, 36
>   after.**
>   ### ⭐⭐⭐ AND THE CORNER MUST BE READ OFF ①, NOT OFF ②
>   **① IS SHARP** (this §, above: smoothing is SKELETON, rounding is SURVEY, ① does neither). ②
>   eases a 90° corner into a dozen vertices each turning a few degrees, so **a turn test on ②'s
>   contour finds no corners at all on a plain rectangle** while ①'s own hole for it turns four
>   right angles. ▶ `node checks/claims-marked-corners.mjs` — ⛔ re-run, never quote.
>   ⇒ **Reading the corner off ② is reading the ROUNDING, not the shape.** The producer stamps ①'s
>   corners onto ②'s contour by the label each vertex already carries (`iaCorner`) — identity carried
>   through the offset, never recovered from the eased geometry afterward. A corner ARC is **one**
>   boundary, not twelve.
>   ### ⭐⭐⭐ A QUANTITY CARRIED THROUGH A BOOLEAN MUST BE CARRIED AS THE THING IT IS — 2026-09-07
>   An edge label on a vertex stamp flipped every frontage's owner onto its neighbour (the operator's *"swap one
>   pair, it swaps all 4 sides"*). ⭐ **Today ② carries edges as edges:** each ② edge takes the ① edge it LIES ON,
>   by containment among its own block's bands, and a vertex is a corner only between two consecutive ① edges
>   (or at the one owner seam among ① edges its bands swallowed). ▶ `node checks/claims-stamp-follows-the-edge.mjs`.
>   The vertex-stamp machinery (`carryEdgeLabels`): `_archive/RIBBONS-offset-union-ease-2026-09-25.md`.
>   ### ⛔⛔ AND IT HAS A SECOND INSTANCE, WHICH COST A WHOLE BLOCK — **AN ARC'S EXTENT IS EDGES, NOT VERTICES** (2026-09-07)
>   **An arc running from vertex `a` to vertex `b` covers the EDGES between them — `len` of them,
>   not `len + 1`.** The corner's extent was stamped `k <= len`, so every corner also claimed **the
>   first edge of the next leg** — and on ①-derived geometry a straight frontage is **ONE EDGE**.
>   ⭐ The canary Jacob marked: a quadrilateral block, 4 fillets, `iaCorner` true at exactly 4
>   vertices, 54 contour vertices of which 50 are the four eased arcs and **four are the block's
>   sides**. Each arc took its 12 short edges *and* the long one after it ⇒ **458 m of 458 m painted
>   as ADA pad**, the treelawn erased off the whole block.
>   ⛔ **WHY IT SURVIVED, AND THIS IS THE PART TO CARRY:** on a DENSE contour the extra edge is a
>   millimetre and invisible. **① is SPARSE by ruling**, so the same off-by-one is a city block.
>   ⇒ **An arity error is not proportional to its unit; it is proportional to the SPACING of what it
>   indexes** — and every simplification we do makes the spacing coarser. ⚠️ Re-audit `<=` against
>   `<` on anything spanning ① by index whenever a construction moves onto sparser geometry.
>   ▶ `node checks/claims-the-pad-is-the-size-of-the-corner.mjs <scene>` — reports the pad's extent
>   BY LENGTH, reading the painter through `SECTION_DUMP=1` rather than restating its rule.
>   ⛔ **BY LENGTH, NEVER BY VERTEX COUNT.** ② eases one corner into ~12 vertices while a straight
>   leg needs 2, so counting contour EDGES inside a corner over-weights the arc several-fold — that
>   is how *"58.8% of contour edges sit inside a corner extent"* was read as *"a third of the map is
>   pad"*. The two are not the same claim and the second one is not measurable in that unit.
>   ▶ `node checks/claims-stamp-follows-the-edge.mjs <scene>` — the ORACLE is geometric (the inward
>   offset of ① edge E is parallel to E), so it can only be run where ① is **frozen**. ⛔ Re-run it.
>   ⚠️ **OWED:** the road/`hard` reasoning still resolves live because ①'s frozen owners carry only
>   `skelId`. **The mint is the one place a chain may be read**, so it belongs stamped INTO ①;
>   `mintProtopolygon` stamps it now but it reaches nothing until a re-pour.
>   ▶ `node checks/claims-a-swap-never-happens-mid-street.mjs` — ⛔ re-run, never quote.
>   *(This cited `claims-ped-resolves-per-leg.mjs`, which has never existed in the tree. A pointer that
>   does not resolve is worse than no pointer: it reads as evidence already gathered.)*
>   ⭐ **ROUNDING HAPPENS ONCE, AT THE NODE** — INVARIANT 2 — so ③ insets an already-curved contour
>   and its bands are concentric with the arc BY CONSTRUCTION: *"the corner is the band bent around
>   the curb arc, never a constructed primitive."*
>   ▶ `node checks/claims-proto-corner-is-authored-radius.mjs <scene>` — an AUTHORED feature is
>   checked by DIMENSION: achieved radius off the curb, **median 4.50 m = the class seed exactly.**
>   ⚠️ **OPEN:** the per-corner tier (`ixKey|legA|legB`) is not reachable from a contour vertex —
>   the leg `f/b` flag is a tile-edge fact — so a Look carrying per-corner overrides is **warned
>   about, never silently ignored**. LS carries none.
>
>   ### ⭐⭐⭐ AND THE CENTRELINE IS NOW INERT — `claims-proto-wall` B PASSES, 2026-09-06
>   > *"As long as the centerline is rendered completely inert and unreachable by the protopolygon."*
>
>   ② needs one thing from the centreline — where two chains meet, to key the authored radius — and
>   **the MINT freezes it**: `protopolygon.nodes`, an exact shared-vertex lookup per chain pair
>   (LS **682 nodes, 17 refused as ambiguous**). The mint is the one place reading a chain is
>   legitimate, because ① *is* the expanded chain.
>   ⭐ **`protoNodeOf` and its four maps were EXCISED** — dead since the ease was removed, and 2 of
>   the 3 reads keeping ②③ from being chain-free. **Dead code is excised, not archived.**
>   ▶ `node checks/claims-proto-wall.mjs <scene>` — **"no chain lookup outside the base table;
>   every downstream value comes off the stamp."** It was failing this before.
>
>   ### ⭐⭐⭐ ②'s ACCEPTANCE, IN THE OPERATOR'S WORDS — *"if the centerline is smooth, their offsets should match."*
>   ▶ `node checks/claims-proto-curb-is-parallel.mjs <scene>` — **101 of 101 blocks, max error 0.00 m.**
>   ⛔ **The "50 blocks are not parallel" finding was FIVE successive errors in that one probe** — bbox
>   assignment → centroid assignment → nearest-edge scoring → segment clamping → candidate selection.
>   The "~2.4 m constant" was `hw/sin(θ/2)`: a MITER APEX measured to a CLAMPED SEGMENT instead of the
>   edge's LINE. ⭐ Measure to the LINE; pick candidate edges by SEGMENT proximity (picking them by
>   line-distance lets a distant parallel edge match by coincidence — permissive, and it also reports
>   a clean pass regardless). ⭐ The canon had already warned about one of the five: the centroid rule is exactly what
>   this section's reconcile gate says "misfiles" a non-convex island. Reading it was not enough.
>
>   ### ⭐⭐⭐ RULED 2026-09-06 (Jacob) — THE PRODUCE/REFUSE SPLIT FOR ①'s TILE. **2 SUPPLIED, 9 REFUSED.**
>   A frozen tile carries **14 required + 6 optional** fields (derive both: `node -e` over
>   `shape.json`'s tiles, union AND the every-tile intersection — sampling `tiles[0]` gives 17 and is
>   wrong). ①'s tile supplies **3 of the 14**. The other eleven are not a to-do list.
>   ⭐⭐ **THE RULE THAT DECIDES THEM: does this field tell someone HOW TO BUILD, or WHAT A THING IS?**
>   `bands` is a **change of model**, not an addition — Section is handed the STROKE, not parameters to
>   stroke with. **A walk needs boundaries; an offset needs only a value per point.** `runs` exist so
>   each frontage can be stroked separately and the pieces joined; ③ never cuts the ring, so there is
>   no "where does this stop" question, only "what depth *here*" — answered per edge by the stamp ①
>   already carries (`protoMeasureOf(labs[i])`).
>   ⭐ **And that is why a seam is UNCONSTRUCTIBLE rather than merely unlikely:** a walk makes pieces
>   that must meet, and every join can seam; one ring offset inward has no joins. The seam test is not
>   a quality check — it tells you WHICH MODEL made the geometry.
>
>   | | field | why |
>   |---|---|---|
>   | **SUPPLY** | `runs` | **identity, not geometry** — which block was clicked, which authored slot a frontage owns, and (2026-09-06) **who owns a RIM edge**. The map must stay addressable. |
>   | **SUPPLY** | `lu` | *(Jacob)* **"LU is a gettable/knowable datapoint… stamp the LU into the initial ground map and later add overrides."** A fact about the world, stamped once — not a construction parameter. Styling/overrides are a later layer and are NOT scoped here. |
>   | **REFUSE** | `tl` `sw` `cap` `bandJoin` | inputs to a walk: how deep to stroke, how to join the pieces. No walk, no need. |
>   | **REFUSE** | `vertR` `fillets` | the fillet machinery §1 retires; R belongs in the node's handles. |
>   | **REFUSE** | `roundTips` `bluntTips` `roundTipKeys` | cap machinery — a contour already IS its caps. |
>
>   ⛔ **REFUSE MEANS THE CONSUMER STOPS READING IT, WHICH IS THE REAL WORK.** ⭐⭐⭐ **DONE FOR THE
>   CORNER, 2026-09-07.** It was never an excision list: the split is a SECOND painter,
>   `sectionPassProtoTile`, whose corner reads two carried facts (`iaCorner` — where · `iaArc` — how
>   far) and constructs NOTHING there. What went with it: the sector, the tangent trim, the bid, the
>   decline, the corner's own cross-section, and the additive quad that stitched two legs together.
>   ⛔ The FILL now reads **no** `fillets` and **no** `vertR`; they stay FROZEN because SURVEY's corner
>   handle rides them, which is the live half of the disagreement below.
>   ⚠️ **THE TABLE AND `SECTION §4`'s FREEZE LIST DISAGREE ON `vertR`/`fillets`, AND THE CODE SUPPLIES
>   BOTH.** ⛔ NOT settled here — a doc/code mismatch names a QUESTION (`CLAUDE.md`), and this one is
>   Jacob's: the FILL's refusal is now real, Survey's read is not the FILL's. **Open.**
>   ⛔ Every refusal is RECORDED WITH A REASON, never a silent absence — an absent field and a refused
>   field must not read the same to a consumer on a town nobody has inspected.
>   ⭐ **SUPPLY, added 2026-09-07: `iaArc`** — per contour vertex, which corner's eased arc it lies in.
>   **WHAT A THING IS, not how to build it**: the extent is a fact the ease produced and nothing
>   downstream can recover, because ② turns 90° into ~12 vertices of 7.5° and every one reads as a
>   curve sample. ⛔ It replaced matching the frozen fillets' TANGENT COORDINATES back onto the contour
>   through a 1 mm grid hash — `A15`'s forbidden proximity recovery, done across a boolean that is
>   allowed to move a point — and that failed **worst on the most authored town**, the kit's signature
>   blindness. ▶ `node checks/claims-the-corner-extent-is-carried.mjs <scene>` scores both.
>
>   ### ⛔⛔ AND THE EYE SAYS THE SHAPES ARE STILL WRONG (Jacob, 2026-09-06, on the ①-produced map)
>   > *"FIX THE CURBS. The polygons suck, these should be clean shapes."*
>   ⛔ **CAUSE NOT ESTABLISHED — and 101/101 parallelism does NOT contradict it.** A polygon can be
>   exactly parallel and still be an ugly shape: every vertex at the right distance says nothing about
>   stepped notches, slivers, or a lopsided cul-de-sac. ⚠️ The number invites the wrong conclusion,
>   which is why the distinction is written here.
>   ### ⭐⭐⭐ RULED 2026-09-06 (Jacob) — **THERE IS NO CONDITIONAL AT A CORNER.**
>   > *"I am highly suspicious of 'if' or 'when' statements; there is no 'when the corner' is anywhere
>   > — the corner is what it is, where it is, there's no conditional."*
>
>   The per-vertex offset carried four conditionals deciding what a vertex IS (cap · cap kind · corner or
>   through-node · miter too long); ② no longer uses it. ⚠️ **② (`offsetRingByRects`) has ONE, disclosed:** the
>   miter where the two curb lines meet INSIDE the corner, else the chord between the band ends — lines nearly
>   parallel meet far away, or never. The two coincide at the boundary, so nothing
>   jumps; at a highway-owned edge the miter always (H trims it). ⛔ **Not yet put to Jacob against this ruling.**
>   ⭐ **THE EYE: the shapes came out CLEAN** — sharp miters, no bevels, no stepped notches, blocks
>   reading as quadrilaterals. ⭐ And a SHAPE gate now exists alongside the distance one:
>   **median 7 vertices per curb ring** (a quadrilateral block's curb should be 4–8).
>   ⛔⛔ **AND THE PROCESS ERROR IS THE PART TO KEEP.** This change was made, then BACKED OUT on a weak
>   number — the parallelism gate moved 101/101 → 97/101 — and then re-made when the number was
>   interrogated: **a miter apex lies ON BOTH OFFSET LINES**, so it satisfies that test by
>   construction; the dip is the gate's block assignment shifting as rings change shape.
>   ⭐ A principled change dismissed on an uninterrogated number is the same error as adopting one.
>   ⚠️ `?proto=1` was built and EXCISED the same day: it drew ①/② over the live Survey view and ② was
>   not fit to look at. ⭐⭐ **THE RULE IT EARNED — do not eye-gate a construction that is not ready,
>   and never in the operator's own view.** Iterate in `scratch/draw-one-block.mjs` (`--street NAME`).
> - ### ⛔⛔ EVERY ②③ NUMBER TAKEN BEFORE 2026-09-06 WAS MEASURED WITH **AUTHORING OFF** — void, re-take it.
>   Seven of the eight `scratch/claims-proto-*` probes called `buildTileGround(rb, { grout: 'proto' })`
>   with **no `blockCustoms`**, and `claims-proto-stack-disjoint`'s own header asserted the opposite.
>   ⭐ **This is `ROADMAP A05` reproduced in the new stack** — Layer 0 q3 committed by an instrument — and
>   it wore A05's signature: it moves LS (22 authored streets) hard and barely touches HPDM (6), i.e.
>   **blind exactly where the map is most worked-on.** ▶ `node checks/claims-proto-stack-reads-authoring.mjs`
>   (the dual-state gate; both outcomes are findings, and it reports which state produced each row).
>   - **Fixed at BOTH levels, because one of them alone drifts back.** ① The construction now **discloses**:
>     ② and ③ warn when no `blockCustoms` is passed and stamp `protoAuthoring` on the result — ⛔ it still
>     DRAWS, because an unauthored scene is legitimate and refusing would make town #2 impossible; **the
>     defect was the silence, not the draw** (`A02`/`shapeFreezeMissing`, deliberately the same shape).
>     ② Every proto probe now builds through **one shared feed**, `scratch/_proto-feed.mjs` — seven copies
>     of a call is why the correction could not hold, and reaching the bare state now has to be **asked for
>     by name** (`{ bare: true }`), which is `A03`'s dual-state pattern rather than an accident.
>   - ⭐ **① ITSELF IS EXEMPT AND MUST STAY SO** — it is **width-free by ruling**, so `mintProtopolygon` and
>     the two probes that call it directly are *correct* to ignore authoring. ⛔ Do not "fix" them.
>   - ⭐ **A finding fell out that inverts the obvious reading:** ①'s identity stamps address a **strict
>     superset** of the authored slots the shipped producer can address — every slot the shipped `shape.json`
>     runs can name, ① can name, plus more; **zero the other way.** ⛔ Cause not established, and ⛔ this is
>     **not** a claim that ① fixes `A17`. ▶ the command in `claims-proto-stack-reads-authoring.mjs`.
>
> ⛔ **OPEN — cause NOT established:**
> 1. **The CORNER zone misses.** ⭐ **EXPECTED, not a defect of the model** — Gate B applies no authored
>    R, because R lives in the node's handles and **the handles are still not built** (a corner PASS was
>    built and excised 2026-09-06 — see the block above; it is not the same thing and must not be
>    mistaken for progress toward it). **The size of the prize for node-as-intention**, and what the eye
>    sees at Benton: one unrounded corner, 53° between the legs.
> 2. **Some LEG vertices miss.** Gate C was scoped from this population believing the width step needs a
>    RULE. ⛔ **Measured at Benton 2026-09-05 and it does NOT** — an authored 2.71 m stem meeting 3.96 m
>    legs gives **eight transition vertices and nothing beyond 3.96 m**, against a frozen curb that loses
>    the 2.71 entirely and strays to 10.71 m. ▶ `scratch/benton-grout-joint.mjs` ⛔ **ONE NODE, ONE READ
>    — this does not close Gate C; it forbids STARTING it from "a construction is owed".**
>    ### ⛔⛔ MEASURED WHOLE-TOWN 2026-09-06 — **GATE C IS REAL. THE HANDLES ARE NECESSARY AND NOT SUFFICIENT.**
>    ▶ `node checks/claims-proto-leg-tail-is-corner-reach.mjs` — bins every non-highway ② vertex by
>    distance to the nearest node, because **12 m was an arbitrary cut and "leg" vs "corner" was one
>    population split at a guess.** The question it settles: does the miss DECAY away from nodes (⇒ it is
>    corner reach, and building the handles closes it) or PLATEAU (⇒ a mid-leg error handles cannot touch)?
>    **On LS it PLATEAUS in the far field (≥20 m from any node).** ⇒ ⛔ **Do not scope the handles as the
>    close of ②.** They remain owed — the corner zone's miss is still expected and still theirs.
>    - ⭐ **AND IT IS NOT A BASELINE ARTIFACT — checked before the claim shipped.** The baseline is this
>      run's own `iA`, and `A06` says 42 of LS's 101 tiles still build `iA` by the legacy carve, so the
>      obvious reading was *"② only disagrees with the half we know is chain-built."* **It does not** —
>      split by A07's producer stamp, ② misses `offset` and `carve` about equally, and carve is if anything
>      the closer of the two. ▶ `node checks/claims-proto-legmiss-by-producer.mjs`
>      *(`feedback_verify_the_baseline_before_comparing_to_it`, applied before the conclusion, not after.)*
>    - ⛔ **CAUSE NOT ESTABLISHED.** Nothing here says what the mid-leg error IS.
>    - ⛔ **HPDM CANNOT ANSWER THIS QUESTION TODAY** — a majority of its ② vertices find no baseline edge
>      at all and are reported `UNMEASURABLE` as their own class, so the scene gets **no verdict** rather
>      than a number. **That is its own open item, and a green LS is not evidence about it.**
> 3. **Swallowed blocks** — the loud failure mode, uninvestigated.
>
> *(Superseded here, moved to [`_archive/RIBBONS-mouth-corner-and-coincident-chains-2026-09-04.md`](_archive/RIBBONS-mouth-corner-and-coincident-chains-2026-09-04.md):
> the coincident-chains open question — answered, then made moot — and Tessel's "second mouth corner is not
> a defect", which contradicted `POLYGON-FIRST §2.1` Check 5 and the substrate ruling above it.)*
>
> ### ⭐⭐ THE SPLIT THAT MAKES IT BUILDABLE — combinatorial at prebake, geometric after authoring
> Punching with the *stroked* road makes tile topology **width-dependent** (risk 2). Prebake is blind to
> `design.json`/`blockCustoms` (`ORIENTATION §3`, `POLYGON-FIRST §3`), so freezing a width-dependent
> topology there would freeze **bare-default widths** — Layer 0 q3, baked into an artifact. **Therefore:**
> - **The COUPLER RELATION is width-INDEPENDENT** — which side hands off to which is a graph property.
>   Prebake, frozen once. ⭐ **It already exists: `junctionMap.nodes[].cornersAdjacent`** — complete at
>   every T and cross. ⛔ **Consumer status: `PREBAKE §2.5`, and nowhere else. Do not restate it here.**
> - **The GEOMETRY is width-DEPENDENT** — where the side-chain lands. Resolves AFTER width authoring.
>
> ⭐ This is `PREBAKE §5`'s own unexecuted sentence: *"corner identity (topology) = prebake, frozen once;
> curb position (width/radius) = Survey, authored on top."* ⚠️ **Consequence to accept deliberately: the
> SHAPE freeze must sit firmly after width authoring** — a width edit re-topologises.
>
> ### ⚠️ Slice 1 — the degree-1 coupler — CODE LANDED `a2e0f6c4`; ⛔ REACHES NO ARTIFACT UNTIL A RE-POUR, AND THE RELATION IS NOT TOTAL (2026-08-12)
> The cap **is** a coupler: the CCW sweep's same-arm guard was dropping the one-arm case, so `via:'cap'`
> now wraps a tip's two side-chains around the spike. ⛔ **It reaches NO artifact until a pipeline
> re-pour** — `derive.js` is prebake. `src/data/ribbons.json` carries cap couplers; the five per-scene
> bundles carry none. ⭐⭐ **COUNT STRUCTURALLY, NEVER BY STRING: `grep '"via":"cap"'` returns 0 on a
> PRETTY-PRINTED file** (`"via": "cap"`) — a claim and its independent re-check were both made with that
> same brittle match, so they agreed and were both wrong.
> `node -e "const r=require('./src/data/ribbons.json');let n=0;for(const d of r.junctionMap.nodes)for(const c of (d.cornersAdjacent||[]))if(c.via==='cap')n++;console.log(n)"`
> ⛔ **Re-run the line above; never quote it.** Harmless today (`PREBAKE §2.5`), but **slice 2's walk
> consumes it ⇒ the re-pour is on the critical path.**
> ⛔ **AND THE RELATION IS NOT TOTAL, despite `derive.js:4373` claiming it is** — `dirs.length < 3`
> silently drops **degree-2** (continuation · same-corridor-join · divided-transition). LS 4 nodes /
> HPDM 18. No new coupler *kind* is needed: 100% of the hole is an end-to-end weld of two distinct
> chains, which the existing CCW sweep pairs correctly. ▶ `node checks/claims-coupler-totality.mjs`.
>
> ### ⭐⭐⭐ RULED 2026-08-13 (Jacob) — SMOOTHNESS IS ACHIEVED BY CONSTRUCTION, NEVER BY CLEANUP.
> > *"We should achieve that smoothness through construction and not by cleanup patch."*
>
> **The spec: a street's silhouette is smooth — asphalt, curb, treelawn, sidewalk, all of it.** A band that
> steps at a right angle where the curb curves is not authoring showing through; it is the band failing to be
> concentric with the curb it was struck from.
>
> ⭐ **The distinction that makes this operable — smoothness is the DETECTOR, never the FIX.** A check that
> *measures* smoothness is the machine catching the bug, which is the deliverable Layer 0 asks for. What is
> forbidden is a pass that *takes a jagged output and cleans it up*. **Detector at the end; fix at the root.**
> ⛔ **The forbidden shape, stated so it is recognisable:** a smoother, a simplifier, a snap, a **clamp**, or
> any guard that fires when a construction degenerates and substitutes something plausible.
> ### ⭐⭐ RULED 2026-09-06 (Jacob) — **SELF-INTERSECTION MEANS THE FEATURE IS GONE, NOT THAT IT DRAWS CROSSED.**
> > *"Self intersection IRL isn't real. When something 'self intersects' it goes to 0 and disappears."*
>
> This sharpens `§6.9`.5's *"self-intersection is SIGNAL, not error"*, which says what NOT to do without
> saying what the output **is**. A curb that crosses itself is not a curb anyone could build ⇒ the
> feature goes to **ZERO**: the corner's radius is 0, which is the sharp vertex, the same answer `R=0`
> already gives. ⛔ Still not the forbidden clamp — nothing is shrunk to a plausible fit.
> ⚠️ **It goes to zero WHERE it crosses.** A band pinching out mid-block vanishes *there* and continues
> either side. ⭐ **BUILT FOR ② (Plumb, 2026-09-25) — by construction, `offsetRingByRects`:** ② is ① minus every edge's
> DEPTH BAND (edge → its offset at `[dS, dE]`), each corner joined by the SHARP MITER where the two curb lines meet inside
> it, else the chord between the band ends (the two coincide at the boundary, so nothing switches). Where a block is
> narrower than its curbs the bands overlap and ② is gone *there*. It replaced the per-vertex offset, whose `pftNonZero`
> self-union kept the backwards lobe and whose miter threw a sliver's ② outside its block. ⛔ ③'s strikes still use
> `offsetRingVariable` and still keep the lobe. ▶ `node checks/claims-the-curb-never-enters-the-road.mjs`. **A clamp is a
> cleanup patch living inside the construction** — the miter-limit bevel at §3.3's U-seam is the worked
> example, and it is *the* artifact there.
>
> ⭐⭐ **THIS IS THE RETIREMENT LIST'S CRITERION, so the list stops being a list:** *anything that exists to
> clean up after a degenerate construction belongs on it.* Test each entry below against that sentence rather
> than against memory.
> ### ⭐⭐⭐ AND HERE IS SLICE 2'S ACCEPTANCE — ⛔ THE VISIBLE STRIP WAS NEVER THE INVARIANT *(Jacob, 2026-08-14)*
> > *"There is uninterrupted ADA corners and mono-width ribbons… the sidewalk just FEELS like the strip
> > because you can see it."*
>
> The sidewalk is the part you can see, so it is what everyone reaches for — but *"is the sidewalk one
> continuous polygon"* is **not** the property that has to hold. **Three are, and all three are already
> INVARIANTS 1/3/4 of this section; what was missing is that none was ever made into a check:**
> 1. **MONO-WIDTH RIBBON** — one **outer depth per block**, curb to property line. The strips inside may
>    vary (treelawn↔sidewalk swap, materials); the total may not. *The ribbon is continuous BY DEPTH, and
>    the sidewalk merely rides inside it.*
> 2. **THE ADA CORNER IS UNINTERRUPTED** — a slice of that same band **wrapped** around the corner, never
>    glued onto the ends of two legs.
> 3. ### ⭐⭐⭐ THERE IS EXACTLY **ONE** LICENSED HARD SEAM IN THE SYSTEM: **ADA → TL | LU.**
>    **Everything else is designed never to have a hard seam at all** — leg into corner, corner into cap,
>    block into block. The ribbon runs **continuously** through all of it (INVARIANT 1: *the corner is the
>    band BENT around the arc*; a cap is the band wrapped around a tip). ⇒ **The test is not "name the thing
>    that planned this seam." It is: ANY HARD SEAM THAT IS NOT `ADA → TL|LU` IS A DEFECT.** Nothing to
>    adjudicate, one enumerable exception, and it ports to town #2 unchanged.
>    ⛔ **So the joints are not seam LOCATIONS — they are the places most REQUIRED to be seamless**, which is
>    exactly where our defects live: the 18th/Dolman tooth is a hard seam at a name change; the
>    divided↔undivided break is a hard seam where a chain ends.
>
> ⇒ **This retires gate 2's 39 / 4 / 14 dispute rather than picking among them: all three count rings in the
> visible strip, which was never the invariant.** ⭐ And the 35 zero-contact "severances" were never defects
> for a cleaner reason than "planned" — **they are not seams at all**, just an artifact of emitting one
> polygon per tile where the ribbon in fact runs through.
> ⛔ *(Three Boz formulations struck, all one session: "the smoothness ruling makes continuity moot" — it
> does not, smooth and complete are different properties · "measure unpainted edge, acceptance zero" — that
> measures the strip, i.e. the symptom · **"a seam belongs at a real corner, a block end, or a cap"** — the
> exact inversion of the rule above. ⭐ **The pattern in all three: reaching for the visible artefact instead
> of the invariant that governs it.**)*
>
> ⏳ **DEFERRED — an ASPIRATION, filed not built** *(Jacob, 2026-08-14: "this is NOT present work")*: the
> operator may author **both** strips of the mono-width to the same class — both `LU`, or both `SW`. The
> **`SW`+`SW`** case requires the corner to expect that pairing and supply **angled sidewalk joiners**.
> ⛔ Do not build it and do not scope it. ⭐ If it falls out of the walk for free, that is a celebration; if
> it costs a session, it is not this arc's.
> *(Consistent with §1's own 2026-06-15 update — "fix the derivation → the universal walk produces the right
> polygon; construction is the last resort" — and with INVARIANT 1: the corner is the band BENT around the arc.)*
>
> ### ⭐⭐⭐ RULED 2026-08-14 (Jacob) — A MEDIAN IS A **BLOCK**. Bounded by two sides of the same street; streets split around it.
> > *"This just makes a new kind of 'block' and we stipulate that streets can split around it. Then we treat
> > it exactly the same."*
>
> **No divided-road concept, no emitter distinction, no median-specific ped rule.** A street emits its
> half-width to each side; blocks are the faces; sometimes there is a block between the halves. ⛔ **Nothing
> decides *"divided"*** — a street with a block in the middle LOOKS divided, and that is the whole of it.
> ⭐ The identity is **face-read** and lives in polygon-world, which survives the Wall; every mechanism below
> was chain-world machinery keeping a polygon-world fact alive across it.
>
> ⭐⭐ **THIS IS WHAT LICENSES THE RETIREMENT, AND IT IS MEASURED ON BOTH SAFEGUARDED TOWNS: the chain
> apparatus knows NOTHING the polygon does not.** Median blocks by the polygon rule vs by the chain flags —
> **chain-only is EMPTY on LS and on HPDM**, 0 exceptions. The rule never reads
> `pairId`/`anchor`/`innerSign`/`phase.role`.
> ▶ `node scratch/median-block-ped-coverage.mjs` (agent Wick, `b16ce8c3`). ⛔⛔ **EVERY FIGURE IN THIS RULING
> COMES FROM THAT ONE COMMAND — re-run it, never quote these numbers.** The *directions* are the doctrine
> (chain-only empty · the superset · HPDM sparser · a majority of medians crossed); the digits are a snapshot.
>
> ⚠️ **IT IS NOT YET THE MEDIAN TEST — the polygon rule is a strict SUPERSET and the excess is a different
> animal** (LS chain✓ mean area ~825 m² vs chain✗ ~81,698 m² — two orders of magnitude). ⛔ **Do not invent a
> threshold to close the gap.**
> ⛔⛔ **AND THE OBVIOUS DISCRIMINATOR — "the two bounding sides FACE EACH OTHER" — HAS ALREADY BEEN TRIED AND
> REVERTED** (`§3.5`): the measure `side` is point-order-relative **per chain**, so a pair's two carriageways
> disagree about which side faces the median (Lafayette: A matches the inboard oracle, B does not).
> ⚠️⚠️ **AND THAT ORACLE MAY ITSELF BE INVERTED — OPEN, AWAITING THE EYE (2026-09-04).**
> `innerSideSign` (writes the persisted `innerSign`) and `inboardKeyGeom`/`inboardSideOf` (byte-identical
> duplicates, `derive.js:3799` == `tileGround.js:1246`) map the SAME perp to OPPOSITE labels. Read out of
> the artifact — which geometric side production's own `side` label lands on — **`(-dz,dx)` is measure-RIGHT**,
> which makes the geometric pair the inverted one. Consequence, tested label-free (▶ `node checks/claims-inboard-side-convention.mjs`): **the ped is zeroed on the
> side AWAY from the mate on a large majority of pairs across four towns** — the outboard side losing its treelawn and
> sidewalk, the opposite of the documented intent (`tileGround.js:1222`). ⛔ `tileGround.js:1234` asserts the
> opposite of this measurement, so ONE OF THE TWO IS WRONG and it is not ruled.
> ⭐ **AND E3.4's PRESCRIPTION IS THE CANDIDATE CURE — rehomed here 2026-09-05 when the E3 campaign closed.**
> It is a **DATUM** fix, not a construction, so the grout does **not** subsume it and it did not die with E3:
> **port `innerSign` from the perpendicular foot-vote (`derive.js:3450–3464`) to FACE-ADJACENCY** — which
> half-edge bounds the median face — because the foot-vote cannot be authoritative. `OSM2STREETS-GROUNDING`
> notes the standard has no `innerSign` at all: "which side faces the median" **falls out of the block walk.**
> ⛔ Still gated on the eye below; a cure for an inversion nobody has confirmed is a guess.
> ▶ `node checks/claims-inboard-side-convention.mjs` · **the gate is the EYE: on a divided road in the lit
> app, is the treelawn at the CURB or in the MEDIAN?** A consistent inversion renders as a planted median,
> which on a boulevard is plausible-looking — Layer 0 q2, which is how it could survive an eye gate. ⭐ **So it
> is not a discriminator we lack — it is one that the `side` labels cannot currently support**, and it waits
> on the walk's directed sides, which is the same root as the inverted `side` law on the list below.
>
> ### ⛔⛔ CONTRADICTED 2026-09-06 (Jacob) — **"A MEDIAN IS A SPECIAL CASE TYPE OF BLOCK; NO SIDEWALK."**
> That is the operator's ruling and it is the OPPOSITE of the section below, which concludes *"the median
> joins `gleanTreelawn`'s ladder like any other block; **there is no median rule to write**."*
> ⭐ **The measurement below is sound; the INFERENCE from it is not.** Its evidence is that most medians
> are crossed by an OSM `footway=crossing`, and the quote it cites from Jacob is *"many medians have
> sidewalks that **cross** them."* **A sidewalk crossing a median is not a sidewalk running along it.**
> ⇒ There IS a median rule: **no sidewalk.** ⛔ Which of the three causes is not yet ruled — the code has
> not been checked against either reading, so it is not stated here. **Do not act on the section below
> without settling it.**
> ⭐ And the other half of the ruling: **the median is otherwise a BLOCK — curb on each side, asphalt
> unchanged.** *"If the curbs touch, there's no median"* — where the two curbs meet the region has ended,
> which ③ now detects by the AUTHORED inset splitting (never a `2 × curbWidth` constant: **the curb width
> is authored**). ⛔ Making the deeper bands honour that severance is NOT built.

### ⭐⭐ AND THE PED RULE IS REPLACED BY THE LADDER THAT ALREADY EXISTS — ask the data, then guess, then override.
> **`effectiveMeasure`'s blanket `treelawn:0, sidewalk:0` is WRONG ON THE MAJORITY OF MEDIANS** — measured:
> **a majority of LS and HPDM** polygon-medians are crossed by an OSM `footway=crossing` way (Jacob: *"many
> medians have sidewalks that cross them"*). ⇒ **the median joins `gleanTreelawn`'s ladder like any other
> block; there is no median rule to write.**
> ⛔ **BUT THE DATA IS A RUNG, NOT A REPLACEMENT.** Normalized sidewalk coverage of street frontage at +2 m:
> LS reads a clearly higher normalized rate than HPDM — ⭐ **normalized, HPDM is the SPARSER town, and the raw way counts said the
> opposite.** Ask-the-data alone leaves most of town #2 unanswered.
> ⭐ **Closes the stated blocker on `BACKLOG.md`'s dead-end-mouth crossing item** (*"needs an intake trace
> first to confirm we still retain crossing nodes"*) — **crossings ARE retained** and survive the skeleton bake.
> ⛔ **The tag is `footway=crossing`; `highway=crossing` is ZERO on both towns**, so a check keyed on that
> backlog item's wording reports *"no crossings"* on a town that has hundreds.
>
> ### ⛔⛔ THE RETIREMENT LIST — write it now, execute it as ONE window (Jacob, 2026-08-12: *"we have laid down so much defunct wiring, once we solve this we'll have to do a real cleanup"*)
> **Each of these exists ONLY to describe the absence this ruling closes. ⛔ Do not extend any of them.**
> `walkOrd` / the walk-ordinal coupler · the inverted `side` law (34/34) · the mouth disc + the mouth-wrap
> snap · the synthetic negative-`segOrd` cap fe
> · `[THRU-T]` (`tileGround.js:3589-3613`, **already dead — `opts.thruTNode` is never passed**) ·
> `detectTileCaps` as an identity source (it is a slit detector wearing a cap detector's name).
> ⭐⭐ **· THE DIVIDED-ROAD IDENTITY APPARATUS — evidenced by the ruling above:** the **Anchor (center/edge)
> pulldown** (`SurveyorPanel.jsx` — ⛔ **0 authored anchors on every scene with an overlay; it has never been
> used**, so removing it moves nothing on screen) · `effectiveMeasure`'s inboard ped-zeroing ·
> `anchor`/`innerSign`/`pairId` as GEOMETRIC inputs. ⭐ Ruled out for the user 2026-08-14: with one datum
> there is nothing to choose, and a control that selects between two datums **is a case boundary made manual.**
> ⛔ **WHAT IS *NOT* ON THIS LIST, AND WAS BRIEFLY PUT HERE IN ERROR: `innerEdgeAssign`'s per-side widths.**
> A carriageway chain is a centerline and **emits to both sides** — the inboard emission is what bounds the
> gusset. `surveyHW/2` per side is therefore **correct arithmetic, not a fake.** Only its **ped-zeroing**
> (`treelawn:0, sidewalk:0`) retires, under the ladder ruling above.
> ⚠️ **The anomaly is `setAnchor`** (`useCartographStore.js`), which seeds inboard `pavementHW = 0` — a
> one-sided emission the model does not call for. It leaves with the pulldown; ⛔ **do not "converge" the
> pipeline onto it.**
> ✅ **STRUCK 2026-08-13 (`de7fcba5`) — `innerEdgeMeasure`'s ped-zeroing AND `innerSign`'s consumer**, the
> model's own two falsifiable predictions, both fallen out of work aimed elsewhere. ⏳ `derive.js` still
> carries a stale `innerSign` reference inside its own inverted comment.
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
> 1. ✅ **RECONCILED 2026-08-12 (agent Quire) — `node scratch/reconcile-punchout-vs-faces.mjs`, case C.**
>    ⛔ **Only case C is apples-to-apples**, and the two settings are load-bearing in opposite directions:
>    grade-sep must be EXCLUDED (`tileGround.js:2618` excludes it from the face graph; including it costs
>    Δ29 islands and shatters `frozen[12]` into 12) and the stencil must be the **raw boundary**, not the
>    spike's ×1.1771 (Δ14). ⛔ Do not quote a block count from any other case; re-run it.
>    **This is the substrate's precondition AND its regression guard.**
>    - **Case C (grade-sep excluded, raw boundary, authoring loaded): 93 islands ↔ 101 tiles,
>      a CLEAN INJECTION — 0 merges, 0 splits, 0 straddlers.** ⭐ The punch-out reproduces the face
>      topology; it does not re-topologise the map.
>    - ⭐⭐⭐ **THE CANON WAS RIGHT THE WHOLE TIME, AND THE FAILURE MODE IS THE FINDING: TWO SECTIONS OF ONE
>      PROBE ANSWERED THE SAME QUESTION DIFFERENTLY, AND THE WRONG ONE CAME FIRST** *(agent Tally,
>      2026-08-13, `b365a26b` + `549000d8`)*. `§13` **always** matched by area and **always** printed
>      93 → 93 distinct tiles, 0 straddlers, 0 splits, 8 unclaimed — which is what this gate quoted. But
>      `§3`, the **first** match section anyone re-running the script reads, matched by **island centroid
>      inside tile ring** and printed 1 split / 9 no-island. ⇒ Two independent readers concluded the canon
>      was unreproducible; it was reproducible from a different section of the same file.
>      ⛔ **A check that contradicts itself internally is worse than no check** — the reader takes the first
>      answer and has no signal that a second exists. `§3` now uses `§13`'s rule and `§17` asserts the result.
>      **The centroid rule's failure shape, and why it would have broken slice 2:** an island is a ring, not a
>      convex blob — ▶ `node scratch/reconcile-punchout-vs-faces.mjs` §3 names the specific island that lies
>      entirely inside its true tile and not at all inside the tile its centroid falls in, printing one error twice. ⭐⭐ **The walk produces large non-convex islands BY
>      CONSTRUCTION** (a punched spur is a concavity, below) — **the exact shape a centroid rule misfiles.**
>      ⛔ **Numbers pinned to artifacts and asserted BY THE PROBE, not by this sentence** —
>      `ribbons 4491db8475 · design 99db2706fb · boundary dc44dc7054`, rule=area. ⚠️ Case C reads
>      `ribbons.json` + `design.json` + `neighborhood_boundary.json` and **none of `shape.json`.**
>    - **The 8 tiles with no island are ONE class, not eight — confirmed twice, independently.**
>      **Outcome:** interior sampling (`§16`, sharing no code with the matcher) finds every one of these
>      tiles fully swallowed — no interior point lands in any island, zero disagreements between the two
>      methods. *(Tile #3 was never a member and was never swallowed — it was the centroid rule's phantom.)*
>      **Mechanism:** `§14` verifies width is less than the sum of the two widest facing `pavementHW` on
>      every one of these tiles — the two carriageways' asphalt overlaps and annihilates the land between them.
>      ⚠️ Its `2A/P` width understates on L-shaped tiles and the probe says so in place: **directional, and
>      it is the tiles-WITH-islands row that the caveat bounds, not this class.**
>    - ⛔ **TWO BOZ CLAIMS STRUCK HERE, both stated in the same register as measurements and both false:**
>      *"the old numbers came from uncommitted `shape.json` bytes"* (case C never reads it) and
>      *"the width rule was never measured"* (`§14` measures it). The second was written **into this doc**
>      in `01839d1f` and deleted a correct sentence. `[[feedback_measure_before_writing_ask_before_building]]`
>    - ⛔⛔ **THIS KILLS AND INVERTS THE MEDIAN HYPOTHESIS** (`HANDOFF §4.1`: *"divided medians become
>      leftover islands, probably MORE correct"*). **Measured (▶ `node scratch/reconcile-punchout-vs-faces.mjs`, "isMedian tiles" line): the punch-out ERASES a minority of `isMedian`
>      tiles and shrinks the survivors to well under their frozen area on median**, where ordinary blocks
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
> ### ✅ THE OUTER POLYGON — SETTLED: the **raw `neighborhood_boundary.json`**, which is what
> `derive.js:4632-4648` already freezes against and what gate 1's passing case C uses. ⛔ Rejected:
> `streetFade.outer + 50` (the spike) — **79 islands, badly**, 31 perimeter tiles merging into a road-free
> annulus, and it lets **a RENDER knob** (`BakedGround.jsx:117`) decide block topology at the rim, against
> `ORIENTATION`'s *"the inclusion polygon DECIDES, the disc RENDERS."* ⭐ Still uncosted, for the day the
> Extent schema split lands on LS: the inclusion polygon from `design.json`.
>
> ### ⭐⭐⭐ THE RIM BOUNDS, IT DOES NOT OWN — RETRACTED AND RE-RULED 2026-08-12 (Jacob)
> > *"I was wrong; the radius is not an ordinary chain. That was when we were trying to close the
> > circle."*
>
> **The retraction, with its reason: the rim was made an ordinary chain in order to CLOSE THE CIRCLE.**
> Under `blocks = boundary − stroked roads` the boundary is the **outer contour of the subtraction**, so
> nothing needs closing and the rim never becomes a participant. Its exact status, all three at once:
> - ✅ **it BOUNDS** — the stencil of the punch;
> - ✅ **its ring edges carry `__boundary__` identity** by construction;
> - ⛔ **it is NOT a side-chain** — no coupler, no `baseMeasure`, no band, no ADA, no corner rule.
> ⭐ A construction asking *"is this the rim?"* to decide **painting** has diverged; asking to decide
> **bounding** is the stencil doing its job.
>
> #### ⭐⭐⭐ THE CIRCLE IS STAMPED **LAST**, ON FINISHED GEOMETRY — corrected 2026-09-06
> Jacob, re-ruling aloud: *"EITHER we build the entire grid of streets and the circle stencils out the
> circle OR the circle adds the geometry such that the whole perimeter is made of weird odd shapes"* ·
> *"build the whole grid flat and then stamp out the circle last"* · *"obviously the circle stencil is
> happening too early."*
> **① is the ink of the WHOLE frame and is never cut.** The boundary is carried out of the mint as
> `boundaryRing` — **a payload, not a clip** — and applied per object at every consumer (`[PROTO⊙]`
> and the live curb). ⛔ **A disc, or a disc plus a margin, is STILL the circle deciding block
> geometry**; the subtraction subject is a plain rectangle around all the ink.
>
> ### ⭐⭐⭐ AND THAT RULE IS ABOUT **THE CIRCLE**, NOT ABOUT CLOSING A FACE — added 2026-09-20, after it was read the other way and cost a day
> **THE DISC IS A RENDER KNOB. GROUND TRUTH IS NOT.** The radius, `streetFade` and the aesthetic
> padding are all live-editable and none of them is a fact about the town — *that* is why the circle
> may not decide block geometry, and why it stamps LAST.
> ⛔ **It does NOT say "only a chain may close a face."** A **shoreline** is absolute and permanent
> (`ROADMAP H-4`, Jacob: *"this should be EASIER than a man-made feature, because a shoreline is
> absolute and permanent(ish) where a curb is authored and negotiable"*). A block that runs to the
> water genuinely ends there. ⇒ **A coast is INK**: stroked into ① like a chain under
> `WATER_EDGE_SKEL`, it closes the land-use polygons on the landward side — *especially the
> dead-ends*, which a graph walk can never close (`PREBAKE §4.0`) — and the **water field** falls out
> of `frame − ink` on the other side. *(Jacob, 2026-09-20: "it is both; we see the difference between
> land and water, and the geometry creates the water field and on the other side (land-ward side)
> closes the rest of the LU polygons, especially the dead-ends.")*
> ⭐ **It is still not a street:** no coupler, no `baseMeasure`, no band, no ADA, no cap. It closes
> faces; nothing offsets a curb from it.
>
> ### ⭐⭐⭐ HOW A COAST ARRIVES, AND WHY IT IS **TWO OBJECTS FROM ONE CHAIN**
> A lake and an open sea are the same shore to the kit and **different things in OSM**: a lake is a
> closed polygon that arrives `clipped`; a sea is a set of open `natural=coastline` ways, land on the
> left, which `weldCoastlines` joins by shared endpoints. Either way the result yields **the water
> FACE** (the shore closed against the bb) and **the INK** (the open, bb-clipped arc ① expands at ε).
> ⛔ A caller that takes one and not the other gets a lake with no landward edge, or an edge with no
> lake. ▶ `node checks/claims-a-closed-shore-still-yields-ink.mjs`
> - ⛔⛔ **THE SAME WAY IS NEVER WELDED TWICE.** An intake can deliver one way more than once, and
>   welding the pair traces the coast **out and back** — a path that closes on itself and bounds
>   NOTHING. That ring then passes every test that asks what is *inside* it, because a zero-area ring
>   contains nothing by definition. The dedupe is direction-free and **reports the count**: the
>   duplication is upstream and dropping it here does not fix it.
> - ⛔ **A CHAIN THAT CLOSES IS NOT YET A FACE.** It must ENCLOSE AREA — `|area| / perimeter`, the
>   ring's mean width, must exceed the weld tolerance, below which its two sides are not two sides.
>   A chain that fails this is still real shoreline: its arcs become ink, and the sea is rebuilt from
>   THEM. ▶ `node checks/claims-a-shore-is-not-traced-twice.mjs`
> - ⭐⭐ **WHICH SIDE IS WATER IS MEASURED AND DISCLOSED.** The arc is closed against the bb both
>   ways and the water is the candidate the **town's own centre** is not in — never OSM's winding.
>   That is an ASSUMPTION, and a peninsula or hook town is where a centre can sit oddly, so the pour
>   PRINTS the choice with both areas (they sum to the frame, which is the check) and **buildings are
>   the guard**: a MAJORITY of footprints in the water means the sides are inverted and the coast is
>   refused. ⚠️ A handful is a harbour — wharves, a ferry terminal, building out over the tide — and
>   is reported, never refused. ⛔ Distance cannot tell those apart; a wharf can be 400 m long.
> ⛔⛔ **AND THE RADIUS IS UNTOUCHED BY ANY OF IT.** The coast closes against **the bb** — the frozen
> data extent — and the circle still stamps last, over the result. *(Jacob: "the shoreline is cut and
> made into a closed polygon by the final radial stamp, it doesn't replace it" · "the water should go
> to the edge of the bb just like the roads and everything else.")*
>
> ⚠️ **It was once read as *"nothing but a chain may close a block"*, and a shoreline was built as a
> REPLACEMENT boundary — inverting which of radius/ring is the SSoT and minting 19 spurious
> perimeter blocks. Reverted `dcfe9d18`/`9bbc3bc7`; the full account is
> `_archive/RIBBONS-shoreline-replacement-boundary-2026-09-20.md`.**
> ⚠️ **THIS SECTION USED TO SAY the mint "unites the whole grid and then INTERSECTS" and that a rim
> edge "comes out owned" by `__boundary__`. Both are ROT** — the code carries the explicit counter-note
> (*"① is NOT cut here"*), and **0 of LS's 275 block faces carry a single `__boundary__` label**: the
> only rings that touch the frame are the exterior's, which is dropped. Under stamp-last a block runs
> PAST the rim and is cut afterwards, so there is no rim edge to own.
> ⭐⭐ **WHY IT STILL REMOVES A CLASS rather than guarding one:** a square cut has NO ENDPOINT, so there
> is nothing for a cap, bulb or fillet to be built on. Contrast `derive.js`'s `[F]` `clipStreet`, which
> chops CENTRELINES and mints a fresh endpoint per crossing — a manufactured tip, downstream of which
> every tip-shaped defect becomes possible. ⛔ `[F]` still runs for the FACE walk; that is the remaining
> half.
> ⛔ NO FALLBACK: a scene with no boundary keeps the full-bb ① and says so.
>
> #### ⭐⭐⭐ A BLOCK IS A **COMPOUND FACE** — the nesting comes out of the BOOLEAN, 2026-09-06
> `blocks = frame − ink`, and the result was being read as a **flat list of rings**, so winding was the
> only record of outer-vs-hole. ⛔ **The exterior region is an outer ring (the frame) PLUS ONE HOLE PER
> CONNECTED INK COMPONENT — and every one of those holes was carried out as a block.**
> **Measured:** on both LS and HPDM, one giant "block" contains nearly all of the other blocks by area.
> Neither touches the frame and neither holds a frame corner, so no drop
> test can see them — this is why *"drop the component holding a frame corner"* and *"drop anything
> resting on the frame"* both left it standing. ⭐ **That ring is what flooded Survey**: Survey FILLS
> `tg.curb`, and ②'s largest ring covered most of the disc.
> ⇒ `booleanLabelled(..., asTree)` executes into a Clipper **PolyTree**: a face is an outer node plus
> its immediate hole children, and the exterior leaves with its holes attached. ⭐ **This is `§1`'s own
> identity law applied to TOPOLOGY** — carried THROUGH the boolean, never recovered from ring geometry
> afterward. ⛔ The Z channel survives the PolyTree build, so the labels are unchanged.
> **② offsets the face as ONE object:** the outer eroded inward, every hole **dilated** into the face
> (`offsetRingByRects(..., outward)` — the direction is **stated**, never inferred from winding), subtracted through
> `booleanLabelled` so the ① owner survives. LS **1** compound face, HPDM **6**.
> ✅ **③ IS COMPOUND-AWARE TOO** — every band boundary goes through one `ins()` that offsets the
> block's whole curb region (outers eroded, holes dilated, then differenced), so no band is ever
> struck into a hole. ⭐ The bands are also **bucketed by block index at emit time**; the artifact used
> to recover which band belonged to which tile by sampling 12 points of every band in the map against
> that tile's rings — identity recovered from ring geometry, which this § forbids, and which a compound
> face breaks outright (a hole ring "contains" every band of the faces nested inside it).
> ▶ `node checks/claims-proto-blocks-are-faces.mjs <scene>` (no block contains another face's interior
> point) · `node checks/claims-proto-curb-is-block-sized.mjs <scene>` (the largest ② ring reads as a
> block, not as the town; in-disc coverage).
> ⚠️ **AND THE COVERAGE FIGURE THAT WAS QUOTED FOR IT WAS THE GHOST.** *"117/118 tiles covered"* counted
> the 4.49 km² ring covering 10 of them. Excluding it, coverage was **107/118 before and 107/118 after** —
> unchanged. ⛔ The 11 uncovered are a standing open item; **cause not established.**
>
> ### ⛔⛔ AND THE RIM CANNOT BE DROPPED FOR A WALK — MEASURED, 2026-08-12 (Tessel)
> *"Build full, crop last"* is `derive.js:4632`'s own stated doctrine and it is available to the
> **punch-out**, which has a stencil. It is **NOT** available to a bare face-walk: **a walk over the
> street graph does not close the perimeter.** Walked unclipped with no ring injected, of the tiles that
> today carry a `__boundary__` edge, the number that close on real streets alone is
> **LS 14/31 · staging 33/48 · ksi-y-m-yn 0/1 · hipointe-demun 25/53 · centrum 34/68 · altadena 10/43** —
> the rest are part of the single unbounded face. ⭐ **The control is what makes it trustworthy: every
> INTERIOR tile lands inside a bounded face on all six scenes** (70/70 · 68/68 · 76/76 · 143/143 ·
> 503/503 · 651/651), so the misses are the graph, not the instrument. **Cause not established** — LS's
> face graph reaches r=1030 m against an 892 m radius and carries 95 degree-1 chain ends, 55 beyond 0.9R.
> ▶ `node scratch/phase0-unclipped-close.mjs`
> ⇒ **This is why the substrate takes the boundary as a STENCIL and not as an owner.** ⚠️ Accept §1's
> stated cost: with the raw boundary the roads cut the rim, so there is no single outer contour — the
> boundary is just another set of ring edges.
> ⚠️ **Live risk either way: a look-side regeneration of the disc silently moves 31 tiles' ring edges**,
> because a render artifact is load-bearing geometry and nothing says so.
>
> **DECIDED (Jacob): Slice 2 takes the outer ring as an ARGUMENT — ⛔ never a reach into
> `neighborhood_boundary.json`.** Today `derive.js:4632-4648` closes the faces against that file's
> `boundary[256]`, and **`EXTENT-DESIGN §5.1` says that artifact carries THREE JOBS** — the render disc
> (`center`,`radius`,`boundary[256]`,`fade`,`streetFade`), the membership polygon, and the exclusions
> (split into three RECORDS, one file, 2026-08-12). ⛔ **The split changes nothing here: the disc is
> still the disc, and it still only RENDERS.**
> ⛔ **So the substrate today closes against the DISC — the thing `ORIENTATION` says must only RENDER,
> never DECIDE.** The Extent-authored shape is `polygon`, and **LS HAS NONE** (HPDM 4 · centrum 815 ·
> LS/ksi/altadena absent). ⇒ Taking it as an argument keeps the swap to the authored polygon a one-line
> change on any town — **and the split has now landed** (worklist item 1) — without pulling LS's
> plumbing forward against `ROADMAP`'s ordering.
>
> ⭐⭐ **THE STRUCTURAL FINDING THAT SURVIVES (Jacob: *"we didn't then know we were going to HAVE that
> boundary edge to pull from"*).** Extent produced a disc for **rendering + membership**; the 2026-08-08
> compound-path ruling promoted the rim to **an edge of the drawing, never an absence** — and `derive.js`
> had to **invent an owner** (`__boundary__`, a constant filler with `side:'right'` and no chain in
> `ribbons.streets` — ▶ `node scratch/slice2-walk-report.mjs` counts the `__boundary__` ring edges and
> the tiles they touch) to make the perimeter faces close. **Nobody told
> Extent it now supplies structural geometry.** ⇒ Under the stencil reading the invented owner is not
> replaced by a better owner — **it stops being needed as an owner at all**, while those edges keep
> `__boundary__` as their identity.
>
> ⚠️ **STILL OPEN, and NOT retired by the retraction** — these were logged as dying with a rim band, and a
> stencil does not paint: the `__boundary__` **no-`baseMeasure`** case and its **4271.8 m of derived-zero
> exclusions across 20 tiles** (the entire derived-zero population on LS, measured by Quill) · **12 of the
> 16** topological-only severances that *"stop against a NO-PED arc"* · `EXTENT-DESIGN §8` Q4 (*"what does
> a boundary street's SIDE mean?"*). **What paints at the rim is undecided; only what BOUNDS is ruled.**
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
>    ⭐⭐ **most severed tiles (the "no retrace" column above) retrace NOTHING** ⇒ closing the dead-end
>    class touches at most the "retrace" column's severed count (a CEILING, not a forecast — the
>    table contains its own disproof: some tiles retrace and do NOT sever), so retrace alone does not
>    cause severance. Retracing tiles sever more often than non-retracing ones — suggestive, nothing more.
>    **Cause not established for any of them.** ▶ re-run the table above for the current split.
>    - **"Dead-end tile" and "retracing tile" are the same 21 tiles** — `ribbons.tiles[].caps` is present
>      on exactly 21 tiles (50 cap records), set-identical member-for-member to the retrace set.
>    - **Severance is an OFFSET-producer phenomenon** — nearly all of it; but so is the banded population
>      (a large majority of offset tiles are banded, most carve tiles have no band). As a share of banded,
>      offset tiles sever far more often than carve tiles ⛔ but the carve denominator is small — do not
>      lean on the contrast. ▶ `node scratch/overlap-retrace-x-severed.mjs --lists` reproduces both splits.
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
> ## ⭐⭐ The 2026-08-06 punch-out evidence is retired to
> `_archive/RIBBONS-s1-retired-detail-2026-09-06.md §C` — it recorded what was known before the
> substrate became the render path. ⛔ **One rule from it is LIVE and cost a day when ignored: read
> the punch-out's output as a COMPOUND PATH — outer contour + holes + islands — never as a flat
> block list.**
> ### ~~DOCTRINE (2026-06-15, Jacob — the construction campaign): CONSTRUCT the hard polygons; DERIVE only the simple block faces.~~
> The derivation chain below holds for a **simple block face** — a tile bounded by ordinary street legs derives correctly (centerline → offset → ribbon). It **fails at the two HARD polygons**, and that failure is one root, not many: **the junction and the divided median must be CONSTRUCTED positively, not left to emerge from the face-walk.** ⛔ **A purely emergent junction IS the bug family** — that is the posture this doctrine replaced, and `tileGround.js`'s header now says so.
> - **Why (canon × the median deep-research × osm2streets):** the standard (`OSM2STREETS-GROUNDING §2`, "the defining divergence") **constructs the intersection polygon positively at every node** — roads trimmed back, the node neighborhood *replaced* by construction; *"every E3 artifact lives in this gap."* And the median research (2026-06-15) found **no production system *derives* a median** — A/B Street calls a centerline-derived median a **known limitation that "doesn't fit"** — the right move is to **construct a generic median positively**. Both findings are the same principle from two sides.
> - **The unification:** junction-curb bumps + 4-way sliver corners (emergent junction tile) · median needles + the "d" bulge (emergent median face) · divided-transition scallops/width-steps (tiles inheriting messy node geometry) are **ONE root** — *we build ribbons against tiles that are emergent at the hard cases, not constructed.* The concentric-ribbon FILL is sound; it just needs **correct polygons to build against.**
> - ~~**The campaign (E3, intersection-everywhere):** construct the intersection polygon at EVERY node.~~ ⛔ **CLOSED 2026-09-05.** Its method — thicken, collide, trim back, assemble the corner — **is polygonize-then-offset under construction vocabulary**, i.e. the grout ruling three months early. ▶ `_handoffs/HANDOFF-junction-construction.md` carries the closure banner and says what survived: **`innerSign`→face-adjacency (E3.4, a DATUM fix the grout does not subsume) → `§3.5`**; the `junction-band` + `curb-bump` detectors, which outlive it and are the grout's acceptance too.
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
- ❌ Re-deriving geometry from chains *past the Wall*. Section is a pure consumer of the frozen shape (`PIPELINE.md` §5 (the Wall)).
- ❌ Smoothing/simplifying the **polygon** (curb) while the centerline stays faceted — the wrong layer (the Derivation Chain corollary).
- ❌ Splitting a chain at every slight bend. Slight bends are OSM noise; the junction-protected RDP already collapses them (`SKELETON.md §3 step 8`).

### Diagnostic order when something looks wrong

1. **Is the CENTERLINE clean at this location?** (Survey navy line, `SurveyorOverlay`.) A faceted/kinked centerline corrupts shape *and* identity downstream. If rough → fix the frame (`SKELETON.md`), not the polygon.
2. **Does the polygon move but the centerline doesn't?** → you're at the wrong (downstream) layer. Go up.
3. **Is this SHAPE (Survey, pre-Wall) or FILL (Section, post-Wall)?** A wrong silhouette is upstream; how the ribbon *bends* is Section. "Is this chains again?" (`PIPELINE §5 (the Wall)`).
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
- **Divided carriageways stay two centerlines; the median is a BLOCK.** ⭐ **`§1`'s 2026-08-14 ruling owns the model and this line does not restate it** — its grass is the ordinary `luRemainder` of that tile; **not** a chain-identity consequence, **not** an authored object, **not** a constructed ring (the E2 stamp ring that briefly contradicted this is deleted — `§3.5`). ⭐⭐ **The chain POINTS sit at the carriageway CENTRELINE, and each carriageway emits to BOTH sides — the outboard emission bounds its block, the inboard one bounds the gusset.** `innerEdgeAssign`'s `surveyHW/2` per side is exactly that, and it is **correct**. ⛔ **`anchor:'inner-edge'` on all 38 LS carriageways is a FLAG, not a position** — it tells the runtime to *render* the centerline at the inner edge *(measured 2026-08-14: read as a position, every LS divided road would carry a 7–20 m median; as a centreline, 1.5–3.5 m)*. What retires under `§1` is the inboard **ped-zeroing** and `anchor`/`innerSign`/`pairId` as **geometric inputs** — ⛔ **not** the per-side widths. ⭐⭐ **`SKELETON.md:183` ALREADY HAD THIS, MEASURED 2026-08-11 — *"the once-documented 'seeds inboard `pavementHW=0`' is present on ZERO of them."*** ⛔ **A whole day's datum confusion was re-derived because the topic felt like ribbons and nobody opened `SKELETON.md`.** Only its `§61` clause ("chains sit at the inner edges") was wrong; **corrected there 2026-08-14, not here.** ⭐ The lesson is the routing one: **this fact lives in the SKELETON doc, and a ribbons question reached it only by accident.** The two-carriageway model is **LOCKED** (no pair synthesis, no collapse to a single spine). Frame topology lives in `SKELETON.md §2/§3` + `_archive/TRUMAN-FORENSICS.md`.
- **Divided↔undivided transition (the "special sauce", `SKELETON §5d/§5e`).** At a transition the outer curb must run **straight through**; the median opens **inward**. The corner-builder must round the **two corridor outer-edge legs** (treat the divided corridor as ONE road at the corner), never the carriageway *stubs* — rounding a stub against the cross-street fabricates the **false corner**. Detect via `phase.spineAt*` (a frozen frame fact, never re-derived by node-matching at construction). This cured the live false corner (`9c275ce`). The residual transition "d" bulge comes from the **PRODUCER** — the curb is minted by stroking chains and then snapshotted, so the bow is frozen *into* the artifact (**Check C, RED**). ⚠️ *Precision fix 2026-07-31: this is not "the curb is unfrozen for consumers" — every non-Survey view already reads the frozen `shape.json` (`PIPELINE.md` §5 (the Wall) ⚠️ *(was cited as `WALL.md §31` — a section that never existed)*).* Fixed by building the curb once in prebake from the frozen frame (`HANDOFF-freeze-the-curb-in-the-first-bake.md` D6b/c), not by more construction.

### 3.2 Tiles — `extractFaces` (`:508`)

Builds the planar graph from shared vertices of `streets[].points` (excludes `gradeSeparated`), welds near-coincident endpoints (`ENDPOINT_SNAP`), walks the enclosed faces. Output: the tiles, each carrying its bounding-street edges (skelId/side per edge). Loop interiors emerge as faces (→ median, `LOOP-STREETS.md`). ⛔ **CORRECTED 2026-08-12 — "the outer/perimeter face is INCLUDED so exterior streets get asphalt (G9)" is FALSE, and `PIPELINE §5 (the Wall)` carries the same false sentence.** `tileGround.js:984` drops **every** non-positive-area face, the outer face included (its only filter is `signedArea > 1e-3`). **What actually happens:** `derive.js:4632-4648` clips the face-streets to the boundary and **injects the boundary ring as closing edges** (`skelId: '__boundary__'`), so the perimeter faces close into real bounded tiles — **31 of the 101 carry a `__boundary__` edge.** ⭐ The mechanism matters: it is exactly what the punch-out reproduces for free against the raw boundary (§1's outer-polygon note).

### 3.3 The curb SHAPE — `offsetRingVariable` + `filletRing`

Per tile, per edge: stroke the centerline outward by `pavementHW` (per-side, per-run via `runMeasure`) → `iA`, the curb edge. `offsetRingVariable(ring, depthAt, cornerAt, capAt)` does the variable-depth parallel offset; `cornerAt` uses the run-seam test (real corner vs through-node) so a width step doesn't appear at a through-node — ⛔ **which key it reads is a live defect, see the block below.** `filletRing(ring, Rfn, sink)` rounds the curb corners **once** (radius from the authored corner-R kit: global scale × per-IX × per-corner). `strokeOpen(polyline, delta)` handles open/perimeter runs. **jtMiter throughout** (invariant 2). This is the SHAPE that freezes at the Wall. ⛔ **All three — `filletRing`, the jtMiter doctrine and the miter limit — retire under §1's 2026-09-04 grout ruling** (the node carries the intention; nothing rounds twice). *(Line numbers deleted 2026-08-13 — all three had drifted 2–3× over; grep the function name.)*

> ### ⛔⛔ THE 18th/DOLMAN TOOTH IS A **REGRESSION**. THE CURE EXISTS, EYE-APPROVED, AND IS OUTVOTED BY A LATER KEY. *(Measured 2026-08-13, agent Wend, `1cadbceb`; framing corrected by Jacob 2026-08-14.)*
>
> **Both of these are true and there is no tension between them:** Dolman, West 18th and South 18th **are different streets** — the name changes because the street changes — **and they join in a SMOOTH U**, which must carry no corner. ⭐ **`roadId` never claimed they were one street. It claimed the ROAD RUNS THROUGH**, which is exactly what a smooth U is. The 2026-06-15 cure did that and was eye-approved *("it's finally fixed")*.
>
> ⛔ **What broke it:** `cornerAt` keys on `streetKey = throughId || roadId || skelId || name` (`src/lib/tileGround.js`, grep `const streetKey =`) — **not `skelId`**, as four docs claimed — and **`throughId` is a street NAME** (`cartograph/skeleton.js`, grep `idKeyOf` → `corridor || name`). Added later by the terminal-node sweep and placed **ahead** of `roadId`, so at a name change the key differs and a corner fires. **`roadId` is computed, frozen, and never consulted at the one seam it exists for.**
> ⭐ **THE FIX IS RESTORATION, NOT INVENTION: a through-node if EITHER union agrees** — which keeps `throughId` doing its own job at a spine↔carriageway divided transition, the reason it was added (`derive.js`, grep `Distinct from roadId`).
> ⭐⭐ **BLAST RADIUS IS SMALL AND MEASURED — this is NOT a change to what a corner means everywhere.** The two keys can only disagree where `roadId` says *same road* and the name says *different*, i.e. at a name transition: **LS 6 stations, 3 sites.** Everywhere else both keys agree and the answer is identical.
> ⛔ *(Struck 2026-08-14, and it was Boz's, recorded as Jacob's: "identity is right to say different, so the fix is a GEOMETRY condition on `cornerAt`, and treating the union as one road is barred." That retracted a correct proposal by over-reading a remark, and filed a **regression** as a **missing feature** — the most expensive shape of error in a corpus where the cure is already written.)*
>
> **What actually renders the artifact, measured.** Identity alone is benign: 4 of LS's 6 flagged stations carry Δ`pavementHW` 0.0000 → displacement ≤6 mm. It becomes visible when a **width step rides it**. At West-18th↔Dolman a **1.4369 m unauthored step** across that 3.24° turn puts the two offset lines' intersection **26.15 m** out — past the **18.32 m miter limit — so a CLAMP fires and substitutes a bevel**, emitting two points instead of one: a 1.4786 m chord at 78°/102° to the road. Frozen `iA` runs 5.490 m, swings to 8.826 / 11.075 m across the fillet rounding that bevel, returns to 6.927 m — **excursion 3.34 / 5.59 m off a curb that should be parallel.** That is the tooth-and-chamfer on the U.
> ⭐⭐ **THE CLAMP IS THE TELL.** It is a guard covering for a construction that degenerates as the legs approach parallel — **a cleanup patch living inside the construction**, which the ruling below forbids. ⛔ **The fix is therefore not a better clamp and not a smoother: a near-tangent seam must not enter a line-intersection construction at all.** That is INVARIANT 1 already — *the corner is the band BENT around the arc.*
>
> **Two things left open, both unmeasured — do not close them by reasoning:**
> - **Why the side labels flip at this seam.** The flip and the width step co-occur here; the two non-flipping sites carry Δ 0. **Cause not established.**
> - **Whether `continuesAs` should join these three streets at all.** It builds `roadId`, and `roadId` is what the width reconcile uses to force ONE `pavementHW` per side across the union — plausibly the source of the 1.4369 m step. **Unmeasured.** (Next §, the width-step line: the reconcile compares by literal side label, and this seam joins a *left* run to a *right* run, so the two values that physically meet are never compared.)
>
> ⭐ **The class ports — the test names no street:** `roadId agrees ∧ throughId disagrees`. **LS: 6 stations, 3 sites.** ▶ `node checks/claims-uturn-outer-edge-walk.mjs`
> ⚠️ **`scratch/correctness-detector.mjs` already flagged this** (`West 18th Street: curb(1.45m) bump(97°)`) and it sat unjudged in the "grid false-positives" bucket. **The detector worked; nobody read it.**

### 3.4 The ped FILL — `sectionPass` / `sectionOpen` (`:801` / `:1161`)

`sectionPass(shapeTiles, cw, stripMat, blockCustoms)` strokes the ped cross-section **INWARD** off the frozen curb `iA`: treelawn (outer strip) + sidewalk (inner strip) + the bent corner fill + the ADA pad + the dead-end cap wraps; LU is the flooded remainder. **Mono-width** (one total depth per block → clean concentric outer edge; the divider varies per-edge). The corner is the band **bent** (invariant 1) — a slice of the same continuous offsets, all-SW at the corner (ADA), tangent-trimmed onto the legs. `sectionOpen` is the open-side mate (Wall Phase-D) composing block/curb/asphalt off the frozen `iA` with **no chain handle**.

> **`SECTION.md` is the SSoT for the FILL** — the strip swap, the bent-SECTOR corner construction, the ADA "slide-to-curb", the cap-wrap, the "how to change the corners" guide, and the Section authoring panel all live there. This doc owns only the geometry doctrine; §3.4 is the pointer.

### 3.5 Materials / LU / median

- **Per-LU color:** each tile colors by its own land-use metadata (M1); the treelawn paints its tile's LU color (M2). LU = `blockLandUse[blockKey]` override → `face.use` → weighted hash.
- **Median (divided) — a WALKED FACE (the as-built home; `§1`'s 2026-08-14 ruling is the doctrine).** The median is the block face `extractFaces` produces between the two carriageway chains. **Identity: RETIRING** — today `isMedianTile` reads `phase.role`/`phase.pairKey` (a tile bounded by both carriageways of one pair); `§1` replaces it with the polygon rule, and measured the chain flags to find nothing the polygon does not. ⛔ **A left/right side test was TRIED AND REVERTED** — the measure `side` is point-order-relative *per chain*, so a pair's two carriageways disagree on which side faces the median (Lafayette: A matches the inboard oracle, B does not). **Grass:** the tile's `luRemainder` (the open-field flood, `SECTION §3`) — no clip, no ring. ⛔ *(The "ped bands already zeroed" that used to qualify this is retired by `§1`: ped presence comes from `gleanTreelawn`'s ladder like any other block.)* **Curb:** the universal carve `differenceRings([tile.ring], aFill)`. **The nose, crossings, and no-median all fall out** once the carriageway widths are per-side: where the carriageways converge or a cross-street crosses, their asphalt closes the gap → `luRemainder` empty. `derive.js` keeps only `noseRecs` + corridor **merge asphalt**; the median STAMP RING is deleted. *(OPEN: nose rounds with the standard cap/fillet; the merge-asphalt may be removable once the junction lands — `HANDOFF-junction-construction.md`.)*
- **Median (loop-body):** the enclosed loop interior (Benton / Park Place, `LOOP-STREETS.md`) is the analogous case, still on a Clipper-inset `kind:'median'` ring (frozen `med`, clipped) — **not yet unified** to the walked-face/`luRemainder` path. Separate from the divided median above.
- **Curb stroke** is one continuous polygon per tile, wrapping the silhouette incl. corners (G6), painted OVER the bands so the band-to-asphalt seam hides under it.

### 3.6 The Wall + the bake

Survey-exit freezes the live smoothed `_shapeArtifact` → `shape.json` (`serve.js` POST `/shape`); the full slab bake (`bake-ground.js`) runs the same `buildTileGround` (+ `STREET_SMOOTH`) → the slab. WYSIWYG: live == bake, one module. (`PIPELINE.md` §5 (the Wall), `BAKE.md`.)

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

> ⚠️ **T4 LANDED (2026-07-15) — figure-ground's geometry is deleted; ⛔ T3 IS STILL OWED, and is now the ONLY reason `buildBlockGeometryV2` exists.** The warning that stood here was right and the bill came due: the "real perf/reliability drag" was **285 s of Altadena's 320 s Designer load, drawing nothing** (`_archive/DESIGNER-LOAD-FORENSIC-SUPERSEDED-2026-09-13.md`). Deleted: the unreachable render branch + the `isTileScene` flag that had short-circuited it, `buildChainBandsLive` (the drag sidecar — the census's "residual third representation"), `emitOneBlockRingBands` / `emitBlockRingBands` / `buildFrontageBandsV2` / `silhouetteStraightEmitter`, `blockFill` / `ribbonUnion` / `applyRoundCornersToRing`, the `_v2Blocks` + `measureDragging` wiring, and `buildV2BakeShape` in the bake. ≈1,900 lines. `blockSharp` / `asphaltRounded` / `cornersAtIx` survive **only** as inputs to the fe builder.
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
> ⭐ **Subclass 2 owns most unpainted band metres (see the table above).** Median local width along the unpainted
> arc sits well under a 6.76 m threshold on the affected runs. These are the **tapering wedges Jacob's eye
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
> ⛔ **THE OTHER `width ≥ 2·WB` mass IS NOT THIN AND G12 DOES NOT TOUCH IT.** A set of tiles sit entirely above threshold, with
> wide local widths — including both standing leads, `rutger-street-1|right` and
> `chouteau-avenue-0|right`. `iA` is present and well-formed, the arc is **owned**, the region is
> wide, and nothing paints it. **CAUSE NOT ESTABLISHED.** Killed on the way: unowned arc (unpainted is
> *less* unowned than painted) · "whole leg ⇒ the run was excluded" (a small minority of runs are
> almost entirely unpainted; most are partial) · co-claim (none of the unpainted samples are painted
> by a neighbour — not a partition defect) · corner over-trim (killed by scale).
> ▶ `node scratch/sever24-mechanism.mjs` reproduces every count in this subsection.
>
> ⛔ **SIDE-SKEW IS DEAD — and it inverted.** Normalised over every banded tile, right is the LOWER rate,
> not the higher one the raw counts suggested — ▶ `node scratch/sever24-mechanism.mjs` reproduces both the
> raw and normalised splits. The raw
> right-side majority in the first five samples was **the denominator talking** (right-side runs carry
> more arc). ⭐ Boz proposed this hunt off those five; **it is the third time in one day a shape was read
> off an un-normalised sample** (cf. the offset-producer share, the median hypothesis).
When a tile's interior pinches below the band depth `WB = cw+tl+sw`, the inward offsets collapse past the medial axis → degenerate spurs `filletRing` rounds into thorns. **Two subclasses, both open** (`SECTION-CAP-CLAMP-FORENSIC.md`): (1) self-intersecting blobs (the band-fold-fix is STRANDED on a non-ancestor branch); (2) band-neck / partial-degeneracy (the `cap` clamp fires only on FULL collapse; the `thinTile` signal is computed but orphaned). The fix is the **LOCAL** capacity clamp (engage on partial-degeneracy without over-clamping the in-spec rest of the block — `HANDOFF-band-fold-fix.md`). ⛔ **Not** a corner-R clamp. Verify map-wide, zoomed-out, on Jacob's eye (the pulled-in view hides them).

### 6.2 Phantom park from `classify.js` — OPEN (data/classification) · ⭐ **MEASURED 2026-07-30, and the prescribed fix was aimed at the WRONG TAG**
`classify.js:60` stamps `type='park'` on any face whose centroid falls inside a park-stamping overlay, **first match wins** — and the bucket is `leisure=park` **OR `leisure=garden` OR `landuse=grass` OR `landuse=recreation_ground`**. Residential yards therefore capture whole blocks.

**Measured on the current `ribbons.json` + `raw/osm.json` (replaying the classifier's own overlay loop):**

| | |
|---|---|
| overlays that stamp `park` | a majority of the overlay set, dominated by `landuse=grass` and `leisure=garden`, plus a handful of real parks/recreation grounds |
| faces whose first match is a park-stamper | a small number — mostly caught by a residential yard, not a real park |
| faces shipping `use='park'` | a small number — mostly phantom (via `landuse=grass`), one real |
| phantom `use='park'` area | comparable in scale to the real Lafayette Park face's own area |
| worst single capture | one of the largest faces on the map, stamped by a small lawn (its final `use` recovers to `residential`; the `type` stamp does not) |

⛔ **The documented "~3 LOC: drop `leisure=garden`" fix would repair only a small minority of the phantom catches.** The dominant offender is **`landuse=grass`**, not `leisure=garden`. Any fix must narrow the bucket to genuine parkland (`leisure=park`, `landuse=recreation_ground`) and drop **grass and garden both** — and grass is the one that matters.

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
1. **The square is somewhat small.** 350 m a side vs the OSM trace's larger span ⇒ the authored edge sits a few metres inside the true park edge all round. If that is a slip rather than intent, the fix is `halfWidthMeters`, not the polygon.
2. **`PARK_CENTER` disagrees with it.** `derive.js:1033` uses `{x: -15, z: -15}` for the park-parcel exclusion test while the authored polygon centres on `(0,0)` — a **21 m** offset. Harmless inside a 250 m radius today; it is latent drift.

### 6.3 Curb-as-offset residuals — see the correctness suite
The robust-offset program (D6a) is partial; the RED-until-true detector (`scratch/correctness-detector.mjs`) + `POLYGON-FIRST.md §5` gate the curve-fit cleanliness + corner-roundness. Live state in `BACKLOG.md`.

### 6.4 Dead-end mouth-collapse — FILL-side lever LANDED (eye-confirmed 2026-06-22); ⛔ THREE ITEMS STILL OPEN, at the end of this block
Where a side street **dead-ends/T's into a through street**, `extractFaces` walks it as a **zero-width out-and-back spur** — the face's mouth vertex collapses (tile[53] Albion: `ring[1]==ring[3]`, 0.0 m). The FILL keys corners **by vertex** (`cornerT`), so the two mouth corners collapsed onto one key → one fillet wrapped, the other **butt-capped** (Section-only; curb smooth in Survey, `iA` already carries both mouth fillets). ✅ **FIXED, FILL-side, `iA` BYTE-IDENTICAL** (`spliceDeadEndMouths`-equiv, `opts.deadEndMouthWrap`, `tileGround.js`): (1) **snap** the two spur run-ends to their two fillet apexes → two `cornerT` keys; (2) **trim** the through-road's leg-sector back by a per-mouth disc so the corner wedge (`bandRem`) is free → the bent sector builds at each apex; (3) **synthesize the missing through-leg** on each mouth `cornerT` so the existing **Idea-A deep-leg slide** (`§6.1` step 5) fires → the set-back straight leg dips in. **Bounded per-mouth disc** (centered on the asymmetric fillet midpoint) keeps it local → iA byte-identical on all 101 tiles, multi-spur safe (tile[11]/[43] independent), no 98 m blow-up. **41 mouths / 20 tiles** in the frozen artifact (this line said 39; re-counted 2026-08-04); Benton/Waverly/SV loops excluded (deg-1-tip gate); `kennett-place`/`park-avenue-1` customs segOrd-stable. ⛔ **THE LESSON:** every proxy LIED — two false "LANDED" reports off unfaithful proxy renders; **the operator's eye was the only gate.** And the forensic's "iA-unachievable" blocking constraint was true for *ring-reshape* but moot — **don't reshape the face; the FILL-side lever wins.** ⚠️ **OPEN:** +5 `junction-band` detector flags = the slide's LU ramp-wedge fragments at mouths (eye-call, iA untouched); **8 single-fillet fallback mouths** unwrapped; **strip-swappable** dead-ends not yet rebuilt. Full forensic + wrong turns: `DEAD-END-MOUTH-FORENSIC.md`.

---

## §7. History

- The **13-month corner saga** (what was tried/failed/why, the figure-ground graveyard): [`_archive/RIBBONS-history-2026-06-12.md`](_archive/RIBBONS-history-2026-06-12.md).
- The **retired figure-ground emitter reference** (`buildBlockGeometryV2` data shapes + function-by-function + the dual emitter): [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md).
- git holds the verbatim pre-rewrite `RIBBONS.md`.

## §8. Glossary

- **tile** — a block face of the centerline graph (`extractFaces`); the unit everything is painted onto.
- **grout** — the centerlines, which form the tile edges (the tiles are the faces between them).
- **iA** — the curb edge, the frozen SHAPE: under ① it is ② (`offsetRingByRects`, eased once); on the legacy tile path the per-side offset (`offsetRingVariable`) rounded by `filletRing`.
- **run / leg** — a maximal span of same-street edges on a tile (`groupRuns`); a run seam (street changes) is a **corner**, same street both sides is a **through-node** (`cornerAt`). ⛔ *"Same street" by WHICH id is the live defect — `§3.3`.*
- **fe / frontage edge** — a block-edge between two REAL corners; owns `skelId`, `side`, and the `segOrd`s spanning its through-nodes. The authoring unit (`feCustomKey`).
- **segOrd** — count of IX vertices before a run; the densify-robust run key (vs `intersections.ix`, the fragile index key).
- **mono-width** — one total ped depth per block (clean concentric corners); the divider + materials vary per-edge. "Ribbon monowidth, strips variable."
- **terminal** — `'sidewalk'` (ped zone present) or `'none'` (no ped zone — bare median).
- **anchor** — `'center'` (default) or `'inner-edge'` (divided-carriageway authoring mode; inboard ped zone zeroed).
- **STREET_SMOOTH** — the single smoothing constant (`smoothCenterline.js`), read by every consumer; one curve, concentric by construction. Currently `0`.
- **cw / tl / sw** — curb width / treelawn / sidewalk depths (m), perpendicular, outboard inward.

---

*Updated 2026-06-15 — the tile-model rewrite (v1.0). Promoted the live `tileGround.js` construction into the body; migrated the figure-ground emitter reference to the dated archive. Live siblings: `SKELETON.md` (frame), `SECTION.md` (FILL SSoT), `PIPELINE.md` (execution spine). Verify §3 against `src/lib/tileGround.js` before building.*
