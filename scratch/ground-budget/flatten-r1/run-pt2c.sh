#!/bin/zsh
# run-pt2.sh — capture A (the cut) then B (pre-cut tileGround), one at a time, the gate before each; then repro on both
W=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/rings-only/scratch/ground-budget/flatten-r1; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
ld() { sysctl -n vm.loadavg | awk '{print int($2)}' }
one() { local tag=$1 tg=$2
  if (( $(ld) >= 8 )); then echo "load $(sysctl -n vm.loadavg) — waiting one minute"; sleep 60; fi
  if (( $(ld) >= 8 || $(free_pct) < 55 )); then echo "⛔ $tag not launched: load $(sysctl -n vm.loadavg) · free $(free_pct)%"; exit 2; fi
  echo "$tag launch $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
  O=$W/slabs/diag; rm -rf $O; mkdir -p $O
  snap() { find -L $R/cartograph/data/hipointedemun $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }; snap > $W/snap-before.txt
  ( cd $R/cartograph; PT_AT=-20.71,-587.62 PT_OUT=$W/pt2-$tag.json SWAP_MAP="{\"cartograph/bake-ground.js\":\"$W/bake-ground.pt2.js\",\"src/lib/tileGround.js\":\"$tg\"}" /usr/bin/time -l node --max-old-space-size=8000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=hipointedemun --scene=hipointedemun --out-dir=$O --shore=pending > $W/pt2-$tag.log 2>&1 ) &
  local P=$! minf=100; while kill -0 $P 2>/dev/null; do f=$(free_pct); (( f < minf )) && minf=$f; (( f < 20 )) && { echo KILL20; pkill -f "out-dir=$O"; }; sleep 5; done; wait $P; echo "  $tag exit $? · min free $minf%"
  snap > $W/snap-after.txt; echo "  guard $(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]')"
  grep -E '\[pt2\]|^[A-Za-z]*Error| real |maximum resident' $W/pt2-$tag.log | cut -c1-300 | sed 's/^/  /' }
one C $W/../../../src/lib/tileGround.js

for t in C; do echo "== repro $t"; node $W/repro-pt2.mjs $W/pt2-$t.json | cut -c1-260; done
node -e 'for (const t of ["C"]) { const d=require("/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/rings-only/scratch/ground-budget/flatten-r1/pt2-"+t+".json"); const v=d.validity; const tot=Object.values(v).reduce((s,x)=>[s[0]+x.onOuter,s[1]+x.holeHole,s[2]+x.repeated],[0,0,0]); console.log(t, "town-wide: hole-on-outer", tot[0], "· hole-on-hole", tot[1], "· repeated", tot[2]); for (const [k,x] of Object.entries(v).sort((a,b)=>(b[1].onOuter+b[1].holeHole+b[1].repeated)-(a[1].onOuter+a[1].holeHole+a[1].repeated)).slice(0,40)) console.log("   ", k.padEnd(28), x.onOuter, x.holeHole, x.repeated, "of", x.items, "items") }'
