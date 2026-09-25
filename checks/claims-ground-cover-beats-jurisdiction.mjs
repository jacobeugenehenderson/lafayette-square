// claims-ground-cover-beats-jurisdiction.mjs
//
// ⭐⭐ THE INVARIANT: where a MANAGEMENT polygon (park, nature reserve, protected area) and a
// GROUND COVER polygon (sand, beach, dune, wood, wetland…) both cover a face, the ground cover
// takes it. A park is a jurisdiction; sand is what you are standing on; the surface wants what
// the ground IS. *(Jacob, 2026-09-25: "yes, ground cover wins.")*
//
// ⛔⛔ THE DEFECT THAT FORCED IT, and it was ours: once a face took the class of whatever
// COVERED it (dc0c264f), Provincetown's dunes became LAWN. Measured — `leisure=nature_reserve`
// admits **180,227,102 m²** to the vote (the Cape Cod National Seashore) against beach's
// 13,908,598 m². The Seashore is a line saying who MANAGES the land; it says nothing about
// whether you are standing on sand. Area share alone cannot tell those apart, so it handed the
// whole shore to the bigger claim.
//
// ⛔ THE RULE IS A FILTER, NOT A WEIGHT. A 180 km² reserve must not out-vote 30 m² of sand,
// because the question is not "how much" but "what kind". Anything that makes this a
// tie-break or a multiplier reintroduces the bug at a different scale.
// ⛔ And the kind is declared PER TAG, never per town and never from the LU class: `park`
// arrives from `leisure=park` (a lawn) and from a national park boundary spanning dunes and
// forest alike. Only the source tag carries the distinction.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. `return bestCover ?? best` → `return best`          (park over sand)
//   2. make it a weight, not a filter (compare areas)       (the reserve wins again)
//   3. move `natural:sand` out of the cover list            (a declared tag silently demoted)
//
//   node checks/claims-ground-cover-beats-jurisdiction.mjs
// Read-only, hermetic.
import { luWinnerFromCoverage, OSM_LU_KIND } from '../cartograph/derive.js'

let failed = false
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }

// ① the Provincetown case, at its real scale
{
  const got = luWinnerFromCoverage({
    'leisure:nature_reserve': { lu: 'park',  area: 180227102 },
    'natural:sand':           { lu: 'beach', area: 13908598 },
  })
  say(got === 'beach', `a 180 km² nature reserve does NOT beat 13.9 km² of sand — got ${got}`)
}
// ② and it is a FILTER: the margin must not matter
{
  const got = luWinnerFromCoverage({
    'leisure:nature_reserve': { lu: 'park',  area: 180000000 },
    'natural:sand':           { lu: 'beach', area: 30 },
  })
  say(got === 'beach', `30 m² of sand still beats 180 km² of reserve — it is a kind, not a quantity — got ${got}`)
}
// ③ a park KEEPS the face where no cover reaches it — LS's Lafayette Park, HPDM's Forest Park
{
  const got = luWinnerFromCoverage({ 'leisure:park': { lu: 'park', area: 40000 } })
  say(got === 'park', `a park with no ground cover under it stays park (the lawn case) — got ${got}`)
}
{
  const got = luWinnerFromCoverage({
    'leisure:park':   { lu: 'park',    area: 40000 },
    'amenity:parking':{ lu: 'parking', area: 500 },
  })
  say(got === 'park', `a car park inside a park does not flip it — neither is a ground cover, so area decides as before — got ${got}`)
}
// ④ between two covers, area still decides
{
  const got = luWinnerFromCoverage({
    'natural:sand': { lu: 'beach',   area: 100 },
    'natural:wood': { lu: 'recreation', area: 9000 },
  })
  say(got === 'recreation', `between two COVERS the larger still wins — got ${got}`)
}
// ⑤ a tag in neither list votes as it always did
{
  const got = luWinnerFromCoverage({
    'landuse:retail':     { lu: 'commercial',  area: 900 },
    'landuse:residential':{ lu: 'residential', area: 100 },
  })
  say(got === 'commercial', `two UNDECLARED tags: unchanged, area decides — got ${got}`)
}
// ⑥ the table itself must keep both kinds — a collapse cannot be hidden by editing rows above
{
  const kinds = new Set(Object.values(OSM_LU_KIND))
  say(kinds.has('cover') && kinds.has('management'),
      `the declared table still carries BOTH kinds — ${[...kinds].join(', ')}`)
  say(OSM_LU_KIND['natural:sand'] === 'cover' && OSM_LU_KIND['leisure:nature_reserve'] === 'management',
      `sand is cover and a nature reserve is management, by declaration`)
}

console.log(`\n${failed ? '⛔ RED' : '✅ GREEN — ground cover wins; a jurisdiction keeps only what no cover claims.'}`)
process.exit(failed ? 1 : 0)
