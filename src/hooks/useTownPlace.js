/** The town's place (src/lib/townPlace.js), re-rendering when it moves. Throws until placed, like townPlace(). */
import { useSyncExternalStore } from 'react'
import { townPlace, onPlaceMoved } from '../lib/townPlace.js'

export default function useTownPlace() { return useSyncExternalStore(onPlaceMoved, townPlace) }
