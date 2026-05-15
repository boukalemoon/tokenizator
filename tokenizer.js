/**
 * tokenizer.js
 * ─────────────────────────────────────────────────────────────
 * Yaklaşık BPE (Byte-Pair Encoding) tabanlı token tahmini.
 *
 * Claude, OpenAI modelleriyle benzer tokenizasyon kullanır.
 * Kesin sayım için:  https://platform.claude.com/docs/en/build-with-claude/token-counting
 *
 * Hata payı: ±%5-10
 * ─────────────────────────────────────────────────────────────
 */

const Tokenizer = (() => {

  /**
   * Metin dilini / içerik tipini tahmin et.
   */
  function detectContentType(text) {
    const len = text.length;
    if (len === 0) return 'empty';

    const turkishChars = (text.match(/[çğışöüÇĞİŞÖÜ]/g) || []).length;
    const codeIndicators = (text.match(/[{}()\[\];=>]|function |const |let |var |import |def |class |return /g) || []).length;
    const urlCount = (text.match(/https?:\/\//g) || []).length;

    if (codeIndicators / len > 0.04) return 'code';
    if (turkishChars / len > 0.02) return 'turkish';
    if (urlCount > 0) return 'mixed';
    return 'english';
  }

  /**
   * Temel BPE tahmini.
   *
   * Referans oranlar (karakter / token):
   *   İngilizce düz metin : ~3.8-4.2
   *   Türkçe düz metin    : ~3.0-3.5  (çok eklemli yapı, daha az pay)
   *   Kod                 : ~2.8-3.2
   *   URL                 : ~1 token / ~5 karakter (parçalı)
   *   Sayılar             : ~1-2 token / sayı
   *   Özel semboller      : ~0.5-1 token / sembol
   */
  function estimate(text) {
    if (!text || text.trim() === '') return 0;

    const type = detectContentType(text);
    let tokens = 0;

    // ── URL'leri ayır ──────────────────────────────
    const urlMatches = text.match(/https?:\/\/[^\s]+/g) || [];
    urlMatches.forEach(url => {
      // URL'ler kelime/noktalama olarak bölünür, ortalama ~5 token / 30 karakter
      tokens += Math.ceil(url.length / 5);
    });
    let mainText = text.replace(/https?:\/\/[^\s]+/g, '');

    // ── Kod bloklarını ayır ────────────────────────
    const codeBlocks = mainText.match(/```[\s\S]*?```/g) || [];
    codeBlocks.forEach(block => {
      const content = block.replace(/```/g, '');
      tokens += Math.ceil(content.length / 3.0);
    });
    mainText = mainText.replace(/```[\s\S]*?```/g, '');

    // ── İnline kod ─────────────────────────────────
    const inlineCode = mainText.match(/`[^`]+`/g) || [];
    inlineCode.forEach(c => {
      tokens += Math.ceil(c.length / 3.0);
    });
    mainText = mainText.replace(/`[^`]+`/g, '');

    // ── Sayılar ────────────────────────────────────
    const numbers = mainText.match(/\b\d+(\.\d+)?\b/g) || [];
    tokens += numbers.length * 1.3;
    mainText = mainText.replace(/\b\d+(\.\d+)?\b/g, ' ');

    // ── Özel semboller ─────────────────────────────
    const specialChars = (mainText.match(/[{}()\[\]<>|\\\/\-_+*=@#$%^&!?;:,."']/g) || []).length;
    tokens += specialChars * 0.4;

    // ── Satır sonları ──────────────────────────────
    const lineBreaks = (mainText.match(/\n/g) || []).length;
    tokens += lineBreaks * 0.3;

    // ── Ana metin ──────────────────────────────────
    const cleanText = mainText.replace(/\s+/g, ' ').trim();
    const charsPerToken = type === 'turkish' ? 3.2
                        : type === 'code'    ? 3.0
                        : type === 'mixed'   ? 3.5
                        :                     3.9; // english

    tokens += cleanText.length / charsPerToken;

    return Math.max(1, Math.round(tokens));
  }

  /**
   * Ortalama cevap uzunluğu tahmini.
   * Prompt uzunluğuna göre Claude'un yaklaşık ne kadar cevap
   * üreteceğini tahmin eder.
   */
  function estimateResponseTokens(promptTokens) {
    if (promptTokens < 50)   return Math.round(promptTokens * 4);
    if (promptTokens < 200)  return Math.round(promptTokens * 3);
    if (promptTokens < 1000) return Math.round(promptTokens * 2);
    if (promptTokens < 5000) return Math.round(promptTokens * 1.5);
    return Math.round(promptTokens * 1.2);
  }

  return { estimate, detectContentType, estimateResponseTokens };
})();
