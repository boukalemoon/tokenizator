/**
 * plans.js
 * ─────────────────────────────────────────────────────────────
 * Claude plan ve model verileri.
 *
 * Son güncelleme: Haziran 2026
 * Kaynak: https://claude.ai/pricing · https://platform.claude.com/docs/en/about-claude/models/overview
 *
 * ÖNEMLİ UYARI:
 * Claude.ai (Pro/Max/Team) için "kalan token bakiyesi" bilgisine
 * program aracılığıyla erişim MÜMKÜN DEĞİLDİR.
 * Bakiye takibi için:  https://claude.ai/settings/usage
 * ─────────────────────────────────────────────────────────────
 */

const Plans = {

  // ─── PLAN TANIM TABLOSU ──────────────────────────────────
  // contextWindow: claude.ai oturumları için pratik pencere (~200K).
  // API'de Sonnet 4.6 / Opus 4.8 / Fable 5 → 1M context destekler.
  list: [
    {
      key: 'free',
      name: 'Free',
      priceLabel: '$0',
      priceUnit: '/ay',
      color: '#8a9bb0',
      contextWindow: 200_000,
      messagesPerWindow: '~40',
      windowHours: null,
      models: ['Sonnet'],
      note: 'Günlük reset',
    },
    {
      key: 'pro',
      name: 'Pro',
      priceLabel: '$20',
      priceUnit: '/ay',
      color: '#d97757',
      contextWindow: 200_000,
      messagesPerWindow: '~45',
      windowHours: 5,
      models: ['Haiku', 'Sonnet', 'Opus'],
      note: '5s pencere reset',
    },
    {
      key: 'max5x',
      name: 'Max 5×',
      priceLabel: '$100',
      priceUnit: '/ay',
      color: '#6ba6f5',
      contextWindow: 200_000,
      messagesPerWindow: '~225',
      windowHours: 5,
      models: ['Tüm modeller', 'Claude Code'],
      note: '5s pencere reset',
    },
    {
      key: 'max20x',
      name: 'Max 20×',
      priceLabel: '$200',
      priceUnit: '/ay',
      color: '#b69df7',
      contextWindow: 200_000,
      messagesPerWindow: '~900',
      windowHours: 5,
      models: ['Tüm modeller', 'Claude Code'],
      note: '5s pencere reset',
    },
    {
      key: 'api',
      name: 'API',
      priceLabel: 'Pay-as-go',
      priceUnit: 'token başına',
      color: '#4fd1a1',
      contextWindow: 1_000_000,
      messagesPerWindow: '∞',
      windowHours: null,
      models: ['Tüm modeller', '1M context'],
      note: 'Rate limit bazlı',
    },
  ],

  // ─── MODEL TANIM TABLOSU ─────────────────────────────────
  // Fiyat: USD / 1M token — Kaynak: platform.claude.com (Haziran 2026)
  models: {
    haiku: {
      key: 'haiku',
      name: 'Claude Haiku 4.5',
      apiName: 'claude-haiku-4-5',
      inputPer1M: 1.00,
      outputPer1M: 5.00,
      contextWindow: 200_000,
      maxOutput: 64_000,
      color: '#4fd1a1',
      desc: 'Hızlı, ekonomik',
    },
    sonnet: {
      key: 'sonnet',
      name: 'Claude Sonnet 4.6',
      apiName: 'claude-sonnet-4-6',
      inputPer1M: 3.00,
      outputPer1M: 15.00,
      contextWindow: 1_000_000,
      maxOutput: 64_000,
      color: '#d97757',
      desc: 'Hız / zekâ dengesi',
    },
    opus: {
      key: 'opus',
      name: 'Claude Opus 4.8',
      apiName: 'claude-opus-4-8',
      inputPer1M: 5.00,
      outputPer1M: 25.00,
      contextWindow: 1_000_000,
      maxOutput: 128_000,
      color: '#6ba6f5',
      desc: 'Uzun soluklu ajan işleri',
    },
    fable: {
      key: 'fable',
      name: 'Claude Fable 5',
      apiName: 'claude-fable-5',
      inputPer1M: 10.00,
      outputPer1M: 50.00,
      contextWindow: 1_000_000,
      maxOutput: 128_000,
      color: '#b69df7',
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
