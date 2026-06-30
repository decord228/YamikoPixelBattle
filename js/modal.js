'use strict';

// ── CUSTOM CONFIRM / PROMPT (замена native confirm()/prompt()) ──
// В Discord Activity iframe нативные confirm()/alert()/prompt() заблокированы
// (нет allow-modals в sandbox), поэтому используем собственное модальное окно.
// API асинхронный (Promise), как у window.confirm/prompt, но с await.

let _modalResolve = null;
let _modalIsPrompt = false;

function _modalEls() {
  return {
    backdrop: document.getElementById('modal-backdrop'),
    dialog: document.getElementById('modal-dialog'),
    icon: document.getElementById('modal-icon'),
    title: document.getElementById('modal-title'),
    message: document.getElementById('modal-message'),
    input: document.getElementById('modal-input'),
    btnCancel: document.getElementById('modal-btn-cancel'),
    btnConfirm: document.getElementById('modal-btn-confirm'),
  };
}

function _openModal(opts) {
  const { title = '', message = '', icon = '❔', isPrompt = false, defaultValue = '', confirmText = 'OK', cancelText = 'Отмена', danger = false } = opts;
  const els = _modalEls();
  _modalIsPrompt = isPrompt;

  els.icon.textContent = icon;
  els.title.textContent = title;
  els.message.textContent = message;
  els.btnConfirm.textContent = confirmText;
  els.btnCancel.textContent = cancelText;
  els.btnConfirm.classList.toggle('danger', !!danger);

  if (isPrompt) {
    els.input.classList.add('show');
    els.input.value = defaultValue || '';
  } else {
    els.input.classList.remove('show');
    els.input.value = '';
  }

  els.backdrop.classList.add('show');
  els.dialog.classList.add('show');

  if (isPrompt) {
    setTimeout(() => { els.input.focus(); els.input.select(); }, 50);
  } else {
    setTimeout(() => { els.btnConfirm.focus(); }, 50);
  }

  return new Promise((resolve) => { _modalResolve = resolve; });
}

function _closeModal() {
  const els = _modalEls();
  els.backdrop.classList.remove('show');
  els.dialog.classList.remove('show');
}

// Вызывается кнопкой "Отмена" (и кликом по фону) — resolveModal(null)
function resolveModal(value) {
  if (!_modalResolve) { _closeModal(); return; }
  const resolve = _modalResolve;
  _modalResolve = null;
  _closeModal();
  resolve(value);
}

// Вызывается кнопкой "OK"/подтвердить
function modalConfirmClick() {
  if (_modalIsPrompt) {
    const val = document.getElementById('modal-input').value;
    resolveModal(val);
  } else {
    resolveModal(true);
  }
}

function modalInputKeydown(ev) {
  if (ev.key === 'Enter') { ev.preventDefault(); modalConfirmClick(); }
  if (ev.key === 'Escape') { ev.preventDefault(); resolveModal(null); }
}

// Закрытие по клику на фон = отмена
document.getElementById('modal-backdrop').addEventListener('click', () => resolveModal(_modalIsPrompt ? null : false));

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.getElementById('modal-dialog').classList.contains('show')) {
    resolveModal(_modalIsPrompt ? null : false);
  }
});

/**
 * Аналог window.confirm(), но через кастомное окно и Promise.
 * await showConfirm('Удалить трафарет?') -> true | false
 */
function showConfirm(message, opts = {}) {
  return _openModal({
    title: opts.title || 'Подтверждение',
    message,
    icon: opts.icon || (opts.danger ? '⚠️' : '❔'),
    isPrompt: false,
    confirmText: opts.confirmText || 'Подтвердить',
    cancelText: opts.cancelText || 'Отмена',
    danger: !!opts.danger,
  }).then(v => !!v);
}

/**
 * Аналог window.prompt(), но через кастомное окно и Promise.
 * await showPrompt('Сколько монет выдать?', '0') -> string | null
 */
function showPrompt(message, defaultValue = '', opts = {}) {
  return _openModal({
    title: opts.title || 'Введите значение',
    message,
    icon: opts.icon || '✏️',
    isPrompt: true,
    defaultValue,
    confirmText: opts.confirmText || 'OK',
    cancelText: opts.cancelText || 'Отмена',
  });
}
