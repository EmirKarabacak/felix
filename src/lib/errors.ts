// Turns technical errors into something a person in the workshop can act on.
const KNOWN: [RegExp, string][] = [
  [/invalid login credentials/i, 'Kullanıcı adı veya şifre hatalı.'],
  [/user is banned/i, 'Bu hesap kapatılmış. Yöneticinize söyleyin.'],
  [/failed to fetch|networkerror|load failed/i, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.'],
  [/duplicate key.*meslek_turleri_name/i, 'Bu adla bir meslek türü zaten var.'],
  [/duplicate key.*step_types_name/i, 'Bu adla bir adım türü zaten var.'],
  [/duplicate key.*project_types_name/i, 'Bu adla bir proje türü zaten var.'],
  [/duplicate key.*projects_code/i, 'Bu proje kodu zaten kullanılıyor.'],
  [/could not find the (table|function)|schema cache|relation .* does not exist/i, 'Veritabanı güncellemesi gerekiyor: supabase/migrations klasöründeki yeni SQL dosyası henüz çalıştırılmamış.'],
  [/row-level security|permission denied/i, 'Bu işlem için yetkiniz yok.'],
  [/should be different from the old password/i, 'Yeni şifre eskisinden farklı olmalı.'],
  [/password should be at least/i, 'Şifre çok kısa.'],
  [/rate limit|too many requests/i, 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.'],
]

export function friendly(error: unknown): string {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : ''
  for (const [pattern, text] of KNOWN) if (pattern.test(message)) return text
  return message || 'Beklenmeyen bir hata oluştu. Tekrar deneyin.'
}
