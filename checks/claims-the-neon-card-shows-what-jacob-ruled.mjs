#!/usr/bin/env node
/**
 * THE NEON CARD SHOWS WHAT JACOB RULED, AND HIDES NOTHING FROM THE TOWN (Jacob, 2026-11-02: "I don't think the 3D (close
 * up) controls are useful at all at this point. Perhaps when we develop the street view… line width and brightness; maybe
 * glow/emissive"). Claims, each read from the code, never restated from a doc:
 *   A. the card (skyLightChannels.js#NEON_FIELDS) is exactly Line width (px) · Brightness · Glow, Stage mounts the neon
 *      channel with it, and the card says that Revert returns all of Neon to the kit's day;
 *   B. the CHANNEL's fields (NEON_FIELD_KEYS) are every field it carries (NEON_FLAT_DEFAULTS' keys), never the card's: the
 *      renderer's driver writes exactly these, and the store's hydrate and channel actions are handed these;
 *   C. a Look's authored values survive load and save: a neon channel whose hidden fields are off their defaults, flat and
 *      keyed, comes back unchanged through the store's hydrate migrator (animatedParam.js#migrateGroupChannel, with the keys
 *      the store's `_grp` hands it), and the save writer (useCartographStore.js#serializeDesign) is a plain copy;
 *   D. the card never writes a whole tuple: TodChannel writes one key, StoreChannel forwards it, and the store's set keeps
 *      the tuple's other fields; slot seeds are built from the store's keys.
 * Why B and C: migrateGroupChannel keeps ONLY the keys it is handed on a flat channel, so keys taken from the card would
 * drop the five hidden fields on load, and the autosave would then erase them.
 * Usage: node checks/claims-the-neon-card-shows-what-jacob-ruled.mjs [--mutants]   (--mutants: each planted defect → RED)
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8')
const { NEON_FIELDS, NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS } = await import(resolve(ROOT, 'src/cartograph/skyLightChannels.js'))
const { migrateGroupChannel } = await import(resolve(ROOT, 'src/cartograph/animatedParam.js'))

// Jacob's ruling, as the card must carry it: key → the card's word for it.
const RULED = { linePx: 'Line width (px)', lineGain: 'Brightness', emissive: 'Glow' }

const SRC = {
  card: 'src/cartograph/CartographSkyLight.jsx',
  store: 'src/cartograph/stores/useCartographStore.js',
  tod: 'src/cartograph/TodChannel.jsx',
  driver: 'src/components/NeonBands.jsx',
}
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x))
const bodyOf = (text, head) => { const i = text.indexOf(head); if (i < 0) return null; const j = text.indexOf('\n}\n', i); return text.slice(i, j < 0 ? undefined : j) }
const codeLines = (text) => text.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')

/** Every finding for one world: { fields, keys, defaults, migrate, texts }. The live world is the repo; mutants plant one. */
function judge({ fields, keys, defaults, migrate, texts }) {
  const out = []
  // ── A. the card ──
  const shown = fields.map(f => f.key)
  if (!sameSet(shown, Object.keys(RULED))) out.push(`A: the Neon card shows [${shown.join(', ')}], not Jacob's three [${Object.keys(RULED).join(', ')}]`)
  for (const f of fields) if (RULED[f.key] && f.label !== RULED[f.key]) out.push(`A: the card calls ${f.key} "${f.label}", not "${RULED[f.key]}"`)
  if (!/<StoreChannel\s+name="neon"[^>]*\bfields=\{NEON_FIELDS\}/.test(texts.card)) out.push(`A: ${SRC.card} does not mount the neon channel with NEON_FIELDS`)
  if (!/Revert returns all of Neon to the kit's day/.test(texts.card)) out.push(`A: the card does not say that Revert returns all of Neon to the kit's day (the hidden fields included)`)
  // ── B. the channel's fields ──
  if (!sameSet(keys, Object.keys(defaults))) out.push(`B: NEON_FIELD_KEYS [${keys.join(', ')}] is not every field the channel carries [${Object.keys(defaults).join(', ')}]`)
  for (const k of shown) if (!keys.includes(k)) out.push(`B: the card shows ${k}, which is not one of the channel's fields`)
  const written = [...texts.driver.matchAll(/_neonUniforms\.\w+Uniform\.value\s*=\s*v\.(\w+)/g)].map(m => m[1])
  if (!written.length) out.push(`B: ${SRC.driver}'s driver writes no neon uniform from the channel that this check can read`)
  else if (!sameSet([...new Set(written)], keys)) out.push(`B: the renderer's driver writes [${[...new Set(written)].join(', ')}], the channel's fields are [${keys.join(', ')}]`)
  if (!/_grp\('neon',\s*NEON_FIELD_KEYS,\s*NEON_FLAT_DEFAULTS\)/.test(texts.store)) out.push(`B: the store's neon hydrate is not handed NEON_FIELD_KEYS`)
  if (!/createGroupChannelActions\(\{\s*name: 'neon',\s*fieldKeys: NEON_FIELD_KEYS,/.test(texts.store)) out.push(`B: the store's neon channel actions are not handed NEON_FIELD_KEYS`)
  // ── C. load and save keep what a Look authored ──
  if (!/const _grp = \(key, KEYS, DEFAULTS\)[^\n]*migrateGroupChannel\(v, KEYS, DEFAULTS\)/.test(texts.store)) out.push(`C: the store's _grp no longer hydrates through migrateGroupChannel with the keys it is handed, so this round trip is not the store's`)
  const authored = Object.fromEntries(keys.map((k, i) => [k, Number(defaults[k]) + 0.25 + i]))   // every field off its default
  const flat = migrate({ values: { ...authored } }, keys, defaults)
  for (const k of Object.keys(defaults)) if (flat?.values?.[k] !== authored[k]) out.push(`C: a flat neon channel's authored ${k} = ${authored[k]} comes back from the hydrate as ${flat?.values?.[k]}`)
  const keyed = { animated: 'tod', transitionIn: 30, transitionOut: 30, values: { dusk: { ...authored }, night: { ...authored, linePx: 2 } } }
  const back = migrate(structuredClone(keyed), keys, defaults)
  if (JSON.stringify(back) !== JSON.stringify(keyed)) out.push(`C: a keyed neon channel does not come back from the hydrate unchanged`)
  const ser = bodyOf(texts.store, 'function serializeDesign(s) {')
  if (!ser) out.push(`C: no serializeDesign in ${SRC.store}`)
  else {
    if (!ser.includes('for (const f of DESIGN_FIELDS) out[f.key] = s[f.key]')) out.push(`C: serializeDesign does not copy each design field as the store holds it`)
    if (/\bmigrate\w*\s*\(|NEON_FIELDS/.test(codeLines(ser))) out.push(`C: serializeDesign re-reads a channel on save (a migrate call or the card's fields), so a save can drop what the card hides`)
  }
  // ── D. the card writes one key; the store keeps the rest of the tuple ──
  for (const m of codeLines(texts.tod).matchAll(/\bonSetValue\(([^)]*)\)/g)) if (!/^\s*\w+\s*,\s*\w+\s*,\s*\w+\s*$/.test(m[1])) out.push(`D: TodChannel calls onSetValue(${m[1]}), not one key's (key, value, slot)`)
  if (!/onSetValue=\{\(key, value, slotId\) => setValue\(key, value, slotId\)\}/.test(texts.card)) out.push(`D: StoreChannel does not forward one key's write as it came`)
  const acts = bodyOf(texts.store, 'function createGroupChannelActions(')
  if (!acts) out.push(`D: no createGroupChannelActions in ${SRC.store}`)
  else {
    if (!acts.includes('values: { ...(ch.values || {}), [key]: value }')) out.push(`D: a flat channel's set does not keep the tuple's other fields`)
    if (!acts.includes('{ ...(ch.values[sid] || {}), [key]: value }')) out.push(`D: a keyed channel's set does not keep the slot's other fields`)
    if (!/const flatTuple = [\s\S]*?for \(const k of fieldKeys\)/.test(acts)) out.push(`D: the first key's tuple is not built from the store's keys`)
    if (!acts.includes('resolveGroupAtMinute(ch, minute, slotMinutes, fieldKeys, flatDefaults)')) out.push(`D: a new slot's seed is not built from the store's keys`)
  }
  return out
}

const LIVE = { fields: NEON_FIELDS, keys: NEON_FIELD_KEYS, defaults: NEON_FLAT_DEFAULTS, migrate: migrateGroupChannel,
  texts: Object.fromEntries(Object.entries(SRC).map(([k, rel]) => [k, read(rel)])) }
const fails = judge(LIVE)
if (fails.length) { console.log(`⛔ the Neon card:\n  · ${fails.join('\n  · ')}`); process.exitCode = 1 }
else console.log(`✅ the Neon card shows ${NEON_FIELDS.map(f => f.label).join(' · ')}; the channel keeps all ${NEON_FIELD_KEYS.length} fields through load and save, and the renderer reads them`)

if (process.argv.includes('--mutants')) {
  const swap = (k, a, b) => { if (!LIVE.texts[k].includes(a)) throw new Error(`mutant does not apply: "${a.slice(0, 60)}" is not in ${SRC[k]}`); return { ...LIVE, texts: { ...LIVE.texts, [k]: LIVE.texts[k].replace(a, b) } } }
  const noHandoff = Object.fromEntries(Object.entries(NEON_FLAT_DEFAULTS).filter(([k]) => k !== 'handoffPx'))
  const MUTANTS = [
    ['a planted fourth field on the card', () => ({ ...LIVE, fields: [...NEON_FIELDS, { key: 'core', label: 'Hot core', min: 0, max: 1, step: 0.02 }] })],
    ['a label back to its old name', () => ({ ...LIVE, fields: NEON_FIELDS.map(f => f.key === 'lineGain' ? { ...f, label: 'Line brightness' } : f) })],
    ['the channel\'s fields taken from the card (the reset)', () => ({ ...LIVE, keys: NEON_FIELDS.map(f => f.key) })],
    ['the hydrate filling a flat channel from defaults', () => ({ ...LIVE, migrate: (v, K, D) => v?.animated ? v : { values: Object.fromEntries(K.map(k => [k, D[k]])) } })],
    ['a hidden field dropped from the channel', () => ({ ...LIVE, defaults: noHandoff, keys: Object.keys(noHandoff) })],
    ['the store\'s neon hydrate handed the card\'s keys', () => swap('store', "_grp('neon',           NEON_FIELD_KEYS,", "_grp('neon',           NEON_FIELDS.map(f => f.key),")],
    ['the card mounting a different list', () => swap('card', 'fields={NEON_FIELDS} flatDefaults={NEON_FLAT_DEFAULTS}', 'fields={[...NEON_FIELDS]} flatDefaults={NEON_FLAT_DEFAULTS}')],
    ['the card\'s Revert line removed', () => swap('card', "Revert returns all of Neon to the kit's day", 'Revert resets the card')],
    ['a save that re-migrates neon over the card\'s keys', () => swap('store', '  for (const f of DESIGN_FIELDS) out[f.key] = s[f.key]\n', '  for (const f of DESIGN_FIELDS) out[f.key] = s[f.key]\n  out.neon = migrateGroupChannel(out.neon, NEON_FIELDS.map(f => f.key), NEON_FLAT_DEFAULTS)\n')],
    ['a flat set that replaces the tuple', () => swap('store', 'values: { ...(ch.values || {}), [key]: value }', 'values: { [key]: value }')],
    ['StoreChannel writing a tuple built from the card\'s fields', () => swap('card', 'onSetValue={(key, value, slotId) => setValue(key, value, slotId)}', 'onSetValue={(key, value, slotId) => fields.forEach(f => setValue(f.key, f.key === key ? value : flatDefaults[f.key], slotId))}')],
    ['TodChannel writing a tuple', () => swap('tod', 'onSetValue(key, value, sid)', 'onSetValue(Object.fromEntries(fields.map(f => [f.key, value])), value, sid)')],
  ]
  let bad = 0
  for (const [name, world] of MUTANTS) {
    let n
    try { n = judge(world()).length } catch (e) { console.log(`⛔ mutant: ${name}: ${e.message}`); bad++; continue }
    console.log(`${n ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${n ? ` (${n})` : ''}`)
    if (!n) bad++
  }
  if (bad) process.exitCode = 1
}
