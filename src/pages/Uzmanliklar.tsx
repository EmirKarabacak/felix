import { EditableList } from '../components/EditableList'
import { BackToSettings } from '../components/Shell'
import { ErrorNote, Spinner } from '../components/ui'
import { ONAY_KURALI, supabase } from '../lib/supabase'
import { useWorkshop } from '../lib/workshop'

/** The uzmanlıklar of İmalat (Kaynakçı, Elektrikçi...): who can do which job, and at what level. */
export function Uzmanliklar() {
  const { data, error, change } = useWorkshop()

  const people = (id: string) => data?.kisiUzmanliklari.filter((k) => k.uzmanlik_id === id && data.person(k.user_id)?.active).length ?? 0
  const stepTypes = (id: string) => data?.stepTypes.filter((t) => t.uzmanlik_id === id).length ?? 0

  return (
    <div className="page">
      <BackToSettings />
      <div className="page-head">
        <div>
          <h1>Uzmanlıklar</h1>
          <div className="sub">İmalattaki kişilerin uzmanlıkları. Kişinin uzmanlığını ve seviyesini Ekip'te seçin.</div>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        error ? null : (
          <Spinner />
        )
      ) : !data.ready ? (
        <div className="card empty">
          Uzmanlıklar için veritabanı güncellemesi gerekiyor: supabase/migrations klasöründeki 0008 dosyası henüz
          çalıştırılmamış.
        </div>
      ) : (
        <section className="stack narrow-section" aria-label="Uzmanlıklar">
          <EditableList
            items={data.uzmanliklar}
            noun="uzmanlık"
            placeholder="Örnek: Montajcı"
            note={(u) => (people(u.id) ? `${people(u.id)} kişi` : '')}
            deleteWarning={(u) => {
              const parts = [
                people(u.id) ? `${people(u.id)} kişiden` : null,
                stepTypes(u.id) ? `${stepTypes(u.id)} adım türünden` : null,
              ].filter(Boolean)
              return parts.length ? `${u.name}: ${parts.join(' ve ')} kaldırılır.` : null
            }}
            onCreate={(name) => change(() => supabase.from('uzmanliklar').insert({ name }))}
            onRename={(u, name) => change(() => supabase.from('uzmanliklar').update({ name }).eq('id', u.id))}
            onDelete={(u) => change(() => supabase.from('uzmanliklar').delete().eq('id', u.id))}
          />
          <div className="hint">{ONAY_KURALI}</div>
        </section>
      )}
    </div>
  )
}
