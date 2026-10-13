// Mutation test for accuracy-summary.mjs: each mutant must make --self-test FAIL (Brace, 2026-10-13).
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
const SRC = 'scratch/ground-budget/accuracy-summary.mjs', src = readFileSync(SRC, 'utf-8')
const mutants = [
  ['the non-finite filter dropped', 'if (Number.isFinite(errs[i]) && Number.isFinite(wts[i])) keep.push(i); else', 'if (true) keep.push(i); else'],
  ['weights not checked', '&& Number.isFinite(wts[i])', ''],
  ['non-finite not counted', 'nonFinite++;', ''],
  ['non-finite not located', 'firstBad.push(labelOf(i))', 'firstBad.push(0)'],
  ['max from the unsorted end', 'max: ord.length ? errs[ord[ord.length - 1]] : NaN', 'max: errs[errs.length - 1]'],
]
let survived = 0
for (const [name, a, b] of mutants) {
  if (!src.includes(a)) { console.log(`  ? ${name}: anchor not found`); survived++; continue }
  const p = 'scratch/ground-budget/.mutant-accuracy.mjs'; writeFileSync(p, src.replace(a, b))
  let killed = false; try { execFileSync('node', [p, '--self-test'], { stdio: 'pipe' }) } catch { killed = true }
  rmSync(p); if (!killed) survived++; console.log(`  ${killed ? 'killed  ' : 'SURVIVED'} ${name}`)
}
console.log(survived ? `⛔ ${survived} mutant(s) survived` : `all ${mutants.length} mutants killed`); process.exit(survived ? 1 : 0)
