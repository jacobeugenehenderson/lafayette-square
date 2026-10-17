#!/bin/zsh
# sweep.sh — the simplifier at refineTol × {¼, ½, 1, 2, 4} on HPDM's 10-14 HEAD gate slab, each measured beside it.
# sweep-2026-10-17-prefold.log is the run before the no-new-fold guard (it added folds; superseded).
# refineTol 7.8 mm is HPDM HEAD's own (full-hipointedemun-HEAD.log: "ped bands refine to 7.8 mm").
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
IN=.claude/worktrees/rings-only/scratch/ground-budget/flatten-r1/slabs/hipointedemun-HEAD
S=public/baked/hipointedemun/scene.json
for x in 0.25 0.5 1 2 4; do
  tol=$(python3 -c "print(0.0078*$x)")
  O=scratch/ground-budget/simplify/slabs/hpdm-x$x
  echo "== x$x tol $tol load $(uptime | sed 's/.*averages: //') free $(memory_pressure | tail -1 | grep -o '[0-9]*%')"
  node --max-old-space-size=8192 scratch/ground-budget/simplify/simplify.mjs --in=$IN --out=$O --tol=$tol --scene=$S
  node --max-old-space-size=8192 scratch/ground-budget/simplify/measure.mjs --a=$IN --b=$O --scene=$S --n=1000000 --tj
  node --max-old-space-size=8192 scratch/ground-budget/simplify/fold-sites.mjs --slab=$O --scene=$S --out=$O/fold-sites.tsv
done
