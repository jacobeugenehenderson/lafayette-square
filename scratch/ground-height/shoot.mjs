// shoot.mjs — one lab view (src/harness/lab, the production <Town>) at a named point, saved as a PNG. READ-ONLY.
//   node scratch/ground-height/shoot.mjs <look> <x,z,nx,nz> <cam> <out.png> [settleS=40]
import { launch, sleep } from '../../scripts/lib/headless.mjs'
import { writeFileSync } from 'fs'
const [look, at, cam, out, settle = '40'] = process.argv.slice(2)
const STUB = `const hot={accept(){},acceptExports(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},decline(){},data:{}};export function createHotContext(){return hot}export function updateStyle(){}export function removeStyle(){}export const injectQuery=(u)=>u;export class ErrorOverlay extends HTMLElement{}`
const chrome = await launch({ windowSize: '1400,850' })
try {
  const page = await chrome.openPage(), errors = []
  page.on('Runtime.exceptionThrown', p => errors.push(String(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text).slice(0, 300)))
  await page.send('Page.enable'); await page.send('Runtime.enable')
  page.on('Fetch.requestPaused', (p) => page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(STUB).toString('base64') }).catch(() => {}))
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/@vite/client*', requestStage: 'Request' }] })
  await page.send('Page.navigate', { url: `http://localhost:5173/lab.html?look=${look}&at=xz:${at}&cam=${cam}` })
  for (let i = 0; i < +settle; i++) { await sleep(1000); const e = await page.send('Runtime.evaluate', { returnByValue: true, expression: '!!window.__lab' }); if (e.result?.value && i > 15) break }
  // trees off (the lab's own toggle) and the panel hidden, so the ground is what the frame shows
  await page.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'trees').forEach(b => b.click())` })
  await sleep(8000)
  await page.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('div')].filter(d => d.textContent.startsWith('SURFACE LAB') && /absolute|fixed/.test(getComputedStyle(d).position)).slice(-1).forEach(d => d.style.display = 'none')` })
  await sleep(1000)
  const info = await page.send('Runtime.evaluate', { returnByValue: true, expression: 'window.__lab ? JSON.stringify({ cam: window.__lab.camera.position.toArray().map(v => +v.toFixed(2)) }) : "no __lab"' })
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`${out} · ${info.result?.value} · errors: ${errors.length ? errors.slice(0, 3).join(' | ') : 'none'}`)
} finally { chrome.close() }
