import { EditableList } from '../components/EditableList'
import { BackToSettings } from '../components/Shell'
import { ErrorNote, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useWorkshop } from '../lib/workshop'

/** The bölümler the workshop is split into: workshops and office departments alike. */
export function Bolumler() {
  const { data, error, change } = useWorkshop()

  const count = (id: string) => data?.people.filter((p) => p.active && p.bolum_id === id).length ?? 0

  return (
    <div className="page">
      <BackToSettings />
      <div className="page-head">
        <div>
          <h1>Bölümler</h1>
          <div className="sub">Atölyeler ve ofis bölümleri. Kişinin bölümünü Ekip'te seçin.</div>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        error ? null : (
          <Spinner />
        )
      ) : !data.bolumReady ? (
        <div className="card empty">
          Bölümler için veritabanı güncellemesi gerekiyor: supabase/migrations klasöründeki 0007 dosyası henüz
          çalıştırılmamış.
        </div>
      ) : (
        <section className="stack narrow-section" aria-label="Bölümler">
          <EditableList
            items={data.bolumler}
            noun="bölüm"
            placeholder="Örnek: Boya atölyesi"
            note={(b) => (count(b.id) ? `${count(b.id)} kişi` : '')}
            deleteWarning={(b) => (count(b.id) ? `${b.name}: ${count(b.id)} kişi bölümsüz kalır.` : null)}
            onCreate={(name) => change(() => supabase.from('bolumler').insert({ name }))}
            onRename={(b, name) => change(() => supabase.from('bolumler').update({ name }).eq('id', b.id))}
            onDelete={(b) => change(() => supabase.from('bolumler').delete().eq('id', b.id))}
          />
        </section>
      )}
    </div>
  )
}
