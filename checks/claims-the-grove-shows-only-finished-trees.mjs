// claims-the-grove-shows-only-finished-trees.mjs — CAN THE GROVE SHOW A TREE THAT ISN'T THIS TOWN'S, OR ISN'T BAKED?
//
// Jacob, 2026-09-25: "The grove is ONLY completed, ready, baked, ready to place trees. There is no such
// thing as placeholders." + LS species "out of ALL LISTS FOREVER EVERYWHERE". Provincetown's Grove showed
// six red posts after its roster was clean: the tiles come from EVERY published library variant, and
// eligibleByLibId FAILED OPEN ("INCLUDED rather than dropped") for species no board row owned.
// Holds, reading src/arborist/Grove.jsx:
//   ① eligibleByLibId FAILS CLOSED — a species no board row owns is excluded (the view AND the capture pool);
//   ② the view's inLook requires BOTH this town's ownership AND the species baked into THIS Look's atlas;
//   ③ TileBoundary draws no placeholder geometry;
//   ④ the "no impostor" banner is not in the Grove (a capture gap is the Salon roster's to name).
//
// ▶ MUTATION-TEST IT: in eligibleByLibId, `return false` → `return true` → ① RED.
//
//   node checks/claims-the-grove-shows-only-finished-trees.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const s = fs.readFileSync(process.env.GROVE_SRC || path.join(REPO, 'src/arborist/Grove.jsx'), 'utf8')
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)
const body = (start) => { const i = s.indexOf(start); if (i < 0) return null; let d = 0, j = s.indexOf('{', i)
  for (let k = j; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return s.slice(j, k + 1) } return null }

const elig = body('function eligibleByLibId(')
if (!elig) bad('eligibleByLibId not found — the check and the source have drifted')
else {
  const afterOwner = elig.slice(elig.indexOf('if (owner)') + 'if (owner)'.length)
  const code = afterOwner.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  ;/return true\b/.test(code) ? bad('① eligibleByLibId still returns TRUE for a species no board row owns (fails open)')
    : /return false\b/.test(code) ? ok('① eligibleByLibId fails closed') : bad('① eligibleByLibId has no explicit closed return')
}

const inLook = s.match(/const inLook = \(v\) => ([\s\S]*?)\n\n/)
if (!inLook) bad('inLook not found')
else {
  const e = inLook[1]
  const baked = /bakedHere\(v\.speciesId\)\s*&&/.test(e) && /const bakedHere = [^\n]*barkBySpecies/.test(s)
  const owned = /eligibleNames\.has\(v\.speciesId\)|eligibleByLibId\(v\.speciesId/.test(e)
  baked && owned ? ok('② the view requires ownership AND baked-into-this-atlas')
    : bad(`② inLook doesn't require ${[!baked && 'baked-into-this-atlas', !owned && 'ownership'].filter(Boolean).join(' + ')}`)
}

const tb = body('class TileBoundary extends Component')
!tb ? bad('TileBoundary not found') : /<mesh|Geometry|Material/.test(tb) ? bad('③ TileBoundary still draws placeholder geometry') : ok('③ TileBoundary draws no placeholder')

;/no impostor:/.test(s.split('\n').filter(l => !/^\s*(\/\/|\{\/\*)/.test(l)).join('\n')) ? bad('④ the "no impostor" banner is still in the Grove') : ok('④ no "no impostor" banner in the Grove')

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
