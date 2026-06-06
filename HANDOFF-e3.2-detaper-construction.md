# HANDOFF — E3.2: de-taper construction (the visible joint cure)

**Goal:** CONSTRUCT the junction silhouette — make `tileGround` **consume the junctionMap** (E3.1) by identity (the E2 pattern) and build: **de-tapered run polylines** (continuity-paired curbs run *straight through* the node instead of two independent butt-capped constant-width strokes), **transition wedges**, and the **node aprons** (one per node, into `aFill`). This kills the **fold / step / dip / scoop / tooth / spur** at the joints. **This is the visible cure** — the joints Jacob marked finally resolve here.

**Root (settled, do not re-derive):** the junction silhouette was never constructed — emergent butt-capped constant-width strokes (`extractFaces` L297 → `strokeOpen` L919 → blind `filletRing` L88); trigger = width discontinuity at the node; 53 instances; ONE root for fold + corner + perpendicular-protrusion. E2 cured the *needle*, not the join (18/24 nodes still stepped). E3.1 stamped the map; E3.2 builds from it. `JUNCTION-CURE-PLAN.md` / `SKELETON.md §5e`.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** Build-then-verify. **Push back** if the framing's wrong.

> ⚠️ **Data access (worktree trap).** Operator data (`overlay.json`, `skeleton.json`, `marker_strokes.json`) is **gitignored** — read from the **main tree's absolute paths**. `src/data/ribbons.json` is tracked (carries `junctionMap`). Validation harnesses: `scratch/voussoir-*.mjs` (git-tracked). Don't trust a worktree rebuild — read the live artifacts.

**Read first (to the section):** **`cartograph/JUNCTION-CURE-PLAN.md` §3 (the cure) + §6 E3.2** · the **`ribbons.junctionMap`** structure (E3.1's output — continuity pairs, de-taper windows, corner identities, aprons; `nodes` + `unpaired`) · the **8 marks** (`marker_strokes.json`) + the plan's **§5 proposed column** (the target residuals) · the **voussoir harnesses** (`voussoir-census` / `voussoir-spurwidth` / `voussoir-steps` — the pass/fail surface). Code: `tileGround.js` — `extractFaces` (L297), `strokeOpen` (L919), `filletRing` (L88) — the butt-capped emergent path to replace; **the E2 consume-by-identity pattern** (how `medians[] kind:'median'/'merge'` are consumed — mirror it for the junctionMap).

**The build (build-then-verify):**
1. **De-taper the strokes.** For each continuity pair, the curb is **one physical curb through the node** — run it straight through (de-tapered), using the E3.1 de-taper window (E2 nose) as the blend zone. No more two independent butt-capped constant-width strokes meeting at a step.
2. **Transition wedges + node aprons into `aFill`.** Build the **one-apron-per-node** polygon (the junctionMap's apron spec) as positively-asphalt (`merge`-class) — its edges are the *constructed* curbs (offset from the chains), which kills the deg-6 inter-pair slivers AND the zero-width coincident-edge spurs.
3. **Trim the S-18th 69 m² fragment** at its nose (E3.1 absorbed it by spec; now make it visible).

**Verify (all three):**
- **Harnesses:** `voussoir-census`/`spurwidth`/`steps` → **0 real folds, 0 steps on continuity pairs**.
- **Marks:** residuals ≤ the plan's §5 proposed column (remaining gap = width datums → E3.4, not E3.2's concern).
- **Jacob's live eye** (the gate): the Lafayette east join, **S-Jefferson (marks 4–7)**, the **Benton stem**, Truman↔Grattan, and the **deg-6 Lafayette×Jefferson** sweep — all clean.

**⚠️ Don't regress:** E2's medians, the loops (Benton/Waverly), and the 84 plain cross-nodes must stay clean. Eyes on the render after rebuild (the §5a drift class).

**Done:** the joints cured (no fold/step/dip/scoop/tooth/spur on continuity pairs) — harnesses green, marks ≤ proposed, **clean on Jacob's eye**. Report residual marks (→ E3.4 datum) + any unpaired node still stepping. ⛔ No canonical-doc edits (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** corner fillet identities (**E3.3** — round outer legs only, next) · datum repair (**E3.4** — Jacob's method call; the innerSign vote-flip finding belongs here) · E4 rip-out · D2 freeze · the median refinement (parked).
