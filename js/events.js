'use strict';

// ── DELEGATED EVENT HANDLERS ──
// Discord Activity CSP блокирует директиву script-src-attr, поэтому ЛЮБЫЕ
// inline onclick="..." / oninput="..." / onchange="..." / onkeydown="..."
// не выполняются внутри iframe Discord Activity (но работают в обычном
// браузере — поэтому баг было сложно поймать локально).
//
// Решение: в index.html все эти атрибуты переименованы в
// data-onclick / data-oninput / data-onchange / data-onkeydown
// (хранят тот же JS-код как строку), а здесь мы один раз подписываемся
// на событие на document и выполняем код через new Function — это
// разрешено CSP, так как script-src содержит 'unsafe-eval', а
// script-src-attr запрещает только встроенные атрибуты-обработчики.

function runInlineHandler(el, code, ev) {
  try {
    // "this" внутри код = элемент, как и было в inline onclick
    new Function('event', code).call(el, ev);
  } catch (err) {
    console.error('[events.js] Ошибка в обработчике:', code, err);
  }
}

function bindDelegated(eventName, dataAttr) {
  document.addEventListener(eventName, (ev) => {
    const el = ev.target.closest(`[${dataAttr}]`);
    if (!el) return;
    runInlineHandler(el, el.getAttribute(dataAttr), ev);
  });
}

bindDelegated('click', 'data-onclick');
bindDelegated('input', 'data-oninput');
bindDelegated('change', 'data-onchange');
bindDelegated('keydown', 'data-onkeydown');