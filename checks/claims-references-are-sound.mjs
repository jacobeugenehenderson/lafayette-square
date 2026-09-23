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
// Mutation test: set a cited source's terms.aiUse to 'prohibited' → this goes red.
import fs from 'node:fs'

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
  const s = srcById.get(f.source)
  if (!s) errs.push(`finding ${f.id} cites unknown source "${f.source}"`)
  else if (s.terms?.aiUse !== 'permitted') errs.push(`finding ${f.id} cites ${s.id}, whose terms.aiUse is "${s.terms?.aiUse}" — only 'permitted' sources may be cited`)
  if (!qById.has(f.question)) errs.push(`finding ${f.id} answers unknown question "${f.question}"`)
  if (!f.quote) errs.push(`finding ${f.id} has no quote`)
}
for (const q of questions) {
  if (!STATUS.has(q.status)) errs.push(`question ${q.id} has status "${q.status}" (allowed: ${[...STATUS].join('/')})`)
  const fs_ = q.findings || []
  for (const fid of fs_) if (!fById.has(fid)) errs.push(`question ${q.id} lists unknown finding "${fid}"`)
  if (q.status === 'answered' && !fs_.length) errs.push(`question ${q.id} is 'answered' with no finding`)
  if (q.status === 'blocked' && !q.blockedBy) errs.push(`question ${q.id} is 'blocked' with no blockedBy`)
}
for (const s of sources) {
  const lc = typeof s.localCopy === 'string' ? s.localCopy.split(' ')[0] : null
  if (lc && lc.startsWith('references/') && !fs.existsSync(lc)) warns.push(`source ${s.id}: localCopy ${lc} is not on this machine (gitignored — download it)`)
}

const by = k => questions.filter(q => q.status === k)
console.log(`references — ${sources.length} sources · ${questions.length} questions (${by('answered').length} answered · ${by('open').length} open · ${by('blocked').length} blocked) · ${findings.length} findings`)
console.log(`  permitted sources: ${sources.filter(s => s.terms?.aiUse === 'permitted').map(s => s.id).join(', ') || '—'}`)
console.log('\n── DISPATCH QUEUE (open) ──')
for (const q of by('open')) console.log(`  ${q.id}: ${q.ask}\n      needed by ${q.neededBy || '?'} · next: ${(q.nextSources || []).join('; ') || '—'}`)
console.log('\n── BLOCKED ──')
for (const q of by('blocked')) console.log(`  ${q.id}: ${q.blockedBy}`)
for (const w of warns) console.log(`⚠️  ${w}`)
if (errs.length) { console.log('\n⛔ UNSOUND:'); for (const e of errs) console.log(`  ${e}`); process.exit(1) }
console.log('\n✅ sound')
