#!/usr/bin/env node
// claims-references-are-sound — the research database (references/registry.json) is internally sound.
//
// Reads the registry; restates nothing. Fails (exit 1) when:
//   · an id is duplicated across sources / questions / findings
//   · a FINDING cites a source whose terms.aiUse is not 'permitted'   ← the rule that matters most
//   · a finding names a question that does not exist, or a question lists a finding that does not exist
//   · a question is 'answered' with no finding, or has a status outside the vocabulary
//   · a 'blocked' question gives no blockedBy
//   · a source declares a localCopy that is not on disk (warn only — copies are gitignored, per machine)
// Then prints the DISPATCH QUEUE: every open question, what was tried, and where to look next.
//
// ▶ node checks/claims-references-are-sound.mjs
// Mutation tests: a cited source's terms.aiUse → 'prohibited' reds; a kind:'derived' with no `from` reds; a kind:'measured' with no command reds.
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const REG = 'references/registry.json'
const r = JSON.parse(fs.readFileSync(REG, 'utf8'))
const sources = r.sources || [], questions = r.questions || [], findings = r.findings || []
const STATUS = new Set(['open', 'answered', 'blocked'])
const errs = [], warns = []

const seen = new Map()
for (const [kind, arr] of [['source', sources], ['question', questions], ['finding', findings]])
  for (const x of arr) {
    if (!x.id) { errs.push(`${kind} with no id`); continue }
    if (seen.has(x.id)) errs.push(`duplicate id ${x.id} (${seen.get(x.id)} and ${kind})`)
    seen.set(x.id, kind)
  }

const srcById = new Map(sources.map(s => [s.id, s]))
const qById = new Map(questions.map(q => [q.id, q]))
const fById = new Map(findings.map(f => [f.id, f]))

for (const f of findings) {
  if (f.kind === 'derived') {
    // ⛔ A derived value's legitimacy is its ANCESTRY: it must start from cited findings and state the step.
    const from = Array.isArray(f.from) ? f.from : []
    if (!from.length) errs.push(`derived ${f.id} names no 'from' finding — a value with no cited starting point is [U], not a derivation`)
    if (!f.derivation) errs.push(`derived ${f.id} states no 'derivation' step`)
    if (f.source) errs.push(`derived ${f.id} carries a source — a derivation cites its ancestors, never a source of its own`)
    for (const a of from) if (!fById.has(a)) errs.push(`derived ${f.id} starts from unknown finding "${a}"`)
    // walk the ancestry: every root must be a cited (non-derived) finding
    const seenA = new Set([f.id]), stack = [...from]
    while (stack.length) { const a = stack.pop(); if (seenA.has(a)) { if (a === f.id) errs.push(`derived ${f.id} is its own ancestor`); continue } seenA.add(a)
      const af = fById.get(a); if (af?.kind === 'derived') stack.push(...(af.from || [])) }
    if (!qById.has(f.question)) errs.push(`derived ${f.id} answers unknown question "${f.question}"`)
    continue
  }
  if (f.kind === 'ruling') {
    // Jacob's (or a forensic's approved) decision — ARRIVED AT by deliberation, a legitimate root. Must be quotable and dated, with the canon that holds the WHY.
    for (const k of ['by', 'date', 'quote', 'canon']) if (!f[k]) errs.push(`ruling ${f.id} has no '${k}'`)
    if (f.source) errs.push(`ruling ${f.id} carries a source — a ruling stands on who ruled and where the why lives`)
    if (!qById.has(f.question)) errs.push(`ruling ${f.id} answers unknown question "${f.question}"`)
    continue
  }
  if (f.kind === 'measured') {
    // A measurement is a legitimate ROOT — arrived at, not preferred — iff it can be REPRODUCED.
    if (!f.command) errs.push(`measured ${f.id} names no command to reproduce it`)
    if (!f.sites) errs.push(`measured ${f.id} names no sites`)
    if (!f.tolerance) errs.push(`measured ${f.id} states no tolerance`)
    if (f.source) errs.push(`measured ${f.id} carries a source — a measurement stands on its command`)
    if (!f.method) errs.push(`measured ${f.id} states no method (computed | visual)`)
    const ins = Array.isArray(f.inputs) ? f.inputs : []
    if (!ins.length) errs.push(`measured ${f.id} names no inputs — what did it measure?`)
    for (const i of ins) { const s = srcById.get(i); if (!s) errs.push(`measured ${f.id} measured unknown source "${i}"`); else if (s.terms?.aiUse !== 'permitted') errs.push(`measured ${f.id} measured ${i}, whose terms.aiUse is "${s.terms?.aiUse}" — a measurement's inputs must be permitted`) }
    const script = (f.command || '').split(/\s+/).find(t => /\.(m?js|py|sh)$/.test(t))
    if (script && !fs.existsSync(script)) errs.push(`measured ${f.id}: ${script} is not on disk — the measurement cannot be reproduced`)
    else if (script) { try { execSync(`git ls-files --error-unmatch ${script}`, { stdio: 'ignore' }) } catch { warns.push(`measured ${f.id}: ${script} is not committed — not reproducible from a clean checkout`) } }
    if (!qById.has(f.question)) errs.push(`measured ${f.id} answers unknown question "${f.question}"`)
    continue
  }
  const s = srcById.get(f.source)
  if (!s) errs.push(`finding ${f.id} cites unknown source "${f.source}"`)
  else if (s.terms?.aiUse !== 'permitted') errs.push(`finding ${f.id} cites ${s.id}, whose terms.aiUse is "${s.terms?.aiUse}" — only 'permitted' sources may be cited`)
  if (f.question != null && !qById.has(f.question)) errs.push(`finding ${f.id} answers unknown question "${f.question}"`)
  if (f.question == null && !f.topic) errs.push(`finding ${f.id} has neither a question nor a topic`)
  if (!f.quote) errs.push(`finding ${f.id} has no quote`)
}
for (const q of questions) {
  if (!STATUS.has(q.status)) errs.push(`question ${q.id} has status "${q.status}" (allowed: ${[...STATUS].join('/')})`)
  const fs_ = q.findings || []
  for (const fid of fs_) if (!fById.has(fid)) errs.push(`question ${q.id} lists unknown finding "${fid}"`)
  if (q.status === 'answered' && !fs_.length) errs.push(`question ${q.id} is 'answered' with no finding`)
  if (q.status === 'blocked' && !q.blockedBy) errs.push(`question ${q.id} is 'blocked' with no blockedBy`)
  // `check` is one path or, for a tooth held by several checks, an array of them — each must exist.
  for (const c of [].concat(q.check || [])) if (!fs.existsSync(c)) errs.push(`question ${q.id} names check ${c}, which does not exist`)
}
for (const s of sources) {
  const lc = typeof s.localCopy === 'string' ? s.localCopy.split(' ')[0] : null
  if (lc && lc.startsWith('references/') && !fs.existsSync(lc)) warns.push(`source ${s.id}: localCopy ${lc} is not on this machine (gitignored — download it)`)
}

const by = k => questions.filter(q => q.status === k)
// A tooth is COMBED only when its answer is HELD in the code by a check — an answered question whose code still carries the old constant is not combed.
const unc = questions.filter(q => (q.codeSites||[]).length && !q.check).length
console.log(`references — ${sources.length} sources · ${questions.length} questions (${by('answered').length} answered · ${by('open').length} open · ${by('blocked').length} blocked) · ${findings.length} findings · ${findings.filter(f=>f.kind==='ruling').length} rulings · ${findings.filter(f=>f.question==null).length} extracted-by-topic`)
console.log(`  COMB: ${unc} tooth/teeth point into the code with no check holding the answer (not yet combed)`)
console.log(`  permitted sources: ${sources.filter(s => s.terms?.aiUse === 'permitted').map(s => s.id).join(', ') || '—'}`)
console.log('\n── DISPATCH QUEUE (open) ──')
for (const q of by('open')) console.log(`  ${q.id}: ${q.ask}\n      needed by ${q.neededBy || '?'} · next: ${(q.nextSources || []).join('; ') || '—'}`)
console.log('\n── NOT YET COMBED (code sites, no check) ──')
for (const q of questions.filter(q => (q.codeSites||[]).length && !q.check)) console.log(`  ${q.id} [${q.status}] → ${q.codeSites[0]}`)
console.log('\n── BLOCKED ──')
for (const q of by('blocked')) console.log(`  ${q.id}: ${q.blockedBy}`)
for (const w of warns) console.log(`⚠️  ${w}`)
if (errs.length) { console.log('\n⛔ UNSOUND:'); for (const e of errs) console.log(`  ${e}`); process.exit(1) }
console.log('\n✅ sound')
