#!/usr/bin/env node
// CLAIM — EVERY STAGE CONTROL MOVES SOMETHING ON A TOWN NOBODY HAS LOOKED AT.
//
// Loupe's Stage audit, 2026-09-26: on Provincetown the Neon section, Force Neon On, the three Horizon sliders and
// the eight Arch uplights moved a slider and nothing else, because the thing that reads them is drawn only by
// LAFAYETTE SQUARE's Stage mount. The SMAA switch stopped working after its first edit, and three metre sliders
// stopped short of a big town. Every one was invisible on LS. The class, and what this reads to catch it:
//   ① POURED-TOWN PARITY. Every channel a Stage card edits reaches something RENDERED on a poured town.
//      The cards' channels are read from the panel sources; the routes from CartographApp (a prop into a mounted
//      tag, or a *Pump writing a module that a rendered file reads). "Rendered" = reachable through JSX tags from
//      the Canvas's global mounts + genericSceneConfig's — never through a bare import. A control the panel shows
//      only when its own channel exists (`{archChannel ? …}`) is exempt: it is hidden where it can't draw.
//   ② NO FLAT GATE ON A KEYFRAMED CHANNEL. The first edit in TodChannel turns a channel into keys, so a render
//      file that reads `…?.values?.<field>` without branching on `animated` reads undefined after that edit.
//   ③ NO TOGGLE FIELD IN A KEYFRAMED CHANNEL that the per-minute resolvers never read — the resolver must be
//      handed THAT channel (`resolveGroupAtMinute(<ch>Channel, …)`), not merely sit in a file that names it.
//      (Constellations passed the looser form for months while nothing read it.)
//   ④ A METRE SLIDER'S RANGE COMES FROM THE TOWN (Class D). A field or SliderRow in metres (`unit: 'm'`, a `m`
//      suffix, or "(m)" in its label) may not have a numeric-literal max, unless it declares a scale no town
//      changes (`scale: 'body'` an eye height, `scale: 'fixture'` a lamp's pool); `scale: 'town'` must derive
//      (a human-sized quantity — an eye height — which no town changes).
//   ⑤ EVERY LOOK CHANNEL ON A CARD FORKS PER SHOT. A card channel missing from the store's SHOT_LOOK_CHANNELS
//      writes the base Look when edited in Browse or Street — the shot the operator is looking at doesn't change,
//      Hero does (Stars, until 2026-09-27).
// ⚠️ KNOWN BLIND SPOT in ①: a channel handed as a prop to a drawn component counts as live even if that component
//    never reads it. ① proves the route, not the read; ③ proves the read for a toggle.
// ⭐ Everything is READ from source, never restated, so a new card, channel or mount is covered the day it lands.
// ⭐ SELF-MUTATION, every run: each section is re-run on a mutated copy and must go red.
//
//   node checks/claims-stage-controls-are-live.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(ROOT, p), 'utf-8')
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)

// ── source readers ──────────────────────────────────────────────────────────
function resolveImport(fromRel, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(join(ROOT, dirname(fromRel)), spec)
  for (const c of [base, base + '.jsx', base + '.js', join(base, 'index.jsx'), join(base, 'index.js')]) {
    if (existsSync(c) && !c.endsWith('/')) { try { readFileSync(c); return c.slice(ROOT.length) } catch {} }
  }
  return null
}
/** name → repo-relative file, for every local import in `rel`. */
function importMap(rel, text) {
  const m = new Map()
  for (const im of text.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const file = resolveImport(rel, im[2]); if (!file) continue
    const clause = im[1]
    const def = clause.match(/^([A-Za-z_$][\w$]*)/); if (def) m.set(def[1], file)
    const named = clause.match(/\{([\s\S]*?)\}/)
    if (named) for (const part of named[1].split(',')) {
      const [orig, alias] = part.trim().split(/\s+as\s+/).map(s => s?.trim())
      if (orig) m.set(alias || orig, file)
    }
  }
  return m
}
const tagsIn = (text) => new Set([...text.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map(x => x[1]))

/** Files reachable by RENDERING (JSX tags resolved through imports), from `roots` = [{file, tags}]. */
function renderClosure(roots, srcOf = (f) => read(f)) {
  const seen = new Set(), queue = []
  for (const r of roots) for (const t of r.tags) { const f = r.imports.get(t); if (f) queue.push(f) }
  while (queue.length) {
    const f = queue.pop(); if (seen.has(f)) continue; seen.add(f)
    let t; try { t = strip(srcOf(f)) } catch { continue }
    const imps = importMap(f, t)
    for (const tag of tagsIn(t)) { const g = imps.get(tag); if (g && !seen.has(g)) queue.push(g) }
  }
  return seen
}

// ── CartographApp regions ───────────────────────────────────────────────────
function regionsOf(appText) {
  const t = strip(appText)
  const ls0 = t.indexOf("'lafayette-square': {"), toy0 = t.indexOf("'toy': {", ls0)
  const reg1 = t.indexOf('\n}\n', toy0)
  const gen0 = t.indexOf('function genericSceneConfig'), gen1 = t.indexOf('\n}\n', gen0)
  const c0 = t.indexOf('<Canvas'), c1 = t.indexOf('</Canvas>', c0)
  if ([ls0, toy0, reg1, gen0, gen1, c0, c1].some(i => i < 0)) throw new Error('CartographApp regions not found — the check cannot see the Stage mounts')
  return {
    text: t,
    ls: t.slice(ls0, toy0), toy: t.slice(toy0, reg1), generic: t.slice(gen0, gen1), canvas: t.slice(c0, c1),
  }
}

// ── the channels Stage's cards edit ─────────────────────────────────────────
function stageChannels(src) {
  const out = new Map()   // channel → { card, conditional }
  const add = (name, card, conditional = false) => { if (!out.has(name)) out.set(name, { card, conditional }) }
  for (const [file, card] of [['sky', 'Light & Sky'], ['post', 'Image'], ['surfaces', 'Surfaces']]) {
    for (const m of src[file].matchAll(/<StoreChannel\s+name="(\w+)"/g)) add(m[1], card)
    for (const m of src[file].matchAll(/activeChannel\(s,\s*'(\w+)'\)/g)) add(m[1], card)
  }
  // Store-bound booleans a card sets directly (e.g. Force Neon On).
  for (const m of src.sky.matchAll(/useCartographStore\(s => s\.(\w+)\)/g)) if (!/^set/.test(m[1]) && m[1] !== 'weatherMode') add(m[1], 'Light & Sky')
  // StageApp's store-bound cards: generic <StoreChannel name="X"> (conditional when gated by `&&` / `?`) …
  const stage = src.stage
  for (const m of stage.matchAll(/<StoreChannel\s+name="(\w+)"/g)) add(m[1], 'Light Sources', /(&&|\?)\s*$/.test(stage.slice(Math.max(0, m.index - 40), m.index)))
  // … and every `useCartographStore(s => s.X)` whose setter the card calls.
  for (const m of stage.matchAll(/const (\w+)\s*=\s*useCartographStore\(s => (?:activeChannel\(s,\s*')?s?\.?(\w+)'?\)?\)/g)) {
    const [, local, name] = m
    if (/^(set|animate|add|remove|revert)/.test(name)) continue
    const cap = name[0].toUpperCase() + name.slice(1)
    if (!new RegExp(`s => s\\.set${cap}\\b`).test(stage)) continue   // read to pick knobs, never edited
    const card = /archLight|lantern|lampGlow/.test(name) ? 'Light Sources' : 'Hero & Horizon'
    // Conditional: the card renders this channel's knobs only when the channel exists.
    const conditional = new RegExp(`\\b${local}\\s*\\?\\s*\\(|\\b${local}\\s*&&|if\\s*\\(!\\s*${local}\\)\\s*return`).test(stage)
    add(name, card, conditional)
  }
  return out
}

/** Where does channel `name` go in CartographApp? → [{ via, region, target }] */
function routesOf(name, R, appImports) {
  const t = R.text, routes = []
  const vars = new Set()
  for (const m of t.matchAll(new RegExp(`const (\\w+)\\s*=\\s*useCartographStore\\(s => (?:activeChannel\\(s,\\s*'${name}'\\)|s\\.${name})\\)`, 'g'))) vars.add(m[1])
  const regionOf = (idx) => {
    for (const k of ['ls', 'toy', 'generic']) { const i = t.indexOf(R[k]); if (idx >= i && idx < i + R[k].length) return k }
    const ci = t.indexOf(R.canvas); if (idx >= ci && idx < ci + R.canvas.length) return 'canvas'
    return 'outside'
  }
  for (const v of vars) {
    for (const m of t.matchAll(new RegExp(`<([A-Z]\\w*)\\b[^>]*?=\\{${v}\\}`, 'g'))) {
      routes.push({ via: 'prop', target: m[1], region: regionOf(m.index), file: appImports.get(m[1]) })
    }
  }
  // Pumps: a function in CartographApp that resolves the channel and writes a module's uniforms.
  for (const m of t.matchAll(/function (\w+Pump)\s*\(\)\s*\{([\s\S]*?)\n\}/g)) {
    if (!new RegExp(`activeChannel\\(.*?'${name}'\\)`).test(m[2])) continue
    const mounted = t.match(new RegExp(`<${m[1]}\\b`))
    const writes = new Set([...m[2].matchAll(/(_\w+)\.[\w.]+\s*=(?!=)/g)].map(x => appImports.get(x[1])).filter(Boolean))
    routes.push({ via: 'pump', target: m[1], region: mounted ? regionOf(mounted.index) : 'unmounted', modules: [...writes] })
  }
  return routes
}

const SRC = {
  app: 'src/cartograph/CartographApp.jsx',
  stage: 'src/stage/StageApp.jsx',
  sky: 'src/cartograph/CartographSkyLight.jsx',
  post: 'src/cartograph/CartographPost.jsx',
  surfaces: 'src/cartograph/CartographSurfaces.jsx',
  fields: 'src/cartograph/skyLightChannels.js',
}
const RENDER_DIRS = ['src/components', 'src/preview', 'src/lib', 'src/utils', 'src/setpieces']

// ══ ① ═══════════════════════════════════════════════════════════════════════
function parity(appText, srcTexts, log = true) {
  const failures = []
  const R = regionsOf(appText)
  const appImports = importMap(SRC.app, R.text)
  // The Canvas region holds the global mounts (it calls StageEnvironment, it doesn't contain LS's block).
  const pouredRoots = [{ imports: appImports, tags: new Set([...tagsIn(R.canvas), ...tagsIn(R.generic)]) }]
  const poured = renderClosure(pouredRoots)
  const channels = stageChannels(srcTexts)
  // Module → the files that import it (readers of a pump's uniforms).
  const readersCache = new Map()
  const importersOf = (mod) => {
    if (readersCache.has(mod)) return readersCache.get(mod)
    const files = []
    for (const f of poured) {
      let text; try { text = read(f) } catch { continue }
      for (const [, file] of importMap(f, strip(text))) if (file === mod) { files.push(f); break }
    }
    readersCache.set(mod, files); return files
  }
  const storeReaders = (name) => [...poured].filter(f => {
    if (f === SRC.app || f === SRC.stage || /cartograph\/(stores\/|Cartograph(SkyLight|Post|Surfaces)|TodChannel)/.test(f)) return false
    let t; try { t = strip(read(f)) } catch { return false }
    return new RegExp(`useCartographStore\\(\\s*s\\s*=>\\s*(?:activeChannel\\(s,\\s*'${name}'\\)|s\\.${name}\\b)`).test(t)
  })
  for (const [name, { card, conditional }] of channels) {
    const routes = routesOf(name, R, appImports)
    for (const f of storeReaders(name)) routes.push({ via: 'store', target: f.split('/').pop(), region: 'canvas', direct: true })
    const live = routes.some(r =>
      r.direct ||
      (r.via === 'prop' && (r.region === 'canvas' || r.region === 'generic')) ||
      (r.via === 'pump' && (r.region === 'canvas') && r.modules.some(m => importersOf(m).some(f => f !== SRC.app))))
    const where = routes.map(r => `${r.target}@${r.region}`).join(', ') || 'no route'
    if (live) { if (log) ok(`${card} › ${name} → ${where}`) }
    else if (conditional) { if (log) ok(`${card} › ${name} → ${where} (shown only where its channel exists)`) }
    else failures.push(`${card} › ${name} reaches nothing drawn on a poured town (${where})`)
  }
  return { failures, channels }
}

// ══ ② ═══════════════════════════════════════════════════════════════════════
function flatGates(files, tod) {
  const failures = []
  for (const [f, text] of files) {
    const lines = strip(text).split('\n')
    lines.forEach((ln, i) => {
      for (const m of ln.matchAll(/(\w+?)(?:Channel|Override)\??\.values\??\.(\w+)/g)) {
        if (!tod.has(m[1])) continue
        const ctx = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
        if (!/animated/.test(ctx)) failures.push(`${f}:${i + 1} reads ${m[1]}.values.${m[2]} flat — after the first keyframe it is undefined`)
      }
    })
  }
  return failures
}

// ══ ③ ═══════════════════════════════════════════════════════════════════════
function fieldExports(fieldsText) {
  const out = new Map()   // EXPORT_NAME → [{key, type, unit, scale, maxLiteral, label}]
  for (const m of fieldsText.matchAll(/export const (\w+_FIELDS)\s*=\s*\[([\s\S]*?)\n?\]/g)) {
    const items = [...m[2].matchAll(/\{([^{}]*)\}/g)].map(x => {
      const b = x[1]
      const g = (k) => b.match(new RegExp(`${k}:\\s*('([^']*)'|[^,}]+)`))
      return {
        key: g('key')?.[2], label: g('label')?.[2] ?? '', type: g('type')?.[2], unit: g('unit')?.[2], scale: g('scale')?.[2],
        max: g('max')?.[1]?.trim(),
      }
    })
    out.set(m[1], items)
  }
  return out
}
function todToggles(fieldsText, panelTexts, renderTexts) {
  const failures = []
  const fx = fieldExports(fieldsText)
  const channelOf = new Map()
  for (const t of panelTexts) for (const m of t.matchAll(/<StoreChannel\s+name="(\w+)"[\s\S]*?fields=\{(?:withRanges\()?(\w+_FIELDS)/g)) channelOf.set(m[2], m[1])
  for (const [exp, items] of fx) {
    const ch = channelOf.get(exp); if (!ch) continue
    for (const it of items) {
      if (it.type !== 'toggle') continue
      const handed = new RegExp(`resolve(Group|Animated)AtMinute\\(\\s*[\\w.?]*\\b${ch}(Channel|Override)?\\b`)
      const readers = renderTexts.filter(([, t]) => handed.test(t) && new RegExp(`\\.${it.key}\\b`).test(t))
      if (!readers.length) failures.push(`${ch}.${it.key} is a keyframed toggle no per-minute resolver reads — it can't switch with the time of day`)
    }
  }
  return failures
}

// ══ ④ ═══════════════════════════════════════════════════════════════════════
const isLiteral = (v) => v != null && /^-?[\d.]+(\s*\*\s*[\d.]+)?$/.test(v.trim())
function metreRanges(fieldsText, stageText) {
  const failures = []
  for (const [exp, items] of fieldExports(fieldsText)) for (const it of items) {
    const metres = it.unit === 'm' || /\(m\)/.test(it.label)
    if (metres && (!it.scale || it.scale === 'town') && isLiteral(it.max)) failures.push(`${exp} ${it.key} ("${it.label}") is in metres with a fixed max ${it.max} — derive it from the town, or declare the quantity's scale (e.g. scale: 'fixture')`)
  }
  for (const m of strip(stageText).matchAll(/<SliderRow\b([\s\S]*?)\/>/g)) {
    const a = m[1]
    const label = a.match(/label="([^"]*)"/)?.[1] ?? '?'
    const metres = /suffix="m"/.test(a) || /\(m\)/.test(label) || /unit="m"/.test(a)
    const max = a.match(/max=\{([^}]*)\}/)?.[1]
    const scale = a.match(/scale="(\w+)"/)?.[1]
    if (metres && (!scale || scale === 'town') && isLiteral(max)) failures.push(`SliderRow "${label}" is in metres with a fixed max ${max}`)
  }
  return failures
}

// ══ ⑤ ═══════════════════════════════════════════════════════════════════════
const STORE = 'src/cartograph/stores/useCartographStore.js'
function unforked(storeText, cardTexts) {
  const set = storeText.match(/export const SHOT_LOOK_CHANNELS = new Set\(\[([\s\S]*?)\]\)/)
  if (!set) return ['SHOT_LOOK_CHANNELS not found in the store — ⑤ cannot read it']
  const forks = new Set([...set[1].matchAll(/'(\w+)'/g)].map(m => m[1]))
  const cards = new Set(cardTexts.flatMap(t => [...t.matchAll(/<StoreChannel\s+name="(\w+)"/g)].map(m => m[1])))
  return [...cards].filter(c => !forks.has(c)).map(c => `${c} is on a Stage card but not in SHOT_LOOK_CHANNELS — editing it in Browse or Street writes the base Look`)
}

// ── run ─────────────────────────────────────────────────────────────────────
const texts = Object.fromEntries(Object.entries(SRC).map(([k, p]) => [k, strip(read(p))]))
const appRaw = read(SRC.app)
function listRender() {
  const out = []
  const walk = (d) => { for (const n of readdirSync(join(ROOT, d))) { const p = join(d, n); if (statSync(join(ROOT, p)).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(n)) out.push([p, read(p)]) } }
  for (const d of RENDER_DIRS) walk(d)
  out.push([SRC.app, appRaw])
  return out
}
const RENDER = listRender()

console.log('① EVERY STAGE CHANNEL REACHES SOMETHING DRAWN ON A POURED TOWN')
{
  const { failures, channels } = parity(appRaw, texts)
  if (!channels.size) bad('found no Stage channels — the check cannot see the cards')
  failures.forEach(bad)
  // Self-mutation: drop the generic lamp mount's live lantern → Light Sources › lantern must go red.
  const mut = appRaw.replace(/(function genericSceneConfig[\s\S]*?)<BakedLamps\b[^>]*\/>/, '$1')
  const m = parity(mut, texts, false).failures.some(f => /› lantern /.test(f))
  m ? ok('mutation (poured towns lose the lamp mount) is caught') : bad('mutation NOT caught — ① is blind')
}

console.log('② NO FLAT GATE ON A KEYFRAMED CHANNEL')
{
  const tod = new Set([...[texts.sky, texts.post, texts.surfaces].join('\n').matchAll(/<StoreChannel\s+name="(\w+)"/g)].map(m => m[1]))
  const f = flatGates(RENDER.filter(([p]) => !/cartograph\/(Cartograph(SkyLight|Post|Surfaces)|TodChannel|skyLightChannels|stores\/)/.test(p)), tod)
  f.length ? f.forEach(bad) : ok(`no render file reads a keyframed channel flat (${tod.size} keyframed channels)`)
  const mut = flatGates([['mut.jsx', 'const x = bloomChannel?.values?.intensity > 0']], tod)
  mut.length ? ok('mutation (a flat bloom gate) is caught') : bad('mutation NOT caught — ② is blind')
}

console.log('③ NO KEYFRAMED TOGGLE THE RESOLVERS NEVER READ')
{
  const renders = RENDER.filter(([p]) => !/skyLightChannels|stores\/|TodChannel|Cartograph(SkyLight|Post|Surfaces)/.test(p)).map(([p, t]) => [p, strip(t)])
  const f = todToggles(texts.fields, [texts.sky, texts.post, texts.surfaces], renders)
  f.length ? f.forEach(bad) : ok('every keyframed toggle is read per minute')
  const mut = todToggles(texts.fields.replace(/export const BLOOM_FIELDS = \[/, "export const BLOOM_FIELDS = [\n  { key: 'zzzOff', label: 'x', type: 'toggle' },"), [texts.sky, texts.post, texts.surfaces], renders)
  mut.some(x => /zzzOff/.test(x)) ? ok('mutation (an unread bloom toggle) is caught') : bad('mutation NOT caught — ③ is blind')
  const unread = todToggles(texts.fields, [texts.sky, texts.post, texts.surfaces],
    renders.map(([p, t]) => [p, t.replace(/resolveGroupAtMinute\(\s*constellationsChannel/g, 'resolveGroupAtMinute(zzz')]))
  unread.some(x => /^constellations\./.test(x)) ? ok('mutation (the Constellations read removed) is caught') : bad('mutation NOT caught — ③ passes a toggle nobody reads')
}

console.log('④ A METRE SLIDER\'S RANGE COMES FROM THE TOWN')
{
  const f = metreRanges(texts.fields, texts.stage)
  f.length ? f.forEach(bad) : ok('no metre slider has a fixed max')
  const mut = metreRanges(texts.fields, texts.stage + '\n<SliderRow label="Zzz" value={1} min={0} max={900} suffix="m" />')
  mut.some(x => /Zzz/.test(x)) ? ok('mutation (a fixed-max metre slider) is caught') : bad('mutation NOT caught — ④ is blind')
}

console.log('⑤ EVERY LOOK CHANNEL ON A CARD FORKS PER SHOT')
{
  const store = strip(read(STORE))
  const cards = [texts.sky, texts.post, texts.surfaces, texts.stage]
  const f = unforked(store, cards)
  f.length ? f.forEach(bad) : ok('every card channel is in SHOT_LOOK_CHANNELS')
  const mut = unforked(store.replace(/'bloom',\s*/, ''), cards)
  mut.some(x => /^bloom /.test(x)) ? ok('mutation (bloom dropped from the fork set) is caught') : bad('mutation NOT caught — ⑤ is blind')
}

console.log(red ? `\n⛔ ${red} claim(s) fail` : '\n✅ all claims hold')
process.exit(red ? 1 : 0)
