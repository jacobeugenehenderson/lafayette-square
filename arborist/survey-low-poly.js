/**
 * survey-low-poly.js — scan the Low Poly Tree Collection for species names.
 *
 * Walks every numbered folder, reads rar/zip listings (no extraction), and
 * pulls out distinguishing strings to guess the species. Writes a JSON
 * inventory the operator can review + correct before batch publish.
 *
 * Usage:
 *   node arborist/survey-low-poly.js \
 *     --root botanica/trees/low-poly-tree-collection \
 *     --out arborist/_low_poly_inventory.json
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

function parseArgs() {
  const a = {}
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i]
    if (k.startsWith('--')) {
      const v = process.argv[i + 1]
      if (v && !v.startsWith('--')) { a[k.slice(2)] = v; i++ }
      else a[k.slice(2)] = true
    }
  }
  return a
}

// Quick rar-listing (no extract) via node-unrar-js.
async function listRar(rarPath) {
  try {
    const { createExtractorFromFile } = await import('node-unrar-js')
    const ex = await createExtractorFromFile({ filepath: rarPath, targetPath: '/tmp' })
    const headers = Array.from(ex.getFileList().fileHeaders)
    return headers.map(h => h.name)
  } catch (err) {
    return []
  }
}

async function listZip(zipPath) {
  try {
    const out = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    return out.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

// Generic archive names that don't tell us anything.
const NOISE = /^(fbx|obj|stl|3ds|c4d|max|blender|blend|export|collada|maya|unity|unreal|ue|render|game|elements|textures?|standard|corona|vray|cycle|cycles|hdri|materials?|hbas|abc|dae|usd|usdz|gltf|glb|preview|thumbnail)$/i

function tokensFrom(filename) {
  // Strip extension, split on underscores/spaces/dashes/dots, drop noise.
  const base = filename.replace(/\.\w+$/, '')
  return base
    .split(/[_\-\s\(\).]+/)
    .filter(t => t.length >= 3 && !NOISE.test(t) && !/^\d+$/.test(t))
}

async function surveyFolder(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  const filenames = entries.filter(e => e.isFile()).map(e => e.name)

  // Tokens from folder-level filenames.
  const tokens = new Set()
  for (const fn of filenames) tokensFrom(fn).forEach(t => tokens.add(t))

  // Peek inside each rar/zip for additional clues.
  const peekedNames = []
  for (const fn of filenames) {
    const full = path.join(folderPath, fn)
    let inner = []
    if (fn.toLowerCase().endsWith('.rar')) inner = await listRar(full)
    else if (fn.toLowerCase().endsWith('.zip')) inner = await listZip(full)
    for (const inner_fn of inner) {
      const base = path.basename(inner_fn).split('.')[0]
      peekedNames.push(base)
      tokensFrom(inner_fn).forEach(t => tokens.add(t))
    }
  }

  return {
    folder: path.basename(folderPath),
    files: filenames,
    sampleInner: peekedNames.slice(0, 8),
    candidateTokens: [...tokens].slice(0, 20),
  }
}

async function main() {
  const args = parseArgs()
  if (!args.root) {
    console.error('Usage: --root <path> [--out <json>]')
    process.exit(1)
  }
  const root = path.resolve(REPO_ROOT, args.root)
  const dirs = (await fs.readdir(root, { withFileTypes: true }))
    .filter(d => d.isDirectory())
    .map(d => d.name)

  const out = []
  for (let i = 0; i < dirs.length; i++) {
    const folder = dirs[i]
    process.stdout.write(`\r[survey] ${i + 1}/${dirs.length}  ${folder}        `)
    out.push(await surveyFolder(path.join(root, folder)))
  }
  process.stdout.write('\n')

  if (args.out) {
    await fs.writeFile(path.resolve(REPO_ROOT, args.out), JSON.stringify(out, null, 2))
    console.log(`[survey] wrote ${out.length} folders → ${args.out}`)
  } else {
    console.log(JSON.stringify(out, null, 2))
  }
}

main().catch(err => { console.error(err); process.exit(1) })
