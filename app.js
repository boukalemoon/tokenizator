/**
 * app.js
 * ─────────────────────────────────────────────────────────────
 * Claude Token Hesaplayıcı — Ana uygulama mantığı
 * ─────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════
//  UYGULAMA DURUMU
// ═══════════════════════════════════════════════════
const State = {
  currentModel: 'sonnet',
  manualBudget: 200_000,
  analyzeTimer: null,
  enterBlockTimer: null,
  isAnalyzing: false,
  lastAnalyzedText: '',
};

const SYSTEM_PROMPT_ESTIMATE = 1_200; // claude.ai arayüzü tahmini
const ANALYZE_DELAY_MS = 2_200;        // Enter engelleme süresi

const EXAMPLES = {
  short:  'Merhaba, bugün hava nasıl?',
  medium: 'Bir Python REST API örneği yazar mısın? FastAPI kullanarak kullanıcı kaydı, giriş ve JWT doğrulama içeren tam bir proje iskeleti istiyorum. Her endpoint için açıklama da ekle.',
  long: `Bir e-ticaret platformu için kapsamlı bir makine öğrenimi pipeline'ı tasarlamam gerekiyor.

Şu özellikleri içermeli:
1. Müşteri segmentasyonu (K-Means veya DBSCAN)
2. Ürün öneri sistemi (Collaborative Filtering)
3. Satış tahmini modeli (LSTM veya Prophet)
4. Anomali tespiti (İzolasyon Ormanı)
5. A/B test framework'ü

Her bileşen için:
- Veri ön işleme adımları
- Model seçimi ve hiperparametre optimizasyonu
- Değerlendirme metrikleri
- Üretim dağıtım stratejisi

Ayrıca MLflow ile deney takibini ve Docker ile containerization'ı da açıkla.`,
};

// ═══════════════════════════════════════════════════
//  YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════════
function formatK(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return n.toString();
}

function formatNum(n) {
  return Math.round(n).toLocaleString('tr-TR');
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent.replace(/\D/g, '')) || 0;
  const dur = 400;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min(1, (now - t0) / dur);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    el.textContent = formatNum(Math.round(start + (target - start) * e));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = formatNum(target);
  }
  requestAnimationFrame(step);
}

// ═══════════════════════════════════════════════════
//  PLAN KARTLARINI OLUŞTUR
// ═══════════════════════════════════════════════════
function buildPlanCards() {
  const grid = document.getElementById('plan-grid');
  if (!grid) return;

  grid.innerHTML = Plans.list.map(p => `
    <div class="plan-card" style="--plan-color:${p.color}">
      <div class="plan-name">${p.name}</div>
      <div class="plan-price">${p.priceLabel}</div>
      <div class="plan-price-unit">${p.priceUnit || '—'}</div>
      <hr class="plan-divider">
      <div class="plan-stat">
        <div class="plan-stat-row">
          <span class="plan-stat-key">Context</span>
          <span class="plan-stat-val highlight">${formatK(p.contextWindow)}</span>
        </div>
        <div class="plan-stat-row">
          <span class="plan-stat-key">Mesaj/pencere</span>
          <span class="plan-stat-val">${p.messagesPerWindow}</span>
        </div>
        <div class="plan-stat-row">
          <span class="plan-stat-key">Reset</span>
          <span class="plan-stat-val">${p.windowHours ? p.windowHours + 's' : 'günlük'}</span>
        </div>
        <div class="plan-stat-row">
          <span class="plan-stat-key">Modeller</span>
          <span class="plan-stat-val">${p.models.join(', ')}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════
//  MODEL SEÇİMİ
// ═══════════════════════════════════════════════════
function selectModel(modelKey) {
  State.currentModel = modelKey;
  document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + modelKey);
  if (btn) btn.classList.add('active');

  // Mevcut metin varsa sonuçları güncelle
  const text = document.getElementById('prompt-input')?.value || '';
  if (text.trim() && document.getElementById('result-panel')?.classList.contains('visible')) {
    runAnalysis(text);
  }
}

// ═══════════════════════════════════════════════════
//  KALAN TOKEN GÜNCELLEMESİ
// ═══════════════════════════════════════════════════
function updateManualTokens() {
  const input = document.getElementById('manual-tokens');
  const val = parseInt(input?.value) || 200_000;
  State.manualBudget = Math.max(1_000, Math.min(2_000_000, val));
  if (input) input.value = State.manualBudget;
  document.getElementById('remain-max').textContent = formatK(State.manualBudget);
  updateRemainingDisplay(Tokenizer.estimate(document.getElementById('prompt-input')?.value || ''));
}

function setPreset(value) {
  const input = document.getElementById('manual-tokens');
  if (input) input.value = value;
  updateManualTokens();
}

function updateRemainingDisplay(usedTokens) {
  const used = usedTokens + SYSTEM_PROMPT_ESTIMATE;
  const remaining = Math.max(0, State.manualBudget - used);
  const pct = State.manualBudget > 0 ? (remaining / State.manualBudget) * 100 : 0;

  // Sayı animasyonu
  const numEl = document.getElementById('remaining-num');
  if (numEl) {
    numEl.textContent = formatNum(remaining);
    numEl.classList.remove('low', 'critical');
    if (pct < 10) numEl.classList.add('critical');
    else if (pct < 30) numEl.classList.add('low');
  }

  // Bar
  const bar = document.getElementById('remain-bar');
  if (bar) {
    bar.style.width = pct.toFixed(1) + '%';
    bar.classList.remove('low', 'critical');
    if (pct < 10) bar.classList.add('critical');
    else if (pct < 30) bar.classList.add('low');
  }

  // Durum badge
  const statusEl = document.getElementById('remain-status');
  if (statusEl) {
    if (pct < 10) {
      statusEl.className = 'metric-badge badge-red';
      statusEl.textContent = '⚠ Kritik az';
    } else if (pct < 30) {
      statusEl.className = 'metric-badge badge-yellow';
      statusEl.textContent = '⚡ Az kaldı';
    } else {
      statusEl.className = 'metric-badge badge-green';
      statusEl.textContent = '✓ Yeterli';
    }
  }

  document.getElementById('remain-pct').textContent = Math.round(pct) + '% kaldı';

  // Tahmini mesaj sayısı
  const avgMsg = 350;
  const approx = Math.floor(remaining / avgMsg);
  const convosEl = document.getElementById('remain-convos');
  if (convosEl) {
    convosEl.textContent = approx > 500 ? '500+ mesaj'
                         : approx > 100 ? approx + '+ mesaj'
                         : '~' + approx + ' mesaj';
  }
}

// ═══════════════════════════════════════════════════
//  GERÇEKZAMANLı SAYAÇ + ANALİZ TETİKLEME
// ═══════════════════════════════════════════════════
function handleInput() {
  const text = document.getElementById('prompt-input')?.value || '';
  const tokens = Tokenizer.estimate(text);

  document.getElementById('char-count').textContent = text.length.toLocaleString('tr-TR');
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('word-count').textContent = wordCount.toLocaleString('tr-TR');
  document.getElementById('instant-tokens').textContent = tokens.toLocaleString('tr-TR');

  updateRemainingDisplay(tokens);

  clearTimeout(State.analyzeTimer);
  if (text.trim()) {
    triggerAnalyzeMode();
    State.analyzeTimer = setTimeout(() => runAnalysis(text), ANALYZE_DELAY_MS);
  } else {
    stopAnalyzeMode();
    document.getElementById('result-panel')?.classList.remove('visible');
  }
}

// ═══════════════════════════════════════════════════
//  ENTER ENGELLEYİCİ
// ═══════════════════════════════════════════════════
function handleKeyDown(e) {
  // Shift+Enter = satır sonu, izin ver
  if (e.key === 'Enter' && e.shiftKey) return;

  if (e.key === 'Enter') {
    const text = document.getElementById('prompt-input')?.value?.trim() || '';
    if (!text) return;

    if (State.isAnalyzing || State.lastAnalyzedText !== text) {
      e.preventDefault();
      showEnterBlock();

      if (State.lastAnalyzedText !== text) {
        clearTimeout(State.analyzeTimer);
        triggerAnalyzeMode();
        State.analyzeTimer = setTimeout(() => runAnalysis(text), ANALYZE_DELAY_MS);
      }
    }
    // Analiz tamamsa (lastAnalyzedText === text && !isAnalyzing) → Enter serbest
  }
}

function showEnterBlock() {
  const block  = document.getElementById('enter-block');
  const fill   = document.getElementById('enter-fill');
  const txt    = document.getElementById('enter-text');

  block?.classList.add('visible');
  if (txt) txt.textContent = '⏳ Analiz tamamlanıyor, bekleyin...';

  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0%';
    requestAnimationFrame(() => {
      fill.style.transition = `width ${ANALYZE_DELAY_MS}ms linear`;
      fill.style.width = '100%';
    });
  }

  clearTimeout(State.enterBlockTimer);
  State.enterBlockTimer = setTimeout(() => {
    block?.classList.remove('visible');
    if (fill) fill.style.width = '0%';
  }, ANALYZE_DELAY_MS + 200);
}

// ═══════════════════════════════════════════════════
//  ANALİZ MOD KONTROL
// ═══════════════════════════════════════════════════
function triggerAnalyzeMode() {
  State.isAnalyzing = true;
  const ta = document.getElementById('prompt-input');
  ta?.classList.add('analyzing');
  document.getElementById('analyze-overlay')?.classList.add('visible');
}

function stopAnalyzeMode() {
  State.isAnalyzing = false;
  document.getElementById('prompt-input')?.classList.remove('analyzing');
  document.getElementById('analyze-overlay')?.classList.remove('visible');
  document.getElementById('enter-block')?.classList.remove('visible');
}

// ═══════════════════════════════════════════════════
//  ANA ANALİZ
// ═══════════════════════════════════════════════════
function runAnalysis(text) {
  stopAnalyzeMode();
  State.lastAnalyzedText = text;

  const model = Plans.getModel(State.currentModel);
  const promptTokens = Tokenizer.estimate(text);
  const totalInput = promptTokens + SYSTEM_PROMPT_ESTIMATE;
  const estResponse = Tokenizer.estimateResponseTokens(promptTokens);
  const inputCost  = Plans.calcCost(totalInput, 0, State.currentModel);
  const totalCost  = Plans.calcCost(totalInput, estResponse, State.currentModel);

  // ── Metrikler ──
  animateNumber('r-prompt', promptTokens);
  document.getElementById('r-system').textContent  = formatNum(SYSTEM_PROMPT_ESTIMATE);
  animateNumber('r-total', totalInput);

  document.getElementById('r-cost').textContent    = '$' + totalCost.toFixed(4);
  document.getElementById('r-cost-model').textContent = model.name + ' · giriş+çıkış';

  // Badge: prompt uzunluğu
  const pb = document.getElementById('r-prompt-badge');
  if (pb) {
    if      (promptTokens < 200)  { pb.className = 'metric-badge badge-green';  pb.textContent = 'kısa'; }
    else if (promptTokens < 1000) { pb.className = 'metric-badge badge-blue';   pb.textContent = 'orta'; }
    else if (promptTokens < 5000) { pb.className = 'metric-badge badge-yellow'; pb.textContent = 'uzun'; }
    else                          { pb.className = 'metric-badge badge-red';    pb.textContent = 'çok uzun'; }
  }

  // Badge: context doluluk
  const maxCtx = model.contextWindow;
  const ctxPct = totalInput / maxCtx;
  const tb = document.getElementById('r-total-badge');
  if (tb) {
    const pctStr = (ctxPct * 100).toFixed(1) + '% ctx';
    if      (ctxPct < 0.10) { tb.className = 'metric-badge badge-green';  tb.textContent = pctStr; }
    else if (ctxPct < 0.50) { tb.className = 'metric-badge badge-blue';   tb.textContent = pctStr; }
    else if (ctxPct < 0.80) { tb.className = 'metric-badge badge-yellow'; tb.textContent = pctStr; }
    else                    { tb.className = 'metric-badge badge-red';    tb.textContent = pctStr; }
  }

  // Badge: maliyet
  const cb = document.getElementById('r-cost-badge');
  if (cb) {
    if      (totalCost < 0.001) { cb.className = 'metric-badge badge-green';  cb.textContent = 'ucuz'; }
    else if (totalCost < 0.01)  { cb.className = 'metric-badge badge-blue';   cb.textContent = 'normal'; }
    else if (totalCost < 0.10)  { cb.className = 'metric-badge badge-yellow'; cb.textContent = 'pahalı'; }
    else                        { cb.className = 'metric-badge badge-red';    cb.textContent = 'çok pahalı'; }
  }

  // ── Dağılım bar ──
  const usedPct = Math.min(100, ctxPct * 100);
  const distUsed   = document.getElementById('dist-used');
  const distRemain = document.getElementById('dist-remain');
  if (distUsed)   distUsed.style.width   = usedPct.toFixed(2) + '%';
  if (distRemain) distRemain.style.width = (100 - usedPct).toFixed(2) + '%';
  if (distUsed)   distUsed.textContent   = usedPct < 3 ? '' : Math.round(usedPct) + '%';

  // ── Plan tablosu ──
  buildUsageTable(totalInput, estResponse);

  // Zaman damgası
  const ts = document.getElementById('result-ts');
  if (ts) ts.textContent = new Date().toLocaleTimeString('tr-TR');

  document.getElementById('result-panel')?.classList.add('visible');
}

// ═══════════════════════════════════════════════════
//  PLAN KARŞILAŞTIRMA TABLOSU
// ═══════════════════════════════════════════════════
function buildUsageTable(totalInput, estResponse) {
  const rows = Plans.list.map(p => {
    const fits    = totalInput < p.contextWindow;
    const remaining = Math.max(0, p.contextWindow - totalInput);
    const statusCls = fits ? 'ok' : 'bad';
    const statusTxt = fits ? '✓ Sığar' : '✗ Sığmaz';
    const respStatus = !fits ? 'bad' : remaining > estResponse * 2 ? 'ok' : 'warn';
    const respText  = fits ? '~' + formatK(remaining) + ' token kalan' : '—';

    return `
      <div class="usage-row">
        <div class="usage-cell name">
          <div class="usage-dot" style="background:${p.color}"></div>
          ${p.name}
        </div>
        <div class="usage-cell">${formatK(p.contextWindow)}</div>
        <div class="usage-cell ${statusCls}">${statusTxt}</div>
        <div class="usage-cell ${respStatus}">${respText}</div>
      </div>`;
  }).join('');

  const container = document.getElementById('usage-rows');
  if (container) container.innerHTML = rows;
}

// ═══════════════════════════════════════════════════
//  ÖRNEK PROMPTLAR
// ═══════════════════════════════════════════════════
function loadExample(type) {
  const text = EXAMPLES[type];
  if (!text) return;
  const ta = document.getElementById('prompt-input');
  if (ta) {
    ta.value = text;
    ta.focus();
  }
  handleInput();
}

// ═══════════════════════════════════════════════════
//  BAŞLANGIÇ
// ═══════════════════════════════════════════════════
function init() {
  buildPlanCards();

  // Örnek token tahminlerini göster
  Object.keys(EXAMPLES).forEach(k => {
    const t = Tokenizer.estimate(EXAMPLES[k]);
    const el = document.getElementById('tip-' + k);
    if (el) el.textContent = '≈ ' + formatNum(t) + ' token';
  });

  selectModel('sonnet');
  updateRemainingDisplay(0);
}

document.addEventListener('DOMContentLoaded', init);
