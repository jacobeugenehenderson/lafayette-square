# HANDOFF — Polygon-first junction construction (intersection-everywhere at prebake)

**Agent: FRESH.** Self-contained prebake/geometry build with a complete doc trail; the Boz ipseic load-in adds nothing. **Name yourself** (one word, your choice — it joins the name-trail).

**Task, one line:** Construct **every** junction as ONE frozen polygon at prebake (the standard trim-back + intersection-polygon + corner-assembly, generalized from E3's censused ~86 nodes to all nodes) so that asphalt, curb, treelawn **and** sidewalk all *derive* from that single source — fixing the weird-street T-junctions (where side-street sidewalks don't connect to the through-road) **by construction.**

---

## ⭐ THE LOAD-BEARING PRINCIPLE (do not violate — Jacob, 2026-06-12)

There is **ONE source of truth per junction**: the constructed intersection polygon (+ the block faces around it). **Every layer derives from it.** **Never build a per-layer apron** — a separate "ped silhouette" alongside the asphalt apron is a *fourth thing reconstructing the junction*, which re-creates the exact disagreement we are deleting. The cross-section (sidewalk/treelawn/median) **lives on the road**, not in an overlay (`OSM2STREETS-GROUNDING §1.2`). If your construction can't honor *"one polygon, all layers derive,"* **STOP and flag** — do not improvise a parallel mechanism.

## ⛔ FORENSIC-FIRST — read the canon before you touch code

This exact problem burned a full session (2026-06-12) by **skipping the docs and patching the wrong (FILL) layer.** The canon already holds the answer. Per `CLAUDE.md` + `BOZ.md §4` (a hard gate): read the sections below, to the section, **before** you diagnose or build. "I'll check the code" verifies code against doctrine — it is not a substitute for reading the doctrine.

---

## FIRST READS — the route (cite-by-section)

0. **`CLAUDE.md`** (repo root) — the routing gate: route → read canon → reuse forensics → name the SHAPE/FILL layer → the **operator's eye is the gate** (proxy renders mislead on this map).
1. **`BOZ.md §0`** feature index — rows **"Weird-street junction mess"** + **"Polygon-first / the Data Wall"** + **"Junction / corner construction"**; then **§4** (the hard gate) + **§3** (trim-on-subsume — if you settle a doc, trim it).
2. **`OSM2STREETS-GROUNDING.md` — THE build spec.**
   - **§4.2** = your task, named: *intersection-everywhere at prebake* (every node → an intersection record: kind + per-leg **trim by edge-collision** + **intersection polygon** + **corner-pairs by clockwise adjacency** + absorb legs consumed by trim as `internal_junction_road`).
   - §1.4 (the trim-back / assemble algorithm), §1.2 (cross-section on the road), §1.6 (blocks = faces — our tiles).
   - §3.2 (the defect = *"the intersection was never constructed"* — the absence of trim+assembly; **every E3 artifact lives in this gap**), §3.3 (the dogleg dissolves under trim).
3. **`POLYGON-FIRST.md`** — the invariant (§1) + the **definition-of-done checks A/B/C** (§2). Done = A∧B∧C green. Check A is runnable today (`cartograph/litmus-curb-parallel.mjs`, RED).
4. **`PREBAKE.md §4.1` + `§5`** — the unfrozen-curb gap (what's frozen vs not: L1 topology ✅, the curb GEOMETRY ✗) + the polygon-ization target (where the freeze lives).
5. **`PREBAKE-POLYGONIZATION-PLAN.md`** — the **D1–D5 decomposition** + the validated Mississippi×Lafayette spike + the L1/L2/L3 freeze-granularity split.
6. **`JUNCTION-CURE-PLAN.md`** — **E3** (the *partial* junction construction already landed: apron = intersection polygon, de-taper window = trim distance, corner identity = corner-assembly; what's done E3.1/.2/.3, what's left). Your job generalizes E3 from ~86 censused nodes to every node (§4.2).
7. **`SKELETON.md §5d/§5e/§5f`** — the "special sauce" (intersection *variable*, street *simple*), the wrong-legs corner, the unfrozen-curb statement; **§3 step 8** (junction-protected RDP — why the 79 Ts are kept).
8. **`SECTION.md §7` (reframed) + §7.1** — the FILL side: the ped **derives**; do **not** build a ped apron; the SHAPE-vs-FILL diagnostic line.

## FORENSICS TO REUSE — do NOT re-run or re-derive

- `scratch/w18-attribute.mjs` · `w18-overlay.mjs` · `w18-neck.mjs` · `w18-mech.mjs` — the throat forensic for the canonical T (image #3): proves the **silhouette is clean (iA 0 self-int)**, the face pinches **locally** at the throat, and the two faces' bands converge across an **un-constructed junction**.
- `scratch/mercator-*.mjs` — the Mississippi×Lafayette spike (leg-pairing construction validated to ~4 m; the §4.2 corner-assembly in miniature).
- `scratch/voussoir-*.mjs` — the map-wide junction census (53 width-steps, 24 transition nodes, the apron/continuity-pair model).
- `scratch/corner-guard.mjs` — **the corner-safety harness**: per-tile ped-output signature + nearest-fillet-apex distance; assert the hard-won corners stay byte-identical (snapshot → build → check).
- `cartograph/litmus-curb-parallel.mjs` — **Check A** (curb-is-a-parallel-offset; RED today, must go green incl. the junction zone).

## The build — staged, each step gates on Jacob's eye (lit app, not SVG)

Spine = `OSM2STREETS §4.2`, mapped onto `PREBAKE-POLYGONIZATION-PLAN`'s D-decomposition:

1. **Forensic-confirm (read-only).** Re-run the harnesses above on the image-#3 T + the bare dead-end stub; confirm the un-constructed-junction root at the polygon layer. **Gate: Jacob on the findings.**
2. **Generalize the junction map to EVERY node at prebake** (E3.1 → §4.2): kind, per-leg trim by edge-collision, intersection polygon, corner-pairs by adjacency, absorb internal-junction-roads. **Geometry-neutral identity stamp first** (the `61930d7` pattern — A/B byte-identical).
3. **Consume by identity in the shape pass** (E3.2): de-tapered strokes + the intersection polygon become the silhouette; the block faces + their inward ped **derive** from the one silhouette → **sidewalks connect at the T.**
4. **Freeze the polygon substrate** (D6b · `PREBAKE §5`): emit `iA` + the junction silhouette **once** into `ribbons.tiles[]`; Survey + Section *consume* (D6c). **Turns Check B/C green.**
5. **Re-bake + gates** (below).

## ⛔ BOUNDARIES

- **The EYE is the gate.** Proxy renders have repeatedly misled on this map. Validate on the lit app (5173 / a re-bake), never SVGs. Name the visual gate explicitly in every commit body.
- **No FILL fix.** A `sectionPass` band-neck clamp (`thinTile`→`cap`, local) was built + **reverted** 2026-06-12 — wrong layer. The fix is the **polygon**; do not patch FILL.
- **The rebuild clobbers Jacob's uncommitted bakes** (`public/looks/.../design.json`, `public/baked/*`, `shape.json`). Re-run `derive.js` / re-freeze / re-bake **only on Jacob's explicit go**; checkpoint first.
- **The corners are sacrosanct** (the "I could cry" construction, `c9ddb08`, `SECTION §6`). Do NOT re-engineer them; **the corner-guard must stay byte-identical**. If a step would move a corner, STOP and flag.
- **Canonical docs are off-limits to edit** (`POLYGON-FIRST` / `PREBAKE` / `SKELETON` / `OSM2STREETS-GROUNDING` / `SECTION` / `RIBBONS` / `BOZ`) unless Boz says otherwise — propose updates back to Boz. Your `scratch/` harnesses + a results doc (`<name>-FINDINGS.md`) are yours.
- **Commit only your own files** (selective `git add`); never Jacob's bakes. Branch is `curb-offset-draw`.
- **Standup with Jacob** after the reads, before building (`BOZ §4`).

## Definition of done

A∧B∧C green (`POLYGON-FIRST §2`) for the junction zone · the image-#3 T-sidewalks connect on Jacob's eye in the lit app · corners byte-identical (`corner-guard`) · no FILL clamp. Then: write your `<name>-FINDINGS.md`, **propose** the canon updates to Boz (don't edit canon yourself), and this HANDOFF retires to NOTES per `BOZ §2`.

---
*Drafted by Boz, 2026-06-12, after the doc-wrangle round that made this route coherent (RIBBONS winnow + CLAUDE.md actuator + SECTION §7 / BOZ §0 reconciliation). The route above is the actuation: it aims you at the exact sections so you don't re-derive what the canon already holds.*
