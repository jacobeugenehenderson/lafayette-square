# BRIEF: a frame budget for every shot (measure what we draw that nobody sees)

<!-- BRIEF-STATE
status: OPEN
dispatched: Sigil (census), Usher (load + flight), Tinsel (the Light Show), 2026-11-01 night
written: 2026-11-01
evict-when: Jacob has, per town × shot × surface, a table of what draws, what is seen, and what it costs, plus a stated budget per shot with headroom named for new content; then this brief is replaced by the fix briefs it names
-->

**Boz, 2026-11-01, for Jacob. A FORENSIC first: measure and name. No fixes in this phase.** It absorbs
`BRIEF-tree-cost-forensic` (now in the Diary, `cartograph/_archive/BRIEF-tree-cost-forensic-ABSORBED-2026-11-01.md`).

⭐ **Start from Grain's verdict, don't redo it:** `scratch/tree-cost/VERDICT.md` (2026-10-04, LS and Huron) with its probe
`scratch/tree-cost/probe.mjs`. It found:
- Browse trees are geometry-bound: the overhead bands' 28×28 tessellation, 4,704 triangles per tree; flat bands were the one-line remedy.
- Hero cards cost 15–21 ms, cause not established.
- Lamps are 4,304 triangles each and are drawn again in every shadow pass. On Huron's Hero shot they cost more than the trees.

First, re-run its probe on today's code and say what has changed since (did flat bands land?). Then add what it never measured:
drawn versus visible (culling), AO, buildings, Provincetown and High Point.

## 0. Why now (Jacob, 2026-11-01, his words)

> "we need to really contemplate how we cull and display trees. Probably 80% of trees drawn never show; AO is the same, street
> lamps are the same. Buildings are the same. We draw SO many buildings we can't see. … we have things decently together now, we
> need to tighten the perf not ONLY because we always need to, but because we also need to add more to the map and we need to carve
> out a budget!"

**Jacob, refining it the same night:** "no; too literal. The point is we need all the space we can get, period. We need the agents to
survey and census the overdraws, and either develop or develop and deploy a plan to just not draw things we can't see. That means a
person would improve perf on their desktop by shrinking their browser window because the effective frustum is the literal, rendered
scene. We also need to collapse the 3-layer tree impostors to a single layer past a certain cone of detail; note we should still keep
the lesser impostors attached to the hires windsheet."

So the goal is **maximum headroom**, not a budget sized for one new feature. The governing rule: **nothing is drawn that the rendered
frame can't show.** Cost tracks the actual viewport and frustum, so a smaller window is measurably cheaper. ⛔ Layer 0: every cut-off
(the detail cone, a pixel threshold) is derived from the camera and viewport, never a constant fitted to LS.

## 1. The question

At each shot (the arrival flight, Hero, Browse, the A/B close camera, Street where it exists), for each class (trees by
representation, ground and AO, lamps, buildings, water, displays, sky), **how much is drawn, how much of it is visible, and what
does it cost?** "Visible" means in the frustum AND not occluded AND larger than about a pixel. Report all three separately: frustum
culling and occlusion culling are different remedies.

## 2. Instruments (reuse; don't build parallel ones)

- `window.__renderer.info` with `autoReset` off for one frame. Report "town pass" and "all passes" separately.
- The tree switches: `?treeDebug=noHeroImpostor,noOverhead,noMesh,noTrees`.
- Preview's gauges and the headless tier method: set the tier with `Page.addScriptToEvaluateOnNewDocument` **and** `Page.enable`,
  and confirm the tier live before trusting a phone reading.
- A scene-graph walk over shown meshes (walk parents for `visible`), with per-instance frustum tests for instanced classes.
- Occlusion, measured, not assumed: e.g. an ID pass or GPU occlusion queries over a sample of instances per class. Say which.
- The Ward's flight check (`society-flight-has-no-long-frame`) for the arrival flight.

## 3. Rules

- Triangles are not time. Separate geometry from fill/overdraw (shrink the pixel ratio and see whether ms scale with pixels).
- Every number names its town, shot, surface, state (arriving or resident), machine load (`uptime`) and GPU.
- A reading must be able to fail: show one switch moving one number before trusting a null.
- ⛔ Measure WITH the town's authored state loaded (Layer 0 Q3).
- One heavy browser at a time on this machine; ask Boz for the slot.

## 4. Deliverable

A table per town × shot × surface: per class, drawn / in frustum / visible, draws, triangles, toggle-delta ms, and pixel scaling.
Then one verdict per class, among:
- **culled too little** (frustum or occlusion; the remedy keeps every visible thing);
- **wrong representation** (e.g. mesh where a card or disc belongs);
- **heavy representation**;
- **overdraw**;
- **arrival-time only**;
- **cause not established**.

## 5. Phase two: build it (authorised by Jacob: "develop and deploy a plan to just not draw things we can't see")

Each fix is planned to Boz and Zob, built with its check, Zob-reviewed and merged by Boz. Publishing stays Jacob's press.
- **Cull to the rendered frame**, per class: frustum (per instance for instanced classes) and occlusion where the census shows it pays.
  The check: halving the viewport measurably cuts drawn instances and GPU ms on the same shot.
- **Trees: one band past the detail cone.** Beyond a cone derived from the camera and pixel density, an impostor draws one band, not
  three. It stays bound to the hi-res wind sheet, the same `windAt`/`windDetail` as the near trees. (The bands are already flat,
  2 triangles each, with the flutter in the fragment stage; `impostorGeometry.js#buildOverheadBandDisc`, 2026-10-04.) The band
  geometry is built in the player, so which bands draw is a runtime choice; the shipped band pictures stay as they are.
- **Lamps, AO and buildings**, as the census rules.
- ⭐ Prefer runtime changes over re-bakes: a player update never breaks a published slab
  (`feedback_a_player_update_never_breaks_a_published_slab`), so the shipped impostor assets stay as they are wherever possible.
Report the before and after per shot, same instrument.
