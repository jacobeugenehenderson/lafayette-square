import { useState, useEffect, useCallback, useMemo } from 'react'
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
import useTimeOfDay from '../hooks/useTimeOfDay'
import useGuardianStatus from '../hooks/useGuardianStatus'

const ROTATE_INTERVAL = 5000
const POLL_INTERVAL = 300000 // 5 minutes
const REFILTER_INTERVAL = 60000 // re-check clock every minute

const DAY_ABBREVS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const MENU_DISPLAY = {
  dinner: 'Dinner',
  lunch: 'Lunch',
  brunch: 'Brunch',
  happy_hour: 'Happy Hour',
  specials: 'Specials',
  drinks: 'Drinks',
  dessert: 'Dessert',
  market: 'Market',
}

/**
 * Build ticker entries from two sources:
 * 1. Menu schedules — auto-generated, white text ("The Bellwether — Happy Hour")
 * 2. Manual events — guardian-posted, yellow text ("Kyle is bartending tonight")
 *
 * One entry per listing. Manual events override schedule entries.
 * Latest start_time wins when multiple things overlap.
 */
function buildTickerEntries(allListings, allEvents, clockTime) {
  const now = clockTime || new Date()
  const dayAbbrev = DAY_ABBREVS[now.getDay()]
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')

  const entries = new Map() // listing_id -> ticker entry

  // 1. Schedule-derived entries (white text)
  allListings.forEach(listing => {
    const schedule = listing.menu?.schedule
    if (!schedule) return

    // Find the active menu with the latest start time
    let bestMenu = null
    let bestStart = ''
    for (const [menuKey, daySched] of Object.entries(schedule)) {
      const todaySlot = daySched[dayAbbrev]
      if (todaySlot && todaySlot.start && todaySlot.end && timeStr >= todaySlot.start && timeStr < todaySlot.end) {
        if (todaySlot.start > bestStart) {
          bestMenu = menuKey
          bestStart = todaySlot.start
        }
      }
    }

    if (bestMenu) {
      const label = MENU_DISPLAY[bestMenu] || bestMenu.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const slot = schedule[bestMenu][dayAbbrev]
      const endTime = slot.end
      // Format end time for display: "17:00" → "5pm", "14:00" → "2pm"
      const [eh, em] = endTime.split(':').map(Number)
      const endSuffix = eh >= 12 ? 'pm' : 'am'
      const endHr = eh === 0 ? 12 : eh > 12 ? eh - 12 : eh
      const endDisplay = em === 0 ? `${endHr}${endSuffix}` : `${endHr}:${String(em).padStart(2, '0')}${endSuffix}`

      const tagline = listing.menu?.taglines?.[bestMenu] || `Serving ${label.toLowerCase()}`
      entries.set(listing.id, {
        listing_id: listing.id,
        title: tagline,
        _time: `until ${endDisplay}`,
        _venueName: listing.name,
        _buildingId: listing.building_id,
        _source: 'schedule',
        _startTime: bestStart,
      })
    }
  })

  // 2. Manual events (yellow text) — override schedule entries
  allEvents.forEach(e => {
    if (!isActiveEvent(e, dateStr, timeStr)) return
    const listing = useListings.getState().getById(e.listing_id)
    const existing = entries.get(e.listing_id)

    const entry = {
      listing_id: e.listing_id,
      title: e.title,
      description: e.description,
      _venueName: listing?.name || '',
      _buildingId: listing?.building_id || e._buildingId,
      _source: 'event',
      _startTime: e.start_time || '',
    }

    if (!existing) {
      entries.set(e.listing_id, entry)
    } else if (existing._source === 'schedule') {
      // Manual event always overrides schedule
      entries.set(e.listing_id, entry)
    } else {
      // Two manual events — latest start_time wins
      if ((e.start_time || '') > (existing._startTime || '')) {
        entries.set(e.listing_id, entry)
      }
    }
  })

  return Array.from(entries.values())
}

export default function EventTicker() {
  const [tickerItems, setTickerItems] = useState([])
  const [index, setIndex] = useState(0)

  const showCard = useSelectedBuilding((s) => s.showCard)
  const viewMode = useCamera((s) => s.viewMode)
  const bulletinOpen = useBulletin((s) => s.modalOpen)

  const storeEvents = useEvents((s) => s.events)
  const storeFetched = useEvents((s) => s.fetched)
  const listings = useListings((s) => s.listings)
  const isAdmin = useGuardianStatus((s) => s.isAdmin)
  const simTime = useTimeOfDay((s) => s.currentTime)
  const isLive = useTimeOfDay((s) => s.isLive)

  // Admin scrubbing time → use simulated time; everyone else → real time
  const clockTime = isAdmin && !isLive ? simTime : null

  // Build ticker entries from schedules + events
  const rebuild = useCallback(() => {
    if (!listings.length) return
    setTickerItems(buildTickerEntries(listings, storeEvents, clockTime))
  }, [listings, storeEvents, clockTime])

  useEffect(() => { rebuild() }, [rebuild])

  // Re-check the clock every minute (only matters when live)
  useEffect(() => {
    if (clockTime) return // admin is scrubbing — rebuild is driven by simTime changes
    const id = setInterval(rebuild, REFILTER_INTERVAL)
    return () => clearInterval(id)
  }, [rebuild, clockTime])

  // Poll for fresh events
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

  // Rotate
  useEffect(() => {
    if (tickerItems.length < 2) return
    const id = setInterval(() => {
      setIndex(i => (i + 1) % tickerItems.length)
    }, ROTATE_INTERVAL)
    return () => clearInterval(id)
  }, [tickerItems.length])

  const openEvent = useCallback((item) => {
    if (!item.listing_id) return
    const listing = useListings.getState().getById(item.listing_id)
    const buildingId = listing?.building_id || item._buildingId
    useSelectedBuilding.getState().select(item.listing_id, buildingId, item._source === 'event' ? 'ticker' : 'menu')
  }, [])

  const courierOpen = useCourierDash(s => s.open)
  const contactOpen = useContact(s => s.open)
  const codeDeskOpen = useCodeDesk(s => s.open)
  const infoOpen = useInfo(s => s.open)

  if (viewMode !== 'hero') return null
  if (showCard || bulletinOpen || courierOpen || contactOpen || codeDeskOpen || infoOpen) return null
  if (tickerItems.length === 0) return null

  const current = tickerItems[index % tickerItems.length]
  const isEvent = current?._source === 'event'

  return (
    <div className="absolute top-0 left-0 right-0 z-50 select-none">
      <div
        className="flex items-center pl-5 pr-16 relative font-mono"
        style={{
          height: 'calc(env(safe-area-inset-top, 0px) + 82px)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'linear-gradient(90deg, rgba(0,0,0,0.45) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.45) 100%)',
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
          className="flex-1 min-w-0 flex items-center text-left h-full"
        >
          <div
            key={`${current?.listing_id || ''}-${index}`}
            className="flex-1 min-w-0 animate-ticker-in space-y-0.5"
          >
            {current?._venueName && (
              <p className={`text-label tracking-wide truncate ${isEvent ? 'text-amber-300' : 'text-on-surface'}`}>
                {current._venueName}
              </p>
            )}
            <p className={`text-label-sm truncate ${isEvent ? 'text-amber-300/70' : 'text-on-surface-variant'}`}>
              {current?.title}
            </p>
            {current?._time && (
              <p className="text-caption text-on-surface-subtle truncate">
                {current._time}
              </p>
            )}
          </div>
        </button>
      </div>
    </div>
  )
}
