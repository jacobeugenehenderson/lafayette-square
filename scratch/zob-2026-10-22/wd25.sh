#!/bin/zsh
# run "$@" and kill its process group when free memory drops below 35%
"$@" & pid=$!
while kill -0 $pid 2>/dev/null; do
  f=$(memory_pressure | tail -1 | grep -o '[0-9]*%' | tr -d %)
  if [ -n "$f" ] && [ "$f" -lt 25 ]; then echo "⛔ WATCHDOG: free $f% < 25% — killed"; pkill -P $pid; kill $pid; break; fi
  sleep 5
done
wait $pid; echo "exit $?"
