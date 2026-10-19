import type { Dictionary } from '../en'

export const genel: Dictionary = {
  // Roles
  'Genel Müdür': 'General Manager',
  IT: 'IT',
  'Bölüm Sorumlusu': 'Department Head',
  Personel: 'Staff',
  'Genel Müdür ve IT': 'General Manager and IT',

  // Bölümler (their names come from the database)
  İmalat: 'Production',
  'Satın alma': 'Purchasing',
  Tasarım: 'Design',
  Muhasebe: 'Accounting',
  'Bölüm seçilmedi': 'No department chosen',

  // Levels
  Usta: 'Master',
  Kalfa: 'Skilled',
  Çırak: 'Apprentice',
  'Onay kuralı: Bir adımı bitiren kişinin, o adımın uzmanlığındaki seviyesi geçerlidir. Kaynakta Usta olan biri kaynak adımını bitirince iş hemen biter. Aynı kişi elektrik adımını bitirirse ve elektrikte Çırak ise ya da hiç Elektrikçi uzmanlığı yoksa, iş onay bekler.':
    "Approval rule: what counts is the level, in the step's specialty, of the person who finishes it. A Master welder who finishes a welding step finishes the job at once. If the same person finishes an electrical step and is an Apprentice in electrical work, or has no Electrician specialty at all, the job waits for approval.",

  // Step statuses
  Bekliyor: 'Waiting',
  'Devam ediyor': 'In progress',
  'Onay bekliyor': 'Awaiting approval',
  Bitti: 'Done',
  'Sorun bildirildi': 'Problem reported',
  Gecikti: 'Overdue',

  // Problem reasons (stored in Turkish)
  'Malzeme eksik': 'Missing material',
  'Çizim hatalı': 'Drawing is wrong',
  'Makine arızası': 'Machine breakdown',
  'Başka bir sorun': 'Another problem',

  // Talep statuses
  Açık: 'Open',
  'Sipariş verildi': 'Ordered',
  Geldi: 'Arrived',
  Düzeltildi: 'Fixed',

  // Tabs and frame
  İşlerim: 'My jobs',
  Projeler: 'Projects',
  Ekip: 'Team',
  Ayarlar: 'Settings',
  Bölümler: 'Sections',
  Yükleniyor: 'Loading',
  Kapat: 'Close',
  Yenile: 'Reload',
  'Tekrar dene': 'Try again',
  'Bilinmeyen hata': 'Unknown error',
  'Ayrıntı: {detail}': 'Details: {detail}',
  'Bu ekran açılırken bir hata oluştu. Verileriniz güvende; sayfayı yenileyip tekrar deneyin.':
    'Something went wrong opening this screen. Your data is safe; reload the page and try again.',

  // Takvim
  'Zaman çizelgesi': 'Timeline',
  Proje: 'Project',
  Bugün: 'Today',
  'teslim tarihi yok': 'no due date',
  'Adım yok': 'No steps',
  '{done} / {total} adım': '{done} / {total} steps',
  '{done} / {total} adım bitti': '{done} / {total} steps done',
  'Çubuk, projenin açıldığı günden teslim tarihine uzanır; dolu kısmı biten adımları gösterir. Noktalar adımların bitiş tarihleri, dikey çizgi bugündür. Kesik uçlu çubukların teslim tarihi yoktur.':
    "Each bar runs from the day the project was opened to its due date; the filled part shows the finished steps. Dots are the steps' due dates, and the vertical line is today. Bars with a cut-off end have no due date.",

  // Sign-in
  'Atölye iş takibi': 'Workshop job tracking',
  'Kullanıcı adı': 'Username',
  Şifre: 'Password',
  'Beni hatırla': 'Remember me',
  'Kapalıysa tarayıcı kapanınca çıkış yapılır.': 'If off, you are signed out when the browser closes.',
  'Giriş yap': 'Sign in',
  'Giriş yapılıyor…': 'Signing in…',
  "Hesabınız yok mu veya şifrenizi mi unuttunuz? Genel Müdür veya IT'ye söyleyin, hesapları onlar oluşturur.":
    'No account, or forgot your password? Ask the General Manager or IT; they create accounts.',
  "Bu hesap artık kullanılmıyor. Genel Müdür veya IT'ye söyleyin.":
    'This account is no longer in use. Tell the General Manager or IT.',
  'Bilgileriniz yüklenemedi. Bağlantınızı kontrol edip tekrar giriş yapın.':
    'Your details could not be loaded. Check your connection and sign in again.',

  // First setup
  "Felix'i kur": 'Set up Felix',
  'İlk hesap Genel Müdür hesabıdır. Diğer herkesi bu hesapla eklersiniz.':
    "The first account is the General Manager's. You add everyone else from it.",
  'Kurulum kodu': 'Setup code',
  'Yayın ayarlarında FELIX_SETUP_CODE olarak belirlediğiniz ifade.':
    'The phrase you set as FELIX_SETUP_CODE in the hosting settings.',
  'Ad soyad': 'Full name',
  'En az {n} karakter.': 'At least {n} characters.',
  'Kullanıcı adı en az 3 karakter olmalı.': 'Username must be at least 3 characters.',
  'Genel Müdür hesabını oluştur': 'Create the General Manager account',
  'Oluşturuluyor…': 'Creating…',

  // Setup problems (only seen while Felix is being set up)
  'Felix henüz veritabanına bağlanmadı. VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY ayarlarını ekleyip siteyi yeniden yayınlayın.':
    'Felix is not connected to its database yet. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY settings and publish the site again.',
  'Veritabanı henüz kurulmamış: supabase/migrations klasöründeki SQL, Supabase SQL Editor içinde çalıştırılmamış.':
    "The database is not set up yet: the SQL in the supabase/migrations folder hasn't been run in the Supabase SQL Editor.",
  'Anahtar hatalı: Vercel ayarlarındaki VITE_SUPABASE_ANON_KEY, Supabase projesindeki anon (publishable) anahtarla aynı olmalı.':
    "Wrong key: VITE_SUPABASE_ANON_KEY in Vercel's settings must match the anon (publishable) key of the Supabase project.",
  'Veritabanı adresi hatalı: Vercel ayarlarındaki VITE_SUPABASE_URL yalnızca https://....supabase.co biçiminde olmalı.':
    "Wrong database address: VITE_SUPABASE_URL in Vercel's settings must be just https://....supabase.co.",
  'Veritabanına ulaşılamıyor: Vercel ayarlarındaki VITE_SUPABASE_URL hatalı olabilir ya da internet bağlantısı yok.':
    "Can't reach the database: VITE_SUPABASE_URL in Vercel's settings may be wrong, or there is no internet connection.",
  'Veritabanı beklenmeyen bir yanıt verdi.': 'The database gave an unexpected answer.',

  // Errors shown to people
  'Kullanıcı adı veya şifre hatalı.': 'Wrong username or password.',
  "Bu hesap kapatılmış. Genel Müdür veya IT'ye söyleyin.": 'This account is closed. Tell the General Manager or IT.',
  'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.': "Couldn't connect. Check your internet and try again.",
  'Bu adla bir bölüm zaten var.': 'A department with this name already exists.',
  'Bu adla bir uzmanlık zaten var.': 'A specialty with this name already exists.',
  'Bu adla bir adım türü zaten var.': 'A step type with this name already exists.',
  'Bu adla bir proje türü zaten var.': 'A project type with this name already exists.',
  'Bu adla bir firma zaten var.': 'A company with this name already exists.',
  'Bu proje kodu zaten kullanılıyor.': 'This project code is already in use.',
  'Dosya çok büyük. En fazla 50 MB yüklenebilir.': 'The file is too big. The limit is 50 MB.',
  'Veritabanı güncellemesi gerekiyor: supabase/migrations klasöründeki yeni SQL dosyası henüz çalıştırılmamış.':
    "A database update is needed: the new SQL file in the supabase/migrations folder hasn't been run yet.",
  'Bu işlem için yetkiniz yok.': "You don't have permission for this.",
  'Yeni şifre eskisinden farklı olmalı.': 'The new password must be different from the old one.',
  'Şifre çok kısa.': 'Password is too short.',
  'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.': 'Too many attempts. Wait a little and try again.',
  'Beklenmeyen bir hata oluştu. Tekrar deneyin.': 'Something unexpected went wrong. Try again.',
  'Sunucu hatası ({status}).': 'Server error ({status}).',

  // The server's messages (api/)
  'Sunucu ayarları eksik: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.':
    'Server settings are missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
  'Ad soyad gerekli.': 'Full name is required.',
  'Kullanıcı adı en az 3 karakter olmalı; harf, rakam, nokta, tire kullanılabilir.':
    'Username must be at least 3 characters; letters, numbers, dots and dashes are allowed.',
  'Şifre en az 6 karakter olmalı.': 'Password must be at least 6 characters.',
  'Bu kullanıcı adı zaten kullanılıyor.': 'This username is already taken.',
  'Hesap oluşturulamadı.': 'The account could not be created.',
  'Oturum bulunamadı. Yeniden giriş yapın.': 'Session not found. Sign in again.',
  'Oturum geçersiz. Yeniden giriş yapın.': 'Session is invalid. Sign in again.',
  'Bu işlemi yalnızca Genel Müdür veya IT yapabilir.': 'Only the General Manager or IT can do this.',
  'Yöntem desteklenmiyor.': 'Method not supported.',
  'Kurulum kodu sunucuda tanımlı değil (FELIX_SETUP_CODE).': 'The setup code is not set on the server (FELIX_SETUP_CODE).',
  'Kurulum kodu hatalı.': 'Wrong setup code.',
  'Kurulum zaten yapılmış. Giriş yapın.': 'Setup is already done. Sign in.',
  'Kişi seçilmedi.': 'No person chosen.',
  'Kişi bulunamadı.': 'Person not found.',
  'Değiştirilecek bir şey yok.': 'Nothing to change.',
  'Kendi hesabınızı çıkaramazsınız.': "You can't remove your own account.",
  'Beklenmeyen bir hata oluştu.': 'Something unexpected went wrong.',

  // The database's messages (supabase/migrations/)
  'Oturum bulunamadı.': 'Session not found.',
  'Adım bulunamadı.': 'Step not found.',
  'Adım türü bulunamadı.': 'Step type not found.',
  'Proje bulunamadı.': 'Project not found.',
  'Talep bulunamadı.': 'Request not found.',
  'Dosya bulunamadı.': 'File not found.',
  'Bu adım size atanmamış.': "This step isn't assigned to you.",
  // Shown in Turkish as "Bu adımın durumu değişmiş…" (TR_FIX in i18n.tsx).
  'Bu adım şu anda bu işleme uygun değil.': "This step's status has changed. Refresh the page and try again.",
  'Bu talep şu anda bu işleme uygun değil.': "This request can't do that right now.",
  'Sorunun ne olduğunu seçin.': 'Choose what the problem is.',
  'Hangi malzemenin eksik olduğunu yazın.': 'Write which material is missing.',
  'Neden geri gönderdiğinizi yazın.': "Write why you're sending it back.",
  'Bu değişikliği yalnızca Genel Müdür veya IT yapabilir.': 'Only the General Manager or IT can make this change.',
  'En az bir Genel Müdür kalmalı.': 'There must be at least one General Manager.',
  'En az bir IT kalmalı.': 'There must be at least one IT.',
  'Bu talebi yalnızca ilgili bölüm ve sorumlular yönetebilir.':
    'Only the relevant department and department heads can handle this request.',
  'Dosya adı boş olamaz.': "The file name can't be empty.",
  'Dosya yolu geçersiz.': 'The file path is invalid.',
  'Proje dosyalarını yalnızca Genel Müdür, IT, Bölüm Sorumluları ve Tasarım ekleyebilir.':
    'Only the General Manager, IT, Department Heads and Design can add project files.',
  'Dosyaları yalnızca Genel Müdür, IT, Bölüm Sorumluları ve Tasarım silebilir.':
    'Only the General Manager, IT, Department Heads and Design can delete files.',
  'İşi bitirmek için bir fotoğraf çekin.': 'Take a photo to finish the job.',
}
