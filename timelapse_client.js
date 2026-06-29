'use strict';
// ════════════════════════════════════════════════════════════
//  TIMELAPSE — клиентская часть админ-панели
//  Подключается через admin_cmd (WS) и REST /api/timelapse/*
// ════════════════════════════════════════════════════════════

let tlSessions = [];
let tlSelectedSessionId = null;
let tlSnapshot = null;      // Uint8Array, исходный холст сессии
let tlEvents = [];          // [{x,y,c,t}, ...] последовательные изменения пикселей
let tlFrame = null;         // Uint8Array текущего кадра (snapshot + применённые events)
let tlPlayIndex = 0;        // индекс первого ещё не применённого события
let tlSpeed = 5;            // множитель скорости (1 = реальное время, 5 = 5× быстрее)
let tlPlaying = false;
let tlTimer = null;         // requestAnimationFrame handle
let tlCurrentTime = 0;     // текущее виртуальное время воспроизведения (мс сессии)
let tlMaxTime = 0;          // максимальный timestamp в событиях
let tlLastRealTime = 0;     // performance.now() последнего тика
let tlW = 0, tlH = 0;
let tlFullscreen = false;   // true = плеер сейчас в fullscreen (использует основной канвас)

// Автоцентрирование камеры
let tlAutocenter = true;    // включено по умолчанию
let tlAutocenterRaf = null;

// Сохранённое состояние камеры игры (восстанавливается при выходе из fullscreen)
let _tlSavedCam = null;
// Сохранённые данные холста игры
let _tlSavedCanvasData = null;

// ── Статус записи (WS) ──────────────────────────────────────
function tlRefreshStatus() {
  sendJSON({ action: 'admin_cmd', cmd: 'timelapse_status' });
}
function tlStartRecording() {
  sendJSON({ action: 'admin_cmd', cmd: 'timelapse_start' });
}
function tlStopServer() {
  sendJSON({ action: 'admin_cmd', cmd: 'timelapse_stop' });
}

// Вызывается из network.js при action==='timelapse_status'
function tlHandleStatus(d) {
  const dot = document.getElementById('tl-rec-dot');
  const title = document.getElementById('tl-rec-title');
  const info = document.getElementById('tl-rec-info');
  const startBtn = document.getElementById('tl-rec-start');
  const stopBtn = document.getElementById('tl-rec-stop');
  if (!dot) return;

  const recording = !!d.recording;
  dot.classList.toggle('recording', recording);
  dot.classList.toggle('idle', !recording);

  if (recording) {
    title.textContent = 'Запись идёт';
    const parts = [];
    if (d.sessionId) parts.push(`ID: ${d.sessionId}`);
    if (typeof d.pixelCount === 'number') parts.push(`${d.pixelCount.toLocaleString()} пикс.`);
    if (d.startedAt) parts.push('с ' + new Date(d.startedAt).toLocaleTimeString());
    info.textContent = parts.join(' · ') || 'Идёт запись изменений холста';
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
  } else {
    title.textContent = 'Запись не ведётся';
    info.textContent = 'Нажми «Начать», чтобы запустить тайм-лапс холста';
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }
}

// ── Список сессий (REST) ────────────────────────────────────
async function tlLoadSessions() {
  const list = document.getElementById('tl-session-list');
  const btn = document.getElementById('tl-load-btn');
  if (btn) btn.disabled = true;
  list.innerHTML = '<div class="tl-empty-hint">Загрузка...</div>';
  try {
    const res = await fetch(getApiUrl() + '/timelapse/sessions');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    tlSessions = await res.json();
    tlRenderSessions();
  } catch (e) {
    list.innerHTML = `<div class="tl-empty-hint">Ошибка загрузки: ${e.message}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function tlRenderSessions() {
  const list = document.getElementById('tl-session-list');
  if (!tlSessions.length) {
    list.innerHTML = '<div class="tl-empty-hint">Сессий пока нет — начни запись</div>';
    return;
  }
  list.innerHTML = tlSessions.map(s => {
    const started = s.startedAt ? new Date(s.startedAt).toLocaleString() : '—';
    const meta = [];
    if (typeof s.totalEvents === 'number') meta.push(`${s.totalEvents.toLocaleString()} событий`);
    if (s.w && s.h) meta.push(`${s.w}×${s.h}`);
    const selected = s.id === tlSelectedSessionId ? ' selected' : '';
    return `<div class="tl-session-item${selected}" data-onclick="tlSelectSession('${s.id}')">
      <div class="tl-sess-info">
        <div class="tl-sess-id">${s.id}</div>
        <div class="tl-sess-meta">${started}${meta.length ? ' · ' + meta.join(' · ') : ''}</div>
      </div>
      <button class="tl-sess-delete" title="Удалить сессию" data-onclick="event.stopPropagation(); tlDeleteSession('${s.id}')">🗑</button>
      <div class="tl-sess-arrow">›</div>
    </div>`;
  }).join('');
}

// ── Удаление сессии ──────────────────────────────────────────
function tlDeleteSession(id) {
  if (!confirm(`Удалить тайм-лапс сессию "${id}"? Это действие необратимо — все записанные данные будут удалены из R2.`)) return;
  sendJSON({ action: 'admin_cmd', cmd: 'timelapse_delete', sessionId: id });
}

// Вызывается из network.js при action==='timelapse_session_deleted'
function tlHandleSessionDeleted(id) {
  tlSessions = tlSessions.filter(s => s.id !== id);
  if (tlSelectedSessionId === id) {
    tlSelectedSessionId = null;
    const playerSection = document.getElementById('tl-player-section');
    if (playerSection) playerSection.style.display = 'none';
    if (tlFullscreen) tlExitFullscreen();
    tlSnapshot = null; tlEvents = []; tlFrame = null;
  }
  tlRenderSessions();
}

function tlSelectSession(id) {
  tlSelectedSessionId = id;
  tlRenderSessions();
  document.getElementById('tl-player-section').style.display = '';
  tlResetPlayer();
  document.getElementById('tl-status').textContent = `Выбрана сессия: ${id}`;
}

// ── Загрузка и подготовка данных воспроизведения ────────────
async function tlLoadAndPrepare() {
  if (!tlSelectedSessionId) return;
  const bar = document.getElementById('tl-load-bar');
  const status = document.getElementById('tl-status');
  const prepBtn = document.getElementById('tl-prepare-btn');
  if (prepBtn) prepBtn.disabled = true;
  bar.style.width = '0%';

  try {
    status.textContent = 'Загрузка снапшота...';
    const snapRes = await fetch(getApiUrl() + `/timelapse/snapshot/${tlSelectedSessionId}`);
    if (!snapRes.ok) throw new Error('снапшот: HTTP ' + snapRes.status);
    const snapBuf = await snapRes.arrayBuffer();
    // Первые 4 байта — заголовок w/h, остальное — пиксели
    const snapView = new Uint8Array(snapBuf);
    const snapW = (snapView[0] << 8) | snapView[1];
    const snapH = (snapView[2] << 8) | snapView[3];
    tlSnapshot = snapBuf.byteLength > 4 ? snapView.slice(4) : snapView;
    bar.style.width = '40%';

    const sess = tlSessions.find(s => s.id === tlSelectedSessionId);
    tlW = (sess && sess.w) || snapW || canvasW;
    tlH = (sess && sess.h) || snapH || canvasH;

    status.textContent = 'Загрузка событий...';
    const evRes = await fetch(getApiUrl() + `/timelapse/events/${tlSelectedSessionId}`);
    if (!evRes.ok) throw new Error('события: HTTP ' + evRes.status);
    const evBuf = new Uint8Array(await evRes.arrayBuffer());
    bar.style.width = '80%';

    tlEvents = [];
    for (let i = 0; i + 9 <= evBuf.length; i += 9) {
      tlEvents.push({
        x: (evBuf[i] << 8) | evBuf[i + 1],
        y: (evBuf[i + 2] << 8) | evBuf[i + 3],
        c: evBuf[i + 4],
        t: ((evBuf[i + 5] << 24) | (evBuf[i + 6] << 16) | (evBuf[i + 7] << 8) | evBuf[i + 8]) >>> 0,
      });
    }
    // Вычисляем максимальный timestamp (события уже отсортированы по t на сервере)
    tlMaxTime = tlEvents.length ? tlEvents[tlEvents.length - 1].t : 0;

    bar.style.width = '100%';
    tlResetPlayer();
    // Обновляем превью в мини-канвасе (не fullscreen)
    tlDrawMiniFrame();
    document.getElementById('tl-play-btn').disabled = false;
    document.getElementById('tl-reset-btn').disabled = false;
    document.getElementById('tl-export-btn').disabled = false;
    document.getElementById('tl-fullscreen-btn').disabled = false;
    const dur = tlMaxTime >= 60000
      ? (tlMaxTime / 60000).toFixed(1) + ' мин'
      : (tlMaxTime / 1000).toFixed(1) + ' сек';
    status.textContent = `Готово: ${tlEvents.length.toLocaleString()} событий · ${dur}`;
  } catch (e) {
    status.textContent = 'Ошибка: ' + e.message;
  } finally {
    if (prepBtn) prepBtn.disabled = false;
  }
}

// ── Мини-канвас в панели (не fullscreen) ─────────────────────
function tlSetupMiniCanvas() {
  const canvas = document.getElementById('tl-canvas');
  canvas.width = tlW;
  canvas.height = tlH;
  tlFitMiniCanvas();
}

function tlFitMiniCanvas() {
  const canvas = document.getElementById('tl-canvas');
  if (!canvas || !tlW || !tlH) return;
  const maxW = 480, maxH = 480;
  const scale = Math.max(1, Math.floor(Math.min(maxW / tlW, maxH / tlH)));
  canvas.style.width = (tlW * scale) + 'px';
  canvas.style.height = (tlH * scale) + 'px';
}

function tlDrawMiniFrame() {
  if (!tlFrame || !tlW || !tlH) return;
  const canvas = document.getElementById('tl-canvas');
  if (!canvas) return;
  if (canvas.width !== tlW || canvas.height !== tlH) {
    canvas.width = tlW; canvas.height = tlH; tlFitMiniCanvas();
  }
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(tlW, tlH);
  for (let i = 0; i < tlFrame.length; i++) {
    const hex = tlGetColor(tlFrame[i]);
    img.data[i*4]   = parseInt(hex.slice(1,3),16)||0;
    img.data[i*4+1] = parseInt(hex.slice(3,5),16)||0;
    img.data[i*4+2] = parseInt(hex.slice(5,7),16)||0;
    img.data[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ── Рендер на основной канвас (fullscreen-режим) ─────────────
function tlDrawMainCanvas() {
  if (!tlFrame || !tlW || !tlH) return;
  // Если размер холста изменился под тайм-лапс
  if (mainCanvas.width !== tlW || mainCanvas.height !== tlH) {
    mainCanvas.width = tlW;
    mainCanvas.height = tlH;
  }
  const img = mctx.createImageData(tlW, tlH);
  for (let i = 0; i < tlFrame.length; i++) {
    const hex = tlGetColor(tlFrame[i]);
    img.data[i*4]   = parseInt(hex.slice(1,3),16)||0;
    img.data[i*4+1] = parseInt(hex.slice(3,5),16)||0;
    img.data[i*4+2] = parseInt(hex.slice(5,7),16)||0;
    img.data[i*4+3] = 255;
  }
  mctx.putImageData(img, 0, 0);
}

function tlGetColor(idx) {
  return (typeof PALETTE !== 'undefined' && PALETTE[idx]) ? PALETTE[idx].c : '#000000';
}

function tlUpdateProgressUI() {
  const pct = tlMaxTime ? Math.min(100, Math.round((tlCurrentTime / tlMaxTime) * 100)) : 0;
  document.querySelectorAll('.tl-progress-fill, .tl-fs-progress-fill').forEach(el => el.style.width = pct + '%');

  // Двигаем ручку-скруббер через CSS-переменную
  document.querySelectorAll('.tl-fs-progress-track').forEach(el =>
    el.style.setProperty('--tl-scrubber-pos', pct + '%')
  );

  // Форматируем время как MM:SS или SS.s
  const fmt = ms => {
    if (ms >= 60000) {
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    return (ms / 1000).toFixed(1) + 'с';
  };

  const curFmt = fmt(tlCurrentTime);
  const maxFmt = fmt(tlMaxTime);

  document.querySelectorAll('.tl-progress-label').forEach(el => {
    // Если это fullscreen-лейбл (содержит tl-time-current) — рендерим с акцентом
    if (el.classList.contains('tl-fs-progress-count')) {
      el.innerHTML = `<span class="tl-time-current">${curFmt}</span><span class="tl-time-sep">/</span>${maxFmt}`;
    } else {
      el.textContent = `${curFmt} / ${maxFmt}`;
    }
  });
}

// ── Автоцентрирование ────────────────────────────────────────
function tlSetAutocenter(on) {
  tlAutocenter = on;
  const btn = document.getElementById('tl-autocenter-btn');
  if (btn) btn.classList.toggle('active', on);
  if (on) tlDoCenterCamera();
}

function tlDoCenterCamera() {
  if (!tlW || !tlH) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  // Чуть меньший зум чтобы холст влез с отступами
  const zh = Math.floor(Math.min(vw / tlW, vh / tlH) * 0.85);
  const z = Math.max(1, Math.min(zh, 8));
  camX = vw/2 - tlW*z/2;
  camY = vh/2 - tlH*z/2;
  camZoom = z;
  targetCamX = camX; targetCamY = camY; targetCamZoom = camZoom;
  applyTransform();
}

// Перехватчик: если пользователь двигает камеру — отключаем автоцентр
function tlDisableAutocenterOnInteract() {
  if (tlAutocenter && tlFullscreen) {
    tlAutocenter = false;
    const btn = document.getElementById('tl-autocenter-btn');
    if (btn) btn.classList.remove('active');
  }
}

// ── Воспроизведение ──────────────────────────────────────────
function tlPlay() {
  if (!tlFrame) return;
  tlPlaying = !tlPlaying;
  document.querySelectorAll('.tl-play-btn-sync').forEach(b => b.textContent = tlPlaying ? '⏸' : '▶');
  if (tlPlaying) {
    tlLastRealTime = performance.now();
    tlTimer = requestAnimationFrame(tlTick);
  } else {
    cancelAnimationFrame(tlTimer);
    tlTimer = null;
  }
}

function tlTick(now) {
  if (!tlPlaying) return;

  // Сколько реального времени прошло с прошлого кадра
  const realDelta = now - tlLastRealTime;
  tlLastRealTime = now;

  // Двигаем виртуальное время вперёд с учётом скорости
  tlCurrentTime = Math.min(tlMaxTime, tlCurrentTime + realDelta * tlSpeed);

  // Применяем ВСЕ события, timestamp которых ≤ tlCurrentTime (одним пакетом)
  while (tlPlayIndex < tlEvents.length && tlEvents[tlPlayIndex].t <= tlCurrentTime) {
    const ev = tlEvents[tlPlayIndex++];
    tlFrame[ev.y * tlW + ev.x] = ev.c;
  }

  if (tlFullscreen) tlDrawMainCanvas(); else tlDrawMiniFrame();
  tlUpdateProgressUI();

  if (tlCurrentTime >= tlMaxTime) {
    tlPlaying = false;
    document.querySelectorAll('.tl-play-btn-sync').forEach(b => b.textContent = '▶');
    return;
  }
  tlTimer = requestAnimationFrame(tlTick);
}

function tlResetPlayer() {
  tlPlaying = false;
  cancelAnimationFrame(tlTimer);
  tlTimer = null;
  tlCurrentTime = 0;
  tlPlayIndex = 0;
  document.querySelectorAll('.tl-play-btn-sync').forEach(b => b.textContent = '▶');
  if (tlSnapshot) {
    tlFrame = new Uint8Array(tlSnapshot);
    if (tlFullscreen) {
      tlDrawMainCanvas();
    } else {
      tlDrawMiniFrame();
    }
    tlUpdateProgressUI();
  }
}

function tlSeekFromBar(event, barId) {
  if (!tlFrame || !tlEvents.length || !tlMaxTime) return;
  const bar = document.getElementById(barId || 'tl-progress-bar-bg');
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const targetTime = Math.round(pct * tlMaxTime);

  // Перестраиваем кадр от снапшота до targetTime
  tlFrame = new Uint8Array(tlSnapshot);
  tlPlayIndex = 0;
  while (tlPlayIndex < tlEvents.length && tlEvents[tlPlayIndex].t <= targetTime) {
    const ev = tlEvents[tlPlayIndex++];
    tlFrame[ev.y * tlW + ev.x] = ev.c;
  }
  tlCurrentTime = targetTime;

  if (tlFullscreen) tlDrawMainCanvas(); else tlDrawMiniFrame();
  tlUpdateProgressUI();
}

function tlSeek(event) { tlSeekFromBar(event, 'tl-progress-bar-bg'); }
function tlSeekFs(event) { tlSeekFromBar(event, 'tl-fs-progress-bar-bg'); }

function tlSetSpeed(n) {
  tlSpeed = n;
  document.querySelectorAll('.tl-speed-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.speed) === n);
  });
}

function tlExportFrame() {
  // Экспортируем из мини-канваса всегда
  const canvas = document.getElementById('tl-canvas');
  if (!canvas || !tlFrame) return;
  tlDrawMiniFrame(); // убедимся что актуальный кадр
  const link = document.createElement('a');
  link.download = `timelapse_${tlSelectedSessionId || 'frame'}_${tlPlayIndex}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Полноэкранный режим на основном канвасе ──────────────────
function tlToggleFullscreen() {
  if (!tlFrame) return; // нет данных — нельзя открыть
  tlFullscreen = !tlFullscreen;

  const hud = document.getElementById('tl-fs-hud');
  const uiLayer = document.getElementById('ui');
  const gameRoot = document.getElementById('game-root');

  if (tlFullscreen) {
    // Закрываем все панели (в т.ч. админку) перед входом в полный экран
    if (typeof hideAllPanels === 'function') hideAllPanels();

    // Сохраняем состояние камеры и канваса игры
    _tlSavedCam = { camX, camY, camZoom, targetCamX, targetCamY, targetCamZoom };
    _tlSavedCanvasData = new Uint8Array(canvasData);

    // Переключаем размер основного канваса под тайм-лапс
    mainCanvas.width = tlW;
    mainCanvas.height = tlH;

    // Рендерим текущий кадр на основной канвас
    tlDrawMainCanvas();
    applyTransform();

    // Прячем основной UI
    if (uiLayer) uiLayer.style.display = 'none';

    // Показываем HUD тайм-лапса
    if (hud) hud.style.display = 'flex';

    // Обновляем лейбл сессии в HUD
    const sessionLabel = document.getElementById('tl-fs-session-label');
    if (sessionLabel) sessionLabel.textContent = tlSelectedSessionId || '';

    // Центрируем камеру
    tlAutocenter = true;
    const btn = document.getElementById('tl-autocenter-btn');
    if (btn) btn.classList.add('active');
    tlDoCenterCamera();

    // Вешаем перехватчики на события камеры
    document.addEventListener('keydown', tlHandleFsEscape);
    wrap.addEventListener('mousedown', tlOnCamInteract, true);
    wrap.addEventListener('wheel', tlOnCamInteract, true);
    wrap.addEventListener('touchstart', tlOnCamInteract, true);

    showToast('Тайм-лапс: используйте колесо/перетаскивание для навигации', 'info');
  } else {
    tlExitFullscreen();
  }
}

function tlExitFullscreen() {
  if (!tlFullscreen) return;
  tlFullscreen = false;
  tlPlaying = false;
  cancelAnimationFrame(tlTimer);
  tlTimer = null;
  document.querySelectorAll('.tl-play-btn-sync').forEach(b => b.textContent = '▶');

  const hud = document.getElementById('tl-fs-hud');
  const uiLayer = document.getElementById('ui');

  // Прячем HUD
  if (hud) hud.style.display = 'none';

  // Возвращаем основной UI
  if (uiLayer) uiLayer.style.display = '';

  // Восстанавливаем холст игры
  if (_tlSavedCanvasData) {
    canvasData.set(_tlSavedCanvasData.slice(0, canvasData.length));
  }
  mainCanvas.width = canvasW;
  mainCanvas.height = canvasH;
  fullRender(canvasData);

  // Восстанавливаем камеру
  if (_tlSavedCam) {
    camX = _tlSavedCam.camX; camY = _tlSavedCam.camY; camZoom = _tlSavedCam.camZoom;
    targetCamX = _tlSavedCam.targetCamX; targetCamY = _tlSavedCam.targetCamY;
    targetCamZoom = _tlSavedCam.targetCamZoom;
    applyTransform();
  }

  // Обновляем мини-превью
  tlDrawMiniFrame();

  document.removeEventListener('keydown', tlHandleFsEscape);
  wrap.removeEventListener('mousedown', tlOnCamInteract, true);
  wrap.removeEventListener('wheel', tlOnCamInteract, true);
  wrap.removeEventListener('touchstart', tlOnCamInteract, true);

  _tlSavedCam = null;
}

function tlOnCamInteract() {
  tlDisableAutocenterOnInteract();
}

function tlHandleFsEscape(e) {
  if (e.key === 'Escape' && tlFullscreen) tlExitFullscreen();
}

window.addEventListener('resize', () => {
  if (tlFullscreen && tlAutocenter) tlDoCenterCamera();
});