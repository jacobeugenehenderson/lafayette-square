import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import useSkyState from '../hooks/useSkyState'
import {
  getDawnWindow,
  dateToFraction,
  fractionToDate,
  getWaypoints,
  getHiLo,
} from '../lib/dawnTimeline'

function formatTimeCompact(date, use24Hour) {
  const h = date.getHours()
  const m = String(date.getMinutes()).padStart(2, '0')
  if (use24Hour) return `${h}:${m}`
  const suffix = h >= 12 ? 'p' : 'a'
  const h12 = h % 12 || 12
  return `${h12}:${m}${suffix}`
}

export default function WeatherTimeline({ currentTime, isLive, useCelsius, use24Hour, onScrub }) {
  const [dragging, setDragging] = useState(false)
  const [scrubFraction, setScrubFraction] = useState(0)
  const rafId = useRef(null)
  const trackRef = useRef(null)
  const boundsRef = useRef(null)

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

  // Cancel any pending RAF on unmount
  useEffect(() => {
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current) }
  }, [])

  const fractionFromPointer = useCallback((clientX) => {
    const b = boundsRef.current
    if (!b) return 0
    return Math.max(0, Math.min(1, (clientX - b.left) / b.width))
  }, [])

  const scrubTo = useCallback((frac) => {
    setScrubFraction(frac)
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      onScrub(fractionToDate(frac, dawnWindow))
    })
  }, [dawnWindow, onScrub])

  const handlePointerDown = useCallback((e) => {
    boundsRef.current = trackRef.current.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    scrubTo(fractionFromPointer(e.clientX))
  }, [fractionFromPointer, scrubTo])

  const handlePointerMove = useCallback((e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    scrubTo(fractionFromPointer(e.clientX))
  }, [fractionFromPointer, scrubTo])

  const handlePointerUp = useCallback((e) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
  }, [])

  const isLiveMode = isLive && !dragging
  const markerColor = isLiveMode ? '#4ade80' : '#60a5fa'

  return (
    <div className="py-1">
      {/* Row 1: waypoint labels */}
      <div className="relative h-4 mx-4">
        <button
          className="absolute left-0.5 text-caption leading-none text-rose-400/50 hover:text-rose-400/80 transition-colors cursor-pointer"
          onClick={() => onScrub(dawnWindow.start)}
        >
          Dawn {formatTimeCompact(dawnWindow.start, use24Hour)}
        </button>
        {waypoints.filter(wp => !wp.ticOnly).map((wp) => (
          <button
            key={wp.label}
            className="absolute -translate-x-1/2 text-caption leading-none hover:opacity-100 transition-opacity cursor-pointer"
            style={{ left: `${wp.fraction * 100}%`, color: wp.color, opacity: 0.55 }}
            onClick={() => onScrub(wp.time)}
          >
            {wp.label} {formatTimeCompact(wp.time, use24Hour)}
          </button>
        ))}
        <button
          className="absolute right-0.5 text-caption leading-none text-rose-400/50 hover:text-rose-400/80 transition-colors cursor-pointer"
          onClick={() => onScrub(dawnWindow.end)}
        >
          Dawn {formatTimeCompact(dawnWindow.end, use24Hour)}
        </button>
      </div>

      {/* Row 2: track */}
      <div
        ref={trackRef}
        role="slider"
        aria-label="Timeline scrubber"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(scrubFraction * 100)}
        tabIndex={0}
        className="relative h-8 flex items-center mx-4 cursor-pointer select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Rail */}
        <div className="absolute inset-x-0 h-[6px] bg-surface-container-high rounded-full top-1/2 -translate-y-1/2" />

        {/* End-cap stripes — taller + thicker to bookend the rail */}
        <div className="absolute left-0 w-[2px] h-[14px] bg-rose-400/50 top-1/2 -translate-y-1/2 rounded-full" />
        <div className="absolute right-0 w-[2px] h-[14px] bg-rose-400/50 top-1/2 -translate-y-1/2 rounded-full" />
        {/* Waypoint stripes */}
        {waypoints.map((wp) => (
          <div
            key={wp.label}
            className="absolute w-[2px] h-[6px] top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
            style={{ left: `${wp.fraction * 100}%`, backgroundColor: wp.color, opacity: 0.55 }}
          />
        ))}

        {/* Hi/Lo dots */}
        {hiLo && (
          <>
            <div
              className="absolute w-[6px] h-[6px] rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 border border-red-400/70"
              style={{ left: `${hiLo.hi.fraction * 100}%`, backgroundColor: 'rgba(248,113,113,0.3)' }}
            />
            <div
              className="absolute w-[6px] h-[6px] rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 border border-blue-400/70"
              style={{ left: `${hiLo.lo.fraction * 100}%`, backgroundColor: 'rgba(96,165,250,0.3)' }}
            />
          </>
        )}

        {/* Thumb */}
        <div
          className="absolute w-[14px] h-[14px] rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none border-2 shadow-sm"
          style={{
            left: `${scrubFraction * 100}%`,
            backgroundColor: markerColor,
            borderColor: dragging ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
          }}
        />
      </div>

      {/* Row 3: hi/lo labels */}
      {hiLo && (() => {
        const MIN_GAP = 0.10
        let hiPct = hiLo.hi.fraction
        let loPct = hiLo.lo.fraction
        const gap = Math.abs(hiPct - loPct)
        if (gap < MIN_GAP) {
          const mid = (hiPct + loPct) / 2
          const sign = hiPct <= loPct ? -1 : 1
          hiPct = Math.max(0.05, Math.min(0.95, mid + sign * MIN_GAP / 2))
          loPct = Math.max(0.05, Math.min(0.95, mid - sign * MIN_GAP / 2))
        }
        return (
          <div className="relative h-4 mx-4">
            <span
              className="absolute -translate-x-1/2 text-caption leading-none text-red-400/60 whitespace-nowrap"
              style={{ left: `${hiPct * 100}%` }}
            >
              Hi {Math.round(useCelsius ? (hiLo.hi.temperatureF - 32) * 5 / 9 : hiLo.hi.temperatureF)}&deg;
            </span>
            <span
              className="absolute -translate-x-1/2 text-caption leading-none text-blue-400/60 whitespace-nowrap"
              style={{ left: `${loPct * 100}%` }}
            >
              Lo {Math.round(useCelsius ? (hiLo.lo.temperatureF - 32) * 5 / 9 : hiLo.lo.temperatureF)}&deg;
            </span>
          </div>
        )
      })()}
    </div>
  )
}
