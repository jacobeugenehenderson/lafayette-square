# Brief 9a — Phase 7a wind production wiring (tree-side consumer)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

This is **Brief 9a — tree-side consumer**. The sibling Brief 9b handles the Atmosphere migration to `wind-field.js`. They share the contract (`src/lib/wind-field.js`); 9a builds the contract module + the tree consumer, 9b retargets Atmosphere from `directive.windDir` direct to `windAt()`. 9b depends on 9a landing.

## Where you are — cross-helper context

You're joining work that spans two helpers:

- **Arborist** — tree authoring + runtime. Salon arc shipped vendor-leaf preservation (Brief 5), bark luminance pivot (Brief 2.1), bark detail (Brief 2.1a), Salon Preview Atlas (Brief 7). Trees render through `treeAtlasMaterial.js` in both Salon preview and LS Stage runtime (single material, per `feedback_salon_preview_is_authoring_surface`).
- **Meteorologist** — atmospheric authoring + runtime. Phase 5a + 6 + 7b/c/d shipped. `<Atmosphere />` reads `directive.windDir` directly today; Phase 7a's plan (per Meteorologist's BACKLOG line 147–152) is to retarget that AND wire trees to a shared sampled wind field.

**Doctrine you're operating within:**
- **Frozen-seam cross-helper contracts** — no helper-to-helper imports, no shared stores. `src/lib/wind-field.js` lives at root (precedent: `src/lib/almanac-eval.js`). Meteorologist and Arborist both import it; neither owns the other.
- **Salon preview ↔ LS runtime parity** — wind effects fire in `treeAtlasMaterial.js`, both Salon preview AND LS Stage consume the same uniforms.
- **Single shader program** (Bloom-stability).
- **`feedback_spec_compression` (LOAD-BEARING)** — Meteorologist's BACKLOG already specifies the contract shape: `windAt(t, pos, windState) → { force, intensity }` with three temporal scales (drift / gust envelope / gust spikes via `smoothmax`) + spatial gust-front advection. Don't simplify. Don't collapse to a flatter shape. The richer shape IS the contract.

## Operator vision (read before drafting code)

The operator articulated this 2026-05-22:

> *"I want the wind to come from live weather, eventually, with a very subtle 'rustle' as the 'floor' for ambient 'life'."*

Two layers, composed additively:

| Layer | Source | Behavior |
|---|---|---|
| **Rustle floor** | Deterministic per-tree noise, constant amplitude | Always on. Very subtle (~5mm leaf-tip sway). Reads as "alive but still." |
| **Directive wind** | `wind-field.js#windAt(t, pos, windState)` — directive amplitude + gust envelope + smoothmax spikes + spatial advection | Zero in dead calm. Variable with weather. Gust fronts visibly travel through the scene. |

Calm weather → only rustle floor. Storm → floor swamped by directive. **Additive composition**, single shader path consuming the composed uniform.

## The wind contract (LOAD-BEARING — write the ADR before code)

Per Meteorologist's BACKLOG entry for Phase 7a:

```js
// src/lib/wind-field.js (Meteorologist authors, both helpers consume)

export function windAt(t, pos, windState) {
  // windState — Meteorologist's runtime-published wind data, derived from
  // directive + Phase 6 modulators. Includes:
  //   - baseAmplitudeMps:  number, m/s — directive's resolved wind speed
  //   - baseDirection:     vec3, world-space XZ unit vector
  //   - gustEnvelope:      number ∈ [0, 1], modulator-authored (Phase 6 — e.g.
  //                          pre-storm gust envelope, fog-burn-off calm window)
  //   - gustsScale:        number, m/s amplitude for smoothmax-modulated spikes
  //   - gustFrontVelocity: vec3, world-space — gust fronts advect at THIS
  //                          velocity through the scene (slower than the wind
  //                          itself; ~10 m/s by default per BACKLOG)

  // THREE TEMPORAL SCALES composed internally:
  //   1. DRIFT — baseAmplitude × baseDirection. Constant within a tween window.
  //   2. GUST ENVELOPE — slowly-varying modulation (~30s period; gustEnvelope
  //      modulates the smoothmax spike amplitude).
  //   3. GUST SPIKES — smoothmax(noise(t * spikeRate, pos · gustFrontVelocity))
  //      × gustsScale × gustEnvelope. Sharp spikes that travel through the
  //      scene at gustFrontVelocity. `pos · gustFrontVelocity` is the SPATIAL
  //      ADVECTION term — trees on the upwind side see the gust before trees
  //      on the downwind side.

  return {
    force:     vec3,   // composed: baseAmplitude × baseDirection + gust spike vec3
    intensity: number, // composed: baseAmplitudeMps + gust spike magnitude
  }
}
```

**`force` is a vec3 (direction × amplitude). `intensity` is a scalar amplitude.** Trees consume `intensity` for sway amplitude + `force.xz` for sway direction. Atmosphere (Brief 9b) consumes the same.

**Spatial gust-front advection is load-bearing.** This is what makes gusts feel real — a tree on the east side of the park gets hit a half-second before a tree on the west side, the wave visibly travels. Without it, all trees pulse synchronously, which reads as fake.

## Mission

Three coordinated changes, all tree-side or wind-field-authoring side:

1. **Author `src/lib/wind-field.js`** — the contract module above. Reads Meteorologist's `windState` (already published on the runtime channel `<Atmosphere />` reads from). Composes the three temporal scales + spatial advection. Exposes `windAt(t, pos, windState)`.

2. **Promote wind chunks** from `src/arborist/SpecimenViewport.jsx`'s `onBeforeCompile` patches into `src/components/treeAtlasMaterial.js` as a uniform-gated vertex-shader branch. Single implementation, shared by Salon preview (post-Brief 7) and LS runtime.

3. **Wire multi-scale tree response** — per Meteorologist's BACKLOG line 150: "InstancedTrees sway shader rewritten to sample the field at four time-constants (leaves / twigs / branches / trunk) with appropriate damping." Vertex shader samples `windAt()` and applies damping per geometry type (leaves flutter fast; trunks barely move). Plus the rustle floor as a constant baseline.

## The four time-constant tree response

Per Meteorologist BACKLOG: leaves / twigs / branches / trunk sample the same wind field but with progressively heavier damping. Concrete implementation:

| Tier | Damping | Sway amplitude (relative to `intensity`) |
|---|---|---|
| **Leaves** (alpha-mask cards) | None — full response | 1.0 × intensity, fastest temporal scale |
| **Twigs** (vertices on small branches; identifiable via `atlasKind === 'bark'` + low radius) | Light | ~0.6 × intensity |
| **Branches** (mid-radius bark vertices) | Medium | ~0.3 × intensity |
| **Trunk** (large-radius bark + near-ground) | Heavy | ~0.05 × intensity (just a hint of lean) |

**Identifying tier per vertex**: existing chassis primitives are stamped `atlasKind: 'bark'` or `'leaf'` (per Brief 5). For multi-scale within bark, you'll need a per-vertex hint — either:
- (a) New per-vertex attribute `aWindTier` (0=trunk, 1=branch, 2=twig) baked at chassis-merge time based on local radius or distance-from-trunk-axis
- (b) Use `aBarkWorldYNorm` (if Brief 10 sub-phase A has shipped — same attribute, used for aerial tier) as a proxy (low Y = trunk, high Y = twig)
- (c) Per-fragment heuristic in the vertex shader: world-Y + distance-from-trunk-axis derived inline

**Recommendation**: (a) is cleanest, but adds a chassis-merge step. Decide based on whether Brief 10 sub-phase A has shipped at the time you pick this up (if yes, share its attribute; if no, propose (a) and verify operator agreement).

## Files you'll touch

| File | Status | Owner | ~LOC |
|---|---|---|---|
| `scratch/wind-contract-phase7a.md` | new — ADR documenting the contract shape; reference the brief + Meteorologist BACKLOG line 147–152 | shared | ~80 |
| `src/lib/wind-field.js` | new — `windAt(t, pos, windState)` with three temporal scales + spatial advection | Meteorologist-domain (but you author since you need it; coordinate with operator if it touches Meteorologist's runtime channel writer) | ~180 |
| `src/components/treeAtlasMaterial.js` | edit — new uniforms (`uRustleAmplitude`, `uWindForce`, `uWindIntensity`, plus possibly `uTime` if not present), vertex shader sway logic with per-tier damping | Arborist | +120 |
| `src/components/InstancedTrees.jsx` | edit — subscribe to `windAt()` per frame; write uniforms; per-vertex `aWindTier` attribute baking if option (a) | Arborist | +80 |
| `src/arborist/SpecimenViewport.jsx` | edit — remove the wind `onBeforeCompile` patches (logic now in shared material). Wind toggle UI continues working by driving the same uniforms locally. | Arborist | -50 wind patches, +20 local uniform driving |
| `src/arborist/SalonWorkstage.jsx` | verify wind toggle still functions | Arborist | ~+5 |
| `arborist/ARCHITECTURE.md` | document the cross-helper wind contract; mark wind chunks promoted | Arborist | +40 |
| `meteorologist/ARCHITECTURE.md` | document `wind-field.js` contract from Meteorologist's side; cross-reference Arborist's consumer | Meteorologist | +20 |
| `meteorologist/BACKLOG.md` | mark Phase 7a [Arborist tree-side] shipped; Atmosphere migration (9b) still queued | Meteorologist | +5 |
| `arborist/BACKLOG.md` | mark Brief 9a shipped | Arborist | +5 |
| `arborist/NOTES.md` | session entry | Arborist | ~50 |
| `meteorologist/NOTES.md` | brief cross-reference entry | Meteorologist | ~20 |

Total: ~620 LOC + new helper file + contract doc. Larger than original Brief 9 sketch because the contract is genuinely richer per Meteorologist BACKLOG.

## Acceptance criteria

1. **`scratch/wind-contract-phase7a.md` ADR exists** and matches Meteorologist's BACKLOG Phase 7a shape — three temporal scales, spatial advection, `{force, intensity}` outputs. Operator-signed-off before code commits.
2. **`src/lib/wind-field.js#windAt(t, pos, windState)` returns `{force: vec3, intensity: number}`** with the three temporal scales composed correctly. Unit-testable: at `gustsScale=0`, `windAt` returns pure drift; at high `gustsScale`, smoothmax spikes are visible; gust spikes at `pos = upwind` arrive earlier than at `pos = downwind` by `(downwind-upwind)·gustFrontVelocity/|gustFrontVelocity|²` seconds.
3. **Salon workstage wind toggle drives sway** — toggle off → only rustle floor (subtle leaf-tip motion, trunks still). Toggle on with strength slider → directive sway composes on top of floor, with multi-scale tree response (leaves flutter, trunks barely move).
4. **LS Stage trees sway per live weather** — windy day → visible sway with multi-scale damping. Calm day → only rustle floor. Storm conditions → vigorous sway + gust spikes visibly traveling through the canopy (east side then west side, or whichever direction the gust front advects).
5. **Spatial gust-front advection is visible.** Operator pick two trees far apart in LS, set `gustsScale` high via a Phase 6 modulator; observe one tree gust before the other. NOT synchronous. This AC is OPERATOR-EYE.
6. **Single shader program preserved.** Workstage perf gauge `programs` count unchanged (~11). No new compiled programs.
7. **Single atlas binding preserved.** Wind is uniform-driven; no new texture bindings.
8. **Bloom stable.** No black-flickering artifacts at any wind state. Test at low + high `intensity`.
9. **Rustle floor determinism.** Same tree-id + same world position + same time → identical noise pattern across renders.
10. **Cross-helper contract is one frozen seam.** `grep -r 'meteorologist' src/arborist/` shows no direct imports beyond the canary contract; same in reverse. `src/lib/wind-field.js` is the only coupling.
11. **No regression on Salon preview parity.** Brief 7's "Salon preview IS published artifact, live" doctrine still holds — wind effect visible in Salon AND LS, no daylight.
12. **Determinism on bake artifacts.** Wind doesn't touch the bake path; `node arborist/bake-look.js --look lafayette-square` runs unchanged; `trees-atlas.json` byte-identical before/after Brief 9a.

## Approach guidance

- **Write the contract ADR first.** `scratch/wind-contract-phase7a.md` documents the contract shape, reads/writes/temporal-composition, lists the operator-signed-off invariants. **Get Jacob's signoff before writing code.** Per `feedback_spec_compression`, surface translations explicitly — if you find yourself simplifying the three-temporal-scale shape to two, or collapsing spatial advection to spatial-uniform, STOP and surface. The brief inherits a spec-compression catch from Hazel's audit; honor the lesson.
- **Read Meteorologist's existing `<Atmosphere />` to find `windState`.** Phase 5a wired Atmosphere to read directive wind directly; the directive includes wind data. Look at how Atmosphere reads it; that's the channel you read from too. Meteorologist may need to publish a slightly different shape for `wind-field.js`'s consumption (the `gustEnvelope` from Phase 6 modulators, the `gustFrontVelocity` default). Coordinate any Meteorologist-side publishing changes with the operator.
- **Smoothmax for gust spikes**: standard implementation — `smoothmax(a, b, k) = (a*exp(k*a) + b*exp(k*b)) / (exp(k*a) + exp(k*b))` for some k controlling sharpness. Trees see sharp spikes when smoothmax is sharp; rolling fluctuation when smoothmax is soft.
- **Spatial advection formula**: gust front position at time t is `t × gustFrontVelocity`. A point at `pos` sees the gust spike that the front carried, where the front passed `pos` at time `t - (pos · gustFrontVelocity) / |gustFrontVelocity|²`. The vertex shader can do this lookup directly — pass `gustFrontVelocity` as uniform; vertex computes its own time-offset.
- **Per-tier damping in the vertex shader.** Sample `windAt()` once per vertex (using interpolated time-offset for spatial advection); apply per-tier amplitude scaling based on `aWindTier` (or proxy attribute).
- **Don't add a `<WindProvider>` React context.** Use the same runtime channel pattern Meteorologist uses today for directive distribution.
- **Phase 7a is shippable in this form.** Operator-stated "very subtle rustle floor" + multi-scale tree response + three-temporal-scale wind = full Phase 7a vision per BACKLOG. Don't try to go beyond (e.g., wind-driven leaf detachment is Phase F+).

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- The `windState` shape on Meteorologist's runtime channel doesn't match the contract sketch (e.g., `gustFrontVelocity` not published yet, `gustEnvelope` lives under a different name)
- Per-tier identification scheme (option a / b / c above) is awkward — propose alternative
- Bloom or shader-program drift after the wind-chunk promotion
- Performance impact at LS with 745 placements all reading `windAt()` per frame (vertex shader work is cheap, but the CPU-side per-instance subscriptions could add up)
- The "multi-scale" temporal interpretation has a different reading in Meteorologist's plan than the brief's (e.g., "four time-constants" might mean four oscillation frequencies, not four damping ratios — surface)
- Interaction with the procedural-tree-wind path in `generate-procedural.js` (the historical wind story)
- Tree-bake artifacts unexpectedly changed by Brief 9a (they shouldn't — wind is runtime-only)
- **You are tempted to simplify the contract shape — surface immediately and confirm with operator**

Surface in status update AND commit body. Don't quietly extend or compress scope.

## Out of scope

- **Atmosphere migration to `wind-field.js`** — that's Brief 9b. Atmosphere keeps reading `directive.windDir` directly during Brief 9a's window. Brief 9b retargets it.
- **Wind-driven leaf detachment / fall animation** — Phase F+ or future Phase 8
- **Wind affecting ground particles** (grass sway, dust) — separate concerns, not Arborist
- **Audio coordination** (wind sound layer) — Audiologist (future helper)
- **Procedural tree wind retuning** — `generate-procedural.js`'s historical wind path stays untouched
- **Configuration D runtime** (Points + A2C + LoD selection) — Brief 6's bake-time work is its prerequisite; queued separately
- **Brief 10 view-aware bark interactions** — both briefs touch `treeAtlasMaterial.js` and `applyBarkUniforms`, but vertex (wind) vs fragment (tier) paths are orthogonal. Recommend Brief 9a ships before Brief 10's sub-phase A. Surface if you encounter merge conflict.
- **Phase W (production wind in `treeAtlasMaterial.js`)** — this brief IS the tree-side of Phase W. After this lands, mark Phase W [tree side] shipped in BACKLOG. Atmosphere side is Brief 9b.

## Memory refs

Read at session start:
- `feedback_spec_compression` (LOAD-BEARING — the doctrine that triggered this brief's split from Brief 9; do NOT collapse the contract shape)
- `project_kit_helpers_pattern` — frozen-seam discipline
- `feedback_salon_preview_is_authoring_surface` — single material, both consumers
- `project_preview_equals_ls_literally` — sibling cartograph-side doctrine
- `feedback_unique_program_cache_key_before_wrappers` — Bloom-stability
- `feedback_baby_briefs_need_identity_framing` (you are the baby; identity first)
- `feedback_baby_must_surface_scope_drift` (see above)
- Meteorologist BACKLOG line 147–152 (Phase 7a entry) — the contract source of truth

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 9a (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After Brief 9a lands, trees breathe with live weather + a rustle floor; multi-scale damping makes leaves flutter while trunks barely move; gust fronts travel through the scene. Brief 9b retargets Atmosphere from `directive.windDir` to `wind-field.js#windAt()` so clouds advect in sync with the tree sway. That's the Phase 7a vision complete.

Welcome to the Arborist-Meteorologist cross-helper seam — the contract is the work; the consumer is downstream of it.
