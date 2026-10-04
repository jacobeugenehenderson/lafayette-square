// claims-the-camera-has-one-definition.mjs — DOES EVERY APP DRIVE THE CAMERA THE SAME WAY?
//
// BRIEF-camera-regimes (Jacob, 2026-09-26: "we need to fix it once and for all
// and we need to make sure the action is the same across runtimes"). Two claims:
//
//  (a) NO CAMERA READS A HERO SUBJECT. The subject resolver (and its Lafayette
//      Square fallback point) is gone; shots are keyframes carrying their own aim.
//      Fails on any source that names the resolver, the fallback, or passes a
//      sixth (subject) argument to heroKeyframeAnim.
//  (b) ONE CONTROLS DEFINITION. Controls are defined per REGIME in
//      src/lib/cameraRegimes.js and mounted only by src/components/RegimeControls.jsx.
//      Fails on any other file that imports or constructs a three/drei camera-
//      controls class — the scatter that made the same drag differ per app.
//  (c) ONE SHOT-ADJACENCY TABLE (Phase 2 B). Which shot reaches which is defined
//      only in src/camera/shots.js; fails on any other file that builds the table
//      (a `hero: new Set(` literal). It was copied into three pickers.
//  (d) PREVIEW IS THE PLAYER'S EXPERIENCE (Jacob, 2026-10-04). Preview adds no camera
//      gesture of its own: no wheel / pointer listener in src/preview/PreviewApp.jsx. Its
//      "drag or wheel in Hero → Browse" rule was a gesture the player does not have.
//
// Scans the kit AND the Ward (theward/src, Phase 2 B): the Ward draws through the
// kit, so a camera it defined for itself would be a second definition. A missing
// Ward is a loud failure, never a skipped half (override with WARD_DIR).
//
// ⭐ Reads the tree; restates nothing. A new app is covered the day it is written.
//
//   node checks/claims-the-camera-has-one-definition.mjs
// Read-only. Exits 1 on any hit.
import fs from 'fs'
import path from 'path'

const WARD = path.resolve(process.env.WARD_DIR || path.join(process.env.HOME || '', 'Desktop/dev.nosync/theward'))
const WARD_SRC = path.join(WARD, 'src')
if (!fs.existsSync(path.join(WARD_SRC, 'main.jsx'))) { console.error(`⛔ the Ward is not at ${WARD} (no src/main.jsx) — set WARD_DIR; the check is half blind`); process.exit(1) }
const ROOTS = ['src', 'arborist', 'cartograph', 'meteorologist', WARD_SRC]
const HOME = 'src/components/RegimeControls.jsx'
const ADJ_HOME = 'src/camera/shots.js'
const EXT = /\.(m?js|jsx)$/

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '_archive' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (EXT.test(e.name)) out.push(p)
  }
  return out
}

const files = ROOTS.flatMap(r => walk(r))
if (!files.includes(ADJ_HOME)) { console.error(`⛔ ${ADJ_HOME} is missing — (c) is blind`); process.exit(1) }
if (!files.includes(HOME)) { console.error(`⛔ ${HOME} is missing — the check is blind`); process.exit(1) }

// Strip comments so a historical mention in prose is not a hit.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const CONTROLS = '(?:Orbit|Map|Trackball|Fly|FirstPerson|Arcball|Camera)Controls'
const importRe = new RegExp(`import\\s*\\{[^}]*\\b${CONTROLS}\\b[^}]*\\}\\s*from\\s*['"](?:@react-three/drei|three-stdlib|three/examples[^'"]*|three/addons[^'"]*)['"]`)
const newRe = new RegExp(`new\\s+${CONTROLS}\\s*\\(`)
const subjectRe = /\b(resolveHeroSubject|FALLBACK_HERO_SUBJECT)\b|lib\/heroSubject(\.js)?['"]/
const sixthArgRe = /heroKeyframeAnim\(([^()]|\([^()]*\))*?,([^()]|\([^()]*\))*?,([^()]|\([^()]*\))*?,([^()]|\([^()]*\))*?,([^()]|\([^()]*\))*?,([^()]|\([^()]*\))*?\)/

const adjRe = /\bhero\s*:\s*new\s+Set\s*\(/
const hits = { a: [], b: [], c: [], d: [] }
const PREVIEW = 'src/preview/PreviewApp.jsx'
if (!files.includes(PREVIEW)) { console.error(`⛔ ${PREVIEW} is missing — (d) is blind`); process.exit(1) }
if (/addEventListener\(\s*['"](wheel|pointer(down|move|up))['"]/.test(code(fs.readFileSync(PREVIEW, 'utf8')))) hits.d.push(`${PREVIEW}: listens for a canvas gesture of its own`)
for (const f of files) {
  const src = code(fs.readFileSync(f, 'utf8'))
  if (subjectRe.test(src)) hits.a.push(`${f}: names the hero-subject resolver or its fallback`)
  if (sixthArgRe.test(src)) hits.a.push(`${f}: passes a subject (sixth argument) to heroKeyframeAnim`)
  if (f !== ADJ_HOME && adjRe.test(src)) hits.c.push(`${f}: builds its own shot-adjacency table`)
  if (f === HOME) continue
  if (importRe.test(src) || newRe.test(src)) hits.b.push(`${f}: defines its own camera controls`)
}

console.log(`scanned ${files.length} source files under ${ROOTS.join(', ')} (${files.filter(f => f.startsWith(WARD_SRC)).length} in the Ward)\n`)
console.log(`(a) no camera reads a hero subject      ${hits.a.length ? '⛔ ' + hits.a.length : '✅'}`)
for (const h of hits.a) console.log(`      ${h}`)
console.log(`(b) controls come only from ${HOME}  ${hits.b.length ? '⛔ ' + hits.b.length : '✅'}`)
for (const h of hits.b) console.log(`      ${h}`)
console.log(`(c) shot adjacency only in ${ADJ_HOME}     ${hits.c.length ? '⛔ ' + hits.c.length : '✅'}`)
for (const h of hits.c) console.log(`      ${h}`)
console.log(`(d) Preview adds no camera gesture          ${hits.d.length ? '⛔ ' + hits.d.length : '✅'}`)
for (const h of hits.d) console.log(`      ${h}`)
process.exit(hits.a.length || hits.b.length || hits.c.length || hits.d.length ? 1 : 0)
