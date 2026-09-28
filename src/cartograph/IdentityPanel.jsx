import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import useCartographStore from './stores/useCartographStore'
import { IDENTITY_NEUTRAL } from '../lib/townIdentity.js'
import { neutralNeon } from '../lib/categoryColor.js'
import CATEGORIES from '../tokens/categories.js'

/**
 * IDENTITY — how the town looks, chosen in one place (Warden's ruling, 2026-09-28): its mark, its accent, the mark it
 * rates with, the tint a lit set of roofs takes, and its category colours (Neon — its signs and its Ward chips, stored
 * as materialColors.neon_<category>, decided by src/lib/categoryColor.js; moved here from Stage › Surfaces). Saved in the Look's design.json `identity` block (the store's
 * autosave), baked into scene.json, published in the manifest's `look` (src/lib/townIdentity.js).
 * Reached from the Stage toolbar beside Sources, and from Sources' "Identity" row.
 *
 * ⛔ An unchosen channel says so, and names the kit's neutral value it shows — never another town's.
 * ⛔ A malformed value is refused with the validator's own words; nothing is saved.
 * Not here: the town's name and locale (who it is — its instance and Operations), its label style (Designer).
 */

const ROWS = [
  { id: 'mark', label: 'Mark', kind: 'emoji', hint: 'The avatar, load screen and tab. One emoji.' },
  { id: 'accent', label: 'Accent', kind: 'color', hint: 'The Ward\'s chrome accent.' },
  { id: 'ratingMark', label: 'Rating mark', kind: 'emoji', hint: 'What a place is rated in. One emoji.' },
  { id: 'litTint', label: 'Lit tint', kind: 'tint', hint: 'The roofs of a chosen category or search, and the selected building.' },
]

const neutralText = (id) => {
  const v = IDENTITY_NEUTRAL[id]
  if (v == null) return id === 'mark' ? 'the town\'s initial' : 'none — the kit has not chosen one'
  if (id === 'litTint') return `${v.color} at ${v.strength}`
  return v
}

export default function IdentityPanel({ onClose }) {
  const identity = useCartographStore((s) => s.identity) || {}
  const setChannel = useCartographStore((s) => s.setIdentityChannel)
  const materialColors = useCartographStore((s) => s.materialColors) || {}
  const setCategoryNeon = useCartographStore((s) => s.setCategoryNeon)
  const activeLookId = useCartographStore((s) => s.activeLookId)
  const [errors, setErrors] = useState({})
  const [drafts, setDrafts] = useState({})        // what was typed but refused — kept on screen beside its error

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choose = (id, value) => {
    try { setChannel(id, value); setErrors((e) => ({ ...e, [id]: null })); setDrafts((d) => ({ ...d, [id]: undefined })) }
    catch (err) { setErrors((e) => ({ ...e, [id]: err.message.replace(/^Identity: /, '') })); setDrafts((d) => ({ ...d, [id]: value })) }
  }
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
                  {r.kind === 'color' && (
                    <input type="color" value={v ?? '#808080'} aria-label={r.label}
                      className={v == null ? 'carto-identity-unset' : ''}
                      onChange={(e) => choose(r.id, e.target.value)} />
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
              </div>
            )
          })}
          <div className="carto-sources-tabrow"><div className="carto-sources-tab">Neon — category colours</div></div>
          <p className="carto-identity-foot">Each category's signs on the map, and its chips in the Ward (a pastel of the same hue).</p>
          {categories.map((c) => (
            <div key={c.id} className="carto-identity-row">
              <span className="carto-sources-name">{c.label}</span>
              <div className="carto-identity-control">
                <input type="color" value={c.hex ?? neutralNeon(c.id)} aria-label={`${c.label} colour`}
                  className={c.hex ? '' : 'carto-identity-unset'} onChange={(e) => setCategoryNeon(c.id, e.target.value)} />
                {c.hex
                  ? <button className="carto-btn-sm" onClick={() => setCategoryNeon(c.id, null)} title="Un-choose — the kit's neutral hue shows">clear</button>
                  : <span className="carto-identity-todo">not chosen · shows {neutralNeon(c.id)}</span>}
              </div>
            </div>
          ))}
          <p className="carto-identity-foot">Saved to this town's Look. The published town shows a change after the next bake.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
