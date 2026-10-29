// Headless receipt driver (Boz, 2026-10-28: "Jacob's browser isn't an instrument"): opens a Stage page on the temporary
// :5190 receipt server in headless Chrome over CDP (Plumb's launcher, main checkout scratch/balsa-step1/cdp.mjs), refuses
// every non-GET in the page, waits for the town, then evaluates a receipt script (scratch/dof-receipts/<name>.txt) and
// prints its JSON. Read-only.
//   node scratch/dof-receipts/headless.mjs --town=huron --receipt=town [--shot=hero] [--wait=8000] [--ramp=0.95] [--amount=1] [--shift=x,y,z]
import { launch, sleep } from '../../../../../scratch/balsa-step1/cdp.mjs'
const arg = (n, d) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const town = arg('town', 'huron'), receipt = arg('receipt', 'town'), shot = arg('shot', 'hero'), wait = +arg('wait', 8000), ramp = arg('ramp', null), amount = arg('amount', null), shift = arg('shift', null)
const B = await launch({ W: 1512, H: 982, DPR: 1 })
try {
  await B.cdp('Page.enable')
  await B.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const of = window.fetch; window.fetch = (u, o) => { const m = (o?.method || (u instanceof Request ? u.method : 'GET')).toUpperCase(); if (m !== 'GET' && m !== 'HEAD') return Promise.reject(new Error('receipt: ' + m + ' refused')); return of(u, o) }; const oo = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, ...r) { if (!/^(GET|HEAD)$/i.test(m)) throw new Error('receipt: ' + m + ' refused'); return oo.call(this, m, ...r) } })()` })
  await B.cdp('Page.navigate', { url: `http://localhost:5190/stage/${town}/${shot}` })
  let st = null
  for (let i = 0; i < 120; i++) { await sleep(1000); st = await B.js(`({ scene: !!window.__scene, pass: !!window.__dof?.pass, dof: window.__dof ? Object.keys(window.__dof) : null })`); if (st?.scene && st?.pass) break }
  console.error('ready:', JSON.stringify(st))
  await sleep(wait)
  if (ramp) await B.js(`window.__TOWN_RAMP = ${+ramp}`)
  if (amount) await B.js(`window.__TOWN_AMOUNT = ${+amount}`)
  if (shift) await B.js(`window.__TOWN_SHIFT = [${shift}]`)
  const out = await B.js(`(async () => { const code = await (await fetch('/scratch/dof-receipts/${receipt}.txt?' + Date.now())).text(); const AF = Object.getPrototypeOf(async function () {}).constructor; try { return await new AF(code)() } catch (e) { return { ERR: String(e.stack).slice(0, 600) } } })()`)
  console.log(JSON.stringify(out, null, 1))
} finally { B.close() }
