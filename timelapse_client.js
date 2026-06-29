'use strict';
// ════════════════════════════════════════════════════════════
//  TIMELAPSE — клиентская часть админ-панели
//  Подключается через admin_cmd (WS) и REST /api/timelapse/*
// ════════════════════════════════════════════════════════════

let tlSessions = [];
let tlSelectedSessionId = null;
let tlSnapshot = null;      // Uint8Array, исходный холст сессии
let tlEvents = [];          // [{x,y,c}, ...] последовательные изменения пикселей
let tlFrame = null;         // Uint8Array текущего кадра (snapshot + применённые events)
let tlPlayIndex = 0;        // сколько событий уже применено
let tlSpeed = 100;           // событий за тик воспроизведения
let tlPlaying = false;
let tlTimer = null;
let tlW = 0, tlH = 0;

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
      <div class="tl-sess-arrow">›</div>
    </div>`;
  }).join('');
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
    tlSnapshot = new Uint8Array(snapBuf);
    bar.style.width = '40%';

    // Размер холста сессии (если сервер не передал — берём текущий холст игры)
    const sess = tlSessions.find(s => s.id === tlSelectedSessionId);
    tlW = (sess && sess.w) || canvasW;
    tlH = (sess && sess.h) || canvasH;

    status.textContent = 'Загрузка событий...';
    const evRes = await fetch(getApiUrl() + `/timelapse/events/${tlSelectedSessionId}`);
    if (!evRes.ok) throw new Error('события: HTTP ' + evRes.status);
    const evBuf = new Uint8Array(await evRes.arrayBuffer());
    bar.style.width = '80%';

    tlEvents = [];
    for (let i = 0; i + 4 < evBuf.length; i += 5) {
      tlEvents.push({
        x: (evBuf[i] << 8) | evBuf[i + 1],
        y: (evBuf[i + 2] << 8) | evBuf[i + 3],
        c: evBuf[i + 4],
      });
    }

    bar.style.width = '100%';
    tlSetupCanvas();
    tlResetPlayer();
    document.getElementById('tl-play-btn').disabled = false;
    document.getElementById('tl-reset-btn').disabled = false;
    document.getElementById('tl-export-btn').disabled = false;
    status.textContent = `Готово: ${tlEvents.length.toLocaleString()} событий`;
  } catch (e) {
    status.textContent = 'Ошибка: ' + e.message;
  } finally {
    if (prepBtn) prepBtn.disabled = false;
  }
}

function tlSetupCanvas() {
  const canvas = document.getElementById('tl-canvas');
  canvas.width = tlW;
  canvas.height = tlH;
  const maxDisplay = 480;
  const scale = Math.max(1, Math.floor(maxDisplay / Math.max(tlW, tlH)));
  canvas.style.width = (tlW * scale) + 'px';
  canvas.style.height = (tlH * scale) + 'px';
}

function tlGetColor(idx) {
  return (typeof PALETTE !== 'undefined' && PALETTE[idx]) ? PALETTE[idx] : '#000';
}

function tlDrawFrame() {
  const canvas = document.getElementById('tl-canvas');
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(tlW, tlH);
  for (let i = 0; i < tlFrame.length; i++) {
    const hex = tlGetColor(tlFrame[i]);
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function tlUpdateProgressUI() {
  const total = tlEvents.length;
  const pct = total ? Math.round((tlPlayIndex / total) * 100) : 0;
  document.getElementById('tl-progress-fill').style.width = pct + '%';
  document.getElementById('tl-progress-label').textContent = `${tlPlayIndex.toLocaleString()} / ${total.toLocaleString()}`;
}

// ── Воспроизведение ──────────────────────────────────────────
function tlPlay() {
  if (!tlFrame) return;
  tlPlaying = !tlPlaying;
  const btn = document.getElementById('tl-play-btn');
  btn.textContent = tlPlaying ? '⏸' : '▶';
  if (tlPlaying) tlTick();
  else clearTimeout(tlTimer);
}

function tlTick() {
  if (!tlPlaying) return;
  const step = Math.max(1, Math.round(tlSpeed / 10));
  for (let n = 0; n < step && tlPlayIndex < tlEvents.length; n++, tlPlayIndex++) {
    const ev = tlEvents[tlPlayIndex];
    tlFrame[ev.y * tlW + ev.x] = ev.c;
  }
  tlDrawFrame();
  tlUpdateProgressUI();
  if (tlPlayIndex >= tlEvents.length) {
    tlPlaying = false;
    document.getElementById('tl-play-btn').textContent = '▶';
    return;
  }
  tlTimer = setTimeout(tlTick, 16);
}

function tlResetPlayer() {
  tlPlaying = false;
  clearTimeout(tlTimer);
  const btn = document.getElementById('tl-play-btn');
  if (btn) btn.textContent = '▶';
  if (tlSnapshot) {
    tlFrame = new Uint8Array(tlSnapshot);
    tlPlayIndex = 0;
    tlDrawFrame();
    tlUpdateProgressUI();
  }
}

function tlSeek(event) {
  if (!tlFrame || !tlEvents.length) return;
  const bar = document.getElementById('tl-progress-bar-bg');
  const rect = bar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const targetIndex = Math.round(pct * tlEvents.length);

  // Пересобираем кадр с начала до целевого индекса (события идемпотентны для одного пикселя)
  tlFrame = new Uint8Array(tlSnapshot);
  for (let i = 0; i < targetIndex; i++) {
    const ev = tlEvents[i];
    tlFrame[ev.y * tlW + ev.x] = ev.c;
  }
  tlPlayIndex = targetIndex;
  tlDrawFrame();
  tlUpdateProgressUI();
}

function tlSetSpeed(n) {
  tlSpeed = n;
  document.querySelectorAll('.tl-speed-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.speed, 10) === n);
  });
}

function tlExportFrame() {
  const canvas = document.getElementById('tl-canvas');
  const link = document.createElement('a');
  link.download = `timelapse_${tlSelectedSessionId || 'frame'}_${tlPlayIndex}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}