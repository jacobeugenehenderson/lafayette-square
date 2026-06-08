# The Section

**The third tool — the ped **FILL**. Section reads the **frozen Survey SHAPE** (the hardscape silhouette) and strokes the pedestrian cross-section **inward** off it: treelawn, sidewalk, the ribbon corner fills, the ADA pad, the dead-end cap wraps. It is the first **consumer** past the Data Wall.** This is its single-source-of-truth reference: what it is, the document it reads, how it builds, the authoring panel it powers, what stays live versus frozen, and where it is today.

> **Status: v0.2 (2026-06-07) — the dispatch-ready seed.** The SSOT for the Section stage; completes the front-half rebuild spec `SKELETON → PREBAKE → SURVEY → WALL → ⟦this⟧`. **Grounded in code** (`src/lib/tileGround.js` `sectionPass`/`sectionOpen`, the Measure panel/overlay) and in the ribbon construction canon (`RIBBONS §3.9a`, the V1 keystone), verified against the live path 2026-06-07. Reference-kind (how it works / what it is / why). Its **State/forensic companion is `SECTION-CENSUS.md`**. Today's tool is still labelled **"Measure"** (the rename rides T3; don't rename code first). **§3.3 is the dispatch target for the per-edge FILL build** — an agent pointed here has the whole model.

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

> **`sectionPass(shapeTiles, cw, stripMat, blockCustoms)`** takes *only* the frozen per-tile polygons + design scalars + the per-edge override (keyed by frozen identity). **Zero lexical handle on streets / chains / measures / centerlines.** Section physically cannot re-derive the *shape*; doing so requires changing the signature. *This impossibility is the wall* (`SECTION-CENSUS §2.1`).

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

> **Landed in code** (uncommitted on trunk, 2026-06-07): constants + `gleanTreelawn` at `tileGround.js:441-445`; the per-run treelawn slab `td` at `:565`; the dead-end tip model at `:886`; the per-tile `tl`/`sw` seed at `:1798` (replacing the dead `repDepth`). Tunables: `TREELAWN_YN_THRESHOLD=0.6`, `STD_TREELAWN=1.5`, `ADA_SIDEWALK=1.5`. *(The treelawn-presence-dependent strip ordering above is part of the §3.3 build — today's code still collapses treelawn-N to all-SW.)*

### 3.2 ✅/🔜 The override layer — best-effort, then the operator corrects

Authoring is **override on top of the best-effort default**, keyed by the **frozen run identity** (`blockCustoms[skelId][side][segOrd]`). The run carries `skelId/side/segOrd` in the frozen artifact, so `sectionPass` resolves the override off frozen identity + the live `blockCustoms` — **design intent, not chain geometry; it cannot move a vertex, so the wall holds** (§4).

- **✅ Material swap (LANDED 2026-06-07).** `sectionPass`'s `runMatOverride` (`tileGround.js:~536`) reads `blockCustoms[...].materials`; overridden runs route their strips by the authored `{outer,inner}` (peeled off the default remainder via per-run zones), default-routed otherwise → **byte-identical when nothing is overridden**. The ctrl/right-click gesture (`MeasureOverlay.jsx:~553`) already writes it. `sectionGeos` depends on `blockCustoms`, so a swap re-strokes the FILL **live off the frozen curb** — the curb sits still.
- **🔜 Depth override (the per-edge build, §3.3).** The treelawn/sidewalk **depth** override (`blockCustoms[...].treelawn/.sidewalk`) is **not yet read** — the FILL still draws standard depths. This is why the depth handles don't respond and don't line up (§5). Wiring it is the dispatch target.

### 3.3 ⭐ The per-edge FILL — the dispatch target (build to `RIBBONS §3.9a` step 10)

Today the depths are **per-tile** (mono-width, uniform `tl`/`sw`). The model is **per-edge**: each leg's strips at *its own* depth, the divider varying inside the mono-width ribbon, corners taking the **max of their two adjacent legs** so the bent quad is clean. This is `RIBBONS §3.9a` step 10 (sector slicing) realized on `sectionPass`. What the build must do:

1. **Resolve a single per-edge depth** = `blockCustoms[run].{treelawn,sidewalk}` (override) **else** the best-effort (gleaned-Y ? `STD_TREELAWN` : 0; `ADA_SIDEWALK`). Use this **one** resolution everywhere — the FILL *and* the handle placement (§5) read it, so they cannot diverge.
2. **Mono-width per block, divider per edge.** Keep the ribbon's *outer* depth `WB = cw + max(TL) + max(SW)` uniform per block (clean corners), but slice each leg's **divider** at `cw + that edge's treelawn`. Outer strip = `outerBand ∩ leg-sector` to the per-edge divider; inner strip = the rest. (`RIBBONS §3.9a` steps 6–10.)
   - **Two strips always, default ordering per §3.1.** Even a treelawn-N (sidewalk-only) edge emits both strips — it does **not** collapse to all-SW. Each strip's default material follows treelawn presence (`{outer: Y?'LU':'SW', inner: Y?'SW':'LU'}`), then the per-edge `blockCustoms.materials` override (§3.2) flips it. All-LU on both → an open field.
3. **⭐ Corner depth = `cw + max-adjacent`.** A corner's bent pad is the `fullBand` slice at the **deeper** of its two adjacent legs' totals. So an **SW↔SW corner (no treelawn either side) comes out sidewalk-deep**, a TL-adjacent corner full-depth (Jacob's rule). The corner is always SW (the ADA ramp); only the **legs** carry treelawn + the material override.
4. **The bent quad is a slice, never a built shape** — `fullBand ∩ corner-sector` (one polygon). Don't construct a corner primitive (the saga's lesson; `RIBBONS §3.9a` step 10a, `§6.10`).

**Boundaries for the build:**
- ⛔ **The mono-width ribbon is SACROSANCT** — it was the hardest-won step (`RIBBONS §3.9a`, the V1 keystone; the corner saga ended on it). The per-edge work **varies the divider + materials + depths INSIDE the mono-width band**; it must **never** re-architect or abandon the uniform outer offset that gives the clean bent corners. Build *on* the mono-width, never replace it.
- **The FILL spans curb → block-center.** The ped strips (TL/SW) are slices near the curb; the **LU remainder fills the interior continuously to the polygon center** — there is no hard "property line" cap, the ribbon's inner edge was collapsed to center (so the open-field case, all-LU curb→center, falls out for free).
- Stroke off the **frozen `iA`** + **frozen `runs[]`** + `blockCustoms` (design intent) — never a chain. The silhouette/`vertR` are Survey's, frozen; do not touch them. Material-swap (§3.2) already works — extend the same per-run resolution to depths.
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

Section authors a thin per-block-edge overlay keyed to Skeleton identities. Surfaces (`SECTION-CENSUS §1`): `MeasurePanel.jsx` · `MeasureOverlay.jsx` · `measureModel.js`.

| Control | What it does | Writes |
|---|---|---|
| **Treelawn-outer** handle | drags the **divider** (treelawn depth) | per-fe `blockCustoms[…].treelawn` |
| **Property-line** handle | drags the sidewalk depth | per-fe `…sidewalk` |
| **Strip-swap** (ctrl / right-click in a strip) | flips that strip's material **LU ↔ SW** | `…materials.{outer|inner}` |
| **Whole-chain ↔ per-block** mode | edit *scope*: fan across the chain vs the one block-edge | the selection an edit fans across (never `chain.measure`) |
| **Symmetric ↔ Asymmetric** | mirror to the opposite side, or one side | transient UI state |

Three rules the canon is firm on:
- **⭐ One depth truth.** The handle must be **positioned from the same per-edge depth the FILL strokes** (§3.3 step 1). Today the handles read old *chain measures* while the FILL draws *standard* depths — so they neither line up nor respond. Point both at the one resolution and the handle sits on the strip and the drag moves it. *(This is the root of both "handles don't match" and "strips aren't responsive" — one wire, not two bugs.)*
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

---

## 7. Where Section is today

**Built this session (2026-06-07, uncommitted on trunk):**
- **§3.1 best-effort fill** — treelawn Y/N gleaned + ADA depths, the noisy slivers gone. Baked clean.
- **§3.2 material override + live wiring** — per-edge LU↔SW swap reads `blockCustoms`, re-strokes the FILL **live off the frozen silhouette**; byte-identical when un-overridden. The ctrl-click gesture writes it.

**The next build (dispatch-ready, §3.3 + §5):**
- **Per-edge depth + divider** (the sector slice, `RIBBONS §3.9a` step 10) so the depth override renders and the corner takes `cw + max-adjacent`.
- **Handle alignment (one depth truth)** so the depth handles line up and respond.
- Together these are "the authoring works" — Jacob's two handle symptoms are one wire (§5).

**Then (the FILL geometry tail, `SECTION-CENSUS §6`):** ADA-tangent (G5) + point-ramp robustness, the capacity guard (G12) ported to the inward offsets (~100 thorns), the dead-end round-cap FILL bug (Bentley Pl), cap ped-wrap (G8); delete the dying figure-ground (T4); rename Measure → Section (cosmetic, last). **Upstream, not Section:** the intersection-everywhere corner-silhouette residuals disrupt the FILL because the *frozen `iA`* is disrupted — fix in Survey/skeleton (Section inherits the clean edge).

---

## 8. The doctrine, in one place

- **⭐ Always populate best-effort, then override.** Sane default with no action (§3.1); authoring is pure override (§3.2). Never start from blank.
- **⛔ Ribbon monowidth, strips variable — and the mono-width is SACROSANCT.** One uniform outer depth per block (clean corners); the **divider + materials** vary per edge. The corner is the band **bent**, a slice — never a built shape. The mono-width was the hardest-won step (the corner saga ended on it); the per-edge work builds *inside* it, never re-architects it.
- **The FILL is curb → center.** Strips near the curb; the LU remainder flows to the polygon center (no hard property line). Both-strips-LU → an open field.
- **Two strips always; the *ordering* is the best-effort.** Every edge has an outer + inner strip + LU remainder. Treelawn-Y reads `TL → SW → LU`; treelawn-N reads `SW → TL → LU` (the walk hugs the curb). Strips are just LU/SW tags — the operator swaps any of them, and both→LU is an open field.
- **Corner depth = `cw + max-adjacent`** — SW↔SW corners come out sidewalk-deep.
- **One depth truth** — the FILL stroke and the handle placement read the *same* per-edge depth, or they diverge (§5).
- **Section = FILL; Survey = SHAPE.** Section never authors the silhouette or the corner radius.
- **Freeze the silhouette, author the FILL live** — off the frozen `iA` + frozen run identity + `blockCustoms` design intent. The FILL was never meant to be frozen; this does not abrogate the Wall (§4).
- **The wall is the `sectionPass` signature** — design intent may cross (keyed by frozen identity); chain geometry may not.
- **Smoothing is deliberately OFF (deferred, not abandoned).** Raw RDP polylines are acceptable; naive re-enable scallops the bands 10× (2026-06-04 retirement). The eventual way is to smooth the offset bands/output rings (D5) — *comfort churn*, explicitly not-now.
- **A Section defect is a FILL problem** — diagnose in `sectionPass`'s inward strokes, never back through chains.

---

## Cross-references
- `RIBBONS.md §3.9a` — **the V1 mono-width ring-band construction (the model §3.3 builds to)** · `§4` (corner deep-dive) · `§5` (operator model) · `§6.9/§6.10` (the V1 corner resolution).
- `SURVEY.md` — the SHAPE tool whose frozen `iA` Section strokes off.
- `WALL.md` — the freeze between them; `§4` the Phase-D mechanism.
- `SECTION-CENSUS.md` — the **State/forensic companion**: inventory, wall audit, WYSIWYG drift (D1–D5), defect catalogue, ordered backlog.
- `ARCHITECTURE.md §2.1` — the three tools; the two-corners distinction.
- `PIPELINE.md §section` — the execution spine.
- `src/lib/tileGround.js` — `sectionPass` (the wall + per-edge override), `sectionOpen` (open-side), `buildTileGround` (host); `MeasureOverlay.jsx` (the gestures).
- Memory: `[[project_ribbon_corner_uniform_width]]`, `[[project_two_bakes_two_walls]]`, `[[feedback_survey_polygon_not_ribbon_concepts]]`.
