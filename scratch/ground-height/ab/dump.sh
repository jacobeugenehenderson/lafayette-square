#!/bin/zsh
# dump.sh <scene> <outdir> — run the CURRENT bake-ground up to the deformer, write its inputs (painted bands, disc, tiles)
# to <outdir>/inputs.json and stop. Nothing is meshed or served.
set -e
cd "$(dirname $0)/../../.."
S=$1 O=$PWD/$2 C=$PWD/scratch/ground-height/ab/bake-ground.dumpnow.js
mkdir -p $O
python3 - "$C" <<'PY'
import sys
s=open('cartograph/bake-ground.js').read()
a="    deform = buildDeformer({ tiles: shapeArtifact,\n"
assert s.count(a)==1
s=s.replace(a,"""    writeFileSync(process.env.DEFORM_DUMP, JSON.stringify({ bands: { curb: [...painted('curb'), ...painted('curbCut')], lawn: painted('treelawn'), walk: painted('sidewalk') }, stencil: stencil.clipPolygon, tiles: shapeArtifact }))
    throw new Error('DUMPED deformer inputs to ' + process.env.DEFORM_DUMP)
"""+a)
open(sys.argv[1],'w').write(s)
PY
DEFORM_DUMP=$O/inputs.json SWAP_MAP="{\"/cartograph/bake-ground.js\":\"$C\"}" node --max-old-space-size=14000 --import ./scratch/kerb-cut/swap.mjs cartograph/bake-ground.js --look=$S --scene=$S --out-dir=$O > $O/bake.log 2>&1 || true
grep -q "DUMPED deformer inputs" $O/bake.log && echo "dumped $(wc -c < $O/inputs.json) bytes" || { echo "DUMP FAILED"; tail -5 $O/bake.log; exit 1 }
