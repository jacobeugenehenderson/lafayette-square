// In-memory module swap (nothing written over a served file): SWAP_MAP='{"/cartograph/bake-ground.js": "/path/copy.js"}'
import { readFileSync } from 'fs'
const map = JSON.parse(process.env.SWAP_MAP || '{}')
export async function load(url, ctx, next) {
  for (const [suffix, file] of Object.entries(map)) if (url.endsWith(suffix)) return { format: 'module', source: readFileSync(file, 'utf8'), shortCircuit: true }
  return next(url, ctx)
}
