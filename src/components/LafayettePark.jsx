/**
 * LafayettePark — the one town's park, loaded only when that town is showing.
 *
 * Owns: WHEN the park's code and data load. The park itself (water, bridge, fence,
 * title) is `LafayetteParkBody.jsx`, a ruled one-town exception (its header:
 * DEFERRED-TO-PRODUCER). Must never: import the body statically — it carries that
 * town's ribbons, water and park polygon, and a static import put them in every
 * town's bundle (docs/briefs/BRIEF-slab-loading.md ③, 2026-09-27).
 * ▶ node checks/claims-no-town-rides-in-the-bundle.mjs
 *
 * `React.lazy` makes the body its own chunk, fetched on first render. The guard runs
 * first, so no other town ever requests it. The Suspense boundary is local so the
 * canvas never waits on the park.
 */
import { lazy, Suspense } from 'react'

// The park's town — the same guard the body applies itself.
const PARK_TOWN = 'lafayette-square'

const Body = lazy(() => import('./LafayetteParkBody.jsx'))
const Title = lazy(() => import('./LafayetteParkBody.jsx').then(m => ({ default: m.ParkTitle })))

// Guarded on the town being DRAWN (`lookId`, which <Town> passes), not the page's boot town: Stage
// switches towns live, and a park guarded on the boot town followed Lafayette Square into the next one.
export default function LafayettePark({ town, lookId, ...props }) {
  if (lookId !== PARK_TOWN) return null
  return <Suspense fallback={null}><Body town={town} lookId={lookId} {...props} /></Suspense>
}

export function ParkTitle({ town, lookId, ...props }) {
  if (lookId !== PARK_TOWN) return null
  return <Suspense fallback={null}><Title town={town} lookId={lookId} {...props} /></Suspense>
}
