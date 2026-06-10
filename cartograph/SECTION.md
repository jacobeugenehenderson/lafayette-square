# The Section

**The third tool — the ped **FILL**. Section reads the **frozen Survey SHAPE** (the hardscape silhouette) and strokes the pedestrian cross-section **inward** off it: treelawn, sidewalk, the ribbon corner fills, the ADA pad, the dead-end cap wraps. It is the first **consumer** past the Data Wall.** This is its single-source-of-truth reference: what it is, the document it reads, how it builds, the authoring panel it powers, what stays live versus frozen, and where it is today.

> **Status: v0.3 (2026-06-10).** Most of Section is built: the per-edge FILL (`resolvePedDepths` → `sectionPass`), the **mono-width strip swap** (two equal strips; sidewalk-only = "sidewalk then lawn", never collapse), the dead-end caps built into the curb offset (D6a, `[[project_d6a_curb_offset]]`), the live material + depth overrides, the handles riding the achieved curb, **two handles always** (`sideBoundaries`), the **freeze-on-Survey-exit** (the wall auto-saves the SHAPE; no manual sub-bake — `WALL.md §4`), and the **Revert to Default** UI (`[[project_revert_buttons]]`). ⚠️ **The CORNER construction is OPEN** — a bent-polygon/fillet-wedge attempt (2026-06-10) was reverted; the corner is back to the pre-session `sectionPass` build and is not yet correct on LS (the target + the proven reference to port are in §6). **Grounded in code** (`src/lib/tileGround.js`; `MeasurePanel.jsx`/`MeasureOverlay.jsx`). Reference-kind. The pre-build forensic census is **archived** (`_archive/`); its open-tail is folded into §7. Today's tool is still labelled **"Measure"** (the rename rides T3).

---

## 0. What Section is

Section takes Survey's **frozen hardscape silhouette** — the curb edge (`iA`) and its corner shape — and authors the **pedestrian profile** on top of it: the strips between the curb and the property line, the way the ribbon bends around a corner, the ADA ramp pad, the treelawn wrap on a round dead-end. Four load-bearing facts:

- **Section = FILL; Survey = SHAPE.** Survey owns the asphalt/curb silhouette + the corner *radius*; Section owns the treelawn/sidewalk depths, the corner *fills*, the ADA pads, the cap wraps, and the strip materials. (`ARCHITECTURE §2.1`, `SURVEY §0`.)
- **It strokes INWARD off a FROZEN edge.** Survey strokes the chains *outward* into the curb line and freezes it; Section offsets *inward* from that frozen `iA`. It never touches a chain — **that is the whole point of the Wall** (`WALL.md`).
- **⭐ Always populate best-effort, then override.** Every edge gets a sane default with *no operator action* (§3.1); authoring is purely *override* on top — toggle a treelawn, tune a depth, ctrl-click-swap a strip (§3.2). The operator never starts from blank; they correct.
- **∴ FILL authoring is live and cheap.** Because the heavy thing (the silhouette) is frozen, an override only re-strokes the interior — it must **not** recompute the outline. *"Section strokes a frozen edge, so ped-width drags are live and cheap"* (`HANDOFF-survey-section-tool-design.md §18`). This responsiveness is the **reason** the silhouette is frozen (§4).

It is the third of the three tools — **Survey · Section · Stage** — and the **first pure consumer**: past the Wall, it reads the frozen shape and never derives geometry from chains.

---

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
- **`sectionOpen(shapeTiles, cw, stripMat, stencil, blockCustoms)`** — the open-side mate (Wall Phase-D, `ef460d1`): composes block/curb/asphalt off the frozen `iA` + the FILL via `sectionPass`, with **no chain handle** (`WALL.md §4`).

The product of all assets, artifacts, and bakes — Survey's SHAPE, Section's FILL, Stage's LOOK — is the **Slab** (`[[project_two_bakes_two_walls]]`).

---

## 3. How it builds — `sectionPass`, the mono-width ribbon off the frozen curb

The wall is enforced **at a function signature**, not by convention:

> **`sectionPass(shapeTiles, cw, stripMat, blockCustoms)`** takes *only* the frozen per-tile polygons + design scalars + the per-edge override (keyed by frozen identity). **Zero lexical handle on streets / chains / measures / centerlines.** Section physically cannot re-derive the *shape*; doing so requires changing the signature. *This impossibility is the wall.*

The model is **`RIBBONS §3.9a` — "ribbon monowidth, strips variable."** One uniform-width band wraps the whole block silhouette; **the corner is that band BENT around the arc, sliced from the same offsets — never a constructed primitive.** Per tile, off the frozen `iA`:

1. **Mono-width inward offsets** (jtMiter, sharing the frozen `bandJoin`): `iC = iA − cw` (curb/treelawn), `iT = iA − (cw + tl)` (the **divider**), `iW = iA − (cw + tl + sw)` (sidewalk/LU). Each clamped to the frozen `cap` (a thin tile degrades to a clean truncated ribbon, never thorns).
2. **The leg zone** = the union of each run's butt-capped slab, pulled back from each corner by `(asphalt-hw + that corner's resolved R)` so the slab ends at the **tangent** — the corner wedge is left for the bent pad.
3. **The bent corner** (G5, `RIBBONS §3.9a` step 10a / `§6.9`): the corner is the ribbon bent into an **all-SW** slice from tangent to tangent (treelawn ends at the tangents). A **round** dead-end is the exception — treelawn wraps the cap (a wrap disk), not an all-SW ramp.
4. **Leg strips:** `outerBand = iC − iT` (treelawn) and `innerBand = iT − iW` (sidewalk), each clipped to the leg zone. **Routed per-edge by material** (§3.2): default `{outer:'LU', inner:'SW'}`, overridable.
5. **Output:** `{ Wacc (sidewalk), tlByLu (treelawn per land-use), luByLu (land-use floods) }`; `buildTileGround` unions + stencil-clips these. The block silhouette + curb come straight from the frozen `iA` (`block = ⋃ iA`; curb = `iA − iC`). Nothing reads a chain.

### 3.1 ✅ The best-effort first fill — the default cross-section (LANDED 2026-06-07)

Before the operator authors anything, Section draws a **best-effort default** off the frozen silhouette. The model (Jacob): the system needs only **two things per edge** — **treelawn Y/N** + **strip depths (ADA).** This replaced the old per-tile *averaged* measures (a noisy continuum that drew sub-meter treelawn slivers).

- **Treelawn Y/N is *gleaned from data*, not guessed.** `survey.json` measured `pavementHalfWidth` (centerline→sidewalk); *"tree lawn is the natural gap"* — already in the frame as the `treelawn` field. The LS distribution is cleanly **bimodal** (n=951): **391 ≈ 0** (sidewalk at curb → **N**), **508 ≥ 0.75 m** clustered at ~1.7 m (**Y**), ~**50** in the 0.25–0.75 valley (operator's call). **Threshold the gap (~0.6 m) → Y/N for ~95 % of edges automatically.**
- **Strip depths default to ADA-standard — also the Revert state** (Jacob). Treelawn-Y → standard treelawn + ADA sidewalk; treelawn-N → ADA sidewalk abuts the curb. Reset/revert returns here.
- **∴ default fill = (gleaned treelawn Y/N) × (ADA depths).**

**⭐ The default strip *ordering* (the best-effort material assignment).** Every edge has **two strips** (outer = curb-side, inner) **plus** the LU remainder — *always two, even sidewalk-only*. Their default **materials** follow treelawn presence, reading from the curb inward:

| edge | outer strip | inner strip | remainder | reads (curb → block) |
|---|---|---|---|---|
| **treelawn-Y** | **TL** (treelawn, LU-colour) | **SW** (sidewalk) | LU | **TL → SW → LU** — grass buffers the curb, the walk sits back |
| **treelawn-N** (sidewalk-only) | **SW** (the walk hugs the curb) | **TL** (LU-colour) | LU | **SW → TL → LU** |

So the default is `{outer: Y?'LU':'SW', inner: Y?'SW':'LU'}` — the **same two strips, materials reordered.** The operator's ctrl-click swap (§3.2) flips any strip off this default; because strips are just **LU/SW tags**, swapping *both* to LU paints an **open field** (no sidewalk at all). ⚠️ **Construction consequence:** a treelawn-N edge must still emit **two strips** (SW outer, LU inner) — it does **not** collapse to all-SW. The bent corner stays SW (the ADA ramp) regardless of leg ordering.

> **Landed in code:** `gleanTreelawn` + `resolvePedDepths` (`tileGround.js:554-575`); the per-edge resolution + the presence-dependent strip ORDERING (Y reads grass→walk, N reads walk→lawn) in `sectionPass` (`:686-700`). **⭐ The two strips are EQUAL width — `resolvePedDepths` defaults both to the same standard (`STD_TREELAWN == ADA_SIDEWALK`), and `hasTL` (the gleaned Y/N) drives only the MATERIAL swap, never a width.** So the ribbon's total `cw + tl + sw` is uniform Y or N — the mono-width — and a sidewalk-only edge is "sidewalk then lawn", not a collapsed half-ribbon. Tunables: `TREELAWN_YN_THRESHOLD=0.6`, `STD_TREELAWN=1.5`, `ADA_SIDEWALK=1.5`.

### 3.2 ✅ The override layer — best-effort, then the operator corrects

Authoring is **override on top of the best-effort default**, keyed by the **frozen run identity** (`blockCustoms[skelId][side][segOrd]`). The run carries `skelId/side/segOrd` in the frozen artifact, so `sectionPass` resolves the override off frozen identity + the live `blockCustoms` — **design intent, not chain geometry; it cannot move a vertex, so the wall holds** (§4).

- **✅ Material swap (LANDED 2026-06-07).** `sectionPass`'s `runMatOverride` (`tileGround.js:~536`) reads `blockCustoms[...].materials`; overridden runs route their strips by the authored `{outer,inner}` (peeled off the default remainder via per-run zones), default-routed otherwise → **byte-identical when nothing is overridden**. The ctrl/right-click gesture (`MeasureOverlay.jsx:~553`) already writes it. `sectionGeos` depends on `blockCustoms`, so a swap re-strokes the FILL **live off the frozen curb** — the curb sits still.
- **✅ Depth override (the per-edge FILL, §3.3 — LANDED).** The treelawn/sidewalk **depth** override (`blockCustoms[...].treelawn/.sidewalk`) is read by `resolvePedDepths` (`tileGround.js:566`) — the one resolution shared by the FILL stroke *and* the handle placement (§5, "one depth truth"). The handles ride the achieved curb (`sectionCurbRings`) so they line up. ⚠️ Interactive *responsiveness* is gated by the whole-map rebuild (each override re-strokes every tile) — the perf/D6d block-local rebuild is the open item, not the wiring (`[[project_d6a_curb_offset]]`).

### 3.3 ⭐ The per-edge FILL — LANDED (`RIBBONS §3.9a` step 10, on `sectionPass`)

Each leg's strips stroke at *its own* depth, the divider varying inside the mono-width ribbon, corners taking the **max of their two adjacent legs** so the bent quad is clean. This is `RIBBONS §3.9a` step 10 (sector slicing) realized on `sectionPass` (the `cornerT` max-adjacent map + per-leg `sector` slabs, `tileGround.js:733-799`). What it does:

1. **Resolve a single per-edge depth** = `blockCustoms[run].{treelawn,sidewalk}` (override) **else** the best-effort: **both strips EQUAL width** (`STD_TREELAWN == ADA_SIDEWALK`), with the gleaned Y/N driving only the material swap. Use this **one** resolution everywhere — the FILL *and* the handle placement (§5) read it, so they cannot diverge.
2. **Mono-width per block, divider per edge.** Keep the ribbon's *outer* depth `WB = cw + max(TL) + max(SW)` uniform per block (clean corners), but slice each leg's **divider** between its two strips. Outer strip = `outerBand ∩ leg-sector` to the per-edge divider; inner strip = the rest. (`RIBBONS §3.9a` steps 6–10.)
   - **Two strips always, EQUAL width — swap, not collapse (§3.1).** A treelawn-N (sidewalk-only) edge emits both strips at full width — outer SW, inner LU/lawn — it does **not** collapse to a half-ribbon. Each strip's default material follows treelawn presence (`{outer: Y?'LU':'SW', inner: Y?'SW':'LU'}`), then the per-edge `blockCustoms.materials` override (§3.2) flips it. All-LU on both → an open field.
3. **⭐ Corner depth = `cw + max-adjacent`.** A corner's bent pad is the `fullBand` slice at the **deeper** of its two adjacent legs' totals. So an **SW↔SW corner (no treelawn either side) comes out sidewalk-deep**, a TL-adjacent corner full-depth. The corner is the band bent (`RIBBONS §3.9a` step 10a), tagged SW — never a constructed primitive. *(The corner material refinement — SW↔SW → concrete→LU — and a robust construction are OPEN; see §6.)*

**Invariants (sacrosanct — they held through the build and bind any future FILL change):**
- ⛔ **The mono-width ribbon is SACROSANCT** — it was the hardest-won step (`RIBBONS §3.9a`, the V1 keystone; the corner saga ended on it). The per-edge work **varies the divider + materials + depths INSIDE the mono-width band**; it must **never** re-architect or abandon the uniform outer offset that gives the clean bent corners. Build *on* the mono-width, never replace it.
- **The FILL spans curb → block-center.** The ped strips (TL/SW) are slices near the curb; the **LU remainder fills the interior continuously to the polygon center** — there is no hard "property line" cap, the ribbon's inner edge was collapsed to center (so the open-field case, all-LU curb→center, falls out for free).
- Stroke off the **frozen `iA`** + **frozen `runs[]`** + `blockCustoms` (design intent) — never a chain. The silhouette/`vertR` are Survey's, frozen; do not touch them. Material-swap and depth both route through the **same per-run resolution** off frozen identity.
- **The gate is SHAPE-byte-identical + a classified FILL delta — NOT FILL-byte-identical** (corrected 2026-06-07, Metcalf's catch). The §3.3 rules *intentionally change the un-authored render at mixed tiles* — two-strips-always reshallows N-legs to ADA+LU, max-adjacent reshapes corners, the divider goes concentric to the (possibly flared) frozen curb, N-street dead-ends lose the tile-uniform grass collar. So: **asphalt / curb / block must be byte-identical** (the silhouette + wall untouched), and the **FILL delta must fall entirely inside those intended classes** (nothing else moves). "FILL byte-identical when un-authored" was self-contradictory and is retired.

---

## 4. ⭐ The keystone — freeze the *silhouette*, author the *FILL* live

The architecture that makes Section responsive, and the thing the freeze is **for**.

**What freezes (the SHAPE — Survey's product, the DataWall asset):**
- `ring` (tile face) · **`iA`** (rounded curb edge) · **`vertR`** (per-corner radii) · `runs[]` identity. The block **silhouette + its corners.**

**What stays live (the FILL — re-stroked off the frozen edge on every override):**
- per-edge treelawn/sidewalk depth · the divider · strip materials (LU↔SW) · the bent corner (follows the resolved depths). These are **interior** — they slide along the frozen `iA`, they never move it.

> **The per-edge FILL does NOT abrogate Survey or the Wall** (the question, answered, 2026-06-07). Survey still owns + freezes the silhouette; the FILL strokes inward off the frozen `iA` using **frozen run identity** + **`blockCustoms` design intent** — no chain handle, no shape re-derivation, nothing new across the wall (`runs[]` was already frozen). The FILL was *never* meant to be frozen; the DataWall freezes the *silhouette* and the FILL is the live consumer-side stroke off it. Going per-edge live is the **correct** realization of this keystone, not a departure.

**State (2026-06-07):** the live wiring is **landed** — `sectionGeos`/`sectionOpen`/`sectionPass` take `blockCustoms`, so the FILL re-strokes off the frozen `iA` when an override changes (material-swap proves it live). The remaining gap is §3.3: the **depth** override + the per-edge divider. (Phase-D's earlier "freeze the FILL too" over-reach is the thing §3.2/§3.3 unwinds — freeze the silhouette, stroke the FILL live.)

---

## 5. The authoring panel — the FILL controls (and the one-depth-truth rule)

Section authors a thin per-block-edge overlay keyed to Skeleton identities. Surfaces: `MeasurePanel.jsx` · `MeasureOverlay.jsx` · `measureModel.js`.

| Control | What it does | Writes |
|---|---|---|
| **Treelawn-outer** handle | drags the **divider** (treelawn depth) | per-fe `blockCustoms[…].treelawn` |
| **Property-line** handle | drags the sidewalk depth | per-fe `…sidewalk` |
| **Strip-swap** (ctrl / right-click in a strip) | flips that strip's material **LU ↔ SW** | `…materials.{outer|inner}` |
| **Whole-chain ↔ per-block** mode | edit *scope*: fan across the chain vs the one block-edge | the selection an edit fans across (never `chain.measure`) |
| **Symmetric ↔ Asymmetric** | mirror to the opposite side, or one side | transient UI state |
| **↺ Revert to Default** (footer button) | clears **every** Section ped override → the calculation re-seeds | strips `treelawn`/`sidewalk`/`materials` from `blockCustoms` |
| **⌃-click / right-click a ped handle** | reverts **that one edge** to the calculated default | strips the Section fields off that fe's slot |

### 5.1 Revert — the way back from autosaved edits

There is **no commit step** — every drag autosaves, so revert is how the operator gets back. Section's "Default" **is the calculation** (gleaned treelawn Y/N + ADA depths, §3.1) — no blessing or snapshot is needed, because clearing the override re-seeds the calc by construction. Two scopes, both field-scoped so reverting Section never touches Survey's widths or corners:

- **Whole-scene** — `revertSectionToDefault()` strips the Section fields (`treelawn`/`sidewalk`/`materials`) from every `blockCustoms` slot. The footer button (`MeasurePanel.jsx`) is disabled when `sectionOverrideCount()` is 0 and confirms before firing.
- **Per-edge (the surgical fix)** — `revertFeSectionToDefault(fe)` strips just that fe's Section fields. Bound to ⌃-click / right-click on a ped handle (`MeasureOverlay.jsx`'s unified `handleCtrlOrRight`; context-menu suppressed).

This mirrors Survey's revert layers (Skeleton / Default), minus the blessed layer — Survey needs a *snapshot* to return to (its inputs are surveyed, not calculated); Section's default falls out of the calc for free. Store + vocabulary: `[[project_revert_buttons]]`.

Three rules the canon is firm on:
- **⭐ One depth truth (achieved).** The handle is **positioned from the same per-edge depth the FILL strokes** — both read `resolvePedDepths` (§3.3 step 1), and the handle rides the achieved curb (`sectionCurbRings`, the frozen `iA` the FILL strokes off) rather than centerline-ruler space. So the handle sits *on* the strip. The remaining symptom — a drag feeling "sticky" — is **perf, not the wire**: every edit re-strokes the whole map (D6d, `[[project_d6a_curb_offset]]`), not a divergence between handle and FILL.
- **All writes are polygon-scope (per-fe), in `blockCustoms`** — `chain.measure` is read-only pipeline input (V2-Measure, `RIBBONS §5`). Mode is a *selection criterion*, never a write scope.
- **The asphalt-edge handle (`pavementHW`) is NOT Section's** — it moved to Survey. Section shows **only its own** ped handles.

---

## 6. The corner is two things, in two tools

The line that resolves the long corner saga (`ARCHITECTURE §2.1`, "conflating these two is the root of the corner mess"):

- **The corner *shape*** — how round the curb silhouette is (the radius) — is **Survey**, frozen into `vertR`.
- **The corner *fill*** — how the ribbon bends around it: the bent all-SW pad, treelawn ending at the tangents, the cap wrap — is **Section**, stroked live off the frozen arc.

So "author the corners in Section" means the **fill**, not the radius. Two facts of the fill:
- **The bent quad is a *slice* of the ribbon**, not a constructed primitive (`RIBBONS §3.9a` step 10a). Bending the band around the arc IS the corner.
- **⭐ Corner depth = `cw + max-adjacent`** (§3.3 step 3): the pad goes as deep as the **deeper** of its two adjacent legs. **SW↔SW corner (no treelawn) → sidewalk-deep**; TL-adjacent → full-depth. A Section corner defect (point-ramp collapse, ADA-tangent glitch) is a `sectionPass` FILL bug; a too-round/too-square corner is a Survey SHAPE concern Section inherits.

> ⚠️ **The corner construction is OPEN (2026-06-10).** A bent-polygon/fillet-wedge attempt this session was **reverted** — it didn't hold on real LS geometry. The corner is back to the pre-session `sectionPass` construction. The **target** (Jacob's rule): the corner is the band BENT around the arc — **all concrete UNLESS SW↔SW, where it's concrete→LU**. The proven reference to port is **`emitOneBlockRingBands`** (RIBBONS §3.9a step 10 — the arc-span *sector* slice). Strips (mono-width swap) are done; the corner is not.

---

## 7. Where Section is today

**LANDED (on `curb-offset-draw`):**
- **§3.1 best-effort fill** — treelawn Y/N gleaned + ADA depths; the noisy slivers gone.
- **§3.2 material override** — per-edge LU↔SW swap reads `blockCustoms`, re-strokes the FILL live off the frozen silhouette; byte-identical when un-overridden.
- **§3.3 per-edge depth + divider** — the sector slice (`RIBBONS §3.9a` step 10): the depth override renders, the corner takes `cw + max-adjacent` (`cornerT`).
- **The mono-width strip swap** — two equal strips; treelawn Y/N is a material decision, not a width (sidewalk-only = "sidewalk then lawn", never collapse). ⚠️ The **corner** construction is OPEN (§6) — a bent-polygon attempt was reverted.
- **Dead-end caps built into the curb offset** — the cap (round semicircle / blunt segment) is part of `offsetRingVariable`, so it's tangent to the achieved per-fe width by construction (D6a, `[[project_d6a_curb_offset]]`). NB: the *ped* wrap at the cap is still open (below).
- **One depth truth** — handle placement and FILL stroke both read `resolvePedDepths`; the handle rides the achieved curb (`sectionCurbRings`).
- **Revert UI** — whole-scene + per-edge (§5.1).

**The open tail (the FILL finish — none is a build, all are polish; folds the archived census's §6):**
- **Perf / D6d — the gating item.** Every override re-strokes the whole map (the `tileGeos` whole-map memo); interactive handle/drag work can't be cleanly validated until the rebuild is block-local. This blocks *validation* of the handle responsiveness, not the wiring. (`[[project_d6a_curb_offset]]`.)
- **Cap ped-wrap (G8)** — the round-cul-de-sac treelawn annulus vs. all-paved bulb vs. blunt all-SW behaviour, + the undiagnosed Bentley Pl round-cap FILL bug. The cap *shape* is done (D6a); this is the cap *fill*.
- **Capacity guard (G12)** — port the thin-tile guard to `sectionPass`'s inward offsets (~100 sliver/median/loop thorns). The `cap` clamp is partly there; the general per-tile guard isn't complete.
- **Delete the dying figure-ground (T4)** — `buildBlockGeometryV2` + `buildChainBandsLive` are **still mounted** in `BlockGeometryV2Debug.jsx` (a per-frame compute drag). Once the handles are validated on tiles, delete it (kills the census's W6/W7/W8 reach-backs).
- **Rename Measure → Section** — cosmetic, last; rides T3.

**Upstream, not Section:** intersection-everywhere corner-silhouette residuals disrupt the FILL because the *frozen `iA`* is disrupted — fix in Survey/skeleton (Section inherits the clean edge). Divided carriageways are gated to legacy (the curb offset collapses a median gap) — a corridor-leg follow-on, not a FILL bug.

### 7.1 The SHAPE / FILL diagnostic frame (folded from the census)

Every visible defect attributes to **one** tool — the line that resolves the long corner saga:
- **Corner *shape* too round/square, R=0 ramps, exterior arms stop short, median slivers** → **SHAPE** (Survey, the frozen `iA`). Section inherits it; not Section's to fix.
- **ADA-tangent glitch, point-ramp collapse, thorns, cap ped-wrap, per-edge depth, strip swap** → **FILL** (`sectionPass`). Section's own geometry — diagnose in the inward strokes, never back through chains.

When in doubt: a too-round or too-square *curb* is Survey; how the *ribbon bends* around it is Section.

---

## 8. The doctrine, in one place

- **⭐ Always populate best-effort, then override.** Sane default with no action (§3.1); authoring is pure override (§3.2). Never start from blank.
- **⛔ Ribbon monowidth, strips variable — and the mono-width is SACROSANCT.** One uniform outer depth per block (clean corners); the **divider + materials** vary per edge. The corner is the band **bent**, a slice — never a built shape. The mono-width was the hardest-won step (the corner saga ended on it); the per-edge work builds *inside* it, never re-architects it.
- **The FILL is curb → center.** Strips near the curb; the LU remainder flows to the polygon center (no hard property line). Both-strips-LU → an open field.
- **Two strips always, EQUAL width — they SWAP, never collapse.** Every edge has an outer + inner strip (equal width — the mono-width) + LU remainder. Treelawn-Y reads `grass → walk → lawn`; treelawn-N reads `walk → lawn`. The gleaned Y/N is a **material** decision, not a width — a sidewalk-only edge is the same-width ribbon with the materials swapped, not a half-ribbon. Both→LU is an open field.
- **The corner is the band BENT around the arc** — a slice, never a primitive (`RIBBONS §3.9a` step 10a). Depth = `cw + max-adjacent`. ⚠️ A robust construction + the SW↔SW → concrete→LU material refinement are **OPEN** (§6) — a bent-polygon attempt was reverted 2026-06-10.
- **One depth truth** — the FILL stroke and the handle placement read the *same* per-edge depth, or they diverge (§5).
- **Section = FILL; Survey = SHAPE.** Section never authors the silhouette or the corner radius.
- **Revert is the way back; Default IS the calc.** Edits autosave (no commit), so the operator reverts to undo. Section's Default falls out of the gleaned-treelawn + ADA calc — no blessed snapshot (that's Survey's, whose inputs are surveyed not calculated). Whole-scene + per-edge (⌃-click), field-scoped so Section never wipes Survey (§5.1).
- **Freeze the silhouette, author the FILL live** — off the frozen `iA` + frozen run identity + `blockCustoms` design intent. The FILL was never meant to be frozen; this does not abrogate the Wall (§4).
- **The wall is the `sectionPass` signature** — design intent may cross (keyed by frozen identity); chain geometry may not.
- **Smoothing is deliberately OFF (deferred, not abandoned).** Raw RDP polylines are acceptable; naive re-enable scallops the bands 10× (2026-06-04 retirement). The eventual way is to smooth the offset bands/output rings (D5) — *comfort churn*, explicitly not-now.
- **A Section defect is a FILL problem** — diagnose in `sectionPass`'s inward strokes, never back through chains.

---

## Cross-references
- `RIBBONS.md §3.9a` — **the V1 mono-width ring-band construction (the model §3.3 builds to)** · `§4` (corner deep-dive) · `§5` (operator model) · `§6.9/§6.10` (the V1 corner resolution).
- `SURVEY.md` — the SHAPE tool whose frozen `iA` Section strokes off.
- `WALL.md` — the freeze between them; `§4` the Phase-D mechanism.
- `_archive/SECTION-CENSUS-2026-06-03.md` — the **pre-build forensic census** (Stratum): the inventory, wall audit, and SHAPE/FILL defect frame that proved Section was a wiring job. Did its job; its enduring open-tail + diagnostic frame are folded into §7. Archived 2026-06-10.
- `ARCHITECTURE.md §2.1` — the three tools; the two-corners distinction.
- `PIPELINE.md §section` — the execution spine.
- `src/lib/tileGround.js` — `sectionPass` (the wall + per-edge override), `resolvePedDepths` (the one depth truth), `sectionOpen` (open-side), `buildTileGround` (host); `MeasurePanel.jsx` / `MeasureOverlay.jsx` (the controls + revert gestures); `stores/useCartographStore.js` (`revertSectionToDefault`, `revertFeSectionToDefault`).
- Memory: `[[project_ribbon_corner_uniform_width]]`, `[[project_two_bakes_two_walls]]`, `[[project_d6a_curb_offset]]`, `[[project_revert_buttons]]`, `[[feedback_survey_polygon_not_ribbon_concepts]]`.
