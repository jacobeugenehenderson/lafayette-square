import InstancedTrees from '../components/InstancedTrees'
import { ASSET_BASE } from '../lib/bakedUrl.js'

/**
 * Toy scene trees — uses the real arborist pipeline. Placements come from
 * src/data/toy/toy-trees.json, baked to <ASSET_BASE>baked/toy/trees.json. Atlas +
 * UV-rewritten GLBs are shared with the lafayette-square Look.
 *
 * Re-bake with:
 *   node arborist/bake-trees.js --scene toy \
 *     --placements src/data/toy/toy-trees.json --styles realistic --lod lod2
 *
 * This is the clearest statement of the two axes in the codebase: the
 * placements are the TOY scene's, the Look is lafayette-square's. bakeUrl is
 * explicit precisely because scene ≠ look here — everywhere else they coincide
 * and the Look's own placements are right.
 */
export default function ToyTrees() {
  return <InstancedTrees bakeUrl={`${ASSET_BASE}baked/toy/trees.json`} lookId="lafayette-square" />
}
