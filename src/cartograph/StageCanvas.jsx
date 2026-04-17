/**
 * StageCanvas — 3D scene for Stage mode, mounted inside CartographApp.
 * Uses the same components as /stage but driven by the cartograph store.
 */

import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { SoftShadows } from '@react-three/drei'

import LafayetteScene from '../components/LafayetteScene'
import LafayettePark from '../components/LafayettePark'
import StreetRibbons from '../components/StreetRibbons'
import StreetLights from '../components/StreetLights'
import GatewayArch from '../stage/StageArch'
import CelestialBodies from '../stage/StageSky'
import CloudDome from '../components/CloudDome'
import Terrain from '../components/Terrain'
import R3FErrorBoundary from '../components/R3FErrorBoundary'
import { StageCamera } from '../stage/StageApp.jsx'

import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import useCamera from '../hooks/useCamera'

function FrameLimiter() {
  const inv = useThree((s) => s.invalidate)
  useEffect(() => {
    let id
    const loop = () => { inv(); id = requestAnimationFrame(loop) }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [inv])
  return null
}

function StageSetup() {
  const { gl } = useThree()
  const didSetup = useRef(false)
  useEffect(() => {
    if (didSetup.current) return
    didSetup.current = true
    gl.setClearColor(0x2a2a26, 1)
    useTimeOfDay.getState().setHour(12)
    useCamera.getState().setMode('hero')
  }, [gl])
  return null
}

function TimeTicker() {
  const tick = useTimeOfDay((s) => s.tick)
  const last = useRef(Date.now())
  useFrame(() => { const n = Date.now(); tick(n - last.current); last.current = n })
  return null
}

function SkyStateTicker() {
  // dt is required — otherwise cloudCover/storminess/turbidity go NaN in tick()
  // and the sky shader outputs black. /stage's version passes d; we were missing it.
  useFrame((_, d) => useSkyState.getState().tick(Math.min(d, 0.1)))
  return null
}

export default function StageCanvas({ shot }) {
  return (
    <>
      <StageSetup />
      <FrameLimiter />
      <TimeTicker />
      <SkyStateTicker />
      {/* Sky dome re-enabled 2026-04-16. Was suppressed via skipSkyDome as a
          workaround for an earlier blackout — revisit if blackout returns. */}
      <R3FErrorBoundary name="CelestialBodies"><CelestialBodies debugLevel={0} /></R3FErrorBoundary>
      <R3FErrorBoundary name="CloudDome"><CloudDome /></R3FErrorBoundary>

      <R3FErrorBoundary name="StreetRibbons"><StreetRibbons /></R3FErrorBoundary>
      <R3FErrorBoundary name="Terrain"><Terrain /></R3FErrorBoundary>
      <R3FErrorBoundary name="LafayettePark"><LafayettePark /></R3FErrorBoundary>
      <R3FErrorBoundary name="LafayetteScene"><LafayetteScene /></R3FErrorBoundary>
      <R3FErrorBoundary name="StreetLights"><StreetLights /></R3FErrorBoundary>
      <R3FErrorBoundary name="GatewayArch"><GatewayArch /></R3FErrorBoundary>

      <StageCamera shot={shot} />
    </>
  )
}
