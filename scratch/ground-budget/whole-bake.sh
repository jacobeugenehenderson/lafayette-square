#!/bin/zsh
# The ground budget's whole-bake timing (Brace, 2026-10-13): ONE real bake-ground on d09644cc's code (7 files swapped in
# memory from extracts, nothing written into the tree) with V2 + the shared edge cache + the triangle cache, into a scratch
# out-dir, the heap flag explicit. Gates: load < 8 and free >= 40% to start; load and free logged every 60 s; killed below
# 20% free. The wall time is written beside the slab as bake-timings.json in serve.js's schema, then the budget check judges it.
#   whole-bake.sh <town> <out dir> [PED_TOL_X]
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
TOWN=$1; OUT=${2:A}; TOLX=$3; R=$PWD; X=$R/scratch/ground-budget/tern-d09644cc; V=$R/scratch/ground-budget/v2
mkdir -p $OUT
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
export SWAP_MAP="{\"cartograph/bake-ground.js\":\"$V/bake-ground.v2.js\",\"cartograph/groundConformity.js\":\"$V/groundConformity.v2.js\",\"cartograph/groundDeformer.mjs\":\"$X/cartograph/groundDeformer.mjs\",\"cartograph/lineHeight.mjs\":\"$X/cartograph/lineHeight.mjs\",\"cartograph/shoreGusset.mjs\":\"$X/cartograph/shoreGusset.mjs\",\"cartograph/surfaces.mjs\":\"$X/cartograph/surfaces.mjs\",\"cartograph/waterLevel.mjs\":\"$X/cartograph/waterLevel.mjs\",\"src/lib/tileGround.js\":\"$X/src/lib/tileGround.js\"}"
echo "start $(date) · $TOWN → $OUT · ped tol ×${TOLX:-1} · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
for f in $V/bake-ground.v2.js $V/groundConformity.v2.js $X/cartograph/*.mjs $X/src/lib/tileGround.js; do echo "  [code] ${f#$R/} $(shasum -a 256 $f | cut -c1-16)"; done
T0=$(perl -MTime::HiRes=time -e 'printf "%d", time*1000')
( cd cartograph; [[ -n $TOLX ]] && export PED_TOL_X=$TOLX; exec /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$TOWN --scene=$TOWN --out-dir=$OUT ) > $OUT/bake.log 2>&1 &
P=$!; n=0
while kill -0 $P 2>/dev/null; do
  (( n % 4 == 0 )) && echo "  [load] $(date +%H:%M:%S) $(sysctl -n vm.loadavg) · free $(free_pct)%"
  (( $(free_pct) < 20 )) && { echo "  ⛔ free $(free_pct)% < 20%: killing the bake"; pkill -P $P; kill $P; }
  (( n++ )); sleep 15
done
wait $P; RC=$?; T1=$(perl -MTime::HiRes=time -e 'printf "%d", time*1000'); MS=$((T1 - T0))
echo "exit $RC $(date) · wall $MS ms · free $(free_pct)%"
(( RC == 0 )) && node -e "require('fs').writeFileSync('$OUT/bake-timings.json', JSON.stringify({ '$TOWN:ground': { ms: $MS, at: new Date().toISOString(), from: 'whole-bake.sh wall time (d09644cc + V2 + shared edge cache + triangle cache, ped tol x${TOLX:-1})' } }, null, 1))" && node checks/claims-the-ground-stays-in-budget.mjs $OUT
