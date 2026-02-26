/**
 * Avatar editor modal.
 * Opens to style chooser if user already has an emoji, emoji picker otherwise.
 * "Change emoji" from the style screen → emoji picker → back to style.
 */
import { useState, useEffect } from 'react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import VignetteChooser from './VignetteChooser'

export default function AvatarEditor({ open, onClose, currentEmoji, currentVignette, onSave }) {
  const [step, setStep] = useState(1)       // 1 = emoji picker, 2 = style chooser
  const [emoji, setEmoji] = useState(null)
  const [vignette, setVignette] = useState(null)

  // Reset state when modal opens — go to style if we already have an emoji
  useEffect(() => {
    if (open) {
      setEmoji(currentEmoji || null)
      setVignette(currentVignette || null)
      setStep(currentEmoji ? 2 : 1)
    }
  }, [open, currentEmoji, currentVignette])

  if (!open) return null

  const handleEmojiSelect = (emojiData) => {
    setEmoji(emojiData.native)
    if (!vignette) setVignette('v0')
    setStep(2)
  }

  const handleSave = () => {
    onSave(emoji, vignette || 'v0')
    onClose()
  }

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-surface-scrim backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative rounded-2xl bg-surface border border-outline shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-surface-container-high text-on-surface-subtle hover:text-on-surface-medium hover:bg-surface-container-highest flex items-center justify-center transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {step === 1 ? (
          <div className="p-1">
            <Picker
              data={data}
              onEmojiSelect={handleEmojiSelect}
              theme="dark"
              set="native"
              categories={['people', 'nature', 'foods', 'activity', 'objects', 'symbols']}
              perLine={8}
              emojiSize={28}
              emojiButtonSize={36}
              previewPosition="none"
              skinTonePosition="search"
              maxFrequentRows={2}
            />
          </div>
        ) : (
          <div className="p-6 min-w-[280px]">
            <h3 className="text-on-surface-variant text-xs text-center mb-4 font-medium">Avatar style</h3>
            <VignetteChooser
              emoji={emoji}
              vignette={vignette}
              onVignetteChange={setVignette}
              onBack={() => setStep(1)}
              onSave={handleSave}
            />
          </div>
        )}
      </div>
    </div>
  )
}
