#!/usr/bin/env node
/**
 * claims-the-publish-button-can-say-it-is-done — its condition measures what it ships.
 *
 * ⛔⛔ A BUTTON THAT CAN NEVER REACH ITS DONE STATE IS WORSE THAN ONE WITH NO STATE.
 * The operator presses it, it succeeds, and the panel says exactly what it said before —
 * so the only way to find out whether anything shipped is to go and look, which is the
 * question the panel exists to answer.
 *
 * Instance, 2026-09-21: `stagingDone` read `aheadStaging === 0`, a commit count against
 * the branch `staging.yml` used to deploy. Staging became a direct upload to R2 that
 * morning and the push was retired, so the count never returned to zero — 18 that evening
 * — and "Published to Staging" became unreachable however many times the publish worked.
 * (Jacob: "it's hard to tell.") ⭐ The condition had not been re-derived when the thing it
 * measured was removed, which is the ordinary way a gate rots.
 *
 * PINNED HERE, from source: the staging condition does not depend on a branch commit count, and measures what a
 * staging Publish ships — THE SLAB and the deployment it carries. ⭐ Not the player: the player is the Ward's, which
 * publishes itself; Promote waits on it (checks/claims-promote-waits-on-the-towns-own-player.mjs). ⛔ It used to measure
 * the retired legacy player's build marker too, so the button stayed undone until that player was rebuilt (2026-11-01).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe Publish button can reach its done state, and measures what it ships')

// ── 1. The staging condition.
const panel = read('src/preview/PreviewApp.jsx')
const m = panel.match(/const stagingDone\s*=\s*([^\n]+)/)
if (!m) {
  bad('src/preview/PreviewApp.jsx no longer declares `stagingDone` — update this check.')
} else {
  // ⭐ The condition names its half (`stagingSlab`), because the button's LABEL says what it will ship.
  const half = (name) => (panel.match(new RegExp(`const ${name}\\s*=\\s*([^\\n]+)`)) || [])[1] || ''
  const cond = `${m[1]} ${half('stagingSlab')}`
  if (/ahead\w*\s*===\s*0/.test(cond)) {
    bad(`\`stagingDone\` depends on a branch commit count — ${cond.trim()}\n`
      + '       Staging does not ship by branch any more, so that count never reaches 0 and the\n'
      + '       button can never say "Published to Staging".')
  } else ok('`stagingDone` does not depend on a branch commit count')
  for (const [what, re] of [['the slab', /slabCurrent\(\s*'staging'\s*\)/], ['the deployment the slab carries', /status\.deployment\?\.shipped/]]) {
    if (re.test(cond)) ok(`it measures ${what}`)
    else bad(`\`stagingDone\` does not measure ${what} — a staging publish ships it, so the button `
      + 'would report done while that half is behind.')
  }
  if (/playerCurrent|stagingPlayer\b/.test(cond)) bad('`stagingDone` waits on a player — Publish ships no player (the Ward publishes itself), so the button would wait on something it never ships')
  else ok('it waits on nothing Publish does not ship')
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ the publish button can say it is done\n')
process.exit(failed ? 1 : 0)
