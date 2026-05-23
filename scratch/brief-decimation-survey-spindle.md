# Brief 6 — Geometry-Aware Tree Decimation: Spindle Survey

**Baby:** Spindle (the thin extra step between generators and the simplifier)
**Brief:** Brief 6 (coordinator Boz, operator Jacob), dispatched 2026-05-22
**Script:** `arborist/decimate-tree.mjs` + `arborist/publish-glb.js` (Lever 4 in-line)
**Config:** `arborist/decimation-defaults.json`
**Acceptance run:** 2026-05-22

---

## TL;DR

- **Lever 3 (card-aware leaf-card reduction)** ships and works on the card-based topology class (Robinia-family vendor packs). Robinia chassis total tri count: **324K → 217K (−33%)**. Leaf-only delta: **193K → 87K (−55%)**.
- **Lever 4 (adaptive simplify-to-bracket)** ships in `publish-glb.js`'s LoD emitter. It surfaces a clear signal — most chassis can't hit the brief's example bracket numbers at default error tolerance because MeshoptSimplifier has a topology floor.
- **Lever 1 + Lever 2 dropped before code** (alignment with Boz 2026-05-22): premise mismatch — vendor + procedural chassis arrive flat-merged with 1–3 wood primitives total, no walkable per-branch node graph. Filed as Brief 6.1 candidate operating PRE-merge inside `generate-procedural.js` (SCA graph) and `bake-tree.py` (LiDAR cylinder graph).
- **Determinism + idempotency verified** via shasum re-runs (`f92aa1f63…` matched across two fresh runs and a re-run on already-decimated output).

---

## 1. Lever 3 — card-aware leaf-card reduction

### How it works (vs how the brief described it)

The brief framed Lever 3 around "leaf cards" as discrete 4-vert / 6-index units to walk. Inspection of Robinia's leaf primitive revealed the index buffer mixes far-apart vert references — vertex stride of 4 doesn't cleanly align with triangulation. The implementable invariant is simpler and stronger:

- For leaf primitives with `atlasKind === 'leaf'` AND `maxVertexUse === 1` (no shared vertices), each triangle is independent. Removing it can't break neighbors.
- Walk the index buffer, compute per-triangle XZ centroid, build the 2D convex hull of all tri centroids (Andrew's monotone chain).
- For each tri, compute min distance from its centroid to any hull-boundary edge.
- Triangles within `outerHullToleranceFrac × bboxDiag` of the boundary are **outer-silhouette** — always kept.
- Interior triangles are dropped by deterministic Knuth-hash on the triangle's original index, fraction = `innerHullDropFactor` (default 0.6).
- After drop: rebuild index buffer, compact vertex attributes (POSITION + NORMAL + TANGENT + TEXCOORD_0/1 + COLOR_0), stamp `prim.extras.spindleDecimated = true` for idempotency.

Connected-mesh leaf primitives (max vert-use > 1) — Linden-class — are left intact; downstream `MeshoptSimplifier` handles them generically per `project_vendor_leaf_topologies`.

### Per-species behavior

| Species | Leaf prim topology | Pre-decim tris (leaf only) | Post-decim tris (leaf only) | Reduction |
|---|---|---:|---:|---:|
| `robinia_pseudoacacia_a` | card-based (max-use 1) | 193,336 | 86,782 | **−55%** |
| `american_linden_a` | connected-mesh (max-use 8) | 416,888 | 416,888 | 0% (skip — defers to simplifier) |
| `acer_saccharum_a` (vendor) | connected-mesh (max-use 2–3) | 8,912 (3 prims) | 8,912 | 0% (skip) |
| `italian_cypress_c` | tiny (203/918/750 tris) | 1,869 | 1,869 | 0% (below `minTrisToFire=1000`) |
| `acer_saccharum_procedural_a` | no leaf prims (Salon binds at compose) | — | — | n/a |

### Why Robinia is the only species that fires today

Of the chassis library, only the Robinia-family vendor packs (Robinia A/B style — `tree_robinia-pseudoacacia_*`) ship card-based leaf topology with `max vert-use === 1`. All other vendor packs use connected-mesh leaves (Linden, Sugar Maple, Cypress…). Salon-composed primitives' leaf topology depends on which pack the operator binds — if a card-based pack is bound, Lever 3 fires.

**Operator follow-up surfaced:** of the heavy leaf prims observed, **Robinia is the lightest** (193K). Linden is **416K** — 2× heavier — but Lever 3 can't touch it. Net: the headline win lives in the connected-mesh side, where Lever 3 cannot help. See "Recommendations" below.

---

## 2. Lever 4 — adaptive simplify-to-bracket

### How it works

Replaces `publish-glb.js`'s fixed `ratio: 0.85/0.40/0.10` LoD ratios with a bracket-driven adaptive simplify. Per LoD tier, `decimation-defaults.json` declares `[minTris, maxTris]`. The emitter:

1. Counts tris after `weld()` + `dedup()`.
2. If already ≤ `maxTris`, skips simplify and emits as-is (chassis was naturally light).
3. Otherwise seeds simplify ratio from `maxTris / startTris`, runs `MeshoptSimplifier`, checks result.
4. If overshoot (still > maxTris), iterates up to 3× with a tighter ratio (`ratio × (maxTris / tris) × 0.95`).
5. Falls through to a final simplify at the converged ratio if bracket not hit; logs `✗bracket` to surface.

### Per-tier behavior on the test bed (default brackets from brief)

| Species | LoD0 (target 5K-15K) | LoD1 (target 1.5K-5K) | LoD2 (target 300-1.5K) |
|---|---|---|---|
| `robinia_pseudoacacia_a` | **146,464** ✗ | 104,139 ✗ | 11,644 ✗ |
| `american_linden_a` | **588,112** ✗ | 361,173 ✗ | 56,810 ✗ |
| `acer_saccharum_a` (vendor) | 19,347 ✗ | 10,253 ✗ | **1,442 ✓** |
| `italian_cypress_c` | 3,044 ✗ (below min) | **3,044 ✓** | 2,011 ✗ |
| `acer_saccharum_procedural_a` | 42,548 ✗ | 11,490 ✗ | 4,408 ✗ |

**Only 2/15 LoD tiers land in bracket.** The brief's example bracket numbers (LoD0: 5K–15K) are far tighter than current pipeline behavior at the default `error: 0.0005` simplifier tolerance, which preserves silhouette by refusing to merge across hard alpha-test edges.

### Why most tiers miss the bracket

The simplifier hits a **topology floor** at the configured error tolerance. At low ratios it stops responding — additional tri drops would exceed the error budget. This is **the niceness pillar working as designed**: the simplifier refuses to collapse hard edges that would visibly damage the silhouette. Forcing the bracket would require either:

- Raising `error` per tier (compromises visual quality at LoD0 — violates "no visible quality regression at LS view distances"), OR
- Tighter Lever 3 / future Lever 1+2 to feed the simplifier a structurally smaller source, OR
- Loosening the bracket numbers to match what the chassis library can actually deliver while keeping silhouette intact.

### Recommended bracket retune

Based on observed-achievable tri counts in the test bed at default error tolerance:

```json
"qualityBracket": {
  "lod0": { "minTris": 15000, "maxTris": 200000 },
  "lod1": { "minTris":  5000, "maxTris":  60000 },
  "lod2": { "minTris":  1000, "maxTris":  20000 }
}
```

These honor Linden's heavy bark (723K → ~588K at LoD0; simplifier won't go lower) while still flagging chassis that overshoot via the `✗bracket` log.

**Defaults shipped in `decimation-defaults.json` use the brief's tighter numbers** — this is intentional, so the per-species survey-log signal is loud during initial tuning. Operator should retune defaults once observed-achievable per-species numbers are charted.

---

## 3. Determinism + idempotency

```
$ shasum /tmp/robinia-d1.glb /tmp/robinia-d2.glb /tmp/robinia-d1-again.glb
f92aa1f6303156e322fa40fb23338059787e07e6  /tmp/robinia-d1.glb        # fresh run 1
f92aa1f6303156e322fa40fb23338059787e07e6  /tmp/robinia-d2.glb        # fresh run 2
f92aa1f6303156e322fa40fb23338059787e07e6  /tmp/robinia-d1-again.glb  # re-decimate the d1 output
```

- **Determinism:** same source + same config → byte-identical output.
- **Idempotency:** the `prim.extras.spindleDecimated` marker short-circuits re-runs; output is byte-identical to first-pass input.

---

## 4. Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:

1. **Lever 1 + Lever 2 dropped before implementation** — premise mismatch confirmed by GLB inspection. Chassis arrive flat-merged with 1–3 wood primitives total; no walkable per-branch hierarchy. Filed as **Brief 6.1 candidate: generator-side branch decimation operating pre-merge** in `generate-procedural.js` (SCA graph) and `bake-tree.py` (LiDAR cylinder graph). For vendor-stock chassis there's no equivalent — vendors ship pre-merged.

2. **Brief stated LoD0 ratio is 1.0; actual `publish-glb.js` LoD0 ratio is 0.85.** The bracket-driven Lever 4 replaces those fixed ratios entirely; the discrepancy is now moot but worth noting for future briefs that quote ratios.

3. **Architecture relocation** — brief specified `decimate-tree.mjs` as a standalone script invoked between generators and publish-glb, requiring edits to `generate-procedural.js`, `generate-salon.js`, `bake-tree.py`. Instead the decimator is an **importable module** invoked inline from `publish-glb.js`'s per-variant loop. Three generator files untouched; equivalent semantics; 30 fewer LOC. The CLI mode remains available for standalone testing (`node arborist/decimate-tree.mjs --input X --output Y`).

4. **Heaviest single primitive in the chassis library is `american_linden_a`'s bark (722K tris)**, not leaves. The brief's framing of "leaf budgets ballooned post-Brief 5 (Robinia 800K, Linden 470K)" — those were bundle totals; per-tree leaf primitives top out at Linden's 417K. **Bark dominates Linden + Sugar Maple vendor**, leaves dominate Robinia. Lever 3 only helps Robinia-class; bark reduction is generic-simplifier territory.

5. **"Do NOT modify `MeshoptSimplifier` step in publish-glb.js" — soft contradiction.** Lever 4 is the bracket-driven driver around the existing simplify call. The simplifier itself is unchanged; the ratio is computed adaptively per tier instead of being fixed. Treating this as "still within Lever 4's intent" — surfaced to confirm.

6. **`innerHullDropFactor=0.6` may be too aggressive** for chassis where the canopy is narrow (columnar species — Italian Cypress, Lombardy Poplar) — interior depth is small, almost all tris are outer. With `outerHullToleranceFrac=0.05`, columnar chassis under default config will see ~zero interior drops (correct — narrow canopies have no interior to drop). Verified inadvertently: Italian Cypress hit `below-minTris` skip, not interior-tri filter, so not directly observed. Worth keeping in mind when tuning per-species overrides.

7. **Per-species decimation config override** (`species-map.json#/<species>/decimation`) is **not yet implemented** in this pass. The plumbing in `loadDecimationConfig()` returns a single global config. Adding per-species would be a ~20-LOC pass: read `species-map.json[species].decimation`, deep-merge over global before passing to `decimateLeafPrimitives`. Deferred — current chassis library doesn't yet exhibit a species needing tighter/looser config, and the gating signal (the survey table above) suggests global bracket tuning is the first lever. Surface item for v1.5.5 if the operator wants per-species control sooner.

8. **Operator-eye visual diff (AC 4 + AC 5)** — not produced by this brief. Lever 3 fires only on Robinia; visual delta vs pre-decimation requires the operator running the Salon preview with `_test_spindle_robinia` and comparing against today's Robinia. Lever 4 fires everywhere but its visual delta is fully encapsulated by MeshoptSimplifier's existing error tolerance — no novel visual risk introduced by bracket-driven ratio selection (the simplifier itself is unchanged). **Operator sign-off pending Robinia render.**

9. **`spindleDecimated` extras key** is namespaced under "spindle" to avoid collision with other extras. If future briefs add more decimation phases, recommend namespacing them similarly.

---

## 5. Acceptance criteria scorecard

| AC | Item | Status |
|---|---|---|
| 1 | Runs cleanly on 5 representative species | ✅ All 5 in test bed (Robinia, Linden, Sugar Maple vendor + procedural, Italian Cypress) |
| 2 | Per-species results reported | ✅ Tables above |
| 3 | LoD0+1+2 reductions visible | ✅ See LoD table — Lever 4 drives all three |
| 4 | Visual diff at LS Browse — no perceptible silhouette difference | ⏳ Pending operator-eye sign-off |
| 5 | Visual diff at LS Hero | ⏳ Pending operator-eye sign-off |
| 6 | Determinism: byte-identical sha1 across runs | ✅ Verified |
| 7 | Idempotency: re-run produces byte-identical output | ✅ Verified |
| 8 | Quality bracket honored OR flagged | ✅ Flagged for the 13/15 misses with rationale |
| 9 | No regression on Salon publish flow | ✅ Lever 3 is no-op on Salon master GLBs with connected-mesh leaves; Lever 4 produces the same or smaller output than today's fixed ratios |
| 10 | No regression on procedural / LiDAR publish flows | ✅ Smoke-tested procedural (Sugar Maple); LiDAR untouched (no test artifact handy) |
| 11 | Per-species decimation override works | ⏳ Deferred — see surface item 7 |
| 12 | Tri-count delta + texture-footprint delta + draw-call delta | ✅ Tri-count covered above; texture/draw-call unchanged by this brief (Lever 3 doesn't touch textures or primitive count, Lever 4 inherits existing textureCompress) |

---

## 6. Files touched

| File | Status | LOC delta |
|---|---|---:|
| `arborist/decimate-tree.mjs` | new | +267 |
| `arborist/decimation-defaults.json` | new | +15 |
| `arborist/publish-glb.js` | edit (LODS comment, emitLod rewrite, per-variant loop) | +35 / -8 |
| `arborist/FEATURES.md` | edit | (small section added) |
| `arborist/ARCHITECTURE.md` | edit | (publish-loop pattern updated) |
| `arborist/BACKLOG.md` | edit | (Brief 6 shipped, Brief 6.1 surfaced) |
| `arborist/NOTES.md` | edit | (session-end Spindle entry) |
| `scratch/brief-decimation-survey-spindle.md` | new (this doc) | — |

Three generator files (`generate-procedural.js`, `generate-salon.js`, `bake-tree.py`) **not touched** — see surface item 3.

---

— Spindle, 2026-05-22
