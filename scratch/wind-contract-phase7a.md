# Wind contract — Phase 7a (ADR)

**Author:** Sough (baby, Brief 9a)
**Coordinator:** Boz
**Operator:** Jacob
**Date:** 2026-05-22
**Status:** SHIPPED 2026-05-23 (Sough). Signed off 2026-05-22 (Boz + Jacob).

## Decisions (post-signoff)

- **S1** ✅ Add `wind.speed` (m/s) + `wind.gustsScale` (m/s) to `directive.schema.json`. Keep `wind.scale` as Atmosphere's cloud multiplier; Atmosphere is unchanged by 9a.
- **S2** ✅ `gustFrontVelocity` is independent. Default `baseDirection × 10 m/s`. Modulators may author it independently (operator sets `gustFrontVelocity = windVector` to opt into the simpler model).
- **S3** ✅ Formalize `injectFoliageSway` as THE rustle floor. Retire `uSwayWindSpeed` / `uSwayWindDir` on the tree side (Phase 5a wiring superseded). Surface retirement in commit body.
- **S4** ✅ Compute `aWindTier` **at runtime-merge time in `InstancedTrees.jsx`**, not at publish-glb time. Chassis GLBs + `trees-atlas.json` stay byte-identical (AC #12 preserved). Sets the runtime-merge attribute pattern for Brief 10's `aBarkWorldYNorm` too.
- **S5** ✅ Author Meteorologist-side `windState` publisher in this brief (scope expansion accepted). LOC delta surfaced in commit body.
**Refs:** `scratch/brief-9a-wind-production-wiring-trees.md`, `meteorologist/BACKLOG.md` lines 147–152, `meteorologist/NOTES.md` lines 252–291, `feedback_spec_compression`, `project_kit_helpers_pattern`

---

## Purpose

Define the frozen seam between Meteorologist (publishes wind state) and Arborist (consumes wind state for sway) via `src/lib/wind-field.js`. No helper-to-helper imports; both helpers import this module. Atmosphere migration to this seam is Brief 9b — out of scope here, but the contract must support it without change.

## TL;DR

```js
// src/lib/wind-field.js
export function windAt(t, pos, windState) {
  return { force /* THREE.Vector3, m/s */, intensity /* number, m/s */ }
}
```

`windState` is a plain object Meteorologist publishes once per frame. `windAt` is pure (deterministic for a given `(t, pos, windState)`).

---

## Surface items needing operator signoff (LOAD-BEARING)

Per `feedback_spec_compression`, surfacing before I write the code:

### S1 — `windState` shape: m/s vs dimensionless

**Brief sketches:** `baseAmplitudeMps: m/s`, `baseDirection: vec3-TO`.
**Live runtime today:** `directive.wind = { scale ∈ [0,5] dimensionless, dir: degrees-FROM }`. `treeAtlasMaterial.js` already has `uSwayWindSpeed` (scalar multiplier) + `uSwayWindDir` (XZ unit, TO).
**Meteorologist NOTES.md line 252:** intended resolved shape is `wind.speed` (m/s) + `wind.dir` + `wind.gustsScale`. NOTES line 124 says `wind.gustsScale` is a 7a addition not yet on `directive.schema.json`.

**Proposed:** Meteorologist publishes a new runtime channel object `windState` derived from directive + Phase 6 modulators:

| Field | Type | Units | Source |
|---|---|---|---|
| `baseSpeedMps` | number | m/s | `directive.wind.speed` (newly canonicalized; was `wind.scale` dimensionless) |
| `baseDirection` | THREE.Vector3 | unit, TO, XZ-plane | `directive.wind.dir` (degrees-FROM) → TO via `(-sin, 0, -cos)` |
| `gustsScale` | number | m/s peak | `directive.wind.gustsScale` (NEW directive field — Meteorologist must add) |
| `gustEnvelope` | number | [0,1] | Phase 6 modulator output (slow, ~30s) |
| `gustFrontVelocity` | THREE.Vector3 | m/s, world | see S2 below |

**Operator decision needed:** is the directive's `wind.scale` dimensionless multiplier kept and a new `wind.speed` added, or is `scale` redefined as m/s? Atmosphere.jsx line 192 uses `wind.scale` as a 0–5 multiplier on `uWindScale`; that's a semantic break either way.

**Sough's recommendation:** ADD `wind.speed` (m/s) and `wind.gustsScale` (m/s) to the directive schema; KEEP `wind.scale` as the cloud-advection-multiplier shorthand Atmosphere already uses (no break to 9b). `windAt` reads `speed`, not `scale`. The Atmosphere migration in 9b will then choose whether to switch its multiplier off `speed` or keep `scale`.

### S2 — `gustFrontVelocity` semantics: independent or = wind?

**Brief line 50–52:** "gust fronts advect at THIS velocity through the scene (slower than the wind itself; ~10 m/s by default)" — independent from base wind, default magnitude ~10 m/s.
**Meteorologist NOTES line 290:** `gustFrontPos = -windDir * (t * windSpeed)` — gust front advects AT wind speed in the wind direction.

These disagree. Operator decision needed.

**Sough's recommendation:** Independent, per brief. Real-world gust fronts (microbursts, density currents) move at characteristic ~10 m/s independent of ambient wind. The richer spec is the architectural extension per `feedback_spec_compression`; collapsing it onto `windSpeed` is the compression I'm supposed to surface. Meteorologist NOTES line 290 was a first sketch; this ADR supersedes it.

If accepted: `gustFrontVelocity` defaults to `baseDirection × 10` (10 m/s along the wind), but modulators may author it independently (e.g., a thunderstorm outflow boundary moving 20 m/s perpendicular to ambient).

### S3 — `injectFoliageSway` IS the rustle floor

`treeAtlasMaterial.js:58–183` already injects a deterministic sway block that runs always-on with `uSwayWindSpeed` defaulting to 1.0 (constant drift). This effectively IS a rustle floor today. SpecimenViewport's wind chunk (line 747–755) layers an additional sway on top of it.

**Proposed:**
- `injectFoliageSway` becomes the formalized **rustle floor**: very small constant amplitude (~5 mm leaf-tip), pure deterministic noise of `(t, position, instanceID)`. No wind input. Lives in the shared material.
- Wind sway is a SEPARATE block in the same vertex shader, gated by `uWindIntensity > 0`, additively composed.
- SpecimenViewport's `onBeforeCompile` wind chunk is removed; it's now in the shared material driven by uniforms.
- The existing `uSwayWindSpeed` / `uSwayWindDir` uniforms are RETIRED on the tree side (replaced by `uWindForce` / `uWindIntensity`). Atmosphere keeps its own uniforms — those are separate per S1.

### S4 — Per-tier identification scheme (a / b / c)

Brief 10 sub-phase A status: I have not verified whether `aBarkWorldYNorm` exists. **Will check on signoff round and pick (b) if shipped, else (a).** Default proposal:

- **(a)** new `aWindTier` per-vertex attribute (uint8: 0=trunk, 1=branch, 2=twig, 3=leaf), baked at chassis-merge time from local bark cylinder radius percentile. ~+1 byte/vertex; total +~50KB across LS atlas. Cleanest semantics. Goes in trees-atlas bake — **violates AC #12 (`trees-atlas.json` byte-identical)**.
- **(b)** reuse `aBarkWorldYNorm` if Brief 10A shipped. Free; correlates well (high Y → twig, low Y → trunk) for most species; degrades on horizontally-spreading canopies (live oak, etc.).
- **(c)** inline heuristic in vertex shader from `position.y` + radial distance. Free, no attribute, but no canopy-shape awareness.

**Resolution:** AC #12 requires bake byte-identity, so **(a) is gated on operator accepting a controlled `trees-atlas.json` regeneration as part of this brief** — surface item. If operator says no, fall back to (b) if shipped, else (c). Sough recommends pushing back on AC #12 and shipping (a) — the multi-scale visual is the load-bearing payoff.

---

## Contract (assuming surface items resolved per recommendations)

### `windState` (Meteorologist publishes once/frame)

```js
windState = {
  baseSpeedMps:      Number,            // 0..30+ typical; from directive.wind.speed
  baseDirection:     THREE.Vector3,     // unit, world-space, XZ-plane, TO direction
  gustsScale:        Number,            // m/s peak amplitude of spikes
  gustEnvelope:      Number,            // [0,1], slow modulator
  gustFrontVelocity: THREE.Vector3,     // m/s, world-space; default = baseDir*10
}
```

Published via the same channel `<Atmosphere>` reads `directive.wind` from today (see `AtmosphereDirectiveDriver.jsx`). No React context; no shared store.

### `windAt(t, pos, windState) → { force, intensity }`

Three temporal scales composed additively:

```text
DRIFT       (1):  drift     = baseDirection * baseSpeedMps
ENVELOPE    (~30s slow): captured in windState.gustEnvelope (modulator-authored)
SPIKES      (~1–2s sharp, spatially advected):
    phase = t - dot(pos, gustFrontVelocity) / dot(gustFrontVelocity, gustFrontVelocity)
    spikeAmp  = smoothmax(perlin(phase * 1.5, pos.xz * 0.01), 0.0, k=8) * gustsScale * gustEnvelope
    spikeDir  = normalize(gustFrontVelocity)   // gusts blow with the front
    spikeVec  = spikeDir * spikeAmp

force     = drift + spikeVec                  // THREE.Vector3, m/s
intensity = length(force)                     // scalar, m/s
```

`force.xz` gives sway direction; `intensity` gives sway amplitude. Y is always 0.

**Spatial advection** is the `dot(pos, gustFrontVelocity) / |gustFrontVelocity|²` term. A tree at the upwind edge of the gust front sees the spike earlier than a tree on the downwind edge; the front visibly travels through the scene at `|gustFrontVelocity|` m/s.

**Calm-day determinism:** `gustsScale = 0` or `gustEnvelope = 0` → `force = drift`, `intensity = baseSpeedMps`. Pure drift with no spikes. If `baseSpeedMps = 0` also, `force = (0,0,0)`, `intensity = 0`, trees show only rustle floor.

**Unit-testable invariants:**
1. `windAt(t, pos, {…, gustsScale: 0, …}).force` equals `baseDirection * baseSpeedMps` exactly.
2. Upwind/downwind time-offset: at fixed `t`, the same perlin phase appears at `pos = upwind` exactly `Δd/|gustFrontVelocity|` seconds before `pos = downwind`, where `Δd` is the front-aligned distance.
3. `intensity = length(force)` (consistency).
4. Pure function: same inputs → bit-identical output.

### Consumer obligations

**Arborist (`treeAtlasMaterial.js`):**
- Uniforms: `uTime` (s), `uWindForce` (vec3, m/s), `uWindIntensity` (scalar, m/s), `uGustFrontVelocity` (vec3, for in-shader spatial advection of higher-frequency leaf flutter — optional Phase 7a+), `uRustleAmplitude` (scalar, default 0.005m).
- Per-tier damping in vertex shader using `aWindTier` (or fallback per S4).
- Single shader program preserved (no #defines).

**Atmosphere (Brief 9b — out of scope here, but contract supports):**
- Subscribes to `windAt(t, cameraPos, windState)`, writes `force.xz` and `intensity` into its own uniforms. Existing `uWindScale`/`uWindDir` either remapped or kept as a separate dimensionless multiplier (S1 decision).

---

## Invariants & ACs that hinge on the contract

- AC #2: `gustsScale=0 ⇒ pure drift`, smoothmax-spike visibility, upwind/downwind ordering. Provable from formula above.
- AC #5: visible gust-front travel. Requires `gustFrontVelocity` independent per S2.
- AC #6: single shader program. Honored by uniform-only design.
- AC #9: rustle-floor determinism. Honored by S3 — `injectFoliageSway` is already deterministic over `(t, instanceID, position)`.
- AC #10: frozen seam. `wind-field.js` is the only cross-helper symbol.
- AC #12: trees-atlas.json byte-identity. **CONTESTED per S4** — surface for operator decision.

---

## Out of scope (this ADR)

- The smoothmax constant `k`, perlin spatial scale `0.01`, spike rate `1.5`, rustle amplitude `0.005m` are **tuning** — proposed defaults; iterate in Salon. Not contract.
- Audio coupling, leaf detachment, configuration-D Points cloud sway.
- Bake-time changes (Phase B+); wind is runtime-only modulo S4.

---

## Asks of operator before code

1. **S1**: accept "add `wind.speed` + `wind.gustsScale` to directive; keep `wind.scale` for Atmosphere"? Or alternative?
2. **S2**: confirm `gustFrontVelocity` is independent (recommend) vs. = wind (NOTES.md).
3. **S3**: confirm `injectFoliageSway` formalizes as rustle floor; SpecimenViewport's local wind chunk is removed in favor of shared-material uniforms.
4. **S4** + **AC #12 conflict**: accept controlled `trees-atlas.json` regeneration to add `aWindTier` (option a), or constrain me to (b)/(c) and preserve byte-identity?
5. **Meteorologist coordination**: Brief 9a as written requires Meteorologist-side directive schema additions (`wind.speed`, `wind.gustsScale`, plus publishing the `windState` channel). I can author `wind-field.js` and the tree consumer; I cannot author Meteorologist's runtime publisher without overstepping the helper boundary. Do you want me to (a) draft Meteorologist's publisher changes as part of 9a and hand them to a Meteorologist baby, or (b) wait for a Meteorologist-side brief to land first, or (c) author both sides under this brief with explicit scope expansion?

Once you sign off on these five, I'll implement and the remaining brief follows mechanically.
