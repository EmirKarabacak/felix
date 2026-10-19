import { locale } from './i18n'
import { supabase } from './supabase'

const BUCKET = 'dosyalar'

/**
 * Uploads one file and records it. Project files go under p/<project>, step
 * files under s/<step>, with a random id: the real name (which may hold
 * Turkish letters or spaces) is kept in the table, and the database decides
 * the final name ("plan (2).pdf") and moves the earlier version aside.
 */
export async function uploadFile(file: File, place: { projectId: string; stepId?: string | null; ana?: boolean }) {
  const folder = place.stepId ? `s/${place.stepId}` : `p/${place.projectId}`
  const path = `${folder}/${crypto.randomUUID()}`
  // Sent as raw bytes with the file's type, so it is stored exactly as it is.
  const uploaded = await supabase.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploaded.error) return { error: uploaded.error }
  return supabase.rpc('dosya_ekle', {
    p_project_id: place.projectId,
    p_step_id: place.stepId ?? null,
    p_ana: place.ana ?? false,
    p_name: file.name,
    p_path: path,
    p_size: file.size,
    p_mime: file.type || null,
  })
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
