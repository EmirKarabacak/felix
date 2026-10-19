import { useRef, useState } from 'react'
import { useProfile } from '../lib/auth'
import { deleteFile, downloadLink, formatSize, uploadFile } from '../lib/dosyalar'
import { friendly } from '../lib/errors'
import { t } from '../lib/i18n'
import { canManageFiles, formatMoment, useWorkshop, type Dosya } from '../lib/workshop'
import { ErrorNote, Icon } from './ui'

/** Opens a file: a short-lived link that downloads it under its own name. */
async function open(file: Dosya): Promise<string | null> {
  const { url, error } = await downloadLink(file.storage_path, file.name)
  if (!url) return friendly(error)
  window.location.assign(url)
  return null
}

function FileRow({
  file,
  canDelete,
  busy,
  onError,
  onDelete,
}: {
  file: Dosya
  canDelete: boolean
  busy: boolean
  onError: (message: string | null) => void
  onDelete?: () => void
}) {
  const { data } = useWorkshop()
  const [confirm, setConfirm] = useState(false)
  const who = file.uploaded_by ? data?.person(file.uploaded_by)?.full_name : undefined
  const old = !!file.eski_at

  if (confirm) {
    return (
      <div className="file-row">
        <span className="file-text">
          <span className="file-name">{t('{name} silinsin mi?', { name: file.name })}</span>
          <span className="sub">
            {t('Eski sürümlere taşınır; Genel Müdür, IT, Bölüm Sorumluları ve Tasarım açabilir.')}
          </span>
        </span>
        <span className="file-buttons">
          <button type="button" className="btn btn-danger press" disabled={busy} onClick={onDelete}>
            {t('Sil')}
          </button>
          <button type="button" className="btn btn-quiet press" onClick={() => setConfirm(false)}>
            {t('Vazgeç')}
          </button>
        </span>
      </div>
    )
  }

  return (
    <div className={`file-row${old ? ' file-old' : ''}`}>
      <button
        type="button"
        className="file-open press"
        onClick={async () => onError(await open(file))}
        aria-label={t('{name} indir', { name: file.name })}
      >
        <span className="file-icon">
          <Icon name="doc" size={22} />
        </span>
        <span className="file-text">
          <span className="file-name">{file.name}</span>
          <span className="sub">
            {[
              formatSize(file.size),
              who,
              formatMoment(file.created_at),
              old
                ? file.silindi
                  ? t('Silindi {time}', { time: formatMoment(file.eski_at) })
                  : t('Yenisi geldi {time}', { time: formatMoment(file.eski_at) })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="file-go">
          <Icon name="download" size={20} />
        </span>
      </button>
      {canDelete && !old ? (
        <button type="button" className="btn btn-icon press" aria-label={t('{name} sil', { name: file.name })} onClick={() => setConfirm(true)}>
          <Icon name="trash" size={20} />
        </button>
      ) : null}
    </div>
  )
}

/**
 * The files of one place: a project's Ana doküman, a project's other files,
 * or a step's files. Shows the current files to everyone and, to Genel Müdür,
 * IT, Bölüm Sorumluları and Tasarım, the Eski sürümler underneath.
 */
export function FileSection({
  title,
  projectId,
  stepId = null,
  ana = false,
  files,
  canAdd,
  addLabel,
  empty,
  showOld = true,
  heading = false,
}: {
  title: string
  projectId: string
  stepId?: string | null
  ana?: boolean
  /** Every file of this place, current and old. */
  files: Dosya[]
  canAdd: boolean
  addLabel: string
  empty: string
  /** The old versions are listed here; turn off where another section lists them. */
  showOld?: boolean
  /** A page section title (h3) instead of a small field label, as on the project page. */
  heading?: boolean
}) {
  const me = useProfile()
  const { data, change } = useWorkshop()
  const picker = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [oldOpen, setOldOpen] = useState(false)
  if (!data) return null

  const manager = canManageFiles(data, me)
  const current = files.filter((f) => !f.eski_at)
  const old = manager && showOld ? files.filter((f) => f.eski_at) : []

  async function add(list: FileList | null) {
    if (!list || list.length === 0 || busy) return
    setBusy(true)
    setError(null)
    // The Ana doküman is one file; elsewhere several can be picked at once.
    const picked = ana ? [list[0]] : Array.from(list)
    for (const [i, file] of picked.entries()) {
      setProgress(picked.length > 1 ? t('Yükleniyor {i} / {total}…', { i: i + 1, total: picked.length }) : t('Yükleniyor…'))
      const failed = await change(() => uploadFile(file, { projectId, stepId, ana }))
      if (failed) {
        setError(`${file.name}: ${failed}`)
        break
      }
    }
    setProgress(null)
    setBusy(false)
    if (picker.current) picker.current.value = ''
  }

  async function remove(file: Dosya) {
    setBusy(true)
    setError(await change(() => deleteFile(file.id)))
    setBusy(false)
  }

  return (
    <section className="stack files" aria-label={title}>
      <div className="files-head">
        {heading ? <h3>{title}</h3> : <div className="field-label">{title}</div>}
        {canAdd ? (
          <>
            <input
              ref={picker}
              type="file"
              multiple={!ana}
              hidden
              aria-label={addLabel}
              onChange={(e) => void add(e.target.files)}
            />
            <button type="button" className="btn btn-tint press" disabled={busy} onClick={() => picker.current?.click()}>
              <Icon name="clip" size={18} />
              {progress ?? addLabel}
            </button>
          </>
        ) : null}
      </div>
      {current.length ? (
        <div className="card rows file-list">
          {current.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              busy={busy}
              canDelete={manager}
              onError={setError}
              onDelete={() => void remove(f)}
            />
          ))}
        </div>
      ) : (
        <div className="sub">{empty}</div>
      )}
      <ErrorNote>{error}</ErrorNote>
      {old.length ? (
        <div className="old-files">
          <button type="button" className="btn btn-quiet press" aria-expanded={oldOpen} onClick={() => setOldOpen(!oldOpen)}>
            <Icon name={oldOpen ? 'up' : 'down'} size={18} />
            {t('Eski sürümler ({n})', { n: old.length })}
          </button>
          {oldOpen ? (
            <div className="card rows file-list">
              {old.map((f) => (
                <FileRow key={f.id} file={f} busy={busy} canDelete={false} onError={setError} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
