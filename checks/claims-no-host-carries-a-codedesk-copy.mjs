// claims-no-host-carries-a-codedesk-copy.mjs — CodeDesk has one source, and hosts pin its releases (cartograph/_archive/BRIEF-codedesk-KIT-COPY-RETIRED-2026-11-01.md).
//
// ⭐ THE CLAIM: CodeDesk lives in ONE repo (dev.nosync/codedesk) and reaches its hosts as a pinned, published release
// (its README § "Hosts", § "Releasing"). No host serves a copy of its own: a copy drifts (the kit's did, all seven shared
// files), and the kit's copy built card addresses from its own origin and carried one town's places.
// ⭐ The kit's copy is RETIRED (Jacob, 2026-11-01: "retire it"; and of the place card's guardian QR button, "yes, remove the
// guardian QR button too"): public/codedesk, CodeDeskModal, its mounts and the `codedesk` module flag. This check now holds
// that line: no copy in the tree, and nothing in src/ that frames, opens or switches one on.
//
// The Ward: measured when its tree sits beside the kit (dev.nosync/theward); otherwise the row is Ward's own cited grep,
// said as a citation, never as a reading.
//   node checks/claims-no-host-carries-a-codedesk-copy.mjs [--mutants]
//   --mutants: a copy restored under public/ · CodeDeskModal restored · the module flag back in an instance.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// A copy: a directory holding CodeDesk's own engine files.
const ENGINE = ['qr_render_engine.js', 'qr_sync_pipeline.js', 'qr_ui_toolkit.js']
const SKIP = new Set(['.git', 'node_modules', 'dist', '.claude', '_archive', 'scratch', 'baked', 'photos'])
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
      try { if (fs.lstatSync(p).isDirectory()) walk(p, depth + 1) } catch { /* unreadable: not a copy */ }
    }
  })(root, 0)
  return out
}
// What in src/ frames, opens or switches on a CodeDesk: the modal, its store, the module flag.
const FRAMES = /CodeDeskModal|useCodeDesk|\bcodedesk\s*:/
function framesIn(lines) { return lines.filter((l) => FRAMES.test(l.replace(/^[^:]+:\d+:/, '')) && !/:\d+:\s*(\/\/|\*)/.test(l)) }
const srcLines = () => { try { return execFileSync('git', ['grep', '-n', '-I', '-e', 'odeDesk', '-e', 'codedesk', '--', 'src', 'cartograph/scaffold-instance.mjs'], { encoding: 'utf8' }).split('\n').filter(Boolean) } catch { return [] } }

function verdict(m = {}) {
  const fails = []
  const copies = [...copiesUnder('.'), ...(m.copyAt ? copiesUnder(m.copyAt).map((c) => `${m.copyAt}/${c}`) : [])]
  if (copies.length) fails.push(`the kit carries a CodeDesk copy: ${copies.join(', ')}`)
  if (fs.existsSync('src/components/CodeDeskModal.jsx') || m.modal) fails.push('src/components/CodeDeskModal.jsx is back')
  const frames = framesIn([...srcLines(), ...(m.lines || [])])
  if (frames.length) fails.push(`src/ frames, opens or switches on a CodeDesk: ${frames.slice(0, 3).join(' · ')}`)
  return fails
}

let failures = 0
console.log('\nthe kit')
const kit = verdict()
for (const f of kit) { failures++; console.log(`  ✗ ${f}`) }
if (!kit.length) console.log('  ✓ no copy, and nothing in src/ frames, opens or switches one on')

console.log('\nThe Ward')
const ward = path.resolve('..', 'dev.nosync', 'theward')
if (fs.existsSync(ward)) {
  const wardCopies = copiesUnder(ward)
  if (wardCopies.length) { failures++; console.log(`  ✗ The Ward carries a CodeDesk copy: ${wardCopies.join(', ')}`) }
  else console.log('  ✓ no copy (measured)')
} else console.log("  ·  none, per Ward's grep at theward d71662d (2026-11-01); not re-read by this check (its tree is not beside the kit)")

if (process.argv.includes('--mutants')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codedesk-mutant-'))
  fs.mkdirSync(path.join(tmp, 'codedesk'))
  for (const f of ENGINE) fs.writeFileSync(path.join(tmp, 'codedesk', f), '')
  const mutants = [
    ['a copy restored under public/', { copyAt: tmp }],
    ['CodeDeskModal restored', { modal: true }],
    ['the module flag back in an instance', { lines: ['src/instances/huron.js:94:    codedesk: true,'] }],
  ]
  for (const [name, m] of mutants) {
    const f = verdict(m)
    console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`)
    if (!f.length) failures++
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${failures ? `❌ ${failures} FAILURE(S)` : '✅ PASS'}`)
process.exit(failures ? 1 : 0)
