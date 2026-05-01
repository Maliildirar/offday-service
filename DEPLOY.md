# Railway Deploy Talimatı

## 1. Railway hesabı aç
https://railway.app → "Start a New Project" → GitHub ile giriş yap

## 2. Yeni proje oluştur
- "Deploy from GitHub repo" seç
- Bu `offday-service` klasörünü bir GitHub reposuna push et
- Veya: "Deploy from local directory" (Railway CLI ile)

### Railway CLI ile deploy (en hızlı yol):
```
npm install -g @railway/cli
railway login
railway init
railway up
```

## 3. Environment variable ekle
Railway dashboard → Projen → Variables:
```
API_KEY = <Uygulamada Ayarlar > Sync ekranında ürettiğiniz key>
```

## 4. Servis URL'ini al
Railway → Projen → Settings → Domains → "Generate Domain"
Örnek: https://offday-service-production-xxxx.up.railway.app

## 5. Uygulamaya bağla
Yoklama Takip uygulaması → Ayarlar → Uzak Off-Day Sync:
- Servis URL: (Railway'den aldığınız URL)
- API Key: (ürettiğiniz key)
- "Kaydet" butonuna bas → üye listesi otomatik gönderilir

## Üyelere paylaşın
Servis URL'ini (API key olmadan) doğrudan üyelere gönderin.
Örnek: https://offday-service-production-xxxx.up.railway.app
