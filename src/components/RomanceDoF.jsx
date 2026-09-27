/**
 * RomanceDoF — depth of field focused on WHAT THE CAMERA IS LOOKING AT, sized RELATIVE to it.
 *
 * ⭐ The model (Jacob, 2026-09-27: "get rid of the actual meters and make it relative" · noon's tilt-shift): the
 * sharp plane sits at the focus point (picked, or the camera's aim), and blur grows with the RELATIVE distance from it
 * — IN FRONT AND BEHIND — up to `blur`. So the same numbers frame a 1-km town and a 10-km one alike, and a narrow
 * sharp zone gives the miniature ("dollhouse") look.
 * ⛔ Replaces the 2026-06-26 model (sharp from the camera out to a focus in METRES, then a far melt): a constant
 *   that fitted one town's camera, which smeared Provincetown's whole hero frame (CLAUDE.md Layer 0, Class D).
 *
 * ── Variable RADIUS off the shared ladder ───────────────────────────────────
 * The blur AMOUNT selects which rung of the shared DownsamplePyramid ladder to read (level 0 tight … 7 wide); a
 * virtual rung "0" is the sharp input. Two taps/pixel (the straddling rungs).
 * ⚠️ Must run AFTER the DownsamplePyramid pass in the composer (it samples its ladder via _pyramidRefs.levels).
 *
 * Parameterization (the "Focus" channel): blur (0..1, the most) · heroBlur (0..1, the
 * softness AT the focal plane) · softness (how deep the sharp zone is, and how gently it melts).
 */

import { useMemo, forwardRef } from 'react'
import { Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

import { _pyramidRefs, PYRAMID_LEVELS } from './DownsamplePyramid.jsx'

// Distances are in METERS (view-space), NOT the [0,1] normalized depth — the
// scene's focal planes (park edge ~tens of m, Arch ~1250 m) are a tiny fraction
// of the near:1/far:60000 frustum, so a normalized [0,1] depth has no precision
// there. We work in real metres throughout.
// The depth decode + the blur law, shared by this effect and the hero ladder (HeroLadder.jsx) so both judge focus the
// same way. Needs uniforms uLogDepth, cameraNear, cameraFar, uFocusDist, uTanHalf, uUpView, uMaxBlur, uHeroBlur, uZone,
// uRamp in scope.
export const DOF_BLUR_GLSL = /* glsl */`
  // Decode the framework 'depth' to a camera-space distance in metres.
  // Under logarithmicDepthBuffer three.js writes gl_FragDepth = log2(1+w) / log2(far+1),
  // where w = gl_Position.w ≈ camera distance. Invert it; else use the standard helper.
  float depthToDistance(float d) {
    if (uLogDepth > 0.5) {
      return exp2(d * log2(cameraFar + 1.0)) - 1.0;
    }
    #ifdef PERSPECTIVE_CAMERA
      return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    #else
      return mix(cameraNear, cameraFar, d);
    #endif
  }

  // Blur by RELATIVE distance from the focus, in front and behind, measured ALONG THE GROUND: a tilt-shift's tilted
  // plane of focus. Height drops out, so a vertical subject (the monument) is one sharpness top to bottom — measured
  // along the line of sight, a narrow window cut across the shaft in a visible line (Jacob, 2026-09-27).
  float blurAmount(float dist, vec2 uv) {
    vec3 p = vec3((uv * 2.0 - 1.0) * uTanHalf * dist, -dist);   // view space; dist is view depth
    float ground = length(p - dot(p, uUpView) * uUpView);
    float rel = abs(ground - uFocusDist) / max(uFocusDist, 1.0);
    // Softness at focus never exceeds Blur: at Blur 0 the effect is OFF, and the plane is never softer than the
    // field around it (it was — the picked subject blurred while the rest stayed sharp, 2026-09-27).
    return mix(min(uHeroBlur, uMaxBlur), uMaxBlur, smoothstep(uZone, uZone + uRamp, rel));
  }
`

const fragment = /* glsl */`
  #ifdef FRAMEBUFFER_PRECISION_HIGH
    uniform mediump sampler2D uLevel0;
    uniform mediump sampler2D uLevel1;
    uniform mediump sampler2D uLevel2;
    uniform mediump sampler2D uLevel3;
    uniform mediump sampler2D uLevel4;
    uniform mediump sampler2D uLevel5;
    uniform mediump sampler2D uLevel6;
    uniform mediump sampler2D uLevel7;
  #else
    uniform lowp sampler2D uLevel0;
    uniform lowp sampler2D uLevel1;
    uniform lowp sampler2D uLevel2;
    uniform lowp sampler2D uLevel3;
    uniform lowp sampler2D uLevel4;
    uniform lowp sampler2D uLevel5;
    uniform lowp sampler2D uLevel6;
    uniform lowp sampler2D uLevel7;
  #endif
  uniform float uFocusDist;   // m — the focus point's distance from the camera ALONG THE GROUND, set per frame
  uniform vec2  uTanHalf;     // tan(half fov) in x and y — rebuilds a pixel's view-space position from its depth
  uniform vec3  uUpView;      // world up, in view space
  uniform float uMaxBlur;     // 0..1 — the most blur, far from the plane
  uniform float uHeroBlur;    // 0..1 — softness AT the plane
  uniform float uZone;        // the sharp zone's half-depth, as a fraction of the focal distance
  uniform float uRamp;        // how far past it (same unit) the blur reaches full
  uniform float uLogDepth;    // 1.0 when logarithmicDepthBuffer is active
  uniform float uDebug;       // >0.5 → paint the blur amount instead of the image

  // Constant-index ladder access (dynamic sampler indexing is undefined in GLSL).
  vec3 sampleLevel(int idx, vec2 uv) {
    if (idx <= 0) return texture2D(uLevel0, uv).rgb;
    if (idx == 1) return texture2D(uLevel1, uv).rgb;
    if (idx == 2) return texture2D(uLevel2, uv).rgb;
    if (idx == 3) return texture2D(uLevel3, uv).rgb;
    if (idx == 4) return texture2D(uLevel4, uv).rgb;
    if (idx == 5) return texture2D(uLevel5, uv).rgb;
    if (idx == 6) return texture2D(uLevel6, uv).rgb;
    return texture2D(uLevel7, uv).rgb;
  }

  // The hero ladder's first HERO_LEVELS rungs (HeroLadder.jsx). Four: the day's Amounts reach no deeper, and a shader
  // reads at most ~16 textures (8 shared rungs + these + the image + depth).
  uniform sampler2D uHero0; uniform sampler2D uHero1; uniform sampler2D uHero2; uniform sampler2D uHero3;
  uniform float uHeroOn;       // 1 when the hero ladder was built this frame (HeroLadder.jsx)
  vec4 heroLevel(int idx, vec2 uv) {
    if (idx <= 0) return texture2D(uHero0, uv);
    if (idx == 1) return texture2D(uHero1, uv);
    if (idx == 2) return texture2D(uHero2, uv);
    if (idx == 3) return texture2D(uHero3, uv);
    return vec4(0.0);   // past the hero ladder: the hero's share is spread too thin to see
  }
  // A rung WITHOUT the hero: the shared blur minus the hero's share, over the coverage left — the background alone,
  // so the sharp hero never smears into the blur beside it.
  vec3 backgroundLevel(int idx, vec2 uv) {
    vec3 s = sampleLevel(idx, uv);
    if (uHeroOn < 0.5) return s;
    vec4 h = heroLevel(idx, uv);
    if (h.a < 0.001 || h.a > 0.98) return s;
    return max((s - h.rgb) / (1.0 - h.a), vec3(0.0));
  }
  ${DOF_BLUR_GLSL}

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float dist = depthToDistance(depth);
    float amt  = clamp(blurAmount(dist, uv), 0.0, 1.0);

    // ⛔ The sky is NOT held sharp. Held at infinity focus while the far ground below it melted, it drew a hard
    // straight line across the frame at the horizon, through anything standing against it (Jacob, 2026-09-27:
    // "still blurry, straight line across"). It takes the far field's blur like any distant surface; the night keys
    // have no blur, so stars stay points.

    if (uDebug > 0.5) {
      // Verification paint: green = sharp (0), red = full blur. Near field green,
      // mid/far red, the Arch a softer green pocket.
      outputColor = vec4(amt, 1.0 - amt, 0.0, 1.0);
      return;
    }

    // ── Pick the blur RADIUS from the ladder by the blur amount (2 taps) ──────
    // Virtual rung 0 = the SHARP input (radius 0); rung k = ladder level k-1
    // (widening). lod = where on that extended ladder this pixel sits; sample the
    // two straddling rungs and lerp → a smooth, continuously-widening blur for 2
    // fetches/pixel. uMaxBlur / uHeroBlur are already folded into amt.
    float lod = amt * float(${PYRAMID_LEVELS});
    float loF = floor(lod);
    int   lo  = int(loF);
    float f   = lod - loF;
    vec3 a = (lo <= 0) ? inputColor.rgb : backgroundLevel(lo - 1, uv);  // nearer rung
    vec3 b = backgroundLevel(lo, uv);                                    // farther rung (level lo)
    outputColor = vec4(mix(a, b, f), inputColor.a);
  }
`

// Module-level refs the per-frame driver (dofDriver.js) writes — same pattern as the other PostProcessing effects.
export const HERO_LEVELS = 4
export const _heroLadderRefs = { levels: { current: [] }, on: { current: false } }
export const _dofRefs = {
  near:       { current: 1 },
  far:        { current: 60000 },
  heroRect:   { current: null },   // the hero's box on screen (uv x0,y0,x1,y1), or null
  focusDist:  { current: 1000 },
  tanHalf:    { current: new THREE.Vector2(0.2, 0.2) },
  upView:     { current: new THREE.Vector3(0, 1, 0) },
  maxBlur:    { current: 0 },
  heroBlur:   { current: 0 },
  zone:       { current: 0.2 },
  ramp:       { current: 0.5 },
  debug:      { current: 0 },
}

class RomanceDoFEffect extends Effect {
  constructor() {
    super('RomanceDoF', fragment, {
      // CONVOLUTION → its own pass (keeps it isolated/measurable); DEPTH → the
      // framework binds the depth buffer + passes `depth`.
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map([
        ['uLevel0',     new THREE.Uniform(null)],
        ['uLevel1',     new THREE.Uniform(null)],
        ['uLevel2',     new THREE.Uniform(null)],
        ['uLevel3',     new THREE.Uniform(null)],
        ['uLevel4',     new THREE.Uniform(null)],
        ['uLevel5',     new THREE.Uniform(null)],
        ['uLevel6',     new THREE.Uniform(null)],
        ['uLevel7',     new THREE.Uniform(null)],
        ['uFocusDist',  new THREE.Uniform(1000)],
        ['uTanHalf',    new THREE.Uniform(new THREE.Vector2(0.2, 0.2))],
        ['uUpView',     new THREE.Uniform(new THREE.Vector3(0, 1, 0))],
        ['uMaxBlur',    new THREE.Uniform(0)],
        ['uHeroBlur',   new THREE.Uniform(0)],
        ['uZone',       new THREE.Uniform(0.2)],
        ['uRamp',       new THREE.Uniform(0.5)],
        ['uLogDepth',   new THREE.Uniform(0)],
        ['uDebug',      new THREE.Uniform(0)],
        ['uHeroOn',     new THREE.Uniform(0)],
        ...[0, 1, 2, 3].map(i => ['uHero' + i, new THREE.Uniform(null)]),
      ]),
    })
  }
  update(renderer) {
    // Bind the shared ladder each frame (built by the DownsamplePyramid pass
    // earlier in the composer — DoF MUST be ordered after it). Fall back to the
    // smallest bound level if a rung is missing so a sampler is never null.
    const levels = _pyramidRefs.levels.current
    const u = this.uniforms
    for (let i = 0; i < 8; i++) {
      u.get('uLevel' + i).value = levels[i] ?? levels[levels.length - 1] ?? null
    }
    const hero = _heroLadderRefs.levels.current
    const heroOn = _heroLadderRefs.on.current && hero.length > 0
    u.get('uHeroOn').value = heroOn ? 1 : 0
    for (let i = 0; i < HERO_LEVELS; i++) u.get('uHero' + i).value = (heroOn ? hero[i] : null) ?? levels[i] ?? levels[levels.length - 1] ?? null
    u.get('uFocusDist').value  = _dofRefs.focusDist.current
    u.get('uTanHalf').value.copy(_dofRefs.tanHalf.current)
    u.get('uUpView').value.copy(_dofRefs.upView.current)
    u.get('uMaxBlur').value    = _dofRefs.maxBlur.current
    u.get('uHeroBlur').value   = _dofRefs.heroBlur.current
    u.get('uZone').value       = _dofRefs.zone.current
    u.get('uRamp').value       = _dofRefs.ramp.current
    u.get('uDebug').value      = _dofRefs.debug.current
    // Decode-mode follows the actual canvas depth regime (LOG on desktop, LINEAR
    // on mobile) — read it live so the effect is correct on whichever host mounts it.
    u.get('uLogDepth').value = renderer?.capabilities?.logarithmicDepthBuffer ? 1 : 0
  }
}

export const RomanceDoF = forwardRef((_, ref) => {
  const effect = useMemo(() => new RomanceDoFEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
