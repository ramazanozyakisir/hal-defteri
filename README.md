# Hal Defteri

Toptan sebze-meyve hallerindeki komisyoncular için çevrimdışı çalışabilen ve güvenilir eşitleme sağlayan sipariş, stok ve cari hesap yönetim sistemi (Web + Mobil, PWA).

Bitirme projesi — Ramazan Özyakışır (Danışman: Ahmet Sertol Köksal)

## Teknolojiler

- React + Vite + TypeScript, PWA (vite-plugin-pwa)
- Cloud Firestore (kalıcı yerel önbellek ile çevrimdışı çalışma)
- Firebase Emulator Suite (yerel geliştirme ve test)
- Playwright (çok cihaz / bağlantı kesintisi testleri)

## Kurulum

Gerekenler: **Node.js 20+** ve **Java 21 (JDK)** (Firestore emülatörü için).

```bash
npm install
npx playwright install chromium
```

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Uygulamayı geliştirme modunda açar |
| `npm run build` | Üretim derlemesi |
| `npm run emulator` | Firestore emülatörünü başlatır |
| `npm run deney` | Firestore ön deneylerini (D1–D5) çalıştırır, sonucu `deney/sonuclar.json` dosyasına yazar |

## Firestore ön deneyleri

| Deney | Soru |
| --- | --- |
| D1 | Güvenlik kuralının reddettiği çevrimdışı yazma yerel önbellekten geri alınır mı? |
| D2 | Aynı kimliğe yeniden yazma (onay kaybı sonrası) yalnızca-oluşturma kuralına takılır mı? İçerik eşitliği kuralı bunu çözer mi? |
| D3 | 500 çevrimdışı hareket bağlantı gelince kayıpsız ve ne kadar sürede eşitlenir? |
| D4 | Aynı uygulama iki sekmede açıkken çevrimdışı önbellek tutarlı mı? |
| D5 | Çevrimdışıyken uygulama kapanırsa bekleyen yazma yeniden açılışta gönderilir mi? |

Güvenlik kuralı taslağı: `firestore.rules`.
