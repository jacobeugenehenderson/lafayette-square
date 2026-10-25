// treereq.mjs — every request under /baked/, cache off: tree bytes, and whether any GLB or trees-atlas PNG loads (a press expects impostors only). node treereq.mjs <url>
const [,, url] = process.argv
const { launch, sleep } = await import('/Users/jacobhenderson/Desktop/lafayette-square.nosync/scripts/lib/headless.mjs')
const chrome = await launch({ windowSize: '1440,900' })
const got = new Map(); const st = new Map()
try {
  const page = await chrome.openPage()
  await page.send('Network.enable'); await page.send('Runtime.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true })
  page.on('Network.responseReceived', e => { const u = e.response.url; if (/\/baked\//.test(u)) st.set(u, e.response.status) })
  page.on('Network.loadingFinished', e => got.set(e.requestId, e.encodedDataLength))
  const ids = new Map(); page.on('Network.requestWillBeSent', e => ids.set(e.requestId, e.request.url))
  await page.send('Page.navigate', { url })
  const ev = async (x) => (await page.send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value
  for (let i = 0; i < 400; i++) { await sleep(200); if (await ev("performance.getEntriesByName('ward:reveal').length > 0")) break }
  await sleep(8000)
  const rows = [...ids].filter(([, u]) => /\/baked\//.test(u)).map(([id, u]) => [u.replace(/^.*\/baked\/[^/]+\//, '').replace(/\?.*/, ''), st.get(u), got.get(id) || 0])
  const tree = rows.filter(([p]) => /tree|impostor|atlas/i.test(p))
  console.log(`baked requests ${rows.length}, ${(rows.reduce((a, r) => a + r[2], 0) / 1e6).toFixed(1)} MB; tree-related ${tree.length}, ${(tree.reduce((a, r) => a + r[2], 0) / 1e6).toFixed(1)} MB`)
  for (const [p, s, b] of tree.sort()) console.log(`  ${s} ${(b / 1e6).toFixed(2).padStart(6)} MB  ${p}`)
} finally { await chrome.close() }
process.exit(0)
