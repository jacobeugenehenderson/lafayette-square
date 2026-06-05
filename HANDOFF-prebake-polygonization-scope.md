# HANDOFF — Prebake polygon-ization: forensic scope + spike

**Goal:** design (and validate on ONE corner) the structural cure at the heart of the program — move the chain→polygon conversion into **prebake** and **freeze the polygon substrate**, so Survey stops re-deriving the block from chains every build and the **false corner dissolves** instead of being patched. ⚠️ This brief is **scope + spike, NOT a merge.** The polygon-ization is the standing architectural debt (the wall-move); we do not build it blind. Produce the plan + a validated proof on the Mississippi×Lafayette corner.

**Agent: FRESH** (name yourself). **`isolation: worktree`**. General-purpose. **Forensic-first** — read, design, spike, report; do not land a production change.

> **Push back if the framing is wrong.** This brief asserts an approach (freeze at prebake; pair corridor outer-edge legs via `spineAt*`). If the forensics contradict it — the freeze belongs elsewhere, `spineAt*` is insufficient, the granularity is wrong — **say so and flag Boz**, don't force the brief's path. (The prior hygiene agent caught a wrong instruction in its brief this way; that's the job, not a deviation.)

**Read first (to the section):** `cartograph/PREBAKE.md §4` (the gap — two-source seam; block re-derived in Survey) + **`§5`** (the target) · `cartograph/SURVEY.md §5.1` (why Survey isn't polygon-first) + **`§6`** (the divided transition: corner the corridor outer-edge legs, not the carriageway stubs) · `cartograph/SKELETON.md §5d/§5e` (the IP + the leg-pairing root) · `cartograph/WALL.md §1,§5` (frozen-wrong-data is odious; the DoD). Code: `tileGround.js extractFaces (:303)` + the per-tile build/`filletRing` (`:840-961`) — where the block polygon is born today; `derive.js:1056-1178` — the raw-OSM face derivation (the seam to retire). Frame fact: `phase.spineAtStart/spineAtEnd` in `ribbons.json` (the divided-transition link, already frozen).

**The questions to answer (the deliverable is a report):**
1. **Where should the freeze live?** Prebake (`derive.js`/`pipeline.js`) producing a frozen block-polygon substrate (the `extractFaces` topology + corner identities), vs. `tileGround` caching it. Recommend, with the wall implication (wall → ~P3).
2. **Corner identity at the divided transition** — given `phase.spineAt*`, how do we make the corner pair the **corridor outer-edge legs** (treat the divided corridor as one road) instead of the carriageway stub? This is the false-corner cure, expressed as a *polygon* decision made once (not a per-build reconstruction, not a `tileGround` keep-out patch — that was killed).
3. **The two-source seam (C5):** what does retiring the raw-OSM `polygonize`/`nodeEdges`/3 m-snap face path entail (faces from the skeleton instead)? Risk + sequence.
4. **Decomposition:** break the build into dispatchable sub-briefs with a dependency order + the eyeball gates.

**The spike (proof, not production):** on **Mississippi×Lafayette** (node ≈ `166.5,221.9`), demonstrate that pairing the corridor outer-edge legs produces the corner at the **true point ≈ (174,208)** matching `scratch/correct-target-mississippi-lafayette.json` (not the false `(214,216)`). A harness/SVG is fine for the spike — but **flag that final verdict is Jacob's eye on the live tool** (`[[feedback_proxy_render_is_not_the_operator_eye]]`).

**Boundaries:** spike code in `scratch/` + a report (a new `cartograph/PREBAKE-POLYGONIZATION-PLAN.md` or append to the brief). ⛔ Do not merge a production geometry change, do not rebuild `ribbons.json` into the live tree, do not touch canonical docs. Commit the spike + report on your worktree.

**Done:** a report answering 1–4 with a recommended sequence, **and** a spike that shows the corridor-leg corner hitting ≈(174,208) on Mississippi×Lafayette. Boz turns the decomposition into build-briefs.

**Out of scope:** building the full wall-move · the band-fold thorns (separate, `HANDOFF-band-fold-fix.md`) · Phase-D (separate). **Remember:** the cure is polygon-first; if you find yourself writing a `tileGround` corner-patch that reaches into carriageway/curb-line reasoning, stop — that's the killed approach (`SURVEY §6`).
