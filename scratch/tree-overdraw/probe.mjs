// Trees: OVERDRAW vs PER-DRAW cost (Sigil, 2026-11-02; Boz's (i)+(ii), measured not built). Was: trees by distance band (Sigil, 2026-11-02; Boz: where does the tree cost sit, near overdraw or far count?). Derived from trees step 0 (Sigil, 2026-11-02; phase two (b), Boz's go, Zob's points). MEASUREMENT ONLY, in page memory: Stage
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
const profile = mkdtempSync(join(tmpdir(), 'tree-overdraw-'))
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
say(`== trees overdraw · ${TOWN} · Stage headless, this M1 · load ${loadavg().map((x) => x.toFixed(1)).join(' ')} ==`)
for (let i = 0; i < 150; i++) { await sleep(1000); if (await js(`!!(window.__scene && window.__camera && window.__controls && window.__scene.children.some(o => o.name === 'town:trees'))`).catch(() => false)) break }
await sleep(10000)

await js(`(async () => {
  const sc = window.__scene, g = window.__renderer
  const trees = sc.children.find((o) => o.name === 'town:trees')
  const fcMod = await import('/src/preview/frameCost.js'); fcMod.installFrameCost(g)
  const gpu = async (ms) => { const r = await fcMod.gpuWindow(ms); if (!r.n) throw new Error('gpuWindow saw no frames'); return +r.ms.toFixed(2) }
  const hero = []; trees.traverse((o) => { if (o.isInstancedMesh && o.geometry?.attributes?.aOverhead && o.geometry?.attributes?.aGround) hero.push(o) })
  const save = hero.map((m) => ({ mat: m.instanceMatrix.array.slice(), gr: m.geometry.attributes.aGround.array.slice(), gw: m.geometry.attributes.aLampGlow?.array.slice(), count: m.count,
    alphaTest: m.material.alphaTest, a2c: m.material.alphaToCoverage }))
  const restore = () => { hero.forEach((m, k) => { const s = save[k]; m.instanceMatrix.array.set(s.mat); m.geometry.attributes.aGround.array.set(s.gr); if (s.gw) m.geometry.attributes.aLampGlow.array.set(s.gw)
      m.count = s.count; m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aGround.needsUpdate = true; if (s.gw) m.geometry.attributes.aLampGlow.needsUpdate = true
      if (m.material.alphaTest !== s.alphaTest || m.material.alphaToCoverage !== s.a2c) { m.material.alphaTest = s.alphaTest; m.material.alphaToCoverage = s.a2c; m.material.needsUpdate = true } })
    for (const p of pre) { p.parent?.remove(p) } pre.length = 0; trees.visible = true }
  const distOf = (m, i) => { const a = m.instanceMatrix.array, c = window.__camera.position, gr = m.geometry.attributes.aGround.array; return Math.hypot(a[16 * i + 12] - c.x, gr[2 * i] - c.y, a[16 * i + 14] - c.z) }
  // NEAR-FIRST: reorder each draw's instances by distance (same set, same look; only the order the GPU meets them)
  const nearFirst = () => { hero.forEach((m) => { const n = m.count, idx = [...Array(n).keys()].map((i) => [distOf(m, i), i]).sort((x, y) => x[0] - y[0]).map((x) => x[1])
      const A = m.instanceMatrix.array, G = m.geometry.attributes.aGround.array, L = m.geometry.attributes.aLampGlow?.array, a = A.slice(), gg = G.slice(), l = L?.slice()
      idx.forEach((src, dst) => { A.set(a.subarray(16 * src, 16 * src + 16), 16 * dst); G[2 * dst] = gg[2 * src]; G[2 * dst + 1] = gg[2 * src + 1]; if (L) L[dst] = l[src] })
      m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aGround.needsUpdate = true; if (L) m.geometry.attributes.aLampGlow.needsUpdate = true }) }
  // DEPTH PREPASS of the near fifth: depth-only clones (same geometry/material shader, colorWrite off), drawn first
  const pre = []
  const prepassNear = () => { const all = []; hero.forEach((m, k) => { for (let i = 0; i < m.count; i++) all.push([distOf(m, i), k, i]) }); all.sort((x, y) => x[0] - y[0])
    const cut = all[Math.floor(all.length / 5)][0]
    hero.forEach((m) => { const near = []; for (let i = 0; i < m.count; i++) if (distOf(m, i) <= cut) near.push(i); if (!near.length) return
      const c = m.clone(); c.material = m.material.clone(); c.material.onBeforeCompile = m.material.onBeforeCompile; c.material.colorWrite = false; c.renderOrder = m.renderOrder - 1
      c.geometry = m.geometry.clone()   // its own aGround, remapped to the near order (the shader lifts each card by it)
      c.instanceMatrix = m.instanceMatrix.clone(); c.count = near.length
      const G0 = m.geometry.attributes.aGround.array, G = c.geometry.attributes.aGround.array
      near.forEach((src, dst) => { c.instanceMatrix.array.set(m.instanceMatrix.array.subarray(16 * src, 16 * src + 16), 16 * dst); G[2 * dst] = G0[2 * src]; G[2 * dst + 1] = G0[2 * src + 1] })
      c.geometry.attributes.aGround.needsUpdate = true
      m.parent.add(c); pre.push(c) }) }
  window.__to = { hero, gpu, restore, nearFirst, prepassNear, trees, n: hero.length,
    count1: () => hero.forEach((m) => { m.count = Math.min(1, m.count) }),
    noDiscard: () => hero.forEach((m) => { m.material.alphaTest = 0; m.material.needsUpdate = true }),
    a2c: () => hero.forEach((m) => { m.material.alphaToCoverage = true; m.material.needsUpdate = true }),
    msaa: () => { const gl = g.getContext(); return { canvas: gl.getContextAttributes().antialias, samples: gl.getParameter(gl.SAMPLES) } } }
  return true
})()`)
const info = await js(`({ draws: __to.n, msaa: __to.msaa() })`)
say(`  hero draws ${info.draws} · canvas msaa ${JSON.stringify(info.msaa)} (alpha-to-coverage needs a multisampled target; the composer's buffer decides)`)
const disc = await js(`fetch('/baked/${TOWN}/ground.json').then(r => r.json()).then(g => ({ c: g.stencil.center, r: g.stencil.radius }))`)
const [cx, cz] = Array.isArray(disc.c) ? disc.c : [disc.c.x, disc.c.z ?? disc.c.y], R = disc.r
const cams = { far: { pos: [cx, 0.08 * R, cz + 0.85 * R], tgt: [cx, 0, cz] }, mid: { pos: [cx, 0.04 * R, cz + 0.35 * R], tgt: [cx, 5, cz] }, close: { pos: [cx, 30, cz + 0.12 * R], tgt: [cx, 10, cz] } }
const V = { allHidden: `__to.trees.visible = false`, count1: `__to.count1()`, nearFirst: `__to.nearFirst()`, prepassNear: `__to.prepassNear()`, a2c: `__to.a2c()`, noDiscard: `__to.noDiscard()` }
const results = { town: TOWN, info, rows: [] }
for (const [cn, cam] of Object.entries(cams)) {
  await js(`(() => { const c = window.__camera, t = window.__controls; c.position.set(${cam.pos.join(',')}); t.target.set(${cam.tgt.join(',')}); t.update(); return true })()`); await sleep(3500)
  const v0 = await js(`__to.gpu(3000)`)
  say(`  ${cn.padEnd(5)} cam ${JSON.stringify(cam.pos.map(Math.round))} · V0 ${v0} ms GPU · uptime ${loadavg()[0].toFixed(1)}`)
  const row = { cam: cn, v0, v: {} }
  for (const [vn, code] of Object.entries(V)) {
    await js(`(() => { ${code}; return true })()`); await sleep(2500)
    const ms = await js(`__to.gpu(3000)`); await js(`(() => { __to.restore(); return true })()`); await sleep(1500)
    const back = await js(`__to.gpu(2000)`)
    row.v[vn] = { ms, back }
    say(`        ${vn.padEnd(11)} Δ ${(ms - v0).toFixed(1).padStart(6)} ms (restored ${back}) · uptime ${loadavg()[0].toFixed(1)}`)
  }
  results.rows.push(row)
}
const out = join(dirname(fileURLToPath(import.meta.url)), 'runs'); mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${TOWN}.json`), JSON.stringify({ ...results, load: loadavg(), log }, null, 1))
ws.close(); cleanup(); process.exit(0)
