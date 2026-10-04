// Paste into a Preview page (javascript_tool). windDetail's per-fragment GPU cost: full-screen passes evaluating
// windDetail K times per pixel, minus a trivial pass, at a given buffer size. EXT_disjoint_timer_query_webgl2.
// Returns ms per full-screen layer of windDetail. ⚠️ ANGLE/Metal timer reads are a relative gauge (frameCost.js).
(async () => {
  const threeUrl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js/.test(n))
  const THREE = await import(threeUrl)
  const { WIND_SHEET_GLSL, windSheetUniforms } = await import('/src/lib/windSheet.js')
  const r = window.__renderer, ctx = r.getContext(), ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2')
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  const vert = 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }'
  const mat = (body) => new THREE.ShaderMaterial({ uniforms: { ...windSheetUniforms }, vertexShader: vert, depthTest: false, depthWrite: false,
    fragmentShader: WIND_SHEET_GLSL + `\nvoid main(){ vec2 acc = vec2(0.0); ${body} gl_FragColor = vec4(acc * 0.5 + 0.5, 0.0, 1.0); }` })
  const variants = {
    base: mat('acc = gl_FragCoord.xy * 1e-4;'),
    detail1: mat('acc += windDetail(gl_FragCoord.xy * 0.05);'),
    detail3: mat('for (int k = 0; k < 3; k++) acc += windDetail(gl_FragCoord.xy * 0.05 + float(k) * 13.0);'),
  }
  const cam = new THREE.Camera()
  const time = async (m, w, h, n = 20) => {
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false })
    const sc = new THREE.Scene(); const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; sc.add(mesh)
    const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.render(sc, cam)
    const q = ctx.createQuery(); ctx.beginQuery(ext.TIME_ELAPSED_EXT, q)
    for (let i = 0; i < n; i++) r.render(sc, cam)
    ctx.endQuery(ext.TIME_ELAPSED_EXT); r.setRenderTarget(prev)
    for (let i = 0; i < 200 && !ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE); i++) await new Promise((res) => setTimeout(res, 16))
    const dj = ctx.getParameter(ext.GPU_DISJOINT_EXT), ns = ctx.getQueryParameter(q, ctx.QUERY_RESULT)
    ctx.deleteQuery(q); rt.dispose()
    return dj ? null : ns / 1e6 / n
  }
  const out = {}
  for (const [w, h] of [[242, 525], [1170, 2530]]) {
    const runs = { base: [], detail1: [], detail3: [] }
    for (let rep = 0; rep < 5; rep++) for (const k of Object.keys(variants)) { const v = await time(variants[k], w, h); if (v != null) runs[k].push(v) }
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]
    out[`${w}x${h}`] = { baseMs: med(runs.base), detail1Ms: med(runs.detail1), detail3Ms: med(runs.detail3), perLayerMs: (med(runs.detail3) - med(runs.base)) / 3, n: runs.base.length }
  }
  Object.values(variants).forEach((m) => m.dispose()); geo.dispose()
  return JSON.stringify(out)
})()
