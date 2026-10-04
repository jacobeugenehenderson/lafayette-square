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
 *   streetAt         [x, z] town metres — where the street eye stands; required with shot='street'
 *   viewInset        { top, right, bottom, left } CSS px the app's UI covers: plan and street frame into the rest (a
 *                    camera view offset; the canvas stays full-page); the movie is full frame. Eased on the flight.
 *   flightRef        a ref Town fills: { from, to, t, eased, duration, at, landed, interrupted } — at t = 0 before the first
 *                    painted frame of a flight, then every frame; `eased` is the camera's own curve (drive a panel by it)
 *   onFlightEnd      (f) => void, once per shot change: landed, or interrupted by a pointerdown / wheel
 *   frameKey         the plan's ONE move: the plan OPENS on the town's Browse frame (src/camera/browseFrame.js) and
 *                    frames its places only when this changes (a Return, a category chosen). litIds alone only light —
 *                    typing never moves the camera.
 *                    The in-plan move runs transitions.js' `frame` (1200 ms, easeInOutCubic).
 *   frameIds         what the plan frames on a frameKey change, apart from what it lights — an iterable of building
 *                    ids; absent: litIds, else every listing. Lights nothing. Given but empty (or with no id placed),
 *                    the plan goes back to its Browse frame with a warning, as for any set with nothing placed, and
 *                    onFramed says so (placed 0) — never another set of places.
 *   frameMode        how the plan frames its places: 'densest' (default — the densest cluster, frameDensest; Jacob, 2026-09-28)
 *                    | 'all' — EVERY placed member, footprints and all, fitted into viewInset with the town's browse
 *                    padding (frameAll; Jacob, 2026-09-29: "Dining should frame all the bars and restaurants"). Bounded
 *                    by the Extent either way; members beyond it come back in onFramed.outside. Anything else throws.
 *                    ▶ node checks/claims-the-plan-frames-all-it-is-given.mjs
 *   onFramed         ({ x, z, radius, placed, of, outside, unplaced }) => void, each time the plan frames places — the frame's
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
 *   holdScrubbedTime a scrubbed clock stays where the operator put it (Stage)
 *   time             the town's clock, when the APP owns it (The Ward's scrubbed time): a Date draws the town at
 *                    that instant (sky, sun, light, neon's opening hours) and nothing ticks it; null is live (the
 *                    renderer's own clock). Absent (undefined), the app drives the clock store itself (the kit's
 *                    apps). ⛔ Never with holdScrubbedTime: one writer of the town's clock.
 *   movie            optional — the app's hooks into the town's movie (MovieCamera, mounted here, once): { start
 *                    ('random' | () => seconds — Stage's playhead), onTime (Stage's scrub readout), playing (Stage's
 *                    Play; default true), hold (() => true while the app's own camera code owns it — Stage), handle
 *                    (a ref filled with { pose() }) }. The Ward passes none: shot='movie' plays the town's own path.
 *   children         the app's overlays, drawn in the town's frame (see <TownPoint>)
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TownMoonPainter } from './TownMoon.jsx'
import { useFrame, useThree } from '@react-three/fiber'
import R3FErrorBoundary from './R3FErrorBoundary'
import { TownPlace, useTownLoaded } from './TownPlace.jsx'
import { TownScope, SHOT_KEY } from './townContext.js'
import { TimeTicker, SkyStateTicker } from './SkyTickers.jsx'
import { QualityProvider } from '../lib/qualityProfile.js'
import { useTownPlace } from '../lib/townPlace.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { useStreetLabels } from '../lib/streetLabels.js'
import { labelStyleOf } from '../lib/labelStyle.js'
import MovieCamera from '../camera/MovieCamera.jsx'
import ShotFlight from '../camera/ShotFlight.jsx'
import Movers from './Movers.jsx'
import RegimeControls from './RegimeControls.jsx'
import { resolveHeroKeyframes, useSceneStencil } from '../lib/cameraRegimes.js'
import { SHOTS_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'
import { skyModeOf } from '../lib/skyMode'
import { ShaderLinkGuard } from '../lib/shaderLinkGuard.jsx'
import { sceneExag } from '../utils/terrainShader'
import { terrainExag } from '../utils/terrainShader'
import { getElevationRaw } from '../utils/elevation'
import useSkyState from '../hooks/useSkyState'
import { acquireWeatherPoll } from '../hooks/useWeather'
import { resolveSkyAtMinute } from '../cartograph/skyGrid.js'
import { lookOf } from '../lib/lookOf.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import { rooflessWhy } from '../lib/roofTop.js'
import { PostProcessing, StageFog, StageShadows, LampGlowDriver } from './PostProcessing.jsx'
import { NeonDriver } from './NeonBands.jsx'
import CascadedShadows, { CSM_ENABLED } from './CascadedShadows.jsx'
import { weatherAt } from '../lib/weatherAt.js'
import WeatherPoller from './WeatherPoller'
import AtmosphereDirectiveDriver from './AtmosphereDirectiveDriver'
import WeatherEffects from './WeatherEffects'
import CelestialBodies, { SKY_RADIUS } from './CelestialBodies'
import Atmosphere from './Atmosphere'
import CloudDome from './CloudDome'
import Terrain from './Terrain'
import BakedGround from './BakedGround.jsx'
import SlabRevetment from './SlabRevetment.jsx'
import LafayetteScene from './LafayetteScene'
import SlabBuildings from './SlabBuildings'
import CityModel from './CityModel'
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
import { markStartup } from '../lib/startupMarks.js'

// The application runtime has arrived: the renderer's module is evaluated (src/lib/startupMarks.js).
markStartup('runtime')

// The props contract comes through the one entry: an app asks this for its quality profile.
export { deviceQuality } from '../lib/qualityProfile.js'
// …and places its town at boot (before any screen mounts), for readers that run without a <Town> (TownPlace.jsx).
export { placeTown } from './TownPlace.jsx'
// …and hands over the manifest it already fetched, so the page reads it once (src/lib/slabUrl.js#adoptSlabManifest).
export { adoptSlabManifest } from '../lib/slabUrl.js'
// …and reads its town's identity record the kit's way: the backend key and the tab title (src/lib/townRecord.js),
// one reader for the kit's apps and the Ward.
export { tenantOf, titleOf } from '../lib/townRecord.js'
// The weather at an instant is one answer (lib/weatherAt.js); an app catches its out-of-forecast error by this class.
export { WeatherRangeError } from '../lib/weatherAt.js'
// The Canvas the town is drawn through, from its quality profile — an app spreads it (the Ward imports only Town).
export { townCanvasProps } from '../lib/qualityProfile.js'
// An emoji as this device draws it, and its inked pixels — one home for the method (src/lib/glyphInk.js); the Ward's
// vignette measurement and glyph fitting read it here.
export { glyphInk, EMOJI_FONT, COLOUR_ALPHA } from '../lib/glyphInk.js'
// The player's chrome: its grounds, the colours that carry meaning, the contrast floors (src/tokens/playerChrome.js).
// The Ward's tokens.css must equal these; its check reads them here.
export { GROUNDS, MEANING, CONTRAST } from '../tokens/playerChrome.js'
// Where the renderer's own files live (the page's ward-kit-base; src/lib/kitUrl.js) — the Ward's Almanac reads the
// weather icons through it, so they have one home: the kit bundle.
export { kitUrl } from '../lib/kitUrl.js'
// The town's moon as a picture, drawn on THIS canvas's context (no second one) — src/components/TownMoon.jsx.
export { useTownMoonImage } from './TownMoon.jsx'

const LAYERS = ['ground', 'buildings', 'trees', 'park', 'lamps', 'setPieces', 'neon', 'labels', 'sky', 'clouds', 'fog', 'shadows', 'post']
// Stage's live channels, by the piece that takes them. Anything else is refused: a misspelt
// override would otherwise do nothing, silently, while the operator drags a slider.
export const OVERRIDE_KEYS = [
  'buildingPalette', 'materialPhysics', 'materialColors', 'neonForceOn', 'neonDensity', 'neon', 'lampGlow',
  'lantern', 'lampsOn', 'canopy', 'arch', 'archLight', 'setPieceLight', 'landscape', 'shadow', 'mist',
  'sky', 'ambient', 'hemi', 'dirSun', 'dirMoon', 'constellations', 'milkyWay', 'skyGain', 'stars',
  'bloom', 'ao', 'exposure', 'warmth', 'fill', 'halo', 'grade', 'grain', 'dof', 'dofFocus', 'litTint', 'wallPalettes', 'surfaces', 'labels', 'setPieceTitles', 'heroKeyframes', 'heroMotion',
]
// PostProcessing's view vocabulary (half-res AO off the movie shot, the street-level bloom bump).
const POST_VIEW = { movie: 'hero', plan: 'browse', street: 'planetarium' }

// Under a demand frameloop nothing renders unless invalidated. The movie shot on a profile that
// asks for it renders every frame; everything else every other frame, a third while idle. Never
// zero while unpaused: going idle is what makes Chrome drop the WebGL surface.
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

// The shadow cascades (`?csm=1`), keyed to the light CelestialBodies publishes — never a second sun.
export function Cascades() {
  const keyDirection = useSkyState(st => st.keyDirection)
  const keyColor = useSkyState(st => st.keyColor)
  const [key, setKey] = useState({ intensity: 1 })
  useFrame(() => { const k = window.__csmKey; if (k && k.intensity !== key.intensity) setKey({ intensity: k.intensity }) })
  return <CascadedShadows lightDirection={keyDirection} keyIntensity={key.intensity} keyColor={keyColor} />
}

/**
 * The town's weather as the renderer reads it — ONE reading, the live feed WeatherPoller fetches for the placed
 * town (hooks/useWeather.js), READ-ONLY, or null before the first reading:
 *   { now: { tempC, code, isDay, at }, hourly: [{ at, tempC, code }], fetchedAt, at(date, live) }
 * An app shows it rather than fetching its own: two calls to one provider read different numbers at different
 * times. `code` is WMO (current reconciled against precipitation and cloud); `isDay` is the sun above the town's
 * horizon at the town's clock; `at` / `fetchedAt` are ms epochs; hourly spans yesterday 00:00 to tomorrow 23:00 in
 * the town, its hours placed with the town's own UTC offset. °C out.
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
      hourly: (forecast || []).map((h) => ({ at: h.time.getTime(), tempC: fToC(h.temperatureF), code: h.weatherCode })),
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
    if (!Number.isFinite(minute)) throw new Error(`[useTownSky] ⛔ skyAt needs a minute of the day; got ${minute}`)
    if (!Number.isFinite(dayOfYear)) throw new Error(`[useTownSky] ⛔ skyAt needs dayOfYear — never the authoring calendar's; got ${dayOfYear}`)
    return resolveSkyAtMinute(sky, minute, null, dayOfYear)
  }), [scene, sky])
}

// The tide, for an Almanac: pure functions over the town's tide constituents (cartograph/tide.mjs), no renderer state.
export { tideExtrema, tideAt } from '../../cartograph/tide.mjs'

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

/** The circle that holds a set of buildings: { x, z, radius }, or null when none of `ids` has a place. */
export function frameBuildings(places, ids) {
  const ps = [...ids].map((id) => places?.get(id)).filter(Boolean)
  if (!ps.length) return null
  const x = ps.reduce((a, p) => a + p.x, 0) / ps.length
  const z = ps.reduce((a, p) => a + p.z, 0) / ps.length
  return { x, z, radius: Math.max(...ps.map((p) => Math.hypot(p.x - x, p.z - z) + p.radius)) }
}

/**
 * A building's street address, as the town's slab carries it (SLAB-CONTRACT §6.3, cartograph/building-address.mjs):
 *   null                                   the buildings have not loaded yet
 *   { error }                              an id this town does not have, or a slab baked before addresses — say so
 *   { address, source, candidates? }       address null = none known, or ambiguous (then `candidates` lists what the
 *                                          town's inputs disagree on — the Ward shows them or none, never picks one)
 * The words are the source's (whitespace collapsed); formatting for display is the app's.
 */
export function useBuildingAddress(id) {
  const index = useSlabBuildingIndex((s) => s.index)
  if (!index || id == null) return null
  const e = index.byId.get(id)
  if (!e) return { error: `this town has no building "${id}"` }
  if (e.address === undefined) return { error: 'this town\'s slab was baked before addresses — re-bake its buildings' }
  return { address: e.address, source: e.addressSource, ...(e.addressCandidates && { candidates: e.addressCandidates }) }
}

/**
 * Puts its children on the drawn ground at a place in the town: local metres `x z`, or `lat lon`
 * projected through the town's own place (lib/townPlace.js). `lift` raises them above the ground.
 * The ground's height follows the terrain exaggeration of the shot, every frame.
 * ⭐ `building={id}` instead seats them ON THAT BUILDING'S ROOF — its highest point, over its footprint's centre, lifted
 * exactly as the building is drawn (`roofTopY + centroidY × exaggeration`), every frame; `lift` is then metres above
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
  const y = () => e.roofTopY + e.centroidY * terrainExag.value + lift
  useFrame(() => { if (ref.current && e) ref.current.position.y = y() })
  if (!e) return null
  return <group ref={ref} position={[at.x, y(), at.z]} {...props}>{children}</group>
}
function GroundPoint({ x, z, lat, lon, lift = 0, children, ...props }) {
  const place = useTownPlace()
  const geo = lat != null || lon != null
  const px = geo ? (lon - place.lon) * place.lonToMeters : x
  const pz = geo ? (place.lat - lat) * place.latToMeters : z
  if (!Number.isFinite(px) || !Number.isFinite(pz)) throw new Error(`[TownPoint] ⛔ no place: x=${x} z=${z} lat=${lat} lon=${lon}`)
  const ref = useRef()
  const y = () => getElevationRaw(px, pz) * terrainExag.value + lift
  useFrame(() => { if (ref.current) ref.current.position.y = y() })
  return <group ref={ref} position={[px, y(), pz]} {...props}>{children}</group>
}

/**
 * ⭐ THE TOWN REACHES ITS OWN SKY (2026-09-28). The farthest thing <Town> draws is the sky dome (SKY_RADIUS); the camera
 * it is drawn through must reach past it, or the dome is clipped and the sky reads BLACK in daylight — measured in the
 * Ward, whose Canvas kept R3F's default far = 1000. The kit's apps had hidden it by each pinning `far: 60000`. Town owns
 * the far plane now. Two things a component cannot change once the Canvas exists — the depth buffer (log or linear) and
 * whether it has a shadow map — are the app's Canvas props; when they disagree with the quality profile, Town says so.
 * ▶ node checks/claims-the-town-sees-its-sky.mjs
 */
function TownOptics({ quality }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  // ⭐ HELD EVERY FRAME, on whatever camera is default. An app may make its own camera default at any time (the Ward's
  // plan camera, a drei <PerspectiveCamera makeDefault>); set once per camera identity, such a camera drew ONLY SKY at
  // R3F's far (Quire, measured 2026-09-28). A camera someone else gave a different far is corrected and SAID, once.
  const FAR = SKY_RADIUS * 1.1     // past the dome (and the orbs inside it), with room for the camera's own lift
  const told = useRef(new WeakSet())
  const hold = (cam) => {
    if (!cam || cam.far === FAR) return
    if (!told.current.has(cam) && cam.far !== 1000 && cam.far !== 2000) {
      told.current.add(cam)
      console.warn(`[Town] the default camera's far plane was ${cam.far} — Town owns it (${FAR}, past the sky dome); set nothing on the app's camera`)
    }
    cam.far = FAR
    cam.updateProjectionMatrix()
  }
  useLayoutEffect(() => { hold(camera) }, [camera])
  useFrame((st) => hold(st.camera))
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
  holdScrubbedTime = false, time, movie, flight = true, streetAt, viewInset, flightRef, onFlightEnd, frameKey, frameIds, frameMode = 'densest', onFramed, planHeading = 'town', bearingRef,
  controls = false, movers, onMovers, children,
}) {
  if (time !== undefined && holdScrubbedTime) throw new Error('[Town] ⛔ `time` and `holdScrubbedTime` both drive the clock — pass one (the app owns its time, or Stage holds a scrub)')
  if (time != null && !(time instanceof Date && Number.isFinite(time.getTime()))) throw new Error(`[Town] ⛔ \`time\` is a Date or null (live); got ${time}`)
  if (!lookId) throw new Error('[Town] ⛔ needs lookId — the Look to draw')
  if (!quality?.id) throw new Error('[Town] ⛔ needs quality — a profile from src/lib/qualityProfile.js')
  if (!SHOT_KEY[shot]) throw new Error(`[Town] ⛔ shot "${shot}" is not one of ${Object.keys(SHOT_KEY).join(' · ')}`)
  if (liveIds) throw new Error('[Town] ⛔ liveIds: the live-announcement mark is not built yet (a design question with Jacob) — nothing would draw it')
  for (const k of Object.keys(layers || {})) if (!LAYERS.includes(k)) throw new Error(`[Town] ⛔ unknown layer "${k}" (have: ${LAYERS.join(' ')})`)
  for (const k of Object.keys(overrides)) if (!OVERRIDE_KEYS.includes(k)) throw new Error(`[Town] ⛔ unknown override "${k}"`)
  const on = (k) => layers?.[k] !== false
  // The overhead plan's water reflects the sky as seen across it, not the zenith (waterMaterial WATER_PLAN).
  useEffect(() => { WATER_PLAN.value = shot === 'plan' ? 1 : 0 }, [shot])
  const o = overrides

  const scene = useSceneJson(lookId)
  const bake = bakeLastMs ?? scene?.bakedAt ?? null
  const key = SHOT_KEY[shot]
  if (!Array.isArray(listings)) throw new Error('[Town] ⛔ needs the `listings` prop — the town\'s content listings (an array; [] for a town with none)')
  // What the leaves read (townContext.js) — the shot, the selection, the listings. No player store.
  // The town's labels and their style: labels.json, read once, the style under Stage's live override. Every label
  // reader takes them from here (src/lib/labelStyle.js) — never the authoring store.
  const labelsArtifact = useStreetLabels(lookId, bake)
  const labelStyle = useMemo(() => labelStyleOf(labelsArtifact, o.labels), [labelsArtifact, o.labels])
  const setPieceTitles = useMemo(() => ({ ...labelsArtifact.setPieceTitles, ...(o.setPieceTitles || {}) }), [labelsArtifact, o.setPieceTitles])
  const scope = useMemo(() => ({ shotKey: key, selectedId, select: onSelectBuilding ?? null, listings, streetLabels: labelsArtifact.labels, labelStyle, setPieceTitles }),
    [key, selectedId, onSelectBuilding, listings, labelsArtifact, labelStyle, setPieceTitles])
  // The town's movie: its baked path (heroKeyframes + heroMotion), or the opening view derived from its own disc
  // when it has none — Stage's live keys arrive as overrides. The same resolution the apps used (cameraRegimes.js).
  const stencil = useSceneStencil()
  const heroFov = scene?.shots?.values?.hero?.fov ?? SHOTS_FLAT_DEFAULTS.hero.fov
  const heroMotion = o.heroMotion ?? scene?.heroMotion ?? null
  const heroKeyframes = useMemo(() => o.heroKeyframes ?? (scene ? resolveHeroKeyframes(scene.heroKeyframes, scene.heroMotion, stencil, heroFov, 'town') : null),
    [o.heroKeyframes, scene, stencil, heroFov])
  // The flight between shots (src/camera/ShotFlight.jsx): the plan opens on the Browse frame; a frameKey frames places.
  const places = useBuildingPlaces()
  // Listings with no building are kept (as null): the plan's disclosure names them unplaced, never drops them.
  // What the plan FRAMES — never what it lights (frameIds, header). Absent: the lit set, else every listing.
  const placeIds = useMemo(() => (frameIds != null ? [...frameIds]
    : litIds?.size ? [...litIds] : listings.map((l) => l.building_id ?? null)), [frameIds, litIds, listings])
  const ownHandle = useRef(null)
  const flightHold = useRef(() => false)
  const movieHandle = movie?.handle ?? ownHandle
  const movieHold = useMemo(() => () => flightHold.current() || !!movie?.hold?.(), [movie])
  // ⛔ Nothing draws until THIS town's place and terrain are in: a piece built on the wrong ground stays wrong.
  const loaded = useTownLoaded(lookId)
  if (!loaded) return <><TownOptics quality={quality} /><TownPlace town={town} lookId={lookId} time={time} /></>
  const targetExag = shot === 'plan' ? 0 : shot === 'street' ? 1 : sceneExag()
  // The phone profile mounts the arch and the horizon in the movie shot only (its budget).
  const heavy = !quality.heroOnlyPieces || shot === 'movie'

  return (
    <QualityProvider quality={quality}>
    <TownScope value={scope}>
      <TownOptics quality={quality} />
      <TownPlace town={town} lookId={lookId} time={time} />
      {/* ⭐ THE MOVIE IS TOWN'S (Warden, 2026-09-28): the ONE mount of the driver, playing this town's own baked path
          (Stage's live keys arrive as overrides). Mounted in every shot so an app's tween can sample the path before
          it switches; it plays only in the movie shot. ▶ node checks/claims-one-movie-driver.mjs */}
      <MovieCamera keyframes={heroKeyframes} motion={heroMotion} quality={quality}
        active={shot === 'movie' && (movie?.playing ?? true)}
        start={movie?.start ?? 'random'} onTime={movie?.onTime} hold={movieHold} handle={movieHandle} />
      {/* ⭐ A SHOT CHANGE FLIES (BRIEF-town-shot-flight): the town knows where each shot puts the camera and flies
          there with the one tween, holding the movie while it does. ▶ node checks/claims-one-shot-flight.mjs */}
      <ShotFlight shot={shot} flight={flight} streetAt={streetAt} viewInset={viewInset} flightRef={flightRef}
        onFlightEnd={onFlightEnd} movieHandle={movieHandle} holdRef={flightHold} scene={scene} places={places} placeIds={placeIds} frameMode={frameMode}
        frameKey={frameKey} onFramed={onFramed} planHeading={planHeading} bearingRef={bearingRef} />
      {controls && <RegimeControls regime={shot === 'plan' ? 'plan' : shot === 'street' ? 'street' : 'playback'} />}
      <FrameLimiter paused={paused} idle={idle} everyFrame={quality.movieEveryFrame && shot === 'movie'} flying={flightHold} />
      {!(time instanceof Date) && <TimeTicker holdScrubbedTime={holdScrubbedTime} paused={paused} />}
      <SkyStateTicker paused={paused} />
      {/* Lends this canvas's context to useTownMoonImage; draws nothing, needs no frame. */}
      <Suspense fallback={null}><TownMoonPainter /></Suspense>
      {/* Names the material when a program fails to link — the failure that draws nothing and says nothing. */}
      <ShaderLinkGuard />
      {CSM_ENABLED && <R3FErrorBoundary name="CascadedShadows"><Cascades /></R3FErrorBoundary>}
      {on('shadows') && quality.shadows && <StageShadows lookId={lookId} bakeLastMs={bake} shadowOverride={o.shadow} />}
      {/* No fog in the overhead plan, ever (Jacob, 2026-09-29): from the plan camera's height the town's mist veils the
          whole map. The movie and the street keep it. The post chain's haze and grain are zeroed there too
          (usePostFxDriver). */}
      <StageFog lookId={lookId} bakeLastMs={bake} mistOverride={o.mist} enabled={on('fog') && shot !== 'plan'} />
      <LampGlowDriver lookId={lookId} bakeLastMs={bake} lampGlowOverride={o.lampGlow} />
      <NeonDriver lookId={lookId} bakeLastMs={bake} neonOverride={o.neon} />
      <WeatherPoller mode={weatherMode} />
      <AtmosphereDirectiveDriver lookId={lookId} />
      <WeatherEffects />

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
      {/* Hidden: it keeps the shared terrainExag uniform live; the ribbons and fills ARE the ground. */}
      <group visible={false}>
        <R3FErrorBoundary name="Terrain"><Terrain /></R3FErrorBoundary>
      </group>

      <Suspense fallback={null}>
        <group name="town:ground" visible={on('ground')}>
          <R3FErrorBoundary name="BakedGround"><BakedGround lookId={lookId} bakeLastMs={bake} targetExag={targetExag} surfacesOverride={o.surfaces} /></R3FErrorBoundary>
          <R3FErrorBoundary name="SlabRevetment"><SlabRevetment lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>
          <DrawnAnchor id="ground" />
        </group>
        {/* Neon, street labels and the park title. Its live buildings stay hidden: the slab draws them. */}
        <R3FErrorBoundary name="LafayetteScene">
          <LafayetteScene town={town} lookId={lookId} bakeLastMs={bake} litIds={litIds} labelViewMode={key}
            forceNeonOn={o.neonForceOn} neonDensity={o.neonDensity}
            materialColorsOverride={o.materialColors}
            hiddenLayers={{ building: true, neon: !on('neon'), labels: !on('labels'), parkTitle: scene?.layerVis?.parkTitle === false }} />
        </R3FErrorBoundary>
        <group name="town:buildings" visible={on('buildings')}>
          <R3FErrorBoundary name="SlabBuildings"><SlabBuildings key={`slab-${bake || 0}`} lookId={lookId} interactive={interactive}
            materialPhysicsOverride={o.materialPhysics} paletteOverride={o.buildingPalette} wallPalettesOverride={o.wallPalettes}
            litIds={litIds} litTintOverride={o.litTint} /></R3FErrorBoundary>
          <R3FErrorBoundary name="CityModel"><CityModel key={`city-${bake || 0}`} lookId={lookId} interactive={interactive} /></R3FErrorBoundary>
          <DrawnAnchor id="buildings" />
        </group>
        <group name="town:trees" visible={on('trees')}>
          <R3FErrorBoundary name="InstancedTrees"><InstancedTrees lookId={lookId} bakeLastMs={bake} canopyOverride={o.canopy} /></R3FErrorBoundary>
          <DrawnAnchor id="trees" />
        </group>
        <group name="town:park" visible={on('park')}>
          <R3FErrorBoundary name="LafayettePark"><LafayettePark town={town} lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>
        </group>
        <group name="town:lamps" visible={on('lamps')}>
          <R3FErrorBoundary name="BakedLamps"><BakedLamps lookId={lookId} bakeLastMs={bake} lanternOverride={o.lantern} lampsOnOverride={o.lampsOn} /></R3FErrorBoundary>
        </group>
        <group name="town:setPieces" visible={on('setPieces')}>
          {heavy && <R3FErrorBoundary name="GatewayArch"><GatewayArch lookId={lookId} bakeLastMs={bake} archOverride={o.arch} archLightOverride={o.archLight} /></R3FErrorBoundary>}
          <R3FErrorBoundary name="SetPiece"><SetPiece town={town} lookId={lookId} lightOverride={o.setPieceLight} /></R3FErrorBoundary>
        </group>
        {/* The ground past the rim, out to the horizon — the movie and the street only. In PLAN the town is one closed
            circle ending at its soft rim (Jacob, 2026-09-28; ▶ claims-the-plan-shot-ends-at-the-rim). */}
        {heavy && shot !== 'plan' && <R3FErrorBoundary name="HorizonDisc"><HorizonDisc lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>}
        {/* …and the plan's clean circle at that same one radius: land to the rim, the page's ink past it (PlanRim). */}
        {shot === 'plan' && <R3FErrorBoundary name="PlanRim"><PlanRim /></R3FErrorBoundary>}
        {/* A mesh behind everything, at its true geo spot; nothing unless the Look ships a landscape. */}
        <R3FErrorBoundary name="MountainBackdrop"><MountainBackdrop lookId={lookId} bakeLastMs={bake} landscapeOverride={o.landscape} /></R3FErrorBoundary>
      </Suspense>

      {on('post') && <PostProcessing lookId={lookId} bakeLastMs={bake} viewMode={POST_VIEW[shot]} inspect={postFx}
        bloomOverride={o.bloom} aoOverride={o.ao} exposureOverride={o.exposure} warmthOverride={o.warmth}
        fillOverride={o.fill} haloOverride={o.halo} gradeOverride={o.grade} grainOverride={o.grain}
        dofOverride={o.dof} dofFocusOverride={o.dofFocus} />}
      {/* The town's live dots — the visitor, couriers — positioned by the app, placed and drawn by the town.
          ▶ node checks/claims-a-mover-stands-where-it-is.mjs */}
      {movers ? <Movers movers={movers} shot={shot} onMovers={onMovers} /> : null}
      {children}
    </TownScope>
    </QualityProvider>
  )
}
