#!/usr/bin/env node
/**
 * claims-no-listing-links-to-a-hijacked-domain — a URL a researcher condemned may not ship.
 *
 * ⛔⛔ A LOCAL BUSINESS'S DOMAIN LAPSES AND SOMEONE ELSE REGISTERS IT, and what answers is
 * not a dead page — it is a live site at HTTP 200. Measured on huron, 2026-09-22: three
 * listings shipped links to offshore gambling sites. `riverviewlanes.com` (a bowling alley,
 * and the café inside it) 301s every path to `abutotomacau.com`; `CostaAzulMexican.com`
 * 200s through to an Indonesian toto site with zero occurrences of "Huron"; Civista Bank's
 * `citizensbankco.com` 301s to `joker123.co.uk`, **which then answers 520 with a 16-byte
 * body — so a status-only checker logs "site down" and never sees where it pointed.**
 *
 * ⭐ EVERY REACHABILITY CHECK PASSES ALL OF THEM. Liveness is not identity, and this is the
 * form of that lesson with real consequences: a client opens the map of their town and a
 * bowling alley links to a casino.
 *
 * ⭐ THIS CHECK IS OFFLINE AND READS THE RESEARCH, NOT THE NETWORK. The agents already did
 * the fetching and wrote what they found into `_url_finding` / `_url_correction`. So the
 * rule is: **a URL any beat condemned must not appear in any scene's shipped `website`.**
 * ⛔ It cannot discover a NEW hijack — nothing offline can — but it makes a known one
 * unrepeatable, and it survives a re-pour, which is when a correction would otherwise be
 * silently overwritten by fresh Overture data carrying the same stale URL.
 *
 * ⚠️ It also guards the mechanism the fix needed: a URL correction must outrank the HOLD
 * tier. Holding a record ships the BASE unchanged, so when the base is what is dangerous,
 * holding protects the danger — CUSH Cafe was held and kept its casino link until
 * corrections were allowed through. Removing a link asserts nothing about whether a place
 * exists, which is what makes that exception safe.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nNo listing links to a domain a researcher condemned')

// ⛔⛔ A DOMAIN IS CONDEMNED *FOR A LISTING*, NOT GLOBALLY — the first version of this check
// got that wrong and flagged 16, most of them correct listings. `huronhs.com` is the wrong
// site for a DENTIST and exactly the right one for Huron High School; `mesenburg.com` is
// wrong on the Donut Shop and right on Mesenburg Creative Catering. ⭐ It also condemned
// the REPLACEMENT, because the correction note names the new domain in the same sentence
// as the old one.
//
// ⭐ So the rule needs no domain parsing at all, and that is what makes it robust: a
// research record that CONDEMNS its listing's URL and proposes no `website` correction
// means that listing is still shipping a link its own researcher rejected. The record
// knows which listing it is about; nothing has to be inferred.
const CONDEMNS = /re-?registered|lapsed|gambling|casino|\btoto\b|hijack|MUST NOT SHIP|is not this business|does NOT point to this business|wrong business|another business|different (state|business|organisation|organization)|resolves to no|points at|NXDOMAIN|dead (domain|DNS)/i

// ⛔⛔ SEVERITY COMES FROM WHAT THE FINDING SAYS, AND THE DOMAIN WE STORE IS THE *SOURCE*,
// NOT THE DESTINATION. A first version denied `abutotomacau|jalanamavi|joker123` by name —
// the gambling sites — and a mutation restoring `riverviewlanes.com` sailed through it,
// because the destination is never what a listing holds. **We store the lapsed local
// domain; the casino is one redirect away.** ⭐ So a finding that names gambling condemns
// the DOMAINS THAT FINDING NAMES, for THAT listing — which keeps `huronhs.com` legal on a
// school and fatal on a dentist.
const GRAVE = /gambling|casino|\btoto\b|joker123|abutotomacau|jalanamavi/i

const reg = (u) => {
  try { return new URL(/^https?:\/\//i.test(u) ? u : `http://${u}`).hostname.replace(/^www\./i, '').toLowerCase() }
  catch { return null }
}

// listing id -> the finding that condemned it, for records that proposed no correction
const open_ = new Map()
const answered = new Set()
const grave = new Map()   // listing id -> domains its GRAVE finding names
for (const dir of readdirSync(path.join(ROOT, 'scratch')).filter(d => d.endsWith('-research'))) {
  const p = path.join(ROOT, 'scratch', dir)
  for (const f of readdirSync(p).filter(x => x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(path.join(p, f), 'utf8')) } catch { continue }
    for (const [k, r] of Object.entries(d)) {
      if (k.startsWith('_') || !r || typeof r !== 'object') continue
      if (r._url_correction || 'website' in r) answered.add(k)
      const why = [r._url_finding, r._wrong_domain, r._url_correction].filter(Boolean).join(' ')
      if (!why || !CONDEMNS.test(why)) continue
      // ⛔ THE CONDEMNATION ONLY — never `_url_correction`. A correction note names the OLD
      // and the NEW domain in one gambling-flavoured sentence, so feeding it here made the
      // check condemn its own fix: Civista failed on `civista.bank`, the verified
      // replacement. The finding accuses; the correction answers. Only the accusation
      // names a guilty domain.
      const accusation = [r._url_finding, r._wrong_domain].filter(Boolean).join(' ')
      if (accusation && GRAVE.test(accusation)) {
        const doms = [...accusation.matchAll(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)\b/gi)]
          .map(m => reg(m[1])).filter(Boolean)
        const cur = grave.get(k) || new Set()
        doms.forEach(d => cur.add(d)); grave.set(k, cur)
      }
      if (!open_.has(k)) open_.set(k, `${f}: ${why.replace(/\s+/g, ' ').slice(0, 150)}`)
    }
  }
}
// ⛔ ANSWERED IS A PROPERTY OF THE LISTING, NOT OF ONE RECORD. Civista was condemned by
// the photo beat and corrected by the services beat, and checking per-record reported it
// as still open while the fix was already shipping. A listing is answered when ANY beat
// proposed a website for it.
for (const k of answered) open_.delete(k)
ok(`${open_.size} listing(s) carry an UNANSWERED URL condemnation · ${answered.size} already corrected`)

let scenes = 0
for (const scene of readdirSync(path.join(ROOT, 'cartograph/data'))) {
  const lp = path.join(ROOT, 'cartograph/data', scene, 'content/listings.json')
  if (!existsSync(lp)) continue
  scenes++
  const raw = JSON.parse(readFileSync(lp, 'utf8'))
  const arr = Array.isArray(raw) ? raw : (raw.listings || [])

  // ⛔ TIER 1 — a destination nothing may ever link to. This is the one that must never
  // regress: it is what put a casino on a bowling alley's card.
  const never = arr.filter(l => l.website && grave.get(l.id)?.has(reg(l.website)))
  for (const l of never) bad(`${scene}: "${l.name}" (${l.id}) ships ${l.website}\n` +
    `       Its own research names this domain in a GAMBLING finding — the domain lapsed and what answers now is a live casino at HTTP 200.\n` +
    `     ▶ Set \`website\` on that research record to the correct URL, or to null when nothing replaces it.`)
  if (!never.length) ok(`${scene}: no listing ships a domain its research tied to a gambling redirect`)

  // ⚠️ TIER 2 — its own researcher condemned this listing's URL and proposed nothing. Not
  // a failure: it is the queue, and it is reported so it cannot be forgotten.
  const stale = arr.filter(l => l.website && open_.has(l.id))
  if (stale.length) {
    console.log(`  ⚠️  ${scene}: ${stale.length} listing(s) still ship a URL their own researcher condemned, with no correction proposed:`)
    for (const l of stale.slice(0, 6)) console.log(`       ${l.name} — ${l.website}\n         ${open_.get(l.id)}`)
    if (stale.length > 6) console.log(`       …and ${stale.length - 6} more`)
    console.log(`     ▶ Each needs a \`website\` on its research record: the correct URL, or null when nothing replaces it.`)
  }
}
if (!scenes) bad('no scenes found — the check is looking in the wrong place')

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
