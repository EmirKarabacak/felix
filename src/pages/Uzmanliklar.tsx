import { EditableList } from '../components/EditableList'
import { BackToSettings } from '../components/Shell'
import { ErrorNote, Spinner } from '../components/ui'
import { t } from '../lib/i18n'
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
          <h1>{t('Uzmanlıklar')}</h1>
          <div className="sub">{t("İmalattaki kişilerin uzmanlıkları. Kişinin uzmanlığını ve seviyesini Ekip'te seçin.")}</div>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        error ? null : (
          <Spinner />
        )
      ) : !data.ready ? (
        <div className="card empty">
          {t('Uzmanlıklar için veritabanı güncellemesi gerekiyor: supabase/migrations klasöründeki 0008 dosyası henüz çalıştırılmamış.')}
        </div>
      ) : (
        <section className="stack narrow-section" aria-label={t('Uzmanlıklar')}>
          <EditableList
            items={data.uzmanliklar}
            id="uzmanlik"
            texts={{
              empty: t('Henüz uzmanlık yok.'),
              nameLabel: t('Uzmanlık adı'),
              newLabel: t('Yeni uzmanlık'),
              deleteLabel: (u) => t('{name} uzmanlık sil', { name: u.name }),
            }}
            placeholder={t('Örnek: Montajcı')}
            note={(u) => (people(u.id) ? t('{n} kişi', { n: people(u.id) }) : '')}
            deleteWarning={(u) => {
              const kisi = people(u.id)
              const tur = stepTypes(u.id)
              if (kisi && tur) return t('{name}: {kisi} kişiden ve {tur} adım türünden kaldırılır.', { name: u.name, kisi, tur })
              if (kisi) return t('{name}: {n} kişiden kaldırılır.', { name: u.name, n: kisi })
              if (tur) return t('{name}: {n} adım türünden kaldırılır.', { name: u.name, n: tur })
              return null
            }}
            onCreate={(name) => change(() => supabase.from('uzmanliklar').insert({ name }))}
            onRename={(u, name) => change(() => supabase.from('uzmanliklar').update({ name }).eq('id', u.id))}
            onDelete={(u) => change(() => supabase.from('uzmanliklar').delete().eq('id', u.id))}
          />
          <div className="hint">{t(ONAY_KURALI)}</div>
        </section>
      )}
    </div>
  )
}
