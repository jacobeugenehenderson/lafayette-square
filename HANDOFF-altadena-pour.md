# HANDOFF — Altadena pour: identity, landscape, and the load

**To:** the next Boz / fresh eyes. **From:** the 2026-07-14 session. **Trunk:** `curb-offset-draw` (solo; push/merge freely; PROD = `origin/main`).
**Route first** (CLAUDE.md): `ORIENTATION.md` → `README §⭐ START HERE` → this + `DESIGNER-LOAD-FORENSIC.md` + [[project_altadena_pour_identity_and_ground_perf]].
Sibling context: [[project_altadena_mountain_landscape_hero]] · [[project_extent_pen_boundary]].

Jacob was pouring **Altadena** — a new hood, the whole **Census-Designated Place** (~15,397 buildings ≈ 2× the real walkable neighborhood, 694 tiles). Everything below is what actually landed, what got reverted, and what's still open. **This doc has been rewritten to match reality; earlier revisions described a cull that no longer exists.**

---

## The incident

Symptoms, in the order they surfaced: buildings vanished after a bake → gray screen → the tab read **"Cartograph — Lafayette Square" while standing in Altadena** → the browser froze on a 432 MB ground → the Designer took **~3 minutes** to draw. Four *independent* bugs, not one. Three root causes are fixed outright; the load's root — a **~cubic** `frontageBands` — is **gated out of the Design view, not fixed**, so it still bites on Survey/Measure entry (see the tool-entry cliff).

---

## LANDED (all committed)

| commit | fix |
|---|---|
| `69825d1a` | **Extent's first bake creates a Look.** The committed-hood `onBuild` branch baked only IF a Look existed and never created one → `activeLook` stayed on the default (`lafayette-square`) → **the new hood's slab clobbered LS**. Mirrors the first-pour branch now. |
| `a20619cc` | **Landscape is an explicit Stage intake.** Was auto-detected via `existsSync(data/<scene>/terrain/sangabriel.obj)` — a stray file silently baked the San Gabriel mountains into the slab. Now gated on `design.landscape.source`. Altadena's terrain assets moved OUT of the pour dir → `cartograph/_landscape-intake/altadena/` (untracked). |
| `79bc1584` | **The Looks pulldown can't show or keep a foreign Look.** `looks` is global; the label resolved `activeLookId` against ALL of it with no scene check. Not cosmetic — **the bake follows `activeLookId`**, so the mislabel is the mechanism that let one hood's slab land on another's. Label now falls back to the current scene's Look and the active Look self-corrects. |
| `304edcac` | **Terrain-gate on the flat-fill refine → 432 MB → 43 MB.** The soft land-use fills were refined to a fine 15 m mesh **even with no terrain to follow** (a terrain param, `REFINE_MAX_EDGE_M`, applied unconditionally). Gate the fine refine on a terrain sampler; no terrain → coarse 64 m cap. *(This commit also introduced the cull — since reverted, see below.)* |
| `37c537b0` | **`DESIGNER-LOAD-FORENSIC.md`** (Tally) — the measurement that found the real problem. |
| `7f16d2a1` | **Gate the figure-ground V2 build → ~320 s → ~16 s** *(Design view only — entering Survey/Measure still pays the full build; see the tool-entry cliff)*. This is the big one. |
| `bbbd93a7` | **Revert the inhabited cull entirely.** |

**Three independent guards now stand against a repeat of the identity crossing:** Extent creates a Look · landscape can't auto-sweep · the pulldown can't hold a foreign Look.

---

## The load: what it actually was (`DESIGNER-LOAD-FORENSIC.md`, Tally)

| stage | ms | % |
|---|---|---|
| **`buildBlockGeometryV2`** | **304,040** | **94.8%** |
| `sectionOpen` (694 tiles) | 12,877 | 4.0% |
| `ringsToFlatGeo` tail | 3,079 | 0.96% |
| all parses + reads | 569 | 0.18% |

**`buildBlockGeometryV2` was 95% of the load and drew nothing.** In the neutral Design view its output goes nowhere: the V2 meshes never mount (`isTileScene` is hardcoded `true`, so the whole V2 render path below that branch's return at `:1460` is unreachable — the `curbGeo` mesh at `:1499` is dead code); `_v2Blocks` is written every build and read **nowhere** in `src/`; `_v2FrontageEdges` is read only by SurveyorOverlay / MeasureOverlay / MeasurePanel, which mount only under `tool==='surveyor'|'measure'`. The `:405` gate stopped the debounced *refresh* but never the mount-time `useMemo`.

Inside V2, two phases are 97%. Measured with the profiler already in the file (`V2_PROFILE`, `buildBlockGeometryV2.js:2539` — flip it on to reproduce; it stays `false` on trunk), against LS as the control:

| V2 phase | LS | Altadena | scaling |
|---|---:|---:|---|
| **`frontageBands`** | 2,786 | **214,759** | **77×** |
| **`blockFill`** | 2,540 | **61,989** | 24× |
| `ribbonUnion` | 275 | 6,773 | 25× |
| all 13 others | ~675 | ~1,688 | ~2.5× |
| **V2 total** | **6,276** | **285,209** | **45×** |

**Altadena has 4.2× LS's streets and pays 45× the cost.** `frontageBands` alone scales 77× on 4.2× the input — roughly **cubic in street count**. **That's why Altadena is qualitatively different from LS, not merely bigger**, and it is the one number that decides whether a CDP-sized hood is authorable at all.

Fix: gate the build on `surveyActive || measureActive` (both in the deps, `:454`). **Gate audited and correct** — those are exactly the two surfaces that consume V2's output; `measureActive` is wired from `CartographApp:1082`; `SurveyorOverlay` mounts unconditionally but puts every read behind `active = tool === 'surveyor'`, so nothing is stranded in Design. No need to re-audit it.

### ⚠️ The tool-entry cliff — the load is fixed, the TOOLS are not

**"Designer ~16 s" is the *Design view* only.** The gate returns `empty` until a tool is picked up; it **defers** the cubic build, it does not remove it. Two consequences, both unaddressed:

- **Entering Survey or Measure on Altadena pays the full ~285–304 s**, synchronously, in one atomic block.
- **Worse: `debouncedInputs` is still in the `:454` deps.** Once you're *in* Survey, every settled edit rebuilds the whole map. The `:401` comment calling this "a ~2.5 s whole-map rebuild" is **LS**; on Altadena it is **~285 s per edit**. That comment is now dangerously reassuring — read it as a scale-dependent number, not a constant.

So Survey/Measure authoring at CDP scale is **effectively unusable**, and `frontageBands` is the whole reason. **Fixing it is the same root as the V2 gate, one layer down** — and it outranks the buildings item, because until it lands Altadena can be *looked at* but not *authored*. If it must be chunked rather than fixed, `frontageBands` walks each `blockRounded` ring end-to-end (`buildBlockGeometryV2.js:1439`) — the per-ring loop is the natural yield boundary; `blockFill` is a per-block Clipper diff, same shape.

---

## REVERTED — the inhabited cull (`bbbd93a7`). Read this before rebuilding it.

I built a cull to drop ground in the empty periphery. **It's gone. Don't resurrect it without reading why.**

Jacob's spec was clear and I drifted from it three times, each toward whatever was easier to clip with:
1. **tile-filter** → killed the land-use base fills too; left a **void** where every hood's disc belongs.
2. **offset polygon** (`offsetRings(union(keptTiles), 80m)`) → kept the fills, but an offset curve cuts wherever it falls: **sidewalks terminated mid-street**.
3. **block-aligned** (union of kept tiles, no offset) → correct edges, *and cheaper than the wrong one* (1,552 vs 3,012 clip verts) — but by then it wasn't worth what it cost.

**Jacob: "What you're doing with the sidewalks is useless, please just revert."** He was right, and the reason matters: **the load was never about the periphery's triangle count.** It was 95% of the CPU going to an emitter that drew nothing. Once the V2 gate landed, the cull's entire justification was gone — I kept building a solution to a solved problem.

His design, if anyone ever needs it, was never the problem: *"find the streets with buildings, offset that shape outward one block, and blend"* — whole blocks, park-safe, knob-not-hardwired, shape-not-radial, opt-in per hood (LS is small and tight and doesn't want it). The failure was mine, not the design's.

---

## LS (PROD) — audited, restored, CLEAN. Read before touching LS.

LS is **fully clean**, tracked and untracked: `center [-15,-15]`, no exclusions, 1082 buildings, `scene.json` with no landscape block, slab matching its authored design. My commits touched **zero** LS paths, and re-baking LS's ground produced a **byte-identical `ground.bin`** — the terrain gate is a proven no-op for LS (it *has* terrain; the V2 gate only skips work nothing reads).

> ### ⚠️ The hazard worth carrying forward
> **Applying/committing an extent on an already-authored hood RE-CENTERS it.** An LS Extent apply moved `center [-15,-15] → [0,0]`, added 2 exclusions, re-poured (1082→1081), reprojected `src/data/ribbons.json`, and re-baked the whole slab in the shifted frame. **The Look design survived — which is the trap:** `blockCustoms` / `blockLandUse` / corner overrides hash off **bbox-derived block keys**, plus shot bounds (`cx:95, cz:-158`) and hero keyframes. Shift the frame and authored work isn't deleted — it's **silently orphaned**. All of it was uncommitted; `git restore` recovered it exactly.

**Doctrine:** the exclusion-band / pen tooling is **Altadena-shaped**. LS predates it and doesn't want it.

---

## Doctrine settled (don't re-derive)

- **Cartograph pours the 2D record → a FLAT neighborhood. The 3D landscape MODEL is a STAGE intake**, uploaded deliberately per-Look — never auto-detected from files in `data/<scene>/`.
- **A flat square is two triangles.** Fine ground subdivision exists *only* to let the runtime bend the mesh over terrain. No terrain → no fine mesh.
- **The bake follows `activeLookId`.** A mislabelled Look isn't cosmetic; it's how one hood's slab lands on another.

---

## OPEN (prioritized)

1. **`frontageBands` is ~cubic — Survey/Measure are unusable on Altadena.** The V2 gate fixed the *load*; the cliff above is what's left. Entering either tool pays ~285–304 s, and **every settled edit pays it again** (`debouncedInputs` in the `:454` deps). **This outranks everything else here: until it lands, Altadena can be looked at but not authored** — and authoring is the point of the Designer. Target `frontageBands` (214,759 ms, 75% of V2) first, `blockFill` (61,989 ms) second. Fix the scaling if you can; chunk the per-ring loop (`:1439`) if you can't.
2. **The Designer re-derives the slab every load — Jacob's point, and the best one after the cliff.** The bake already emits `buildings.bin` (34 MB, *already triangulated*), and `SlabBuildings` already consumes it on the 3D path (`CartographApp.jsx:800`). Meanwhile `SceneMapLayers` fetches `map.json` and **ear-clips 15,397 footprints / 103,129 ring verts in-browser on every load**. Its own header says it's for a *"not-yet-baked neighborhood"* — Altadena is baked, so it's on the wrong path by its own charter. **Same bug class as the V2 gate: paying for work whose answer is already on disk.** Jacob: *"If nothing has changed in the bake, there's no reason we should have to build this from the ground up every time."* ⚠️ **Not a one-line repoint:** `map.json` also carries the land-use layers (`block`, `sidewalk`, `parking_lot`) and the roster curation that `buildings.bin` does not — scope it before assuming a swap.
3. **Strip the `[LOAD-FORENSIC 2026-07-14]` instrumentation** (`BlockGeometryV2Debug.jsx`) once the load is settled — it's throwaway.
4. **`undefined/p3-ls.json`** at repo root — 792,922 bytes, written 16:49, three minutes before `1ea076dd retire default.json`. Fallout from the **trees/census arc**, a path built from an undefined variable. Not from this arc; Jacob's to judge.
5. **Canon folds owed** (from the pen-boundary arc): fold the pour/Look + landscape-intake doctrine into `NEIGHBORHOOD-INPUTS §11` / `INTAKE.md` / `README`.

## Cross-reference — the trees/census arc ran in PARALLEL today

Jacob landed four commits on the **same bug class from the other side** while this arc ran: `9893dd85` *refactor(bake-trees): `look` always meant `scene`* · `91f98c59` *fix(grove): bake the NEIGHBORHOOD's census, not the Look's name* · `1ea076dd` *fix(trees)!: retire default.json — every neighborhood owns its own census* · `24a7184b` *docs(accord)*. **So look≠scene got fixed on five fronts today: Extent, landscape, pulldown, and trees/census.** Note `public/baked/default.json` is **retired** — any memory or doc still calling `bake-trees.js --look default → baked/default.json` the canonical LS tree bake is **stale**.

---

## Gotchas — don't relearn these the hard way

- **NEVER partial-bake against PROD.** Standalone `bake-ground.js` **drops `poolmap`/`colormap` from `ground.json`** (it skips those steps). I did this to LS while "verifying" and had to restore.
- **Node ≠ browser.** Tally's numbers are Node; the sectionOpen baseline reproduces to 0.07%, so attribution is solid, but ~45 s of the gray is browser-only (fetch / Vite module graph / React commit) and remains **unmeasured**.
- **Suspected, unverified:** `[SML] map fetch+parse` may print **twice** (StrictMode + an `if (import.meta.hot)` block at `useCartographStore.js:2622` that fires on every dev load; the dedupe guards are read-before-await, so concurrent 13.9 MB ribbons fetches can all pass). One hard refresh settles it.
- **The buildings' chunked rAF build is FINE** — it was starved, not slow. Don't "fix" it.
- **Nothing here is eye-verified in the live app.** Byte counts, triangle counts and code paths are proven; the operator's eye gates the visual.

## Process note (for whoever picks this up)

I was wrong, confidently, three times today: blamed terrain for the triangles **twice** (a re-bake with terrain removed was byte-identical and I still argued it), then drifted from Jacob's cull spec three times. I also sent the forensic hunting for "uninstrumented work" when the answer — `buildBlockGeometryV2` — was already printing in instrumentation I had just written. **The pattern: a confident theory pointing away from the measurement in front of me.** Trust Jacob's framing; he called the cubic-V2 smell, the "why rebuild every time," and the "useless, revert" long before I did.
