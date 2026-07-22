# HANDOFF — FORENSIC: where do the 3 minutes go? (Designer load, Altadena)

**Agent: FRESH** (not Boz — you don't need the coordinator identity; do the forensic and the gate, nothing more).
**Route first** (CLAUDE.md): `ORIENTATION.md` → `README §⭐ START HERE` → `HANDOFF-altadena-pour.md` (the arc this came out of).
**Worktree.** Isolate; docs → trunk. **Surface scope drift** — if the answer turns out to be somewhere I didn't point you, say so rather than forcing it into my framing.

---

## The job, in one line

**Find where ~3 minutes goes when the Designer loads Altadena, and report a per-stage budget. Do NOT fix it.** This is a measurement, not a repair. The repair is designed already (below) and is gated on your numbers.

## The symptom (Jacob, measured by eye, 2026-07-14)

> "We see a gray screen for probably **60 seconds plus**; then the **ribbons pop on**, and maybe **120 seconds later** the buildings all **sizzle on in about half a second**."

Total ≈ 3 min. Every stage is synchronous and silent — the browser eventually shows "Page Unresponsive / still waiting?". The scene: **Altadena**, a CDP-sized pour (15,397 buildings, 694 frozen tiles, `shape.json` ≈ 8 MB, `map.json` large).

## What is ALREADY KNOWN — do not re-derive (this cost a day already)

- **`sectionOpen` = 12,868 ms** for Altadena's 694 tiles, measured standalone in Node. **It cannot explain 60s or 120s.** There are other blocking stages I never identified.
- **The buildings' chunked build WORKS.** `SceneMapLayers` builds footprints in chunks across `requestAnimationFrame` precisely so "the main thread breathes… the footprints visibly stream in." They "sizzle on in 0.5s" because they were **starved** behind minutes of synchronous work, then ripped through once the thread freed. **Right machinery, no oxygen — don't 'fix' the building build.**
- **The Designer runs TWO emitters, both synchronous Clipper:**
  - `buildBlockGeometryV2` — `BlockGeometryV2Debug.jsx:426`, runs **unconditionally** (deps: `liveRibbons, stencil, debouncedInputs, useRingBandEmitter`).
  - `sectionOpen` — the **frozen** path, `:~721`. `sectionFrozen = !surveyActive && !!frozenShape` (`:681`): the **Design view reads the frozen `shape.json`**, only Survey live-strokes.
- **Instrumentation is already in place** (mine, throwaway, tagged `[LOAD-FORENSIC 2026-07-14]`): `console.time` at `shape.json fetch+parse`, `buildBlockGeometryV2`, `sectionOpen (N tiles)`. Plus a pre-existing `[SML] map fetch+parse` in `SceneMapLayers.jsx:78`.
- **A measured caution:** the inhabited-cull `detailClip` costs ~nothing (12,779 ms *with* vs 12,868 ms *without*). Don't chase it.

## What to actually do

1. **Reload the Designer on Altadena** (hard refresh) and capture every `[LOAD]` / `[SML]` timing from the console.
2. **Attribute the 60s and the 120s.** The instrumented stages almost certainly do NOT sum to 180s — **the gap is the point.** Find the uninstrumented blocking work (candidates, unverified: `ribbons.json` / `map.json` fetch+parse, the store's `_loadCenterlines`, skeleton load, React commit / geometry upload, `ringsToFlatGeo` merges, the aerial tiles). Add timers as needed.
3. **Produce a per-stage budget** — a table: stage → ms → % of the 3 min → is it main-thread-blocking (yes/no).
4. **Name the chunk boundaries.** For each expensive stage, say whether it can yield (is it a loop over N items? `sectionOpen` is a per-tile loop over 694 — that's a natural boundary) or whether it's one atomic Clipper call that can't.
5. **Check the obvious cheap wins** while you're there: is anything running **twice**? Does `buildBlockGeometryV2` run even when `sectionFrozen` (i.e. is the Design view paying for an emitter it doesn't draw)? That one is a real suspicion, unconfirmed.

## The repair this feeds (Jacob's design — already settled, do NOT redesign)

1. **Silhouette on frame one** — draw the disc immediately (the stencil is 256 pts, nearly free) so something real is on screen.
2. **Chunk the expensive stages across frames** — the `SceneMapLayers` pattern, applied to the ground build.
3. **A real meter** off `done/total` — not a fake spinner. "We need to know it's still happening — but so does the browser."
4. Buildings then resume streaming **for free** once the thread breathes.

Your budget decides *what* gets chunked. Don't build the repair; hand back the numbers.

## Constraints

- ⛔ **Do not touch Lafayette Square.** LS is PROD, was contaminated and clobbered earlier today, and is now restored + verified byte-clean. Altadena only. **Never partial-bake against LS** (standalone `bake-ground.js` drops `poolmap`/`colormap` from `ground.json` — I did that and had to restore).
- Don't fix, don't refactor, don't "improve" the building build.
- The instrumentation is **throwaway** — leave it in for now; it gets stripped when the repair lands.
- Deliverable: **`DESIGNER-LOAD-FORENSIC.md`** at repo root — the budget table, the chunk boundaries, the cheap wins, and anything that contradicts the framing above.
