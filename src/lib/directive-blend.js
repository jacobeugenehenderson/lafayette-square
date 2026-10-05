// The blend between two weather directives, shared by the Stage/Preview/production
// driver (AtmosphereDirectiveDriver) and the checks. Moved out of the component so a
// node check can prove it (claims-the-light-follows-the-weather).
import { NORMAL_SUN_INTENSITY } from './sky-scalars.js'

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

export function lerpDirective(from, to, t) {
  if (!from) return to
  if (!to) return from
  const out = { clouds: lerpCloudBlend(from.clouds, to.clouds, t) }
  // ⛔ A directive that authors NO sun (or dome) means "no override", so the blend
  // fades the old one out and then DROPS it. It used to keep the previous sun forever:
  // a sun of intensity 0 from an earlier directive held Provincetown at full darkness
  // at noon whatever the weather (sky-scalars: darkness 1 -> cloud 1, storm 1, one stop
  // down), and Stage's Clear did nothing (Jacob, 2026-09-26).
  if (to.sun) {
    const fs = from.sun || {}
    const ts = to.sun
    out.sun = {
      intensity: lerp(fs.intensity ?? NORMAL_SUN_INTENSITY, ts.intensity ?? NORMAL_SUN_INTENSITY, t),
      tint: lerpHex(fs.tint || ts.tint, ts.tint || fs.tint, t),
    }
  } else if (from.sun && t < 1) {
    out.sun = {
      intensity: lerp(from.sun.intensity ?? NORMAL_SUN_INTENSITY, NORMAL_SUN_INTENSITY, t),
      tint: from.sun.tint,
    }
  }
  if (to.lightDome || (from.lightDome && t < 1)) {
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
      dir:   lerp(fw.dir   ?? tw.dir   ?? 0, tw.dir   ?? fw.dir   ?? 0, t),
      // Authored, but unread since 2026-10-04: the wind reaches consumers through windSheet.js#windStateOfWeather (the
      // one cable). The Meteorologist fills that object when it takes the final say (meteorologist/ARCHITECTURE.md §9).
      speed:        lerp(fw.speed        ?? tw.speed        ?? 0, tw.speed        ?? fw.speed        ?? 0, t),
      gustsScale:   lerp(fw.gustsScale   ?? tw.gustsScale   ?? 0, tw.gustsScale   ?? fw.gustsScale   ?? 0, t),
      gustEnvelope: lerp(fw.gustEnvelope ?? tw.gustEnvelope ?? 1, tw.gustEnvelope ?? fw.gustEnvelope ?? 1, t),
    }
    if (fw.gustFrontVelocity || tw.gustFrontVelocity) {
      const fg = fw.gustFrontVelocity || {}
      const tg = tw.gustFrontVelocity || {}
      out.wind.gustFrontVelocity = {
        x: lerp(fg.x ?? tg.x ?? 0, tg.x ?? fg.x ?? 0, t),
        z: lerp(fg.z ?? tg.z ?? 0, tg.z ?? fg.z ?? 0, t),
      }
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
  // Lightning is mostly stochastic per-frame; carry the latest kind +
  // numeric tween for rate / distance so a fading thunderstorm gracefully
  // turns lightning off.
  if (from.lightning || to.lightning) {
    const fl = from.lightning || {}
    const tl = to.lightning || {}
    out.lightning = {
      rate:     lerp(fl.rate ?? 0, tl.rate ?? 0, t),
      distance: lerp(fl.distance ?? 0, tl.distance ?? 0, t),
      kind:     tl.kind ?? fl.kind ?? 'intracloud',
    }
  }
  return out
}
