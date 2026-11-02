#!/usr/bin/env node
/**
 * "DOES PUBLISH ONLY PUBLISH — AND DOES EVERY STEP HAVE ONE BUTTON, IN ONE PLACE?" (Jacob, 2026-11-01: "we should start really
 * conceptualizing the Cartograph as having 3 discrete functions: Stage, Preview, and Publish"; Boz's rulings.)
 * Preview inspects the exact deliverable, so a Publish-time Foundry run ships a Slab nobody previewed.
 *   A. THE GUARD, RUN — serve.js#foundryOwed, on planted state: the Foundry running for the Look, or Extent pouring its scene, is
 *      owed; the Foundry's own plan (its GET route) naming steps is owed; a plan that cannot be read is owed (unknown is never
 *      "nothing"); an empty plan is nothing owed.
 *   B. THE ROUTE, READ — POST …/publish asks foundryOwed FIRST (before git and before any upload) and answers 409 { owed } with
 *      "Run the Foundry first", running nothing; it runs no Foundry step itself; foundryOwed asks the plan route (a GET).
 *   C. PREVIEW, READ — publishStaging sends only the publish request (no /bake, no repour); the button is off while the Foundry
 *      owes anything, saying "Run the Foundry first", with a way to Stage.
 *   D. THE PRESS IS THE CONSENT, READ — the Foundry's 428 asks only the held pour's question (lsAsks), never a code change's.
 *   E. EXTENT ENDS AT ITS OWN WORK, READ — ExtentApp runs no pour and no Foundry (no pourMap, no bakeLook, no repour question).
 *   F. THE STREET LAYOUT IS REPORTED BY THE FOUNDRY (Zob) — RUN: promoteDiffOf reads a PROMOTE-DIFF line; streetLayoutOf gives
 *      three outcomes; serve.js#runStep hands a step's lines to its `onLine`; BakeModal#streetLayoutWords says each. READ: the
 *      Foundry's promote-ribbons step reads its lines through promoteDiffOf and the response carries streetLayout.
 * Usage: node checks/claims-publish-only-publishes.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const uncomment = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')

// ── A ──
async function guard(transform) {
  const fails = []
  const G = await importSource('cartograph/serve.js', { span: { functions: ['foundryOwed'] }, suffix: '\nexport { foundryOwed }', ...(transform ? { transform } : {}),
    prefix: "const _bakesInFlight = { has: (k) => globalThis.__bif.has(k) }, _seedsInFlight = { has: (k) => globalThis.__sif.has(k) }, PORT = 1\nconst readLooksIndex = () => ({ looks: [{ id: 'a-look', scene: 'a-scene' }] })\nconst fetch = (...a) => globalThis.__fetch(...a)" })
  const asked = []
  const plan = (status, body) => { globalThis.__fetch = async (url, o) => { asked.push([url, o?.method || 'GET']); return { ok: status === 200, status, json: async () => body } } }
  const run = async (bif = [], sif = []) => { globalThis.__bif = new Set(bif); globalThis.__sif = new Set(sif); return G.foundryOwed('a-look') }
  try {
    plan(200, { stale: [] })
    let o = await run(['a-look'])
    if (!o.length) fails.push('A · the Foundry running for the Look is not owed: Publish would ship a Slab being rewritten')
    o = await run([], ['a-scene'])
    if (!o.length) fails.push('A · Extent pouring the scene is not owed')
    plan(200, { stale: [{ step: 'ground', why: ['x'] }] })
    o = await run()
    if (o[0]?.step !== 'ground') fails.push(`A · the Foundry's plan naming a step is not owed (${JSON.stringify(o)})`)
    if (!asked.every(([u, m]) => /\/looks\/a-look\/bake$/.test(u) && m === 'GET')) fails.push(`A · foundryOwed does not ask the Foundry's own plan route, a GET (${JSON.stringify(asked)})`)
    plan(500, { error: 'boom' })
    o = await run()
    if (!o.length) fails.push("A · a plan that cannot be read is read as nothing owed (unknown is never 'nothing')")
    plan(200, { stale: [] })
    o = await run()
    if (o.length) fails.push(`A · an empty plan is owed (${JSON.stringify(o)})`)
  } finally { delete globalThis.__fetch; delete globalThis.__bif; delete globalThis.__sif }
  return fails
}

// ── B ──
function route(serve) {
  const fails = [], a = serve.indexOf("path.match(/^\\/looks\\/([^/]+)\\/publish$/)"), b = serve.indexOf('// POST /looks/<id>/promote', a)
  const r = uncomment(serve.slice(a, b))
  const owed = r.indexOf('const owed = await foundryOwed(id)'), git = r.indexOf('git fetch origin'), up = r.search(/upload-baked-to-r2|publishSlab\(|runCapture\(`git commit/)
  if (owed < 0) fails.push('B · the publish route does not ask foundryOwed')
  else if ((git >= 0 && git < owed) || (up >= 0 && up < owed)) fails.push('B · the publish route asks foundryOwed AFTER git or an upload')
  if (!/if \(owed\.length\) \{[\s\S]{0,400}res\.writeHead\(409[\s\S]{0,400}Run the Foundry first[\s\S]{0,300}return\s*\}/.test(r)) fails.push('B · an owed step does not answer 409 "Run the Foundry first" and return')
  if (/runStep\(|runIfDirty\(|\/bake\b[^\n]*method: 'POST'|bakeLook\(/.test(r)) fails.push('B · the publish route runs the Foundry itself')
  return fails
}

// ── C ──
function preview(p) {
  const fails = [], a = p.indexOf('async function publishStaging('), b = p.indexOf('async function promoteProd(', a)
  const pub = p.slice(a, b)
  if (/\/bake\b|repour/.test(uncomment(pub))) fails.push("C · Preview's Publish runs the Foundry or asks to re-pour")
  if (!/fetch\(`\$\{API\}\/publish`, \{ method: 'POST' \}\)/.test(pub)) fails.push("C · Preview's Publish does not send the publish request")
  if (!/const foundryOwed = bakeOwed/.test(p) || !/disabled=\{!!busy \|\| stagingDone \|\| foundryOwed\}/.test(p)) fails.push('C · the Publish button is not off while the Foundry owes a step')
  if (!/Run the Foundry first/.test(p) || !/Run the Foundry in Stage →/.test(p) || !/stagePath\(/.test(p)) fails.push('C · the Publish row does not say "Run the Foundry first" with a way to Stage')
  if (/\brepour\b|confirmRepour/.test(uncomment(p))) fails.push("C · Preview still carries a re-pour question")
  return fails
}

// ── D ──
function consent(serve) {
  const fails = []
  if (!/else if \(lsAsks\.length && !repourConfirmed\) \{/.test(serve)) fails.push("D · the Foundry's 428 is not the held pour's question alone")
  if (/\(codeNewer\.length \|\| lsAsks\.length\) && !repourConfirmed/.test(serve)) fails.push('D · a code change asks again before the Foundry runs (the press is the consent)')
  if (!/\.\.\.\(lsAsks\.length && \{ repour: true \}\)/.test(serve)) fails.push("D · the plan marks a re-pour question that the Foundry no longer asks")
  return fails
}

// ── E ──
function extent(x) {
  const fails = [], c = uncomment(x)
  for (const [re, what] of [[/\bpourMap\b/, 'pourMap'], [/\bbakeLook\b/, 'bakeLook'], [/\brepourAsk\b/, 'a repour question']]) if (re.test(c)) fails.push(`E · Extent still runs ${what}: Extent ends at its own work`)
  if (!/Run the Foundry in Stage →/.test(x)) fails.push('E · Extent does not point to the Foundry in Stage when it has saved')
  return fails
}

// ── F ──
async function street(t = {}) {
  const fails = []
  const P = await importSource('cartograph/pourSteps.mjs', t.ps ? { transform: t.ps } : {})
  const d = P.promoteDiffOf('PROMOTE-DIFF {"streets":[40,42]}')
  if (JSON.stringify(d) !== '{"streets":[40,42]}' || P.promoteDiffOf('promote changes x') !== undefined) fails.push('F · promoteDiffOf does not read the PROMOTE-DIFF line (and only it)')
  const outs = [P.streetLayoutOf(false, null), P.streetLayoutOf(true, { streets: [40, 42] }), P.streetLayoutOf(true, null)]
  if (!outs[0]?.skipped || !outs[1]?.changed || !outs[2]?.unchanged) fails.push(`F · streetLayoutOf does not give three outcomes (${JSON.stringify(outs)})`)
  const S = await importSource('cartograph/serve.js', { span: { functions: ['runStep'] }, suffix: '\nexport { runStep }', ...(t.step ? { transform: t.step } : {}),
    prefix: "const markStep = (P, label, state, extra) => ({ ...extra })\nconst runShell = async (cmd, o) => { for (const l of globalThis.__lines) o.onLine(l) }" })
  globalThis.__lines = ['promote changes x', 'PROMOTE-DIFF {"faces":[3,4]}']
  let got
  try { await S.runStep({ plan: null, cancel: null }, 'promote-ribbons', 'x', { onLine: (l) => { const v = P.promoteDiffOf(l); if (v !== undefined) got = v } }) } finally { delete globalThis.__lines }
  if (JSON.stringify(got) !== '{"faces":[3,4]}') fails.push("F · serve.js#runStep does not hand a step's output lines to its onLine")
  const serve = t.serve ?? sourceOf('cartograph/serve.js')
  if (!/'promote-ribbons'[^\n]*\n\s*onLine: \(l\) => \{ const d = promoteDiffOf\(l\); if \(d !== undefined\) promoteDiff = d \}/.test(serve)) fails.push("F · the Foundry's promote-ribbons step does not read its PROMOTE-DIFF line")
  if (!/const streetLayout = streetLayoutOf\(ranSteps\.includes\('promote-ribbons'\), promoteDiff\)/.test(serve) || !/ran: ranSteps, skipped, force, streetLayout \}/.test(serve)) fails.push("F · the Foundry's response does not carry the street layout")
  const B = await importSource('src/cartograph/BakeModal.jsx', { span: { functions: ['streetLayoutWords'] }, suffix: '\nexport { streetLayoutWords }' })
  const w = [B.streetLayoutWords({ changed: { streets: [40, 42] } }), B.streetLayoutWords({ unchanged: true }), B.streetLayoutWords({ skipped: 'not owed' }), B.streetLayoutWords({ unknown: true })]
  if (!/streets 40→42/.test(w[0]) || !/unchanged/.test(w[1]) || !/not re-made/.test(w[2]) || !/⛔/.test(w[3])) fails.push(`F · BakeModal does not say each outcome (${JSON.stringify(w)})`)
  const modal = sourceOf('src/cartograph/BakeModal.jsx'), store = sourceOf('src/cartograph/stores/useCartographStore.js')
  if (!/bakeStreetLayout: r\.streetLayout \?\? \{ unknown: true \}/.test(store) || !/streetLayoutWords\(streetLayout\)/.test(modal)) fails.push("F · Stage does not keep and show the Foundry's street-layout report")
  return fails
}

const texts = () => ({ serve: sourceOf('cartograph/serve.js'), preview: sourceOf('src/preview/PreviewApp.jsx'), extent: sourceOf('src/cartograph/ExtentApp.jsx') })
async function verdict(m = {}) {
  const T = texts(); const s = m.serve ? m.serve(T.serve) : T.serve
  return [...await guard(m.guard), ...route(s), ...preview(m.preview ? m.preview(T.preview) : T.preview), ...consent(s), ...extent(m.extent ? m.extent(T.extent) : T.extent), ...await street({ ps: m.ps, step: m.step, serve: s })]
}
const fails = await verdict()
for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? '\n⛔ RED — Publish does more than publish, or a step has two buttons' : '✅ Publish only publishes: it runs nothing, refuses while the Foundry owes a step, and the Foundry reports the street layout')
let bad = fails.length ? 1 : 0
if (process.argv.includes('--mutants')) {
  const must = (from, to) => (t) => { if (!t.includes(from)) throw new Error(`[mutant] anchor gone: ${from.slice(0, 70)}`); return t.replace(from, to) }
  const M = [
    ['the publish route calls the Foundry', { serve: must('      const owed = await foundryOwed(id)\n', "      await fetch(`http://127.0.0.1:${PORT}/looks/${id}/bake`, { method: 'POST' })\n      const owed = await foundryOwed(id)\n") }],
    ['the guard removed', { serve: must('      const owed = await foundryOwed(id)\n', '      const owed = []\n') }],
    ['the Foundry running not owed', { guard: must("  if (_bakesInFlight.has(id)) return [{ step: null, why: ['the Foundry is running for this Look'] }]\n", '') }],
    ['an unreadable plan read as nothing owed', { guard: must("  if (!r.ok) return [{ step: null, why:", '  if (!r.ok) return []; void [{ step: null, why:') }],
    ["Preview's Foundry run back", { preview: must("      const pub = await fetch(`${API}/publish`, { method: 'POST' })", "      await fetch(`${API}/bake`, { method: 'POST' })\n      const pub = await fetch(`${API}/publish`, { method: 'POST' })") }],
    ['a code change asks again', { serve: must('        else if (lsAsks.length && !repourConfirmed) {', '        else if ((codeNewer.length || lsAsks.length) && !repourConfirmed) {') }],
    ['Extent pours again', { extent: must('  fetchLooks, createLook, fetchBuildingFootprints,', '  pourMap, fetchLooks, createLook, fetchBuildingFootprints,') }],
    ["the promote-ribbons line not read", { serve: must('          onLine: (l) => { const d = promoteDiffOf(l); if (d !== undefined) promoteDiff = d } })', '          })') }],
    ["runStep not handing its lines on", { step: must('      if (tap) tap(ln)\n', '') }],
    ['two outcomes, not three', { ps: must(": diff && Object.keys(diff).length ? { changed: diff } : { unchanged: true })", ": diff && Object.keys(diff).length ? { changed: diff } : { skipped: 'not owed' })") }],
  ]
  for (const [name, m] of M) {
    let f
    try { f = await verdict(m) } catch (e) { f = [`threw: ${e.message}`] }
    const fresh = f.filter((x) => !fails.includes(x))
    console.log(`${fresh.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${fresh.length ? ` (${fresh[0].slice(0, 100)})` : ''}`)
    if (!fresh.length) bad = 1
  }
}
process.exit(bad)
