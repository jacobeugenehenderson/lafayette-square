import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import useListings from '../hooks/useListings'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import { TAG_BY_ID } from '../tokens/tags'
import { SUBCATEGORY_LABELS, CATEGORY_LABELS } from '../tokens/categories'
import buildingsData from '../data/buildings.json'

const MENU_LABELS = {
  dinner: 'Dinner', lunch: 'Lunch', brunch: 'Brunch', drinks: 'Drinks',
  dessert: 'Dessert', all_day: 'All Day', specials: 'Specials',
}

const _buildingMap = {}
buildingsData.buildings.forEach(b => { _buildingMap[b.id] = b })

function computeCenterOn(building) {
  const [x, , z] = building.position
  const h = building.size[1] + 30
  return {
    position: [x + 60, h + 40, z + 60],
    lookAt: [x, h * 0.3, z],
  }
}

// Build search index — place-level entries + individual menu items
function buildSearchIndex(listings) {
  const entries = []
  listings.filter(l => l.category !== 'residential').forEach(l => {
    const tagLabels = (l.tags || []).map(t => TAG_BY_ID[t]?.label || t).join(' ')
    const subLabel = SUBCATEGORY_LABELS[l.subcategory] || ''
    const catLabel = CATEGORY_LABELS[l.category] || ''
    // Place-level entry (searches name, tags, description — not menu items)
    const placeText = [l.name, subLabel, catLabel, tagLabels, l.description || ''].join(' ').toUpperCase()
    entries.push({ type: 'place', listing: l, text: placeText })
    // Individual menu item entries
    ;(l.menu?.sections || []).forEach(section => {
      ;(section.items || []).forEach(item => {
        const itemText = [item.name, item.description || '', l.name].join(' ').toUpperCase()
        entries.push({ type: 'menu-item', listing: l, item, section, text: itemText })
      })
    })
  })
  return entries
}

const IDLE_TIMEOUT = 3000

export default function GlassSearch() {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const hideTimer = useRef(null)
  const lastMove = useRef(0)
  const listings = useListings(s => s.listings)
  const flyTo = useCamera(s => s.flyTo)
  const highlight = useSelectedBuilding(s => s.highlight)

  const searchIndex = useMemo(() => buildSearchIndex(listings), [listings])

  const results = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toUpperCase()
    const terms = q.split(/\s+/)
    const matches = searchIndex.filter(entry => terms.every(t => entry.text.includes(t)))
    // Prioritize: places first, then menu items. Deduplicate menu items per place (max 2 per place).
    const places = matches.filter(m => m.type === 'place')
    const items = matches.filter(m => m.type === 'menu-item')
    const itemsByPlace = {}
    items.forEach(m => {
      const pid = m.listing.id
      if (!itemsByPlace[pid]) itemsByPlace[pid] = []
      if (itemsByPlace[pid].length < 2) itemsByPlace[pid].push(m)
    })
    // If query matches place names, show places. Otherwise show menu items.
    const placeResults = places.slice(0, 4)
    const itemResults = Object.values(itemsByPlace).flat().slice(0, 6)
    // Interleave: places first, then items, cap at 8
    return [...placeResults, ...itemResults].slice(0, 8)
  }, [query, searchIndex])

  // Show on mouse movement or touch — throttled to avoid flicker
  useEffect(() => {
    const show = () => {
      const now = Date.now()
      // Throttle: ignore events within 100ms of last
      if (now - lastMove.current < 100) return
      lastMove.current = now

      setVisible(true)
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => {
        const el = inputRef.current
        const hasFocus = el && document.activeElement === el
        const hasQuery = el && el.value.length > 0
        if (!hasFocus && !hasQuery) {
          setVisible(false)
        }
      }, IDLE_TIMEOUT)
    }
    window.addEventListener('mousemove', show, { passive: true })
    window.addEventListener('touchstart', show, { passive: true })
    return () => {
      window.removeEventListener('mousemove', show)
      window.removeEventListener('touchstart', show)
      clearTimeout(hideTimer.current)
    }
  }, [])

  // Keep visible while focused or has query
  useEffect(() => {
    if (focused || query.length > 0) {
      clearTimeout(hideTimer.current)
      setVisible(true)
    }
  }, [focused, query])

  const selectPlace = useCallback((listing) => {
    const building = _buildingMap[listing.building_id]
    if (building) {
      const cam = useCamera.getState()
      if (cam.viewMode !== 'browse') cam.setMode('browse')
      const target = computeCenterOn(building)
      flyTo(target.position, target.lookAt)
    }
    highlight(listing.id, listing.building_id)
    setQuery('')
    setFocused(false)
    inputRef.current?.blur()
  }, [flyTo, highlight])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      selectPlace(results[0].listing)
    } else if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
      setFocused(false)
    }
  }, [results, selectPlace])

  const showDropdown = focused && results.length > 0
  const active = visible || focused

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-40 w-[min(420px,calc(100vw-4rem))] transition-all duration-500 ease-out ${
        active ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        top: showDropdown ? '12%' : '35%',
        transition: 'top 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease',
      }}
    >
      {/* Glass search bar */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
        style={{
          background: 'rgba(20,20,20,0.45)',
          backdropFilter: 'blur(24px) saturate(180%) brightness(110%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%) brightness(110%)',
        }}
      >
        <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          onKeyDown={handleKeyDown}
          placeholder="Search places, menus, tags..."
          className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/30 outline-none"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            className="text-white/30 hover:text-white/60 text-sm leading-none"
          >
            &times;
          </button>
        )}
      </div>

      {/* Dropdown results — below the input, max height capped */}
      {showDropdown && (
        <div
          className="mt-1.5 rounded-xl border border-white/15 overflow-y-auto shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
          style={{
            maxHeight: 'min(50vh, 400px)',
            background: 'rgba(20,20,20,0.75)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          }}
        >
          {results.map((result, i) => {
            const { listing } = result
            const logo = listing.logo
              ? (listing.logo.startsWith('http') ? listing.logo : `${import.meta.env.BASE_URL}${listing.logo.replace(/^\//, '')}`)
              : null

            if (result.type === 'menu-item') {
              const { item } = result
              return (
                <button
                  key={`${listing.id}-${item.name}-${i}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectPlace(listing)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/10 transition-colors"
                >
                  {logo ? (
                    <img src={logo} alt="" className="w-6 h-6 rounded object-contain bg-white/5 flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                      <span className="text-white/30 text-xs">{listing.name?.[0]}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/90 truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>{item.name}</div>
                    <div className="text-xs text-white/40 truncate">
                      {listing.name}
                      {result.section?.menu && <span className="ml-1.5 text-white/30">· {MENU_LABELS[result.section.menu] || result.section.menu}</span>}
                      {item.price != null && <span className="ml-1.5 text-white/50">${(item.price / 100).toFixed(0)}</span>}
                    </div>
                  </div>
                </button>
              )
            }

            const sub = SUBCATEGORY_LABELS[listing.subcategory] || CATEGORY_LABELS[listing.category] || ''
            return (
              <button
                key={listing.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPlace(listing)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/10 transition-colors"
              >
                {logo ? (
                  <img src={logo} alt="" className="w-6 h-6 rounded object-contain bg-white/5 flex-shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                    <span className="text-white/30 text-xs">{listing.name?.[0]}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/90 truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>{listing.name}</div>
                  <div className="text-xs text-white/40 truncate">{sub}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
