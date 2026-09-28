/**
 * CompassBezel — the compass: ONE dial, one look, two sizes (BRIEF-compass-bezel). A <Town> layer (opt-in).
 *
 * Jacob, 2026-09-28: "a maxi compass around the part of the map we're looking at, which is either N for people outside
 * the hood or rotates dynamically for people in the hood."
 *   plan    ON A NARROW SCREEN, the dial over the map, where and how big the APP places it. Jacob: "if we're looking
 *           at the map thru the ring it needs to be maximum size in the space; on a phone that would be a square at the
 *           top of the screen" — so `at: 'fill'` inscribes it in the map's own viewport (the app makes that viewport
 *           the square). The map shows through its middle. ON A WIDE SCREEN, nothing here: it keeps its little compass rose (the old player's
 *           CompassRose.jsx; the Ward's own port of it).
 *   street  ON A NARROW SCREEN, the same dial, small, as a badge in the app's chosen corner. A wide screen gets no
 *           compass in Street (as today: the old player shows no rose at ground level).
 *   movie   nothing (Jacob: "not in movie")
 * ⭐ THE DIAL'S TURN IS THE CAMERA'S. It reads which way the view faces from the camera every frame — so it is north-up
 * exactly when the map is (a visitor outside the town, a desktop, no sensor, permission denied), and it turns exactly
 * when the app turns the map heading-up (a device with a heading, inside the town). The kit decides neither: the
 * app's camera does, and the dial can never disagree with the map beneath it.
 *   plan: the bearing screen-up points to · street: the bearing the camera faces.
 *
 * ⭐ WHEN THE COMPASS SHOWS IS THE APP'S LAYOUT, not the device (Jacob, 2026-09-28: the ring is "narrow-screen detail, so
 * I can see it on my desktop"). The app passes `when` — the media query for its own narrow layout (the Ward: its stacked
 * Society, i.e. not its wide side-by-side breakpoint). The kit carries no breakpoint of its own, so it can never drift
 * from the app's. Narrow a desktop window and the ring appears; only its TURN needs a real heading (the camera's).
 * Never a user-agent. Re-read when the window changes.
 *
 * Props
 *   lookId       REQUIRED — the Look (its authored `compass` block, from scene.json)
 *   shot         'movie' | 'plan' | 'street'
 *   when         REQUIRED with the layer — the app's media query for "narrow" (where the compass shows)
 *   dial         REQUIRED with the layer — where the dial sits and how big, the APP's layout (it knows where its panel
 *                is; set it per shot): { at: 'fill' } — inscribed in the map's viewport, as large as it allows —
 *                or { at: 'top-center'|'top-left'|'top-right'|'bottom-left'|'bottom-right', px, inset }
 *
 * The model (ticks, 🔺, letters, colours, glow, keyline) is lib/compassBezel.js; the face, rim and shadow are the
 * host's colours via CompassBezel.css. Nothing here draws in the 3D scene.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useSceneJson } from '../lib/useSceneJson.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { bezelModel, colorPair, nightness, tierOpacity } from '../lib/compassBezel.js'
import './CompassBezel.css'

/** How far into the night the TOWN's clock is (0 day … 1 night) — a scrub moves it. */
const nightNow = () => nightness(useTimeOfDay.getState().getLightingPhase().sunAltitude)

/** The marks' colour at a nightness: day → night, lifted by the style's glow gain. */
function colorAt(style, k) {
  const { day, night } = colorPair(style.color)
  return `#${new THREE.Color(day).lerp(new THREE.Color(night), k).multiplyScalar(1 + (style.nightGlow - 1) * k).getHexString()}`
}

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3()
/**
 * Which way the view faces, degrees TRUE (north = −z in the town frame). Street: where the camera looks. Plan (looking
 * down): the bearing screen-up points to. Whichever of the two lies flatter to the ground is the view's heading.
 */
function viewBearing(camera) {
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion)
  const v = Math.hypot(_fwd.x, _fwd.z) >= Math.hypot(_up.x, _up.z) ? _fwd : _up
  return ((Math.atan2(v.x, -v.z) * 180 / Math.PI) + 360) % 360
}

/** The view's bearing and the night, as React state — re-rendered only when either moves noticeably. */
function useDialState() {
  const camera = useThree((s) => s.camera)
  const [st, setSt] = useState({ bearing: viewBearing(camera), night: nightNow() })
  useFrame(() => {
    const b = viewBearing(camera), n = nightNow()
    const db = Math.abs(((b - st.bearing + 540) % 360) - 180)
    if (db > 0.25 || Math.abs(n - st.night) > 0.02) setSt({ bearing: b, night: n })
  })
  return st
}

/** The dial, drawn at any size from the one model. `bearing` = the view's heading; the dial turns so it is at the top. */
export function BezelDial({ model, bearing, px, label, night = 0 }) {
  const { ticks, north, cardinals, face, style } = model
  const k = 50   // the SVG's own units: the rim sits at 50 from the centre of a 104-unit box
  const color = colorAt(style, night)
  const key = Math.max(style.keylineWidth * k, 0.35)   // the keyline, in dial units (never thinner than visible)
  const markY = -north.r * k, markSize = north.size * k
  const faceMid = (face.inner + face.outer) / 2 * k, faceWidth = (face.outer - face.inner) * k
  return (
    <svg className="compass-dial" viewBox="-52 -52 104 104" width={px} height={px} role="img" aria-label={label}
      style={{ '--compass-night': night.toFixed(3), '--compass-glow': night > 0 ? color : 'transparent', '--compass-keyline': style.keyline }}>
      <defs>
        {/* The face is a ring (the map shows through the middle): darker at its inner edge, lighter at the rim. */}
        <radialGradient id="compass-dial-face" gradientUnits="userSpaceOnUse" r={k}>
          <stop offset={face.inner} className="compass-dial__face-centre" />
          <stop offset={face.outer} className="compass-dial__face-rim" />
        </radialGradient>
        {/* The north mark's keyline: its silhouette, dilated, in the keyline colour, under the glyph. */}
        <filter id="compass-dial-mark-keyline" x="-30%" y="-30%" width="160%" height="160%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={key} result="grown" />
          <feFlood className="compass-dial__keyline-flood" result="ink" />
          <feComposite in="ink" in2="grown" operator="in" result="line" />
          <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle r={faceMid} fill="none" stroke="url(#compass-dial-face)" strokeWidth={faceWidth} />
      <circle r={k} className="compass-dial__rim" />
      <g transform={`rotate(${-bearing})`}>
        {ticks.map((t) => {
          const b = t.bearing * Math.PI / 180, s = Math.sin(b), c = -Math.cos(b)
          const w = Math.max(t.width * k, 0.5)
          const line = { x1: s * t.inner * k, y1: c * t.inner * k, x2: s * t.outer * k, y2: c * t.outer * k }
          return (
            <g key={t.bearing}>
              <line {...line} className="compass-dial__keyline" strokeWidth={w + 2 * key} strokeOpacity={style.keylineOpacity * tierOpacity(style, t.kind)} />
              <line {...line} stroke={color} strokeOpacity={tierOpacity(style, t.kind)} strokeWidth={w} strokeLinecap="butt" />
            </g>
          )
        })}
        {/* The north mark (one glyph, the model's); after dark a halo glows behind it — an emoji cannot be tinted. */}
        {night > 0 && <circle cx={0} cy={markY} r={markSize * 0.8} fill={style.northHalo} fillOpacity={0.45 * night} />}
        <text x={0} y={markY} fontSize={markSize} textAnchor="middle" dominantBaseline="central" filter="url(#compass-dial-mark-keyline)">{north.glyph}</text>
        {cardinals.map((cd) => {
          const b = cd.bearing * Math.PI / 180
          const x = Math.sin(b) * cd.r * k, y = -Math.cos(b) * cd.r * k
          return <text key={cd.letter} className="compass-dial__letter" x={x} y={y} transform={`rotate(${bearing} ${x} ${y})`}
            fill={color} fillOpacity={style.opacity} strokeWidth={2 * key} fontSize={cd.size * k * 1.4}
            textAnchor="middle" dominantBaseline="central">{cd.letter}</text>
        })}
      </g>
    </svg>
  )
}

/** The face's colours are the host's (CompassBezel.css): a dial mounted where the host set none says so, once. */
const HOST_TOKENS = ['--compass-face-centre', '--compass-face-rim', '--compass-rim-line', '--compass-shadow']
let _saidHost = false
function useHostTokens(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || _saidHost) return
    const cs = getComputedStyle(el)
    const missing = HOST_TOKENS.filter((t) => !cs.getPropertyValue(t).trim())
    if (missing.length) { _saidHost = true; console.error(`[CompassBezel] ⛔ the host set none of ${missing.join(' ')} — the compass face has no colours (CompassBezel.css names what a host sets)`) }
  }, [ref])
}

const PLACES = {
  fill: ['fill'], 'top-center': ['top', 'center'], 'top-left': ['top', 'left'], 'top-right': ['top', 'right'],
  'bottom-left': ['bottom', 'left'], 'bottom-right': ['bottom', 'right'],
}

function Dial({ model, placement }) {
  const { bearing, night } = useDialState()
  const size = useThree((s) => s.size)
  const box = useRef()
  useHostTokens(box)
  // Where the app put it: inscribed in the map's viewport (fill), centred along the top, or at an edge's inset.
  const fill = placement.at === 'fill'
  const px = fill ? Math.min(size.width, size.height) - 2 * (placement.inset ?? 0) : placement.px, inset = placement.inset ?? 0
  const pos = fill
    ? { left: (size.width - px) / 2, top: (size.height - px) / 2 }
    : Object.fromEntries(PLACES[placement.at].map((side) => side === 'center' ? ['left', (size.width - px) / 2] : [side, inset]))
  return (
    <Html fullscreen zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={box} className="compass-dial__box" style={{ ...pos, width: px, height: px }}>
        <BezelDial model={model} bearing={bearing} px={px} night={night} label={`Compass, facing ${Math.round(bearing)} degrees`} />
      </div>
    </Html>
  )
}

/** Does the app's media query match now? Re-read when the window changes. */
function useMedia(query) {
  const subscribe = useMemo(() => (fn) => { const mq = window.matchMedia(query); mq.addEventListener('change', fn); return () => mq.removeEventListener('change', fn) }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

export default function CompassBezel({ lookId, shot, dial, when }) {
  if (typeof when !== 'string' || !when.trim()) throw new Error('[CompassBezel] ⛔ needs `when` — the app\'s media query for its narrow layout (where the compass shows)')
  if (!lookId) throw new Error('[CompassBezel] ⛔ needs lookId')
  const scene = useSceneJson(lookId)
  const model = useMemo(() => (scene ? bezelModel(scene.compass) : null), [scene])
  const narrow = useMedia(when)
  // ONE rule for both shots: a wide screen gets no compass here — no ring in plan, no badge in Street (it keeps its rose).
  if (!model || !narrow || shot === 'movie') return null
  if (!dial || !PLACES[dial.at] || (dial.at !== 'fill' && !(dial.px > 0))) throw new Error(`[CompassBezel] ⛔ dial ${JSON.stringify(dial)} — the app places it: { at: 'fill' } or { at: ${Object.keys(PLACES).filter((k) => k !== 'fill').join(' | ')}, px, inset }`)
  if (shot === 'plan' || shot === 'street') return <Dial model={model} placement={dial} />
  return null
}
