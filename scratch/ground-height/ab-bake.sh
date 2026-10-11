#!/bin/zsh
# ab-bake.sh <scene> <variant: before|after|tol48> — one OFFLINE ground bake into scratch/ground-height/ab/<scene>-<variant>/
# (never the served slab), timed, then walk-slope on it. before = HEAD's bake-ground.js; tol48 = variant-tol.mjs's copy.
set -e
cd "$(dirname $0)/../.."
S=$1 V=$2 D=$PWD/scratch/ground-height/ab/$S-$V
mkdir -p $D
case $V in
  before) SWAP="{\"/cartograph/bake-ground.js\":\"$PWD/scratch/ground-height/bake-ground.before.js\"}" ;;
  tol48)  SWAP="{\"/cartograph/bake-ground.js\":\"$PWD/scratch/ground-height/bake-ground.tol48.js\"}" ;;
  after)  SWAP="{}" ;;
esac
T0=$(date +%s)
SWAP_MAP=$SWAP /usr/bin/time -l node --max-old-space-size=14000 --import ./scratch/kerb-cut/swap.mjs cartograph/bake-ground.js --look=$S --scene=$S --out-dir=$D > $D/bake.log 2> $D/time.log || { echo "BAKE FAILED"; tail -5 $D/bake.log; tail -3 $D/time.log; exit 1 }
T1=$(date +%s)
echo "$S $V: bake $((T1 - T0)) s · peak RSS $(grep 'maximum resident' $D/time.log | awk '{printf "%.1f GB", $1/1e9}') · ground.bin $(ls -l $D/ground.bin | awk '{printf "%.1f MB", $5/1e6}') · tris $(node -e "const g=require('$D/ground.json');console.log(g.groups.reduce((a,x)=>a+x.indexCount/3,0))")"
node scratch/ground-height/walk-slope.mjs $S --dir=$D --json=$D/walk-slope.json 2>&1 | grep -E "^  sidewalk|cross \(rendered\)|longest edge|over the bake|area share over, exag 1:" | head -12
