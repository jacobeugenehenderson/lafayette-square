/**
 * Town — THE one assembly of a town's renderer. Every app that draws a town mounts this, inside its
 * own <Canvas>: production (Scene.jsx), Preview, Stage, and The Ward.
 *
 * ⛔ WHY ONE (BRIEF-one-town-assembly, 2026-09-27). Production, Preview and Stage each assembled the
 * renderer by hand, and the lists drifted: Preview drew no mountains, Stage drew other towns without
 * street labels, three copies of the clock ticked, two copies of the shadow cascades. Jacob: "the
 * 3-way renderer is an excellent example of what is forbidden: overlap and palimpsest." A piece added
 * HERE reaches every app the day it is added.
 * ▶ node checks/claims-every-app-mounts-the-town.mjs — every app mounts <Town>, none mounts a piece.
 * ▶ node checks/claims-the-town-reads-no-player-store.mjs — the renderer's inputs are these props.
 *
 * WHAT VARIES BY APP ARRIVES AS A PROP; what varies by town arrives from the slab and the town's
 * instance (`lookId`). Town poses the Canvas's default camera for its shots — the app mounts none — except with
 * flight={false}, where the app places it (Stage).
 *   town             REQUIRED — the installation's identity: a town manifest's `identity` ({ geography,
 *                    skyMode, profile, setPiece, … }). The kit's apps pass their instance module (the same
 *                    fields) — townForLook(lookId) from src/instance.js. Nothing <Town> reaches resolves a
 *                    town itself. Absent or without geography, it throws naming the prop.
 *   lookId           REQUIRED — the Look to draw (Stage passes the active one; it switches towns live)
 *   quality          a profile from lib/qualityProfile.js — a player's is deviceQuality(manifest.deployment)
 *   shot             'movie' | 'plan' | 'street'. A CHANGE FLIES (src/camera/ShotFlight.jsx): production's move, the
 *                    durations of src/camera/transitions.js, to the town's own destination for the shot.
 *   flight           true (default) flies · 'cut' lands at once · false: hands off, the app places the camera (Stage)
 *   streetAt         [x, z] town metres — where the street eye stands; required with shot='street' (null: not known yet — the
 *                    shot waits for it, as the plan waits for the disc)
 *   viewInset        { top, right, bottom, left } CSS px the app's UI covers: plan and street frame into the rest (a
 *                    camera view offset; the canvas stays full-page); the movie is full frame. Eased on the flight. The
 *                    splash's mark and title centre in the rest too, on every shot (TownSplash; its sky stays full-bleed).
 *   flightRef        a ref Town fills: { from, to, t, eased, duration, at, landed, interrupted } — at t = 0 before the first
 *                    painted frame of a flight, then every frame; `eased` is the camera's own curve (drive a panel by it)
 *   onFlightEnd      (f) => void, once per shot change: landed, or interrupted by a pointerdown / wheel
 *   frameKey         the plan's ONE move: the plan OPENS on the town's Browse frame (src/camera/browseFrame.js), or on
 *                    frameIds' frame when they are given, and frames its places again only when this changes (a Return,
 *                    a category chosen). litIds alone only light —
 *                    typing never moves the camera.
 *                    The in-plan move runs transitions.js' `frame` (1200 ms, easeInOutCubic).
 *   frameIds         what the plan frames on ENTERING and on a frameKey change, apart from what it lights — an iterable
 *                    of building ids. Given, the plan's entry flies straight to their frame in one move (Society's
 *                    arrival: "frame all, light open"). Absent: the entry opens on the Browse frame, and a frameKey
 *                    change frames litIds, else every listing. Lights nothing. ⭐ NOTHING PLACED (given but empty, or no
 *                    id or point in the town): the plan HOLDS the camera where it is, warns once, and onFramed says so
 *                    (placed 0, the disclosure) — never the Browse frame as a stand-in, never another set (Boz's ruling
 *                    (a), 2026-10-31). A cold mount still OPENS on the Browse frame: that is the designed opening shot,
 *                    not a substitute, and if the entry then finds nothing placed there is no second move.
 *   framePoints      SPOTS the plan frames as members of the set (an event's { name, point } venue): [{ id, lat, lon }],
 *                    projected once through townPlace.js#projectorOf. Alone (frameIds absent → the set is the points)
 *                    or with frameIds. Same floor and Extent; a point outside the town is DISCLOSED in onFramed.points
 *                    (never flown to). ⛔ A new framePoints moves the camera only on a frameKey change (or on entry): bump
 *                    frameKey on a spot click. ⛔ null for no spot: an EMPTY array is refused (it would enter on an empty set,
 *                    hold, and drop litIds' framing). onFramed says `held: true` when nothing was placed. ▶ node checks/claims-the-plan-frames-a-point.mjs
 *   frameMode        how the plan frames its places: 'densest' (default — the densest cluster, frameDensest; Jacob, 2026-09-28)
 *                    | 'all' — EVERY placed member, footprints and all, fitted into viewInset with the town's browse
 *                    padding (frameAll; Jacob, 2026-09-29: "Dining should frame all the bars and restaurants"). Bounded
 *                    by the Extent either way; members beyond it come back in onFramed.outside. Anything else throws.
 *                    ▶ node checks/claims-the-plan-frames-all-it-is-given.mjs
 *   frameMover       a mover's id (e.g. the reader's 'you' dot in `movers`) the plan frames WITH its places, where it stands
 *                    at that moment (Jacob, 2026-10-07: "frame them AND the place"). Same floor and Extent bound. Absent from
 *                    `movers` (no dot shown) or outside the town's disc: the places are framed alone, without a word — it is
 *                    never a place of its own. onFramed.mover says which (the id, or null). Default null.
 *                    ▶ node checks/claims-the-plan-opens-on-its-places.mjs
 *   onFramed         ({ x, z, radius, placed, of, outside, unplaced, also, mover }) => void, each time the plan frames places — the frame's
 *                    disclosure of the places it could not put down (frameIds / litIds may carry nulls; they come back unplaced)
 *   planHeading      'town' (default: the town's authored browseHeading) | 'north' | { follow: headingRef } — the
 *                    reader's TRUE heading (degrees, the direction they face; the app's compass, already smoothed),
 *                    or null (no sensor / no permission → north up). Following turns screen-up to it EVERY frame, no
 *                    flight; switching between the forms turns the map on the `frame` curve, keeping what the reader
 *                    looks at.
 *   bearingRef       a ref Town fills EVERY frame with the compass bearing of screen-up (degrees; 0 = north up) — a rose
 *   controls         true: Town mounts the kit's controls, one regime per shot (RegimeControls: movie playback · plan
 *                    · street) — an app that imports only <Town> takes them this way. Default false (the app mounts its own).
 *                    ⭐ Under prefers-reduced-motion every flight is a cut and the controls do not coast (kit-wide).
 *   movers           live dots the APP positions: [{ id, kind: 'you' | 'courier', lat, lon, active (couriers) }] — the
 *                    town projects them through its own place, seats them on its ground, draws each kind's look
 *                    (src/components/Movers.jsx); none in the movie or outside the disc. Unknown fields throw.
 *   onMovers         ([{ id, x, z, inside }]) => void, when the set, a position or the disc changes — `inside` by the
 *                    town's own disc
 *   paused           draw no frames (a full-screen overlay is up) — under a demand frameloop
 *   idle             the embedding page has scrolled us mostly out of view: draw a third of the frames
 *   selectedId       the selected building's id, or null — the app owns the selection
 *   onSelectBuilding (id) => void — a click on a building (absent: clicks select nothing)
 *   listings         REQUIRED — the town's content listings (the listings.json shape a town manifest carries):
 *                    neon reads each place's category and opening hours from them
 *   calendar         the town's PUBLISHED calendar for its displays (src/hooks/useTownCalendar.js): null while unread,
 *                    the rows, { absent } or { error }. ⛔ An app that passes none leaves it undefined, and a display that
 *                    needs a season refuses by name (src/displays/Displays.jsx). Every app mounting <Town> passes it.
 *   displaySource    where its displays read their drawers (src/displays/drawerUrl.js): 'authoring' (Stage, the dev
 *                    harnesses: the town's own drawer, live) | 'published' (Preview, the player: the bake's copy). Named by
 *                    the app, never inferred; a display with none refuses by name.
 *   litIds           Set of building ids — a chosen category, a search: their ROOFS take the town's lit
 *                    tint day and night (SlabBuildings), and only they carry neon
 *   interactive      buildings take the pointer (default true)
 *   bakeLastMs       the slab's re-read key (default: its bakedAt) — src/lib/slabUrl.js
 *   layers           visibility, default all on: ground buildings trees park lamps setPieces neon
 *                    labels sky clouds fog shadows post
 *   postFx           Preview's per-pass inspection matrix ({ toggles })
 *   overrides        Stage's live authoring channels (see OVERRIDE_KEYS) — an operator drag shows
 *                    without a bake
 *   weatherMode      'live' (default) or Stage's forced weather
 *   towerLight       the reader's Tower Light, in the plan shot: a light over the map for reading it at any hour (TowerLight.jsx).
 *                    Nothing of it loads until the first true; then it compiles (a brief pause, said through onTowerLight)
 *                    and every later toggle only moves its intensity. Default false.
 *   onTowerLight     ('warming' | 'on' | 'off') => void — what the Tower Light is doing, for the app's control
 *   holdScrubbedTime a scrubbed clock stays where the operator put it (Stage)
 *   time             the town's clock, when the APP owns it (The Ward's scrubbed time): a Date draws the town at
 *                    that instant (sky, sun, light, neon's opening hours) and nothing ticks it; null is live (the
 *                    renderer's own clock). Absent (undefined), the app drives the clock store itself (the kit's
 *                    apps). ⛔ Never with holdScrubbedTime: one writer of the town's clock. ⛔ Nothing ticks a Date: an
 *                    app whose visitor scrubs and expects the town to go on (a Light Show) passes timeOffsetMs instead.
 *   timeOffsetMs     the town's clock as an OFFSET FROM NOW (ms; 0 = live), when the APP owns it (the Ward's time bar,
 *                    2026-11-01: "we never really leave now's time we just scrub along its index"). The town shows
 *                    now + offset and keeps TICKING from there (TimeTicker, per frame), so a scrubbed show plays at frame
 *                    rate. Re-anchored to now + offset on every mount. ⚠️ Assumes the clock store's timeSpeed is 1 and it is
 *                    not paused (no app that passes an offset writes either). ⛔ Never with `time` or holdScrubbedTime.
 *   movie            optional — the app's hooks into the town's movie (MovieCamera, mounted here, once): { start
 *                    ('random' | () => seconds — Stage's playhead), onTime (Stage's scrub readout), playing (Stage's
 *                    Play; default true), hold (() => true while the app's own camera code owns it — Stage), handle
 *                    (a ref filled with { pose() }) }. The Ward passes none: shot='movie' plays the town's own path.
 *   children         the app's overlays, drawn in the town's frame (see <TownPoint>)
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { TownMoonPainter } from './TownMoon.jsx'
import { useThree } from '@react-three/fiber'
import { useTownFrame } from '../lib/useTownFrame.js'
import * as THREE from 'three'
import R3FErrorBoundary from './R3FErrorBoundary'
import { FrameBoundary } from '../lib/frameBoundary.js'
import { TownPlace, useTownLoaded } from './TownPlace.jsx'
import TowerLight from './TowerLight.jsx'
import { TownScope, SHOT_KEY } from './townContext.js'
import { TimeTicker, SkyStateTicker } from './SkyTickers.jsx'
import { QualityProvider, canvasAAMismatch, TOWN_CAMERA_NEAR_M } from '../lib/qualityProfile.js'
import useTownPlace from '../hooks/useTownPlace.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { useStreetLabels } from '../lib/streetLabels.js'
import { labelStyleOf } from '../lib/labelStyle.js'
import MovieCamera from '../camera/MovieCamera.jsx'
import ShotFlight from '../camera/ShotFlight.jsx'
import Movers from './Movers.jsx'
import RegimeControls from './RegimeControls.jsx'
import { resolveHeroKeyframes, useSceneStencil, overheadNear } from '../lib/cameraRegimes.js'
import { SHOTS_FLAT_DEFAULTS, REVEAL_FIELD_KEYS, REVEAL_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'
import { resolveGroupAtMinute } from '../cartograph/animatedParam.js'
import { createRoot } from 'react-dom/client'
import { warmImpostorLoader } from './impostorTexture.js'
import TownSplash from './TownSplash.jsx'
import MapCredit from './MapCredit.jsx'
import useCalendar from '../hooks/useCalendar'
import { titleOf as _titleOf } from '../lib/townRecord.js'
import { skyModeOf } from '../lib/skyMode'
import { ShaderLinkGuard } from '../lib/shaderLinkGuard.jsx'
import WindSheet from './WindSheet.jsx'
import { sceneExag } from '../utils/terrainShader'
import { terrainExag, terrainCeilingRaw } from '../utils/terrainShader'
import { getElevationRaw } from '../utils/elevation'
import useSkyState from '../hooks/useSkyState'
import { acquireWeatherPoll } from '../hooks/useWeather'
import { resolveSkyAtMinute } from '../cartograph/skyGrid.js'
import { lookOf } from '../lib/lookOf.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import { rooflessWhy } from '../lib/roofTop.js'
import { PostProcessing, StageFog, StageShadows, LampGlowDriver, EdgeRuffleDriver } from './PostProcessing.jsx'
import { NeonDriver } from './NeonBands.jsx'
import { weatherAt } from '../lib/weatherAt.js'
import WeatherPoller from './WeatherPoller'
import AtmosphereDirectiveDriver from './AtmosphereDirectiveDriver'
import WeatherEffects from './WeatherEffects'
import CelestialBodies, { SKY_RADIUS } from './CelestialBodies'
import Atmosphere from './Atmosphere'
import CloudDome from './CloudDome'
import BakedGround from './BakedGround.jsx'
import SlabRevetment from './SlabRevetment.jsx'
import LafayetteScene from './LafayetteScene'
import SlabBuildings from './SlabBuildings'
import InstancedTrees from './InstancedTrees'
import LafayettePark from './LafayettePark'
import BakedLamps from './BakedLamps'
import GatewayArch from './GatewayArch'
import SetPiece from './SetPiece.jsx'
import HorizonDisc from './HorizonDisc.jsx'
import { WATER_PLAN } from './waterMaterial.js'
import PlanRim from './PlanRim.jsx'
import MountainBackdrop from './MountainBackdrop'
import DrawnAnchor from './DrawnAnchor.jsx'
import { markStartup, markTime, markTimeline, isPrepared, failureOf, isRevealed, subscribeStartup } from '../lib/startupMarks.js'
import { getSceneStencil } from './sceneStencilState'
import { buildingLiftY } from '../lib/buildingLift.js'
import { Refusal } from '../lib/refusal.js'

// The application runtime has arrived: the renderer's module is evaluated (src/lib/startupMarks.js).
markStartup('runtime')

// The props contract comes through the one entry: an app asks this for its quality profile.
export { deviceQuality } from '../lib/qualityProfile.js'
// …and places its town at boot (before any screen mounts), for readers that run without a <Town> (TownPlace.jsx).
export { placeTown } from './TownPlace.jsx'
// ⭐ THE RENDERER-FREE DOOR (TownPure.js, 2026-11-02): everything an app needs that draws no town: the frame's one measure,
// the failure sink, the glyph method, the weather's error class, the kit's URL, the tide, the slab manifest and town record,
// a building's address. Re-exported here FROM the entry, never again from the libs behind it, so a name has one door and
// an app importing either gets the same functions and stores. An app module that draws no town imports TownPure.js, so a
// place card never pulls the renderer (it did, through PlaceList → Town.jsx).
export { frameInterval, frameTimeLeft, runSliced, rowsInAFrame, useFailures, failuresFor, glyphInk, EMOJI_FONT, COLOUR_ALPHA,
  WeatherRangeError, kitUrl, tideAt, tideExtrema, tenantOf, titleOf, useBuildingAddress } from './TownPure.js'
// …and hands over the manifest it already fetched, so the page reads it once (src/lib/slabUrl.js#adoptSlabManifest). Not in
// TownPure.js: slabUrl.js imports bakedUrl.js, which reads the page at load (a boot-only name; the app's entry takes it here).
export { adoptSlabManifest } from '../lib/slabUrl.js'
// The wind sheet's API — the field every wind consumer reads (lib/windSheet.js; contract ARCHITECTURE §8).
export { WIND_SHEET_GLSL, bindWindSheet } from '../lib/windSheet.js'
// The Canvas the town is drawn through, from its quality profile — an app spreads it on the <Canvas> it draws the town in.
export { townCanvasProps } from '../lib/qualityProfile.js'
// The player's chrome: its grounds, the colours that carry meaning, the contrast floors (src/tokens/playerChrome.js).
// The Ward's tokens.css must equal these; its check reads them here.
export { GROUNDS, MEANING, CONTRAST } from '../tokens/playerChrome.js'
// The town's moon as a picture, drawn on THIS canvas's context (no second one) — src/components/TownMoon.jsx.
export { useTownMoonImage } from './TownMoon.jsx'

const LAYERS = ['ground', 'buildings', 'trees', 'park', 'lamps', 'setPieces', 'neon', 'labels', 'sky', 'clouds', 'fog', 'shadows', 'post']
// Stage's live channels, by the piece that takes them. Anything else is refused: a misspelt
// override would otherwise do nothing, silently, while the operator drags a slider.
export const OVERRIDE_KEYS = [
  'buildingPalette', 'materialPhysics', 'materialColors', 'neonForceOn', 'neonDensity', 'neon', 'lampGlow',
  'lantern', 'lampsOn', 'canopy', 'treeWind', 'arch', 'archLight', 'setPieceLight', 'displays', 'landscape', 'shadow', 'mist', 'edgeRuffle',
  'sky', 'ambient', 'hemi', 'dirSun', 'dirMoon', 'constellations', 'milkyWay', 'skyGain', 'stars',
  'bloom', 'ao', 'exposure', 'warmth', 'fill', 'halo', 'grade', 'grain', 'dof', 'litTint', 'wallPalettes', 'surfaces', 'labels', 'setPieceTitles', 'heroKeyframes', 'heroMotion',
]
// PostProcessing's view vocabulary (halo and grain off in the plan, the street-level bloom bump: usePostFxDriver).
const POST_VIEW = { movie: 'hero', plan: 'browse', street: 'planetarium' }

// Under a demand frameloop nothing renders unless invalidated. The movie shot on a profile that
// asks for it renders every frame; everything else every other frame, a third while idle. Never
// zero while unpaused: going idle is what makes Chrome drop the WebGL surface.
// ── THE REVEAL (startup marks: `prepared:<class>`, `failed:<class>`, `reveal` — src/lib/startupMarks.js) — ground, buildings and trees arrive at once (Jacob, 2026-10-06; WARD USABLE = THE
// REVEAL). The physical groups render hidden (`visible={… && revealed}`) until every class `need`s has said it is
// PREPARED. Then, while only the sky shows, the gate COMPILES them ahead (renderer.compileAsync: parallel shader
// compile; three walks VISIBLE objects only, so the groups are shown for the synchronous part of the call and hidden
// again before any frame draws them) and UPLOADS their textures (renderer.initTexture); when the compile resolves, the
// town is revealed on one frame and the terrain swells. A class that fails says so (startupMarks.js#markFailed); the gate
// names what it waits on, once, at that failure — never a timer.
const PHYSICAL = ['ground', 'buildings', 'trees']
// What only BROWSE draws is prepared here too, behind the emblem, so the first flight to Browse links and uploads nothing
// (crutch ①, Boz's go, 2026-10-07): `town:overhead`, its tree discs (InstancedTrees, part of the trees class),
// `town:planRim`, its rim (PlanRim), and `town:labels`, the street labels (LafayetteScene) — those as far as their font
// has arrived: the reveal never waits on a label. Prepared after the reveal instead, the discs' first draw was a
// 145–160 ms frame in the dawn; on the first Browse flight, 173–215 ms (huron).
const REVEAL_GROUPS = new Set(['town:ground', 'town:buildings', 'town:trees', 'town:overhead', 'town:park', 'town:lamps', 'town:planRim', 'town:labels'])
function RevealGate({ need, lingerMs, skyAt }) {
  const { gl, scene, camera } = useThree()
  const phase = useRef({ name: 'wait' })
  // `woke` is a dependency of the gate's effect: the linger's timer wakes the EFFECT, not just a render. Without it, a
  // town prepared inside the linger set its timer, re-rendered, and never looked again (HPDM held on its emblem, 2026-10-11).
  const [woke, wake] = useState(0)
  const rt = useMemo(() => new THREE.WebGLRenderTarget(1, 1), [])
  useEffect(() => () => rt.dispose(), [rt])
  const state = useSyncExternalStore(subscribeStartup, () => need.map((k) => (isPrepared(k) ? 'p' : failureOf(k) ? 'f' : '-')).join('') + isRevealed())
  useEffect(() => {
    if (isRevealed() || phase.current.name !== 'wait') return
    const failed = need.filter((k) => failureOf(k))
    if (failed.length) { console.error(`[reveal] ⛔ the town is held hidden: ${failed.map((k) => `${k} (${failureOf(k)})`).join(', ')}`); return }
    if (!need.every(isPrepared)) return
    // The emblem LINGERS at least the Look's `reveal.linger` from the gate arming (Jacob, ~1.5 s): a town that is
    // ready sooner waits for it, so the emblem never flashes.
    const wait = (markTime('gate') ?? 0) + lingerMs - performance.now()
    if (wait > 0) { const t = setTimeout(() => wake((n) => n + 1), wait); return () => clearTimeout(t) }
    const groups = []
    scene.traverse((o) => { if (REVEAL_GROUPS.has(o.name)) groups.push(o) })
    // 1. Compile ahead, in parallel (KHR_parallel_shader_compile).
    const was = groups.map((g) => g.visible)
    let compiled
    markTimeline('gate', 'compile ahead: start')
    // Compiled AS DRAWN: into a render target, as the post composer draws the town (three keys a program on its output
    // colour space: linear into a target, sRGB to the screen). Compiled against the screen, every program here was the
    // WRONG variant — work wasted, the right one linked again in the prepare draw (measured, huron, 2026-10-07).
    const prevTarget = gl.getRenderTarget()
    try { for (const g of groups) g.visible = true; gl.setRenderTarget(rt); compiled = gl.compileAsync(scene, camera) }
    finally { groups.forEach((g, i) => { g.visible = was[i] }); gl.setRenderTarget(prevTarget) }
    phase.current = { name: 'compile', groups }
    const next = () => { markTimeline('gate', 'compile ahead: done'); phase.current = { name: 'prep', groups, i: 0 } }
    compiled.then(next, (e) => { console.error('[reveal] ⛔ compiling the town ahead failed:', e); next() })
  }, [state, need.join(','), woke])
  // 2. PREPARE BY DRAWING: one hidden group a frame, drawn into a 1×1 target by a top-down camera that holds the whole
  //    town (so no culling skips anything). A draw is the only thing that uploads every geometry and texture and links
  //    every program — measured: compile + initTexture alone left +217 geometries, +161 textures and +21 programs to
  //    the reveal frame (615 ms on huron). Here that cost lands while only the sky shows. 3. Then reveal, on one frame.
  useTownFrame(() => {
    const p = phase.current
    if (p.name !== 'prep') return
    if (p.i >= p.groups.length) { phase.current = { name: 'done' }; markStartup('reveal', { from: skyLevelNow(skyAt) }); return }
    const g = p.groups[p.i++]
    if (!g.visible && !gatedOn(g)) return   // a layer switched off stays off
    const st = getSceneStencil()
    const r = st?.radius || 1, cx = st?.center?.[0] || 0, cz = st?.center?.[1] || 0
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 1, 40000)
    cam.position.set(cx, 20000, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld()
    cam.userData.prepare = true   // DrawnAnchor ignores this draw: the visitor does not see it
    const prevTarget = gl.getRenderTarget()
    const restore = isolate(g)
    if (!restore) return   // under a layer switched off
    const t0 = performance.now()
    try { gl.setRenderTarget(rt); gl.render(scene, cam) }
    finally { restore(); gl.setRenderTarget(prevTarget) }
    markTimeline('gate', `prepare draw ${g.name}: ${Math.round(performance.now() - t0)} ms`)
  })
  return null
}
// Show ONE group for its prepare draw: the group, and any hidden group above it, with everything else under those hidden
// groups kept hidden — so a group nested in another (the overhead discs, in the trees) draws alone. Returns the undo, or
// null when an ancestor is a layer switched off.
function isolate(g) {
  const undo = [[g, g.visible]]
  g.visible = true
  for (let c = g, p = g.parent; p; c = p, p = p.parent) {
    if (p.visible) continue
    if (!gatedOn(p)) { for (const [o, v] of undo) o.visible = v; return null }
    undo.push([p, p.visible]); p.visible = true
    for (const o of p.children) if (o !== c && o.visible) { undo.push([o, true]); o.visible = false }
  }
  return () => { for (const [o, v] of undo) o.visible = v }
}
// DOM over the canvas, filling the canvas's own box in every app (the Ward, Preview, Stage, the LS player) — the splash
// and the map's credit: a div in
// the canvas's container with its own root. ⛔ Not drei's <Html fullscreen>: it still positions by projecting a 3D
// point, and in the LS player's layout it put the splash 971 px off-screen.
function CanvasOverlay({ children }) {
  const gl = useThree((s) => s.gl)
  const root = useRef(null)
  useEffect(() => {
    const host = gl.domElement.parentElement
    if (!host) return
    const div = document.createElement('div')
    Object.assign(div.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '300' })
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    host.appendChild(div)
    root.current = createRoot(div)
    return () => { const r = root.current; root.current = null; setTimeout(() => r.unmount(), 0); div.remove() }
  }, [gl])
  useEffect(() => { root.current?.render(children) })
  return null
}

// The dawn rises FROM THE SPLASH'S SKY (Jacob, 2026-10-07): the town sky's brightness now, against its brightest that
// day, both from the town's own sky model (the splash draws the same one). Carried on the `ward:reveal` mark's detail,
// read by usePostFxDriver#townExposure. No sky model yet → 0 (a full dawn), never a guess.
function skyLevelNow(skyAt) {
  if (!skyAt) return 0
  const doy = useCalendar.getState().dayOfYear()
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  const L = (m) => { const k = skyAt(m, doy); return (lum(k.high) + lum(k.horizon)) / 2 }
  let max = 0
  for (let m = 0; m < 1440; m += 30) max = Math.max(max, L(m))
  return max > 0 ? Math.min(1, L(useTimeOfDay.getState().getMinuteOfDay()) / max) : 0
}

// A gated group that its layer switch wants drawn (Town sets `userData.gatedOn` beside `visible`).
const gatedOn = (g) => g.userData?.gatedOn !== false

function FrameLimiter({ paused, idle, everyFrame, flying }) {
  const invalidate = useThree((s) => s.invalidate)
  const now = useRef(null)
  now.current = { paused, idle, everyFrame, flying }
  useEffect(() => {
    let n = 0, id
    const loop = () => {
      const { paused, idle, everyFrame, flying } = now.current
      // A flight is drawn every frame: it lasts ~2.5 s and it is the thing being watched.
      if (!paused && n % (idle ? 3 : (everyFrame || flying?.current()) ? 1 : 2) === 0) invalidate()
      n++
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [invalidate])
  return null
}


/**
 * The town's weather as the renderer reads it — ONE reading, the live feed WeatherPoller fetches for the placed
 * town (hooks/useWeather.js), READ-ONLY, or null before the first reading:
 *   { now: { tempC, code, isDay, at }, hourly: [{ at, tempC, code, observed }], fetchedAt, at(date, live) }
 * An app shows it rather than fetching its own: two calls to one provider read different numbers at different
 * times. `code` is WMO (current reconciled against precipitation and cloud); `isDay` is the sun above the town's
 * horizon at the town's clock; `at` / `fetchedAt` are ms epochs; hourly spans the hour at or before this dawn-to-dawn
 * window's start to 48 h ahead — its hours before NWS's grid are station OBSERVATIONS (lib/nws.js), with a
 * temperature but `code` null (a station reports no condition: say so, never "Clear"), and `observed` = the station
 * { id, name, lat, lon } it came from (null on a forecast hour), so an app can say where a reading was taken. °C out.
 * ⭐ `at(date, live)` is THE weather at an instant — `now` when live, else the forecast's at `date` — through the same
 * lib/weatherAt.js the sky is drawn from, so a label never disagrees with the sky above it: { tempC, code }.
 * ⛔ Outside the forecast it THROWS a WeatherRangeError (exported here): the app says it has no weather for that
 * hour, never shows this minute's.
 * ⭐ It needs NO <Town>: it joins the page's ONE weather poll (acquireWeatherPoll, hooks/useWeather.js), which
 * <Town>'s WeatherPoller shares — The Ward's Almanac runs on screens with no <Town> mounted, and still one fetch.
 * The page must have placed its town (placeTown) — the forecast is for the placed place.
 */
const fToC = (f) => (f == null ? null : Math.round(((f - 32) * 5 / 9) * 10) / 10)
export function useTownWeather() {
  useEffect(() => acquireWeatherPoll(), [])
  const tempF = useSkyState((s) => s.temperatureF)
  const code = useSkyState((s) => s.currentWeatherCode)
  const at = useSkyState((s) => s.weatherAt)
  const forecast = useSkyState((s) => s.hourlyForecast)
  const isDay = useTimeOfDay((s) => s.getLightingPhase().sunAltitude > 0)
  return useMemo(() => {
    if (at == null || tempF == null) return null
    const now = { tempC: fToC(tempF), code, isDay, at }
    return {
      now,
      hourly: (forecast || []).map((h) => ({ at: h.time.getTime(), tempC: fToC(h.temperatureF), code: h.weatherCode, observed: h.source === 'observed' ? h.station : null })),
      fetchedAt: at,
      at: (date, live) => {
        if (live) return now
        const r = weatherAt(date, { live: false, hourly: forecast })
        return { tempC: fToC(r.temperatureF), code: r.weatherCode }
      },
    }
  }, [tempF, code, isDay, at, forecast])
}

/**
 * The town's sky, from its AUTHORED sky channel (`baked/<look>/scene.json` → `sky`) through the Sky Builder's own
 * resolver (skyGrid.js#resolveSkyAtMinute — what SkyGradientGrid's DayStrip samples and the shader consumes):
 *   useTownSky(lookId) → skyAt(minute, dayOfYear) → { high, mid, low, horizon, sunGlow }, each [r, g, b] in 0..1
 * null until the channel has loaded. It needs NO <Town>: one shared read of the Look's scene.json (useSceneJson's
 * cache). ⛔ `dayOfYear` is REQUIRED — the resolver would otherwise fall back to the authoring calendar store.
 */
export function useTownSky(lookId) {
  const scene = useSceneJson(lookOf(lookId, 'useTownSky'))
  const sky = scene?.sky ?? null
  return useMemo(() => (!scene ? null : (minute, dayOfYear) => {
    if (!Number.isFinite(minute)) throw new Refusal(`[useTownSky] ⛔ skyAt needs a minute of the day; got ${minute}`)
    if (!Number.isFinite(dayOfYear)) throw new Refusal(`[useTownSky] ⛔ skyAt needs dayOfYear — never the authoring calendar's; got ${dayOfYear}`)
    return resolveSkyAtMinute(sky, minute, null, dayOfYear)
  }), [scene, sky])
}


/**
 * Where each of the town's buildings stands, READ-ONLY, for an app's overlays and camera moves (The Ward's
 * Society frames the lit buildings with it): Map(id → { x, z, radius }) in the town's local metres — the
 * footprint's centroid and the farthest corner from it. The ids are the slab's, the same ids
 * onSelectBuilding hands the app. null until the town's buildings have loaded. Mount-context: inside <Town>.
 */
export function useBuildingPlaces() {
  const index = useSlabBuildingIndex((s) => s.index)
  return useMemo(() => {
    if (!index) return null
    const out = new Map()
    for (const e of index.byNum) {
      const fp = e.footprint
      if (!fp?.length) continue
      let x = 0, z = 0
      for (const [px, pz] of fp) { x += px; z += pz }
      x /= fp.length; z /= fp.length
      let radius = 0
      for (const [px, pz] of fp) radius = Math.max(radius, Math.hypot(px - x, pz - z))
      out.set(e.id, { x, z, radius })
    }
    return out
  }, [index])
}

// The plan map's opening frame: the DENSEST CLUSTER of a set of places (the lit category, or every listed place),
// bounded by the Extent, with every unplaced or outside id disclosed. Pure; ▶ checks/claims-the-plan-opens-on-its-places.mjs
export { frameDensest } from '../lib/frameDensest.js'


/**
 * Puts its children on the drawn ground at a place in the town: local metres `x z`, or `lat lon`
 * projected through the town's own place (lib/townPlace.js). `lift` raises them above the ground.
 * The ground's height follows the terrain exaggeration of the shot, every frame.
 * ⭐ `building={id}` instead seats them ON THAT BUILDING'S ROOF — its highest point, over its footprint's centre, lifted
 * exactly as the building is drawn (`buildingLiftY` — roofTopY + centroidY × exaggeration + groundY), every frame; `lift` is then metres above
 * the roof. The one home for "on the roof". Draws nothing until the town's buildings load.
 * ⛔ An id the town does not have, or a building with no roof (a set piece's building — Provincetown's monument — or one
 * left open), seats NOTHING and says so by name: console.error, and `onError(message)` if given. ⛔ It never throws: the
 * app's children are not behind a boundary, so a throw here would black the town's canvas on one tap. Never a guessed
 * height. ▶ node checks/claims-every-building-has-a-roof-to-seat-on.mjs
 */
export function TownPoint({ building, ...rest }) {
  return building != null ? <RoofPoint building={building} {...rest} /> : <GroundPoint {...rest} />
}
function RoofPoint({ building, lift = 0, onError, children, ...props }) {
  const index = useSlabBuildingIndex((s) => s.index)
  const ref = useRef()
  const found = index?.byId.get(building)
  const problem = !index ? null
    : !found ? `this town has no building "${building}"`
      : found.roofTopY == null ? `building "${building}" has no roof in the slab${rooflessWhy(found) === 'setPiece' ? ' (its 3D is the town\'s set piece)' : ''} — nothing to seat on`
        : null
  useEffect(() => {
    if (!problem) return
    console.error(`[TownPoint] ⛔ ${problem}`)
    onError?.(problem)
  }, [problem]) // eslint-disable-line react-hooks/exhaustive-deps
  const e = problem ? null : found
  const at = useMemo(() => {
    if (!e) return null
    let x = 0, z = 0
    for (const [px, pz] of e.footprint) { x += px; z += pz }
    return { x: x / e.footprint.length, z: z / e.footprint.length }
  }, [e])
  const y = () => buildingLiftY(e.roofTopY, e.centroidY, terrainExag.value, 0, false, e.groundY) + lift
  useTownFrame(() => { if (ref.current && e) ref.current.position.y = y() })
  if (!e) return null
  return <group ref={ref} position={[at.x, y(), at.z]} {...props}>{children}</group>
}
function GroundPoint({ x, z, lat, lon, lift = 0, children, ...props }) {
  const place = useTownPlace()
  const geo = lat != null || lon != null
  const px = geo ? (lon - place.lon) * place.lonToMeters : x
  const pz = geo ? (place.lat - lat) * place.latToMeters : z
  if (!Number.isFinite(px) || !Number.isFinite(pz)) throw new Refusal(`[TownPoint] ⛔ no place: x=${x} z=${z} lat=${lat} lon=${lon}`)
  const ref = useRef()
  const y = () => getElevationRaw(px, pz) * terrainExag.value + lift
  useTownFrame(() => { if (ref.current) ref.current.position.y = y() })
  return <group ref={ref} position={[px, y(), pz]} {...props}>{children}</group>
}

/**
 * ⭐ THE TOWN OWNS ITS CLIP PLANES — far and near, the one writer of each, held every frame on whatever camera is default.
 * FAR (2026-09-28): the farthest thing <Town> draws is the sky dome (SKY_RADIUS); the camera must reach past it, or the
 * dome is clipped and the sky reads BLACK in daylight — measured in the Ward, whose Canvas kept R3F's default far = 1000.
 * ▶ node checks/claims-the-town-sees-its-sky.mjs
 * NEAR (2026-10-30, BRIEF-the-overhead-camera-resolves-its-ground): the movie's is the profile's `movieNear` (a property
 * of the device's depth buffer — Warden, 2026-09-28; MovieCamera wrote it until then); the overhead plan's is DERIVED
 * from where the camera is (cameraRegimes.js#overheadNear, over the town's drawn top); every other shot's is the
 * canvas's, TOWN_CAMERA_NEAR_M. ▶ node checks/claims-the-overhead-camera-resolves-its-ground.mjs
 * Two things a component cannot change once the Canvas exists — the depth buffer (log or linear) and whether it has a
 * shadow map — are the app's Canvas props; when they disagree with the quality profile, Town says so.
 */
// ⭐ THE TOWN'S DRAWN TOP, the plane nothing drawn rises above: every visible drawable's world box (the sky and the
// clouds excluded by their groups — they lie past any overhead near), plus the lifts its SHADER adds that no box sees:
// each geometry's own unexaggerated part (`aCentroid.y` buildings and neon, `aGround.y` trees, lamps and boulders —
// buildingLift.js) and the terrain's highest raw ground × the LIVE exag (the ground, the revetment, the water level, the
// buildings' anchors). ⛔ Not seen by it: the rain and snow column, placed about the CAMERA in its shader (RainParticles):
// in the plan it lay within the near and is not drawn there (Boz's ruling (i), 2026-10-30).
const SKYWARD = new Set(['town:sky', 'town:clouds'])
const LIFT_ATTRS = ['aCentroid', 'aGround']
const _ownLift = new WeakMap()
function ownLift(g) {
  for (const name of LIFT_ATTRS) {
    const a = g.attributes?.[name]
    if (!a || a.itemSize < 2) continue
    const c = _ownLift.get(a)
    if (c && c.v === a.version) return c.y
    let y = 0
    for (let i = 0; i < a.count; i++) y = Math.max(y, a.getY(i))
    _ownLift.set(a, { v: a.version, y })
    return y
  }
  return 0
}
const _box = new THREE.Box3()
function contentTop(root) {
  let n = 0, top = -Infinity
  const walk = (o) => {
    if (!o.visible || SKYWARD.has(o.name)) return
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.geometry) {
      n++
      if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); _box.copy(o.boundingBox) }
      else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _box.copy(o.geometry.boundingBox) }
      if (!_box.isEmpty()) top = Math.max(top, _box.applyMatrix4(o.matrixWorld).max.y + ownLift(o.geometry))
    }
    for (const c of o.children) walk(c)
  }
  walk(root)
  return { n, top }
}
function countDrawn(root) {
  let n = 0
  const walk = (o) => { if (!o.visible || SKYWARD.has(o.name)) return; if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.geometry) n++; for (const c of o.children) walk(c) }
  walk(root)
  return n
}
let _topUnknownSaid = false

function TownOptics({ quality, shot, movieActive }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  // ⭐ HELD EVERY FRAME, on whatever camera is default. An app may make its own camera default at any time (the Ward's
  // plan camera, a drei <PerspectiveCamera makeDefault>); set once per camera identity, such a camera drew ONLY SKY at
  // R3F's far (Quire, measured 2026-09-28). A camera someone else gave a different far is corrected and SAID, once.
  const FAR = SKY_RADIUS * 1.1     // past the dome (and the orbs inside it), with room for the camera's own lift
  const told = useRef(new WeakSet())
  // The drawn top, re-walked when what is drawn changes (a count of visible drawables, read each plan frame) or the shot does.
  const drawn = useRef({ n: -1, shot: null, top: -Infinity })
  const hold = (cam) => {
    if (!cam) return
    if (cam.far !== FAR) {
      if (!told.current.has(cam) && cam.far !== 1000 && cam.far !== 2000) {
        told.current.add(cam)
        console.warn(`[Town] the default camera's far plane was ${cam.far} — Town owns it (${FAR}, past the sky dome); set nothing on the app's camera`)
      }
      cam.far = FAR
      cam.updateProjectionMatrix()
    }
    let near = TOWN_CAMERA_NEAR_M
    if (movieActive) near = quality.movieNear
    else if (shot === 'plan') {
      const d = drawn.current, n = countDrawn(scene)
      if (n !== d.n || d.shot !== shot) Object.assign(d, contentTop(scene), { shot })
      if (d.n > 0 && Number.isFinite(d.top)) near = overheadNear(cam, d.top + terrainCeilingRaw.value * Math.max(0, terrainExag.value), TOWN_CAMERA_NEAR_M)
      else if (!_topUnknownSaid) { _topUnknownSaid = true; console.info(`[Town] the overhead near is the canvas's (${TOWN_CAMERA_NEAR_M} m) until the town has drawn something to stand above`) }
    }
    if (shot !== 'plan') drawn.current.shot = null
    if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix() }
  }
  useLayoutEffect(() => { hold(camera) }, [camera])
  useTownFrame((st) => hold(st.camera))
  useEffect(() => {
    const logDepth = !!gl.capabilities.logarithmicDepthBuffer
    if (!!quality.logDepth !== logDepth) console.error(`[Town] ⛔ the Canvas was created with ${logDepth ? 'logarithmic' : 'linear'} depth, but the quality profile "${quality.id}" asks for ${quality.logDepth ? 'logarithmic' : 'linear'} — create the Canvas with gl={{ logarithmicDepthBuffer: quality.logDepth }}`)
    if (!!quality.shadows !== !!gl.shadowMap.enabled) console.error(`[Town] ⛔ the Canvas ${gl.shadowMap.enabled ? 'has' : 'has no'} shadow map, but the quality profile "${quality.id}" asks for ${quality.shadows ? `shadows (${quality.shadows})` : 'none'} — create the Canvas with shadows={quality.shadows}`)
  }, [gl, quality])
  return null
}

export default function Town({
  town, lookId, quality, shot, paused = false, idle = false, selectedId = null, onSelectBuilding, litIds, liveIds, listings,
  interactive = true, bakeLastMs, layers, postFx, overrides = {}, weatherMode = 'live',
  holdScrubbedTime = false, time, timeOffsetMs, movie, flight = true, streetAt, viewInset, flightRef, onFlightEnd, frameKey, frameIds, frameMode = 'densest', frameMover = null, framePoints = null, onFramed, planHeading = 'town', bearingRef,
  controls = false, movers, onMovers, children, towerLight = false, onTowerLight, calendar, displaySource,
}) {
  if (time !== undefined && holdScrubbedTime) throw new Refusal('[Town] ⛔ `time` and `holdScrubbedTime` both drive the clock — pass one (the app owns its time, or Stage holds a scrub)')
  if (time != null && !(time instanceof Date && Number.isFinite(time.getTime()))) throw new Refusal(`[Town] ⛔ \`time\` is a Date or null (live); got ${time}`)
  if (timeOffsetMs !== undefined) {
    if (time !== undefined) throw new Refusal('[Town] ⛔ `time` and `timeOffsetMs` both drive the clock — pass one (an instant that holds, or an offset from now that ticks)')
    if (holdScrubbedTime) throw new Refusal('[Town] ⛔ `holdScrubbedTime` with `timeOffsetMs`: the hold stops the clock off live, so the offset would freeze — pass one')
    if (!Number.isFinite(timeOffsetMs)) throw new Refusal(`[Town] ⛔ \`timeOffsetMs\` is a finite number of ms from now (0 = live); got ${timeOffsetMs}`)
  }
  if (!lookId) throw new Refusal('[Town] ⛔ needs lookId — the Look to draw')
  if (!quality?.id) throw new Refusal('[Town] ⛔ needs quality — a profile from src/lib/qualityProfile.js')
  if (!SHOT_KEY[shot]) throw new Refusal(`[Town] ⛔ shot "${shot}" is not one of ${Object.keys(SHOT_KEY).join(' · ')}`)
  if (liveIds) throw new Refusal('[Town] ⛔ liveIds: the live-announcement mark is not built yet (a design question with Jacob) — nothing would draw it')
  for (const k of Object.keys(layers || {})) if (!LAYERS.includes(k)) throw new Refusal(`[Town] ⛔ unknown layer "${k}" (have: ${LAYERS.join(' ')})`)
  for (const k of Object.keys(overrides)) if (!OVERRIDE_KEYS.includes(k)) throw new Refusal(`[Town] ⛔ unknown override "${k}"`)
  const on = (k) => layers?.[k] !== false
  // The canvas's anti-aliasing, as made, against whether this Town draws a composer (qualityProfile.js#canvasAAMismatch).
  const contextAntialias = useThree((s) => !!s.gl.getContextAttributes()?.antialias)
  const aaMismatch = canvasAAMismatch(quality, { contextAntialias, composer: on('post') })
  if (aaMismatch) throw new Refusal(aaMismatch)
  // Latched on the first ask: the Tower Light stays mounted after (its programs compiled once), off by intensity.
  const [towerArmed, setTowerArmed] = useState(false)
  if (towerLight && !towerArmed) setTowerArmed(true)
  // The overhead plan's water reflects the sky as seen across it, not the zenith (waterMaterial WATER_PLAN).
  useEffect(() => { WATER_PLAN.value = shot === 'plan' ? 1 : 0 }, [shot])
  const o = overrides

  const scene = useSceneJson(lookId)
  const bake = bakeLastMs ?? scene?.bakedAt ?? null
  const key = SHOT_KEY[shot]
  if (!Array.isArray(listings)) throw new Refusal('[Town] ⛔ needs the `listings` prop — the town\'s content listings (an array; [] for a town with none)')
  // What the leaves read (townContext.js) — the shot, the selection, the listings. No player store.
  // The town's labels and their style: labels.json, read once, the style under Stage's live override. Every label
  // reader takes them from here (src/lib/labelStyle.js) — never the authoring store.
  const labelsArtifact = useStreetLabels(lookId, bake)
  const labelStyle = useMemo(() => labelStyleOf(labelsArtifact, o.labels), [labelsArtifact, o.labels])
  const setPieceTitles = useMemo(() => ({ ...labelsArtifact.setPieceTitles, ...(o.setPieceTitles || {}) }), [labelsArtifact, o.setPieceTitles])
  // lookId: the town a failure belongs to (R3FErrorBoundary keys its report to the one sink by it, src/lib/failures.js).
  const scope = useMemo(() => ({ lookId, shotKey: key, selectedId, select: onSelectBuilding ?? null, listings, streetLabels: labelsArtifact.labels, labelStyle, setPieceTitles }),
    [lookId, key, selectedId, onSelectBuilding, listings, labelsArtifact, labelStyle, setPieceTitles])
  // The town's movie: its baked path (heroKeyframes + heroMotion), or the opening view derived from its own disc
  // when it has none — Stage's live keys arrive as overrides. The same resolution the apps used (cameraRegimes.js).
  const stencil = useSceneStencil()
  const heroFov = scene?.shots?.values?.hero?.fov ?? SHOTS_FLAT_DEFAULTS.hero.fov
  const heroMotion = o.heroMotion ?? scene?.heroMotion ?? null
  const heroKeyframes = useMemo(() => o.heroKeyframes ?? (scene ? resolveHeroKeyframes(scene.heroKeyframes, scene.heroMotion, stencil, heroFov, 'town') : null),
    [o.heroKeyframes, scene, stencil, heroFov])
  // The flight between shots (src/camera/ShotFlight.jsx): the plan opens on the Browse frame, or on frameIds' frame when
  // given (entryFrames); a frameKey frames places.
  const places = useBuildingPlaces()
  // Listings with no building are kept (as null): the plan's disclosure names them unplaced, never drops them.
  // What the plan FRAMES — never what it lights (frameIds, header). Absent: the lit set, else every listing.
  // The frameKey as of Town's FIRST render: the plan flies a key that changed while the town was still loading (a Ward
  // pin link opened cold — Hinge, 2026-10-07), which ShotFlight, mounted only once the town has loaded, cannot see itself.
  const frameKeyAtMount = useRef(frameKey).current
  const placeIds = useMemo(() => (frameIds != null ? [...frameIds] : framePoints != null ? []   // points alone: the set is the points
    : litIds?.size ? [...litIds] : listings.map((l) => l.building_id ?? null)), [frameIds, framePoints, litIds, listings])
  if (framePoints != null && !(Array.isArray(framePoints) && framePoints.length && framePoints.every((p) => p && typeof p.id === 'string' && p.id && Number.isFinite(p.lat) && Number.isFinite(p.lon))))
    throw new Refusal(`[Town] ⛔ framePoints must be a non-empty [{ id, lat, lon }] — null for no spot (an empty array would enter on an empty set and drop the app's own framing); got ${JSON.stringify(framePoints)?.slice(0, 120)}`)
  const ownHandle = useRef(null)
  const flightHold = useRef(() => false)
  const movieHandle = movie?.handle ?? ownHandle
  const movieHold = useMemo(() => () => flightHold.current() || !!movie?.hold?.(), [movie])
  // ⛔ Nothing draws until THIS town's place and terrain are in: a piece built on the wrong ground stays wrong.
  const loaded = useTownLoaded(lookId)
  // The reveal: the gate ARMS at mount (`ward:gate`), so the emblem shows from the town's first frame; its timings are
  // the Look's `reveal` channel (skyLightChannels.js#REVEAL_FIELDS), seconds; the splash draws the town's own sky.
  useEffect(() => { markStartup('gate') }, [])
  const glForWarm = useThree((s) => s.gl)
  useEffect(() => { warmImpostorLoader(glForWarm) }, [glForWarm])   // the KTX2 transcoder ready before the first page
  const skyAt = useTownSky(lookId)
  const revealTiming = resolveGroupAtMinute(scene?.reveal, 0, null, REVEAL_FIELD_KEYS, REVEAL_FLAT_DEFAULTS)
  const splash = <CanvasOverlay><TownSplash title={_titleOf(town)} fadeSeconds={revealTiming.fade} skyAt={skyAt} identity={scene ? (scene.identity ?? null) : undefined} viewInset={viewInset} /></CanvasOverlay>
  const revealed = useSyncExternalStore(subscribeStartup, isRevealed)
  // ⛔ The terrain read's failure is the TOWN's (it draws nothing until its terrain is in), named in the one sink by this
  // boundary under the town's lookId. The same boundary NAME (so the same `<lookId>/terrain` key) in both branches below;
  // they sit at different tree positions, so the town loading REMOUNTS it, and that clean mount clears the entry (the
  // read landed). The remount re-runs TownPlace: placeTown and an unforced reloadTerrain are no-ops, and `time` is applied again.
  const terrainPlace = <R3FErrorBoundary name="terrain"><TownPlace town={town} lookId={lookId} time={time} timeOffsetMs={timeOffsetMs} rebake={bakeLastMs} /></R3FErrorBoundary>
  if (!loaded) return <FrameBoundary.Provider value={false}><TownOptics quality={quality} shot={shot} movieActive={false} />{terrainPlace}{splash}</FrameBoundary.Provider>
  const shotExag = shot === 'plan' ? 0 : shot === 'street' ? 1 : sceneExag()
  // ⭐ THE SWELL (Jacob, 2026-10-06): the town is prepared FLAT and the terrain swells to the shot's height as the
  // reveal's gesture, through the one terrain driver (BakedGround#TerrainExagDriver). A gesture, not a perf lever.
  const targetExag = revealed ? shotExag : 0
  // The phone profile mounts the arch and the horizon in the movie shot only (its budget).
  const heavy = !quality.heroOnlyPieces || shot === 'movie'

  return (
    // ⛔ A frame callback's throw is "inside a boundary" only inside THIS R3F tree: <Canvas> forwards every outside context,
    // so a FrameBoundary=true above it would claim this town's frame throws (src/lib/useTownFrame.js). Reset here.
    <FrameBoundary.Provider value={false}>
    <QualityProvider quality={quality}>
    <TownScope value={scope}>
      <TownOptics quality={quality} shot={shot} movieActive={shot === 'movie' && (movie?.playing ?? true)} />
      {terrainPlace}
      {/* ⭐ THE MOVIE IS TOWN'S (Warden, 2026-09-28): the ONE mount of the driver, playing this town's own baked path
          (Stage's live keys arrive as overrides). Mounted in every shot so an app's tween can sample the path before
          it switches; it plays only in the movie shot. ▶ node checks/claims-one-movie-driver.mjs */}
      <MovieCamera keyframes={heroKeyframes} motion={heroMotion}
        active={shot === 'movie' && (movie?.playing ?? true)}
        start={movie?.start ?? 'random'} onTime={movie?.onTime} hold={movieHold} handle={movieHandle} framing={shot === 'movie'} />
      {/* ⭐ A SHOT CHANGE FLIES (BRIEF-town-shot-flight): the town knows where each shot puts the camera and flies
          there with the one tween, holding the movie while it does. ▶ node checks/claims-one-shot-flight.mjs */}
      <ShotFlight shot={shot} flight={flight} streetAt={streetAt} viewInset={viewInset} flightRef={flightRef}
        onFlightEnd={onFlightEnd} movieHandle={movieHandle} holdRef={flightHold} scene={scene} places={places} placeIds={placeIds} frameMode={frameMode} entryFrames={frameIds != null || framePoints != null}
        frameKey={frameKey} frameKeyAtMount={frameKeyAtMount} onFramed={onFramed} planHeading={planHeading} bearingRef={bearingRef} movers={movers} frameMover={frameMover} framePoints={framePoints} />
      {controls && <RegimeControls regime={shot === 'plan' ? 'overhead' : shot === 'street' ? 'street' : 'playback'} />}
      <FrameLimiter paused={paused} idle={idle} everyFrame={quality.movieEveryFrame && shot === 'movie'} flying={flightHold} />
      {!(time instanceof Date) && <TimeTicker holdScrubbedTime={holdScrubbedTime} paused={paused} />}
      <SkyStateTicker paused={paused} />
      {/* Lends this canvas's context to useTownMoonImage; draws nothing, needs no frame. */}
      <Suspense fallback={null}><TownMoonPainter /></Suspense>
      {/* Names the material when a program fails to link — the failure that draws nothing and says nothing. */}
      <ShaderLinkGuard />
      {on('shadows') && quality.shadows && <StageShadows lookId={lookId} bakeLastMs={bake} shadowOverride={o.shadow} pcss={shot !== 'movie'} />}
      {/* No fog in the overhead plan, ever (Jacob, 2026-09-29): from the plan camera's height the town's mist veils the
          whole map. The movie and the street keep it. The post chain's haze and grain are zeroed there too
          (usePostFxDriver). */}
      <StageFog lookId={lookId} bakeLastMs={bake} mistOverride={o.mist} enabled={on('fog') && shot !== 'plan'} />
      <EdgeRuffleDriver lookId={lookId} bakeLastMs={bake} ruffleOverride={o.edgeRuffle} />
      <LampGlowDriver lookId={lookId} bakeLastMs={bake} lampGlowOverride={o.lampGlow} />
      <NeonDriver lookId={lookId} bakeLastMs={bake} neonOverride={o.neon} />
      <WeatherPoller mode={weatherMode} />
      {/* The Tower Light loads on its first ask and never before (Jacob: "the lamp is totally last place"). */}
      {towerArmed && <TowerLight on={towerLight && shot === 'plan'} lookId={lookId} onState={onTowerLight} />}
      <AtmosphereDirectiveDriver lookId={lookId} />
      <WeatherEffects />
      {/* The wind, computed once per frame over the town's own disc; every wind consumer reads it. */}
      <R3FErrorBoundary name="WindSheet"><WindSheet extent="town" /></R3FErrorBoundary>

      <group name="town:sky" visible={on('sky')}>
        <R3FErrorBoundary name="CelestialBodies"><CelestialBodies lookId={lookId} bakeLastMs={bake}
          skyOverride={o.sky} ambientOverride={o.ambient} hemiOverride={o.hemi} dirSunOverride={o.dirSun}
          dirMoonOverride={o.dirMoon} constellationsOverride={o.constellations} milkyWayOverride={o.milkyWay}
          skyGainOverride={o.skyGain} starsOverride={o.stars} /></R3FErrorBoundary>
      </group>
      <group name="town:clouds" visible={on('clouds')}>
        {/* Sky renderer stopgap (skyMode): <CloudDome/> ships, <Atmosphere/> under ?sky=volumetric. */}
        <R3FErrorBoundary name="Atmosphere">{skyModeOf(town) === 'volumetric' ? <Atmosphere lookId={lookId} /> : <CloudDome />}</R3FErrorBoundary>
      </group>

      <Suspense fallback={null}>
        <RevealGate need={PHYSICAL.filter((k) => on(k))} lingerMs={revealTiming.linger * 1000} skyAt={skyAt} />
        {splash}
        {/* The map's data credit (ODbL), in the canvas's corner in every app that draws a town (MapCredit.jsx). */}
        <CanvasOverlay><MapCredit lookId={lookId} /></CanvasOverlay>
        <group name="town:ground" visible={on('ground') && revealed} userData={{ gatedOn: on('ground') }}>
          <R3FErrorBoundary name="BakedGround" reveal="ground"><BakedGround lookId={lookId} bakeLastMs={bake} targetExag={targetExag} swellMs={revealTiming.swell * 1000} surfacesOverride={o.surfaces} /></R3FErrorBoundary>
          {/* The shore median diagnostic shows the region with every treatment OFF, so the revetment hides while it is on. */}
          <R3FErrorBoundary name="SlabRevetment"><SlabRevetment lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>
          {/* "minimum ground" is marked by the ground SURFACES (BakedGround's GroundMeshes), not by any mesh here: the
              revetment drew first and marked WARD USABLE ~2 s early on huron. */}
        </group>
        {/* Neon, street labels and the park title. Its live buildings stay hidden: the slab draws them. */}
        <R3FErrorBoundary name="LafayetteScene">
          <LafayetteScene town={town} lookId={lookId} bakeLastMs={bake} litIds={litIds} labelViewMode={key}
            forceNeonOn={o.neonForceOn} neonDensity={o.neonDensity}
            materialColorsOverride={o.materialColors}
            hiddenLayers={{ building: true, neon: !on('neon'), labels: !on('labels'), parkTitle: scene?.layerVis?.parkTitle === false }} />
        </R3FErrorBoundary>
        <group name="town:buildings" visible={on('buildings') && revealed} userData={{ gatedOn: on('buildings') }}>
          <R3FErrorBoundary name="SlabBuildings" reveal="buildings"><SlabBuildings key={`slab-${bake || 0}`} lookId={lookId} interactive={interactive}
            materialPhysicsOverride={o.materialPhysics} paletteOverride={o.buildingPalette} wallPalettesOverride={o.wallPalettes}
            litIds={litIds} litTintOverride={o.litTint} /></R3FErrorBoundary>
          <DrawnAnchor id="buildings" />
        </group>
        <group name="town:trees" visible={on('trees') && revealed} userData={{ gatedOn: on('trees') }}>
          <R3FErrorBoundary name="InstancedTrees" reveal="trees"><InstancedTrees lookId={lookId} bakeLastMs={bake} canopyOverride={o.canopy} treeWindOverride={o.treeWind} /></R3FErrorBoundary>
          <DrawnAnchor id="trees" />
        </group>
        <group name="town:park" visible={on('park') && revealed} userData={{ gatedOn: on('park') }}>
          <R3FErrorBoundary name="LafayettePark"><LafayettePark town={town} lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>
        </group>
        <group name="town:lamps" visible={on('lamps') && revealed} userData={{ gatedOn: on('lamps') }}>
          <R3FErrorBoundary name="BakedLamps"><BakedLamps lookId={lookId} bakeLastMs={bake} lanternOverride={o.lantern} lampsOnOverride={o.lampsOn} /></R3FErrorBoundary>
        </group>
        <group name="town:setPieces" visible={on('setPieces')}>
          {heavy && <R3FErrorBoundary name="GatewayArch"><GatewayArch lookId={lookId} bakeLastMs={bake} archOverride={o.arch} archLightOverride={o.archLight} /></R3FErrorBoundary>}
          <R3FErrorBoundary name="SetPiece"><SetPiece town={town} lookId={lookId} lightOverride={o.setPieceLight} displaysOverride={o.displays} calendar={calendar} displaySource={displaySource} /></R3FErrorBoundary>
        </group>
        {/* The ground past the rim, out to the horizon — the movie and the street only. In PLAN the town is one closed
            circle ending at its soft rim (Jacob, 2026-09-28; ▶ claims-the-plan-shot-ends-at-the-rim). */}
        {heavy && shot !== 'plan' && <R3FErrorBoundary name="HorizonDisc"><HorizonDisc lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>}
        {/* …and the plan's clean circle at that same one radius: land to the rim, the page's ink past it (PlanRim). Always
            mounted, SHOWN in plan only, so the gate prepares it with the town and the first Browse flight links nothing. */}
        <group name="town:planRim" visible={shot === 'plan'}><R3FErrorBoundary name="PlanRim"><PlanRim /></R3FErrorBoundary></group>
        {/* A mesh behind everything, at its true geo spot; nothing unless the Look ships a landscape. */}
        <R3FErrorBoundary name="MountainBackdrop"><MountainBackdrop lookId={lookId} bakeLastMs={bake} landscapeOverride={o.landscape} /></R3FErrorBoundary>
      </Suspense>

      {on('post') && <PostProcessing lookId={lookId} bakeLastMs={bake} viewMode={POST_VIEW[shot]} inspect={postFx}
        bloomOverride={o.bloom} aoOverride={o.ao} exposureOverride={o.exposure} warmthOverride={o.warmth}
        fillOverride={o.fill} haloOverride={o.halo} gradeOverride={o.grade} grainOverride={o.grain}
        dofOverride={o.dof} />}
      {/* The town's live dots — the visitor, couriers — positioned by the app, placed and drawn by the town.
          ▶ node checks/claims-a-mover-stands-where-it-is.mjs */}
      {movers ? <Movers movers={movers} shot={shot} onMovers={onMovers} /> : null}
      {children}
    </TownScope>
    </QualityProvider>
    </FrameBoundary.Provider>
  )
}
