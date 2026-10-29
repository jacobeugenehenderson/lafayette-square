#!/usr/bin/env node
// CLAIM — THE SURVEY HERO IS RETIRED: FOCUS LIVES ONLY ON THE KEYFRAMES (BRIEF-the-arch-stands-where-it-is §3.4,
// 2026-10-28, Keystone; Jacob: "retire the 'Hero' Object from the survey and *just* add them to the keyframes").
// `heroSubject` was a town-wide designation picked in Survey: a key with no focus inherited it ('hero' was a focus id),
// and the Horizon card chose its knobs by its kind. Now:
//   (1) SOURCE: nothing reads `heroSubject` — src/, cartograph/*.{js,mjs} and checks/, comments included (a stale line
//       is read as live) — except the one-shot migration that retires it. focusObject.js knows no 'hero' id: a first key
//       with no focus has none (keyframeFocusIds starts at null) and focusChoice reads only the movie's ids.
//   (2) THE MIGRATION carries an object hero onto the first key and loses nothing: arch → 'arch', landmark → its id, a
//       first key's own focus kept, a key's 'hero' focus resolved, a null hero simply removed; a hero that is no object
//       (centroid, landscape) and an object hero with no key to carry it are REFUSED by name. ALL OR NOTHING: a run
//       with an unmigratable Look AFTER a migratable one writes nothing, and names every refusal.
//   (3) EVERY LOOK: no design.json carries `heroSubject`, and no baked scene.json carries an OBJECT hero (whose focus would
//       otherwise be lost): RED by name until `node scripts/migrate-arch-stands.mjs --write` and the re-bake. A slab's
//       `heroSubject: null` is inert and said, not failed (it leaves at the town's next bake).
//   MUTANTS (always run): a reader restored (`s.heroSubject` in a src file) → (1) RED · 'hero' back as the first key's
//   default → (1) RED · a migration that drops the hero without carrying it → (2) RED · a run that writes as it goes
//   → (2) RED.
//   node checks/claims-the-survey-hero-is-retired.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { migrateHero, runMigration } from '../scripts/archStandsMigration.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const SELF = 'checks/claims-the-survey-hero-is-retired.mjs', MIGRATION = 'scripts/migrate-arch-stands.mjs'

// (1)
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const p = join(dir, n), st = statSync(p)
  if (st.isDirectory()) { if (!/^(node_modules|_archive|dist)$/.test(n)) walk(p, out) } else if (/\.(m?js|jsx)$/.test(n)) out.push(p) } return out }
const files = [...walk(join(ROOT, 'src')), ...readdirSync(join(ROOT, 'cartograph')).filter(n => /\.(m?js)$/.test(n)).map(n => join(ROOT, 'cartograph', n)), ...walk(join(ROOT, 'checks'))]
  .map(p => relative(ROOT, p)).filter(p => p !== SELF && p !== MIGRATION)
const SRC = new Map(files.map(f => [f, readFileSync(join(ROOT, f), 'utf8')]))
const FO = 'src/lib/focusObject.js'
const judgeSource = (src) => {
  const why = []
  for (const [f, s] of src) if (/heroSubject/.test(s)) why.push(`${f} reads heroSubject`)
  const fo = src.get(FO) || '', ids = fo.slice(fo.indexOf('export function keyframeFocusIds'), fo.indexOf('\n}\n', fo.indexOf('export function keyframeFocusIds')))
  if (!/let cur = null/.test(ids)) why.push("focusObject.js: a first key without focus is not 'none'")
  if (/'hero'/.test(fo.slice(fo.indexOf('export function focusChoice')).split('\n}\n')[0].replace(/viewMode !== 'hero'/, ''))) why.push("focusObject.js#focusChoice: a 'hero' id")
  return why
}
const W = judgeSource(SRC)
row(!W.length, `(1) nothing reads the Survey hero (${files.length} files) and no 'hero' focus id remains: ${W.length ? W.join(' · ') : 'yes'}`)

// (2)
const K = (focus) => (focus === undefined ? { position: [0, 0, 0], target: [1, 0, 0], fov: 30, t: 0 } : { position: [0, 0, 0], target: [1, 0, 0], fov: 30, t: 0, focus })
const judgeMigration = (mig) => {
  const why = [], f = (d) => mig(d, 'planted')?.heroKeyframes?.map(k => k.focus ?? null)
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const cases = [
    ['arch → key 1', { heroSubject: { kind: 'arch', id: 'arch' }, heroKeyframes: [K(), K()] }, ['arch', null]],
    ['landmark → its id', { heroSubject: { kind: 'landmark', id: 'osm-1' }, heroKeyframes: [K(), K()] }, ['osm-1', null]],
    ["key 1's own focus kept", { heroSubject: { kind: 'arch', id: 'arch' }, heroKeyframes: [K('bldg-7'), K()] }, ['bldg-7', null]],
    ["a key's 'hero' resolved", { heroSubject: { kind: 'arch', id: 'arch' }, heroKeyframes: [K('bldg-7'), K('hero')] }, ['bldg-7', 'arch']],
    ['a null hero removed', { heroSubject: null, heroKeyframes: [K(), K('hero')] }, [null, null]],
  ]
  for (const [name, d, want] of cases) { let got; try { got = f(d) } catch (e) { got = `threw: ${e.message}` } if (!eq(got, want)) why.push(`${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`) }
  for (const [name, d] of [['a centroid hero', { heroSubject: { kind: 'centroid', id: 'centroid' }, heroKeyframes: [K()] }], ['an object hero with no keys', { heroSubject: { kind: 'arch', id: 'arch' } }]]) {
    let threw = false; try { mig(d, 'planted') } catch { threw = true } if (!threw) why.push(`${name}: not refused`) }
  return why
}
const M = judgeMigration(migrateHero)
const judgeAllOrNothing = (run) => {
  const looks = [{ id: 'first', design: { heroSubject: { kind: 'arch', id: 'arch' }, heroKeyframes: [K()] } },
    { id: 'second', design: { heroSubject: { kind: 'centroid', id: 'centroid' }, heroKeyframes: [K()] } },
    { id: 'third', design: { heroSubject: { kind: 'landscape', id: 'backdrop' }, heroKeyframes: [K()] } }]
  const written = []; let msg = ''
  try { run(looks, { write: true, save: (id) => written.push(id) }) } catch (e) { msg = e.message }
  const why = []
  if (written.length) why.push(`wrote ${written.join(', ')} before refusing`)
  if (!/second/.test(msg) || !/third/.test(msg)) why.push(`the refusal does not name every refused Look: "${msg.slice(0, 80)}"`)
  return why
}
const A = judgeAllOrNothing(runMigration)
row(!A.length, `(2) all or nothing: an unmigratable Look after a migratable one writes nothing, and every refusal is named: ${A.length ? A.join(' · ') : 'yes'}`)
row(!M.length, `(2) the migration carries an object hero onto key 1, keeps an own focus, resolves 'hero', refuses what it cannot carry: ${M.length ? M.join(' · ') : 'yes'}`)

// (3)
const index = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8'))
for (const { id } of index.looks) {
  const dp = join(ROOT, 'public/looks', id, 'design.json'), sp = join(ROOT, 'public/baked', id, 'scene.json')
  const d = existsSync(dp) ? JSON.parse(readFileSync(dp, 'utf8')) : null, sc = existsSync(sp) ? JSON.parse(readFileSync(sp, 'utf8')) : null
  const why = []
  if (d && 'heroSubject' in d) why.push(`design.json carries heroSubject ${JSON.stringify(d.heroSubject)} — run ${MIGRATION} --write`)
  if (sc?.heroSubject) why.push(`the baked scene.json carries the object hero ${JSON.stringify(sc.heroSubject)} — re-bake the scene`)
  if (why.length) row(false, `(3) ${id}: ${why.join(' · ')}`)
  else if (sc && 'heroSubject' in sc) console.log(`➖ (3) ${id}: the slab's scene.json still carries heroSubject: null — inert; it leaves at the next bake`)
}

// MUTANTS
const mutate = (name, ok) => row(!ok, `mutant: ${name} → ${ok ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`)
{ const m = new Map(SRC); m.set('src/stage/StageApp.jsx', SRC.get('src/stage/StageApp.jsx') + '\nconst h = useCartographStore(s => s.heroSubject)\n'); mutate('a reader restored', !judgeSource(m).length) }
{ const m = new Map(SRC); m.set(FO, SRC.get(FO).replace('let cur = null', "let cur = 'hero'")); mutate("'hero' back as the first key's default", !judgeSource(m).length) }
mutate('a run that writes as it goes', !judgeAllOrNothing((looks, { save }) => { for (const { id, design } of looks) { migrateHero(design, id); save(id) } }).length)
mutate('a migration that drops the hero without carrying it', !judgeMigration((d) => ('heroSubject' in d ? { heroKeyframes: d.heroKeyframes || [] } : null)).length)

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the Survey hero is retired: focus lives only on the keyframes')
process.exit(red ? 1 : 0)
