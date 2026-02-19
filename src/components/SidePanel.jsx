import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import SunCalc from 'suncalc'
import useTimeOfDay from '../hooks/useTimeOfDay'
import usePlaceState from '../hooks/usePlaceState'
import useLandmarkFilter from '../hooks/useLandmarkFilter'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useUserLocation from '../hooks/useUserLocation'
import { CATEGORY_LIST, COLOR_CLASSES } from '../tokens/categories'
import buildingsData from '../data/buildings.json'
import streetsData from '../data/streets.json'
import useListings from '../hooks/useListings'
import useBulletin from '../hooks/useBulletin'
import useGuardianStatus from '../hooks/useGuardianStatus'
import { useCodeDesk } from './CodeDeskModal'

// ── Camera helpers ──────────────────────────────────────────────────
const _buildingMap = {}
buildingsData.buildings.forEach(b => { _buildingMap[b.id] = b })

// Neighborhood bounding box (precomputed once)
const _neighborhoodBounds = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const b of buildingsData.buildings) {
    minX = Math.min(minX, b.position[0])
    maxX = Math.max(maxX, b.position[0])
    minZ = Math.min(minZ, b.position[2])
    maxZ = Math.max(maxZ, b.position[2])
  }
  return { minX, maxX, minZ, maxZ }
})()

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

// Center on a single building at a comfortable contextual distance
function computeCenterOn(building) {
  const x = building.position[0]
  const z = building.position[2]
  const height = 450
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

// Simulated temperature for St. Louis, MO based on seasonal + diurnal cycles
// Monthly averages modeled from NOAA climate data for downtown STL
function getTemperatureF(date) {
  const dayOfYear = Math.floor(
    (date - new Date(date.getFullYear(), 0, 0)) / 86400000
  )
  const hour = date.getHours() + date.getMinutes() / 60

  // Seasonal: peaks ~Jul 21 (day 202), troughs ~Jan 21 (day 21)
  const seasonal = Math.sin(((dayOfYear - 111) / 365) * 2 * Math.PI)

  // Daily average: annual mean 57°F, ±24°F seasonal swing
  const dailyAvg = 57 + 24 * seasonal

  // Diurnal: peaks ~3pm, troughs ~5am
  const diurnal = Math.sin(((hour - 9) / 24) * 2 * Math.PI)
  const diurnalSwing = 8 + seasonal * 1.5 // ±6.5°F winter to ±9.5°F summer

  return Math.round(dailyAvg + diurnalSwing * diurnal)
}

function formatTimeShort(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(' ', '')
}


// ── Responsive time slider (local state, RAF-throttled store updates) ──

function TimeSlider({ minutes: externalMinutes }) {
  const [localMin, setLocalMin] = useState(externalMinutes)
  const dragging = useRef(false)
  const rafId = useRef(null)

  // Sync from store when not dragging
  useEffect(() => {
    if (!dragging.current) setLocalMin(externalMinutes)
  }, [externalMinutes])

  const pushToStore = useCallback((val) => {
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      useTimeOfDay.getState().setMinuteOfDay(val)
    })
  }, [])

  const formatSliderTime = (m) => {
    const h = Math.floor(m / 60) % 24
    const mm = m % 60
    return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`
  }

  return (
    <>
      <div className="text-center text-xs text-white/60 mb-1 font-mono">{formatSliderTime(localMin)}</div>
      <input
        type="range"
        min="0"
        max="1440"
        step="1"
        value={localMin}
        onChange={(e) => {
          const v = parseInt(e.target.value)
          setLocalMin(v)
          pushToStore(v)
        }}
        onPointerDown={() => { dragging.current = true }}
        onPointerUp={() => { dragging.current = false }}
        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      <div className="flex justify-between text-[9px] text-white/30 mt-1">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </>
  )
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

// Pre-compute which buildings have real hours data
const _buildingsWithHours = buildingsData.buildings.filter(b => b.hours)
const TOTAL_BUILDINGS = buildingsData.buildings.length

// ============ BULLETIN BOARD BUTTON ============

// ============ COLLAPSIBLE SECTION ============

function CollapsibleSection({ title, defaultOpen = false, bg = '', highlight = false, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`border-t border-white/5 ${bg}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
      >
        <span className={`text-[10px] uppercase tracking-widest ${highlight ? 'text-white/60 font-semibold' : 'text-white/30'}`}>{title}</span>
        <svg
          className={`w-3 h-3 text-white/20 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
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

function AlmanacTab({ showAdmin = false }) {
  const { currentTime, setTime, setHour } = useTimeOfDay()
  const [useRealTime, setUseRealTime] = useState(true)
  const [use24Hour, setUse24Hour] = useState(false)
  const [useCelsius, setUseCelsius] = useState(false)
  const openCodeDesk = useCodeDesk((s) => s.setOpen)
  const { randomize, openAll, closeAll } = usePlaceState()
  const buildingIds = useRef(buildingsData.buildings.map(b => b.id))

  // Count real places currently open based on their hours
  const realOpenCount = useMemo(() => {
    return _buildingsWithHours.filter(b => _isWithinHours(b.hours, currentTime)).length
  }, [currentTime])

  const [sliderValue, setSliderValue] = useState(realOpenCount)

  // Keep slider >= realOpenCount when real places open/close
  useEffect(() => {
    setSliderValue(v => Math.max(v, realOpenCount))
  }, [realOpenCount])

  useEffect(() => {
    if (!useRealTime) return
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [useRealTime, setTime])

  const sunTimes = SunCalc.getTimes(currentTime, LATITUDE, LONGITUDE)
  const moonIllum = SunCalc.getMoonIllumination(currentTime)
  const moonPhase = getMoonPhase(moonIllum.phase)

  const hours = currentTime.getHours()
  const minutes = currentTime.getMinutes()

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="px-4 py-3 border-b border-white/10 bg-white/4">
        <div className="flex items-baseline justify-between">
          <div
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setUse24Hour(!use24Hour)}
            title="Click to toggle 12/24 hour format"
          >
            <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" strokeLinecap="round" />
            </svg>
            <span className="text-2xl font-light text-white tracking-wider">
              {timeString}
            </span>
          </div>
          {(() => {
            const tempF = getTemperatureF(currentTime)
            const tempC = Math.round((tempF - 32) * 5 / 9)
            const temp = useCelsius ? tempC : tempF
            const unit = useCelsius ? 'C' : 'F'
            const color = tempF <= 32 ? 'text-blue-400' : tempF <= 55 ? 'text-sky-300' : tempF <= 75 ? 'text-white/90' : tempF <= 90 ? 'text-amber-400' : 'text-red-400'
            return (
              <div
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
                onClick={() => setUseCelsius(!useCelsius)}
                title="Click to toggle °F / °C"
              >
                <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M12 2v14m0 0a4 4 0 110 0m-3-11h6M9 8h6" strokeLinecap="round" />
                </svg>
                <span className={`text-2xl font-light tracking-wide ${color}`}>
                  {temp}&deg;{unit}
                </span>
              </div>
            )
          })()}
        </div>
        <div className="text-xs text-white/40 mt-1 tracking-wide">
          {dateString} &middot; Day {dayOfYear}
        </div>
      </div>

      <div className="px-4 py-3 flex gap-6">
        <div className="flex-1">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Sun</div>
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span className="text-amber-400">&uarr;</span>
            <span>{formatTimeShort(sunTimes.sunrise)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span className="text-orange-400">&darr;</span>
            <span>{formatTimeShort(sunTimes.sunset)}</span>
          </div>
        </div>

        <div className="flex-1">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Moon</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{moonPhase.icon}</span>
            <div>
              <div className="text-xs text-white/70">{moonPhase.name}</div>
              <div className="text-[10px] text-white/40">{Math.round(moonIllum.fraction * 100)}% illuminated</div>
            </div>
          </div>
        </div>
      </div>


      <div className="px-4 py-2 border-t border-white/8 bg-white/4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-white/30 uppercase tracking-widest">Lighting</span>
          {!useRealTime && (
            <button
              onClick={() => {
                setUseRealTime(true)
                useTimeOfDay.getState().setPaused(false)
                setTime(new Date())
              }}
              className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
            >
              Return to Live
            </button>
          )}
        </div>
        <div className="flex justify-between text-[10px]">
          {[
            { label: 'Dawn', color: 'text-rose-400/60', time: sunTimes.dawn },
            { label: 'Noon', color: 'text-orange-400/60', time: sunTimes.solarNoon },
            { label: 'Golden', color: 'text-amber-400/60', time: sunTimes.goldenHour },
            { label: 'Dusk', color: 'text-purple-400/60', time: sunTimes.dusk },
          ].map(({ label, color, time }) => (
            <button
              key={label}
              className="hover:bg-white/10 rounded px-1.5 py-0.5 transition-colors"
              onClick={() => {
                setUseRealTime(false)
                setTime(time)
              }}
            >
              <span className={color}>{label} </span>
              <span className="text-white/40">{formatTimeShort(time)}</span>
            </button>
          ))}
        </div>
        {!useRealTime && (
          <div className="mt-2">
            <TimeSlider minutes={hours * 60 + minutes} />
          </div>
        )}
      </div>

      <div className="border-t border-white/5">
        <button
          onClick={() => useBulletin.getState().setModalOpen(true)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
        >
          <span className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">Bulletin Board</span>
          <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {showAdmin && (
        <CollapsibleSection title="Admin" defaultOpen={false} bg="bg-white/3">
          <div className="px-4 pb-3 space-y-3">
            <button
              onClick={() => openCodeDesk(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/8 hover:bg-white/15 text-[10px] text-white/60 hover:text-white/80 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              QR Generator
            </button>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white/50">
                  Storefront Simulation — Open: {sliderValue.toLocaleString()} of {TOTAL_BUILDINGS.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min={realOpenCount}
                max={TOTAL_BUILDINGS}
                step="1"
                value={sliderValue}
                onChange={(e) => setSliderValue(parseInt(e.target.value))}
                onMouseUp={() => {
                  const simExtra = sliderValue - realOpenCount
                  const simPct = TOTAL_BUILDINGS > realOpenCount
                    ? (simExtra / (TOTAL_BUILDINGS - realOpenCount)) * 100
                    : 0
                  randomize(buildingIds.current, simPct)
                }}
                onTouchEnd={() => {
                  const simExtra = sliderValue - realOpenCount
                  const simPct = TOTAL_BUILDINGS > realOpenCount
                    ? (simExtra / (TOTAL_BUILDINGS - realOpenCount)) * 100
                    : 0
                  randomize(buildingIds.current, simPct)
                }}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    const simExtra = sliderValue - realOpenCount
                    const simPct = TOTAL_BUILDINGS > realOpenCount
                      ? (simExtra / (TOTAL_BUILDINGS - realOpenCount)) * 100
                      : 0
                    randomize(buildingIds.current, simPct)
                  }}
                  className="flex-1 text-[10px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                >
                  Randomize
                </button>
                <button
                  onClick={() => { openAll(buildingIds.current); setSliderValue(TOTAL_BUILDINGS) }}
                  className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                >
                  All
                </button>
                <button
                  onClick={() => { closeAll(); setSliderValue(realOpenCount) }}
                  className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                >
                  Actual
                </button>
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-t border-white/8 text-[10px] text-white/30 tracking-wide flex flex-wrap items-center gap-x-1">
        <span>2,164 residents</span>
        <span>&middot;</span>
        <span>{buildingsData.buildings.length.toLocaleString()} buildings</span>
        <span>&middot;</span>
        <span>{streetsData.streets.length} streets</span>
        <span>&middot;</span>
        <span>38.62&deg;N 90.22&deg;W</span>
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

function LafayetteSubsection({ section, color }) {
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
      const target = getNeighborhoodTarget()
      flyTo(target.position, target.lookAt)
    } else {
      clearFly()
    }
  }

  const handleSelectPlace = (biz) => {
    // Clear category tags — single place mode
    useLandmarkFilter.getState().clearTags()
    // Highlight the place (shows pin, card opens on building click)
    highlight(biz.id, biz.building_id)
    // Switch to browse if in hero so flyTo is honored
    const cam = useCamera.getState()
    if (cam.viewMode !== 'browse') cam.setMode('browse')
    // Center camera on this building
    const building = _buildingMap[biz.building_id]
    if (building) {
      const target = computeCenterOn(building)
      flyTo(target.position, target.lookAt)
    }
  }

  return (
    <div className="border-l-2 border-white/5 ml-3">
      <button
        onClick={handleToggleCategory}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 ${
          isActive ? 'bg-white/10' : 'hover:bg-white/5'
        } cursor-pointer`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? colors.dot : 'bg-white/30'}`} />
        <span className={`text-xs flex-1 ${isActive ? 'text-white' : 'text-white/80'}`}>{section.name}</span>
        {places.length > 0 && <span className="text-[10px] text-white/40">{places.length}</span>}
      </button>

      {(isActive || places.some(b => b.id === selectedListingId)) && places.length > 0 && (
        <div className="ml-4 mb-1">
          {places.map(biz => {
            const isFocused = selectedListingId === biz.id
            return (
              <button
                key={biz.id}
                onClick={() => handleSelectPlace(biz)}
                className={`w-full flex items-center gap-2 px-3 py-1 text-left transition-colors duration-150 rounded ${
                  isFocused ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                } cursor-pointer`}
              >
                <span className={`w-1 h-1 rounded-full ${isFocused ? colors.dot : 'bg-white/20'}`} />
                <span className="text-[11px] truncate">{biz.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LafayetteCategoryAccordion({ category, isExpanded, onToggle }) {
  const listings = useListings((s) => s.listings)
  const colors = COLOR_CLASSES[category.color]

  const totalCount = useMemo(() => {
    return listings.filter(l =>
      category.sections.some(s => s.id === l.subcategory)
    ).length
  }, [category, listings])

  return (
    <div className={`border ${colors.border} rounded-xl overflow-hidden transition-all duration-200 ${isExpanded ? colors.activeBg : 'bg-white/5'}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 p-3 text-left transition-colors duration-150 ${colors.hover}`}
      >
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium ${colors.text}`}>{category.title}</div>
        </div>
        {totalCount > 0 && <span className="text-[10px] text-white/30">{totalCount}</span>}
        <div className="text-white/40">
          <ChevronIcon expanded={isExpanded} />
        </div>
      </button>

      <div className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-2 pb-3">
          {category.sections.map((section) => (
            <LafayetteSubsection
              key={section.id}
              section={section}
              color={category.color}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function LafayettePagesTab() {
  const [expandedId, setExpandedId] = useState(null)
  const { activeTags, clearTags } = useLandmarkFilter()
  const listings = useListings((s) => s.listings)
  const hasActiveTags = activeTags.size > 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-2">
          {CATEGORY_LIST.map((category) => (
            <LafayetteCategoryAccordion
              key={category.id}
              category={category}
              isExpanded={expandedId === category.id}
              onToggle={() => setExpandedId(expandedId === category.id ? null : category.id)}
            />
          ))}
        </div>
      </div>
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-white/30">{listings.length} verified listings</span>
        {hasActiveTags && (
          <button
            onClick={clearTags}
            className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ============ ADDRESS SEARCH ============

// Pre-build search index: address + id for each building
const _searchIndex = buildingsData.buildings.map(b => ({
  id: b.id,
  address: (b.address || '').toUpperCase(),
  text: `${(b.address || '')} ${b.id}`.toUpperCase(),
}))

function AddressSearch() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const flyTo = useCamera((s) => s.flyTo)
  const highlight = useSelectedBuilding((s) => s.highlight)

  const results = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toUpperCase()
    const terms = q.split(/\s+/)
    return _searchIndex
      .filter(entry => terms.every(t => entry.text.includes(t)))
      .slice(0, 5)
  }, [query])

  const selectBuilding = useCallback((entry) => {
    const building = _buildingMap[entry.id]
    if (!building) return
    const cam = useCamera.getState()
    if (cam.viewMode !== 'browse') cam.setMode('browse')
    const target = computeCenterOn(building)
    flyTo(target.position, target.lookAt)
    highlight(null, entry.id)
    setQuery('')
    inputRef.current?.blur()
  }, [flyTo, highlight])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      selectBuilding(results[0])
    } else if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
    }
  }, [results, selectBuilding])

  const showDropdown = focused && results.length > 0

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 mx-2 mt-2 mb-1 rounded-xl bg-white/10 backdrop-blur-md border border-white/15">
        <svg className="w-3.5 h-3.5 text-white/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Search address or building ID..."
          className="flex-1 bg-transparent text-[11px] text-white/80 placeholder-white/25 outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/60 text-xs">
            &times;
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 bottom-full mb-px bg-black/80 backdrop-blur-xl rounded-t-lg border border-white/15 overflow-hidden z-50">
          {results.map((entry) => (
            <button
              key={entry.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectBuilding(entry)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-white/10 transition-colors"
            >
              <span className="text-[11px] text-white/70 truncate">{entry.address || entry.id}</span>
              <span className="text-[9px] text-white/30 flex-shrink-0 ml-2">{entry.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ MAIN SIDEPANEL ============

const TABS = [
  { id: 'almanac', label: 'Almanac', icon: '\u25D0' },
  { id: 'lafayettepages', label: 'Society Pages', icon: '\u25C8' },
]

function SidePanel() {
  const [activeTab, setActiveTab] = useState('almanac')
  const { isAdmin: isStoreAdmin } = useGuardianStatus()
  const showAdmin = import.meta.env.DEV || isStoreAdmin
  const panelOpen = useCamera((s) => s.panelOpen)
  const setPanelOpen = useCamera((s) => s.setPanelOpen)
  const collapsed = !panelOpen
  const setCollapsed = (val) => {
    if (!val) useUserLocation.getState().start()
    setPanelOpen(!val)
  }
  const dragRef = useRef(null)

  // Touch drag to collapse/expand
  const handleTouchStart = (e) => {
    dragRef.current = { startY: e.touches[0].clientY, moved: false }
  }

  const handleTouchMove = (e) => {
    if (!dragRef.current) return
    const dy = e.touches[0].clientY - dragRef.current.startY
    if (Math.abs(dy) > 30) dragRef.current.moved = true
  }

  const handleTouchEnd = (e) => {
    if (!dragRef.current) return
    const dy = e.changedTouches[0].clientY - dragRef.current.startY
    if (Math.abs(dy) > 40) {
      // Drag down = collapse, drag up = expand
      setCollapsed(dy > 0)
    }
    dragRef.current = null
  }

  return (
    <div
      className="absolute bottom-3 left-3 right-3 flex flex-col select-none bg-white/8 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden z-50 transition-all duration-300 ease-out"
      style={{
        fontFamily: 'ui-monospace, monospace',
        height: collapsed ? '76px' : 'calc(35dvh - 1.5rem)',
      }}
    >
      {/* <AddressSearch /> */}
      <div
        className="flex border-b border-white/15 flex-shrink-0 cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (collapsed) {
                setActiveTab(tab.id)
                setCollapsed(false)
              } else if (tab.id === activeTab) {
                setCollapsed(true)
              } else {
                setActiveTab(tab.id)
              }
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs transition-colors duration-150 ${
              activeTab === tab.id
                ? 'bg-white/12 text-white border-b-2 border-white/40'
                : 'text-white/50 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            <span className="text-sm">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className={`flex-1 min-h-0 overflow-hidden transition-opacity duration-200 ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
        {activeTab === 'almanac' && <AlmanacTab showAdmin={showAdmin} />}
        {activeTab === 'lafayettepages' && <LafayettePagesTab />}
      </div>
    </div>
  )
}

export default SidePanel
