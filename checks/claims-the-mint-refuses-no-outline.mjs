#!/usr/bin/env node
// CLAIM — THE MINT REFUSED NO NODE'S OUTLINE. Where ① cannot build a node's outline (an acute meeting, a degenerate one, or a
// node with no vertex to sit on) it keeps the plain offsets and the node gets no spokes, so the absorption has nothing to split
// its ink by there (`tileGround.js#mintProtopolygon`). That was only printed. RULED (Boz, 2026-10-26): "pour on, but RED" — the
// pour continues, the mint freezes each refusal (`protopolygon.outlineRefused`, { acute, degenerate, noVertex }, each
// { at, who }) and this check is RED on any entry, loud to the Bake gate and every reader.
//   Read off each town's frozen ① (`ribbons.json` → protopolygon) — light, no build.
//   RED on any entry · RED on a town whose ① carries no `outlineRefused` (a pour before the freeze: re-pour).
//   MUTANT (always run, in memory): a clean record with one acute entry planted must read RED; an empty one must read GREEN.
//   node checks/claims-the-mint-refuses-no-outline.mjs [--scene=<town> …]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, ribbonsPath, ribbonScenes } from './_scenes.mjs'

const KINDS = ['acute', 'degenerate', 'noVertex']
const judge = (R) => { if (!R || typeof R !== 'object') return { missing: true, n: 0, list: [] }
  const list = KINDS.flatMap(k => (R[k] || []).map(e => ({ k, ...e }))); return { missing: false, n: list.length, list } }

let red = 0, towns = 0
{ const empty = judge({ acute: [], degenerate: [], noVertex: [] }), planted = judge({ acute: [{ at: [1, 2], who: 'a|b@planted' }], degenerate: [], noVertex: [] })
  const ok = empty.n === 0 && !empty.missing && planted.n === 1
  if (!ok) red++
  console.log(`${ok ? '✅' : '⛔'} mutant: an empty record reads ${empty.n} (GREEN), one with a planted acute entry reads ${planted.n} (RED as it must be)`) }
for (const scene of ribbonScenes()) {
  const rp = join(ROOT, ribbonsPath(scene)); if (!existsSync(rp)) continue
  const P = JSON.parse(readFileSync(rp, 'utf8')).protopolygon; if (!P) continue
  towns++
  const J = judge(P.outlineRefused)
  if (J.missing) { console.log(`⛔ ${scene}: its ① carries no outlineRefused — a pour before the freeze. Re-pour.`); red++; continue }
  if (J.n) red++
  console.log(`${J.n ? '⛔' : '✅'} ${scene}: ${J.n} node outline(s) refused${J.n ? ` — ${KINDS.map(k => `${J.list.filter(e => e.k === k).length} ${k}`).join(' · ')} (e.g. ${J.list.slice(0, 4).map(e => `${e.k} ${e.who ?? '?'} at (${e.at.map(v => v.toFixed(3)).join(', ')})`).join(' · ')})` : ''}`)
}
if (!towns) { console.log('⛔ no town carries a ① — nothing checked'); red++ }
console.log(red ? `\n⛔ ${red} RED` : '\n✅ the mint refused no node\'s outline')
process.exit(red ? 1 : 0)
