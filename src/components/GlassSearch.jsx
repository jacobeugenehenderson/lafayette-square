import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import useListings from '../hooks/useListings'
import useCamera from '../hooks/useCamera'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useBulletin from '../hooks/useBulletin'
import { useCourierDash } from './CourierDashboard'
import { useContact } from './ContactModal'
import { useCodeDesk } from './CodeDeskModal'
import { useInfo } from './InfoModal'

// Precompute a map of building_id -> building for fast lookup
import buildingsData from '../data/buildings.json'
const _buildingMap = {}
buildingsData.buildings.forEach(b => { _buildingMap[b.id] = b })

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

const MENU_TYPE_LABELS = {
  dinner: 'Dinner', lunch: 'Lunch', brunch: 'Brunch', drinks: 'Drinks',
  dessert: 'Dessert', all_day: 'All Day', happy_hour: 'Happy Hour', specials: 'Specials', market: 'Market',
}

function menuTypeLabel(key) {
  return MENU_TYPE_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function buildSearchIndex(listings) {
  const idx = []
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

  const searchIndex = useMemo(() => buildSearchIndex(listings), [listings])

  const results = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toUpperCase()
    const terms = q.split(/\s+/)
    const matches = searchIndex.filter(entry => terms.every(t => entry.text.includes(t)))
    const places = matches.filter(m => m.type === 'place')
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
    const menuTypeResults = uniqueMenuTypes.slice(0, 4)
    const itemResults = Object.values(itemsByPlace).flat().slice(0, 6)
    return [...placeResults, ...menuTypeResults, ...itemResults].slice(0, 10)
  }, [query, searchIndex])

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

  return { query, setQuery, focused, setFocused, inputRef, results, selectPlace, handleKeyDown }
}

function SearchDropdown({ results, selectPlace }) {
  return (
    <div className="glass-dropdown mt-1.5 rounded-xl overflow-y-auto" style={{ maxHeight: 'min(50vh, 400px)' }}>
      {results.map((result, i) => {
        const { listing } = result
        const logo = listing.logo
          ? (listing.logo.startsWith('http') ? listing.logo : `${import.meta.env.BASE_URL}${listing.logo.replace(/^\//, '')}`)
          : null

        if (result.type === 'menu-type') {
          return (
            <button
              key={`mtype-${listing.id}-${result.menuType}-${i}`}
              onClick={() => selectPlace(listing)}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
            >
              {logo ? (
                <img src={logo} alt="" className="w-7 h-7 rounded-md object-contain bg-white/5 flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-md bg-white/5 flex-shrink-0" />
              )}
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
              onClick={() => selectPlace(listing)}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
            >
              {logo ? (
                <img src={logo} alt="" className="w-7 h-7 rounded-md object-contain bg-white/5 flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-md bg-white/5 flex-shrink-0" />
              )}
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

        return (
          <button
            key={`place-${listing.id}`}
            onClick={() => selectPlace(listing)}
            className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
          >
            {logo ? (
              <img src={logo} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/5 flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-white/5 flex-shrink-0" />
            )}
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

// Hero search — always visible, centered, floating
export function HeroSearch() {
  const { query, setQuery, focused, setFocused, inputRef, results, selectPlace, handleKeyDown } = useGlassSearch()

  const showCard = useSelectedBuilding(s => s.showCard)
  const bulletinOpen = useBulletin(s => s.modalOpen)
  const courierOpen = useCourierDash(s => s.open)
  const contactOpen = useContact(s => s.open)
  const codeDeskOpen = useCodeDesk(s => s.open)
  const infoOpen = useInfo(s => s.open)
  const suppressed = showCard || bulletinOpen || courierOpen || contactOpen || codeDeskOpen || infoOpen

  if (suppressed) return null

  const showDropdown = focused && results.length > 0

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-40 w-[min(420px,calc(100vw-4rem))]"
      style={{
        top: showDropdown ? '12%' : '35%',
        transition: 'top 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
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

// Legacy default export — used by App.jsx, now just renders HeroSearch
export default function GlassSearch() {
  const viewMode = useCamera(s => s.viewMode)
  if (viewMode !== 'hero') return null
  return <HeroSearch />
}
