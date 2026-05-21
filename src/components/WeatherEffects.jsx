/**
 * <WeatherEffects /> — top-level orchestrator for the Phase 7
 * Atmospheric Consumers (7b rain, 7c snow, 7d lightning).
 *
 * Mounted once inside the Canvas in Scene.jsx alongside
 * <AtmosphereDirectiveDriver />. Reads the tweened directive each frame,
 * gates which particle systems + integrator drivers run, and propagates
 * intensity / wind / lightning rate down.
 *
 * Shipped: Tempest, 2026-05-20. Phase 7a (wind field + tree response)
 * deferred — production trees aren't mounted yet.
 *
 * Hail is rendered as rain-shape with `kind='hail'` so RainParticles
 * widens + recolors particles. Hail also drives the wet integrator (the
 * world becomes wet, accumulation skipped).
 */
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useAtmosphere from '../hooks/useAtmosphere.js'
import { WEATHER_UNIFORMS } from '../lib/weather-uniforms.js'
import RainParticles from './weather/RainParticles.jsx'
import SnowParticles from './weather/SnowParticles.jsx'
import LightningDriver from './weather/LightningDriver.jsx'

// Integrator rates — units of `value-per-second` change toward target.
// Wet: ~50s to fill, ~100s to drain. Slow enough to feel like puddles
// forming, fast enough to respond during a session.
const WET_RISE_RATE = 0.02
const WET_DECAY_RATE = 0.01
// Snow: ~3min to build to full, ~10min to fade. Snow accumulation is
// the photograph — feel it slowly.
const SNOW_RISE_RATE = 0.005
const SNOW_DECAY_RATE = 0.0017

function damp(current, target, rate, dt) {
  const t = 1 - Math.exp(-rate * dt * 60)  // 60 normalizes "per frame" tuning
  return current + (target - current) * t
}

function WetnessDriver({ active, intensity }) {
  useFrame((_, dt) => {
    const cur = WEATHER_UNIFORMS.uWetness.value
    const target = active ? intensity : 0
    const rate = active ? WET_RISE_RATE : WET_DECAY_RATE
    WEATHER_UNIFORMS.uWetness.value = damp(cur, target, rate, Math.min(dt, 0.1))
  })
  return null
}

function SnowAccumulationDriver({ active, intensity }) {
  useFrame((_, dt) => {
    const cur = WEATHER_UNIFORMS.uSnowAccumulation.value
    // *1.5 lets light intensity build modestly, full snow saturates.
    const target = active ? Math.min(1, intensity * 1.5) : 0
    const rate = active ? SNOW_RISE_RATE : SNOW_DECAY_RATE
    WEATHER_UNIFORMS.uSnowAccumulation.value = damp(cur, target, rate, Math.min(dt, 0.1))
  })
  return null
}

export default function WeatherEffects() {
  // Subscribe at component scope so React mounts/unmounts particle
  // systems when kind flips. Useframe-driven uniforms continue to update
  // even when no kind is active (decay path).
  const directive = useAtmosphere((s) => s.tweenedDirective)
  if (!directive) {
    return (
      <>
        <WetnessDriver active={false} intensity={0} />
        <SnowAccumulationDriver active={false} intensity={0} />
      </>
    )
  }

  const kind = directive.precip?.kind || 'none'
  const intensity = directive.precip?.intensity ?? 0
  const lightningRate = directive.lightning?.rate ?? 0
  const lightningKind = directive.lightning?.kind ?? 'intracloud'

  const isRain = kind === 'rain' || kind === 'hail' || kind === 'sleet'
  const isSnow = kind === 'snow'

  return (
    <>
      {isRain && intensity > 0.01 && (
        <RainParticles intensity={intensity} kind={kind} />
      )}
      {isSnow && intensity > 0.01 && (
        <SnowParticles intensity={intensity} />
      )}
      <WetnessDriver active={isRain} intensity={intensity} />
      <SnowAccumulationDriver active={isSnow} intensity={intensity} />
      {lightningRate > 0 && (
        <LightningDriver rate={lightningRate} kind={lightningKind} />
      )}
    </>
  )
}
