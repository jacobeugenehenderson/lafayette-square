/**
 * shaderLinkGuard.jsx — name the material when a shader program fails to link,
 * and census the REAL per-program texture-unit cost.
 *
 * ⛔⛔ WHY THIS EXISTS. `MAX_TEXTURE_IMAGE_UNITS` is 16 on a phone — and, measured
 * 2026-09-22, on an Apple M1 through ANGLE Metal as well. Cross it and the program
 * does not link, and THE SURFACE DRAWS NOTHING. There is no degraded mode: it reads
 * as a bright, shadowless ground. It cost four operator round trips to identify
 * while the error sat in the console, because nothing about the picture says "a
 * shader did not link" and three's default message does not name the material.
 * Same class as the tree shader sitting at exactly MAX_VERTEX_ATTRIBS = 16, where
 * one more attribute made every tree vanish.
 *
 * ⭐ Layer 0: the ceiling is invisible on the town you developed against and fatal
 * on the next one. One more land-use class, one more authored map, one more cascade
 * and town #2 renders nothing. So the deliverable is not a bigger budget — it is the
 * instrument that says WHICH material, on every town and every device.
 *
 * ⛔⛔ THIS READS THE COMPILED PROGRAM, NEVER THE SOURCE FILES. A static check that
 * counted `uniform sampler2D` across src/ was written and deleted the same hour on
 * 2026-09-22: it reported "13 cascades safe" while 3 demonstrably broke the link.
 * The reason is structural — shader injection crosses files (`applyWeatherToShader`
 * declares its own samplers into someone else's program) and `onBeforeCompile`
 * composes conditionally at runtime, so no static reader can know which branches a
 * given program took. ▶ docs/briefs/BRIEF-texture-unit-headroom.md §4.
 *
 * Two jobs, and they need different evidence:
 *
 *   CENSUS (a program that linked) — `ACTIVE_UNIFORMS` on the live program. This is
 *   the GL's own post-preprocessor count: every #ifdef already resolved, every
 *   injected sampler included, dead ones dropped. It is exact, and it is the only
 *   honest source for "units free on the tightest receiver."
 *
 *   ATTRIBUTION (a program that did NOT link) — a failed program has no active
 *   uniforms to ask, so we fall back to counting sampler DECLARATIONS in
 *   `gl.getShaderSource(fragmentShader)`. That is still the real composed shader
 *   three handed the driver, not a file on disk — but #ifdef branches are unresolved,
 *   so it is an UPPER BOUND and says so in the log. It is enough to name the material,
 *   which is the whole point.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'

// Sampler uniform types → one texture unit each (× the uniform's array size).
// WebGL1 + WebGL2. Anything not here costs no texture unit.
const SAMPLER_TYPES = new Set([
  0x8b5e, // SAMPLER_2D
  0x8b5f, // SAMPLER_3D
  0x8b60, // SAMPLER_CUBE
  0x8b62, // SAMPLER_2D_SHADOW
  0x8dc1, // SAMPLER_2D_ARRAY
  0x8dc4, // SAMPLER_2D_ARRAY_SHADOW
  0x8dc5, // SAMPLER_CUBE_SHADOW
  0x8dca, // INT_SAMPLER_2D
  0x8dcb, // INT_SAMPLER_3D
  0x8dcc, // INT_SAMPLER_CUBE
  0x8dcf, // INT_SAMPLER_2D_ARRAY
  0x8dd2, // UNSIGNED_INT_SAMPLER_2D
  0x8dd3, // UNSIGNED_INT_SAMPLER_3D
  0x8dd4, // UNSIGNED_INT_SAMPLER_CUBE
  0x8dd7, // UNSIGNED_INT_SAMPLER_2D_ARRAY
])

/**
 * ⭐ AN ARRAY SAMPLER COSTS ITS LENGTH, NOT ONE. `uniform sampler2D
 * directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ]` is a single active uniform whose
 * `size` is the light count — which is precisely how cascades spend units, one per
 * cascade, inside ONE uniform. A census that counts uniforms instead of units reads
 * N cascades as 1 and is wrong in the only direction that matters.
 */
function countProgramSamplerUnits(gl, glProgram) {
  const n = gl.getProgramParameter(glProgram, gl.ACTIVE_UNIFORMS)
  let units = 0
  const detail = []
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(glProgram, i)
    if (!info || !SAMPLER_TYPES.has(info.type)) continue
    units += info.size
    detail.push({ name: info.name.replace(/\[0\]$/, ''), units: info.size })
  }
  return { units, detail }
}

/** Upper-bound sampler count for a program that did not link. See the header. */
function declaredSamplersInSource(src) {
  if (!src) return { units: 0, names: [] }
  let units = 0
  const names = []
  // `uniform [highp] sampler2D name[4];` — one decl may list several names.
  const re = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?([iu]?sampler\w*)\s+([^;]+);/g
  let m
  while ((m = re.exec(src)) !== null) {
    for (const decl of m[2].split(',')) {
      const d = decl.trim()
      if (!d) continue
      const arr = d.match(/\[\s*(\d+)\s*\]/)
      units += arr ? Number(arr[1]) : 1
      names.push(d)
    }
  }
  return { units, names }
}

/**
 * Map a raw GL program back to the three `WebGLProgram` that owns it, for the name.
 * ⚠️ three sets `shaderName: material.name` — a material with no `name` attributes
 * as '' and we fall back to `.type`, which narrows it to a class rather than an
 * instance. ⇒ NAME YOUR MATERIALS; an unnamed one is the one you cannot find.
 */
function identify(renderer, glProgram) {
  const progs = renderer.info?.programs || []
  const hit = progs.find((p) => p.program === glProgram)
  if (!hit) return { label: '(program not in cache)', name: '', type: '', cacheKey: '' }
  const name = hit.name || ''
  const type = hit.type || ''
  return { label: name || type || `program#${hit.id}`, name, type, cacheKey: hit.cacheKey }
}

let _installed = new WeakSet()

/**
 * Install on a three WebGLRenderer. Idempotent per renderer.
 * ⛔ No fallback and no swallow: on failure this logs loudly and re-throws nothing,
 * because three continues to its own reporting path only when we decline the hook.
 * We take the hook, so we own the message — and it must be complete.
 */
export function installShaderLinkGuard(renderer) {
  if (!renderer || _installed.has(renderer)) return
  _installed.add(renderer)

  const gl = renderer.getContext()
  const MAX = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)

  renderer.debug.onShaderError = (glCtx, glProgram, glVertexShader, glFragmentShader) => {
    const who = identify(renderer, glProgram)
    const programLog = (glCtx.getProgramInfoLog(glProgram) || '').trim()
    const linked = glCtx.getProgramParameter(glProgram, glCtx.LINK_STATUS)
    const validated = glCtx.getProgramParameter(glProgram, glCtx.VALIDATE_STATUS)
    const frag = declaredSamplersInSource(glCtx.getShaderSource(glFragmentShader))
    const overCeiling = /texture image units/i.test(programLog) || frag.units > MAX

    console.error(
      `⛔ SHADER DID NOT LINK — the surface using «${who.label}» WILL DRAW NOTHING.\n` +
        `   material.name : ${who.name || '(unnamed — name it; see shaderLinkGuard.jsx)'}\n` +
        `   material.type : ${who.type || '(unknown)'}\n` +
        `   LINK_STATUS   : ${linked}   VALIDATE_STATUS: ${validated}\n` +
        `   fragment samplers declared: ${frag.units} (UPPER BOUND — #ifdefs unresolved)\n` +
        `   MAX_TEXTURE_IMAGE_UNITS   : ${MAX}\n` +
        (overCeiling
          ? `   ⛔ THIS IS THE TEXTURE-UNIT CEILING. Free a unit or drop a map on this material.\n`
          : '') +
        `   Program Info Log: ${programLog}\n` +
        `   samplers: ${frag.names.join(', ') || '(none parsed)'}\n` +
        `   ▶ window.__samplerCensus() for the per-material budget across the scene.`
    )
    // Vertex/fragment compile logs, only when non-empty — the link error is usually
    // neither, but when a shader genuinely failed to COMPILE this is where it says so.
    const vLog = (glCtx.getShaderInfoLog(glVertexShader) || '').trim()
    const fLog = (glCtx.getShaderInfoLog(glFragmentShader) || '').trim()
    if (vLog) console.error(`   VERTEX log «${who.label}»: ${vLog}`)
    if (fLog) console.error(`   FRAGMENT log «${who.label}»: ${fLog}`)
  }

  /**
   * The census. Every program three currently holds, tightest receiver first.
   * ⭐ The TIGHTEST sets the scene's cap, not the average: a cascade costs one unit
   * on EVERY receiver, so headroom is min(free), and an average hides the material
   * that is about to go dark.
   */
  const census = () => {
    const rows = []
    for (const p of renderer.info?.programs || []) {
      if (!p.program) continue
      if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) {
        rows.push({ material: p.name || p.type || `program#${p.id}`, samplers: NaN, free: NaN, linked: false, receiver: false })
        continue
      }
      const { units, detail } = countProgramSamplerUnits(gl, p.program)
      rows.push({
        material: p.name || p.type || `program#${p.id}`,
        samplers: units,
        free: MAX - units,
        linked: true,
        // ⛔⛔ A CASCADE COSTS A UNIT ONLY ON A SHADOW RECEIVER. The first cut of this
        // census sorted every program together and announced «EffectMaterial» — a
        // FULLSCREEN POST PASS with 10 bloom mips — as "the tightest receiver, 6 free
        // ⇒ the scene's cascade budget". It receives no shadow; adding a cascade costs
        // it nothing; the number was pure fiction and it was the headline. ⭐ That is
        // Layer 0's plausible-looking success living INSIDE the detector, which is the
        // one place it must never be. A receiver is a program that actually samples a
        // shadow map — ask the compiled uniforms, never the material's class.
        receiver: detail.some((d) => /ShadowMap$/i.test(d.name)),
        uses: detail.map((d) => `${d.name}${d.units > 1 ? `×${d.units}` : ''}`).join(' '),
      })
    }
    rows.sort((a, b) => (b.samplers || 0) - (a.samplers || 0))
    const dead = rows.filter((r) => !r.linked)
    const receivers = rows.filter((r) => r.linked && r.receiver)
    const tightest = receivers[0]
    console.log(
      `[units] MAX_TEXTURE_IMAGE_UNITS=${MAX} · ${rows.length} programs, ` +
        `${receivers.length} of them SHADOW RECEIVERS.\n` +
        `        tightest RECEIVER «${tightest?.material ?? 'n/a'}» uses ${tightest?.samplers ?? '?'} ⇒ ` +
        `${tightest?.free ?? '?'} free. One extra cascade costs 1 unit on EVERY receiver, ` +
        `so that is the headroom — the average is not.\n` +
        `        ⚠️ Non-receivers are listed too and can be tighter (a post pass often is), ` +
        `but a cascade does not spend their units. Read the receiver column.` +
        (dead.length ? `\n        ⛔ ${dead.length} PROGRAM(S) DID NOT LINK: ${dead.map((d) => d.material).join(', ')} — those surfaces draw NOTHING.` : '')
    )
    console.table(rows)
    return rows
  }

  if (typeof window !== 'undefined') {
    window.__samplerCensus = census
    window.__maxTextureUnits = MAX
  }
}

/**
 * ⭐⭐ THE DETECTOR'S OWN MUTATION TEST — `?unitbomb=N` (default 20).
 *
 * A passing check proves nothing until it has been SEEN TO FAIL. This mounts one
 * tiny hidden mesh whose fragment shader declares N samplers, which overruns
 * MAX_TEXTURE_IMAGE_UNITS on purpose and must make the guard above print a message
 * naming «unitbomb». If it stays silent, the guard is broken and every green census
 * it has ever printed is worthless.
 *
 * ⛔ It is a FLAG, not a fixture: absent `?unitbomb` nothing here mounts. It lives in
 * the shipping tree rather than a scratch file precisely so the proof travels to town
 * #2 and to the 16-unit phone, where the ceiling is real and the desktop's headroom
 * is not. ▶ open any scene with `?unitbomb=1` and read the console.
 */
function UnitBomb() {
  const gl = useThree((s) => s.gl)
  const n = useMemo(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('unitbomb')
      return v === null ? 0 : Math.max(1, Number(v) === 1 ? 20 : Number(v) || 20)
    } catch { return 0 }
  }, [])
  const material = useMemo(() => {
    if (!n) return null
    const uniforms = {}
    let decls = '', reads = ''
    const px = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    px.needsUpdate = true
    for (let i = 0; i < n; i++) {
      uniforms[`uBomb${i}`] = { value: px }
      decls += `uniform sampler2D uBomb${i};\n`
      // ⛔ Each sampler must be READ, not merely declared: a driver is free to
      // optimise an unused uniform away entirely, and a bomb that gets optimised
      // out links fine and silently proves nothing.
      reads += `  c += texture2D(uBomb${i}, vUv).r;\n`
    }
    const m = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv;\n${decls}void main(){ float c = 0.0;\n${reads}  gl_FragColor = vec4(vec3(c / ${n}.0), 1.0); }`,
    })
    m.name = 'unitbomb'
    return m
  }, [n])
  useEffect(() => {
    if (!material) return
    console.warn(
      `🧨 unitbomb: mounting a material that declares ${n} fragment samplers against a ` +
        `ceiling of ${gl.getContext().getParameter(gl.getContext().MAX_TEXTURE_IMAGE_UNITS)}. ` +
        `window.__samplerCensus() MUST now report «unitbomb» as a program that did not link. If it does not, shaderLinkGuard is broken and every green census it has printed is worthless.`
    )
    return () => material.dispose()
  }, [material, n, gl])
  if (!material) return null
  // ⛔⛔ THIS MESH IS COMPILED BUT DELIBERATELY NOT DRAWN (off-frame, so three culls it).
  // three defers its link check to `onFirstUse` — a program is checked when it is first
  // DRAWN, not when it is compiled — so a culled bomb never trips `onShaderError`; only
  // the census sees it. That is the trade, taken knowingly:
  //   ⭐ THE CENSUS COVERS EVERY COMPILED PROGRAM, DRAWN OR NOT. THE HOOK COVERS WHAT
  //     DRAWS — which is the real-world case, a visible receiver going dark. Keep both;
  //     neither alone sees the whole scene. The bomb proves the census path.
  //   ⛔ A bomb that DRAWS was tried and withdrawn: a program that cannot link issues a
  //     failed `useProgram` every frame, and the scene did not finish loading at all.
  //
  // ⚠️ KNOWN, UNEXPLAINED, AND SAY SO RATHER THAN GUESS: even culled, this fixture has
  // BOTH detected the failure cleanly (LS, 18 programs, «unitbomb» named) AND left the
  // scene stuck mid-load on later runs, on a machine that was by then heavily loaded.
  // ⛔ CAUSE NOT ESTABLISHED. ⇒ `?unitbomb` is a deliberate, opt-in self-test, not
  // something to leave on; if the scene hangs under it, drop the flag and reload. The
  // detector it proves has no such cost — it is a hook assignment and nothing per frame.
  return (
    <mesh material={material} position={[0, -10000, 0]} scale={0.001}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

/**
 * Mount once inside a <Canvas>. ⛔ UNGATED, deliberately: this is the detector, and
 * a detector behind a flag is off on exactly the town where nobody thought to set it.
 * It costs one hook assignment at mount and nothing per frame — three only calls
 * `onShaderError` on a program that already failed.
 */
export function ShaderLinkGuard() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  // ⭐ The camera and controls are NOT in the scene graph, and a post-processing
  // composer means `renderer.render` is never called with them either — so from a
  // console there is otherwise no way to ask "where is the camera actually looking".
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  useEffect(() => { installShaderLinkGuard(gl) }, [gl])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__camera = camera
    window.__controls = controls || null
  }, [camera, controls])
  // Read-only handles for measuring the live render from the console. ⭐ They exist
  // because the alternative is reasoning about what the lighting curve OUGHT to
  // produce, and this project's standing rule is to measure the thing rather than
  // narrate it. `__lightCensus()` answers "why is it this bright" with numbers.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__scene = scene
    window.__renderer = gl
    window.__lightCensus = () => {
      const lights = []
      scene.traverse((o) => {
        if (!o.isLight) return
        lights.push({
          type: o.type,
          name: o.name || '',
          intensity: +o.intensity.toFixed(4),
          color: `#${o.color?.getHexString?.() ?? '??????'}`,
          groundColor: o.groundColor ? `#${o.groundColor.getHexString()}` : undefined,
          castShadow: !!o.castShadow,
          visible: o.visible,
          // ⛔ An invisible light still contributes nothing, but a VISIBLE one with
          // intensity 0 and a visible one at 0.4 look identical in a scene graph dump
          // and completely different on screen. Print both.
          dir: o.isDirectionalLight
            ? [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(2))
            : undefined,
        })
      })
      const lit = lights.filter((l) => l.visible && l.intensity > 0)
      console.log(
        `[light] ${lights.length} lights, ${lit.length} contributing · ` +
          `toneMapping=${gl.toneMapping} exposure=${gl.toneMappingExposure}`
      )
      console.table(lights)
      return { lights, toneMappingExposure: gl.toneMappingExposure, toneMapping: gl.toneMapping }
    }
  }, [scene, gl])
  return <UnitBomb />
}
