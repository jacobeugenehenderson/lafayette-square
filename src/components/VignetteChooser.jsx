/**
 * Step 2 of avatar editor — pick a vignette style for the chosen emoji.
 * Shows large preview + 8 swatch circles in 2 rows of 4.
 */
import { useMemo } from 'react'
import AvatarCircle from './AvatarCircle'
import { getVignetteSwatches } from '../lib/vignettePresets'

export default function VignetteChooser({ emoji, vignette, onVignetteChange, onBack, onSave }) {
  const active = vignette || 'v0'
  const swatches = useMemo(() => getVignetteSwatches(emoji), [emoji])

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Large preview */}
      <AvatarCircle emoji={emoji} vignette={active} size={16} />

      {/* Swatch grid — 2 rows of 4 */}
      <div className="flex flex-col gap-2.5">
        {[swatches.slice(0, 4), swatches.slice(4, 8)].map((row, ri) => (
          <div key={ri} className="flex items-center justify-center gap-3">
            {row.map(({ id, style }) => (
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
              />
            ))}
          </div>
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
