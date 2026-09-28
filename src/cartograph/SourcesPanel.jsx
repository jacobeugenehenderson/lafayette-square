import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchIntake, saveIntakeSource } from './api.js'
import { GROUPS, FETCH, DOC, OWED, CHOOSE, resolveRow } from './sourcesCatalogue.js'
import useCartographStore from './stores/useCartographStore'
import { IDENTITY_CHANNELS } from '../lib/townIdentity.js'
import CATEGORIES from '../tokens/categories.js'

/**
 * SOURCES — every input that goes into pouring a town, and WHAT TO DO about it.
 *
 * Reached from the Stage toolbar. The outward-facing face of
 * `INTAKE-CATALOGUE.md` — same germane fact as the Extent tool's Intake panel,
 * other register (`docs/agents/BOZ.md §0`): Intake answers *"what does THIS town still
 * need"*, Sources answers *"what goes into a town at all, and where do I go."*
 *
 * ⛔ TWO THINGS THIS PANEL IS NOT, both corrected by Jacob 2026-07-20:
 *
 * 1. NOT PROSE. A first draft carried a descriptive line per row — "too much,
 *    too precious, not helpful."
 *
 * 2. NOT A TAXONOMY. A second draft classified each row as record / computed /
 *    made-by-hand. *"I don't need to know 'made by hand', I need to know
 *    'update a doc here' or something."* Correct, and it is `BRIEF §2.1a`
 *    exactly: every row's acquisition resolves to a SOURCE or a DOC, and both
 *    are complete answers to *where do I get this*. A classification is
 *    neither. So the right-hand column is the ACTION.
 *
 * ⭐ Rows whose doc DOESN'T EXIST YET say so. That is not an admission, it is
 * the work item — `BRIEF §5.5`: the inputs only Lafayette Square has are not
 * unrepeatable, they are UNDOCUMENTED PROCEDURES, and writing each one is the
 * deliverable. A row that silently omitted its missing doc would hide the
 * single most useful thing on the panel.
 *
 * ⚠️ Licences named here are code-verified in-repo. The catalogue marks its
 * external URLs/licences `[unverified]` and says confirm before they ship on a
 * panel (`BRIEF §6`), so WorldClim, the census aggregators and the
 * per-jurisdiction assessors are deliberately unnamed.
 */

export default function SourcesPanel({ scene, onClose, onOpenIdentity }) {
  // The Identity row's to-do: every identity channel and every category colour the town has not chosen.
  const unchosen = useCartographStore((s) => IDENTITY_CHANNELS.filter((k) => s.identity?.[k] == null).length
    + Object.keys(CATEGORIES).filter((k) => !s.materialColors?.[`neon_${k}`]).length)
  const [openRow, setOpenRow] = useState(null)
  const [extra, setExtra] = useState({})   // per-row operator-added sources
  const [copied, setCopied] = useState(null)
  // The town's jurisdiction (the intake's: its country, from jurisdiction.json). undefined = loading; { error } = the
  // intake could not be read. Each row names the source that covers THIS town (sourcesCatalogue.js resolveRow).
  const [juris, setJuris] = useState(undefined)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Hydrate any sources this town's operator already recorded. They live in the
  // per-town overlay beside provenance — the kit-global list here is the guess,
  // the overlay is this town's answer.
  useEffect(() => {
    if (!scene) return
    let alive = true
    fetchIntake(scene)
      .then(r => {
        if (!alive) return
        const own = {}
        for (const row of r.rows || []) if (row.altSources?.length) own[row.id] = row.altSources
        setExtra(own)
        setJuris(r.jurisdiction ?? { error: 'the intake named no jurisdiction' })
      })
      .catch((e) => setJuris({ error: `the intake could not be read (${e.message})` }))
    return () => { alive = false }
  }, [scene])

  // ⭐ "+ other source" — the escape hatch. Our list is a best guess and for a
  // town nobody here has seen the right well may be a municipal portal this
  // repo has never heard of. Everything is a guess and everything is
  // overridable (`ORIENTATION §What's automatic`); a catalogue that cannot take
  // the operator's own answer silently caps the kit at the towns we imagined.
  // Build the instruction an agent can run cold. It is assembled from the SAME
  // steps shown above — one home per fact, so the human path and the agent path
  // can never drift into two different procedures.
  // A row's sources as THIS town sees them, for the hand-off text: its own first, another country's marked as such.
  const townSources = (row) => resolveRow(row, juris && !juris.error ? juris : null).ordered
  const sourceLine = (x) => `  - ${x.name}${x.note ? ` (${x.note})` : ''}${x.foreign ? ` [another country's source: ${x.foreign} only]` : ''}${x.unverified ? ' [unconfirmed — verify first]' : ''}`
  const copyPrompt = async (row) => {
    const text = [
      `Obtain "${row.name}" for the neighbourhood currently being built (${scene || 'this scene'}).`,
      '',
      'Where it can come from:',
      ...townSources(row).map(sourceLine),
      '',
      'Steps:',
      ...(row.steps || []).map((t, i) => `  ${i + 1}. ${t}`),
      '',
      'Rules: keep a local copy of every file — do not leave a link as the answer.',
      'Report the licence and whether a permanent copy is permitted.',
      'If nothing exists for this town, say so plainly. That is a valid, useful answer, not a failure.',
      'Do not overwrite anything already on disk — propose, and let the operator accept.',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(row.name)
      setTimeout(() => setCopied(null), 1800)
    } catch { window.prompt('Copy this prompt:', text) }
  }

  // ⭐ HAND OFF A WHOLE TIER (Jacob, 2026-07-21: *"we need someone to do Public
  // records — we list them and tell them how to do it"*).
  //
  // The tiers turn out to be units of DELEGATION, not just visual grouping,
  // because they split on who is CAPABLE of the work. Public records needs no
  // local knowledge at all — named sources, written steps, nothing that depends
  // on being there — so it is fully remotable to a contractor, a volunteer or
  // an agent. Local knowledge can only be done by someone with presence and
  // relationships, and cannot be hired out. Two jobs, two labour markets.
  //
  // This assembles the tier from the SAME rows and steps shown on screen, so a
  // handed-off brief can never drift from the panel it came from.
  const copyTier = async (g) => {
    const text = [
      `# ${g.title} — for ${scene || 'this neighbourhood'}`,
      '',
      `${g.rows.length} items. Everything below is free to obtain; a couple want a free account.`,
      g.tone === 'records'
        ? 'None of this requires being in the neighbourhood — it can all be done remotely.'
        : 'This needs someone with local presence — it cannot be done at a distance.',
      '',
      ...g.rows.flatMap(r => [
        `## ${r.name}`,
        'Where it can come from:',
        ...townSources(r).map(sourceLine),
        ...(r.steps?.length ? ['How:', ...r.steps.map((t, i) => `  ${i + 1}. ${t}`)] : []),
        '',
      ]),
      'Rules for all of it:',
      '  - Keep a local copy of every file. A link is not an answer.',
      '  - Record the licence, and whether a permanent copy is permitted.',
      '  - If a town genuinely has none of something, say so. That is useful information, not a failure.',
      '  - Never overwrite what is already there — propose it, and let the operator accept.',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(`tier:${g.title}`)
      setTimeout(() => setCopied(null), 1800)
    } catch { window.prompt('Copy this brief:', text) }
  }

  const addSource = async (rowId) => {
    const name = window.prompt('Where else can this be obtained?\n\nName or URL — it is recorded for this town.')
    if (!name || !name.trim()) return
    const next = { ...extra, [rowId]: [...(extra[rowId] || []), { name: name.trim(), operator: true }] }
    setExtra(next)
    await saveIntakeSource(scene, rowId, name.trim()).catch(() => {
      window.alert('Could not save — it is shown for this session only.')
    })
  }

  const all = GROUPS.flatMap(g => g.rows)
  // The Automatic tier is not an errand — it arrives with the pour, so it is
  // counted as an input but never as something to go and get.
  const gather = GROUPS.filter(g => g.title !== 'Automatic').flatMap(g => g.rows).length

  // ⛔ PORTAL, not an inline child. The Stage toolbar is a glass card carrying
  // `backdrop-filter: blur(20px)`, and a filtered element becomes the
  // CONTAINING BLOCK for `position: fixed` descendants. Rendered inline the
  // scrim's `inset: 0` resolved to the toolbar's own box, which squeezed the
  // dialog into a strip showing one row. Escaping to <body> is the fix; the
  // same trap waits for anything else overlaid out of that toolbar.
  return createPortal(
    <div className="carto-sources-scrim" onClick={onClose}>
      <div className="carto-sources" onClick={e => e.stopPropagation()} role="dialog" aria-label="Asset library">
        <div className="carto-sources-head">
          <div>
            {/* Informational, not a slogan. "What goes into a town" was the
                pitch voice and read as precious in the operator's own tool —
                this panel is a library index, so it says so and then counts. */}
            {/* MATERIALS — what YOU have to go out and obtain. Not a catalogue
                of what the platform contains: anything the kit derives (the sky,
                the star catalogue, cloud behaviour) or that you author in a
                panel (street widths in Survey/Section, centrelines — which are
                derived, never hand-edited) is a basic feature and does not
                belong on a procurement list. */}
            <div className="carto-sources-title">Materials</div>
            {/* Accurate, or it is not worth showing. "13 to gather" counted the
                two Automatic rows as errands, and "needing judgment" was dead
                text left from when tree models were still on the list. */}
            <div className="carto-sources-sub">
              {all.length} inputs · {gather} to gather · all free
            </div>
          </div>
          <button className="carto-btn-sm" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <div className="carto-sources-body">
          {GROUPS.map(g => (
            <div key={g.title} className="carto-subsection">
              {/* A coloured tab per tier — the three answer different questions
                  ("who supplies this?"), so they get different hues rather than
                  three identical grey labels. Muted deliberately: the action
                  column already speaks in green and blue, and the tabs must not
                  compete with it. */}
              <div className="carto-sources-tabrow">
                <div className={`carto-sources-tab carto-sources-tab--${g.tone}`}>{g.title}</div>
                {/* A tier is a work package someone can be handed. */}
                {!g.locked && (
                  <button className="carto-sources-handoff" onClick={() => copyTier(g)}
                    title={`Copy all ${g.rows.length} items with their sources and steps, as a brief`}>
                    {copied === `tier:${g.title}` ? '✓ brief copied' : '⇥ hand off'}
                  </button>
                )}
              </div>
              {g.rows.map(row => {
                const locked = !!g.locked
                const id = row.name
                const isOpen = openRow === id
                const added = extra[id] || []
                const res = juris === undefined || juris.error ? null : resolveRow(row, juris)
                const sources = townSources(row)
                // The row's action is the action of the source it shows this town (none shown → owed).
                const act = res?.shown?.act, where = res?.shown?.where
                const alts = sources.length - (res?.shown ? 1 : 0) + added.length
                return (
                  <div key={id}>
                    <div className="carto-sources-row">
                      <span className="carto-sources-name">{row.name}</span>
                      {/* The source is a CONTROL, not a label — there may be a
                          better well for this town than the one we assumed. */}
                      <button
                        className="carto-sources-src"
                        onClick={() => setOpenRow(isOpen ? null : id)}
                        title={alts ? `${alts} other source${alts > 1 ? 's' : ''}` : 'Where this comes from'}
                        aria-expanded={isOpen}>
                        {juris === undefined ? '…'
                          : juris.error ? <span className="carto-sources-unknown" title={juris.error}>intake unreadable</span>
                          : res.shown ? res.shown.name
                          : res.state === 'none-known' ? <span className="carto-sources-unknown">none known for {juris.country}</span>
                          : <span className="carto-sources-unknown" title="node cartograph/fetch-jurisdiction.mjs --town=<id>">country unknown</span>}
                        {alts > 0 && <span className="carto-sources-more"> +{alts}</span>}
                      </button>
                      <span className={`carto-sources-action carto-sources-action--${!act ? 'owed' : locked ? 'locked' : act === CHOOSE && unchosen ? 'owed' : act}`}>
                        {juris === undefined ? '…'
                          : !act ? <><b>⚠</b> {res?.state === 'none-known' ? `no source known for ${juris.country}` : juris.error ? 'intake unreadable' : 'fetch the town\'s country first'}</>
                          : locked ? 'included'
                          : act === FETCH ? <><b>Fetch</b> · {where}</>
                          : act === DOC ? <><b>→</b> {where}</>
                          : act === OWED ? <><b>⚠</b> {where} — unwritten</>
                          : act === CHOOSE ? <button className="carto-sources-choose" onClick={onOpenIdentity}>
                              <b>choose it here</b>{unchosen ? ` · ${unchosen} to do` : ' · done'}</button>
                          : where}
                      </span>
                    </div>

                    {isOpen && (
                      <div className="carto-sources-alts">
                        {[...sources, ...added].map((s, i) => (
                          <div key={s.name + i} className="carto-sources-alt">
                            <span className="carto-sources-alt-name">
                              {s.name}
                              {s.unverified && <span className="carto-sources-tag carto-sources-tag--unverified" title="Not confirmed live — a lead, not a fact">unverified</span>}
                              {s.foreign && <span className="carto-sources-tag carto-sources-tag--elsewhere" title="Another country's source — not this town's">{s.foreign} only</span>}
                              {s.operator && !s.elsewhere && <span className="carto-sources-tag carto-sources-tag--native" title="Recorded here — shared with every hood in this jurisdiction">this place</span>}
                              {s.elsewhere && <span className="carto-sources-tag carto-sources-tag--elsewhere" title={`Recorded in ${s.elsewhere} — the URL won't transfer, the kind of source often does`}>{s.elsewhere}</span>}
                              {/* Held locally, or still only a pointer. A pointer
                                  is not an input (BRIEF §4) — the town must pour
                                  with the network unplugged, and public data rots. */}
                              {s.url && (s.archived
                                ? <span className="carto-sources-tag carto-sources-tag--archived" title={`Local copy kept — ${s.archivedAt || 'archived'}`}>local copy</span>
                                : <span className="carto-sources-tag carto-sources-tag--pointer" title="Pointer only — no local copy yet. Licence decides whether one may be kept.">not archived</span>)}
                            </span>
                            {s.note && <span className="carto-sources-alt-note">{s.note}</span>}
                          </div>
                        ))}
                        {row.steps?.length > 0 && (
                          <ol className="carto-sources-steps">
                            {row.steps.map((t, i) => <li key={i}>{t}</li>)}
                          </ol>
                        )}
                        <div className="carto-sources-actions">
                          {locked && <span className="carto-sources-locked-note">Chosen for you by region — nothing to supply.</span>}
                          {/* ⭐ Agent assist. The steps above are written to be
                              followed COLD — by a person, or by an agent the
                              operator points at this row. Whatever comes back is
                              a draft: it lands as a proposal the operator
                              accepts or discards, and it never overwrites an
                              acquired file. Everything is a guess, everything is
                              overridable, nothing is destructive. */}
                          {!locked && (
                            <button className="carto-sources-agent" onClick={() => copyPrompt(row)}>
                              {copied === id ? '✓ prompt copied' : '⁂ agent assist'}
                            </button>
                          )}
                          {!locked && <button className="carto-sources-add" onClick={() => addSource(id)}>+ other source</button>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

      </div>
    </div>,
    document.body,
  )
}
