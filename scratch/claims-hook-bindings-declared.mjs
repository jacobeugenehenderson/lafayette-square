/**
 * Every hook-bound name a component uses is still declared in that component.
 *
 * ⛔ THE DEFECT, TWICE IN ONE SESSION, BOTH TIMES A BLACK SCREEN FOR THE OPERATOR:
 *   1. `resolveGrove` used and never imported — my import insertion matched
 *      `import { useEffect, ... }` while the file said `import { Suspense, useEffect, ... }`,
 *      so the replace silently did nothing.
 *   2. `groveBoard` / `eligibleNames` / `impostorGapDismissed` deleted by a SLICE-BASED
 *      edit (`src[:start] + new + src[end:]`) that replaced everything between two anchors
 *      without checking what lived in between — while the references below survived.
 * ⛔ `vite build` reported 0 errors both times. A bare undefined identifier is not an
 * unresolved import, so the bundler has nothing to say; only MOUNTING throws.
 *
 * ⚠️ DELIBERATELY NARROW. A first attempt tried general scope analysis by regex and
 * produced 595 false positives — worse than no check, because nobody runs a noisy alarm.
 * This looks at ONE thing: names bound by a hook at component top level
 * (`const x = useMemo/useState/useRef/useCallback(...)`) or destructured from useState,
 * which is exactly the class my edits break. It is a smoke alarm, not a type system.
 * ▶ The real tool is eslint `no-undef`; it is not installed here and adding a dependency
 *   is not this script's call.
 *
 *   node scratch/claims-hook-bindings-declared.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const FILES = [
  'src/arborist/Grove.jsx',
  'src/arborist/SalonWorkstage.jsx',
  'src/arborist/OverheadBaker.jsx',
  'src/arborist/HeroImpostorBaker.jsx',
  'src/components/InstancedTrees.jsx',
]

let bad = 0
for (const rel of FILES) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

  const declared = new Set()
  for (const m of code.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*use[A-Z]\w*\s*\(/g)) declared.add(m[1])
  for (const m of code.matchAll(/\b(?:const|let)\s*\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState/g)) { declared.add(m[1]); declared.add(m[2]) }
  // Anything else declared or imported anywhere in the file also counts.
  for (const m of code.matchAll(/\b(?:const|let|var|function)\s+(\w+)/g)) declared.add(m[1])
  for (const m of code.matchAll(/\bimport\s*\{([^}]*)\}/g))
    for (const part of m[1].split(',')) { const n = part.split(/\s+as\s+/).pop().trim(); if (n) declared.add(n) }
  for (const m of code.matchAll(/\bimport\s+(\w+)\s*(?:,|from)/g)) declared.add(m[1])
  // ⛔ PARAMETERS ARE DECLARATIONS TOO. `function f(libId, board, warnRef)` binds warnRef,
  // and missing that produced five false positives — the third round of them. A check is
  // not trustworthy until it is QUIET on correct code, not merely loud on broken code.
  // ⛔ DESTRUCTURED params too — `function C({ tween, poseRef, controlsRef })` binds all
  // three. Missing this was the fourth round of false positives, and the reason the check
  // took four attempts: each round I fixed the alarm rather than asking what a DECLARATION
  // actually looks like in this codebase.
  for (const m of code.matchAll(/\(\s*\{([^}]*)\}\s*\)/g))
    for (const part of m[1].split(',')) {
      const n = part.split(':').pop().split('=')[0].trim()
      if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n)
    }
  for (const m of code.matchAll(/\((?:[^()]*)\)\s*(?:=>|\{)/g))
    for (const part of m[0].replace(/[()={>]/g, ' ').split(',')) {
      const n = part.split(':')[0].trim()
      if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n)
    }

  // Only names that LOOK like hook bindings are audited — camelCase used as `x.` or `x(`
  // or inside a dependency array. That keeps props, JSX attrs and object keys out of it.
  const used = new Set()
  // ⛔ NOT preceded by a dot — `manifest.barkBySpecies` is a property, not a binding.
  // That distinction was the whole of the second false-positive round.
  for (const m of code.matchAll(/(^|[^.\w$])([a-z][A-Za-z0-9]*(?:Ref|Names|Board|Dismissed))\b/gm)) used.add(m[2])

  const missing = [...used].filter(n => !declared.has(n))
  if (missing.length) { console.error(`  ⛔ ${rel}: ${missing.join(', ')}`); bad += missing.length }

  // ⛔⛔ USE BEFORE DECLARATION — the third black screen, and the first two checks missed
  // it because the name IS declared, just later. `const` sits in the temporal dead zone,
  // so referencing it above its own line throws at RENDER while vite build reports zero
  // errors. `const inCount = liveCounts.mesh + …` sat 23 lines above `const liveCounts`.
  // ⚠️ Line-order only, within a file, for hook-assigned consts — enough for the class
  // that keeps biting and quiet on everything else.
  // ⛔ PER-COMPONENT, not per-file. A file-wide comparison flagged `scene` used in one
  // component and declared in another 470 lines away — four false positives, and a noisy
  // alarm is one nobody runs. Components here are top-level `function Name(`, so split on
  // that and compare only within a block.
  const allLines = code.split('\n')
  const bounds = []
  allLines.forEach((l, i) => { if (/^function\s+[A-Za-z]\w*\s*\(/.test(l)) bounds.push(i) })
  bounds.push(allLines.length)
  for (let b = 0; b < bounds.length - 1; b++) {
    const from = bounds[b], to = bounds[b + 1]
    const lines = allLines.slice(from, to)
    const declLine = new Map()
    lines.forEach((l, i) => {
      const m = /^\s*const\s+(\w+)\s*=\s*(?:use[A-Z]\w*\s*\()/.exec(l)
      if (m && !declLine.has(m[1])) declLine.set(m[1], i)
    })
    for (const [name, dl] of declLine) {
      for (let i = 0; i < dl; i++) {
        if (new RegExp(`(^|[^.\\w$])${name}\\s*[.[(]`).test(lines[i]) && !/=>|function|\\bif\\b/.test(lines[i])) {
          console.error(`  ⛔ ${rel}: "${name}" used on line ${from + i + 1} but declared on line ${from + dl + 1} — temporal dead zone, throws on render`)
          bad++
          break
        }
      }
    }
  }
}

if (bad) { console.error(`\n❌ FAIL — ${bad} hook binding(s) referenced but not declared. vite build does NOT catch these; the component throws on mount and the operator sees a black screen.`); process.exit(1) }
console.log('✅ PASS — every hook-bound name is declared in its component.')
