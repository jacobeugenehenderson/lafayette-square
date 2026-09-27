/**
 * SetPieceUplights — the set-piece's own lighting: two floods at its foot, cross-aimed up its face.
 *
 * ⭐ THE SLOT'S, NOT THE MONUMENT'S (BRIEF-set-piece-contract item 3; Jacob, 2026-09-26: "We need those uplights
 * for the Monument"). <SetPiece> mounts this INSIDE the renderer's base frame (origin = base centre at grade,
 * +Z = the front face), so every set-piece a town declares is lit the same way, with no per-monument code.
 * The Arch keeps its own uplights (GatewayArch.jsx, `archLight`); this is `setPieceLight`, with the same fields.
 *
 * Real three.js spot lights, so they light the set-piece and the ground and buildings at its foot, and the set-
 * piece's MeshStandard materials need nothing added. Fields (skyLightChannels ARCHLIGHT_FIELDS), keyframed:
 *   intensity — the wash at `reach` metres (0 = off; the default, so an unauthored Look is dark)
 *   color · cone° (the beam's half-angle) · reach (m)
 * Candela = intensity × reach², so with physical falloff the face `reach` metres up the beam gets `intensity`.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { ARCHLIGHT_FIELD_KEYS, ARCHLIGHT_FLAT_DEFAULTS, kitDayChannel } from '../cartograph/skyLightChannels.js'

const DEG = Math.PI / 180
const DEFAULT_CHANNEL = Object.freeze(kitDayChannel('setPieceLight'))   // the kit's day: blank by day, up from Sunset

/**
 * @param channel     the `setPieceLight` channel (Stage override ?? scene.json ?? default)
 * @param topM        the set-piece's height above its base, metres (the renderer's declared top)
 * @param halfWidthM  half its base width, metres
 */
export default function SetPieceUplights({ channel, topM, halfWidthM }) {
  if (!(topM > 0) || !(halfWidthM > 0)) throw new Error(`[SetPieceUplights] ⛔ a set-piece renderer must declare topM and halfWidthM (got ${topM}, ${halfWidthM})`)
  const L = useRef(), R = useRef()
  // Floods stand off the front corners; each aims across the face at 60% of the height.
  const rig = useMemo(() => {
    const off = halfWidthM + Math.max(3, topM * 0.08)
    const mk = (side) => {
      const target = new THREE.Object3D()
      target.position.set(-side * halfWidthM * 0.5, topM * 0.6, 0)
      return { pos: [side * off, 0.5, off], target }
    }
    return { L: mk(-1), R: mk(1) }
  }, [topM, halfWidthM])

  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const ch = channel ?? DEFAULT_CHANNEL
    const v = resolveGroupAtMinute(ch, tod.getMinuteOfDay(), ch.animated ? getTodSlotMinutes(tod.currentTime) : null,
      ARCHLIGHT_FIELD_KEYS, ARCHLIGHT_FLAT_DEFAULTS)
    for (const [ref, s] of [[L, 'L'], [R, 'R']]) {
      const l = ref.current; if (!l) continue
      const reach = v[`uplight${s}_reach`]
      l.intensity = v[`uplight${s}_intensity`] * reach * reach
      l.color.set(v[`uplight${s}_color`])
      l.angle = v[`uplight${s}_cone`] * DEG
    }
  })

  return (
    <group name="set-piece-uplights">
      {['L', 'R'].map(s => (
        <group key={s}>
          <primitive object={rig[s].target} />
          <spotLight ref={s === 'L' ? L : R} position={rig[s].pos} target={rig[s].target}
            intensity={0} angle={35 * DEG} penumbra={0.7} decay={2} distance={0} castShadow={false} />
        </group>
      ))}
    </group>
  )
}
