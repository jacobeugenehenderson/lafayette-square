/**
 * frameCost — one frame's cost split the two ways that answer different questions. Preview only.
 *
 * - GPU ms: the GPU's time from the frame's first render call to its end (EXT_disjoint_timer_query_webgl2, TIME_ELAPSED,
 *   read back a few frames later). It still counts any GPU idle between passes while script runs, so it is an upper
 *   bound on GPU work; the check shows a 30 ms main-thread burn outside the render calls does not move it.
 *   ⚠️ On ANGLE/Metal (M1, 2026-10-04) it read ~1.2–1.6× the wall-clock frame interval, which pure GPU work cannot do;
 *   it moves with GPU load and not with main load, so it is a RELATIVE gauge there. Cause not established. The panel
 *   flags any reading above the frame interval. A disjoint result (the GPU was interrupted) is
 *   dropped, never averaged. Unsupported → `gpuSupported: false`, and the panel says so; it never shows a substitute.
 * - main ms: the main thread's time from the frame's first callback to its last (r3f addEffect → addAfterEffect):
 *   scripts, three's scene walk and the GL calls' submission. Not GPU time: a GPU-bound frame shows small main ms.
 * - long animation frames: the browser's own `long-animation-frame` entries (≥ 50 ms), with how much of each was
 *   script, so a slow frame can be told apart as script-bound or not.
 * The wall-clock frame interval stays GpuMonitor's (rAF deltas). Each reading is this desktop's, under the target's
 * profile — never a phone's.
 */
import { addAfterEffect, addEffect } from '@react-three/fiber'

const WINDOW = 30
export const frameCost = { gpuSupported: null, gpuMs: null, mainMs: 0, loaf: { n: 0, worstMs: 0, scriptMs: 0, last: [] } }

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)

export function installFrameCost(renderer) {
  const gl = renderer.getContext()
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  frameCost.gpuSupported = !!ext
  const gpu = [], main = [], pending = []
  let t0 = 0, active = null

  // The GPU timer opens at the frame's FIRST render call, not at the frame's start: TIME_ELAPSED counts the GPU's
  // wall time between begin and end, so opening it before the frame's scripts would count the GPU idling while they ran.
  let open = false
  const render = renderer.render
  renderer.render = function (...a) {
    if (open && ext && !active) { active = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, active) }
    return render.apply(this, a)
  }
  const offStart = addEffect(() => {
    t0 = performance.now()
    open = true
    // A test hook for the check (checks/claims-preview-frame-cost-splits.mjs): burn main-thread time inside the frame.
    const burn = typeof window !== 'undefined' && window.__burnMainMs
    if (burn) { const until = performance.now() + burn; while (performance.now() < until) { /* burn */ } }
  })
  const offEnd = addAfterEffect(() => {
    main.push(performance.now() - t0); if (main.length > WINDOW) main.shift()
    frameCost.mainMs = avg(main)
    // A test hook for the check: known GPU work inside the timed window, with no script cost to speak of.
    const loops = typeof window !== 'undefined' && window.__burnGpuLoops
    if (loops) burnGpu(gl, renderer, loops)
    open = false
    if (ext && active) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null }
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pending.shift()
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
      if (!disjoint) { gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); if (gpu.length > WINDOW) gpu.shift() }
      gl.deleteQuery(q)
    }
    frameCost.gpuMs = avg(gpu)
  })

  let obs = null
  try {
    obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const script = (e.scripts || []).reduce((s, x) => s + x.duration, 0)
        const L = frameCost.loaf
        L.n++; L.worstMs = Math.max(L.worstMs, e.duration); L.scriptMs += script
        L.last.push({ at: e.startTime, ms: e.duration, scriptMs: script, blockingMs: e.blockingDuration })
        if (L.last.length > 20) L.last.shift()
      }
    })
    obs.observe({ type: 'long-animation-frame', buffered: false })
  } catch { frameCost.loaf = null }   // the browser has no long-animation-frame: the panel says so

  return () => { offStart(); offEnd(); renderer.render = render; obs?.disconnect(); for (const q of pending) gl.deleteQuery(q) }
}

// A fullscreen triangle whose fragment shader loops `loops` times: GPU work the check can dial (claims-preview-frame-cost-
// splits). three's cached GL state is reset after, so the next frame draws as before.
let burnProg = null
function burnGpu(gl, renderer, loops) {
  if (!burnProg) {
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x }
    burnProg = gl.createProgram()
    gl.attachShader(burnProg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}'))
    gl.attachShader(burnProg, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;uniform int n;out vec4 o;void main(){float a=gl_FragCoord.x;for(int i=0;i<n;i++){a=sin(a)*1.0001+0.1;}o=vec4(vec3(a*1e-9),1.);}'))
    gl.linkProgram(burnProg)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(burnProg)
  gl.uniform1i(gl.getUniformLocation(burnProg, 'n'), loops)
  gl.bindVertexArray(null)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  renderer.resetState()
}
