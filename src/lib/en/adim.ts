import type { Dictionary } from '../en'

// The step window, İşlerim, Talepler and Dosyalar.
export const adim: Dictionary = {
  // Step window: facts
  Durum: 'Status',
  Uzmanlık: 'Specialty',
  'Bitiş tarihi': 'Due date',
  Belirlenmedi: 'Not set',
  Başladı: 'Started',
  Talepler: 'Requests',

  // Step window: buttons
  'İşe başla': 'Start work',
  'İşi bitir': 'Finish work',
  'Sorun bildir': 'Report a problem',
  'Sorun çözüldü, devam et': 'Problem solved, continue',
  Onayla: 'Approve',
  'Geri gönder': 'Send back',
  'Yeniden aç': 'Reopen',

  // Step window: approval
  'Bu iş onayınızı bekliyor.': 'This job is waiting for your approval.',
  'Onay bekleniyor.': 'Waiting for approval.',
  'Teslim edildi: {time}': 'Handed in: {time}',
  'Geri gönderildi': 'Sent back',
  'Neden geri gönderiyorsunuz?': 'Why are you sending it back?',
  'İşi yapan kişi bu notu görür. Örnek: neyin yeniden yapılması gerekiyor.':
    'The person doing the job sees this note. Example: what needs to be redone.',
  'Gönderiliyor…': 'Sending…',

  // Step window: report a problem
  'Sorun nedir?': 'What is the problem?',
  'Sorun türü': 'Problem type',
  'Eksik malzeme': 'Missing material',
  'Satın alma ve bölüm sorumluları görür.': 'Purchasing and department heads see this.',
  'Örnek: 2 inç küresel vana': 'Example: 2-inch ball valve',
  Miktar: 'Quantity',
  'Örnek: 4 adet': 'Example: 4 pieces',
  'Not (isteğe bağlı)': 'Note (optional)',
  'Tasarım görür. Örnek: hangi ölçü yanlış.': 'Design sees this. Example: which measurement is wrong.',
  'Örnek: hangi makine, ne oldu.': 'Example: which machine, what happened.',
  'Sorunu bildir': 'Report problem',
  'Bildiriliyor…': 'Reporting…',

  // Step window: people and files
  'Atanan kişiler': 'Assigned people',
  'Henüz kimse atanmadı.': 'Nobody assigned yet.',
  'Bir adıma birden fazla kişi atayabilirsiniz.': 'You can assign more than one person to a step.',
  'Önerilen: {uzmanlik}': 'Suggested: {uzmanlik}',
  Diğerleri: 'Others',
  Dosyalar: 'Files',
  'Dosya ekle': 'Add file',
  'Bu adımda dosya yok. Fotoğraf veya küçük belgeler ekleyebilirsiniz.':
    'No files on this step. You can add photos or small documents.',

  // Step window: managing the step
  'Yukarı taşı': 'Move up',
  'Aşağı taşı': 'Move down',
  'Adımı kaldır': 'Remove step',
  'Bu adım projeden kaldırılacak. Geri alınamaz.': 'This step will be removed from the project. This cannot be undone.',
  'Evet, adımı kaldır': 'Yes, remove the step',
  Vazgeç: 'Cancel',

  // İşlerim
  İşlerim: 'My jobs',
  'Size atanmış bir iş yok.': 'No jobs assigned to you.',
  'Sorun bildirilenler': 'Problems reported',
  'Devam eden': 'In progress',
  Bekleyen: 'Waiting',
  'Onay bekleyen': 'Awaiting approval',
  'Son bitenler': 'Recently finished',
  'Bitiş: {date}': 'Due: {date}',

  // Talepler
  'Malzeme eksik: {material}': 'Missing material: {material}',
  '{name} bildirdi': 'Reported by {name}',
  Bildirildi: 'Reported',
  'Sipariş verildi: {time}': 'Ordered: {time}',
  'Ben ilgileniyorum': "I'm on it",
  '{name} ilgileniyor': '{name} is on it',
  'Siz ilgileniyorsunuz': "You're on it",
  'Henüz kimse ilgilenmiyor': 'Nobody is on it yet',

  // Dosyalar
  '{name} indir': 'Download {name}',
  '{name} sil': 'Delete {name}',
  Sil: 'Delete',
  '{name} silinsin mi?': 'Delete {name}?',
  'Eski sürümlere taşınır; Genel Müdür, IT, Bölüm Sorumluları ve Tasarım açabilir.':
    'It moves to Old versions; the General Manager, IT, Department Heads and Design can open it.',
  'Eski sürümler ({n})': 'Old versions ({n})',
  'Yenisi geldi {time}': 'Replaced {time}',
  'Silindi {time}': 'Deleted {time}',
  'Yükleniyor…': 'Uploading…',
  'Yükleniyor {i} / {total}…': 'Uploading {i} of {total}…',
  'Bitti|zaman': 'Finished',
}
