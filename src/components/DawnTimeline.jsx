import React, { useMemo, useRef, useState, useCallback } from 'react'
import SunCalc from 'suncalc'
import useTimeOfDay from '../hooks/useTimeOfDay'
import {
  getDawnWindow, dateToFraction, fractionToDate,
} from '../lib/dawnTimeline'
import { NAMED_TOD_SLOTS } from '../cartograph/animatedParam'

const LATITUDE = 38.6160
const LONGITUDE = -90.2161

// Map slot ids → SunCalc time keys. Dawn is the window's left edge, not a
// SunCalc value, so it gets its own special-case below.
const SUNCALC_KEY = {
  sunrise: 'sunrise', noon: 'solarNoon', golden: 'goldenHour',
  sunset: 'sunset', dusk: 'dusk', night: 'night',
}

export default function DawnTimeline() {
  const currentTime = useTimeOfDay((s) => s.currentTime)
  const setTime = useTimeOfDay((s) => s.setTime)

  const dawnWindow = useMemo(() => getDawnWindow(currentTime), [
    currentTime.getFullYear(), currentTime.getMonth(),
    currentTime.getDate(), currentTime.getHours(),
  ])

  const waypoints = useMemo(() => {
    const mid = new Date((dawnWindow.start.getTime() + dawnWindow.end.getTime()) / 2)
    const times = SunCalc.getTimes(mid, LATITUDE, LONGITUDE)
    return NAMED_TOD_SLOTS
      .map(slot => ({
        ...slot,
        time: slot.id === 'dawn' ? dawnWindow.start : times[SUNCALC_KEY[slot.id]],
      }))
      .filter(w => w.time && w.time >= dawnWindow.start && w.time <= dawnWindow.end)
      .map(w => ({ ...w, fraction: dateToFraction(w.time, dawnWindow) }))
  }, [dawnWindow])

  const nowFrac = dateToFraction(currentTime, dawnWindow)

  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const fracFromX = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const scrubTo = useCallback((frac) => {
    setTime(fractionToDate(frac, dawnWindow))
  }, [dawnWindow, setTime])

  return (
    <div className="space-y-1">
      <div className="flex justify-between px-1">
        {waypoints.map(wp => (
          <button
            key={wp.label}
            onClick={() => setTime(wp.time)}
            className="text-caption leading-none transition-opacity hover:opacity-100 cursor-pointer"
            style={{ color: wp.color, opacity: 0.75 }}
          >
            {wp.label}
          </button>
        ))}
      </div>

      <div
        ref={trackRef}
        className="relative h-6 flex items-center cursor-pointer select-none touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          scrubTo(fracFromX(e.clientX))
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          scrubTo(fracFromX(e.clientX))
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
          setDragging(false)
        }}
        onPointerCancel={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
          setDragging(false)
        }}
      >
        <div className="absolute inset-x-0 h-[4px] rounded-full top-1/2 -translate-y-1/2"
          style={{ background: 'var(--surface-container-high)' }} />

        {waypoints.map(wp => (
          <div key={wp.label}
            className="absolute w-[2px] h-[8px] top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
            style={{ left: `${wp.fraction * 100}%`, backgroundColor: wp.color, opacity: 0.5 }}
          />
        ))}

        <div
          className="absolute w-[12px] h-[12px] rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none border-2 shadow-sm"
          style={{
            left: `${nowFrac * 100}%`,
            backgroundColor: dragging ? '#60a5fa' : '#4ade80',
            borderColor: dragging ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
          }}
        />
      </div>

    </div>
  )
}
