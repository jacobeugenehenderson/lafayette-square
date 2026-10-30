#!/usr/bin/env node
// CLAIM — A WINDOW READ THAT FAILS IN TRANSPORT IS RETRIED, AND REFUSES NAMING ITS URL, ITS ATTEMPTS AND EACH UNDERLYING
// ERROR (elevationSources.mjs#withNetRetry; Jacob: "a message explains or goes away").
// ⛔ WHY (Huron's bake, 2026-10-30): it stopped on `CustomAggregateError: Request failed`, errors [undefined ×11], naming
// nothing. With a block cache on, geotiff's BlockedSource drops each block request's rejection and reports the missing
// BLOCKS as its `errors` (undefined by construction), so the socket error reached nobody and the retry, reading no code,
// threw on the first attempt. Reproduced here: the bare geotiff read of the same failure is held to the same test.
// ⭐ OFFLINE: a local server serves a written tiff, then breaks the WINDOW's range requests (headers open normally).
//   (1) every window request's socket dropped, block cache on → REFUSES naming the URL, all 4 attempts and "other side closed"
//   (2) the socket dropped twice, then served → the read SUCCEEDS (the retry fires under the block cache)
//   (3) HTTP 503 on the window → REFUSES at once (not a network error, not retried), naming HTTP 503
//   MUTANTS: the bare geotiff read of (1) does not name its cause → RED · the client's record removed (_importSource's
//   mutated copy of elevationSources.mjs) → (1) and (2) RED
//   node checks/claims-a-failed-read-names-its-cause.mjs      Read-only.
import http from 'node:http'
import { writeArrayBuffer, fromUrl } from 'geotiff'
import { importSource } from './_importSource.mjs'
import * as E0 from '../cartograph/elevationSources.mjs'

let red = 0
const row = (ok, msg) => { if (!ok) red++; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }
const N = 512, tif = Buffer.from(writeArrayBuffer(new Float32Array(N * N).fill(3), { width: N, height: N, ModelPixelScale: [1, 1, 0], ModelTiepoint: [0, 0, 0, 0, N, 0] }))
let mode = 'serve', broken = 0
const server = http.createServer((req, res) => {
  if (mode !== 'serve' && broken > 0) { broken--
    if (mode === 'drop') return req.socket.destroy()
    res.writeHead(503); return res.end('busy') }
  const [a, b] = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '').slice(1).map(Number), e = Math.min(b, tif.length - 1)
  res.writeHead(206, { 'Content-Range': `bytes ${a}-${e}/${tif.length}`, 'Content-Length': e - a + 1 }); res.end(tif.subarray(a, e + 1))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/planted/TESTTILE.tiff`
const cornersLL = [[20, 20], [480, 20], [480, 480], [20, 480]]
const read = async (E, how, times) => { mode = 'serve'; const opened = await E.openRasters([{ kind: 'url', ref: url }], { cacheMB: 4 })
  mode = how; broken = times; const warn = console.warn; console.warn = () => {}
  try { const s = await E.readWindow(opened, { cornersLL, quiet: true }); return { band: s[0]?.band } } catch (e) { return { err: String(e.message) } } finally { console.warn = warn; mode = 'serve' } }
const named = (m) => !!m && m.includes(url) && /every one of 4 attempt/.test(m) && (m.match(/attempt \d: /g) || []).length === 4 && /other side closed|UND_ERR_SOCKET/.test(m)
const rows = async (E) => {
  const r1 = await read(E, 'drop', Infinity), r2 = await read(E, 'drop', 2), r3 = await read(E, '503', Infinity)
  return { r1, r2, r3, ok1: named(r1.err), ok2: !!r2.band && r2.band.every(v => v === 3), ok3: !!r3.err && /HTTP 503/.test(r3.err) && /not retried/.test(r3.err) }
}

const v = await rows(E0)
row(v.ok1, `(1) every window request dropped → ${v.r1.err ? v.r1.err.split('\n').slice(0, 3).join(' / ').slice(0, 220) : 'NOT REFUSED'}`)
row(v.ok2, `(2) dropped twice, then served → ${v.r2.band ? `read ${v.r2.band.length} pixels` : `refused: ${(v.r2.err || '').split('\n')[0].slice(0, 120)}`}`)
row(v.ok3, `(3) HTTP 503 on the window → ${v.r3.err ? v.r3.err.split('\n').slice(0, 3).join(' / ').slice(0, 220) : 'NOT REFUSED'}`)

// MUTANT: the bare geotiff read of (1)
{ mode = 'serve'; const t = await fromUrl(url, { blockSize: 65536, cacheSize: 64 }), img = await t.getImage(0); mode = 'drop'; broken = Infinity
  let bare = ''; try { await img.readRasters({ window: [20, 32, 480, 492] }) } catch (e) { bare = `${e.name}: ${e.message} errors=[${(e.errors || []).slice(0, 3).map(String).join(', ')}…]` } finally { mode = 'serve' }
  row(!named(bare), `mutant: the bare geotiff read → ${named(bare) ? 'names its cause — the check is blind' : `RED, as it must be ("${bare.slice(0, 90)}")`}`) }
// MUTANT: the client's record removed, through the one mutated-copy loader (bare specifiers resolved from here)
{ const from = 'catch (e) { this.failures.push({ range: headers?.Range ?? null, error: e }); throw e }'
  let M = null; try { M = await importSource('cartograph/elevationSources.mjs', { transform: (t) => { if (t.split(from).length !== 2) throw new Error('the line moved')
    return t.replace(from, 'catch (e) { throw e }').replace(/from '([^.'/][^']*)'/g, (_, r) => `from '${import.meta.resolve(r)}'`) } }) } catch (e) { row(false, `mutant: the client's record removed → NOT MUTATED (${e.message})`) }
  if (M) { const m = await rows(M)
    row(!m.ok1 && !m.ok2, `mutant: the client's record removed → (1) ${m.ok1 ? 'still named' : 'unnamed'}, (2) ${m.ok2 ? 'still retried' : 'not retried'}${!m.ok1 && !m.ok2 ? ', RED as it must be' : ' — the check cannot see it'}`) } }

server.close()
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ a failed window read is retried, and refuses naming its URL, its attempts and each cause')
process.exit(red ? 1 : 0)
