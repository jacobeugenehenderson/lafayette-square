import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import useListings from '../hooks/useListings'
import useCamera from '../hooks/useCamera'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useBulletin from '../hooks/useBulletin'
import { useCourierDash } from './CourierDashboard'
import { useContact } from './ContactModal'
import { useCodeDesk } from './CodeDeskModal'
import { useInfo } from './InfoModal'
import CATEGORIES from '../tokens/categories'

import { buildings, buildingMap as _buildingMap } from '../data/buildings'

function computeCenterOn(building) {
  const fp = building.footprint || []
  if (!fp.length) return { position: [0, 250, 0], lookAt: [0, 0, 0] }
  let cx = 0, cz = 0
  fp.forEach(([x, z]) => { cx += x; cz += z })
  cx /= fp.length; cz /= fp.length
  return {
    position: [cx, 250, cz + 1],
    lookAt: [cx, 0, cz],
  }
}

// ── Category icon SVG paths (Heroicons outline, 24x24 viewBox) ───────────
const CATEGORY_ICONS = {
  dining: (
    // fork-knife (utensils)
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v7.2c0 1 .8 1.8 1.8 1.8H6v9m0-18v18m6-18v4.5m0 0V12m0-4.5C12 5 14 3 15 3s3 2 3 4.5V12m-6 0h6m-6 0v6m6-6v6m-6 0h6" />
  ),
  historic: (
    // columns / landmark
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
  ),
  arts: (
    // paint brush / palette
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
  ),
  parks: (
    // tree / leaf
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21V11.25m0 0c1.5-2.25 4.5-5.25 4.5-7.5a4.5 4.5 0 10-9 0c0 2.25 3 5.25 4.5 7.5zm-3 3.75h6" />
  ),
  shopping: (
    // shopping bag
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
  ),
  services: (
    // wrench-screwdriver
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1 5.1a2.121 2.121 0 01-3-3l5.1-5.1m0 0L3.34 7.09a2.121 2.121 0 013-3l5.08 5.08m0 3l3.75-3.75m0 0l5.1 5.1a2.121 2.121 0 01-3 3l-5.1-5.1m0 0l5.08-5.08a2.121 2.121 0 00-3-3l-5.08 5.08" />
  ),
  hospitality: (
    // bed / key
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
  ),
  community: (
    // users / people
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
  ),
  residential: (
    // home
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  ),
  commercial: (
    // building-office
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
  ),
  industrial: (
    // factory / cog
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" />
  ),
  // Fallback for menu items
  menu: (
    // book-open
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  ),
  // Fallback for bare buildings
  building: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
  ),
}

// Resolve a search result to { hex, icon } for the row cap
function getResultStyle(result) {
  const { type, listing } = result
  if (type === 'building') {
    return { hex: '#7A8B6F', icon: CATEGORY_ICONS.building } // sage for bare buildings
  }
  if (type === 'menu-type' || type === 'menu-item') {
    const cat = listing?.category && CATEGORIES[listing.category]
    return { hex: cat?.hex || '#C2185B', icon: CATEGORY_ICONS.menu }
  }
  // place — use listing's category
  const cat = listing?.category && CATEGORIES[listing.category]
  const icon = CATEGORY_ICONS[listing?.category] || CATEGORY_ICONS.building
  return { hex: cat?.hex || '#7A8B6F', icon }
}

const MENU_TYPE_LABELS = {
  dinner: 'Dinner', lunch: 'Lunch', brunch: 'Brunch', drinks: 'Drinks',
  dessert: 'Dessert', all_day: 'All Day', happy_hour: 'Happy Hour', specials: 'Specials', market: 'Market',
}

function menuTypeLabel(key) {
  return MENU_TYPE_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function buildSearchIndex(listings) {
  const idx = []
  // Index bare buildings by address (skip those covered by listings)
  const listingBuildingIds = new Set(listings.map(l => l.building_id).filter(Boolean))
  buildings.forEach(b => {
    if (listingBuildingIds.has(b.id) || !b.address) return
    const addr = b.address.toUpperCase()
    const name = (b.name || '').toUpperCase()
    idx.push({ text: addr + ' ' + name, type: 'building', building: b })
  })

  listings.forEach(listing => {
    const name = (listing.name || '').toUpperCase()
    const addr = (listing.address || '').toUpperCase()
    idx.push({ text: name + ' ' + addr, type: 'place', listing })

    const sections = listing.menu?.sections || []
    // Index menu types (e.g. "brunch", "happy hour", "bridal")
    const seenTypes = new Set()
    sections.forEach(section => {
      const menuKey = section.menu || ''
      if (menuKey && !seenTypes.has(menuKey)) {
        seenTypes.add(menuKey)
        const label = menuTypeLabel(menuKey)
        idx.push({ text: (label + ' ' + menuKey.replace(/_/g, ' ')).toUpperCase(), type: 'menu-type', listing, menuType: menuKey, menuLabel: label })
      }
      (section.items || []).forEach(item => {
        const menuLabel = menuKey ? menuTypeLabel(menuKey) : ''
        const itemText = ((item.name || '') + ' ' + (item.description || '') + ' ' + menuLabel).toUpperCase()
        idx.push({ text: itemText, type: 'menu-item', listing, item, section: section.name })
      })
    })
  })
  return idx
}

// Shared search input + results, used by both hero and browse layouts
export function useGlassSearch() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const listings = useListings(s => s.listings)
  const flyTo = useCamera(s => s.flyTo)
  const highlight = useSelectedBuilding(s => s.highlight)
  const selectBuilding = useSelectedBuilding(s => s.select)

  const searchIndex = useMemo(() => buildSearchIndex(listings), [listings])

  const results = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toUpperCase()
    const terms = q.split(/\s+/)
    const matches = searchIndex.filter(entry => terms.every(t => entry.text.includes(t)))
    const places = matches.filter(m => m.type === 'place')
    const buildings = matches.filter(m => m.type === 'building')
    const menuTypes = matches.filter(m => m.type === 'menu-type')
    const items = matches.filter(m => m.type === 'menu-item')
    // Dedupe menu types by listing
    const seenMenuListings = new Set()
    const uniqueMenuTypes = menuTypes.filter(m => {
      const k = m.listing.id + ':' + m.menuType
      if (seenMenuListings.has(k)) return false
      seenMenuListings.add(k)
      return true
    })
    const itemsByPlace = {}
    items.forEach(m => {
      const pid = m.listing.id
      if (!itemsByPlace[pid]) itemsByPlace[pid] = []
      if (itemsByPlace[pid].length < 2) itemsByPlace[pid].push(m)
    })
    const placeResults = places.slice(0, 4)
    const buildingResults = buildings.slice(0, 4)
    const menuTypeResults = uniqueMenuTypes.slice(0, 4)
    const itemResults = Object.values(itemsByPlace).flat().slice(0, 6)
    return [...placeResults, ...buildingResults, ...menuTypeResults, ...itemResults].slice(0, 10)
  }, [query, searchIndex])

  const selectPlace = useCallback((listing, building, resultType) => {
    const isMenuResult = resultType === 'menu-type' || resultType === 'menu-item'
    const bldg = building || _buildingMap[listing?.building_id]
    const cam = useCamera.getState()
    if (cam.viewMode !== 'browse') cam.setMode('browse')
    if (cam.panelState === 'full') cam.setPanelState('neutral')
    if (bldg) {
      const target = computeCenterOn(bldg)
      flyTo(target.position, target.lookAt)
    }
    if (isMenuResult && listing) {
      // Menu results open the PlaceCard directly
      selectBuilding(listing.id, listing.building_id, 'menu')
    } else {
      // Place/building results highlight neon — user clicks building to open card
      highlight(listing?.id || null, listing?.building_id || bldg?.id)
    }
    setQuery('')
    setFocused(false)
    inputRef.current?.blur()
  }, [flyTo, highlight, selectBuilding])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      selectPlace(results[0].listing, results[0].building, results[0].type)
    } else if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
      setFocused(false)
    }
  }, [results, selectPlace])

  return { query, setQuery, focused, setFocused, inputRef, results, selectPlace, handleKeyDown }
}

function CategoryIcon({ hex, icon, logo }) {
  return (
    <div
      className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: hex + '90' }}
    >
      {logo ? (
        <img src={logo} alt="" className="w-6 h-6 object-contain" />
      ) : (
        <svg
          className="w-4 h-4"
          style={{ color: hex }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          {icon}
        </svg>
      )}
    </div>
  )
}

function resolveLogoUrl(listing) {
  if (!listing?.logo) return null
  return listing.logo.startsWith('http')
    ? listing.logo
    : `${import.meta.env.BASE_URL}${listing.logo.replace(/^\//, '')}`
}

function SearchDropdown({ results, selectPlace }) {
  return (
    <div className="glass-dropdown mt-1.5 rounded-xl">
      {results.map((result, i) => {
        const { listing } = result
        const style = getResultStyle(result)

        // Logo only for direct place results, not menu hits
        const logo = result.type === 'place' ? resolveLogoUrl(listing) : null

        if (result.type === 'building') {
          const b = result.building
          return (
            <button
              key={`bldg-${b.id}`}
              onClick={() => selectPlace(null, b, 'building')}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
            >
              <CategoryIcon hex={style.hex} icon={style.icon} />
              <div className="min-w-0 flex-1">
                <span className="text-sm glass-text font-medium block truncate">{b.name || b.address}</span>
                {b.name && b.address && <span className="text-xs glass-text-dim block truncate">{b.address}</span>}
              </div>
            </button>
          )
        }

        if (result.type === 'menu-type') {
          return (
            <button
              key={`mtype-${listing.id}-${result.menuType}-${i}`}
              onClick={() => selectPlace(listing, null, 'menu-type')}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
            >
              <CategoryIcon hex={style.hex} icon={style.icon} logo={logo} />
              <div className="min-w-0 flex-1">
                <span className="text-xs glass-text-dim block truncate">{listing.name}</span>
                <span className="text-sm glass-text block truncate">{result.menuLabel}</span>
              </div>
            </button>
          )
        }

        if (result.type === 'menu-item') {
          const { item } = result
          return (
            <button
              key={`menu-${listing.id}-${item.name}-${i}`}
              onClick={() => selectPlace(listing, null, 'menu-item')}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
            >
              <CategoryIcon hex={style.hex} icon={style.icon} logo={logo} />
              <div className="min-w-0 flex-1">
                <span className="text-xs glass-text-dim block truncate">{listing.name} · {result.section}</span>
                <span className="text-sm glass-text block truncate">{item.name}</span>
              </div>
              {item.price != null && (
                <span className="text-xs glass-text-dim tabular-nums flex-shrink-0">${(item.price / 100).toFixed(2)}</span>
              )}
            </button>
          )
        }

        // Place result
        return (
          <button
            key={`place-${listing.id}`}
            onClick={() => selectPlace(listing, null, 'place')}
            className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
          >
            <CategoryIcon hex={style.hex} icon={style.icon} logo={logo} />
            <div className="min-w-0 flex-1">
              <span className="text-sm glass-text font-medium block truncate">{listing.name}</span>
              {listing.address && <span className="text-xs glass-text-dim block truncate">{listing.address}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// Hero search — fades out after 10s idle, reappears on tap/interaction
const IDLE_MS = 10000

export function HeroSearch() {
  const { query, setQuery, focused, setFocused, inputRef, results, selectPlace, handleKeyDown } = useGlassSearch()
  const [visible, setVisible] = useState(true)
  const idleTimer = useRef(null)

  const resetIdle = useCallback(() => {
    setVisible(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setVisible(false), IDLE_MS)
  }, [])

  useEffect(() => {
    resetIdle()
    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel']
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    return () => {
      clearTimeout(idleTimer.current)
      events.forEach(e => window.removeEventListener(e, resetIdle))
    }
  }, [resetIdle])

  // Stay visible while focused or has query
  const forceVisible = focused || query.length > 0

  const showCard = useSelectedBuilding(s => s.showCard)
  const bulletinOpen = useBulletin(s => s.modalOpen)
  const courierOpen = useCourierDash(s => s.open)
  const contactOpen = useContact(s => s.open)
  const codeDeskOpen = useCodeDesk(s => s.open)
  const infoOpen = useInfo(s => s.open)
  const societyFull = useCamera(s => s.panelState === 'full' && s.activeTab === 'lafayettepages')
  const suppressed = showCard || bulletinOpen || courierOpen || contactOpen || codeDeskOpen || infoOpen || societyFull

  if (suppressed) return null

  const showDropdown = focused && results.length > 0

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-40 w-[min(420px,calc(100vw-4rem))]"
      style={{
        top: showDropdown ? '12%' : '35%',
        opacity: (visible || forceVisible) ? 1 : 0,
        pointerEvents: (visible || forceVisible) ? 'auto' : 'none',
        transition: 'top 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ease',
      }}
    >
      <div className="glass-panel flex items-center gap-2.5 px-4 py-2.5 rounded-2xl">
        <svg className="w-4 h-4 glass-text-dim flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          placeholder=""
          className="flex-1 bg-transparent text-sm glass-text placeholder:glass-text-dim outline-none font-mono"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            className="glass-text-dim glass-text-link text-sm leading-none"
          >
            &times;
          </button>
        )}
      </div>
      {showDropdown && <SearchDropdown results={results} selectPlace={selectPlace} />}
    </div>
  )
}

// Browse header search — inline in the header bar
export function BrowseSearchInput() {
  const { query, setQuery, focused, setFocused, inputRef, results, selectPlace, handleKeyDown } = useGlassSearch()
  const societyFull = useCamera(s => s.panelState === 'full' && s.activeTab === 'lafayettepages')

  if (societyFull) return null

  const showDropdown = focused && results.length > 0

  return (
    <div className="relative flex-1 min-w-0">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 backdrop-blur-sm">
        <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          placeholder=""
          className="flex-1 bg-transparent text-sm text-white/90 outline-none font-mono min-w-0"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            className="text-white/40 hover:text-white/70 text-sm leading-none"
          >
            &times;
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1">
          <SearchDropdown results={results} selectPlace={selectPlace} />
        </div>
      )}
    </div>
  )
}

// Society tab search — the single search bar for the app
export function SocietySearch({ onSearchActive }) {
  const { query, setQuery, focused, setFocused, inputRef, results, selectPlace, handleKeyDown } = useGlassSearch()

  const hasQuery = query.length >= 2

  useEffect(() => {
    if (onSearchActive) onSearchActive(hasQuery)
  }, [hasQuery, onSearchActive])

  return (
    <>
      <div className="flex-shrink-0">
        <div className="glass-panel flex items-center gap-2.5 px-4 py-2.5 mx-2 mt-2 mb-1 rounded-2xl">
          <svg className="w-4 h-4 glass-text-dim flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            placeholder=""
            className="flex-1 bg-transparent text-sm glass-text placeholder:glass-text-dim outline-none font-mono"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="glass-text-dim glass-text-link text-sm leading-none"
            >
              &times;
            </button>
          )}
        </div>
      </div>
      {hasQuery && (
        results.length > 0 ? (
          <SearchDropdown results={results} selectPlace={selectPlace} />
        ) : (
          <div className="text-center py-6 text-on-surface-disabled text-body-sm">No results</div>
        )
      )}
    </>
  )
}

// Legacy default export — kept for App.jsx import, search now lives in Society tab
export default function GlassSearch() {
  const viewMode = useCamera(s => s.viewMode)
  const panelState = useCamera(s => s.panelState)
  if (viewMode === 'hero' && panelState === 'neutral') return <HeroSearch />
  return null
}
