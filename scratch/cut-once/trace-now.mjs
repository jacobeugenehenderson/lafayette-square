// THE TRACED WATER, FROM THE KIT AS IT STANDS (BRIEF-provincetown-pours-on-the-port §2.1): cartograph/bake-coast.mjs READ at run time,
// a dump of `traced` and an exit inserted just before its open/close, imports repointed, written beside this file and run. So it
// cannot drift from the kit (bake-coast-traced-now.mjs on plumb/concurrence was a hand copy). Never imported by the kit; writes
// nothing but fixtures/<scene>-traced.json. node scratch/cut-once/trace-now.mjs --scene=<id>
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const src = readFileSync(new URL('../../cartograph/bake-coast.mjs', import.meta.url), 'utf8'), AT = "  const oc = openCloseAtStep(traced, fine, 'the traced water')\n"
if (src.split(AT).length !== 2) throw new Error('⛔ trace-now: bake-coast.mjs no longer calls the traced water\'s open/close exactly once — re-aim')
const dump = "  { const fsx = await import('fs'); const outp = new URL(`./fixtures/${scene}-traced.json`, import.meta.url)\n" +
  "    fsx.writeFileSync(outp, JSON.stringify({ note: 'bake-coast.mjs traced water (scratch/cut-once/trace-now.mjs)', fineM: fine, square: R, traced: traced.map(p => p.map(q => [q.X, q.Y])) })); console.log('TRACED written', outp.pathname, traced.length); process.exit(0) }\n"
const gen = src.replace(AT, dump + AT).replace(/from '\.\/([^']+)'/g, "from '../../cartograph/$1'").replace(/from '\.\.\/src\//g, "from '../../src/").replace(/import\('\.\/([^']+)'\)/g, "import('../../cartograph/$1')")
const out = new URL('./.bake-coast-traced.gen.mjs', import.meta.url); writeFileSync(out, gen)
const r = spawnSync('node', [out.pathname, ...process.argv.slice(2)], { stdio: 'inherit', cwd: new URL('../../cartograph/', import.meta.url).pathname }); process.exitCode = r.status
