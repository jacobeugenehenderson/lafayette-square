import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import useCartographStore from './stores/useCartographStore'
import { IDENTITY_NEUTRAL, MARK_STYLES } from '../lib/townIdentity.js'
import { neutralNeon } from '../lib/categoryColor.js'
import { accentPolicy, neonPolicy, litTintPolicy } from '../lib/colourPolicy.js'
import { glyphInk } from '../lib/glyphInk.js'
import { suggestFromMark } from './suggestFromMark.js'
import CATEGORIES from '../tokens/categories.js'

/**
 * IDENTITY — how the town looks, chosen in one place (Warden's ruling, 2026-09-28): its mark (which is also what its
 * places are rated in), its accent, the tint a lit set of roofs takes, and its category colours (Neon — its signs and its Ward chips, stored
 * as materialColors.neon_<category>, decided by src/lib/categoryColor.js). Saved in the Look's design.json (the store's
 * autosave), baked into scene.json, published in the manifest's `look` (src/lib/townIdentity.js).
 * Reached from the Stage toolbar beside Sources, and from Sources' "Identity" row.
 *
 * ⛔ An unchosen channel says so, and names the kit's neutral value it shows — never another town's.
 * ⭐ THE COLOUR POLICY (src/lib/colourPolicy.js) holds every colour here, suggested or hand-picked:
 *   · HARD — the accent ≥ 7:1 and every chip ≥ 3:1 on the player's grounds. A colour under it is NOT saved: it is shown
 *     "out of gamut" with its nearest passing colour, one tap to take it.
 *   · ADVISORY — close to a colour that already means something: flagged, with a clear option offered; yours stays.
 * ⭐ SUGGEST FROM MARK (src/cartograph/suggestFromMark.js) — authoring-time only: measured on this device, previewed here,
 *   saved only when the operator takes it. A mark with no colour proposes the Ward's default, said as such.
 * Not here: the town's name and locale (who it is — its instance and Operations), its label style (Designer).
 */

const ROWS = [
  { id: 'mark', label: 'Mark', kind: 'emoji', hint: 'The avatar, load screen and tab — and what places are rated in. One emoji.' },
  { id: 'markStyle', label: 'Mark style', kind: 'choice', options: MARK_STYLES, hint: 'How the town\'s mark is drawn in the Ward\'s header ◉ wherever it shows the town (not a person): regular — a white silhouette · engraved — greyscale lifted to white · colored — as the emoji draws.' },
  { id: 'accent', label: 'Accent', kind: 'color', hint: 'The Ward\'s chrome accent.' },
  { id: 'litTint', label: 'Lit tint', kind: 'tint', hint: 'The roofs of a chosen category or search, and the selected building.' },
]

const neutralText = (id) => {
  const v = IDENTITY_NEUTRAL[id]
  if (v == null) return id === 'mark' ? 'the town\'s initial' : 'the Ward\'s own'
  if (id === 'litTint') return `${v.color} at ${v.strength}`
  return v
}

const Swatch = ({ hex }) => <i className="carto-identity-sw" style={{ background: hex }} />

/** The advisory line: close to a meaning colour, with the clear option as one tap. */
function Advice({ a, onTake }) {
  if (!a?.flagged) return null
  return (
    <div className="carto-identity-advice">
      ⚑ close to “{a.closest.name}” ({a.closest.deltaE})
      {a.clear && <button className="carto-btn-sm" onClick={() => onTake(a.clear)} title="A colour at the same hue that stands clear of it — yours stays unless you take this"><Swatch hex={a.clear} />{a.clear}</button>}
    </div>
  )
}
/** The hard line: out of gamut, not saved, with the nearest passing colour as one tap. */
function OutOfGamut({ p, onTake }) {
  if (!p) return null
  return (
    <div className="carto-identity-error">
      ⛔ out of gamut — {p.contrast ?? p.detailContrast}:1 on the Ward's grounds, needs {p.floor}:1. Not saved.
      {p.nearest && <button className="carto-btn-sm" onClick={() => onTake(p.nearest)}><Swatch hex={p.nearest} />use {p.nearest}</button>}
    </div>
  )
}

export default function IdentityPanel({ onClose }) {
  const identity = useCartographStore((s) => s.identity) || {}
  const setChannel = useCartographStore((s) => s.setIdentityChannel)
  const materialColors = useCartographStore((s) => s.materialColors) || {}
  const setCategoryNeon = useCartographStore((s) => s.setCategoryNeon)
  const activeLookId = useCartographStore((s) => s.activeLookId)
  const [errors, setErrors] = useState({})
  const [drafts, setDrafts] = useState({})        // what was typed but refused — kept on screen beside its error
  const [refused, setRefused] = useState({})      // colours the hard tier refused, by key — with their nearest passing
  const [proposal, setProposal] = useState(null)  // Suggest from mark's proposal, previewed until taken

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choose = (id, value) => {
    try { setChannel(id, value); setErrors((e) => ({ ...e, [id]: null })); setDrafts((d) => ({ ...d, [id]: undefined })) }
    catch (err) { setErrors((e) => ({ ...e, [id]: err.message.replace(/^Identity: /, '') })); setDrafts((d) => ({ ...d, [id]: value })) }
  }
  // A hand-picked accent under the policy: saved only if it passes the hard tier.
  const chooseAccent = (hex) => {
    const p = accentPolicy(hex)
    if (!p.ok) return setRefused((r) => ({ ...r, accent: p }))
    setRefused((r) => ({ ...r, accent: null })); choose('accent', hex)
  }
  const chooseNeon = (cat, hex) => {
    if (hex == null) { setRefused((r) => ({ ...r, [cat]: null })); return setCategoryNeon(cat, null) }
    const p = neonPolicy(hex)
    if (!p.ok) return setRefused((r) => ({ ...r, [cat]: p }))
    setRefused((r) => ({ ...r, [cat]: null })); setCategoryNeon(cat, hex)
  }

  const suggest = () => {
    try { setProposal({ mark: identity.mark, ...suggestFromMark(glyphInk(identity.mark)) }) }
    catch (err) { setProposal({ mark: identity.mark, error: err.message }) }
  }
  const takeAccent = (hex) => (hex == null ? choose('accent', null) : chooseAccent(hex))
  const takeTint = (t) => choose('litTint', t && { color: t.color, strength: t.strength })
  const takeNeon = (neon) => { for (const [k, n] of Object.entries(neon)) chooseNeon(k, n.hex) }
  const takeDefault = () => { choose('accent', null); choose('litTint', null); for (const k of Object.keys(CATEGORIES)) chooseNeon(k, null) }

  const unchosen = ROWS.filter((r) => identity[r.id] == null)
  const categories = Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label, hex: materialColors[`neon_${id}`] }))
  const neonUnchosen = categories.filter((c) => !c.hex).length

  // ⛔ PORTAL — the toolbar's backdrop-filter would otherwise contain the fixed scrim (see SourcesPanel).
  return createPortal(
    <div className="carto-sources-scrim" onClick={onClose}>
      <div className="carto-sources carto-identity" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Identity">
        <div className="carto-sources-head">
          <div>
            <div className="carto-sources-title">Identity</div>
            <div className="carto-sources-sub">
              {activeLookId || 'no town open'} · {unchosen.length + neonUnchosen ? `${unchosen.length + neonUnchosen} of ${ROWS.length + categories.length} not chosen` : 'all chosen'}
            </div>
          </div>
          <button className="carto-btn-sm" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <div className="carto-sources-body">
          {ROWS.map((r) => {
            const v = identity[r.id]
            return (
              <div key={r.id} className="carto-identity-row">
                <div className="carto-identity-label">
                  <span className="carto-sources-name">{r.label}</span>
                  <span className="carto-identity-hint">{r.hint}</span>
                </div>
                <div className="carto-identity-control">
                  {r.kind === 'emoji' && (
                    <input className="carto-input carto-identity-emoji" value={drafts[r.id] ?? v ?? ''} placeholder="—" aria-label={r.label}
                      onChange={(e) => choose(r.id, e.target.value.trim() || null)} />
                  )}
                  {r.kind === 'choice' && r.options.map((o) => (
                    <button key={o} className={`carto-btn-sm${v === o ? ' is-active' : ''}`} aria-pressed={v === o}
                      onClick={() => choose(r.id, o)}>{o}</button>
                  ))}
                  {r.kind === 'color' && (
                    <input type="color" value={refused.accent?.hex ?? v ?? '#808080'} aria-label={r.label}
                      className={v == null ? 'carto-identity-unset' : ''}
                      onChange={(e) => chooseAccent(e.target.value.toUpperCase())} />
                  )}
                  {r.kind === 'tint' && (
                    <>
                      <input type="color" value={(v ?? IDENTITY_NEUTRAL.litTint).color} aria-label="Lit tint colour"
                        className={v == null ? 'carto-identity-unset' : ''}
                        onChange={(e) => choose(r.id, { color: e.target.value, strength: (v ?? IDENTITY_NEUTRAL.litTint).strength })} />
                      <input type="range" className="carto-range" min="0" max="1" step="0.05" value={(v ?? IDENTITY_NEUTRAL.litTint).strength}
                        aria-label="Lit tint strength"
                        onChange={(e) => choose(r.id, { color: (v ?? IDENTITY_NEUTRAL.litTint).color, strength: Number(e.target.value) })} />
                    </>
                  )}
                  {v != null
                    ? <button className="carto-btn-sm" onClick={() => choose(r.id, null)} title="Un-choose — the kit's neutral value shows">clear</button>
                    : <span className="carto-identity-todo" title="This town has not chosen one">not chosen · shows {neutralText(r.id)}</span>}
                </div>
                {errors[r.id] && <div className="carto-identity-error">⛔ {errors[r.id]}</div>}
                {r.id === 'accent' && <OutOfGamut p={refused.accent} onTake={chooseAccent} />}
                {r.id === 'accent' && v && <Advice a={accentPolicy(v).advisory} onTake={chooseAccent} />}
                {r.id === 'litTint' && v && <Advice a={litTintPolicy(v).advisory} onTake={(hex) => choose('litTint', { ...v, color: hex })} />}
                {r.id === 'mark' && (
                  <div className="carto-identity-suggest">
                    <button className="carto-btn-sm" onClick={suggest} disabled={!v} title={v ? 'Propose an accent, lit tint and neon set from this mark\'s colours, as this device draws it' : 'Choose a mark first'}>
                      Suggest from mark
                    </button>
                  </div>
                )}
                {r.id === 'mark' && proposal && <Proposal p={proposal} onAccent={takeAccent} onTint={takeTint} onNeon={takeNeon} onDefault={takeDefault} onClose={() => setProposal(null)} />}
              </div>
            )
          })}
          <div className="carto-sources-tabrow"><div className="carto-sources-tab">Neon — category colours</div></div>
          <p className="carto-identity-foot">Each category's signs on the map, and its chips in the Ward (a pastel of the same hue — held to 3:1 on the Ward's grounds).</p>
          {categories.map((c) => {
            const p = c.hex ? neonPolicy(c.hex) : null
            return (
              <div key={c.id} className="carto-identity-row">
                <span className="carto-sources-name">{c.label}</span>
                <div className="carto-identity-control">
                  <input type="color" value={refused[c.id]?.hex ?? c.hex ?? neutralNeon(c.id)} aria-label={`${c.label} colour`}
                    className={c.hex ? '' : 'carto-identity-unset'} onChange={(e) => chooseNeon(c.id, e.target.value.toUpperCase())} />
                  {c.hex
                    ? <button className="carto-btn-sm" onClick={() => chooseNeon(c.id, null)} title="Un-choose — the kit's neutral hue shows">clear</button>
                    : <span className="carto-identity-todo">not chosen · shows {neutralNeon(c.id)}</span>}
                </div>
                <OutOfGamut p={refused[c.id]} onTake={(hex) => chooseNeon(c.id, hex)} />
                {p && <Advice a={p.advisory} onTake={(hex) => chooseNeon(c.id, hex)} />}
              </div>
            )
          })}
          <p className="carto-identity-foot">Saved to this town's Look. The published town shows a change after the next bake.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** A proposal from the mark, previewed: nothing is saved until the operator takes a part of it. */
function Proposal({ p, onAccent, onTint, onNeon, onDefault, onClose }) {
  if (p.error) return <div className="carto-identity-proposal"><div className="carto-identity-error">⛔ {p.error}</div><button className="carto-btn-sm" onClick={onClose}>close</button></div>
  if (p.none) {
    const d = p.default
    return (
      <div className="carto-identity-proposal">
        <div className="carto-identity-hint">{p.none}: the accent left to the Ward's own, the kit's neutral lit tint, and the neutral neon set.</div>
        <div className="carto-identity-neon">{Object.values(d.neon).map((n) => <Swatch key={n.hex} hex={n.hex} />)}<Swatch hex={d.litTint.color} /></div>
        <div className="carto-identity-control"><button className="carto-btn-sm" onClick={onDefault}>use the Ward's default</button><button className="carto-btn-sm" onClick={onClose}>close</button></div>
      </div>
    )
  }
  return (
    <div className="carto-identity-proposal">
      <div className="carto-identity-hint">From {p.mark}, as this device draws it: <span className="carto-identity-neon">{p.clusters.map((c) => <Swatch key={c.hex} hex={c.hex} />)}</span></div>
      <div className="carto-identity-control"><Swatch hex={p.accent.hex} />accent {p.accent.hex} · {p.accent.contrast}:1<button className="carto-btn-sm" onClick={() => onAccent(p.accent.hex)}>use</button></div>
      <Advice a={p.accent.advisory} onTake={onAccent} />
      <div className="carto-identity-control"><Swatch hex={p.litTint.color} />lit tint {p.litTint.color} @ {p.litTint.strength}<button className="carto-btn-sm" onClick={() => onTint(p.litTint)}>use</button></div>
      <Advice a={p.litTint.advisory} onTake={(hex) => onTint({ ...p.litTint, color: hex })} />
      <div className="carto-identity-control"><span className="carto-identity-neon">{Object.values(p.neon).map((n) => <Swatch key={n.hex} hex={n.hex} />)}</span>neon, anchored on {p.anchor}
        {Object.values(p.neon).some((n) => n.advisory.flagged || n.detailAdvisory.flagged) && <span className="carto-identity-advice"> ⚑ {Object.values(p.neon).filter((n) => n.advisory.flagged || n.detailAdvisory.flagged).length} close to a meaning colour</span>}
        <button className="carto-btn-sm" onClick={() => onNeon(p.neon)}>use</button></div>
      <div className="carto-identity-control">
        <button className="carto-btn-sm" onClick={() => { onAccent(p.accent.hex); onTint(p.litTint); onNeon(p.neon); onClose() }}>use all</button>
        <button className="carto-btn-sm" onClick={onClose}>close</button>
      </div>
    </div>
  )
}
