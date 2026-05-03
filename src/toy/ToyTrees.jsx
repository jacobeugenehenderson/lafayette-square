import InstancedTrees from '../components/InstancedTrees'

/**
 * Toy scene trees — uses the real arborist pipeline. Placements come from
 * src/data/toy/toy-trees.json, baked to /baked/toy.json. Atlas + UV-rewritten
 * GLBs are shared with the lafayette-square Look (same global tree pool).
 *
 * Re-bake with:
 *   node arborist/bake-trees.js --look toy \
 *     --placements src/data/toy/toy-trees.json --styles realistic --lod lod2
 */
export default function ToyTrees() {
  return <InstancedTrees bakeUrl="/baked/toy.json" lookId="lafayette-square" />
}
