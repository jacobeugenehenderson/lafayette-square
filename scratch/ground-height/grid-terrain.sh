#!/bin/zsh
# grid-terrain.sh <scene> <m> — bake the scene's terrain at an <m>-metre grid (scratch copy of bake-terrain.js with
# M_PER_SAMPLE = m, swapped in memory) into scratch/ground-height/grid/<scene>-<m>m/. Never the scene's clean/.
set -e
cd "$(dirname $0)/../.."
S=$1 M=$2 D=$PWD/scratch/ground-height/grid/$S-${M}m
mkdir -p $D
sed "s/^const M_PER_SAMPLE     = 5 /const M_PER_SAMPLE     = $M /" cartograph/bake-terrain.js > $D/bake-terrain.js
grep -q "M_PER_SAMPLE     = $M " $D/bake-terrain.js || { echo "M_PER_SAMPLE anchor moved"; exit 1 }
T0=$(date +%s)
SWAP_MAP="{\"/cartograph/bake-terrain.js\":\"$D/bake-terrain.js\"}" /usr/bin/time -l node --max-old-space-size=14000 --import ./scratch/kerb-cut/swap.mjs cartograph/bake-terrain.js --scene=$S --out-dir=$D > $D/bake.log 2> $D/time.log || { echo FAILED; tail -5 $D/bake.log $D/time.log; exit 1 }
T1=$(date +%s)
node -e "const t=require('$D/terrain.json');const b=require('fs').statSync('$D/terrain.bin').size;console.log('$S ${M} m: '+t.width+'×'+t.height+' · terrain.bin '+(b/1e6).toFixed(1)+' MB (R32F texture, GPU '+(t.width*t.height*4/1e6).toFixed(1)+' MB, no mips) · bake $((T1-T0)) s · peak RSS '+($(grep 'maximum resident' $D/time.log | awk '{print $1}')/1e9).toFixed(1)+' GB · datum '+t.datum+' '+t.baseElev)"
