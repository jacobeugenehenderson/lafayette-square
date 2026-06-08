# HANDOFF — Forensic deep-dive: the no-mouth-side T-junction dogleg (the intersection-everywhere *finish*)

**Goal:** a **sharp, complete understanding** of *one* persistent artifact — the **dogleg on the straight (no-cross-street) side of a T intersection**, visible as the park-perimeter doglegs. Map the E3.2 junction construction **op-by-op at a degree-3 T**, pin the **exact line** that inserts a corner where the centerline is dead-straight, explain **why**, and name the **fix locus** (where, not how). Diagnosis only — **no fixes.**

**Agent: FRESH** (cold eyes — the Plumb/Bollard forensic-gunslinger pattern; name yourself). **Read-only** — touch no code, no canon. Deliverable = `scratch/JUNCTION-FINISH-FORENSIC.md` + a structured final summary. Worktree optional (read-only).

> ⚠️ **Be skeptical of the docs** — verify claims against the code/render; the code wins, flag divergences. **The operator's eye is the gate** — proxies (scratch renders) are allowed but labelled as proxies; your job is to *locate* the disease precisely, not declare it fixed. (`feedback_proxy_render_is_not_the_operator_eye`, `feedback_shape_proofs_dont_gate_fill_geometry`.)

## The artifact (operator, Jacob)
The **park-perimeter doglegs** at the T intersections around Lafayette Park: **Vail→Park, Kennett→Mississippi, Mackay→Park, Albion→Missouri, Waverly→Lafayette.** Jacob's words: *"it happens on the straight sides of T intersections… a path/chain meets a straightaway"* — the avenue's edge on the side **opposite the stem** doglegs **at the node**, even though the avenue runs dead-straight through it. (`HANDOFF-band-fold-fix.md` calls this the **no-mouth-side facet**, distinct from Root A the band-fold.)

## VERIFIED this session — build on these, do NOT re-derive (frame measurements, `ribbons.json`/`shape.json`):
- **The skeleton is clean here.** Each stem meets its avenue **exactly 0.00 m, on an avenue vertex**; the avenue's local turn at that vertex is **0.0–0.3°** (dead straight). So this is **NOT a skeleton / centerline problem** — tightening the skeleton maker changes nothing. (Contradicts any "off-chord dogleg" read; matches `SKELETON §5a`'s "clean centerlines 0.0–0.1°".)
- **`filletRing` already skips straight vertices** (`FILLET_TURN_TOL = 18°`, `tileGround.js:84/129/214`) — so the dogleg is **NOT a naive fillet of a straight vertex.** Something in the **E3.2 junction construction inserts geometry** (a >18° turn, or a positive apron/window poly) on the straight side, which then reads as a corner.
- The stems touch the avenues **mid-chain** (the avenue family is split at *its own* major intersections, not at these stem-Ts) — confirm how the deg-3 node is represented in `junctionMap`.

## Read first (claims to verify) → then trace (the reality)
**Claims:** `HANDOFF-band-fold-fix.md` (the TWO T-mouth facets: Root A band-fold vs the no-mouth straight-pass-through — §28-32) · `HANDOFF-junction-band-thorns-FINDINGS.md` (Bollard pinned **Root A only**, op-by-op — the no-mouth facet is **not** pinned, that's your job) · `JUNCTION-CURE-PLAN.md` (Voussoir's E3 scope: "the junction silhouette is never constructed") · `SKELETON.md §5a` (the dogleg doctrine + the reverted straightener) + `§5e` (the corner-builder root) · `BACKLOG` row **e3.2-window-quality** (the documented phase-next: *fillet gate → `cornersAdjacent`, apron-everywhere + leg-completeness, perimeter through-steps, edge-collision window sizing*).

**Reality — `src/lib/tileGround.js`:** the **[E3.2] junction construction** (`:1104`–~`:1470`) — `consumeJM`, the window trims (`jTrims`), the window polygons (`jPolys`), the **ONE apron per node** (the fan of leg curb points), the perimeter variant (`jPerimPolys`); the **[E3.3] corner identities** (`:1139`+); `filletRing`/`sharpCornerIndices` (`:188`/`:201`); the `junctionMap` schema in `ribbons.json` (nodes, continuity pairs, corners, aprons). Also `derive.js` where the `junctionMap` is built (E3.1).

## The questions the report MUST answer (with `file:line` + evidence)
1. **Op-by-op at a degree-3 T** (2 collinear avenue legs + 1 stem). Walk what E3.2 draws at the node: the window trims, the window polygons, the **apron fan**, the corner identities. Be concrete for one node (e.g. Kennett→Mississippi).
2. **WHERE exactly is geometry inserted on the NO-MOUTH side** (opposite the stem, between the two collinear avenue legs)? Is it the **apron fan** spanning across the straight-through pair? a **window polygon**? a **corner-identity** pairing the two collinear legs? the underlying butt-capped stroke? Pin the line.
3. **WHY** — what does the construction assume that's wrong for the **collinear / straight-through** case? (e.g. the apron fans *all* leg pairs including the 180° straight pair; or a corner is paired where the two legs are collinear; or a window is built where none is needed.)
4. **Same root as Root A, or separate?** `HANDOFF-band-fold-fix.md` claims separate ("Option A's clamp won't touch it"). Confirm or refute against the code.
5. **The fix locus** — where would a *straight pass-through* be enforced ("no apron/window/corner where the two legs are collinear")? Name the function + line; sketch the gate (e.g. a collinearity/`cornersAdjacent` test). **Where, not how.**
6. **Scope** — sweep the deg-3 Ts: how many exhibit this, magnitude (the dogleg's depth/angle), and whether the 5 park-perimeter ones are representative or special.

## Deliverable
`scratch/JUNCTION-FINISH-FORENSIC.md` — structured: (a) the deg-3 T op-by-op map, (b) the exact no-mouth insertion (file:line) + a labelled proxy render of one node, (c) the why (the construction's wrong assumption), (d) same-vs-separate-from-Root-A, (e) the fix locus, (f) the affected-junction list + magnitude. **Final summary message:** the mechanism in one paragraph, the single exact insertion op (file:line), the root cause, and the recommended fix locus.

## Boundaries
Read-only. No code/canon/bake edits. Proxies labelled as proxies. Locate, don't fix. If you find the no-mouth dogleg is actually a *different* root than "construction corners a straight side" (e.g. it IS the band-fold after all, or it's the perimeter `jPerimPolys` path), say so plainly — kill the hypothesis if the code says otherwise.
