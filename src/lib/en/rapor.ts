import type { Dictionary } from '../en'

/** The project report, delivery, customer codes and the customer's page (Update 4). */
export const rapor: Dictionary = {
  // The report
  'Proje raporu': 'Project report',
  'İç rapor': 'Internal report',
  'Müşteri raporu': 'Customer report',
  Rapor: 'Report',
  'PDF olarak kaydet': 'Save as PDF',
  Açıldı: 'Opened',
  'Planlanan teslim': 'Planned delivery',
  'Bütün adımlar bitti': 'All steps done',
  'Teslim edildi': 'Delivered',
  'Henüz teslim edilmedi': 'Not delivered yet',
  'Teslim durumu': 'Delivery',
  Adım: 'Steps',
  'Toplam çalışma': 'Total work time',
  'Geri gönderme': 'Sent back',
  Sorun: 'Problems',
  'Başladı: {time}': 'Started: {time}',
  Bitmedi: 'Not finished',
  'Onaylayan: {name}': 'Approved by {name}',
  'Geri gönderen: {name}': 'Sent back by {name}',
  'Not: {text}': 'Note: {text}',
  'Sayfa {page} / {total}': 'Page {page} of {total}',
  'PDF hazırlanıyor…': 'Preparing PDF…',
  'Rapor önizlemesi': 'Report preview',
  'Çalışma: {time}': 'Work: {time}',
  'Sorun beklemesi: {time}': 'Waiting on a problem: {time}',
  'Onay beklemesi: {time}': 'Waiting for approval: {time}',
  '{n} kez geri gönderildi': { one: 'Sent back once', other: 'Sent back {n} times' },
  'Sorun: {text}': 'Problem: {text}',
  Kişi: 'Person',
  Çalışma: 'Work',
  'Bildirdiği sorun': 'Problems reported',
  'Açıldı: {time}': 'Opened: {time}',
  '{status}: {time}': '{status}: {time}',
  'Bekleme: {time}': 'Waited: {time}',
  'Bitiş fotoğrafları': 'Finish photos',
  'Süreler takvim süresidir; geceler ve hafta sonları dahildir. Sorun ve onay beklemeleri çalışmaya sayılmaz. Bir adıma atanan herkes o adımı yapmış sayılır.':
    'Times are calendar time, nights and weekends included. Waiting on a problem or for approval does not count as work. Everyone assigned to a step counts as having done it.',
  'Rapor tarihi: {date}': 'Report date: {date}',
  Tamamlandı: 'Completed',
  'Yapılan işler': 'Work done',
  Fotoğraflar: 'Photos',
  Belgeler: 'Documents',
  '1 dakikadan az': 'Under a minute',
  '{m} dk': '{m} min',
  '{h} sa {m} dk': '{h} h {m} min',
  '{h} sa': '{h} h',
  '{d} gün {h} sa': '{d} d {h} h',
  '{d} gün': '{d} d',
  '{n} gün geç': { one: '{n} day late', other: '{n} days late' },
  '{n} gün erken': { one: '{n} day early', other: '{n} days early' },
  Zamanında: 'On time',

  // Choosing what the customer sees
  'Müşteriye gösterilecekler': 'What the customer sees',
  'Müşteri bu kodu giriş sayfasındaki "Proje raporu sorgula" bölümüne yazar. Aşağıda işaretlediğiniz fotoğraf ve belgeleri görür; kişi adlarını görmez.':
    'The customer types this code under "Look up a project report" on the sign-in page. They see the photos and documents you tick below, and no names.',
  'Bütün adımlar bitince müşteri raporu hazır olur. O zamana kadar müşteri "Projeniz hazırlanıyor" yazısını görür.':
    'The customer report is ready once every step is done. Until then the customer sees "Your project is being prepared".',
  'Bu projede henüz fotoğraf veya belge yok.': 'This project has no photos or documents yet.',
  'Müşteriye göster': 'Show to the customer',
  'Proje dosyası': 'Project file',

  // The project page: delivery and the customer code
  'Teslim edildi {date}': 'Delivered {date}',
  Teslim: 'Delivery',
  'Teslim edildi: {date}': 'Delivered: {date}',
  'Bütün adımlar bitti.': 'All steps are done.',
  'Proje raporu hazır.': 'The project report is ready.',
  'Proje raporu hazır. Ürün fabrikadan çıktığı gün "Projeyi teslim et" deyin.':
    'The project report is ready. Press "Deliver project" on the day the product leaves the factory.',
  'Teslimi geri al': 'Undo delivery',
  'Projeyi teslim et': 'Deliver project',
  'Teslim bekliyor': 'Awaiting delivery',
  'Müşteri kodu': 'Customer code',
  'Yeni kod': 'New code',
  'Eski kod çalışmaz olur. Müşteriye yeni kodu göndermeniz gerekir.':
    'The old code will stop working. You will need to send the customer the new code.',
  'Yeni kod oluştur': 'Make a new code',
  'Müşteri bu kodla, giriş sayfasındaki "Proje raporu sorgula" bölümünden projesinin raporunu görür.':
    'With this code the customer sees the project report under "Look up a project report" on the sign-in page.',
  Kopyala: 'Copy',
  Kopyalandı: 'Copied',

  // The customer's page
  'Proje raporu sorgula': 'Look up a project report',
  'Başka bir kod gir': 'Enter another code',
  'Projeniz hazırlanıyor. Bütün işler bitince raporu burada görebilirsiniz.':
    'Your project is being prepared. You can see the report here once all the work is done.',
  'Size verilen kodu yazın. Örnek: AF-26-014-K7PX': 'Type the code you were given. Example: AF-26-014-K7PX',
  'Aranıyor…': 'Searching…',
  'Raporu göster': 'Show report',
  'Giriş sayfasına dön': 'Back to sign-in',

  // Server and database messages (api/rapor.ts, 0011)
  'Müşteri kodunu yazın.': 'Type the customer code.',
  'Proje raporları henüz kurulmadı.': 'Project reports are not set up yet.',
  'Bu kodla bir proje bulunamadı. Kodu kontrol edip tekrar deneyin.': 'No project has this code. Check the code and try again.',
  'Bu işlemi yalnızca Genel Müdür, IT veya Bölüm Sorumluları yapabilir.':
    'Only the General Manager, IT or Department Heads can do this.',
  'Proje teslim edilmeden önce bütün adımlar bitmeli.': 'Every step must be done before the project is delivered.',
}
