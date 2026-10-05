#!/usr/bin/env node
/**
 * claims-a-bake-never-uploads — a bake ends on disk; Publish is the one gesture that uploads to staging.
 *
 * ⭐ Jacob, 2026-10-04: "I don't think it makes sense to 'upload' at that step. If the operator turns things off or
 * adjusts the pyramid, that's supposed to be 'accepted' when they publish and promote." The bake's last step used to
 * be `upload-baked-to-r2 --env=staging`, so every bake reached staging (Stage's included) and every Publish, which
 * bakes first, uploaded the slab a second time. BRIEF-publish-is-the-upload moved the upload into POST /publish.
 *
 * Pinned, all from source (the bake's body is cut out of serve.js the way serve.js#bakePlan cuts it):
 *  1. The bake handler names no upload: no upload script, no `wrangler r2`, no `--env=`, and no script it runs does.
 *  2. Publish freezes the manifest (where the deployment is accepted), then uploads to STAGING, and a failed upload
 *     throws: a loud failure, never a 200.
 *  3. The panel bakes first only when the bake check owes a step.
 * ⭐ MUTATION, run every time: the upload call is put back into a copy of the bake's body, and the judge must go red.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

const UPLOADS = [/upload-baked-to-r2/, /wrangler\s+r2/, /--env=/, /method:\s*'PUT'/]
const BAKE_OPEN = "path.match(/^\\/looks\\/([^/]+)\\/bake$/)"
// ⛔ CODE, NOT PROSE: line comments are dropped before judging. A comment that names the upload (this check's own
// pointer, Publish's "`--env=prod` is Promote's") is not an upload, and reading it as one made this check red on itself.
const code = (src) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
const bakeBody = (src) => {
  const a = src.indexOf(BAKE_OPEN), b = src.indexOf('_bakesInFlight.delete(id)', a)
  return a >= 0 && b > a ? code(src.slice(a, b)) : null
}
// The scripts a bake runs: every `node <file>` in its body, resolved against cartograph/ (the bake's cwd) or the root.
const scriptsOf = (body) => [...new Set([...body.matchAll(/node\s+([\w./-]+\.m?js)/g)].map((m) => m[1]))]
  .map((f) => [path.join('cartograph', f), f].find((p) => existsSync(path.join(ROOT, p))) || f)

/** The judge: what in this bake body uploads? Returns the offences; empty is clean. */
function uploadsIn(body, { scripts = true } = {}) {
  const hits = UPLOADS.filter((re) => re.test(body)).map((re) => `the bake's body matches ${re}`)
  if (scripts) for (const f of scriptsOf(body)) {
    if (!existsSync(path.join(ROOT, f))) { hits.push(`the bake runs ${f}, which cannot be read`); continue }
    const src = read(f)
    for (const re of UPLOADS.slice(0, 2)) if (re.test(src)) hits.push(`the bake runs ${f}, which matches ${re}`)
  }
  return hits
}

console.log('\nA bake never uploads; Publish is the upload')
// SERVE=<path> judges another copy of serve.js: the real-file mutation (the upload restored in a copy) must go red.
const serve = read(process.env.SERVE || 'cartograph/serve.js')
const body = bakeBody(serve)
if (!body) bad('cartograph/serve.js has no bake handler where serve.js#bakePlan looks for it — update this check with it.')
else {
  // ── 1.
  const hits = uploadsIn(body)
  if (hits.length) for (const h of hits) bad(`${h} — a bake must end on disk; the upload is Publish's`)
  else ok(`the bake handler and the ${scriptsOf(body).length} script(s) it runs name no upload`)
  // ── mutation: restore the call and the judge must see it.
  const mutated = body.replace("ran('manifest')", "ran('manifest')\n      await runCapture(`node scripts/upload-baked-to-r2.mjs --env=staging --look=${id}`, { cwd: REPO_ROOT })")
  if (mutated === body) bad("mutation could not be applied (no `ran('manifest')` in the bake) — update this check")
  else if (uploadsIn(mutated, { scripts: false }).length) ok('mutation: the upload call put back into the bake is caught')
  else bad('mutation: the upload call put back into the bake was NOT caught — the judge is blind')
}

// ── 2. Publish is the upload, in order, and loud.
const pub = (() => {
  const a = serve.indexOf("path.match(/^\\/looks\\/([^/]+)\\/publish$/)"), b = serve.indexOf('POST /looks/<id>/promote', a)
  return a >= 0 && b > a ? code(serve.slice(a, b)) : null
})()
if (!pub) bad('cartograph/serve.js has no POST /publish handler — update this check.')
else {
  const iMan = pub.indexOf('bake-manifest.mjs'), iUp = pub.indexOf('upload-baked-to-r2.mjs --env=staging')
  if (iMan < 0) bad('Publish does not freeze the manifest — a deployment edit would ship only after some later bake')
  else ok('Publish freezes the manifest (the deployment is accepted at Publish)')
  if (iUp < 0) bad('Publish does not upload the slab to staging')
  else if (iMan > iUp) bad('Publish uploads before it freezes the manifest — it would ship the previous deployment')
  else ok('Publish uploads the slab to staging, after the manifest')
  if (/--env=prod/.test(pub)) bad('Publish names --env=prod — only Promote may write production')
  if (!/if \(up\.code !== 0\)[\s\S]{0,300}throw new Error/.test(pub)) bad('a failed upload does not throw in Publish — it would answer 200 over a slab that reached nobody')
  else ok('a failed upload fails Publish')
}

// ── 3. The panel bakes first only when a step is owed.
const panel = read('src/preview/PreviewApp.jsx')
const fn = (panel.match(/async function publishStaging[\s\S]*?\n {2}}\n/) || [])[0] || ''
if (!fn) bad('src/preview/PreviewApp.jsx has no publishStaging — update this check.')
else if (/if \([^)]*steps\.length[^)]*\)\s*{\s*const bake = await fetch/.test(fn)) ok('the panel bakes first only when the bake check owes a step')
else bad('publishStaging bakes unconditionally — a bake that owes nothing still re-stamps the slab, so Publish re-ships it')

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ a bake never uploads; Publish is the upload\n')
process.exit(failed ? 1 : 0)
