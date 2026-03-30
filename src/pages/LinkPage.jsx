import { useEffect, useState } from 'react'
import { getDeviceHash } from '../lib/device'
import { claimLinkToken } from '../lib/api'
import AvatarCircle from '../components/AvatarCircle'

export default function LinkPage({ token }) {
  const [status, setStatus] = useState('loading') // loading | success | error
  const [handle, setHandle] = useState(null)
  const [avatar, setAvatar] = useState(null)
  const [vignette, setVignette] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function claim() {
      const dh = await getDeviceHash()

      try {
        const res = await claimLinkToken(token, dh)
        if (cancelled) return
        if (res.data?.error) {
          setErrorMsg(res.data.error)
          setStatus('error')
        } else if (res.data?.success) {
          const h = res.data.handle || localStorage.getItem('lsq_handle')
          const a = res.data.avatar || localStorage.getItem('lsq_avatar')
          const v = res.data.vignette || localStorage.getItem('lsq_vignette')
          // Save identity locally
          if (h) localStorage.setItem('lsq_handle', h)
          if (a) localStorage.setItem('lsq_avatar', a)
          else localStorage.removeItem('lsq_avatar')
          if (v) localStorage.setItem('lsq_vignette', v)
          else localStorage.removeItem('lsq_vignette')
          setHandle(h)
          setAvatar(a)
          setVignette(v)
          setStatus('success')
        } else {
          setErrorMsg('Unexpected response')
          setStatus('error')
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

        {status === 'success' && (
          <>
            <div className="flex justify-center">
              <AvatarCircle emoji={avatar} vignette={vignette} size={12} />
            </div>
            <p className="text-on-surface text-lg font-medium">Linked!</p>
            <p className="text-on-surface-subtle text-sm">
              @{handle} is now connected on this device.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-4xl">{'\u26a0\ufe0f'}</div>
            <p className="text-on-surface-variant text-sm">{errorMsg || 'Something went wrong'}</p>
          </>
        )}
      </div>
    </div>
  )
}
