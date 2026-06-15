# PROPOSAL — FEATURES as the front door (reviewable; NOT applied)

**Codex, 2026-06-14. For Jacob's eye on the shape before Boz applies.** Pass 2 of the doc audit (`scratch/audit-docs.md`). The mechanical cleanup (Pass 1) is committed; this is the one judgment-heavy move left, so it's a proposal, not an edit.

**The goal (Jacob's, via the doc-system arc):** an agent should learn *what's already decided* from the first read and never start from scratch (re-deriving "polygons only"). Today FEATURES is ~509 lines: a genuine brochure on top, then ~220 lines of engineer-internals + dated DONE-narrative that the doc's *own* migration note says belong elsewhere. The proposal: **lift the settled-doctrine headlines to the TOP as the universal first-read, migrate the engineer back-half out, and point README §START HERE + BOZ §0 at FEATURES as the front door.**

Three reviewable parts: **(A)** the new FEATURES top (drafted verbatim — this is the shape to react to) · **(B)** the migration table (what leaves FEATURES, where it goes) · **(C)** the README/BOZ pointer changes + the OPERATIONS stub.

---

## (A) The new FEATURES top — the drafted first-read

> Insert this as the new opening (after the H1, before "Architecture in one paragraph"). It is the executive orientation: *what's decided, where it lives.* Everything below it stays the brochure (conceptual model, roles, the three environments, helper apps), minus the back-half that migrates out (part B).

```markdown
# Features & Roles

Read this first if you're new (human or agent). Cartograph is a **kit** for
pouring a fast, fortified, beautiful 3D neighborhood **slab**; Lafayette Square
is its v1 instance. This doc is the front door — *what the thing is, why it's
special, and the decisions already settled so you build on them instead of
re-deriving them.*

## ⭐ What's already decided (don't re-derive — each links its authoritative home)

> These are the load-bearing conclusions the project keeps having to NOT
> relitigate. If you're about to design or diagnose, confirm your move against
> the relevant row first. (Settled-state *by pipeline stage* is `README §⭐ START
> HERE`; the *where-does-X-live* index is `BOZ §0`; this is the *why-it-is*
> orientation that spans both.)

| # | Settled doctrine (the one-liner) | Home |
|---|---|---|
| 1 | **Polygons Only — the TILE model.** The map is tiles = faces of the centerline graph; strips painted inward; the corner is the inward-offset, never a constructed fillet primitive. | `RIBBONS §1`, `POLYGON-FIRST` |
| 2 | **The Skeleton is The First Bake.** By Survey-exit, hold an extremely-simplified, polygon-ready frozen frame (a clean block ≈ 4 corners). | `SKELETON`, `PIPELINE §skeleton` |
| 3 | **Chains die at the Wall.** No geometry derived from chains past the freeze; first diagnostic on any defect = *"is this chains again?"*; the fix is *move the wall earlier*, never patch chains deeper. | `PIPELINE §Wall`, `WALL` |
| 4 | **The Derivation Chain: centerline → polygon → ribbon.** The centerline is the ROOT; the polygon is BOTH geometry AND identity (leg/corner/treelawn-vs-sidewalk read off it); fix at the centerline first — patching the polygon on a rough centerline edits a shadow. | `RIBBONS §1`, `SKELETON §3.5` |
| 5 | **The curb is a concentric offset of the centerline (D6a).** NOT an asphalt-union carve; cleanup lives on the frame, never the curb. | `POLYGON-FIRST §1` |
| 6 | **SHAPE automated / LOOK authored — the KIT INVARIANT.** Hand-authored SHAPE is a *defect*; data-derivable → automatic; only genuinely-creative LOOK is authored. The 35 curated streets are the metric to drive to 0. | `SKELETON §6`, `INTAKE §6.1` |
| 7 | **Two-carriageway divided model LOCKED.** Carriageways stay 2 chains at the inner edge; pairing gated on station-overlap; median constructed at prebake (E2) or emergent. | `RIBBONS §3.1` |
| 8 | **The curve-fit ONE KNOB (`STREET_SMOOTH`).** A single SSoT smoothing control, consume-time, never baked into the sparse frame; built, dormant at 0 pending the robust offset. | `SKELETON §3.5` |
| 9 | **SHAPE = Survey · FILL = Section.** Survey freezes the hardscape silhouette; Section strokes the ped FILL inward off the frozen curb; the ribbon is mono-width, the corner is the band BENT. | `SURVEY`, `SECTION` |
| 10 | **The slab is the contract.** Cartograph pours a flat/fortified/dumb slab; LS trusts it unconditionally; **anything authored-but-not-baked is invisible.** | `SLAB-CONTRACT`, below |
| 11 | **The correctness suite — automate the operator's eye.** One RED-until-true invariant per bug-class; the *detector* is the deliverable, not the 6 fixes; the 35 lean topological → graph checks. | `POLYGON-FIRST §5` |
| 12 | **Inputs are authoritative, not guessed.** City parcels/ROW + operator-measured widths + OSM geometry + ML footprints, fortified against max-res aerial; no external street source helps (County rejected). | `INTAKE §5.1/§6` |
| 13 | **Compass frame only.** One frame; no rotation constants in the math/data layer (the 9.2° park rotation is real-world geometry). | `ARCHITECTURE` (moved from here) |
| 14 | **Grade separation handled.** `gradeSeparated` excluded from the face graph, stroked flat on its own layer, rendered behind local. | `PIPELINE §Wall` |
| 15 | **Toy is the canonical pipeline test rig.** A new scene routes through the existing pipeline, never a toy-only branch. | `AGENT-VALIDATION-SURFACES` |
| 16 | **The doc architecture.** Three kinds (Reference/State/Diary, one per doc); three registers (FEATURES user / OPERATIONS operator / dev docs); additive-never-destructive; hot/cool. | `BOZ §0–3` |

## Where everything lives (the map, in one glance)

- **By pipeline stage** (settled conclusion + status, per stage): `README §⭐ START HERE`.
- **Where-does-X-live** (artifact homes + the cross-cutting feature index): `BOZ §0`.
- **The execution spine** (how raw data becomes the slab, P1–P15): `PIPELINE`.
- **The three registers:** *this doc* (user/investor — what & why) · `OPERATIONS` (operator — the panel, the knob, when to turn it) · `README · ARCHITECTURE · PIPELINE · RIBBONS · SKELETON` (developer — built/runs/geometry).
```

*(Everything currently in FEATURES from "Architecture in one paragraph" through "The three operator environments" and "Helper apps" stays — it's the brochure. The cuts are in part B.)*

---

## (B) Migration table — what LEAVES FEATURES (and where it goes)

> The cut is the back half (the "Known live architecture issues / load-bearing decisions" block + the layering/depth deep-dive + the dated Arborist/loop phase-logs). Each fact moves to its register's home; FEATURES keeps only a one-line pointer where useful.

| FEATURES content (current) | Kind | → Destination |
|---|---|---|
| **"Layering / coplanar stacking / depth precision"** (the 4-mechanism table, log-depth, `polygonOffset`-inert corollary, decision rule, counter-rules) | engineer doctrine | **ARCHITECTURE** (new "Render-layering & depth" decisions section) |
| **Bake cache-bust / async bake / dirty-skip mtime / output-write ordering** | engineer doctrine | **ARCHITECTURE** (bake-chain decisions) — `BAKE.md` already exists; fold there or ARCHITECTURE §7 |
| **Terrain doctrine** (one dial `V_EXAG`, corner-mean anchor, instance-scale, coverage parity, triangulation density) | engineer doctrine | **ARCHITECTURE** (terrain decisions) |
| **Frustum culling on GPU-displaced meshes · MapLayers ground SHOT_SKIP · serve.js restart · GrassMesh polygonOffset parity** | engineer gotchas | **ARCHITECTURE** (render gotchas) |
| **`ribbons.streets[].highway` class · overlay.json-not-centerlines · algorithm-drift-resolved · Designer↔bake parity · scene-parametric bake** | engineer data-flow | **ARCHITECTURE** / `PREBAKE` |
| **Render environments topology table (5 envs) · neon renderer internals · tube-radius channel · gate split · eligibility** | engineer doctrine | **ARCHITECTURE** (render-environment map + neon) |
| **Divided inner-edge anchor workflow** (the long §367–395 block, self-marked "being retired") | superseded mechanism | **`RIBBONS §3.1`** (live model) + the trail → NOTES; drop the retired-workflow prose |
| **Corner-pad V2 / DP simplification / V2 curb boundary stroke / `cornersAtIx` polygon-edge-Q** | superseded figure-ground mechanism | **NOTES** (Diary) — excised at T4 per the existing banner; keep nothing live in FEATURES |
| **Non-street ribbons helper · park-path bridges · water/lamps dedup · arborist authority · render.js dead knobs** | engineer notes | **ARCHITECTURE** |
| **Arborist procedural v1/v1.5 phase logs (A–G, with commits)** | dated DONE-narrative | **NOTES** + `arborist/NOTES.md` (git keeps the commits) |
| **Loop streets L.0–L.6 in-flight** | State/Diary | **`LOOP-STREETS.md`** (already the home) + NOTES; drop from FEATURES |
| **Sky Layer Gain · corner-authoring kit · Hero shot · Stage drag · bake buttons · alley end-cap dial · tube-radius slider** | **operator knobs** | **OPERATIONS** (see part C stub) |
| **Frame discipline (compass-only, the 9.2° firebreak)** | engineer decision | **ARCHITECTURE** (Decisions) — leave headline #13 pointer in FEATURES |
| **Data flow & the bake chain (the big ASCII tree) · Map state preservation** | engineer reference | **ARCHITECTURE** / `BAKE.md` |

**Net:** FEATURES drops from ~509 lines to ~140 (the brochure + the new doctrine top). Nothing is deleted — every fact lands in ARCHITECTURE / OPERATIONS / NOTES, and FEATURES keeps a one-line pointer where a reader would look.

⚠️ **Open question for Jacob:** ARCHITECTURE is currently 182 lines and lean. Absorbing the FEATURES engineer back-half roughly doubles it. Options: (a) one big ARCHITECTURE Decisions section; (b) split render-internals into a new `RENDER.md` reference; (c) fold bake-internals into the existing `BAKE.md`, terrain into a `TERRAIN.md`. **Recommend (c)** — route each block to the stage-doc that already owns it (BAKE, PREBAKE, STAGE), ARCHITECTURE gets only the cross-cutting decisions (layering, compass, render-env map). Your call before Boz moves text.

---

## (C) Pointer changes + the OPERATIONS stub

### README §START HERE — add FEATURES as the universal first read
The table's "Doc process" row points at BOZ. Add a lead line above the table:

> **New here?** Read **`cartograph/FEATURES.md §⭐ What's already decided`** first — the 16 settled-doctrine headlines + the where-everything-lives map. Then this topic table (settled-state by pipeline stage).

### BOZ §0 — point the register table at FEATURES' new top
In the register→home table, the Marketing row already names FEATURES; add to its cell: *"(§⭐ What's already decided = the universal first-read: the settled-doctrine headlines + the map)."* No structural change — just surface that FEATURES now carries the orientation.

### OPERATIONS stub (drafted — fills the stalled SEED from the migrated operator-knobs)
OPERATIONS is currently placeholders ("to populate as T3 lands", untouched since 2026-06-01). The operator-knob rows from FEATURES (part B) are ready to fill it now:

```markdown
## Survey — the hardscape-SHAPE tool
- **Asphalt-edge handle** (`pavementHW` per side).
- **Corner-radius kit (3 tiers):** global `Corners` slider × per-IX dot × per-corner cyan dot. 1× = AASHTO/NACTO baseline; >1 bubblier; 0 = square (sponsored "retro"). Color: blue/cyan default, gold authored, white mid-drag. Right-click an IX dot = revert that IX. Per-Look in `design.json`.
- **Caps** (round/blunt/none) · **curb** (global width, own material) · **auto-smoothing** (selected→raw, returns on `enter`).

## Section — the ped-profile tool
- **Ped handles** (treelawn/sidewalk widths) · **strip-material swap** (ctrl-click LU↔SW) · **edit-row vs edit-block** · **translucency-focus** (selected translucent / context opaque — by design, `RIBBONS §5`).
- **Revert to Default** (footer, whole-scene) · **⌃-click a ped handle** = per-edge re-seed to the calculated best-effort (gleaned treelawn + ADA).

## Stage — the look tool
- **Sky Layer Gain** — dims *just the sky dome* on a TOD curve (≠ global Exposure, which dims the whole frame). LS holds ~1.0 day → ~0.2 night; stars unaffected.
- **Hero shot** — an authored camera bounce (Start/End anchors + optional Mids; path-honest timeline; FOV per-keyframe; `easing` knob). Replayed identically in Stage/Preview/production via `heroAnim.js`.
- **Bake buttons** — "Stage →" (navigate + bake async) · "↻" (bake in place). ⌥-click = force full rebuild. The orange dot = unbaked edits exist (indicator only).
- **Alley end-cap dial** (Paths ▸ Shape): square / rounded / round — controls every alley in the active Look.
- **Tube-radius slider** (Neon): per-Look `tubeRadius` (0.1–3.0 m); geometry rebuild, step-quantized.
- **Stage drag:** Browse LEFT=pan, ⌥+LEFT=orbit; Hero/Street LEFT=rotate.

## Preview — the slab inspector
- GPU profiler · phone-mode · layer-toggle matrix · TOD scrub. Model: `PREVIEW.md`.

## CLI / bake
- `skeleton.js → pipeline.js → promote-ribbons.js → bake-ground.js`; dirty-skip; unflagged bake target → `lafayette-square`.
```

---

## Recommended sequence (for Boz, on Jacob's approval)
1. Jacob reacts to **(A)** the shape + the **(B) ARCHITECTURE-vs-split** open question.
2. Boz inserts (A) at the FEATURES top; fills the OPERATIONS stub (C) — both additive, low-risk, can land first.
3. Boz migrates the engineer back-half (B) per Jacob's routing choice — the larger, careful move (lift to destination *then* cut from FEATURES, per the §3 safety rule).
4. README/BOZ pointer lines (C).
5. Accord-sweep + commit.
