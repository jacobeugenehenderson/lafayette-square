#!/usr/bin/env node
/**
 * CLAIM: along every drawn shore, no view across the shore reaches the sky — every downward ray that meets the water's
 * datum inside the drawing lands on something drawn (BRIEF-the-shore-is-closed step 2, "the void instrument").
 *
 * ⭐ READS THE RENDER, NOT THE BAKE: drives src/harness/gaps/gaps.html (the production <Town>) headless against the dev
 * server, walking a camera along every shoreline in the disc — near from the water, near from the land, far — and
 * counting pixels that show the background (sky, clouds, fog, post and water switched off; see gaps.jsx). Each gap is
 * printed with the point its ray was aimed at.
 * ⭐ AND IT IS SEEN TO FAIL: every run also walks the town with its `shore` and `bed` ground groups HIDDEN, and the claim
 * is void unless that mutation finds MORE gaps than the town as drawn. An instrument that cannot go red proves nothing.
 * ⚠️ NOT YET MEASURED: a building's foundation riser seen from the shore (the brief's second kind of view). This counts
 * views through to the sky only.
 *
 *   node checks/claims-no-view-reaches-the-sky-at-the-shore.mjs [--town=huron,provincetown] [--every=1]
 * `--every=n`: a station every n terrain grid steps (1 = every step, the full walk; a larger n is a quick look, said).
 * Needs the dev server on 5173 (DEV_URL to override). Read-only.
 */
import { launch, sleep } from '../scripts/lib/headless.mjs'

const BASE = process.env.DEV_URL || 'http://localhost:5173'
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const towns = arg('town', 'huron,provincetown').split(',')
const every = Math.max(1, +arg('every', '1'))
// ⛔ No hot reload in the measuring page: other sessions edit src/ all day (the water measure's own lesson).
const VITE_STUB = `const hot = { accept(){}, acceptExports(){}, dispose(){}, prune(){}, invalidate(){}, on(){}, off(){}, send(){}, decline(){}, data: {} };
export function createHotContext() { return hot }
export function updateStyle(id, css) { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s) } s.textContent = css }
export function removeStyle(id) { document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove() }
export const injectQuery = (u) => u
export class ErrorOverlay extends HTMLElement {}`

const chrome = await launch({ windowSize: '400,300' })
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { chrome.close(); process.exit(130) })

async function walk(town, hide) {
  const page = await chrome.openPage(), errors = []
  page.on('Runtime.exceptionThrown', p => errors.push(String(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text).slice(0, 300)))
  await page.send('Page.enable'); await page.send('Runtime.enable')
  page.on('Fetch.requestPaused', p => page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(VITE_STUB).toString('base64') }).catch(() => {}))
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/@vite/client*', requestStage: 'Request' }] })
  await page.send('Page.navigate', { url: `${BASE}/src/harness/gaps/gaps.html?look=${town}&every=${every}${hide ? '&hide=' + hide : ''}` })
  let r = null, last = ''
  const t0 = Date.now()
  while (Date.now() - t0 < 4 * 3600e3) {
    await sleep(2000)
    const e = await page.send('Runtime.evaluate', { expression: 'JSON.stringify({ g: window.__gaps || null, p: window.__gapsProgress || "" })', returnByValue: true })
    const v = e.result?.value ? JSON.parse(e.result.value) : null
    if (v?.g) { r = v.g; break }
    if (v?.p && v.p !== last) { last = v.p; process.stdout.write(`\r    ${town}${hide ? ' (hide ' + hide + ')' : ''}: station ${v.p}   `) }
  }
  await page.close()
  process.stdout.write('\r')
  return { r: r || { error: 'timeout' }, errors, s: Math.round((Date.now() - t0) / 1000) }
}

let fail = 0
for (const town of towns) {
  const asDrawn = await walk(town, '')
  if (asDrawn.r.error) { console.error(`⛔ ${town}: the walk did not complete — ${asDrawn.r.error}${asDrawn.errors.length ? '\n   ' + asDrawn.errors.slice(0, 3).join('\n   ') : ''}`); fail++; continue }
  const mut = await walk(town, 'shore,bed')
  const g = asDrawn.r, m = mut.r
  const total = (x) => x.gaps.reduce((t, q) => t + q.pixels, 0)
  const views = (x) => Object.values(x.perView).reduce((t, v) => t + v.views, 0), withGap = (x) => x.gaps.length
  console.log(`  ${town}: ${g.stations} station(s) every ${every} × ${g.gridM} m · ${views(g)} views (${asDrawn.s} s)` +
    (every > 1 ? ` · ⚠️ a quick walk (every ${every}): a gap between stations is not looked at` : ''))
  console.log(`     (${g.deepPixels} px landed deeper than the bottom shows, ${g.visibleToM} m — opaque water, not gaps)`)
  for (const [id, v] of Object.entries(g.perView)) console.log(`     ${id.padEnd(16)} ${v.withGap} of ${v.views} views reach the sky · ${v.pixels} px`)
  // the mutation must see MORE than the town as drawn, or the instrument is blind
  if (m.error || !(withGap(m) > withGap(g))) {
    console.error(`  ⛔ ${town}: the MUTATION (shore + bed hidden) found ${m.error ? 'nothing — ' + m.error : withGap(m) + ' view(s) with a gap'}, not more than the town as drawn (${withGap(g)}) — the instrument is not seeing the shore`)
    fail++; continue
  }
  console.log(`     ✓ mutation: with shore + bed hidden, ${withGap(m)} view(s) reach the sky (${total(m)} px) — the instrument sees them`)
  if (g.gaps.length) {
    fail++
    console.error(`  ⛔ ${town}: ${g.gaps.length} view(s) reach the sky across the shore (${total(g)} px). Largest, with the point the ray was aimed at:`)
    for (const q of [...g.gaps].sort((a, b) => b.pixels - a.pixels).slice(0, 12))
      console.error(`     ${String(q.pixels).padStart(5)} px  ${q.view.padEnd(16)} from station (${q.station.join(', ')}) → aimed at (${q.at.join(', ')})`)
  } else console.log(`  ✅ ${town}: no view across the shore reaches the sky`)
}
await chrome.close()
console.log(fail ? `\n⛔ FAIL — ${fail} town(s)` : '\n✅ no view across any drawn shore reaches the sky')
process.exit(fail ? 1 : 0)
