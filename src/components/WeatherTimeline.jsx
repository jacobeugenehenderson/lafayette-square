import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import useSkyState from '../hooks/useSkyState'
import {
  getDawnWindow,
  dateToFraction,
  fractionToDate,
  getWaypoints,
  getHiLo,
} from '../lib/dawnTimeline'

function formatTimeCompact(date) {
  const h = date.getHours()
  const m = date.getMinutes()
  const suffix = h >= 12 ? 'p' : 'a'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

export default function WeatherTimeline({ currentTime, isLive, useCelsius, onScrub }) {
  const [dragging, setDragging] = useState(false)
  const [scrubFraction, setScrubFraction] = useState(0)
  const rafId = useRef(null)

  const hourlyForecast = useSkyState((s) => s.hourlyForecast)

  const dawnWindow = useMemo(() => getDawnWindow(currentTime), [
    currentTime.getFullYear(),
    currentTime.getMonth(),
    currentTime.getDate(),
    currentTime.getHours(),
  ])

  const waypoints = useMemo(() => getWaypoints(dawnWindow), [dawnWindow])

  const hiLo = useMemo(
    () => getHiLo(dawnWindow, hourlyForecast),
    [dawnWindow, hourlyForecast]
  )

  const nowFraction = useMemo(
    () => dateToFraction(currentTime, dawnWindow),
    [currentTime, dawnWindow]
  )

  useEffect(() => {
    if (!dragging) setScrubFraction(nowFraction)
  }, [nowFraction, dragging])

  const handleSliderChange = useCallback((e) => {
    const frac = parseInt(e.target.value) / 10000
    setScrubFraction(frac)
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      onScrub(fractionToDate(frac, dawnWindow))
    })
  }, [dawnWindow, onScrub])

  const handlePointerDown = useCallback(() => {
    setDragging(true)
  }, [])

  const handlePointerUp = useCallback(() => {
    setDragging(false)
  }, [])

  const isLiveMode = isLive && !dragging
  const markerColor = isLiveMode ? '#4ade80' : '#60a5fa'

  return (
    <div className="py-1">
      {/* Row 1: waypoint labels — on zebra stripe */}
      <div className="relative h-3.5 mx-4">
        <button
          className="absolute left-0.5 text-[9px] text-rose-400/50 hover:text-rose-400/80 transition-colors cursor-pointer"
          onClick={() => onScrub(dawnWindow.start)}
        >
          Dawn {formatTimeCompact(dawnWindow.start)}
        </button>
        {waypoints.filter(wp => !wp.ticOnly).map((wp) => (
          <button
            key={wp.label}
            className="absolute -translate-x-1/2 text-[9px] hover:opacity-100 transition-opacity cursor-pointer"
            style={{ left: `${wp.fraction * 100}%`, color: wp.color, opacity: 0.55 }}
            onClick={() => onScrub(wp.time)}
          >
            {wp.label} {formatTimeCompact(wp.time)}
          </button>
        ))}
        <button
          className="absolute right-0.5 text-[9px] text-rose-400/50 hover:text-rose-400/80 transition-colors cursor-pointer"
          onClick={() => onScrub(dawnWindow.end)}
        >
          Dawn {formatTimeCompact(dawnWindow.end)}
        </button>
      </div>

      {/* Row 3: track */}
      <div className="relative h-5 flex items-center mx-4">
        <div className="absolute inset-x-0 h-[2px] bg-surface-container-high rounded-full top-1/2 -translate-y-1/2" />

        {/* Edge + waypoint tics */}
        <div className="absolute left-0 w-[1px] h-2 bg-rose-400/30 top-1/2 -translate-y-1/2" />
        <div className="absolute right-0 w-[1px] h-2 bg-rose-400/30 top-1/2 -translate-y-1/2" />
        {waypoints.map((wp) => (
          <div
            key={wp.label}
            className="absolute w-[1px] h-2 top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${wp.fraction * 100}%`, backgroundColor: wp.color, opacity: 0.35 }}
          />
        ))}

        {/* Hi/Lo dots */}
        {hiLo && (
          <>
            <div
              className="absolute w-[5px] h-[5px] rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 border border-red-400/70"
              style={{ left: `${hiLo.hi.fraction * 100}%`, backgroundColor: 'rgba(248,113,113,0.3)' }}
            />
            <div
              className="absolute w-[5px] h-[5px] rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 border border-blue-400/70"
              style={{ left: `${hiLo.lo.fraction * 100}%`, backgroundColor: 'rgba(96,165,250,0.3)' }}
            />
          </>
        )}

        {/* Precision marker */}
        <div
          className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
          style={{ left: `${scrubFraction * 100}%` }}
        >
          <svg width="7" height="4" viewBox="0 0 7 4" className="flex-shrink-0">
            <path d="M0 0 L3.5 4 L7 0" fill={markerColor} />
          </svg>
          <div className="flex-1 w-[1.5px] rounded-full" style={{ backgroundColor: markerColor }} />
          <svg width="7" height="4" viewBox="0 0 7 4" className="flex-shrink-0">
            <path d="M0 4 L3.5 0 L7 4" fill={markerColor} />
          </svg>
        </div>

        {/* Hidden range input */}
        <input
          type="range"
          min={0}
          max={10000}
          step={1}
          value={Math.round(scrubFraction * 10000)}
          onChange={handleSliderChange}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Timeline scrubber"
        />
      </div>

      {/* Row 4: hi/lo labels — on zebra stripe */}
      {hiLo && (
        <div className="relative h-3.5 mx-4">
          <span
            className="absolute -translate-x-1/2 text-[9px] text-red-400/60 whitespace-nowrap"
            style={{ left: `${hiLo.hi.fraction * 100}%` }}
          >
            Hi {Math.round(useCelsius ? (hiLo.hi.temperatureF - 32) * 5 / 9 : hiLo.hi.temperatureF)}&deg;
          </span>
          <span
            className="absolute -translate-x-1/2 text-[9px] text-blue-400/60 whitespace-nowrap"
            style={{ left: `${hiLo.lo.fraction * 100}%` }}
          >
            Lo {Math.round(useCelsius ? (hiLo.lo.temperatureF - 32) * 5 / 9 : hiLo.lo.temperatureF)}&deg;
          </span>
        </div>
      )}
    </div>
  )
}
