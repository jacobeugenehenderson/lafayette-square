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
 * TWO THINGS ARE PINNED HERE, both from source:
 *  1. The staging condition does not depend on a branch commit count, and does depend on
 *     BOTH artifacts a staging publish ships — the slab and the shared player.
 *  2. `serve.js` and `scripts/publish-player-to-staging.mjs` agree about what the player's
 *     sources ARE. They answer the same question from two ends — "is the published player
 *     behind?" and "must I rebuild?" — and a drift between the lists is a button that
 *     lies in whichever direction the shorter list is short.
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
  const cond = m[1]
  if (/ahead\w*\s*===\s*0/.test(cond)) {
    bad(`\`stagingDone\` depends on a branch commit count — ${cond.trim()}\n`
      + '       Staging does not ship by branch any more, so that count never reaches 0 and the\n'
      + '       button can never say "Published to Staging".')
  } else ok('`stagingDone` does not depend on a branch commit count')
  for (const [what, re] of [['the slab', /slabCurrent\(\s*'staging'\s*\)/], ['the player', /playerCurrent/]]) {
    if (re.test(cond)) ok(`it measures ${what}`)
    else bad(`\`stagingDone\` does not measure ${what} — a staging publish ships it, so the button `
      + 'would report done while that half is behind.')
  }
}

// ── 2. The two source lists must agree.
const grabList = (src, file) => {
  const g = src.match(/const PLAYER_SRC = \[([^\]]*)\]/)
  if (!g) { bad(`${file} no longer declares PLAYER_SRC — the two ends cannot be compared.`); return null }
  return g[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
}
const a = grabList(read('cartograph/serve.js'), 'cartograph/serve.js')
const b = grabList(read('scripts/publish-player-to-staging.mjs'), 'scripts/publish-player-to-staging.mjs')
if (a && b) {
  const onlyA = a.filter((x) => !b.includes(x))
  const onlyB = b.filter((x) => !a.includes(x))
  if (onlyA.length || onlyB.length) {
    bad('the player-source lists have drifted, so the freshness gate and the rebuild gate '
      + 'disagree about what a change IS:')
    if (onlyA.length) console.log(`       serve.js only: ${onlyA.join(', ')}`)
    if (onlyB.length) console.log(`       publisher only: ${onlyB.join(', ')}`)
  } else ok(`both ends agree on the player's sources (${a.join(', ')})`)
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ the publish button can say it is done\n')
process.exit(failed ? 1 : 0)
