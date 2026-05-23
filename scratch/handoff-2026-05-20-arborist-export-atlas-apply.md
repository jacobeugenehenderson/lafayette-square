# Cross-helper handoff: Export atlas-apply helpers from treeAtlasMaterial

**From:** Meteorologist orchestrator
**To:** Arborist coordinator
**Date:** 2026-05-20
**Scope:** Small Arborist-side primitive promotion. ~1 file, ~3 exports. Meteorologist consumes after.

---

## The problem

Meteorologist's CanaryScene renders one hero tree via direct `useGLTF` (per Phase 4a's "place exactly one tree as a scale reference, not a population"). Today the tree renders **white/unlit** — embedded GLB placeholder materials only, none of Arborist's runtime atlas treatment.

The atlas tinting + bark/leaf textures live in `InstancedTrees.jsx`'s local `applyBarkUniforms` function (line ~198 of `src/components/InstancedTrees.jsx`). They're correct + battle-tested but currently **locked inside InstancedTrees** as a private helper, callable only by InstancedTrees itself.

Meteorologist wants to call them too — for one tree, not a population. This is the consume-from-production pattern (memory `feedback_preview_uses_production_pipeline`) rather than re-implementing locally.

## The ask

Export the atlas-apply primitives from `src/components/treeAtlasMaterial.js` (the module where they architecturally belong) so any consumer can apply Arborist's atlas treatment to a freshly-loaded GLB scene.

**Concretely:**

1. **Move `applyBarkUniforms`** from `InstancedTrees.jsx` (~line 198) to `treeAtlasMaterial.js` and `export` it. InstancedTrees imports it from the new home.

2. **Add an `applyAtlasToGltfScene(gltfScene, atlas, species, variantId)` helper** in `treeAtlasMaterial.js` that:
   - Walks the GLTF scene's meshes
   - For each mesh, looks up the per-species + per-variant bark/leaf entry in the atlas
   - Replaces the mesh's material with the atlas material (or wraps the existing one with the bark uniforms)
   - Returns the modified scene (or mutates in place; either's fine)

   The exact shape can mirror what InstancedTrees does internally per-instance. Just packaged as a one-shot for non-instanced consumers.

3. **`useTreeAtlas(lookId)` is already exported** from treeAtlasMaterial.js (line 257) — good, Meteorologist will use it as-is.

## What Meteorologist will do with them

After the export ships, Meteorologist's `HeroTree` becomes roughly:

```jsx
import { useTreeAtlas, applyAtlasToGltfScene } from '../components/treeAtlasMaterial'

function HeroTree({ lookId }) {
  const pref = useCanaryTreePref()
  const species  = pref?.species ?? HERO_TREE_SPECIES
  const variant  = pref?.variantId ?? 1
  const treeLook = pref?.lookId ?? lookId

  const url = `${import.meta.env.BASE_URL}baked/${treeLook}/trees/${species}/skeleton-${variant}-lod0.glb`
  const { scene } = useGLTF(url)
  const atlas = useTreeAtlas(treeLook)

  const treated = useMemo(() => {
    if (!atlas) return scene
    return applyAtlasToGltfScene(scene.clone(), atlas, species, variant)
  }, [scene, atlas, species, variant])

  return <primitive object={treated} position={[0, 0, 0]} />
}
```

That's the entire Meteorologist consumption — one import, one useMemo. The Arborist side is the load-bearing change.

## Scope (your baby's)

- **In:** Refactor `treeAtlasMaterial.js` to export the helpers. InstancedTrees imports from the new home (no behavior change in InstancedTrees). Optional: add a small test that the GLTF-scene flavor produces materials byte-identical to InstancedTrees' instanced application.
- **Out:** Do NOT modify Meteorologist files. The Meteorologist orchestrator handles the consumption side once the export ships.
- **Out:** Do NOT change atlas data formats, bake outputs, or the shader itself. Pure refactor of the runtime application path.

Verification: existing InstancedTrees rendering looks byte-identical to before (regression check); `treeAtlasMaterial.js` now exports `applyBarkUniforms` + `applyAtlasToGltfScene`; module compile clean across all consumers.

## Why this seam

- **Consume-not-fork.** Memory `feedback_preview_uses_production_pipeline` is explicit: authoring tools that need to render production-pipeline output should compose from the same primitives, not maintain parallel paths. Meteorologist's HeroTree currently violates this; the export closes the gap.
- **No new artifact.** This isn't a contract between helpers, it's a code-organization fix within Arborist's own runtime layer. Cleaner than the canary-tree localStorage seam (which IS a contract).
- **Reusable.** Any future single-tree consumer (Preview's GpuPanel-isolated render? Stage's per-species inspector?) gets the same primitive for free.

## Coordination

- **Timing flexible.** Meteorologist's HeroTree currently renders white-but-correct-silhouette + orbit controls let the operator at least navigate around it. Not blocking, but the visible-bug-flag in `HeroTree`'s docblock would close once this ships.
- **No need to coordinate with Meteorologist on shape.** The `applyAtlasToGltfScene` signature is your call — match what feels right with InstancedTrees' internal flow. Meteorologist adapts to whatever you export.
- **Report back to Jacob** when your baby commits; he routes to me + I do the small Meteorologist consumption patch immediately after.

## Memories to flag

- `feedback_preview_uses_production_pipeline` — the doctrine this addresses.
- `feedback_stash_isolate_per_file` (amended) — check both working-tree AND staged state before commit.
- `feedback_baby_must_surface_scope_drift` — disclose any added exports / signature changes / refactors beyond the brief.
