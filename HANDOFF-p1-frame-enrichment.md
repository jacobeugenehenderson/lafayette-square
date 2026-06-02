# HANDOFF — P1 Frame-Enrichment (the first *forward* brief — the publish path)

> **Status: dispatch-ready** (Boz, 2026-06-01). **BUILD mode** (edits the pipeline — not read-only). **Warm → Vesalius** (it dissected the data and wrote the proof); cold-fallback fine — the foundation is on disk.

## You are the builder (warmly: Vesalius, continuing)

If you're Vesalius: you proved this is possible — now make it real. If you're fresh: **name yourself**, and read `cartograph/OSM-FORENSICS.md` + run `scratch/vesalius-rich-frame-proto.cjs` first; that prototype is your proven starting point. You are not Boz.

## The mission

The forensic verdict (Boz-verified): **the frame is strictly poorer than the raw OSM — the First Bake throws away marrow that's already there.** This brief turns the proven prototype into the **real enriched First Bake**, swaps it into LS, and measures the off-the-shelf win. **This is the publish path** — LS renders at 0%, and better bones are the prerequisite.

**Honest calibration (hold this):** un-breaking P1 is *upstream* of the wall-move. It makes the frame correct and **shrinks the customs-graveyard need** (the clean-slate-but-enrich-first sequence) — but LS's 0% is a *downstream* customs break. Do **not** expect LS to flip to 100% from a better skeleton. The win you're proving is *"the bones are now right, and the wall-move just got cheap."* Eval at the surface where the frame's effect shows: the **Survey/Designer live render + frame metrics** — not the full (still-broken) slab.

## Scope — sequenced lowest-risk-first (see the win early)

1. **Junction preservation (highest leverage, lowest risk — do this first and eval before moving on).** Make `skeleton.js`'s `simplify()` (line ~375, `devTol=0.2`) **junction-aware**: never collapse a vertex that is, or is near, a junction / shared node. **Gate: the 79 interior T-junctions Vesalius found deleted must come back — count must hit 0 deleted.** This alone should improve LS because the pipeline stops being fed broken junctions. Re-derive LS `skeleton.json`, confirm the 79, eyeball the Survey/Designer render.
2. **Node typing.** Emit T / cross / dead-end / Y onto each node (prototype already does this: 141 T / 84 cross / 103 dead-end). Carry it onto the frame so a cap becomes **a fact** (butt vs round) instead of operator-authored-or-blunt-and-pray. (Downstream may not read it yet — emit it; consuming it is the follow-on.)
3. **Stop dropping tags.** Carry `lanes` / `surface` / `maxspeed` / the already-computed **median width** onto the frame. Standards-seed the genuinely-absent ones: `width` (0% OSM) and treelawn/sidewalk — **NACTO-by-class for curb-return R; PROWAG for sidewalk; AASHTO deferred [U]** (per `OSM-FORENSICS.md` Part 4).
4. **The canonical regression case — Dolman→18th 'U'.** Resolve it *in the frame*: name-transition (at 0.00 m) + welds + the real cross-section change + the arc-smooth. **Gate: delete the two `derive.js` hacks (West-18th densify, LaSalle magic-coordinate extend) and the result stays correct** — proving they were frame-thinness scars.

## Validation gates (must pass)
- **79 interior Ts → 0 deleted.**
- **Dolman→18th correct with both `derive.js` hacks removed.**
- **North-star:** ordinary streets get correct treelawn + sidewalk placement **by default, zero authoring**.
- **The real verdict is Jacob's eye** on the production/Designer render — measured deltas inform, they don't decide (a proxy reading that disagrees with the operator's screen is void).

## The eval (the deliverable's point)
Swap the enriched frame into LS, re-derive, and report the **off-the-shelf delta** with **NO downstream consumer changes** (Layer 1): what got correct, junction counts before/after, where the Survey/Designer render improved, and — honestly — **what still needs the wall-move** (so we don't mistake "frame fixed" for "LS published"). Recommend the Layer-2 follow-on (consumers starting to *read* the typed nodes / seeds).

## Explicitly OUT of scope (defer — don't let these creep in)
- The **boundary trio** — vestigial-bbox retirement / circle-only, build-beyond-crop, systematic stencil-cull replacing the manual out-of-neighborhood toggles. *That's the very next brief.* **Exception:** if out-of-neighborhood clutter makes the eval unreadable, do the cheap stencil-cull (`faceInBoundary`/`pointInBoundary` exist) as **eval-prep only** — don't refactor the bbox.
- The **Survey-tools switch / design-process reorg** (Jacob: deferred — prove the data win first).
- Deep **Layer-2** consumer rewrites beyond what's needed to *show* the win.

## Guardrails
- **A/B safety:** preserve the old LS `skeleton.json` (git) so we can revert and compare — this brief's whole value is a clean before/after.
- **LS bake care:** mind the default-scene clobber (`memory: bake-ground scene clobbers default look`); don't trash other Looks.
- **Do NOT edit canonical docs** (`FEATURES`/`ARCHITECTURE`/`PIPELINE`/`RIBBONS`/`BACKLOG`/`NOTES`). Write findings to a new eval file (e.g. extend `OSM-FORENSICS.md` or a sibling) + `scratch/`.
- **Stay surgical** — this is a frame-only change; resist touching downstream emit/customs (that's the wall-move).
- **Commits:** Boz coordinates — leave your changes staged/described, don't merge to main.

## Deliverable
Enriched `skeleton.js` (junction-aware simplify + node typing + tag carry + seeding) · re-derived LS `skeleton.json` · the two `derive.js` hacks removed · a **before/after eval writeup** (frame metrics + Survey/Designer render observations + honest "still needs the wall-move" list + Layer-2 recommendation). Name yourself in it.
