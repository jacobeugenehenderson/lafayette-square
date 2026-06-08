# HANDOFF — Section FILL forensic: canon vs. code vs. render (the corners + the handles)

**Goal:** a cold, skeptical **forensic report** on the *actual* state of Section's FILL — specifically **why the corners draw wrong** and **why the authoring handles are not connected to / responsive to the ribbons** — grounding in the **code and the render**, and **auditing the canon against that reality.** Diagnosis only; **no fixes.**

**Agent: FRESH** (cold eyes — the forensic-gunslinger pattern; name yourself). **Read-only** — touch no code, no canon docs. Your single deliverable is the report (`scratch/SECTION-FORENSIC.md`) + a structured final summary. **`isolation: worktree`** optional (read-only, so not required).

> ⚠️ **Be skeptical of the docs.** A large body of Section canon (`SECTION.md`, this session) was written fast, partly from machine shape-proofs and partly aspirationally, while the operator's eye says the render is broken. **The docs are CLAIMS to verify, not ground truth.** Where the code/render contradicts a doc, the code/render wins and you flag the divergence. The operator's eye is the ultimate gate — your job is to *locate* the truth for it, not to declare things fixed. (Lesson: `feedback_proxy_render_is_not_the_operator_eye`, `feedback_docs_effluvium_buried_the_answer`.)

## The two operator symptoms (Jacob's eye — these PRE-DATE the recent per-edge work; do NOT assume the latest commits caused them)
1. **The corners draw wrong** — the ped ribbon at intersections/corners is visibly malformed.
2. **The ribbons are not connected to, or responsive to, the handles** — dragging a depth handle neither sits on the strip nor moves it.

## Read first — the canon (as claims to verify), then the code (the reality)
- **Canon (claims):** `SECTION.md` (esp. §3 the construction, §3.3 per-edge, §4 freeze-silhouette/live-FILL, §5 the "one depth truth" handle rule), `SECTION-CENSUS.md` (the older forensic — the D1/D5 drift, the dying figure-ground), `RIBBONS.md §3.9a` (the V1 model the canon claims to follow) + `§6.9/§6.10`, `WALL.md §4` (Phase-D frozen path), `SURVEY.md §4.1`, `FEATURES.md:82` (the Aerial focus mode — the context the operator judges in).
- **Code (the reality):** `src/lib/tileGround.js` — `sectionPass` (the FILL + the per-edge corner/sector construction), `sectionOpen` (the frozen open-side), `buildTileGround` (the live path), `extractFaces`/`tilesFromFrozen` (D2). `src/cartograph/BlockGeometryV2Debug.jsx` — the render branches (`sectionFrozen`/`sectionGeos`/`tileGeos`, ~:635-680). `src/cartograph/MeasureOverlay.jsx` + `MeasurePanel.jsx` (the handle placement, the drag write, the strip hit-test) + `resolvePedDepths`.

## The questions the report must answer (with `file:line` evidence)
1. **Which path actually renders the Measure tool, under what conditions?** Frozen `sectionOpen`(shape.json) vs live `tileGeos`(buildTileGround) — trace the gate (`sectionFrozen = measureActive && !!frozenShape`, the `if (sectionGeos) return null`). When is each live? Is the operator even seeing what they think they're editing?
2. **The handle loop, end to end.** Drag → which depth does the handle *read* (live `chain.measure`? frozen run? `resolvePedDepths` with *which* `baseMeasure`?) → write to `blockCustoms[which key]` → does the rendered path *read that same key* and re-stroke? **Pinpoint the break:** key mismatch (skelId/side/segOrd), live-vs-frozen `baseMeasure` divergence, a stale/absent re-render trigger, or the handle simply positioned off a different model than the FILL strokes. (The canon §5 claims "one depth truth"; verify it is actually ONE source across the frozen seam.)
3. **The corner construction the render actually uses.** Trace the corner/sector slicing in `sectionPass` (the `cornerT`/`sectors`/`groups`/`fullBand` machinery). What does it geometrically produce at a corner, and what's the most likely locus of "draws wrong" (the sector graze, the max-adjacent trim, the bent slice, the divider concentric-to-curb)? Render a couple of corner closeups (scratch SVG/PNG) to characterize — **labeled as proxies, not verdicts.**
4. **Canon-vs-reality divergences.** Every place `SECTION.md`/`SECTION-CENSUS` claims behavior the code does NOT do (or does differently). This is the core value — the docs may have laundered shape-proofs into "it works."
5. **The frozen artifact currency.** Does `shape.json` (what `sectionOpen` reads) actually match the live build / the operator's current edits? Is the operator editing live `blockCustoms` while staring at a frozen `shape.json` that only refreshes on re-bake? (`bakeLastMs` cache-bust — does a handle drag refresh it, or only a bake?)

## Deliverable
- **`scratch/SECTION-FORENSIC.md`** — structured: (a) the render-path map (what renders when), (b) the handle-loop trace + the exact break, (c) the corner-construction characterization, (d) the canon-vs-reality divergence list, (e) a ranked root-cause hypothesis for each of the two symptoms, (f) the recommended *fix locus* (where, not how — leave the fix to a follow-up). No code edits, no doc edits.
- **Final summary message:** the two root causes in one paragraph each, the top 3 canon divergences, and the single highest-leverage next move.

## Boundaries
Read-only. No code, no canon-doc, no bake. Proxies (scratch renders) are allowed but must be labeled as proxies — the operator's eye is the gate. Don't propose or apply fixes; *locate* the disease.
