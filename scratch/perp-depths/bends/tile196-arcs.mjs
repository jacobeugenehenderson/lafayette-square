// tile196-arcs.mjs — the frozen shape tile 196's ring 0: which vertex indices carry which iaArc value (no producer run)
import { readFileSync } from 'fs'
const sh = JSON.parse(readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/hpdm-gate/cartograph/data/hipointedemun/clean/ribbons.json', 'utf8'))
console.log(Object.keys(sh).slice(0, 20).join(', '))
