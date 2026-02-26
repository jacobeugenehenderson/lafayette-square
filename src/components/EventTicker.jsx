import { useState, useEffect, useRef, useCallback } from 'react'
import { getEvents } from '../lib/api'
import useListings from '../hooks/useListings'
import useEvents from '../hooks/useEvents'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useBulletin from '../hooks/useBulletin'

const ROTATE_INTERVAL = 5000
const IDLE_TIMEOUT = 10000
const POLL_INTERVAL = 300000 // 5 minutes (down from 60s)

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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [displayIndex, setDisplayIndex] = useState(0)

  const idleTimer = useRef(null)
  const rotateTimer = useRef(null)

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

  // Rotation timer for 2+ events
  useEffect(() => {
    if (events.length < 2) return
    rotateTimer.current = setInterval(() => {
      setTransitioning(true)
      setTimeout(() => {
        setCurrentIndex(i => {
          const next = (i + 1) % events.length
          setDisplayIndex(next)
          return next
        })
        setTimeout(() => setTransitioning(false), 50)
      }, 300)
    }, ROTATE_INTERVAL)
    return () => clearInterval(rotateTimer.current)
  }, [events.length])

  // Idle auto-hide (desktop only — no reason to hide on mobile)
  const isPointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
  const resetIdle = useCallback(() => {
    setVisible(true)
    clearTimeout(idleTimer.current)
    if (isPointer) {
      idleTimer.current = setTimeout(() => setVisible(false), IDLE_TIMEOUT)
    }
  }, [isPointer])

  useEffect(() => {
    resetIdle()
    if (!isPointer) return
    window.addEventListener('mousemove', resetIdle)
    return () => {
      window.removeEventListener('mousemove', resetIdle)
      clearTimeout(idleTimer.current)
    }
  }, [resetIdle, isPointer])

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

  const current = events[displayIndex] || events[0]

  return (
    <div
      className="absolute top-0 left-0 right-0 z-50 select-none"
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 600ms ease',
      }}
    >
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

        {/* Event headline — left side */}
        {events.length > 0 ? (
          <button
            onClick={() => openEvent(current)}
            className="flex-1 min-w-0 flex items-center gap-2 text-left h-full"
          >
            <div className="flex-1 min-w-0 relative h-5 overflow-hidden">
              {events.length <= 1 ? (
                <div className="absolute inset-0 flex items-center gap-2">
                  <span className="text-[11px] text-white/70 tracking-wide truncate">{current?.title}</span>
                  {current?._venueName && (
                    <span className="text-[10px] text-white/35 truncate flex-shrink-0">
                      {current._venueName}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <div
                    className="absolute inset-0 flex items-center gap-2"
                    style={{
                      opacity: transitioning ? 0 : 1,
                      transform: transitioning ? 'translateY(-10px)' : 'translateY(0)',
                      transition: 'opacity 600ms ease, transform 600ms ease',
                    }}
                  >
                    <span className="text-[11px] text-white/70 tracking-wide truncate">{current?.title}</span>
                    {current?._venueName && (
                      <span className="text-[10px] text-white/35 truncate flex-shrink-0">
                        {current._venueName}
                      </span>
                    )}
                  </div>
                  <div
                    className="absolute inset-0 flex items-center gap-2"
                    style={{
                      opacity: transitioning ? 1 : 0,
                      transform: transitioning ? 'translateY(0)' : 'translateY(10px)',
                      transition: 'opacity 600ms ease, transform 600ms ease',
                    }}
                  >
                    {(() => {
                      const next = events[(displayIndex + 1) % events.length]
                      return (
                        <>
                          <span className="text-[11px] text-white/70 tracking-wide truncate">{next?.title}</span>
                          {next?._venueName && (
                            <span className="text-[10px] text-white/35 truncate flex-shrink-0">
                              {next._venueName}
                            </span>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </>
              )}
            </div>
          </button>
        ) : (
          <div className="flex-1" />
        )}

      </div>
    </div>
  )
}
