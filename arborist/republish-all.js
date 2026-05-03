/**
 * republish-all.js — re-runs publish-glb.js over every species currently in
 * public/trees/, pulling --source from each manifest's recorded sourceFile.
 *
 * Used after publish-glb.js gets improvements (helper-mesh filter, better
 * style/category inference, override preservation) so the entire library
 * picks up the new logic without manually re-issuing 63 commands.
 *
 * Sequential (one at a time) because each publish spawns a chunky
 * gltf-transform pipeline; running 63 in parallel would thrash the CPU
 * and OOM. Roughly ~20 minutes total at the current library size.
 *
 * Operator-set overrides (qualityOverride, stylesOverride, scaleOverride,
 * excluded, operatorNotes) are preserved by publish-glb.js across runs.
 *
 * Usage:
 *   node arborist/republish-all.js               # all species
 *   node arborist/republish-all.js --only acer_rubrum,quercus_alba
 *   node arborist/republish-all.js --skip stylized_trees_2
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TREES_DIR = path.join(REPO_ROOT, 'public', 'trees')

function parseArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) { args[key] = next; i++ }
      else args[key] = true
    }
  }
  return args
}

function runPublish(job) {
  return new Promise((resolve, reject) => {
    const cliArgs = [
      'arborist/publish-glb.js',
      '--source', job.source,
      '--species', job.species,
    ]
    if (job.label) cliArgs.push('--label', job.label)
    if (job.scientific) cliArgs.push('--scientific', job.scientific)
    if (job.variantMode && job.variantMode !== 'auto') {
      cliArgs.push('--variants', job.variantMode)
    }
    const child = spawn('node', cliArgs, { stdio: 'inherit', cwd: REPO_ROOT })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`publish-glb exited with code ${code} for ${job.species}`))
    })
    child.on('error', reject)
  })
}

async function main() {
  const args = parseArgs()
  const onlySet = args.only ? new Set(args.only.split(',').map((s) => s.trim())) : null
  const skipSet = args.skip ? new Set(args.skip.split(',').map((s) => s.trim())) : new Set()

  const dirs = (await fs.readdir(TREES_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).map((e) => e.name).sort()

  const jobs = []
  const issues = []
  for (const dir of dirs) {
    if (onlySet && !onlySet.has(dir)) continue
    if (skipSet.has(dir)) continue
    let manifest
    try {
      manifest = JSON.parse(await fs.readFile(path.join(TREES_DIR, dir, 'manifest.json'), 'utf8'))
    } catch (e) {
      issues.push(`${dir}: no manifest.json`)
      continue
    }
    const sources = [...new Set((manifest.variants ?? []).map((v) => v.sourceFile).filter(Boolean))]
    if (sources.length === 0) {
      issues.push(`${dir}: no sourceFile recorded`)
      continue
    }
    if (sources.length > 1) {
      issues.push(`${dir}: ${sources.length} distinct sourceFiles, using first (${sources[0]})`)
    }
    jobs.push({
      species: manifest.species,
      label: manifest.label,
      scientific: manifest.scientific,
      source: sources[0],
      variantMode: manifest.variantMode || 'auto',
    })
  }

  if (issues.length) {
    console.log('\n[republish] preflight issues:')
    for (const i of issues) console.log(`  - ${i}`)
  }

  console.log(`\n[republish] queued ${jobs.length} species\n`)
  const t0 = Date.now()
  const failures = []
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`\n══ [${i + 1}/${jobs.length}] ${j.species}  (t+${elapsed}s) ══`)
    try {
      await runPublish(j)
    } catch (e) {
      console.error(`[republish] ${j.species} FAILED: ${e.message}`)
      failures.push({ species: j.species, error: e.message })
    }
  }

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n[republish] done in ${totalSec}s — ${jobs.length - failures.length} ok, ${failures.length} failed`)
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f.species}: ${f.error}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('[republish] fatal:', e)
  process.exit(1)
})
