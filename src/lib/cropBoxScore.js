/**
 * Trim black letterbox bars from a phone screenshot of the 2K box score.
 * Phone captures put the box score in a ~25%-tall band; sending only that band
 * lets the model read the stats at full resolution (and costs fewer tokens).
 *
 * Returns { base64, type } for the cropped JPEG, or null when there's nothing
 * worth trimming (already a tight capture) or the browser can't decode it.
 * The original file is still what gets hashed and stored.
 */
const SCALE = 4        // scan a 1/4-size copy
const GAP = 30         // merge lit rows separated by fewer dark rows than this
const LIT = 40         // r+g+b above this counts as lit
const ROW_LIT = 0.05   // row is lit if >5% of its pixels are

export async function cropBoxScore(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const { width: w, height: h } = bitmap
    const sw = Math.max(1, Math.floor(w / SCALE)), sh = Math.max(1, Math.floor(h / SCALE))

    const scan = document.createElement('canvas')
    scan.width = sw; scan.height = sh
    const sctx = scan.getContext('2d', { willReadFrequently: true })
    sctx.drawImage(bitmap, 0, 0, sw, sh)
    const px = sctx.getImageData(0, 0, sw, sh).data

    const runs = []
    for (let y = 0; y < sh; y++) {
      let lit = 0
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4
        if (px[i] + px[i + 1] + px[i + 2] > LIT) lit++
      }
      if (lit / sw <= ROW_LIT) continue
      const last = runs[runs.length - 1]
      if (last && y - last[1] <= GAP) last[1] = y
      else runs.push([y, y])
    }
    if (!runs.length) return null
    const best = runs.reduce((a, r) => (r[1] - r[0] > a[1] - a[0] ? r : a))
    const top = Math.max(0, best[0] * SCALE - 8)
    const bottom = Math.min(h, (best[1] + 1) * SCALE + 8)
    if (bottom - top > h * 0.9) return null

    const out = document.createElement('canvas')
    out.width = w; out.height = bottom - top
    out.getContext('2d').drawImage(bitmap, 0, top, w, bottom - top, 0, 0, w, bottom - top)
    const dataUrl = out.toDataURL('image/jpeg', 0.9)
    return { base64: dataUrl.split(',')[1], type: 'image/jpeg' }
  } catch {
    return null
  }
}
