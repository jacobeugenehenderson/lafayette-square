/**
 * FrameBoundary — true inside a boundary that takes a frame callback's throw rethrown at render (R3FErrorBoundary,
 * DisplayBoundary provide it). Read by src/lib/useTownFrame.js: inside one a frame throw goes to that boundary; outside,
 * to the one sink. Its own module so a boundary can provide it without importing R3F.
 */
import { createContext } from 'react'

export const FrameBoundary = createContext(false)
