/**
 * TownContext — what <Town> hands its leaves: the shot, the selection, the listings. Props in, by context.
 *
 * ⭐ WHY (BRIEF-renderer-leaves-take-props, 2026-09-28). The leaves used to read the old player's stores
 * (useCamera for the shot, useSelectedBuilding for the selection, useListings for neon's hours), and a bridge
 * copied <Town>'s props into those stores. Now <Town> PROVIDES them and the leaves read this; no player store is
 * in the renderer. ▶ node checks/claims-the-town-reads-no-player-store.mjs
 *
 * A piece mounted OUTSIDE <Town> (a sky-only canvas, the surface lab) has no town context: it draws the movie
 * shot — the camera store's own default before this — with no selection and no listings. That is the
 * harness's state, not a stand-in for a town.
 */
import { createContext, createElement, useContext } from 'react'

export const TownContext = createContext(null)

const NO_TOWN = Object.freeze({ shotKey: 'hero', selectedId: null, select: null, listings: [] })

/** Provides a town's context: mounted by <Town>, and by Stage's hand-assembly for Lafayette Square (⏳ retint brief). */
export function TownScope({ value, children }) {
  if (!value || !['hero', 'browse', 'street'].includes(value.shotKey)) throw new Error(`[TownScope] ⛔ needs a shotKey ('hero' | 'browse' | 'street'); got ${value?.shotKey}`)
  if (!Array.isArray(value.listings)) throw new Error('[TownScope] ⛔ needs `listings` — an array (the town\'s content listings)')
  return createElement(TownContext.Provider, { value }, children)
}

/** { shotKey, selectedId, select(id|null) | null, listings } — the town's, or NO_TOWN outside <Town>. */
export function useTownContext() { return useContext(TownContext) ?? NO_TOWN }
/** The shot key the town is drawn in: 'hero' | 'browse' | 'street' (per-shot looks are keyed by it). */
export function useTownShot() { return useTownContext().shotKey }

// <Town shot> → the shot key (the vocabulary per-shot looks are keyed by: useSceneJson's forks).
export const SHOT_KEY = { movie: 'hero', plan: 'browse', street: 'street' }
