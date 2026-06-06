# HANDOFF — Benton loop guard (bad-custom-data sanity-guard + both loops working)

**Goal:** stop the Benton loop collapse (a bad-custom-data trigger), and get **both** LS loops — Benton (teardrop) and Waverly (couplet) — rendering correctly **at the same time** (the standing "never both at once" goal). Primary deliverable = the **sanity-guard**; the gate = both loops on Jacob's eye.

**Root (settled, do not re-derive):** E1 sources widths custom→OSM→AASHTO and *correctly trusts the custom tier* — but `survey.json` gives Benton `rowWidth: 4` (assessor; a real loop ROW is ~12–18 m), so the asphalt clamped to `pavementHW 0.5` and the loop body collapsed. Same class as Park Ave's contaminated `2.99`. **The data is wrong, not the logic.**

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** General-purpose, build-then-verify. **Push back if the framing's wrong** (it's the job — several agents have).

**Read first (to the section):** **`cartograph/LOOP-STREETS.md`** (the consolidated canon — topologies, the per-role cross-sections §2, live-vs-dead §4, the tension §5 — read it all) · `SKELETON.md §3 step 8` (the `isClosedLoop` RDP guard) · memories `[[feedback_geometry_bugs_may_be_data_bugs]]` (this is its exemplar), `[[feedback_remove_functionality_excise_knobs_wiring_docs]]`. Code: E1's width sourcing in `skeleton.js` (`stampCustomWidths`/`seedSection`) + `streetProfiles.js` (the asphalt clamp); `tileGround.js` (`isMedianTile`, the `thinTile` capacity guard, single-run-loop rounding, `effectiveMeasure`).

**Tasks:**
1. **Sanity-guard the custom-width tier (the fix).** An implausibly-small custom ROW/width must **not** be trusted blindly — floor it or fall back to OSM lanes → AASHTO (Benton `lanes:2` → AASHTO ~7 m). Pick a defensible threshold (a residential street's ROW/asphalt can't be a fraction of a lane). This must fix **Benton** AND **Park Ave's** pinch, and harden the base-loading against *any* future bad custom data (the kit needs this) — **systemic, not a Benton special-case.**
2. **Verify the loop cross-sections (LOOP-STREETS §2).** Benton **body** = outer full ROW + **sidewalk**, inner = treelawn→median, **no inner sidewalk** ("all-grass median, sidewalk on the outer edge"). Waverly **couplet** = outer ROW each carriageway + emergent median. Confirm the role-based ped zeroing produces these; if a role isn't honored, flag it (may be a follow-up loop brief, not this one).
3. **Both at once.** The capacity bind (§5): Benton's body and Waverly's median are both thin tiles — don't fix one by flipping the other across the `thinTile` threshold. The gate is **both rendering cleanly simultaneously** on Jacob's eye.

**⚠️ Loop-render drift:** rebuilding `ribbons.json` drifts the loop renders even with byte-identical inputs (`SKELETON.md §5a`). **Eyes on the Benton + Waverly 2D Survey render are mandatory** after any rebuild — don't trust the pipeline.

**Done:** Benton no longer collapsed — proper width, all-grass median + outer sidewalk; Waverly couplet + emergent median clean; **both at once on Jacob's live eye**; the sanity-guard provably prevents the bad-data collapse class (Park Ave included). Report the threshold chosen + any loop-render follow-ups found. ⛔ Don't touch canonical docs (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** deleting `LOOP_STREET_NAMES` (L.6 cleanup) · the divided-corridor joint cure (E2/E3) · the new joint marks · fixing Benton's *survey datum* itself (kit re-import — the guard makes it not-collapse regardless).
