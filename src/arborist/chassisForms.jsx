/**
 * chassisForms.jsx — the shared silhouette vocabulary + a scalable lazy plate,
 * used by BOTH the Shelves gauntlet (classify) and the Salon Species Builder
 * (compose from the shelves). One source of truth for the 9 crown forms.
 */
import { useEffect, useRef, useState } from 'react'
import { chassisThumb } from './chassisThumbnails.js'

// The 9 crown-form silhouettes — the closed set (rubric.json chassis.habit). `id`
// is the persisted token (matches the serve.js validator + dossier chassis.habit).
export const FORMS = [
  { id: 'columnar',   name: 'Columnar',   def: 'Tall and narrow, near-parallel sides — height much greater than width (Lombardy poplar, fastigiate oak).' },
  { id: 'pyramidal',  name: 'Pyramidal',  def: 'Broad base tapering to a single point — conical, one dominant leader (spruce, sweetgum, young pin oak).' },
  { id: 'oval',       name: 'Oval',       def: 'Egg-shaped — rounded top, slightly taller than wide. The default upright street tree (linden, red maple).' },
  { id: 'rounded',    name: 'Rounded',    def: 'Roughly circular crown, height ≈ width — a compact ball of canopy (many maples, callery pear).' },
  { id: 'vase',       name: 'Vase',       def: 'Narrow at the base, branches ascend then arch out wide toward the top (American elm, zelkova).' },
  { id: 'spreading',  name: 'Spreading',  def: 'Wider than tall — a broad, horizontal canopy on a low frame (mature white oak, honey locust).' },
  { id: 'weeping',    name: 'Weeping',    def: 'Branches cascade downward from an arched crown (weeping willow, weeping cherry).' },
  { id: 'multi-stem', name: 'Multi-stem', def: 'Several trunks diverging from the base — no single leader (river birch clump, serviceberry).' },
  { id: 'irregular',  name: 'Irregular',  def: 'Asymmetric, picturesque — no regular geometry (old pine, wind-shaped or open-grown specimen).' },
]
export const FORM_IDS = FORMS.map(f => f.id)
export const FORM_BY_ID = Object.fromEntries(FORMS.map(f => [f.id, f]))

// Schematic crown-form icons for the classification key + shelf headers.
export function FormIcon({ form, size = 40 }) {
  const s = '#aeb8c2'
  const crown = {
    columnar:   <ellipse cx="20" cy="24" rx="7" ry="22" fill={s} />,
    pyramidal:  <polygon points="20,4 33,46 7,46" fill={s} />,
    oval:       <ellipse cx="20" cy="24" rx="13" ry="20" fill={s} />,
    rounded:    <circle cx="20" cy="24" r="15" fill={s} />,
    vase:       <path d="M20 46 C 8 30 6 6 6 6 C 14 18 26 18 34 6 C 34 6 32 30 20 46 Z" fill={s} />,
    spreading:  <ellipse cx="20" cy="26" rx="18" ry="12" fill={s} />,
    weeping:    <path d="M4 20 C 4 8 36 8 36 20 C 34 22 33 40 31 44 M31 20 C 31 34 29 42 28 46 M20 22 C 20 36 20 44 20 50 M9 20 C 9 34 11 42 12 46 M12 20 C 12 32 10 40 9 44" fill="none" stroke={s} strokeWidth="2" />,
    'multi-stem': <g fill={s}><circle cx="12" cy="20" r="9" /><circle cx="27" cy="17" r="9" /><circle cx="20" cy="27" r="9" /></g>,
    irregular:  <path d="M10 30 C 2 22 8 10 16 12 C 16 4 30 4 30 13 C 40 12 38 26 30 28 C 34 36 22 40 18 34 C 12 40 6 36 10 30 Z" fill={s} />,
  }[form]
  return (
    <svg width={size} height={size * 52 / 40} viewBox="0 0 40 52" style={{ display: 'block', flex: 'none' }}>
      <rect x="18.5" y="42" width="3" height="10" fill="#6b7280" />
      {crown}
    </svg>
  )
}

// A silhouette thumbnail that bakes ONCE via the shared offscreen renderer, only
// when scrolled into view — so a grid of hundreds of plates costs one WebGL
// context, not one-per-plate (the ~16-context cap). `overlay` renders on top
// (flag badges, an approve badge, …).
export function LazyChassisThumb({ name, rootMargin = '300px', overlay = null, style }) {
  const url = `/trees/_chassis/${name}.glb`
  const ref = useRef(null)
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let done = false
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && !done) {
        done = true; io.disconnect()
        chassisThumb(url).then(d => { d ? setSrc(d) : setFailed(true) })
      }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [url, rootMargin])
  return (
    <div ref={ref} style={{
      width: '100%', aspectRatio: '1 / 1', borderRadius: 3, overflow: 'hidden',
      background: 'rgba(255,255,255,0.04)', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
    }}>
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: 10, color: failed ? '#a55' : '#556' }}>{failed ? 'no render' : '…'}</span>}
      {overlay}
    </div>
  )
}
