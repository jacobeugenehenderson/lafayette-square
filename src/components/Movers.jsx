/**
 * Movers — the town's ONE live-marker layer: the visitor ('you') and couriers ('courier'), drawn where they stand
 * (Warden, 2026-09-28). Mounted once, in <Town>. The app supplies the positions (<Town movers>); src/lib/movers.js
 * places them through the town's own place and disc; this draws each KIND's look.
 * ▶ node checks/claims-a-mover-stands-where-it-is.mjs
 *
 * The looks are ported from the old player (frozen until the cutover):
 *   you      UserDot.jsx — an orange dot with a white border and a slow pulse, ALWAYS on top ("you are here" is never
 *            hidden by the roof it stands under)
 *   courier  CourierDots.jsx — blue on a delivery, yellow idle, a quicker pulse, depth-tested like the town
 * Every dot rides the DRAWN ground (elevation × the shot's exaggeration, + 2 m): ⛔ never a fixed height — the old
 * courier layer's 35 m floated on flat Lafayette Square and buried itself on a hill.
 * Nothing is drawn in the movie, nor outside the town's disc (the app hears which via <Town onMovers>).
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { placeMovers } from '../lib/movers.js'
import { townPlace } from '../lib/townPlace.js'
import { useSceneStencil } from '../lib/cameraRegimes.js'
import { getElevationRaw } from '../utils/elevation'
import { terrainExag } from '../utils/terrainShader'

const CLEARANCE = 2            // metres above the drawn ground, so a disc never z-fights the terrain it rides
// ⭐ RENDER ORDER, BOTH KINDS. The town's ground is drawn in the TRANSPARENT pass (its fade), and three.js draws every
// opaque mesh before any transparent one — so an opaque dot, or a transparent one ordered before the ground, is painted
// over by it (measured 2026-09-28: the visitor's dot and border vanished, the couriers entirely). Every part of a dot is
// transparent and ordered after the ground. The visitor ignores depth (never hidden, as UserDot); a courier is still
// depth-tested, so a roof or a canopy hides it — ordered after the ground, it only loses to what is above it.
const ON_TOP = 9999            // the visitor's render order (depthTest off)
const AFTER_GROUND = 9900      // a courier's (depth-tested)

// Each kind's look, as the old player drew it.
const LOOK = {
  you: {
    color: () => '#f97316', dot: 3, border: [3, 4], ring: [5, 6], ringOpacity: 0.35, grow: 0.6, fade: 0.6, hz: 0.5, onTop: true,
  },
  courier: {
    color: (m) => (m.active ? '#3b82f6' : '#eab308'), dot: 2.5, border: [2.5, 3.3], ring: [4, 5], ringOpacity: 0.3, grow: 0.5, fade: 0.5, hz: 0.4, onTop: false,
  },
}

function Mover({ m }) {
  const look = LOOK[m.kind]
  const color = look.color(m)
  const group = useRef(), ring = useRef()
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: look.ringOpacity, side: THREE.DoubleSide, depthWrite: false, depthTest: !look.onTop,
  }), [color, look])
  useEffect(() => () => ringMat.dispose(), [ringMat])
  const order = (k) => (look.onTop ? ON_TOP : AFTER_GROUND) + k
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = getElevationRaw(m.x, m.z) * terrainExag.value + CLEARANCE
    if (!ring.current) return
    const t = (Math.sin(clock.elapsedTime * Math.PI * 2 * look.hz) + 1) / 2
    const s = 1 + t * look.grow
    ring.current.scale.set(s, s, 1)
    ringMat.opacity = look.ringOpacity * (1 - t * look.fade)
  })
  return (
    <group ref={group} position={[m.x, getElevationRaw(m.x, m.z) * terrainExag.value + CLEARANCE, m.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh renderOrder={order(2)}>
        <circleGeometry args={[look.dot, 24]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} depthTest={!look.onTop} />
      </mesh>
      <mesh position={[0, 0, -0.01]} renderOrder={order(1)}>
        <ringGeometry args={[look.border[0], look.border[1], 24]} />
        <meshBasicMaterial color="#ffffff" transparent depthWrite={false} depthTest={!look.onTop} />
      </mesh>
      <mesh ref={ring} position={[0, 0, -0.02]} renderOrder={order(0)} material={ringMat}>
        <ringGeometry args={[look.ring[0], look.ring[1], 32]} />
      </mesh>
    </group>
  )
}

export default function Movers({ movers, shot, onMovers }) {
  const disc = useSceneStencil()
  const placed = useMemo(() => placeMovers(movers || [], townPlace(), disc), [movers, disc])
  // The app hears where each one stands and whether it is inside — once per change, not per frame.
  const said = useRef(null)
  useEffect(() => {
    const key = JSON.stringify(placed.map((p) => [p.id, Math.round(p.x * 10), Math.round(p.z * 10), p.inside]))
    if (key === said.current) return
    said.current = key
    onMovers?.(placed.map(({ id, x, z, inside }) => ({ id, x, z, inside })))
  }, [placed, onMovers])
  const noDisc = useRef(false)
  useEffect(() => {
    if (!disc && placed.length && !noDisc.current) {
      noDisc.current = true
      console.error(`[Town] movers: "${townPlace().lookId}" has published no disc yet — every mover is outside the town until it has`)
    }
  }, [disc, placed.length])
  if (shot === 'movie') return null
  return <group name="movers">{placed.filter((p) => p.inside).map((p) => <Mover key={p.id} m={p} />)}</group>
}
