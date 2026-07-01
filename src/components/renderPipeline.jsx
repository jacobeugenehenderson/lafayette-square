/**
 * renderPipeline — the post-FX pipeline DECLARED ONCE (the manifest) + the ONE
 * installer that mounts it, parameterized by mode.
 *
 * Phase 2 of the render-pipeline install (HANDOFF-render-pipeline-install.md).
 * The doctrine "ONE consumer — Production, Stage, and Preview render the same
 * pipeline" is made STRUCTURAL here instead of asserted: `POSTFX_PIPELINE` is
 * the literal ship list (order, channel, platform inclusion, mount gate), and
 * `RenderPipeline` is the single installer that consumes it. Add a pass, change
 * an order, fix a prop → it touches ONE place and every surface inherits it.
 *
 * Inspection (Preview's per-pass toggle matrix + cost gauges) is a PARAMETER on
 * this one install (`inspect`), never a parallel composer — so Preview cannot
 * drift from production by construction. Production/Stage install with no
 * `inspect` and render byte-identical to the old hand-wired `<EffectComposer>`.
 *
 * The three inline film effects (FilmGrade/FilmGrain/AerialPerspective) live
 * here because the manifest references them at module-eval time; keeping them in
 * PostProcessing.jsx (which imports this installer) would be a fatal import
 * cycle. They read the driving refs owned by usePostFxDriver.js. PostProcessing
 * re-exports them so PreviewPostFx's import path (Phase 3 retires it) is stable.
 */
import { forwardRef, useMemo } from 'react'
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'
import { Effect, SMAAPreset } from 'postprocessing'
import * as THREE from 'three'

import useTimeOfDay from '../hooks/useTimeOfDay'
import { IS_MOBILE } from '../lib/isMobile.js'
import { AO_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'
import { RomanceDoF } from './RomanceDoF.jsx'
import { DownsamplePyramid } from './DownsamplePyramid.jsx'
import { CustomBloom } from './CustomBloom.jsx'
import {
  _gradeContrastRef, _gradeSatRef, _gradeVignetteRef, _gradeBrightnessRef,
  _exposureRef, _warmthRef, _fillToeRef, _grainScaleRef,
  _haloStrengthRef, _haloColorRef,
} from './usePostFxDriver.js'

// ── Film effects ────────────────────────────────────────────────────────────
// Operator-authored params flow through the module-level refs (owned by
// usePostFxDriver.js) that the driver's useFrame populates from the resolved
// channels. Each Effect's own update() pass reads those refs into uniforms.

class FilmGradeEffect extends Effect {
  constructor() {
    super('FilmGrade', /* glsl */`
      uniform float uSunAlt;
      uniform float uContrast;
      uniform float uToe;
      uniform float uSat;
      uniform float uVignette;
      uniform float uExposure;
      uniform float uWarmth;
      uniform float uBrightness;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * uExposure;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 curved = c * c * (3.0 - 2.0 * c);
        c = mix(c, curved, uContrast);
        float toe = smoothstep(0.0, 0.25, lum);
        c *= mix(uToe, 1.0, toe);
        float shadowSat = 1.0 + (1.0 - toe) * 0.3;
        vec3 gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, shadowSat);
        float midBell = 4.0 * lum * (1.0 - lum);
        c *= 1.0 + midBell * 0.15;
        vec3 warmTint = vec3(1.04, 0.98, 0.92);
        vec3 coolTint = vec3(0.96, 0.98, 1.04);
        vec3 splitTone = mix(warmTint, coolTint, smoothstep(0.3, 0.7, lum));
        c *= splitTone;
        float goldenT = exp(-pow((uSunAlt - 0.08) / 0.12, 2.0));
        float nightT = smoothstep(0.05, -0.15, uSunAlt);
        c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.88), goldenT * 0.5);
        c *= mix(vec3(1.0), vec3(0.88, 0.92, 1.08), nightT * 0.4);
        float warmthBias = (uWarmth - 0.5) * 2.0;
        vec3 photoTint = warmthBias >= 0.0
          ? vec3(1.10, 1.00, 0.84)
          : vec3(0.86, 0.94, 1.12);
        float photoDensity = abs(warmthBias) * 0.6;
        vec3 tinted = c * mix(vec3(1.0), photoTint, photoDensity);
        float lumIn  = dot(c,      vec3(0.2126, 0.7152, 0.0722));
        float lumOut = dot(tinted, vec3(0.2126, 0.7152, 0.0722));
        c = tinted * (lumIn / max(lumOut, 1e-4));
        gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, uSat);
        c = mix(c, inputColor.rgb, smoothstep(0.7, 1.0, lum));
        // Brightness LIFT (the B of HSB): raise the black floor so crushed dark
        // surfaces read, white point unchanged. Additive lift, not exposure gain.
        c = c + uBrightness * (1.0 - c);
        vec2 center = uv - 0.5;
        float vignette = 1.0 - dot(center, center) * uVignette;
        vignette = smoothstep(0.0, 1.0, clamp(vignette, 0.0, 1.0));
        c *= vignette;
        outputColor = vec4(c, inputColor.a);
      }
    `, {
      uniforms: new Map([
        ['uSunAlt',   new THREE.Uniform(0.5)],
        ['uContrast', new THREE.Uniform(0.42)],
        ['uToe',      new THREE.Uniform(0.28)],
        ['uSat',      new THREE.Uniform(1.1)],
        ['uVignette', new THREE.Uniform(1.0)],
        ['uExposure', new THREE.Uniform(0.95)],
        ['uWarmth',   new THREE.Uniform(0.5)],
        ['uBrightness', new THREE.Uniform(0)],
      ])
    })
  }
  update() {
    const tod = useTimeOfDay.getState()
    this.uniforms.get('uSunAlt').value   = tod.getLightingPhase().sunAltitude
    // All channel-backed refs are populated per-frame by usePostFxDriver
    // (grade contrast/sat/vignette/toe, exposure, warmth, fill).
    this.uniforms.get('uContrast').value = _gradeContrastRef.current
    this.uniforms.get('uSat').value      = _gradeSatRef.current
    this.uniforms.get('uVignette').value = _gradeVignetteRef.current
    this.uniforms.get('uExposure').value = _exposureRef.current
    this.uniforms.get('uWarmth').value   = _warmthRef.current
    this.uniforms.get('uToe').value      = _fillToeRef.current
    this.uniforms.get('uBrightness').value = _gradeBrightnessRef.current
  }
}
export const FilmGrade = forwardRef((_, ref) => {
  const effect = useMemo(() => new FilmGradeEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

class FilmGrainEffect extends Effect {
  constructor() {
    super('FilmGrain', /* glsl */`
      uniform float uSeed; uniform float uScale;
      float grainHash(vec2 p) { vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float lum=dot(inputColor.rgb,vec3(0.2126,0.7152,0.0722));
        float darkSuppress=smoothstep(0.0,0.08,lum);
        float strength=mix(0.007,0.002,smoothstep(0.0,0.5,lum))*uScale*darkSuppress;
        float grain=(grainHash(uv*1000.0+uSeed)-0.5)*strength;
        outputColor=vec4(inputColor.rgb+grain,inputColor.a);
      }
    `, { uniforms: new Map([['uSeed', new THREE.Uniform(0)], ['uScale', new THREE.Uniform(1)]]) })
  }
  update() {
    this.uniforms.get('uSeed').value = Math.random() * 1000
    const alt = useTimeOfDay.getState().getLightingPhase().sunAltitude
    const day = alt > 0.1 ? 1 : alt < -0.15 ? 0 : (alt + 0.15) / 0.25
    this.uniforms.get('uScale').value = (0.4 + day * 0.6) * _grainScaleRef.current
  }
}
export const FilmGrain = forwardRef((_, ref) => {
  const effect = useMemo(() => new FilmGrainEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

// AerialPerspective — uHazeStrength × uHazeColor authored by Halo channel.
// Strength is authored DIRECTLY (no hidden sun-altitude gate) — author day/night
// via the Halo TOD curve. (_haloStrengthRef/_haloColorRef live in usePostFxDriver.)
class AerialPerspectiveEffect extends Effect {
  constructor() {
    super('AerialPerspective', /* glsl */`
      uniform float uHazeStrength; uniform vec3 uHazeColor;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float horizonBand=smoothstep(0.15,0.55,uv.y)*smoothstep(0.85,0.55,uv.y);
        float lum=dot(inputColor.rgb,vec3(0.2126,0.7152,0.0722));
        float contrastLoss=smoothstep(0.05,0.4,lum)*smoothstep(0.9,0.4,lum);
        float haze=horizonBand*contrastLoss*uHazeStrength;
        outputColor=vec4(mix(inputColor.rgb,uHazeColor,haze),inputColor.a);
      }
    `, { uniforms: new Map([['uHazeStrength', new THREE.Uniform(0)], ['uHazeColor', new THREE.Uniform(new THREE.Vector3(0.7, 0.75, 0.82))]]) })
  }
  update() {
    // Strength authored directly — the dayFactor sun-altitude multiplier was
    // removed 2026-06-21 (a hidden hardwire that overrode the authored channel
    // and forbade night haze — the same anti-pattern as the bloom night-boost
    // removed 2026-06-07). Author the day→night falloff via the Halo TOD curve.
    this.uniforms.get('uHazeStrength').value = _haloStrengthRef.current
    const hc = _haloColorRef.current
    this.uniforms.get('uHazeColor').value.set(hc.r, hc.g, hc.b)
  }
}
export const AerialPerspective = forwardRef((_, ref) => {
  const effect = useMemo(() => new AerialPerspectiveEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

// ── The manifest — the pipeline DECLARED, not hand-wired JSX ─────────────────
// The literal ship list, in install order. Each entry:
//   id        — stable key (also the Preview inspect-toggle key)
//   pass      — the pass/effect component the installer mounts
//   channel   — the authored scene.json channel that drives it (documentary;
//               the actual driving is usePostFxDriver — this records the wiring)
//   order     — install position (low → early); the array is already ordered
//   platform  — inclusion axis: 'desktop' = desktop only; absent = every device
//   ref       — which ctx.refs entry to forward (so the driver can reach the
//               live pass instance: N8AO.configuration, CustomBloom uniforms)
//   gate(ctx) — conditional mount (DoF only when enabled, SMAA when on); absent
//               = always mounted. A gated pass also drives the composer remount
//               key (EffectComposer can only add/remove passes on rebuild).
//   props(ctx)— per-pass props resolved from the render context.
export const POSTFX_PIPELINE = [
  {
    id: 'ao', pass: N8AO, channel: 'ao', order: 10, platform: 'desktop', ref: 'ao',
    props: (ctx) => ({
      // half-res AO in any non-hero view (undefined viewMode = Stage, full-res).
      halfRes: ctx.viewMode !== undefined && ctx.viewMode !== 'hero',
      aoRadius: AO_FLAT_DEFAULTS.radius,
      intensity: AO_FLAT_DEFAULTS.intensity,
      distanceFalloff: AO_FLAT_DEFAULTS.distanceFalloff,
      quality: 'medium',
    }),
  },
  // Shared full-scene blur pyramid — built after N8AO (post-AO scene). A PURE
  // RESOURCE both DoF and bloom SAMPLE (never each other's result). Desktop
  // bracket = full degree; the phone rungs dial it down (preview-equals-pyramid).
  { id: 'pyramid', pass: DownsamplePyramid, order: 20, platform: 'desktop' },
  // DoF — two-focal romance DoF, AFTER the pyramid so it samples it (CoC-weighted
  // lerp toward the shared blur), BEFORE bloom so the glow lands on the defocused
  // scene. Desktop only. Mounts only when the `dof` channel enables it.
  { id: 'dof', pass: RomanceDoF, channel: 'dof', order: 30, platform: 'desktop', gate: (ctx) => ctx.dofOn },
  { id: 'bloom', pass: CustomBloom, channel: 'bloom', order: 40, platform: 'desktop', ref: 'bloom' },
  { id: 'aerial', pass: AerialPerspective, channel: 'halo', order: 50, platform: 'desktop' },
  { id: 'grade', pass: FilmGrade, channel: 'grade', order: 60 },
  // SMAA — cleans shader-contrast edges MSAA can't (curb lines, slab seams, thin
  // poles); on mobile it is the ONLY antialiasing. After grade, before grain.
  // ULTRA preset = most aggressive edge detection. Operator on/off → scene.json.
  { id: 'smaa', pass: SMAA, channel: 'smaa', order: 70, gate: (ctx) => ctx.smaaOn, props: () => ({ preset: SMAAPreset.ULTRA }) },
  { id: 'grain', pass: FilmGrain, channel: 'grain', order: 80 },
]

// ── The installer — consumes the manifest, parameterized by mode ─────────────
/**
 * Mount the post-FX pipeline from POSTFX_PIPELINE.
 *
 * @param refs      { ao, bloom } — refs the driver reaches the live passes through.
 * @param viewMode  production's view mode (undefined in Stage → full-res AO).
 * @param smaaOn    resolved SMAA on/off (drives the SMAA gate + remount key).
 * @param dofOn     resolved DoF on/off (drives the DoF gate + remount key).
 * @param inspect   Preview only (Phase 3): { toggles:{id:bool}, onCost } — the
 *                  per-pass visibility matrix + cost-gauge callbacks. When
 *                  present, each pass additionally gates on its toggle (default
 *                  on) and every pass joins the remount key. Absent for
 *                  production/Stage → byte-identical to the old hand-wired JSX.
 */
export function RenderPipeline({ refs, viewMode, smaaOn, dofOn, inspect }) {
  const ctx = { refs, viewMode, smaaOn, dofOn }
  const platform = IS_MOBILE ? 'mobile' : 'desktop'
  const included = POSTFX_PIPELINE.filter((e) => !e.platform || e.platform === platform)

  // A pass mounts when its channel-gate is on AND (not inspecting, or its
  // inspect toggle is on). Inspection just ADDS to the mount condition — never
  // a second composer.
  const mountOn = (e) => {
    const gateOn = e.gate ? e.gate(ctx) : true
    const inspectOn = inspect ? (inspect.toggles?.[e.id] ?? true) : true
    return gateOn && inspectOn
  }
  // EffectComposer can only add/remove passes on REMOUNT, so its key must change
  // whenever the mounted set changes. Key only on entries whose mount can vary
  // (gated passes; every pass while inspecting) so production/Stage keep today's
  // exact remount cadence — flips only with smaaOn / dofOn.
  const varying = inspect ? included : included.filter((e) => e.gate)
  const key = 'fx-' + varying.map((e) => `${e.id}:${mountOn(e) ? 1 : 0}`).join('-')

  return (
    <EffectComposer key={key}>
      {included.filter(mountOn).map((e) => {
        const Pass = e.pass
        const props = e.props ? e.props(ctx) : null
        return e.ref
          ? <Pass key={e.id} ref={refs?.[e.ref]} {...props} />
          : <Pass key={e.id} {...props} />
      })}
    </EffectComposer>
  )
}
