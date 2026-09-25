#!/usr/bin/env node
// CLAIM — THE BAKE SHOWS ITS OWN STEPS, NEVER KILLS ONE ON A CLOCK, AND SAYS WHICH STEP STOPPED.
//
// Jacob, 2026-09-24: a 5-minute wall-clock SIGKILL of provincetown's ground step reached the operator as "500", with
// nothing on screen while it ran. serve.js now runs every bake step through `runStep` (progress, last line, a real
// fraction from `[progress] <what> i/n`), lists the steps from its own route (`bakePlan`), and offers a Cancel.
// ASSERTS, reading serve.js (the real functions, sliced and run — never restated):
//   · `bakePlan()` lists every step label the bake route runs or marks (`runIfDirty('x'`, `runStep(P, 'x'`,
//     `markStep(P, 'x'`), so the modal shows what the route does;
//   · no bare `runShell(` inside the bake route — every child process goes through the recorder;
//   · a synthetic SLOW step handed a `timeout` is NOT killed (runStep drops wall-clock timeouts);
//   · a cancelled step rejects with "cancelled by operator at step \"<label>\"" and is marked `cancelled`;
//   · a failing step names itself ("step \"<label>\" failed: …");
//   · a `[progress] <what> i/n` line becomes a real fraction on the step.
//
//   node checks/claims-bake-progress-shows-the-route.mjs [--serve=path]
//
// MUTATIONS (each must go red, via --serve): a bare `await runShell('node x.js')` added to the bake route ·
// runStep passing `timeout` through to runShell.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { ROOT } from './_scenes.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const serveP = arg('serve') || join(ROOT, 'cartograph/serve.js')
const src = readFileSync(serveP, 'utf8')
const bad = []
const fn = (name) => { let a = src.indexOf(`async function ${name}(`); if (a < 0) a = src.indexOf(`function ${name}(`); const b = src.indexOf('\n}\n', a); return a >= 0 && b > a ? src.slice(a, b + 2) : null }
const need = ['runShell', 'bakePlan', 'markStep', 'runStep'].map(n => [n, fn(n)])
for (const [n, f] of need) if (!f) bad.push(`${n} not found in serve.js`)
if (!bad.length) {
  const mod = "import { spawn } from 'node:child_process'; import { readFileSync } from 'node:fs'; import { join, dirname } from 'node:path';\n" +
    'let _bakePlan = null\n' + need.map(([, f]) => f).join('\n').replace(/import\.meta\.filename/g, JSON.stringify(serveP)) + '\nexport { runShell, bakePlan, markStep, runStep }'
  const { bakePlan, runStep } = await import('data:text/javascript,' + encodeURIComponent(mod))
  // the plan covers the route
  const a = src.indexOf('path.match(/^\\/looks\\/([^/]+)\\/bake$/)'), b = src.indexOf('_bakesInFlight.delete(id)', a)
  const route = a >= 0 && b > a ? src.slice(a, b) : ''
  if (!route) bad.push('the bake route was not found in serve.js')
  const inRoute = [...route.matchAll(/(?:runIfDirty\(|runStep\(P, |markStep\(P, )'([\w-]+)'/g)].map(m => m[1])
  const plan = bakePlan()
  for (const l of new Set(inRoute)) if (!plan.includes(l)) bad.push(`the route runs "${l}" but bakePlan() does not list it — the modal would not show it`)
  const bare = [...route.matchAll(/await runShell\(/g)].length
  if (bare) bad.push(`${bare} bare runShell( call(s) in the bake route — a step the modal cannot see and the operator cannot cancel`)
  // behaviour, on synthetic steps
  const P = () => ({ steps: [], current: null, cancel: null, child: null })
  const node = (js) => `node -e ${JSON.stringify(js)}`
  const p1 = P(); let slowOk = true
  try { await runStep(p1, 'slow', node('setTimeout(()=>{},1200)'), { timeout: 150 }) } catch (e) { slowOk = false; bad.push(`a slow step handed timeout 150 ms was killed: ${e.message}`) }
  if (slowOk && p1.steps[0]?.state !== 'done') bad.push('a slow step did not end `done`')
  const p2 = P(); setTimeout(() => { p2.cancel = { step: p2.current }; p2.child?.kill('SIGTERM') }, 300)
  try { await runStep(p2, 'ground', node('setTimeout(()=>{},5000)')); bad.push('a cancelled step resolved') }
  catch (e) { if (!/cancelled by operator at step "ground"/.test(e.message)) bad.push(`a cancelled step said: ${e.message}`); if (p2.steps[0]?.state !== 'cancelled') bad.push('a cancelled step is not marked `cancelled`') }
  const p3 = P()
  try { await runStep(p3, 'lamps', node('process.exit(3)')); bad.push('a failing step resolved') }
  catch (e) { if (!/step "lamps" failed/.test(e.message)) bad.push(`a failing step said: ${e.message}`) }
  const p4 = P()
  await runStep(p4, 'ground', node('console.log("[progress] flatten mat:x 3/10")')).catch(e => bad.push(`progress step: ${e.message}`))
  if (Math.abs((p4.steps[0]?.frac ?? -1) - 0.3) > 1e-9) bad.push(`a "[progress] … 3/10" line gave frac ${p4.steps[0]?.frac}, not 0.3`)
  console.log(`── bake progress ── plan ${plan.length} step(s): ${plan.join(' · ')} ${bad.length ? '⛔' : '✅'}`)
}
for (const x of bad) console.log(`   ⛔ ${x}`)
console.log(bad.length ? '\n⛔ The bake can hide a step, kill one on a clock, or fail without naming it.' : '\n✅ The bake shows its own steps, kills none on a clock, and names the step that stops.')
process.exit(bad.length ? 1 : 0)
