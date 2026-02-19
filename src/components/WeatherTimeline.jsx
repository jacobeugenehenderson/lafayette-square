import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import useSkyState from '../hooks/useSkyState'
import {
  getDawnWindow,
  dateToFraction,
  fractionToDate,
  getWaypoints,
  getHiLo,
} from '../lib/dawnTimeline'

function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(' ', '')
}

function formatTimeCompact(date) {
  const h = date.getHours()
  const m = date.getMinutes()
  const suffix = h >= 12 ? 'p' : 'a'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

export default function WeatherTimeline({ currentTime, isLive, useCelsius, onScrub, onReturnToLive }) {
  const [dragging, setDragging] = useState(false)
  const [scrubFraction, setScrubFraction] = useState(0)
  const rafId = useRef(null)
  const pointerStart = useRef(null)

  const hourlyForecast = useSkyState((s) => s.hourlyForecast)

  const dawnWindow = useMemo(() => getDawnWindow(currentTime), [
    currentTime.getFullYear(),
    currentTime.getMonth(),
    currentTime.getDate(),
    currentTime.getHours(),
  ])

  const waypoints = useMemo(() => getWaypoints(dawnWindow), [dawnWindow])

  // All snap targets: dawn edges + all waypoints (including ticOnly)
  const snapTargets = useMemo(() => [
    { fraction: 0, time: dawnWindow.start },
    ...waypoints.map(wp => ({ fraction: wp.fraction, time: wp.time })),
    { fraction: 1, time: dawnWindow.end },
  ], [dawnWindow, waypoints])

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

  const displayTime = dragging ? fractionToDate(scrubFraction, dawnWindow) : currentTime

  // Snap to nearest waypoint for a given fraction
  const snapToNearest = useCallback((frac) => {
    let closest = snapTargets[0]
    let minDist = Math.abs(frac - closest.fraction)
    for (const t of snapTargets) {
      const d = Math.abs(frac - t.fraction)
      if (d < minDist) { closest = t; minDist = d }
    }
    setScrubFraction(closest.fraction)
    onScrub(closest.time)
  }, [snapTargets, onScrub])

  const handleSliderChange = useCallback((e) => {
    const frac = parseInt(e.target.value) / 10000
    setScrubFraction(frac)
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      onScrub(fractionToDate(frac, dawnWindow))
    })
  }, [dawnWindow, onScrub])

  const handlePointerDown = useCallback((e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY, frac: parseInt(e.target.value) / 10000 }
    setDragging(true)
  }, [])

  const handlePointerUp = useCallback((e) => {
    setDragging(false)
    // If pointer barely moved, treat as click → snap to nearest tic
    if (pointerStart.current) {
      const dx = Math.abs(e.clientX - pointerStart.current.x)
      const dy = Math.abs(e.clientY - pointerStart.current.y)
      if (dx < 5 && dy < 5) {
        const frac = parseInt(e.target.value) / 10000
        snapToNearest(frac)
      }
      pointerStart.current = null
    }
  }, [snapToNearest])

  const isLiveMode = isLive && !dragging
  const markerColor = isLiveMode ? '#4ade80' : '#60a5fa'

  return (
    <div className="py-1">
      {/* Row 1: scrub time + Live (only when not live) */}
      {!isLive && (
        <div className="flex items-center justify-between h-5 px-4 mb-0.5">
          <span className="text-[10px] text-white/50 font-medium">{formatTime(displayTime)}</span>
          <button
            onClick={onReturnToLive}
            className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
          >
            Live
          </button>
        </div>
      )}

      {/* Row 2: waypoint labels — on zebra stripe */}
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
        <div className="absolute inset-x-0 h-[2px] bg-white/10 rounded-full top-1/2 -translate-y-1/2" />

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
