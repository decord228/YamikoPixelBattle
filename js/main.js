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
  try {
    const sdk = new window.DiscordSDK(DISCORD_CLIENT_ID);
    await sdk.ready();

    await sdk.patchUrlMappings([
      { prefix: '/api-ws', target: 'yamikopixelbattleserver.onrender.com' },
      { prefix: '/api',    target: 'yamikopixelbattleserver.onrender.com' },
    ]);

    // ← ДОБАВЬ ЭТИ ДВЕ СТРОКИ
    console.log('Discord WS URL будет:', getWsUrl());
    console.log('hostname:', window.location.host);

    const { code } = await sdk.commands.authorize({
      response_type: 'code',
      prompt: 'none',
      scope: ['identify'],
    });

    // Меняем code на access_token (теперь /api проксируется через Discord)
    const tokenRes = await fetch('/api/discord-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const { access_token } = await tokenRes.json();

    // Скрываем форму логина
    document.getElementById('auth-panel').style.display = 'none';
    document.getElementById('backdrop').classList.remove('show');

    // Подключаем WebSocket — теперь WS_URL ведёт на /api-ws через прокси
    connect();

    // Ждём открытия WS и авторизуемся через Discord токен
    const waitForWS = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(waitForWS);
        sendJSON({ action: 'auth', discord_token: access_token });
      }
    }, 100);

  } catch (e) {
    console.error('Discord Activity init failed:', e);
    connect();
  }
}

document.getElementById('auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth(false);});
document.getElementById('reg-password').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth(true);});

init();