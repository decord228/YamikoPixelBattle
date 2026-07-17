'use strict';

// ── INIT ──
window.addEventListener('resize',()=>{applyTransform();resizeOverlay();updateAllCursorFlags();checkMiniMode();});

// ── MINI MODE ──
// Discord может свернуть Activity в маленькое плавающее окно (например,
// когда пользователь сворачивает голосовую панель). Обычный UI в такой
// крошечной области нечитаем и неюзабелен, поэтому вместо него показываем
// заглушку с логотипом и просьбой развернуть окно (см. #mini-mode-screen
// в index.html). Работает только внутри Discord Activity — обычный узкий
// браузер (мобильный режим) вход в мини-режим не триггерит, т.к. телефон
// в портретной ориентации хоть и узкий, но высокий (высота остаётся большой).
const MINI_MODE_MAX_W = 400;
const MINI_MODE_MAX_H = 280;

function checkMiniMode() {
  if (typeof IS_DISCORD_ACTIVITY === 'undefined' || !IS_DISCORD_ACTIVITY) return;
  const isMini = window.innerWidth <= MINI_MODE_MAX_W && window.innerHeight <= MINI_MODE_MAX_H;
  document.body.classList.toggle('mini-mode', isMini);
}

async function init() {
  checkMiniMode();
  initCanvases();
  buildColorGrid();
  buildEmojiAvatarPicker();
  drawAvatarCanvas(selectedEmoji);
  drawHudAvatar(selectedEmoji);
  centerCamera();
  document.getElementById('stat-canvas-size').textContent = `${canvasW}×${canvasH}`;

  // Открываем палитру при старте и зажигаем новую кнопку
  document.getElementById('palette-panel').style.display = 'block';
  const palBtn = document.getElementById('btn-palette');
  if (palBtn) palBtn.classList.add('active');

  if (IS_DISCORD_ACTIVITY) {
    await initDiscordActivity();
  } else {
    await finishWebsiteDiscordLogin();
    connect();
  }
}

// Экземпляр Discord SDK хранится глобально (не только внутри
// initDiscordActivity), чтобы им могли пользоваться другие части кода —
// например, клик по рекламному баннеру должен открывать внешнюю ссылку через
// discordSdk.commands.openExternalLink(), а не window.open(), который молча
// блокируется песочницей iframe Discord Activity (нет allow-popups).
let discordSdk = null;
let websiteDiscordToken = sessionStorage.getItem('pb_discord_access_token') || '';

function beginDiscordLogin() {
  const state = crypto.randomUUID();
  sessionStorage.setItem('pb_discord_oauth_state', state);
  const query = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_WEB_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  window.location.assign(`https://discord.com/oauth2/authorize?${query}`);
}

async function finishWebsiteDiscordLogin() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  const state = params.get('state');
  const expectedState = sessionStorage.getItem('pb_discord_oauth_state');
  sessionStorage.removeItem('pb_discord_oauth_state');
  history.replaceState({}, document.title, window.location.pathname);
  if (!state || state !== expectedState) {
    showToast('Не удалось подтвердить вход через Discord', 'error');
    return;
  }

  try {
    const response = await fetch(`${getApiUrl()}/discord-web-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: DISCORD_WEB_REDIRECT_URI }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) throw new Error(data.error || 'Token exchange failed');
    websiteDiscordToken = data.access_token;
    sessionStorage.setItem('pb_discord_access_token', websiteDiscordToken);
  } catch (e) {
    console.error('[Discord] Website login failed:', e);
    showToast('Не удалось войти через Discord', 'error');
  }
}

// Публикуем Rich Presence для Activity. Discord сам связывает кнопку
// «Запросить вход» с sdk.instanceId, поэтому секрет комнаты для Embedded
// Activity не нужен. Поле party только показывает друзьям, сколько мест
// доступно в этой сессии.
async function publishDiscordPresence(sdk) {
  try {
    await sdk.commands.setActivity({
      activity: {
        type: 0,
        details: 'Рисует на общем полотне',
        state: 'Pixel Battle',
        party: { size: [1, 5] },
      },
    });
  } catch (e) {
    console.warn('[Discord] Не удалось обновить Rich Presence:', JSON.stringify(e));
  }
}

async function initDiscordActivity() {
  let sdk;
  try {
    sdk = new window.DiscordSDK(DISCORD_CLIENT_ID);
    discordSdk = sdk;
    await sdk.ready();
    console.log('[Discord] SDK ready, instanceId:', sdk.instanceId);
  } catch (e) {
    console.error('[Discord] SDK init/ready failed:', JSON.stringify(e), e);
    connect();
    return;
  }

  try {
    // Авторизуем пользователя через Discord OAuth2
    // ВАЖНО: redirect_uri нельзя передавать в authorize() — это запрещено
    // Discord Activity SDK (ошибка 5000). Сервер сам знает нужный URI.
    const authorizeResult = await sdk.commands.authorize({
      client_id:     DISCORD_CLIENT_ID,
      response_type: 'code',
      prompt:        'consent',
      scope:         ['identify', 'rpc.activities.write'],
    });

    console.log('[Discord] authorize result:', JSON.stringify(authorizeResult));
    const code = authorizeResult?.code;

    if (!code) {
      throw new Error('authorize() не вернул code: ' + JSON.stringify(authorizeResult));
    }

    // Меняем code на access_token через наш бэкенд.
    // redirect_uri не передаём — сервер сам подставит правильный из env.
    // /api проксируется Discord'ом, поэтому fetch работает внутри Activity
    const tokenRes = await fetch('/api/discord-token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`/api/discord-token вернул ${tokenRes.status}: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const access_token = tokenData?.access_token;

    if (!access_token) {
      throw new Error('Сервер не вернул access_token: ' + JSON.stringify(tokenData));
    }

    // Завершаем OAuth-авторизацию и в клиенте Discord. Это обязательно для
    // команд SDK, которым нужны запрошенные scopes, включая setActivity().
    const discordAuth = await sdk.commands.authenticate({ access_token });
    if (!discordAuth) {
      throw new Error('Discord SDK authenticate() не вернул данные пользователя');
    }

    console.log('[Discord] Got access_token, connecting...');

    // Без этого Discord показывает лишь базовый статус приложения. Rich
    // Presence делает сессию понятной и доступной для запроса входа.
    await publishDiscordPresence(sdk);

    // Скрываем форму логина ДО подключения WS
    document.getElementById('auth-panel').style.display = 'none';
    document.getElementById('backdrop').classList.remove('show');

    // Подключаем WebSocket (url через getWsUrl() → /api-ws проксируется Discord)
    connect();

    // Ждём открытия WS и авторизуемся Discord-токеном
    let wsWaitAttempts = 0;
    const waitForWS = setInterval(() => {
      wsWaitAttempts++;
      if (ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(waitForWS);
        console.log('[Discord] WS open, sending discord auth');
        sendJSON({ action: 'auth', discord_token: access_token });
      } else if (wsWaitAttempts > 100) {
        // 10 секунд без WS — что-то пошло не так
        clearInterval(waitForWS);
        console.error('[Discord] WS не открылся за 10 сек');
        showToast('Не удалось подключиться к серверу', 'error');
      }
    }, 100);

  } catch (e) {
    // Детально логируем ошибку — Discord SDK бросает объекты, а не Error
    console.error('[Discord] Activity auth failed:', JSON.stringify(e), e);
    // НЕ показываем тост — просто продолжаем в обычном режиме
    // Форма входа уже видна пользователю
    connect();
  }
}
init();
