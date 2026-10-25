// Splice: capture the exact input of a stampCrossings call that refuses ("did not settle"), as a fixture the stamp fix
// can be tested on without a ② build. Builds the scene through the one feed (scratch/_proto-feed.mjs, its `tg` hook) on a
// TEMP COPY of src/lib/tileGround.js whose stampTile writes its items (rings + kinds) to JSON before re-throwing; the
// live file is never written. Then trims the capture to the rings that interact near the loop and checks that the trimmed
// set still refuses, so the fixture is the smallest input that reproduces it.
//   node scratch/splice/capture-stamp.mjs <scene> <out.json>   (the scene's ribbons staged where ribbonsPathOf reads them)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { feed, buildProto } from '../_proto-feed.mjs'
const [scene, outP] = process.argv.slice(2)
const ROOT = new URL('../../', import.meta.url).pathname, D = join(ROOT, 'src/lib')
const ANCHOR = '  const out = stampCrossings(items.map(x => x.r), (a, b) => (items[a].kind === \'ev\') === (items[b].kind === \'ev\'))\n'
let src = readFileSync(join(D, 'tileGround.js'), 'utf8')
if (src.split(ANCHOR).length !== 2) { console.log('⛔ NOT CAPTURED — the stampTile anchor is not in src/lib/tileGround.js once'); process.exit(2) }
src = src.replace(ANCHOR, `  let out
  try { out = stampCrossings(items.map(x => x.r), (a, b) => (items[a].kind === 'ev') === (items[b].kind === 'ev')) }
  catch (e) { (globalThis.__stampFail ||= []).push({ message: e.message, items: items.map(x => ({ kind: x.kind, r: x.r })) }); throw e }
`).replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from '${pathToFileURL(join(D, r)).href}'`)
  .replace(/from 'clipper-lib'/g, `from '${import.meta.resolve('clipper-lib')}'`)
  .replace("export function stampCrossings(", "function stampCrossings(")
src += '\nexport { stampCrossings as __stampCrossings }\n'
const dir = mkdtempSync(join(tmpdir(), 'splice-stamp-')), tgP = join(dir, 'tileGround.js')
writeFileSync(tgP, src)
const tg = await import(pathToFileURL(tgP).href)
const f = feed(scene); if (!f) process.exit(2)
try { buildProto(f, { tg }); console.log(`⛔ ${scene} built — no stamp refusal to capture`); process.exit(1) } catch (e) { console.log(`refused as expected: ${e.message.split('\n')[0]}`) }
const cap = globalThis.__stampFail?.[0]
if (!cap) { console.log('⛔ the refusal did not come from stampTile — nothing captured'); process.exit(1) }
const skip = (items) => (a, b) => (items[a].kind === 'ev') === (items[b].kind === 'ev')
const refuses = (items) => { try { tg.__stampCrossings(items.map(x => x.r), skip(items)); return false } catch (e) { return /did not settle/.test(e.message) } }
// trim: keep the tile rings, and the evidence rings whose bbox comes within 1 m of the loop site the instrumented run found
// (the rings that cross there), then check the trimmed set still refuses
const site = (process.env.SITE || '-1017.78,1992.80').split(',').map(Number), M = 1
const near = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z) }
  return site[0] >= a - M && site[0] <= c + M && site[1] >= b - M && site[1] <= d + M }
const trimmed = cap.items.filter(x => x.kind !== 'ev' || near(x.r))
const full = refuses(cap.items), small = refuses(trimmed)
writeFileSync(outP, JSON.stringify({ scene, message: cap.message, site, note: 'items as stampTile hands them to stampCrossings; skip = same ev-ness', all: cap.items.length, items: small ? trimmed : cap.items }))
console.log(`captured ${cap.items.length} ring(s) (${cap.items.filter(x => x.kind !== 'ev').length} tile, ${cap.items.filter(x => x.kind === 'ev').length} evidence) · full set refuses: ${full} · trimmed to ${trimmed.length} near the site, refuses: ${small} → wrote ${small ? 'the trimmed' : 'the FULL'} set to ${outP}`)
