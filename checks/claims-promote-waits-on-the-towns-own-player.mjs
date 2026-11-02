#!/usr/bin/env node
/**
 * "DOES PROMOTE WAIT ON THE TOWN'S OWN PLAYER, AND ONLY ON IT?" (Boz, 2026-11-01: Preview gated Promote on the legacy
 * player's build marker, staging/player/build.json, so Jacob pressed "Publish player" to unblock a Promote for a build no
 * visitor runs. Every town plays the Ward.)
 *
 *   1. THE ANSWER, RUN: src/lib/stagingPlayer.js#stagingPlayerOf on a PLANTED bucket.
 *      · a "ward" record, the Ward pointer, its build's index.html and its kit bundle → current, naming both commits;
 *      · the same with NO legacy build marker → still current, and the legacy player's keys are never asked;
 *      · a record naming the retired "legacy" player, no record, no Ward pointer, a pointer without two commits, no kit
 *        bundle, no build document → each refuses, naming the key.
 *   2. ONE ANSWER, READ: Preview's status (serve.js GET …/publish/status), the Promote gate (PreviewApp's `prodWhy`) and
 *      promote-player-to-prod all ask stagingPlayerOf; nothing in serve.js or Preview reads `staging/player/`.
 *
 * Usage: node checks/claims-promote-waits-on-the-towns-own-player.mjs [--mutants]
 *   --mutants: the gate reading staging/player for a ward town → 1 · a legacy record served as the Ward → 1 · the kit
 *   bundle unasked → 1 · Preview's Promote not waiting on the town's player → 2 · serve.js back on the legacy marker → 2.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const W = 'a'.repeat(40), K = 'b'.repeat(40)
const BASE = { 'staging/sites/t/player.json': { player: 'ward' }, 'staging/ward/current.json': { sha: W, kit: K },
  [`staging/ward/${W}/index.html`]: '<html>', [`staging/kit/${K}/manifest.json`]: { kit: K } }

async function answer(transform) {
  const fails = []
  const P = await importSource('src/lib/stagingPlayer.js', transform ? { transform } : {})
  const ask = async (bucket) => {
    const asked = []
    const io = { json: async (k) => { asked.push(k); return k in bucket ? bucket[k] : null }, exists: async (k) => { asked.push(k); return k in bucket } }
    return { r: await P.stagingPlayerOf('t', io), asked }
  }
  const ok = await ask(BASE)
  if (!ok.r.current || ok.r.ward !== W || ok.r.kit !== K) fails.push(`a ward town with its Ward build and kit bundle on staging is not current (${JSON.stringify(ok.r)})`)
  if (ok.asked.some((k) => k.startsWith('staging/player/'))) fails.push(`the town's player reads the retired legacy player (${ok.asked.filter((k) => k.startsWith('staging/player/')).join(', ')})`)
  const refuses = [
    ['a record naming the retired legacy player', { ...BASE, 'staging/sites/t/player.json': { player: 'legacy' } }, /retired player \(legacy\)/],
    ['no record', Object.fromEntries(Object.entries(BASE).filter(([k]) => !k.endsWith('player.json'))), /names no player — nothing at staging\/sites\/t\/player\.json/],
    ['no Ward pointer', Object.fromEntries(Object.entries(BASE).filter(([k]) => k !== 'staging/ward/current.json')), /nothing at staging\/ward\/current\.json/],
    ['a pointer without two commits', { ...BASE, 'staging/ward/current.json': { sha: W } }, /must name a Ward commit/],
    ['no kit bundle', Object.fromEntries(Object.entries(BASE).filter(([k]) => !k.startsWith('staging/kit/'))), new RegExp(`staging/kit/${K}/manifest\\.json`)],
    ['no build document', Object.fromEntries(Object.entries(BASE).filter(([k]) => !k.endsWith('index.html'))), /has no index\.html/],
  ]
  for (const [what, bucket, said] of refuses) {
    const { r } = await ask(bucket)
    if (r.current || !said.test(r.why || '')) fails.push(`${what}: not refused by name (${JSON.stringify(r)})`)
  }
  return fails
}

function oneAnswer(src = {}) {
  const fails = [], serve = src.serve ?? sourceOf('cartograph/serve.js'), preview = src.preview ?? sourceOf('src/preview/PreviewApp.jsx'), promote = sourceOf('scripts/promote-player-to-prod.mjs')
  const status = serve.slice(serve.indexOf("path.match(/^\\/looks\\/([^/]+)\\/publish\\/status$/)"), serve.indexOf("path.match(/^\\/looks\\/([^/]+)\\/publish$/)"))
  if (!/player = await stagingPlayerOf\(sites\.mapId, assetIO\)/.test(status)) fails.push("serve.js's publish status does not answer the town's player with stagingPlayerOf")
  if (/staging\/player\//.test(serve)) fails.push('serve.js still reads the retired legacy player (staging/player/)')
  if (!/const playerCurrent = status\.player\?\.current === true/.test(preview) || !/!playerCurrent \? `Staging's player is not ready/.test(preview)) fails.push("Preview's Promote does not wait on the town's own player (status.player.current)")
  if (/staging\/player\/|\bstagingPlayer\s*=/.test(preview)) fails.push('Preview still reads the retired legacy player')
  if (!/const p = await stagingPlayerOf\(map, io\)/.test(promote)) fails.push('promote-player-to-prod does not ask stagingPlayerOf which player the town plays')
  return fails
}

const fails = [...await answer(), ...oneAnswer()]
for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? '\n⛔ RED — Promote does not wait on the town\'s own player alone' : '✅ Promote waits on the town\'s own player: its record, its Ward build, its kit bundle; never the retired legacy player')
let bad = fails.length ? 1 : 0

if (process.argv.includes('--mutants')) {
  const must = (from, to) => (t) => { if (!t.includes(from)) throw new Error(`[mutant] anchor gone: ${from.slice(0, 70)}`); return t.replace(from, to) }
  const serve = sourceOf('cartograph/serve.js'), preview = sourceOf('src/preview/PreviewApp.jsx')
  const M = [
    ['the gate reading staging/player for a ward town', () => answer(must("  const pointerKey = `${WARD_PREFIX}current.json`", "  if (!(await io.exists('staging/player/build.json'))) return { current: false, why: 'the legacy player is not published' }\n  const pointerKey = `${WARD_PREFIX}current.json`"))],
    ['a legacy record served as the Ward', () => answer((t) => must("  if (rec.player === 'legacy') return", "  if (false) return")(t).replace("if (rec.player !== 'ward')", "if (rec.player !== 'ward' && rec.player !== 'legacy')"))],
    ['the kit bundle unasked', () => answer(must("  if (!(await io.exists(bundleKey))) return", "  if (false) return"))],
    ["Preview's Promote not waiting on the town's player", () => oneAnswer({ preview: must("!playerCurrent ? `Staging's player is not ready", "false ? `Staging's player is not ready")(preview) })],
    ['serve.js back on the legacy marker', () => oneAnswer({ serve: serve.replace('const assetIO = {', "const LEGACY = 'staging/player/build.json'\nconst assetIO = {") })],
  ]
  for (const [name, go] of M) { const f = await go(); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f[0].slice(0, 100)})` : ''}`); if (!f.length) bad = 1 }
}
process.exit(bad)
