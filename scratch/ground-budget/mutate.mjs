// Mutation test for checks/claims-the-ground-stays-in-budget.mjs: each mutant must make --self-test FAIL.
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
const SRC = 'checks/claims-the-ground-stays-in-budget.mjs', src = readFileSync(SRC, 'utf-8')
const mutants = [
  ['size compare >= instead of >', 'if (c.bytes > ceil.bytes)', 'if (c.bytes >= ceil.bytes)'],
  ['time compare >= instead of >', 'if (c.ms > ceil.ms)', 'if (c.ms >= ceil.ms)'],
  ['size compare dropped', 'if (c.bytes > ceil.bytes)', 'if (false)'],
  ['time compare dropped', 'if (c.ms > ceil.ms)', 'if (false)'],
  ['verdict always ok', 'ok: refusals.length === 0', 'ok: true'],
  ['counts only the ground pass', "export const GROUND_PASSES = ['ground', 'ground-shore']", "export const GROUND_PASSES = ['ground']"],
  ['does not require the ground pass', "if (!paid.includes('ground')) return", "if (!paid.length) return"],
  ['serve.js pass reader ignores bake-ground', "/`node bake-ground\\.js[ `]/", "/`node bake-NOPE\\.js[ `]/"],
  ['missing candidate time falls back to 0', "if (t.why) return { town: m.look, why:", "if (t.why) return { town: m.look, bytes, ms: 0, passes: [], tris: 0 }; if (0) return { town: m.look, why:"],
  ['missing served time falls back to Infinity', "if (t.why) return { town, why: `no served ground-bake time", "if (t.why) return { town, bytes: statSync(bin).size, ms: Infinity, passes: [] }; if (0) return { town, why: `no served ground-bake time"],
  ['missing served slab skipped', "if (!existsSync(bin)) return { town, why:", "if (0) return { town, why:"],
]
let survived = 0
for (const [name, a, b] of mutants) {
  if (!src.includes(a)) { console.log(`  ? ${name}: anchor not found`); survived++; continue }
  const p = 'checks/.mutant-ground-budget.mjs'
  writeFileSync(p, src.replace(a, b))
  let killed = false
  try { execFileSync('node', [p, '--self-test'], { stdio: 'pipe' }) } catch { killed = true }
  rmSync(p)
  if (!killed) survived++
  console.log(`  ${killed ? 'killed  ' : 'SURVIVED'} ${name}`)
}
console.log(survived ? `⛔ ${survived} mutant(s) survived` : `all ${mutants.length} mutants killed`)
process.exit(survived ? 1 : 0)
