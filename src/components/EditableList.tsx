import { useState, type FormEvent, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { ErrorNote, Icon } from './ui'

type Item = { id: string; name: string }

/**
 * A list of names that can be added to, renamed (tap the name) and deleted.
 * Used for the lists the workshop maintains itself, such as step types.
 */
export function EditableList({
  items,
  id,
  texts,
  placeholder,
  note,
  extra,
  deleteWarning,
  onCreate,
  onRename,
  onDelete,
}: {
  items: Item[]
  /** Names the new-item field: yeni-<id>. */
  id: string
  /** The list's own words, already translated: what an item is called in each place. */
  texts: {
    /** "Henüz adım türü yok." */
    empty: string
    /** "Adım türü adı", the rename field. */
    nameLabel: string
    /** "Yeni adım türü", the new-item field. */
    newLabel: string
    /** "Kaynak adım türü sil", the delete button of one row. */
    deleteLabel: (item: Item) => string
  }
  placeholder: string
  /** Small text on the right of a row, e.g. how many people have it. */
  note?: (item: Item) => string
  /** An extra control on each row, such as a switch. */
  extra?: (item: Item) => ReactNode
  /** Shown before deleting, when deleting has a consequence worth stating. */
  deleteWarning?: (item: Item) => string | null
  onCreate: (name: string) => Promise<string | null>
  onRename: (item: Item, name: string) => Promise<string | null>
  onDelete: (item: Item) => Promise<string | null>
}) {
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<Item | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputId = `yeni-${id}`

  async function run(work: () => Promise<string | null>, done: () => void) {
    if (busy) return
    setBusy(true)
    setError(null)
    const failed = await work()
    setBusy(false)
    if (failed) setError(failed)
    else done()
  }

  function create(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (name) void run(() => onCreate(name), () => setNewName(''))
  }

  function rename(e: FormEvent) {
    e.preventDefault()
    if (!renaming) return
    const name = renaming.name.trim()
    const original = items.find((i) => i.id === renaming.id)
    if (!name || !original) return
    if (name === original.name) {
      setRenaming(null)
      return
    }
    void run(() => onRename(original, name), () => setRenaming(null))
  }

  return (
    <>
      <div className="card name-list rows">
        {items.length === 0 ? <div className="empty">{texts.empty}</div> : null}
        {items.map((item) =>
          renaming?.id === item.id ? (
            <form key={item.id} className="name-row" onSubmit={rename}>
              <input
                className="input"
                value={renaming.name}
                onChange={(e) => setRenaming({ id: item.id, name: e.target.value })}
                aria-label={texts.nameLabel}
                autoFocus
                maxLength={80}
              />
              <button type="submit" className="btn btn-tint press" disabled={busy}>
                {t('Kaydet')}
              </button>
            </form>
          ) : removing === item.id ? (
            <div key={item.id} className="name-row">
              <span className="label-text">{deleteWarning?.(item) ?? t('{name} silinsin mi?', { name: item.name })}</span>
              <button
                type="button"
                className="btn btn-danger press"
                disabled={busy}
                onClick={() => void run(() => onDelete(item), () => setRemoving(null))}
              >
                {t('Sil')}
              </button>
              <button type="button" className="btn btn-quiet press" onClick={() => setRemoving(null)}>
                {t('Vazgeç')}
              </button>
            </div>
          ) : (
            <div key={item.id} className="name-row">
              <button type="button" className="label press" onClick={() => setRenaming(item)} title={t('Adını değiştir')}>
                {item.name}
              </button>
              <span className="count">{note?.(item) ?? ''}</span>
              {extra?.(item)}
              <button
                type="button"
                className="btn btn-icon press"
                aria-label={texts.deleteLabel(item)}
                onClick={() => setRemoving(item.id)}
              >
                <Icon name="trash" size={20} />
              </button>
            </div>
          ),
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={create} className="field">
        <label htmlFor={inputId}>{texts.newLabel}</label>
        <div className="inline-form">
          <input
            id={inputId}
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={placeholder}
            maxLength={80}
          />
          <button type="submit" className="btn btn-dark press" disabled={busy || !newName.trim()}>
            {t('Oluştur')}
          </button>
        </div>
      </form>
    </>
  )
}
