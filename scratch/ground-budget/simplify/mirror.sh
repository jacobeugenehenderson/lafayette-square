#!/bin/zsh
# mirror.sh <slab dir> — a scratch ASSET_BASE holding baked/hipointedemun/: the slab dir's ground.json, ground.bin and
# shape.json, and every other served file as a SYMLINK to public/baked/hipointedemun/ (nothing copied, nothing served
# overwritten). Open it with a SECOND Vite (not started here — Boz/Jacob's call):
#   VITE_ASSET_BASE=/scratch/ground-budget/simplify/serve/ npx vite --port 5174 --strictPort
set -e
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
SRC=$1; D=scratch/ground-budget/simplify/serve/baked/hipointedemun
rm -rf $D; mkdir -p $D
for f in public/baked/hipointedemun/*; do ln -s ../../../../../../$f $D/$(basename $f); done
for f in ground.json ground.bin shape.json; do rm -f $D/$f; cp $SRC/$f $D/$f; done
ls -la $D | head -8; echo "→ $D from $SRC"
