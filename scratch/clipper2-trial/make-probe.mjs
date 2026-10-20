// make-probe.mjs — a PROBE copy of src/lib/tileGround.js (tileGround.probe.mjs beside this file; never shipped) for the
// Clipper2 trials (scratch/open-source-scout/REPORT.md §3 T2, T3). It changes no geometry; it only
//   · exports offsetRingByRects (the live ② / ③ construction) and offsetRingVariable (the legacy chain path's);
//   · keeps, on the stamp, the carve offsetRingByRects runs: ① (reduced), its band/wedge clips with the ① edge each clip
//     EDGE belongs to, and the output before the AREA_MIN floor;
//   · keeps, on each block's depth record (`protoDepthByBlock`), the working copy (taper/flare split) and the ① labels.
// Every edit is anchored once, or it throws.
import { readFileSync, writeFileSync } from 'fs'
let s = readFileSync(new URL('../../src/lib/tileGround.js', import.meta.url), 'utf8')
const one = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-probe: anchor found ${n}× — ${a.slice(0, 80)}`); s = s.replace(a, b) }
// imports: src/lib/x → ../../src/lib/x from scratch/clipper2-trial
s = s.replace(/from '\.\/([^']+)'/g, "from '../../src/lib/$1'")
one("from '../cartograph/streetProfiles.js'", "from '../../src/cartograph/streetProfiles.js'")
one("from '../../cartograph/osm-vocabulary.mjs'", "from '../../cartograph/osm-vocabulary.mjs'")
if (/from '\.\.?\/(?!\.\.\/)/.test(s.replace(/from '\.\.\/\.\.\/[^']+'/g, ''))) throw new Error('make-probe: a relative import was not rewritten')
// the carve's clips, with each clip edge's ① edge (reduced index), oriented as pushed
one(`  const addClip = (poly) => {
    if (poly.length < 3 || !(Math.abs(signedArea(poly)) > 1e-12)) return
    clips.push(clipperLib.Clipper.Orientation(poly.map(toClipper)) === true ? poly : [...poly].reverse())
  }`, `  const clipLabs = []
  const addClip = (poly, L) => {
    if (poly.length < 3 || !(Math.abs(signedArea(poly)) > 1e-12)) return
    const f = clipperLib.Clipper.Orientation(poly.map(toClipper)) === true, m = poly.length
    clips.push(f ? poly : [...poly].reverse()); clipLabs.push(f ? L : L.map((_, j) => L[(m - 2 - j + 2 * m) % m]))
  }`)
one('addClip([S.a, S.b, S.Q, S.P])', 'addClip([S.a, S.b, S.Q, S.P], [i, i, i, i])')
one('addClip([v, A.Q, X, S.P])', 'addClip([v, A.Q, X, S.P], [ia, ia, i, i])')
one('addClip([v, A.Q, S.P])', 'addClip([v, A.Q, S.P], [ia, ia, i])')
one('  B.labels = B.rings.map(rg => rg.map((p, j) => labelOf(p, rg[(j + 1) % rg.length])))',
    `  B.labels = B.rings.map(rg => rg.map((p, j) => labelOf(p, rg[(j + 1) % rg.length])))
  if (stamp) stamp._carve = { ring, origE, clips, clipLabs, contrib, rawRings: B.rings, rawLabels: B.labels, outward }`)
one('        depthByBlock[k] = depthRec', '        depthByBlock[k] = depthRec; depthRec.WC = WC; depthRec.labs = labs')
one('            depthRec.holes.push(hRec)', '            depthRec.holes.push(hRec); hRec.WC = HW; hRec.labs = holeLabs[hi]')
s += '\nexport { offsetRingByRects, offsetRingVariable, booleanLabelled }\n'
writeFileSync(new URL('./tileGround.probe.mjs', import.meta.url), s)
console.log('wrote tileGround.probe.mjs')
