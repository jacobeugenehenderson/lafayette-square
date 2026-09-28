/**
 * The clock and the weather, advanced once per frame. ONE copy: production, Preview and Stage each
 * kept their own TimeTicker (BRIEF-one-town-assembly §1); <Town> mounts these, and a sky-only
 * canvas (SkyEmbed, TreeDiorama) imports them from here rather than keeping a fourth.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'

/**
 * `holdScrubbedTime`: once an operator scrubs the clock off live, it stays where they put it (Stage).
 * Without it the scrubbed moment keeps flowing at the clock's speed (the player's almanac).
 */
// ⛔ `paused`: advance NOTHING. A store update inside a frame re-renders its subscribers, R3F applies their props and
// invalidates — the next frame — so under a demand loop a ticking store keeps the canvas drawing forever, and a paused
// <Town> drew ~17 frames a second behind a full page (measured 2026-09-28, claims-a-paused-town-draws-nothing).
// Paused, the clock holds its last reading; on resume it takes the elapsed time in one step, so the town comes back at
// the right time of day.
export function TimeTicker({ holdScrubbedTime = false, paused = false } = {}) {
  const tick = useTimeOfDay((state) => state.tick)
  const lastTime = useRef(Date.now())
  useFrame(() => {
    if (paused) return
    const now = Date.now()
    const delta = now - lastTime.current
    lastTime.current = now
    if (holdScrubbedTime && !useTimeOfDay.getState().isLive) return
    tick(delta)
  })
  return null
}

/** Smooth weather interpolation. */
export function SkyStateTicker({ paused = false } = {}) {
  useFrame((_, delta) => { if (!paused) useSkyState.getState().tick(Math.min(delta, 0.1)) })
  return null
}
