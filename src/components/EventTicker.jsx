import { useState, useEffect, useRef, useCallback } from 'react'
import { getEvents } from '../lib/api'
import useListings from '../hooks/useListings'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useBulletin from '../hooks/useBulletin'

const ROTATE_INTERVAL = 5000
const IDLE_TIMEOUT = 10000
const POLL_INTERVAL = 60000

function getTodayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export default function EventTicker() {
  const [events, setEvents] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [displayIndex, setDisplayIndex] = useState(0)
  const [fetchState, setFetchState] = useState('pending') // pending | ok | error

  const idleTimer = useRef(null)
  const rotateTimer = useRef(null)

  const showCard = useSelectedBuilding((s) => s.showCard)
  const viewMode = useCamera((s) => s.viewMode)
  const bulletinOpen = useBulletin((s) => s.modalOpen)

  // Fetch and filter today's events
  const fetchTodayEvents = useCallback(async () => {
    try {
      const res = await getEvents()
      const all = Array.isArray(res.data) ? res.data : []
      const today = getTodayStr()
      const filtered = all.filter(e => {
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
      setEvents(filtered)
      setFetchState(filtered.length > 0 ? 'ok' : `empty (${all.length} total, today=${today}, keys=${Object.keys(res).join(',')})`)
    } catch (err) {
      setFetchState('error:' + (err?.message || 'unknown'))
    }
  }, [])

  useEffect(() => {
    fetchTodayEvents()
    // Retry after 10s in case first fetch fails under mobile load
    const retry = setTimeout(fetchTodayEvents, 10000)
    const id = setInterval(fetchTodayEvents, POLL_INTERVAL)
    return () => { clearTimeout(retry); clearInterval(id) }
  }, [fetchTodayEvents])

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

  // Idle auto-hide
  const resetIdle = useCallback(() => {
    setVisible(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setVisible(false), IDLE_TIMEOUT)
  }, [])

  useEffect(() => {
    resetIdle()
    window.addEventListener('mousemove', resetIdle)
    window.addEventListener('touchstart', resetIdle)
    return () => {
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('touchstart', resetIdle)
      clearTimeout(idleTimer.current)
    }
  }, [resetIdle])

  // Open a place card for an event
  const openEvent = useCallback((event) => {
    if (!event.listing_id) return
    const listing = useListings.getState().getById(event.listing_id)
    const buildingId = listing?.building_id || event._buildingId
    useSelectedBuilding.getState().select(event.listing_id, buildingId)
  }, [])

  if (viewMode !== 'hero') return null
  if (showCard || bulletinOpen) return null

  // Temporary diagnostic — shows fetch state when no events load
  if (events.length === 0) {
    if (fetchState === 'pending') return null
    return (
      <div className="absolute top-4 left-4 z-50 text-sm text-red-400 font-mono bg-black/70 px-3 py-2 rounded">
        ticker: {fetchState}
      </div>
    )
  }

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
