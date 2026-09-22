import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { isOpenAt, openSlotAt } from '../lib/openNow.js'
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
// ⛔ ONE HOME FOR THIS PREDICATE — `src/lib/openNow.js`. This file used to carry
// its own copy, byte-identical to two others, and all three read `mins >= open &&
// mins < close`, which is FALSE at every minute of the day when a place closes
// after midnight. `PlaceCard` had the only correct version. See that module.
const _isOpenNow = isOpenAt
const TAGLINE_MAX = 80
function _firstSentence(text) {
  if (!text) return null
  const match = text.match(/^[^.!?]+[.!?]/)
  if (!match) return null
  const sentence = match[0].trim()
  if (sentence.length <= TAGLINE_MAX) return sentence
  return sentence.slice(0, TAGLINE_MAX).replace(/\s+\S*$/, '') + '\u2026'
}
// A town event's caption. ⛔ Returns undefined rather than a placeholder when the
// event is a single day — "Oct 4 – Oct 4" is noise, and an absent caption already
// renders as nothing.
const _MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function _dateRangeLabel(e) {
  const fmt = (d) => {
    const [, m, day] = (d || '').split('-')
    return m ? `${_MON[Number(m) - 1]} ${Number(day)}` : null
  }
  const start = fmt(e.start_date)
  const end = fmt(e.end_date)
  if (!start) return undefined
  if (!end || e.end_date === e.start_date) return undefined
  return `through ${end}`
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
    // ⛔ ONE RESOLUTION FOR BOTH THE TEST AND THE LABEL. This used to ask
    // `_isOpenNow` and then reach for `hours[today]` separately — fine while no window
    // could wrap, fatal once one can: at 01:00 the slot holding a bar open belongs to
    // YESTERDAY, so today's may not exist and `undefined.close` would take the ticker
    // (and with it the search bar) down.
    const slot = openSlotAt(listing.hours, now)
    if (!slot) return
    const tagline = listing.tagline || _firstSentence(listing.description)
    if (!tagline) return
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

  // 3. Events (amber) — two kinds, and the difference is what the event is ABOUT.
  //
  // ⭐⭐ A GUARDIAN EVENT CARRIES `listing_id`: it is about that place ("Kyle is
  // bartending tonight"), so it keys by the listing and REPLACES that place's
  // open-now entry — one entry per listing, the original rule, unchanged.
  //
  // ⭐⭐ A TOWN EVENT CARRIES NONE: it is about the town ("Pumpkin Festival,
  // Oct 1–14"), so it keys by its OWN `id` and stands BESIDE the places rather
  // than displacing one. ⛔ This used to key by `e.listing_id` unconditionally,
  // so every listing-less event wrote the key `undefined` and they overwrote each
  // other — measured 2026-09-22: three town events in, ONE out, and the survivor
  // arbitrary, because the tie-break is `(e.start_time || '') > (existing._startTime
  // || '')` and `'' > ''` is false, so first-in won by accident.
  //
  // ⭐ `links_to` IS WHERE THE EVENT SENDS YOU, NOT WHAT IT IS ABOUT — the sponsor,
  // the venue, whoever the operator chose (Jacob, 2026-09-22: "point it at a place;
  // the sponsor or whatever … what it links to"). It is authored per event and is
  // NEVER the key: two festivals sponsored by one marina are still two festivals.
  //
  // ⛔ A town event with no `id` cannot be keyed and is DROPPED LOUDLY here rather
  // than silently colliding. The real gate is `bake-content.js`, which refuses the
  // scene; this is the second line of defence for an event arriving from the API.
  allEvents.forEach(e => {
    if (!isActiveEvent(e, dateStr, timeStr)) return
    const isTown = !e.listing_id
    if (isTown && !e.id) {
      console.error('[EventTicker] a town event has no `id` and cannot be keyed — dropped:', e.title || e)
      return
    }
    const key = isTown ? `event:${e.id}` : e.listing_id
    const linkId = e.listing_id || e.links_to || null
    const listing = linkId ? useListings.getState().getById(linkId) : null
    const existing = entries.get(key)

    const entry = {
      listing_id: linkId,
      title: isTown ? (e.description || '') : e.title,
      description: e.description,
      // A town event is its own headline; a guardian event is the venue's.
      _venueName: isTown ? e.title : (listing?.name || ''),
      _time: isTown ? _dateRangeLabel(e) : undefined,
      _buildingId: listing?.building_id || e._buildingId,
      _source: 'event',
      _startTime: e.start_time || '',
    }

    if (!existing) {
      entries.set(key, entry)
    } else if (existing._source !== 'event') {
      // Guardian event overrides schedule and tagline entries
      entries.set(key, entry)
    } else {
      // Two events on one key — latest start_time wins
      if ((e.start_time || '') > (existing._startTime || '')) {
        entries.set(key, entry)
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
  // NOTE: every hook must run before any early return. `panelState` used to be
  // read AFTER `if (planetarium) return null`, so entering Street view skipped a
  // hook → "Rendered fewer hooks than expected" → React tore down the root →
  // Canvas remount → WebGL context loss (dark screen). Keep all hooks above the
  // returns. (2026-06-17)
  const panelFull = useCamera(s => s.panelState) === 'full'

  if (viewMode === 'planetarium') return null
  if (showCard || bulletinOpen || courierOpen || contactOpen || codeDeskOpen || infoOpen || panelFull) return null

  // ⛔⛔ THE ENTRY COUNT MAY NOT GATE THE CHROME. This used to be
  // `if (tickerItems.length === 0) return null`, and the bar carries more than the
  // ticker: the two glass zones the header is composed of, the bottom edge highlight,
  // and — rendered inside this same return — `SearchDrawer`, the ONLY pulldown search
  // in the player. So a town with nothing open right now lost its search entirely, and
  // an empty ticker and an unwired one looked identical.
  //
  // ⭐ IT IS A TIME-OF-DAY HOLE, WHICH IS WHY IT SURVIVED. Entries come from
  // `_isOpenNow`, so the bar vanished nightly and returned by morning; measured on huron
  // 2026-09-22, the eligible listings are open 07:00–21:00 and the search was gone for
  // the other ten hours. ⚠️ Worse on a town with fewer hours on file, and — the kit's
  // signature shape — invisible on a town whose directory is full.
  //
  // ⭐ The empty state is BLANK, deliberately: an activated feature with empty assets
  // degrades to an empty state, and inventing filler copy would put words in a town's
  // mouth. `current` is null and every consumer below already reads it optionally.
  const current = tickerItems.length ? tickerItems[index % tickerItems.length] : null
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
            onClick={() => current && openEvent(current)}
            disabled={!current}
            aria-label={current ? undefined : 'Nothing open right now'}
            className="flex-1 min-w-0 flex items-center text-left h-full"
          >
            {current && <div
              key={`${current.listing_id || ''}-${index}`}
              className="flex-1 min-w-0 animate-ticker-in space-y-0.5"
            >
              {current._venueName && (
                <ScrollLine tickKey={`v-${index}`} className={`text-label tracking-wide ${isEvent ? 'text-amber-300' : 'text-on-surface'}`}>
                  {current._venueName}
                </ScrollLine>
              )}
              <ScrollLine tickKey={`t-${index}`} className={`text-label-sm ${isEvent ? 'text-amber-300/70' : 'text-on-surface-variant'}`}>
                {current.title}
              </ScrollLine>
              {current._time && (
                <p className="text-caption text-on-surface-subtle">
                  {current._time}
                </p>
              )}
            </div>}
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
