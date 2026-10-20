// synthetic.mjs — the 56-triangle input of checks/claims-conformity-closes-what-the-detector-sees.mjs (read out of the check's
// own source, not restated), through each conformity variant; metrics.mjs on each output. Read-only, milliseconds.
import { readFileSync } from 'fs'
import { metrics } from './metrics.mjs'
const chk = readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/checks/claims-conformity-closes-what-the-detector-sees.mjs', 'utf8')
const grab = (n) => { const m = chk.match(new RegExp(`const ${n} = (\\[.*\\])\\n`)) || chk.match(new RegExp(`const ${n} = (\\[[\\s\\S]*?\\n\\])`)); if (!m) throw new Error('no ' + n); return eval(m[1]) }
const S = grab('S'), U = grab('U')
const maxEdge = Number(chk.match(/refine: \{ mode: 'uniform', maxEdge: ([\d.]+) \}/)[1])
const V = Object.fromEntries(await Promise.all(['base', 'a', 'b'].map(async v => [v, await import(`./groundConformity.${v}.js`)])))
const det = { stock: V.base.findTJunctions, exact: V.b.findTJunctions }
for (const v of ['base', 'a', 'b']) {
  const out = V[v].conformAndRefine([{ polys: S, refine: { mode: 'uniform', maxEdge } }, { polys: U, refine: null }])
  console.log(v.padEnd(5), JSON.stringify(metrics(out, ['strips', 'neighbour'], det)))
}
