#!/bin/zsh
# dump.sh <town> <outdir> — run HEAD's bake-ground (in-memory swap; the source is not edited) up to buildDeformer, write its input
# (deform.json: shape tiles + the bands AS PAINTED + stencil + limits; meta.json: scene, refineTol) to <outdir>, and exit. Nothing is
# meshed or served. A heavy job: one paint of the town (HPDM 2026-10-14: 2.5 min). Check free memory first.
set -e
cd "$(dirname $0)/../../.."
T=$1 O=${2:A} C=$(mktemp -d)/bake-ground.dd.js
python3 - "$C" <<'PY'
import sys
s=open('cartograph/bake-ground.js').read()
a="    // ⭐ THE EASE'S END IS A LINE OF THE PARTITION, never cut in afterwards"
assert s.count(a)==1, 'the hook anchor moved'
s=s.replace(a,"""    if (process.env.DEFORM_DD) { const fs = await import('fs'), dd = process.env.DEFORM_DD; fs.mkdirSync(dd, { recursive: true })
      fs.writeFileSync(dd + '/deform.json', JSON.stringify({ tiles: shapeArtifact, bands: { curb: [...painted('curb'), ...painted('curbCut')], lawn: painted('treelawn'), walk: painted('sidewalk') }, stencil: stencil.clipPolygon, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: deformTerrain.exag, blend: blendM, sigma: Number.isFinite(design.groundLineSigmaM) && design.groundLineSigmaM > 0 ? design.groundLineSigmaM : deformTerrain.stepM } }))
      fs.writeFileSync(dd + '/meta.json', JSON.stringify({ scene, refineTol: deform.refineTol }))
      console.log('[deform dump] wrote ' + dd); process.exit(0) }
"""+a)
open(sys.argv[1],'w').write(s)
PY
SWAP_MAP="{\"/cartograph/bake-ground.js\":\"$C\"}" DEFORM_DD=$O node --max-old-space-size=14000 --import ./scratch/kerb-cut/swap.mjs cartograph/bake-ground.js --look=$T --scene=$T --shore=pending --out-dir=$O/out > $O.log 2>&1
grep -q "\[deform dump\] wrote" $O.log && echo "dumped $(wc -c < $O/deform.json) bytes" || { echo "DUMP FAILED"; tail -5 $O.log; exit 1 }
