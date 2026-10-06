// scene-address.mjs — a town's WEB ADDRESS becomes its scene id and its Look id (BRIEF-nyc-adapter §3.0).
// Pure decisions + one filesystem plan, shared by serve.js and checks/claims-a-scene-is-named-not-numbered.mjs,
// so the check drives the code that runs rather than restating it.
import { existsSync, readdirSync, statSync, renameSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { slugifyName, isNumericId } from '../src/lib/sceneSlug.js'

// The Look id for POST /looks. A STATED id (Extent's Pour passes the town's address) is used as given or
// refused — ⛔ never suffixed: a `-2` would be a Look the town's address does not name. Without one, the id
// is the name's slug made unique (a Designer "new Look").
export function lookIdFor({ statedId, name, existingIds }) {
  if (statedId != null) {
    const sid = String(statedId)
    if (sid !== slugifyName(sid) || isNumericId(sid)) return { status: 400, error: `refusing to create look "${sid}": not a web-address name (lowercase letters, digits, hyphens; not a number)` }
    if (existingIds.includes(sid)) return { status: 409, error: `refusing to create look "${sid}": a Look with that id already exists` }
    return { id: sid }
  }
  const base = slugifyName(name) || 'look'
  let id = base, n = 2
  while (existingIds.includes(id)) { id = `${base}-${n}`; n++ }
  return { id }
}

// ⭐ A town may be DECLARED before it is fetched (OPERATIONS "Declare the well"): its folder holds its
// declarations (sources.json) and nothing fetched or drafted — no geography.json, no neighborhood.json.
export const isDeclaredOnly = (dir) => existsSync(dir) && !existsSync(join(dir, 'geography.json')) && !existsSync(join(dir, 'neighborhood.json'))

// A draft JOINS a declared-only folder entry by entry. A file both hold with BYTE-IDENTICAL content is not a clash
// (one copy stays; the draft's is dropped with the draft). ⛔ Any name both hold with different bytes (or file-vs-folder)
// refuses the whole move before anything moves. Returns { moves, clash, same }.
export function planJoin(src, dst) {
  const moves = [], clash = [], same = []
  const walk = (a, b) => { for (const e of readdirSync(a)) {
    const pa = join(a, e), pb = join(b, e)
    if (!existsSync(pb)) moves.push([pa, pb])
    else if (statSync(pa).isDirectory() && statSync(pb).isDirectory()) walk(pa, pb)
    else if (statSync(pa).isFile() && statSync(pb).isFile() && readFileSync(pa).equals(readFileSync(pb))) same.push(pb.slice(dst.length + 1))
    else clash.push(pb.slice(dst.length + 1)) } }
  walk(src, dst)
  return { moves, clash, same }
}
export function executeJoin(src, { moves }) {
  for (const [a, b] of moves) renameSync(a, b)
  rmSync(src, { recursive: true, force: true })
}
