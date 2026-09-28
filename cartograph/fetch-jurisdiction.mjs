#!/usr/bin/env node
/**
 * fetch-jurisdiction.mjs — which country (and first-level subdivision) a town is in: one reverse lookup of its centre.
 *
 * Writes cartograph/data/<town>/jurisdiction.json: { country: 'US', subdivision: 'MO' | null, name, source, at }.
 * Carried by cartograph/intake-jurisdiction.mjs (jurisdictionForMap) to the Sources panel, whose rows name THIS town's
 * sources, not another country's (src/cartograph/sourcesCatalogue.js resolveRow). ⛔ Deliberately NOT geography.json: that file is a bake input, and a new field there would stale terrain.
 * ⛔ No guess: a lookup that names no country fails, writing nothing.
 * Source: OpenStreetMap Nominatim (reverse, zoom 5), with its etiquette — a descriptive User-Agent and one request a
 * second; its attribution is recorded in `source`.
 *
 *   node cartograph/fetch-jurisdiction.mjs --town=<id> [--town=<id> …]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UA = 'cartograph/1.0 (neighborhood pour; jacob@jacobhenderson.studio)'   // the same UA serve.js's geocode sends
const towns = process.argv.filter((a) => a.startsWith('--town=')).map((a) => a.slice(7))
if (!towns.length) { console.error('⛔ --town=<id> is required'); process.exit(2) }

let failed = 0
for (const [i, town] of towns.entries()) {
  if (i) await new Promise((r) => setTimeout(r, 1100))   // Nominatim: at most one request a second
  const g = join(ROOT, 'cartograph/data', town, 'geography.json')
  if (!existsSync(g)) { console.error(`⛔ ${town}: no geography.json — pour it first`); failed++; continue }
  const { lat, lon } = JSON.parse(readFileSync(g, 'utf8'))
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&addressdetails=1&lat=${lat}&lon=${lon}`
  const j = await (await fetch(url, { headers: { 'User-Agent': UA } })).json()
  const a = j.address || {}
  const country = (a.country_code || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) { console.error(`⛔ ${town}: the lookup named no country (${JSON.stringify(j).slice(0, 200)})`); failed++; continue }
  const iso2 = a['ISO3166-2-lvl4'] || null                      // e.g. 'US-MO'
  const subdivision = iso2 && iso2.startsWith(country + '-') ? iso2.slice(country.length + 1) : null
  const out = {
    country, subdivision,
    name: [a.state, a.country].filter(Boolean).join(', '),
    source: { service: 'OpenStreetMap Nominatim reverse (zoom 5)', licence: j.licence || null, osm: j.osm_type ? `${j.osm_type}/${j.osm_id}` : null, at: [lat, lon] },
    at: new Date().toISOString(),
  }
  writeFileSync(join(ROOT, 'cartograph/data', town, 'jurisdiction.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(`✅ ${town}: ${country}${subdivision ? '-' + subdivision : ''} (${out.name})`)
}
process.exit(failed ? 1 : 0)
