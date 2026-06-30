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
let tlW = 0, tlH = 0;          // размер холста В ТЕКУЩИЙ МОМЕНТ воспроизведения (меняется resize-событиями)
let tlOrigW = 0, tlOrigH = 0;  // размер холста НА МОМЕНТ НАЧАЛА сессии (соответствует снапшоту)
const TL_RESIZE_SENTINEL = 0xFF; // должно совпадать с RESIZE_SENTINEL в timelapse_server.js
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
  const recording = !!d.recording;

  // ── Индикатор внутри админ-панели (может отсутствовать в DOM, если
  //    панель ещё не была открыта — это не повод прерывать функцию,
  //    глобальный индикатор в топ-баре должен обновиться в любом случае) ──
  const dot = document.getElementById('tl-rec-dot');
  if (dot) {
    const title = document.getElementById('tl-rec-title');
    const info = document.getElementById('tl-rec-info');
    const startBtn = document.getElementById('tl-rec-start');
    const stopBtn = document.getElementById('tl-rec-stop');

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

  // ── Глобальный индикатор записи в топ-баре (виден всегда, не только
  //    при открытой админ-панели) ──
  tlUpdateTopBarIndicator(d, recording);
}

// Круглый индикатор слева от top-bar с тултипом при наведении
function tlUpdateTopBarIndicator(d, recording) {
  const wrap = document.getElementById('tl-rec-indicator');
  if (!wrap) return;
  wrap.style.display = recording ? 'flex' : 'none';
  if (!recording) return;

  const sub = document.getElementById('tl-rec-indicator-tip-sub');
  if (sub) {
    const parts = [];
    if (typeof d.pixelCount === 'number') parts.push(`${d.pixelCount.toLocaleString()} пикс.`);
    if (d.startedAt) parts.push('с ' + new Date(d.startedAt).toLocaleTimeString());
    sub.textContent = parts.join(' · ') || 'Идёт запись изменений холста';
  }
}

// Периодический опрос статуса записи для глобального индикатора —
// сервер шлёт timelapse_status только в ответ на запрос внутри admin_cmd,
// поэтому без поллинга индикатор не узнает о текущем состоянии до тех пор,
// пока кто-то не откроет админ-панель. Опрашиваем редко, без нагрузки.
let tlStatusPollTimer = null;
function tlStartStatusPolling() {
  if (tlStatusPollTimer) return;
  tlRefreshStatus();
  tlStatusPollTimer = setInterval(tlRefreshStatus, 15000);
}
function tlStopStatusPolling() {
  if (tlStatusPollTimer) { clearInterval(tlStatusPollTimer); tlStatusPollTimer = null; }
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
    tlOrigW = tlW;
    tlOrigH = tlH;

    status.textContent = 'Загрузка событий...';
    const evRes = await fetch(getApiUrl() + `/timelapse/events/${tlSelectedSessionId}`);
    if (!evRes.ok) throw new Error('события: HTTP ' + evRes.status);
    const evBuf = new Uint8Array(await evRes.arrayBuffer());
    bar.style.width = '80%';

    tlEvents = [];
    for (let i = 0; i + 9 <= evBuf.length; i += 9) {
      const c = evBuf[i + 4];
      const t = ((evBuf[i + 5] << 24) | (evBuf[i + 6] << 16) | (evBuf[i + 7] << 8) | evBuf[i + 8]) >>> 0;
      if (c === TL_RESIZE_SENTINEL) {
        // Служебное событие: x/y несут новый размер холста (newW/newH), а не координаты.
        tlEvents.push({
          resize: true,
          w: (evBuf[i] << 8) | evBuf[i + 1],
          h: (evBuf[i + 2] << 8) | evBuf[i + 3],
          t,
        });
      } else {
        tlEvents.push({
          x: (evBuf[i] << 8) | evBuf[i + 1],
          y: (evBuf[i + 2] << 8) | evBuf[i + 3],
          c,
          t,
        });
      }
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
    const vidBtn = document.getElementById('tl-video-export-btn');
    if (vidBtn) vidBtn.disabled = false;
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

  // Резервируем место под HUD-хром: топбар (~60px) и нижний тайм-лайн (~110px),
  // плюс небольшие боковые поля — чтобы пиксельный холст не упирался в края.
  const padTop = 72, padBottom = 120, padSide = 24;
  const availW = vw - padSide * 2;
  const availH = vh - padTop - padBottom;

  // Используем float-масштаб (в отличие от Math.floor), чтобы холст всегда
  // занимал ровно столько пространства, сколько есть, без пустых полос.
  // Ограничиваем снизу 1 (каждый пиксель виден) и сверху 32 (не больше ×32).
  let z = Math.min(availW / tlW, availH / tlH) * 0.95;
  z = Math.max(1, Math.min(z, 32));

  camX = vw / 2 - (tlW * z) / 2;
  camY = padTop + availH / 2 - (tlH * z) / 2;
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

// Перестраивает tlFrame под новый размер холста (вызывается при обработке
// служебного RESIZE-события). Старые пиксели остаются в левом верхнем углу
// (так же, как делает сервер при реальном ресайзе), новая область — белая (0).
function tlGrowFrame(newW, newH) {
  const grown = new Uint8Array(newW * newH); // 0 = индекс белого цвета в палитре
  const minW = Math.min(tlW, newW), minH = Math.min(tlH, newH);
  for (let y = 0; y < minH; y++) {
    for (let x = 0; x < minW; x++) {
      grown[y * newW + x] = tlFrame[y * tlW + x];
    }
  }
  tlFrame = grown;
  tlW = newW;
  tlH = newH;
}

// Применяет одно событие (пиксель ИЛИ resize) к текущему tlFrame.
// Возвращает true, если это было resize-событие (значит, размер кадра поменялся
// и нужно пересчитать центрирование камеры/размеры канваса).
function tlApplyEvent(ev) {
  if (ev.resize) {
    if (ev.w !== tlW || ev.h !== tlH) tlGrowFrame(ev.w, ev.h);
    return true;
  }
  tlFrame[ev.y * tlW + ev.x] = ev.c;
  return false;
}

// После обработки пачки событий вызывается, если среди них был resize —
// обновляет размеры канвасов и (если включено) перецентрирует камеру,
// чтобы холст всегда оставался видимым целиком, независимо от того, в
// какой момент сессии произошло изменение размера.
function tlHandleSizeChanged() {
  if (tlFullscreen) {
    mainCanvas.width = tlW;
    mainCanvas.height = tlH;
    if (tlAutocenter) tlDoCenterCamera();
  } else {
    tlSetupMiniCanvas();
  }
}

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
  let sizeChanged = false;
  while (tlPlayIndex < tlEvents.length && tlEvents[tlPlayIndex].t <= tlCurrentTime) {
    const ev = tlEvents[tlPlayIndex++];
    if (tlApplyEvent(ev)) sizeChanged = true;
  }
  if (sizeChanged) tlHandleSizeChanged();

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
    tlW = tlOrigW;
    tlH = tlOrigH;
    tlFrame = new Uint8Array(tlSnapshot);
    tlHandleSizeChanged();
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

  // Перестраиваем кадр от снапшота до targetTime — размер тоже сбрасываем
  // к исходному и заново применяем все resize-события по пути, чтобы кадр
  // на любой произвольной точке таймлайна был геометрически корректным.
  tlW = tlOrigW;
  tlH = tlOrigH;
  tlFrame = new Uint8Array(tlSnapshot);
  tlPlayIndex = 0;
  let sizeChanged = false;
  while (tlPlayIndex < tlEvents.length && tlEvents[tlPlayIndex].t <= targetTime) {
    const ev = tlEvents[tlPlayIndex++];
    if (tlApplyEvent(ev)) sizeChanged = true;
  }
  tlCurrentTime = targetTime;
  if (sizeChanged) tlHandleSizeChanged();

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

// ── Экспорт одного PNG-кадра (кнопка 📸 в HUD) ─────────────
function tlExportFrame() {
  const canvas = document.getElementById('tl-canvas');
  if (!canvas || !tlFrame) return;
  tlDrawMiniFrame();
  const link = document.createElement('a');
  link.download = `timelapse_${tlSelectedSessionId || 'frame'}_${tlPlayIndex}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Открывает диалог видео-экспорта
function tlOpenVideoExport() {
  if (!tlSnapshot || !tlEvents.length) {
    showToast('Сначала загрузи сессию (кнопка «Загрузить»)', 'error');
    return;
  }
  _tlExpSpeed = tlSpeed; // предустанавливаем текущую скорость плеера
  tlShowExportModal();
  // Подсвечиваем нужную кнопку скорости в модале
  setTimeout(() => tlExpSelectSpeed(_tlExpSpeed), 0);
}

// ── Экспорт видео (MP4 / WebM) ───────────────────────────────
// Логика экспорта специально изолирована в отдельные переменные,
// чтобы не затронуть текущее состояние плеера (tlFrame, tlCurrentTime и т.д.).

let tlExportCancelled = false;

// Определяем лучший поддерживаемый формат (MP4 предпочтителен — маленький файл,
// широкая совместимость; если не поддерживается — WebM с VP9 или базовый WebM).
function tlGetExportMimeType() {
  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'video/webm'; // последний fallback
}

function tlShowExportModal() {
  let modal = document.getElementById('tl-export-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'tl-export-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;
      display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div>
        <div style="font-size:2rem;margin-bottom:8px">🎬</div>
        <div id="tl-exp-title">Экспорт видео</div>
        <div id="tl-exp-sub">Подготовка…</div>

        <!-- Настройки скорости экспорта -->
        <div id="tl-exp-settings" style="margin-bottom:20px;text-align:left">
          <label style="display:block;margin-bottom:6px">Скорость тайм-лапса в видео:</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${[10,25,50,100,200,500,1000].map(s =>
              `<button class="tl-speed-btn tl-exp-speed-btn${s===100?' active':''}" data-speed="${s}"
                data-onclick="tlExpSelectSpeed(${s})">${s < 1000 ? '×'+s : '×'+(s/1000)+'k'}</button>`
            ).join('')}
          </div>
          <label style="display:block;margin-top:12px;margin-bottom:6px">Качество видео:</label>
          <div style="display:flex;gap:6px">
            <button class="tl-speed-btn tl-exp-qual-btn" data-qual="720"
              data-onclick="tlExpSelectQual(720)">720p</button>
            <button class="tl-speed-btn tl-exp-qual-btn active" data-qual="1080"
              data-onclick="tlExpSelectQual(1080)">1080p</button>
            <button class="tl-speed-btn tl-exp-qual-btn" data-qual="2160"
              data-onclick="tlExpSelectQual(2160)">4K</button>
          </div>
          <div style="margin-top:14px">
            <button class="tl-btn tl-btn-primary" style="width:100%"
              data-onclick="tlStartExport()">▶ Начать экспорт</button>
          </div>
        </div>

        <!-- Прогресс (скрыт до начала) -->
        <div id="tl-exp-progress-wrap" style="display:none">
          <div style="margin-bottom:10px">
            <div id="tl-exp-bar" style="width:0%"></div>
          </div>
          <div id="tl-exp-pct">0%</div>
          <button class="tl-btn tl-btn-danger" style="margin-top:14px;width:100%"
            data-onclick="tlCancelExport()">Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  document.getElementById('tl-exp-settings').style.display = '';
  document.getElementById('tl-exp-progress-wrap').style.display = 'none';
  document.getElementById('tl-exp-title').textContent = 'Экспорт видео';
  const mime = tlGetExportMimeType();
  const ext  = mime.startsWith('video/mp4') ? 'MP4' : 'WebM';
  document.getElementById('tl-exp-sub').textContent =
    `Формат: ${ext} · ${tlEvents.length.toLocaleString()} событий`;
}

function tlHideExportModal() {
  const m = document.getElementById('tl-export-modal');
  if (m) m.style.display = 'none';
}

let _tlExpSpeed = 100;  // скорость экспорта
let _tlExpQual  = 1080; // высота в пикселях выходного видео

function tlExpSelectSpeed(s) {
  _tlExpSpeed = s;
  document.querySelectorAll('.tl-exp-speed-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.speed) === s));
}
function tlExpSelectQual(q) {
  _tlExpQual = q;
  document.querySelectorAll('.tl-exp-qual-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.qual) === q));
}

async function tlStartExport() {
  if (!tlSnapshot || !tlEvents.length) return;

  tlExportCancelled = false;
  document.getElementById('tl-exp-settings').style.display = 'none';
  document.getElementById('tl-exp-progress-wrap').style.display = '';

  const mime   = tlGetExportMimeType();
  const ext    = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const FPS    = 60;
  const speed  = _tlExpSpeed;
  const qual   = _tlExpQual;

  // Размер выходного кадра: масштабируем исходный холст до нужного качества
  // сохраняя соотношение сторон, округляя до чётного (требование кодека).
  const scale  = Math.max(1, Math.floor(qual / Math.max(tlOrigH, 1)));
  // Начальный размер — будет пересчитываться при resize-событиях
  let expW = tlOrigW * scale;
  let expH = tlOrigH * scale;
  expW += expW % 2; expH += expH % 2;

  // Офлайн-канвас для рендера кадров
  const offCanvas = document.createElement('canvas');
  offCanvas.width  = expW;
  offCanvas.height = expH;
  const offCtx = offCanvas.getContext('2d', { alpha: false });
  offCtx.imageSmoothingEnabled = false;

  // Промежуточный "пиксельный" канвас — рисуем на нём 1px:1px, затем масштабируем
  const pixCanvas = document.createElement('canvas');
  const pixCtx    = pixCanvas.getContext('2d', { alpha: false });
  pixCtx.imageSmoothingEnabled = false;

  // Клонируем начальный кадр — не трогаем глобальные tlFrame/tlW/tlH
  let expW0 = tlOrigW, expH0 = tlOrigH;
  let expFrame = new Uint8Array(tlSnapshot);

  // Функция «нарисовать expFrame на offCanvas с нужным масштабом»
  function drawExpFrame(curW, curH) {
    const curScale = Math.max(1, Math.floor(qual / Math.max(curH, 1)));
    const dstW = curW * curScale + (curW * curScale) % 2;
    const dstH = curH * curScale + (curH * curScale) % 2;

    if (pixCanvas.width !== curW || pixCanvas.height !== curH) {
      pixCanvas.width  = curW;
      pixCanvas.height = curH;
    }
    if (offCanvas.width !== dstW || offCanvas.height !== dstH) {
      offCanvas.width  = dstW;
      offCanvas.height = dstH;
    }

    const img = pixCtx.createImageData(curW, curH);
    for (let i = 0; i < expFrame.length; i++) {
      const hex = tlGetColor(expFrame[i]);
      img.data[i*4]   = parseInt(hex.slice(1,3),16)||0;
      img.data[i*4+1] = parseInt(hex.slice(3,5),16)||0;
      img.data[i*4+2] = parseInt(hex.slice(5,7),16)||0;
      img.data[i*4+3] = 255;
    }
    pixCtx.putImageData(img, 0, 0);
    offCtx.drawImage(pixCanvas, 0, 0, dstW, dstH);
  }

  // Захватываем поток с offCanvas (скорость захвата = FPS)
  const stream   = offCanvas.captureStream(FPS);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  } catch {
    // Если указанный mime не прошёл — попробуем без параметров
    recorder = new MediaRecorder(stream);
  }

  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start(100); // запрашивать данные каждые 100 мс

  // Перебираем все события с правильным темпом: каждый «виртуальный» кадр
  // (1000ms / FPS мс реального времени = speed * (1000/FPS) мс сессии) рисуем.
  const msPerFrame = speed * (1000 / FPS); // мс сессии на один выходной кадр
  const totalFrames = Math.ceil(tlMaxTime / msPerFrame) || 1;

  let evIdx = 0;
  let curW = expW0, curH = expH0;

  for (let frame = 0; frame <= totalFrames && !tlExportCancelled; frame++) {
    const virtualTime = frame * msPerFrame;

    // Применяем все события до virtualTime
    while (evIdx < tlEvents.length && tlEvents[evIdx].t <= virtualTime) {
      const ev = tlEvents[evIdx++];
      if (ev.resize) {
        // Resize: перестраиваем кадр под новый размер
        const grown = new Uint8Array(ev.w * ev.h);
        const mw = Math.min(curW, ev.w), mh = Math.min(curH, ev.h);
        for (let y = 0; y < mh; y++)
          for (let x = 0; x < mw; x++)
            grown[y * ev.w + x] = expFrame[y * curW + x];
        expFrame = grown;
        curW = ev.w; curH = ev.h;
      } else {
        expFrame[ev.y * curW + ev.x] = ev.c;
      }
    }

    drawExpFrame(curW, curH);

    // Обновляем прогресс-бар примерно раз в 30 кадров (не тормозим UI)
    if (frame % 30 === 0) {
      const pct = Math.round((frame / totalFrames) * 100);
      const bar = document.getElementById('tl-exp-bar');
      const pctEl = document.getElementById('tl-exp-pct');
      if (bar) bar.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      // Уступаем UI-потоку, чтобы браузер мог перерисовать прогресс и
      // MediaRecorder успел захватить кадры с captureStream
      await new Promise(r => setTimeout(r, 0));
    }
  }

  recorder.stop();

  if (tlExportCancelled) {
    tlHideExportModal();
    return;
  }

  // Ждём onStop (финальный dataavailable), затем собираем файл
  await new Promise(r => { recorder.onstop = r; });
  const blob = new Blob(chunks, { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.download = `timelapse_${tlSelectedSessionId || 'export'}_x${speed}.${ext}`;
  a.href     = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  tlHideExportModal();
  showToast(`Видео сохранено (${ext.toUpperCase()}, ×${speed})`, 'success');
}

function tlCancelExport() {
  tlExportCancelled = true;
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
  } else {
    // На случай если сохранённой камеры почему-то нет — всё равно нужно
    // перерисовать оверлей (он был отключён всё время, пока tlFullscreen===true),
    // иначе трафарет/сетка останутся невидимыми до следующего взаимодействия.
    renderOverlay();
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