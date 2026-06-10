/**
 * app.js
 * ─────────────────────────────────────────────────────────────
 * Claude Token Hesaplayıcı — Ana uygulama mantığı
 *
 * Güvenlik notları:
 *  - Inline onclick yok; tüm etkileşim addEventListener ile (sıkı CSP uyumlu).
 *  - Dinamik HTML'e giren her değer escapeHtml() ile kaçışlanır.
 *  - Tercihler localStorage'da saklanır (model, bütçe).
 * ─────────────────────────────────────────────────────────────
 */

const State = {
  currentModel: 'sonnet',
  manualBudget: 200_000,
  analyzeTimer: null,
  enterBlockTimer: null,
  isAnalyzing: false,
  lastAnalyzedText: '',
};

const SYSTEM_PROMPT_ESTIMATE = 1_200; // claude.ai arayüzü tahmini
const ANALYZE_DELAY_MS = 900;         // analiz debounce / Enter engelleme süresi
const STORAGE_KEY = 'tokenizator-prefs';

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
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function $(id) { return document.getElementById(id); }

function formatK(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return n.toString();
}

function formatNum(n) {
  return Math.round(n).toLocaleString('tr-TR');
}

function animateNumber(id, target) {
  const el = $(id);
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

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      model: State.currentModel,
      budget: State.manualBudget,
    }));
  } catch (_) { /* gizli mod vs. — sessizce geç */ }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (prefs.model && Plans.models[prefs.model]) State.currentModel = prefs.model;
    const budget = parseInt(prefs.budget);
    if (Number.isFinite(budget)) State.manualBudget = Math.max(1_000, Math.min(2_000_000, budget));
  } catch (_) { /* bozuk veri — varsayılanlarla devam */ }
}

// ═══════════════════════════════════════════════════
//  PLAN KARTLARI
// ═══════════════════════════════════════════════════
function buildPlanCards() {
  const grid = $('plan-grid');
  if (!grid) return;

  grid.innerHTML = Plans.list.map(p => `
    <div class="plan-card" style="--plan-color:${escapeHtml(p.color)}">
      <div class="plan-name">${escapeHtml(p.name)}</div>
      <div class="plan-price">${escapeHtml(p.priceLabel)}</div>
      <div class="plan-price-unit">${escapeHtml(p.priceUnit || '—')}</div>
      <hr class="plan-divider">
      <div class="plan-stat">
        <div class="plan-stat-row">
          <span class="plan-stat-key">Context</span>
          <span class="plan-stat-val highlight">${escapeHtml(formatK(p.contextWindow))}</span>
        </div>
        <div class="plan-stat-row">
          <span class="plan-stat-key">Mesaj/pencere</span>
          <span class="plan-stat-val">${escapeHtml(p.messagesPerWindow)}</span>
        </div>
        <div class="plan-stat-row">
          <span class="plan-stat-key">Reset</span>
          <span class="plan-stat-val">${escapeHtml(p.windowHours ? p.windowHours + 's' : p.note)}</span>
        </div>
        <div class="plan-stat-row">
          <span class="plan-stat-key">Modeller</span>
          <span class="plan-stat-val">${escapeHtml(p.models.join(', '))}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════
//  MODEL SEÇİMİ
// ═══════════════════════════════════════════════════
function selectModel(modelKey) {
  if (!Plans.models[modelKey]) return;
  State.currentModel = modelKey;
  savePrefs();

  document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
  $('btn-' + modelKey)?.classList.add('active');

  const text = $('prompt-input')?.value || '';
  if (text.trim() && $('result-panel')?.classList.contains('visible')) {
    runAnalysis(text);
  }
}

// ═══════════════════════════════════════════════════
//  KALAN TOKEN
// ═══════════════════════════════════════════════════
function updateManualTokens() {
  const input = $('manual-tokens');
  const val = parseInt(input?.value) || 200_000;
  State.manualBudget = Math.max(1_000, Math.min(2_000_000, val));
  if (input) input.value = State.manualBudget;
  savePrefs();
  $('remain-max').textContent = formatK(State.manualBudget);
  updateRemainingDisplay(Tokenizer.estimate($('prompt-input')?.value || ''));
}

function updateRemainingDisplay(usedTokens) {
  const used = usedTokens + SYSTEM_PROMPT_ESTIMATE;
  const remaining = Math.max(0, State.manualBudget - used);
  const pct = State.manualBudget > 0 ? (remaining / State.manualBudget) * 100 : 0;

  const numEl = $('remaining-num');
  if (numEl) {
    numEl.textContent = formatNum(remaining);
    numEl.classList.remove('low', 'critical');
    if (pct < 10) numEl.classList.add('critical');
    else if (pct < 30) numEl.classList.add('low');
  }

  const bar = $('remain-bar');
  if (bar) {
    bar.style.width = pct.toFixed(1) + '%';
    bar.classList.remove('low', 'critical');
    if (pct < 10) bar.classList.add('critical');
    else if (pct < 30) bar.classList.add('low');
  }

  const statusEl = $('remain-status');
  if (statusEl) {
    if (pct < 10)      { statusEl.className = 'metric-badge badge-red';    statusEl.textContent = '⚠ Kritik az'; }
    else if (pct < 30) { statusEl.className = 'metric-badge badge-yellow'; statusEl.textContent = '⚡ Az kaldı'; }
    else               { statusEl.className = 'metric-badge badge-green';  statusEl.textContent = '✓ Yeterli'; }
  }

  $('remain-pct').textContent = Math.round(pct) + '% kaldı';

  const avgMsg = 350;
  const approx = Math.floor(remaining / avgMsg);
  const convosEl = $('remain-convos');
  if (convosEl) {
    convosEl.textContent = approx > 500 ? '500+ mesaj'
                         : approx > 100 ? approx + '+ mesaj'
                         : '~' + approx + ' mesaj';
  }
}

// ═══════════════════════════════════════════════════
//  GERÇEK ZAMANLI SAYAÇ + ANALİZ TETİKLEME
// ═══════════════════════════════════════════════════
function handleInput() {
  const text = $('prompt-input')?.value || '';
  const tokens = Tokenizer.estimate(text);

  $('char-count').textContent = text.length.toLocaleString('tr-TR');
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  $('word-count').textContent = wordCount.toLocaleString('tr-TR');
  $('instant-tokens').textContent = tokens.toLocaleString('tr-TR');

  updateRemainingDisplay(tokens);

  clearTimeout(State.analyzeTimer);
  if (text.trim()) {
    triggerAnalyzeMode();
    State.analyzeTimer = setTimeout(() => runAnalysis(text), ANALYZE_DELAY_MS);
  } else {
    stopAnalyzeMode();
    $('result-panel')?.classList.remove('visible');
  }
}

// ═══════════════════════════════════════════════════
//  ENTER ENGELLEYİCİ
// ═══════════════════════════════════════════════════
function handleKeyDown(e) {
  if (e.key === 'Enter' && e.shiftKey) return; // satır sonu serbest

  if (e.key === 'Enter') {
    const text = $('prompt-input')?.value?.trim() || '';
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
  }
}

function showEnterBlock() {
  const block = $('enter-block');
  const fill  = $('enter-fill');
  const txt   = $('enter-text');

  block?.classList.add('visible');
  if (txt) txt.textContent = 'Analiz tamamlanıyor, bekleyin...';

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
  $('prompt-input')?.classList.add('analyzing');
  $('analyze-overlay')?.classList.add('visible');
}

function stopAnalyzeMode() {
  State.isAnalyzing = false;
  $('prompt-input')?.classList.remove('analyzing');
  $('analyze-overlay')?.classList.remove('visible');
  $('enter-block')?.classList.remove('visible');
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
  const totalCost  = Plans.calcCost(totalInput, estResponse, State.currentModel);

  animateNumber('r-prompt', promptTokens);
  $('r-system').textContent = formatNum(SYSTEM_PROMPT_ESTIMATE);
  animateNumber('r-total', totalInput);

  $('r-cost').textContent = '$' + totalCost.toFixed(4);
  $('r-cost-model').textContent = model.name + ' · giriş+çıkış';

  // Badge: prompt uzunluğu
  const pb = $('r-prompt-badge');
  if (pb) {
    if      (promptTokens < 200)  { pb.className = 'metric-badge badge-green';  pb.textContent = 'kısa'; }
    else if (promptTokens < 1000) { pb.className = 'metric-badge badge-blue';   pb.textContent = 'orta'; }
    else if (promptTokens < 5000) { pb.className = 'metric-badge badge-yellow'; pb.textContent = 'uzun'; }
    else                          { pb.className = 'metric-badge badge-red';    pb.textContent = 'çok uzun'; }
  }

  // Badge: context doluluk (seçili modelin penceresine göre)
  const maxCtx = model.contextWindow;
  const ctxPct = totalInput / maxCtx;
  const tb = $('r-total-badge');
  if (tb) {
    const pctStr = (ctxPct * 100).toFixed(2) + '% ctx';
    if      (ctxPct < 0.10) { tb.className = 'metric-badge badge-green';  tb.textContent = pctStr; }
    else if (ctxPct < 0.50) { tb.className = 'metric-badge badge-blue';   tb.textContent = pctStr; }
    else if (ctxPct < 0.80) { tb.className = 'metric-badge badge-yellow'; tb.textContent = pctStr; }
    else                    { tb.className = 'metric-badge badge-red';    tb.textContent = pctStr; }
  }

  // Badge: maliyet
  const cb = $('r-cost-badge');
  if (cb) {
    if      (totalCost < 0.001) { cb.className = 'metric-badge badge-green';  cb.textContent = 'ucuz'; }
    else if (totalCost < 0.01)  { cb.className = 'metric-badge badge-blue';   cb.textContent = 'normal'; }
    else if (totalCost < 0.10)  { cb.className = 'metric-badge badge-yellow'; cb.textContent = 'pahalı'; }
    else                        { cb.className = 'metric-badge badge-red';    cb.textContent = 'çok pahalı'; }
  }

  // Dağılım barı
  $('dist-ctx-label').textContent = formatK(maxCtx);
  const usedPct = Math.min(100, ctxPct * 100);
  const distUsed   = $('dist-used');
  const distRemain = $('dist-remain');
  if (distUsed) {
    distUsed.style.width = Math.max(usedPct, 0.4).toFixed(2) + '%';
    distUsed.textContent = usedPct < 4 ? '' : Math.round(usedPct) + '%';
  }
  if (distRemain) distRemain.style.width = (100 - usedPct).toFixed(2) + '%';

  buildUsageTable(totalInput, estResponse);

  $('result-ts').textContent = new Date().toLocaleTimeString('tr-TR');
  $('result-panel')?.classList.add('visible');
}

// ═══════════════════════════════════════════════════
//  PLAN KARŞILAŞTIRMA TABLOSU
// ═══════════════════════════════════════════════════
function buildUsageTable(totalInput, estResponse) {
  const rows = Plans.list.map(p => {
    const fits = totalInput < p.contextWindow;
    const remaining = Math.max(0, p.contextWindow - totalInput);
    const statusCls = fits ? 'ok' : 'bad';
    const statusTxt = fits ? '✓ Sığar' : '✗ Sığmaz';
    const respStatus = !fits ? 'bad' : remaining > estResponse * 2 ? 'ok' : 'warn';
    const respText = fits ? '~' + formatK(remaining) + ' token' : '—';

    return `
      <div class="usage-row">
        <div class="usage-cell name">
          <span class="usage-dot" style="background:${escapeHtml(p.color)}"></span>
          ${escapeHtml(p.name)}
        </div>
        <div class="usage-cell">${escapeHtml(formatK(p.contextWindow))}</div>
        <div class="usage-cell ${statusCls}">${statusTxt}</div>
        <div class="usage-cell ${respStatus}">${escapeHtml(respText)}</div>
      </div>`;
  }).join('');

  const container = $('usage-rows');
  if (container) container.innerHTML = rows;
}

// ═══════════════════════════════════════════════════
//  ÖRNEK PROMPTLAR
// ═══════════════════════════════════════════════════
function loadExample(type) {
  const text = EXAMPLES[type];
  if (!text) return;
  const ta = $('prompt-input');
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
  loadPrefs();
  buildPlanCards();

  // Model butonları
  $('model-selector')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-model]');
    if (btn) selectModel(btn.dataset.model);
  });

  // Model nokta renkleri (CSP nedeniyle JS ile atanıyor)
  document.querySelectorAll('.model-dot[data-color]').forEach(dot => {
    const m = Plans.models[dot.dataset.color];
    if (m) dot.style.background = m.color;
  });

  // Prompt alanı
  const ta = $('prompt-input');
  ta?.addEventListener('input', handleInput);
  ta?.addEventListener('keydown', handleKeyDown);

  // Bütçe girişi + presetler
  $('manual-tokens')?.addEventListener('change', updateManualTokens);
  $('preset-buttons')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    const input = $('manual-tokens');
    if (input) input.value = btn.dataset.preset;
    updateManualTokens();
  });

  // Örnekler
  $('tips-grid')?.addEventListener('click', e => {
    const card = e.target.closest('[data-example]');
    if (card) loadExample(card.dataset.example);
  });

  // Örnek token tahminleri
  Object.keys(EXAMPLES).forEach(k => {
    const el = $('tip-' + k);
    if (el) el.textContent = '≈ ' + formatNum(Tokenizer.estimate(EXAMPLES[k])) + ' token';
  });

  // Kayıtlı tercihleri uygula
  const budgetInput = $('manual-tokens');
  if (budgetInput) budgetInput.value = State.manualBudget;
  $('remain-max').textContent = formatK(State.manualBudget);

  selectModel(State.currentModel);
  updateRemainingDisplay(0);
}

document.addEventListener('DOMContentLoaded', init);
