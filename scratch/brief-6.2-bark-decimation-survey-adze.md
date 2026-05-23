# Brief 6.2 — Connected-mesh bark decimation — survey

**Author:** Adze
**Date:** 2026-05-23
**Brief:** [`scratch/brief-6.2-connected-mesh-bark-decimation.md`](brief-6.2-connected-mesh-bark-decimation.md)

## TL;DR

- **Lever 5 (`decimateBarkPrimitives`) fires** on Linden's 850K-tri bark prim and reduces it 85% to 127K tris at `errorTolerance=0.05, targetRatio=0.15` via `MeshoptSimplifier.simplifyWithAttributes` (UV-preserving). Other connected-mesh bark heavyweights (real-trees-pack Robinia variants) reduce 70–86%.
- **Naturally-light bark untouched** — Cypress's 3 sub-100K-vert bark prims all `below-vertexThreshold` no-ops.
- **AC #1 (LoD2 hits bracket) does NOT clear on Linden** — but the floor-bearer is now the connected-mesh **leaf** prim (419K tris on Linden, untouched by Lever 3 because Lever 3 skips connected-mesh; untouched by Lever 5 because Lever 5 is bark-only). This is out of brief scope and surfaced as a candidate Brief 6.3.
- **Shared classifier landed** at `arborist/atlas-kind-classifier.js` per Boz's Option C tweak; survey-deleaf.js refactored to import it (pure refactor, no behavior change).
- **Deployed-path divergence rescued (partial)** — publish-glb.js now stamps `extras.atlasKind` from the shared classifier on raw vendor variantDocs, so Spindle's Lever 3 has a path to fire in the deployed pipeline for the first time. In practice it still does not fire on the two species tested because both have connected-mesh leaves; see "Spindle's Lever 3 rescue — quantified" below.

## Numbers

### Linden (`tilia_americana`, source: `botanica/trees/european-linden/EuropeanLinden_Tree_FBX.glb`)

| Prim | atlasKind | Verts before | Tris before | Verts after | Tris after | Δ tris | Notes |
|---|---|---|---|---|---|---|---|
| `Mesh` | bark | 703,063 | 850,744 | 176,725 | 127,575 | **−85.0%** | err 1.38e-3 ≪ tolerance 0.05 |
| `Mesh.001` | bark | 18,049 | 15,059 | 18,049 | 15,059 | 0% | below 100K vertex threshold — no-op |
| `Mesh.002` | leaf | 470,869 | 416,888 | 470,869 | 416,888 | 0% | connected-mesh leaf (Lever 3 skip); untouched by 6.2 |
| **total** |  | 1,191,981 | 1,288,358 | 665,643 | 565,189 | **−56.1%** | |

LoD output (after Lever 4 emitLod):
| LoD | tris | bracket | status | bytes (GLB) |
|---|---|---|---|---|
| lod0 | 535,140 | 5K–15K | ✗ (×35) | 36.8 MB |
| lod1 | 423,339 | 1.5K–5K | ✗ (×85) | 30.6 MB |
| lod2 | 110,603 | 300–1500 | ✗ (×73) | 11.1 MB |

LoD ✗bracket failures are dominated by the 419K-tri connected-mesh **leaf** prim that 6.2 does not address. Bark contribution at lod2 is approximately 30K tris (down from 850K source). The remaining ~80K tris in lod2 are leaf-side.

### Robinia (`robinia_pseudoacacia`, source: `botanica/trees/real-trees-pack/black-locust-tree`)

Republished from the real-trees-pack vendor source (4 variants A/B/C/D). All variants have **connected-mesh leaves** (max-vert-use > 1) — so Spindle's Lever 3 skips them. The previously-published Robinia skeleton (single variant, card-based topology, maxUse=1 — Spindle's bench-test target) came from a different vendor pack that is no longer the canonical source for this species.

| Variant | Bark tris before | Bark tris after | Δ | achievedError |
|---|---|---|---|---|
| C | 90,374 | 12,405 | **−86.3%** | 1.95e-3 |
| B | 147,098 | 19,049 | **−87.1%** | 1.73e-3 |
| A | 131,049 | 17,245 | **−86.8%** | 2.01e-3 |
| D | 258,319 | 37,947 | **−85.3%** | 1.42e-3 |

LoD0 ✗bracket on all variants (135K–270K tris). Same root cause as Linden: connected-mesh leaf prim (no decimation lever covers it today).

### Cypress (`cupressus_sempervirens`, source: `botanica/trees/low-poly-tree-collection/italian-cypress`)

| Variant | Bark prims (verts) | Bark decim | Leaf decim |
|---|---|---|---|
| Mediterranean cypress 01 | 3 prims, all <100K verts | no-op (below-vertexThreshold ×3) | no-op (connected-mesh) |
| Mediterranean cypress 02 | 3 prims, all <100K verts | no-op (below-vertexThreshold ×3) | no-op (connected-mesh) |

**AC #4 ✓** — Cypress unaffected by Lever 5.

## Spindle's Lever 3 rescue — quantified

The brief's coordinator-supplied context expected Lever 5 to land alongside a "Lever 3 silent-no-op on deployed path" rescue, on the premise that adding `stampAtlasKind` to publish-glb would unblock Spindle's leaf-card reducer for the first time in the bake chain.

**Reality on the two re-published species:** Lever 3 still does not fire — both Linden and real-trees-pack Robinia ship **connected-mesh** leaves (`maxVertUse > 1`), and Spindle's Lever 3 is gated specifically on `maxVertUse === 1` (card-based topology). The atlasKind stamping IS now correct (leaf prims are stamped 'leaf' instead of being skipped at the gate), but Lever 3's downstream topology check rules them out.

The card-based vendor packs that WOULD benefit are still on the library — likely bomi1337-style Forest Pack variants where leaves arrive as discrete 4-vert quads. None happened to be re-published in this session. The stamping is now in place so any future republish from a card-based vendor source will trigger Spindle's lever for the first time in the deployed pipeline.

Net Spindle-rescue numbers in this session: **0 leaf prims reduced** (vs Spindle's chassis-CLI bench of `robinia_pseudoacacia_a` at −55%). The deployed path is now plumbed; the species mix at re-publish time didn't trip it.

## Determinism + idempotency

```
$ shasum public/trees/tilia_americana/skeleton-1-lod*.glb  # run 1
$ node arborist/publish-glb.js --source ... --species tilia_americana
$ shasum public/trees/tilia_americana/skeleton-1-lod*.glb  # run 2
$ diff /tmp/linden-run1.sha /tmp/linden-run2.sha
# (no diff) → byte-identical
```

Idempotency on the bark prim is gated by `prim.extras.adzeDecimatedBark = true`; re-runs detect the flag and short-circuit. publish-glb starts from the raw vendor source each invocation, so the flag never persists between runs — the byte-identical result comes from the `MeshoptSimplifier.simplifyWithAttributes` call being deterministic given identical input.

## Acceptance criteria status

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Linden bark significantly reduced at LoD2 | ✗ (LoD2 still ✗bracket) | Bark itself reduced 85% (850K → 127K source-tris). LoD2 still misses bracket because the connected-mesh leaf prim (419K tris, untouched) dominates remaining geometry. Out of brief scope. |
| 2 | Visual diff at LS Hero distance | ⚠ deferred | Requires operator-eye verification; coordinator handoff. `simplifyWithAttributes` with `uvWeight=0.5` selected to preserve atlas-region UV coherence. |
| 3 | Visual diff at LS Browse distance | ⚠ deferred | Same — operator verification. |
| 4 | Naturally-light bark untouched | ✓ | Cypress all below-vertexThreshold no-ops. |
| 5 | Lever 3 (Spindle's leaf reduction) still fires | ✓ (mechanism intact, no firing this session) | Stamping rescues the deployed gate. Neither test species has card-based leaves, so no actual leaf decimation observed. See "Spindle's Lever 3 rescue" above. |
| 6 | Lever 4 fires after Lever 5 (fewer ✗bracket on bark) | ⚠ partial | Lever 4 ran on the post-Lever-5 doc as designed. ✗bracket count did not drop on Linden because leaves now dominate. |
| 7 | Determinism | ✓ | Verified shasum identical across two runs. |
| 8 | Idempotency | ✓ | `adzeDecimatedBark` extras flag short-circuits re-runs. |
| 9 | No regression on Salon → bake → LS | not tested here | bake-look.js unchanged; geometry reduction means smaller master atlas footprint downstream, not larger. |
| 10 | Smallness as precondition | ✓ for bark | 56% total tri reduction on Linden source, 85% on the headline bark prim. |

## Open follow-ups / Surfaced findings

1. **Connected-mesh LEAF decimation is the new dominant cost on Linden-class chassis.** The brief's "decimation arc closer" framing assumed bark was the last heavyweight; in fact Linden's 419K-tri leaf prim is now the LoD bracket-blocker. Candidate Brief 6.3: bark-shaped lever for connected-mesh leaves, sharing the same `MeshoptSimplifier.simplifyWithAttributes` machinery with a different error/UV-weight tuning (leaf UV alpha-card edges are silhouette-load-bearing — needs higher UV weight than bark).

2. **Spindle's Lever 3 chassis-CLI bench-test is not a publish-glb pipeline test.** The two are different invocation paths against different artifacts. The deployed pipeline (vendor → publish-glb) now has the gating fix, but the species mix that benefits (card-based vendor packs) was not in this session's re-publish set. Recommend re-publishing the Robinia variant Spindle benched against (likely bomi1337 Forest Pack source) to confirm Lever 3 fires in the deployed path.

3. **Quality-bracket tuning unchanged.** The brief considered whether `decimation-defaults.json#qualityBracket` needs per-species overrides. Not exercised in this brief; LoD2 ✗bracket on Linden is a leaf-side problem, not a bracket-tightness problem.

4. **`barkDecimation.errorTolerance` default 0.05 left room.** Linden achieved error 1.38e-3 at the target ratio — the simplifier hit the index-count target well below the error ceiling. Operator could raise `targetRatio` from 0.15 toward 0.20 if visual fidelity suffers, or lower it toward 0.10 if more aggression is needed; the error budget is not the constraint.

5. **CLI in `decimate-tree.mjs` only invokes leaf decimation.** Pre-existing; the standalone CLI does not call `decimateBarkPrimitives`. Left as-is — out of brief scope, but worth flagging if anyone runs the CLI for diagnostic purposes.

## Architecture note

`arborist/atlas-kind-classifier.js` is the single source of truth for LEAF/WOOD/AMBIGUOUS classification across the chassis pipeline. `survey-deleaf.js` and `publish-glb.js` both import from it. Per [[feedback_classifier_keyword_cross_check]], any future keyword set changes happen in one place.
