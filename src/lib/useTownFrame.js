/**
 * useTownFrame — THE kit's one way into R3F's frame loop (2026-11-01). Same signature as useFrame(fn, priority).
 *
 * ⛔ WHY: R3F 8 calls every useFrame subscriber in a bare loop (events-*.esm.js#render$1, no try). One throw there skips
 * every later subscriber AND gl.render, and it throws again next frame: the whole canvas freezes, and only the console
 * says so. React never sees it, so no boundary names it and the one sink stays empty.
 *
 * Here a throw stops this subscriber (it is never called again) and goes where a render throw would:
 *   · inside a boundary that handles it (R3FErrorBoundary, DisplayBoundary: they provide FrameBoundary), it is THROWN AT
 *     RENDER, so that boundary refuses or retries it by its own rules, and unmounting the subtree unsubscribes it;
 *   · outside one, it is reported to the one sink (src/lib/failures.js) under the town in TownContext, and the rest of
 *     the canvas keeps drawing. A throw at render there would take the whole canvas down.
 * The error is passed as it was thrown: a Transient stays a Transient (the boundary retries it), a Refusal a Refusal.
 * ▶ node checks/claims-a-refusal-is-never-swallowed.mjs (§9: the only import of R3F's useFrame in src is this file's)
 */
import { useContext, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import useFailures, { reasonOf } from './failures.js'
import { Refusal } from './refusal.js'
import { TownContext } from '../components/townContext.js'
import { FrameBoundary } from './frameBoundary.js'

export function useTownFrame(fn, priority) {
  const inBoundary = useContext(FrameBoundary), town = useContext(TownContext)
  const [failed, setFailed] = useState(null), dead = useRef(false)
  useFrame((state, delta, frame) => {
    if (dead.current) return
    try { fn(state, delta, frame) } catch (error) {
      dead.current = true
      if (inBoundary) { setFailed({ error }); return }
      const reason = reasonOf(error)
      console.error(`[frame] ⛔ a frame callback threw, outside any boundary; it is stopped: ${reason}`)
      useFailures.getState().report({ lookId: town?.lookId ?? null, layer: `frame: ${reason.slice(0, 60)}`,
        kind: error instanceof Refusal ? 'refusal' : 'gave-up', reason: error instanceof Refusal ? reason : `not retried (a frame callback): ${reason}` })
    }
  }, priority)
  if (failed) throw failed.error
}
