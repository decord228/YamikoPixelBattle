'use strict';

// ── INIT ──
window.addEventListener('resize',()=>{applyTransform();resizeOverlay();updateAllCursorFlags();});

async function init() {
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
    connect();
  }
}

async function initDiscordActivity() {
  let sdk;
  try {
    sdk = new window.DiscordSDK(DISCORD_CLIENT_ID);
    await sdk.ready();
    console.log('[Discord] SDK ready, instanceId:', sdk.instanceId);
  } catch (e) {
    console.error('[Discord] SDK init/ready failed:', JSON.stringify(e), e);
    connect();
    return;
  }

  try {
    // Авторизуем пользователя через Discord OAuth2
    // client_id обязателен для Discord Activity SDK v2
    const authorizeResult = await sdk.commands.authorize({
      client_id:     DISCORD_CLIENT_ID,
      response_type: 'code',
      prompt:        'none',
      scope:         ['identify'],
    });

    console.log('[Discord] authorize result:', JSON.stringify(authorizeResult));
    const code = authorizeResult?.code;

    if (!code) {
      throw new Error('authorize() не вернул code: ' + JSON.stringify(authorizeResult));
    }

    // Меняем code на access_token через наш бэкенд
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

    console.log('[Discord] Got access_token, connecting...');

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
document.getElementById('auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth(false);});
document.getElementById('reg-password').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth(true);});

init();