# HANDOFF — the Grove's axis is wrong: it needs a NEIGHBORHOOD dropdown, not a Look dropdown

**From:** Boz, 2026-07-15 session (diagnosis with Jacob). **Trunk:** `curb-offset-draw` (solo; push/merge freely; PROD = `origin/main`).
**Agent: FRESH** — this is a standalone diagnosis-complete arc with no dependency on a prior agent's in-flight work; the whole model is written below. A warm window would carry irrelevant Altadena/ground context.

**Route first (the `CLAUDE.md` gate), in this order:**
1. `ORIENTATION.md` (root) — the universal first read.
2. `README.md §⭐ START HERE` — settled state by topic.
3. **`arborist/ORIENTATION.md §The operating model`** — Intake SEEDS → Salon ADDS → Grove CULLS → Bake SHIPS. The Grove is the surface this brief changes.
4. **`cartograph/BAKE.md` rows 7–8** (the trees + ground-ao bake steps and their outputs) and **`cartograph/ARCHITECTURE.md:143` + `:208`** (what `InstancedTrees` consumes; "trees are global but ground is per-look").
5. **`cartograph/SLAB-CONTRACT.md §8`** — placements. **This brief proposes CHANGING this contract. Read it before you touch anything.**
6. **`arborist/NOTES.md:14`** — the existing warning that `--look lafayette-square` writes a phantom.

⛔ **Do not skip step 5.** This arc changes a declared contract, not just a file path.

---

## The one-paragraph summary

The Grove's Look dropdown works. The bake it feeds is keyed on the wrong axis. `bakeTrees`'s `look` parameter is asked to name **two different things at once** — the neighborhood whose tree census is being baked, and the Look whose aesthetics apply — and no single value can satisfy both. The fix is not a new path; it is a **rename that follows the data**: `look` always meant `scene`. Jacob's framing (2026-07-15): *"The Grove needs to render to something more like the 'mother map' outside of its Looks. We need a Neighborhood dropdown."*

---

## The diagnosis (all verified against code this session — re-verify before you build on it)

**The symptom Jacob reported:** in the Grove, switching the Look dropdown and hitting Bake→Slab does nothing visible. LS never changes.

**The chain, which is correct until the very last step:**

| Step | Location | Verdict |
|---|---|---|
| Grove sends `?look=<activeLookId>` | `src/arborist/stores/useArboristStore.js:299` | ✅ correct |
| Server honors it | `arborist/serve.js:1139` | ✅ correct |
| Calls `bakeTrees({ look: lookName, lod:'lod2', heroLook: lookName })` | `arborist/serve.js:1169` | ❌ **the bug** |
| Placements written to `public/baked/<look>.json` | `arborist/bake-trees.js:595-597` | — |
| Runtime reads `baked/<look>/trees.json`, falls back to `baked/default.json` | `src/components/InstancedTrees.jsx:600`, `:50` | — |

`public/baked/lafayette-square.json` is **neither** of the paths the runtime reads. It is a phantom. The Grove bake on LS writes to the void, and LS keeps rendering the older `baked/default.json`.

**The function's own defaults are already right** (`arborist/bake-trees.js:362-372`):

```js
export async function bakeTrees({
  look = 'default',                  // placements  → baked/default.json        ✅
  heroLook = 'lafayette-square',     // hero pan / tiering → baked/lafayette-square/  ✅
  output,                            // explicit override
})
```

Run `node arborist/bake-trees.js` bare and it does the right thing — which is exactly why `arborist/NOTES.md:14` calls `--look default` "the canonical LS tree bake." **`arborist/serve.js:1169` overrides both defaults with the same dropdown value.** On LS, `heroLook` lands the GLBs and atlas correctly while `look` sends the placements to the phantom. The bake is two-thirds effective — which is why the tree model files on disk *did* change and only the census didn't.

The Cartograph pour sidesteps this entirely by passing an explicit `output` (`cartograph/serve.js:1867`, comment: *"baked/<id>/trees.json (never LS's global default.json)"*). **New hoods work. LS is the only look that falls through to the phantom.**

---

## The model (Jacob's, 2026-07-15) — why the axis, not the path, is the bug

Sort the tree artifacts by what they actually depend on:

- **The neighborhood** — the census (placements), the roster (which species grow here), the atlas + the GLBs. Species do not change because the sky does.
- **The Look** — hero tiering (which trees earn lod0 vs lod2), because that is read off the camera pan, and pans are authored per Look.

`bakeTrees({ look, heroLook })` **already has both axes.** `look` is simply misnamed: it always meant `scene`. Rename it and the function reads true — `scene` drives the census and the assets, `heroLook` drives the tiering, and the defaults stop being a riddle.

**`baked/default.json` is not a global map.** `public/looks/index.json` opens with `"default": "lafayette-square"` — the file is named after the *default Look pointer*, which happens to be LS. It is **Lafayette Square's mother map under a fossil name.** The canon's claim that placements are "cross-Look" (`SLAB-CONTRACT §8`, echoed at `ARCHITECTURE.md:208`) is that fossil rationalized after the fact.

**Why nobody caught it:** every Look's `scene` field is currently identical to its `id` — `lafayette-square→lafayette-square`, `toy→toy`, `hipointe-demun→hipointe-demun`, `altadena→altadena`. Passing `lookName` where a scene is wanted has been *accidentally* correct everywhere except the one path that uses the misnamed `default`. **The 1:1 is history, not a constraint** — the day a second Look sits over one neighborhood (a winter Lafayette Square), two Looks fight over one census.

---

## The tiering seam — SETTLED BY DOCTRINE, not an open question

**The seam is real:** hero tiering (which tree gets lod0 vs lod2) is decided at bake and written *into* the census (see the `-lod0/-lod1/-lod2` entries in `baked/default.json`). It is read off the **camera tracks**, which are authored **per Look**. So if the census is per-neighborhood, one census cannot carry per-Look tiering. Today this is invisible because of the 1:1 above. It is the same conflation, one layer down.

**But the resolution is already settled — do not re-litigate it.** Read **`arborist/ARCHITECTURE.md §"Tree-render reality at LS"` (lines 66–69)** — the live home — plus `arborist/FEATURES.md:25` for the plain-language version, before you touch tiering. *(Deep-dive only: `arborist/_archive/HANDOFF-visibility-cull-lods-2026-06-23.md`. Do not build to the archive; it is Diary.)*

- ⛔ **Geometry is NEVER swapped by live camera distance.** Jacob, 2026-06-24: *"doing it by camera distance is asking for trouble"* — *"everything is already attached to depth gauges."* The runtime `GeoTierDriver` altitude-swap was **RETIRED** (`0fc1e126`). **Do not propose moving tiering to runtime. That option is a corpse.** (Boz drafted this brief with it listed as a live option; Jacob caught it. Don't repeat it.)
- ✅ **Geometry representation is a per-placement ROLE decided ONCE, at bake** (`bake-trees.js#classifyHeroTiers`). The depth gauges (DoF, fog) own how far a tree *looks*. **DoF is the cover, not the cut.**

**Therefore the shape follows without a decision:** the census (positions + species) is a **neighborhood** fact; the **role tag rides per-Look**, computed at bake from that Look's camera tracks over the neighborhood's census.

**One build detail to get right (not a decision — just don't miss it):** `classifyHeroTiers` mixes **two** inputs — the camera tracks (per-**Look**) *and* per-pose canopy occlusion (`circleCoverFrac`, `OCC_FRAC=0.7` — a per-**neighborhood** fact, distance-independent). Keep both; don't collapse occlusion onto the Look axis just because tracks live there.

⛔ **If you conclude the doctrine above is wrong for this substrate, STOP and flag Jacob.** Do not route around it.

---

## Phases (sequence matters — nothing moves twice)

**Phase 1 — the rename, no behavior change.** `look` → `scene` through `bakeTrees` and its callers. Keep `baked/default.json` as the output for LS for now (pass it explicitly). Fixes nothing yet; makes the next phases legible. Verify: a bare `node arborist/bake-trees.js` still produces a byte-identical `default.json` (modulo the `generatedAt` timestamp — see Gotchas).

**Phase 2 — fix the Grove bake.** `arborist/serve.js:1169` stops overriding both axes with one value. The Grove's dropdown becomes a **Neighborhood** picker sourced from the scenes behind the Looks; the roster endpoint (`/api/cartograph/looks/<id>/trees`) follows the same axis. **This is the phase that un-breaks Jacob's Grove** — it can land and be eye-gated on its own.

**Phase 3 — retire `default.json`.** LS's census moves to `baked/lafayette-square/trees.json`, the path `InstancedTrees.jsx:600` already tries *first*. The fallback at `:50` stops being load-bearing. **Blast radius — do not miss these:**
- `src/components/InstancedTrees.jsx` (the fallback)
- **`bake-ground-ao`** reads tree positions out of `default.json` (`cartograph/BAKE.md:54`) — it will silently bake wrong ground contact shadows if you move the file without repointing it.
- `cartograph/SLAB-CONTRACT.md §8` — the contract change.
- Grep the full repo for `default.json` before you cut (`feedback_orphan_audit_full_repo`).

**Phase 4 — canon accord.** `SLAB-CONTRACT §8`, `BAKE.md` rows 7–8, `ARCHITECTURE.md:143`/`:208`, `arborist/NOTES.md:14` (its warning becomes obsolete — repoint, don't leave it contradicting), `README §⭐ START HERE`, `ORIENTATION.md` if the one-liner is affected. **A half-update that leaves a contradiction is worse than none** (`BOZ.md §3` accord sweep).

---

## A SEPARATE, LIVE PROD BUG found during this diagnosis (do not fold it into the above)

**`origin/main` ships a census that asks for tree models it does not contain.** Verified this session:

- `origin/main:public/baked/default.json` requests `platanus_acerifolia/skeleton-4` **88 times** (22 lod0 + 22 lod1 + 44 lod2).
- `origin/main` ships platanus GLBs for skeleton **1, 2, 3, 6, 7, 8, 9, 10** — **no skeleton-4**.
- The runtime fetches these as direct static URLs (`<base>/baked/<look>/trees/<species>/skeleton-<variantId>-<lod>.glb`, `InstancedTrees.jsx:53`).

**→ 88 platanus placements 404 on lafayette-square.com today.** The mirror image is also true: five chassis (6–10) ship as dead weight nothing references.

⭐ **This is very likely a second, independent cause of the open backlog item "trees don't reliably render," which is currently blamed entirely on an async-load race** (`cartograph/BACKLOG.md`, Jacob 2026-06-27). A chunk of the forest 404ing is not a race. **Do not close the race item on the strength of this, and do not assume this replaces it — they can both be true.**

**Working-tree state as of this writing:** yesterday's masquerade bake (2026-07-14 10:24) regenerated the platanus GLBs to exactly `{1,2,3,4}` — the set `default.json` actually asks for. **The working tree is more correct than `HEAD`.** A `git restore` would re-break those 88 trees. This was nearly done twice on 2026-07-15 (once by the prior window, once by me) on the false premise that the files were "Altadena contamination" — they are not; the species set is exactly LS's ten, unchanged.

---

## Write / commit boundaries

- **Yours to edit:** `arborist/bake-trees.js`, `arborist/serve.js`, `src/arborist/**` (Grove UI + store), `src/components/InstancedTrees.jsx`, and — in Phase 4 only — the canon docs named above.
- **Off-limits without checking in with Jacob:** anything under `public/baked/**` **committed**. The working tree there is mid-decision and eye-gate-pending (see below). Do not `git restore`, do not `git clean`, do not commit it.
- **Never `git clean`** untracked files here — `public/baked/lafayette-square/trees/overhead/` (60 files) and the `skeleton-4` GLBs are untracked and are the *good* copies.
- Commit your own files only (selective `git add`); Jacob's in-flight diffs stay untouched.
- **Surface scope drift.** If Phase 2 turns out to need Phase 3's contract change to work, stop and say so rather than expanding.

---

## Gotchas — do not relearn these

- **`default.json` is not global.** It is LS's. The name lies. Every doc that says "cross-Look" is repeating the fossil.
- **`baked/lafayette-square.json` is a phantom** — nothing reads it. Its 10.5k-line diff in the working tree is pure noise from yesterday's misrouted bake. Ignore it; it is not evidence of anything.
- **The ground/trees naming is INVERTED between artifacts.** For ground, `baked/lafayette-square/` is real and `baked/default/` is the phantom (`feedback_bake_ground_scene_clobbers_default_look`, 2026-06-01 — cost a full session). For tree placements it is the reverse: `baked/default.json` is real. **Check which artifact you are reasoning about before you trust either rule.**
- **Timestamp noise:** `default.json` carries a `generatedAt` stamp that changes every bake. A diff of only that line is a no-op re-bake — discard it (`cartograph/OPERATIONS.md §noise vs real`).
- **`public/baked/lafayette-square/trees/overhead/` (60 untracked files) is LEGITIMATE Grove output, not contamination.** It is the overhead-snapshot step of Bake→Slab (`Grove.jsx#bakeAll` → `OverheadBaker` → `postOverhead`). The seam was un-parked 2026-07-10 (`a4458f4a`, `arborist/ARCHITECTURE.md:68`): `captureTreeOverhead`/`OverheadTrees` bake a 3-slice snapshot per unique tree and the runtime selects it **by camera height** on zoom-out. ⚠️ **This is the ONE sanctioned runtime camera-height selection** — it does not license a general distance-swap; the Street/Hero mesh path is unchanged and `GeoTierDriver` stays retired.
- **NOTHING in this brief is eye-verified.** It is code paths and byte counts. Per `feedback_proxy_render_is_not_the_operator_eye`, that gates nothing visual. **Jacob's eye gates every phase.** Do not claim "confirmed" without it (`feedback_dont_claim_confirmed_without_verifying`).
- **This is the palimpsest** (`project_the_palimpsest_code_path_multiplicity`) — "we weren't even baking what we look at." Same shape as 2026-06-01. If you find yourself adding a *third* path, stop: the fix is to collapse paths, not add one.

---

## Eye-gate owed before any of this lands

Bake LS and have **Jacob look at the forest**. The working tree's GLBs are `{1,2,3,4}` (correct against the census); `HEAD`'s are `{1,2,3,6,7,8,9,10}` (stale). Nothing is committed and nothing is lost, but the decision on that working tree is Jacob's and it is still open as of this handoff.
