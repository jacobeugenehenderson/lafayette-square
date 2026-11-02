// FocusMatteOrder — keeps every mesh under a set-piece's focus node (`focus:<id>`: the hero and every display hung on it)
// drawing after its town's environment (src/lib/drawOrder.js). ⭐ AN ENFORCER, EVERY FRAME, not a one-time pass and not
// per-display wiring: a display that mounts after the node (the Light Show, once its drawer has loaded) or one written next
// year is covered with nothing asked of its author. The walk is the node's own subtree and writes only on a change.
// Not-yet (the town's ground has not loaded) does nothing, silently; a ground the order cannot be derived from is a refusal
// in the kit's one failure sink (src/lib/failures.js, layer `focus-matte`), cleared when a good ground lands.
// ▶ node checks/claims-the-focus-matte-draws-after-the-environment.mjs --mutants
import { useRef } from 'react'
import { useTownFrame } from '../lib/useTownFrame.js'
import { matteOrderFor, enforceMatteOrder } from '../lib/drawOrder.js'
import useFailures from '../lib/failures.js'

export const MATTE_LAYER = 'focus-matte'

export default function FocusMatteOrder({ lookId, name }) {
  const node = useRef(null), refused = useRef(null)
  useTownFrame((state) => {
    if (!node.current || !node.current.parent) node.current = state.scene.getObjectByName(name) || null
    const r = matteOrderFor(lookId)
    if (r.state === 'not-yet') return
    if (r.state === 'refused') {
      if (refused.current !== r.reason) { refused.current = r.reason; useFailures.getState().report({ lookId, layer: MATTE_LAYER, kind: 'refusal', reason: r.reason }) }
      return
    }
    if (refused.current) { refused.current = null; useFailures.getState().clear(lookId, MATTE_LAYER) }
    if (node.current) enforceMatteOrder(node.current, r.order)
  }, undefined, 'focus matte order')
  return null
}
