# HANDOFF — Phase D: the Wall as a real freeze (Section opens the frozen Survey data)

**Goal:** make the Data Wall a **real artifact boundary** — Survey freezes the per-tile shape to an artifact, and a **Section surface LOADS it and renders** (via `sectionPass`), instead of re-running the whole Survey build. This delivers Jacob's milestone: *"open Section and see the frozen Survey data."*

> ⚠️ **This is the PLUMBING — a labeled checkpoint, NOT "done."** Per `WALL.md §5`, the wall is only *done* when the freeze is real **and** the frozen data is correct on Jacob's eye. The data cure (false corner) rides `HANDOFF-prebake-polygonization-scope.md`. Ship the mechanism; expect it to display the current (still-imperfect) shape until the cure lands. **Do not** present frozen-wrong-data as the milestone met.

**Agent: FRESH** (name yourself). **`isolation: worktree`**. General-purpose. Can run parallel to the other briefs (different layer).

**Read first (to the section):** `cartograph/WALL.md §2,§3,§4` (current state + the freeze artifact + the Phase-D mechanism) · `cartograph/SURVEY.md §5` (the wall enforcement) · code: `tileGround.js` — `_shapeArtifact` (`:1108`, built only on `emitArtifact`), `sectionPass(shapeTiles,…)` (`:487`) and its **Phase-D load tolerance** (`:492-493`: it already accepts `shapeTiles` whether built in-memory or loaded from `shape.json` — array vs Set handled). The bake already writes the artifact (`bake-ground.js:304 emitArtifact:true`).

**The task:**
1. **Make the frozen shape available to the Section path** — either emit `_shapeArtifact` on the live Survey-exit build, or load the bake's `public/baked/<id>/shape.json`. (`sectionPass` already consumes either form — `:492`.)
2. **A Section render mode** that takes the **frozen `shapeTiles`** and renders the ped FILL via `sectionPass(shapeTiles, cw, stripMat)` + the block/curb from the frozen `iA` — **with no call to `buildTileGround`'s shape pass and no chain access.** Gate it to the Section/Measure tab.
3. **Prove the wall holds:** the Section view must render from the artifact alone. A quick assertion that the render path has no `streets`/chain handle (the signature already guarantees `sectionPass` can't reach back — keep it that way).

**Boundaries:** code on your worktree; ⛔ don't modify the shape pass / `extractFaces` / the corner construction (that's the cure brief), don't touch canonical docs. Commit + report.

**Done (the checkpoint):** opening the Section tab shows the **frozen** Survey shape (block silhouette + curb + ped fill) rendered **from the artifact**, not a live re-derivation — confirmed on Jacob's eye. Note clearly in your report that data-correctness is gated on the prebake cure (this brief is the freeze→open mechanism). Then `WALL.md §4` Phase-D = mechanism-landed; the §5 DoD's "correct data" half stays open until the cure.

**Out of scope:** fixing the false corner / thorns (the data cure) · deleting figure-ground (T4) · the slab/bake delivery (downstream).
