# Brief 6.3 — Connected-mesh leaf decimation (Lever 6)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name that has not already been used in this project.** Babies in this project pattern-match heavily to names they see in NOTES.md / BACKLOG.md / code comments / commits and pick collisions; Jacob has had to redirect repeated misfires (Holm 2026-05-23, Cambium same-day). Pattern-match risk on this brief is **very high** — Spindle's Lever 3 (Brief 6) and Adze's Lever 5 (Brief 6.2) are your direct sibling implementations, both in the same file you'll edit. Their names will be everywhere in adjacent code. **Do not reach for either.**

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Pick something novel.** Anything — a word, a symbol, a string of sounds, something in another language, something invented, a non-plant noun, a mineral, a tool, a star name, a piece of weather, a body of water, an architectural term, a verb conjugation. The project has saturated the plant-adjacent namespace; reach further. State your name in your first message back; sign your commits with it.

---

## Why this brief exists — mobile-critical

Brief 6.2 (Adze, 2026-05-23) collapsed Linden's bark primitive from 850K → 127K tris (−85%) via Lever 5 (`MeshoptSimplifier.simplifyWithAttributes` gated on `atlasKind === 'bark'`). Bark is no longer Linden's heaviness floor. Adze's survey identifies the new floor-bearer:

> *"AC #1 (LoD2 hits bracket) does NOT clear on Linden — but the floor-bearer is now the connected-mesh **leaf** prim (419K tris on Linden, untouched by Lever 3 because Lever 3 skips connected-mesh; untouched by Lever 5 because Lever 5 is bark-only)."*
> — Adze, survey 2026-05-23

Same pattern: Linden-class connected-mesh leaf primitives (sculpted 3D leaves with shared vertices and UVs in atlas sub-regions, per `[[project_vendor_leaf_topologies]]`) sit at 400-500K tris each and dominate LoD2 budget across the Linden + Robinia families. Spindle's Lever 3 silhouette-cull only fires on card-based topology (`max-vert-use === 1`); connected-mesh leaves are explicitly skipped.

**Operator-flagged 2026-05-23: mobile-critical.** The arborist's mission is to deliver beautiful GPU-manageable assets at hundreds of simultaneous placements (per the recent doctrine conversation + `[[feedback_smallness_as_precondition]]`). On mobile, Linden alone could swallow the entire foliage budget — ~30 LS placements × 419K leaf tris ≈ 12M+ leaf tris in the canopy roster, on top of bark + branches. Brief 6.3 is the geometry-side gate that opens mobile.

## Read first

- `arborist/BACKLOG.md` — Brief 6.3 entry; Brief 6.2 entry above it (Adze's shipped scope)
- `arborist/NOTES.md` — Adze's 2026-05-23 entry (Brief 6.2 finding) — load-bearing context, especially the "deployed-path Lever 3 silent no-op" repair
- `scratch/brief-6.2-bark-decimation-survey-adze.md` — Adze's per-species breakdown; **the Linden leaf prim 419K-tri figure is your headline target**
- `arborist/decimate-tree.mjs` — your file. Read three blocks carefully:
  - `decimateLeafPrimitives` (line ~47): Spindle's Lever 3 (card-based silhouette cull). Your Lever 6 is a sibling, not a replacement — Lever 3 keeps firing on card-based; Lever 6 fires on connected-mesh. Both gate on `atlasKind === 'leaf'`; they discriminate via `max-vert-use`.
  - `decimateBarkPrimitives` (line ~294): Adze's Lever 5 (connected-mesh bark). **This is your structural precedent** — clone its shape exactly, swap the gating from bark to leaf, retune the params for leaf topology.
  - Topology classification at line ~120: `maxUse > 1 → connected-mesh`. This is the discriminating signal.
- `arborist/atlas-kind-classifier.js` — Adze's lifted classifier; you import + reuse, no edits.
- `arborist/publish-glb.js` — `stampAtlasKind` runs first, then Lever 3 → Lever 5 → emitLod (Lever 4). Add the Lever 6 call site between Lever 5 and emitLod (or alongside Lever 5; the order between 5 and 6 doesn't matter since they gate on different atlas-kinds).
- `arborist/decimation-defaults.json` — add a `leafDecimation` sub-tree mirroring `barkDecimation`.
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_geometry_briefs_need_artifact_inspection]]`, `[[feedback_extras_based_gating_pipeline_stage]]` (Adze's doctrine — deployed-path verification matters), `[[feedback_atlas_subregion_uv_recovery]]`, `[[project_vendor_leaf_topologies]]` (load-bearing — describes the two leaf classes and why UV preservation matters here), `[[feedback_smallness_as_precondition]]`, `[[feedback_salon_preview_is_authoring_surface]]` — operator iterates IN Salon; LS is the deployment target, NOT a review surface. Visual sign-off is intrinsic to Salon authoring at Vantage's Overhead/Ground preset cameras.

## Goal — and what this phase explicitly does NOT do

**Goal:** A new `decimateLeafPrimitives_connectedMesh` (or `decimateLeafPrimitivesL6` — your call on the symbol; keep Lever 3's name for the card-based path) function runs in `publish-glb.js` against connected-mesh leaf primitives over a vertex threshold. After it lands, Linden's 419K leaf prim collapses by ≥70% with silhouette + atlas-region UV preservation. Lever 4 (emitLod) then hits LoD2 bracket on Linden for the first time.

**Do NOT:**
- Touch Spindle's Lever 3 (`decimateLeafPrimitives` card-based silhouette cull). It's working correctly on card-based topology; the only divergence today is that the deployed publish-glb path's `stampAtlasKind` came online with Adze's 6.2, so Lever 3 has just started actually firing on card-based leaves. Don't conflate.
- Touch Adze's Lever 5 (`decimateBarkPrimitives`). Same simplifier, different gate; orthogonal.
- Touch the atlas-kind classifier (`arborist/atlas-kind-classifier.js`). Import + use.
- Change `publish-glb.js#stampAtlasKind` semantics. Adze's repair is load-bearing.
- Decimate card-based leaves with this lever. Card-based has Lever 3; connected-mesh has Lever 6. The `max-vert-use > 1` gate is the discriminator.
- Add per-vertex attributes, runtime work, shader edits, or atlas changes. This brief is bake-time geometry only.
- Touch leaf textures, leaf packs, or leaf-card placement. Those are Phase F / leaf-pack-library territory.

## Architecture

**Function shape — clone Lever 5 with two swaps:**

```js
// arborist/decimate-tree.mjs — alongside Lever 5

export function decimateLeafPrimitivesConnectedMesh(doc, config) {
  // Iterate primitives. Gate: extras.atlasKind === 'leaf' (per Adze's classifier
  // stamping) AND max-vert-use > 1 (connected-mesh, NOT card-based — Lever 3
  // owns max-vert-use === 1). Below vertexThreshold → skip.
  //
  // For each eligible primitive:
  //   MeshoptSimplifier.simplifyWithAttributes(positions, indices, vcount,
  //     errorTolerance,  // ← TUNE per leaf characteristics (see below)
  //     targetRatio,     // ← TUNE
  //     uvWeight,        // ← HIGHER than Lever 5 (silhouette + atlas-region UV matter more)
  //     positionWeight,  // ← optionally higher than default; silhouette load-bearing
  //   )
  //
  // Idempotency: stamp extras.<your-name>DecimatedLeaf = true.
  // (Adze used extras.adzeDecimatedBark for Lever 5; you mirror with your name.)
}
```

**Parameter tuning rationale (your inspection-first pass determines the values):**

- **UV weight**: Higher than Lever 5's 0.5. Reasons: (1) connected-mesh leaves UV into sub-regions of vendor atlas pages per `[[feedback_atlas_subregion_uv_recovery]]` — UV collapse at sub-region boundaries breaks atlas-region addressing entirely; (2) leaf-card silhouette identity is encoded partially through UV-driven alpha-test edges; collapsing UVs flattens silhouettes. Recommended starting point: `uvWeight: 1.0` (max). Tune down if simplifier under-decimates.
- **Position weight**: Connected-mesh leaves are sculpted 3D forms (Linden) — silhouette is encoded in vertex positions, not just UVs. Recommended starting point: `positionWeight: 1.0` (max) if `simplifyWithAttributes` exposes the knob; otherwise default and let UV weight carry the discipline.
- **Error tolerance**: Adze used `0.05` for bark — connected meshes have generous tolerance because surface continuity is the dominant constraint. Leaves are different: alpha-test silhouette + atlas-UV sub-region are tighter constraints than bark's surface continuity. Recommended starting point: `errorTolerance: 0.02` (tighter than bark, looser than emitLod's `0.0005`). Tune up if Linden under-decimates and UVs still survive; tune down if Linden's leaf shape collapses.
- **Target ratio**: Adze's `0.15` (target 15% of source tris) achieved −85% on Linden bark. Leaves probably want similar — `targetRatio: 0.20` first-pass, tune to land in LoD2 bracket.
- **Vertex threshold**: `100K` matches Lever 5 — only Linden-class heavy connected-mesh leaves fire. Smaller connected-mesh leaves (e.g., Sugar Maple vendor 55K) are naturally light and don't need decimation; let them pass through.

These are **starting points**. Your inspection-first pass (per `[[feedback_geometry_briefs_need_artifact_inspection]]`) measures Linden's 419K leaf prim characteristics — vertex count, UV distribution across atlas sub-regions, position-encoded silhouette features — and tunes from there. Surface the tuning rationale in your survey.

**Defaults JSON entry (`arborist/decimation-defaults.json`):**

Add `leafDecimation` sub-tree alongside `barkDecimation`:

```json
"leafDecimation": {
  "vertexThreshold": 100000,
  "errorTolerance": 0.02,
  "targetRatio": 0.20,
  "uvWeight": 1.0,
  "positionWeight": 1.0,
  "perBarkRef": {}  // unused at present; reserved for per-species overrides
}
```

Hand-authored format preservation per `[[feedback_json_stringify_loses_handauthored_format]]` — ship an immutable `decimation-defaults.defaults.json` sibling if one doesn't exist (check before adding).

**Call site in `publish-glb.js`:**

After `decimateBarkPrimitives(doc, config)` runs, call `decimateLeafPrimitivesConnectedMesh(doc, config)`. Both run pre-emitLod against the stamped atlas-kind extras. Order between the two is irrelevant — they gate on disjoint atlas-kinds.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/decimate-tree.mjs` | edit — add `decimateLeafPrimitivesConnectedMesh` (clone of `decimateBarkPrimitives` with leaf gating + retuned params) | +110 |
| `arborist/decimation-defaults.json` (+ `.defaults.json` sibling if absent) | edit — add `leafDecimation` sub-tree | +12 |
| `arborist/publish-glb.js` | edit — add call site after Lever 5 | +8 |
| `arborist/ARCHITECTURE.md` | edit — extend the decimation-arc subsection with Lever 6 | +15 |
| `arborist/BACKLOG.md` | edit — mark Brief 6.3 shipped | +5 |
| `arborist/NOTES.md` | edit — session entry | ~60 |
| `scratch/brief-6.3-leaf-decimation-survey-<your-name>.md` | new — per-species leaf decimation report + UV-sub-region inspection notes + visual notes from Salon | ~120 |

Estimated total: ~330 LOC, of which ~110 is the new function and ~120 is the survey.

## Acceptance criteria

1. **Linden leaf prim significantly reduced.** Run Brief 6.3 against `american_linden_a` (the headline target). Leaf primitive vert count drops by ≥70% at LoD0 vs Adze's post-Brief-6.2 baseline (419K → ≤126K). Quantify per-LoD in survey.
2. **LoD2 hits bracket on Linden.** Adze's AC #1 finally clears — with both Lever 5 (bark, shipped) and Lever 6 (leaves, this brief) firing, Linden's LoD2 lands inside `decimation-defaults.json`'s configured max. **This is the load-bearing mobile gate.**
3. **Robinia family clears too.** All four real-trees-pack Robinia variants (A/B/C/D) — per Adze's survey, all carry connected-mesh leaves — hit LoD2 bracket post-6.3.
4. **Silhouette + atlas-region UVs preserved.** Salon preview of `american_linden_a` at Vantage's Ground camera (hero tier) shows leaves with identifiable Linden shape — sculpted 3D form intact, no holes, no broken alpha-test edges. UVs land in the correct atlas sub-region (no leaf rendering as bark texture, no atlas-region aliasing per `[[feedback_atlas_subregion_uv_recovery]]`). **Operator-eye sign-off in Salon is the load-bearing visual AC.**
5. **Card-based leaves untouched.** Spindle's Lever 3 fires on card-based leaves (`max-vert-use === 1`) per Adze's repair to `stampAtlasKind`. Your Lever 6 skips card-based topology. Verify on a card-based vendor pack republish if any are in the active species set — if none, surface that we still don't have a deployed-path proof of Lever 3 (Adze's open item).
6. **Naturally-light leaves untouched.** Sugar Maple vendor (55K-tri leaves, connected-mesh, below `vertexThreshold`) no-ops. Italian Cypress (no leaf prims) no-ops. Verify in survey.
7. **Lever 5 (Adze's bark decimation) unaffected.** Bark numbers for Linden / Robinia republished after 6.3 match Adze's reported figures byte-or-shape-equivalently.
8. **Determinism + idempotency.** Same input → byte-identical output across two runs. Re-running on already-decimated GLB produces byte-identical output via `extras.<your-name>DecimatedLeaf` flag. Sha1 verify.
9. **Deployed-path verification** per `[[feedback_extras_based_gating_pipeline_stage]]`. Your Lever 6 fires when invoked via the normal Salon → publish-glb chain, not just via CLI-direct against pre-tagged chassis. Document the invocation path in your survey.
10. **Per `[[feedback_smallness_as_precondition]]`**. Net tri-count delta per species (pre-6.3 → post-6.3 → per-LoD-bracket clearance); UV-sub-region preservation rate; survey reports actual numbers, not assertions.

## Composition with in-flight + queued work

- **Brief 10B (Vellum — in flight)**: orthogonal. 10B touches shader fragment + atlas extraction + uniforms (substrate path). 6.3 touches `decimate-tree.mjs` + `publish-glb.js` + defaults. **Zero file overlap.** Parallel-safe. If both ship same-session, the visual result composes naturally — your reduced leaf geometry + 10B's posterized substrate compound at Browse distance.
- **Brief 6.2 (Adze — shipped)**: your structural precedent + the classifier + the bark-prim work it cleared. You build directly on it.
- **Brief 6 (Spindle — shipped, deployed-path repaired by Adze)**: the card-based Lever 3 path is structurally disjoint from yours. Don't conflate; don't touch.
- **Brief 3 (deformer rig — queued)**: orthogonal. Vertex-shader displacement; you touch bake-time geometry.
- **Brief 17 (per-species bottom-cut — queued)**: composes orthogonally — both pre-emitLod geometry trims. 17 trims by Y; 6.3 simplifies by topology.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`, watch for and disclose in your commit body:

- **UV sub-region collapse risk.** Per `[[project_vendor_leaf_topologies]]` Linden's connected-mesh leaves UV into a sub-region of the vendor atlas page. Aggressive simplification may collapse UV vertices across sub-region boundaries → atlas-region aliasing per `[[feedback_atlas_subregion_uv_recovery]]`. Inspect UV distributions before and after a test run; if aliasing fires, raise `uvWeight` further or surface the wall.
- **Silhouette-edge weighting.** `MeshoptSimplifier.simplifyWithAttributes` may not expose a separate silhouette-edge preservation knob beyond positionWeight + uvWeight. If Linden under-decimates because the simplifier refuses to collapse alpha-test edges, surface — may need to gate alpha-test edges explicitly or fall back to a different algorithm.
- **Per-species LoD bracket retune.** Spindle's BACKLOG entry recommended LoD0 15K-200K, LoD1 5K-60K, LoD2 1K-20K as retuned brackets — never landed. If your Lever 6 + Adze's Lever 5 both hit floor on Linden's LoD2 bracket at today's defaults but the simplifier won't go further, the brackets themselves may need bumping. Surface a recommendation; don't ship the retune in 6.3 (scope wall).
- **Spindle Lever 3 deployed-path proof.** Adze's open item — Lever 3's bake-chain firing remains unproven because both republished species ship connected-mesh leaves. If you republish a card-based vendor pack (Robinia family from a different vendor source — see Adze's survey for the version note) during your testing, capture the Lever 3 fire-count + delta in your survey. Closes Adze's doctrine repair.
- **Mobile budget calibration.** Operator flagged 6.3 as mobile-critical. If you have any signal on per-tri mobile fragment cost (e.g., overdraw at 745 placements × LoD2), surface it. Don't profile mobile yourself; just flag if you see anomalies.
- **`positionWeight` exposure.** `MeshoptSimplifier.simplifyWithAttributes` API may or may not expose position-weight separately from `errorTolerance`. Verify in inspection; if not exposed, drop the param from the recommended starting point + surface.
- **Per-leaf-pack tuning.** Some leaf packs may want different params (e.g., serrate vs ovate morphologies have different silhouette characteristics). `decimation-defaults.json#leafDecimation.perBarkRef` is the reserved override slot — name it `perLeafRef` if more natural; structure is up to you, but surface the choice.

## Out of scope

- **Bark decimation** — Adze's Lever 5 territory. Untouched.
- **Card-based leaf decimation** — Spindle's Lever 3 territory. Untouched.
- **Substrate posterization** — Vellum's Brief 10B territory.
- **Authoring UI for per-species decimation overrides** — `perLeafRef` is reserved-but-empty; operator-authoring follow-up if needed.
- **LoD bracket retune** — surface a recommendation, don't ship.
- **Runtime work, shader edits, atlas changes, uniform changes** — bake-time geometry only.
- **Mobile profiling, mobile-specific dispatch logic** — operator's mobile-budget context is motivation, not a deliverable.
- **Cross-species leaf-pack analysis** — out of scope; defaults JSON is enough.

## Dispatch posture

Cold dispatch. Parallel-safe with Vellum's Brief 10B (zero file overlap). Single commit when AC 1-10 pass. Title: `arborist: Salon — Brief 6.3 (<your-name>) — connected-mesh leaf decimation (Lever 6)`.

Per `[[feedback_extras_based_gating_pipeline_stage]]` — your function gates on `extras.atlasKind === 'leaf'`. That tag is stamped by Adze's `stampAtlasKind` in `publish-glb.js` BEFORE Lever 5 runs, BEFORE your Lever 6 will run. Verify on the deployed path; don't assume the chassis-CLI test path generalizes.

— Boz
