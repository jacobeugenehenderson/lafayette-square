/**
 * CloudPhoto — <img> wrapper with a clean greybox fallback for the 10 presets
 * that lack a reference photo (5 intentionally_omitted in SOURCES.json + 5
 * needs_photo). Convention: photo path is BASE_URL + 'clouds/photos/<id>.jpg'.
 */
import { useState } from 'react'

export default function CloudPhoto({ presetId, alt, style, onClick, fit = 'cover' }) {
  const [errored, setErrored] = useState(false)
  const src = `${import.meta.env.BASE_URL}clouds/photos/${presetId}.jpg`

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
