// serve an instrumented bake-ground.js (in memory; the worktree is never written)
import { readFileSync } from 'fs'
export async function load(url, ctx, next) {
  if (!url.endsWith('/cartograph/bake-ground.js')) return next(url, ctx)
  let src = readFileSync(new URL(url), 'utf8')
  const rep = (a, b) => { if (src.split(a).length !== 2) throw new Error('anchor not unique: ' + a); src = src.replace(a, b) }
  rep('    const mine = layerRegion(e)', '    const mine = layerRegion(e); (globalThis.__zobRegions ||= []).push({ key: e.groupKey, mine, items: e.items })')
  rep('    if (meets) throw new Error', '    if (meets) globalThis.__zobDump = { groupKey, h, meets, paths, x, y, outers, holes }\n    if (meets) throw new Error')
  return { format: 'module', source: src, shortCircuit: true }
}
