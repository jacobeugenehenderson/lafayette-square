import { create } from 'zustand'
import seedEvents from '../data/seedEvents.json'

/**
 * Shared events store. Populated by the init call, read by
 * EventTicker and PlaceCard EventsTab.
 * Falls back to bundled seed events when API has none.
 */
const useEvents = create((set, get) => ({
  events: seedEvents,
  fetched: false,

  setEvents: (events) => set({
    events: events.length > 0 ? events : seedEvents,
    fetched: true,
  }),

  /** Get events for a specific listing that are currently active */
  getForListing: (listingId) => {
    const now = new Date().toISOString().slice(0, 10)
    return get().events
      .filter(e => e.listing_id === listingId && (e.end_date || e.start_date) >= now)
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  },
}))

export default useEvents
