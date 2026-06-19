/**
 * forest-dashboard-html.js — a rendered, self-contained HTML view of the Forest
 * Builder readiness dashboard (§8) + library inventory (§4.5), so the Stage-1
 * work is EYE-ABLE in the browser with no server restart. Server-side rendered
 * (data baked in) → written to public/forest.html, which the vite front-end
 * serves at /forest.html. Regenerated on every ingest (like INVENTORY.md).
 *
 * This is the data dashboard, NOT the Stage-2 reference-driven viewer (§9) — it's
 * the quick visible surface over the matcher while the real viewer is built.
 */
import { writeFileSync } from 'fs'
import { computeReadiness } from './readiness.js'
import { computeInventory } from './library-inventory.js'

const OUT = 'public/forest.html'
const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const dot = (status) => `<span class="dot ${status}" title="${status}"></span>`

export function renderDashboardHTML() {
  const r = computeReadiness()
  const inv = computeInventory()

  const speciesRows = r.species.map(s => {
    const cell = (pt) => {
      const c = s.parts[pt]
      const star = c.diverges ? '<sup class="diverge" title="live matcher diverges from the dossier\'s declared availability">*</sup>' : ''
      const best = c.best ? `${esc(c.best.partId)} · ${c.best.verdict} ${(c.best.score * 100 | 0)}%` : '—'
      return `<td>${dot(c.status)}${star}<div class="sub">${esc(best)}</div></td>`
    }
    const build = s.buildableClean ? '<b class="clean">CLEAN</b>' : s.buildableWithStandins ? '<span class="standin">stand-in</span>' : '<b class="blocked">BLOCKED</b>'
    return `<tr><td class="sp">${esc(s.key)}<div class="sub">${s.count} trees</div></td>${cell('chassis')}${cell('bark')}${cell('leaf')}<td>${build}</td></tr>`
  }).join('')

  const list = (arr, fmt) => arr.length ? `<ul>${arr.map(fmt).join('')}</ul>` : '<p class="muted">none</p>'

  const leafRows = inv.leafSilhouettes.map(v => {
    const packs = inv.leaves.filter(l => l.silhouette === v)
    if (!packs.length) return `<tr><td><b>${v}</b></td><td>${dot('gap')} gap</td><td>—</td><td>${esc((inv.wantBy['leaf.silhouette'][v] || []).join(', '))}</td></tr>`
    return packs.map(p => `<tr><td>${v}</td><td>${esc(p.pack)}</td><td>${p.quality === 'vendor' ? '🟢 vendor' : '🟡 ' + esc(p.quality)}</td><td>${p.sizeCm ?? '?'}cm · ${esc((p.species || []).join(', '))}</td></tr>`).join('')
  }).join('')

  const barkRows = inv.barkTypes.map(v => {
    const got = inv.barks.filter(b => b.type === v)
    const want = (inv.wantBy['bark.type'][v] || []).join(', ')
    if (!got.length) return `<tr><td><b>${v}</b></td><td>${dot('gap')} gap</td><td>—</td><td>${esc(want)}</td></tr>`
    return got.map(b => `<tr><td>${v}</td><td>${esc(b.id)}</td><td>${esc(b.provenance)}</td><td>${esc(want)}</td></tr>`).join('')
  }).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Forest Builder — readiness</title>
<style>
:root{color-scheme:dark}
body{font:14px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;margin:0;background:#14171c;color:#e6e9ee}
.wrap{max-width:1000px;margin:0 auto;padding:28px 22px 60px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:30px 0 10px;color:#9fb0c3;text-transform:uppercase;letter-spacing:.06em}
.muted{color:#7c8a9a} .sub{font-size:11px;color:#7c8a9a;margin-top:2px}
table{border-collapse:collapse;width:100%} th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #232831;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#7c8a9a}
td.sp{font-weight:600}
.dot{display:inline-block;width:11px;height:11px;border-radius:50%;vertical-align:middle}
.dot.have{background:#3fb950} .dot.stretch{background:#d8a019} .dot.gap{background:#e5484d}
.clean{color:#3fb950} .standin{color:#d8a019} .blocked{color:#e5484d}
.diverge{color:#d8a019;font-weight:700}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}
.card{background:#1b1f26;border:1px solid #262c36;border-radius:8px;padding:12px 16px;flex:1;min-width:160px}
.card .n{font-size:26px;font-weight:700} .card.g .n{color:#3fb950} .card.y .n{color:#d8a019} .card.r .n{color:#e5484d}
ul{margin:6px 0;padding-left:18px} li{margin:2px 0}
.legend{font-size:12px;color:#7c8a9a;margin-top:6px}
</style></head><body><div class="wrap">
<h1>🌳 Forest Builder — readiness</h1>
<div class="legend">Live over ${r.partCount} parts · ${dot('have')} have (vendor-quality) &nbsp; ${dot('stretch')} stretch (stand-in/placeholder, buildable) &nbsp; ${dot('gap')} gap (no asset) &nbsp; <sup class="diverge">*</sup> = matcher diverges from declared</div>

<div class="cards">
  <div class="card g"><div class="n">${r.buildableClean.length}</div>buildable CLEAN<div class="sub">${esc(r.buildableClean.join(', '))}</div></div>
  <div class="card y"><div class="n">${r.buildableWithStandins.length}/10</div>buildable (w/ stand-ins)</div>
  <div class="card r"><div class="n">${r.blockers.length}</div>blockers</div>
</div>

<h2>Species</h2>
<table><tr><th>species</th><th>chassis</th><th>bark</th><th>leaf</th><th>build</th></tr>${speciesRows}</table>

<h2>🔴 Blockers — procure to build (${r.blockers.length})</h2>
${list(r.blockers, b => `<li><b>${esc(b.species)}</b> / ${esc(b.part)} — ${esc(b.reason)}</li>`)}

<h2>🟡 Upgrades — Stage-2/3 polish (${r.upgrades.length})</h2>
${list(r.upgrades, u => `<li>${esc(u.species)} / ${esc(u.part)}</li>`)}

<h2>Leaves (by silhouette)</h2>
<table><tr><th>silhouette</th><th>pack</th><th>quality</th><th>size · species</th></tr>${leafRows}</table>

<h2>Barks (by type)</h2>
<table><tr><th>type</th><th>asset</th><th>provenance</th><th>wanted by</th></tr>${barkRows}</table>

<p class="muted" style="margin-top:30px">Generated by <code>arborist/forest-dashboard-html.js</code> on ingest · live JSON at <code>:3334/readiness</code> · the Stage-2 reference-driven viewer (§9) is the next surface.</p>
</div></body></html>`
}

export function writeDashboardHTML() {
  writeFileSync(OUT, renderDashboardHTML())
  return OUT
}

if (process.argv[1] && process.argv[1].endsWith('forest-dashboard-html.js')) {
  console.log(writeDashboardHTML(), 'written')
}
