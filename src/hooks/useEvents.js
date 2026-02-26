import { create } from 'zustand'

/**
 * Shared events store. Populated by the init call, read by
 * EventTicker and PlaceCard EventsTab.
 */
const useEvents = create((set, get) => ({
  events: [],
  fetched: false,

  setEvents: (events) => set({ events, fetched: true }),

  /** Get events for a specific listing that are currently active */
  getForListing: (listingId) => {
    const now = new Date().toISOString().slice(0, 10)
    return get().events
      .filter(e => e.listing_id === listingId && (e.end_date || e.start_date) >= now)
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  },
}))

export default useEvents
