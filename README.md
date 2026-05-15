# Claude Token Hesaplayıcı

Gerçek zamanlı BPE tabanlı token tahmini yapan, Claude plan limitlerini gösteren ve Enter engelleyici içeren istemci taraflı bir web uygulaması.

---

## 🚀 Hızlı Başlangıç

```bash
# Herhangi bir HTTP sunucusuyla çalıştır
npx serve .
# veya
python3 -m http.server 3000
# veya VS Code Live Server eklentisi
```

Tarayıcıda `http://localhost:3000` adresini aç.

> ⚠️ `file://` protokolüyle açmak yerine mutlaka bir HTTP sunucusu kullan (Google Fonts yüklemesi için gerekli).

---

## 📁 Dosya Yapısı

```
claude-token-calc/
├── index.html     ← Ana HTML şablonu
├── styles.css     ← Tüm stiller (CSS değişkenleri, responsive)
├── tokenizer.js   ← BPE yaklaşık tokenizasyon motoru
├── plans.js       ← Plan & model verileri (fiyat, limit, renk)
├── app.js         ← Uygulama mantığı (state, UI, analiz)
└── README.md      ← Bu dosya
```

---

## ✨ Özellikler

| Özellik | Detay |
|---|---|
| **Gerçek zamanlı sayaç** | Yazarken karakter, kelime, anlık token |
| **Enter engelleme** | 2.2s debounce — analiz bitene kadar Enter askıya alınır |
| **BPE tokenizasyon** | Türkçe ~3.2 k/t · İngilizce ~3.8 k/t · Kod ~3.0 k/t |
| **Plan karşılaştırma** | Free / Pro / Max 5× / Max 20× / API |
| **Maliyet tahmini** | Giriş + tahmini çıkış tokeni bazında USD |
| **Context bar** | 200K penceresindeki yüzde doluluk |
| **Manuel bütçe** | Kalan token miktarını kendin girebilirsin |

---

## ⚠️ Kalan Token Bakiyesi Hakkında

**Anthropic, `claude.ai` oturumları için kalan token/kullanım bakiyesini program aracılığıyla erişilebilir bir API ile sunmamaktadır.**

Araştırma sonucu (Mayıs 2026):
- `claude.ai/settings/usage` sayfası bakiye gösterir ama programatik erişim yok
- Anthropic Admin API (`/v1/organizations/usage_report/messages`) yalnızca API kullanımını raporlar; `claude.ai` web oturumlarını kapsamaz
- Claude Code CLI'de `/usage` komutu var ama bu da API planı içindir

**Alternatif çözümler:**
1. **Manuel giriş** — Bu uygulamadaki "Manuel gir" alanını kullan
2. **Settings → Usage** — `https://claude.ai/settings/usage` sayfasını kontrol et
3. **API planı** — `console.anthropic.com` Admin API ile organizasyon bazlı token raporu al
4. **Claude Code** — `~/.claude/projects/` JSONL dosyaları okunabilir (ccusage, claude-usage-monitor)

---

## 🔧 Geliştirme

### Yeni Model Ekle

`plans.js` içindeki `models` nesnesine ekle:

```js
yeniModel: {
  key: 'yeniModel',
  name: 'Claude X.X',
  apiName: 'claude-x-x-YYYYMMDD',
  inputPer1M:  3.00,
  outputPer1M: 15.00,
  contextWindow: 200_000,
  color: '#FF5733',
  desc: 'Açıklama',
},
```

`index.html`'e de bir buton ekle:

```html
<button class="model-btn" onclick="selectModel('yeniModel')" id="btn-yeniModel">X.X</button>
```

### Plan Limitlerini Güncelle

`plans.js` → `list` dizisini düzenle. Tüm plan verileri buradan okunur.

### Analiz Gecikmesini Değiştir

`app.js`:
```js
const ANALYZE_DELAY_MS = 2_200; // ms cinsinden
```

### Tokenizasyon Oranlarını Ayarla

`tokenizer.js` → `estimate()` fonksiyonu içindeki `charsPerToken` değerleri:

```js
const charsPerToken = type === 'turkish' ? 3.2
                    : type === 'code'    ? 3.0
                    : type === 'mixed'   ? 3.5
                    :                     3.9; // english
```

---

## 📊 Token Tahmini Hassasiyeti

| İçerik Tipi | Yaklaşım | Gerçek Tiktoken |
|---|---|---|
| Türkçe metin | ~3.2 kar/tok | ~3.0-3.5 |
| İngilizce metin | ~3.9 kar/tok | ~3.8-4.2 |
| Kod (Python/JS) | ~3.0 kar/tok | ~2.8-3.2 |
| URL | ~5 kar/tok | değişken |

Kesin sayım için: `https://platform.claude.com/docs/en/build-with-claude/token-counting`

---

## 📋 Plan Bilgileri (Mayıs 2026)

| Plan | Fiyat | Context | Mesaj/5s |
|---|---|---|---|
| Free | $0 | 200K | ~40/gün |
| Pro | $20/ay | 200K | ~45/5s |
| Max 5× | $100/ay | 200K | ~225/5s |
| Max 20× | $200/ay | 200K | ~900/5s |
| API | Pay-as-go | 200K | Rate limit |

Mesaj sayıları kısa mesajlar içindir. Uzun prompt/cevaplarda düşer.

Güncel bilgi: `https://claude.ai/pricing` · `https://support.claude.com`

---

## 🌐 Yayına Alma

### GitHub Pages (önerilen)
```bash
git init
git add .
git commit -m "init"
gh repo create claude-token-calc --public
git push origin main
# Settings → Pages → main branch
```

### Vercel
```bash
npx vercel --prod
```

### Netlify
`dist/` klasörü yoksa direkt bu klasörü sürükle-bırak.

---

## Lisans

MIT
