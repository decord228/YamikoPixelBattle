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
    const result = new Function('event', code).call(el, ev);
    // Многие обработчики теперь async (например показ кастомных confirm/prompt).
    // Если внутри такой функции произойдёт ошибка, она превращается в "тихий"
    // rejected Promise, который никто не увидит — ловим явно, чтобы кнопка не
    // выглядела как "просто не работает" без единого следа в консоли.
    if (result && typeof result.catch === 'function') {
      result.catch((err) => console.error('[events.js] Асинхронная ошибка в обработчике:', code, err));
    }
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

// ── SIDEBAR TOOLTIPS ──
// Раньше тултипы вешались как inline onmouseenter/onmouseleave, поэтому при
// переходе на CSP-совместимое делегирование (см. выше) их забыли перенести.
// mouseenter/mouseleave не всплывают (bubble: false), поэтому для делегирования
// через document используем mouseover/mouseout — они всплывают и заменяют
// связку enter/leave при проверке relatedTarget.

let _sidebarTooltipBtn = null;

function showSidebarTooltip(btn, text) {
  const tip = document.getElementById('sidebar-tooltip');
  if (!tip || !text) return;
  tip.textContent = text;
  const r = btn.getBoundingClientRect();
  tip.style.left = (r.right + 10) + 'px';
  tip.style.top = (r.top + r.height / 2) + 'px';
  tip.style.transform = 'translateY(-50%)';
  tip.classList.add('visible');
}

function hideSidebarTooltip() {
  const tip = document.getElementById('sidebar-tooltip');
  if (tip) tip.classList.remove('visible');
}

document.addEventListener('mouseover', (ev) => {
  const btn = ev.target.closest('.sidebar-btn');
  if (!btn || btn === _sidebarTooltipBtn) return;
  const tipEl = btn.querySelector('.tip');
  if (!tipEl) return;
  _sidebarTooltipBtn = btn;
  showSidebarTooltip(btn, tipEl.textContent);
});

document.addEventListener('mouseout', (ev) => {
  const btn = ev.target.closest('.sidebar-btn');
  if (!btn || btn !== _sidebarTooltipBtn) return;
  // Если курсор переходит на дочерний элемент той же кнопки — не скрываем
  if (btn.contains(ev.relatedTarget)) return;
  _sidebarTooltipBtn = null;
  hideSidebarTooltip();
});

// Скрываем тултип при клике (например, после смены инструмента) и при скролле
// сайдбара, чтобы он не "залипал" в старой позиции.
document.addEventListener('click', () => hideSidebarTooltip());
document.getElementById('sidebar-inner')?.addEventListener('scroll', () => hideSidebarTooltip());