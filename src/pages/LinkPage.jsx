import { useEffect, useState } from 'react'
import { getDeviceHash } from '../lib/device'
import { claimLinkToken } from '../lib/api'
import AvatarCircle from '../components/AvatarCircle'

export default function LinkPage({ token }) {
  const [status, setStatus] = useState('loading') // loading | no-handle | success | error
  const [handle, setHandle] = useState(null)
  const [avatar, setAvatar] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function claim() {
      const dh = await getDeviceHash()
      const storedHandle = localStorage.getItem('lsq_handle')
      if (!storedHandle) {
        setStatus('no-handle')
        return
      }

      try {
        const res = await claimLinkToken(token, dh)
        if (cancelled) return
        if (res.data?.error) {
          setErrorMsg(res.data.error)
          setStatus('error')
        } else {
          setHandle(storedHandle)
          setAvatar(localStorage.getItem('lsq_avatar'))
          setStatus('success')
        }
      } catch (err) {
        if (cancelled) return
        setErrorMsg(err.message)
        setStatus('error')
      }
    }
    claim()
    return () => { cancelled = true }
  }, [token])

  return (
    <div className="min-h-screen bg-scene-bg flex items-center justify-center p-6">
      <div className="w-full max-w-xs text-center space-y-4">
        {status === 'loading' && (
          <p className="text-on-surface-subtle text-sm">Linking...</p>
        )}

        {status === 'no-handle' && (
          <>
            <div className="text-4xl">📱</div>
            <p className="text-on-surface-variant text-sm">
              Open this on the device where you're already signed in.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center">
              <AvatarCircle emoji={avatar} vignette={localStorage.getItem('lsq_vignette')} size={12} />
            </div>
            <p className="text-on-surface text-lg font-medium">Linked!</p>
            <p className="text-on-surface-subtle text-sm">
              @{handle} is now connected to your other device. You can close this tab.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-4xl">⚠️</div>
            <p className="text-on-surface-variant text-sm">{errorMsg || 'Something went wrong'}</p>
          </>
        )}
      </div>
    </div>
  )
}
