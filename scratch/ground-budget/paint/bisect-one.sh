#!/bin/zsh
# ONE paint-only run of bake-ground at <commit>, stopped right after the flatten step <stop key> (Brace, 2026-10-14; Boz's
# bisect of the paint growth 94347ebc → HEAD). A fresh scratch worktree under .claude/worktrees/, its huron data dir LINKED
# to HEAD's so only the code differs; removed after. Every console line is stamped with seconds since start. --shore=pending
# is passed where that commit's bake-ground knows it (serve.js's 'ground' pass). Guards: load < 8 and free >= 40% to start;
# load + free every 60 s; killed below 20%; data/huron + public/ snapshotted (path, size, mtime) before and after.
#   bisect-one.sh <commit> <stop key> → scratch/ground-budget/paint/bisect/<commit>-<stop>.log, one summary line on stdout
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
C=$1; STOP=$2; R=$PWD; P=$R/scratch/ground-budget/paint; B=$P/bisect; OUT=$P/out; mkdir -p $B $OUT
W=$R/.claude/worktrees/paint-bisect-$C; TAG=$C-${STOP//:/_}; LOG=$B/$TAG.log
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
snap() { find -L $R/cartograph/data/huron $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
git worktree add --detach $W $C >/dev/null 2>&1 || { echo "$C ⛔ worktree add failed"; exit 1 }
[[ -d $W/cartograph/data/huron && ! -L $W/cartograph/data/huron ]] && rm -rf $W/cartograph/data/huron
ln -s $R/cartograph/data/huron $W/cartograph/data/huron; ln -s $R/node_modules $W/node_modules
python3 - $W/cartograph/bake-ground.js <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read()
hdr = """// ⚠️ SCRATCH BISECT COPY (Brace, 2026-10-14): stamped lines; exits when the flatten step after PAINT_STOP_AFTER begins,
// or right after the paint stack. Never the served bake.
const __t0 = Date.now(), __ol = console.log.bind(console), __ow = console.warn.bind(console), __stop = process.env.PAINT_STOP_AFTER
let __last = null
const __st = () => `[+${((Date.now() - __t0) / 1000).toFixed(1)}s]`
console.warn = (...a) => __ow(__st(), ...a)
console.log = (...a) => { const m = /\\[progress\\] flatten (\\S+)/.exec(a.map(String).join(' '))
  if (m && __stop && __last === __stop) { __ol(__st(), '[paint-only] stopping after', __stop); process.exit(0) }
  if (m) __last = m[1]; __ol(__st(), ...a) }
"""
anchor = "in ${((Date.now() - _t0) / 1000).toFixed(1)}s`)\n"
if s.count(anchor) != 1: sys.exit('no unique paint-stack anchor')
s = hdr + s.replace(anchor, anchor + "  console.log('[paint-only] stopping after the paint stack'); process.exit(0)\n")
open(p, 'w').write(s)
EOF
(( $? )) && { echo "$C ⛔ could not patch bake-ground (named above)"; git worktree remove --force $W; exit 1 }
SHORE=; grep -q -- "--shore=pending" $W/cartograph/bake-ground.js && SHORE=--shore=pending
while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
snap > $B/$TAG.snap-before; touch $B/$TAG.marker
echo "$C start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)% · $SHORE" > $B/$TAG.load
( cd $W/cartograph; PAINT_STOP_AFTER=$STOP exec /usr/bin/time -l node --max-old-space-size=14000 bake-ground.js --look=huron --scene=huron --out-dir=$OUT $SHORE ) > $LOG 2>&1 &
PID=$!; n=0
while kill -0 $PID 2>/dev/null; do (( n % 4 == 0 )) && echo "  [load] $(date +%H:%M:%S) $(sysctl -n vm.loadavg) · free $(free_pct)%" >> $B/$TAG.load
  (( $(free_pct) < 20 )) && { echo "  ⛔ free < 20%: killing" >> $B/$TAG.load; kill $PID; }; (( n++ )); sleep 15; done
wait $PID; RC=$?
snap > $B/$TAG.snap-after
CH=$(diff $B/$TAG.snap-before $B/$TAG.snap-after | grep -c '^[<>]'); NEW=$(find -L $R/cartograph/data/huron $R/public -newer $B/$TAG.marker -type f | wc -l | tr -d ' ')
rm $W/cartograph/data/huron $W/node_modules; git worktree remove --force $W; git worktree prune
# the step's own time: from its flatten line to the next stamped line; pre-stack: to the first flatten line
ST=$(grep -o '+[0-9.]*s\].*' $LOG | awk -v k=$STOP '{t=substr($1,2)+0} f&&!d&&/progress\] flatten |stopping after|pressed down/{print t-s; d=1} /\[progress\] flatten /{if($4==k){s=t;f=1}}')
PRE=$(grep -m1 -o '+[0-9.]*s\]   \[progress\] flatten' $LOG | awk '{print substr($1,2)+0}')
echo "$C rc $RC · pre-stack ${PRE:-?} s · $STOP ${ST:-?} s · guard changed $CH newer $NEW · $(tail -1 $B/$TAG.load | cut -c3-)"
