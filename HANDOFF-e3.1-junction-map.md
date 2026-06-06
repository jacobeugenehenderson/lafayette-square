# HANDOFF — E3.1: the junction map (prebake identity, geometry-neutral)

**Goal:** stamp the **junction map** as frozen frame facts at prebake — per node: the **curb-continuity pairs**, the **de-taper windows** (reuse E2's nose stations), the **corner identities**, and the **apron spec**. This is the identity layer the construction (E3.2) consumes. **Geometry-NEUTRAL** — stamp facts, change no geometry (the `61930d7` / `spineAt*` pattern). This is the foundation for the junction cure; the visible de-taper is E3.2, next.

**Why now:** Voussoir's spike (`JUNCTION-CURE-PLAN.md`) proved one root — *the junction silhouette is never constructed* (emergent butt-capped constant-width strokes; trigger = **width discontinuity at the node**, 53 instances). The cure constructs the junction; E3.1 is its map.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** Build (stamp) + verify byte-identical. **Push back** if the framing's wrong.

> ⚠️ **Data access (worktree trap).** Operator data (`overlay.json`, `skeleton.json`, `marker_strokes.json`) is **gitignored** — read from the **main tree's absolute paths**. `src/data/ribbons.json` is tracked. Don't trust a worktree rebuild — read the live artifacts. The validation harnesses are `scratch/voussoir-*.mjs` (git-tracked).

**Read first (to the section):** **`cartograph/JUNCTION-CURE-PLAN.md`** (the whole plan — esp. §3 the continuity-pair sources + the node apron, and §6 the E3.1 row) · `SKELETON.md §5e` (the root + the `spineAt*`/`continuesAs` frame links) · the **8 marks** (`marker_strokes.json`, ground truth). Code: `skeleton.js` (where `spineAt*` is stamped — commit `61930d7`, the geometry-neutral frame-fact pattern to follow) + `continuesAs`; `derive.js` (carries phase facts to `ribbons.json`).

**The build (geometry-neutral stamping):**
1. **Curb-continuity pairs** per node — `(chainA,sideA) ↔ (chainB,sideB)` whose curbs are one physical curb through the node. Sources (all frame facts already carried): divided transitions via `phase.spineAt*` + `pairKey` (24 nodes); same-name joins via `corridorName`/name (Benton, Geyer, Papin, Chouteau…); **name continuations via `continuesAs`** — ⚠️ **the Truman↔Lafayette node at ~(549.7,282) has NO `spineAt*` because the corridor name changes; the map MUST use `continuesAs`/collinearity there** (the gap Voussoir found via marks #0/#1); pendant tips via L↔R asymmetry.
2. **De-taper windows** — reuse E2's nose stations as the window bounds.
3. **Corner identities** — which legs are the corridor outer-edge legs (for E3.3's fillet).
4. **The node apron spec** — **ONE junction-interior polygon per NODE** (not per pair), spanning all incident corridors' merge windows (multi-corridor/deg-6 nodes get one apron). Spec only here; construction is E3.2.
5. **Absorb/trim the 69 m² S-18th fragment** (it sits at a nose E3 builds on).

**Done:** the junction map stamped on every relevant node (continuity pairs, windows, corner identities, apron spec); **`continuesAs` consumed** (Truman↔Lafayette linked); S-18th fragment absorbed. **A/B render BYTE-IDENTICAL** (geometry-neutral — the gate); stamp count ≈ 24 transition nodes + same-name joins + 5 continuations. Report the counts + any node the link sources can't pair. ⛔ No canonical-doc edits (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** the de-taper strokes + wedges + aprons construction (**E3.2** — the visible cure, next) · fillet identities (E3.3) · datum repair (E3.4) · E4 rip-out · D2 freeze.
