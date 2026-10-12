#!/bin/zsh
# dump.sh <scene> <outdir> — run the CURRENT bake-ground up to the deformer, write its inputs (painted bands, disc, tiles)
# to <outdir>/inputs.json and stop. Nothing is meshed or served.
# PROBE_POINTS=<pts.json> ([{at:[x,z]},…]) also writes <pts>.held.json: every byMaterial key (and face:<lu> of byFaceUse) whose painted piece holds each point.
set -e
cd "$(dirname $0)/../../.."
S=$1 O=$PWD/$2 C=$PWD/scratch/ground-height/ab/bake-ground.dumpnow.js
mkdir -p $O
python3 - "$C" <<'PY'
import sys
s=open('cartograph/bake-ground.js').read()
a="    deform = buildDeformer({ tiles: shapeArtifact,\n"
assert s.count(a)==1
s=s.replace(a,"""    writeFileSync(process.env.DEFORM_DUMP, JSON.stringify({ bands: { curb: [...painted('curb'), ...painted('curbCut')], lawn: painted('treelawn'), walk: painted('sidewalk') }, stencil: stencil.clipPolygon, tiles: shapeArtifact, lawnKeys: [...byMaterial.keys()].filter(k => k.startsWith('treelawn')).map(k => [k, (byMaterial.get(k) || []).length]) }))
    if (process.env.PROBE_POINTS) { const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
      const P = JSON.parse(readFileSync(process.env.PROBE_POINTS, 'utf8'))
      for (const q of P) { const [x, z] = q.at; q.held = [...byMaterial, ...[...byFaceUse].map(([k, v]) => ['face:' + k, v])].flatMap(([k, ps]) => ps.some(it => { const o = it.outer || it; return o?.length >= 3 && pip(x, z, o) && !(it.holes || []).some(h => pip(x, z, h)) }) ? [k] : []) }
      if (process.env.PROBE_NEAR) { const R = +process.env.PROBE_NEAR
        const dSeg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) }
        const near = (x, z, r) => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (dSeg(x, z, r[j], r[i]) < R) return true; return false }
        for (const q of P) { const [x, z] = q.at; q.near = [...byMaterial, ...[...byFaceUse].map(([k, v]) => ['face:' + k, v])].flatMap(([k, ps]) => ps.filter(it => { const o = it.outer || it; return o?.length >= 3 && ((pip(x, z, o) && !(it.holes || []).some(h => pip(x, z, h))) || [o, ...(it.holes || [])].some(r => near(x, z, r))) }).map(it => ({ k, outer: it.outer || it, holes: it.holes || [] }))) } }
      writeFileSync(process.env.PROBE_POINTS.replace(/\.json$/, '.held.json'), JSON.stringify(P)) }
    throw new Error('DUMPED deformer inputs to ' + process.env.DEFORM_DUMP)
"""+a)
open(sys.argv[1],'w').write(s)
PY
PROBE_POINTS=${PROBE_POINTS:-} PROBE_NEAR=${PROBE_NEAR:-} DEFORM_DUMP=$O/inputs.json SWAP_MAP="{\"/cartograph/bake-ground.js\":\"$C\"}" node --max-old-space-size=14000 --import ./scratch/kerb-cut/swap.mjs cartograph/bake-ground.js --look=$S --scene=$S --out-dir=$O > $O/bake.log 2>&1 || true
grep -q "DUMPED deformer inputs" $O/bake.log && echo "dumped $(wc -c < $O/inputs.json) bytes" || { echo "DUMP FAILED"; tail -5 $O/bake.log; exit 1 }
