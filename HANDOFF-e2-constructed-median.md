# HANDOFF — E2: constructed median at prebake (replace the emergent residual)

**Goal:** stop deriving the divided-road median as a *residual* (the leftover face between two emits — fragile, fragmenting, mis-tagged, "concrete pills") and instead **construct it as a real polygon at prebake**: the polygon between the pair's two **inner-edge** chains (they *are* its edges, per D9), tagged `kind:'median'`, with a **blunt ~2 m nose** where the median opens/closes at a transition (so the merge region joins clean). This is the divided-corridor foundation; **the joints/folds/corners themselves are E3 (next)** — E2 makes the median a positive object so E3 can resolve the junctions against a clean edge.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** General-purpose, forensic-then-build. **Push back if the framing's wrong** (it's the job).

> ⚠️ **Data access (worktree trap).** Operator data (`overlay.json`, `skeleton.json`, `marker_strokes.json`) is **gitignored** — your worktree won't have it. Read from the **main tree's absolute paths** (`/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/lafayette-square/clean/…`). `src/data/ribbons.json` is tracked. **Don't trust a worktree pipeline rebuild** — read the live artifacts.

**Read first (to the section):** **`cartograph/DIVIDED-CORRIDOR-PLAN.md` §2 + the E2 row** (Alidade — the constructed-median design: polygon between the inner-edge chains, blunt nose, merge stays asphalt) · `PREBAKE.md §5` (the polygon-ization target) · `LOOP-STREETS.md` (Waverly's emergent median is the same class) · `cartograph/TRUMAN-FORENSICS.md` (the residual median's fragmentation — what you're replacing). Code: `tileGround.js` `isMedianTile`/`effectiveMeasure` (`:377-390`, `:883-890` — the **emergent** heuristic to retire) + `extractFaces`; `derive.js` `medians[]` (the **vestigial** A+B-reversed ring — replace it with the real constructed polygon, or build fresh).

**The build (forensic-then-build):**
1. **Construct the median at prebake** (`derive.js`/pipeline): per divided pair, the polygon between the two inner-edge chains (D9: the chains are the median's edges, `chainGap` = its width). **Blunt ~2 m nose** where the median opens/closes at a transition (the merge region node→nose stays asphalt — lanes join clean). Tag `kind:'median'`. Freeze it into `ribbons.json` as a *consumed* polygon (not the vestigial decoy).
2. **tileGround consumes the constructed median** — render it (grass/median LU + material), zero its ped, and **retire the emergent path** (`isMedianTile` >40%-heuristic + the G3a sliver heuristic) for divided medians. The median is now the constructed polygon, not a leftover face.
3. **Verify** the median is continuous + clean across **all 22 divided corridors** (no fragmentation, no pills, correct LU/material), Truman included; the transition merge regions are clean. Geometry-neutral elsewhere (non-divided streets, faces unchanged).

**⚠️ Rebuild-drift:** loop + divided renders drift on `ribbons.json` rebuild even with byte-identical inputs (`SKELETON.md §5a`) — **eyes on the live render** (divided corridors + Benton/Waverly) after any rebuild; don't trust the pipeline.

**Done:** the median renders as a clean constructed polygon across all divided corridors **on Jacob's live eye** — fragmentation/pills/LU-mistag gone, merge regions clean; the emergent heuristic retired. Report what was retired + any corridor that still looks off. ⛔ No canonical-doc edits (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** the full prebake **face-freeze** (D2 — the wall-move; separate, comes with/before E3) · the **junction cure** (E3 — the fold-at-join, the corner, the **perpendicular-join protrusion / T-bulges / Benton-stem**; next, on this median) · the rip-out (E4) · the L.3 loop role cross-sections.
