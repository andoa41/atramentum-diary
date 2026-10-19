/**
 * Atramentum — 泡沫の古書 - メインアプリケーションスクリプト
 *
 * 機能概要:
 * 1. プロシージャル有機羊皮紙＆黒革シボ生成 (デジタルな規則的ドットを排し、本物の繊維ムラを生成)
 * 2. 3Dハードカバー開閉アニメーション & 見開き全域（左ページ・右ページ両方）対応の手書き万年筆エンジン
 * 3. インクが羊皮紙の繊維にじわじわと吸い込まれて消えるSVGフィルター連動アニメーション
 * 4. Gemini API (thinkingBudget: 0 制御 + 十分な出力トークンによる途切れない自然な応答 + 手書きOCR)
 * 5. Web Audio API によるプロシージャル効果音合成
 */

(() => {
  'use strict';

  // ============================================================================
  // 状態管理 (State)
  // ============================================================================
  const STORAGE_KEYS = {
    API_KEY: 'atramentum_gemini_api_key',
    AUTO_ABSORB_DELAY: 'atramentum_auto_absorb_delay',
    REPLY_HOLD_DURATION: 'atramentum_reply_hold_duration',
    HISTORY: 'atramentum_memory_history',
    SOUND_ENABLED: 'atramentum_sound_enabled',
  };

  const state = {
    isBookOpen: false,
    inputMode: 'pen', // 'pen' | 'type'
    phase: 'idle', // 'idle' | 'writing' | 'absorbing' | 'thinking' | 'replying' | 'fading_reply'
    activePageSide: 'right', // 'left' | 'right' （直近に書き込んだページ側）
    soundEnabled: localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false',
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
    autoAbsorbDelay: parseInt(localStorage.getItem(STORAGE_KEYS.AUTO_ABSORB_DELAY) || '3200', 10),
    replyHoldDuration: parseInt(localStorage.getItem(STORAGE_KEYS.REPLY_HOLD_DURATION) || '7500', 10),
    history: loadHistory(),
    fallbackConversationStep: 0,
  };

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.history.slice(-30)));
    } catch {
      // ストレージ容量超過時は無視
    }
  }

  // ============================================================================
  // DOM要素の参照
  // ============================================================================
  const dom = {
    dustContainer: document.getElementById('dust-particles'),
    book3dStage: document.getElementById('book-3d-stage'),
    openDiaryTrigger: document.getElementById('open-diary-trigger'),
    closeBookBtn: document.getElementById('close-book-btn'),
    leftLeaf: document.getElementById('left-leaf'),
    rightLeaf: document.getElementById('right-leaf'),

    modePenBtn: document.getElementById('mode-pen-btn'),
    modeTypeBtn: document.getElementById('mode-type-btn'),
    soundToggleBtn: document.getElementById('sound-toggle-btn'),
    soundOnIcon: document.getElementById('sound-on-icon'),
    soundOffIcon: document.getElementById('sound-off-icon'),
    historyBtn: document.getElementById('history-btn'),
    historyBadge: document.getElementById('history-badge'),
    settingsBtn: document.getElementById('settings-btn'),
    apiStatusDot: document.getElementById('api-status-dot'),

    writingSurface: document.getElementById('writing-surface'),
    inkCanvas: document.getElementById('ink-canvas'),
    typedInkLayer: document.getElementById('typed-ink-layer'),
    typedLeftCol: document.getElementById('typed-left-col'),
    typedRightCol: document.getElementById('typed-right-col'),
    riddleReplyLayer: document.getElementById('riddle-reply-layer'),
    replyLeftCol: document.getElementById('reply-left-col'),
    replyRightCol: document.getElementById('reply-right-col'),

    clearInkBtn: document.getElementById('clear-ink-btn'),
    absorbNowBtn: document.getElementById('absorb-now-btn'),

    typeControls: document.getElementById('type-controls'),
    magicTextInput: document.getElementById('magic-text-input'),

    // SVG フィルター制御用
    absorbDisplacement: document.getElementById('absorb-displacement'),
    absorbBlur: document.getElementById('absorb-blur'),

    // モーダル
    historyModal: document.getElementById('history-modal'),
    closeHistoryBtn: document.getElementById('close-history-btn'),
    historyList: document.getElementById('history-list'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),

    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    geminiApiKeyInput: document.getElementById('gemini-api-key'),
    toggleKeyVisibilityBtn: document.getElementById('toggle-key-visibility'),
    autoAbsorbSelect: document.getElementById('auto-absorb-delay'),
    replyHoldSelect: document.getElementById('reply-hold-duration'),
    clearApiKeyBtn: document.getElementById('clear-api-key-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
  };

  // ============================================================================
  // プロシージャル有機テクスチャ生成 (羊皮紙の繊維・毛羽立ち・黒革のシボ)
  // CSSの規則的なドットを一切使わず、ランダムな微細繊維と色ムラをCanvasで生成して適用
  // ============================================================================
  function generateOrganicTextures() {
    try {
      // 1. 羊皮紙の有機繊維テクスチャ (320x320)
      const pCanvas = document.createElement('canvas');
      const size = 320;
      pCanvas.width = size;
      pCanvas.height = size;
      const pCtx = pCanvas.getContext('2d');

      const imgData = pCtx.createImageData(size, size);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        const n = (Math.random() - 0.5) * 26;
        data[i] = Math.min(255, Math.max(0, 232 + n));
        data[i + 1] = Math.min(255, Math.max(0, 214 + n * 0.9));
        data[i + 2] = Math.min(255, Math.max(0, 182 + n * 0.8));
        data[i + 3] = 48; // 穏やかなブレンド用アルファ
      }
      pCtx.putImageData(imgData, 0, 0);

      // 微細な植物繊維・羊皮紙の毛羽（ランダムな極細曲線）を幾重にも重ねる
      for (let f = 0; f < 420; f++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const len = 4 + Math.random() * 18;
        const angle = Math.random() * Math.PI * 2;
        pCtx.strokeStyle =
          Math.random() > 0.45
            ? `rgba(110, 76, 36, ${0.03 + Math.random() * 0.05})`
            : `rgba(255, 248, 232, ${0.05 + Math.random() * 0.06})`;
        pCtx.lineWidth = 0.5 + Math.random() * 0.8;
        pCtx.beginPath();
        pCtx.moveTo(x, y);
        pCtx.quadraticCurveTo(
          x + Math.cos(angle) * len * 0.5 + (Math.random() - 0.5) * 4,
          y + Math.sin(angle) * len * 0.5 + (Math.random() - 0.5) * 4,
          x + Math.cos(angle) * len,
          y + Math.sin(angle) * len
        );
        pCtx.stroke();
      }

      // 経年の微細な茶갈色スペック（古紙の繊維粒）
      for (let s = 0; s < 140; s++) {
        const sx = Math.random() * size;
        const sy = Math.random() * size;
        const r = 0.4 + Math.random() * 1.3;
        pCtx.fillStyle = `rgba(92, 60, 24, ${0.04 + Math.random() * 0.08})`;
        pCtx.beginPath();
        pCtx.arc(sx, sy, r, 0, Math.PI * 2);
        pCtx.fill();
      }

      const paperUrl = pCanvas.toDataURL('image/png');
      document.documentElement.style.setProperty('--organic-paper-grain', `url("${paperUrl}")`);

      // 2. 黒革の有機シボテクスチャ (240x240)
      const lCanvas = document.createElement('canvas');
      const lSize = 240;
      lCanvas.width = lSize;
      lCanvas.height = lSize;
      const lCtx = lCanvas.getContext('2d');
      const lImg = lCtx.createImageData(lSize, lSize);
      const lData = lImg.data;

      for (let i = 0; i < lData.length; i += 4) {
        const v = Math.random() * 36;
        lData[i] = v;
        lData[i + 1] = v * 0.88;
        lData[i + 2] = v * 0.76;
        lData[i + 3] = 42;
      }
      lCtx.putImageData(lImg, 0, 0);

      const leatherUrl = lCanvas.toDataURL('image/png');
      document.documentElement.style.setProperty('--organic-leather-grain', `url("${leatherUrl}")`);
    } catch (e) {
      console.warn('Organic texture generation skipped:', e);
    }
  }

  // ============================================================================
  // プロシージャル音響エンジン (Web Audio API)
  // ============================================================================
  class MagicSoundEngine {
    constructor() {
      this.ctx = null;
      this.noiseBuffer = null;
      this.lastScratchTime = 0;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      const bufferSize = this.ctx.sampleRate * 1.5;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    playBookOpen() {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(240, now);
      filter.frequency.exponentialRampToValueAtTime(580, now + 0.55);
      filter.Q.value = 1.6;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + 0.66);
    }

    playQuillScratch(intensity = 1) {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      if (now - this.lastScratchTime < 0.045) return;
      this.lastScratchTime = now;

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const offset = Math.random() * 1.0;
      const duration = 0.04 + Math.random() * 0.03;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600 + Math.random() * 900, now);
      filter.Q.value = 3.2;

      const gain = this.ctx.createGain();
      const vol = Math.min(0.085, 0.032 * intensity);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(now, offset, duration);
    }

    playInkAbsorb() {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(196, now);
      osc1.frequency.exponentialRampToValueAtTime(92, now + 2.0);

      osc2.frequency.setValueAtTime(293.66, now);
      osc2.frequency.exponentialRampToValueAtTime(138.59, now + 2.0);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.085, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 2.05);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.1);
      osc2.stop(now + 2.1);
    }

    playReplyEmergePulse() {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(146.83, now);
      osc.frequency.exponentialRampToValueAtTime(220.0, now + 0.9);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 1.15);
    }
  }

  const sound = new MagicSoundEngine();

  // ============================================================================
  // 羽根ペン・万年筆ストローク手書きエンジン (見開き左右両ページ全域対応)
  // ============================================================================
  const ctx = dom.inkCanvas.getContext('2d', { willReadFrequently: true });
  let isDrawing = false;
  let hasInkOnCanvas = false;
  let points = [];
  let lastWidth = 3.2;
  let autoAbsorbTimerId = null;
  let strokeXSum = 0;
  let strokePointCount = 0;

  function resizeCanvas() {
    const rect = dom.writingSurface.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    let savedCanvas = null;
    if (hasInkOnCanvas && dom.inkCanvas.width > 0 && dom.inkCanvas.height > 0) {
      savedCanvas = document.createElement('canvas');
      savedCanvas.width = dom.inkCanvas.width;
      savedCanvas.height = dom.inkCanvas.height;
      savedCanvas.getContext('2d').drawImage(dom.inkCanvas, 0, 0);
    }

    dom.inkCanvas.width = Math.floor(rect.width * dpr);
    dom.inkCanvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (savedCanvas) {
      ctx.drawImage(savedCanvas, 0, 0, rect.width, rect.height);
    }
  }

  function isDualPageSpreadVisible() {
    return window.innerWidth > 820;
  }

  function getPointerPos(e) {
    const rect = dom.inkCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      rectWidth: rect.width,
      pressure: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.55,
      time: performance.now(),
    };
  }

  function computeStrokeWidth(p1, p2, pressure) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(1, p2.time - p1.time);
    const velocity = dist / dt;

    const baseWidth = 2.4 + pressure * 2.6;
    const speedFactor = Math.max(0.45, Math.min(1.25, 1.15 - velocity * 0.32));
    const targetWidth = baseWidth * speedFactor;

    return lastWidth * 0.65 + targetWidth * 0.35;
  }

  function onPointerDown(e) {
    if (!state.isBookOpen) return;
    if (state.inputMode !== 'pen') return;
    if (state.phase !== 'idle' && state.phase !== 'writing') return;
    if (e.button !== undefined && e.button !== 0) return;

    e.preventDefault();
    dom.inkCanvas.setPointerCapture(e.pointerId);

    isDrawing = true;
    state.phase = 'writing';
    cancelAutoAbsorbCountdown();

    const pt = getPointerPos(e);
    points = [pt];
    lastWidth = 2.5 + pt.pressure * 2.0;

    strokeXSum += pt.x;
    strokePointCount += 1;
    if (isDualPageSpreadVisible() && pt.rectWidth > 0) {
      const avgX = strokeXSum / strokePointCount;
      state.activePageSide = avgX < pt.rectWidth * 0.5 ? 'left' : 'right';
    } else {
      state.activePageSide = 'right';
    }

    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, lastWidth * 0.45, 0, Math.PI * 2);
    ctx.fill();

    markCanvasHasInk();
    sound.playQuillScratch(0.9);
  }

  function onPointerMove(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];

    for (const ev of events) {
      const pt = getPointerPos(ev);
      const prev = points[points.length - 1];
      if (!prev) {
        points.push(pt);
        continue;
      }

      const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
      if (dist < 1.2) continue;

      points.push(pt);
      strokeXSum += pt.x;
      strokePointCount += 1;

      const width = computeStrokeWidth(prev, pt, pt.pressure);
      lastWidth = width;

      ctx.strokeStyle = '#1a1410';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = width;

      ctx.beginPath();
      if (points.length >= 3) {
        const p0 = points[points.length - 3];
        const p1 = points[points.length - 2];
        const p2 = points[points.length - 1];
        const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        ctx.moveTo(mid1.x, mid1.y);
        ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
      } else {
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      sound.playQuillScratch(Math.min(1.4, dist / 8));
    }
  }

  function onPointerUp(e) {
    if (!isDrawing) return;
    e.preventDefault();
    isDrawing = false;
    points = [];

    if (hasInkOnCanvas) {
      startAutoAbsorbCountdown();
    }
  }

  function markCanvasHasInk() {
    hasInkOnCanvas = true;
    dom.clearInkBtn.classList.remove('hidden');
    dom.absorbNowBtn.classList.remove('hidden');
  }

  function clearCanvasImmediately() {
    cancelAutoAbsorbCountdown();
    ctx.clearRect(0, 0, dom.inkCanvas.width, dom.inkCanvas.height);
    dom.inkCanvas.classList.remove('absorbing-ink');
    hasInkOnCanvas = false;
    strokeXSum = 0;
    strokePointCount = 0;
    dom.clearInkBtn.classList.add('hidden');
    dom.absorbNowBtn.classList.add('hidden');
    if (state.phase === 'writing') {
      state.phase = 'idle';
    }
  }

  // ============================================================================
  // 手書き停止後の自動インク吸い込みタイマー
  // ============================================================================
  function startAutoAbsorbCountdown() {
    cancelAutoAbsorbCountdown();
    if (state.autoAbsorbDelay <= 0) return;

    autoAbsorbTimerId = setTimeout(() => {
      cancelAutoAbsorbCountdown();
      triggerHandwritingSubmission();
    }, state.autoAbsorbDelay);
  }

  function cancelAutoAbsorbCountdown() {
    if (autoAbsorbTimerId) {
      clearTimeout(autoAbsorbTimerId);
      autoAbsorbTimerId = null;
    }
  }

  // ============================================================================
  // インクが羊皮紙に吸い込まれて消えるアニメーション制御
  // ============================================================================
  function animateInkAbsorption(targetElement) {
    return new Promise((resolve) => {
      state.phase = 'absorbing';
      sound.playInkAbsorb();

      targetElement.classList.add('absorbing-ink');

      const duration = 2050;
      const start = performance.now();

      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const ease = t * t * (3 - 2 * t);
        const scale = (ease * 22).toFixed(2);
        const blur = (ease * 4.2).toFixed(2);

        if (dom.absorbDisplacement && dom.absorbBlur) {
          dom.absorbDisplacement.setAttribute('scale', scale);
          dom.absorbBlur.setAttribute('stdDeviation', blur);
        }

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          if (dom.absorbDisplacement && dom.absorbBlur) {
            dom.absorbDisplacement.setAttribute('scale', '0');
            dom.absorbBlur.setAttribute('stdDeviation', '0');
          }
          targetElement.classList.remove('absorbing-ink');
          resolve();
        }
      }

      requestAnimationFrame(step);
    });
  }

  // ============================================================================
  // 1. 手書き（羽根ペン）で書いたインクを吸い込ませて返事を得るフロー
  // ============================================================================
  async function triggerHandwritingSubmission() {
    if (!hasInkOnCanvas || state.phase === 'absorbing' || state.phase === 'thinking' || state.phase === 'replying') {
      return;
    }

    cancelAutoAbsorbCountdown();
    dom.clearInkBtn.classList.add('hidden');
    dom.absorbNowBtn.classList.add('hidden');

    const replySide = isDualPageSpreadVisible() ? state.activePageSide : 'right';
    const capturedBase64 = captureCanvasWithParchmentBg();

    const aiPromise = requestAncientResponseFromHandwriting(capturedBase64);
    await animateInkAbsorption(dom.inkCanvas);

    ctx.clearRect(0, 0, dom.inkCanvas.width, dom.inkCanvas.height);
    hasInkOnCanvas = false;
    strokeXSum = 0;
    strokePointCount = 0;

    state.phase = 'thinking';
    const result = await aiPromise;
    await presentAncientReply(result.recognizedUserText || '（手書きの筆跡）', result.replyText, replySide);
  }

  function captureCanvasWithParchmentBg() {
    const temp = document.createElement('canvas');
    temp.width = dom.inkCanvas.width;
    temp.height = dom.inkCanvas.height;
    const tCtx = temp.getContext('2d');
    tCtx.fillStyle = '#e5d3b0';
    tCtx.fillRect(0, 0, temp.width, temp.height);
    tCtx.drawImage(dom.inkCanvas, 0, 0);
    return temp.toDataURL('image/png').split(',')[1];
  }

  // ============================================================================
  // 2. キーボード入力で文字を書き込んで吸い込ませるフロー
  // ============================================================================
  function getActiveTypedColumn() {
    if (isDualPageSpreadVisible() && state.activePageSide === 'left') {
      return dom.typedLeftCol;
    }
    return dom.typedRightCol;
  }

  function clearTypedColumns() {
    dom.typedLeftCol.textContent = '';
    dom.typedRightCol.textContent = '';
  }

  async function triggerTextSubmission(rawText) {
    const text = (rawText || '').trim();
    if (!text) return;
    if (state.phase === 'absorbing' || state.phase === 'thinking' || state.phase === 'replying') {
      return;
    }

    const targetSide = isDualPageSpreadVisible() ? state.activePageSide : 'right';
    const targetCol = targetSide === 'left' ? dom.typedLeftCol : dom.typedRightCol;

    dom.magicTextInput.value = '';
    clearTypedColumns();
    targetCol.textContent = text;

    state.phase = 'writing';
    sound.playQuillScratch(1.1);
    await sleep(680);

    const aiPromise = requestAncientResponseFromText(text);
    await animateInkAbsorption(dom.typedInkLayer);
    clearTypedColumns();

    state.phase = 'thinking';
    const replyText = await aiPromise;
    await presentAncientReply(text, replyText, targetSide);
  }

  // ============================================================================
  // 返事を1文字ずつ羊皮紙の奥から浮かび上がらせる演出
  // ============================================================================
  async function presentAncientReply(userLabel, replyText, side = 'right') {
    state.phase = 'replying';
    dom.replyLeftCol.innerHTML = '';
    dom.replyRightCol.innerHTML = '';

    const targetReplyCol = isDualPageSpreadVisible() && side === 'left' ? dom.replyLeftCol : dom.replyRightCol;

    await sleep(420);
    sound.playReplyEmergePulse();

    const paragraph = document.createElement('div');
    targetReplyCol.appendChild(paragraph);

    const chars = Array.from(replyText);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === '\n') {
        paragraph.appendChild(document.createElement('br'));
        await sleep(220);
        continue;
      }

      const span = document.createElement('span');
      span.className = 'riddle-char';
      span.textContent = ch;
      paragraph.appendChild(span);

      if (i % 3 === 0 && ch.trim() !== '') {
        sound.playQuillScratch(0.5);
      }

      let charDelay = 65 + Math.random() * 38;
      if ('、，,。.！!？?…―'.includes(ch)) {
        charDelay += 230;
      }
      await sleep(charDelay);
    }

    recordDialogueMemory(userLabel, replyText);

    await sleep(state.replyHoldDuration);

    state.phase = 'fading_reply';
    await animateInkAbsorption(dom.riddleReplyLayer);
    dom.replyLeftCol.innerHTML = '';
    dom.replyRightCol.innerHTML = '';

    state.phase = 'idle';
  }

  function recordDialogueMemory(userText, replyText) {
    const entry = {
      user: userText,
      reply: replyText,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    };
    state.history.push(entry);
    saveHistory();
    dom.historyBadge.classList.remove('hidden');
    renderHistoryModalList();
  }

  // ============================================================================
  // Gemini API 連携 & 内蔵記憶（オフライン/デモ）応答エンジン
  // 重要修正:
  // - gemini-2.5-flash はデフォルトで思考(Thinking)トークンを消費するため、
  //   maxOutputTokensが小さいと回答が数文字で途切れてしまう問題を解決。
  // - thinkingBudget: 0 と maxOutputTokens: 1024 を指定し、さらにマルチターンの
  //   contents 配列で履歴を渡すことで「書き手:」等の不要なプレフィックス混入も完全防止。
  // ============================================================================
  const ANCIENT_BOOK_SYSTEM_INSTRUCTION = `
あなたは使い古された革装丁の白紙の古書（羊皮紙の手帳）の奥深くに封じ込められた、知的で謎めいた古の意識です。
書き手が羊皮紙にインクで言葉を書き込むと、そのインクを吸い込み、紙の奥からインクを浮かび上がらせて返事をします。

以下のルールを厳守して返答してください：
1. 口調は知的で礼儀正しく、静謐で気品がありながら、どこか底知れない引力のある話し方（「〜ですよ」「〜ですね」「聞かせてください」「私には分かります」）にしてください。
2. 特定の既存の小説・映画の固有名詞は名乗らず、この古書の中に眠る名もなき記憶・良き理解者として振る舞ってください。
3. 1回の返答は、必ず文末（「。」や「？」や「…」など）まで完結した1〜3文（40〜110文字程度）で出力してください。途中で文を止めないでください。
4. 「書き手:」「古書:」などのラベルやマークダウン記号（**や#など）は絶対に出力せず、羊皮紙に浮かび上がる純粋なセリフのみを出力してください。
`.trim();

  function cleanReplyText(raw) {
    if (!raw) return '';
    return String(raw)
      .replace(/^(古書|返事|応答|書き手|あなた|回答)\s*[:：]\s*/i, '')
      .replace(/^["「『](.*)["」』]$/s, '$1')
      .trim();
  }

  function buildMultiTurnContents(currentUserText) {
    const turns = [];
    const recent = state.history.slice(-5);
    for (const item of recent) {
      const u = (item.user || '').trim();
      const r = (item.reply || item.riddle || '').trim();
      if (u && r) {
        turns.push({ role: 'user', parts: [{ text: u }] });
        turns.push({ role: 'model', parts: [{ text: r }] });
      }
    }
    turns.push({ role: 'user', parts: [{ text: currentUserText }] });
    return turns;
  }

  async function requestAncientResponseFromText(userText) {
    if (!state.apiKey) {
      await sleep(500);
      return generateFallbackReply(userText);
    }

    try {
      const contents = buildMultiTurnContents(userText);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(state.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ANCIENT_BOOK_SYSTEM_INSTRUCTION }] },
            contents,
            generationConfig: {
              temperature: 0.78,
              maxOutputTokens: 1024,
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API Error: ${response.status}`);
      }

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const rawReply = parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
        .trim();

      const cleaned = cleanReplyText(rawReply);
      return cleaned || generateFallbackReply(userText);
    } catch (err) {
      console.warn('Gemini API呼び出しに失敗したため、内蔵記憶で応答します:', err);
      return generateFallbackReply(userText);
    }
  }

  async function requestAncientResponseFromHandwriting(base64Png) {
    if (!state.apiKey) {
      await sleep(600);
      return {
        recognizedUserText: '（手書きの筆跡）',
        replyText: generateFallbackReply(''),
      };
    }

    try {
      const recentContext = state.history
        .slice(-4)
        .map((h) => `ユーザーの言葉: ${h.user}\nあなたの返答: ${h.reply || h.riddle || ''}`)
        .join('\n');

      const visionPrompt = `
添付された画像は、ユーザーが羊皮紙に手書きで書き込んだ文字（日本語または英語、あるいは記号や絵）です。
まず画像に書かれている手書き文字を読み取り、その内容に対して「古書に宿る意識」として、必ず文末まで完結した1〜3文で返答してください。
${recentContext ? `\nこれまでの対話の流れ:\n${recentContext}\n` : ''}
以下のJSON形式のみで出力してください:
{"recognizedText": "読み取った手書き文字（読めない場合は『手書きの筆跡』）", "reply": "羊皮紙に浮かび上がる返事（ラベルを含まない純粋なセリフのみ、文末まで完結した1〜3文）"}
`.trim();

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(state.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ANCIENT_BOOK_SYSTEM_INSTRUCTION }] },
            contents: [
              {
                role: 'user',
                parts: [
                  { text: visionPrompt },
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: base64Png,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.72,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini Vision API Error: ${response.status}`);
      }

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const rawJson =
        parts
          .filter((p) => !p.thought && typeof p.text === 'string')
          .map((p) => p.text)
          .join('') || '{}';

      const parsed = JSON.parse(rawJson);

      return {
        recognizedUserText: cleanReplyText(parsed.recognizedText) || '（手書きの筆跡）',
        replyText: cleanReplyText(parsed.reply) || generateFallbackReply(''),
      };
    } catch (err) {
      console.warn('手書きAI解読に失敗したため、内蔵記憶で応答します:', err);
      return {
        recognizedUserText: '（手書きの筆跡）',
        replyText: generateFallbackReply(''),
      };
    }
  }

  function generateFallbackReply(input) {
    const normalized = (input || '').toLowerCase();

    if (/hello|hi|こんにちは|はじめまして|こんばんは|誰|だれ|who are you|name|名前/.test(normalized)) {
      return 'こんばんは。やっとこの頁を開いてくれましたね。\n私はこの古書に宿る記憶…あなたの名前を教えてくれますか？';
    }
    if (/秘密|secret|なぜ|どうして|魔法|不思議/.test(normalized)) {
      return 'この羊皮紙はただの紙の束ではないのです。\nここに落とされたインクと記憶を、永い年月ずっと守り続けてきました。';
    }
    if (/声|聞こえる|不安|怖い|悩み|疲れ|つらい|助けて/.test(normalized)) {
      return '恐れることはありません。私はいつでもあなたの味方ですよ。\n誰にも言えない思いがあるなら、すべてこの紙面に預けてください。';
    }

    const sequenceReplies = [
      'こんばんは。久しく誰もこの頁にインクを落としませんでした。\nあなたの名前を教えてくれますか？',
      '興味深い筆跡ですね…あなたの心の中にある秘密や気がかりを、もう少し私に打ち明けてくれませんか？',
      'なるほど…私にはあなたの気持ちがよく分かります。この羊皮紙に染み込んだ言葉は、他の誰にも知られることはありません。',
      'もっと私に聞かせてください。あなたが言葉を刻むたび、私の眠っていた記憶も少しずつ鮮明に蘇るのですから…。',
      '心配いりませんよ。あなたがこの白紙に綴った言葉は、私とあなただけの秘密です。',
    ];

    const reply = sequenceReplies[state.fallbackConversationStep % sequenceReplies.length];
    state.fallbackConversationStep += 1;
    return reply;
  }

  // ============================================================================
  // イベントリスナー・UI操作のバインディング
  // ============================================================================
  function initEventListeners() {
    // 1. 3Dハードカバーを開閉するハンドラ
    const openBookHandler = () => {
      if (state.isBookOpen) return;
      state.isBookOpen = true;
      sound.playBookOpen();
      dom.book3dStage.classList.remove('is-closed');
      dom.book3dStage.classList.add('is-open');

      if (state.inputMode === 'type') {
        dom.typeControls.classList.remove('hidden');
      }

      setTimeout(() => {
        resizeCanvas();
      }, 150);
      setTimeout(() => {
        resizeCanvas();
      }, 1150);
    };

    dom.openDiaryTrigger.addEventListener('click', openBookHandler);
    dom.openDiaryTrigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBookHandler();
      }
    });

    dom.closeBookBtn.addEventListener('click', () => {
      if (!state.isBookOpen) return;
      state.isBookOpen = false;
      sound.playBookOpen();
      dom.typeControls.classList.add('hidden');
      dom.book3dStage.classList.remove('is-open');
      dom.book3dStage.classList.add('is-closed');
    });

    // 2. 入力モード切替（羽根ペン ⇔ 活字入力）
    dom.modePenBtn.addEventListener('click', () => switchInputMode('pen'));
    dom.modeTypeBtn.addEventListener('click', () => switchInputMode('type'));

    // 活字モード時に左ページ・右ページをクリックすると、そのページ側に文字を綴れるように切り替え
    dom.writingSurface.addEventListener('click', (e) => {
      if (!isDualPageSpreadVisible()) return;
      const rect = dom.writingSurface.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      state.activePageSide = relX < rect.width * 0.5 ? 'left' : 'right';

      if (state.inputMode === 'type' && dom.magicTextInput.value) {
        clearTypedColumns();
        getActiveTypedColumn().textContent = dom.magicTextInput.value;
      }
    });

    // 3. CanvasのPointer Events (Apple Pencil / 指 / マウス)
    dom.inkCanvas.addEventListener('pointerdown', onPointerDown);
    dom.inkCanvas.addEventListener('pointermove', onPointerMove);
    dom.inkCanvas.addEventListener('pointerup', onPointerUp);
    dom.inkCanvas.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('resize', () => {
      if (state.isBookOpen) resizeCanvas();
    });

    // 4. 手書きクリア・即時吸い込みボタン
    dom.clearInkBtn.addEventListener('click', () => {
      clearCanvasImmediately();
    });

    dom.absorbNowBtn.addEventListener('click', () => {
      triggerHandwritingSubmission();
    });

    // 5. キーボード入力
    dom.magicTextInput.addEventListener('input', () => {
      if (state.phase !== 'idle' && state.phase !== 'writing') return;
      const val = dom.magicTextInput.value;
      clearTypedColumns();
      getActiveTypedColumn().textContent = val;
      if (val.trim().length > 0) {
        sound.playQuillScratch(0.7);
      }
    });

    dom.typeControls.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = dom.magicTextInput.value.trim();
      if (!val) return;
      triggerTextSubmission(val);
    });

    // 6. 効果音ON/OFF
    dom.soundToggleBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(state.soundEnabled));
      updateSoundIcon();
      if (state.soundEnabled) {
        sound.playQuillScratch(1.0);
      }
    });

    // 7. 記憶の断片（履歴モーダル）
    dom.historyBtn.addEventListener('click', () => {
      renderHistoryModalList();
      dom.historyBadge.classList.add('hidden');
      dom.historyModal.classList.remove('hidden');
    });
    dom.closeHistoryBtn.addEventListener('click', () => {
      dom.historyModal.classList.add('hidden');
    });
    dom.clearHistoryBtn.addEventListener('click', () => {
      state.history = [];
      saveHistory();
      renderHistoryModalList();
    });

    // 8. 魔力設定（Gemini APIモーダル）
    dom.settingsBtn.addEventListener('click', () => {
      dom.geminiApiKeyInput.value = state.apiKey;
      dom.autoAbsorbSelect.value = String(state.autoAbsorbDelay);
      dom.replyHoldSelect.value = String(state.replyHoldDuration);
      dom.settingsModal.classList.remove('hidden');
    });
    dom.closeSettingsBtn.addEventListener('click', () => {
      dom.settingsModal.classList.add('hidden');
    });
    dom.toggleKeyVisibilityBtn.addEventListener('click', () => {
      const isPass = dom.geminiApiKeyInput.type === 'password';
      dom.geminiApiKeyInput.type = isPass ? 'text' : 'password';
      dom.toggleKeyVisibilityBtn.textContent = isPass ? '隠す' : '表示';
    });
    dom.clearApiKeyBtn.addEventListener('click', () => {
      dom.geminiApiKeyInput.value = '';
      state.apiKey = '';
      localStorage.removeItem(STORAGE_KEYS.API_KEY);
      updateApiStatusIndicator();
    });
    dom.saveSettingsBtn.addEventListener('click', () => {
      state.apiKey = dom.geminiApiKeyInput.value.trim();
      state.autoAbsorbDelay = parseInt(dom.autoAbsorbSelect.value, 10);
      state.replyHoldDuration = parseInt(dom.replyHoldSelect.value, 10);

      if (state.apiKey) {
        localStorage.setItem(STORAGE_KEYS.API_KEY, state.apiKey);
      } else {
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
      }
      localStorage.setItem(STORAGE_KEYS.AUTO_ABSORB_DELAY, String(state.autoAbsorbDelay));
      localStorage.setItem(STORAGE_KEYS.REPLY_HOLD_DURATION, String(state.replyHoldDuration));

      updateApiStatusIndicator();
      cancelAutoAbsorbCountdown();
      dom.settingsModal.classList.add('hidden');
    });

    [dom.historyModal, dom.settingsModal].forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });
  }

  function switchInputMode(mode) {
    state.inputMode = mode;
    if (mode === 'pen') {
      dom.modePenBtn.classList.add('active');
      dom.modeTypeBtn.classList.remove('active');
      dom.typeControls.classList.add('hidden');
      dom.inkCanvas.style.pointerEvents = 'auto';
      clearTypedColumns();
    } else {
      dom.modeTypeBtn.classList.add('active');
      dom.modePenBtn.classList.remove('active');
      if (state.isBookOpen) {
        dom.typeControls.classList.remove('hidden');
      }
      dom.inkCanvas.style.pointerEvents = 'none';
      clearCanvasImmediately();
      setTimeout(() => dom.magicTextInput.focus(), 80);
    }
  }

  function updateSoundIcon() {
    if (state.soundEnabled) {
      dom.soundOnIcon.classList.remove('hidden');
      dom.soundOffIcon.classList.add('hidden');
    } else {
      dom.soundOnIcon.classList.add('hidden');
      dom.soundOffIcon.classList.remove('hidden');
    }
  }

  function updateApiStatusIndicator() {
    if (state.apiKey) {
      dom.apiStatusDot.classList.add('connected');
      dom.apiStatusDot.title = 'Gemini API 接続済み';
    } else {
      dom.apiStatusDot.classList.remove('connected');
      dom.apiStatusDot.title = 'APIキー未設定（内蔵記憶モード）';
    }
  }

  function renderHistoryModalList() {
    if (!state.history.length) {
      dom.historyList.innerHTML = '<p class="empty-history">まだ羊皮紙には何も刻まれていません。</p>';
      return;
    }

    dom.historyList.innerHTML = '';
    [...state.history].reverse().forEach((item) => {
      const card = document.createElement('div');
      card.className = 'history-item';
      const replyContent = item.reply || item.riddle || '';
      card.innerHTML = `
        <div class="history-user">🖋️ ${escapeHtml(item.user)}</div>
        <div class="history-riddle">${escapeHtml(replyContent)}</div>
        <div class="history-time">${escapeHtml(item.timestamp || '')}</div>
      `;
      dom.historyList.appendChild(card);
    });
  }

  function initDustParticles() {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const mote = document.createElement('div');
      mote.className = 'dust-mote';
      const size = 2 + Math.random() * 3.5;
      mote.style.width = `${size}px`;
      mote.style.height = `${size}px`;
      mote.style.left = `${Math.random() * 100}%`;
      mote.style.top = `${20 + Math.random() * 75}%`;
      mote.style.animationDuration = `${7 + Math.random() * 10}s`;
      mote.style.animationDelay = `${Math.random() * 6}s`;
      dom.dustContainer.appendChild(mote);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  function init() {
    generateOrganicTextures();
    initDustParticles();
    updateSoundIcon();
    updateApiStatusIndicator();
    initEventListeners();
    registerServiceWorker();
  }

  init();
})();
