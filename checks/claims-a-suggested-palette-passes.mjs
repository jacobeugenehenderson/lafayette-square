#!/usr/bin/env node
/**
 * claims-a-suggested-palette-passes.mjs — DOES WHAT STAGE SUGGESTS FROM A MARK CLEAR THE PLAYER'S RULES?
 *
 * The Identity panel's "Suggest from mark" (src/cartograph/suggestFromMark.js) proposes an accent, a lit tint and a
 * neon set from the emoji's colours. Asserted on committed ink fixtures (checks/fixtures/mark-ink.json — measured by
 * src/lib/glyphInk.js on one device; re-measure with the command in that file's `by`):
 *   HARD (src/lib/colourPolicy.js — what sits on the player's grounds; Warden, 2026-09-28):
 *   · the kit's NEUTRAL set's chips (detail forms) clear the edge floor on every ground (it serves every town that
 *     chose nothing — it cannot be the one palette that fails);
 *   · every suggested accent clears the text floor, every category's chip the edge floor, on every ground (the neon
 *     TUBE is on the map — measured by the legibility report, not held here);
 *   · the neon set keeps the neutral set's own minimum separation (D_SEP, measured from it, printed);
 *   · a mark with no colour proposes the Ward's DEFAULT (accent un-chosen, the neutral tint and neon), labelled as such;
 *   · the same ink gives the same proposal.
 *   ADVISORY (ADVISE, NEVER BEND): every colour carries its closest approach to a meaning colour, flagged within D_SEM —
 *   printed here, asserted computed, never required to be clear.
 * ⭐ MUTATION-TESTED EVERY RUN: an accent without its lightness solve (the mark's raw colour) must fail the text floor;
 *    a proposal with its advisory stripped must fail.
 *
 *   node checks/claims-a-suggested-palette-passes.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { suggestFromMark, markColours, D_SEP: SUGGESTER_D_SEP } = await import(join(ROOT, 'src/cartograph/suggestFromMark.js'))
const { D_SEM } = await import(join(ROOT, 'src/lib/colourPolicy.js'))
const { NEUTRAL_CATEGORY_NEON, detailOf } = await import(join(ROOT, 'src/lib/categoryColor.js'))
const { contrast, deltaE } = await import(join(ROOT, 'src/lib/colourMath.js'))
const { GROUNDS, CONTRAST } = await import(join(ROOT, 'src/tokens/playerChrome.js'))
const fixtures = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/mark-ink.json'), 'utf8'))

const minC = (hex) => Math.min(...Object.values(GROUNDS).map((g) => contrast(hex, g)))
const minSep = (hexes) => { let m = Infinity; for (let i = 0; i < hexes.length; i++) for (let j = i + 1; j < hexes.length; j++) m = Math.min(m, deltaE(hexes[i], hexes[j])); return m }
const fails = []

// The neutral set — hard floor.
for (const [k, hex] of Object.entries(NEUTRAL_CATEGORY_NEON)) {
  if (minC(detailOf(hex)) < CONTRAST.edge) fails.push(`neutral detail ${k} ${detailOf(hex)} is ${minC(detailOf(hex)).toFixed(2)}:1 — under ${CONTRAST.edge}:1`)
}
const D_SEP = minSep(Object.values(NEUTRAL_CATEGORY_NEON))
if (Math.abs(D_SEP - SUGGESTER_D_SEP) > 1e-12) fails.push(`the suggester's D_SEP ${SUGGESTER_D_SEP} is not the neutral set's own ${D_SEP}`)
console.log(`neutral set: 11 chips ≥ ${CONTRAST.edge}:1 on ${Object.keys(GROUNDS).join(' + ')} · D_SEP (its own minimum separation) ${D_SEP.toFixed(3)}`)

/** The hard assertions on one proposal; returns failures. */
function audit(glyph, r) {
  const out = []
  if (!r.accent?.hex || minC(r.accent.hex) < CONTRAST.text) out.push(`${glyph} accent ${r.accent?.hex} under ${CONTRAST.text}:1`)
  for (const [k, n] of Object.entries(r.neon))
    if (!n.detail || minC(n.detail) < CONTRAST.edge) out.push(`${glyph} ${k}'s chip ${n.detail} under ${CONTRAST.edge}:1`)
  const sep = minSep(Object.values(r.neon).map((n) => n.hex))
  if (sep < D_SEP - 1e-9) out.push(`${glyph} neon set's closest pair ΔE ${sep.toFixed(3)} < D_SEP ${D_SEP.toFixed(3)}`)
  for (const [what, a] of [['accent', r.accent.advisory], ['lit tint', r.litTint.advisory], ...Object.entries(r.neon).flatMap(([k, n]) => [[k, n.advisory], [`${k} chip`, n.detailAdvisory]])])
    if (!a?.closest || typeof a.flagged !== 'boolean') out.push(`${glyph} ${what} carries no closest-meaning advisory`)
  return out
}

let lastProposal = null
for (const [glyph, ink] of Object.entries(fixtures.glyphs)) {
  const r = suggestFromMark(ink)
  if (JSON.stringify(r) !== JSON.stringify(suggestFromMark(ink))) fails.push(`${glyph}: the same ink gave two proposals`)
  if (r.none) {
    const d = r.default
    if (!d || d.accent !== null || Object.keys(d.neon || {}).length !== Object.keys(NEUTRAL_CATEGORY_NEON).length || Object.entries(d.neon).some(([k, n]) => n.hex !== NEUTRAL_CATEGORY_NEON[k]))
      fails.push(`${glyph}: no colour, but the proposal is not the Ward's default`)
    console.log(`${glyph}  ${r.none}`); continue
  }
  fails.push(...audit(glyph, r))
  lastProposal = { glyph, r }
  const adv = (a) => `${a.closest.name} ${a.closest.deltaE}${a.flagged ? ` ⚑${a.clear ? ` (clear: ${a.clear})` : ''}` : ''}`
  console.log(`${glyph}  accent ${r.accent.hex} (${minC(r.accent.hex).toFixed(2)}:1; nearest ${adv(r.accent.advisory)}) · tint ${r.litTint.color} (nearest ${adv(r.litTint.advisory)}) · neon anchored on ${r.anchor}, rotated ${r.rotation.toFixed(1)}°`)
  console.log(`     closest meaning per category (tube / chip): ${Object.entries(r.neon).map(([k, n]) => `${k} ${adv(n.advisory)} / ${adv(n.detailAdvisory)}`).join(' · ')}`)
}
// A colourless mark must say so: the fixture set must hold one, or that path is untested.
if (!Object.values(fixtures.glyphs).some((ink) => markColours(ink).none)) fails.push('no colourless fixture — the "no colour" path is untested')

// Mutations.
if (lastProposal) {
  const { glyph, r } = lastProposal
  const raw = markColours(fixtures.glyphs[glyph]).clusters[0].hex
  const m1 = audit(glyph, { ...r, accent: { ...r.accent, hex: raw } })
  const m2 = audit(glyph, { ...r, accent: { ...r.accent, advisory: undefined } })
  console.log(`   mutation (accent without its lightness solve: ${raw}, ${minC(raw).toFixed(2)}:1) ${m1.length ? 'caught ✓' : 'NOT caught'}`)
  console.log(`   mutation (advisory stripped) ${m2.length ? 'caught ✓' : 'NOT caught'}`)
  if (!m1.length) fails.push('MUTATION NOT CAUGHT: an accent without its lightness solve passes (or the mark\'s raw colour already clears 7:1 — pick a fixture whose does not)')
  if (!m2.length) fails.push('MUTATION NOT CAUGHT: a proposal without its advisory passes')
}
console.log(`   advisory distance D_SEM: chrome ${D_SEM.chrome}, map ${D_SEM.map} (⚑ = within it — the operator's call, not a failure)`)
for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? `\n⛔ FAIL — ${fails.length}` : '\n✅ PASS — every suggestion clears the contrast floors; meaning distance is advised, never enforced')
process.exit(fails.length ? 1 : 0)
