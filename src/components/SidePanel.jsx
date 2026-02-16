import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import SunCalc from 'suncalc'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useBusinessState from '../hooks/useBusinessState'
import useLandmarkFilter from '../hooks/useLandmarkFilter'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useUserLocation from '../hooks/useUserLocation'
import { CATEGORY_LIST, COLOR_CLASSES } from '../tokens/categories'
import buildingsData from '../data/buildings.json'
import streetsData from '../data/streets.json'
import useListings from '../hooks/useListings'

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

// ============ BULLETIN BOARD DATA ============

const BULLETIN_SECTIONS = [
  {
    id: 'buy-nothing',
    title: 'Buy Nothing',
    posts: [
      { text: 'Free: working window AC unit, you haul \u2014 Mackay Place', age: '1h' },
      { text: 'Clothing swap this Saturday, Park Ave Community Room, 10am\u20131pm', age: '5h' },
      { text: 'Free firewood, already split, drying in my alley \u2014 come grab it', age: '1d' },
      { text: 'Lending library box restocked on Benton Place \u2014 kids books, cookbooks', age: '2d' },
      { text: 'ISO: anyone have a pressure washer I can borrow this weekend?', age: '3d' },
    ],
  },
  {
    id: 'for-sale',
    title: 'For Sale',
    posts: [
      { text: 'Vintage iron fence panels, salvaged from a Benton Place rehab \u2014 $200', age: '3h' },
      { text: 'Two matching Restoration Hardware barstools, $75 each OBO', age: '8h' },
      { text: 'Bulk mulch split \u2014 10 yards arriving Friday, $30/yard if 3+ neighbors go in', age: '1d' },
      { text: 'Original 1890s transom window, needs reglaze, $150', age: '4d' },
    ],
  },
  {
    id: 'missed-connections',
    title: 'Missed Connections',
    posts: [
      { text: 'To the guy who helped me carry groceries up Mackay in the rain \u2014 thank you, I owe you a beer', age: '2h' },
      { text: 'Woman with the three-legged dog at the park Saturday morning \u2014 your dog made my kid\'s whole week', age: '1d' },
      { text: 'Whoever left flowers on the bench at Missouri and Park \u2014 that was really beautiful', age: '3d' },
      { text: 'Lost a glove on Lafayette Ave near 18th \u2014 black leather, left hand. Sentimental value', age: '5d' },
    ],
  },
  {
    id: 'delivery-errands',
    title: 'Delivery & Errands',
    posts: [
      { text: 'Heading to Costco tomorrow 10am \u2014 happy to grab stuff, just Venmo me', age: '1h' },
      { text: 'Can someone pick up a prescription at Walgreens on Jefferson? I\'m home with a sick kid', age: '4h' },
      { text: 'Driving to IKEA Saturday, have a full SUV of room \u2014 DM if you need something', age: '1d' },
      { text: 'Weekly farmers market run \u2014 I go every Saturday at 8am, happy to add to my list', age: '2d', tag: 'Recurring' },
    ],
  },
  {
    id: 'concierge',
    title: 'Concierge',
    posts: [
      { text: 'Best plumber in the neighborhood? Leaky faucet, not urgent', age: '2h' },
      { text: 'Where do people get keys cut around here?', age: '6h' },
      { text: 'Looking for a good vet that\'s walkable from the square', age: '1d' },
      { text: 'Anyone know a notary who does house calls?', age: '2d' },
      { text: 'Rec for a tailor? Need a suit altered before a wedding', age: '4d' },
    ],
  },
  {
    id: 'business-services',
    title: 'Business Services',
    posts: [
      { text: 'CPA, 15yr resident \u2014 tax prep for neighbors, fair rates', age: '3h', tag: 'Verified' },
      { text: 'Freelance graphic designer, happy to help with flyers, logos, signage', age: '8h' },
      { text: 'Tutoring: math & science, middle/high school, $30/hr at the library', age: '1d' },
      { text: 'Notary public on Dolman \u2014 evenings and weekends, $5/stamp', age: '3d', tag: 'Verified' },
      { text: 'Estate planning attorney, free 15min consults for neighbors', age: '5d' },
    ],
  },
  {
    id: 'domestic-services',
    title: 'Domestic Services',
    posts: [
      { text: 'Licensed electrician, 20yr resident \u2014 fair rates for neighbors', age: '2h', tag: 'Verified' },
      { text: 'Experienced babysitter available weekday evenings, CPR certified', age: '6h' },
      { text: 'Dog walking, $10/walk, I know every block in the square', age: '1d' },
      { text: 'House cleaning, biweekly or monthly, references from 6 households on the square', age: '2d', tag: 'Verified' },
      { text: 'Will haul anything to the dump \u2014 truck + muscle, just ask', age: '4d' },
    ],
  },
  {
    id: 'emergency-supplies',
    title: 'Emergency Supplies',
    posts: [
      { text: 'Free hot meals every Sunday 11am at Lafayette Park gazebo', age: '2h', tag: 'Recurring' },
      { text: 'Emergency pet food available \u2014 DM for pickup, no questions asked', age: '5h' },
      { text: 'Baby formula and diapers (size 3 & 4) \u2014 free, porch pickup on Mackay', age: '1d' },
      { text: 'Need help shoveling? Text the snow hotline \u2014 volunteers on standby', age: '2d', tag: 'Active' },
      { text: 'Space heater available to loan \u2014 if your heat goes out, just call', age: '4d' },
    ],
  },
  {
    id: 'square-notes',
    title: 'Square Notes',
    posts: [
      { text: 'The hawk is back on the church steeple. Third year in a row. Magnificent.', age: '1h' },
      { text: 'Whoever is practicing trumpet on Dolman around 7pm \u2014 you\'re getting better. Keep going.', age: '3h' },
      { text: 'The magnolia on Benton Place is about to pop. Just a heads up for anyone who needs a good day.', age: '8h' },
      { text: 'Someone\'s Christmas lights are still up on Mackay. It\'s February. I\'m not mad, just impressed.', age: '1d' },
      { text: 'To the person who chalked "you are loved" on the park sidewalk \u2014 I needed that today', age: '2d' },
      { text: 'The alley cats behind Missouri Ave have formed some kind of council. There were seven of them in a circle.', age: '3d' },
    ],
  },
]

function BulletinBoard() {
  const [expandedId, setExpandedId] = useState(null)

  return (
    <div className="px-3 py-2">
      <div className="space-y-1">
        {BULLETIN_SECTIONS.map((section) => {
          const isOpen = expandedId === section.id
          return (
            <div key={section.id} className="rounded-lg overflow-hidden bg-white/5 border border-white/8">
              <button
                onClick={() => setExpandedId(isOpen ? null : section.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
              >
                <span className="text-[11px] text-white/80 flex-1">{section.title}</span>
                <span className="text-[9px] text-white/30">{section.posts.length}</span>
                <svg
                  className={`w-3 h-3 text-white/30 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className={`overflow-hidden transition-all duration-200 ease-out ${isOpen ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-3 pb-2 space-y-1.5">
                  {section.posts.map((post, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 text-[10px] text-white/60 leading-relaxed">{post.text}</div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span className="text-[9px] text-white/20">{post.age}</span>
                        {post.tag && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-white/10 text-white/40">{post.tag}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
  const { randomize, openAll, closeAll } = useBusinessState()
  const buildingIds = useRef(buildingsData.buildings.map(b => b.id))

  // Count real businesses currently open based on their hours
  const realOpenCount = useMemo(() => {
    return _buildingsWithHours.filter(b => _isWithinHours(b.hours, currentTime)).length
  }, [currentTime])

  const [sliderValue, setSliderValue] = useState(realOpenCount)

  // Keep slider >= realOpenCount when real businesses open/close
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

      <CollapsibleSection title="Bulletin Board" defaultOpen={false} highlight>
        <BulletinBoard />
      </CollapsibleSection>

      {showAdmin && (
        <CollapsibleSection title="Business Simulation" defaultOpen={false} bg="bg-white/3">
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/50">
                Open: {sliderValue.toLocaleString()} of {TOTAL_BUILDINGS.toLocaleString()}
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
        </CollapsibleSection>
      )}
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-t border-white/8 text-[10px] text-white/30 tracking-wide">
        <div>2,164 residents</div>
        <div className="mt-0.5">{buildingsData.buildings.length.toLocaleString()} buildings &middot; {streetsData.streets.length} streets</div>
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
  const selectedListingId = useSelectedBuilding((s) => s.selectedListingId)
  const flyTo = useCamera((s) => s.flyTo)
  const clearFly = useCamera((s) => s.clearFly)
  const listings = useListings((s) => s.listings)
  const colors = COLOR_CLASSES[color]
  const isActive = activeTags.has(section.id)

  const businesses = useMemo(() => {
    return listings.filter(l => l.subcategory === section.id)
  }, [section.id, listings])

  const handleToggleCategory = () => {
    // Clear any single-business selection
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

  const handleSelectBusiness = (biz) => {
    // Clear category tags — single business mode
    useLandmarkFilter.getState().clearTags()
    // Highlight the business (shows pin, card opens on building click)
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
        {businesses.length > 0 && <span className="text-[10px] text-white/40">{businesses.length}</span>}
      </button>

      {(isActive || businesses.some(b => b.id === selectedListingId)) && businesses.length > 0 && (
        <div className="ml-4 mb-1">
          {businesses.map(biz => {
            const isFocused = selectedListingId === biz.id
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

// ============ MAIN SIDEPANEL ============

const TABS = [
  { id: 'almanac', label: 'Almanac', icon: '\u25D0' },
  { id: 'lafayettepages', label: 'Society Pages', icon: '\u25C8' },
]

function SidePanel({ showAdmin = true }) {
  const [activeTab, setActiveTab] = useState('almanac')
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
        height: collapsed ? '44px' : 'calc(35dvh - 1.5rem)',
      }}
    >
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
