import { create } from 'zustand'
import { loadInstanceData } from '../data/loadInstanceData.js'
import { INSTANCE } from '../instance.js'

// Seed events load via the installation-data seam. LS's seed set is empty ([]),
// so this is byte-identical ([] → []); a different install ships its own.
let _seedEvents = []
loadInstanceData(INSTANCE.lookId, 'seedEvents').ready.then(v => {
  _seedEvents = Array.isArray(v) ? v : []
  const s = useEvents.getState()
  if (!s.fetched && s.events.length === 0 && _seedEvents.length > 0) {
    useEvents.setState({ events: _seedEvents })
  }
})

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Check if an event is active on a given date/time.
 * @param {object} e        – event object
 * @param {string} dateStr  – YYYY-MM-DD
 * @param {string} [timeStr] – HH:MM (24h), omit to skip time check
 */
export function isActiveEvent(e, dateStr, timeStr) {
  const start = e.start_date
  const end = e.end_date || e.start_date
  if (!start || end < dateStr || start > dateStr) return false

  // Day-of-week check for recurring events
  if (e.type === 'recurring') {
    const dayIndex = new Date(dateStr + 'T12:00:00').getDay()
    const todayDow = DAY_NAMES[dayIndex]
    if (e.recurrence === 'weekly' && e.day_of_week && e.day_of_week !== todayDow) return false
    // daily recurrence passes through (no day check needed)
  }

  // Time-of-day check (only when timeStr provided and event has times)
  if (timeStr && e.start_time && e.end_time) {
    if (timeStr < e.start_time || timeStr >= e.end_time) return false
  }

  return true
}

/**
 * Shared events store. Populated by the init call, read by
 * EventTicker and PlaceCard EventsTab.
 * Falls back to bundled seed events when API has none.
 */
const useEvents = create((set, get) => ({
  events: [],
  fetched: false,

  setEvents: (events) => set({
    events: events.length > 0 ? events : _seedEvents,
    fetched: true,
  }),

  /** Get events for a specific listing that are currently active */
  getForListing: (listingId) => {
    const now = new Date().toISOString().slice(0, 10)
    return get().events
      .filter(e => e.listing_id === listingId && isActiveEvent(e, now))
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  },
}))

export default useEvents
