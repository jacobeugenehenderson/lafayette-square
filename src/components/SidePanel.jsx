import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import SunCalc from 'suncalc'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useLandmarkFilter from '../hooks/useLandmarkFilter'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useUserLocation from '../hooks/useUserLocation'
import { CATEGORY_LIST, COLOR_CLASSES } from '../tokens/categories'
import { buildings as _buildings, buildingMap as _buildingMap, buildingCount as _buildingCount, ready as _buildingsReady } from '../data/buildings'
import streetsData from '../data/streets.json'
import useListings from '../hooks/useListings'
import useBulletin from '../hooks/useBulletin'
import { BrowseView, NewPostView, ThreadListView, ThreadDetailView } from './BulletinModal'
import { SocietySearch } from './GlassSearch'
import useSkyState from '../hooks/useSkyState'
import { getWeatherCondition, WeatherIcon } from '../lib/weatherCodes.jsx'
import { interpolateForecast } from '../lib/dawnTimeline'
import WeatherTimeline from './WeatherTimeline'
import { useContact } from './ContactModal'
import useCommunityStats from '../hooks/useCommunityStats'

// ── Camera helpers ──────────────────────────────────────────────────
// _buildingMap imported from shared buildings module

// Neighborhood bounding box (computed lazily after buildings load)
let _neighborhoodBounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }
_buildingsReady.then(({ buildings }) => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const b of buildings) {
    minX = Math.min(minX, b.position[0])
    maxX = Math.max(maxX, b.position[0])
    minZ = Math.min(minZ, b.position[2])
    maxZ = Math.max(maxZ, b.position[2])
  }
  _neighborhoodBounds = { minX, maxX, minZ, maxZ }
})

// Compute neighborhood framing using actual viewport dimensions
function getNeighborhoodTarget() {
  const { minX, maxX, minZ, maxZ } = _neighborhoodBounds
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  const aspect = window.innerWidth / window.innerHeight
  const vTan = V_TAN
  const hTan = vTan * aspect
  const visV = VIS_V
  const hForX = spanX / (2 * hTan)
  const hForZ = spanZ / (2 * vTan * visV)
  const height = Math.max(hForX, hForZ)
  const zOff = panelOffset(height)
  return {
    position: [cx, height, cz + zOff + 1],
    lookAt: [cx, 0, cz + zOff],
  }
}

// Browse: top-down, vertical FOV 45°.
// Portrait mobile aspect ~0.46 → horizontal is the tight dimension.
const V_TAN = Math.tan((45 / 2) * Math.PI / 180) // 0.414
const PORTRAIT_ASPECT = 0.46
const H_TAN = V_TAN * PORTRAIT_ASPECT // 0.191

// Panel covers bottom 35%. Visible vertical fraction = 65%.
const PANEL_FRAC = 0.35
const VIS_V = 1 - PANEL_FRAC

// Shift lookAt south so content centers in visible area above panel.
function panelOffset(height) {
  return (PANEL_FRAC / 2) * 2 * height * V_TAN
}

// Compute camera to contain all buildings. Fits both X (horizontal)
// and Z (visible vertical) independently, takes the larger height.
function computeZoomToFit(buildings) {
  if (buildings.length === 0) return null
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const b of buildings) {
    minX = Math.min(minX, b.position[0])
    maxX = Math.max(maxX, b.position[0])
    minZ = Math.min(minZ, b.position[2])
    maxZ = Math.max(maxZ, b.position[2])
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const spanX = Math.max(maxX - minX, 200)
  const spanZ = Math.max(maxZ - minZ, 200)
  // Height to fit X span in narrow horizontal (20% padding)
  const hForX = (spanX * 1.2) / (2 * H_TAN)
  // Height to fit Z span in visible vertical above panel (20% padding)
  const hForZ = (spanZ * 1.2) / (2 * V_TAN * VIS_V)
  const height = Math.max(hForX, hForZ)
  const zOff = panelOffset(height)
  return {
    position: [cx, height, cz + zOff + 1],
    lookAt: [cx, 0, cz + zOff],
  }
}

// Center on a single building — featured in viewport, not zoomed in too close
function computeCenterOn(building) {
  const x = building.position[0]
  const z = building.position[2]
  const height = 250
  const zOff = panelOffset(height)
  return {
    position: [x, height, z + zOff + 1],
    lookAt: [x, 0, z + zOff],
  }
}

// Lafayette Square, St. Louis, MO
const LATITUDE = 38.6160
const LONGITUDE = -90.2161

const MOON_PHASES = [
  { name: 'New Moon', icon: '\u{1F311}' },
  { name: 'Waxing Crescent', icon: '\u{1F312}' },
  { name: 'First Quarter', icon: '\u{1F313}' },
  { name: 'Waxing Gibbous', icon: '\u{1F314}' },
  { name: 'Full Moon', icon: '\u{1F315}' },
  { name: 'Waning Gibbous', icon: '\u{1F316}' },
  { name: 'Last Quarter', icon: '\u{1F317}' },
  { name: 'Waning Crescent', icon: '\u{1F318}' },
]

function getMoonPhase(phase) {
  const index = Math.floor(phase * 8) % 8
  return MOON_PHASES[index]
}

function formatTimeShort(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(' ', '')
}


// ── Hours check (mirrors LafayetteScene._isWithinHours) ─────────────
const _DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
function _isWithinHours(hours, time) {
  if (!hours) return false
  const day = _DAYS[time.getDay()]
  const slot = hours[day]
  if (!slot || !slot.open || !slot.close) return false
  const mins = time.getHours() * 60 + time.getMinutes()
  const [oh, om] = slot.open.split(':').map(Number)
  const [ch, cm] = slot.close.split(':').map(Number)
  return mins >= oh * 60 + om && mins < ch * 60 + cm
}

// Buildings with hours — computed lazily
let _buildingsWithHours = []
_buildingsReady.then(({ buildings }) => { _buildingsWithHours = buildings.filter(b => b.hours) })
const _namedStreetCount = new Set(streetsData.streets.map(s => s.name).filter(Boolean)).size

// ============ COLLAPSIBLE SECTION ============

function CollapsibleSection({ title, defaultOpen = false, bg = '', highlight = false, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`border-t border-outline-variant ${bg}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-surface-container transition-colors"
        aria-expanded={open}
      >
        <span className={`text-caption uppercase tracking-widest ${highlight ? 'text-on-surface-variant font-semibold' : 'text-on-surface-disabled'}`}>{title}</span>
        <svg
          className={`w-3 h-3 text-on-surface-disabled transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`overflow-hidden transition-all duration-200 ease-out ${open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {children}
      </div>
    </div>
  )
}

// ============ ALMANAC TAB ============

function AlmanacTab() {
  const { currentTime, setTime, isLive } = useTimeOfDay()
  const [use24Hour, setUse24Hour] = useState(false)
  const [useCelsius, setUseCelsius] = useState(false)

  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => useTimeOfDay.getState().returnToLive(), 1000)
    return () => clearInterval(interval)
  }, [isLive])

  const sunTimes = SunCalc.getTimes(currentTime, LATITUDE, LONGITUDE)
  const moonIllum = SunCalc.getMoonIllumination(currentTime)
  const moonPhase = getMoonPhase(moonIllum.phase)

  const timeString = (() => {
    const raw = currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: !use24Hour,
    })
    // Strip AM/PM suffix
    return raw.replace(/\s?(AM|PM)$/i, '')
  })()

  const dateString = currentTime.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const dayOfYear = Math.floor(
    (currentTime - new Date(currentTime.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  )

  // Weather: live from store, or interpolated from forecast when scrubbing
  const liveTemp = useSkyState((s) => s.temperatureF)
  const liveCode = useSkyState((s) => s.currentWeatherCode)
  const hourlyForecast = useSkyState((s) => s.hourlyForecast)
  const sunElevation = useSkyState((s) => s.sunElevation)
  const isNight = sunElevation < -0.12

  const displayWeather = useMemo(() => {
    if (isLive) {
      return { temperatureF: liveTemp, weatherCode: liveCode }
    }
    const interp = interpolateForecast(currentTime, hourlyForecast)
    if (interp) return { temperatureF: interp.temperatureF, weatherCode: interp.weatherCode }
    return { temperatureF: liveTemp, weatherCode: liveCode }
  }, [isLive, currentTime, hourlyForecast, liveTemp, liveCode])

  const condition = getWeatherCondition(displayWeather.weatherCode ?? 0)
  const headerTempF = displayWeather.temperatureF != null ? Math.round(displayWeather.temperatureF) : null
  const headerTempC = headerTempF != null ? Math.round((headerTempF - 32) * 5 / 9) : null
  const headerTemp = headerTempF != null ? (useCelsius ? headerTempC : headerTempF) : '--'
  const headerTempColor = headerTempF == null ? 'text-on-surface-subtle'
    : headerTempF <= 32 ? 'text-blue-400'
    : headerTempF <= 55 ? 'text-sky-300'
    : headerTempF <= 75 ? 'text-on-surface'
    : headerTempF <= 90 ? 'text-amber-400'
    : 'text-red-400'

  // Day length
  const dayLengthMs = sunTimes.sunset - sunTimes.sunrise
  const dayLengthMin = Math.round(dayLengthMs / 60000)
  const dayH = Math.floor(dayLengthMin / 60)
  const dayM = dayLengthMin % 60

  const [almanacView, setAlmanacView] = useState('weather')
  const weatherRef = useRef(null)

  // Measure weather content height — shared via AlmanacTab._weatherHeight
  useEffect(() => {
    if (almanacView !== 'weather' || !weatherRef.current) return
    const el = weatherRef.current
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight
      if (h > 0) {
        AlmanacTab._weatherHeight = h
        useCamera.setState({ almanacMiniPx: h })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [almanacView])

  // Toggle is driven by re-tapping the Almanac tab — no subtab buttons needed
  const toggleView = useCallback(() => {
    setAlmanacView(v => v === 'weather' ? 'celestial' : 'weather')
  }, [])

  // Expose toggle so the tab bar can call it
  AlmanacTab.toggle = toggleView

  return (
    <div className="flex flex-col h-full min-h-0">

      <div className="flex-1 overflow-y-auto min-h-0">

      {almanacView === 'weather' && (
        <div ref={weatherRef}>
        {/* ── Time + Weather + Temp ── */}
        <div className="px-4 py-3 border-b border-outline-variant">
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => setUse24Hour(!use24Hour)}
              title="Click to toggle 12/24 hour format"
            >
              <svg className="w-4 h-4 text-on-surface-subtle flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" strokeLinecap="round" />
              </svg>
              <span className="text-display font-light text-on-surface tracking-wider">
                {timeString}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <WeatherIcon
                code={displayWeather.weatherCode}
                isNight={isNight}
                size={36}
              />
              <span className="text-body-sm text-on-surface-subtle">{condition.label}</span>
            </div>
            <div
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => setUseCelsius(!useCelsius)}
              title="Click to toggle °F / °C"
            >
              <svg className="w-4 h-4 text-on-surface-subtle flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M14 14.76V3.5a2 2 0 0 0-4 0v11.26a4.5 4.5 0 1 0 4 0Z" strokeLinecap="round" />
              </svg>
              <span className={`text-display font-light tracking-wide ${headerTempColor}`}>
                {headerTemp}&deg;{useCelsius ? 'C' : 'F'}
              </span>
            </div>
          </div>
        </div>
        {/* ── Timeline slider ── */}
        <div className="bg-surface-container border-b border-outline-variant">
          <WeatherTimeline
            currentTime={currentTime}
            isLive={isLive}
            useCelsius={useCelsius}
            use24Hour={use24Hour}
            onScrub={(date) => setTime(date)}
          />
        </div>
        </div>
      )}

      {almanacView === 'celestial' && (
        <div style={AlmanacTab._weatherHeight ? { height: `${AlmanacTab._weatherHeight}px`, overflow: 'hidden' } : undefined}>
          <div className="px-4 py-3 border-b border-outline-variant">
            <div className="flex items-center justify-between">
              <span className="text-display font-light text-on-surface tracking-wider">
                {dateString}
              </span>
              <span className="text-display font-light text-on-surface-variant tracking-wider tabular-nums">
                Day {dayOfYear}
              </span>
            </div>
          </div>

          <div className="px-4 py-3 flex gap-4">
            <div className="flex-1">
              <div className="text-caption text-on-surface-disabled uppercase tracking-widest mb-1">Sun</div>
              <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                <span className="text-amber-400">&uarr;</span>
                <span>{formatTimeShort(sunTimes.sunrise)}</span>
              </div>
              <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                <span className="text-orange-400">&darr;</span>
                <span>{formatTimeShort(sunTimes.sunset)}</span>
              </div>
            </div>

            <div className="flex-1">
              <div className="text-caption text-on-surface-disabled uppercase tracking-widest mb-1">Moon</div>
              <div className="flex items-center gap-2">
                <span className="text-display leading-none">{moonPhase.icon}</span>
                <div>
                  <div className="text-body-sm text-on-surface-variant">{moonPhase.name}</div>
                </div>
              </div>
            </div>

            <div className="flex-1">
              <div className="text-caption text-on-surface-disabled uppercase tracking-widest mb-1">Day</div>
              <div className="text-body-sm text-on-surface-variant">{dayH}h {dayM}m</div>
              {(() => {
                const dawnMin = sunTimes.dawn.getHours() * 60 + sunTimes.dawn.getMinutes()
                const duskMin = sunTimes.dusk.getHours() * 60 + sunTimes.dusk.getMinutes()
                const dawnPct = (dawnMin / 1440) * 100
                const dayPct = ((duskMin - dawnMin) / 1440) * 100
                const nightPct = 100 - dawnPct - dayPct
                return (
                  <div className="flex h-[6px] rounded-full overflow-hidden mt-1.5" title={`${dayH}h ${dayM}m daylight`}>
                    <div className="bg-indigo-400/30" style={{ width: `${dawnPct}%` }} />
                    <div className="bg-amber-400/60" style={{ width: `${dayPct}%` }} />
                    <div className="bg-indigo-400/30" style={{ width: `${nightPct}%` }} />
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      </div>

    </div>
  )
}

// ============ LAFAYETTE PAGES TAB ============

// Category data and color classes now sourced from src/tokens/categories.js

const ChevronIcon = ({ expanded }) => (
  <svg
    className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

function LafayetteSubsection({ section, color, scrollToSelected }) {
  const { activeTags, toggleTag } = useLandmarkFilter()
  const deselect = useSelectedBuilding((s) => s.deselect)
  const highlight = useSelectedBuilding((s) => s.highlight)
  const selectedListingId = useSelectedBuilding((s) => s.selectedListingId)
  const flyTo = useCamera((s) => s.flyTo)
  const clearFly = useCamera((s) => s.clearFly)
  const listings = useListings((s) => s.listings)
  const colors = COLOR_CLASSES[color]
  const isActive = activeTags.has(section.id)

  const places = useMemo(() => {
    return listings.filter(l => l.subcategory === section.id)
  }, [section.id, listings])

  const handleToggleCategory = () => {
    // Clear any single-place selection
    deselect()

    // Toggle the subcategory (single-select: replaces prior)
    toggleTag(section.id)

    // If activating (not deactivating), center the whole neighborhood
    if (!isActive) {
      const cam = useCamera.getState()
      if (cam.viewMode !== 'browse') cam.setMode('browse')
      if (cam.panelState === 'full') cam.setPanelState('browse')
      const target = getNeighborhoodTarget()
      flyTo(target.position, target.lookAt)
    } else {
      clearFly()
    }
  }

  const handleSelectPlace = (biz) => {
    // Highlight the place (shows pin, card opens when clicked in 3D)
    // Don't clear tags — keep the category list intact
    highlight(biz.id, biz.building_id)
    // Switch to browse if in hero so flyTo is honored
    const cam = useCamera.getState()
    if (cam.viewMode !== 'browse') cam.setMode('browse')
    // Drop panel to browse — reveal the map, keep directory visible
    if (cam.panelState === 'full') cam.setPanelState('browse')
    // Center camera on this building
    const building = _buildingMap[biz.building_id]
    if (building) {
      const target = computeCenterOn(building)
      flyTo(target.position, target.lookAt)
    }
  }

  return (
    <div className="border-l-2 border-outline-variant ml-3">
      <button
        onClick={handleToggleCategory}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 ${
          isActive ? 'bg-surface-container-high' : 'hover:bg-surface-container'
        } cursor-pointer`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? colors.dot : 'bg-on-surface-disabled'}`} />
        <span className={`text-body-sm flex-1 ${isActive ? 'text-on-surface' : 'text-on-surface-medium'}`}>{section.name}</span>
        {places.length > 0 && <span className="text-caption text-on-surface-subtle">{places.length}</span>}
      </button>

      {(isActive || places.some(b => b.id === selectedListingId)) && places.length > 0 && (
        <div className="ml-4 mb-1">
          {places.map(biz => {
            const isFocused = selectedListingId === biz.id
            return (
              <button
                key={biz.id}
                ref={isFocused && scrollToSelected ? (el) => { if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })) } : undefined}
                onClick={() => handleSelectPlace(biz)}
                className={`w-full flex items-center gap-2 px-3 py-1 text-left transition-colors duration-150 rounded ${
                  isFocused ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                } cursor-pointer`}
              >
                <span className={`w-1 h-1 rounded-full ${isFocused ? colors.dot : 'bg-on-surface-disabled'}`} />
                <span className="text-label-sm truncate">{biz.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LafayetteCategoryAccordion({ category, isExpanded, onToggle, scrollToSelected }) {
  const listings = useListings((s) => s.listings)
  const colors = COLOR_CLASSES[category.color]

  const totalCount = useMemo(() => {
    return listings.filter(l =>
      category.sections.some(s => s.id === l.subcategory)
    ).length
  }, [category, listings])

  return (
    <div className={`border ${colors.border} rounded-xl overflow-hidden transition-all duration-200 ${isExpanded ? colors.activeBg : 'bg-surface-container'}`}>
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={`w-full flex items-center gap-3 p-3 text-left transition-colors duration-150 ${colors.hover}`}
      >
        <div className="flex-1 min-w-0">
          <div className={`text-body-sm font-medium ${colors.text}`}>{category.title}</div>
        </div>
        {totalCount > 0 && <span className="text-caption text-on-surface-disabled">{totalCount}</span>}
        <div className="text-on-surface-subtle">
          <ChevronIcon expanded={isExpanded} />
        </div>
      </button>

      <div className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-2 pb-3">
          {category.sections.map((section) => (
            <LafayetteSubsection
              key={section.id}
              section={section}
              color={category.color}
              scrollToSelected={scrollToSelected}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Shared masthead renderer ─────────────────────────────────────────
function StatsMasthead({ stats, tagline, minHeight }) {
  return (
    <div className="flex-shrink-0" style={minHeight ? { minHeight: `${minHeight}px` } : undefined}>
      <div className="px-3 pt-3.5 pb-3.5 border-b border-outline-variant">
        <div className="flex gap-2">
          {stats.map(({ value, label, color }) => (
            <div
              key={label}
              className="flex-1 min-w-0 rounded-xl px-1.5 py-2 text-center"
              style={{ backgroundColor: color }}
            >
              <div className="text-title font-light text-on-surface tracking-wide truncate">{value}</div>
              <div className="text-caption text-on-surface-disabled uppercase tracking-[0.1em] mt-0.5 truncate">{label}</div>
            </div>
          ))}
        </div>
      </div>
      {tagline && (
        <div className="px-4 py-3.5">
          <p className="text-caption text-on-surface-disabled text-center italic">{tagline}</p>
        </div>
      )}
    </div>
  )
}

// ── Society masthead ─────────────────────────────────────────────────
function SocietyMasthead() {
  const { townies, residents, guardians, couriers } = useCommunityStats()

  const stats = [
    { value: townies, label: 'Townies', color: 'rgba(194,24,91,0.12)' },      // claret
    { value: residents, label: 'Residents', color: 'rgba(122,139,111,0.12)' }, // sage
    { value: guardians, label: 'Guardians', color: 'rgba(212,163,55,0.12)' }, // gold
    { value: couriers, label: 'Couriers', color: 'rgba(61,175,138,0.12)' },   // verdigris
  ]

  const miniPx = useCamera(s => s.almanacMiniPx)
  return <StatsMasthead stats={stats} tagline="Neighborhood Directory" minHeight={miniPx} />
}

function LafayettePagesTab({ isFull, isBrowse }) {
  const [expandedId, setExpandedId] = useState(null)
  const [searchActive, setSearchActive] = useState(false)
  const [scrollToSelected, setScrollToSelected] = useState(false)
  const listings = useListings((s) => s.listings)
  const activeTags = useLandmarkFilter((s) => s.activeTags)
  const selectedListingId = useSelectedBuilding((s) => s.selectedListingId)
  const wasFull = useRef(false)

  // Detect full → half transition
  useEffect(() => {
    if (!isFull && wasFull.current) {
      setScrollToSelected(true)
      // Clear after the scroll fires
      const t = setTimeout(() => setScrollToSelected(false), 500)
      return () => clearTimeout(t)
    }
    wasFull.current = isFull
  }, [isFull])

  // Auto-expand the accordion containing the active tag or selected listing
  useEffect(() => {
    // Check active subcategory tags
    for (const tag of activeTags) {
      const parent = CATEGORY_LIST.find(c => c.sections.some(s => s.id === tag))
      if (parent) { setExpandedId(parent.id); return }
    }
    // Check selected listing
    if (selectedListingId) {
      const listing = listings.find(l => l.id === selectedListingId)
      if (listing) {
        const parent = CATEGORY_LIST.find(c => c.sections.some(s => s.id === listing.subcategory))
        if (parent) { setExpandedId(parent.id); return }
      }
    }
  }, [activeTags, selectedListingId, listings])

  const showDirectory = isFull || isBrowse

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Society masthead — hidden in browse mode */}
      {!isBrowse && <SocietyMasthead />}

      {/* Scrollable area: search bar + directory — only in full/browse */}
      {showDirectory && (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SocietySearch onSearchActive={setSearchActive} />

        {!searchActive && (
          <div className="p-2 space-y-2">
            {CATEGORY_LIST.map((category) => (
              <LafayetteCategoryAccordion
                key={category.id}
                category={category}
                isExpanded={expandedId === category.id}
                onToggle={() => setExpandedId(expandedId === category.id ? null : category.id)}
                scrollToSelected={scrollToSelected}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {(isFull || isBrowse) && !searchActive && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-outline-variant">
          <span className="text-caption text-on-surface-disabled">{listings.length} verified listings</span>
        </div>
      )}
    </div>
  )
}

// ============ BULLETIN TAB ============

// ── Bulletin masthead — neighborhood stats, matches Society box style ──
function BulletinMasthead() {
  const listings = useListings((s) => s.listings)
  const places = listings.filter(l => l.category !== 'residential').length

  const stats = [
    { value: '2,164', label: 'Residents', color: 'rgba(180,160,140,0.12)' },      // warm taupe
    { value: (_buildingCount || _buildings.length).toLocaleString(), label: 'Buildings', color: 'rgba(160,130,100,0.12)' }, // sandstone
    { value: places, label: 'Places', color: 'rgba(61,175,138,0.12)' },          // verdigris
    { value: _namedStreetCount, label: 'Streets', color: 'rgba(140,150,170,0.12)' }, // slate blue
  ]

  const miniPx = useCamera(s => s.almanacMiniPx)
  return <StatsMasthead stats={stats} tagline="Community Board" minHeight={miniPx} />
}

function BulletinTab({ isFull }) {
  const refresh = useBulletin(s => s.refresh)
  const openThread = useBulletin(s => s.openThread)
  const activeThread = useBulletin(s => s.activeThread)
  const [view, setView] = useState('browse')

  useEffect(() => {
    refresh()
    setView('browse')
  }, [refresh])

  useEffect(() => {
    if (activeThread) setView('thread-detail')
  }, [activeThread])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Demographics masthead — always visible */}
      <BulletinMasthead />

      {/* Bulletin content — only at full height */}
      {isFull && (
        <div className="flex-1 min-h-0 overflow-hidden">
          {view === 'browse' && (
            <BrowseView
              onNewPost={() => setView('new-post')}
              onOpenThreads={() => setView('threads')}
            />
          )}
          {view === 'new-post' && (
            <NewPostView onBack={() => setView('browse')} />
          )}
          {view === 'threads' && (
            <ThreadListView
              onBack={() => setView('browse')}
              onOpenThread={(id) => { openThread(id); setView('thread-detail') }}
            />
          )}
          {view === 'thread-detail' && (
            <ThreadDetailView onBack={() => { setView('threads'); useBulletin.setState({ activeThread: null }) }} />
          )}
        </div>
      )}
    </div>
  )
}

// ============ MAIN SIDEPANEL ============

const TABS = [
  { id: 'almanac', label: 'Almanac', icon: '\u25D0' },
  { id: 'bulletin', label: 'Bulletin', icon: '\u25A6' },
  { id: 'lafayettepages', label: 'Society', icon: '\u25C8' },
]

const PANEL_HEIGHTS = {
  collapsed: 'auto',
  full: 'calc(100dvh - 4rem)',  // below header
}
// neutral height is auto (content-dependent); browse height uses --panel-browse token

// Almanac never goes full — it is a masthead-only tab
const ALMANAC_ONLY_TABS = new Set(['almanac'])

// State ordering for drag snapping (per tab type)
const SOCIETY_STATES = ['neutral', 'browse', 'full']
const BULLETIN_STATES = ['neutral', 'full']

const DRAG_THRESHOLD = 40 // px — minimum drag to trigger state change
const DRAG_CLAMP = 150    // px — maximum visual displacement during drag

// Shared drag state across all tab buttons (only one can drag at a time)
const _tabDrag = { startY: 0, dragging: false, pointerId: null }

function SidePanel() {
  const activeTab = useCamera((s) => s.activeTab)
  const setActiveTab = useCallback((tab) => useCamera.setState({ activeTab: tab }), [])
  const panelState = useCamera((s) => s.panelState)
  const setPanelState = useCamera((s) => s.setPanelState)
  const collapsed = panelState === 'collapsed'
  const isNeutral = panelState === 'neutral'
  const isBrowse = panelState === 'browse'
  const isFull = panelState === 'full'
  const showCard = useSelectedBuilding((s) => s.showCard)
  const bulletinModalOpen = useBulletin((s) => s.modalOpen)
  const overlayOpen = showCard || bulletinModalOpen

  // No auto-collapse — panel state is always the user's choice

  // Glass styles: collapsed = heavy frosted glass, half/full = frosted
  const glassStyle = collapsed ? {
    background: 'rgba(10,8,6,0.65)',
    backdropFilter: 'blur(40px) saturate(120%) brightness(60%)',
    WebkitBackdropFilter: 'blur(40px) saturate(120%) brightness(60%)',
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.10)',
      '0 8px 40px rgba(0,0,0,0.5)',
      '0 2px 4px rgba(0,0,0,0.3)',
    ].join(', '),
    border: '1px solid rgba(255,255,255,0.08)',
  } : {
    background: 'var(--surface-glass)',
    backdropFilter: 'blur(20px) saturate(180%) brightness(110%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%) brightness(110%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 32px rgba(0,0,0,0.35)',
    border: '1px solid var(--outline)',
  }

  // Track actual panel height for card/modal positioning
  // Debounced to avoid per-frame setState during CSS transitions
  const panelRef = useRef(null)
  useEffect(() => {
    if (!panelRef.current) return
    const el = panelRef.current
    let raf = null
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const h = el.offsetHeight
        if (h > 0) useCamera.setState({ panelCollapsedPx: h })
      })
    })
    ro.observe(el)
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [])

  return (
    <div
      ref={panelRef}
      className="absolute left-3 right-3 bottom-3 flex flex-col select-none overflow-hidden z-50 font-mono rounded-2xl"
      style={{
        height: isFull ? undefined
          : isBrowse ? 'var(--panel-browse)'
          : 'auto',
        ...(isFull ? { top: 'var(--panel-full-top)' } : {}),
        transition: 'height var(--panel-transition), top var(--panel-transition)',
        willChange: 'transform, height',
        ...glassStyle,
      }}
    >
      {/* ── Spectral highlight — top edge shimmer ── */}
      <div
        className="absolute inset-x-0 top-0 h-[1px] pointer-events-none z-10"
        style={{
          background: collapsed
            ? 'linear-gradient(90deg, transparent 2%, rgba(255,255,255,0.5) 10%, rgba(180,220,255,0.7) 30%, rgba(255,255,255,0.6) 50%, rgba(255,220,180,0.6) 70%, rgba(255,255,255,0.5) 90%, transparent 98%)'
            : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 20%, rgba(200,220,255,0.3) 40%, rgba(255,255,255,0.25) 60%, rgba(255,220,200,0.25) 80%, transparent 100%)',
        }}
      />
      {collapsed && (
        <div
          className="absolute inset-x-4 top-[1px] h-[1px] pointer-events-none z-10 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 25%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.2) 75%, transparent 100%)',
          }}
        />
      )}

      {/* ── Glass tab bar ── */}
      <nav
        aria-label="Side panel tabs"
        className="relative flex flex-shrink-0"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onPointerDown={(e) => {
              _tabDrag.startY = e.clientY
              _tabDrag.dragging = false
              _tabDrag.pointerId = e.pointerId
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (_tabDrag.pointerId !== e.pointerId) return
              const deltaY = e.clientY - _tabDrag.startY
              if (Math.abs(deltaY) > 8) _tabDrag.dragging = true
              if (_tabDrag.dragging && panelRef.current) {
                const clamped = Math.max(-DRAG_CLAMP, Math.min(DRAG_CLAMP, deltaY))
                panelRef.current.style.transform = `translateY(${clamped}px)`
                panelRef.current.style.transition = 'none'
              }
            }}
            onPointerUp={(e) => {
              if (_tabDrag.pointerId !== e.pointerId) return
              const deltaY = e.clientY - _tabDrag.startY
              const wasDrag = _tabDrag.dragging
              _tabDrag.pointerId = null
              _tabDrag.dragging = false
              // Reset visual transform
              if (panelRef.current) {
                panelRef.current.style.transform = ''
                panelRef.current.style.transition = ''
              }
              if (!wasDrag) return // let onClick handle taps
              // Determine snap from drag
              if (Math.abs(deltaY) < DRAG_THRESHOLD) return // bounce back
              const tabId = activeTab // use current active tab for state logic
              if (ALMANAC_ONLY_TABS.has(tabId)) {
                if (deltaY < -DRAG_THRESHOLD) AlmanacTab.toggle?.()
                else if (deltaY > DRAG_THRESHOLD) setPanelState('collapsed')
                return
              }
              const states = tabId === 'bulletin' ? BULLETIN_STATES : SOCIETY_STATES
              const idx = states.indexOf(panelState)
              if (idx === -1) return
              if (deltaY < -DRAG_THRESHOLD && idx < states.length - 1) setPanelState(states[idx + 1])
              else if (deltaY > DRAG_THRESHOLD && idx > 0) setPanelState(states[idx - 1])
            }}
            onPointerCancel={() => {
              _tabDrag.pointerId = null
              _tabDrag.dragging = false
              if (panelRef.current) {
                panelRef.current.style.transform = ''
                panelRef.current.style.transition = ''
              }
            }}
            onClick={(e) => {
              if (_tabDrag.dragging) { e.preventDefault(); return } // suppress click during drag
              if (collapsed) {
                // Collapsed → neutral for any tab
                setActiveTab(tab.id)
                setPanelState('neutral')
                useUserLocation.getState().start()
              } else if (tab.id === activeTab) {
                // Re-tap same tab — cycle through states
                if (ALMANAC_ONLY_TABS.has(tab.id)) {
                  // Almanac: single tap toggles view, double-tap collapses
                  const now = Date.now()
                  const last = AlmanacTab._lastTap || 0
                  AlmanacTab._lastTap = now
                  if (now - last < 350) {
                    // Double-tap → collapse
                    setPanelState('collapsed')
                    AlmanacTab._lastTap = 0
                  } else if (isNeutral) {
                    AlmanacTab.toggle?.()  // single tap: toggle weather ↔ celestial
                  } else {
                    setPanelState('neutral')  // any other state → neutral
                  }
                } else {
                  // Society/Bulletin
                  if (isFull) setPanelState('collapsed')
                  else if (overlayOpen) setPanelState('collapsed')
                  else setPanelState('full')
                }
              } else {
                // Switch to different tab — stay at current height, cap Almanac
                setActiveTab(tab.id)
                if (ALMANAC_ONLY_TABS.has(tab.id) && (isFull || isBrowse)) {
                  setPanelState('neutral')
                }
                useUserLocation.getState().start()
              }
            }}
            className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-3 text-body-sm touch-none transition-all duration-200 ${
              activeTab === tab.id
                ? 'text-on-surface'
                : 'text-on-surface-disabled hover:text-on-surface-subtle'
            }`}
            style={activeTab === tab.id ? {
              background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)',
            } : {
              background: 'rgba(0,0,0,0.15)',
            }}
          >
            <span className="text-body">{tab.icon}</span>
            <span className="font-medium tracking-wide">{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 inset-x-0 h-[2px] bg-on-surface-variant" />
            )}
            {activeTab === tab.id && !ALMANAC_ONLY_TABS.has(tab.id) && (
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-white/30" />
            )}
          </button>
        ))}
      </nav>

      {/* ── Content body — hidden when collapsed ── */}
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden bg-surface-dim">
          {activeTab === 'almanac' && <AlmanacTab />}
          {activeTab === 'bulletin' && <BulletinTab isFull={isFull} />}
          {activeTab === 'lafayettepages' && <LafayettePagesTab isFull={isFull} isBrowse={isBrowse} />}
        </div>
      )}

      {/* ── Persistent footer — Contact icon, visible when not collapsed ── */}
      {!collapsed && (
        <div className="flex-shrink-0 flex items-center justify-end px-4 py-1.5 bg-surface border-t border-outline-variant">
          <a
            href="sms:+18773351917"
            className="text-yellow-300 hover:text-yellow-200 transition-colors flex items-center gap-1 text-caption"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
            </svg>
            Text us
          </a>
        </div>
      )}

    </div>
  )
}

export default SidePanel
