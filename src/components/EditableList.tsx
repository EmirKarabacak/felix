import { useState, type FormEvent, type ReactNode } from 'react'
import { ErrorNote, Icon } from './ui'

type Item = { id: string; name: string }

/**
 * A list of names that can be added to, renamed (tap the name) and deleted.
 * Used for the lists the workshop maintains itself, such as step types.
 */
export function EditableList({
  items,
  noun,
  placeholder,
  note,
  extra,
  deleteWarning,
  onCreate,
  onRename,
  onDelete,
}: {
  items: Item[]
  /** What one item is called, lower case: "adım türü". */
  noun: string
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
  const inputId = `yeni-${noun.replace(/\s+/g, '-')}`
  const Noun = noun.charAt(0).toLocaleUpperCase('tr') + noun.slice(1)

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
        {items.length === 0 ? <div className="empty">Henüz {noun} yok.</div> : null}
        {items.map((item) =>
          renaming?.id === item.id ? (
            <form key={item.id} className="name-row" onSubmit={rename}>
              <input
                className="input"
                value={renaming.name}
                onChange={(e) => setRenaming({ id: item.id, name: e.target.value })}
                aria-label={`${Noun} adı`}
                autoFocus
                maxLength={80}
              />
              <button type="submit" className="btn btn-tint press" disabled={busy}>
                Kaydet
              </button>
            </form>
          ) : removing === item.id ? (
            <div key={item.id} className="name-row">
              <span className="label-text">{deleteWarning?.(item) ?? `${item.name} silinsin mi?`}</span>
              <button
                type="button"
                className="btn btn-danger press"
                disabled={busy}
                onClick={() => void run(() => onDelete(item), () => setRemoving(null))}
              >
                Sil
              </button>
              <button type="button" className="btn btn-quiet press" onClick={() => setRemoving(null)}>
                Vazgeç
              </button>
            </div>
          ) : (
            <div key={item.id} className="name-row">
              <button type="button" className="label press" onClick={() => setRenaming(item)} title="Adını değiştir">
                {item.name}
              </button>
              <span className="count">{note?.(item) ?? ''}</span>
              {extra?.(item)}
              <button
                type="button"
                className="btn btn-icon press"
                aria-label={`${item.name} ${noun} sil`}
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
        <label htmlFor={inputId}>Yeni {noun}</label>
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
            Oluştur
          </button>
        </div>
      </form>
    </>
  )
}
