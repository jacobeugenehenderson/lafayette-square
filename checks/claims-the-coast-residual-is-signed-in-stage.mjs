#!/usr/bin/env node
// CLAIM — THE COAST'S OPEN/CLOSE RESIDUAL IS SIGNED IN STAGE (Boz's GO, Zob's ruling, 2026-10-29). The coast step's runtime net STOPS on
// any piece past 2·NODE_BOUND the town has not signed (bake-coast.mjs#judgeNets). A stop leaves its pieces as ONE record
// (bake-coast.mjs#residualRecord, clean/coast-residual-pending.json); Stage's Bake answers 428 with them only while that record is read
// with today's inputs (serve.js#coastResidualAsk); BakeModal lists, frames and accepts them in one press; the accept route signs exactly
// the record the card showed (its identity), commits the signature, and removes the pending record. No bake-anyway.
//   (a) the stop writes the pending record before it throws, through the one builder; a passing run removes it
//   (b) coastResidualAsk, run from serve.js's own text: a matching record → its pieces and identity · stale reads → null · none → null.
//       MUTANT: its reads test removed → a stale record is asked about, RED
//   (c) the accept route signs only on a matching identity, from the pending record, then removes it and commits that path alone.
//       MUTANT: the identity guard removed → the route would sign what the operator never saw, RED
//   (d) the signature is a coast-step INPUT (pourSteps.mjs): deleting it makes the step's recorded reads differ (the Bake re-judges)
//   (e) the card leads with the scale, says which side has what in plain words, marks the signed pieces, says a row can be clicked; its
//       pixels at the closest camera are derived; its one accept calls the store's accept
//   (f) no bake-anyway: the tolerance is written only by sign-coast-residual --accept, the accept route, and the step's own tightening
//   (g) a piece's size (openCloseJudge.mjs#spanOf, #wideOf) rides in the record, never in coast.json
//   node checks/claims-the-coast-residual-is-signed-in-stage.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ROOT } from './_scenes.mjs'
import { residualRecord, recordIdentity } from '../cartograph/bake-coast.mjs'
import { pourSteps } from '../cartograph/pourSteps.mjs'
import { contentRecord } from '../cartograph/pour-code.mjs'
import { TOLERANCE_FILE } from '../cartograph/coastFile.mjs'

let red = 0
const row = (ok, msg) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${msg}`) }
const src = (f) => readFileSync(join(ROOT, f), 'utf8')
const bc = src('cartograph/bake-coast.mjs'), sv = src('cartograph/serve.js'), bm = src('src/cartograph/BakeModal.jsx'), st = src('src/cartograph/stores/useCartographStore.js')

// (a) the stop's record
{ const judge = bc.slice(bc.indexOf('const judgeNets = (nets) => {'), bc.indexOf('const recordOf = (r) =>'))
  const writeAt = judge.indexOf('residualRecord({ nets, reads: now })'), throwAt = judge.indexOf("throw new Error(`⛔ bake-coast: ${stops.map")
  const removes = /if \(write && fs\.existsSync\(pendingPath\)\) fs\.rmSync\(pendingPath\)/.test(judge) && judge.indexOf('fs.rmSync(pendingPath)') > throwAt
  row(writeAt > 0 && throwAt > writeAt && removes, `(a) a stop writes its pieces (residualRecord, both paths, with the reads) before it throws, and a passing run removes them: ${writeAt > 0 && throwAt > writeAt} · ${removes}`) }

// a record, as the coast step writes it
const nets = { water: { n: 1, m2: 0.5, pieces: [{ key: 'aaaa', side: 'definition only', m2: 0.5, at: [1, 2] }] }, decks: { n: 0, m2: 0, pieces: [] } }
const reads = { 'cartograph/bake-coast.mjs': 'h1', 'cartograph/data/x/clean/overlay.json': 'h2' }, rec = residualRecord({ nets, reads })

// (b) the server's ask, from its own source (serve.js is never imported: it starts the server)
const askSrc = (s) => { const a = s.indexOf('const sameReads = (a, b) =>'), b = s.indexOf('\n}\n', s.indexOf('function coastResidualAsk(scene) {')) + 2; return s.slice(a, b) }
const askOf = (code, file, now, tolFile = file + '.no-tolerance') => new Function('existsSync', 'readFileSync', 'pendingPathOf', 'tolerancePathOf', 'coastReadsOf', 'recordIdentity', `${code}; return coastResidualAsk`)(existsSync, readFileSync, () => file, () => tolFile, () => now, recordIdentity)
{ const dir = mkdtempSync(join(tmpdir(), 'coast-ask-')), f = join(dir, 'pending.json')
  try { writeFileSync(f, JSON.stringify(rec))
    const ask = askOf(askSrc(sv), f, reads)('x'), stale = askOf(askSrc(sv), f, { ...reads, 'cartograph/bake-coast.mjs': 'h9' })('x'), none = askOf(askSrc(sv), join(dir, 'nope.json'), reads)('x')
    row(!!ask && ask.identity === recordIdentity(rec) && ask.n === 1 && ask.pieces[0].path === 'water' && ask.pieces[0].key === 'aaaa' && stale === null && none === null,
      `(b) the ask: a matching record → ${ask ? `${ask.n} piece(s), identity ${ask.identity.slice(0, 8)}` : 'NULL'} · stale reads → ${stale === null ? 'null' : 'ASKED'} · no record → ${none === null ? 'null' : 'ASKED'}`)
    const M = askOf(askSrc(sv).replace('if (!sameReads(rec.reads, coastReadsOf(scene))) return null', ''), f, { ...reads, 'cartograph/bake-coast.mjs': 'h9' })('x')
    row(M !== null, `(b) mutant: the reads test removed → a stale record is ${M ? 'ASKED about, RED as it must be' : 'still null — the row cannot see it'}`)
    // a piece the town already signed says so: its key in the tolerance (the same path), and only there
    const t = join(dir, 'tol.json'); writeFileSync(t, JSON.stringify({ signedAt: '2026-10-29T00:00:00Z', water: { sites: [{ key: 'aaaa' }] }, decks: { sites: [{ key: 'aaaa' }] } }))
    const S = askOf(askSrc(sv), f, reads, t)('x'); writeFileSync(t, JSON.stringify({ water: { sites: [{ key: 'bbbb' }] } })); const U = askOf(askSrc(sv), f, reads, t)('x')
    row(S.pieces[0].signed === true && S.signedAt === '2026-10-29T00:00:00Z' && U.pieces[0].signed === false && ask.pieces[0].signed === false,
      `(b) a signed piece: its key in the tolerance → signed ${S.pieces[0].signed} · another key → ${U.pieces[0].signed} · no tolerance → ${ask.pieces[0].signed}`)
  } finally { rmSync(dir, { recursive: true, force: true }) } }
{ const coastStep = sv.slice(sv.indexOf("try { await runIfDirty('coast'"), sv.indexOf("try { await runIfDirty('coast'") + 500)
  row(/const ask = P\.cancel \? null : coastResidualAsk\(bakeScene\)/.test(coastStep) && /if \(!ask\) throw e/.test(coastStep) && /res\.writeHead\(428/.test(coastStep) && /coastResidual: ask/.test(coastStep),
    `(b) the coast step's failure answers 428 with the pieces only when coastResidualAsk has them; any other failure stays a failure`) }

// (c) the accept route
{ const a = sv.indexOf("path.match(/^\\/looks\\/([^/]+)\\/coast-residual\\/accept$/)"), route = a >= 0 ? sv.slice(a, sv.indexOf('\n    return\n  }', a)) : ''
  const guard = route.indexOf('if (!ask || ask.identity !== identity) return send(409'), write = route.indexOf('writeFileSync(tol,'), rm = route.indexOf('rmSync(pendingPathOf(scene)'), commit = route.indexOf('git commit -m ${JSON.stringify(msg)} -- ${rel}')
  const fromPending = /const rec = JSON\.parse\(readFileSync\(pendingPathOf\(scene\)/.test(route), says = /signed in Stage by the operator/.test(route)
  row(guard > 0 && write > guard && rm > write && commit > rm && fromPending && says, `(c) the accept signs only on the card's identity (${guard > 0}), from the pending record (${fromPending}), then removes it and commits that one path, saying the operator signed it in Stage (${commit > rm && says})`)
  const mut = route.replace('if (!ask || ask.identity !== identity) return send(409', 'if (false) return send(409')
  row(!(mut.indexOf('if (!ask || ask.identity !== identity) return send(409') > 0), `(c) mutant: the identity guard removed → the row's guard test ${mut.indexOf('if (!ask || ask.identity !== identity)') > 0 ? 'still passes — it cannot see it' : 'fails, RED as it must be'}`) }

// (d) the signature is a coast-step input, and deleting it re-judges
{ const paths = { raw: '/r', clean: '/t/data/x/clean', boundary: '/b', geography: '/g', skeleton: '/s', overlay: '/o' }
  const coast = pourSteps('lafayettesquare', paths, '/rb', { elevation: false }).find(s => s.label === 'coast')
  const listed = coast.inputs.includes(join('/t/data/x', TOLERANCE_FILE))
  const dir = mkdtempSync(join(tmpdir(), 'coast-tol-')), tol = join(dir, TOLERANCE_FILE)
  try { writeFileSync(tol, JSON.stringify(rec)); const was = contentRecord([tol]); rmSync(tol); const now = contentRecord([tol])
    const differs = Object.keys({ ...was, ...now }).some(k => was[k] !== now[k])
    row(listed && differs, `(d) the town's ${TOLERANCE_FILE} is a coast-step input (${listed}); deleting it changes the step's recorded reads, so the Bake re-judges (${differs})`)
  } finally { rmSync(dir, { recursive: true, force: true }) } }

// (e) the card explains or goes away (Jacob, on Huron's first card: "I looked but have no idea what I'm looking at")
{ const card = bm.slice(bm.indexOf('function CoastResidualCard'), bm.indexOf('// Modal overlay shown while'))
  const scale = /The largest is \{sizeOf\(big\)\}; all \{n\} together come to/.test(card) && card.indexOf('The largest is') < card.indexOf('The coast step smooths')
  const plain = /the exact calculation has \$\{what\} here that the coast doesn't/.test(bm) && /the coast has \$\{what\} here that the exact calculation doesn't/.test(bm) && !/\{w\.side\}/.test(card)
  const signedSaid = /w\.signed \? ' · signed'/.test(card) && /has signed none of them before/.test(card), click = /Click a row to see it on the map/.test(card)
  const todo = /If none of them is a real change to the shore, accept them: that signs them for/.test(card), one = (card.match(/acceptCoastResidual\(\)/g) || []).length === 1, frames = /frameRequest: \{ x: w\.at\[0\], z: w\.at\[1\]/.test(bm)
  const store = /acceptCoastResidual: async \(\) => \{/.test(st) && /apiAcceptCoastResidual\(get\(\)\.activeLookId, cr\.identity\)/.test(st)
  row(scale && plain && signedSaid && click && todo && one && frames && store, `(e) the card leads with the scale (${scale}), says which side has what in plain words, never the raw side (${plain}), marks what the town signed (${signedSaid}), says a row can be clicked (${click}), the one thing to do (${todo}), frames each piece (${frames}), and has ONE accept, the store's, sending the card's identity (${one && store})`)
  // the pixels are DERIVED: the near plane and the orbit's closest dolly read from their homes, the lens from the town's keyframes
  const derived = /Math\.max\(TOWN_CAMERA_NEAR_M, REGIMES\.playback\.minDistance\)/.test(bm) && /\(keys \|\| \[\]\)\.map\(k => k\.fov\)/.test(bm) && /camera: \{ near: TOWN_CAMERA_NEAR_M \}/.test(src('src/lib/qualityProfile.js'))
  row(derived, `(e) "how many pixels at the closest camera" is derived: the town canvas's near plane (qualityProfile.js#TOWN_CAMERA_NEAR_M, the one the canvas uses), the movie orbit's closest dolly (REGIMES.playback) and the narrowest keyframe lens (${derived})`) }

// (g) a piece's size is the piece's: its length (its outer ring's farthest two vertices) and its widest point (the deepest erode it
// survives), carried by the record, never into coast.json
{ const { spanOf, wideOf, ip } = await import('../cartograph/openCloseJudge.mjs')
  const sq = spanOf([{ X: 0, Y: 0 }, { X: 3000, Y: 0 }, { X: 3000, Y: 4000 }, { X: 0, Y: 4000 }]), wd = wideOf(ip([[[0, 0], [3e6, 0], [3e6, 6000], [0, 6000]]]), 3e6), carried = rec.water.sites[0].span === undefined && residualRecord({ nets: { ...nets, water: { ...nets.water, pieces: [{ ...nets.water.pieces[0], span: 0.12, wide: 0.006 }] } }, reads }).water.sites[0].wide === 0.006
  const kept = /largest: w \? \{ key: w\.key, side: w\.side, m2: w\.m2, at: w\.at \} : null/.test(bc)
  row(sq === 5000 && Math.abs(wd - 6000) <= 20 && carried && kept, `(g) spanOf a 3 × 4 rectangle → ${sq} (5000); wideOf a 3 m × 6 mm strip → ${(wd / 1000).toFixed(2)} mm (6, to the bisection's step); the record carries a piece's span and width (${carried}); coast.json's largest leaves it out, so its bytes and everything downstream stay put (${kept})`) }

// (f) no bake-anyway
{ const writers = []
  for (const f of ['cartograph/bake-coast.mjs', 'cartograph/sign-coast-residual.mjs', 'cartograph/serve.js']) { const s = src(f)
    for (const m of s.matchAll(/(writeFileSync|writeIfChanged)\((tolPath|tol)\b/g)) writers.push(`${f}:${m[1]}(${m[2]})`) }
  const ok = writers.length === 3 && writers.includes('cartograph/bake-coast.mjs:writeIfChanged(tolPath)') && writers.includes('cartograph/sign-coast-residual.mjs:writeFileSync(tolPath)') && writers.includes('cartograph/serve.js:writeFileSync(tol)')
  // a SWITCH, not the word (the comments say there is none): a URL flag, a CLI flag or an environment variable that would pass the net
  const noFlag = !/([?&](anyway|skip-net|accept)=1|argv\.includes\('--(anyway|skip-net|no-net)'\)|process\.env\.[A-Z_]*(ANYWAY|RESIDUAL|NET)\b)/.test(bc + sv)
  row(ok && noFlag, `(f) the tolerance is written only by the step's tightening, sign-coast-residual --accept and the accept route (${writers.join(' · ')}), and there is no bake-anyway switch (${noFlag})`) }

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the coast residual is signed in Stage')
process.exit(red ? 1 : 0)
