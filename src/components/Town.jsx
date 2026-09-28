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
 * instance (`lookId`). The camera is the app's: mount it as a sibling of <Town>.
 *   town             REQUIRED — the installation's identity: a town manifest's `identity` ({ geography,
 *                    skyMode, profile, setPiece, … }). The kit's apps pass their instance module (the same
 *                    fields) — townForLook(lookId) from src/instance.js. Nothing <Town> reaches resolves a
 *                    town itself. Absent or without geography, it throws naming the prop.
 *   lookId           REQUIRED — the Look to draw (Stage passes the active one; it switches towns live)
 *   quality          a profile from lib/qualityProfile.js — deviceQuality() is the device's own
 *   shot             'movie' | 'plan' | 'street'
 *   paused           draw no frames (a full-screen overlay is up) — under a demand frameloop
 *   idle             the embedding page has scrolled us mostly out of view: draw a third of the frames
 *   selectedId       the selected building, when the app owns selection (else the leaves' clicks do)
 *   onSelectBuilding (id | null) => void — a click on a building
 *   litIds           Set of building ids — a chosen category, a search: their ROOFS take the town's lit
 *                    tint day and night (SlabBuildings), and only they carry neon
 *   interactive      buildings take the pointer (default true)
 *   bakeLastMs       cache-bust token (default: the slab's bakedAt)
 *   layers           visibility, default all on: ground buildings trees park lamps setPieces neon
 *                    labels sky clouds fog shadows post — and `compass`, default OFF: an app opts in
 *                    (`compass: true`), so an app that never asks draws exactly what it drew before
 *   heading          degrees TRUE the Street camera faces, or null — turns the compass dial (no heading, no dial)
 *   compassDial      where Street's compass dial sits — the app's layout: { corner, px, inset } (CompassBezel)
 *   postFx           Preview's per-pass inspection matrix ({ toggles })
 *   overrides        Stage's live authoring channels (see OVERRIDE_KEYS) — an operator drag shows
 *                    without a bake
 *   weatherMode      'live' (default) or Stage's forced weather
 *   holdScrubbedTime a scrubbed clock stays where the operator put it (Stage)
 *   children         the app's overlays, drawn in the town's frame (see <TownPoint>)
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import R3FErrorBoundary from './R3FErrorBoundary'
import TownBridge, { SHOT_KEY, useTownLoaded } from './TownBridge.jsx'
import { TimeTicker, SkyStateTicker } from './SkyTickers.jsx'
import { QualityProvider } from '../lib/qualityProfile.js'
import { useTownPlace } from '../lib/townPlace.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { skyModeOf } from '../lib/skyMode'
import { ShaderLinkGuard } from '../lib/shaderLinkGuard.jsx'
import { sceneExag } from '../utils/terrainShader'
import { terrainExag } from '../utils/terrainShader'
import { getElevationRaw } from '../utils/elevation'
import useSkyState from '../hooks/useSkyState'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import { PostProcessing, StageFog, StageShadows, LampGlowDriver } from './PostProcessing.jsx'
import { NeonDriver } from './NeonBands.jsx'
import CascadedShadows, { CSM_ENABLED } from './CascadedShadows.jsx'
import WeatherPoller from './WeatherPoller'
import AtmosphereDirectiveDriver from './AtmosphereDirectiveDriver'
import WeatherEffects from './WeatherEffects'
import CelestialBodies from './CelestialBodies'
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
import CompassBezel from './CompassBezel.jsx'
import MountainBackdrop from './MountainBackdrop'

// The props contract comes through the one entry: an app asks this for its quality profile.
export { deviceQuality } from '../lib/qualityProfile.js'

const LAYERS = ['ground', 'buildings', 'trees', 'park', 'lamps', 'setPieces', 'neon', 'labels', 'compass', 'sky', 'clouds', 'fog', 'shadows', 'post']
// Stage's live channels, by the piece that takes them. Anything else is refused: a misspelt
// override would otherwise do nothing, silently, while the operator drags a slider.
export const OVERRIDE_KEYS = [
  'buildingPalette', 'materialPhysics', 'materialColors', 'neonForceOn', 'neonDensity', 'neon', 'lampGlow',
  'lantern', 'lampsOn', 'canopy', 'arch', 'archLight', 'setPieceLight', 'landscape', 'shadow', 'mist',
  'sky', 'ambient', 'hemi', 'dirSun', 'dirMoon', 'constellations', 'milkyWay', 'skyGain', 'stars',
  'bloom', 'ao', 'exposure', 'warmth', 'fill', 'halo', 'grade', 'grain', 'dof', 'dofFocus', 'litTint',
]
// PostProcessing's view vocabulary (half-res AO off the movie shot, the street-level bloom bump).
const POST_VIEW = { movie: 'hero', plan: 'browse', street: 'planetarium' }

// Under a demand frameloop nothing renders unless invalidated. The movie shot on a profile that
// asks for it renders every frame; everything else every other frame, a third while idle. Never
// zero while unpaused: going idle is what makes Chrome drop the WebGL surface.
function FrameLimiter({ paused, idle, everyFrame }) {
  const invalidate = useThree((s) => s.invalidate)
  const now = useRef(null)
  now.current = { paused, idle, everyFrame }
  useEffect(() => {
    let n = 0, id
    const loop = () => {
      const { paused, idle, everyFrame } = now.current
      if (!paused && n % (idle ? 3 : everyFrame ? 1 : 2) === 0) invalidate()
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

/** The circle that holds a set of buildings: { x, z, radius }, or null when none of `ids` has a place. */
export function frameBuildings(places, ids) {
  const ps = [...ids].map((id) => places?.get(id)).filter(Boolean)
  if (!ps.length) return null
  const x = ps.reduce((a, p) => a + p.x, 0) / ps.length
  const z = ps.reduce((a, p) => a + p.z, 0) / ps.length
  return { x, z, radius: Math.max(...ps.map((p) => Math.hypot(p.x - x, p.z - z) + p.radius)) }
}

/**
 * Puts its children on the drawn ground at a place in the town: local metres `x z`, or `lat lon`
 * projected through the town's own place (lib/townPlace.js). `lift` raises them above the ground.
 * The ground's height follows the terrain exaggeration of the shot, every frame.
 */
export function TownPoint({ x, z, lat, lon, lift = 0, children, ...props }) {
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

export default function Town({
  town, lookId, quality, shot, paused = false, idle = false, selectedId, onSelectBuilding, litIds, liveIds,
  interactive = true, bakeLastMs, layers, postFx, overrides = {}, weatherMode = 'live',
  holdScrubbedTime = false, heading = null, compassDial, children,
}) {
  if (!lookId) throw new Error('[Town] ⛔ needs lookId — the Look to draw')
  if (!quality?.id) throw new Error('[Town] ⛔ needs quality — a profile from src/lib/qualityProfile.js')
  if (!SHOT_KEY[shot]) throw new Error(`[Town] ⛔ shot "${shot}" is not one of ${Object.keys(SHOT_KEY).join(' · ')}`)
  if (liveIds) throw new Error('[Town] ⛔ liveIds: the live-announcement mark is not built yet (a design question with Jacob) — nothing would draw it')
  for (const k of Object.keys(layers || {})) if (!LAYERS.includes(k)) throw new Error(`[Town] ⛔ unknown layer "${k}" (have: ${LAYERS.join(' ')})`)
  for (const k of Object.keys(overrides)) if (!OVERRIDE_KEYS.includes(k)) throw new Error(`[Town] ⛔ unknown override "${k}"`)
  const on = (k) => layers?.[k] !== false
  const o = overrides

  const scene = useSceneJson(lookId)
  const bake = bakeLastMs ?? scene?.bakedAt ?? null
  const key = SHOT_KEY[shot]
  // ⛔ Nothing draws until THIS town's place and terrain are in: a piece built on the wrong ground stays wrong.
  const loaded = useTownLoaded(lookId)
  if (!loaded) return <TownBridge town={town} lookId={lookId} shot={shot} selectedId={selectedId} onSelectBuilding={onSelectBuilding} />
  const targetExag = shot === 'plan' ? 0 : shot === 'street' ? 1 : sceneExag()
  // The phone profile mounts the arch and the horizon in the movie shot only (its budget).
  const heavy = !quality.heroOnlyPieces || shot === 'movie'

  return (
    <QualityProvider quality={quality}>
      <TownBridge town={town} lookId={lookId} shot={shot} selectedId={selectedId} onSelectBuilding={onSelectBuilding} />
      <FrameLimiter paused={paused} idle={idle} everyFrame={quality.movieEveryFrame && shot === 'movie'} />
      <TimeTicker holdScrubbedTime={holdScrubbedTime} />
      <SkyStateTicker />
      {/* Names the material when a program fails to link — the failure that draws nothing and says nothing. */}
      <ShaderLinkGuard />
      {CSM_ENABLED && <R3FErrorBoundary name="CascadedShadows"><Cascades /></R3FErrorBoundary>}
      {on('shadows') && quality.shadows && <StageShadows lookId={lookId} bakeLastMs={bake} shadowOverride={o.shadow} />}
      <StageFog lookId={lookId} bakeLastMs={bake} mistOverride={o.mist} enabled={on('fog')} />
      <LampGlowDriver lookId={lookId} bakeLastMs={bake} lampGlowOverride={o.lampGlow} />
      <NeonDriver lookId={lookId} bakeLastMs={bake} neonOverride={o.neon} />
      <WeatherPoller mode={weatherMode} />
      <AtmosphereDirectiveDriver lookId={lookId} />
      <WeatherEffects />

      <group visible={on('sky')}>
        <R3FErrorBoundary name="CelestialBodies"><CelestialBodies lookId={lookId} bakeLastMs={bake}
          skyOverride={o.sky} ambientOverride={o.ambient} hemiOverride={o.hemi} dirSunOverride={o.dirSun}
          dirMoonOverride={o.dirMoon} constellationsOverride={o.constellations} milkyWayOverride={o.milkyWay}
          skyGainOverride={o.skyGain} starsOverride={o.stars} /></R3FErrorBoundary>
      </group>
      <group visible={on('clouds')}>
        {/* Sky renderer stopgap (skyMode): <CloudDome/> ships, <Atmosphere/> under ?sky=volumetric. */}
        <R3FErrorBoundary name="Atmosphere">{skyModeOf(town) === 'volumetric' ? <Atmosphere lookId={lookId} /> : <CloudDome />}</R3FErrorBoundary>
      </group>
      {/* Hidden: it keeps the shared terrainExag uniform live; the ribbons and fills ARE the ground. */}
      <group visible={false}>
        <R3FErrorBoundary name="Terrain"><Terrain /></R3FErrorBoundary>
      </group>

      <Suspense fallback={null}>
        <group visible={on('ground')}>
          <R3FErrorBoundary name="BakedGround"><BakedGround lookId={lookId} bakeLastMs={bake} targetExag={targetExag} /></R3FErrorBoundary>
          <R3FErrorBoundary name="SlabRevetment"><SlabRevetment lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>
        </group>
        {/* Neon, street labels and the park title. Its live buildings stay hidden: the slab draws them. */}
        <R3FErrorBoundary name="LafayetteScene">
          <LafayetteScene town={town} lookId={lookId} bakeLastMs={bake} litIds={litIds} labelViewMode={key}
            forceNeonOn={o.neonForceOn} neonDensity={o.neonDensity}
            materialColorsOverride={o.materialColors}
            hiddenLayers={{ building: true, neon: !on('neon'), labels: !on('labels'), parkTitle: scene?.layerVis?.parkTitle === false }} />
        </R3FErrorBoundary>
        <group visible={on('buildings')}>
          <R3FErrorBoundary name="SlabBuildings"><SlabBuildings key={`slab-${bake || 0}`} lookId={lookId} interactive={interactive}
            materialPhysicsOverride={o.materialPhysics} paletteOverride={o.buildingPalette}
            litIds={litIds} litTintOverride={o.litTint} /></R3FErrorBoundary>
          <R3FErrorBoundary name="CityModel"><CityModel key={`city-${bake || 0}`} lookId={lookId} interactive={interactive} /></R3FErrorBoundary>
        </group>
        <group visible={on('trees')}>
          <R3FErrorBoundary name="InstancedTrees"><InstancedTrees lookId={lookId} bakeLastMs={bake} canopyOverride={o.canopy} /></R3FErrorBoundary>
        </group>
        <group visible={on('park')}>
          <R3FErrorBoundary name="LafayettePark"><LafayettePark town={town} lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>
        </group>
        <group visible={on('lamps')}>
          <R3FErrorBoundary name="BakedLamps"><BakedLamps lookId={lookId} bakeLastMs={bake} lanternOverride={o.lantern} lampsOnOverride={o.lampsOn} /></R3FErrorBoundary>
        </group>
        <group visible={on('setPieces')}>
          {heavy && <R3FErrorBoundary name="GatewayArch"><GatewayArch lookId={lookId} bakeLastMs={bake} archOverride={o.arch} archLightOverride={o.archLight} /></R3FErrorBoundary>}
          <R3FErrorBoundary name="SetPiece"><SetPiece town={town} lookId={lookId} lightOverride={o.setPieceLight} /></R3FErrorBoundary>
        </group>
        {heavy && <R3FErrorBoundary name="HorizonDisc"><HorizonDisc lookId={lookId} bakeLastMs={bake} /></R3FErrorBoundary>}
        {/* The town's edge as a compass: ticks at the rim in plan, a dial in Street, nothing in the movie. */}
        {layers?.compass === true && <R3FErrorBoundary name="CompassBezel"><CompassBezel lookId={lookId} bakeLastMs={bake} shot={shot} heading={heading} dial={compassDial} /></R3FErrorBoundary>}
        {/* A mesh behind everything, at its true geo spot; nothing unless the Look ships a landscape. */}
        <R3FErrorBoundary name="MountainBackdrop"><MountainBackdrop lookId={lookId} bakeLastMs={bake} landscapeOverride={o.landscape} /></R3FErrorBoundary>
      </Suspense>

      {on('post') && <PostProcessing lookId={lookId} bakeLastMs={bake} viewMode={POST_VIEW[shot]} inspect={postFx}
        bloomOverride={o.bloom} aoOverride={o.ao} exposureOverride={o.exposure} warmthOverride={o.warmth}
        fillOverride={o.fill} haloOverride={o.halo} gradeOverride={o.grade} grainOverride={o.grain}
        dofOverride={o.dof} dofFocusOverride={o.dofFocus} />}
      {children}
    </QualityProvider>
  )
}
