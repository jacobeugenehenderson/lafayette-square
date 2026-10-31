#!/usr/bin/env node
/**
 * "DOES A TOWN'S CALENDAR REACH ITS DISPLAYS, AND DOES A DISPLAY THAT COULD NEVER GO LIVE REFUSE?" (Zob's finding,
 * 2026-10-31: nothing passed `calendar` to Displays, so inSeason was false forever, silently; plan approved by Boz, with
 * Zob's premises: absence from the MANIFEST, never a 404.)
 *
 *   1. the read (src/hooks/useTownCalendar.js#readTownCalendar), against a planted slab: no manifest, a manifest without a
 *      content index, and a listed file that does not answer are each { error } (never absence); the manifest's null is
 *      { absent }; a listed file is its rows;
 *   2. the wire: every <Town> in src passes `calendar`, Town hands it to <SetPiece>, SetPiece to <Displays>, and every
 *      direct <SetPiece> mount passes it (read from source, every file, never a list);
 *   3. Displays refuses, by name, inside the display's boundary: an app that passes none (undefined), a calendar that
 *      could not be read, and a town that publishes none while its display names a season; it has no default;
 *   4. a town's calendar is its own content/events.json, found by path (loadInstanceData's TOWN_CALENDARS): no per-town
 *      row names an events file.
 *
 * Usage: node checks/claims-a-towns-calendar-reaches-its-displays.mjs [--mutants]
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { importSource, sourceOf } from './_importSource.mjs'

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')
const SLAB_STUB = 'export const slabManifest = async () => globalThis.__slab.manifest; export const slabFetch = async () => globalThis.__slab.res'
function jsxFiles(dir, out = []) {
  for (const f of readdirSync(join(process.cwd(), dir))) {
    const p = `${dir}/${f}`, st = statSync(join(process.cwd(), p))
    if (st.isDirectory()) jsxFiles(p, out); else if (/\.jsx$/.test(f)) out.push(p)   // a mount is JSX; a .js file names <Town> only in prose
  }
  return out
}

async function verdict({ hook, files = {}, loader } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  // 1. the read
  const H = await importSource('src/hooks/useTownCalendar.js', { ...(hook ? { transform: hook } : {}), redirect: { 'src/lib/slabUrl.js': { transform: () => SLAB_STUB } } })
  const ask = async (manifest, res) => { globalThis.__slab = { manifest, res }; return H.readTownCalendar('t') }
  const rows = [{ id: 'season' }], ok = { ok: true, status: 200, json: async () => rows }, gone = { ok: false, status: 404, json: async () => null }
  F((await ask(null, ok))?.error, 'no manifest is not an error')
  F((await ask({}, ok))?.error, 'a manifest without a content index is not an error')
  F((await ask({ content: { 'events.json': null } }, gone))?.absent === true, "the manifest's null is not { absent }")
  const g = await ask({ content: { 'events.json': { bytes: 1 } } }, gone)
  F(g?.error && !g.absent, `a listed calendar that answers 404 is read as ${JSON.stringify(g)}, not an error (never absence)`)
  F(JSON.stringify(await ask({ content: { 'events.json': { bytes: 1 } } }, ok)) === JSON.stringify(rows), 'a listed calendar is not read as its rows')
  // 2. the wire, every file
  const src = (rel) => code(files[rel] ? files[rel](sourceOf(rel)) : sourceOf(rel))
  const all = jsxFiles('src')
  let towns = 0
  for (const rel of all) {
    if (rel === 'src/components/Town.jsx') continue
    const s = src(rel)
    for (const m of s.matchAll(/<Town\s[^>]*?(\/?>)/gs)) { towns++; if (!/\bcalendar=\{/.test(m[0])) fails.push(`${rel}: a <Town> passes no calendar`) }
    for (const m of s.matchAll(/<SetPiece\s[^>]*?\/?>/gs)) if (!/\bcalendar=\{/.test(m[0])) fails.push(`${rel}: a <SetPiece> passes no calendar`)
  }
  F(towns >= 3, `only ${towns} <Town> mounts found: the rule would pass on nothing`)
  const town = src('src/components/Town.jsx'), sp = src('src/components/SetPiece.jsx'), dsp = src('src/displays/Displays.jsx')
  F(/<SetPiece [^>]*calendar=\{calendar\}/.test(town), 'Town does not hand `calendar` to <SetPiece>')
  F(/<Displays [^>]*calendar=\{calendar\}/.test(sp), 'SetPiece does not hand `calendar` to <Displays>')
  // 3. the refusals, and no default
  F(/export default function Displays\(\{[^}]*\bcalendar \}\)/.test(dsp), 'Displays defaults `calendar` (it must be required)')
  F(/calendar === undefined \?/.test(dsp), 'Displays does not refuse an app that passes no calendar')
  F(/calendar\?\.error \?/.test(dsp), 'Displays does not refuse a calendar that could not be read')
  F(/calendar\?\.absent && d\.season \?/.test(dsp), 'Displays does not refuse a town that publishes no calendar while its display names a season')
  // 4. the loader
  const ld = code(loader ? loader(sourceOf('src/data/loadInstanceData.js')) : sourceOf('src/data/loadInstanceData.js'))
  const manifests = ld.slice(ld.indexOf('const MANIFESTS = {'), ld.indexOf('\n}\n', ld.indexOf('const MANIFESTS = {')))
  F(!/events\.json|seedEvents/.test(manifests), 'a per-town MANIFESTS row names a calendar (it must be found by path)')
  F(/import\.meta\.glob\('\.\.\/\.\.\/cartograph\/data\/\*\/content\/events\.json'\)/.test(ld) && /name === 'seedEvents' \? calendarOf\(lookId\)/.test(ld), "loadInstanceData does not find a town's calendar by its path")
  return fails
}

const fails = await verdict()
if (fails.length) { console.log("⛔ a town's calendar does not reach its displays:\n  · " + fails.join('\n  · ')); process.exitCode = 1 }
else console.log("✅ a town's calendar reaches its displays: read from the manifest (absence stated there, a failed read an error), passed by every <Town> and <SetPiece>, refused by name where a display could never go live; found by its path")

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['a 404 read as absence', { hook: (s) => s.replace("if (!res.ok) return { error:", "if (!res.ok) return { absent: true, was:") }],
    ['SetPiece dropping the calendar', { files: { 'src/components/SetPiece.jsx': (s) => s.replace(' dim={dim} calendar={calendar} />', ' dim={dim} />') } }],
    ['Preview not passing it', { files: { 'src/preview/PreviewApp.jsx': (s) => s.replace(' interactive={false} calendar={calendar}', ' interactive={false}') } }],
    ['the default restored', { files: { 'src/displays/Displays.jsx': (s) => s.replace('dim, calendar }) {', 'dim, calendar = null }) {') } }],
    ['the absent refusal dropped', { files: { 'src/displays/Displays.jsx': (s) => s.replace('calendar?.absent && d.season ?', 'false ?') } }],
    ["Huron's row back", { loader: (s) => s.replace("    landmarks: () => import('../../cartograph/data/huron/content/listings.json'),", "    landmarks: () => import('../../cartograph/data/huron/content/listings.json'),\n    seedEvents: () => import('../../cartograph/data/huron/content/events.json'),") }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
