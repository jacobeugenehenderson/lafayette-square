/**
 * atmosphere-materials.js — ShaderMaterial factory for <Atmosphere />.
 *
 * Phase 4b.1: returns a ShaderMaterial with the 5 photoreal levers
 * (three-tier lighting, silver lining, self-shadow, domain warp,
 * vertical density gradient) hardcoded to the cumulus_humilis preset
 * values pulled from public/clouds/presets.json. Phase 4b.2 replaces
 * the literal uniform values with per-frame TodChannel resolution.
 *
 * Raw ShaderMaterial — must include the four <logdepthbuf_*> chunks
 * (Canvas runs logarithmicDepthBuffer:true). Without them the cloud
 * disappears at certain camera angles
 * (feedback_raw_shadermaterial_needs_logdepth_chunks).
 *
 * customProgramCacheKey set so three's program cache doesn't collapse
 * this onto a sibling raw-shader material
 * (feedback_unique_program_cache_key_before_wrappers).
 */
import * as THREE from 'three'

// Slab geometry — must mirror the BoxGeometry mounted in <Atmosphere />.
// Centered at (0, 1450, 0), size (8000, 500, 8000) → y∈[1200, 1700],
// x,z∈[-4000, 4000]. Exposed as uniforms so the fragment shader can do
// an analytic ray–slab intersection rather than relying on box face
// barycentrics.
export const SLAB_BASE_ALT = 1200
export const SLAB_THICKNESS = 500
export const SLAB_HALF_XZ = 4000

const ATMOSPHERE_VERT = /* glsl */`
varying vec3 vWorldPos;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vec4 mvPos = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPos;
  #include <logdepthbuf_vertex>
}
`

const ATMOSPHERE_FRAG = /* glsl */`
precision highp float;

#include <common>
#include <logdepthbuf_pars_fragment>

uniform float uTime;
uniform vec3  uCameraPos;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;

uniform vec3  uSlabMin;
uniform vec3  uSlabMax;
uniform float uBaseAlt;
uniform float uThickness;

uniform float uCoverage;
uniform float uDensity;
uniform float uWarpFreq;
uniform float uWarpAmp;
uniform float uNoiseSeed;
uniform int   uOctaves;

uniform float uSunScatter;
uniform float uAmbientFloor;
uniform float uEdgeSilver;
uniform float uShadowStrength;
uniform float uDrift;

uniform int   uSteps;
uniform int   uShadowSteps;
uniform int   uDebugMode;  // 0 = normal, 1 = raw density (red), 2 = raw FBM (greyscale), 3 = solid red (mesh visible test)

varying vec3 vWorldPos;

// ── 3D value noise ────────────────────────────────────────────────────
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p += dot(p, p.yzx + 19.19 + uNoiseSeed);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

// FBM with a single-pass domain warp. Input p is already in
// noise-space (= world * uWarpFreq), so the warp offset is also
// expressed at that scale. Output normalized to ~[0, 1] regardless of
// octave count so `coverage` reads as "fraction of FBM range above
// threshold" rather than depending on octave sum.
float fbm(vec3 p) {
  vec3 warp = vec3(
    noise3(p + vec3(0.0, 0.0, 0.0)),
    noise3(p + vec3(5.2, 1.3, 2.9)),
    noise3(p + vec3(0.0, 2.7, 8.1))
  );
  p += (warp - 0.5) * uWarpAmp * uWarpFreq;

  float sum = 0.0;
  float ampSum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; ++i) {
    if (i >= uOctaves) break;
    sum += amp * noise3(p * freq);
    ampSum += amp;
    freq *= 2.0;
    amp *= 0.5;
  }
  return sum / max(ampSum, 1e-6);  // normalize to [0, 1]
}

// Flat-base cumulus profile: hard floor near base, gentle taper at top.
float verticalProfile(float y) {
  float h = clamp((y - uBaseAlt) / uThickness, 0.0, 1.0);
  float base = smoothstep(0.0, 0.10, h);
  float top  = 1.0 - smoothstep(0.60, 1.0, h);
  return base * top;
}

float sampleDensity(vec3 worldP) {
  // uDrift drives a slow advection of the noise field along +X/+Z.
  vec3 wind = vec3(uTime * uDrift * 2.0, 0.0, uTime * uDrift * 1.0);
  vec3 q = (worldP + wind) * uWarpFreq;
  float n = fbm(q);

  // Contrast curve. Raw FBM is smooth-gradient; cumulus puffs are
  // *isolated* with clear-sky gaps. Applying smoothstep here biases
  // the field toward extremes (mostly 0, hot spots toward 1) so
  // coverage produces visually puffy clouds rather than a smooth
  // grey ceiling. Lower edge ≈ what coverage threshold cuts; upper
  // edge controls how quickly hot spots saturate.
  n = smoothstep(1.0 - uCoverage, 1.0 - uCoverage * 0.2, n);

  float d = n;
  d *= verticalProfile(worldP.y);
  return d * uDensity;
}

vec3 cloudNormal(vec3 p) {
  float eps = 30.0;
  vec3 g;
  g.x = sampleDensity(p + vec3(eps, 0.0, 0.0)) - sampleDensity(p - vec3(eps, 0.0, 0.0));
  g.y = sampleDensity(p + vec3(0.0, eps, 0.0)) - sampleDensity(p - vec3(0.0, eps, 0.0));
  g.z = sampleDensity(p + vec3(0.0, 0.0, eps)) - sampleDensity(p - vec3(0.0, 0.0, eps));
  float len = length(g);
  if (len < 1e-6) return vec3(0.0, 1.0, 0.0);
  return -g / len;
}

float marchShadow(vec3 p) {
  float shadowDensity = 0.0;
  float stepSize = uThickness / float(uShadowSteps) * 0.5;
  for (int i = 1; i <= 16; ++i) {
    if (i > uShadowSteps) break;
    vec3 sp = p + uSunDir * stepSize * float(i);
    shadowDensity += sampleDensity(sp);
  }
  return exp(-shadowDensity * uShadowStrength);
}

bool intersectSlab(vec3 ro, vec3 rd, out float tEnter, out float tExit) {
  vec3 invRd = 1.0 / rd;
  vec3 t1 = (uSlabMin - ro) * invRd;
  vec3 t2 = (uSlabMax - ro) * invRd;
  vec3 tMin = min(t1, t2);
  vec3 tMax = max(t1, t2);
  tEnter = max(max(tMin.x, tMin.y), tMin.z);
  tExit  = min(min(tMax.x, tMax.y), tMax.z);
  return tExit >= max(tEnter, 0.0);
}

void main() {
  vec3 ro = uCameraPos;
  vec3 rd = normalize(vWorldPos - uCameraPos);

  // Debug mode 3: mesh-visibility test — solid red wherever the slab
  // back face renders. Use this to verify mount + frustum + depth
  // before debugging the raymarch.
  if (uDebugMode == 3) {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 0.5);
    #include <logdepthbuf_fragment>
    return;
  }

  float tEnter, tExit;
  if (!intersectSlab(ro, rd, tEnter, tExit)) discard;
  tEnter = max(tEnter, 0.0);

  float steps = float(uSteps);
  float stepSize = (tExit - tEnter) / steps;
  if (stepSize <= 0.0) discard;

  vec3 stepVec = rd * stepSize;
  vec3 p = ro + rd * tEnter;

  // Mie-class forward scatter is view-direction dependent, not per-sample.
  float vdotS = dot(rd, uSunDir);
  float forwardScatter = smoothstep(0.7, 1.0, vdotS);

  // Debug modes 1 & 2 short-circuit the lighting integration to
  // visualize the density field directly.
  if (uDebugMode == 1 || uDebugMode == 2) {
    float maxVal = 0.0;
    for (int i = 0; i < 64; ++i) {
      if (i >= uSteps) break;
      float v = uDebugMode == 2
        ? fbm((p + vec3(uTime * uDrift * 2.0, 0.0, uTime * uDrift)) * uWarpFreq)
        : sampleDensity(p);
      maxVal = max(maxVal, v);
      p += stepVec;
    }
    if (uDebugMode == 1) gl_FragColor = vec4(maxVal * 5.0, 0.0, 0.0, 0.8);
    else                 gl_FragColor = vec4(vec3(maxVal), 0.8);
    #include <logdepthbuf_fragment>
    return;
  }

  vec4 accum = vec4(0.0);
  for (int i = 0; i < 64; ++i) {
    if (i >= uSteps) break;
    float density = sampleDensity(p);
    if (density > 0.001) {
      vec3 n = cloudNormal(p);
      float sunFactor = dot(n, uSunDir) * 0.5 + 0.5;

      vec3 sunSide = uSunColor * 1.30;
      vec3 body    = mix(uSkyColor, uSunColor, 0.60);
      vec3 shadow  = uSkyColor * uAmbientFloor;

      vec3 lit = mix(shadow, body, smoothstep(0.0, 0.5, sunFactor));
      lit      = mix(lit, sunSide, smoothstep(0.5, 1.0, sunFactor));

      lit *= marchShadow(p);

      float edgeFactor = 1.0 - smoothstep(0.0, 0.3, density);
      float silver = forwardScatter * edgeFactor * uEdgeSilver * uSunScatter;
      lit += silver * uSunColor;

      // Alpha-accumulation multiplier. Tuning history:
      //   0.005  (Phase 4b.1 baby placeholder) → too faint, all rays
      //          fell under the accum.a < 0.005 discard floor.
      //   0.04   → too strong combined with the FBM normalization;
      //          every ray accumulated to grey opacity.
      //   0.012  (current) → puffy clouds visible; clear sky between.
      //          With smoothstep contrast curve in sampleDensity
      //          biasing FBM toward 0/1 extremes, integrated alpha
      //          at hot spots reaches ~0.7, clear sky stays ~0.
      float alpha = (1.0 - accum.a) * density * stepSize * 0.012;
      accum.rgb += alpha * lit;
      accum.a   += alpha;
      if (accum.a >= 0.99) break;
    }
    p += stepVec;
  }

  if (accum.a < 0.005) discard;

  gl_FragColor = vec4(accum.rgb, accum.a);
  #include <logdepthbuf_fragment>
}
`

export function createAtmosphereMaterial() {
  const baseAlt = SLAB_BASE_ALT
  const thickness = SLAB_THICKNESS
  const half = SLAB_HALF_XZ

  const material = new THREE.ShaderMaterial({
    uniforms: {
      // Cloud shape — cumulus_humilis hardcoded
      uCoverage:       { value: 0.32 },
      uDensity:        { value: 0.85 },
      uBaseAlt:        { value: baseAlt },
      uThickness:      { value: thickness },
      uWarpFreq:       { value: 0.001 },
      uWarpAmp:        { value: 280 },
      uNoiseSeed:      { value: 91 },
      uOctaves:        { value: 4 },
      // Lighting — cumulus_humilis hardcoded
      uSunScatter:     { value: 1.30 },
      uAmbientFloor:   { value: 0.32 },
      uEdgeSilver:     { value: 1.05 },
      uShadowStrength: { value: 0.65 },
      uDrift:          { value: 1.0 },
      // Per-frame
      uTime:           { value: 0 },
      uSunDir:         { value: new THREE.Vector3(0, 0.7, 0.7).normalize() },
      uSunColor:       { value: new THREE.Color('#ffe6c8') },
      uSkyColor:       { value: new THREE.Color('#9faab8') },
      uCameraPos:      { value: new THREE.Vector3() },
      // Slab AABB (constant for Phase 4b.1)
      uSlabMin:        { value: new THREE.Vector3(-half, baseAlt, -half) },
      uSlabMax:        { value: new THREE.Vector3( half, baseAlt + thickness,  half) },
      // Quality (desktop_high)
      uSteps:          { value: 24 },
      uShadowSteps:    { value: 6 },
      // Debug: 0=normal, 1=raw density (red), 2=raw FBM (greyscale),
      //        3=solid red mesh test. Flip via material.uniforms.uDebugMode.value
      //        in DevTools to diagnose without re-shipping.
      uDebugMode:      { value: 0 },
    },
    vertexShader: ATMOSPHERE_VERT,
    fragmentShader: ATMOSPHERE_FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  })

  material.customProgramCacheKey = () => 'atmosphere-v3'

  // Expose for in-DevTools debugging. Flip uDebugMode without rebuilding:
  //   window.atmosphereMaterial.uniforms.uDebugMode.value = 3   // solid red mesh test
  //   window.atmosphereMaterial.uniforms.uDebugMode.value = 1   // raw density
  //   window.atmosphereMaterial.uniforms.uDebugMode.value = 2   // raw FBM
  //   window.atmosphereMaterial.uniforms.uDebugMode.value = 0   // normal
  // Last-mount-wins if multiple Atmosphere components ever exist; today
  // only one mounts (CanaryScene).
  if (typeof window !== 'undefined') window.atmosphereMaterial = material

  return material
}
