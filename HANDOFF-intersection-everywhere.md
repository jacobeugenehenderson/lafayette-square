# HANDOFF — intersections everywhere ("the initial thing")

**Goal:** construct an **intersection at EVERY node** and **trim each road to edge-collision** — the standard road-network algorithm (osm2streets) that Macadam confirmed **E3 is a hand-rediscovery of**. This is the fix for the defect this whole arc was about: **a chain meeting a straight run with an artifact on the opposite side** — Jacob's marks. They survive because E3 only built at the **86 divided/mapped nodes** and left the **~84 plain cross-nodes (the Ts) untouched** — exactly where the marks are. Generalize to every node + trim-from-edge-collision and they're gone.

**The standard, in our terms (`OSM2STREETS-GROUNDING.md`, Macadam — read it first):** at every node, **trim each road back** (`trim_start`/`trim_end`) to where its casing edges **collide** with the neighbors' casings, then assemble the **intersection polygon** from the trimmed ends with **corners by clockwise leg adjacency**. The mapping is exact: **apron = intersection polygon · de-taper window = trim distance · corner identity = corner pair.** The two deltas that fix the marks: **(1) every node**, not just the 86; **(2) trim from edge-collision**, not from median-nose stations (nose-stations only existed for divided roads — that's why plain Ts were never reached).

> 🔑 **What the corner editor revealed (Jacob, 2026-06-06):** the artifact isn't just a stray shape — **it's a constructed CORNER.** `filletRing` (E3.3) rounds convex vertices *per-vertex, blind*, so it fillets a vertex where a side-street Ts in and the through-road should run **straight past** — a **spurious corner on the opposite side of the straight run** (it shows a magenta handle in the corner editor). The standard cure is structural: corners come **only from clockwise leg-adjacency at the trimmed intersection**, so a corner exists *only* where two real legs meet — the spurious one **can't be built**. (Not all artifacts are corners — some are slivers/steps; trim + the intersection polygon handle those. The corner ones are the clearest tell.)

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** Forensic-then-build (the trim is an algorithm change — validate before the full rollout). **Push back** if the framing's wrong. Web access useful (the osm2streets `intersection`/`trim` source).

> ⚠️ **Data access (worktree trap).** `overlay.json`/`skeleton.json`/`marker_strokes.json` gitignored — read main-tree absolute paths. `src/data/ribbons.json` tracked (carries `junctionMap`). Harnesses: `scratch/voussoir-*.mjs`, `trammel-*.mjs`, `chamfer-*.mjs` (git-tracked).

**Read first:** **`cartograph/OSM2STREETS-GROUNDING.md`** (THE spec — the trim-back algorithm + the ours→standard mapping + the recommendation: "intersection-everywhere at prebake, riding consume-by-identity") · `JUNCTION-CURE-PLAN.md` + the **E3 machinery**: E3.1 `ribbons.junctionMap` (the identity stamp — extend it), E3.2 `tileGround` de-taper + aprons (the consume-by-identity pattern — reuse), E3.3 `filletRing` corners · `SKELETON.md §5e` · the **8 marks**.

**The build (forensic-then-build):**
1. **Forensic / validate the trim first.** On a few marked **plain Ts**, compute the **edge-collision trim** (where the through-road's casing meets the side-street's casing) and confirm the de-taper + apron at that trim **kills the opposite-side artifact** — and that **doglegs dissolve under trim** (the off-chord node ends up inside the intersection polygon — the grounding's §5a bonus, no straightener needed). Confirm before rolling out.
2. **Extend the junction construction to EVERY node** — the junctionMap (E3.1) + the de-taper/apron consume (E3.2) + the fillet (E3.3), no longer gated to the 86 divided/mapped nodes. The 84 plain cross-nodes now get intersections too.
3. **Trim from edge-collision** (standard `trim_start`/`trim_end`), replacing the median-nose-station source — this is what makes it generalize to plain Ts.
4. **`innerSign` = face adjacency** (which half-edge bounds the median face), in the prebake face substrate — Telford punted it here on purpose (folding it upstream = a second face walk = palimpsest). This **kills the E3.4 foot-vote bug class** by construction.
5. **Land it the proven way** — at prebake / consume-by-identity (the E2/E3.2 pattern), inside the PREBAKE polygon-ization.

**Verify (all of it — this touches the previously-untouched plain nodes):**
- **The 8 marks** — project each; the opposite-side artifact is **gone** (≤ datum residual).
- **The divided junctions** (E3.2/E3.3's good ones) and **Benton/Waverly/E2 medians** — no regression.
- **The 84 previously-untouched plain cross-nodes** — now constructed, and **clean / better, not worse** (sweep them; flag any that the trim degrades).
- **Corner-editor acceptance test** (the sharp one): with the corner editor ON, **only REAL corners have magenta handles** — no spurious corner on the straight-through side of a T (the thing Jacob caught). Sweep the marked Ts this way.
- **Jacob's live eye** on the marked spots + a node sweep (the gate).

**If the rollout is risky**, phase it (a subset of nodes, verify, expand) and say so — don't blast all nodes blind.

**Done:** intersections constructed at every node, edge-collision trim, the marks' artifacts gone, no regression, `innerSign` on face-adjacency — **clean on Jacob's eye**. Report residuals + any node class the trim doesn't handle. ⛔ No canonical-doc edits (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** the fillet/authoring kit (ours — it's what makes it *beautiful*; keep) · adopting osm2streets the library (we port the method) · the full D2 wall-freeze if separable (note the seam).
