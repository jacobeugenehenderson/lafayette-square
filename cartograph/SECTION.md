# The Section

**The third tool — the ped **FILL**. Section reads the **frozen Survey SHAPE** (the hardscape silhouette) and strokes the pedestrian cross-section **inward** off it: treelawn, sidewalk, the ribbon corner fills, the ADA pad, the dead-end cap wraps. It is the first **consumer** past the Data Wall.** This is its single-source-of-truth reference: what it is, the document it reads, how it builds, the authoring panel it powers, what stays live versus frozen, and where it is today.

> **Status: v0.4 (2026-06-10).** Most of Section is built: the per-edge FILL (`resolvePedDepths` → `sectionPass`), the **mono-width strip swap** (two equal strips; sidewalk-only = "sidewalk then lawn", never collapse), the dead-end caps built into the curb offset (D6a, `[[project_d6a_curb_offset]]`), the live material + depth overrides, the handles riding the achieved curb, **two handles always** (`sideBoundaries`), the **freeze-on-Survey-exit** (the wall auto-saves the SHAPE; no manual sub-bake — `PIPELINE.md` §5 (the Wall)), and the **Revert to Default** UI (`[[project_revert_buttons]]`). ✅ **The CORNER construction LANDED** (2026-06-10) — the bent SECTOR off the frozen fillet, EXACT tangent-trimmed legs, street-edge always concrete (ADA), a **concentric arc at the shallow depth with the set-back walk sliding to the curb on its leg** (Idea A). Full construction + a **"how to change the corners" guide** in §6. Verified neighborhood-wide on the lit app. Open tail (T-junctions, SW↔SW residuals) in §7. **Grounded in code** (`src/lib/tileGround.js`; `MeasurePanel.jsx`/`MeasureOverlay.jsx`). Reference-kind. The pre-build forensic census is **archived** (`_archive/`); its open-tail is folded into §7. Today's tool is still labelled **"Measure"** (the rename rides T3).

---

> ⛔ **THE NARRATIVE LIVES IN `PIPELINE.md` — read it first.** This doc holds **detail only**:
> the mechanism, the schema, the open defect. **What Section is FOR** is now said once, in `PIPELINE.md` step 6 — including the seam test.
> *(The "what this stage is" opening that used to sit here was excised 2026-09-06 in the narrative
> scrub — one storyline, one home. Text preserved verbatim in
> `_archive/stage-doc-openings-2026-09-06.md`.)*

## 1. The vocabulary — what Section names

| Term | What it is | Owner |
|---|---|---|
| **curb edge (`iA`)** | the frozen rounded asphalt-inner ring — the line Section strokes inward from | Survey (frozen input) |
| **the ribbon / band** | the whole ped cross-section wrapping a block inward, curb → property line; **mono-width** (one total depth per block, so the outer edge is a clean concentric wrap) | Section |
| **treelawn** | the outer strip (curb-side); paints in the colour of the **land-use block it abuts** (per-LU) | Section |
| **sidewalk** | the inner strip (property-side), from the divider to the property line | Section |
| **divider** | the treelawn↔sidewalk boundary; its depth is **per-edge** (the variable inside the mono-width ribbon) | Section |
| **ADA pad / bent corner** | the corner *is* the curb ramp → the ribbon **bent** around the arc, an all-SW slice tangent-to-tangent (treelawn lives only on the straight legs) | Section (the corner *fill*) |
| **cap wrap** | a round dead-end keeps the treelawn wrapping the cap; a blunt cap goes all-SW | Section |
| **strip material** | each strip tagged **LU** (land-use flood) or **SW** (sidewalk); the ctrl-click swap | Section |
| **LU** | the land-use remainder — the interior left after the ribbon; **not authored, a flooded remainder** | emergent |

> The keystone phrase (`[[project_ribbon_corner_uniform_width]]`): **"ribbon monowidth, strips variable."** The ribbon's *outer* depth is uniform per block (clean corners); what varies per-edge is the *divider* (where treelawn ends) and the *materials*. If you are reasoning about a Section defect through chains / `pavementHW` / centerlines, you have slipped two stages back — Section's data model is ribbons stroked off a frozen polygon edge, never the chain graph.

---

## 2. The artifact chain — where Section sits

```
Intake → Skeleton → Prebake → Survey → ⟦DATA WALL⟧ → ⟦ SECTION ⟧ → Bake → 3D (Stage)
```

| | The 'thing' | File |
|---|---|---|
| **input** (frozen) | the per-tile hardscape SHAPE Survey froze — incl. each tile's `runs[]` (`skelId/side/segOrd/poly/baseMeasure`) | `public/baked/<id>/shape.json` (the `_shapeArtifact`) |
| **Section authors** | per-edge ped depths + strip materials | `looks/<id>/design.json` (`blockCustoms[skelId][side][segOrd].{treelawn, sidewalk, materials}`) |
| **Section freezes** | the ped FILL geometry (treelawn/sidewalk/LU/curb strokes) | the ground bake → **wall #2 → Stage** |

**Built by** `src/lib/tileGround.js`:
- **`sectionPass(shapeTiles, cw, stripMat, blockCustoms)`** — the FILL construction (the chain-free wall; §3). `blockCustoms` is the **override** input — design intent keyed by the *frozen* run identity, never chain geometry (§3.2).
- **`sectionOpen(shapeTiles, cw, stripMat, stencil, blockCustoms)`** — the open-side mate (Wall Phase-D, `ef460d1`): composes block/curb/asphalt off the frozen `iA` + the FILL via `sectionPass`, with **no chain handle** (`PIPELINE.md` §5 (the Wall)).

The product of all assets, artifacts, and bakes — Survey's SHAPE, Section's FILL, Stage's LOOK — is the **Slab** (`[[project_two_bakes_two_walls]]`).

---

## 3. How it builds — `sectionPass`, the mono-width ribbon off the frozen curb

The wall is enforced **at a function signature**, not by convention:

> **`sectionPass(shapeTiles, cw, stripMat, blockCustoms)`** takes *only* the frozen per-tile polygons + design scalars + the per-edge override (keyed by frozen identity). **Zero lexical handle on streets / chains / measures / centerlines.** Section physically cannot re-derive the *shape*; doing so requires changing the signature. *This impossibility is the wall.*

The model is **`RIBBONS §1` — "ribbon monowidth, strips variable."** One uniform-width band wraps the whole block silhouette; **the corner is that band BENT around the arc, sliced from the same offsets — never a constructed primitive.** Per tile, off the frozen `iA`:

1. **Mono-width inward offsets** (jtMiter, sharing the frozen `bandJoin`): `iC = iA − cw` (curb/treelawn), `iT = iA − (cw + tl)` (the **divider**), `iW = iA − (cw + tl + sw)` (sidewalk/LU). Each clamped to the frozen `cap` (a thin tile degrades to a clean truncated ribbon, never thorns).
2. **The leg zone** = the union of each run's butt-capped slab, pulled back from each corner by `(asphalt-hw + that corner's resolved R)` so the slab ends at the **tangent** — the corner wedge is left for the bent pad.
3. **The bent corner** (G5, `RIBBONS §1` invariants 1+3): the corner is the ribbon bent into an **all-SW** slice from tangent to tangent (treelawn ends at the tangents). A **round** dead-end is the exception — treelawn wraps the cap (a wrap disk), not an all-SW ramp.
4. **Leg strips:** `outerBand = iC − iT` (treelawn) and `innerBand = iT − iW` (sidewalk), each clipped to the leg zone. **Routed per-edge by material** (§3.2): default `{outer:'LU', inner:'SW'}`, overridable.
5. **Output:** `{ Wacc (sidewalk), tlByLu (treelawn per land-use), luByLu (land-use floods) }`; `buildTileGround` unions + stencil-clips these. The block silhouette + curb come straight from the frozen `iA` (`block = ⋃ iA`; curb = `iA − iC`). Nothing reads a chain.

### 3.1 ✅ The best-effort first fill — the default cross-section (LANDED 2026-06-07)

Before the operator authors anything, Section draws a **best-effort default** off the frozen silhouette. The model (Jacob): the system needs only **two things per edge** — **treelawn Y/N** + **strip depths (ADA).** This replaced the old per-tile *averaged* measures (a noisy continuum that drew sub-meter treelawn slivers).

- **Treelawn Y/N is *gleaned from data*, not guessed.** `survey.json` measured `pavementHalfWidth` (centerline→sidewalk); *"tree lawn is the natural gap"* — already in the frame as the `treelawn` field. The LS distribution is cleanly **bimodal**, and the *shape* is what this doctrine rests on: threshold the gap (`TREELAWN_YN_THRESHOLD`, §3.2 below) and Y/N decides itself for the large majority of edges, leaving a small valley for the operator's call. ⚠️ **The old breakdown quoted in earlier drafts of this doc is struck** — it was measured against a `survey.json` denominator that cannot be reconstructed, and multiple sources disagreed on the ambiguous count. Over the shipped `ribbons.json` it reads out that **treelawn-Y is a minority, not the majority the old breakdown claimed.** ⛔ **Do not size the DEFAULT-FILL front off the old numbers.**
- **Strip depths default to ADA-standard — also the Revert state** (Jacob). Treelawn-Y → standard treelawn + ADA sidewalk; treelawn-N → ADA sidewalk abuts the curb. Reset/revert returns here.
- **∴ default fill = (gleaned treelawn Y/N) × (ADA depths).**

**⭐ The default strip *ordering* (the best-effort material assignment).** Every edge has **two strips** (outer = curb-side, inner) **plus** the LU remainder — *always two, even sidewalk-only*. Their default **materials** follow treelawn presence, reading from the curb inward:

| edge | outer strip | inner strip | remainder | reads (curb → block) |
|---|---|---|---|---|
| **treelawn-Y** | **TL** (treelawn, LU-colour) | **SW** (sidewalk) | LU | **TL → SW → LU** — grass buffers the curb, the walk sits back |
| **treelawn-N** (sidewalk-only) | **SW** (the walk hugs the curb) | **TL** (LU-colour) | LU | **SW → TL → LU** |

So the default is `{outer: Y?'LU':'SW', inner: Y?'SW':'LU'}` — the **same two strips, materials reordered.** The operator's ctrl-click swap (§3.2) flips any strip off this default; because strips are just **LU/SW tags**, swapping *both* to LU paints an **open field** (no sidewalk at all). ⚠️ **Construction consequence:** a treelawn-N edge must still emit **two strips** (SW outer, LU inner) — it does **not** collapse to all-SW. The bent corner stays SW (the ADA ramp) regardless of leg ordering.

> **Landed in code:** `gleanTreelawn` + `resolvePedDepths` (`tileGround.js:1089-1150`); the per-edge resolution + the presence-dependent strip ORDERING (Y reads grass→walk, N reads walk→lawn) in `sectionPass` (`:1531-1543`). **⭐ The two strips are EQUAL width — `resolvePedDepths` defaults both to the same standard (`STD_TREELAWN == ADA_SIDEWALK`), and `hasTL` (the gleaned Y/N) drives only the MATERIAL swap, never a width.** So the ribbon's total `cw + tl + sw` is uniform Y or N — the mono-width — and a sidewalk-only edge is "sidewalk then lawn", not a collapsed half-ribbon. Tunables: `TREELAWN_YN_THRESHOLD=0.6`, `STD_TREELAWN=1.5`, `ADA_SIDEWALK=1.5`.

### 3.2 ✅ The override layer — best-effort, then the operator corrects

Authoring is **override on top of the best-effort default**, keyed by the **frozen run identity** (`blockCustoms[skelId][side][segOrd]`). The run carries `skelId/side/segOrd` in the frozen artifact, so `sectionPass` resolves the override off frozen identity + the live `blockCustoms` — **design intent, not chain geometry; it cannot move a vertex, so the wall holds** (§4).

- **✅ Material swap (LANDED 2026-06-07).** `sectionPass`'s per-run material resolution (`tileGround.js:1539-1542`) reads `blockCustoms[...].materials`; overridden runs route their strips by the authored `{outer,inner}` (peeled off the default remainder via per-run zones), default-routed otherwise → **byte-identical when nothing is overridden**. The ctrl/right-click gesture (`MeasureOverlay.jsx:717-753`, `tryFlipStripMaterial`) already writes it. ⚠️ **That write also fabricates depth fields — `ROADMAP` `A16`.** `sectionGeos` depends on `blockCustoms`, so a swap re-strokes the FILL **live off the frozen curb** — the curb sits still.
- **✅ Depth override (the per-edge FILL, §3.3 — LANDED).** The treelawn/sidewalk **depth** override (`blockCustoms[...].treelawn/.sidewalk`) is read by `resolvePedDepths` — the one resolution shared by the FILL stroke *and* the handle placement (§5, "one depth truth"). Unauthored, it defaults to the standard pair, **except a side whose measure says `pedRealm:false` (an `expressway=yes` road), which defaults to zero** — the curb stays; the override still wins. ▶ `node checks/claims-a-frontage-can-ask-for-no-ped-band.mjs`. The handles ride the achieved curb (`sectionCurbRings`) so they line up. ⚠️ Interactive *responsiveness* is gated by the whole-map rebuild (each override re-strokes every tile) — the perf/D6d block-local rebuild is the open item, not the wiring (`[[project_d6a_curb_offset]]`).

### 3.3 ⭐ The per-edge FILL — LANDED (`RIBBONS §1`+§3.4, on `sectionPass`)

Each leg's strips stroke at *its own* depth, the divider varying inside the mono-width ribbon, corners taking the **max of their two adjacent legs** so the bent quad is clean. This is the `RIBBONS §1` mono-width model (sector slicing) realized on `sectionPass` (the `cornerT` max-adjacent map `tileGround.js:1631` + per-leg `sector` slabs `:1793-1820`). What it does:

1. **Resolve a single per-edge depth** = `blockCustoms[run].{treelawn,sidewalk}` (override) **else** the best-effort: **both strips EQUAL width** (`STD_TREELAWN == ADA_SIDEWALK`), with the gleaned Y/N driving only the material swap. Use this **one** resolution everywhere — the FILL *and* the handle placement (§5) read it, so they cannot diverge.
2. **Mono-width per block, divider per edge.** Keep the ribbon's *outer* depth `WB = cw + max(TL) + max(SW)` uniform per block (clean corners), but slice each leg's **divider** between its two strips. Outer strip = `outerBand ∩ leg-sector` to the per-edge divider; inner strip = the rest. (`RIBBONS §1`, invariant 4 — mono-width.)
   - **Two strips always, EQUAL width — swap, not collapse (§3.1).** A treelawn-N (sidewalk-only) edge emits both strips at full width — outer SW, inner LU/lawn — it does **not** collapse to a half-ribbon. Each strip's default material follows treelawn presence (`{outer: Y?'LU':'SW', inner: Y?'SW':'LU'}`), then the per-edge `blockCustoms.materials` override (§3.2) flips it. All-LU on both → an open field.
3. **⭐ Corner depth = `cw + max-adjacent`.** A corner's bent pad is the `fullBand` slice at the **deeper** of its two adjacent legs' totals. So an **SW↔SW corner (no treelawn either side) comes out sidewalk-deep**, a TL-adjacent corner full-depth. The corner is the band bent (`RIBBONS §1` invariant 1), tagged SW — never a constructed primitive. *(The corner material refinement — SW↔SW → concrete→LU — and a robust construction are OPEN; see §6.)*

**Invariants (sacrosanct — they held through the build and bind any future FILL change):**
- ⛔ **The mono-width ribbon is SACROSANCT** — it was the hardest-won step (`RIBBONS §1`, the V1 keystone; the corner saga ended on it). The per-edge work **varies the divider + materials + depths INSIDE the mono-width band**; it must **never** re-architect or abandon the uniform outer offset that gives the clean bent corners. Build *on* the mono-width, never replace it.
- **The FILL spans curb → block-center.** The ped strips (TL/SW) are slices near the curb; the **LU remainder fills the interior continuously to the polygon center** — there is no hard "property line" cap, the ribbon's inner edge was collapsed to center (so the open-field case, all-LU curb→center, falls out for free).
- Stroke off the **frozen `iA`** + **frozen `runs[]`** + `blockCustoms` (design intent) — never a chain. The silhouette/`vertR` are Survey's, frozen; do not touch them. Material-swap and depth both route through the **same per-run resolution** off frozen identity.
- **The gate is SHAPE-byte-identical + a classified FILL delta — NOT FILL-byte-identical** (corrected 2026-06-07, Metcalf's catch). The §3.3 rules *intentionally change the un-authored render at mixed tiles* — two-strips-always reshallows N-legs to ADA+LU, max-adjacent reshapes corners, the divider goes concentric to the (possibly flared) frozen curb, N-street dead-ends lose the tile-uniform grass collar. So: **asphalt / curb / block must be byte-identical** (the silhouette + wall untouched), and the **FILL delta must fall entirely inside those intended classes** (nothing else moves). "FILL byte-identical when un-authored" was self-contradictory and is retired.

---

## 4. ⭐ The keystone — freeze the *silhouette*, author the *FILL* live

**What freezes (the SHAPE):** `ring` · `iA` · `vertR` · `fillets` · `runs[]` identity · and — since
the 2026-09-07 flip — the **STAMP**: `iaStamp` (per contour point, the run that owns it), `iaFull`
(the uncut contour it indexes), `iaCorner` (**①'s** corners, carried onto ②'s contour).
**What stays live:** every ped depth, the divider, the materials, the bent corner. ✅ **`bands` is
gone from the tile; the FILL is frozen nowhere.** Survey and Section agree to 0 m² because they run
the **same painter**, which is what "the same thing" was always supposed to mean.

▶ `node checks/claims-proto-fill-is-live.mjs` · `node checks/claims-a-swap-never-happens-mid-street.mjs`
*(`claims-ped-resolves-per-leg.mjs` was cited here and in `RIBBONS §1` and has never existed. ⛔ A
pointer that does not resolve reads as evidence already gathered.)*
⛔ Re-run them; do not quote numbers from here.

### ⛔⛔ THE FIVE RULES THIS SECTION IS BUILT ON — every one was already written, and every one was broken on 2026-09-07
*Each cost hours. They are restated here, once, because they were true and buried.*

1. **ONE resolution per LEG** — §3.3 step 1, §5 "always per-fe". *(Jacob: "a treelawn swap never
   happens mid-leg, period. That's what the corners are for.")* ⛔ Resolving per contour POINT is
   finer than the ruled unit and lets the arrangement change inside a leg — the operator's join line.
2. **A LEG runs between two CORNERS, and the CORNER IS ①'s** — `RIBBONS §1`: *"① IS SHARP; smoothing
   is SKELETON and rounding is SURVEY."* ⛔ Reading the corner off ②'s contour reads the ROUNDING:
   ② eases 90° into ~12 vertices of 7.5°, so a turn test finds **zero corners on a rectangle**.
3. **The treelawn is the block's own colour** — §1. *(Jacob: "all the TL needs to know is that it's
   the same color as the center.")* ⛔ One resolver for face and strip, or they drift.
4. **A difference between blocks is the PRODUCT** — `CLAUDE.md` Layer 0 q3. ⛔ A road's chains
   genuinely carry different treelawn (South 18th: twelve values). Merging them averages away the
   survey.
5. **A chain cut is not a corner** — ① has no nodes. `RIBBONS §3.3`: a through-node if **EITHER**
   `roadId` or `throughId` agrees; ⛔ `throughId` is a NAME, so `throughId ?? roadId` makes `roadId`
   unreachable — a **recorded regression**, re-committed here on 2026-09-07 for want of reading it.
6. ### ⛔⛔ **AND THE POSITIVE FORM RULE 5 NEVER STATED — WHICH IS WHY RULE 5 DID NOT SAVE US.**
   *(Jacob, 2026-09-07: "The protopolygon doesn't have a node/corner there in the first place.")*
   **A corner is a vertex where ① TURNS.** ⛔ This read *"…**and** the owner changes"* until
   2026-09-08; the conjunction is RETIRED and the sentence is excised rather than bannered — a
   chain label vetoed 54.8% of LS's arcs, all turning 90°, each refusal a missing ADA ramp
   (`RIBBONS §1`). Rule 5 says what a corner is NOT;
   with no rule saying what it IS, the corner test fell back to the only thing to hand — the owner
   label — and that is a chain identity wearing a shape's job. ⛔ **A prohibition without its
   positive is half a rule, and the half that is missing is the half the code will invent.**
   ⭐ It cost a whole block face painted as ADA ramp, on the map the operator was looking at.
   Full law, both halves and why not the turn alone: `RIBBONS §1`.

### ⛔ OPEN
- **Cap folds** — one chain's two sides meeting at a tip. `§6.3` rules it (the bulb has NO halves,
  one cross-section, whole to the cap owner). **Not built.**
- ⭐⭐⭐ **THE RAMP — the curb ramp. ✅ BUILT, and it is the WHOLE corner construction.**
  *(Named 2026-09-07. Jacob coined "the angled slope corner joiner" that morning and RETIRED the
  word the same night: "'joiner' sounds like chains." He is right, and the name would have caused
  the bug — **a joiner joins two things, and there is only ONE shape**; anyone building to that word
  builds something that stitches two pieces together, which is the walk model climbing back in
  through the vocabulary.)*
  ### ⭐⭐⭐ RAMP vs SLOPE — TWO NAMED THINGS, AND THEY ARE THE BAND'S TWO EDGES *(Jacob, 2026-09-08)*
  > **"The Ramp is the ADA pad, and the Slope is the sidewalk angling to meet the inner silhouette
  > of the mono-width."**

  | the name | WHAT it is | which boundary it moves | in code |
  |---|---|---|---|
  | **the RAMP** | **the ADA pad** — the concrete reaching the street. ⛔ Ramp and pad are ONE thing, not two | the walk's **OUTER** edge, to the kerb | `walkFromD` · `wFrom` |
  | **the SLOPE** | **the sidewalk angling to meet the INNER SILHOUETTE of the mono-width band** | the walk's **INNER** edge, to the arc's depth | `walkToD` · `wTo` |

  ⭐⭐ **THAT IS WHY THE BAND MUST BE CARRIED ON BOTH EDGES, AND WHY WATCHING ONE OF THEM IS A
  FALLBACK.** The two names are not two constructions — they are the two boundaries of ONE band, and
  each has its own target: the ramp's is the **kerb**, the slope's is the arc's own resolved depth
  (`§6.1` step 4's `cMin`). ⛔ A gate that measured only `walkFrom` reported 0 discontinuities while
  the inner edge stepped a whole sidewalk width at every mixed corner.

  ⛔⛔ **AND THIS IS HOW TO READ JACOB'S EARLIER SENTENCE, WHICH COST A WHOLE PASS ON 2026-09-08:**
  > *"TL↔TL the ADA ramp appears below, **no ramp**."*
  **The first "ramp" is the RAMP — the pad. The second means the SLOPE.** At TL↔TL the legs AGREE, so
  the inner edge has nowhere to travel: **no slope**, and the lawn dead-ends **blunt**. The pad still
  appears, because it is unconditional. An agent reading both words as one thing removes the pad
  along with the slope — which is exactly what happened. ⛔ **"No ramp" NEVER means "no pad."**

  ⇒ The three configs, in the disambiguated vocabulary: **SW↔SW** — the walk is already at the kerb,
  so the ramp is subsumed and there is no slope · **SW↔TL** — ramp, **plus a slope** on the deeper leg
  · **TL↔TL** — ramp (the pad), **no slope**.
  ⚠️ **`rampLen` is named for the wrong one of the two.** It is the length of the on-leg transition
  — the SLOPE's run — and `§6.2` calls it "the slope RATIO" in the same breath as calling it
  `rampLen`. Left as-is because it is load-bearing in two painters; **read it as `slopeLen`.**

  ### ⭐⭐⭐ THE RULE, IN JACOB'S WORDS — **EVERY CORNER GETS A RAMP** (2026-09-07)
  > *"every corner gets a joiner/ramp. Sometimes, that means it's subsumed by the SW <> SW. but if
  > it's TL <> SW, a slope appears to connect the different depths. TL <> TL the ADA ramp appears
  > below, no ramp."* · *"The ADA Ramp should be flush to the curb through the whole ramp. The slope
  > is applied to the LEG, not the corner."* · *"AND IT DOESN'T TAPER, IT SLOPES."*
  ⛔⛔ **IT IS UNCONDITIONAL, AND THE TWO DEPTHS DECIDE ONLY WHAT IT LOOKS LIKE.** The three configs
  are three OUTCOMES of one construction, not three cases to branch on:
  | config | the two walk depths | what appears |
  |---|---|---|
  | **SW↔SW** | both at the kerb, equal | **nothing — the ramp is SUBSUMED.** Zero length by construction |
  | **TL↔SW** | different | **a SLOPE**, connecting the two depths |
  | **TL↔TL** | both set back, equal | **the ADA pad BELOW** (outboard of the walk, reaching the street) — **no slope** |
  ### ⭐⭐⭐ THE SLOPE IS ONE MULTIPLIER ON THE LEG — AND THE ARC HAS ONE DEPTH.
  ⛔⛔ **THIS READ *"the corner gets NOTHING — no cross-section, no pad depth"*, AND THAT HALF WAS
  A REGRESSION, MEASURED 2026-09-08.** The corner **constructs** nothing — invariant 1 stands, no
  primitive, no sector, no bid — but it **resolves ONE depth for the whole arc**, `§6.1` step 4's
  `cMin = min(both legs' conD)`. ⭐ An arc's OWNER CHANGES at its middle — that is what makes it
  span TWO legs, and it is why one depth must be resolved for the whole arc. ⛔ **It is NOT what
  makes it a corner**: ① TURNING is (`RIBBONS §1`, 2026-09-08). So with no depth of its own, each
  half of the arc takes its own leg's cross-section and
  the two meet at a **step, mid-arc** — the operator's *"there's not supposed to be a hard edge
  angle in the middle of the corner."*
  ⭐⭐ **`min` IS NOT A PREFERENCE — IT IS READ OFF THE SHIPPED SLAB**, the map whose corners were
  correct: the corner's walk runs kerb → the **shallower** leg's concrete depth, ~5:1 over the
  deeper one, in all three arrangements. ▶ `node scratch/_fx-slab-corner-spec.mjs <slabdir>`
  ### ⭐⭐⭐ THE LEGS DECIDE THE CORNER — **BOTH ITS EDGES** *(Jacob, 2026-09-08)*
  > *"The legs decide the corner."* · *"The ramp is coexistent with the arc."* · *"The ADA ramp
  > connected the sidewalk to the street. The sidewalk always has to have access to the street."*
  `min` decided the arc's INNER edge and nothing decided its OUTER one — it was hardwired to the
  kerb. That was the one place a leg did not get to decide anything, and it is `RIBBONS §1`
  invariant 1's forbidden case wearing a default's clothes: a corner with a cross-section of its
  own. At **TL↔TL both legs AGREE the grass is at the kerb**, and the arc overrode them both.
  ⇒ The arc resolves its outer edge from its legs by the same `min`, so **SW↔SW and SW↔TL are
  byte-identical** (a leg at the kerb resolves 0) and **only TL↔TL moves** — kerb+0.00→3.00 becomes
  **kerb+1.50→3.00**, the legs' own ladder bent round the arc. Measured on both towns.
  ⛔ **AND THE RAMP MUST BE SIZED FROM BOTH EDGES** — a ramp sized from one is too short for the
  other, so its vertices are never inserted and that edge steps instead: the same one-edged
  blindness in the CONSTRUCTION that the gate had in the MEASUREMENT. The leg's own outer strip is
  a FLOOR, not a constant — at a frontage change there is no arc to target and a kerb-side leg
  would otherwise compute zero travel. Dropping it cost HPDM 574 → 633 leg↔leg steps.
  ### ⭐⭐⭐ AND THE PAD IS THE SIDEWALK CONTINUING TO THE KERB ACROSS THE TREELAWN — **MADE FROM THE TANGENTS**
  > *"The pad is the sidewalk continuing to the curb across the treelawn, it is made from the
  > tangents."* (Jacob, 2026-09-08.)
  So the arc's outer edge **is** the kerb, and that is not the arc overriding its legs — it is the
  ADA ramp, the sidewalk's access to the street, which the legs' cross-section cannot provide.
  ⛔⛔ **"NO RAMP" AT TL↔TL MEANS NO *LEG TAPER*, NOT "NO PAD" — and mistaking the one for the other
  cost two passes.** `_archive/CORNER_DEBUG.md` had the word all along: **"Treelawn always
  dead-ends (ADA curb ramp). The sidewalk fills through behind the treelawn's blunt end."**
  **BLUNT.** The lawn runs FULL WIDTH to the tangent and stops; the pad fills through behind it.
  ⇒ **Made from the tangents ⇒ the pad's extent is exactly the arc** — "coexistent with the arc",
  never longer. What made it read as one blanket was the LEG taper carrying it `rampLen` up both
  legs and eating the treelawn well past the corner. Removing the taper at TL↔TL (`travel` is 0
  there, because the legs agree) is the whole of it: ramp edges LS 652 → 504, HPDM 8980 → 4124.
  ⭐⭐ **A BLUNT END IS NOT A CHEVRON, AND THE GATE HAD TO BE TAUGHT THE DIFFERENCE.** The step at a
  TL↔TL tangent is the authoring gesture's intended output; scoring it as damage is `CLAUDE.md`
  Layer 0 q3 committed by an instrument. It is **recognised, never suppressed** — the predicate is
  the arc side sitting at the kerb and the step measuring the leg's own outer strip, and anything
  else at a tangent still counts. **The count is exactly 2 × the TL↔TL corners** (LS 148 = 74 × 2),
  which is what makes it a class rather than a tolerance.
  ⚠️ **And the same probe settles a doctrine question:** grass at the kerb inside a corner happens
  in the correct map — a few percent of corners. **UNCOMMON, NOT FORBIDDEN** (Jacob, 2026-09-08).
  ⛔ So `§6.1` step 3 is a default, never a gate, and no check may score it as a defect.
  ⚠️ **`claims-every-corner-is-one-of-three` CANNOT SEE THIS AND CURRENTLY LIES IN BOTH DIRECTIONS:**
  step 4 routes the band beyond `cMin` to `tlByLu[lu]`, which is the *treelawn accumulator*, and the
  gate tests "is there lawn anywhere across the pad's full depth" — so it scores the prescribed
  parcel fill as *grass on the ADA pad*. **Open; do not tune against it.**

  ### ⭐⭐⭐ THE SCALAR MOVES THE **STRIP**, NOT ONE OF ITS EDGES — restored 2026-09-08
  What exists on the leg is one scalar `k`: **1** along the open leg, **0** where the leg ends,
  ramping across vertices the painter inserts on the leg itself. **It carries BOTH of the walk's
  boundaries** — the outer to the kerb, and the inner to the arc's own `cMin` — which is `§6.1`
  step 5's `slidQuad`, whose four corners `pt(0,0) · pt(rampLen,tloD) · pt(rampLen,conMax) ·
  pt(0,cMin)` travel on both sides. The ground the walk vacates inboard is step 5's `luWedge`,
  routed to `tlByLu[lu]` — parcel, never an absence.
  ⛔⛔ **THE PORT KEPT ONLY THE OUTER EDGE, AND THAT WAS THE WHOLE DEFECT.** `walkTo` stayed pinned
  at `lim` while `walkFrom` ramped, so the walk **widened** along the leg instead of **sliding**,
  then met the arc at a step of exactly `lim − cMin`. **It was never a corner defect: the corner
  resolved correctly and the leg arrived at the wrong cross-section.**
  ⭐⭐ **AND IT WAS A RESTORE, NOT A BUILD** (`[[feedback_it_was_finished_restore_dont_rebuild]]`).
  The construction was already in `sectionPassTile` and had been shipped; the stamp painter dropped
  a piece in the port. ⛔ The first attempt at it *did* rebuild — it assumed the inner edge's target
  was the leg's own width rather than the arc's `cMin`, which is true only at a mixed corner. That
  made TL↔TL slide when it must not, and cost HPDM 1228 → 4906 steps while LS improved: **town #2
  punishing an LS-shaped guess, inside one edit.**
  ⇒ A kerb-side walk is untouched (SW↔SW subsumed, `wFrom` is 0 for every `k`); at TL↔TL `cMin` is
  `lim`, so the inner edge has nowhere to travel and only the grass goes. **The three configs are
  still three outcomes of one multiplier, with no case split.**
  ▶ `node checks/claims-the-slope-is-on-the-leg.mjs <scene>` — ⛔ **it now gates BOTH edges and
  CLASSIFIES the steps.** Watching one edge is a fallback inside the detector: it read `walkFrom`
  only and reported 0 while the inner edge stepped 1.50 m at every mixed corner.
  - **A leg ends in exactly three places and they are ONE test**: an eased corner's **tangent** ·
    ①'s **square** corner (R = 0, so the ease made no arc) · a change of **frontage**. ⛔ No gate on
    the two depths, so TL↔TL is not skipped and the additive quad that used to cover the
    no-corner case is gone.
  - **The corner's EXTENT is CARRIED, not recovered** — `iaArc`, stamped by the ease that made the
    arc, beside `iaCorner`, which says only *where*. It replaced matching the frozen `fillets`'
    tangent coordinates back onto the contour, which is `A15`'s forbidden proximity recovery and
    failed **worst on the most authored town**.
  - ⛔ **The cure is NOT to merge the chains** — that averages away the survey (rule 4) and was
    built and excised the same day.
  ▶ `node checks/claims-the-slope-is-on-the-leg.mjs <scene>` — the acceptance: a DERIVED feature is
  checked by CONTINUITY, so it counts discontinuities in the walk's outer depth across one vertex,
  on the **densified** ring. ⛔ Reading ①'s own edges cannot see the ramp and reports the step it
  removed.
  ▶ `node checks/claims-the-corner-extent-is-carried.mjs <scene>` — scores the carry against the
  tangent match it replaced, both columns from one run.
  ⛔ Re-run them; never quote a figure from here.
  ### ✅ THE LAWN IS THE BAND THE WALK IS NOT (built 2026-09-25): ped envelope minus the walk, one material, so no sky hole
  and no lawn∩walk overlap by construction. ▶ `claims-the-ground-covers-every-block.mjs [--selftest]`. ⛔ OPEN: Huron's island
  tile 118 hole · the walk's own offsets keep backwards lobes · ⭐ **the first-round paint must ASK what each frontage is**
  (Jacob) — only the expressway rule and the treelawn glean ask; beaches and islands get walks. ▶ `node scratch/walk-data-coverage.mjs`.
- **`protoBands` is a second ③** (`blockAt`, frozen ① at scalar widths), drawn nowhere, read by five checks — it disagrees with the drawn ③ wherever a taper exists. OPEN: retire it, or build it from ②'s working copy.
- **The fe-key partition** — authoring writes `blockCustoms[skelId][side][segOrd]`; ①'s runs carry a
  DIFFERENT segOrd partition, so a majority of LS's authored slots resolve to no run at all. `§7`'s
  **T3**; its gate `scratch/t4-fe-parity.mjs` is stale and unrun. ⛔ **This is NOT the "swap one, all
  four swap" symptom** — that was the ② label carry (an EDGE label read off a VERTEX stamp on a
  reversed ring, `RIBBONS §1`, 2026-09-07) and it is fixed. Two defects shared one sentence.
  ▶ the slot count is a check, not a number to quote: `node checks/claims-stamp-follows-the-edge.mjs`
  for the carry, `t4-fe-parity.mjs` for the key.
- ⚠️ A `shape.json` poured before the flip still carries `bands`; that path draws and **warns**. The
  cure is a re-pour.

## 5. The authoring panel — the FILL controls (and the one-depth-truth rule)

Section authors a thin per-block-edge overlay keyed to Skeleton identities. Surfaces: `MeasurePanel.jsx` · `MeasureOverlay.jsx` · `measureModel.js`.

| Control | What it does | Writes |
|---|---|---|
| **Curb / Treelawn / Sidewalk** entry fields | hand-type a depth in ft; commits on blur / Enter | per-fe `blockCustoms[…].{curb,treelawn,sidewalk}` |
| **Treelawn-outer** handle | drags the **divider** (treelawn depth) | per-fe `blockCustoms[…].treelawn` |
| **Property-line** handle | drags the sidewalk depth | per-fe `…sidewalk` |
| **Strip-swap** (⌃ / right-click in a strip) | flips that strip's material **LU ↔ SW** | `…materials.{outer|inner}` |
| **↺ Revert to Default** (footer button) | clears **every** Section ped override → the calculation re-seeds | strips `treelawn`/`sidewalk`/`materials` from `blockCustoms` |
| **⌃-click / right-click a ped handle** | reverts **that one edge** to the calculated default | strips the Section fields off that fe's slot |

> **⭐ Section edits are ALWAYS per-fe, one side (excised the modes 2026-07-18).** The **whole-chain** and **symmetric-mirror** modes were removed from Section: the ribbon is inherently per-side (every fe its own node), so those modes fought the model and dragged the *wrong* segments into an edit (the venn-overlap that produced the "flip hits the neighbor, not the leg" bug). The **"whole street" head-start comes from the automatic survey best-guess** — real OSM sidewalk presence feeding `gleanTreelawn` — **not a manual batch mode**; per-fe override handles the exceptions. If a manual batch is ever wanted it returns as an *explicit action* button, never a persistent mode. **fe resolution is by NEAREST FRONTAGE POLYLINE** (`nearestFeForSide`, both the flip/drag and the selection ordinal) — corner-safe, replacing `naturalSegmentOrdinal(frame.segI)`, which misprojected an offset click across a bend's vertex to the neighbor segment. Storage fans one arrangement across the fe's owned segOrds at write time (`feSegOrds`, `useCartographStore`) so the fes-less **bake** reads it raw. *(Survey keeps its own whole-chain + symmetric knobs for street **widths** — untouched.)*

### 5.1 Revert — the way back from autosaved edits

There is **no commit step** — every drag autosaves, so revert is how the operator gets back. Section's "Default" **is the calculation** (gleaned treelawn Y/N + ADA depths, §3.1) — no blessing or snapshot is needed, because clearing the override re-seeds the calc by construction. Two scopes, both field-scoped so reverting Section never touches Survey's widths or corners:

- **Whole-scene** — `revertSectionToDefault()` strips the Section fields (`treelawn`/`sidewalk`/`materials`) from every `blockCustoms` slot. The footer button (`MeasurePanel.jsx`) is disabled when `sectionOverrideCount()` is 0 and confirms before firing.
- **Per-edge (the surgical fix)** — `revertFeSectionToDefault(fe)` strips just that fe's Section fields. Bound to ⌃-click / right-click on a ped handle (`MeasureOverlay.jsx`'s unified `handleCtrlOrRight`; context-menu suppressed).

This mirrors Survey's revert layers (Skeleton / Default), minus the blessed layer — Survey needs a *snapshot* to return to (its inputs are surveyed, not calculated); Section's default falls out of the calc for free. Store + vocabulary: `[[project_revert_buttons]]`.

Three rules the canon is firm on:
- **⭐ One depth truth (achieved).** The handle is **positioned from the same per-edge depth the FILL strokes** — both read `resolvePedDepths` (§3.3 step 1), and the handle rides the achieved curb (`sectionCurbRings`, the frozen `iA` the FILL strokes off) rather than centerline-ruler space. So the handle sits *on* the strip. The remaining symptom — a drag feeling "sticky" — is **perf, not the wire**: every edit re-strokes the whole map (D6d, `[[project_d6a_curb_offset]]`), not a divergence between handle and FILL.
- **All writes are polygon-scope (per-fe), one side, in `blockCustoms`** — `chain.measure` is read-only pipeline input (V2-Measure, `RIBBONS §5`). There is no Section edit *mode* — a click/drag/type edits exactly the block-edge it lands on (the whole-chain + mirror modes were excised 2026-07-18; see the panel note above).
- **The asphalt-edge handle (`pavementHW`) is NOT Section's** — it moved to Survey. Section shows **only its own** ped handles.

---

## 6. The corner is two things, in two tools

The line that resolves the long corner saga (`ARCHITECTURE §2.1`, "conflating these two is the root of the corner mess"):

- **The corner *shape*** — how round the curb silhouette is (the radius) — is **Survey**, frozen into `vertR`.
- **The corner *fill*** — how the ribbon bends around it: the bent all-SW pad, treelawn ending at the tangents, the cap wrap — is **Section**, stroked live off the frozen arc.

So "author the corners in Section" means the **fill**, not the radius. The fill is a **slice of the ribbon bent around the arc**, never a constructed primitive — bending the band around the arc IS the corner.

### 6.1 ✅ The corner construction — LANDED (2026-06-10)

> ### ⛔⛔ TWO PAINTERS, AND THE FIVE STEPS BELOW ARE THE OTHER ONE'S.
> **`sectionPassTile` — the WALK painter — is what this section describes**, and it still runs on a
> tile with no per-point stamp. ⛔ **It is not what draws the map.** A tile carrying `iaStamp` takes
> `sectionPassProtoTile` — the STAMP painter — dispatched by `hasStampInquiry`, and its corner is
> `§4`'s RAMP: no sector, no tangent trim, no bid, no decline, nothing constructed at the corner at
> all. ⭐ **Read the five steps as the walk painter's construction and the vocabulary it fixed**
> (`conD`, `cMin`, the ADA street edge); read `§4` for what the map does. ⛔ Which painter ran is a
> question about the TILE, never a flag: `hasStampInquiry` reads it off the tile's own shape.

The walk painter's corner is built entirely off the **frozen fillet** the curb actually rounded there (`shapeTiles[].fillets[] = {apex, C, r, tA, tB}`, frozen by `filletRing` in the shape pass). The pipeline, in order:

1. **The bent SECTOR** (`arcSectorPoly`). The corner region is the mono-width band bent around the arc — a wedge whose **outer edge is the curb arc itself** (radius `r` about the fillet centre `C`), **inner edge its concentric offset**, and **sides the two tangent radii** (`tA`/`tB`). Extended up each leg by `c.trim` so it laps the leg slabs (closes the leg↔corner seam). `pad = shallow ∩ sector`. **No disk, ever** — `circlePoly` is only a dead-end-cap helper.
2. **EXACT leg trim** (`tangentTrim`). Each leg strip is trimmed to **where its fillet tangent actually begins** — `dot(tangent − node, legDir)` off the frozen fillet — not the old `e.a + R` approximation. This is what makes the leg strips meet the arc with no cream step / green sliver. (Falls back to `e.a + R` only where no fillet rounds the corner.)
3. **Street-edge ALWAYS concrete (ADA).** The curb side of the corner is the ADA ramp — concrete — *always*. Treelawn never wraps the curb.
4. **CONCENTRIC arc at the shallow depth** (Idea A). The arc is a clean constant-offset ring at `cMin = min(both legs' concrete depth conD)`, where `conD = mat.inner==='SW' ? total : outerWidth` (a set-back-sidewalk leg → full `total`; a curb-side SW leg → its one strip width). The band shallower than `cMin` → concrete; deeper → **LU (parcel-matched, via `tlByLu[lu]`)**.
5. **The deep leg SLIDES to the curb** (Idea A). The deeper (set-back) leg's sidewalk slides to the curb over a short **ramp on its own straight leg** — the treelawn taper out, the walk's deep tail becomes parcel — so by the tangent it's a curb-side walk matching the concentric ring. Built as two polygons in a local `(along-leg, depth)` frame at the tangent (`pt(s,d) = T + dir·s + perp·(cw+d)`, `perp = C→T`): a **slid-walk quad** (`[0,cMin]` at the tangent → `[tloD, conMax]` up the leg) added as concrete, and an **LU wedge** (`[cMin,conMax]` at the tangent, tapering to zero up the leg) carved from the SW strip (`swCarve`) and routed to LU. `rampLen = max(2, 2·(conMax−cMin))`.

> ### ⭐⭐⭐ WHERE THE PAD IS — AND THE ANSWER IS THAT IT IS NOT *LOCATED* AT ALL
> **`RIBBONS §1` INVARIANT 1 IS THE WHOLE OF IT, AND IT OUTRANKS EVERY REFINEMENT BELOW:**
> > *"The corner is the band BENT around the arc — a slice of the same continuous concentric offsets
> > — **never a separately-constructed primitive** (no per-corner pad)."* · *"The same cross-section
> > persists from straight-spans into the corner… **same materials, same depths**, bent around an
> > arc… it is what naturally happens when the band follows the rounded curb silhouette."*
> ⛔ **So "where is the pad located" is the wrong question, and asking it is what produced four
> constructions in thirty hours.** The band is already continuous through the corner; nothing is
> placed there. ⭐ **`§6.1` step 5 is how that coexists with step 3** — but ⛔ **ONLY WHERE THE LEGS
> DISAGREE.** At **SW↔TL** the treelawn tapers out along the leg, so the cross-section arriving at
> the corner is already at the kerb and the corner carries it through unchanged: the transition is
> on the leg, and what moves is the DIVIDER, the one thing invariant 4 licenses to vary.
> ⛔⛔ **AT TL↔TL IT DOES NOT TAPER — IT DEAD-ENDS BLUNT** (2026-09-08). The legs agree, so there is
> nothing to travel and the ramp is zero-length; the lawn runs FULL WIDTH to the tangent and stops,
> and the pad fills through behind it, tangent to tangent. `_archive/CORNER_DEBUG.md` had the word:
> *"Treelawn always dead-ends (ADA curb ramp). The sidewalk fills through behind the treelawn's
> blunt end."* ⚠️ And step 3's *"treelawn never wraps the kerb"* is a **DEFAULT, never a gate**
> (`§4`, 2026-09-08: grass at the kerb inside a corner is UNCOMMON, NOT FORBIDDEN); ⛔ no check may
> score it as a defect.
> ⛔ **THE PALIMPSEST IS RETIRED** — three stacked answers ("the arc" → "the owner changing" → "① turns
> AND the owner changes"), each correcting its predecessor without deleting it, none ever reconciled
> against invariant 1. → `_archive/SECTION-pad-location-palimpsest-2026-09-07.md`. Two facts from it
> stay live because they are properties of the code, not of the doctrine:
> - **The corner MARK is `iaCorner`, and it is the EASE'S OWN PER-VERTEX STAMP: `EC.arc[i] != null`.**
>   ⛔ **This read *"① turns AND the owner changes"* until 2026-09-08 and the conjunction is RETIRED**
>   — the owner is a chain identity, it vetoed **54.8% of LS's arcs** (same 90° median turn as the
>   ones it licensed), and every refusal was a missing ADA ramp. ⛔ And it must be read off the ease,
>   never off `protoTurns`, which is keyed by LABEL and smears the mark down a whole frontage.
>   Full form + the two-jobs lesson: `RIBBONS §1`, "the corner test, in its corrected form".
> - **An arc's extent is `len` EDGES, not `len + 1`.** The inclusive bound also claimed the first edge
>   of the next leg, and on ①'s sparse contour a straight frontage is ONE EDGE — a quadrilateral block
>   painted 458 m of 458 m as curb ramp. ▶ `SECTION_DUMP=1 node checks/claims-the-pad-is-the-size-of-the-corner.mjs`
> ⚠️ **AND ONE DOC/CODE DISAGREEMENT, RESOLVED IN FAVOUR OF THE CODE:** step 5 above writes
> `perp = C→T`; `sectionPassTile` computes `C − T`, i.e. **T→C**, and it must, because `d` increases
> INWARD from the kerb toward the arc centre. **The arrow in step 5 is backwards.**

> ⭐ **The RAMP is unconditional and lives in `§4`.** ⛔ Not restated here — one home.

**What each corner type comes out as** (all from the SAME construction — the flat cases fall out):
- **TL↔TL** (both set back) → ⭐⭐⭐ **the legs' own cross-section, bent: GRASS AT THE KERB through the
  whole arc, walk behind it.** ⛔ **NOT "all concrete to `c.T`"** — that read was the arc overriding
  both legs, and it paved every TL↔TL corner as one blanket. See `§4`, THE LEGS DECIDE THE CORNER.
- **SW↔SW** (both at curb) → concrete one width + LU (cMin = the SW width; carve, no slide).
- **SW↔(TL\|SW)** (mixed) → concentric ramp at the SW depth + the TL walk slides in on its leg.

### 6.2 ⭐ How to change the corners

The corner is a small, legible pipeline — each knob is one spot in `sectionPass`:

| To change… | Edit |
|---|---|
| **how round / how deep the arc reads** | `cMin` (step 4) — currently `min(conD)`. Use `max` → concentric at the deeper depth (Idea C: shallow walk fattens). Use a constant → fixed ADA width everywhere. |
| **what's concrete vs parcel at the corner** | the `conD` rule (step 4, recorded per leg) — it decides how deep concrete runs before LU. |
| **the ramp gentleness** | `rampLen` — ⛔ **read it as `slopeLen`: it is the SLOPE's run on the leg** (the RAMP is the ADA pad — `§4`'s vocabulary block). A ratio, `2 ×` the depth to travel, in both painters. |
| **the leg↔arc seam tightness** | `tangentTrim` (step 2) + the sector `margin` — ⛔ WALK PAINTER ONLY; the stamp painter has no seam to tighten. |
| **whether the corner wraps treelawn at all** | step 3 doctrine — today the curb is always concrete; to let treelawn wrap, route part of `concrete` to `cornerTreelawn` instead (this is the *reverted* "wrap" experiment — see history). |
| **a smooth S vs straight transition** | a `smoothstep(u)=u²(3−2u)` on any of the depth interpolations (we used it on the earlier divider-taper; the slide is currently linear). |

**Alternatives tried + rejected this session** (so we don't re-walk them): the **disk-masked** pad (a forbidden primitive); **treelawn wrapping the curb** (violates "street-edge always concrete"); the **divider-taper** with a straight then S-curve inner edge (the scoop dipped deeper than the adjoining walk — didn't read concentric). Idea A (concentric arc + slide the deep leg) is the keeper.

**Two facts the construction must never lose:** the corner is a **slice of the band, bent** (never a built primitive); and the **street-edge is always concrete** (the ADA ramp).

> ⚠️ Verify corner changes **on a render / the lit app**, never on shape-byte proofs — the EYE is the gate (`[[feedback_shape_proofs_dont_gate_fill_geometry]]`). The flat scratch proxy (`scratch/section-open.mjs`, `sectionOpen` on the frozen artifact) is the fast loop; the lit 5173 app is the final say.

### 6.3 ⭐ The dead-end cap is an end COUPLER — LANDED (2026-07-22)

Doctrine set by Jacob during the cap pass; it governs the whole dead-end class.

- **The ribbon folds, not the chain.** The chain runs once to the tip; the *ribbon* follows it up one side and back down the other. A cul-de-sac frontage is **one fe folded on itself** — so it is chopped at the two **shoulders**, and each leg becomes its own fe with its own side (`buildBlockGeometryV2.capFoldSlices`). Before this, v2 emitted one fe under one `side` token and the returning leg had **no customs slot at all** (46 of LS's 50 caps) — the root of "a dead-end leg flip renders Δ=0.0".
- **The bulb has NO halves.** It is one **continuous semicircle** carrying ONE cross-section — the cap's own. Splitting it between the two legs invents a seam that isn't there. When the legs disagree the bulb goes whole to the cap owner (the canonical `left` leg, the side `makeCapFe` already stores on); the operator overrides by flipping the cap.
- **The cap is a COUPLER, not a corner.** Its two shoulders are corners in the **lane-switch** sense, not the bending sense — *"a point on both sides of the ribbon to create the slope if necessary."*
- **Width is germane, not just parity.** The coupler meets a sidewalk and a treelawn at each end and *"starts and ends with possibly different widths"* — so the shoulder transition tapers **depth** as well as crossing the strips.
  > ### ⛔⛔ AMENDED 2026-09-07 — **EVERY SHOULDER GETS A RAMP.** *(Jacob: "This same regime applies to end caps.")*
  > This read *"it fires **only on a real difference** (arrangement or width), so an inherited cap has
  > none"* — the same guard shape struck at the corner the same night: **a transition made CONDITIONAL
  > on the thing it exists for.** ⭐ The regime is `§4`'s RAMP, and it is the same at both:
  > **the two ends decide the FORM, never WHETHER.** Equal parity and equal width ⇒ the walk's two
  > slots coincide and the depth taper has zero travel ⇒ the transition is **zero-length and draws
  > nothing.** It is SUBSUMED, exactly as SW↔SW is at a corner — an outcome, not a branch.
  > ⭐ **MEASURED, not asserted: removing the guard entirely is a geometric NO-OP** — sidewalk and curb
  > byte-identical either way, which is what "subsumed" predicts. So uniform caps DO stay
  > byte-identical; that was the true half. It survives in the code as a cheap skip and is commented
  > as NOT a decision. ▶ `node checks/claims-survey-and-section-agree.mjs`
- ⚠️ **A road may be authored with different `pavementHW` per side** (Nicholson Place = left 2.50 m, right 6.70 m). Any dead-end detector keyed on "both shoulders at the same radius" is wrong by construction — grow by the radius **jump** and confirm with a **signed** ~180° sweep.
- ⛔ **The MOUTH is a different layer — and it is a CO-CLAIM, not a gap** (classified 2026-07-22, `scratch/cap-mouth-classify.mjs`). The spur collapses to a zero-width slit in the face walk; measured, the mouth is **0 m² unclaimed** and **~15 m²/mouth claimed by TWO layers at once**. So it is an **identity** defect, not a missing-fill one — which is why the junction-band cannot gate it and why `mouths` (a FILL-layer patch over the slit) is the wrong shape of cure. ⛔ **Do not FILL-patch it** (that class was tried and reverted — `_archive/THROAT-JUNCTION-FINDINGS-SUPERSEDED-2026-09-13.md`). It belongs to the junction-construction class (61 of 152 LS junctions fragment) and its brief was ARCHIVED 2026-07-30 (`cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md`) — live doctrine now in `POLYGON-FIRST.md` + `PIPELINE.md §5 (the Wall)` — *the polygon must ask the stamp*, i.e. carry node identity onto the emitted face so the FILL **reads** ownership instead of negotiating it. *(`_archive/BRIEF-dead-end-mouth-junction-RETIRED-2026-07-22.md` §3 survives as the evidence appendix; its §4 fix direction is superseded.)* ⚠️ **Waverly is NOT this class** — loop×loop (E2/E3); the mouth fix will not touch it.

*Also fixed in that pass, upstream of the FILL: `tileGround.js:3216` wrote each ring edge's asphalt depth under BOTH directed keys, so on a zero-width slit the second leg clobbered the first and **22 of 48** dead-end chains drew at one side's width. Directed keys now keep the two legs distinct.*

> ### ⭐⭐ UPDATE 2026-07-25 — the open tail is ONE upstream defect, and the fix is not in Section
>
> The "7 legs still unresponsive" below, the leg-flip class, and the mouth co-claim are **the same defect,
> and it is not a Section defect**: the face freeze never closes a polygon at a dead end. **ALL 50 tips
> are zero-width slits**; the **40** that look right are held together by the mouth-wrap snap (a FILL-layer
> patch), and the **9** without a mouth disc are exactly where the eye fails — South 18th among them.
>
> ### ⭐⭐⭐ SHARPENED 2026-07-30 (Jacob) — the missing piece is **THE CORNER**
>
> A corner is built where **two different streets meet** (`cornerAt(a,b)` = corner iff `a !== b`,
> `RIBBONS §1`). The doubled-back ring visits the spur's mouth vertex **twice** — and on
> `south-18th-street-3` those two visits are the bit-identical coordinate `(386.30, 149.10)`
> (`ring[2]` ≡ `ring[4]`, `scratch/coupler-slit-anatomy.mjs`):
>
> ⭐ **The `coupler-*.mjs` probes were PORTED TO TRUNK 2026-07-30** — they derive folds from the frozen
> artifact alone (`node scratch/coupler-slit-anatomy.mjs`). ⛔ The BRANCH originals still read Slice-1
> fields and print a silent, lying `0` on trunk — don't re-copy them. Full note + the corrected counts:
> `POLYGON-FIRST §2.1`.
>
> | mouth vertex | incoming → outgoing | corner? |
> |---|---|---|
> | 1st pass | `kennett-place` → `south-18th-street-3` | ✅ different streets |
> | 2nd pass | `south-18th-street-3` → `south-18th-street-3` | ❌ **same street both sides** |
>
> ⇒ **On 9 of LS's 50 spurs, the mouth gets a corner on ONE side and NONE on the other.** ⛔ **NOT all 50** —
> `coupler-slit-anatomy.mjs` Check 5, map-wide: **41/50 spurs have a corner at EVERY mouth pass; 9/50 miss at
> least one; 9/50 have a leg running THROUGH the mouth.** The class is real and this is its mechanism, but
> **sizing a prebake re-founding off "all 50 are unbounded" overstates the prize by ~5×.** *(Corrected
> 2026-08-04; the adjacent "most leg slots ARE clickable — the defect is BOUNDING, not EXISTENCE"
> correction below also over-swung: bounding holds on the majority too.)* Where it does fire: a leg is normally
> bounded **corner-to-corner** — that boundary is what makes "select this leg" a region, what stops an edit
> at the leg's end, and what tells the cap/mouth machinery where they sit. One leg is therefore bounded and
> the other is an unbounded run-through, which is exactly this class's triad: **the edit lands on a SEGMENT
> not the LEG** (no far corner to fan to) · **the partner flips** (same line, sides labelled from walk
> direction ⇒ inverted 34/34) · **the neighbouring corner and cap move** (with no second mouth corner, the
> mouth *patch* is defining them).
>
> ⭐ **Why the coupler could not finish it, and why that is not its failure:** the walk-ordinal key gave the
> two legs distinct, correct names, fully gated. **But naming a thing does not give it edges.** It fixed
> *which leg you mean*; it could not fix *where that leg starts and stops*, because there was no second
> mouth corner to couple to — which is why the eye still saw all three defects on South 18th *after* it
> landed. Read "workaround" as *solved the naming half*, **not** as *wrong idea*.
>
> ⚠️ **CORRECTION to the paragraph above — "nothing to click" over-generalises.**
> `scratch/coupler-fe-coverage.mjs` on trunk: **98 of 107 dead-end leg slots DO have a clickable frontage
> edge; 9 do not** (all 9 have an fe on the opposite side; the branch original counted Slice-1 walk slots,
> 191 of 198 — same shape, different denominator). The unresponsive tail is real but is the
> *minority* symptom. **The dominant defect is BOUNDING, not EXISTENCE.**
>
> ⭐ **The test for any proposed fix: does it CREATE THE SECOND MOUTH CORNER?** A notch (road-with-width
> subtracted from the disc) does — two genuine mouth corners, one per side, plus a real end — so every leg
> is bounded `corner → cap` like any other leg on the map. If a proposal does not create that corner, it is
> another way of managing the absence.
>
> ⛔ **Nothing in this section can fix it.** An addressing scheme was built for it (a side-free
> walk-ordinal key, branch `polygon-asks-stamp`) — measured, gated, and **retired**: it re-derives identity
> from a chain trace after the Wall. ⛔ Do not fan the write across the leg range, do not restore the mouth
> on the 9, do not key differently. **Answer the hole, not the cover.**
> Live task: **`_handoffs/HANDOFF-deadend-face-resolution.md`** (prebake) · rule: `POLYGON-FIRST §2.1` ·
> `cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md §10/§11` is **retracted at the layer**.

> **Scoreboard after the pass (2026-07-22):** three defects fixed **at source** — cap slope · leg flip · width collapse. Most legs now respond. ✅ **Some asymmetric caps ACCEPTED** on Jacob's eye (they are correct, not a defect — see the per-side `pavementHW` warning above). **Open tail:** a handful of legs still unresponsive; some caps flip with no visible change (pre-existing). ⚠️ **A SHAPE-pass fix is invisible until `shape.json` is re-baked** — re-bake before judging on the eye (`[[feedback_shape_pass_fix_needs_rebake_before_the_eye]]`).

---

## 7. Where Section is today

> ## ⛔⛔ THE ROOT OF THE BROKEN SIDEWALK — the corner ribbon's takeover is CONDITIONAL
>
> **Frame (Jacob):** *"ALL CURBS WORK."* · *"Survey works as expected; it is the Measure/Section customs
> tool that doesn't."* · *"The sidewalk should be one continuous smooth line all around the entire polygon."*
> **Symptom:** the ped band stops short of **some** corners. Some, not all.
>
> ⛔ **Read the design record before proposing anything here — the construction is not new and the corner
> doctrine is settled.** `_archive/RIBBONS-figureground-emitter-2026-06-15.md` (`emitOneBlockRingBands`,
> 2026-05-29 — the mono-width ring band, and §"What carried forward" = the four invariants binding the tile
> model) · `_archive/RIBBONS-history-2026-06-12.md §6.9` (the AASHTO/ADA corner-ribbon doctrine, 7 points)
> and **`§7`** (the 13-month corner saga: every construction tried, shipped or reverted, with its lesson).
> ⭐ **What that record describes — *"three inward Clipper offsets … `jtMiter`, 2 strips + sector slicing;
> the corner is the `fullBand` slice"* — is what `sectionPassTile` builds today, under the same names.**
>
> ### Design → code, so nobody re-derives it
>
> | design | `tileGround.js` |
> |---|---|
> | three inward offsets of the block ring, `jtMiter` | `ringAt(d)` = `offsetRings(iA, −(cw+d), 'miter')` — `:59`, `:1296` |
> | the continuous mono-width band | `fullBand = differenceRings(iC, iW)` — `:1301`; `bandRem` = its unclaimed part — `:1320` |
> | sector slicing for material tags | `sector = strokeOpen(trimPolyline(run.poly, t0, t1), …)` — `:1450`; `claim = bandRem ∩ g.sectors` — `:1484` |
> | 2 strips | `claim − ringAt(g.o)` / `(claim ∩ ringAt(g.o)) − ringAt(g.total)` — `:1489` |
> | the corner is the `fullBand` slice | `arcSectorPoly(…) ∩ bandRem` — `:1585` |
> | *(no design term)* | everything unclaimed → `luRemainder` — `:1642` |
>
> ⭐ **The sector is the LABEL, not the geometry.** Every strip boundary is a concentric offset of `iA`; the
> sector only decides which **arc** carries a group's `(outer depth, total depth, outer mat, inner mat)` —
> runs group by exactly that 4-tuple (`gkOf`, `:1341`). ⛔ So *"give the FILL a continuous ring"* is not the
> cure: it has one.
>
> ### ✅✅ THE BAND IS PAINTED FROM THE PARTITION (`07e65753`, 2026-08-11) — and the diagnosis it cured is EVICTED, not bannered.
>
> On a tile carrying the `iaEdge` stamp, `iA` is cut at every fillet's two tangent points and at every
> ownership change outside a fillet; **each owner sweeps its own arc inward**, and adjacent arcs close on
> the **same inward bisector** — so **step over and step back are ONE cut, and a gap is not
> constructible.** The corner owns its arc rather than bidding for it.
>
> ⛔ **THE ~40 LINES OF DIAGNOSIS THAT STOOD HERE ARE RETIRED** to
> `_archive/SECTION-corner-takeover-decline-2026-09-07.md` — the walk painter's four decline modes, the
> per-town mix, the two dead gates. They described `sectionPassTile`'s conditional takeover, which was
> scoped in this doc as *"still live on UNSTAMPED tiles."*
> ⭐ **THAT POPULATION IS EMPTY.** ▶ re-derive, never quote:
> `node -e "import('./scratch/_proto-feed.mjs').then(async({feed,buildProto})=>{const M=await import('./src/lib/tileGround.js');for(const s of ['lafayette-square','hipointe-demun']){const f=feed(s);if(!f)continue;const T=buildProto(f,{protoArtifact:true}).protoShapeTiles;console.log(s,T.length,'tiles ·',T.filter(t=>M.hasStampInquiry(t)).length,'stamped')}})"`
> ⛔ **A correction banner sitting next to the false sentence it corrects is the anti-pattern**
> (`CLAUDE.md`): the false sentence is shorter and gets read first. The banner's job is done when its
> subject is gone, so the subject is gone. ⚠️ If the legacy walk painter is ever reachable again, the
> account is in the Diary — and the honest next step is that **dead code gets EXCISED, not archived**
> (`[[feedback_dead_code_gets_excised_not_archived]]`), which `sectionPassTile` is now a candidate for.
>
> Five predicates decide whether a corner exists and whether the pull-back is exempted. **None reads the
> curb:** `cornerAt` (⛔ **not `skelId` — it keys on `streetKey = throughId || roadId || skelId || name`,
> and `throughId` is a NAME placed ahead of `roadId`, so the name-transition cure never fires. A
> REGRESSION with an existing cure — `RIBBONS §3.3`**) · `tipped` · `through` · `isNameTransition` ·
> `isThruNode`
> (all `:1416`). `isThruNode` keys the wrong run where a through-street splits into two skelIds (Mackay) and
> misses Kennett on a node-coord mismatch. Canonical complex: **Dolman ↔ West 18th ↔ South 18th**, with
> Carroll and Kennett.
>
> ### ⭐⭐ JACOB NAMED THIS BLOCK AS THE DEFECT, 2026-08-11 — and ruled out everything upstream of it
> *"It's already correct in the survey tool, so it's only the **corner naming** and the **ribbons reading the
> labels**."* Said of the Carroll frame, after the severance there was confirmed **real** and the SHAPE layer
> confirmed **correct**. ⇒ **Frame ✅ · Survey ✅ · curb ✅** — the five predicates above are the site.
> - ⭐ **This is `A15`'s falsifiable tell, instantiated:** at a dead-end mouth the ring position is
>   unambiguous and `cornerAt` still mints nothing, because a doubled-back spur's second pass is
>   `spur → spur` and the predicate needs two **different** streets. **The geometry knew; the label didn't.**
> - ⛔ **So a dead-end / cul-de-sac symptom does NOT route to the skeleton, to intake, or to a same-name
>   weld.** An arc on 2026-08-11 took it upstream on all three counts and every one was refused —
>   `_archive/A0-deadend-history-2026-08-11.md §4`. ⛔ And it is **not** a FILL patch either: clamp, wrap,
>   re-key and snap were each built and reverted (`§7`, `A10`).
>
> ### The cure — honour doctrine 4
>
> ⛔ **The FILL-PATCH class is CLOSED — do not clamp, wrap, re-key or snap.** The band-neck clamp, the
> walk-ordinal coupler, the mouth wrap and `SPUR_OUTLINE` were each built and reverted; each treats the
> *output* of a wrong decision.
>
> **Ring ownership is a PARTITION** — every point of `fullBand` belongs to exactly one run or one corner,
> never to two independent masks that happen to abut. A corner with no fillet still owns its arc:
> invariant 3, *the ADA pad is a band-slice, not predicated on the arc — works square OR round*. ⭐ **Two
> constructions already behave this way and are the model:** a **one-owner tile takes no sector at all**
> (`:1321` — whole concentric annuli, no corners, no trimming), and the **round-cap reclaim** pulls band
> back out of `luRemainder` and re-routes it to the cap owner's own material (`:1664`) — the very repair
> this needs, already built, bounded to dead-end tips.
>
> ### ✅ The partition ALREADY EXISTED — and the build confirmed it (`07e65753`): no new key was needed.
>
> `groupRuns` (`:1060`) groups consecutive ring edges sharing `(streetIdx, side)` and consumes the whole
> ring ⇒ **every ring edge lands in exactly one run**, already frozen into `shape.json`.
> ▶ **`node checks/claims-ring-partition.mjs`** — ⛔ run it, don't quote it; **only "0 double-covered
> edges" is the live gate.** Off-ring run vertices land on **dead-end** tiles (**A0**) and do not block this.
>
> ⇒ **The defect was a ROUND TRIP** — the FILL took each run's polyline back out, re-stroked an **area**
> (`strokeOpen`), trimmed it and intersected it with the band. ⭐ **A partition cannot leave a gap; an area
> mask can.** Identity was never in the mask, so this needed **no re-key and no parity gate** — which is
> what killed the walk-ordinal coupler. ✅ **And the open question — does painting per-arc reproduce
> today's geometry where it is correct — was answered by the gate: `a03` identical, `--inert` green on 8.**
>
> ⛔ **Preserve — all already working:** the **mono-width envelope**, `WB = cw + max(TL) + max(SW)` over the
> **tile's** edges (`:1286`), so authoring an edge deeper grows the whole block's band while shallower routes
> its residual to LU (`:1511`) ⇒ **the envelope is per-BLOCK, only ownership is per-edge, and the partition
> runs purely along the ring** (§3.3 step 2) · the bent corner as a band slice (§6.1) · the inside/outside
> strip swap with its RAMP (§3.1, §6.1 Idea A) · **`jtMiter`, never `jtRound`** (invariant 2).
>
> ⭐ **On clamps — settled 2026-05-30, don't re-open it.** `§6.9`.5 (*"no cusp guard; self-intersection is
> signal, not error"*) governs **geometrically MEANINGFUL** degeneracy: the authored input shrinks the
> offset to a point, arc or clean self-clip that is still topologically coherent (corner R approaching the
> ribbon depth; a divider authored at `W`). **No clamp — trust Clipper; the authored R is the design
> control.** It does **not** govern **MEANINGLESS** degeneracy: `W` past the block's medial axis inverts the
> offset and `differenceRings` returns the **complement**, flooding the interior with band material. That
> needs a **topological capacity guard, which is not a doctrine clamp** — it is what `:1198`/`:3601` already
> are (`cap = 0.9 × inscribed`). **The test:** apply the authored input and inspect the Clipper output — a
> smaller/simpler version of the input's structure is regime 1; inverted or reversed-winding is regime 2.
> Full rule: `[[feedback_no_corner_radius_clamps_in_emit]]`.
>
> *Troubleshooting archaeology 2026-06-12 → 2026-08-06: `_archive/SECTION-fill-tail-2026-08-07.md`.*

**LANDED (on `curb-offset-draw`):**
- **§3.1 best-effort fill** — treelawn Y/N gleaned + ADA depths; the noisy slivers gone.
- **§3.2 material override** — per-edge LU↔SW swap reads `blockCustoms`, re-strokes the FILL live off the frozen silhouette; byte-identical when un-overridden.
- **§3.3 per-edge depth + divider** — the mono-width slice (`RIBBONS §1`): the depth override renders, the corner takes `cw + max-adjacent` (`cornerT`).
- **The mono-width strip swap** — two equal strips; treelawn Y/N is a material decision, not a width (sidewalk-only = "sidewalk then lawn", never collapse). ⛔ **The two painters' corners are NOT the same construction** — `arcSectorPoly` in the walk painter, `§4`'s RAMP (one multiplier on the leg, nothing at the corner) in ③'s.
- **Dead-end caps in the curb offset** — LEGACY path only (`offsetRingVariable`'s `capAt`); under ① a cap is two corner nodes (§6.3).
- **One depth truth** — handle placement and FILL stroke both read `resolvePedDepths`; the handle rides the achieved curb (`sectionCurbRings`).
- **Revert UI** — whole-scene + per-edge (§5.1).

**The open tail** — the ring partition above is the one *build*; everything below it is finish work:
- **Perf / D6d — the gating item.** Every override re-strokes the whole map (the `tileGeos` whole-map memo); interactive handle/drag work can't be cleanly validated until the rebuild is block-local. This blocks *validation* of the handle responsiveness, not the wiring. (`[[project_d6a_curb_offset]]`.)
- **Cap ped-wrap (G8)** — remaining: the asphalt blunt-*cap* SHAPE notch (an `offsetRingVariable` / frozen-`iA` item, not the FILL) + the undiagnosed Bentley Pl round-cap bug.
- **Capacity guard (G12)** — two subclasses (`SECTION-CAP-CLAMP-FORENSIC.md`): (1) **self-int blobs** — the band-fold-fix addresses these but is **stranded on `8e1e414`, never landed**; (2) **band-neck / partial degeneracy** (the Albion cul-de-sac **pinch** — ⚠️ renamed 2026-08-11: it was "notch", which now collides with the SHAPE notch class in §7.1; this one is a FILL pinch, a different defect) — the `cap` clamp (`:2396`) fires only on **full collapse**, and the `thinTile` signal (`:2383`) that flags the partial case is **computed but wired only to `bandJoin`**, never to the depth clamp. Completion = wire the local thin-tile reach into the clamp (local, not per-tile). ⚠️ **First classify the band-neck case by the regime test above** — a clamp is licensed only where the Clipper output actually inverts (regime 2); if the neck merely pinches to a coherent narrower band, `§6.9`.5 applies and there is nothing to clamp.
- **⭐ NEW LEAD (2026-08-07) — 4 tiles whose runs leave the ring with NO dead-end tip to explain it:** altadena tiles 45 / 159 / 501, centrum tile 234 (`claims-ring-partition.mjs`). Every other off-ring case in every scene sits on a dead-end tile and belongs to A0; these four do not, and **Lafayette Square has zero of them** — invisible on the mould, which is the whole reason the check runs per scene. Undiagnosed; a lead, not a finding.
- **T3 — retire `buildBlockGeometryV2`.** It survives only as the frontage-edge identity builder (`feCustomKey`) the Measure/Survey handles read. Migrate that onto the tile `runs` (same `[skelId, side, segOrd]` triple, `tileGround.js:935`) and the file dies. Gate on fe-key parity (`scratch/t4-fe-parity.mjs`) — a drifted key silently orphans authored customs.
- **Rename Measure → Section** — cosmetic, last; rides T3.
- **Ped-band junction construction / per-edge continuity.** The weird-street FILL mess at junction-dense, name-shift-crossing streets (Dolman ↔ West 18th ↔ South 18th; Carroll, Kennett). ⛔ **Not a FILL build** — `iA` has 0 self-intersections there; the cure is upstream, in the SHAPE campaign (the skeleton produces correct geometry off which the ped derives). ⛔ Do **not** build a separate ped-silhouette: one SSoT polygon per junction, from which asphalt, curb, treelawn and sidewalk all derive (`OSM2STREETS-GROUNDING §1.2`). Live home: `BACKLOG §NOW`. *Full 2026-06-12 forensic + the two sub-cases (dead-end mouth-collapse, the default-fill front): `_archive/SECTION-fill-tail-2026-08-07.md`.*

**Upstream, not Section:** intersection-everywhere corner-silhouette residuals disrupt the FILL because the *frozen `iA`* is disrupted — fix in Survey/skeleton (Section inherits the clean edge). Divided carriageways are gated to legacy (the curb offset collapses a median gap) — a corridor-leg follow-on, not a FILL bug.

### 7.1 The SHAPE / FILL diagnostic frame (folded from the census)

Every visible defect attributes to **one** tool — the line that resolves the long corner saga:
- **Corner *shape* too round/square, R=0 ramps, exterior arms stop short, median slivers, ⭐ silhouette NOTCHES/spikes** → **SHAPE** (Survey, the frozen `iA`). Section inherits it; not Section's to fix.
  > ⛔ **The notch class is NOT G12 / band-fold, and it is NOT the offset.** Routed to both and disproved by measurement, 2026-08-11 (Jacob, on Park Place: *"the spike defects are in the survey"*). A notch = a **<2 m ring segment turning >40° in OPPOSITE directions at each end** — a step out and back; ⛔ an acute-angle test finds needles, returns **0** here, and is how it was first mis-reported as absent. **LS: 8 notches, 2 tiles, identical in the live build and the baked artifact** (so `live == bake` holds). **Both tiles are `carve / median-divided` and never run the offset — 0 overlap with the reversal sign test, both directions ⇒ the class belongs to `A06`.** Re-run, don't quote: `node scratch/claims-notch-origin-bisect.mjs`.
- **ADA-tangent glitch, point-ramp collapse, thorns, cap ped-wrap, per-edge depth, strip swap** → **FILL** (`sectionPass`). Section's own geometry — diagnose in the inward strokes, never back through chains.

When in doubt: a too-round or too-square *curb* is Survey; how the *ribbon bends* around it is Section.

---

## 8. The doctrine, in one place

- **⭐ Always populate best-effort, then override.** Sane default with no action (§3.1); authoring is pure override (§3.2). Never start from blank.
- **⛔ Ribbon monowidth, strips variable — and the mono-width is SACROSANCT.** One uniform outer depth per block (clean corners); the **divider + materials** vary per edge. The corner is the band **bent**, a slice — never a built shape. The mono-width was the hardest-won step (the corner saga ended on it); the per-edge work builds *inside* it, never re-architects it.
- **The FILL is curb → center.** Strips near the curb; the LU remainder flows to the polygon center (no hard property line). Both-strips-LU → an open field.
- **Two strips always — AUTHORABLE, VARIABLE widths — they SWAP, never collapse.** *(Jacob, 2026-09-07: "inside that variable mono-width there are exactly two strips, with authorable, variable widths.")* ⛔ **EQUAL width is the calculated DEFAULT, not the rule** — this line said "EQUAL width" flatly and every session that read it built a fixed-width model. The **divider handle** authors where they meet; the **property-line handle** authors the band's total (§5). Treelawn-Y reads `grass → walk → lawn`; treelawn-N reads `walk → lawn`. The gleaned Y/N is a **material** decision, never a width — a sidewalk-only edge is the same ribbon with the materials swapped, not a half-ribbon. Both→LU is an open field.
- **The corner is the band BENT** — a slice, never a primitive (`RIBBONS §1` invariant 1), and ⛔ **NOT predicated on the arc: it works square OR round** (invariant 3). ⛔ **Nothing is constructed there and it has no cross-section of its own.** ①'s `iaCorner` says WHERE; `iaArc` says how far it reaches; the depth that arrives is the **leg's**, already at the kerb. `§4` (THE RAMP).
- **⭐ THE THREE CORNER CONFIGS, IN THE OPERATOR'S WORDS** *(Jacob, 2026-09-07)*, and they apply **at corners only**:
  · **SW↔SW** — "the corner is just a continuous stripe around the outer band." Nothing is added; the walk is already the outer strip and already reaches the curb. *(This retires the "SW↔SW → concrete→LU refinement" that stood here as open.)*
  · **TL↔TL** — "the sidewalk wraps around, but there is an added ADA pad to get the pedestrian to the street."
  · **SW↔TL** — a SLOPE connecting the two depths.
  ⇒ **One rule, no case split: the grass slopes out ALONG THE LEG, so the walk arrives at the street already.** ⛔ `walkTo` and the leg's arrangement are untouched, or the frontage stops responding to authoring. ▶ `node checks/claims-swap-reaches-the-paint.mjs`
- **⭐ END CAPS FOLLOW THE SAME RULES** *(Jacob, 2026-09-07)*: **no centre seam in a cap**, and where a cap meets its legs **the same connectors apply**. `§6.3` owns the coupler; ⛔ the fold is still unbuilt.
- **⛔⛔ AND THE ONE-LINE TEST FOR ALL OF IT — `RIBBONS` Slice 2, ruled 2026-08-14: THERE IS EXACTLY ONE LICENSED HARD SEAM, `ADA → TL|LU`. ANY OTHER HARD SEAM IS A DEFECT.** Leg into corner, corner into cap, block into block are offsets of one contour, so a seam there is not constructible. ⛔ **The joints are not seam LOCATIONS — they are the places most REQUIRED to be seamless**, and "a seam belongs at a real corner, a block end, or a cap" is struck by name as the exact inversion.
- **One depth truth** — the FILL stroke and the handle placement read the *same* per-edge depth, or they diverge (§5).
- **Section = FILL; Survey = SHAPE.** Section never authors the silhouette or the corner radius.
- **Revert is the way back; Default IS the calc.** Edits autosave (no commit), so the operator reverts to undo. Section's Default falls out of the gleaned-treelawn + ADA calc — no blessed snapshot (that's Survey's, whose inputs are surveyed not calculated). Whole-scene + per-edge (⌃-click), field-scoped so Section never wipes Survey (§5.1).
- **Freeze the silhouette, author the FILL live** — off the frozen `iA` + frozen run identity + `blockCustoms` design intent. The FILL was never meant to be frozen; this does not abrogate the Wall (§4).
- **The wall is the `sectionPass` signature** — design intent may cross (keyed by frozen identity); chain geometry may not.
- **Smoothing is deliberately OFF (deferred, not abandoned).** Raw RDP polylines are acceptable; naive re-enable scallops the bands 10× (2026-06-04 retirement). The eventual way is to smooth the offset bands/output rings (D5) — *comfort churn*, explicitly not-now.
- **A Section defect is a FILL problem** — diagnose in `sectionPass`'s inward strokes, never back through chains.

---

## Cross-references
- `RIBBONS.md §1` — **the four invariants + "ribbon monowidth, strips variable" (the model §3.3 builds to)** · `§3.4` (the FILL pointer) · `§4` (the corner, by home). *(The V1 figure-ground corner resolution is archived: `_archive/RIBBONS-figureground-emitter-2026-06-15.md`.)*
- `SURVEY.md` — the SHAPE tool whose frozen `iA` Section strokes off.
- `PIPELINE.md` §5 (the Wall) — the freeze between them; `§4` the Phase-D mechanism.
- `_archive/SECTION-CENSUS-2026-06-03.md` — the **pre-build forensic census** (Stratum): the inventory, wall audit, and SHAPE/FILL defect frame that proved Section was a wiring job. Did its job; its enduring open-tail + diagnostic frame are folded into §7. Archived 2026-06-10.
- `ARCHITECTURE.md §2.1` — the three tools; the two-corners distinction.
- `PIPELINE.md step 6 (Section)` — the execution spine.
- `src/lib/tileGround.js` — `sectionPass` (the wall + per-edge override), `resolvePedDepths` (the one depth truth), `sectionOpen` (open-side), `buildTileGround` (host); `MeasurePanel.jsx` / `MeasureOverlay.jsx` (the controls + revert gestures); `stores/useCartographStore.js` (`revertSectionToDefault`, `revertFeSectionToDefault`).
- Memory: `[[project_ribbon_corner_uniform_width]]`, `[[project_two_bakes_two_walls]]`, `[[project_d6a_curb_offset]]`, `[[project_revert_buttons]]`, `[[feedback_survey_polygon_not_ribbon_concepts]]`.
