/**
 * celestialLights — WHERE THE SUN AND THE MOON ACTUALLY ARE, and how bright each is.
 *
 * ⭐⭐ THIS IS A TRACKER, AND THAT SETTLES THE CLASS OF EVERY DECISION IN HERE.
 * Jacob, 2026-09-20: *"I want the sun and moon to trace their REAL paths. We have
 * the data for that, and part of the purpose of the app is a weather and
 * environment tracker."* ⇒ A body lit from where it is not is **the product being
 * wrong**, not a look to tune. Nothing below is a taste call.
 *
 * ⛔⛔ WHAT THIS REPLACES, AND WHY IT COULD NEVER HAVE BEEN RIGHT:
 * the key light's POSITION used to be `_sunLP.clone().lerp(_nightLP, nightBlend)`
 * — a linear interpolation between the sun's position and the moon's. At either
 * end it is a real body; **in between it is a point in the sky where nothing is.**
 * Through the whole twilight handover (sunAlt −0.12 → −0.25) every shadow, every
 * specular highlight and the glint path on the water tracked a phantom. Jacob saw
 * it on the lake without being told what to look for: *"shouldn't it move along
 * with the sun and moon?"*
 * ⭐ THE FIX IS A DELETION. Two bodies, two lights, each at its own real position,
 * each with its own ramp. Nothing is averaged, so nothing can point at a phantom —
 * and two lights means three's PBR evaluates two specular lobes, so **two glint
 * paths on the water fall out for free**, with no shader change at all.
 *
 * ⭐ This file is PURE — no React, no JSX — so `checks/claims-the-key-light-is-a-
 * real-body.mjs` can sweep a whole day through the same functions the scene uses
 * rather than restating them. That is the only reason the invariant can be held.
 */
import * as THREE from 'three'

// The key light stays close: LIGHT_RADIUS also sizes the shadow frustum's depth
// slab, and pushing it out to clear a big town would change the look.
export const LIGHT_RADIUS = 600

// ⚠️ A DELIBERATE, LOAD-BEARING DIVERGENCE FROM THE REAL SUN — READ BEFORE
// "FIXING" IT. The sun's LIGHT position is floored at y = 100 (of a 600 m
// radius), so the key light never drops below ~9.6° of elevation however low the
// real sun is. It keeps a horizon sun from lighting the undersides of the whole
// town. ⇒ At low sun the light's ALTITUDE is not the sun's; its AZIMUTH always
// is, which is what puts the glint path on the right bearing.
// ⛔ The check asserts exactly this and no more: azimuth must match a real body,
// altitude may differ ONLY by this clamp. An undocumented divergence and a
// documented one look identical from a screenshot; only the check tells them apart.
export const SUN_LIGHT_MIN_Y = 100

// The moon's light is floored just below the horizon so it does not snap out as
// the moon sets — 0.05 rad ≈ 2.9°, small enough that the moon light is at the
// moon's real position for every hour it is meaningfully lit.
export const MOON_LIGHT_MIN_ALT = -0.05

/**
 * Sky position → world position. ⭐ ONE convention, used for lights, orbs and the
 * check alike: azimuth is measured from due south and the scene's −Z is north,
 * which is why callers pass `azimuth + Math.PI`.
 */
export function celestialToPosition(azimuth, altitude, radius, out, minY = null) {
  out.x = radius * Math.cos(altitude) * Math.sin(azimuth)
  out.y = radius * Math.sin(altitude)
  out.z = -radius * Math.cos(altitude) * Math.cos(azimuth)
  if (minY !== null) out.y = Math.max(out.y, minY)
  return out
}

/** How far into the sun→moon handover we are: 0 at sunAlt −0.12, 1 at −0.25. */
export function nightBlendFor(sunAlt) {
  return Math.max(0, Math.min(1, (-0.12 - sunAlt) / 0.13))
}

/**
 * The sun's own intensity ramp, by altitude alone.
 *
 * ⭐ CONTINUOUS AT EVERY SEAM BY CONSTRUCTION — each branch's endpoints are the
 * next branch's start, so removing the lerp introduced no step anywhere. The
 * first three brackets are the shipped day/golden/twilight values, unchanged; the
 * fourth is new and is the whole point: below the handover the sun goes to ZERO
 * at its own real position, instead of being dragged toward the moon.
 */
export function sunIntensity(sunAlt) {
  if (sunAlt >= 0.3) return 2.2
  if (sunAlt >= 0.05) return 0.7 + ((sunAlt - 0.05) / 0.25) * 1.5
  if (sunAlt >= -0.12) return 0.4 + ((sunAlt + 0.12) / 0.17) * 0.3
  return 0.4 * (1 - nightBlendFor(sunAlt))
}

// ⚠️ A LOOK, NOT A MEASUREMENT, AND SAID SO. The moon's true irradiance is about
// 1/400,000 of the sun's; at that ratio a daytime moon lays no path at all and the
// tracker would be hiding a body that is really up there. ⛔ The brief rules that
// a daytime moon KEEPS its faint path — "a tracker that hides a real body to look
// tidy has stopped tracking" — so this is the floor at which it stays visible
// beside a 2.2 sun. It is not derived and it has not been eye-gated.
const DAY_MOON_FLOOR = 0.12

/**
 * The moon's intensity — phase-aware and altitude-aware, which is exactly what a
 * tracker wants: a new moon lays no path, a full moon high in the sky lays a
 * bright one, and a setting moon fades rather than snapping out.
 * ⭐ At deep night this returns precisely what shipped before, so the night look
 * an operator already knows is unmoved by the rewrite.
 */
export function moonIntensity(moonAlt, illumFraction, sunAlt) {
  const altFade = Math.max(0, Math.min(1, (moonAlt + 0.05) / 0.30))
  const brightness = (0.15 + illumFraction * 0.35) * altFade
  const dayScale = DAY_MOON_FLOOR + (1 - DAY_MOON_FLOOR) * nightBlendFor(sunAlt)
  return brightness * dayScale
}

/**
 * Both bodies, as lights, at their real positions.
 *
 * `key` is the BRIGHTER of the two and is the one that casts — one shadow map,
 * never two. ⚠️ There is a visible handover at the crossover, when the shadow
 * direction changes body. It is accepted rather than hidden: cross-fading it
 * would mean casting twice, and averaging it is the bug this file deletes.
 *
 * @returns {{sun, moon, key, counter}} each light: {body, position, intensity, color}
 */
export function bodyLights({ sunAlt, sunAz, moonAlt, moonAz, moonIllumFraction }) {
  const sunPos = celestialToPosition(sunAz + Math.PI, sunAlt, LIGHT_RADIUS, new THREE.Vector3(), SUN_LIGHT_MIN_Y)
  const moonPos = celestialToPosition(moonAz + Math.PI, Math.max(MOON_LIGHT_MIN_ALT, moonAlt), LIGHT_RADIUS, new THREE.Vector3())

  // ⭐ `body` travels with the light so the consumer can hand it the OPERATOR
  // CHANNEL THAT BELONGS TO IT — `dirSun` follows the sun whether or not the sun
  // happens to be the key right now, and `dirMoon` follows the moon. Keying the
  // channels to key/counter instead would make a knob mean a different light at
  // different hours, which is the unit confusion this project keeps paying for.
  const sun = { body: 'sun', position: sunPos, intensity: sunIntensity(sunAlt), color: sunColor(sunAlt) }
  const moon = { body: 'moon', position: moonPos, intensity: moonIntensity(moonAlt, moonIllumFraction, sunAlt), color: '#9ab8e0' }

  // ⚠️ THE TIE-BREAK MATTERS EVEN WHEN NEITHER BODY LIGHTS ANYTHING. Deep night
  // with the moon below the horizon leaves both intensities at 0, and the key is
  // still published as `keyDirection` for the impostor cards — which are
  // MeshBasic and shade from that direction whatever our lights are doing. So
  // when the two are equally bright, the body that is actually UP wins.
  const EPS = 1e-6
  const sunWins = sun.intensity > moon.intensity + EPS ? true
                : moon.intensity > sun.intensity + EPS ? false
                : sunAlt >= moonAlt
  return { sun, moon, key: sunWins ? sun : moon, counter: sunWins ? moon : sun }
}

// Sun colour through the day — the shipped ramps, lifted unchanged. Below the
// handover the sun's intensity is on its way to zero, so its colour stops
// mattering; it holds the last twilight red rather than inventing a value.
const _c1 = new THREE.Color(), _c2 = new THREE.Color()
function mixHex(a, b, t) {
  _c1.set(a); _c2.set(b)
  return '#' + _c1.lerp(_c2, Math.max(0, Math.min(1, t))).getHexString()
}
export function sunColor(sunAlt) {
  if (sunAlt >= 0.3) return '#fffefa'
  if (sunAlt >= 0.05) return mixHex('#ffaa55', '#fff8e8', (sunAlt - 0.05) / 0.25)
  if (sunAlt >= -0.12) return mixHex('#ff6644', '#ffaa66', (sunAlt + 0.12) / 0.17)
  return '#ff6644'
}
