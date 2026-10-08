#!/usr/bin/env node
/**
 * CLAIM: a frameKey that changes BEFORE the plan can fly it is HELD and flown once the plan is live — never consumed.
 *
 * WHY (Hinge, 2026-10-07): a Ward pin link opened COLD (/provincetown/society?show=…) never zoomed. ShotFlight's frameKey
 * effect marked the key done and THEN returned when the plan was not live yet (not the plan shot, places or disc not
 * landed), so the one frame the link asked for was swallowed. From a card, with the town already up, it worked.
 *
 * HOW (runtime, the kit dev server, ONE headless browser): Preview opens cold in Browse (<Town shot="plan">). The moment
 * Preview's probe exists (`window.__townProbe`, set at mount — before the buildings have loaded), frameKey is bumped. The
 * claim holds when, after the town is up, Town's onFramed has reported a frame of PLACES (placed ≥ 1) — the frame the key
 * asked for. ⭐ SEEN TO FAIL: on the code before the fix this check reports no frame (the key was consumed early).
 *
 *   node checks/claims-an-early-frame-key-is-held.mjs --town=<town> [--base=http://localhost:5173]
 * Needs the dev server. Read-only: non-GET requests are failed in the page.
 */
import { launch, sleep } from '../scripts/lib/headless.mjs'
import { requiredTown } from './_scenes.mjs'

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const TOWN = requiredTown('town'), BASE = arg('base', process.env.DEV_URL || 'http://localhost:5173')
// --after=<ms>: bump the key that long after the probe appears instead (the control: a key with the town already up)
const AFTER = +arg('after', '0')

const chrome = await launch({ windowSize: '1280,800' })
let code = 1
try {
  const page = await chrome.openPage()
  await page.send('Page.enable'); await page.send('Runtime.enable')
  // Browse = Town's plan shot, from the first frame; and bump frameKey the instant the probe exists — before the places load
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('preview.mode.v1', 'desktop'); localStorage.setItem('cartograph-last-stage-shot', 'browse')
    window.__earlyKey = null
    const t0 = performance.now()
    const poll = () => { const p = window.__townProbe
      if (p?.setFrameKey) { setTimeout(() => { window.__earlyKey = { at: Math.round(performance.now() - t0), framedBefore: p.framed.length }; p.setFrameKey((k) => k + 1) }, ${AFTER}); return }
      setTimeout(poll, 10) }
    poll()` })
  await page.send('Page.navigate', { url: `${BASE}/preview.html?look=${TOWN}` })
  let r = null
  for (let i = 0; i < 120 && !r?.done; i++) {
    await sleep(1000)
    const e = await page.send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const p = window.__townProbe
      if (!p || !window.__earlyKey) return { done: false }
      const places = p.framed.filter((f) => f && f.placed >= 1)
      return { done: places.length > 0 || performance.now() > 45000, early: window.__earlyKey, framed: p.framed.length, placesFrames: places.length,
               first: places[0] ? { placed: places[0].placed, of: places[0].of, radius: Math.round(places[0].radius) } : null } })()` })
    r = e.result?.value
  }
  console.log(`${TOWN}: frameKey bumped ${r?.early?.at ?? '?'} ms after load (probe up, ${r?.early?.framedBefore ?? '?'} frames before it) · onFramed calls ${r?.framed ?? 0} · frames of places ${r?.placesFrames ?? 0}${r?.first ? ` (placed ${r.first.placed}/${r.first.of}, radius ${r.first.radius} m)` : ''}`)
  if (r?.placesFrames > 0) { console.log('✅ the early frameKey was held and flown once the plan was live'); code = 0 }
  else console.log('❌ FAIL — the frameKey that arrived before the plan was live was never flown (consumed early)')
} finally { chrome.close() }
process.exit(code)
