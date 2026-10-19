import type { Dictionary } from '../en'

export const ayarlar: Dictionary = {
  // Shared list buttons (EditableList)
  Kaydet: 'Save',
  Sil: 'Delete',
  Vazgeç: 'Cancel',
  Oluştur: 'Create',
  'Adını değiştir': 'Rename',
  '{name} silinsin mi?': 'Delete {name}?',

  // Ekip
  Ekip: 'Team',
  'Kişi eklemek veya düzenlemek için dokunun.': 'Tap a person to add or edit them.',
  'Kişi eklemeyi ve silmeyi Genel Müdür ve IT yapar.': 'The General Manager and IT add and remove people.',
  'Kişi ekle': 'Add person',
  Kişiler: 'People',
  Sorumlu: 'Head',
  'Uzmanlık seviyeleri yalnızca Genel Müdür, IT ve Bölüm Sorumlularına görünür.':
    'Specialty levels are visible only to the General Manager, IT and Department Heads.',
  Rol: 'Role',
  Bölüm: 'Department',
  'Sorumlu olduğu bölüm': 'Department they lead',
  'İmalat dışındaki Personelin bitirdiği iş her zaman onay bekler.':
    'Jobs finished by Staff outside Production always wait for approval.',
  Seçilmedi: 'Not chosen',
  Uzmanlıklar: 'Specialties',
  "Uzmanlık listesi boş. Ayarlar'daki Uzmanlıklar'dan ekleyin.": 'The specialty list is empty. Add some under Settings > Specialties.',
  '{name} seviyesi': '{name} level',
  'Seviyeleri yalnızca Genel Müdür, IT ve Bölüm Sorumluları görür.': 'Only the General Manager, IT and Department Heads see the levels.',
  'Ad soyad': 'Full name',
  'Kullanıcı adı': 'Username',
  'Kişi bu adla giriş yapar.': 'The person signs in with this name.',
  'İlk şifre': 'First password',
  'En az {n} karakter. Kişi sonra kendisi değiştirebilir.': 'At least {n} characters. They can change it later.',
  'Kullanıcı adı en az 3 karakter olmalı.': 'Username must be at least 3 characters.',
  'Kişiyi ekle': 'Add person',
  'Ekleniyor…': 'Adding…',
  'Değiştirirseniz kişi yeni adla giriş yapar; şifresi aynı kalır.':
    'If you change it, they sign in with the new name; the password stays the same.',
  'Yeni şifre ver': 'Set a new password',
  'Kişi şifresini unuttuysa buraya yenisini yazın. Değiştirmek istemiyorsanız boş bırakın.':
    'If they forgot their password, type a new one here. Leave it empty to keep it.',
  'Kaydediliyor…': 'Saving…',
  'Kişiyi çıkar': 'Remove person',
  '{name} artık giriş yapamayacak. Geçmiş işlerde adı görünmeye devam eder.':
    '{name} will no longer be able to sign in. Their name stays on past work.',
  'Evet, kişiyi çıkar': 'Yes, remove the person',

  // Ayarlar
  Ayarlar: 'Settings',
  Hesabım: 'My account',
  Listeler: 'Lists',
  Firmalar: 'Companies',
  'Sipariş veren firmalar ve iletişim bilgileri': 'Companies that place orders, and contact details',
  Türler: 'Types',
  'Proje ve adım türleri': 'Project and step types',
  'İmalattaki uzmanlıklar: Kaynakçı, Elektrikçi…': 'Specialties in Production: Welder, Electrician…',
  'Beni hatırla': 'Remember me',
  'Kapalıysa tarayıcı kapanınca oturum kapanır. Ortak telefonda kapatın.':
    'If off, you are signed out when the browser closes. Turn it off on a shared phone.',
  'Yeni şifre': 'New password',
  'En az {n} karakter.': 'At least {n} characters.',
  'Şifremi değiştir': 'Change my password',
  'Şifreniz değiştirildi.': 'Your password was changed.',
  'Ana ekrana ekle': 'Add to Home screen',
  "Felix'i ana ekrana ekle": 'Add Felix to your home screen',
  "Felix'i Safari'de açın, alttaki paylaş düğmesine (yukarı ok olan kare) dokunun, ardından {button}'yi seçin.":
    'Open Felix in Safari, tap the share button at the bottom (the square with an up arrow), then choose {button}.',
  'Ana Ekrana Ekle': 'Add to Home Screen',
  "Felix'i Chrome'da açın, sağ üstteki üç noktaya dokunun, ardından {button}'yi seçin.":
    'Open Felix in Chrome, tap the three dots at the top right, then choose {button}.',
  'Çıkış yap': 'Sign out',

  // Firmalar
  'Sipariş veren firmalar. İletişim bilgilerini yalnızca Genel Müdür, IT ve Bölüm Sorumluları görür.':
    'Companies that place orders. Only the General Manager, IT and Department Heads see contact details.',
  'Yeni firma': 'New company',
  'Firma veya kişi ara': 'Search companies or people',
  'Henüz firma yok. "Yeni firma" ile ilk firmayı ekleyin.': 'No companies yet. Add the first one with "New company".',
  'Aramanıza uyan firma yok.': 'No company matches your search.',
  'İletişim bilgisi yok': 'No contact details',
  '{n} proje': { one: '1 project', other: '{n} projects' },
  'Firma adı': 'Company name',
  'Yetkili kişi': 'Contact person',
  'Bu firmada görüştüğünüz kişi.': 'The person you deal with at this company.',
  Telefon: 'Phone',
  'E-posta': 'Email',
  Adres: 'Address',
  Not: 'Note',
  'Firmayı ekle': 'Add company',
  'Bu firmanın projeleri': "This company's projects",
  '"{name}" silinecek. {n} projesi yerinde kalır ama firmasız görünür.': {
    one: '"{name}" will be deleted. Its project stays, but without a company.',
    other: '"{name}" will be deleted. Its {n} projects stay, but without a company.',
  },
  '"{name}" silinecek.': '"{name}" will be deleted.',
  'Evet, firmayı sil': 'Yes, delete the company',
  'Firmayı sil': 'Delete company',

  // Türler
  'Yeni proje açarken kullanılan hazır listeler. Değişiklikler mevcut projeleri etkilemez.':
    "Ready-made lists used when opening a new project. Changes don't affect existing projects.",
  'Proje türleri': 'Project types',
  'Adım türleri': 'Step types',
  'Henüz adım türü yok.': 'No step types yet.',
  'Adım türü adı': 'Step type name',
  'Yeni adım türü': 'New step type',
  '{name} adım türü sil': 'Delete step type {name}',
  'Örnek: Membran yükleme': 'Example: Membrane loading',
  '{n} proje türünde': { one: 'In 1 project type', other: 'In {n} project types' },
  '{name}: {n} proje türünden de çıkarılır.': {
    one: '{name}: it will also be removed from 1 project type.',
    other: '{name}: it will also be removed from {n} project types.',
  },
  '{name} uzmanlığı': 'Specialty for {name}',
  'Uzmanlık yok': 'No specialty',
  'Önerilen uzmanlık: adıma kişi atarken bu uzmanlıktaki kişiler üstte görünür. Uzmanlığı olmayan adımları Personel bitirince iş her zaman onay bekler.':
    'Suggested specialty: when assigning people to a step, people with this specialty appear first. When Staff finish a step with no specialty, it always waits for approval.',
  'Henüz proje türü yok.': 'No project types yet.',
  '{n} adım': { one: '1 step', other: '{n} steps' },
  'Yeni proje türü': 'New project type',
  'Örnek: Ultrafiltrasyon Ünitesi': 'Example: Ultrafiltration Unit',
  'Proje türü adı': 'Project type name',
  'Bu türdeki projelere otomatik eklenen adımlar': 'Steps added automatically to projects of this type',
  'Henüz adım yok. Aşağıdan ekleyin.': 'No steps yet. Add them below.',
  '{name} adımını yukarı taşı': 'Move {name} up',
  '{name} adımını aşağı taşı': 'Move {name} down',
  '{name} adımını türden çıkar': 'Remove {name} from the type',
  'Adım ekle': 'Add step',
  '"{name}" türü silinecek. Bu türle açılmış projeler olduğu gibi kalır.':
    'The type "{name}" will be deleted. Projects opened with this type stay as they are.',
  'Evet, türü sil': 'Yes, delete the type',
  'Bu türü sil': 'Delete this type',
  'Düzenlemek için bir proje türü seçin veya yeni bir tür oluşturun.': 'Choose a project type to edit, or create a new one.',

  // Uzmanlıklar
  "İmalattaki kişilerin uzmanlıkları. Kişinin uzmanlığını ve seviyesini Ekip'te seçin.":
    "Specialties of people in Production. Choose a person's specialty and level in Team.",
  'Uzmanlıklar için veritabanı güncellemesi gerekiyor: supabase/migrations klasöründeki 0008 dosyası henüz çalıştırılmamış.':
    'Specialties need a database update: file 0008 in the supabase/migrations folder has not been run yet.',
  'Henüz uzmanlık yok.': 'No specialties yet.',
  'Uzmanlık adı': 'Specialty name',
  'Yeni uzmanlık': 'New specialty',
  '{name} uzmanlık sil': 'Delete specialty {name}',
  'Örnek: Montajcı': 'Example: Fitter',
  '{n} kişi': { one: '1 person', other: '{n} people' },
  '{name}: {kisi} kişiden ve {tur} adım türünden kaldırılır.': '{name} will be removed from {kisi} people and {tur} step types.',
  '{name}: {n} kişiden kaldırılır.': {
    one: '{name}: it will be removed from 1 person.',
    other: '{name}: it will be removed from {n} people.',
  },
  '{name}: {n} adım türünden kaldırılır.': {
    one: '{name}: it will be removed from 1 step type.',
    other: '{name}: it will be removed from {n} step types.',
  },
  'Dil ve görünüm': 'Language and appearance',
  Dil: 'Language',
  Tema: 'Theme',
  Sistem: 'System',
  'Açık|tema': 'Light',
  Koyu: 'Dark',
}
