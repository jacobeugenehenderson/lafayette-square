// claims-no-host-carries-a-codedesk-copy.mjs — CodeDesk has one source, and hosts pin its releases (BRIEF-codedesk).
//
// ⭐ THE CLAIM: CodeDesk lives in ONE repo (dev.nosync/codedesk) and reaches its hosts as a pinned, published release
// (its README § "Hosts", § "Releasing"). No host serves a copy of its own: a copy drifts — the kit's did, all seven
// shared files — and the kit's copy builds card addresses from its own origin, so a card printed on staging encodes
// staging, and a printed card cannot be updated.
//
// ⛔ EXPECTED RED UNTIL CUTOVER (Warden's ruling R1, 2026-09-28): the kit's copy (`public/codedesk/`) is mounted by the
// FROZEN old player's CodeDeskModal — the Guardian-card flow. Both retire WITH the old player, not before. This check
// stays red, saying so, until they are gone; it is the brief's evict-when.
//
// Reads: the kit's tree; and The Ward's tree when it sits beside the kit (dev.nosync/theward) — else it says it
// could not look there, never "clean".
//   node checks/claims-no-host-carries-a-codedesk-copy.mjs
import fs from 'fs'
import path from 'path'

let failures = 0
const fail = (m) => { failures++; console.log(`  ✗ ${m}`) }
const pass = (m) => console.log(`  ✓ ${m}`)

// A copy: a directory holding CodeDesk's own engine files.
const ENGINE = ['qr_render_engine.js', 'qr_sync_pipeline.js', 'qr_ui_toolkit.js']
const SKIP = new Set(['.git', 'node_modules', 'dist', '.claude', '_archive', 'scratch'])
function copiesUnder(root) {
  const out = []
  ;(function walk(d, depth) {
    if (depth > 6) return
    let names
    try { names = fs.readdirSync(d) } catch { return }
    if (ENGINE.every((f) => names.includes(f))) out.push(path.relative(root, d) || '.')
    for (const n of names) {
      if (SKIP.has(n)) continue
      const p = path.join(d, n)
      try { if (fs.statSync(p).isDirectory()) walk(p, depth + 1) } catch { /* unreadable: not a copy */ }
    }
  })(root, 0)
  return out
}

console.log('\nthe kit')
const kitCopies = copiesUnder('.')
const modal = fs.existsSync('src/components/CodeDeskModal.jsx')
if (kitCopies.length) fail(`carries a CodeDesk copy: ${kitCopies.join(', ')}`)
if (modal) fail('src/components/CodeDeskModal.jsx still frames it')
if (kitCopies.length || modal) console.log('    ⏳ expected until cutover: retired with the frozen old player (BRIEF-codedesk R1)')
else pass('no copy, and nothing frames one')

console.log('\nThe Ward')
const ward = path.resolve('..', 'dev.nosync', 'theward')
if (!fs.existsSync(ward)) console.log(`  ·  NOT MEASURED — The Ward is not beside the kit (${ward})`)
else {
  const wardCopies = copiesUnder(ward)
  if (wardCopies.length) fail(`The Ward carries a CodeDesk copy: ${wardCopies.join(', ')}`)
  else pass('no copy')
}

console.log(`\n${failures ? `❌ ${failures} FAILURE(S)` : '✅ PASS'}`)
process.exit(failures ? 1 : 0)
