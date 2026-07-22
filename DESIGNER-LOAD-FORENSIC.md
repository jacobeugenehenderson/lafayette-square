# DESIGNER-LOAD-FORENSIC — where the 3 minutes go (Altadena)

**From:** Tally (dispatched, 2026-07-14). **Brief:** `cartograph/_archive/HANDOFF-designer-load-forensic-DONE-2026-07-14.md` (archived — forensic delivered). **Branch:** `designer-load-forensic` (worktree).
**Status:** measurement only — nothing fixed, per the brief. Harness: `scratch/tally-designer-load.mjs`.

---

> ## ⚠️ SUPERSEDED IN PART — read this first (2026-07-15)
>
> This doc's **attribution was right** (`buildBlockGeometryV2` was 94.8% of the CPU and drew nothing → gated `7f16d2a1`, deleted at T4 `4044bca1`, 285 s → 0.45 s). Its **model of the load was incomplete**, and the browser proved it. What it missed, and why:
>
> - **The `buildTileGround` race (~80 s) — the biggest single term, entirely absent here.** `frozenShape` had no *pending* state, so between mount and the shape fetch resolving, the live build fired — 27.5 s, ×3, all discarded. **A Node harness cannot see this**: it exists only in the window between two async arrivals, and a harness that calls functions in order has no such window. This doc's "unattributed ~45 s of gray" was mostly this. Fixed `72bbc989`.
> - **`sectionGeos` built 4× (~70 s)** — each async input arrival invalidated the memo, and only the *last* build was correct. Fixed `59e5f109`.
> - **The ring counts here are PRE-REVERT.** The inhabited cull was reverted (`bbbd93a7`) and its `detailClip` no longer trims: sidewalk 1,619 → 3,014, curb 926 → 1,696. So `sectionOpen` 12,877 → ~13,011 ms and the compose tail 3,079 → 5,538 ms (Node).
> - **In-browser is ~1.5× faster than Node** — `sectionOpen` measured 7.5 s in Chrome vs 13.0 s here.
> - **`console.time` is wall-clock and measures STARVATION, not work.** `[SML] map fetch+parse: 102s` was ~1 s of network behind 100 s of blocked main thread. Several conclusions in this doc's "candidates" section leaned on timers read the other way.
>
> **The load ended at ~18 s (browser).** The live state, the remaining budget, and what's still open live in **`HANDOFF-altadena-pour.md`** — go there. This doc stands as the *method* (and as the record of an attribution that held up), not as current state.

---

## The answer in one line

**`buildBlockGeometryV2` is ~95% of the Designer's load-time CPU — and it draws nothing.** Your suspicion #5 ("does `buildBlockGeometryV2` run even when `sectionFrozen`?", filed as *a real suspicion, unconfirmed*) is **confirmed, and it is the whole forensic.** It is not a cheap win at the margin; it is the 120 seconds.

`sectionOpen` (12.9 s) is real but is 4% of the budget. Everything else I could measure — every JSON parse, the stencil, the static-import bloat — is under 1% combined.

---

## How to read these numbers (the honest framing)

All timings below are **Node**, from `scratch/tally-designer-load.mjs`, which replays the component's exact call sequence with its exact inputs (verified: `useRingBandEmitter = true` is the real default at `BlockGeometryV2Debug.jsx:252`; `streetSmooth` is retired → `smooth = 0`).

**The harness is calibrated against your own baseline.** You measured `sectionOpen = 12,868 ms` standalone in Node. My harness, independently, gets **12,877 ms** — a 0.07% match. So the V2 number sits on exactly the same footing as the number you already trust.

**What this does NOT give you:** the Node→browser factor. Both your 12,868 and my 304,040 are Node figures; the browser is likely faster (warm JIT). So treat the **attribution** (which stage dominates, and by how much) as solid, and the **absolute wall-clock** as a proxy. The attribution is what your repair is gated on, and it does not move: V2 is ~24× `sectionOpen` whatever the factor.

---

## The budget — Altadena (694 tiles, 908 streets, radius 4,161 m)

| Stage | ms | % of CPU | Blocks main thread? | Instrumented before? |
|---|---:|---:|---|---|
| **`buildBlockGeometryV2`** | **304,040** | **94.8%** | **yes** | yes (`:433`) |
| `sectionOpen` (694 tiles) | 12,877 | 4.0% | yes | yes (`:721`) |
| `ringsToFlatGeo` tail (7 calls) | 3,079 | 0.96% | yes | **no — new** |
| `JSON.parse map.json` (36.7 MB) | 393 | 0.12% | yes | partly (`[SML]`) |
| `JSON.parse shape.json` (8.1 MB) | 45 | 0.01% | yes | yes (`:667`) |
| `JSON.parse ribbons.json` (13.9 MB) | 41 | 0.01% | yes | no |
| file reads (58 MB total) | 90 | 0.03% | n/a (browser: fetch) | no |
| **TOTAL (CPU-bound)** | **320,565** | 100% | | |

### Inside `buildBlockGeometryV2` — two phases are 97% of it

Measured with the **profiler that already exists in the file** (`V2_PROFILE`, `buildBlockGeometryV2.js:2539` — flipped on in my worktree only; it is `false` on trunk and I left it that way there).

| V2 phase | LS | Altadena | scaling |
|---|---:|---:|---|
| **`frontageBands`** | 2,786 | **214,759** | **77×** |
| **`blockFill`** | 2,540 | **61,989** | **24×** |
| `ribbonUnion` | 275 | 6,773 | 25× |
| `curbBands` | 180 | 779 | 4× |
| all 12 others | ~460 | ~910 | ~2× |
| **V2 total** | **6,276** | **285,209** | **45×** |

**Altadena has 4.2× LS's streets and pays 45× the cost.** `frontageBands` alone scales 77× on 4.2× the input — that is roughly **cubic**. This is the single fact that makes Altadena qualitatively different from LS rather than just bigger.

### The LS control (why I trust the above)

| | LS | Altadena | ratio |
|---|---:|---:|---|
| streets / tiles | 217 / 101 | 908 / 694 | 4.2× / 6.9× |
| `sectionOpen` | 638 ms | 12,877 ms | 20× |
| `buildBlockGeometryV2` | 6,276 ms | 304,040 ms | 45× |
| `ringsToFlatGeo` tail | 122 ms | 3,079 ms | 25× |

---

## Reconciling with what you saw

Your eye: *60 s gray → ribbons pop → ~120 s → buildings sizzle in 0.5 s.*

The load path explains that sequence exactly, because **`shape.json` and `ribbons.json` arrive on different clocks**:

- `shape.json` (8.1 MB) is served by **Vite static** (`BlockGeometryV2Debug.jsx:668` fetches `${BASE_URL}baked/…`). It does not queue behind the API server.
- `ribbons.json` (13.9 MB) is served by **`cartograph/serve.js`**, behind `map.json` (36.7 MB) on a single-threaded blocking-`readFileSync` server.

So:

1. **Gray (~60 s)** — waiting on the API server + Vite dev module graph. `shape.json` lands early → `sectionGeos` runs `sectionOpen` (12.9 s) → commit.
2. **Ribbons pop.** This is `sectionGeos`, not V2 — V2's meshes never mount (`isTileScene = true`, `:257`).
3. **~120 s.** `sceneRibbons` finally lands → `liveRibbons` becomes a new object → the `useMemo` at `:426` fires **`buildBlockGeometryV2`**, which blocks the thread for minutes **and renders nothing**.
4. **Buildings sizzle in 0.5 s.** The rAF chunker in `SceneMapLayers` was starved the whole time; V2 returns, the thread breathes, 15,397 buildings rip through in ~18 frames. Exactly as you said: right machinery, no oxygen.

**Caveat I want to be explicit about:** step 1's ~60 s is the one number I could *not* fully attribute. Node accounts for only ~13.5 s of it (`sectionOpen` + parses). The residual ~45 s is browser-only (fetch, Vite dev module graph, React commit, GPU upload) and my harness cannot see it. **I did not confirm this in the browser** — see "What's still owed" below. Steps 2–4 are measured.

---

## Chunk boundaries — for each expensive stage, can it yield?

| Stage | Shape | Can it yield? |
|---|---|---|
| **`buildBlockGeometryV2`** | 16 sequential phases over 908 chains | **Wrong question — don't chunk it. GATE it.** See below. |
| ↳ `frontageBands` (215 s) | Walks each `blockRounded` ring end-to-end (`:1439`) | Yes — per-ring loop is a natural boundary. But only worth doing if it must run at all. |
| ↳ `blockFill` (62 s) | Clipper diff per block | Yes — per-block loop. |
| **`sectionOpen`** | Per-tile loop over 694 tiles (`tileGround.js:1466`) | **Yes — the natural boundary you already named.** Already has a per-tile cache (`sectionCacheRef`) it can drive `done/total` off. |
| **`ringsToFlatGeo`** (3.1 s) | Per-outer triangulation loop | Partly. The `holes × outers` pairing (`ringsToFlatGeo.js:109-118`) is one nested pass — `pointInRing` per (hole, outer). Asphalt alone = 1.8 s. Yields between outers, not inside the pairing. |
| **JSON parses** | Atomic `JSON.parse` | **No.** But they total 0.5 s — not worth a worker. |

**On V2 specifically: the repair is a gate, not a chunk.** Its meshes never mount (`isTileScene = true`). Its outputs go to exactly two places:

- `_setV2Blocks(blockRounded)` (`:463`) — **write-only. Nothing reads `_v2Blocks`, anywhere in `src/`.** The comment at `:461` claiming MeasureOverlay uses it for drag adjacency is **stale**.
- `_setV2FrontageEdges(...)` (`:488`) — read only by `SurveyorOverlay` / `MeasureOverlay` / `MeasurePanel`, i.e. the **Survey and Measure authoring surfaces**. `MeasureOverlay` mounts only on `tool === 'measure'` (`CartographApp.jsx:1152`).

**In the neutral Design view, nothing consumes V2's output at all.** The `:405` fix (`if (!surveyActive) return`) gated the *debounced refresh* — it never gated the *mount-time build*, so the initial `useMemo` at `:426` runs on every load regardless of view. `debouncedInputs` is seeded with real values at `:391`, so there is no "empty first pass" saving you.

---

## Cheap wins found (measured or code-verified; none applied)

1. **Gate `buildBlockGeometryV2` on the views that consume it** (Survey/Measure). ~95% of load CPU, currently paid by a view that draws none of it. *This is the repair.*
2. **`_v2Blocks` is dead** — written every build, read nowhere. Delete-on-touch.
3. **Two-to-three concurrent `_loadCenterlines`** → 2–3× the 13.9 MB ribbons + 3.4 MB skeleton. Sources: React **StrictMode** (`main.jsx:9`) double-invokes the `deps: []` effect (`CartographApp.jsx:637-641`), **plus** a module-eval call at `useCartographStore.js:2622-2628` guarded by `if (import.meta.hot)` — which is truthy on **every dev page load**, not just on HMR. The dedupe guards (`:1987`, `:1992`) are **read-before-await with no in-flight promise memo**, so concurrent callers all pass. Dev-only — but that is where you live.
4. **Load waves are ordered backwards** (`useCartographStore.js:1978-1998`). `sceneBoundary` (61 KB) gates the stencil (`CartographApp.jsx:777`) and every building clip — and it sits in wave 3, behind 13.9 MB of ribbons it has no dependency on. All five fetches could be one `Promise.all`.
5. **`SceneMapLayers` map fetch has no `AbortController`** (`:71-81`) — the cleanup flips a `cancelled` flag, so under StrictMode **both 36.7 MB responses land and both parse**; only the second `setMap` wins.
6. **`luGroups` re-triangulates on every render** — `hiddenLayers` is a fresh `{}` literal per render (`CartographApp.jsx:951`), so the `hide` dep (`SceneMapLayers.jsx:106`) never stabilizes. Churn, not minutes.
7. **The `sceneMap` prefetch fast-path is dead on cold load** (`SceneMapLayers.jsx:75`) — `sceneMap` is only ever set by `ExtentApp.jsx:1211/1262` (the pour flow), so the 36.7 MB fetch always happens.
8. **Server is blocking + uncompressed** (`serve.js:927-940`): `readFileSync` per request, no cache, no gzip, no streaming. A 36.7 MB sync read **stalls Node's event loop**, so the client's "parallel" `Promise.all` serializes behind it. This JSON gzips ~10:1.

---

## What contradicts the brief's framing

- ✅ **"the stencil is 256 pts, nearly free"** — **verified true.** Altadena's `neighborhood_boundary.json` is 60 KB, but that is the `exclusions` array; `boundary` is exactly 256 pts, same as LS. Not a suspect.
- ✅ **"the buildings' chunked build WORKS"** — confirmed. 15,397 features in 900-feature rAF chunks (`SceneMapLayers.jsx:116-150`), ~18 frames. Starved, not broken. I did not touch it.
- ✅ **"`sectionOpen` cannot explain 60s or 120s"** — correct. It is 4%.
- ✅ **"`detailClip` costs ~nothing"** — consistent with my run (Altadena carries 1 `detailClip` ring; `sectionOpen` matched your no-clip baseline to 0.07%). Didn't chase it.
- ⚠️ **"the gap is the point — find the uninstrumented blocking work."** Partly wrong, and worth saying plainly: **the answer was already inside your instrumented set.** `[LOAD] buildBlockGeometryV2` was printing the whole story; it reads as ~95% of the budget. The uninstrumented stages I added (`ringsToFlatGeo`, the parses) total **under 1%**. You filed the real cause as unconfirmed suspicion #5 and went looking for a fourth thing.
- ❌ **A theory I killed by measuring, so nobody re-derives it:** `src/cartograph/MapLayers.jsx:5` statically imports LS's **16.5 MB** `map.json`, and `CartographApp.jsx:7` imports `MapLayers` unconditionally — so for Altadena all 16.5 MB is fetched, parsed, and pinned for a component that never renders (`:1119` gates it to `scene === 'lafayette-square'`). ~20.6 MB of LS/toy JSON parses at module-eval on every Altadena load. Vite also has no `json.stringify` option set, so these emit as JS object literals rather than `JSON.parse`. **This looks damning and is worth ~170 ms.** I measured both branches on the real 16.5 MB file: JS-literal **173 ms** vs `JSON.parse` **148 ms**. It is a memory/bundle-hygiene issue, **not** a load-time one. Don't spend the day here.

---

## What's still owed (I could not do this part)

**The browser console capture the brief asked for — I have no browser automation in this repo** (no Playwright/Puppeteer), and the running Vite server serves the **main tree**, not my worktree, so my `V2_PROFILE` flip isn't visible to it. I did not spawn a second server (`feedback_do_not_spawn_new_dev_servers`) or install a browser stack without your say-so.

**What settles the residual ~45 s of gray, in one hard refresh:** the instrumentation you already left in prints it. Load the Designer on Altadena and read:

```
[LOAD] shape.json fetch+parse (altadena)     ← if this is ~45s, it's the server/wire, not CPU
[SML]  map fetch+parse                       ← the 36.7 MB; watch for it appearing TWICE (StrictMode)
[LOAD] sectionOpen (694 tiles)               ← expect ≪ 12.9s in-browser
[LOAD] buildBlockGeometryV2                  ← expect this to dominate; this is the 120s
```

Two things to look for specifically: (1) whether `[SML] map fetch+parse` prints **twice** — that confirms win #3/#5; (2) the ratio of `[LOAD] buildBlockGeometryV2` to `[LOAD] sectionOpen`. My Node run says 24×. If the browser agrees, the attribution holds and the repair is gated on nothing else.

**Nothing here is eye-verified in the live app** (`feedback_proxy_render_is_not_the_operator_eye`). Node timings and code paths are proven; the browser wall-clock is not.

---

## Housekeeping

- `V2_PROFILE` is `true` **only in this worktree** (`buildBlockGeometryV2.js:2539`). It stays `false` on trunk — do not merge the flip.
- `scratch/tally-designer-load.mjs` is throwaway, tagged `[LOAD-FORENSIC 2026-07-14]`. It reads Altadena's data by absolute path from the main tree (that data is **untracked**, so it does not exist in any worktree). Read-only — it never writes to `public/` or `cartograph/data/`.
- **LS was never baked or written.** I read `cartograph/data/lafayette-square/clean/*` and `public/baked/lafayette-square/shape.json` as a *control* only. No `bake-ground.js`, no partial bake, no writes to any LS path.
