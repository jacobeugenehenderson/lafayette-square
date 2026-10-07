import { useMemo, useState, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { categoryNeon } from '../lib/categoryColor.js'
import { neon as _neonUniforms } from '../preview/neonState.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { UNIFORMS as TERRAIN_UNIFORMS } from '../utils/terrainShader'
import { buildingLiftY } from '../lib/buildingLift.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS, kitDayChannel } from '../cartograph/skyLightChannels.js'
import { lookOf } from '../lib/lookOf.js'
import { useTownContext } from './townContext.js'
import useTownHover from './townHover.js'

/**
 * NeonBands — the neon of every open place: TWO DRAWINGS of one sign, handed off by on-screen size
 * (BRIEF-neon-reads-at-every-distance, Jacob 2026-10-06). One merged mesh per drawing per scene.
 *
 *   - THE TUBE — physical glass, `tubeCm` of the neon channel, swept along the eave. Never inflated: up close it is
 *     the size a real tube is. Read as the fresnel-shaded round tube (DoubleSide + additive, no front-face flip).
 *   - THE LINE — a screen-space line along the same axis, `linePx` device pixels wide whatever the distance, so the
 *     sign reads from the overhead Browse frame to Hero's horizon. At the far extreme a short run is a glowing dash.
 *   - THE HAND-OFF — per vertex, by the tube's own on-screen diameter against `handoffPx`: below it the line carries
 *     the sign, above it the tube does, crossfading across HANDOFF_BAND. By on-screen size, never by shot or distance,
 *     so no camera and no town is special. `lineGain` balances the line's brightness against the tube's.
 *   - ITS OWN COLOUR — both drawings roll their intensity off along the category hue (`hueRoll`): the brightest channel
 *     approaches 1 and the others keep their proportion, so the sign reads as its colour, never a white core with the
 *     colour only in the bloom. `emissive` is how fast it reaches full.
 *
 * Driven every frame from the neon channel by NeonDriver (below), mounted once by <Town> in every app; Stage hands it
 * its live channel as `neonOverride`. Per-vertex terrain lift via `aCentroid` (the footprint-corner mean + the drawn ground's own height, threaded
 * through openPlaces as `groundYRaw`), the anchor Foundations and walls use. Raw ShaderMaterials #include the
 * <logdepthbuf_*> chunks, defined only when the renderer runs a log depth buffer
 * ([[feedback_raw_shadermaterial_needs_logdepth_chunks]], the material below).
 */

// ── Geometry constants ──────────────────────────────────────────────
// The tube's radius is the channel's `tubeCm` (centimetres). It drives vertex positions, so a change rebuilds the
// merged geometry: the per-frame read is quantized to TUBE_CM_STEP so a keyed day only rebuilds on a step crossing.
// The tube's BOTTOM sits flush on the eave (its axis is one radius up).
const TUBE_CM_STEP = 0.25
// ⭐ The hand-off's crossfade band, as a RATIO of on-screen sizes — dimensionless and in pixel space, so it means the
// same on every camera and every town. The tube is fully drawn once its on-screen diameter is handoffPx × BAND and
// gone below handoffPx ÷ BAND; the line is the complement. A constant by ruling (Jacob via Boz, 2026-10-06).
const HANDOFF_BAND = 1.5
const OFFSET_OUT   = 0.5                       // meters past wall face — clears any eave/cornice
const CROSS_SEGS   = 8                         // facets around the circular cross-section
const CORNER_SEGS  = 3                         // arc segs per convex corner
const CORNER_MIN   = 15 * Math.PI / 180        // turns smaller than this collapse to one mitred point
// ⭐ A click within this many device pixels of a sign's drawn edge picks it — pixel space, so the same reach at any
// distance, on any town (a 5 px line is otherwise a 2.5 px target).
export const PICK_SLOP_PX = 4

// ── Helpers ─────────────────────────────────────────────────────────

function pointInPolyXZ(px, pz, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Resolve the outward perpendicular sign for a footprint walked in
 * either winding. Probe the first edge's midpoint offset by the raw
 * `(e_z, -e_x)` normal; if that probe point falls INSIDE the polygon
 * the raw normal is inward and we flip. Robust per-footprint — works
 * with the mixed CW/CCW windings in buildings.json.
 */
function detectOutwardSign(footprint) {
  const [x1, z1] = footprint[0]
  const [x2, z2] = footprint[1]
  const ex = x2 - x1, ez = z2 - z1
  const L = Math.hypot(ex, ez) || 1
  const nx = ez / L, nz = -ex / L
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2
  return pointInPolyXZ(mx + nx * 0.01, mz + nz * 0.01, footprint) ? -1 : 1
}

/**
 * Walk a place's stretch of wall → emit a ring chain at uniform OFFSET_OUT outward. The stretch is OPEN (a place's
 * share of its building's face, src/lib/neonPlaces.js); its ends take their own edge's normal. Interior corners:
 * convex → arc sweep, concave → mitred, near-straight → one averaged ring. `ws` is the outward sign of the building's
 * footprint winding (the stretch runs in footprint order).
 *
 * Each ring carries { x, z, nx, nz } — center XZ + outward direction.
 * The outward direction is needed downstream to orient the tube's
 * cross-section.
 */
function buildPath(pts, ws) {
  const n = pts.length
  const rings = []
  for (let i = 0; i < n; i++) {
    const cur  = pts[i]
    // An end has one edge: use it on both sides, so the end ring takes that edge's normal.
    const prev = i > 0 ? pts[i - 1] : [2 * cur[0] - pts[i + 1][0], 2 * cur[1] - pts[i + 1][1]]
    const next = i < n - 1 ? pts[i + 1] : [2 * cur[0] - pts[i - 1][0], 2 * cur[1] - pts[i - 1][1]]
    const e1x = cur[0] - prev[0], e1z = cur[1] - prev[1]
    const e2x = next[0] - cur[0], e2z = next[1] - cur[1]
    const l1 = Math.hypot(e1x, e1z) || 1
    const l2 = Math.hypot(e2x, e2z) || 1
    const n1x = ws * (e1z / l1), n1z = ws * (-e1x / l1)
    const n2x = ws * (e2z / l2), n2z = ws * (-e2x / l2)
    const dotN = Math.max(-1, Math.min(1, n1x * n2x + n1z * n2z))
    const turn = Math.acos(dotN)
    // Convex when the turn opens away from the interior — sign depends
    // on the footprint winding which `ws` already captures.
    const isConvex = (n1x * n2z - n1z * n2x) * ws > 0

    if (turn < CORNER_MIN) {
      let nx = (n1x + n2x) / 2, nz = (n1z + n2z) / 2
      const nl = Math.hypot(nx, nz) || 1
      nx /= nl; nz /= nl
      rings.push({ x: cur[0] + nx * OFFSET_OUT, z: cur[1] + nz * OFFSET_OUT, nx, nz })
    } else if (isConvex) {
      const a1 = Math.atan2(n1z, n1x)
      const segs = Math.max(1, Math.min(CORNER_SEGS, Math.ceil(turn / (Math.PI / 4))))
      for (let s = 0; s <= segs; s++) {
        const a = a1 + turn * (s / segs) * ws  // sweep direction follows winding
        const nx = Math.cos(a), nz = Math.sin(a)
        rings.push({ x: cur[0] + nx * OFFSET_OUT, z: cur[1] + nz * OFFSET_OUT, nx, nz })
      }
    } else {
      let nx = (n1x + n2x) / 2, nz = (n1z + n2z) / 2
      const nl = Math.hypot(nx, nz) || 1
      nx /= nl; nz /= nl
      const mitre = Math.min(1 / Math.sqrt((1 + dotN) / 2), 4)
      rings.push({ x: cur[0] + nx * OFFSET_OUT * mitre, z: cur[1] + nz * OFFSET_OUT * mitre, nx, nz })
    }
  }
  return rings
}

/**
 * Sweep a circular cross-section along the ring chain → cylindrical
 * tube. Returns flat geometry buffers (caller merges all places into
 * one BufferGeometry).
 *
 * Cross-section: full circle (CROSS_SEGS facets) in the vertical plane
 * spanned by ŷ (up) and n̂ (outward from wall). Vertex at angle θ:
 *     P = ring + r * (cos θ · ŷ + sin θ · n̂)
 *     N = cos θ · ŷ + sin θ · n̂          (smooth radial normal)
 *
 * Index winding: outward-facing (CCW viewed from outside the tube).
 * Verified by cross-product on a +X-edge / +Z-outward facet: the order
 * (P00, P01, P10) yields a triangle whose geometric normal points
 * up-and-outward, matching the smooth vertex normals.
 *
 * One extra vertex at s=CROSS_SEGS closes the cross-section for a degenerate-free UV wrap; the tube itself is open
 * at both ends (a place's stretch, not a ring round the building).
 *
 * The LINE rides the same axis: one quad per ring-to-ring segment, each vertex carrying both
 * segment ends (`aA`, `aB`), which end it sits at (`aT`) and which side (`aSide`); the vertex shader widens it to
 * linePx on screen.
 */
function buildTube(place, tubeRadius) {
  // A place's stretch at the eave (the wall/roof joint) its slab entry names; the building's footprint gives the
  // outward side. (Neon used to ring the whole footprint — one sign per building, whatever it held.)
  const fp = place.footprint
  if (!place.pts || place.pts.length < 2 || !fp || fp.length < 3) return null
  const r = tubeRadius
  // The axis sits one radius above the eave, so the tube's BOTTOM is flush with it.
  const baseY = place.baseY + r
  const path = buildPath(place.pts, detectOutwardSign(fp))
  const m = path.length
  if (m < 2) return null

  // The building's terrain anchor (the slab index's centroidY: mean of footprint-corner raw elevations), the one
  // Foundations and walls lift by — and the drawn ground's own height under it (`groundY`, a raised kerb's block):
  // the sign rides its wall exactly as the wall is lifted (src/lib/buildingLift.js).
  const centroidY = place.groundYRaw ?? 0
  const groundY = place.groundY

  const VPR = CROSS_SEGS + 1
  const positions = []
  const normals = []
  const uvs = []
  const centroidYs = []
  for (let i = 0; i < m; i++) {
    const ring = path[i]
    const u = i / (m - 1)
    for (let s = 0; s <= CROSS_SEGS; s++) {
      const theta = (s / CROSS_SEGS) * Math.PI * 2
      const cs = Math.cos(theta), sn = Math.sin(theta)
      positions.push(
        ring.x + sn * r * ring.nx,
        baseY + cs * r,
        ring.z + sn * r * ring.nz,
      )
      normals.push(sn * ring.nx, cs, sn * ring.nz)
      uvs.push(u, s / CROSS_SEGS)
      centroidYs.push(centroidY, groundY)
    }
  }

  const indices = []
  for (let i = 0; i < m - 1; i++) {
    const a = i * VPR
    const b = (i + 1) * VPR
    for (let s = 0; s < CROSS_SEGS; s++) {
      indices.push(a + s,     a + s + 1, b + s)
      indices.push(a + s + 1, b + s + 1, b + s)
    }
  }

  const line = { a: [], b: [], t: [], side: [], centroidYs: [], indices: [] }
  for (let i = 0; i < m - 1; i++) {
    const p0 = path[i], p1 = path[i + 1]
    const v0 = line.t.length
    for (const [t, side] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
      line.a.push(p0.x, baseY, p0.z); line.b.push(p1.x, baseY, p1.z)
      line.t.push(t); line.side.push(side); line.centroidYs.push(centroidY, groundY)
    }
    line.indices.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2)
  }
  return { positions, normals, uvs, centroidYs, indices, line }
}

// ⛔ `|| '#ff66cc'` used to be the tail here — a debug magenta standing in for any
// category the palette did not know, which reads on screen as a deliberate hot-pink
// accent rather than as an error. `UNKNOWN_HEX` is the one colour that means "we do not
// know", and an unknown category is exactly that, so it is the honest stand-in for both.
// ⭐ The town's neon colours are ITS OWN: `materialColors.neon_<category>` (Stage › Surfaces › Neon, baked into
// scene.json); a category it did not author draws the kit's neutral default — src/lib/categoryColor.js decides.
function categoryColorVec(category, paletteScene) {
  const c = new THREE.Color(categoryNeon(category, paletteScene))
  return [c.r, c.g, c.b]
}

// ── Shader ──────────────────────────────────────────────────────────
//
// "Round tube" look is a SHADER illusion, not pure geometry. The
// Gaussian masks (core / tube / bleed) are sampled by view-fresnel
// `r = 1 − dot(N, V)` so the core is hot where the tube faces the
// camera and fades at the silhouette.
//
// Both drawings use MAX blending, not additive: the tube's front and back faces, the tube and the line across the
// hand-off, and a line's overlapping joins never SUM past the hue — summing is how a coloured sign went white.

// The intensity roll-off along the hue: the brightest channel approaches 1, the rest keep their proportion.
const HUE_ROLL = /* glsl */`
vec3 hueRoll(vec3 c, float L) {
  float m = max(max(c.r, c.g), max(c.b, 1e-4));
  return (c / m) * (1.0 - exp(-max(L, 0.0)));
}
`
const TUBE_PX = /* glsl */`
// The tube's on-screen diameter (device px) at clip depth w, for a tube of world radius R.
float tubePx(float R, float w, float viewportH) {
  // projectionMatrix[1][1] is the y-scale (1/tan(fov/2) perspective, 2/(t-b) ortho); clip.w is -viewZ (perspective)
  // or 1 (ortho) — so this is pixels per metre at that depth, isotropic.
  return 2.0 * R * projectionMatrix[1][1] * 0.5 * viewportH / max(w, 1e-4);
}
`

const VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute vec2 aCentroid;
uniform float uExag;
uniform float uBuiltRadius;   // world radius the merged geometry was swept at (the quantized tubeCm, in metres)
uniform float uHandoffPx;
uniform float uBand;
uniform float uViewportH;     // drawing-buffer height in device px
varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vW;             // the tube's share of the hand-off
${TUBE_PX}
void main() {
  vColor = aColor;
  vec3 lifted = position + vec3(0.0, aCentroid.x * uExag + aCentroid.y, 0.0);   // = buildingLiftGLSL's rigid lift
  vec4 wp = modelMatrix * vec4(lifted, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  vW = smoothstep(uHandoffPx / uBand, uHandoffPx * uBand, tubePx(uBuiltRadius, gl_Position.w, uViewportH));
  #include <logdepthbuf_vertex>
}
`

const FRAG = /* glsl */`
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uCore;
uniform float uTube;
uniform float uBleed;
uniform float uEmissive;
uniform float uForceOn;
varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vW;
${HUE_ROLL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float facing = max(0.0, dot(N, V));
  float r = 1.0 - facing;

  float coreMask  = exp(-r * r * 16.0);
  float tubeMask  = exp(-r * r *  4.0);
  float bleedMask = exp(-r * r *  1.0);

  float L = (coreMask * uCore + tubeMask * uTube + 0.4 * bleedMask * uBleed) * uEmissive;
  vec3 c = hueRoll(vColor, L) * vW * uForceOn;
  if (max(c.r, max(c.g, c.b)) < 0.004) discard;
  gl_FragColor = vec4(c, 1.0);
}
`

// The LINE: each vertex is one corner of a segment's quad, widened to uLinePx on screen about the projected axis.
const LINE_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aA;
attribute vec3 aB;
attribute float aT;
attribute float aSide;
attribute vec3 aColor;
attribute vec2 aCentroid;
uniform float uExag;
uniform float uTubeR;         // the tube's world radius, metres — the hand-off reads the TUBE's on-screen size
uniform float uLinePx;
uniform float uHandoffPx;
uniform float uBand;
uniform vec2 uViewport;       // drawing buffer, device px
varying vec3 vColor;
varying float vSide;
varying float vW;             // the line's share of the hand-off
${TUBE_PX}
void main() {
  vColor = aColor;
  vSide = aSide;
  vec3 lift = vec3(0.0, aCentroid.x * uExag + aCentroid.y, 0.0);   // = buildingLiftGLSL's rigid lift
  mat4 pvm = projectionMatrix * viewMatrix * modelMatrix;
  vec4 ca = pvm * vec4(aA + lift, 1.0);
  vec4 cb = pvm * vec4(aB + lift, 1.0);
  // An end behind the camera is slid along the segment to just in front of it, so the screen direction holds.
  const float EPS = 1e-3;
  if (ca.w < EPS && cb.w < EPS) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vW = 0.0; return; }
  if (ca.w < EPS) ca = mix(ca, cb, (EPS - ca.w) / (cb.w - ca.w));
  if (cb.w < EPS) cb = mix(cb, ca, (EPS - cb.w) / (ca.w - cb.w));
  vec2 sa = ca.xy / ca.w * 0.5 * uViewport;
  vec2 sb = cb.xy / cb.w * 0.5 * uViewport;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = aT < 0.5 ? ca : cb;
  // Half a width either side, and half a width past each end so consecutive segments overlap at the joins
  // (max blending: the overlap does not brighten).
  float h = 0.5 * uLinePx;
  vec2 offPx = nrm * aSide * h + dir * (aT * 2.0 - 1.0) * h;
  c.xy += offPx / (0.5 * uViewport) * c.w;
  gl_Position = c;
  vW = 1.0 - smoothstep(uHandoffPx / uBand, uHandoffPx * uBand, tubePx(uTubeR, c.w, uViewport.y));
  #include <logdepthbuf_vertex>
}
`

const LINE_FRAG = /* glsl */`
precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uCore;
uniform float uTube;
uniform float uEmissive;
uniform float uLineGain;
uniform float uForceOn;
varying vec3 vColor;
varying float vSide;
varying float vW;
${HUE_ROLL}
void main() {
  #include <logdepthbuf_fragment>
  float prof = 1.0 - smoothstep(0.55, 1.0, abs(vSide));   // a solid core with a soft, anti-aliased edge
  float L = max(uCore, uTube) * uEmissive * uLineGain * prof;
  vec3 c = hueRoll(vColor, L) * vW * uForceOn;
  if (max(c.r, max(c.g, c.b)) < 0.004) discard;
  gl_FragColor = vec4(c, 1.0);
}
`

// ── Component ───────────────────────────────────────────────────────

export default function NeonBands({ places, forceOn = true, lookId, materialColors: materialColorsOverride }) {
  const scene = useSceneJson(lookId || '')
  // Stage's live colours, else the baked ones. Keyed on the neon entries only, so an unrelated material edit
  // doesn't rebuild the tubes (the colour lives in the geometry).
  const materialColors = materialColorsOverride ?? scene?.materialColors
  // Stage's live values are the next bake's: unauthored categories draw the neutral default there too.
  const paletteScene = materialColorsOverride ? { materialColors: materialColorsOverride, neonAuthored: [] } : scene
  const neonColorKey = JSON.stringify([Array.isArray(paletteScene?.neonAuthored), Object.entries(materialColors || {}).filter(([k]) => k.startsWith('neon_')).sort()])

  const logDepth = useThree((s) => s.gl.capabilities.logarithmicDepthBuffer)
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  // Production runs frameloop="demand": the uniforms are imperative writes (NeonDriver) that trigger no render, so request one when the neon mounts or its Look lands — else it stays dark
  // until a camera nudge (2026-06-28, the "neon not showing at all" bug).
  useEffect(() => { invalidate() }, [lookId, scene, invalidate])

  // The tube's radius drives vertex positions, so it is polled each frame and quantized to TUBE_CM_STEP: a keyed day
  // rebuilds only on a step crossing, a slider drag immediately.
  const [cm, setCm] = useState(() => _neonUniforms.tubeCmUniform.value)
  const r = cm / 100
  const viewport = useRef({ value: new THREE.Vector2(1, 1) }).current
  useFrame(() => {
    const q = Math.round(_neonUniforms.tubeCmUniform.value / TUBE_CM_STEP) * TUBE_CM_STEP
    if (Math.abs(q - cm) > 1e-6) setCm(q)
    // The hand-off and the line's width are in device px of the live drawing buffer (DPR-correct).
    viewport.value.set(gl.domElement.width, gl.domElement.height)
  })

  const { tubeGeometry, lineGeometry, pick } = useMemo(() => {
    const positions = [], normals = [], uvs = [], colors = [], centroidYs = [], indices = []
    const la = [], lb = [], lt = [], lside = [], lcolors = [], lcentroidYs = [], lindices = []
    const pick = { segs: [], ids: [] }   // per line segment: [ax, ay, az, bx, by, bz, centroidY, groundY] and its building id
    let baseVert = 0, lineBase = 0
    for (const p of places) {
      // ⛔⛔ THIS USED TO BE `if (!p.neon?.category) continue`, WHICH CONFLATED TWO
      // DIFFERENT THINGS — and only became reachable the day the zoning classifier
      // stopped lying. "This building has no neon record" (skip it) and "this building
      // has a neon record whose category we cannot determine" (paint it UNKNOWN) are not
      // the same state. Collapsing them makes an unclassified town render as an EMPTY
      // night rather than a slate one, which is a plausible-looking success — the
      // operator sees a quiet neighbourhood, not a missing classification.
      if (!p.neon) continue
      // `category: null` falls through on purpose; categoryColorVec paints UNKNOWN_HEX.

      const tube = buildTube(p, r)
      if (!tube) continue
      const rgb = categoryColorVec(p.neon.category, paletteScene)
      const count = tube.positions.length / 3
      for (let i = 0; i < tube.positions.length;  i++) positions.push(tube.positions[i])
      for (let i = 0; i < tube.normals.length;    i++) normals.push(tube.normals[i])
      for (let i = 0; i < tube.uvs.length;        i++) uvs.push(tube.uvs[i])
      for (let i = 0; i < tube.centroidYs.length; i++) centroidYs.push(tube.centroidYs[i])
      for (let i = 0; i < count; i++) colors.push(rgb[0], rgb[1], rgb[2])
      for (let i = 0; i < tube.indices.length; i++) indices.push(baseVert + tube.indices[i])
      baseVert += count

      const L = tube.line, lcount = L.t.length
      for (let i = 0; i < L.a.length; i++) { la.push(L.a[i]); lb.push(L.b[i]) }
      for (let i = 0; i < lcount; i++) { lt.push(L.t[i]); lside.push(L.side[i]); lcentroidYs.push(L.centroidYs[2 * i], L.centroidYs[2 * i + 1]); lcolors.push(rgb[0], rgb[1], rgb[2]) }
      for (let i = 0; i < L.indices.length; i++) lindices.push(lineBase + L.indices[i])
      lineBase += lcount
      for (let v = 0; v < lcount; v += 4) {   // four vertices per segment, each carrying both ends
        pick.segs.push(L.a[v * 3], L.a[v * 3 + 1], L.a[v * 3 + 2], L.b[v * 3], L.b[v * 3 + 1], L.b[v * 3 + 2], L.centroidYs[2 * v], L.centroidYs[2 * v + 1])
        pick.ids.push(p.buildingId ?? null)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position',    new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('normal',      new THREE.Float32BufferAttribute(normals, 3))
    g.setAttribute('uv',          new THREE.Float32BufferAttribute(uvs, 2))
    g.setAttribute('aColor',      new THREE.Float32BufferAttribute(colors, 3))
    g.setAttribute('aCentroid', new THREE.Float32BufferAttribute(centroidYs, 2))
    g.setIndex(indices)
    const lg = new THREE.BufferGeometry()
    // `position` is required by three for a draw; the line places itself from aA/aB.
    lg.setAttribute('position',   new THREE.Float32BufferAttribute(la, 3))
    lg.setAttribute('aA',         new THREE.Float32BufferAttribute(la, 3))
    lg.setAttribute('aB',         new THREE.Float32BufferAttribute(lb, 3))
    lg.setAttribute('aT',         new THREE.Float32BufferAttribute(lt, 1))
    lg.setAttribute('aSide',      new THREE.Float32BufferAttribute(lside, 1))
    lg.setAttribute('aColor',     new THREE.Float32BufferAttribute(lcolors, 3))
    lg.setAttribute('aCentroid', new THREE.Float32BufferAttribute(lcentroidYs, 2))
    lg.setIndex(lindices)
    // Bounding spheres intentionally not computed: the vertex shaders lift every vertex by the terrain, so a CPU-fit
    // sphere lies below what is drawn and gets frustum-culled at close range. `frustumCulled={false}` on the meshes.
    return { tubeGeometry: g, lineGeometry: lg, pick }
  }, [places, r, neonColorKey])   // materialColors enters through its neon key (the colour lives in the geometry)

  // Match the renderer's ACTUAL depth encoding — define USE_LOGDEPTHBUF only when the renderer runs a log depth buffer
  // (Stage / Preview); three then compiles the <logdepthbuf_*> chunks AND uploads logDepthBufFC. In a LINEAR renderer
  // (production Scene.jsx) the chunks compile to no-ops and neon writes the same depth as every other material. Forcing
  // the define unconditionally was the hero depth bug (logDepthBufFC=0 → near-plane collapse). FEATURES.md §"Layering /
  // coplanar stacking / depth precision", [[feedback_raw_shadermaterial_needs_logdepth_chunks]],
  // HANDOFF-neon-roof-depth.md Phase 2.
  const forceOnU = useRef({ value: 1 }).current
  forceOnU.value = forceOn ? 1.0 : 0.0
  const mats = useRef(null)
  if (!mats.current) {
    const shared = {
      defines: logDepth ? { USE_LOGDEPTHBUF: '' } : {},
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      // MAX, not additive: overlaps never sum past the hue (the shader block above).
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
    }
    const tube = new THREE.ShaderMaterial({
      ...shared,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCore:        _neonUniforms.coreUniform,
        uTube:        _neonUniforms.tubeUniform,
        uBleed:       _neonUniforms.bleedUniform,
        uEmissive:    _neonUniforms.emissiveUniform,
        uHandoffPx:   _neonUniforms.handoffPxUniform,
        uBand:        { value: HANDOFF_BAND },
        uForceOn:     forceOnU,
        uExag:        TERRAIN_UNIFORMS.uExag,
        uBuiltRadius: { value: r },
        uViewportH:   { get value() { return viewport.value.y } },
      },
      // DoubleSide + no normal flip in the fragment: back faces compute dot(N, V) < 0, which clamps to 0 — a dim
      // bleed-only glow on the camera-far side, the omnidirectional look ([[feedback_neon_cylinder_doubleside_no_flip]]).
      side: THREE.DoubleSide,
    })
    const line = new THREE.ShaderMaterial({
      ...shared,
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: {
        uCore:      _neonUniforms.coreUniform,
        uTube:      _neonUniforms.tubeUniform,
        uEmissive:  _neonUniforms.emissiveUniform,
        uLineGain:  _neonUniforms.lineGainUniform,
        uLinePx:    _neonUniforms.linePxUniform,
        uHandoffPx: _neonUniforms.handoffPxUniform,
        uBand:      { value: HANDOFF_BAND },
        uForceOn:   forceOnU,
        uExag:      TERRAIN_UNIFORMS.uExag,
        uTubeR:     { value: r },
        uViewport:  viewport,
      },
      side: THREE.DoubleSide,
    })
    // Unique keys — distinct shader families, never the terrain-patched program cache
    // ([[feedback_unique_program_cache_key_before_wrappers]]); the log and linear builds differ by a define.
    const depthKey = logDepth ? 'logdepth' : 'lineardepth'
    tube.customProgramCacheKey = () => `neon-bands-tube-${depthKey}`
    line.customProgramCacheKey = () => `neon-bands-line-${depthKey}`
    mats.current = { tube, line }
  }
  // The tube's world radius as the geometry was swept (the quantized `cm`) — the hand-off reads the tube's own size.
  mats.current.tube.uniforms.uBuiltRadius.value = r
  mats.current.line.uniforms.uTubeR.value = r

  useEffect(() => () => { tubeGeometry.dispose(); lineGeometry.dispose() }, [tubeGeometry, lineGeometry])

  // ── THE SIGN PICKS ITS BUILDING (BRIEF-neon-reads-at-every-distance §3.4). A click or hover on a sign resolves to the
  // building it is on, exactly as a wall or roof does (SlabBuildings.jsx#idAtFace) — through <Town select> and the
  // shared hover. The line is drawn in screen space, so it is picked in screen space too: a ray passing within the
  // sign's on-screen half-width (+ PICK_SLOP_PX) of a stretch hits it, at that stretch's depth, so a nearer wall or
  // tree still wins.
  const townSelect = useTownContext().select
  const setHovered = useTownHover((s) => s.setHovered)
  const clearHovered = useTownHover((s) => s.clearHovered)
  const lineRef = useRef(null)
  const down = useRef([0, 0])
  useEffect(() => {
    const mesh = lineRef.current
    if (!mesh) return
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), onRay = new THREE.Vector3(), onSeg = new THREE.Vector3()
    mesh.raycast = (raycaster, hits) => {
      const cam = raycaster.camera
      if (!cam?.isPerspectiveCamera || !pick.ids.length) return
      const exag = TERRAIN_UNIFORMS.uExag.value
      const halfLinePx = _neonUniforms.linePxUniform.value / 2
      // metres per drawing-buffer pixel at unit depth (linePx and the slop are drawing-buffer px)
      const mPerPxAt1 = 2 * Math.tan((cam.fov * Math.PI / 180) / 2) / Math.max(1, viewport.value.y)
      for (let i = 0; i < pick.ids.length; i++) {
        const k = i * 8, lift = buildingLiftY(0, pick.segs[k + 6], exag, 0, false, pick.segs[k + 7])
        v0.set(pick.segs[k], pick.segs[k + 1] + lift, pick.segs[k + 2])
        v1.set(pick.segs[k + 3], pick.segs[k + 4] + lift, pick.segs[k + 5])
        const d2 = raycaster.ray.distanceSqToSegment(v0, v1, onRay, onSeg)
        const t = onRay.distanceTo(raycaster.ray.origin)
        // the drawn sign's half-width at that depth — the line's, or the real tube's once it is the larger — plus the slop
        const reach = Math.max(halfLinePx * mPerPxAt1 * t, r) + PICK_SLOP_PX * mPerPxAt1 * t
        if (d2 <= reach * reach && t >= raycaster.near && t <= raycaster.far) {
          hits.push({ distance: t, point: onSeg.clone(), object: mesh, buildingId: pick.ids[i] })
        }
      }
    }
  }, [pick, r, viewport])
  const pickHandlers = townSelect ? {
    onPointerDown: (e) => { down.current = [e.clientX, e.clientY] },
    onPointerMove: (e) => { if (!e.buildingId) return; e.stopPropagation(); setHovered(e.buildingId); document.body.style.cursor = 'pointer' },
    onPointerOut: () => { clearHovered(); document.body.style.cursor = 'auto' },
    onClick: (e) => {
      if (!e.buildingId) return
      e.stopPropagation()
      const dx = e.clientX - down.current[0], dy = e.clientY - down.current[1]
      if (dx * dx + dy * dy > 36) return   // a drag, not a click (SlabBuildings.jsx#isDrag)
      townSelect(e.buildingId)
    },
  } : {}
  useEffect(() => () => { mats.current?.tube.dispose(); mats.current?.line.dispose() }, [])

  // renderOrder above every baked-ground transparent group (bake max is ~42, plus StreetLights pool at 50). Neon is
  // depthWrite:false, so drawing it LAST puts the ground's depth in the buffer first and the neon depth-tests against
  // it — else a later transparent ground fragment passes against the sky's 1.0 and overdraws the sign.
  return (
    <>
      <mesh geometry={tubeGeometry} material={mats.current.tube} renderOrder={100} frustumCulled={false} />
      <mesh ref={lineRef} geometry={lineGeometry} material={mats.current.line} renderOrder={101} frustumCulled={false} {...pickHandlers} />
    </>
  )
}

// ── NeonDriver — the neon channel, resolved EVERY FRAME, in production and Preview ────────────────────────────
// Neon rides the day like every other channel (Jacob, 2026-09-27: "it needs to be animatable like everything
// else"). ⛔ Replaces NeonBands' mount-time resolve, which froze a keyed neon at whatever minute the page loaded.
// Sibling of PostProcessing.jsx#LampGlowDriver. The ONE driver, in every app: Stage hands it its live channel.
const NEON_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('neon'))
// `neonOverride`: Stage's live channel (an operator drag shows without a bake); absent, the slab's.
export function NeonDriver({ lookId, bakeLastMs, neonOverride } = {}) {
  const scene = useSceneJson(lookOf(lookId, 'NeonDriver'), bakeLastMs)
  const channel = neonOverride ?? scene?.neon ?? NEON_DEFAULT_CHANNEL
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const v = resolveGroupAtMinute(channel, tod.getMinuteOfDay(),
      channel.animated ? getTodSlotMinutes(tod.currentTime) : null, NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS)
    _neonUniforms.coreUniform.value        = v.core
    _neonUniforms.tubeUniform.value        = v.tube
    _neonUniforms.bleedUniform.value       = v.bleed
    _neonUniforms.emissiveUniform.value    = v.emissive
    _neonUniforms.tubeCmUniform.value      = v.tubeCm
    _neonUniforms.linePxUniform.value      = v.linePx
    _neonUniforms.handoffPxUniform.value   = v.handoffPx
    _neonUniforms.lineGainUniform.value    = v.lineGain
  })
  return null
}
