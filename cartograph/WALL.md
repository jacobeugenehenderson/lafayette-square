# The Data Wall

**The freeze between Survey (producer) and Section (consumer) — the moment chains die and the polygon shape becomes trusted, frozen truth.** This is its single-source-of-truth reference: the promise it makes, what crosses it, where it sits today (in code), the milestone that makes it a *real* boundary, and the definition of done.

> **Status: v0.1 (2026-06-05) — new, the topic-doc.** Grounded in code (`tileGround.js sectionPass`), verified 2026-06-05. The freeze is an *interface*, owned by neither tool — its own doc, like `SLAB-CONTRACT.md` (the other freeze). Closes the front-half spec: **`SKELETON` → `PREBAKE` → `SURVEY` → this.** Register docs reference it; `SURVEY §5` holds the (settling) `shapeTiles` field list this points to.

---

## 0. What the Wall is

By the time the operator leaves Survey we hold an extremely-simplified, polygon-ready **frozen** dataset, and **chains are dead.** Past the Wall, Section / bake / slab are **pure consumers** — they read the frozen shape and never derive geometry from chains. *(⚠️ TARGET, not current: this holds for Section by closure, but the **curb geometry is still re-stroked live in Survey** — the wall's producer side is unenforced. The enforcement checks live in `POLYGON-FIRST.md`; the gap in `PREBAKE.md §4.1`.)* It is **wall #1** of the project's two (`[[project_two_bakes_two_walls]]`; the slab is wall #2).

---

## 1. The promise — and why frozen-wrong-data is odious

The Wall exists so that **everything downstream can trust the frozen artifact unconditionally** — no re-derivation, no second-guessing, no reaching back. That trust is the entire value of the freeze (exactly the slab's promise to the runtime, one stage earlier).

**∴ freezing *wrong* data is worse than not freezing at all.** It doesn't just carry a defect forward — it **launders garbage into authority**: Section, the bake, and the slab all treat the false corner / the thorn as ground truth and build on it, and the defect is now *trusted*, harder to see, harder to dislodge. **Frozen-wrong-data is odious to the process** (Jacob, 2026-06-05). It can never be a definition of done.

So the Wall has **two inseparable halves**, and both must hold:
1. **The freeze is real** — a genuine artifact boundary (Survey freezes, Section opens), not a function call buried in one build.
2. **What's frozen is correct** — verified on the operator's eye *before* it's trusted. The wall freezes *trust*; only trustworthy data may cross.

---

## 2. Where it is today (verified in code)

- **As a discipline, it exists ✅.** `sectionPass(shapeTiles, cw, stripMat)` (`tileGround.js:487`) takes **only** the frozen per-tile polygons + scalars — zero handle on chains/streets/measures. Reaching back requires changing the signature (visible, auditable). The chain-free closure is real.
- **As a boundary, it does not yet exist.** `sectionPass` is called in exactly one place — *inside* `buildTileGround` (`:970`). The frozen `_shapeArtifact` is produced **only at bake** (`emitArtifact:true`, `bake-ground.js:304`), and **nothing loads it back**: the "loaded from `shape.json` (Phase D)" path is a *stub comment* (`:492`), unbuilt.
- **So "Section opens the frozen Survey data" is not a thing today.** The Measure/Section tab (`Panel.jsx:431`) re-runs the same live `buildTileGround`. Survey and Section are **one build**, not freeze-then-open.

---

## 3. What crosses the Wall

The frozen artifact: **`shapeTiles[]` / `_shapeArtifact`** → `public/baked/<id>/shape.json`. Per tile: block silhouette (`ring`), curb line (`iA`), per-vertex radius (`vertR`), the run's *frozen* measure, dead-end tip typology — everything Section needs, nothing chain-shaped. Field list + how it's built: **`SURVEY.md §5`/§3**.

> ⚠️ **Do not over-specify this schema.** It is **still settling** (Survey isn't at "0" yet — `SURVEY.md`). The contract is "whatever Survey freezes, Section loads and renders." Pin the *mechanism*, not the field set, until Survey's SHAPE is correct.

---

## 4. The milestone — Phase D: freeze → open

Make the Wall a **real boundary** (your near-term target: "open Section and see the frozen Survey data"):
1. **Freeze `shape.json` at Survey-exit** — the `_shapeArtifact` already exists at bake; make it available to the Section surface, not bake-only.
2. **Section loads it and renders via `sectionPass`** — which is already Phase-D-ready (it consumes loaded `shapeTiles` identically to built ones, `:492`) — instead of re-running `buildTileGround`.

The **plumbing** can be built and proven on current data. But proving the plumbing is a **checkpoint, not done** — see §5.

> ✅ **MECHANISM LANDED — checkpoint (Hadrian, `ef460d1`, 2026-06-07).** Chose the **load** path: `BlockGeometryV2Debug` fetches `public/baked/<scene>/shape.json` when `tool === 'measure'`, cache-busted on `bakeLastMs`, and renders every layer via the new **chain-free `sectionOpen(shapeTiles, cw, stripMat, stencil)`** (`tileGround.js:644`, the open-side mate of `sectionPass`): block from frozen `iA`, curb = `iA − iC`, asphalt = `ring − iA`, ped FILL via `sectionPass`. When the frozen geos compose, `tileGeos` returns `null` — **the live `buildTileGround` does not run** (verified). Chain-freeness proven at both levels (signature + the `sectionGeos` closure; `frozenShape` is `fetch`-sourced) and machine-scanned (`scratch/hadrian-wall-open-proof.mjs`). **This is §5(a) only.** The view shows the shape *exactly as frozen* (defects + bake-staleness included) — so **§5(b) stays open** on the prebake cure; do not call the Wall done.

---

## 5. ⭐ Definition of done

The Wall milestone is done when **both halves of the promise (§1) hold**:

- **(a) Mechanism** — Survey freezes `shape.json`; Section opens it and renders from the frozen artifact alone (no chain access, no re-running Survey's build).
- **(b) Correct data** — the frozen shape is **right on the operator's eye**: the false corner is gone, the thorns are gone, the block silhouettes are clean. **This is the gate, and it is not optional** — frozen-wrong-data is odious (§1).

**∴ the milestone is coupled to the data cure, not just the plumbing.** Reaching it requires, in order: **fortify Prebake (the polygon-ization that dissolves the false corner, `PREBAKE.md §5`) → fix the band-fold thorns → freeze → open in Section → operator confirms the frozen shape.** "Getting through Survey" means getting through it *correctly*. (You may land Phase-D plumbing first as a labeled checkpoint, but never call the wall done over wrong data.)

---

## 6. Where the Wall should sit

Today it sits at `sectionPass` — *after* Survey has re-derived the polygon from chains every build. The target is **earlier**: the **prebake→Survey boundary (~P3)**, polygon-first — the chain→polygon conversion frozen once in prebake, Survey reshaping frozen rings (`PREBAKE.md §5`, `SURVEY.md §5.1`). Moving the wall earlier is what makes (b) achievable structurally rather than per-build. *The chains-root-problem and the corner-confusion are one disease with one cure: polygon-first.*

---

## Doctrine, in one place
- **The Wall freezes *trust*.** Downstream consumes unconditionally; that trust is the whole value.
- **Frozen-wrong-data is odious** — it launders a defect into authority. Never a definition of done.
- **Two halves, both required:** a real freeze (mechanism) **and** correct frozen data (operator's eye).
- **Chains die here.** Past the wall, no geometry derived from chains — enforced by the `sectionPass` signature.
- **The wall belongs earlier (~P3), polygon-first** — move it, don't patch across it.

## Cross-references
- `SURVEY.md §5` (what freezes + the wall enforcement) · `§5.1` (polygon-first) · `§4.1` (activated-block perf).
- `PREBAKE.md §5` — the polygon-ization that makes the frozen data correct (the cure).
- `SECTION.md` — the consumer side (the FILL tool that opens the freeze; built — `§7` for the open tail). The pre-build forensic census is archived: `_archive/SECTION-CENSUS-2026-06-03.md`.
- `SLAB-CONTRACT.md` — wall #2 (the analogous freeze, cartograph→LS).
- `src/lib/tileGround.js:487` (`sectionPass`, the wall) · `:492` (the Phase-D load stub) · `:1108` (`_shapeArtifact`).
- Memory: `[[project_two_bakes_two_walls]]`, `[[project_skeleton_is_the_first_bake]]`.
