import { useState, useEffect, useRef, useMemo } from 'react'
import SunCalc from 'suncalc'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useBusinessState from '../hooks/useBusinessState'
import useLandmarkFilter from '../hooks/useLandmarkFilter'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import { CATEGORY_LIST, COLOR_CLASSES } from '../tokens/categories'
import buildingsData from '../data/buildings.json'
import streetsData from '../data/streets.json'
import useBusinessData from '../hooks/useBusinessData'

// ── Camera helpers ──────────────────────────────────────────────────
const _buildingMap = {}
buildingsData.buildings.forEach(b => { _buildingMap[b.id] = b })

// Compute camera position to contain a set of building positions
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
  const span = Math.max(maxX - minX, maxZ - minZ, 60) // minimum 60m span
  const height = span * 1.4 + 80 // FOV-based: enough to contain all pins
  return {
    position: [cx, height, cz + height * 0.2],
    lookAt: [cx, 0, cz],
  }
}

function computeCenterOn(building) {
  const x = building.position[0]
  const z = building.position[2]
  return {
    position: [x, 150, z + 30],
    lookAt: [x, 0, z],
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


// ============ ALMANAC TAB ============

function AlmanacTab({ showAdmin = false }) {
  const { currentTime, setTime, setHour } = useTimeOfDay()
  const [useRealTime, setUseRealTime] = useState(true)
  const [use24Hour, setUse24Hour] = useState(false)
  const [useCelsius, setUseCelsius] = useState(false)
  const { openPercentage, setOpenPercentage, randomize, openAll, closeAll } = useBusinessState()
  const [sliderValue, setSliderValue] = useState(openPercentage)
  const buildingIds = useRef(buildingsData.buildings.map(b => b.id))

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

  const timeString = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: !use24Hour,
  })

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
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div
          className="text-3xl font-light text-white tracking-wider cursor-pointer hover:text-white/80 transition-colors"
          onClick={() => setUse24Hour(!use24Hour)}
          title="Click to toggle 12/24 hour format"
        >
          {timeString}
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


      <div
        className="px-4 py-2 border-t border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setUseCelsius(!useCelsius)}
        title="Click to toggle °F / °C"
      >
        {(() => {
          const tempF = getTemperatureF(currentTime)
          const tempC = Math.round((tempF - 32) * 5 / 9)
          const temp = useCelsius ? tempC : tempF
          const unit = useCelsius ? 'C' : 'F'
          // Color: blue below freezing, neutral mid-range, warm/hot above 80F
          const color = tempF <= 32 ? 'text-blue-400' : tempF <= 55 ? 'text-sky-300' : tempF <= 75 ? 'text-white/90' : tempF <= 90 ? 'text-amber-400' : 'text-red-400'
          return (
            <>
              <div className="flex items-center gap-2.5">
                <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M12 2v14m0 0a4 4 0 110 0m-3-11h6M9 8h6" strokeLinecap="round" />
                </svg>
                <span className={`text-lg font-light tracking-wide ${color}`}>
                  {temp}&deg;{unit}
                </span>
              </div>
              <span className="text-[10px] text-white/30">
                {useCelsius ? 'Celsius' : 'Fahrenheit'}
              </span>
            </>
          )
        })()}
      </div>

      <div className="px-4 py-2 border-t border-white/5 bg-white/5">
        <div className="flex justify-between text-[10px]">
          <div>
            <span className="text-amber-400/60">Golden </span>
            <span className="text-white/40">{formatTimeShort(sunTimes.goldenHour)}</span>
          </div>
          <div>
            <span className="text-orange-400/60">Noon </span>
            <span className="text-white/40">{formatTimeShort(sunTimes.solarNoon)}</span>
          </div>
          <div>
            <span className="text-purple-400/60">Dusk </span>
            <span className="text-white/40">{formatTimeShort(sunTimes.dusk)}</span>
          </div>
        </div>
      </div>

      {showAdmin && (
        <div className="px-4 py-3 border-t border-white/10 bg-black/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-white/30 uppercase tracking-widest">Time Control</span>
            <button
              onClick={() => setUseRealTime(!useRealTime)}
              className={`text-[10px] px-2 py-0.5 rounded ${
                useRealTime
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {useRealTime ? 'LIVE' : 'MANUAL'}
            </button>
          </div>

          {!useRealTime && (
            <>
              <input
                type="range"
                min="0"
                max="24"
                step="0.1"
                value={hours + minutes / 60}
                onChange={(e) => setHour(parseFloat(e.target.value))}
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
          )}

          <div className="mt-3 pt-3 border-t border-white/10">
            <span className="text-[10px] text-white/30 uppercase tracking-widest">Business Simulation</span>
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white/50">Open: {sliderValue}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={sliderValue}
                onChange={(e) => setSliderValue(parseInt(e.target.value))}
                onMouseUp={() => randomize(buildingIds.current, sliderValue)}
                onTouchEnd={() => randomize(buildingIds.current, sliderValue)}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => randomize(buildingIds.current, sliderValue)}
                  className="flex-1 text-[10px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                >
                  Randomize
                </button>
                <button
                  onClick={() => { openAll(buildingIds.current); setSliderValue(100) }}
                  className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                >
                  All
                </button>
                <button
                  onClick={() => { closeAll(); setSliderValue(0) }}
                  className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                >
                  None
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto px-4 py-2 border-t border-white/5 text-[10px] text-white/30 tracking-wide">
        <div>{buildingsData.buildings.length.toLocaleString()} buildings &middot; {streetsData.streets.length} streets</div>
        <div className="mt-0.5">38.62&deg;N 90.22&deg;W &middot; St. Louis, MO</div>
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
  const selectedLandmarkId = useSelectedBuilding((s) => s.selectedLandmarkId)
  const flyTo = useCamera((s) => s.flyTo)
  const clearFly = useCamera((s) => s.clearFly)
  const landmarks = useBusinessData((s) => s.landmarks)
  const colors = COLOR_CLASSES[color]
  const isActive = activeTags.has(section.id)

  const businesses = useMemo(() => {
    return landmarks.filter(l => l.subcategory === section.id)
  }, [section.id, landmarks])

  const handleToggleCategory = () => {
    // Clear any single-business selection
    deselect()

    // Toggle the subcategory (single-select: replaces prior)
    toggleTag(section.id)

    // If activating (not deactivating), zoom to fit all pins
    if (!isActive && businesses.length > 0) {
      const buildings = businesses
        .map(biz => _buildingMap[biz.building_id])
        .filter(Boolean)
      const target = computeZoomToFit(buildings)
      if (target) flyTo(target.position, target.lookAt)
    } else {
      clearFly()
    }
  }

  const handleSelectBusiness = (biz) => {
    // Clear category tags — single business mode
    useLandmarkFilter.getState().clearTags()
    // Highlight the business (shows pin, no card)
    highlight(biz.id, biz.building_id)
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
        {businesses.length > 0 && <span className="text-[10px] text-white/40">{businesses.length}</span>}
      </button>

      {(isActive || businesses.some(b => b.id === selectedLandmarkId)) && businesses.length > 0 && (
        <div className="ml-4 mb-1">
          {businesses.map(biz => {
            const isFocused = selectedLandmarkId === biz.id
            return (
              <button
                key={biz.id}
                onClick={() => handleSelectBusiness(biz)}
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
  const landmarks = useBusinessData((s) => s.landmarks)
  const colors = COLOR_CLASSES[category.color]

  const totalCount = useMemo(() => {
    return landmarks.filter(l =>
      category.sections.some(s => s.id === l.subcategory)
    ).length
  }, [category, landmarks])

  return (
    <div className={`border ${colors.border} rounded-lg overflow-hidden transition-all duration-200 ${isExpanded ? colors.activeBg : 'bg-black/40'}`}>
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
  const landmarks = useBusinessData((s) => s.landmarks)
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
        <span className="text-[10px] text-white/30">{landmarks.length} verified listings</span>
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

// ============ MAIN SIDEPANEL ============

const TABS = [
  { id: 'almanac', label: 'Almanac', icon: '\u25D0' },
  { id: 'lafayettepages', label: 'Society Pages', icon: '\u25C8' },
]

function SidePanel({ showAdmin = true }) {
  const [activeTab, setActiveTab] = useState('almanac')
  const [collapsed, setCollapsed] = useState(false)
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
      className="absolute bottom-4 left-4 w-80 flex flex-col select-none bg-black/80 backdrop-blur-md rounded-lg border border-white/10 overflow-hidden z-50 transition-all duration-300 ease-out"
      style={{
        fontFamily: 'ui-monospace, monospace',
        maxHeight: collapsed ? '44px' : 'calc(100vh - 2rem)',
      }}
    >
      <div
        className="flex border-b border-white/10 flex-shrink-0 cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { if (collapsed) setCollapsed(false); else setActiveTab(tab.id) }}
            onDoubleClick={() => { if (!collapsed) setCollapsed(true) }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs transition-colors duration-150 ${
              activeTab === tab.id
                ? 'bg-white/10 text-white border-b-2 border-white/50'
                : 'text-white/50 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            <span className="text-sm">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className={`flex-1 overflow-hidden transition-opacity duration-200 ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
        {activeTab === 'almanac' && <AlmanacTab showAdmin={showAdmin} />}
        {activeTab === 'lafayettepages' && <LafayettePagesTab />}
      </div>
    </div>
  )
}

export default SidePanel
