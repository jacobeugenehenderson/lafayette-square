#!/usr/bin/env node
/**
 * claims-the-publish-panel-reports-the-address-it-shipped — no site URL is a module constant.
 *
 * ⛔⛔ A TRUTHFUL "PUBLISHED ✓" THAT HANDS BACK ANOTHER TOWN'S ADDRESS IS THE WORST
 * OUTCOME THIS BUTTON HAS. The operator is told the pour succeeded — it did — and then
 * sends a partner a link to a different town. Nothing errors. (`CLAUDE.md` Layer 0 q2.)
 *
 * Instance, and it stood until 2026-09-21: `cartograph/serve.js` held `STAGING_SITE_URL`
 * and `PROD_SITE_URL` as module constants and printed both whatever look you shipped.
 * Press Publish on huron and the panel reported `…/lafayette-square-staging/` and
 * `lafayette-square.com`. Huron's `src/instances/huron.js` says `domain: null` — "no
 * deploy target yet" — so the second one was not merely misnamed, it was an address that
 * does not exist for that town.
 *
 * ⭐ THE RULE THIS PINS: a publish response's address is DERIVED FROM THE LOOK. The prod
 * side reads the town's own authored `domain` and returns `null` + a reason when there is
 * none; the staging side names the look on the shared site. ⛔ A bare site-URL literal
 * next to a publish response is the shape that regressed, so a literal is the finding.
 *
 * ⭐ It reads the source rather than a list of endpoints: any http(s) literal that looks
 * like a SITE (not an asset host, not a CDN) sitting in the publish server is checked for
 * whether a per-look deriver exists to explain it. One exemption, named in the code and
 * re-stated here because an unexplained exemption is how the constant comes back:
 * `LS_PROD_SITE_URL` is Lafayette Square's own domain, used only by `/og-deployed`, which
 * is boarded as LS-shaped under H-18.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SERVER = path.join(ROOT, 'cartograph/serve.js')
const src = fs.readFileSync(SERVER, 'utf8')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok  = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe publish address is derived from the look, not printed from a constant')

// ── 1. The deriver exists and is what the publish paths call.
if (!/function\s+siteUrlsForLook\s*\(/.test(src)) {
  bad('cartograph/serve.js has no `siteUrlsForLook()` — the per-look deriver is gone, so every '
    + 'publish response is back to reporting a fixed address. Restore it (H-18 ③).')
} else {
  ok('`siteUrlsForLook()` exists')
  // It must read the town's OWN domain, not decide one.
  if (!/instanceForMap\s*\(/.test(src)) {
    bad('`siteUrlsForLook()` does not consult `instanceForMap` — the production address must be the '
      + "town's authored `domain`, not a value this file picks.")
  } else ok("the production address comes from the town's authored `domain`")
  // And it must be able to answer "there isn't one".
  if (!/url:\s*null/.test(src)) {
    bad('nothing in serve.js can return a null address with a reason — a town that declares no domain '
      + 'must get `{ url: null, why }`, never a substitute.')
  } else ok('a town with no address gets null + a reason, not a substitute')
}

// ── 2. No site literal is emitted by a publish path.
//    A SITE literal is an http(s) string that is not an asset/CDN host.
const EXEMPT = new Set(['LS_PROD_SITE_URL', 'STAGING_SITE_BASE'])
const ASSETY = /assets\.|\.r2\.|cdn|overpass|api\./i
const lines = src.split('\n')
const literals = []
lines.forEach((line, i) => {
  const m = line.match(/^\s*const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'(https?:\/\/[^']+)'/)
  if (!m) return
  if (ASSETY.test(m[2])) return
  if (EXEMPT.has(m[1])) return
  literals.push(`${path.relative(ROOT, SERVER)}:${i + 1}  ${m[1]} = '${m[2]}'`)
})
if (literals.length) {
  bad('a site URL is a module constant again — the publish panel will report it for every town:')
  for (const l of literals) console.log(`       ${l}`)
  console.log('     ▶ derive it in `siteUrlsForLook()`, or add it to this check’s EXEMPT set WITH the '
    + 'reason it is not an answer to "where did my pour go".')
} else {
  ok(`no un-exempt site constant (exempt, by name and for a stated reason: ${[...EXEMPT].join(', ')})`)
}

// ── 3. The panel must read the derived shape, not the old bare string.
const PANEL = path.join(ROOT, 'src/preview/PreviewApp.jsx')
const panel = fs.readFileSync(PANEL, 'utf8')
if (/status\.sites\?\.\[key\](?!\s*\?\.\s*url)(?!\?\.url)/.test(panel.replace(/\s+/g, ' '))
    && !/sites\?\.\[key\]\?\.url/.test(panel)) {
  bad('src/preview/PreviewApp.jsx reads `status.sites[key]` as a bare string — the server now sends '
    + '`{ url, why }`, so the link would render "[object Object]" or vanish silently.')
} else ok('the Publish panel reads the derived `{ url, why }` shape')

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ the publish panel reports the address it shipped\n')
process.exit(failed ? 1 : 0)
