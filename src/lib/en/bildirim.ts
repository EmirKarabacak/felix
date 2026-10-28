import type { Dictionary } from '../en'

/** The bell, the "allow alerts" card and Ayarlar > Bildirimler (Update 3). */
export const bildirim: Dictionary = {
  Bildirimler: 'Notifications',
  'Bildirimler ({n} okunmamış)': 'Notifications ({n} unread)',
  'Son 30 gün': 'Last 30 days',
  'Tümünü okundu say': 'Mark all as read',
  Okunmamış: 'Unread',
  'Henüz bildirim yok. Size iş verildiğinde veya onayınız gerektiğinde burada görünür.':
    'No notifications yet. They appear here when you are given a job or your approval is needed.',
  'Yeni işlerden haberdar olmak için bildirimlere izin verin.': 'Allow notifications to hear about new jobs.',
  'Şimdi değil': 'Not now',
  'İzin ver': 'Allow',
  'Telefon bildirimleri': 'Phone notifications',
  "Bu cihaz telefon bildirimi alamıyor. iPhone'da Felix'i ana ekrana ekleyip oradan açın.":
    'This device cannot receive phone notifications. On iPhone, add Felix to the home screen and open it from there.',
  'Bu cihazda bildirimlere izin verilmemiş. Telefonun ayarlarından Felix için bildirimlere izin verin.':
    "Notifications are not allowed on this device. Allow them for Felix in the phone's settings.",
  'Yeni iş, onay bekleyen iş, sorun ve taleplerden telefonunuza haber gelir.':
    'Your phone tells you about new jobs, jobs awaiting approval, problems and requests.',

  // Database messages (0010)
  'Bu cihazın bildirim adresi geçersiz.': "This device's notification address is not valid.",
}
