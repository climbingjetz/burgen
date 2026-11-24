import exifr from 'exifr'

// Liest GPS/Datum aus den EXIF-Daten und verkleinert das Bild auf max. 2000 px (JPEG).
export async function processImage(file, max = 2000, quality = 0.85) {
  let lat = null, lon = null, hoehe = null, datum = ''
  try {
    const ex = await exifr.parse(file, { gps: true, exif: true, tiff: true })
    if (ex) {
      if (typeof ex.latitude === 'number' && typeof ex.longitude === 'number') {
        lat = +ex.latitude.toFixed(6)
        lon = +ex.longitude.toFixed(6)
      }
      if (typeof ex.GPSAltitude === 'number') hoehe = Math.round(ex.GPSAltitude)
      const d = ex.DateTimeOriginal || ex.CreateDate
      if (d instanceof Date && !isNaN(d)) datum = d.toISOString()
    }
  } catch {
    /* Bild ohne EXIF */
  }
  if (!datum && file.lastModified) datum = new Date(file.lastModified).toISOString()
  const blob = await resize(file, max, quality)
  return { blob, lat, lon, hoehe, datum, caption: '' }
}

async function resize(file, max, quality) {
  let img
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    img = await loadImg(file)
  }
  const w = img.width, h = img.height
  const s = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * s)
  c.height = Math.round(h * s)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  img.close?.()
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht verarbeitet werden.'))), 'image/jpeg', quality),
  )
}

function loadImg(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => { URL.revokeObjectURL(url); res(i) }
    i.onerror = () => rej(new Error('Dateiformat wird nicht unterstützt.'))
    i.src = url
  })
}
