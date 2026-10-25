// serve cartograph/kerbLift.mjs with two observers in cutCreases, IN MEMORY (the file on disk is never written):
//   · the vertex-in-band branch (a vertex within √2/2 step of another ring's edge, strictly inside it): every candidate
//     insert is handed to globalThis.__creaseObs before `put`, which is unchanged
//   · the return: globalThis.__creaseDone({ inserted, rounds }) once the cut has settled, before its output is built
// ⛔ An anchor not found exactly once refuses by name: the census never runs on a cutCreases it did not instrument.
import { readFileSync } from 'node:fs'
const BAND = '        if (dot > 0 && dot < L2 && cr * cr <= B2 * L2) put(n, q) }'
const DONE = '  const back = (p) => p.map(([X, Y]) => [X / S, Y / S])'
export async function load(url, ctx, next) {
  if (!url.endsWith('/cartograph/kerbLift.mjs')) return next(url, ctx)
  let src = readFileSync(new URL(url), 'utf8')
  for (const [name, a] of [['band', BAND], ['return', DONE]]) if (src.split(a).length !== 2)
    throw new Error(`[crease-census] ⛔ the ${name} anchor is not in cutCreases exactly once — re-aim hooks.mjs; NOT CHECKED`)
  src = src.replace(BAND, `        if (dot > 0 && dot < L2 && cr * cr <= B2 * L2) { globalThis.__creaseObs?.({ round, ri, i, q, e0, e1, cr, L2, had: has[ri].has(q[0] + ',' + q[1]) }); put(n, q) } }`)
    .replace(DONE, `  globalThis.__creaseDone?.({ inserted, rounds })\n${DONE}`)
  return { format: 'module', source: src, shortCircuit: true }
}
