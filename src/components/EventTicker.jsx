import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import { useGlassSearch, SearchDropdown } from './GlassSearch'

const ROTATE_INTERVAL = 8000

/** Text line that scrolls horizontally to reveal overflow, then holds. */
function ScrollLine({ children, className, tickKey }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [overflow, setOverflow] = useState(0)

  useEffect(() => {
    // Brief delay so layout has settled after the ticker-in animation starts
    const t = setTimeout(() => {
      const outer = outerRef.current
      const inner = innerRef.current
      if (!outer || !inner) return
      const diff = inner.scrollWidth - outer.clientWidth
      setOverflow(diff > 2 ? diff + 8 : 0)
    }, 50)
    return () => clearTimeout(t)
  }, [tickKey])

  return (
    <div ref={outerRef} className="overflow-hidden whitespace-nowrap">
      <span
        key={tickKey}
        ref={innerRef}
        className={`inline-block ${className}`}
        style={overflow ? {
          animation: `ticker-scroll ${ROTATE_INTERVAL}ms ease-in-out`,
          '--scroll-x': `${-overflow}px`,
        } : undefined}
      >
        {children}
      </span>
    </div>
  )
}
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
 * Build ticker entries from three sources:
 * 1. Menu schedules — auto-generated, white text ("The Bellwether — Happy Hour")
 * 2. Open-now taglines — first sentence of description for open listings without menus
 * 3. Manual events — guardian-posted, yellow text ("Kyle is bartending tonight")
 *
 * One entry per listing. Manual events override all; schedules override taglines.
 */
const _DAYS_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
function _isOpenNow(hours, now) {
  if (!hours) return false
  const day = _DAYS_FULL[now.getDay()]
  const slot = hours[day]
  if (!slot || !slot.open || !slot.close) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  const [oh, om] = slot.open.split(':').map(Number)
  const [ch, cm] = slot.close.split(':').map(Number)
  return mins >= oh * 60 + om && mins < ch * 60 + cm
}
const TAGLINE_MAX = 80
function _firstSentence(text) {
  if (!text) return null
  const match = text.match(/^[^.!?]+[.!?]/)
  if (!match) return null
  const sentence = match[0].trim()
  if (sentence.length <= TAGLINE_MAX) return sentence
  return sentence.slice(0, TAGLINE_MAX).replace(/\s+\S*$/, '') + '\u2026'
}
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

  // 2. Open-now taglines — first sentence of description, lowest priority
  //    Excluded: residential, community, parks, historic (not useful ticker content)
  const TICKER_EXCLUDED = new Set(['residential', 'community', 'parks', 'historic'])
  allListings.forEach(listing => {
    if (entries.has(listing.id)) return // already has a schedule entry
    if (!listing.hours || TICKER_EXCLUDED.has(listing.category)) return
    if (!_isOpenNow(listing.hours, now)) return
    const tagline = listing.tagline || _firstSentence(listing.description)
    if (!tagline) return
    const slot = listing.hours[_DAYS_FULL[now.getDay()]]
    const [eh, em] = slot.close.split(':').map(Number)
    const endSuffix = eh >= 12 ? 'pm' : 'am'
    const endHr = eh === 0 ? 12 : eh > 12 ? eh - 12 : eh
    const endDisplay = em === 0 ? `${endHr}${endSuffix}` : `${endHr}:${String(em).padStart(2, '0')}${endSuffix}`
    entries.set(listing.id, {
      listing_id: listing.id,
      title: tagline,
      _time: `until ${endDisplay}`,
      _venueName: listing.name,
      _buildingId: listing.building_id,
      _source: 'tagline',
      _startTime: slot.open,
    })
  })

  // 3. Manual events (yellow text) — override all other entries
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
    } else if (existing._source !== 'event') {
      // Manual event overrides schedule and tagline entries
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

  const viewMode = useCamera(s => s.viewMode)
  const isBrowse = viewMode === 'browse'

  if (viewMode === 'planetarium') return null
  const panelFull = useCamera(s => s.panelState) === 'full'
  if (showCard || bulletinOpen || courierOpen || contactOpen || codeDeskOpen || infoOpen || panelFull) return null
  if (tickerItems.length === 0) return null

  const current = tickerItems[index % tickerItems.length]
  const isEvent = current?._source === 'event'

  return (
    <div className="absolute top-0 left-0 right-0 z-50 select-none">
      <div
        className="flex items-stretch relative font-mono"
        style={{
          height: 'calc(env(safe-area-inset-top, 0px) + 82px)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        {/* Left zone — ticker (dark glass) */}
        <div
          className="flex-1 min-w-0 flex items-center pl-5 pr-4"
          style={{
            background: isBrowse
              ? 'rgba(20,14,10,0.85)'
              : 'rgba(0,0,0,0.45)',
          }}
        >
          <button
            onClick={() => openEvent(current)}
            className="flex-1 min-w-0 flex items-center text-left h-full"
          >
            <div
              key={`${current?.listing_id || ''}-${index}`}
              className="flex-1 min-w-0 animate-ticker-in space-y-0.5"
            >
              {current?._venueName && (
                <ScrollLine tickKey={`v-${index}`} className={`text-label tracking-wide ${isEvent ? 'text-amber-300' : 'text-on-surface'}`}>
                  {current._venueName}
                </ScrollLine>
              )}
              <ScrollLine tickKey={`t-${index}`} className={`text-label-sm ${isEvent ? 'text-amber-300/70' : 'text-on-surface-variant'}`}>
                {current?.title}
              </ScrollLine>
              {current?._time && (
                <p className="text-caption text-on-surface-subtle">
                  {current._time}
                </p>
              )}
            </div>
          </button>
        </div>
        {/* Right zone — button area (light glass, sky visible) */}
        <div
          style={{
            width: '80px',
            background: isBrowse
              ? 'rgba(20,14,10,0.5)'
              : 'rgba(0,0,0,0.15)',
          }}
        />
        {/* Bottom edge highlight */}
        <div
          className="absolute inset-x-0 bottom-0 h-[1px] pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 80%, transparent 95%)',
          }}
        />
      </div>

      {/* ── Search drawer — pulldown from ticker ── */}
      <SearchDrawer />
    </div>
  )
}

// ── Search Drawer (pulldown behind ticker) ────────────────────────────
const DRAG_THRESHOLD = 40
const DRAG_CLAMP = 200

function SearchDrawer() {
  const [open, setOpen] = useState(false)
  const panelState = useCamera(s => s.panelState)
  const panelCoversSearch = panelState === 'full' || panelState === 'browse'
  const { query, setQuery, focused, setFocused, inputRef, results, selectPlace, handleKeyDown } = useGlassSearch()
  const drawerRef = useRef(null)
  const dragState = useRef({ startY: 0, isDragging: false, pointerId: null })

  // Close drawer and clear on result selection
  const handleSelect = useCallback((...args) => {
    selectPlace(...args)
    setOpen(false)
  }, [selectPlace])

  // Extended key handler: Escape closes drawer when query is empty
  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && !query) {
      setOpen(false)
      return
    }
    handleKeyDown(e)
  }, [query, handleKeyDown])

  // Auto-focus input when drawer opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, inputRef])

  const onPointerDown = useCallback((e) => {
    dragState.current = { startY: e.clientY, isDragging: false, pointerId: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e) => {
    const ds = dragState.current
    if (ds.pointerId !== e.pointerId) return
    const delta = e.clientY - ds.startY
    if (Math.abs(delta) > 5) ds.isDragging = true
    if (ds.isDragging && drawerRef.current) {
      const clamped = open
        ? Math.max(-DRAG_CLAMP, Math.min(0, delta))
        : Math.max(0, Math.min(DRAG_CLAMP, delta))
      drawerRef.current.style.maxHeight = open
        ? `${Math.max(0, 400 + clamped)}px`
        : `${Math.max(0, clamped)}px`
      drawerRef.current.style.opacity = open
        ? Math.max(0, 1 + clamped / DRAG_CLAMP)
        : Math.min(1, clamped / DRAG_THRESHOLD)
      drawerRef.current.style.transition = 'none'
    }
  }, [open])

  const onPointerUp = useCallback((e) => {
    const ds = dragState.current
    if (ds.pointerId !== e.pointerId) return
    const delta = e.clientY - ds.startY
    const wasDrag = ds.isDragging
    ds.pointerId = null
    ds.isDragging = false

    // Reset inline styles — let CSS transition handle snap
    if (drawerRef.current) {
      drawerRef.current.style.transition = ''
      drawerRef.current.style.maxHeight = ''
      drawerRef.current.style.opacity = ''
    }

    if (!wasDrag) {
      // Tap — toggle
      setOpen(prev => {
        if (!prev) requestAnimationFrame(() => inputRef.current?.focus())
        return !prev
      })
      return
    }

    if (Math.abs(delta) < DRAG_THRESHOLD) return // bounce back

    if (!open && delta > DRAG_THRESHOLD) {
      setOpen(true)
    } else if (open && delta < -DRAG_THRESHOLD) {
      setOpen(false)
      setQuery('')
      setFocused(false)
    }
  }, [open, inputRef, setQuery, setFocused])

  const onPointerCancel = useCallback(() => {
    dragState.current.pointerId = null
    dragState.current.isDragging = false
    if (drawerRef.current) {
      drawerRef.current.style.transition = ''
      drawerRef.current.style.maxHeight = ''
      drawerRef.current.style.opacity = ''
    }
  }, [])

  // Close when clicking outside — delayed to avoid race with open gesture
  useEffect(() => {
    if (!open) return
    let armed = false
    const armTimer = setTimeout(() => { armed = true }, 300)
    const handler = (e) => {
      if (!armed) return
      if (e.target.closest('.search-drawer-rail')) return
      if (e.target.closest('.search-drawer')) return
      setOpen(false)
      setQuery('')
      setFocused(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => {
      clearTimeout(armTimer)
      document.removeEventListener('pointerdown', handler)
    }
  }, [open, setQuery, setFocused])

  return (
    <div className="relative" style={{ zIndex: 60, display: panelCoversSearch ? 'none' : undefined }}>
      {/* Drawer — extends the ticker strip */}
      <div
        ref={drawerRef}
        className="search-drawer"
        style={{
          maxHeight: open ? '70vh' : '0px',
          opacity: open ? 1 : 0,
          background: 'rgba(0,0,0,0.75)',
        }}
      >
        {/* Compact search input — same strip as ticker */}
        <div className="search-drawer-input px-5">
          <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--on-surface)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            onKeyDown={onKeyDown}
            placeholder=""
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="text-body-sm leading-none"
              style={{ color: 'var(--on-surface-subtle)' }}
            >
              &times;
            </button>
          ) : (
            <button
              onClick={() => { setOpen(false); setQuery(''); setFocused(false) }}
              className="text-caption leading-none"
              style={{ color: 'var(--on-surface-disabled)' }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="px-3 pb-2">
            <SearchDropdown results={results} selectPlace={handleSelect} />
          </div>
        )}

        {query.length >= 2 && results.length === 0 && (
          <p className="text-center py-3 text-on-surface-disabled text-caption">No results</p>
        )}
      </div>

      {/* Drag rail — always outside the drawer, no background */}
      <div
        className="search-drawer-rail"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="search-drawer-pill" />
      </div>
    </div>
  )
}
