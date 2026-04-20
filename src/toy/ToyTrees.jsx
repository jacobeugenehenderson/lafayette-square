import { ParkTrees } from '../components/LafayettePark'
import toyTrees from '../data/toy/toy-trees.json'

/**
 * Toy scene trees — thin wrapper around the real `ParkTrees` component.
 * Passing the `trees` prop bypasses park-polygon filtering (grotto/lake/paths)
 * since the toy fixture is self-contained and hand-placed.
 */
export default function ToyTrees() {
  return <ParkTrees trees={toyTrees.trees} />
}
