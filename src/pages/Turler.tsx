import { useState, type FormEvent } from 'react'
import { EditableList } from '../components/EditableList'
import { ErrorNote, Icon, Spinner, Switch } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useWorkshop, type Workshop } from '../lib/workshop'

/** The two lists projects are built from: project types and step types. */
export function Turler() {
  const { data, error, change } = useWorkshop()

  if (!data) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Türler</h1>
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Türler</h1>
          <div className="sub">Yeni proje açarken kullanılan hazır listeler. Değişiklikler mevcut projeleri etkilemez.</div>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <section className="stack" aria-label="Proje türleri">
        <h3>Proje Türleri</h3>
        <ProjectTypes data={data} />
      </section>

      <section className="stack narrow-section" aria-label="Adım türleri">
        <h3>Adım Türleri</h3>
        <div className="sub">
          "Onay gerekir" açık olan türlerde, işçi işi bitirdiğinde adım bir yönetici onaylayana kadar bitmiş sayılmaz. Bu
          ayar yeni eklenen adımlar için geçerlidir.
        </div>
        <EditableList
          items={data.stepTypes}
          noun="adım türü"
          placeholder="Örnek: Membran yükleme"
          note={(item) => {
            const n = new Set(data.projectTypeSteps.filter((s) => s.step_type_id === item.id).map((s) => s.project_type_id)).size
            return n ? `${n} proje türünde` : ''
          }}
          deleteWarning={(item) => {
            const n = new Set(data.projectTypeSteps.filter((s) => s.step_type_id === item.id).map((s) => s.project_type_id)).size
            return n ? `${item.name}: ${n} proje türünden de çıkarılır.` : null
          }}
          extra={(item) => {
            const type = data.stepTypes.find((t) => t.id === item.id)
            const on = !!type?.needs_approval
            return (
              <label className="mini-switch" title="Açıksa işçi bitirince adım yönetici onayını bekler">
                <span>Onay gerekir</span>
                <Switch
                  checked={on}
                  label={`${item.name}: onay gerekir`}
                  onChange={(next) => change(() => supabase.from('step_types').update({ needs_approval: next }).eq('id', item.id))}
                />
              </label>
            )
          }}
          onCreate={(name) => change(() => supabase.from('step_types').insert({ name }))}
          onRename={(item, name) => change(() => supabase.from('step_types').update({ name }).eq('id', item.id))}
          onDelete={(item) => change(() => supabase.from('step_types').delete().eq('id', item.id))}
        />
      </section>
    </div>
  )
}

function ProjectTypes({ data }: { data: Workshop }) {
  const { change } = useWorkshop()
  const [selected, setSelected] = useState<string | null>(data.projectTypes[0]?.id ?? null)
  const [name, setName] = useState<string | null>(null) // null: not being edited
  const [newName, setNewName] = useState('')
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = data.projectTypes.find((t) => t.id === selected) ?? null
  const steps = current ? data.typeStepsOf(current.id) : []
  const addable = data.stepTypes.filter((t) => !steps.some((s) => s.step_type_id === t.id))

  async function run(work: () => PromiseLike<{ error: unknown }>, after?: () => void) {
    if (busy) return
    setBusy(true)
    setError(null)
    const failed = await change(work)
    setBusy(false)
    if (failed) setError(failed)
    else after?.()
  }

  function pick(id: string) {
    setSelected(id)
    setName(null)
    setRemoving(false)
    setError(null)
  }

  function create(e: FormEvent) {
    e.preventDefault()
    const value = newName.trim()
    if (!value) return
    let madeId: string | null = null
    void run(
      async () => {
        const made = await supabase.from('project_types').insert({ name: value }).select('id').single()
        if (!made.error) madeId = made.data.id
        return made
      },
      () => {
        setNewName('')
        if (madeId) pick(madeId)
      },
    )
  }

  function rename(e: FormEvent) {
    e.preventDefault()
    if (!current || name === null) return
    const value = name.trim()
    if (!value || value === current.name) {
      setName(null)
      return
    }
    void run(() => supabase.from('project_types').update({ name: value }).eq('id', current.id), () => setName(null))
  }

  function move(index: number, by: -1 | 1) {
    const a = steps[index]
    const b = steps[index + by]
    if (!a || !b) return
    void run(async () => {
      const first = await supabase.from('project_type_steps').update({ position: b.position }).eq('id', a.id)
      if (first.error) return first
      return supabase.from('project_type_steps').update({ position: a.position }).eq('id', b.id)
    })
  }

  return (
    <div className="split">
      <div className="side">
        <div className="card rows name-list">
          {data.projectTypes.length === 0 ? <div className="empty">Henüz proje türü yok.</div> : null}
          {data.projectTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              className="type-row press"
              aria-pressed={t.id === selected}
              onClick={() => pick(t.id)}
            >
              <span>{t.name}</span>
              <span className="count">{data.typeStepsOf(t.id).length} adım</span>
            </button>
          ))}
        </div>
        <form onSubmit={create} className="field">
          <label htmlFor="yeni-proje-turu">Yeni proje türü</label>
          <div className="inline-form">
            <input
              id="yeni-proje-turu"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Örnek: Ultrafiltrasyon Ünitesi"
              maxLength={80}
            />
            <button type="submit" className="btn btn-dark press" disabled={busy || !newName.trim()}>
              Oluştur
            </button>
          </div>
        </form>
      </div>

      <div className="main card type-editor">
        {current ? (
          <>
            {name === null ? (
              <div className="type-head">
                <h2>{current.name}</h2>
                <button type="button" className="btn btn-quiet press" onClick={() => setName(current.name)}>
                  Adını değiştir
                </button>
              </div>
            ) : (
              <form className="inline-form" onSubmit={rename}>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Proje türü adı"
                  autoFocus
                  maxLength={80}
                />
                <button type="submit" className="btn btn-tint press" disabled={busy}>
                  Kaydet
                </button>
              </form>
            )}

            <div>
              <div className="field-label">Bu türdeki projelere otomatik eklenen adımlar</div>
              {steps.length === 0 ? <div className="sub pad">Henüz adım yok. Aşağıdan ekleyin.</div> : null}
              <div className="rows">
                {steps.map((s, i) => (
                  <div key={s.id} className="type-step">
                    <span className="mono no">{i + 1}</span>
                    <span className="label-text">{s.name}</span>
                    <button
                      type="button"
                      className="btn btn-icon press"
                      aria-label={`${s.name} adımını yukarı taşı`}
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <Icon name="up" size={20} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon press"
                      aria-label={`${s.name} adımını aşağı taşı`}
                      disabled={busy || i === steps.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <Icon name="down" size={20} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon press"
                      aria-label={`${s.name} adımını türden çıkar`}
                      disabled={busy}
                      onClick={() => void run(() => supabase.from('project_type_steps').delete().eq('id', s.id))}
                    >
                      <Icon name="minus" size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {addable.length ? (
              <div>
                <div className="field-label">Adım ekle</div>
                <div className="chips">
                  {addable.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="btn btn-tint press"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          supabase.from('project_type_steps').insert({
                            project_type_id: current.id,
                            step_type_id: t.id,
                            position: (steps[steps.length - 1]?.position ?? 0) + 1,
                          }),
                        )
                      }
                    >
                      <Icon name="plus" size={16} />
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <ErrorNote>{error}</ErrorNote>

            {removing ? (
              <div className="dialog-foot">
                <div className="note note-error">
                  "{current.name}" türü silinecek. Bu türle açılmış projeler olduğu gibi kalır.
                </div>
                <div className="pair">
                  <button
                    type="button"
                    className="btn btn-danger press"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => supabase.from('project_types').delete().eq('id', current.id),
                        () => {
                          setRemoving(false)
                          setSelected(data.projectTypes.find((t) => t.id !== current.id)?.id ?? null)
                        },
                      )
                    }
                  >
                    Evet, türü sil
                  </button>
                  <button type="button" className="btn btn-quiet press" onClick={() => setRemoving(false)}>
                    Vazgeç
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-danger press end" onClick={() => setRemoving(true)}>
                Bu türü sil
              </button>
            )}
          </>
        ) : (
          <div className="empty">Düzenlemek için bir proje türü seçin veya yeni bir tür oluşturun.</div>
        )}
      </div>
    </div>
  )
}
