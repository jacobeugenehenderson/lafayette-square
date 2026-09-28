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
export function TimeTicker({ holdScrubbedTime = false } = {}) {
  const tick = useTimeOfDay((state) => state.tick)
  const lastTime = useRef(Date.now())
  useFrame(() => {
    const now = Date.now()
    const delta = now - lastTime.current
    lastTime.current = now
    if (holdScrubbedTime && !useTimeOfDay.getState().isLive) return
    tick(delta)
  })
  return null
}

/** Smooth weather interpolation. */
export function SkyStateTicker() {
  useFrame((_, delta) => useSkyState.getState().tick(Math.min(delta, 0.1)))
  return null
}
