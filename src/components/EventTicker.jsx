import { useState, useEffect, useCallback } from 'react'
import { getEvents } from '../lib/api'
import useListings from '../hooks/useListings'
import useEvents from '../hooks/useEvents'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useBulletin from '../hooks/useBulletin'

const ROTATE_INTERVAL = 5000
const POLL_INTERVAL = 300000 // 5 minutes

function getTodayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function filterTodayEvents(allEvents) {
  const today = getTodayStr()
  const filtered = allEvents.filter(e => {
    if (!e.start_date) return false
    const start = e.start_date
    const end = e.end_date || e.start_date
    return start <= today && today <= end
  })
  filtered.forEach(e => {
    const listing = useListings.getState().getById(e.listing_id)
    if (listing) {
      e._venueName = listing.name
      e._buildingId = listing.building_id
    }
  })
  filtered.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  return filtered
}

export default function EventTicker() {
  const [events, setEvents] = useState([])
  const [index, setIndex] = useState(0)

  const showCard = useSelectedBuilding((s) => s.showCard)
  const viewMode = useCamera((s) => s.viewMode)
  const bulletinOpen = useBulletin((s) => s.modalOpen)

  // Read from shared events store (populated by init)
  const storeEvents = useEvents((s) => s.events)
  const storeFetched = useEvents((s) => s.fetched)

  // When the shared store updates, refilter for today
  useEffect(() => {
    if (storeFetched && storeEvents.length > 0) {
      setEvents(filterTodayEvents(storeEvents))
    }
  }, [storeEvents, storeFetched])

  // Poll for fresh events at a much lower frequency (5 min)
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await getEvents()
        const all = Array.isArray(res.data) ? res.data : []
        useEvents.getState().setEvents(all)
      } catch { /* silent */ }
    }
    const id = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [])

  // Simple rotation — advance index every ROTATE_INTERVAL
  useEffect(() => {
    if (events.length < 2) return
    const id = setInterval(() => {
      setIndex(i => (i + 1) % events.length)
    }, ROTATE_INTERVAL)
    return () => clearInterval(id)
  }, [events.length])

  // Open a place card for an event
  const openEvent = useCallback((event) => {
    if (!event.listing_id) return
    const listing = useListings.getState().getById(event.listing_id)
    const buildingId = listing?.building_id || event._buildingId
    useSelectedBuilding.getState().select(event.listing_id, buildingId, 'events')
  }, [])

  if (viewMode !== 'hero') return null
  if (showCard || bulletinOpen) return null
  if (events.length === 0) return null

  const current = events[index % events.length]

  return (
    <div className="absolute top-0 left-0 right-0 z-50 select-none">
      <div
        className="flex items-center px-5 relative"
        style={{
          height: '72px',
          fontFamily: 'ui-monospace, monospace',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 70%, transparent 100%)',
        }}
      >
        {/* Spectral bottom-edge highlight */}
        <div
          className="absolute inset-x-0 bottom-0 h-[1px] pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 80%, transparent 95%)',
          }}
        />

        <button
          onClick={() => openEvent(current)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left h-full"
        >
          <div className="flex-1 min-w-0 relative h-5 overflow-hidden">
            <div
              key={index}
              className="absolute inset-0 flex items-center gap-2 animate-ticker-in"
            >
              <span className="text-label tracking-wide truncate text-white/90">
                {current?.title}
              </span>
              {current?._venueName && (
                <span className="text-label-sm text-white/50 truncate flex-shrink-0">
                  {current._venueName}
                </span>
              )}
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
