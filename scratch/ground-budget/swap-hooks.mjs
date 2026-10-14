// In-memory module swap that can also ADD a module this tree lacks (Brace, 2026-10-13; scratch/kerb-cut/swap-hooks.mjs
// only replaces existing ones). SWAP_MAP='{"cartograph/x.mjs": "/abs/path/x.mjs", ...}' — keys are repo-relative paths.
// Nothing is written into the tree: a missing key path resolves to a file:// URL under the repo root, and load serves the copy.
import { readFileSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const map = new Map(Object.entries(JSON.parse(process.env.SWAP_MAP || '{}')).map(([k, v]) => [pathToFileURL(ROOT + k).href, v]))
export async function resolve(spec, ctx, next) {
  if (ctx.parentURL && (spec.startsWith('./') || spec.startsWith('../'))) { const u = new URL(spec, ctx.parentURL).href; if (map.has(u)) return { url: u, format: 'module', shortCircuit: true } }
  return next(spec, ctx)
}
export async function load(url, ctx, next) {
  if (map.has(url)) return { format: 'module', source: readFileSync(map.get(url), 'utf8'), shortCircuit: true }
  return next(url, ctx)
}
