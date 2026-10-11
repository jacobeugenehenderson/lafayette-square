#!/usr/bin/env node
/**
 * "DOES THE SUN'S SHADOW BOX HOLD ONE SIZE FOR THE WHOLE SHOT?"
 *
 * WHY (BRIEF-the-movie-is-continuous; Jacob 2026-10-11, option C). The box's size sets the texel grid, so any change
 * of size re-snaps every shadow edge in frame at once. The power-of-two buckets made resizes rare, not absent: a
 * recorded pass of each authored shot resized the box mid-shot 4× on Hi-Pointe–DeMun, 3× on huron, 2× on
 * Provincetown. The path is authored, so the size the whole shot needs is known before it plays
 * (CelestialBodies#shotShadowHalf); the fit holds it for the whole shot (#shadowBucket).
 *
 * THE RULE, on every Look with a moving shot, read from its own files (never restated): the shot played at 60 Hz
 * through the driver's own path (heroKeyframeAnim), each frame put through the runtime's own fit (shadowFit →
 * shadowBucket, imported, not re-implemented) with the town's own extent (its ground.json stencil →
 * shadowHalfExtent) and the authored cap, holds ONE size from its first frame to its last.
 * ⛔ MUTATIONS, run every time: the switch off (shotHalf = null — the per-frame buckets) and the `// shot:begin …
 *    // shot:end` block removed from the source must each resize some shot. A check that cannot see the resize it
 *    was written for proves nothing.
 * ⛔ READ-ONLY. Usage: node checks/claims-a-shot-never-resizes-its-shadow-box.mjs [town …]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const ROOT = new URL('..', import.meta.url).pathname
const FIT = 'src/components/CelestialBodies.jsx'
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const towns = (want.length ? want : readdirSync(join(ROOT, 'public/looks')).filter((t) => existsSync(join(ROOT, 'public/looks', t, 'design.json'))))
  .map((t) => { const d = JSON.parse(readFileSync(join(ROOT, 'public/looks', t, 'design.json'), 'utf8')); return { town: t, k: d.heroKeyframes, m: d.heroMotion } })

// The source mutant lives under node_modules/.cache: its bare imports resolve from its own directory.
mkdirSync(join(ROOT, 'node_modules/.cache'), { recursive: true })
const tmp = mkdtempSync(join(ROOT, 'node_modules/.cache/shot-shadow-'))
const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
let code = 0
try {
  const fit = await vite.ssrLoadModule('/' + FIT)
  for (const f of ['shadowFit', 'shadowBucket', 'shotShadowHalf', 'shadowCapHalf']) if (typeof fit[f] !== 'function') throw new Error(`${FIT} exports no ${f} — the fit moved; re-aim this check`)
  const { shadowHalfExtent } = await vite.ssrLoadModule('/src/components/sceneStencilState.js')
  const anim = await vite.ssrLoadModule('/src/preview/heroAnim.js')
  const src = readFileSync(join(ROOT, FIT), 'utf8')
  if (!/\/\/ shot:begin[\s\S]*\/\/ shot:end/.test(src)) throw new Error(`${FIT} has no // shot:begin … // shot:end block — the shot floor moved; re-aim this check`)
  const mutantPath = join(tmp, 'CelestialBodies.noshot.jsx')
  writeFileSync(mutantPath, src.replace(/\/\/ shot:begin[\s\S]*\/\/ shot:end/, '').replace(/from '\.\.\//g, "from '/src/").replace(/from '\.\//g, "from '/src/components/"))
  const mutant = await vite.ssrLoadModule('/@fs' + mutantPath)

  // One full cycle at 60 Hz: the sizes the box takes, frame by frame.
  const play = ({ k, m }, townHalf, capHalf, bucket, shotHalf) => {
    const P = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }, T = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    const cam = { position: P, fov: 45, isOrthographicCamera: false }, fwd = { x: 0, y: 0, z: 0 }
    const focus = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    let half = null, sizes = [], at = []
    for (let c = 0, i = 0; c < anim.heroCycleSec(m); c += 1 / 60, i++) {
      const r = anim.heroKeyframeAnim(c, k, m, P, T)
      cam.fov = r.fov
      const dx = T.x - P.x, dy = T.y - P.y, dz = T.z - P.z, d = Math.hypot(dx, dy, dz) || 1
      fwd.x = dx / d; fwd.y = dy / d; fwd.z = dz / d
      const next = bucket(half, fit.shadowFit(cam, fwd, townHalf, capHalf, focus), townHalf, shotHalf)
      if (!Number.isFinite(next)) throw new Error(`the fit returned ${next} at ${r.time.toFixed(2)} s — not a size`)
      if (half != null && next !== half) { sizes.push(`${half}→${next}`); at.push(r.time.toFixed(1)) }
      half = next
    }
    return { resizes: sizes.length, sizes, at, first: half }
  }

  const fails = []
  let offRed = false, srcRed = false, checked = 0
  for (const x of towns) {
    if (!(x.k?.length > 1)) { console.log(`  ${x.town}: a still shot (${x.k?.length ?? 0} authored key) — one pose, one size`); continue }
    const gp = join(ROOT, 'public/baked', x.town, 'ground.json')
    if (!existsSync(gp)) { fails.push(`${x.town}: has a moving shot but no baked ground.json — its extent is unknown, NOT CHECKED`); continue }
    const townHalf = shadowHalfExtent(JSON.parse(readFileSync(gp, 'utf8')).stencil)
    if (townHalf == null) { fails.push(`${x.town}: its ground.json carries no stencil — NOT CHECKED`); continue }
    const capHalf = fit.shadowCapHalf()
    const shotHalf = fit.shotShadowHalf(x.k, x.m, townHalf, capHalf)
    const on = play(x, townHalf, capHalf, fit.shadowBucket, shotHalf)
    const off = play(x, townHalf, capHalf, fit.shadowBucket, null)
    const mut = play(x, townHalf, capHalf, mutant.shadowBucket, shotHalf)
    checked++
    offRed ||= off.resizes > 0
    srcRed ||= mut.resizes > 0
    if (on.resizes) fails.push(`${x.town}: the shot resizes its shadow box ${on.resizes}× (${on.sizes.slice(0, 4).join(', ')} at ${on.at.slice(0, 4).join(', ')} s)`)
    console.log(`  ${x.town}: shot size ${shotHalf} m (town ${townHalf.toFixed(0)}, cap ${capHalf}) · resizes ${on.resizes} · switch off ${off.resizes}× (${off.sizes.slice(0, 6).join(', ') || '—'}) · source mutant ${mut.resizes}×`)
  }
  if (!checked) throw new Error('no Look carries a moving shot — nothing was checked')
  if (!offRed) fails.push('⛔ MUTATION SURVIVED: with the switch off (per-frame buckets) no shot resized — this check cannot see a resize')
  if (!srcRed) fails.push('⛔ MUTATION SURVIVED: with the shot floor removed from the source no shot resized — this check is blind to the code it guards')
  console.log(fails.length ? `⛔ ${fails.join('\n⛔ ')}` : '✅ every moving shot holds one shadow-box size from start to end — and both mutants resized')
  code = fails.length ? 1 : 0
} catch (e) { console.error(`⛔ ${e.stack || e.message}`); code = 2 }
finally { await vite.close(); rmSync(tmp, { recursive: true, force: true }) }
process.exit(code)
