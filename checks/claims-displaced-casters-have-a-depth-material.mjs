#!/usr/bin/env node
/**
 * claims-displaced-casters-have-a-depth-material — PER MESH.
 *
 * ⛔ THE CLASS: a mesh that CASTS a shadow is drawn into the shadow map with three's own
 * MeshDepthMaterial — NOT with its render material. So any vertex displacement done in the
 * render material's shader (`transformed.y += …`, or a `patchTerrain*` helper, which does the
 * same thing in src/utils/terrainShader.js) is INVISIBLE to the shadow pass, and the caster is
 * recorded at a position it is not drawn at — buried in the terrain on a hilly town, where it
 * shadows nothing (huron, 2026-09-20: the whole town had no cast shadows).
 *
 * The fix is `customDepthMaterial` carrying the SAME displacement. ⭐ A `position` prop is not
 * an offender: it rides modelMatrix, which the depth pass honours.
 *
 * ⭐ PER MESH, not per file (2026-09-26). The file-level version passed LafayetteScene because
 * `Foundations` had a depth material, while `Building` in the same file lifted in its shader
 * and cast with none — Stage's buildings sat on the baseline in the shadow map. For every
 * `<mesh>` / `<instancedMesh>` that casts, this resolves its material and its depth material
 * to their definitions in the same file:
 *   - the material DISPLACES  ⇒ a customDepthMaterial is required, and it must displace too
 *     (a plain depth material is the same bug with a fig leaf);
 *   - ⛔ NO FALLBACK: a material this cannot resolve, in a file that displaces anything, is
 *     reported UNRESOLVED — a failure, never a pass. Imperative casters (`o.castShadow = true`)
 *     in a file that displaces are UNRESOLVED for the same reason.
 * ⚠️ Limit: a material built in ANOTHER file and passed in as a prop is judged by this file's
 * text only. That is the static ceiling; the runtime walk of the live scene is the upgrade.
 *
 * READS THE SOURCE — never a copied list. Run: node checks/claims-displaced-casters-have-a-depth-material.mjs
 * Mutation-tested: deleting `customDepthMaterial={depthMaterial}` from LafayetteScene's
 * `Building` fails it; so does removing the lift from its depth material.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
// Allow the mutation test to point at a single file: --file=<path>
const ONLY = process.argv.find(a => a.startsWith('--file='))?.slice(7)

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|jsx)$/.test(e)) out.push(p)
  }
  return out
}

// Displacement: a shader write to `transformed`, a terrain patch helper, or a named lift snippet.
const DISPLACES = /transformed(\.[xyz])?\s*(\+=|-=|=)|patchTerrain\w*\(|RISER_LIFT_GLSL|TERRAIN_DISPLACE/

// The text from `start` to the end of one balanced expression (stops at a depth-0 newline
// followed by a line that is not a continuation, or at a depth-0 `;`/`,`/`)` closer).
function balanced(src, start) {
  let d = 0, q = null
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (q) { if (c === '\\') { i++; continue } if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if ('([{'.includes(c)) d++
    else if (')]}'.includes(c)) { if (d === 0) return src.slice(start, i); d-- }
    else if (d === 0 && (c === ';' || c === '\n')) return src.slice(start, i)
  }
  return src.slice(start)
}

// One JSX opening tag, from `<` to its closing `>` at brace depth 0.
function tagAt(src, i) {
  let d = 0, q = null
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (q) { if (c === '\\') { j++; continue } if (c === q) q = null; continue }
    if (d > 0 && (c === '"' || c === "'" || c === '`')) { q = c; continue }
    if (c === '{') d++
    else if (c === '}') d--
    else if (c === '>' && d === 0 && src[j - 1] !== '=') return src.slice(i, j + 1)
  }
  return null
}

function attr(tag, name) {
  // A PROP name only: preceded by whitespace, followed by `=`, whitespace, `/` or `>` — so
  // `lampModel.material` or `args={[g, material, n]}` inside another prop never matches.
  const m = tag.match(new RegExp(`(?<=\\s)${name}(?=\\s*=|\\s|\\/|>)(\\s*=\\s*\\{)?`))
  if (!m) return null
  if (!m[1]) return true                      // bare prop: `castShadow`
  return balanced(tag, m.index + m[0].length) // the {…} expression
}

// The definition of identifier `id` NEAREST BEFORE the mesh (names like `mat` repeat per
// component in one file; the first one in the file is often someone else's). null = unresolved.
function defOf(src, id, before) {
  let last = null
  for (const m of src.matchAll(new RegExp(`(?:const|let|var)\\s+${id}\\s*=\\s*`, 'g'))) {
    if (m.index < before) last = m
  }
  return last ? balanced(src, last.index + last[0].length) : null
}
function resolve(src, expr, before) {
  const e = String(expr).trim()
  if (!/^[A-Za-z_$][\w$]*$/.test(e)) return { def: null, expr: e }
  return { def: defOf(src, e, before), expr: e }
}

const offenders = [], unresolved = [], ok = []
const files = ONLY ? [ONLY.startsWith('/') ? ONLY : join(ROOT, ONLY)] : walk(SRC)
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const rel = relative(ROOT, f)
  const fileDisplaces = DISPLACES.test(src)
  const lineOf = (i) => src.slice(0, i).split('\n').length

  for (const m of src.matchAll(/<(mesh|instancedMesh)[\s>]/g)) {
    const tag = tagAt(src, m.index)
    if (!tag) continue
    const cast = attr(tag, 'castShadow')
    if (!cast || /^\s*false\s*$/.test(String(cast))) continue
    const where = `${rel}:${lineOf(m.index)}`
    // material={X}, or instancedMesh args={[geom, X, n]}
    let matExpr = attr(tag, 'material')
    if (matExpr == null && m[1] === 'instancedMesh') {
      const args = attr(tag, 'args')
      const parts = args && String(args).replace(/^\s*\[|\]\s*$/g, '').split(',')
      matExpr = parts?.[1]?.trim() ?? null
    }
    if (matExpr == null) {                     // JSX child material, e.g. <meshStandardMaterial />
      ok.push(`${where} (inline JSX material)`); continue
    }
    const mat = resolve(src, matExpr, m.index)
    if (!mat.def) {
      if (fileDisplaces) unresolved.push(`${where} material={${mat.expr}} — cannot resolve, and this file displaces`)
      else ok.push(`${where} (material ${mat.expr} not defined here; file does not displace)`)
      continue
    }
    if (!DISPLACES.test(mat.def)) { ok.push(`${where} (${mat.expr} does not displace)`); continue }
    const depthExpr = attr(tag, 'customDepthMaterial')
    if (depthExpr == null) { offenders.push(`${where} material=${mat.expr} displaces; NO customDepthMaterial`); continue }
    const dm = resolve(src, depthExpr, m.index)
    if (!dm.def) { unresolved.push(`${where} customDepthMaterial={${dm.expr}} — cannot resolve`); continue }
    if (!DISPLACES.test(dm.def)) { offenders.push(`${where} customDepthMaterial=${dm.expr} does NOT repeat the displacement`); continue }
    ok.push(`${where} (${mat.expr} → ${dm.expr})`)
  }
  // Imperative casters (`o.castShadow = true`): unresolvable statically.
  for (const m of src.matchAll(/\.castShadow\s*=\s*(?!false)[^;\n]*/g)) {
    if (/\blight\b|isLight|DirectionalLight|\bkey\b/.test(src.slice(Math.max(0, m.index - 80), m.index + m[0].length))) continue
    if (fileDisplaces) unresolved.push(`${rel}:${lineOf(m.index)} imperative castShadow in a file that displaces`)
  }
}

for (const o of ok) console.log(`  ok    ${o}`)
if (!offenders.length && !unresolved.length) {
  console.log(`\n✅ every casting mesh whose material displaces carries a depth material that repeats it (${ok.length} meshes checked)`)
  process.exit(0)
}
if (offenders.length) {
  console.error('\n⛔ CASTING MESHES WHOSE DISPLACEMENT THE SHADOW PASS NEVER SEES:')
  for (const o of offenders) console.error('   ' + o)
}
if (unresolved.length) {
  console.error('\n⛔ UNRESOLVED — could not prove these, so they fail (no fallback):')
  for (const o of unresolved) console.error('   ' + o)
}
console.error('\nGive the mesh a customDepthMaterial that repeats the same displacement')
console.error('(see SlabBuildings.jsx, or LafayetteScene.jsx `Building`).')
process.exit(1)
