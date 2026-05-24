# Brief 6.3 — Connected-mesh leaf decimation (Lever 6) — survey

**Author:** Gnomon
**Date:** 2026-05-23
**Brief:** [`scratch/brief-6.3-connected-mesh-leaf-decimation.md`](brief-6.3-connected-mesh-leaf-decimation.md)

## TL;DR

- **Lever 6 (`decimateLeafPrimitivesConnectedMesh`) fires** on Linden's connected-mesh leaf prim and reduces it **416,888 → 83,377 tris (−80.0%)** at `errorTolerance=0.02, targetRatio=0.20, uvWeight=1.0` via `MeshoptSimplifier.simplifyWithAttributes`. AC #1 (≥70%) ✓.
- **Atlas-sub-region UV preserved byte-tight** — 0 of 173,658 post-decimation leaf verts escape the leaf UV sub-region into the bark region. Linden's leaf + bark share ONE material (`EuropeanLindenBark_Mat`); UV drift would make leaves sample bark pixels. uvWeight 1.0 holds the line. Data-level AC #4 ✓; **operator-eye Salon sign-off still required** (see below).
- **The firing set is broad, not Linden-only** — a full chassis scan found **29 connected-mesh leaf prims across ~14 species** above the 100K-vert threshold (birch, red maple, aspen, white oak, tall pine, western juniper, peach, white fir + Linden). This is the real mobile payoff: Lever 6 trims the leaf floor across most of the heavy canopy roster.
- **AC #2 (lod2 hits bracket) does NOT clear — and the brief's premise is wrong about why.** With the leaf floor removed, the post-Lever-6 leaf prim collapses freely to ~100 tris under emitLod. The remaining lod2 floor (~43K via emitLod / ~57.7K attribute-aware) is **the bark prim** (Adze's Lever 5 output), whose UV-locked topology floor is error-budget-independent. lod2 is now a bark / Lever-4 / bracket problem — out of 6.3 scope. Filed as Brief 6.3-followup.
- **AC #3 (Robinia via connected-mesh) premise wrong** — the active Robinia chassis ships **card-based** leaves (maxVertUse=1). Lever 6 correctly skips them; Lever 3 owns them.
- **Closes Adze's open item** — republishing Robinia on the deployed path shows **Spindle's Lever 3 fires** (leaf 324,202 → 217,648), the first deployed-path proof of the card-based lever.
- **Determinism + idempotency** sha1-verified.

## What shipped

| File | Change |
|---|---|
| `arborist/decimate-tree.mjs` | `+ decimateLeafPrimitivesConnectedMesh` (async, exported) + `decimateLeafConnectedOnePrim` helper; `leafDecimation` block in `DEFAULT_CONFIG`. Clone of Adze's Lever 5 shape with two swaps: gate `bark`→`leaf`, add `maxVertUse > 1` connected-mesh check. |
| `arborist/decimation-defaults.json` | `+ leafDecimation` sub-tree (mirrors `barkDecimation`). |
| `arborist/decimation-defaults.defaults.json` | **new** — immutable hand-authored backstop per [[feedback_json_stringify_loses_hand-authored_format]] (matches the `posterize-defaults.defaults.json` / `leaf-attachment-defaults.defaults.json` precedent). |
| `arborist/publish-glb.js` | import + call site after Lever 5, before emitLod. Mirrors the Lever 5 logging block. |
| `arborist/ARCHITECTURE.md` | decimation-arc diagram + prose extended with Lever 6 + the topology-discriminator + bark-floor finding. |
| `arborist/BACKLOG.md` | 6.3 marked shipped; 6.3-followup (bark lod2 floor) filed. |

Idempotency marker: `extras.gnomonDecimatedLeaf = true`.

## Inspection-first pass (per [[feedback_geometry_briefs_need_artifact_inspection]])

Measured against `public/trees/_chassis/american_linden_a.glb` (the headline target). The chassis leaf prim is **identical** to Adze's vendor-FBX figure (470,869 verts / 416,888 tris — matches his survey table row `Mesh.002` exactly), so the headline number is directly comparable to Adze's baseline. (The bark prim differs: chassis 723K tris vs Adze's vendor 850K — a source-artifact difference, not anything Lever 6 touches.)

**Linden leaf prim characteristics:**
- 470,869 verts / 416,888 tris, **maxVertUse = 8** → connected-mesh (Lever 6 territory; Lever 3 correctly skips).
- UV occupies a **sub-region** of the shared atlas page: leaf `U[0.445,0.989] V[0.619,0.770]`, bark `U[0.008,0.425] V[0.024,0.983]`. **Disjoint sub-regions of one material.** This is the load-bearing reason for `uvWeight: 1.0` — any UV vertex drifting left of U≈0.44 starts sampling bark texels. Per [[feedback_atlas_subregion_uv_recovery]] / [[project_vendor_leaf_topologies]].

**Parameter tuning rationale (from inspection, not assertion):**
- `uvWeight: 1.0` (MAX) — justified by the shared-atlas / disjoint-sub-region finding above. Verified post-run: 0 verts escaped the sub-region.
- `errorTolerance: 0.02` — tighter than Lever 5's 0.05 (atlas-UV + silhouette constraints are tighter than bark surface-continuity), looser than emitLod lod0's 0.0005. Linden achieved err 6.18e-3 at the targetRatio cap — i.e. the targetRatio (not the error ceiling) was the binding constraint, leaving headroom.
- `targetRatio: 0.20` — 416,888 × 0.20 ≈ 83.4K; landed 83,377 (−80%), well under the ≤126K AC threshold.
- `vertexThreshold: 100000` — fires on the 29-prim heavy set; skips the 6 near-miss connected-mesh leaf prims in the 50–100K range (e.g. quaking_aspen sub-prims, white_oak_d) and all the genuinely light ones (Sugar Maple ~4K-tri leaf prims, Italian Cypress sub-1K).
- `positionWeight` — **not exposed by the API.** `MeshoptSimplifier.simplifyWithAttributes(indices, positions, posStride, attrs, attrStride, attribute_weights, vertex_lock, target, error, flags)` weights only the *attribute* (UV) stream; position is the intrinsic quadric base. There is no separate position-weight knob. The `leafDecimation.positionWeight: 1.0` field is retained as documentation but **not passed** to the simplifier. Silhouette discipline rides on the position quadric + the tight error tolerance.

## Numbers

### Linden (`american_linden_a` chassis) — Lever 6 in isolation

| Prim | atlasKind | maxUse | Tris before | Tris after | Δ | err |
|---|---|---|---|---|---|---|
| `Mesh.002` | leaf | 8 | 416,888 | 83,377 | **−80.0%** | 6.18e-3 |

Verts 470,869 → 173,658. UV bbox before/after **byte-identical** (`U[0.445,0.989] V[0.619,0.770]`). Post-decim verts with U<0.43 (bark region): **0 / 173,658**.

### Linden — full deployed publish-glb path (AC #9)

```
atlasKind stamped (stampAtlasKind, raw vendor variantDoc)
leaf decimation (Lever 3):            no-op (1 leaf prim: connected-mesh)   ← L3 correctly skips
bark decimation (Lever 5):            723,079 → 108,442 tris  (Mesh,  err 1.62e-3)
leaf decimation (Lever 6, this brief): 416,888 → 83,377 tris  (Mesh.002, err 6.18e-3)  ← FIRES on deployed path
lod0: 105,390 tris  ✗bracket[5000-15000]
lod1:  90,473 tris  ✗bracket[1500-5000]
lod2:  43,580 tris  ✗bracket[300-1500]
```

Lever 6 fires through the normal Salon → publish-glb chain (not just CLI-direct) — `stampAtlasKind` stamps `extras.atlasKind` on the raw vendor variantDoc, then L3 → L5 → L6 → emitLod. Deployed-path AC ✓.

### The lod2 wall — where it actually is (AC #2)

emitLod can't bracket lod2, so I probed where the floor lives. **Per-prim attribute-aware simplify floor** (target 300 indices, error 0.5) on the post-6.3 Linden:

| Prim | Post-6.3 start | Attribute-aware floor | Sloppy floor |
|---|---|---|---|
| `Mesh` (bark, Lever 5 out) | 108,439 | **57,704** | 1 |
| `Mesh.001` (bark, small) | 15,059 | 99 | 1 |
| `Mesh.002` (leaf, Lever 6 out) | 83,377 | **~100** | 1 |

**The post-Lever-6 leaf collapses all the way to ~100 tris** — it is no longer a floor-bearer at any LoD. The lod2 floor (~58K) is **~99.8% bark.** A full-doc error sweep confirms the bark floor is error-budget-independent:

```
post-6.3 Linden, weld+dedup, simplify @ ratio 0.01:
  error 0.008 → 100,784    error 0.05 → 58,759
  error 0.02  →  58,769    error 0.1+ → 58,755 (flat)
```

Flat above error 0.02 → this is a **topology floor**, not a tuning ceiling. Meshopt's attribute-aware simplify locks UV-island / attribute-seam boundaries; the connected bark mesh has too many locked seams to collapse below ~57.7K. `simplifySloppy` crushes it to ~1 tri but ignores attributes entirely → destroys the atlas-sub-region UV addressing (unacceptable per [[feedback_atlas_subregion_uv_recovery]]).

**Conclusion:** Brief 6.3's premise — "kill the leaf floor and lod2 brackets" — does not survive contact. The leaf *was* the prim Adze fingered, and Lever 6 removes it completely. But underneath sits a bark topology floor that no leaf lever can touch. Clearing lod2 on Linden-class connected-mesh chassis needs bark-side / emitLod / bracket work. Filed as **Brief 6.3-followup** with three candidate paths (bracket retune / impostor lod2 / sloppy-with-vertex-lock). Per the brief's own scope guidance (line 148, line 160) I surface a recommendation and do **not** ship the retune.

### Robinia (`robinia_pseudoacacia_a_tree_robinia_pseudoacacia_a`) — deployed path

```
leaf decimation (Lever 3):            324,202 → 217,648 tris   ← Spindle's lever FIRES (deployed-path proof)
bark decimation (Lever 5):            217,648 → 204,572 tris
leaf decimation (Lever 6, this brief): no-op (1 leaf prim: card-based)   ← correctly skipped
lod2: 10,864 tris  ✗bracket[300-1500]
```

The active Robinia chassis ships **card-based leaves (maxVertUse=1)** — directly contradicting the brief's AC #3 ("all carry connected-mesh leaves"). Lever 6's `maxVertUse > 1` gate correctly routes them to Lever 3. This is the card-based vendor pack Adze's open item asked for: **first deployed-path firing of Spindle's Lever 3** (193,336 → ~86,782 on the leaf prim). Robinia lod2 still misses bracket, but via the Lever 3/5/4 path — never Lever 6's responsibility.

### Naturally-light species (AC #6)

| Species | Leaf prims | Lever 6 result |
|---|---|---|
| Sugar Maple (`sugar_maple_low_poly_forest_a`) | 3 connected-mesh, 1,700–3,988 tris (3,400–9,018 verts) | `below-vertexThreshold` ×3 no-op |
| Sugar Maple (`sugar_maple_multistem_a`) | 0 leaf prims (all bark) | no leaf pass |
| Italian Cypress (`italian_cypress_c`) | 3 connected-mesh, 201–918 tris | `below-vertexThreshold` ×3 no-op |

(Note: the brief said Cypress has "no leaf prims" — it actually has small connected-mesh leaf prims, but all below threshold, so they no-op correctly. Minor brief inaccuracy, behavior is right.)

## Determinism + idempotency (AC #8)

- **Determinism:** two fresh stamp+Lever-6 runs of Linden produce byte-identical leaf geometry (sha1 of POSITION + indices + TEXCOORD_0 = `624d58ea3994` both runs). `simplifyWithAttributes` is deterministic for fixed input/target/error.
- **Idempotency:** re-running Lever 6 on an already-decimated prim short-circuits via `extras.gnomonDecimatedLeaf` (`reason: already-decimated`, no geometry change). Verified on all four test species.
- Full-pipeline byte determinism (including `textureCompress` webp) inherits from Spindle/Adze's existing emitLod path — unchanged by this brief.

## Acceptance criteria status

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Linden leaf prim ≥70% reduced | ✓ | 416,888 → 83,377 (−80.0%). |
| 2 | LoD2 hits bracket on Linden | ✗ | **Not a leaf problem** — leaf collapses to ~100 tris at lod2; bark prim (Lever 5) floors at ~57.7K attribute-aware. Filed Brief 6.3-followup. |
| 3 | Robinia family clears too | ✗ (premise wrong) | Active Robinia chassis is **card-based** (maxVertUse=1) — Lever 6 skips by design; Lever 3 owns it. Robinia lod2 misses bracket via L3/5/4, not L6. |
| 4 | Silhouette + atlas-region UVs preserved | ✓ data-level / ⚠ operator-eye pending | 0/173,658 verts escape the leaf UV sub-region; bbox byte-identical. **Operator must sign off in Salon at Vantage Ground/Overhead** per [[feedback_salon_preview_is_authoring_surface]] — I can't do operator-eye review. |
| 5 | Card-based leaves untouched + L3 proof | ✓✓ | Robinia card-based skipped by L6; **L3 fires on deployed path (324K→217K)** — closes Adze's open item. |
| 6 | Naturally-light leaves untouched | ✓ | Sugar Maple + Cypress all `below-vertexThreshold`. |
| 7 | Lever 5 (bark) unaffected | ✓ | Lever 6 adds a disjoint leaf pass; no bark code touched. Linden bark 723K→108K identical with/without L6. |
| 8 | Determinism + idempotency | ✓ | sha1-identical; `gnomonDecimatedLeaf` short-circuit. |
| 9 | Deployed-path verification | ✓ | Fires via Salon → publish-glb (`stampAtlasKind` → L3 → L5 → L6 → emitLod), not just CLI-direct. |
| 10 | Smallness — actual numbers | ✓ | −80.0% on the headline prim; 29-prim firing set quantified; UV-escape rate 0/173,658. |

## Surfaced findings (per [[feedback_baby_must_surface_scope_drift]])

1. **The lod2 mobile gate is bark, not leaf.** [Headline.] 6.3 cleared the leaf half; the bark prim's ~57.7K attribute-aware topology floor is the remaining blocker, and it's error-budget-independent. See Brief 6.3-followup for the three candidate paths (bracket retune / impostor lod2 / sloppy-with-vertex-lock). **Don't ship the retune in 6.3** (scope wall, per brief).

2. **Robinia is card-based, not connected-mesh.** Brief AC #3 + Adze's survey both stated the active Robinia chassis carries connected-mesh leaves. Inspection says maxVertUse=1 (card-based). This is *good*: it gave the deployed-path Lever 3 proof Adze wanted. But it means AC #3 as written can't be satisfied by Lever 6, and nobody should expect it to.

3. **`positionWeight` is not a real knob.** meshoptimizer 1.1.1 `simplifyWithAttributes` has no position-weight parameter. The recommended `positionWeight: 1.0` from the brief is inexpressible; dropped from the call, kept as a documented-inert defaults field. Flag for future levers that might assume it exists.

4. **uvWeight 1.0 did not under-decimate.** The brief warned high UV weight might block reaching target. It didn't — Linden hit the targetRatio cap (83,377) with err 6.18e-3, well inside tolerance. The shared-atlas constraint and the target ratio coexisted comfortably. No need to tune uvWeight down.

5. **Operator-eye Salon sign-off (AC #4) is outstanding.** I proved UV addressing survives at the data level (0 sub-region escapes), but the Vantage Ground/Overhead silhouette read — does the decimated Linden still read as a Linden? — is intrinsic to Salon authoring and is the operator's to confirm. I did not fake a visual pass.

6. **`leafDecimation.perLeafRef` reserved-but-empty.** Named `perLeafRef` (not the brief's stray `perBarkRef`) for the per-species override slot. Structure TBD — no per-species leaf tuning needed yet; serrate-vs-ovate morphology tuning is a follow-up if a species under/over-decimates.

7. **CLI in `decimate-tree.mjs` still only invokes Lever 3.** Pre-existing (Adze noted it too); the standalone CLI calls neither `decimateBarkPrimitives` nor `decimateLeafPrimitivesConnectedMesh`. Left as-is — diagnostic CLI use should go through publish-glb. Out of scope.

8. **Broad firing set = real mobile win even without lod2.** 29 connected-mesh leaf prims across ~14 species drop ~80% at bake time. Even with lod2 unbracketed, lod0/lod1 leaf budgets across the canopy roster fall hard — that's the part of the operator's mobile concern Lever 6 actually moves. The lod2 bark floor is the remaining mile.

## Composition

- **Brief 10B (Vellum, in flight):** zero file overlap (shader/atlas/uniforms vs decimate-tree/publish-glb/defaults). Parallel-safe; visual result composes.
- **Brief 6.2 (Adze, shipped):** built directly on it — classifier, stampAtlasKind, Lever 5 shape. Bark untouched.
- **Brief 6 (Spindle, shipped):** Lever 3 disjoint by the maxVertUse discriminator. Confirmed firing on Robinia deployed path.
- **Brief 6.3-followup (filed):** the bark lod2 floor — the natural next lever.
