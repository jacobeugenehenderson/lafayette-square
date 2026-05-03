/**
 * batch-lowpoly.js — rename Low Poly Collection folders to descriptive names,
 * then batch-publish every one through publish-glb.js.
 *
 * Reads arborist/low-poly-mapping.json to know:
 *   - which CGTrader-ID folder maps to which species id + slug
 *   - tier (exact/cousin/standin/filler/throwaway) for triage
 *
 * Renames in place: 3978977/ → sugar-maple-lowpoly__3978977/
 * The CGTrader ID is preserved as a suffix so we can always trace back.
 *
 * Then for each folder, spawns `node arborist/publish-glb.js` with the
 * folder path + species id. Sequential because FBX2glTF + sharp + simplify
 * are CPU-heavy and parallel processes would just thrash.
 *
 * Skips throwaways unless --include-throwaways is passed.
 *
 * Usage:
 *   node arborist/batch-lowpoly.js                         # rename + publish all non-throwaway
 *   node arborist/batch-lowpoly.js --rename-only           # just rename folders
 *   node arborist/batch-lowpoly.js --publish-only          # publish only (folders already renamed)
 *   node arborist/batch-lowpoly.js --include-throwaways    # include acacia/baobab/etc.
 *   node arborist/batch-lowpoly.js --skip-existing         # skip species that already have a manifest.json
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const ROOT      = path.join(REPO_ROOT, 'botanica/trees/low-poly-tree-collection')
const MAPPING   = path.join(__dirname, 'low-poly-mapping.json')
const PUBLISH   = path.join(__dirname, 'publish-glb.js')

function parseArgs() {
  const a = {}
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i]
    if (k.startsWith('--')) a[k.slice(2)] = true
  }
  return a
}

async function loadMapping() {
  const data = JSON.parse(await fs.readFile(MAPPING, 'utf8'))
  return data.folders
}

// Find existing folder for a CGTrader ID — could be the bare ID, a
// slug__id (legacy), or just the slug (current convention).
async function findFolder(cgId, slug) {
  const entries = await fs.readdir(ROOT)
  const match = entries.find(n =>
    n === cgId ||
    n === slug ||
    n.endsWith(`__${cgId}`) ||
    n === `${slug}__${cgId}`)
  return match ? path.join(ROOT, match) : null
}

// Rename to clean slug-only folder names (no CGTrader IDs leaking into the
// public layout). Writes a cgtrader-ids.json sidecar mapping slug → cgId
// for traceability when we need to find a vendor pack again.
async function renameFolders(mapping) {
  let renamed = 0, alreadyDone = 0, missing = 0
  const ids = {}
  for (const [cgId, info] of Object.entries(mapping)) {
    if (!info.slug) continue
    ids[info.slug] = { cgtraderId: cgId, species: info.species, label: info.label }
    const targetPath = path.join(ROOT, info.slug)
    try { await fs.access(targetPath); alreadyDone++; continue } catch {}
    const cur = await findFolder(cgId, info.slug)
    if (!cur) { missing++; continue }
    await fs.rename(cur, targetPath)
    renamed++
  }
  await fs.writeFile(path.join(ROOT, 'cgtrader-ids.json'), JSON.stringify(ids, null, 2))
  console.log(`[batch] rename: ${renamed} renamed, ${alreadyDone} already done, ${missing} missing — sidecar cgtrader-ids.json written`)
}

function runPublish(args) {
  return new Promise((resolve) => {
    const child = spawn('node', [PUBLISH, ...args], { cwd: REPO_ROOT })
    let lastLine = ''
    child.stdout.on('data', d => { lastLine = d.toString().trim().split('\n').pop() })
    child.stderr.on('data', d => process.stderr.write(d))
    child.on('close', code => resolve({ code, lastLine }))
  })
}

async function publishAll(mapping, opts) {
  const entries = Object.entries(mapping)
    .filter(([, info]) => opts.includeThrowaways || info.tier !== 'throwaway')

  let done = 0, skipped = 0, failed = 0
  const t0 = Date.now()
  for (const [cgId, info] of entries) {
    const folder = await findFolder(cgId, info.slug)
    if (!folder) { console.log(`[batch] ${cgId} (${info.species}) — folder missing, skip`); skipped++; continue }
    const outDir = path.join(REPO_ROOT, 'public/trees', info.species)
    if (opts.skipExisting) {
      try { await fs.access(path.join(outDir, 'manifest.json')); console.log(`[batch] ${info.species} — already published, skip`); skipped++; continue } catch {}
    }
    process.stdout.write(`[batch] ${++done + skipped + failed}/${entries.length}  ${info.species.padEnd(28)}  `)
    const result = await runPublish([
      '--source', folder,
      '--species', info.species,
      '--label', info.label,
    ])
    if (result.code !== 0) { console.log(`✗ failed`); failed++; done-- }
    else                   { console.log(`✓ ${result.lastLine.replace(/\[publish-glb\]\s*/g,'')}`) }
  }
  const mins = ((Date.now() - t0) / 60000).toFixed(1)
  console.log(`[batch] done in ${mins}m: ${done} published, ${skipped} skipped, ${failed} failed`)
}

async function main() {
  const args = parseArgs()
  const mapping = await loadMapping()

  if (!args['publish-only']) {
    await renameFolders(mapping)
  }
  if (!args['rename-only']) {
    await publishAll(mapping, {
      includeThrowaways: !!args['include-throwaways'],
      skipExisting:      !!args['skip-existing'],
    })
  }
}

main().catch(err => { console.error(err); process.exit(1) })
