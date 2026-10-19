import { t } from './i18n'

// Turns technical errors into something a person in the workshop can act on.
// A function, so the texts are read in the language chosen at the time.
const known = (): [RegExp, string][] => [
  [/invalid login credentials/i, t('Kullanıcı adı veya şifre hatalı.')],
  [/user is banned/i, t("Bu hesap kapatılmış. Genel Müdür veya IT'ye söyleyin.")],
  [/failed to fetch|networkerror|load failed/i, t('Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.')],
  [/duplicate key.*bolumler_name/i, t('Bu adla bir bölüm zaten var.')],
  [/duplicate key.*uzmanliklar_name/i, t('Bu adla bir uzmanlık zaten var.')],
  [/payload too large|exceeded the maximum allowed size|entity too large/i, t('Dosya çok büyük. En fazla 50 MB yüklenebilir.')],
  [/bucket not found/i, t('Veritabanı güncellemesi gerekiyor: supabase/migrations klasöründeki yeni SQL dosyası henüz çalıştırılmamış.')],
  [/duplicate key.*step_types_name/i, t('Bu adla bir adım türü zaten var.')],
  [/duplicate key.*project_types_name/i, t('Bu adla bir proje türü zaten var.')],
  [/duplicate key.*projects_code/i, t('Bu proje kodu zaten kullanılıyor.')],
  [/duplicate key.*companies_name/i, t('Bu adla bir firma zaten var.')],
  [/could not find the (table|function)|schema cache|(relation|column) .* does not exist/i, t('Veritabanı güncellemesi gerekiyor: supabase/migrations klasöründeki yeni SQL dosyası henüz çalıştırılmamış.')],
  [/row-level security|permission denied/i, t('Bu işlem için yetkiniz yok.')],
  [/should be different from the old password/i, t('Yeni şifre eskisinden farklı olmalı.')],
  [/password should be at least/i, t('Şifre çok kısa.')],
  [/rate limit|too many requests/i, t('Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.')],
]

export function friendly(error: unknown): string {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : ''
  for (const [pattern, text] of known()) if (pattern.test(message)) return text
  // The server's and the database's own messages are Turkish; t() gives their English.
  return message ? t(message) : t('Beklenmeyen bir hata oluştu. Tekrar deneyin.')
}
