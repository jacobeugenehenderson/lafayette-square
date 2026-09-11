import { create } from 'zustand'
import { supabase, supabaseConfigured } from '../lib/supabase'

/**
 * Commercial state for a listing — the price of record, availability, and
 * whether the restaurant is taking orders at all (migration 018).
 *
 * ⭐ This store deliberately carries NO menu content. The menu is Ward content
 * and arrives through `useListings`; this is the narrow commercial half that
 * Cary owns, joined onto it by the stable item id from `menuIdentity.js`.
 * Keeping them apart is what makes "one owner per field" true rather than
 * aspirational — there is no column here that could shadow a menu item's name.
 *
 * ⛔ THREE STATES, NEVER TWO. `loaded` is not the negation of `loading`:
 *
 *   unconfigured  — no Supabase for this installation (a town running the Ward
 *                   with delivery off). Nothing is sellable, and the reason is
 *                   "ordering isn't set up here", not "the kitchen is out".
 *   error         — we asked and could not find out. Also not sellable. ⛔ This
 *                   must never collapse into "no rows": the stub answers a
 *                   missing database with `{ data: null }`, so an absent answer
 *                   and an empty answer look identical unless we keep them apart.
 *   loaded        — we know. Items with no row are UNCONFIRMED, which is a real
 *                   verdict rather than a gap.
 *
 * Only `loaded` permits a sale, so every failure mode fails closed by default
 * rather than by remembering to check.
 */
const useCommerce = create((set, get) => ({
  /** listingId -> { status, place, rows: Map<itemId, row>, error, at } */
  byListing: {},

  /**
   * Fetch commercial state for one listing. Safe to call repeatedly — an
   * in-flight or recent fetch for the same listing is not duplicated.
   */
  load: async (listingId) => {
    if (!listingId) return
    const existing = get().byListing[listingId]
    if (existing?.status === 'loading') return
    if (existing?.status === 'loaded' && Date.now() - existing.at < 30_000) return

    if (!supabaseConfigured) {
      set(s => ({ byListing: { ...s.byListing, [listingId]: { status: 'unconfigured', rows: new Map(), place: null, at: Date.now() } } }))
      return
    }

    set(s => ({ byListing: { ...s.byListing, [listingId]: { ...(s.byListing[listingId] || {}), status: 'loading' } } }))

    try {
      const [itemsRes, placeRes] = await Promise.all([
        supabase.from('commerce_items').select('item_id, price_cents, available, confirmed_at').eq('listing_id', listingId),
        supabase.from('commerce_places').select('ordering_paused, min_order_cents, tax_remitter').eq('listing_id', listingId).maybeSingle(),
      ])

      // ⛔ An error is reported, never swallowed into an empty result. "We could
      // not ask" and "the answer is none" are the two sentences this store
      // exists to keep apart.
      if (itemsRes?.error || placeRes?.error) {
        const error = itemsRes?.error?.message || placeRes?.error?.message || 'unknown'
        console.error('[commerce] could not load commercial state for', listingId, '—', error)
        set(s => ({ byListing: { ...s.byListing, [listingId]: { status: 'error', error, rows: new Map(), place: null, at: Date.now() } } }))
        return
      }

      const rows = new Map()
      for (const r of itemsRes?.data || []) rows.set(r.item_id, r)

      set(s => ({
        byListing: {
          ...s.byListing,
          [listingId]: { status: 'loaded', rows, place: placeRes?.data || null, error: null, at: Date.now() },
        },
      }))
    } catch (e) {
      console.error('[commerce] load threw for', listingId, '—', e?.message)
      set(s => ({ byListing: { ...s.byListing, [listingId]: { status: 'error', error: e?.message || 'threw', rows: new Map(), place: null, at: Date.now() } } }))
    }
  },
}))

/** The commercial state for one listing, in the shape the predicate wants. */
export function useListingCommerce(listingId) {
  const entry = useCommerce(s => (listingId ? s.byListing[listingId] : undefined))
  return {
    status: entry?.status || 'idle',
    // ⭐ The single gate every sale passes. Anything other than a completed load
    // is not a sale — including "still loading" and "we asked and it broke".
    commerceLoaded: entry?.status === 'loaded',
    rows: entry?.rows || EMPTY_ROWS,
    place: entry?.place || null,
    error: entry?.error || null,
  }
}

const EMPTY_ROWS = new Map()

export default useCommerce
