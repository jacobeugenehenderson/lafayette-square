import { useEffect } from 'react'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCalendar from '../hooks/useCalendar'

// Shared driver for the kit-level clock + calendar anchors. Mount in
// production scenes with `mode="live"` to advance both stores from wall
// time on a `tickMs` interval. Authoring tabs leave the pump off (or mount
// in `mode="scrub"`, a no-op) and let scrub UIs drive state directly.
//
// Doctrine: one anchor, one pump, N consumer UIs. See
// meteorologist/NOTES.md 2026-05-20 ADR.
export default function ClockCalendarPump({ mode = 'scrub', tickMs = 60000 }) {
  useEffect(() => {
    if (mode !== 'live') return
    const tick = () => {
      const now = new Date()
      useTimeOfDay.getState().setTimeFromLive(now)
      useCalendar.getState().setDateFromLive(now)
    }
    tick()
    const id = setInterval(tick, tickMs)
    return () => clearInterval(id)
  }, [mode, tickMs])

  return null
}
