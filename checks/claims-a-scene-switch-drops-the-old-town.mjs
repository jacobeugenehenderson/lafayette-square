#!/usr/bin/env node
// CLAIM — A SCENE SWITCH DROPS THE OLD TOWN, AND ITS DESIGN SAVES TO THE NEW TOWN'S OWN LOOK.
//
// 2026-09-25: Extent's openScene called `setScene`, which cleared three keys and loaded nothing — the old town's
// streets stayed on screen, and the old town's Look stayed ACTIVE, so the next Designer edit autosaved into the
// other town's design.json. `setScene` is now the one switch path. ⭐ READS THE SOURCE, DOES NOT RESTATE IT: the
// per-scene key list is lifted from the loaders' own set() calls, so a key a loader starts writing tomorrow is
// judged without editing this file. ASSERTS, against src/cartograph/stores/useCartographStore.js:
//   A · every key the scene loaders (_loadCenterlinesImpl, _loadMeasurements, _loadMarkers) set() is reset by
//       setScene's set() — the design via `...hydrateDesign(`, which covers every DESIGN_FIELDS key;
//   B · setScene un-hydrates (`_designHydrated: false`, so neither autosave fires mid-switch), picks the Look with
//       `lookForScene`, and calls all three loaders;
//   C · each loader re-reads the scene after its await and bails if it moved (else a slow load lands in the new town);
//   D · setActiveLook's cross-scene branch goes through setScene;
//   E · no other set()/setState() in src/ writes `scene` (one switch path) — except _loadLooks' cold-boot fill.
//
//   node checks/claims-a-scene-switch-drops-the-old-town.mjs [--store=path]
//
// MUTATIONS (each must go red; run on a scratch copy via --store):
//   · delete `measurements: [],` from setScene                              ⇒ A names `measurements`
//   · change `_designHydrated: false` to `true` in setScene                 ⇒ B
//   · delete the `if (get().scene !== scene) return` line from _loadMarkers   ⇒ C names _loadMarkers
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const storeP = process.argv.find(a => a.startsWith('--store='))?.slice(8) || join(ROOT, 'src/cartograph/stores/useCartographStore.js')
// line comments out first: they hold commas and brackets that would split a set() literal's keys
const uncomment = (s) => s.replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const SRC = uncomment(readFileSync(storeP, 'utf8'))
const bad = []

// the body of `name: async (...) => {…}` or `name: (...) => {…}` in the store object, by brace matching
function member(name) {
  const m = new RegExp(`^\\s{2}${name}: (async )?\\([^)]*\\) => \\{`, 'm').exec(SRC)
  if (!m) return null
  let i = m.index + m[0].length - 1
  for (let d = 0, j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') d++
    else if (SRC[j] === '}' && --d === 0) return SRC.slice(i, j + 1)
  }
  return null
}
// top-level keys of every `set({…})` object literal in a body (`...x(` spreads kept as `...x`)
function setKeys(body) {
  const keys = new Set()
  for (const m of body.matchAll(/\b(?:set|setState)\(\{/g)) {
    let i = m.index + m[0].length, d = 1, tok = ''
    for (; i < body.length && d > 0; i++) {
      const c = body[i]
      if ('{[('.includes(c)) d++
      else if ('}])'.includes(c)) d--
      if (d === 1 && c === ',') { add(tok); tok = '' } else if (d >= 1) tok += c
    }
    add(tok)
  }
  function add(t) {
    t = t.trim(); if (!t) return
    const sp = /^\.\.\.\s*([\w$.]+)/.exec(t); if (sp) { keys.add('...' + sp[1]); return }
    const k = /^([\w$]+)\s*(:|$)/.exec(t); if (k) keys.add(k[1])
  }
  return keys
}

// index of the `)` closing the call that starts at 0
const closeAt = (s) => { for (let i = s.indexOf('('), d = 0; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')' && --d === 0) return i } return s.length - 1 }

const LOADERS = ['_loadCenterlinesImpl', '_loadMeasurements', '_loadMarkers']
// Status flags a loader writes that are not town data. _designHydrated is judged by B instead.
const NOT_TOWN_DATA = { _designHydrated: 'judged by B', overlaySaveBlocked: 'the save-blocked alarm, not data' }
const bodies = Object.fromEntries([...LOADERS, 'setScene', 'setActiveLook', '_loadLooks'].map(n => [n, member(n)]))
for (const [n, b] of Object.entries(bodies)) if (!b) bad.push(`the store no longer declares \`${n}\` — this check cannot read it`)

if (!bad.length) {
  const reset = setKeys(bodies.setScene)
  // A
  const written = new Map()
  for (const n of LOADERS) for (const k of setKeys(bodies[n])) if (!(k in NOT_TOWN_DATA)) written.set(k, [...(written.get(k) || []), n])
  for (const [k, by] of written) {
    const covered = k.startsWith('...hydrateDesign') ? reset.has('...hydrateDesign') : reset.has(k)
    if (!covered) bad.push(`A · \`${k}\` is written by ${by.join(', ')} but setScene does not reset it — the old town's value survives a switch`)
  }
  // B
  if (!/_designHydrated:\s*false/.test(bodies.setScene)) bad.push('B · setScene does not set `_designHydrated: false` — an autosave can fire mid-switch with the old town\'s state')
  if (!/lookForScene\(/.test(bodies.setScene) || !reset.has('activeLookId')) bad.push('B · setScene does not re-pick the Look with lookForScene — the old town\'s Look stays active and the next edit saves into it')
  for (const n of ['_loadCenterlines', '_loadMeasurements', '_loadMarkers']) if (!new RegExp(`\\.${n}\\(\\)`).test(bodies.setScene)) bad.push(`B · setScene does not call ${n}() — the new town's data never loads`)
  // C
  for (const n of LOADERS) if (!/get\(\)\.scene !== scene|stale\(\)/.test(bodies[n]) || !/const scene = get\(\)\.scene/.test(bodies[n])) bad.push(`C · ${n} does not re-check the scene after its await — a slow load lands in whichever town is open when it returns`)
  // D
  if (!/setScene\(/.test(bodies.setActiveLook)) bad.push('D · setActiveLook switches scene without going through setScene')
  // E
  const files = []
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f)) files.push(p) } }
  walk(join(ROOT, 'src'))
  const allowed = [bodies.setScene, bodies._loadLooks]
  for (const p of files) {
    const s = p === join(ROOT, 'src/cartograph/stores/useCartographStore.js') ? SRC : uncomment(readFileSync(p, 'utf8'))
    for (const m of s.matchAll(/\b(?:set|setState)\(\{/g)) {
      const call = s.slice(m.index, m.index + 4000)
      if (!setKeys(call.slice(0, closeAt(call) + 1)).has('scene')) continue
      if (allowed.some(b => b.includes(call.slice(0, closeAt(call) + 1)))) continue
      bad.push(`E · ${p.slice(ROOT.length)}:${s.slice(0, m.index).split('\n').length} writes \`scene\` outside setScene`)
    }
  }
  console.log(`per-scene keys the loaders write: ${[...written.keys()].join(' · ')}`)
  console.log(`not judged as town data: ${Object.entries(NOT_TOWN_DATA).map(([k, v]) => `${k} (${v})`).join(' · ')}`)
}
for (const b of bad) console.log(`⛔ ${b}`)
console.log(bad.length ? '\n⛔ A scene switch can carry the old town into the new one.' : '\n✅ A scene switch drops the old town, and its design saves to the new town\'s own Look.')
process.exit(bad.length ? 1 : 0)
