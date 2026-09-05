import { useEffect, useRef, useState } from 'react'
import SunCalc from 'suncalc'
import { INSTANCE } from '../instance.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import WeatherPoller from './WeatherPoller'
import { AlmanacTab } from './SidePanel'

const LATITUDE = INSTANCE.geography.lat
const LONGITUDE = INSTANCE.geography.lon

/**
 * ALMANAC EMBED — the neighbourhood's actual Almanac, and nothing else.
 *
 * ⭐ WHY THIS EXISTS. An embedding page needed the time control, and the first
 * attempt built one: a bare <input type="range"> over a CSS gradient, with the
 * page doing its own low-precision astronomy to caption it. It worked, and it
 * was a worse copy of an instrument that already exists. This mounts the real
 * `AlmanacTab` — the same clock, the same live temperature, the same
 * `TodStrip` whose waypoints are SunCalc's own sunrise, noon, golden, sunset,
 * dusk and night — so scrubbing the marketing page and scrubbing the Ward are
 * the same gesture on the same control.
 *
 * ⛔ DOM ONLY. No Canvas, so a second frame beside the map costs the host page
 * nothing. That is also what this file has to make up for: the two things the
 * Almanac normally reads off the scene are supplied here without one.
 */

/**
 * ⛔ THE CLOCK DOES NOT TICK WITHOUT A CANVAS, and neither does the sky.
 * `TimeTicker` and `SkyStateTicker` are `useFrame` — they only exist inside an
 * R3F root. Two consequences, and only the first is self-healing:
 *
 *  · the clock: `AlmanacTab` already runs its own 1s `returnToLive()` pump
 *    while live, so it advances here with nothing added.
 *  · the sun: `sunElevation` is pushed from `CelestialBodies`, which is in the
 *    scene. Without it the store keeps its 0.5 default forever, `isNight`
 *    never turns true, and the Almanac shows a SUN ICON AT MIDNIGHT — on a
 *    page whose entire argument is that you can move through the day.
 *
 * So this pushes the same number from the same library the scene uses, in
 * radians, keyed to the clock. ⭐ It is not a second opinion about where the
 * sun is; it is the same `SunCalc.getPosition().altitude` the scene reads,
 * arriving by the only route available with no renderer to read it off.
 */
function SunElevationDriver() {
  const currentTime = useTimeOfDay((s) => s.currentTime)
  useEffect(() => {
    const { altitude } = SunCalc.getPosition(currentTime, LATITUDE, LONGITUDE)
    useSkyState.getState().setCelestial({ sunElevation: altitude })
  }, [currentTime])
  return null
}

export default function AlmanacEmbed() {
  const boxRef = useRef(null)

  /* ⭐ THE HOST SIZES THE FRAME, BECAUSE ONLY THIS SIDE KNOWS THE HEIGHT. The
     Almanac's header row scales its own type to fit (FitRow) and the hi/lo
     labels come and go with the forecast, so any number the host hardcodes is
     wrong at some width. It measures here and says so; the host listens.
     ⛔ Not `document.documentElement.scrollHeight` — the app's wrapper is
     `h-full`, so that only ever reports the frame it is already in. */
  useEffect(() => {
    const el = boxRef.current
    if (!el || window.parent === window) return undefined
    let last = -1
    const post = () => {
      /* ⛔ scrollHeight, NOT the bounding box, AND `.embed-almanac` IS
         ABSOLUTELY POSITIONED — the two together, or the measurement LOCKS AT
         ITS FIRST READING. The hi/lo labels only exist once the forecast lands,
         so the first measure is ~18px short; the host applies it, the frame is
         now that tall, `AlmanacTab`'s `h-full` resolves to the frame, its inner
         `overflow-y-auto` swallows the difference, and the box reports the same
         short number for ever. It never grows, so the observer never fires
         again, and the temperature row sits clipped off the bottom edge. */
      const height = Math.ceil(Math.max(el.scrollHeight, el.getBoundingClientRect().height))
      if (height <= 0 || height === last) return
      last = height
      try { window.parent.postMessage({ type: 'ward-size', height }, '*') } catch { /* gone */ }
    }
    post()
    const ro = new ResizeObserver(post)
    ro.observe(el)
    /* The forecast arrives after the first paint and adds a row. A
       ResizeObserver on a box the frame is clamping cannot see that, so watch
       the subtree for it. */
    const mo = new MutationObserver(post)
    mo.observe(el, { childList: true, subtree: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])

  /* ⭐ THE ONE-TIME NUDGE. A 12px dot on a 4px rule is legible to someone who
     already knows it is a control; a first-time visitor reads it as a progress
     bar. So the host says WHEN the strip has been scrolled to (it can see that
     and we cannot, across the frame) and the handle pulses — then stops, for
     good, on the first pointer that touches this document.
     ⛔ It must never become ambient animation: this is one cue, not a loop. */
  const [cue, setCue] = useState(false)
  useEffect(() => {
    function onCue(e) {
      const m = e.data
      if (m && m.type === 'ward-cue') setCue(true)
    }
    const stop = () => setCue(false)
    window.addEventListener('message', onCue)
    window.addEventListener('pointerdown', stop, true)
    window.addEventListener('keydown', stop, true)
    return () => {
      window.removeEventListener('message', onCue)
      window.removeEventListener('pointerdown', stop, true)
      window.removeEventListener('keydown', stop, true)
    }
  }, [])

  return (
    <div ref={boxRef} className="embed-almanac w-full" data-cue={cue ? '' : undefined}>
      <WeatherPoller />
      <SunElevationDriver />
      <AlmanacTab />
    </div>
  )
}
