# Brief 9 — Phase 7a wind production wiring (rustle floor + live-weather directive)

> **⚠️ SUPERSEDED 2026-05-22 by `brief-9a-wind-production-wiring-trees.md` + `brief-9b-wind-atmosphere-migration.md`. Do not pick up this brief.**
>
> **Reason:** Hazel's audit (`brief-audit-hazel.md`) caught a spec-compression on the wind contract (this brief flattened Meteorologist BACKLOG's three-temporal-scale + spatial-gust-front shape to single amplitude + direction) AND an Atmosphere migration not in the file list (AC #3 required cloud/tree sync that needed retargeting Atmosphere from `directive.windDir` direct to `windAt()`). Resolved via 9a (tree-side, full contract) + 9b (Atmosphere migration).
>
> History preserved here for reference; live work is in 9a + 9b.

---

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

## Where you are — cross-helper context

You're joining work that spans two helpers in the kit:

- **Arborist** — the tree authoring + runtime helper. Salon arc is in flight; vendor-leaf preservation (Brief 5), bark luminance pivot (Brief 2.1), Salon Preview Atlas (Brief 7) all shipped. Trees now render through `treeAtlasMaterial.js` in both Salon preview and LS Stage runtime (single material, one implementation per `feedback_salon_preview_is_authoring_surface`).
- **Meteorologist** — the atmospheric authoring + runtime helper. Phase 5a + 6 + 7b/c/d all shipped. `<Atmosphere />` subscribes to a directive resolved from live weather via the almanac + modulator pipeline. Cloud advection is already wind-driven. Rain, snow, lightning all fire per directive.

This brief is the **Arborist consumer side of Meteorologist's Phase 7a**: trees subscribe to the same wind state that drives cloud advection, plus a constant "rustle floor" giving baseline ambient motion.

**Doctrine you're operating within:**
- **Cross-helper contracts are frozen seams** — no helper-to-helper imports, no shared stores. Meteorologist publishes wind state via a runtime channel; Arborist subscribes. Like the canary contract (`localStorage` + `storage` event), or the directive runtime channel `<Atmosphere />` already reads.
- **Single shader program** (Bloom-stability constraint) — wind uniforms add to the existing branch table; no new compiled programs.
- **Salon preview ↔ LS runtime parity** — wind chunks live in `treeAtlasMaterial.js` (the shared material post-Brief 7), gated by uniforms. Salon's workstage wind toggle and LS's live-weather wind drive the SAME uniforms, just from different sources.

## Operator vision (read before drafting code)

The operator's stated intent (2026-05-22):

> *"I want the wind to come from live weather, eventually, with a very subtle 'rustle' as the 'floor' for ambient 'life'."*

Two layers, one uniform field:

| Layer | Source | Behavior |
|---|---|---|
| **Rustle floor** | Deterministic per-tree noise, constant amplitude | Always on. Very subtle (~5mm leaf-tip sway at default). Reads as "alive but still." |
| **Directive wind** | Meteorologist's resolved windState (live weather → almanac → modulators → tween) | Zero in dead calm. Variable with weather. Gust spikes from Phase 6 modulators. |

Composition is **additive**: `treeSwayAmount = baseRustle + directiveWind`. No competition. Calm weather → only floor visible. Storm → floor swamped by directive. Both share the shader path; the uniforms are what differ.

## Mission

Three coordinated changes across both helpers:

1. **Promote wind chunks** from `src/arborist/SpecimenViewport.jsx`'s `onBeforeCompile` patches into `src/components/treeAtlasMaterial.js` as a uniform-gated vertex-shader branch. Single implementation, shared by Salon preview and LS runtime.

2. **Wire the rustle floor** — constant low-amplitude noise, per-vertex, deterministic from `vWorldXZ` hash. Always on. Set `uRustleAmplitude` once at material init; never animated.

3. **Wire the directive wind** — Arborist's `InstancedTrees.jsx` (and Salon preview path post-Brief 7) subscribes to Meteorologist's `wind-field.js#windAt(t, worldPos)` per frame. Writes `uWindAmplitude` + `uWindDirection` + gust modulation to the shader uniforms. Cross-helper contract is frozen.

## Cross-helper contract (define + freeze BEFORE coding)

Before touching code, write a short ADR-style note documenting the wind contract. Place it at `scratch/wind-contract-phase7a.md` (operator + both helpers can reference it). Suggested shape:

```js
// Meteorologist publishes (runtime channel, alongside its existing directive channel):
windState = {
  amplitudeMps: number,           // m/s — directive wind speed, post-tween
  direction: [x, 0, z],           // unit vector, world-space XZ (Y stays 0)
  gustsScale: number,             // modulator-authored gust amplitude (Phase 6)
  // Optional later: sampledField(t, pos) → vec3 for spatial variation across LS
}

// Meteorologist owns: src/lib/wind-field.js
//   exports windAt(t: number, worldPos: vec3) → {
//     amplitude: float,    // composed: directive amplitudeMps + per-position gust modulation
//     direction: vec3,     // composed: directive direction, possibly per-position rotation
//   }

// Arborist consumes (Salon preview + InstancedTrees runtime):
//   imports { windAt } from 'src/lib/wind-field.js'  -- via root imports, not direct cross-helper
//   calls windAt(state.clock.now, treePosition) per frame
//   writes uniforms: uWindAmplitude (float, m/s), uWindDirection (vec3)
//   uRustleAmplitude is local-to-Arborist (constant, no Meteorologist involvement)
```

**The contract is the only coupling.** No shared store, no helper-to-helper imports — `wind-field.js` lives at `src/lib/` (root) per existing convention (`src/lib/almanac-eval.js` is the precedent). Both Meteorologist and Arborist read from that root location; neither owns the other.

Surface the contract to Jacob before committing to it. If he wants to tweak the shape, this is the moment.

## Files you'll touch

| File | Status | Owner | ~LOC |
|---|---|---|---|
| `scratch/wind-contract-phase7a.md` | new — ADR docstring | shared | ~80 |
| `src/lib/wind-field.js` | new — `windAt(t, pos)` + composition logic | Meteorologist | ~120 |
| `src/components/treeAtlasMaterial.js` | edit — new uniforms (`uRustleAmplitude`, `uWindAmplitude`, `uWindDirection`) + vertex shader sway chunk (promoted from SpecimenViewport) | Arborist | +60 |
| `src/components/InstancedTrees.jsx` | edit — subscribe to `windAt`, write uniforms per-frame via `applyBarkUniforms`-adjacent path | Arborist | +30 |
| `src/arborist/SpecimenViewport.jsx` | edit — remove the wind `onBeforeCompile` patches (logic now in shared material). Wind toggle UI still works by driving the same uniforms locally. | Arborist | -40 lines wind patches, +15 lines local uniform driving |
| `src/arborist/SalonWorkstage.jsx` (or SpecimenViewport's overlay) | verify wind toggle still functions; may need 5-LOC adjustment | Arborist | ~+5 |
| `meteorologist/pipeline/schema/directive.schema.json` | confirm/add `wind.gustsScale` field if not already there (Phase 6 may have added it) | Meteorologist | 0–10 |
| `arborist/ARCHITECTURE.md` | document the cross-helper wind contract; mark wind chunks promoted | Arborist | +30 |
| `meteorologist/BACKLOG.md` | mark Phase 7a [Arborist tree-side] shipped; the Atmosphere side already subscribes per Phase 5a | Meteorologist | +5 |
| `arborist/BACKLOG.md` | mark Brief 9 shipped | Arborist | +5 |
| `arborist/NOTES.md` | session entry | Arborist | ~50 |
| `meteorologist/NOTES.md` | brief cross-reference entry | Meteorologist | ~20 |

Total: ~400 new LOC + the new helper file + the contract doc.

## Acceptance criteria

1. **Salon workstage wind toggle behavior unchanged in shape.** Toggle off → only rustle floor (subtle leaf-tip motion, branches still). Toggle on with strength slider → directive sway composes on top of floor.
2. **LS Stage trees sway per live weather.** Open LS on a windy day (or set the WeatherPoller fixture to high wind), see trees sway. Calm day → only ambient rustle. Storm conditions → vigorous sway + gust spikes.
3. **Cloud and tree wind are visibly synchronized.** Cloud advection direction in `<Atmosphere />` and tree sway direction in `InstancedTrees` match. They're driven by the same windState; verify by eyeballing direction consistency under variable weather.
4. **Single shader program preserved.** Workstage perf gauge `programs` count unchanged (~11). No new compiled programs introduced.
5. **Single atlas binding preserved.** Wind is purely uniform-driven; no new texture bindings.
6. **Bloom stability.** No black-flickering artifacts at any wind state. Verify on LS Stage with Bloom on at low and high wind values.
7. **Rustle floor determinism.** Same tree-id + same world position → identical noise pattern across renders. Deterministic.
8. **Gust spikes fire on directive.** Author a Phase 6 modulator that bumps `gustsScale` for a short window; verify trees show brief amplitude spike during that window.
9. **No regression on Salon preview parity.** Brief 7's "Salon preview IS published artifact, live" doctrine still holds — wind effect visible in Salon AND LS, no daylight.
10. **Cross-helper contract is one frozen seam.** `grep -r 'meteorologist' src/arborist/` shows no direct imports beyond the canary contract; same for the reverse. The `src/lib/wind-field.js` module is the only coupling.
11. **Determinism on bake artifacts.** Wind doesn't touch the bake path (it's pure runtime); verify `node arborist/bake-look.js --look lafayette-square` runs unchanged, `trees-atlas.json` byte-identical before/after Brief 9.

## Approach guidance

- **Wind contract first.** Write the ADR (`scratch/wind-contract-phase7a.md`), share with Jacob, get confirmation before coding either side. The contract is the load-bearing artifact.
- **Promote shader chunks carefully.** The wind logic currently in `SpecimenViewport.jsx`'s `onBeforeCompile` operates on per-vertex world Y + per-material `uIsLeaf`. Verify the same uniforms are accessible inside `treeAtlasMaterial.js`'s standard vertex shader patches. Test in Salon preview after promotion before declaring done.
- **Rustle floor noise function.** Use the same `fract(sin(...) * 43758.5453)` pattern the bark per-instance hashes use (`jh1`/`jh2`/etc.). Two-axis hash from `vWorldXZ`; modulate by `uTime` at low frequency (~0.5 Hz) for slow ambient motion. Per-instance variation falls out from world-position hash.
- **Time source.** `uTime` already exists on `treeAtlasMaterial.js` (per the wind patches in SpecimenViewport). If not present at runtime side, plumb via the same hook the workstage uses.
- **Directive wind composition.** `wind-field.js#windAt(t, pos)` is called from Arborist's per-frame update. Read `windState` from Meteorologist's runtime channel (the same one `<Atmosphere />` reads — confirm pattern). Compose `amplitudeMps + gustModulation(t, pos)` for the amplitude output. Direction usually constant across LS scale, but the contract leaves room for spatial variation later.
- **Salon preview path.** After Brief 7, `SpecimenViewport.jsx` mounts `treeAtlasMaterial.js`. The wind toggle in the workstage UI drives the same `uWindAmplitude` uniform — just sourced from operator state instead of `windAt()`. Two consumers of the same uniform path; clean.
- **Don't add a `<WindProvider>` React context.** Use the same runtime channel pattern Meteorologist uses today for directive distribution. Context proliferation is a kit-wide anti-pattern.
- **Phase 7a is shippable in this form.** Multi-scale tree response (different sway frequencies per branch order — twigs flick faster than trunks) is a v1.6 enhancement; don't try to deliver it here. Single-amplitude per-tree is enough for v1.5.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- `windState` shape on Meteorologist's runtime channel doesn't match the contract sketch (e.g., field already published under a different name; or doesn't include gustsScale yet)
- Bloom or shader-program drift after the wind-chunk promotion
- Performance impact at LS with 745 placements all reading `windAt()` per frame (likely fine — wind is cheap — but measure)
- Interaction with the procedural-tree-wind code path (`generate-procedural.js` may have its own wind story that needs reconciling)
- Race conditions in the Meteorologist runtime channel → wind-field.js → InstancedTrees update chain
- Tree-bake artifacts unexpectedly changed by Brief 9 (they shouldn't — wind is runtime-only — but verify)

Surface in status update AND commit body. Don't quietly extend scope.

## Out of scope

- **Multi-scale tree response** (per-branch-order sway frequencies) — v1.6+
- **Wind-driven leaf detachment / fall animation** — Phase F+ or future Phase 8
- **Wind affecting ground particles** (grass sway, dust) — separate concerns, not Arborist
- **Audio coordination** (wind sound layer) — Audiologist (future helper)
- **Spatial wind variation** across LS (eddies, wind shadows from buildings) — future enhancement; contract leaves room for it via `windAt(t, pos)` signature but implementation stays single-amplitude in v1.5
- **Procedural tree wind retuning** — `generate-procedural.js`'s historical wind path (if any) stays untouched here
- **Configuration D runtime** (Points + A2C + LoD selection) — Brief 6's bake-time work is its prerequisite; queued separately
- **Phase W (production wind in `treeAtlasMaterial.js`)** — this brief IS Phase W. After it lands, mark Phase W shipped in BACKLOG.

## Memory refs

Read at session start:
- `project_kit_helpers_pattern` — the helpers-as-frozen-seams doctrine; canary contract precedent
- `feedback_salon_preview_is_authoring_surface` — single material, both consumers
- `project_preview_equals_ls_literally` — sibling cartograph-side doctrine
- `feedback_unique_program_cache_key_before_wrappers` — Bloom-stability constraint
- `feedback_baby_briefs_need_identity_framing` (you are the baby; identity first)
- `feedback_baby_must_surface_scope_drift` (see above)
- `feedback_spec_compression` — don't translate operator metaphors into thinner architecture. "Rustle floor + directive" is two layers; don't collapse to one source.

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 9 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After this lands, the Arborist-Meteorologist seam is fully wired: weather drives clouds AND trees through one resolved directive; trees breathe in calm weather via the rustle floor; storms move them visibly. Phase 7a Meteorologist-side closes, Phase W Arborist-side closes. The next architectural item is Configuration D runtime (Points + A2C + distance LoD) — feeds the same trees you just made breathe.

Welcome to the Arborist-Meteorologist cross-helper seam.
