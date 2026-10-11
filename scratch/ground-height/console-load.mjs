// console-load.mjs — load the dev server's player for one town in ONE headless Chrome, record uncaught exceptions and
// console errors/warnings for a while, and save a screenshot. READ-ONLY.
//   node scratch/ground-height/console-load.mjs <look> [seconds=45] [path=/]
import { launch, sleep } from '../../scripts/lib/headless.mjs'
import { writeFileSync } from 'fs'
const [look, secs = '45', path = '/'] = process.argv.slice(2)
const STUB = `const hot={accept(){},acceptExports(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},decline(){},data:{}};export function createHotContext(){return hot}export function updateStyle(){}export function removeStyle(){}export const injectQuery=(u)=>u;export class ErrorOverlay extends HTMLElement{}`
const chrome = await launch({ windowSize: '1400,850' })
const ex = [], logs = []
try {
  const page = await chrome.openPage()
  page.on('Runtime.exceptionThrown', p => ex.push(String(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text).slice(0, 400)))
  page.on('Runtime.consoleAPICalled', p => { if (p.type === 'error' || p.type === 'warning') logs.push(`${p.type}: ${p.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`) })
  page.on('Fetch.requestPaused', (p) => page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(STUB).toString('base64') }).catch(() => {}))
  await page.send('Page.enable'); await page.send('Runtime.enable')
  if (process.env.STUB_VITE === '1') await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/@vite/client*', requestStage: 'Request' }] })
  await page.send('Page.navigate', { url: `http://localhost:5173${path}?look=${look}` })
  await sleep(+secs * 1000)
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`scratch/ground-height/console-${look}.png`, Buffer.from(shot.data, 'base64'))
} finally { chrome.close() }
console.log(`${look}: ${ex.length} uncaught exception(s) · ${logs.filter(l => l.startsWith('error')).length} console error(s) · ${logs.filter(l => l.startsWith('warning')).length} warning(s)`)
for (const e of ex.slice(0, 8)) console.log('  EXC ' + e.split('\n')[0])
for (const l of logs.filter(l => l.startsWith('error')).slice(0, 12)) console.log('  ' + l)
