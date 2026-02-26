/**
 * Client-side JPEG compression via Canvas.
 * Resizes to max 1200px wide, compresses to fit under maxBytes.
 * Returns { base64, width, height } or null on failure.
 */
export default function compressImage(file, maxBytes = 200000) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxW = 1200
      let w = img.width
      let h = img.height
      if (w > maxW) {
        h = Math.round(h * (maxW / w))
        w = maxW
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      // Iterate quality down to fit under maxBytes
      let quality = 0.85
      let base64
      for (let i = 0; i < 6; i++) {
        base64 = canvas.toDataURL('image/jpeg', quality)
        if (base64.length * 0.75 <= maxBytes) break // base64 is ~33% larger than raw
        quality -= 0.1
      }
      resolve({ base64, width: w, height: h })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}
