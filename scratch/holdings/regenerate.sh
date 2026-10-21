#!/bin/sh
# regenerate.sh <main> <out.md> — the holdings audit (HOLDINGS-*.md). Read-only on <main> (the checkout holding the town
# data); code = this checkout. Writes only <out.md> (+ a temp dir it removes). head.md is the hand-written narrative.
set -e
MAIN="$1"; OUT="$2"; HERE="$(cd "$(dirname "$0")/../.." && pwd)"
[ -d "$MAIN/cartograph/data" ] && [ -n "$OUT" ] || { echo "usage: sh scratch/holdings/regenerate.sh <main checkout> <out.md>"; exit 2; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
node "$HERE/scratch/holdings/inventory.mjs" "$MAIN" "$HERE" > "$T/rows.json"
node "$HERE/scratch/holdings/render.mjs" "$T/rows.json" "$HERE" "$MAIN" > "$T/table.md"
cat "$HERE/scratch/holdings/head.md" "$T/table.md" > "$OUT"
echo "wrote $OUT"
