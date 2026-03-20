import { useState, useEffect, useCallback } from 'react'
import { getEvents } from '../lib/api'
import useListings from '../hooks/useListings'
import useEvents, { isActiveEvent } from '../hooks/useEvents'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useBulletin from '../hooks/useBulletin'
import { useCourierDash } from './CourierDashboard'
import { useContact } from './ContactModal'
import { useCodeDesk } from './CodeDeskModal'
import { useInfo } from './InfoModal'

const ROTATE_INTERVAL = 5000
const POLL_INTERVAL = 300000 // 5 minutes
const REFILTER_INTERVAL = 60000 // re-check clock every minute

function getNow() {
  const d = new Date()
  const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  return { date, time }
}

/**
 * Filter events to what's active right now, then deduplicate by listing.
 * When multiple events match for the same listing, latest start_time wins
 * (the most recently started thing is the most current).
 * Events without start_time are treated as all-day fallbacks.
 */
function filterCurrentEvents(allEvents) {
  const { date, time } = getNow()

  // 1. Filter to events active right now (date + time aware)
  const active = allEvents.filter(e => isActiveEvent(e, date, time))

  // 2. Attach venue info
  active.forEach(e => {
    const listing = useListings.getState().getById(e.listing_id)
    if (listing) {
      e._venueName = listing.name
      e._buildingId = listing.building_id
    }
  })

  // 3. Deduplicate: one entry per listing, latest start_time wins
  const byListing = new Map()
  for (const e of active) {
    const lid = e.listing_id
    const existing = byListing.get(lid)
    if (!existing) {
      byListing.set(lid, e)
    } else {
      // Latest start_time wins; timed events always beat untimed
      const eTime = e.start_time || ''
      const exTime = existing.start_time || ''
      if (eTime > exTime) byListing.set(lid, e)
    }
  }

  return Array.from(byListing.values())
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

  // When the shared store updates, refilter for right now
  useEffect(() => {
    if (storeFetched && storeEvents.length > 0) {
      setEvents(filterCurrentEvents(storeEvents))
    }
  }, [storeEvents, storeFetched])

  // Re-check the clock every minute so events rotate in/out on time
  useEffect(() => {
    const id = setInterval(() => {
      const all = useEvents.getState().events
      if (all.length > 0) setEvents(filterCurrentEvents(all))
    }, REFILTER_INTERVAL)
    return () => clearInterval(id)
  }, [])

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
    useSelectedBuilding.getState().select(event.listing_id, buildingId, 'ticker')
  }, [])

  const courierOpen = useCourierDash(s => s.open)
  const contactOpen = useContact(s => s.open)
  const codeDeskOpen = useCodeDesk(s => s.open)
  const infoOpen = useInfo(s => s.open)

  if (viewMode !== 'hero') return null
  if (showCard || bulletinOpen || courierOpen || contactOpen || codeDeskOpen || infoOpen) return null
  if (events.length === 0) return null

  const current = events[index % events.length]

  return (
    <div className="absolute top-0 left-0 right-0 z-50 select-none">
      <div
        className="flex items-center px-5 relative h-[72px] font-mono"
        style={{
          background: 'linear-gradient(180deg, var(--surface-glass) 0%, transparent 100%)',
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
              key={`${current?.id || current?.listing_id || ''}-${index}`}
              className="absolute inset-0 flex items-center gap-2 animate-ticker-in"
            >
              <span className="text-label tracking-wide truncate text-on-surface">
                {current?.title}
              </span>
              {current?._venueName && (
                <span className="text-label-sm text-on-surface-variant truncate flex-shrink-0">
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
