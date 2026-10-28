#!/usr/bin/env node
// claims-a-tool-page-that-cannot-open-says-so.mjs — WHEN A TOOL PAGE CANNOT OPEN, DOES IT SAY SO ON SCREEN, WITH THE WAY OUT?
//
// ⭐ "A message explains or goes away" (Jacob's plan, 2026-10-28): localhost:5173/arborist with no ?look= was a BLACK screen. The
// refusal ("[instance] ⛔ this page names no town …") is thrown while the page's first module (placeBootTown.js → instance.js) is
// evaluated, so React never mounted and the message reached the console only.
//   ① src/bootOrRefuse.js#bootOrRefuse, run with a planted boot that throws that refusal (on a stand-in DOM): the root shows an
//      alert holding the message, and a link to each town in public/looks/index.json, opened with ?look=<id>.
//   ② every page at the repo root that is not an authoring page (<meta name="ward-authoring">) and whose entry reaches
//      placeBootTown boots it THROUGH bootOrRefuse, never by a static import (read from the source). ⛔ One page is not this
//      check's: index.html, the town player — a published town's page always names its town, and its static import graph is
//      claims-no-town-rides-in-the-bundle's (a dynamic boot would blind it). It is printed, never silently passed.
// ⭐ MUTANTS (--mutants), each RED: the refusal rethrown instead of shown · the Arborist's entry back on a static import.
//   node checks/claims-a-tool-page-that-cannot-open-says-so.mjs [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
const MUTANTS = process.argv.includes('--mutants')
const looks = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8')).looks.filter(l => l.scene)

// a stand-in DOM: just what bootOrRefuse touches
const el = (tag) => ({ tag, children: [], attrs: {}, style: {}, textContent: '', href: '',
  setAttribute(k, v) { this.attrs[k] = v }, append(...c) { this.children.push(...c) }, replaceChildren() { this.children = [] } })
const text = (n) => [n.textContent, ...n.children.map(text)].join(' ')
const links = (n) => [...(n.tag === 'a' ? [n.href] : []), ...n.children.flatMap(links)]
const REFUSAL = '[instance] ⛔ this page names no town — no <meta name="ward-look">, no ?look=, and no first path segment naming a look'
async function shows(mod) {
  globalThis.document = { createElement: el }; globalThis.window = { location: { pathname: '/arborist' } }
  const root = el('div'), err = console.error; console.error = () => {}
  try { await mod.bootOrRefuse(root, 'The Arborist', async () => { throw new Error(REFUSAL) }) } catch (e) { return { threw: e.message } } finally { console.error = err }
  const alert = root.children.find(c => c.attrs.role === 'alert')
  return { alert: !!alert, text: alert ? text(alert) : '', links: alert ? links(alert) : [] }
}
const pages = readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => { const h = readFileSync(join(ROOT, f), 'utf8'), e = h.match(/src="\/(src\/[^"]+)"/)?.[1]
  return { page: f, entry: e, authoring: /name="ward-authoring"/.test(h), src: e ? readFileSync(join(ROOT, e), 'utf8') : '' } })
const PLAYER = 'index.html'

async function claims(mod, override = {}) {
  const out = [], s = await shows(mod)
  if (s.threw) out.push(`① the refusal is not shown: bootOrRefuse rethrew it (${s.threw.slice(0, 60)})`)
  else {
    if (!s.alert) out.push('① no alert is drawn in the root')
    if (!s.text.includes('names no town')) out.push('① the alert does not carry the message')
    for (const l of looks) if (!s.links.includes(`/arborist?look=${encodeURIComponent(l.id)}`)) out.push(`① no link opens ${l.id} with ?look=`)
  }
  for (const p of pages) { const src = override[p.entry] ?? p.src
    if (p.page === PLAYER || p.authoring || !/placeBootTown/.test(src)) continue
    if (/^import ['"](?:\.{1,2}\/)+placeBootTown\.js['"]/m.test(src)) out.push(`② ${p.page} (${p.entry}) imports placeBootTown statically: a page naming no town is black`)
    else if (!/bootOrRefuse\(/.test(src)) out.push(`② ${p.page} (${p.entry}) reaches placeBootTown without bootOrRefuse`) }
  return out
}
let bad = 0
const real = await claims(await importSource('src/bootOrRefuse.js', { suffix: '// real' }))
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log(`✅ a page naming no town shows the refusal with a link to each of ${looks.length} town(s); every tool page boots through bootOrRefuse (${pages.filter(p => p.page !== PLAYER && !p.authoring && /placeBootTown/.test(p.src)).map(p => p.page).join(', ')})`)
console.log(`   not this check's: ${PLAYER} (the player; a published page names its town, and claims-no-town-rides-in-the-bundle reads its static graph)`)
if (MUTANTS) {
  const arb = pages.find(p => p.page === 'arborist.html')
  for (const [what, mod, ov] of [
    ['the refusal rethrown instead of shown', await importSource('src/bootOrRefuse.js', { suffix: '// m1', transform: (t) => { const f = '  try { await boot() } catch (e) {\n'; if (!t.includes(f)) throw new Error('[mutant] re-aim'); return t.replace(f, '  try { await boot() } catch (e) { throw e\n') } }), {}],
    ["the Arborist's entry back on a static import", await importSource('src/bootOrRefuse.js', { suffix: '// m2' }), { [arb.entry]: "import '../placeBootTown.js'\n" + arb.src }],
  ]) { const got = await claims(mod, ov), red = got.length > real.length
    if (!red) bad++
    console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`) }
}
delete globalThis.document; delete globalThis.window
console.log(bad ? '\n⛔ RED — a tool page that cannot open is black, or says so only in the console' : '\n✅ GREEN — a tool page that cannot open says why on screen, with a town to open')
process.exit(bad ? 1 : 0)
