// Trees: the card SHADER's per-fragment cost and the cards' EMPTY MARGIN (Sigil, 2026-11-02; Boz's (a)+(b), measured not built). Was: overdraw vs per-draw (Sigil, 2026-11-02; Boz's (i)+(ii), measured not built). Was: trees by distance band (Sigil, 2026-11-02; Boz: where does the tree cost sit, near overdraw or far count?). Derived from trees step 0 (Sigil, 2026-11-02; phase two (b), Boz's go, Zob's points). MEASUREMENT ONLY, in page memory: Stage
// headless at fixed cameras derived from the town's disc, Preview's GPU timer (frameCost.js) installed into Stage.
//
//   node scratch/tree-step0/probe.mjs --town=<look>
//
// The hero impostor's layers are told apart by what the code builds (HeroImpostorTrees.jsx), not by names (it names none):
// the FRONT leaf shell is the tessellated card (FRONT_GRID > 1 → more than 4 vertices); the back leaf shell and the bark are
// flat 4-vertex cards, the bark at brightness 0.8, a back leaf shell below 1.0 and not 0.8.
// Per camera: V0 · front shells hidden · back shells hidden · bark hidden · every hero impostor hidden · all trees hidden ·
// the instance share in frustum (per instance, bounding sphere from the card's own size). Then: trees on/off at half the
// window (fill vs vertex), and the CPU cost of a per-instance frustum pass over every hero-impostor instance, per frame,
// at 1× and at 4× CPU throttle (what compaction on every frame of a flight would cost).
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir, loadavg } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const TOWN = arg('town', 'provincetown'), BASE = arg('base', 'http://localhost:5173')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'tree-shader-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { execSync(`pkill -9 -f 'user-data-dir=${profile}'`) } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('uncaughtException', (e) => { console.error(e); cleanup(); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error(e); cleanup(); process.exit(1) })
let port; for (let i = 0; i < 100 && !port; i++) { const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100) }
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0; const pending = new Map()
const cdp = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid && { sessionId: sid }) })) })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true })
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S)
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value }
await cdp('Page.navigate', { url: `${BASE}/stage/${TOWN}/hero` }, S)
const log = []; const say = (s) => { console.log(s); log.push(s) }
say(`== trees shader + margin · ${TOWN} · Stage headless, this M1 · load ${loadavg().map((x) => x.toFixed(1)).join(' ')} ==`)
for (let i = 0; i < 150; i++) { await sleep(1000); if (await js(`!!(window.__scene && window.__camera && window.__controls && window.__scene.children.some(o => o.name === 'town:trees'))`).catch(() => false)) break }
await sleep(10000)

await js(`(async () => {
  const sc = window.__scene, g = window.__renderer
  const trees = sc.children.find((o) => o.name === 'town:trees')
  const fcMod = await import('/src/preview/frameCost.js'); fcMod.installFrameCost(g)
  const gpu = async (ms) => { const r = await fcMod.gpuWindow(ms); if (!r.n) throw new Error('gpuWindow saw no frames'); return +r.ms.toFixed(2) }
  const hero = []; trees.traverse((o) => { if (o.isInstancedMesh && o.geometry?.attributes?.aOverhead && o.geometry?.attributes?.aGround) hero.push(o) })
  const orig = hero.map((m) => m.material)
  // (a) BARE FRAGMENT: the same material (same vertex stage: billboard, wind, ground lift → the same coverage), its fragment
  // stage replaced by map + alphaTest only. Δ against V0 = what the card's per-fragment shading costs.
  const BARE_FRAG = '#include <common>\\n#include <uv_pars_fragment>\\n#include <map_pars_fragment>\\n#include <alphatest_pars_fragment>\\n#include <logdepthbuf_pars_fragment>\\nvoid main() {\\n#include <logdepthbuf_fragment>\\nvec4 diffuseColor = vec4(1.0);\\n#include <map_fragment>\\n#include <alphatest_fragment>\\ngl_FragColor = diffuseColor;\\n}'
  const bare = () => hero.forEach((m, k) => { const o = orig[k], b = o.clone(); const obc = o.onBeforeCompile
    b.onBeforeCompile = (shader, r) => { obc && obc.call(b, shader, r); shader.fragmentShader = BARE_FRAG }
    b.customProgramCacheKey = () => 'bare-' + (o.customProgramCacheKey ? o.customProgramCacheKey() : ''); m.material = b })
  const restore = () => hero.forEach((m, k) => { if (m.material !== orig[k]) { m.material.dispose(); m.material = orig[k] } })
  // (b) EMPTY MARGIN: the share of each card texture's texels that pass alphaTest (what rasterises AND survives), weighted by
  // that draw's instance count. 1 − it is the quad area a tight card shape would not rasterise.
  // The GPU textures may be compressed (no drawable image), so the margin is read from the SHIPPED card pictures the manifest
  // names (trees-atlas.json#heroImpostorBySpecies[].layers[].albedo), decoded in the page; weighted by layer, every species.
  const margin = async (cut) => {
    const m = await fetch(location.origin + '/baked/' + (window.__marginTown) + '/trees-atlas.json').then((r) => r.ok ? r.json() : null).catch(() => null)
    if (!m?.heroImpostorBySpecies) return { unread: 'no trees-atlas.json heroImpostorBySpecies' }
    const per = []; let unread = 0
    for (const rec of Object.values(m.heroImpostorBySpecies)) for (const L of (rec.layers || [])) {
      try { const rel = (L.albedo.startsWith('/') ? L.albedo : '/' + L.albedo).replace(/\.ktx2$/, '.png')   // the PNG twin beside the KTX2 page
        let blob = null
        for (const u of ['/baked/' + window.__marginTown + rel, rel]) { const r = await fetch(u); if (r.ok && /image/.test(r.headers.get('content-type') || '')) { blob = await r.blob(); break } }
        if (!blob) throw new Error('no PNG twin')
        const bmp = await createImageBitmap(blob), w = Math.min(256, bmp.width), h = Math.min(256, bmp.height), cv = new OffscreenCanvas(w, h), cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0, w, h)
        const d = cx.getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] / 255 >= cut) n++
        per.push({ kind: L.kind, c: n / (w * h) }) } catch { unread++ } }
    const all = per.map((x) => x.c).sort((a, b) => a - b), mean = (xs) => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : null
    return { layers: per.length, unread, coverage: mean(all), leaf: mean(per.filter((x) => x.kind !== 'bark').map((x) => x.c)), bark: mean(per.filter((x) => x.kind === 'bark').map((x) => x.c)), min: all[0] && +all[0].toFixed(3), max: all.length ? +all[all.length - 1].toFixed(3) : null }
  }
  window.__ts = { hero, gpu, bare, restore, margin, trees }
  return true
})()`)
await js(`(() => { window.__marginTown = '${TOWN}'; return true })()`)
const m = await js(`__ts.margin(${0.4})`)
say(`  card pictures passing alphaTest 0.4 (texels, mean over ${m.layers} layer pictures): all ${m.coverage} · leaf ${m.leaf} · bark ${m.bark} · min ${m.min} / max ${m.max} · unreadable ${m.unread} → empty margin ≈ ${m.coverage == null ? '?' : ((1 - m.coverage) * 100).toFixed(0)}% of a card quad`)
const disc = await js(`fetch('/baked/${TOWN}/ground.json').then(r => r.json()).then(g => ({ c: g.stencil.center, r: g.stencil.radius }))`)
const [cx, cz] = Array.isArray(disc.c) ? disc.c : [disc.c.x, disc.c.z ?? disc.c.y], R = disc.r
const cams = { far: { pos: [cx, 0.08 * R, cz + 0.85 * R], tgt: [cx, 0, cz] }, mid: { pos: [cx, 0.04 * R, cz + 0.35 * R], tgt: [cx, 5, cz] }, close: { pos: [cx, 30, cz + 0.12 * R], tgt: [cx, 10, cz] } }
const results = { town: TOWN, margin: m, rows: [] }
for (const [cn, cam] of Object.entries(cams)) {
  await js(`(() => { const c = window.__camera, t = window.__controls; c.position.set(${cam.pos.join(',')}); t.target.set(${cam.tgt.join(',')}); t.update(); return true })()`); await sleep(3500)
  const v0 = await js(`__ts.gpu(3000)`)
  await js(`(() => { __ts.trees.visible = false; return true })()`); await sleep(2000); const off = await js(`__ts.gpu(3000)`); await js(`(() => { __ts.trees.visible = true; return true })()`); await sleep(1500)
  await js(`(() => { __ts.bare(); return true })()`); await sleep(4000); const b = await js(`__ts.gpu(3000)`); await js(`(() => { __ts.restore(); return true })()`); await sleep(2500)
  const back = await js(`__ts.gpu(2000)`)
  const tree = v0 - off, sh = v0 - b
  say(`  ${cn.padEnd(5)} V0 ${v0} · trees hidden ${off} (trees ${tree.toFixed(1)} ms) · bare fragment ${b} (shading ${sh.toFixed(1)} ms = ${(100 * sh / Math.max(0.1, tree)).toFixed(0)}% of the trees) · restored ${back} · uptime ${loadavg()[0].toFixed(1)}`)
  results.rows.push({ cam: cn, v0, off, bare: b, back })
}
const out = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${TOWN}.json`), JSON.stringify({ ...results, load: loadavg(), log }, null, 1))
ws.close(); cleanup(); process.exit(0)
