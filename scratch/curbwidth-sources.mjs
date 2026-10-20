// READ-ONLY (Boz, 2026-10-19 — the JH "NO curbWidth" warning): which Looks author a curb width, and every code site that,
// given none, substitutes one. Reads the Looks and greps the source; changes nothing.   node scratch/curbwidth-sources.mjs
import fs from 'node:fs'
const looks = JSON.parse(fs.readFileSync('public/looks/index.json', 'utf8')).looks
console.log('Looks — authored curbWidth (design.json):')
for (const l of looks) { const p = `public/looks/${l.id}/design.json`, d = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
  console.log(`   ${l.id.padEnd(20)} scene ${String(l.scene ?? '—').padEnd(18)} ${d == null ? 'no design.json' : Number.isFinite(d.curbWidth) ? d.curbWidth : '⛔ NONE'}`) }
// a substitution: the authored value tested, and a constant used in its absence (CURB_WIDTH, or its literal 0.1524)
const RX = /curbWidth[^\n]*(\?\?|\?)[^\n]*(CURB_WIDTH|0\.1524)|curbWidth\s*=\s*CURB_WIDTH/
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['node_modules', '_archive'].includes(e.name) ? [] : walk(`${d}/${e.name}`)) : /\.(m?js|jsx)$/.test(e.name) ? [`${d}/${e.name}`] : [])
console.log('\nCode sites that substitute a curb width when none is given:')
for (const f of [...walk('src'), ...walk('cartograph'), 'scratch/_proto-feed.mjs']) fs.readFileSync(f, 'utf8').split('\n').forEach((s, i) => { if (RX.test(s)) console.log(`   ${f}:${i + 1}  ${s.trim().slice(0, 150)}`) })
console.log('\nThe constant: ' + fs.readFileSync('src/cartograph/streetProfiles.js', 'utf8').split('\n').find(s => /export const CURB_WIDTH/.test(s)).trim())
