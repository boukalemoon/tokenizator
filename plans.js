/**
 * plans.js
 * ─────────────────────────────────────────────────────────────
 * Claude plan ve model verileri.
 *
 * Son güncelleme: Mayıs 2026
 * Kaynak: https://claude.ai/pricing · https://support.claude.com
 * https://anthropic.com/api
 *
 * ÖNEMLİ UYARI:
 * Claude.ai (Pro/Max/Team) için "kalan token bakiyesi" bilgisine
 * program aracılığıyla erişim MÜMKÜN DEĞİLDİR.
 * Anthropic bu veriyi public bir API ile sunmamaktadır.
 *
 * Bakiye takibi için:  https://claude.ai/settings/usage
 * API kullanımı için:  https://console.anthropic.com  (Admin API Key)
 * ─────────────────────────────────────────────────────────────
 */

const Plans = {

  // ─── PLAN TANIM TABLOSU ──────────────────────────────────
  list: [
    {
      key: 'free',
      name: 'Free',
      price: 0,
      priceLabel: '$0',
      priceUnit: '/ay',
      color: '#7a95b0',
      contextWindow: 200_000,
      // Mesaj limitleri kısa mesajlar içindir; uzun mesajlarda düşer
      messagesPerWindow: '~40',    // 5 saatlik pencere veya günlük
      windowHours: null,           // Günlük reset
      models: ['Sonnet'],
      features: ['Temel kullanım', 'Günlük limit', 'claude.ai erişimi'],
      note: 'Günlük reset',
    },
    {
      key: 'pro',
      name: 'Pro',
      price: 20,
      priceLabel: '$20',
      priceUnit: '/ay',
      color: '#e8623a',
      contextWindow: 200_000,
      messagesPerWindow: '~45',    // 5 saatlik pencerede
      windowHours: 5,
      models: ['Haiku', 'Sonnet', 'Opus'],
      features: ['5x Free kullanım', 'Öncelikli erişim', 'Projects & Memory', 'Web search'],
      note: '5s pencere reset',
    },
    {
      key: 'max5x',
      name: 'Max 5×',
      price: 100,
      priceLabel: '$100',
      priceUnit: '/ay',
      color: '#4a9ef5',
      contextWindow: 200_000,
      messagesPerWindow: '~225',   // Pro'nun 5x'i
      windowHours: 5,
      models: ['Haiku', 'Sonnet', 'Opus', 'Öncelikli'],
      features: ['5x Pro kullanım', 'Claude Code dahil', 'Bağımsız Opus kotası'],
      note: '5s pencere reset',
    },
    {
      key: 'max20x',
      name: 'Max 20×',
      price: 200,
      priceLabel: '$200',
      priceUnit: '/ay',
      color: '#a78bfa',
      contextWindow: 200_000,
      messagesPerWindow: '~900',   // Pro'nun 20x'i
      windowHours: 5,
      models: ['Haiku', 'Sonnet', 'Opus', 'Öncelikli + Hızlı'],
      features: ['20x Pro kullanım', 'Claude Code dahil', 'Ajansal iş akışları'],
      note: '5s pencere reset',
    },
    {
      key: 'api',
      name: 'API',
      price: null,
      priceLabel: 'Pay-as-go',
      priceUnit: '',
      color: '#3de89a',
      contextWindow: 200_000,   // Bazı modellerde 1M (özel)
      messagesPerWindow: '∞',  // Sadece oran limitli
      windowHours: null,
      models: ['Haiku', 'Sonnet', 'Opus'],
      features: ['Token başına ödeme', 'Admin API', 'Kullanım raporlama'],
      note: 'Rate limit bazlı',
    },
  ],

  // ─── MODEL TANIM TABLOSU ─────────────────────────────────
  // Fiyat: USD / 1M token
  // Kaynak: https://anthropic.com/pricing (Mayıs 2026)
  models: {
    haiku: {
      key: 'haiku',
      name: 'Claude Haiku 4.5',
      apiName: 'claude-haiku-4-5-20251001',
      inputPer1M:  0.80,
      outputPer1M: 4.00,
      contextWindow: 200_000,
      color: '#3de89a',
      desc: 'Hızlı, ekonomik',
    },
    sonnet: {
      key: 'sonnet',
      name: 'Claude Sonnet 4.6',
      apiName: 'claude-sonnet-4-6',
      inputPer1M:  3.00,
      outputPer1M: 15.00,
      contextWindow: 200_000,
      color: '#e8623a',
      desc: 'Dengeli performans',
    },
    opus: {
      key: 'opus',
      name: 'Claude Opus 4.6',
      apiName: 'claude-opus-4-6',
      inputPer1M:  15.00,
      outputPer1M: 75.00,
      contextWindow: 200_000,
      color: '#4a9ef5',
      desc: 'En güçlü model',
    },
  },

  // ─── YARDIMCILAR ────────────────────────────────────────
  getModel(key) {
    return this.models[key] || this.models.sonnet;
  },

  getPlan(key) {
    return this.list.find(p => p.key === key);
  },

  calcCost(inputTokens, outputTokens = 0, modelKey = 'sonnet') {
    const m = this.getModel(modelKey);
    return (inputTokens / 1_000_000) * m.inputPer1M
         + (outputTokens / 1_000_000) * m.outputPer1M;
  },
};
