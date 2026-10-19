import { locale } from './i18n'
import { supabase } from './supabase'

const BUCKET = 'dosyalar'

/**
 * Uploads one file and records it. Project files go under p/<project>, step
 * files under s/<step>, with a random id: the real name (which may hold
 * Turkish letters or spaces) is kept in the table, and the database decides
 * the final name ("plan (2).pdf") and moves the earlier version aside.
 */
export async function uploadFile(
  file: File,
  place: { projectId: string; stepId?: string | null; ana?: boolean },
): Promise<{ error: unknown; path: string }> {
  const folder = place.stepId ? `s/${place.stepId}` : `p/${place.projectId}`
  const path = `${folder}/${crypto.randomUUID()}`
  // Sent as raw bytes with the file's type, so it is stored exactly as it is.
  const uploaded = await supabase.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploaded.error) return { error: uploaded.error, path }
  const { error } = await supabase.rpc('dosya_ekle', {
    p_project_id: place.projectId,
    p_step_id: place.stepId ?? null,
    p_ana: place.ana ?? false,
    p_name: file.name,
    p_path: path,
    p_size: file.size,
    p_mime: file.type || null,
  })
  return { error, path }
}

const PHOTO_EDGE = 1600
const PHOTO_QUALITY = 0.82

/**
 * A phone photo made smaller before it is sent: at most 1600 px on its long
 * side, as JPEG. A 4 MB photo becomes a few hundred KB, which matters on the
 * workshop's mobile data and is still sharp enough to check a weld. If the
 * browser cannot read the photo, it is sent as it is.
 */
export async function shrinkPhoto(file: File, name: string): Promise<File> {
  const original = () => new File([file], name + (file.name.match(/\.[^./]*$/)?.[0] ?? ''), { type: file.type || 'image/jpeg' })
  try {
    const url = URL.createObjectURL(file)
    const image = new Image()
    try {
      image.src = url
      await image.decode()
    } finally {
      URL.revokeObjectURL(url)
    }
    const scale = Math.min(1, PHOTO_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', PHOTO_QUALITY))
    if (!blob || blob.size >= file.size) return original()
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  } catch {
    return original()
  }
}

/** A link that shows a stored picture in the page (an hour long, so an open window keeps working). */
export async function viewLink(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  return { url: data?.signedUrl ?? null, error }
}

/** A short-lived link that downloads the file under its own name. */
export async function downloadLink(path: string, name: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error || !data) return { url: null, error }
  return { url: `${data.signedUrl}&download=${encodeURIComponent(name)}`, error: null }
}

export function deleteFile(id: string) {
  return supabase.rpc('dosya_sil', { p_id: id })
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  const SIZE = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 })
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${SIZE.format(bytes / 1024)} KB`
  return `${SIZE.format(bytes / 1024 / 1024)} MB`
}
