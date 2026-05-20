/**
 * <AtmosphereDirectiveDriver /> — Phase 5a runtime glue.
 *
 * Mounted once inside the Canvas (Scene.jsx + CanaryScene + PreviewApp).
 *   - Calls useAtmosphereDirective() to compute the live directive from
 *     weather + time + operator override and push it to useAtmosphere.rawDirective.
 *   - Each frame, lerps the previously-tweened directive toward
 *     rawDirective using easeInOutCubic over TWEEN_DURATION_MS. Writes
 *     the interpolated result to useAtmosphere.tweenedDirective; that's
 *     what Atmosphere uniforms + InstancedTrees sway subscribe to.
 *
 * Cloud preset crossfade strategy: WEIGHT UNION. When the rule flips
 * preset (e.g. cumulus_humilis → nimbostratus), the tweened blend
 * carries both presets — old weights * (1-t), new weights * t — so the
 * morphology morphs smoothly instead of snapping.
 *
 * Returns null — pure driver, no rendered output.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import useAtmosphere from '../hooks/useAtmosphere.js'
import useAtmosphereDirective from '../hooks/useAtmosphereDirective.js'

const TWEEN_DURATION_MS = 45000  // 45s. Reads as "weather changing", not "scene cut".

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function lerp(a, b, t) { return a + (b - a) * t }

function lerpHex(aHex, bHex, t) {
  if (!aHex) return bHex
  if (!bHex) return aHex
  const a = parseInt(aHex.slice(1), 16)
  const b = parseInt(bHex.slice(1), 16)
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff
  const r = Math.round(lerp(ar, br, t))
  const g = Math.round(lerp(ag, bg, t))
  const bl = Math.round(lerp(ab, bb, t))
  return '#' + [(r << 16) | (g << 8) | bl].map(n => n.toString(16).padStart(6, '0'))[0]
}

/**
 * Weight-union crossfade between two cloud blends. The result carries
 * every preset that appears in either side; weights interpolate from
 * (from*1 → 0) and (to*0 → to*1) across t. Always renormalized so total
 * weight stays ≤ 1.
 */
function lerpCloudBlend(fromClouds, toClouds, t) {
  const ft = 1 - t
  const map = new Map()  // preset id → weight
  for (const c of (fromClouds || [])) {
    map.set(c.preset, (map.get(c.preset) || 0) + (c.weight || 0) * ft)
  }
  for (const c of (toClouds || [])) {
    map.set(c.preset, (map.get(c.preset) || 0) + (c.weight || 0) * t)
  }
  const out = []
  let total = 0
  for (const [preset, weight] of map) {
    if (weight <= 1e-4) continue
    out.push({ preset, weight })
    total += weight
  }
  // Don't force-normalize — the original blends often sum < 1 by design
  // (sparse cirrus rules sum to 0.4). Only divide down if the sum
  // exceeds 1 (would happen mid-crossfade between two heavy blends).
  if (total > 1) for (const o of out) o.weight /= total
  return out
}

function lerpDirective(from, to, t) {
  if (!from) return to
  if (!to) return from
  const out = { clouds: lerpCloudBlend(from.clouds, to.clouds, t) }
  if (from.sun || to.sun) {
    const fs = from.sun || {}
    const ts = to.sun || {}
    out.sun = {
      intensity: lerp(fs.intensity ?? ts.intensity ?? 1, ts.intensity ?? fs.intensity ?? 1, t),
      tint: lerpHex(fs.tint || ts.tint, ts.tint || fs.tint, t),
    }
  }
  if (from.lightDome || to.lightDome) {
    const fl = from.lightDome || {}
    const tl = to.lightDome || {}
    out.lightDome = {
      top: lerpHex(fl.top || tl.top, tl.top || fl.top, t),
      horizon: lerpHex(fl.horizon || tl.horizon, tl.horizon || fl.horizon, t),
      ambientFloor: lerp(fl.ambientFloor ?? tl.ambientFloor ?? 0.25, tl.ambientFloor ?? fl.ambientFloor ?? 0.25, t),
    }
  }
  if (from.wind || to.wind) {
    const fw = from.wind || {}
    const tw = to.wind || {}
    out.wind = {
      scale: lerp(fw.scale ?? tw.scale ?? 1, tw.scale ?? fw.scale ?? 1, t),
      dir: lerp(fw.dir ?? tw.dir ?? 0, tw.dir ?? fw.dir ?? 0, t),
    }
  }
  if (from.precip || to.precip) {
    const fp = from.precip || {}
    const tp = to.precip || {}
    out.precip = {
      kind: tp.kind ?? fp.kind ?? 'none',
      intensity: lerp(fp.intensity ?? 0, tp.intensity ?? 0, t),
    }
  }
  return out
}

export default function AtmosphereDirectiveDriver({ lookId }) {
  useAtmosphereDirective(lookId)

  const lerpStartMs = useRef(null)
  const lerpFromDirective = useRef(null)
  const lastRawRef = useRef(null)

  useFrame(({ clock }) => {
    const raw = useAtmosphere.getState().rawDirective
    if (!raw) return
    const tweened = useAtmosphere.getState().tweenedDirective
    if (!tweened) {
      // Cold start — no prior state to interpolate from. Snap.
      useAtmosphere.setState({ tweenedDirective: raw })
      lastRawRef.current = raw
      return
    }
    if (raw !== lastRawRef.current) {
      // New target — capture the present tween position as the start.
      lerpStartMs.current = clock.elapsedTime * 1000
      lerpFromDirective.current = tweened
      lastRawRef.current = raw
    }
    if (lerpStartMs.current != null) {
      const elapsed = clock.elapsedTime * 1000 - lerpStartMs.current
      const t = Math.min(1, elapsed / TWEEN_DURATION_MS)
      const eased = easeInOutCubic(t)
      const next = lerpDirective(lerpFromDirective.current, raw, eased)
      useAtmosphere.setState({ tweenedDirective: next })
      if (t >= 1) lerpStartMs.current = null
    }
  })

  return null
}
