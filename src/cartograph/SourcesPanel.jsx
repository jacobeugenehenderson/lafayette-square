import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchIntake, saveIntakeSource } from './api.js'

/**
 * SOURCES — every input that goes into pouring a town, and WHAT TO DO about it.
 *
 * Reached from the Stage toolbar. The outward-facing face of
 * `INTAKE-CATALOGUE.md` — same germane fact as the Extent tool's Intake panel,
 * other register (`BOZ.md §0`): Intake answers *"what does THIS town still
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

// What the operator DOES about a row.
const FETCH = 'fetch'   // an endpoint exists — one button (BRIEF §2.2b)
const DOC   = 'doc'     // a written procedure; go read/update it
const OWED  = 'owed'    // ⚠ the procedure exists only in someone's head
const NONE  = 'none'    // nothing to acquire, ever

// ⛔ NAME THE SOURCE. Jacob, 2026-07-20: *"'Building footprints' should say
// 'microsoft' or whatever — I hate all this dumb treacle."* The proper noun IS
// the value. "ML aerial imagery" describes Microsoft's product while leaving
// the reader unable to go get it, which inverts the panel's purpose
// (`BRIEF §7` — every row resolves to a place to go).
//
// ⭐ AND THE SOURCE IS A CHOICE, NOT A LABEL. Jacob: *"microsoft should be a
// button in case there's another place they could find that data."* This is
// `INTAKE-CATALOGUE §5.1` landing in the UI: the footprint row has **no single
// best source**. Microsoft's ML footprints are right in St. Louis and would be
// actively WORSE in Łódź, where hand-mapped OpenStreetMap carries roughly twice
// the geometric detail (measured: median 5 vertices vs 7, Centrum 9). So the
// row lists its alternatives and the operator picks; the pipeline's silent
// "prefer MSBF wherever it exists" encodes a US assumption.
//
// `sources[0]` is the default shown collapsed. ⚠️ Entries marked `unverified`
// are ones the catalogue could not confirm live — they are shown as leads, not
// asserted as facts (`BRIEF §6`).
const GROUPS = [
  // ⭐ GROUPED BY WHO SUPPLIES IT (Jacob, 2026-07-21). He framed the tiering as
  // "foundation → building → sky" to convey the idea; the axis underneath it is
  // the SUPPLIER, and naming that makes the three genuinely distinct rather than
  // a metaphor:
  //
  //   AUTOMATIC       global open datasets that cover everywhere and arrive on
  //                   their own — gold, immutable, never the operator's problem
  //   PUBLIC RECORDS  published by an institution: a survey, an assessor, a
  //                   forestry department, a heritage register
  //   LOCAL KNOWLEDGE nobody published it. You look, you ask, you walk around.
  //
  // "Local knowledge" is the trade term (as on a chart: *local knowledge
  // required*), and it is literally what a menu and which-corner-bar-matters
  // are. Earlier cuts grouped by our own domains, then by effort — both sorted
  // the list by how WE think about it rather than by what it asks of the reader.
  {
    title: 'Automatic', tone: 'given',
    // ⭐ LOCKED (Jacob, 2026-07-21). Not merely automatic — IMMUTABLE. The kit
    // chooses the right base for the region (Microsoft's footprints in the US,
    // hand-mapped OpenStreetMap in Europe) and the operator never makes that
    // call. So these rows carry no Fetch pill — there is no button to press —
    // and no "+ other source": you cannot record a well for something you are
    // not being asked to supply. The alternatives stay VISIBLE because knowing
    // what the kit is drawing on is worth something; they are just read-only.
    locked: true,
    // ⭐ GOLD, AND IMMUTABLE (Jacob, 2026-07-21). These two arrive on their own
    // when you press Fetch — no account, no portal, no hunting, nothing to
    // decide. They are the bedrock the rest is positioned against, and the
    // operator never has to think about them at all. Listing them is not a
    // chore; it is the reassurance that the floor is already under you.
    rows: [
      { name: 'Street & building base', act: FETCH, where: 'Overpass',
        sources: [{ name: 'OpenStreetMap', note: 'ODbL · global · free · no account' }],
        steps: ['Nothing to obtain by hand — the Extent tool fetches it when you pour.',
                'Carries storey counts, roof shapes and materials wherever the local mappers recorded them.'] },
      { name: 'Building footprints', act: FETCH, where: 'fetch-msbf',
        sources: [
          { name: 'Microsoft Global ML Footprints', note: 'best in the US · no coverage off-continent' },
          { name: 'OpenStreetMap', note: 'better in Europe — ~2× the vertex detail' },
          { name: 'Overture', note: 'aggregate alternative', unverified: true },
        ],
        steps: ['Free, no account.',
                'In the US, take Microsoft — it is more accurate than the older US OSM imports.',
                'In Europe, take OpenStreetMap — it is hand-mapped and carries more detail than Microsoft.'] },
    ],
  },
  {
    title: 'Public records', tone: 'records',
    // Every one of these was published by an institution — a national survey, a
    // county assessor, a city forestry department, a heritage register, an
    // agricultural service. Free, though a couple want a free account and two
    // are a genuine hunt for the right municipal portal. The gathering lives
    // here, and it is the tier an agent can most usefully be pointed at.
    rows: [
      { name: 'Ground elevation', act: FETCH, where: 'USGS',
        sources: [
          { name: 'USGS 3DEP', note: 'US · public domain · free' },
          { name: 'any GeoTIFF', note: 'the reader is source-agnostic' },
        ],
        steps: ['Free, no account.',
                'US: The National Map → select your area → download the 1/3 arc-second DEM as GeoTIFF.',
                'Outside the US: any national elevation GeoTIFF covering your bounding box.',
                'Check the no-data value — the US one is USGS-specific and other sources differ.'] },
      { name: 'Parcels, zoning, year built', act: DOC, where: 'cartograph/INTAKE.md',
        sources: [
          { name: 'the county assessor', note: 'ArcGIS or Socrata · per-jurisdiction' },
          { name: 'INSPIRE Cadastral Parcels', note: 'EU · geometry and id, rarely valuation', unverified: true },
        ],
        steps: ['Usually free; some counties require a free account.',
                'Search "<your county> assessor open data" or "<county> GIS parcels".',
                'Look for an ArcGIS FeatureServer or Socrata endpoint — you want the download URL, not the map viewer.',
                'Export the parcel layer as GeoJSON covering your neighbourhood.',
                'Outside the US this often does not exist in this shape. Addresses do not depend on it — they come from OpenStreetMap.'] },
      { name: 'Tree census', act: DOC, where: 'TREE-INTAKE.md',
        sources: [
          { name: 'city forestry inventory', note: 'ArcGIS FeatureServer · free · no key' },
          { name: 'opentrees.org', note: 'aggregates several hundred municipal inventories', unverified: true },
          { name: 'a public-records request', note: 'when the contractor never published it' },
        ],
        steps: ['Free where it is published at all.',
                'Search "<your city> tree inventory open data" or "<city> street trees GIS".',
                'Export as GeoJSON — species, diameter and condition per tree if offered.',
                'Many towns have none. Then a public-records request to the municipal forestry contractor is the procedure.',
                'This locates YOUR trees. What each species looks like ships with the platform.'] },
      { name: 'Canopy raster', act: FETCH, where: 'MRLC',
        sources: [
          { name: 'NLCD Tree Canopy (USDA)', note: 'US · public domain' },
          { name: 'ESA WorldCover', note: '10 m · global · CC BY' },
        ],
        steps: ['Free, no account.',
                'Fills yards and parkland no per-tree survey reaches.',
                'Optional — a town can ship counted trees only, which is what Lafayette Square does.'] },
      { name: 'Historic designation', act: FETCH, where: 'Overpass',
        sources: [
          { name: 'NID rejestr zabytków', note: 'Poland · already on the public map' },
          { name: 'National Register (NPS)', note: 'US · free PDFs · needs OCR' },
          { name: 'Historic England', note: 'UK · per-building', unverified: true },
        ],
        steps: ['Free everywhere it exists.',
                'In much of Europe this arrives free with the street fetch — it is already tagged.',
                'In the US it is a National Register nomination PDF from NPGallery, and the per-building table has to be read out of the scan by hand.'] },
      { name: 'Street lamps', act: FETCH, where: 'Overpass',
        sources: [
          { name: 'OpenStreetMap', note: 'highway=street_lamp · global · free · no account' },
          { name: 'city lighting GIS', note: 'where a municipality publishes its lamp inventory', unverified: true },
        ],
        steps: ['Free, no account.',
                'Real lamp positions where OSM mappers recorded them — St. Louis has thousands.',
                'Fetched from OSM with the street base; a town OSM never mapped can fall back to procedural placement.'] },
      { name: 'Facade imagery', act: DOC, where: 'cartograph/INTAKE.md',
        sources: [{ name: 'Mapillary', note: 'street-level · free account · API key' }],
        steps: ['Free, but needs an account and a token.',
                'Create a Mapillary account, then generate a client token in developer settings.',
                'Optional — used for matching building facades.'] },
      { name: 'Species dossiers', act: DOC, where: 'arborist/dossiers/_SCHEMA.md',
        sources: [
          { name: 'USDA PLANTS', note: 'free' },
          { name: 'Silvics of North America', note: 'USDA Forest Service · free' },
          { name: 'i-Tree Species', note: 'USFS · free' },
          { name: 'a national flora', note: 'outside North America', unverified: true },
        ],
        steps: ['Free sources; the writing is the work — about 20 minutes per species.',
                'One profile per species in your mix: habit, branching, seasonal colour, how it ages.',
                'Scored against a fixed rubric so two species can be compared, not merely described.',
                'A good agent-assist candidate — the sources are public and the rubric is closed.'] },
      { name: 'Species routing', act: DOC, where: 'TREE-INTAKE.md',
        sources: [
          { name: 'the city planting list', note: 'plus hardiness zone and a state extension guide' },
        ],
        steps: ['Free; a table you write once per region.',
                'Maps the species names in your census onto the species the library carries.',
                'Derived automatically where a census exists — hand-seeded where none does.'] },
    ],
  },
  {
    title: 'Local knowledge', tone: 'local',
    // No dataset holds any of this. You look, you ask, you walk around — and a
    // neighbourhood is the only party that can supply it, which is why it sits
    // at the top of the stack rather than the bottom. The trade sense of the
    // phrase is the right one: *local knowledge required*.
    rows: [
      { name: 'Businesses & hours', act: DOC, where: 'NEIGHBORHOOD-INPUTS.md',
        sources: [
          { name: 'Overture Places', note: 'free · what Łódź used' },
          { name: 'OpenStreetMap POIs', note: 'free' },
        ],
        steps: ['Free base; the corrections are the work.',
                'The base gets you names and rough categories.',
                'Real hours, descriptions and what a place is actually for come from visiting the websites one at a time.'] },
      { name: 'Menus', act: DOC, where: 'NEIGHBORHOOD-INPUTS.md',
        sources: [{ name: 'the restaurant', note: 'no endpoint exists' }],
        steps: ['No source exists — you ask, or you read the menu off their site.',
                'Lafayette Square, the most complete install, is at about 25% coverage. Partial is normal.'] },
      { name: 'Photographs & logos', act: DOC, where: 'content/ASSETS.md',
        sources: [
          { name: 'the business', note: 'credit their domain · never hotlink' },
          { name: 'Wikimedia Commons', note: 'for landmarks · free' },
        ],
        steps: ['Free, but hand-collected, and the eye is the only real check.',
                'Save the file locally — never link to someone else\'s server.',
                'A social-media URL can return a valid image that is actually a grey placeholder. Look at every one.',
                'If a business genuinely has no logo, record that. It is a finding, and it saves the next person the search.'] },
    ],
  },
]

export default function SourcesPanel({ scene, onClose }) {
  const [openRow, setOpenRow] = useState(null)
  const [extra, setExtra] = useState({})   // per-row operator-added sources
  const [copied, setCopied] = useState(null)

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
      })
      .catch(() => { /* the catalogue still reads without it */ })
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
  const copyPrompt = async (row) => {
    const text = [
      `Obtain "${row.name}" for the neighbourhood currently being built (${scene || 'this scene'}).`,
      '',
      'Where it can come from:',
      ...row.sources.map(s => `  - ${s.name}${s.note ? ` (${s.note})` : ''}${s.unverified ? ' [unconfirmed — verify before relying on it]' : ''}`),
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
        ...r.sources.map(x => `  - ${x.name}${x.note ? ` (${x.note})` : ''}${x.unverified ? ' [unconfirmed — verify first]' : ''}`),
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
                const alts = row.sources.length - 1 + added.length
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
                        {row.sources[0].name}
                        {alts > 0 && <span className="carto-sources-more"> +{alts}</span>}
                      </button>
                      <span className={`carto-sources-action carto-sources-action--${locked ? 'locked' : row.act}`}>
                        {locked ? 'included'
                          : row.act === FETCH ? <><b>Fetch</b> · {row.where}</>
                          : row.act === DOC ? <><b>→</b> {row.where}</>
                          : row.act === OWED ? <><b>⚠</b> {row.where} — unwritten</>
                          : row.where}
                      </span>
                    </div>

                    {isOpen && (
                      <div className="carto-sources-alts">
                        {[...row.sources, ...added].map((s, i) => (
                          <div key={s.name + i} className="carto-sources-alt">
                            <span className="carto-sources-alt-name">
                              {s.name}
                              {s.unverified && <span className="carto-sources-tag carto-sources-tag--unverified" title="Not confirmed live — a lead, not a fact">unverified</span>}
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
