/**
 * CompassBezel — the town's edge as a compass (BRIEF-compass-bezel). A <Town> layer.
 *
 * ONE model (lib/compassBezel.js), TWO renderings, no second definition of a tick:
 *   plan    the ticks and N · E · S · W lie on the ground at the town's own rim, in the town's
 *           frame — so when the app turns its map, the bezel turns with it, like a compass card.
 *   street  a screen-space dial over the canvas, turned by `heading` so the top of the dial is
 *           the way the camera faces. No heading → no dial: the facing is never guessed.
 *   movie   nothing (Jacob: "not in movie").
 *
 * Props
 *   lookId       REQUIRED — the Look (its disc from ground.json; its authored `compass` from scene.json)
 *   bakeLastMs   cache-bust token, as every slab reader takes
 *   shot         'movie' | 'plan' | 'street'
 *   heading      degrees TRUE the camera faces, or null (Street's dial)
 *   dial         where Street's dial sits — the APP's layout, never the town's:
 *                { corner: 'top-left'|'top-right'|'bottom-left'|'bottom-right', px, inset }
 *
 * ⛔ No fallbacks: a town with no disc draws no bezel and says so once.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html, Text } from '@react-three/drei'
import { ASSET_BASE } from '../lib/bakedUrl.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { getElevationRaw } from '../utils/elevation'
import { terrainExag } from '../utils/terrainShader'
import { bezelModel, atBearing } from '../lib/compassBezel.js'

// Above the street labels (SceneLabel's 16): the bezel is the map's frame, read over everything on it.
const RENDER_ORDER = 17

const _said = new Set()
const sayOnce = (look, msg) => { if (!_said.has(look)) { _said.add(look); console.warn(`[CompassBezel] ${look}: ${msg}`) } }

function useStencil(lookId, cacheBust) {
  const [stencil, setStencil] = useState(undefined)   // undefined = loading, null = none
  useEffect(() => {
    if (cacheBust == null) return
    let cancelled = false
    fetch(`${ASSET_BASE}baked/${lookId}/ground.json?t=${cacheBust}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`ground.json ${r.status}`))))
      .then((g) => { if (!cancelled) setStencil(g.stencil ?? null) })
      .catch((e) => { if (!cancelled) { sayOnce(lookId, `no disc to draw: ${e.message}`); setStencil(null) } })
    return () => { cancelled = true }
  }, [lookId, cacheBust])
  return stencil
}

/** Plan: every tick a thin quad lying on the ground at the rim, drawn over the map. */
function RimBezel({ model }) {
  const { center, ticks, cardinals, style } = model
  const mesh = useRef()
  const letters = useRef()
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: style.color, transparent: true, opacity: style.opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }), [style.color, style.opacity])
  useEffect(() => () => material.dispose(), [material])

  // Each tick's ground height, sampled once; the exaggeration is applied per frame (plan draws it flat).
  const placed = useMemo(() => ticks.map((t) => {
    const mid = (t.inner + t.outer) / 2
    const [x, z] = atBearing(center, t.bearing, mid)
    return { ...t, x, z, ground: getElevationRaw(x, z) }
  }), [ticks, center])

  const cardinalPlaces = useMemo(() => cardinals.map((c) => {
    const [x, z] = atBearing(center, c.bearing, c.r)
    return { ...c, x, z, ground: getElevationRaw(x, z) }
  }), [cardinals, center])

  const tmp = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const exag = terrainExag.value
    for (let i = 0; i < placed.length; i++) {
      const t = placed[i]
      tmp.position.set(t.x, t.ground * exag, t.z)
      tmp.rotation.set(-Math.PI / 2, 0, -t.bearing * Math.PI / 180)   // lie flat; long axis along the radius
      tmp.scale.set(t.width, t.outer - t.inner, 1)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    if (letters.current) {
      letters.current.children.forEach((g, i) => { g.position.y = cardinalPlaces[i].ground * exag })
    }
  })

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, placed.length]} renderOrder={RENDER_ORDER} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <primitive object={material} attach="material" />
      </instancedMesh>
      <group ref={letters}>
        {cardinalPlaces.map((c) => (
          <group key={c.letter} position={[c.x, c.ground, c.z]}>
            {/* Upright to the reader when the map is north-up; it turns with the card like a compass's. */}
            <Text rotation={[-Math.PI / 2, 0, 0]} fontSize={c.size} color={style.color} fillOpacity={style.opacity}
              outlineWidth="8%" outlineColor={style.halo} anchorX="center" anchorY="middle"
              renderOrder={RENDER_ORDER} material-depthTest={false}>
              {c.letter}
            </Text>
          </group>
        ))}
      </group>
    </group>
  )
}

const CORNERS = {
  'top-left': { top: 0, left: 0 }, 'top-right': { top: 0, right: 0 },
  'bottom-left': { bottom: 0, left: 0 }, 'bottom-right': { bottom: 0, right: 0 },
}

/** Street: the same ticks and letters, as a dial over the canvas, turned so the facing is at the top. */
export function BezelDial({ model, heading, px, label }) {
  const { ticks, cardinals, radius: R, style } = model
  const r = 50   // the SVG's own units: the rim sits at 50 from the centre of a 100-unit box
  const k = r / R
  return (
    <svg viewBox="-52 -52 104 104" width={px} height={px} role="img" aria-label={label}>
      <g transform={`rotate(${-heading})`}>
        {ticks.map((t) => {
          const b = t.bearing * Math.PI / 180, s = Math.sin(b), c = -Math.cos(b)
          return <line key={t.bearing} x1={s * t.inner * k} y1={c * t.inner * k} x2={s * t.outer * k} y2={c * t.outer * k}
            stroke={style.color} strokeOpacity={style.opacity} strokeWidth={Math.max(t.width * k, 0.6)} strokeLinecap="butt" />
        })}
        {cardinals.map((cd) => {
          const b = cd.bearing * Math.PI / 180
          const x = Math.sin(b) * cd.r * k, y = -Math.cos(b) * cd.r * k
          return <text key={cd.letter} x={x} y={y} transform={`rotate(${heading} ${x} ${y})`} fill={style.color} fillOpacity={style.opacity}
            stroke={style.halo} strokeWidth={0.8} paintOrder="stroke" fontSize={cd.size * k * 1.4} fontFamily="system-ui"
            fontWeight={cd.letter === 'N' ? 700 : 500} textAnchor="middle" dominantBaseline="central">{cd.letter}</text>
        })}
      </g>
      {/* The facing mark: the top of the dial is where the camera looks. */}
      <path d="M 0 -52 L -3 -46 L 3 -46 Z" fill={style.color} fillOpacity={style.opacity} />
    </svg>
  )
}

export default function CompassBezel({ lookId, bakeLastMs, shot, heading = null, dial }) {
  if (!lookId) throw new Error('[CompassBezel] ⛔ needs lookId')
  const scene = useSceneJson(lookId)
  const cacheBust = bakeLastMs ?? scene?.bakedAt ?? null
  const stencil = useStencil(lookId, cacheBust)
  const model = useMemo(() => (stencil === undefined || !scene ? null : bezelModel(stencil, scene.compass)), [stencil, scene])

  if (!model) return null
  if (!model.ok) { sayOnce(lookId, model.reason); return null }
  if (shot === 'plan') return <RimBezel model={model} />
  if (shot === 'street') {
    if (!Number.isFinite(heading) || !dial) return null
    if (!CORNERS[dial.corner] || !(dial.px > 0)) throw new Error(`[CompassBezel] ⛔ dial ${JSON.stringify(dial)} — needs a corner (${Object.keys(CORNERS).join(' ')}) and px`)
    const inset = dial.inset ?? 0
    const pos = Object.fromEntries(Object.entries(CORNERS[dial.corner]).map(([k]) => [k, inset]))
    return (
      <Html fullscreen zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', ...pos, width: dial.px, height: dial.px }}>
          <BezelDial model={model} heading={heading} px={dial.px} label={`Compass, facing ${Math.round(heading)} degrees`} />
        </div>
      </Html>
    )
  }
  return null
}
