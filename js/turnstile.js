'use strict';

// Публичный ключ Turnstile допустимо хранить на клиенте. Секретный ключ
// находится только в TURNSTILE_SECRET_KEY на сервере.
const TURNSTILE_SITEKEY = '0x4AAAAAAD5WCVYAgPNYBRnn';
let turnstileWidgetId = null;
let turnstileRenderWaiting = false;

function turnstileSetStatus(message, isError=false) {
  const status = document.getElementById('turnstile-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', !!isError);
}

function openTurnstileChallenge() {
  const gate = document.getElementById('turnstile-gate');
  const holder = document.getElementById('turnstile-widget');
  if (!gate || !holder) return;
  gate.classList.add('show');
  if (turnstileWidgetId !== null && window.turnstile) {
    window.turnstile.reset(turnstileWidgetId);
    turnstileSetStatus('Подтвердите проверку, чтобы продолжить.');
    return;
  }
  if (turnstileRenderWaiting) return;
  turnstileRenderWaiting = true;
  turnstileSetStatus('Загружаем проверку…');

  const render = () => {
    if (!window.turnstile) {
      setTimeout(render, 100);
      return;
    }
    turnstileRenderWaiting = false;
    turnstileWidgetId = window.turnstile.render(holder, {
      sitekey: TURNSTILE_SITEKEY,
      theme: 'dark',
      callback: token => {
        turnstileSetStatus('Проверяем ответ…');
        sendJSON({ action:'turnstile_verify', token });
      },
      'error-callback': () => turnstileSetStatus('Не удалось загрузить проверку. Попробуйте ещё раз.', true),
      'expired-callback': () => turnstileSetStatus('Проверка истекла. Пройдите её ещё раз.', true),
    });
    turnstileSetStatus('Подтвердите проверку, чтобы продолжить.');
  };
  render();
}

function handleTurnstileResult(result) {
  const gate = document.getElementById('turnstile-gate');
  if (result?.ok) {
    if (gate) gate.classList.remove('show');
    if (turnstileWidgetId !== null && window.turnstile) window.turnstile.reset(turnstileWidgetId);
    showToast('Проверка пройдена. Спасибо!', 'success');
    return;
  }
  turnstileSetStatus(result?.message || 'Проверка не пройдена. Попробуйте ещё раз.', true);
  if (turnstileWidgetId !== null && window.turnstile) window.turnstile.reset(turnstileWidgetId);
}
