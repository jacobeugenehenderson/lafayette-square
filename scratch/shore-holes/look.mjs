// One gap-harness station, its three views kept as PNGs, with and without double-sided ground (Argon, read-only).
//   node scratch/shore-holes/look.mjs --town=huron --at=x,z [--tag=name]
import { launch, sleep } from '../../scripts/lib/headless.mjs'
import { writeFileSync } from 'node:fs'
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const town = arg('town'), at = arg('at'), tag = arg('tag') || 'site'
if (!town || !at) { console.log('--town= and --at= are required'); process.exit(1) }
const STUB = `const hot={accept(){},acceptExports(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},decline(){},data:{}};export function createHotContext(){return hot}export function updateStyle(){}export function removeStyle(){}export const injectQuery=(u)=>u;export class ErrorOverlay extends HTMLElement{}`
const chrome = await launch({ windowSize: '600,400' })
try {
  for (const dbl of [0]) {
    const page = await chrome.openPage()
    await page.send('Page.enable'); await page.send('Runtime.enable')
    page.on('Fetch.requestPaused', (p) => page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(STUB).toString('base64') }).catch(() => {}))
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/@vite/client*', requestStage: 'Request' }] })
    await page.send('Page.navigate', { url: `http://localhost:5173/src/harness/gaps/gaps.html?look=${town}&at=${at}&keep=1&w=480&h=270${dbl ? '&doubleside=1' : ''}` })
    let r = null
    for (let i = 0; i < 240 && !r; i++) { await sleep(1000); const e = await page.send('Runtime.evaluate', { returnByValue: true, expression: 'window.__gaps ? JSON.stringify({ g: window.__gaps, f: window.__gapsFrames, p: window.__gapsPts || [] }) : null' }); r = e.result?.value ? JSON.parse(e.result.value) : null }
    if (!r || r.g.error) { console.log('⛔', r?.g?.error || 'timeout'); continue }
    console.log(`${dbl ? 'DOUBLE-SIDED' : 'as drawn    '}: ${JSON.stringify(r.g.perView)} · gaps ${r.g.gaps.map((x) => `${x.view} ${x.pixels}px@${x.at}`).join(' · ') || 'none'}`)
    for (const [v, f] of Object.entries(r.f || {})) writeFileSync(`scratch/shore-holes/${tag}-${v}${dbl ? '-double' : ''}.png`, Buffer.from(f.url.split(',')[1], 'base64'))
    if (!dbl) writeFileSync(`scratch/shore-holes/${tag}-points.json`, JSON.stringify(r.p))
    if (!dbl) console.log('  station', JSON.stringify(Object.values(r.f || {})[0]?.station), 'water normal', JSON.stringify(Object.values(r.f || {})[0]?.normal))
    await page.close()
  }
} finally { chrome.close() }
