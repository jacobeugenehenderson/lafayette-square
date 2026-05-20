import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import SunCalc from 'suncalc'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCalendar from '../hooks/useCalendar'
import {
  getDawnWindow, dateToFraction, fractionToDate,
} from '../lib/dawnTimeline'
import { NAMED_TOD_SLOTS } from '../cartograph/animatedParam'
import { INSTANCE } from '../instance.js'

const LATITUDE = INSTANCE.geography.lat
const LONGITUDE = INSTANCE.geography.lon

// Map slot ids → SunCalc time keys. Dawn is the window's left edge, not a
// SunCalc value, so it gets its own special-case below.
const SUNCALC_KEY = {
  sunrise: 'sunrise', noon: 'solarNoon', golden: 'goldenHour',
  sunset: 'sunset', dusk: 'dusk', night: 'night',
}

// Four cardinal year-anchors at solstices + equinoxes. Northern-hemisphere
// dates; the name is the season this anchor *starts*. Click an anchor name
// → year-strip thumb jumps to its day-of-year (the "first frame of the
// tween" toward the next anchor). Between anchors the matrix authoring is
// preview-only — operator must park on an anchor to edit. Matches the
// 4-layer seasonal-matrix model in Cartograph (see maxibrief 2026-05-20).
//
// Order in array = left-to-right on the year strip:
//   Spring (Mar 20) → Summer (Jun 21) → Autumn (Sep 22) → Winter (Dec 21).
// Winter sits near the right edge; the Jan-Mar wraparound region shows the
// winter season-band but no label (the anchor IS the right-edge "Winter").
const SEASON_ANCHORS = [
  { name: 'Spring', monthIdx: 2,  day: 20 },  // ~doy 79
  { name: 'Summer', monthIdx: 5,  day: 21 },  // ~doy 172
  { name: 'Autumn', monthIdx: 8,  day: 22 },  // ~doy 265
  { name: 'Winter', monthIdx: 11, day: 21 },  // ~doy 355
]

// Northern-hemisphere season day-of-year bands. Mirrors useCalendar.seasonFromDoy.
// Each entry: { name, startDoy, endDoy } where bands are inclusive and wrap winter
// at year boundary (rendered as two segments).
const SEASON_BANDS_NORTH = [
  { name: 'winter', color: 'rgba(140, 180, 220, 0.16)', startDoy: 355, endDoy: 365 },
  { name: 'winter', color: 'rgba(140, 180, 220, 0.16)', startDoy: 1,   endDoy: 78  },
  { name: 'spring', color: 'rgba(150, 210, 150, 0.16)', startDoy: 79,  endDoy: 171 },
  { name: 'summer', color: 'rgba(240, 200, 140, 0.16)', startDoy: 172, endDoy: 264 },
  { name: 'autumn', color: 'rgba(220, 150, 110, 0.16)', startDoy: 265, endDoy: 354 },
]

function daysInYear(year) {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365
}

// Build the ordered tick-time list for a dawn-to-dawn window: the 7 named
// TOD keyframes (dawn, sunrise, noon, golden, sunset, dusk, night) plus
// the next day's dawn as the wrap endpoint. Used for cross-day TOD
// semantic preservation under year scrub — the thumb stays in the same
// inter-tick neighborhood (e.g. "halfway between noon and golden") even
// as the underlying clock time recomputes for a different season's
// SunCalc table.
function buildTickTimes(window) {
  const mid = new Date((window.start.getTime() + window.end.getTime()) / 2)
  const t = SunCalc.getTimes(mid, LATITUDE, LONGITUDE)
  const ticks = [
    window.start,    // dawn
    t.sunrise,
    t.solarNoon,
    t.goldenHour,
    t.sunset,
    t.dusk,
    t.night,
    window.end,      // next-day dawn
  ].filter(d => d && !isNaN(d.getTime()))
  ticks.sort((a, b) => a.getTime() - b.getTime())
  return ticks
}

// Year-scrub helper: given the operator's current TOD (oldDate) and a new
// calendar date to scrub TO (newDateAnchor), return the clock time on the
// new date that preserves the same semantic position between named TOD
// ticks. Visual result: TOD thumb appears anchored to its keyframe
// neighborhood under year scrub instead of drifting because the dawn-to-
// dawn window length varies seasonally.
function preserveTickFraction(oldDate, newDateAnchor) {
  const oldWindow = getDawnWindow(oldDate)
  const oldTicks = buildTickTimes(oldWindow)
  const newAnchorNoon = new Date(newDateAnchor)
  newAnchorNoon.setHours(12, 0, 0, 0)
  const newWindow = getDawnWindow(newAnchorNoon)
  const newTicks = buildTickTimes(newWindow)

  // Defensive fallback: if SunCalc returned a different tick count for the
  // two days (can happen at high latitudes where some keyframes vanish),
  // fall through to clock-time preservation.
  if (oldTicks.length !== newTicks.length || oldTicks.length < 2) {
    const fallback = new Date(newDateAnchor)
    fallback.setHours(oldDate.getHours(), oldDate.getMinutes(),
      oldDate.getSeconds(), oldDate.getMilliseconds())
    return fallback
  }

  const clamped = Math.max(oldTicks[0].getTime(),
    Math.min(oldTicks[oldTicks.length - 1].getTime(), oldDate.getTime()))
  let aIdx = 0
  for (let i = 0; i < oldTicks.length - 1; i++) {
    if (clamped >= oldTicks[i].getTime() && clamped <= oldTicks[i + 1].getTime()) {
      aIdx = i; break
    }
  }
  const oldSpan = oldTicks[aIdx + 1].getTime() - oldTicks[aIdx].getTime() || 1
  const subFrac = (clamped - oldTicks[aIdx].getTime()) / oldSpan
  const newSpan = newTicks[aIdx + 1].getTime() - newTicks[aIdx].getTime()
  return new Date(newTicks[aIdx].getTime() + subFrac * newSpan)
}

function TodStrip() {
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

function YearStrip() {
  const currentDate = useCalendar((s) => s.currentDate)
  const setDate = useCalendar((s) => s.setDate)

  const year = currentDate.getFullYear()
  const total = daysInYear(year)
  const doy = useMemo(() => {
    const start = Date.UTC(year, 0, 1)
    const cur = Date.UTC(year, currentDate.getMonth(), currentDate.getDate())
    return Math.floor((cur - start) / 86400000) + 1
  }, [currentDate, year])
  const nowFrac = (doy - 1) / (total - 1)

  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const dateFromX = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return null
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const targetDoy = Math.round(frac * (total - 1)) + 1
    const anchorDate = new Date(year, 0, 1)
    anchorDate.setDate(targetDoy)
    // Preserve the TOD strip's semantic position (between named keyframes)
    // rather than raw clock time — see preserveTickFraction. New clock
    // time is SunCalc-correct for the new date.
    return preserveTickFraction(currentDate, anchorDate)
  }, [year, total, currentDate])

  // Four season-anchor markers at solstices + equinoxes. Each is a
  // click-to-jump target; the position on the strip is the day-of-year
  // for that anchor's date in the current year.
  const seasonMarkers = useMemo(() => SEASON_ANCHORS.map(a => {
    const d = new Date(year, a.monthIdx, a.day)
    const start = Date.UTC(year, 0, 1)
    const cur = Date.UTC(year, a.monthIdx, a.day)
    const anchorDoy = Math.floor((cur - start) / 86400000) + 1
    return { ...a, anchorDoy, fraction: (anchorDoy - 1) / (total - 1) }
  }), [year, total])

  const jumpToAnchor = (a) => {
    const anchorDate = new Date(year, a.monthIdx, a.day)
    setDate(preserveTickFraction(currentDate, anchorDate))
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between px-1">
        {seasonMarkers.map(a => (
          <button
            key={a.name}
            onClick={() => jumpToAnchor(a)}
            title={`Jump to ${a.name} anchor`}
            className="text-caption leading-none transition-opacity hover:opacity-100 cursor-pointer"
            style={{
              opacity: 0.85,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontSize: 9,
            }}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div
        ref={trackRef}
        className="relative h-6 flex items-center cursor-pointer select-none touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          const d = dateFromX(e.clientX)
          if (d) setDate(d)
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          const d = dateFromX(e.clientX)
          if (d) setDate(d)
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
        {SEASON_BANDS_NORTH.map((band, i) => {
          const left = (band.startDoy - 1) / (total - 1)
          const right = (band.endDoy - 1) / (total - 1)
          return (
            <div key={i}
              className="absolute h-[16px] top-1/2 -translate-y-1/2"
              style={{
                left: `${left * 100}%`,
                width: `${(right - left) * 100}%`,
                backgroundColor: band.color,
                borderRadius: 2,
              }}
            />
          )
        })}

        <div className="absolute inset-x-0 h-[4px] rounded-full top-1/2 -translate-y-1/2"
          style={{ background: 'var(--surface-container-high)' }} />

        {seasonMarkers.map(a => (
          <div key={a.name}
            className="absolute w-[2px] h-[10px] top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
            style={{ left: `${a.fraction * 100}%`, backgroundColor: 'rgba(255,255,255,0.65)' }}
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

// Header row — current time readout (click to toggle 12/24h) + ⟲ live
// affordance (snaps both clock + calendar back to wall time). When isLive
// is true the readout auto-refreshes every second via returnToLive's
// idempotent wall-time bump, mirroring the AlmanacTab pattern. No playback
// driver: the sliders themselves are the scrub surface; auto-play through
// the 2D TOD×year space added UI weight without a use case.
function TimeHeader() {
  const currentTime = useTimeOfDay((s) => s.currentTime)
  const todIsLive = useTimeOfDay((s) => s.isLive)
  const calIsLive = useCalendar((s) => s.isLive)
  const [use24Hour, setUse24Hour] = useState(false)

  // While live, advance wall-time every second so the readout stays current.
  // returnToLive only flips state if the new Date differs; cheap idempotent.
  useEffect(() => {
    if (!todIsLive) return
    const id = setInterval(() => useTimeOfDay.getState().returnToLive(), 1000)
    return () => clearInterval(id)
  }, [todIsLive])

  const timeString = (() => {
    const raw = currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !use24Hour,
    })
    return raw.replace(/\s?(AM|PM)$/i, (m) => use24Hour ? '' : m.trim().toLowerCase())
  })()

  const bothLive = todIsLive && calIsLive
  const returnToLive = () => {
    useTimeOfDay.getState().returnToLive()
    useCalendar.getState().returnToLive()
  }

  return (
    <div className="flex items-center justify-between pb-1">
      <button
        onClick={() => setUse24Hour(v => !v)}
        className="flex items-center gap-1.5 transition-opacity hover:opacity-70 cursor-pointer"
        style={{ background: 'transparent', border: 'none', padding: 0 }}
        title="Click to toggle 12/24 hour format"
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth={1.5}
          style={{ color: 'var(--on-surface-subtle)' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" strokeLinecap="round" />
        </svg>
        <span className="text-body-sm font-light tracking-wide"
          style={{ color: 'var(--on-surface)' }}>
          {timeString}
        </span>
      </button>
      <button
        onClick={returnToLive}
        disabled={bothLive}
        className="px-2 py-1 rounded text-caption transition-opacity"
        style={{
          background: 'var(--surface-container-high)',
          opacity: bothLive ? 0.4 : 1,
          cursor: bothLive ? 'default' : 'pointer',
        }}
        title="Snap both clock and calendar back to wall time"
      >
        ⟲ live
      </button>
    </div>
  )
}

export default function DawnTimeline() {
  return (
    <div className="space-y-2">
      <TimeHeader />
      <TodStrip />
      <YearStrip />
    </div>
  )
}
