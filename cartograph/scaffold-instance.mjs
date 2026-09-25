#!/usr/bin/env node
/**
 * scaffold-instance.mjs — GIVE A POURED TOWN ITS OWN INSTANCE MODULE (`src/instances/<map>.js`).
 *
 * ⛔ WHY: a poured town had no module unless someone hand-wrote one, and without one the
 * player boots WEARING LAFAYETTE SQUARE (`src/instance.js`): LS's name in the tab, LS's arch
 * as favicon/loader/badge, LS's legal documents. Provincetown did, until 2026-09-25.
 *
 * Everything written is the town's OWN fact (geography.json, neighborhood.json) or null, and
 * null is DECLARED, never borrowed. ⭐ The mark is authored by the operator, not produced:
 * `mark: null` means "no mark yet" — the town shows its own initial, and
 * `checks/claims-every-town-has-a-mark.mjs` stays red on it until one is authored.
 *
 *   node cartograph/scaffold-instance.mjs --scene=<map> [--mark=<emoji>]
 * Refuses if the module exists (a module is authored state; never overwritten).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const scene = arg('scene')
if (!scene || !/^[a-z0-9][a-z0-9-]*$/.test(scene)) { console.error('scaffold-instance: --scene=<map> is required'); process.exit(2) }
const out = join(ROOT, 'src', 'instances', `${scene}.js`)
if (existsSync(out)) { console.error(`scaffold-instance: ${out} exists — a module is authored state, not overwritten`); process.exit(2) }
const dir = join(ROOT, 'cartograph', 'data', scene)
const geo = JSON.parse(readFileSync(join(dir, 'geography.json'), 'utf8'))
let nb = {}; try { nb = JSON.parse(readFileSync(join(dir, 'neighborhood.json'), 'utf8')) } catch { /* no draft yet */ }
const name = nb.name || null
if (!name) { console.error(`scaffold-instance: ${scene} has no name in neighborhood.json — name the town in Extent first`); process.exit(2) }
const mark = arg('mark') || null
const q = (v) => v == null ? 'null' : JSON.stringify(v)
const b = geo.bbox
const src = `/**
 * ${name} — scaffolded by cartograph/scaffold-instance.mjs from this town's own geography.json and
 * neighborhood.json (${new Date().toISOString().slice(0, 10)}). Every null is DECLARED — unknown, never borrowed.
 * ⭐ Edit freely: this file is the town's authored identity.
 */
export default {
  lookId: ${q(scene)},
  skyMode: 'cheap',

  geography: {
    lat: ${geo.lat},
    lon: ${geo.lon},
    timezone: ${q(geo.timezone)},
    lonToMeters: ${geo.lonToMeters},
    latToMeters: ${geo.latToMeters},
    bbox: { minLat: ${b.minLat}, maxLat: ${b.maxLat}, minLon: ${b.minLon}, maxLon: ${b.maxLon} },
    cityState: null,
    stateCode: null,
  },

  name: ${q(name)},
  domain: null,

  contentRoot: 'content/${scene}/',

  branding: {
    title: ${q(name)},
    faviconUrl: null,
    // ${mark ? 'Authored.' : '⛔ NO MARK YET — the operator authors one (an emoji). Until then the town shows its own initial.'}
    mark: ${q(mark)},
    ogImage: null,
    assetSlug: ${q(scene)},
  },

  // No legal documents declared → the legal pages say "not declared" (src/instances/copy/index.jsx).
  legal: {
    entityName: null,
    dba: null,
    governingState: null,
  },

  commerce: { salesTaxRate: null },

  profile: {
    population: null, buildingCount: null, founded: null, parkAcres: null,
    landmarkName: null, historicDistrictName: null, tagline: null, about: null,
  },

  modules: {
    bulletin: true,
    delivery: { enabled: false, zoneDescription: null },
    contact: true, codedesk: true, sms: true, chat: true, info: true, events: true, society: true, residences: true,
  },

  cary: { smsNumber: null, smsNumberDisplay: null, email: null },
  contact: { email: null },
}
`
writeFileSync(out, src)
// Register it: one import + one entry in the map-keyed registry.
const regP = join(ROOT, 'src', 'instances', 'registry.js')
let reg = readFileSync(regP, 'utf8')
const ident = scene.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[0-9]/, '_$&')
const imports = [...reg.matchAll(/^import .* from '\.\/[^']+\.js'\n/gm)]
const last = imports.at(-1)
reg = reg.slice(0, last.index + last[0].length) + `import ${ident} from './${scene}.js'\n` + reg.slice(last.index + last[0].length)
reg = reg.replace(/const INSTANCES = \{\n([\s\S]*?)\n\}/, (m, body) => `const INSTANCES = {\n${body}\n  '${scene}': ${ident},\n}`)
writeFileSync(regP, reg)
console.log(`scaffold-instance: wrote src/instances/${scene}.js and registered it (mark: ${mark ?? 'NONE YET — shows its initial'})`)
