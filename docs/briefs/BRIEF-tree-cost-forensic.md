# BRIEF — Forensic: what exactly draws the trees, per shot, and what each piece costs

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: for LS and one large town (Huron or Provincetown), per shot (Browse, Hero, Street) and per surface (desktop, phone-hi), Jacob has a table of which tree component draws (HeroImpostorTrees / OverheadTrees / InstancedTrees mesh), its draws, triangles and toggle-delta time, measured at rest AND during arrival, plus a verdict among {wrong representation drawing, heavy cards, overdraw, arrival-time cost} or "cause not established"
-->

**Boz drafted this 2026-10-04 at Jacob's request; Jacob dispatches. ⛔ A FORENSIC: it measures and names the cause. It does not fix.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- ⛔ **No edits to `src/`, `arborist/`, `cartograph/`, docs or scene data.** ⛔ No pours, bakes or new servers (reuse :5173). Read
  anything; run existing checks; write read-only probes in `scratch/tree-cost/` and commit only those, by name.
- ⚠️ Live in the same checkout: **Plumb** (package F, in `src/preview/*`, `src/lib/qualityProfile.js`, `src/lib/deployment.js`) and
  **Lens** (package B, the camera). Don't touch their files; `ListAgents` → `SendMessage` if you need to coordinate.
- Run `node scripts/bake-in-flight.mjs` before any measurement: a bake rewriting the slab mid-reading invalidates it.

## The question, and why

Measured 2026-10-04 by Plumb (package E), LS **Browse**, desktop target, headless M1:
- The town scene pass: **365 draws, 30.57M triangles.** A scene-graph sum (shown meshes, index ÷ 3 × instances) gives 28.07M: **trees
  25.36M**, lamps 2.50M, ground 0.17M, buildings 0.03M. The two agree to ~9%; the 2.5M gap is unexplained.
- By toggle delta (non-additive, this desktop's GPU): **trees off −62 ms of ~128 (≈48%) on desktop, −33.6 ms of ~47 (≈71%) on
  phone-hi**; ground off −12 ms / −1.3 ms.

⇒ **Trees are the dominant cost.** Jacob: *"Is the only remediation then fewer trees?"* The answer depends on **which** tree pieces
draw and why. That's this forensic. Each verdict points at a different remedy, and three of them keep every tree.

## The lead to test first (read in source, NOT established)

**Browse is supposed to draw trees as overhead discs, which are cheap.** `src/components/InstancedTrees.jsx` (the render, around the
`overheadMode` groups):
- Hero cards are hidden in Browse (`HeroImpostorSpecies … visible={!overheadMode}`).
- **Mesh trees are deliberately SHOWN in Browse for any species whose overhead asset hasn't arrived**
  (`visible={!overheadMode || !(overheadAssets && species && overheadAssets.has(species))}`, the "never blank" promise).
- **The overhead assets load lazily, off the startup path** (`src/components/OverheadTrees.jsx#useOverheadWarm`, "Load gate: keep
  overhead OFF the startup critical path").

⇒ **A cold load straight into Browse may draw full MESH trees until the discs arrive.** If so, 25M tris is an *arrival-time* cost, or a
reading taken mid-arrival, not the steady state. ⭐ **Measure Browse twice: during arrival, and after the overhead assets are
resident**, and say which state each number came from.

## Instruments that already exist (use them; don't build parallel ones)

- **The tree debug switches:** `?treeDebug=noHeroImpostor,noOverhead,noMesh,noTrees` (`OverheadTrees.jsx#treeDbg`, read by
  `InstancedTrees`/`HeroImpostorTrees`). Isolate one representation at a time.
- **Preview's gauges** (Plumb's E): the strip's cold-start recording, GPU-vs-main-thread frame time, residency per piece, draws/tris
  in the GPU panel. And Plumb's headless method for selecting a tier: set it with `Page.addScriptToEvaluateOnNewDocument` **and call
  `Page.enable`**, or the tier silently doesn't switch (Plumb hit exactly this). ⭐ Before trusting a phone reading, confirm the tier
  live (`preview.mode.v1`, shadows/logDepth off, 6 render() calls instead of 22).
- **`window.__renderer.info`** with `autoReset` off for one frame; and the scene-graph walk (shown meshes only: walk parents for
  `visible`).

## ⛔ Instrument rules

- `renderer.info` sums every pass inside one `render()`: report "town pass" and "all passes" separately (Plumb did; follow his shape).
- Triangles are not time. Separate **geometry** cost from **fill/overdraw** (several alpha-tested card layers per tree can cost in
  pixels as much as in triangles): e.g. shrink the viewport / pixel ratio and see whether the trees' ms scales with pixels.
- Every number names its town, shot, surface, arrival state, and whether it's this desktop's GPU (always, for ms).
- A reading must be able to fail: show one switch moving one number before trusting a null result.

## Deliverable (in chat to Jacob; a table, then the verdict)

Per town × shot × surface × {arrival, resident}: which tree components draw, their draws, tris, toggle-delta ms, and pixel-scaling.
Then **one verdict per shot**, among:
1. **Wrong representation drawing** (e.g. mesh or hero cards in Browse): a bug; the remedy keeps every tree.
2. **Heavy cards** (the hero stack: front shell 8×8 grid, layer count, azimuth stacks): the remedy is lighter cards (Jacob's shared wind
   sheet flattens the front shell; `arborist/BACKLOG.md`).
3. **Overdraw** (pixels, not triangles): the remedy is fewer layers or cheaper fragments.
4. **Arrival-time cost** (it's only heavy until the discs load): the remedy is load order, which is Phase 2's residency/timeline
   work.

Or **"cause not established"**, with what would establish it. ⛔ No fix, and no fix proposal beyond one line per verdict.
**Read this and the code it cites, tell Jacob what you found, then measure. If the code contradicts the brief, stop and flag him.**
