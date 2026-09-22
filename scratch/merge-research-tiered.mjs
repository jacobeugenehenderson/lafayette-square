import fs from 'node:fs'
const rd = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ⭐ ORDER IS PRECEDENCE: a later beat's record wins a collision on equal footing, so
// the targeted deep passes go LAST. `berardis` is a second pass over one listing the
// `dining` beat already covered — it adds photos, history and links and must not be
// outranked by the thinner first record.
const DEEP = new Set(['berardis', 'civic-deep', 'prominent-photos'])
const BEATS = ['civic', 'dining', 'waterfront', 'retail', 'shopping', 'overnight', 'dining2', 'services2', 'community', 'berardis', 'civic-deep', 'prominent-photos']
// ⭐ THE FIELDS A RESEARCH RECORD MAY SHIP, listed once. Anything else a beat invents is
// dropped LOUDLY at merge — see the allowlist note below.
const SHIPPING = new Set(['hours', 'description', 'amenities', 'phone', 'menu', 'menu_url', 'history',
  'website', 'reservation_url', 'photos', 'logo', 'email', 'social', 'awards', 'order_url',
  'gift_card_url', 'gift_card_balance_url', 'employment_url', 'tags'])

// A place whose EXISTENCE or IDENTITY is in doubt. ⛔ Merging hours onto one of these is
// the worst of the three tiers: it makes a listing that may not exist look researched.
// ⛔ `_recommended_action` and `_name_finding` were in here and are now OUT. Neither is
// doubt about the PLACE: "retry later with backoff" is advice, and a name correction says
// the record is mis-LABELLED, not that the business is gone. They were holding five
// records whose hours are printed on the operator's own page — Lucky Stone's twice over.
// ⭐ A name correction is still the Host's business; it goes on the worklist as its own
// short list rather than suppressing good data.
const DOUBT_KEYS = ['_duplicate_of', '_status_flag', '_category_wrong', '_identity_correction', '_name_mismatch', '_duplicate', '_duplicate_relocation']
const RELABEL_KEYS = ['_name_finding', '_category_wrong', '_identity_correction']
const DOUBT_TEXT = /phantom|no longer trades|no longer exist|recommend dropping|recommend withholding|could not establish|not a business|permanently closed|temporarily closed|may be a phantom|is not one of them|does not list him/i
// The agent's own hedge on a VALUE it still chose to record.
const CAVEAT_TEXT = /unverified|aggregator|not first-party|seasonal|may be|likely|unconfirmed|not established|conflict|disagree|discrepan|not resolved|⚠|⛔/i
const CAVEAT_KEYS = ['_seasonal', '_hours_caveat', '_phone_conflict', '_relative_hours', '_hours_conflict', '_assumption', '_seasonal_and_stale', '_hours_note', '_no_hours_reason']

const listings = rd('cartograph/data/huron/content/listings.json')
const arr = Array.isArray(listings) ? listings : (listings.listings || Object.values(listings).find(v => Array.isArray(v)))
const byId = new Map(arr.map(l => [l.id, l]))
const ovt = rd('cartograph/data/huron/raw/overture-places.json').places

// ⛔ Returns the REASON as well as the tier. The first worklist printed whatever text a
// record happened to carry, so a held place's "why" column read "High confidence on the
// hours" — useless to the person holding the clipboard. The trigger is the reason.

// ──────────────────────────────────────────────────────────────────────────
// ⛔⛔ A MENU PRICE IS CENTS, AND NOTHING IN THE FIELD'S NAME SAYS SO. Lafayette
// Square stores `price: 2400` for a $24 oyster plate — 781 prices, every one an
// integer — and `MenuRow` renders `(shownPrice / 100).toFixed(0)`. A researcher
// transcribing a printed menu writes `13.5`, which is correct about the world and
// renders as **$0**. All 97 prices in this research came back in dollars, so the
// whole Berardi's menu showed a column of zeroes and read as "no prices listed".
//
// ⭐⭐ CLASS D, TEXTBOOK: a constant with NO UNIT, whose value happened to be right
// for town #1 only because a human authored LS's menus in cents by hand. No
// fallback, no scene name, nothing to grep. ⛔ The conversion is stated HERE, once,
// rather than left as something the next merge must remember:
//   research files carry PRINTED-MENU DOLLARS · the schema is CENTS · × 100.
// ▶ `checks/claims-a-menu-price-is-in-cents.mjs` is what keeps it true.
//
// ⛔ AND IT STRIPS NESTED `_` KEYS, because `stripMeta` does not. `bake-content.js`
// strips the top level of a patch only, so a researcher's section-level `_notes` rode
// all the way into the slab — 906 bytes shipped to every visitor and displayed nowhere,
// since the renderer has no section-notes field. ⚠️ My first "no provenance leaked"
// check missed it by looking only at a listing's own keys; the convention says
// `_`-prefixed never ships, and a convention enforced one level deep is not enforced.
// ⭐ The CONTENT is real and worth having — "all omelets served with homefries",
// "gluten free bread 1.00" is exactly what a diner wants — so this is an input kind
// with nowhere to live, not junk. Dropped here rather than shipped dead; recorded in
// the research files, which is where it can be picked up when the card grows a home
// for it.

// ⛔⛔ A DEEP PASS ADDS; A FIELD-LEVEL SPREAD REPLACES, AND THAT IS NOT THE SAME THING.
// `{...first, ...second}` looked additive and silently destroyed two things on the very
// first record it touched: the Berardi's pass carries `menu: { sections: [] }` (it proved
// the catering and dessert menus DO NOT EXIST, so it added none), and the spread swapped
// 19 real sections for an empty array — the demo card lost its entire menu. Its two new
// amenities likewise replaced the first pass's seven.
// ⭐ THE TELL: a second pass reporting "nothing new here" is the case that breaks a
// naive merge, because an empty result and an absent one look identical to a spread.
function mergeDeepPass(a, b) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const prev = a[k]
    if (k === 'menu' && prev && prev.sections) {
      // Sections are concatenated and de-duplicated by name; a later pass may REPLACE a
      // section it re-transcribed, and adds the rest.
      const byName = new Map((prev.sections || []).map(s => [s.name, s]))
      for (const s of v.sections || []) byName.set(s.name, s)
      out.menu = { ...prev, ...v, sections: [...byName.values()] }
    } else if (Array.isArray(prev) && Array.isArray(v)) {
      const seen = new Set(prev.map(x => JSON.stringify(x)))
      out[k] = [...prev, ...v.filter(x => !seen.has(JSON.stringify(x)))]
    } else if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) {
      out[k] = v
    }
  }
  return out
}

// ⛔ AND THE STRIP HAS TO BE DEEP. `stripMeta` clears the top level of a patch only, and
// my first deep-clean reached into `menu` alone — so a photo object's `_confirmed_huron`,
// `_rights_caution` and `_basis` rode into the slab. Provenance hides wherever the
// researcher put it, which is everywhere useful. One recursive rule, no exceptions.
function stripDeep(v) {
  if (Array.isArray(v)) return v.map(stripDeep)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, stripDeep(x)]))
  }
  return v
}

function menuToCents(menu) {
  // ⛔ A MENU CAN BE A LINK RATHER THAN A TRANSCRIPTION, and this used to flatten the
  // difference. Several beats recorded `menu: { url: "…" }` for a restaurant whose menu
  // is a PDF or a JS app — an honest "it exists, here it is" — and unconditionally
  // rebuilding `sections` stamped an empty array onto it, which read downstream as "this
  // place has a menu with nothing in it" and cost six restaurants their ranking.
  if (!Array.isArray(menu.sections)) return { ...menu }
  // ⛔⛔ AND THE CONVERSION IS NOT IDEMPOTENT, SO IT REFUSES RATHER THAN RUNS TWICE.
  // ×100 on a menu already in cents turns $13.50 into $1,350.00 — a number that is an
  // integer and well over a dollar, so `claims-a-menu-price-is-in-cents` would have
  // passed it clean. The hazard is live: the research files still hold DOLLARS while
  // the merged listings hold cents, and the obvious tidy-up ("fix the research file
  // too") is exactly what would double-convert on the next run. ⭐ A transform that
  // must run exactly once has to be able to tell whether it already has.
  const all = []
  for (const s of menu.sections || []) for (const i of s.items || []) if (typeof i.price === 'number') all.push(i.price)
  const nonZero = all.filter(v => v > 0)
  if (nonZero.length && nonZero.every(Number.isInteger) && nonZero.every(v => v >= 100)) {
    throw new Error(
      `menuToCents: this menu is ALREADY in cents (${nonZero.length} prices, all whole, all >= 100) ` +
      `and converting again would multiply it by 100.\n` +
      `   ▶ Research files hold PRINTED-MENU DOLLARS by convention; if one has been ` +
      `rewritten to cents, drop the ×100 for that file rather than running this twice.`)
  }
  const toCents = (v) => (typeof v === 'number' ? Math.round(v * 100) : v)
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')))
  return {
    ...clean(menu),
    sections: (menu.sections || []).map(s => ({
      ...clean(s),
      items: (s.items || []).map(i => ({
        ...clean(i),
        ...(typeof i.price === 'number' ? { price: toCents(i.price) } : {}),
        ...(Array.isArray(i.modifiers) ? { modifiers: i.modifiers.map(m => ({ ...m, ...(typeof m.price === 'number' ? { price: toCents(m.price) } : {}) })) } : {}),
      })),
    })),
  }
}

function classify(r) {
  const text = [r._confidence, r._recommended_action, r._status_flag, r._notes].filter(Boolean).join(' ')
  const key = DOUBT_KEYS.find(k => r[k])
  if (key) return { tier: 'HOLD', why: `${key}: ${String(r[key]).slice(0, 180)}` }
  const m = DOUBT_TEXT.exec(text)
  if (m) return { tier: 'HOLD', why: `the researcher wrote "${m[0]}" — ${text.slice(Math.max(0, m.index - 40), m.index + 150).trim()}` }
  const ck = CAVEAT_KEYS.find(k => r[k])
  if (ck) return { tier: 'CAVEATED', why: `${ck}: ${String(r[ck]).slice(0, 180)}` }
  const cm = CAVEAT_TEXT.exec(text)
  if (cm) return { tier: 'CAVEATED', why: `"${cm[0]}" — ${text.slice(Math.max(0, cm.index - 40), cm.index + 150).trim()}` }
  return { tier: 'CLEAN', why: null }
}
const shippingFields = r => Object.keys(r).filter(k => SHIPPING.has(k))

// ── gather, resolving the 33 multi-beat collisions ────────────────────────
const best = new Map()  // listing id -> {beat, rec, tier}
for (const beat of BEATS) {
  const d = rd(`scratch/huron-research/${beat}.json`)
  for (const [id, rec] of Object.entries(d)) {
    if (id.startsWith('_')) continue
    if (!byId.has(id)) { console.log(`  ⛔ ${beat}:${id} is not a listing — skipped`); continue }
    const c = classify(rec)
    const cand = { beat, rec, tier: c.tier, why: c.why, n: shippingFields(rec).length }
    const cur = best.get(id)
    if (!cur) { best.set(id, cand); continue }
    // ⛔ A TARGETED SECOND PASS ADDS, IT DOES NOT REPLACE. The Berardi's pass carries
    // photos, history and links but no `hours` — taking it whole would have dropped the
    // hours the first pass found. Fields present in BOTH go to the later record; fields
    // only the earlier one has are kept.
    if (DEEP.has(beat)) {
      best.set(id, { ...cur, rec: mergeDeepPass(cur.rec, rec), beat: `${cur.beat}+${beat}`,
        tier: c.tier === 'HOLD' || cur.tier === 'HOLD' ? 'HOLD' : (c.tier === 'CAVEATED' || cur.tier === 'CAVEATED' ? 'CAVEATED' : 'CLEAN'),
        why: c.why || cur.why, n: shippingFields(mergeDeepPass(cur.rec, rec)).length })
      continue
    }
    // ⭐ COLLISION RULE, stated once: a record whose place is in doubt never wins; then
    // prefer the un-hedged one; then the one carrying more fields; ties keep the first.
    const rank = c => (c.tier === 'HOLD' ? 2 : c.tier === 'CAVEATED' ? 1 : 0)
    if (rank(cand) < rank(cur) || (rank(cand) === rank(cur) && cand.n > cur.n)) best.set(id, cand)
  }
}

// ── write ─────────────────────────────────────────────────────────────────
const ovPath = 'cartograph/data/huron/content/listings.overrides.json'
const ov = rd(ovPath)
// ⛔⛔ REBUILT FROM SCRATCH, NOT MERGED INTO. The first (untiered) merge left 9 patches
// behind, and three of them were places this pass classifies HOLD — Shawnee Elementary,
// closed by board vote in 2023, and Wink's and Bruno's, whose unit now trades as a third
// name. Merging tier-by-tier into an existing map would have let last night's version of
// a held record keep shipping underneath the decision to hold it: the tiering would read
// as applied while the thing it excluded was still on the map. ⭐ The research files are
// the source of truth for this key space; a survivor in it is a silent one.
ov.patches = {}
const tally = { CLEAN: 0, CAVEATED: 0, HOLD: 0 }
const skipped = []
const worklist = { CAVEATED: [], HOLD: [], RELABEL: [] }
let merged = 0, keys = 0

for (const [id, { beat, rec, tier, why, n }] of best) {
  tally[tier]++
  const base = byId.get(id)
  if (tier === 'HOLD' || n === 0) {
    if (tier === 'HOLD') worklist.HOLD.push({ id, name: base.name, beat, why })
    continue
  }
  if (tier === 'CAVEATED') worklist.CAVEATED.push({ id, name: base.name, beat, fields: shippingFields(rec).join(', '), why })
  const rel = RELABEL_KEYS.find(k => rec[k])
  if (rel) worklist.RELABEL.push({ id, name: base.name, why: `${rel}: ${String(rec[rel]).slice(0, 200)}` })
  // ⛔⛔ NAME ALONE IS NOT THE KEY, AND MATCHING ON IT SHIPS ANOTHER BRANCH'S HOURS.
  // huron has two Shells, two Mobils and three Blue Rhino cages — different forecourts,
  // different addresses, one name each. A name-only lookup wrote every same-named GERS
  // key for every one of them, so the last record written won and a station could carry
  // the hours researched at a different station, perfectly formatted. ⭐ This is exactly
  // the "wrong branch, better-formed than the right answer" trap one of the beats named,
  // committed by the merge that was reporting on it. ⇒ disambiguate on ADDRESS too, and
  // ⛔ when that still leaves the choice ambiguous, SKIP LOUDLY rather than guess.
  const sameName = ovt.filter(p => norm(p.name) === norm(base.name))
  const sameAddr = sameName.filter(p => norm(p.address) === norm(base.address))
  const cands = sameName.length > 1 ? sameAddr : sameName
  if (!cands.length) {
    console.log(`  ⛔ "${base.name}" (${base.address || 'no address'}) — ${sameName.length} same-named Overture places, none at this address. SKIPPED, not guessed.`)
    skipped.push({ id, name: base.name, why: `${sameName.length} same-named Overture places, none at this address` })
    continue
  }
  const payload = { ...rec, _beat: beat, _tier: tier, _display_id_at_research: id, _match_name: base.name }
  if (payload.menu) payload.menu = menuToCents(payload.menu)
  // ⛔⛔ AN ALLOWLIST, NOT "ANYTHING WITHOUT AN UNDERSCORE". A deep pass shipped a field
  // literally named `⛔_WARNING` — it begins with the glyph, not the underscore, so a
  // denylist waved a paragraph of agent commentary straight into the slab. ⭐ A denylist
  // lets every NEW shape through silently, which is the whole failure mode this kit is
  // built against; an allowlist fails the other way, and a field we forgot to list is a
  // missing feature rather than leaked prose.
  const ship = {}
  for (const k of Object.keys(payload)) {
    if (k.startsWith('_')) { ship[k] = payload[k]; continue }   // provenance: kept HERE, stripped by stripMeta before the slab
    if (!SHIPPING.has(k)) { console.log(`  ⚠️  ${base.name}: dropped unknown field ${JSON.stringify(k)} — not in the shipping allowlist`); continue }
    ship[k] = stripDeep(payload[k])
  }
  Object.keys(payload).forEach(k => delete payload[k])
  Object.assign(payload, ship)
  for (const c of cands) { ov.patches[`ovt-${c.id}`] = payload; keys++ }
  merged++
}

ov._comment_research = `Place-card research, 2026-09-21/22 — nine beats, 311 records over 278 of 285 listings. ⛔ KEYED BY \`ovt-<GERS>\`, NOT by the \`huro-lst-NNNN\` display id the researchers used: display ids are assigned at bake time and shift; \`applyListingOverrides\` matches on \`_key\`. ⭐ MERGED IN TIERS, and \`_tier\` records which: CLEAN = the agent hedged nothing · CAVEATED = merged WITH the agent's own hedge kept in \`_confidence\` (seasonal, aggregator-sourced, sources disagree) · HOLD = not merged at all, because the PLACE's existence or identity is in doubt and hours on a listing that may not exist is the worst outcome of the three. ⛔ The hedges are not noise to strip — they are the Host's worklist (see scratch/huron-research/HOST-WORKLIST.md): each one is a question Francesca can ask the business, or the thing a guardian will correct when they claim the card. Provenance is stripped by \`stripMeta\` before the slab.`
fs.writeFileSync(ovPath, JSON.stringify(ov, null, 2) + '\n')

console.log(`\n  distinct listings researched: ${best.size}`)
console.log(`  CLEAN    ${String(tally.CLEAN).padStart(3)}  merged as-is`)
console.log(`  CAVEATED ${String(tally.CAVEATED).padStart(3)}  merged, hedge kept`)
console.log(`  HOLD     ${String(tally.HOLD).padStart(3)}  NOT merged — place in doubt`)
console.log(`  → ${merged} listings patched via ${keys} keys`)
if (skipped.length) { console.log(`  ⛔ ${skipped.length} skipped rather than guessed:`); skipped.forEach(s => console.log(`      ${s.name} — ${s.why}`)) }

// ── the Host's worklist ───────────────────────────────────────────────────
const md = [
  '# Huron — the Host\'s worklist',
  '',
  '*Generated from the research beats, 2026-09-22. ⛔ Not a defect list — a **question** list.*',
  '',
  '⭐ Every line here is something the web could not settle and a person standing in Huron can, in one conversation. That is the division of labour the product already assumes: the kit pours a strong first draft, the **Host** corrects the directory in bulk, and the **business** claims its own card and fixes the rest. A hedge is not a failure of the research — it is the research telling the Host where to go.',
  '',
  `## ⛔ Ask before anything else — ${worklist.HOLD.length} places whose existence or identity is in doubt`,
  '',
  '*Not merged. Hours on a listing that may not exist is worse than an empty listing, because it makes the map look better stocked than the town is.*',
  '',
  '| listing | question for the Host |',
  '|---|---|',
  ...worklist.HOLD.map(w => `| **${w.name}** \`${w.id}\` | ${String(w.why || '').replace(/\|/g, '／').replace(/\n/g, ' ').slice(0, 230)} |`),
  '',
  `## Merged, but the researcher hedged — ${worklist.CAVEATED.length} places worth confirming`,
  '',
  '*These are live on the map now. Each carries the hedge in `_confidence` in the overrides file. ⭐ The commonest by far is **unmarked seasonal hours** — correct for the month they were sampled and silently wrong the rest of the year, which on a Lake Erie town is half the calendar.*',
  '',
  '| listing | fields | what to confirm |',
  '|---|---|---|',
  ...worklist.CAVEATED.map(w => `| **${w.name}** \`${w.id}\` | ${w.fields} | ${String(w.why || '').replace(/\|/g, '／').replace(/\n/g, ' ').slice(0, 200)} |`),
  '',
  `## The record is mis-labelled — ${worklist.RELABEL.length} names or categories to correct`,
  '',
  '*The data merged fine; the listing is filed under the wrong name or the wrong kind of place. ⭐ A private apartment complex filed as a historic landmark is the one to fix first — shipping a private address as a public attraction is worse than a wrong hour.*',
  '',
  '| listing | correction |',
  '|---|---|',
  ...worklist.RELABEL.map(w => `| **${w.name}** \`${w.id}\` | ${String(w.why).replace(/\|/g, '／').replace(/\n/g, ' ').slice(0, 220)} |`),
  '',
]
fs.writeFileSync('scratch/huron-research/HOST-WORKLIST.md', md.join('\n'))
console.log(`  → scratch/huron-research/HOST-WORKLIST.md (${worklist.HOLD.length} to ask about, ${worklist.CAVEATED.length} to confirm)`)
