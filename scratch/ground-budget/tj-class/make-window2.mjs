// make-window2.mjs — a SCRATCH copy of a bake-ground.js that, at the conformity call, hands the bake's own conformity input to
// runvariants.mjs (windows of it through each conformity variant) and exits before conformity of the whole town (Boz 2026-10-18).
//   node make-window2.mjs <bake-ground.js> <out.js>   · env at run: WIN_P="x,z" · WIN_R="5,…" · WIN_MODE=whole|clip · WIN_OUT=<json>
import { readFileSync, writeFileSync } from 'fs'
const one = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-window2: anchor found ${n}× — ${a}`); return s.replace(a, b) }
let src = readFileSync(process.argv[2], 'utf8')
src = one(src, `    const _tc = Date.now()
    const cstats = {}
    let bufs = conformAndRefine(planeSpecs, cstats)`, `    { // WINDOW (scratch, Screed 2026-10-18)
      const { runVariants } = await import('/Users/jacobhenderson/Desktop/lafayette-square.nosync/scratch/ground-budget/tj-class/runvariants.mjs')
      const clip = (p, W) => { const c = new _Clipper(); c.StrictlySimple = true
        c.AddPaths([p.outer, ...(p.holes || [])].map(_ringToPath), _PolyType.ptSubject, true)
        c.AddPath(_ringToPath([[W[0], W[1]], [W[2], W[1]], [W[2], W[3]], [W[0], W[3]]]), _PolyType.ptClip, true)
        const tree = new clipperLib.PolyTree(); if (!c.Execute(_ClipType.ctIntersection, tree, _PolyFillType.pftEvenOdd, _PolyFillType.pftNonZero)) throw new Error('window: clip refused')
        return polyTreeToItems(tree).map(it => ({ ...it, ...(p.side != null ? { side: p.side } : {}) })) }
      const rep = await runVariants({ planeSpecs, planeKeys, P: process.env.WIN_P.split(',').map(Number), radii: process.env.WIN_R.split(',').map(Number), mode: process.env.WIN_MODE || 'whole', clip, CLIP_SCALE })
      ;(await import('fs')).writeFileSync(process.env.WIN_OUT, JSON.stringify(rep)); console.log('[window] written ' + process.env.WIN_OUT); process.exit(0)
    }
    const _tc = Date.now()
    const cstats = {}
    let bufs = conformAndRefine(planeSpecs, cstats)`)
writeFileSync(process.argv[3], src)
