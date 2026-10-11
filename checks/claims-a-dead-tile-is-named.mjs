// claims-a-dead-tile-is-named.mjs — WHEN A TILE THE TOWN'S LIST NAMES IS GONE, DOES THE BAKE SAY WHICH, AND WHAT TO RUN?
//
// ⭐ THE INVARIANT: opening a raster source that cannot be opened throws with the tile's NAME, its URL, the server's
// STATUS and the command that re-derives the list (`elevationSources.mjs#deadTile`).
// ⛔ WHY (2026-10-10): NOAA re-versions BlueTopo tiles. Provincetown's list still named BlueTopo_BF2JL2MC_20260709.tiff,
// now HTTP 404, and its bake stopped on geotiff's bare "Error fetching data". The stop was right; the message gave the
// operator nothing to act on.
// ⭐ OFFLINE: a local server answers 404, so the check needs no outside network and cannot be fooled by a tile that
// happens to exist today.
// ⭐ MUTATION (run every time): the bare geotiff open of the same URL is held to the same test and must FAIL it,
// so the check is seen to go red on the message it replaced.
//
//   node checks/claims-a-dead-tile-is-named.mjs      Read-only. Exits 1 if the error does not name the tile.
import http from 'node:http'
import { fromUrl } from 'geotiff'
import { openRasters } from '../cartograph/elevationSources.mjs'

const server = http.createServer((req, res) => { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('gone') })
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/BlueTopo/TESTTILE/BlueTopo_TESTTILE_20260709.tiff`
const label = url.split('/').pop(), refetch = 'node cartograph/fetch-bathymetry.mjs --scene=<town>'
const named = (msg) => msg.includes(label) && msg.includes(url) && /HTTP 404/.test(msg) && msg.includes(refetch)
let kit = '', bare = ''
try { await openRasters([{ kind: 'url', ref: url }], { refetch }) } catch (e) { kit = String(e.message) }
try { await fromUrl(url).then(t => t.getImage(0)) } catch (e) { bare = String(e.message) }
server.close()
const ok = named(kit), mutationRed = !named(bare)
console.log(`  kit's refusal: ${ok ? '✅ names the tile, its URL, HTTP 404 and the command' : '⛔ does not'} — "${kit.split('\n')[0].slice(0, 160)}"`)
console.log(`  mutation (the bare geotiff message): ${mutationRed ? '✅ red, as it must be' : '⛔ passed — the check is blind'} — "${bare.slice(0, 80)}"`)
process.exit(ok && mutationRed ? 0 : 1)
