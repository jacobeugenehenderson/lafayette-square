/**
 * sign-coast-residual.mjs — A TOWN SIGNS FOR ITS COAST'S OPEN/CLOSE RESIDUAL (Zob's ruling, Boz's approval, 2026-10-29).
 *
 * The coast step judges every open/close it runs against its DEFINITION (openCloseJudge.mjs#residualOf) and STOPS on any piece past
 * 2·NODE_BOUND that the town has not accepted (bake-coast.mjs#judgeNets). This is the one way a town accepts them, outside Stage: it
 * runs the coast step without writing anything, PRINTS every piece (its key, side, m², where), and with --accept writes the town's
 * tolerance, cartograph/data/<town>/coast-tolerance.json (tracked: a signature is authoring, committed with the town's other authoring).
 * It holds, per path (water, decks): the count and m² past 2·NB and the accepted SET of piece keys; signedAt; the coast.json sha it was
 * measured on; and the coast step's reads (code and authored inputs), so a later stop can say what changed.
 * ⛔ There is no bake-anyway flag and no environment variable: the only way past the gate is to look at the pieces and accept them.
 *
 *   node cartograph/sign-coast-residual.mjs --scene=<town>            # prints the pieces, writes nothing
 *   node cartograph/sign-coast-residual.mjs --scene=<town> --accept   # prints them and signs
 */
import fs from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { CARTOGRAPH_DIR } from './config.js'
import { requireExplicitMap } from './scene.js'
import { bakeCoast } from './bake-coast.mjs'

export async function signCoastResidual({ scene, accept = false }) {
  const out = await bakeCoast({ scene, write: false, gate: false }), mapDir = join(CARTOGRAPH_DIR, 'data', scene), tolPath = join(mapDir, 'coast-tolerance.json')
  if (!out.coast) { console.log(`[sign-coast-residual] ${scene}: inland, no open/close to sign for`); return null }
  const { nets, ...record } = out, rec = { signedAt: new Date().toISOString(), coastSha: createHash('sha1').update(JSON.stringify(record)).digest('hex'), reads: nets.reads }
  for (const k of ['water', 'decks']) { const r = nets[k]
    console.log(`[sign-coast-residual] ${scene}'s ${k}: ${r.n} piece(s) past 2·NODE_BOUND, ${r.m2} m²${r.n ? ':' : ''}`)
    for (const w of r.pieces) console.log(`   ${w.key}  ${w.side}  ${w.m2} m²  at (${w.at.join(', ')})`)
    rec[k] = { n: r.n, m2: r.m2, sites: r.pieces.map(({ key, side, m2, at }) => ({ key, side, m2, at })) } }
  if (!accept) { console.log(`[sign-coast-residual] ${scene}: NOTHING WRITTEN. Look at each piece; to accept them: --accept`); return rec }
  fs.writeFileSync(tolPath, JSON.stringify(rec, null, 1) + '\n')
  console.log(`[sign-coast-residual] ${scene}: SIGNED ${tolPath} (commit it with the town's authoring)`)
  return rec
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const scene = requireExplicitMap('sign-coast-residual')
  signCoastResidual({ scene, accept: process.argv.includes('--accept') }).catch(e => { console.error(e.message || e); process.exit(1) })
}
