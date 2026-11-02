// near-arrives.mjs <town> <seed> — MEASURE ONLY. Does the near layer ARRIVE? On the Ward dev server (dev's __wardMap.sceneRef),
// seeded as pair.mjs is, 4x CPU: the revetment group's near drape meshes (those not named far, i.e. without the far key) and
// its stone instances, every frame, through Home at rest (the movie), the flight into Society and the landing, and back on
// Home; with each frame's duration and the camera's distance to the nearest drawn near drape.
// A queue that never finishes, or one cancelled before it builds anything, would leave these at 0 where the movie stands by
// the shore: a short frame bought by not doing the work.
import { pathToFileURL } from 'node:url'
const KIT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const { launch, sleep } = await import(pathToFileURL(KIT + '/scripts/lib/headless.mjs').href)
const [town, seed = '1'] = process.argv.slice(2)
const DEV = process.env.WARD_DEV_URL || 'http://localhost:5180/'
const SEEDED = `(() => { let a = ${(+seed >>> 0) || 1} >>> 0; Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })();`
const chrome = await launch({ windowSize: '1440,900' })
const out = { town, seed: +seed }
try {
  const page = await chrome.openPage()
  for (const d of ['Page', 'Runtime']) await page.send(d + '.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: SEEDED })
  const ev = async (e) => { const r = await page.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300)); return r.result?.value }
  await page.send('Page.navigate', { url: new URL(`/${town}/`, DEV).href })
  for (let i = 0; i < 600; i++) { await sleep(250); if (await ev(`performance.getEntriesByName('ward:reveal').length > 0 && !!document.querySelector('.band__room') && !!window.__wardMap?.sceneRef?.current`).catch(() => false)) break }
  await page.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  // every animation frame: its time, its duration, the near drape meshes and stone instances drawn, and the camera's distance
  // to the nearest drawn near drape (its bounding sphere's centre, in world space), tagged with the phase
  await ev(`(() => { window.__near = { phase: 'home', rows: [] }; let last = 0; const v = new (window.__wardMap.cameraRef.current.position.constructor)()
    const f = (t) => { const sc = window.__wardMap.sceneRef.current, cam = window.__wardMap.cameraRef.current; let g = null
      sc.traverse(o => { if (o.name === 'revetment') g = o })
      let near = 0, stones = 0, dist = null
      if (g) for (const c of g.children) {
        if (c.isInstancedMesh) { if (c.visible) stones += c.count; continue }
        if (c.isMesh && c.castShadow && c.visible) { near++; const bs = c.geometry.boundingSphere
          if (bs) { v.copy(bs.center).applyMatrix4(c.matrixWorld); const d = v.distanceTo(cam.position); dist = dist == null ? d : Math.min(dist, d) } } }
      window.__near.rows.push([window.__near.phase, Math.round(t), last ? Math.round(t - last) : 0, near, stones, dist == null ? null : Math.round(dist)]); last = t
      requestAnimationFrame(f) }; requestAnimationFrame(f) })()`)
  const phase = (p) => ev(`window.__near.phase = ${JSON.stringify(p)}`)
  await sleep(6000)
  await phase('flight+society'); await ev(`[...document.querySelectorAll('.band__room')].find(e => e.textContent.trim() === 'Society').click()`)
  await sleep(10000)
  await phase('back home'); await ev(`[...document.querySelectorAll('.band__room')].find(e => e.textContent.trim() === 'Home').click()`)
  await sleep(10000)
  const rows = await ev('window.__near.rows')
  // per phase: frames, worst frame, frames with any near; the FIRST frame the near draws: ms into the phase, that frame's
  // duration, the worst frame within two frames of it, and the camera's distance to the nearest near drape then
  out.by = {}
  for (const ph of [...new Set(rows.map(r => r[0]))]) {
    const R = rows.filter(r => r[0] === ph), t0 = R[0][1], i = R.findIndex(r => r[3] > 0 || r[4] > 0)
    out.by[ph] = { frames: R.length, worst: Math.max(...R.map(r => r[2])), withNear: R.filter(r => r[3] > 0 || r[4] > 0).length,
      maxNear: Math.max(...R.map(r => r[3])), maxStones: Math.max(...R.map(r => r[4])),
      first: i < 0 ? null : { msIn: R[i][1] - t0, frame: R[i][2], worstAround: Math.max(...R.slice(Math.max(0, i - 2), i + 3).map(r => r[2])), camToNearM: R[i][5], near: R[i][3], stones: R[i][4] } }
  }
} catch (e) { out.error = String(e.message || e) } finally { await chrome.close() }
console.log(JSON.stringify(out))
