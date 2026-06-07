# The Section

**The third tool — the ped **FILL**. Section reads the **frozen Survey SHAPE** (the hardscape silhouette) and strokes the pedestrian cross-section **inward** off it: treelawn, sidewalk, the ribbon corner fills, the ADA pad, the dead-end cap wraps. It is the first **consumer** past the Data Wall.** This is its single-source-of-truth reference: what it is, the document it reads, how it builds, the authoring panel it powers, what stays live versus frozen, and where it is today.

> **Status: v0.1 (2026-06-07) — new, the topic-doc.** The SSOT for the Section stage; completes the front-half rebuild spec `SKELETON → PREBAKE → SURVEY → WALL → ⟦this⟧`. **Grounded in code** (`src/lib/tileGround.js` `sectionPass`/`sectionOpen`, the Measure panel/overlay), verified against the live path 2026-06-07. Reference-kind (how it works / what it is / why). Its **State/forensic companion is `SECTION-CENSUS.md`** (the tool-as-it-exists, the build backlog, the defect catalogue) — this doc points there for the ordered work, and does not duplicate it. Today's tool is still labelled **"Measure"** (the rename rides T3; don't rename code first).

---

## 0. What Section is

Section takes Survey's **frozen hardscape silhouette** — the curb edge (`iA`) and its corner shape — and authors the **pedestrian profile** on top of it: the strips between the curb and the property line, the way the ribbon bends around a corner, the ADA ramp pad, the treelawn wrap on a round dead-end. Three load-bearing facts:

- **Section = FILL; Survey = SHAPE.** Survey owns the asphalt/curb silhouette + the corner *radius*; Section owns the treelawn/sidewalk depths, the corner *fills*, the ADA pads, the cap wraps, and the strip materials. (`ARCHITECTURE §2.1`, `SURVEY §0`.)
- **It strokes INWARD off a FROZEN edge.** Survey strokes the chains *outward* into the curb line and freezes it; Section offsets *inward* from that frozen `iA`. It never touches a chain — **that is the whole point of the Wall** (`WALL.md`).
- **∴ FILL authoring is supposed to be live and cheap.** Because the heavy thing (the block silhouette) is already frozen, dragging a sidewalk handle only re-strokes the interior strips — it must **not** recompute the outline. *"Section strokes a frozen edge, so ped-width drags are live and cheap"* (`HANDOFF-survey-section-tool-design.md §18`). This responsiveness is the **reason** the silhouette is frozen — see §4.

It is the third of the three tools — **Survey · Section · Stage** — and the **first pure consumer**: past the Wall, it reads the frozen shape and never derives geometry from chains.

---

## 1. The vocabulary — what Section names

| Term | What it is | Owner |
|---|---|---|
| **curb edge (`iA`)** | the frozen rounded asphalt-inner ring — the line Section strokes inward from | Survey (frozen input) |
| **treelawn** | the strip from the curb inward; paints in the colour of the **land-use block it abuts** (per-LU) | Section |
| **sidewalk** | the strip from the treelawn-outer to the property line | Section |
| **ADA pad** | the corner is the curb ramp → a uniform concentric all-SW annulus tangent-to-tangent; treelawn lives only on the straight legs | Section (the corner *fill*) |
| **cap wrap** | a round dead-end keeps the treelawn wrapping the cap; a blunt cap goes all-SW | Section |
| **strip material** | each strip tagged **LU** (land-use flood) or **SW** (sidewalk); the ctrl-click swap | Section |
| **LU** | the land-use remainder — the interior left after the ped strips; **not authored, a flooded remainder** | emergent |

> If you are reasoning about a Section defect through chains / `pavementHW` / centerlines, you have slipped two stages back. Section's data model is **ribbons stroked off a frozen polygon edge** — never the chain graph (`SURVEY §1`, the same smell-test one stage on).

---

## 2. The artifact chain — where Section sits

```
Intake → Skeleton → Prebake → Survey → ⟦DATA WALL⟧ → ⟦ SECTION ⟧ → Bake → 3D (Stage)
```

| | The 'thing' | File |
|---|---|---|
| **input** (frozen) | the per-tile hardscape SHAPE Survey froze | `public/baked/<id>/shape.json` (the `_shapeArtifact`) |
| **Section authors** | ped widths + strip materials, per block-edge | `looks/<id>/design.json` (`blockCustoms[skelId][side][segOrd].{treelawn, sidewalk, materials}`) |
| **Section freezes** | the ped FILL geometry (treelawn/sidewalk/LU/curb strokes) | the ground bake → **wall #2 → Stage** |

**Built by** `src/lib/tileGround.js`:
- **`sectionPass(shapeTiles, cw, stripMat)`** — the FILL construction (the chain-free wall; §3).
- **`sectionOpen(shapeTiles, cw, stripMat, stencil)`** — the open-side mate added by Wall Phase-D (`ef460d1`): loads the frozen `shape.json` and composes block/curb/asphalt + the FILL, with **no chain handle** (`WALL.md §4`).

The product of all assets, artifacts, and bakes — Survey's SHAPE, Section's FILL, Stage's LOOK — is the **Slab** (`[[project_two_bakes_two_walls]]`).

---

## 3. How it builds — `sectionPass`, the chain-free FILL

The wall is enforced **at a function signature**, not by convention:

> **`sectionPass(shapeTiles, cw, stripMat)`** takes *only* the frozen per-tile polygons + design scalars — **zero lexical handle on streets / chains / measures / `blockCustoms`.** Section physically cannot reach back; doing so requires changing the signature (a visible, auditable edit). *This impossibility is the wall* (`SECTION-CENSUS §2.1`; verified `tileGround.js`, `sectionPass` def, 2026-06-07).

The FILL pass, per tile, off the frozen `iA`:
1. **Concentric inward offsets:** `iC = iA − cw` (curb/treelawn), `iT = iA − (cw+tl)` (treelawn/sidewalk), `iW = iA − (cw+tl+sw)` (sidewalk/LU). Each clamped to the frozen capacity `cap` (a thin tile degrades to a clean truncated ribbon, never thorns).
2. **The treelawn slabs** are the straight-leg zone: each run's butt-capped slab, pulled back from each corner end by `(asphalt-hw + that corner's resolved R)` so the slab ends at the tangent — the corner wedge is left for the ADA pad.
3. **The ADA corner pad** (G5, `RIBBONS §6.9`): the corner *is* the curb ramp → a uniform concentric **all-SW annulus** from tangent to tangent; treelawn ends at the tangents; the uncovered wedge becomes sidewalk. A **round** dead-end is the exception — the treelawn wraps the cap (a wrap disk), not an all-SW ramp.
4. **Strip materials:** each strip is tagged **LU** or **SW** via `stripMat` (default `{outer:'LU', inner:'SW'}`); the LU strips route to `treelawn:<lu>` / land-use floods, the SW strips to sidewalk.
5. **Output:** `{ Wacc (sidewalk), tlByLu (treelawn per land-use), luByLu (land-use floods) }`; `buildTileGround` then stencil-intersects + unions these into the rendered `treelawnByLu` / `luByClass` / `sidewalk`.

The block silhouette + curb come from the frozen `iA` directly (`block = ⋃ iA`; curb = `iA − iC`). Nothing in the pass reads a chain.

---

## 4. ⭐ The keystone — freeze the *silhouette*, author the *FILL* live

This is the architecture that makes Section responsive, and the thing the freeze is **for**.

**What freezes (the SHAPE — Survey's product, the DataWall asset):**
- `ring` — the tile face boundary · **`iA`** — the rounded curb edge · **`vertR`** — the per-corner radii. The block **silhouette + its silhouette corners.**

**What stays live (the FILL — Section's authoring, re-stroked off the frozen edge every drag):**
- treelawn depth · sidewalk depth · strip materials (LU↔SW) · the corner *fill* (ADA pad shape follows the authored widths). These are **interior** — they slide along the frozen `iA`, they never move it.

The split, stated once: **corner identity + block silhouette (topology/shape) = frozen, upstream; ped widths + corner fill (the cross-section) = live, in Section.** Dragging a sidewalk handle reshapes the interior strips of the *activated* block only; the silhouette — the expensive, map-wide thing — stays the frozen render (`SURVEY §4.1`, the activated-block perf model; the freeze is *as much a perf move as a correctness one*).

> ⚠️ **Where the code is vs this target (the open gap, 2026-06-07).** Two things stand between today and the picture above:
> - **The frozen `shapeTiles` currently bakes in the ped widths too** (`tl`, `sw`, per-run `measure`), not just the silhouette. So `sectionPass`/`sectionOpen` stroke the FILL from *frozen* widths — the interior is frozen along with the outline. For live FILL, the ped widths must come **live** (the authored `blockCustoms`), stroked onto the frozen `iA`.
> - **Wall Phase-D (`ef460d1`) froze the whole tile in the Measure tool** — `sectionOpen` renders everything from `shape.json` and the live build is gated off — so FILL authoring there is currently a frozen snapshot (move a handle, nothing re-strokes). Phase-D landed the freeze→open **mechanism** ahead of the live-FILL build; the correct end-state hosts `sectionOpen`'s silhouette-freeze *with* a live FILL stroke, not instead of it. (`WALL.md §4`; this is the live coordination issue.)

---

## 5. The authoring panel — the FILL controls

Section authors a thin per-block-edge overlay keyed to Skeleton identities (`skelId`, side, `segOrd`). Today's surfaces (`SECTION-CENSUS §1`): `MeasurePanel.jsx` (numeric rows) · `MeasureOverlay.jsx` (on-canvas) · `measureModel.js` (drag math).

| Control | What it does | Writes |
|---|---|---|
| **Treelawn-outer** handle (`treelawnOuter`) | drags the treelawn depth (re-splits the tl+sw total around the dragged radius) | per-fe `blockCustoms[skelId][side][segOrd].treelawn` |
| **Property-line** handle (`propertyLine`) | drags the sidewalk depth (`sidewalk = r − inner`) | per-fe `…segOrd].sidewalk` |
| **Strip-swap** (ctrl / right-click in a strip) | flips that strip's material **LU ↔ SW** (menu-free binary) | `…segOrd].materials.{outer|inner}` |
| **Whole-chain ↔ per-block** mode | edit *scope*: fan one value across every fe of the chain, or write the one block-edge | the selection an edit fans across (never a write to `chain.measure`) |
| **Symmetric ↔ Asymmetric** | mirror an edit to the opposite side, or one side only | transient UI state (`editSidesSeparately`), not a persisted flag |

Two rules the canon is firm on:
- **All writes are polygon-scope (per-fe), in `blockCustoms`** — `chain.measure` is read-only pipeline-derived input (V2-Measure, `RIBBONS §5`). Mode is a *selection criterion*, never a write scope.
- **The asphalt-edge handle (`pavementHW`) is NOT Section's** — it moved to Survey (the SHAPE split already started). Section shows **only its own** ped handles.

---

## 6. The corner is two things, in two tools

This is the line that resolves the long corner saga (`ARCHITECTURE §2.1`, "conflating these two is the root of the corner mess"):

- **The corner *shape*** — how round the curb silhouette is (the radius) — is **Survey**, frozen into `vertR`.
- **The corner *fill*** — how the ped ribbon bends around it: the ADA all-SW pad, where treelawn ends at the tangents, the cap wrap on a round dead-end — is **Section**, stroked live off the frozen arc.

So "author the corners in Section" means the **fill**, not the radius. The ADA pad (§3.3) is the corner fill made concrete: the corner *is* the ramp, so it floods all-SW from tangent to tangent. A Section corner defect (point-ramp collapse, ADA-tangent glitch) is a `sectionPass` FILL bug; a too-round / too-square corner is a Survey SHAPE concern Section merely inherits.

---

## 7. Where Section is today

**~70% built** (`SECTION-CENSUS`, the forensic verdict): the *construction* (`sectionPass`) exists, obeys the wall, and renders the live map today. What remains is **the authoring front-end + the live FILL stroke + three FILL defects** — Section is *wiring*, one *product decision*, and *geometry finishing*, not a from-scratch build.

The open work (ordered in `SECTION-CENSUS §6` — that is the build backlog; this is the orientation):
1. **Wire authoring onto the tile construction (T3).** The handles + strip-swap still author against the **dying figure-ground** path while the tiles render — so the authoring↔render disconnect. Migrate them onto the frozen tiles; re-point the read-only seeds at the frozen artifact. (`HANDOFF-tile-T3-authoring.md`, `HANDOFF-survey-section-tool-design.md`.)
2. **⭐ Resolve D1 — the live-FILL / WYSIWYG decision (Jacob's call).** Today the ped-width handles write `blockCustoms.treelawn/.sidewalk`, but the tile render reads only `pavementHW` and takes ped depths from a per-tile **average** — so a treelawn/sidewalk drag barely moves the map (the headline drift, *pre-existing*, independent of Phase-D). The decision: thread per-fe ped widths **live** into the stroke (the §4 target — drags render, full WYSIWYG) **vs** accept the concentric-corner average and make the panel honest. This is the gate for the responsiveness §0/§4 promise.
3. **Fix the FILL geometry defects in `sectionPass`** (Section's own, not authoring): ADA tangents (G5), point-ramp collapse (keep the corner pad a solid all-SW region), and **port the capacity guard (G12)** as a general per-tile clamp on the inward offsets (kills the ~100 thin-tile thorns in one move).
4. **Cap ped-wrap (G8), live strip-swap (M3), delete figure-ground (T4), rename Measure → Section** (cosmetic, last).

> ⚠️ **The Phase-D coordination issue (live, 2026-06-07).** The freeze→open *mechanism* landed (`sectionOpen`, Section reads `shape.json`) but currently freezes the **FILL** as well as the silhouette, so FILL authoring in the Measure tool is a frozen snapshot. The correct end-state — §4 — keeps the silhouette frozen and the FILL live. Until the live-FILL build (1+2) lands, the freeze should not gate out the live render. See `BACKLOG §NOW`.

---

## 8. The doctrine, in one place

- **Section = FILL; Survey = SHAPE.** Section authors the ped cross-section; it never authors the silhouette or the corner radius.
- **Strokes INWARD off a FROZEN edge.** The curb line is frozen input; Section offsets inward from it and freezes the FILL onward to the bake.
- **The wall is the `sectionPass` signature.** Chain-free by closure — keep it that way; reaching back is the bug-class.
- **Freeze the silhouette, author the FILL live.** That split is what makes FILL drags cheap (re-stroke the activated block's interior; never recompute the outline). The freeze serves perf as much as correctness.
- **The corner is two things in two tools** — *shape* (Survey, frozen) vs *fill* (Section, live).
- **Per-fe, polygon-scope authoring** — writes land in `blockCustoms`; `chain.measure` is read-only.
- **A Section defect is a FILL problem** — diagnose in `sectionPass`'s inward strokes off the frozen tile, never by reasoning back through chains.

---

## Cross-references
- `SURVEY.md` — the SHAPE tool whose frozen `iA` Section strokes off (the upstream producer).
- `WALL.md` — the freeze between them; `§4` the Phase-D freeze→open mechanism.
- `SECTION-CENSUS.md` — the **State/forensic companion**: the current-Measure inventory, the wall-compliance audit, the WYSIWYG drift (D1–D5), the defect catalogue, and the ordered build backlog. *(This doc is the Reference; the census is the work list.)*
- `ARCHITECTURE.md §2.1` — the three tools; the two-corners distinction.
- `RIBBONS.md §5` (the Measure operator model) · `§6.9` (the ADA corner pad).
- `PIPELINE.md §section` — the execution spine.
- `src/lib/tileGround.js` — `sectionPass` (the wall), `sectionOpen` (the open-side), `buildTileGround` (the host).
- Memory: `[[project_two_bakes_two_walls]]`, `[[feedback_survey_polygon_not_ribbon_concepts]]`, `[[project_special_sauce_intersection_street_distinction]]`.
