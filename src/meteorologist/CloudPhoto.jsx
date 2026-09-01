/**
 * CloudPhoto — <img> wrapper with a clean greybox fallback for the 10 presets
 * that lack a reference photo (5 intentionally_omitted in SOURCES.json + 5
 * needs_photo). Convention: photo path is '/authoring/cloud-photos/<id>.jpg'.
 *
 * ⛔ These are AUTHORING reference photos — what a person judges a cloud render
 * against, never shipped and never read by the bake (clouds are procedural
 * shader params, not textures; a photo's pixels must not reach the slab).
 * Nothing in code reads them today; `meteorologist/data/specialist-seed.json`
 * records the one pass that used them, by hand. TUNER.md §8.2 designs a Critic
 * that WOULD read them per-species — status there is "DESIGN COMPLETE · BUILD
 * NOT STARTED", and that consumer would be an authoring loop on this machine,
 * which reads `authoring/` by path exactly as bake-look.js reads bark.
 * They live at repo-root `authoring/cloud-photos/`
 * (moved out of public/clouds/photos/ 2026-09-01) so the production build
 * cannot contain them; `serveAuthoringAssets()` in vite.config.js serves them
 * in dev. Not BASE_URL-joined: BASE_URL is the deployed site's base, and this
 * path is deliberately dev-only.
 *
 * ⚠️ The greybox below is the designed state for the 10 presets with no photo —
 * so a BROKEN path degrades to "no photo" on ALL of them rather than erroring.
 * Verify by counting rendered photos (42), never by absence of a console error.
 */
import { useState } from 'react'

export default function CloudPhoto({ presetId, alt, style, onClick, fit = 'cover' }) {
  const [errored, setErrored] = useState(false)
  const src = `/authoring/cloud-photos/${presetId}.jpg`

  const base = {
    display: 'block',
    background: '#1a1a1a',
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  }

  if (errored) {
    return (
      <div
        onClick={onClick}
        style={{
          ...base,
          color: 'rgba(255,255,255,0.25)',
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px dashed rgba(255,255,255,0.08)',
        }}
        title={`No reference photo for ${presetId}`}
      >
        no photo
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt || presetId}
      loading="lazy"
      onClick={onClick}
      onError={() => setErrored(true)}
      style={{ ...base, objectFit: fit }}
    />
  )
}
