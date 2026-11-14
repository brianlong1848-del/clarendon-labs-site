'use client'
// Browser-side media prep + direct-to-storage upload, shared by the composer,
// the Drive picker and the scheduled-post editor.

export type Prepared = { name: string; src: string; kind: 'image' | 'video'; mime: string; width: number; height: number; duration?: number; size: number; blob: Blob }

// Browser-side prep: read dimensions, convert photos to JPEG (Instagram's API
// takes JPEG only), cap the long edge so phone photos don't upload at 48MP.
export async function prepare(file: File): Promise<Prepared> {
  if (file.type.startsWith('video/')) {
    const src = URL.createObjectURL(file)
    const meta = await new Promise<{ w: number; h: number; d: number }>((resolve, reject) => {
      const v = document.createElement('video')
      v.preload = 'metadata'; v.src = src
      v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight, d: v.duration })
      v.onerror = () => reject(new Error('This video format can’t be read — export it as MP4 (H.264).'))
    })
    return { name: file.name, src, kind: 'video', mime: file.type || 'video/mp4', width: meta.w, height: meta.h, duration: meta.d, size: file.size, blob: file }
  }
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image can’t be read here — export HEIC photos as JPEG first.') })
  const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.92))
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', src: URL.createObjectURL(blob), kind: 'image', mime: 'image/jpeg', width: w, height: h, size: blob.size, blob }
}

export function put(url: string, blob: Blob, type: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('PUT', url); x.setRequestHeader('Content-Type', type)
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status}).`)))
    x.onerror = () => reject(new Error('Upload failed — check the connection.'))
    x.send(blob)
  })
}


/** Prepare + upload one file for an app; resolves with its public URL and dimensions. */
export async function uploadFile(appId: string, file: File, onProgress: (p: number) => void = () => {}) {
  const prepped = await prepare(file)
  const res = await fetch('/api/publish/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, filename: prepped.name }) })
  const up = await res.json()
  if (!res.ok) throw new Error(up.error ?? 'Could not start upload.')
  await put(up.uploadUrl, prepped.blob, prepped.mime, onProgress)
  return { ...prepped, url: up.publicUrl as string }
}
