import { useState, useRef, useEffect } from 'react'
import useGuardianStatus from '../hooks/useGuardianStatus'

export default function AdminPrompt() {
  const open = useGuardianStatus(s => s.adminPromptOpen)
  const error = useGuardianStatus(s => s.adminPromptError)
  const submit = useGuardianStatus(s => s.submitAdminPassphrase)
  const cancel = useGuardianStatus(s => s.cancelAdminPrompt)
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setValue('')
      // Delay focus to avoid mobile keyboard issues
      const t = setTimeout(() => inputRef.current?.focus(), 500)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    submit(value.trim())
  }

  // Render on top of everything including splash (z-[9999])
  // No 3D scene is loaded while this is showing
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-[min(320px,calc(100vw-3rem))] space-y-4 font-mono shadow-2xl"
      >
        <h2 className="text-white text-base font-medium">Admin</h2>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Passphrase"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          className="w-full bg-neutral-800 text-white text-base rounded-lg px-3 py-2.5 border border-neutral-600 focus:border-neutral-400 outline-none"
        />
        {error && (
          <p className="text-rose-400 text-sm">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex-1 py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={cancel}
            className="px-4 py-2.5 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
