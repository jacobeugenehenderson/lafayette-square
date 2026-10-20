#!/bin/zsh
# run-ls.sh — LS's scratch pour (lattice-r1/ls-pour/tree, Loess's capture route): the tree's bake-ground to the end of the ①
# producer (Lath's make-cap hook exits there) with the join-census copy of the tree's tileGround → census-lafayette-square.json.
# guard.mjs throws on any write outside the tree and this dir. Gated: load < 8, free ≥ 40%, no bake-ground or pipeline running;
# killed under 30% free. Never touches public/ or cartograph/data/.
J=${0:A:h}; L=$J/../lattice-r1/ls-pour; T=${L:A}/tree
F=$(memory_pressure | awk -F': ' '/free percentage/ {print int($2)}')
if (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 40 )) || pgrep -f '[n]ode .*(bake-ground|pipeline)\.js' >/dev/null; then echo "not launched ($(sysctl -n vm.loadavg) free $F%)"; exit 2; fi
export WRITE_ALLOW=$T:$J
mkdir -p $J/out-ls
export CAP_OUT=$J/cap-ls.json CENSUS_OUT=$J/census-lafayette-square.json SWAP_MAP="{\"src/lib/tileGround.js\":\"$J/tileGround.census.ls.js\"}"
cd $T/cartograph
/usr/bin/time -l node --max-old-space-size=8000 --import ${L:A}/guard.mjs --import $T/scratch/ground-budget/swap.mjs bake-ground.js --look=lafayette-square --scene=lafayette-square --out-dir=$J/out-ls --shore=pending > $J/run-ls.log 2> $J/run-ls.err &
pid=$!
while kill -0 $pid 2>/dev/null; do free=$(memory_pressure | tail -1 | grep -oE '[0-9]+'); if [ "$free" -lt 30 ]; then echo "ABORT: free ${free}%"; kill $pid; exit 2; fi; sleep 10; done
wait $pid; echo "rc $? · $(ls -la $J/census-lafayette-square.json 2>&1)"; grep -E "real|maximum resident" $J/run-ls.err; grep "\[guard\] write" $J/run-ls.err | grep -v "$J" | head -3
