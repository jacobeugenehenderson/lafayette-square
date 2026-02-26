/**
 * Step 2 of avatar editor — pick a vignette style for the chosen emoji.
 * Shows large preview + row of 4 swatch circles. No "none" option.
 */
import { useMemo, useState, useEffect } from 'react'
import AvatarCircle from './AvatarCircle'
import { getVignetteSwatches, warmUpEmojiColor } from '../lib/vignettePresets'

const LABELS = { v0: 'Decorator', v1: 'Soft', v2: 'Vivid', v3: 'Bold' }

export default function VignetteChooser({ emoji, vignette, onVignetteChange, onBack, onSave }) {
  const [ready, setReady] = useState(false)
  const active = vignette || 'v0'

  useEffect(() => {
    setReady(false)
    if (!emoji) return
    warmUpEmojiColor(emoji).then(() => setReady(true))
  }, [emoji])

  const swatches = useMemo(() => getVignetteSwatches(emoji), [emoji, ready])

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Large preview */}
      <AvatarCircle emoji={emoji} vignette={active} size={16} />

      {/* Swatch row */}
      <div className="flex items-center gap-3">
        {swatches.map(({ id, style }) => (
          <button
            key={id}
            onClick={() => onVignetteChange(id)}
            className={`w-10 h-10 rounded-full transition-all duration-150 ${
              active === id ? 'scale-110' : 'hover:scale-105'
            }`}
            style={{
              ...(style ? {
                background: style.background,
                boxShadow: active === id
                  ? `${style.boxShadow}, 0 0 0 2px rgba(255,255,255,0.6)`
                  : style.boxShadow,
                borderColor: style.borderColor,
                borderWidth: '1.5px',
                borderStyle: 'solid',
              } : {}),
            }}
            title={LABELS[id]}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-2 w-full">
        <button
          onClick={onSave}
          className="w-full py-2.5 rounded-lg text-sm font-medium bg-white/15 text-white hover:bg-white/20 transition-colors"
        >
          Save
        </button>
        <button
          onClick={onBack}
          className="text-white/40 text-xs hover:text-white/60 transition-colors"
        >
          Change emoji
        </button>
      </div>
    </div>
  )
}
