/**
 * TownSplash — the town's emblem on the town's own sky while the town prepares out of sight, faded away as the town is
 * revealed (Town.jsx#RevealGate; Jacob, 2026-10-06/07: "the neighborhood emblem to linger there for a moment").
 *
 * ⭐ IT IS THE KIT'S ONE SPLASH, MOVED, NOT A NEW ONE: the LS player's `Splash` (src/App.jsx until 2026-10-07) — the
 * town's mark via TownMarkGlyph's badge over the sky, with stars after dark. Three things changed in the move:
 * - THE SKY IS THE TOWN'S OWN: its gradient is the town's sky model now (`skyAt`, Town.jsx#useTownSky: the resolver the
 *   3D sky draws from) at the town's minute and day — REMOVED: App.jsx's hand-copied keyframe table "matching
 *   CelestialBodies GradientSky", a second source of truth;
 * - the stars follow the town's sun altitude (the renderer's own, useTimeOfDay#getLightingPhase), from the old splash's
 *   twilight thresholds (radians below the horizon);
 * - it is driven by the startup marks, not timers: shown while the gate is armed, faded over the Look's `reveal.fade`
 *   from `ward:reveal`, then gone.
 * ⭐ THE HOST'S TYPE AND COLOUR, READ, NEVER COPIED: the splash is DOM inside the host page, so its title takes the
 * host's own tokens — the Ward's display face `--f-display` + `--display-axes` and the town's accent `--mark` (theward
 * src/styles/tokens.css; `--mark` set at boot from the town's manifest), exactly as the Ward's place card sets a name.
 * A host without them (the LS player, Preview) falls through to its own inherited type. No font name lives here.
 * The pulse is a calm breath — a slow ease-in-out glow in the town's accent, no scaling (Jacob, 2026-10-07: "easing,
 * maybe a concordant glow, slow down").
 */
import { useEffect, useState } from 'react'
import TownMarkGlyph from './TownMarkGlyph'
import { revealProgress } from '../lib/startupMarks.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCalendar from '../hooks/useCalendar'

const STARS = (() => {
  let seed = 12345   // seeded: the same sky every load
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  return Array.from({ length: 60 }, () => ({
    left: `${rand() * 100}%`, top: `${rand() * 85}%`, size: 1 + rand() * 1.5, opacity: 0.3 + rand() * 0.7,
  }))
})()
const css = (c) => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`

/** @param {{ title?: string, fadeSeconds: number, skyAt: ((minute: number, dayOfYear: number) => object) | null }} props */
export default function TownSplash({ title, fadeSeconds, skyAt }) {
  const [frame, setFrame] = useState({ opacity: 1, sky: null, stars: 0 })
  useEffect(() => {
    let id
    const tick = () => {
      const opacity = 1 - revealProgress(fadeSeconds)
      const tod = useTimeOfDay.getState()
      const sky = skyAt ? skyAt(tod.getMinuteOfDay(), useCalendar.getState().dayOfYear()) : null
      const alt = tod.getLightingPhase().sunAltitude
      setFrame({ opacity, sky, stars: Math.min(1, Math.max(0, (-alt - 0.02) / 0.10)) })
      if (opacity > 0) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [fadeSeconds, skyAt])
  const { opacity, sky, stars } = frame
  if (opacity <= 0) return null
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      // Until the town's sky channel has loaded there is nothing to draw it from: black, never a borrowed sky.
      background: sky ? `radial-gradient(ellipse at 50% 100%, ${css(sky.horizon)}, ${css(sky.high)} 70%)` : '#000',
      opacity, pointerEvents: opacity > 0.5 ? 'auto' : 'none', zIndex: 300,
    }}>
      <style>{'@keyframes town-splash-breathe { 0%, 100% { filter: drop-shadow(0 0 4px var(--mark, rgba(255,255,255,0.35))); opacity: 0.88 } 50% { filter: drop-shadow(0 0 16px var(--mark, rgba(255,255,255,0.55))); opacity: 1 } }'}</style>
      {stars > 0 && STARS.map((s, i) => (
        <div key={i} style={{ position: 'absolute', left: s.left, top: s.top, width: s.size, height: s.size, borderRadius: '9999px', background: '#fff', opacity: s.opacity * stars }} />
      ))}
      <div style={{ animation: 'town-splash-breathe 4.8s ease-in-out infinite' }}>
        <TownMarkGlyph size={72} badge />
      </div>
      {title ? <div style={{ marginTop: 18, fontFamily: 'var(--f-display)', fontVariationSettings: 'var(--display-axes)', fontWeight: 400, fontSize: '1.875rem', lineHeight: 1.1, color: 'var(--mark, rgba(255,255,255,0.85))' }}>{title}</div> : null}
    </div>
  )
}
