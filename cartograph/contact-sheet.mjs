#!/usr/bin/env node
/**
 * contact-sheet — LOOK AT THE WHOLE TOWN AT ONCE.
 *
 * ⛔⛔ THE CONTENT HAD NO OPERATOR SURFACE AT ALL. 285 listings, 200 of them enriched by
 * nine research beats, 63 photo URLs — and the only way to inspect any of it was to click
 * a pin on the map and hope (Jacob, 2026-09-22: *"there's not much for me to preview
 * though… short of randomly clicking on things and seeing what pops up"*). ⭐ "What does
 * this town's directory actually look like?" is a question every poured town raises, so
 * the answer is a tool rather than a one-off query.
 *
 * ⭐⭐ AND IT IS A CHECK AS WELL AS A VIEW, WHICH IS THE POINT. We hold photo URLs and
 * have never loaded one. The sheet references them exactly as the product would — ⛔ it
 * does not download or rehost anything — so a dead link, a hotlink block or an image that
 * turns out to be the wrong building shows up as a broken tile the moment the page opens.
 * A `_source` we cannot render is not evidence of anything.
 *
 * ⛔ IT SHOWS WHAT IS MISSING AS LOUDLY AS WHAT IS THERE. A contact sheet of only the good
 * cards would misrepresent the town in the one direction that matters — the operator needs
 * to see the 85 listings that are still a name and an address, because that is the work.
 *
 * ⭐ IT IS A PERSISTENT HOST ASSET, NOT A THROWAWAY (ruled by Jacob, 2026-09-22). It lives
 * in the repo at `host/<scene>/contact-sheet.html`, beside `worklist.md`, because those two
 * are the same job seen from two sides: the sheet is what the town LOOKS like, the worklist
 * is what to ask about. ⛔ Regenerate it rather than editing it — it is derived from
 * `content/listings.json`, and a hand-edit would be a fact with no source.
 *
 * ▶ node cartograph/contact-sheet.mjs --scene=huron
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { requireExplicitMap } from './scene.js'

const SCENE = requireExplicitMap('contact-sheet')
const ROOT = path.resolve(import.meta.dirname, '..')

const lp = path.join(ROOT, 'cartograph/data', SCENE, 'content/listings.json')
if (!existsSync(lp)) { console.error(`⛔ no content/listings.json for scene "${SCENE}"`); process.exit(2) }
const raw = JSON.parse(readFileSync(lp, 'utf8'))
const listings = Array.isArray(raw) ? raw : (raw.listings || [])

// The overrides carry the tier and the researcher's hedge. ⭐ Joined by NAME because the
// overrides are keyed by GERS and the baked listing is not — and a hedge the operator
// cannot see is a hedge that does no work.
const op = path.join(ROOT, 'cartograph/data', SCENE, 'content/listings.overrides.json')
const meta = new Map()
if (existsSync(op)) {
  for (const p of Object.values(JSON.parse(readFileSync(op, 'utf8')).patches || {})) {
    if (p._match_name) meta.set(p._match_name, { tier: p._tier, why: p._confidence, beat: p._beat })
  }
}

// ⛔ The same order the product uses, read from the product's own module — so the sheet
// shows the directory as a visitor meets it, not a separate ranking that could drift.
const { orderListings, listingDepth } = await import(path.join(ROOT, 'src/lib/listingOrder.js'))
const ordered = orderListings(listings)

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const hoursLine = h => !h || !Object.keys(h).length ? '' :
  DAYS.filter(d => h[d]?.open).map(d => `${d.slice(0, 2)} ${h[d].open}–${h[d].close}`).join(' · ')

const card = (l) => {
  const m = meta.get(l.name) || {}
  const photos = l.photos || []
  const d = listingDepth(l)
  const menuItems = (l.menu?.sections || []).reduce((a, s) => a + (s.items || []).length, 0)
  const chips = [
    photos.length && `${photos.length} photo${photos.length > 1 ? 's' : ''}`,
    menuItems ? `${menuItems}-item menu` : (l.menu?.url && 'menu link'),
    Object.keys(l.hours || {}).length && 'hours',
    l.description && 'description',
    l.history && 'history',
    (l.amenities || []).length && `${l.amenities.length} amenities`,
  ].filter(Boolean)
  return `<article class="c ${d === 0 ? 'bare' : ''}">
  <header><b>${esc(l.name)}</b>
    <span class="r">#${l.prominence_rank ?? '—'} · depth ${d}</span></header>
  <div class="a">${esc(l.address || 'no address')}${l.phone ? ' · ' + esc(l.phone) : ''} · <i>${esc(l.category || 'uncategorised')}</i></div>
  ${photos.length ? `<div class="ph">${photos.map(p => {
    const u = typeof p === 'string' ? p : p.url
    return `<a href="${esc(u)}" target="_blank" rel="noreferrer"><img loading="lazy" src="${esc(u)}" alt="" title="${esc((typeof p === 'object' && (p.what || p.credit)) || u)}" onerror="this.closest('a').classList.add('dead')"></a>`
  }).join('')}</div>` : ''}
  ${l.description ? `<p>${esc(l.description)}</p>` : ''}
  ${hoursLine(l.hours) ? `<div class="h">${esc(hoursLine(l.hours))}</div>` : ''}
  <div class="k">${chips.map(c => `<span>${esc(c)}</span>`).join('')}${d === 0 ? '<span class="warn">a name and an address, nothing more</span>' : ''}</div>
  ${m.tier === 'CAVEATED' && m.why ? `<details class="w"><summary>⚠ the researcher hedged this</summary>${esc(m.why)}</details>` : ''}
</article>`
}

const withPhotos = ordered.filter(l => (l.photos || []).length).length
const bare = ordered.filter(l => listingDepth(l) === 0).length
const urls = ordered.reduce((a, l) => a + (l.photos || []).length, 0)

const html = `<!doctype html><meta charset="utf-8"><title>${esc(SCENE)} — contact sheet</title>
<style>
:root{--bg:#faf9f7;--fg:#1a1a1a;--dim:#6b6b6b;--line:#e2ded8;--warn:#9a6a00}
@media(prefers-color-scheme:dark){:root{--bg:#141414;--fg:#e8e6e3;--dim:#9a9a9a;--line:#2e2e2e;--warn:#d4a24c}}
*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bg);color:var(--fg);
font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--dim);margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.c{border:1px solid var(--line);border-radius:10px;padding:12px;background:color-mix(in srgb,var(--bg) 92%,var(--fg))}
.c.bare{opacity:.55}
header{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.r{color:var(--dim);font-size:12px;white-space:nowrap}
.a{color:var(--dim);font-size:12px;margin:2px 0 8px}
.ph{display:flex;gap:6px;overflow-x:auto;margin-bottom:8px;padding-bottom:4px}
.ph img{height:96px;width:auto;border-radius:6px;display:block;background:var(--line)}
.ph a.dead{position:relative;display:block;min-width:120px;height:96px;border:1px dashed var(--warn);border-radius:6px}
.ph a.dead::after{content:"⛔ image did not load";position:absolute;inset:0;display:grid;place-items:center;
font-size:11px;color:var(--warn);text-align:center;padding:4px}
.ph a.dead img{display:none}
p{margin:0 0 8px}.h{font-size:12px;color:var(--dim);margin-bottom:8px}
.k{display:flex;flex-wrap:wrap;gap:4px}.k span{font-size:11px;border:1px solid var(--line);
border-radius:999px;padding:1px 8px;color:var(--dim)}
.k .warn{color:var(--warn);border-color:var(--warn)}
details.w{margin-top:8px;font-size:12px;color:var(--warn)}summary{cursor:pointer}
@media(max-width:640px){body{padding:16px}.grid{grid-template-columns:1fr}}
</style>
<h1>${esc(SCENE)} — every listing, in the order a visitor meets them</h1>
<div class="sub">${ordered.length} listings · ${withPhotos} with photographs (${urls} image URLs, loaded live from wherever they are published) ·
${bare} are a name and an address and nothing more · generated ${new Date().toISOString().slice(0, 10)}<br>
⛔ A tile marked “image did not load” is a URL we hold that a browser cannot fetch — a dead link, a hotlink block, or an image that was never there.</div>
<div class="grid">${ordered.map(card).join('\n')}</div>`

const out = path.join(ROOT, 'host', SCENE, 'contact-sheet.html')
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, html)
console.log(`  ${ordered.length} listings · ${withPhotos} with photographs (${urls} URLs) · ${bare} bare`)
console.log(`  ▶ open ${path.relative(ROOT, out)}`)
