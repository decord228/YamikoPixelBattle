'use strict';

// ── CONSTANTS & DATA ──
const PALETTE = [
  {c:'#ffffff',n:'Белый'},{c:'#e4e4e4',n:'Светло-серый'},{c:'#888888',n:'Серый'},{c:'#000000',n:'Чёрный'},
  {c:'#5a3015',n:'Тёмно-коричневый'},{c:'#9c6b3f',n:'Коричневый'},{c:'#ffcda2',n:'Бежевый'},{c:'#8a0022',n:'Бордовый'},
  {c:'#e40000',n:'Красный'},{c:'#ff6392',n:'Розовый'},{c:'#ff99aa',n:'Светло-розовый'},{c:'#d40078',n:'Малиновый'},
  {c:'#ff9600',n:'Оранжевый'},{c:'#ffd635',n:'Жёлтый'},{c:'#fff8b8',n:'Светло-жёлтый'},{c:'#006030',n:'Тёмно-зелёный'},
  {c:'#00a368',n:'Зелёный'},{c:'#00cc78',n:'Светло-зелёный'},{c:'#7eed56',n:'Лаймовый'},{c:'#00756f',n:'Тёмно-бирюзовый'},
  {c:'#009eaa',n:'Бирюзовый'},{c:'#00ccc0',n:'Светло-бирюзовый'},{c:'#1d2b53',n:'Тёмно-синий'},{c:'#2450a4',n:'Синий'},
  {c:'#3690ea',n:'Голубой'},{c:'#51e9f4',n:'Светло-голубой'},{c:'#493ac1',n:'Индиго'},{c:'#6a5cff',n:'Фиолетовый'},
  {c:'#811e9f',n:'Пурпурный'},{c:'#b44ac0',n:'Сиреневый'},{c:'#2b1e3e',n:'Тёмно-пурпурный'},{c:'#1a1a1a',n:'Почти чёрный'}
];

const RANKS = [
  {name:'Новичок',icon:'🌱',min:0},{name:'Художник',icon:'🎨',min:50},
  {name:'Маэстро',icon:'🖌️',min:200},{name:'Легенда',icon:'⭐',min:1000},
  {name:'Архитектор',icon:'🏛️',min:5000},{name:'Бог Пикселей',icon:'👑',min:20000}
];

const EMOJI_AVATARS = ['👾','🦊','🐺','🐉','🦋','🌙','⚡','🔥','💎','🌸','🎭','🤖','🦅','🐙','🌈','🎸','🦄','🐸','🐱','🐻','🎃','🌊','❄️','🍄'];

// ── КЛАН: ПРАВА ЗВАНИЙ ──
// Ключи должны 1-в-1 совпадать с CLAN_PERMISSION_KEYS на сервере (server.js).
const CLAN_PERMISSIONS = [
  { key:'invite',          name:'Заявки',        desc:'Принимать и отклонять заявки на вступление',      icon:'✉️' },
  { key:'kick',            name:'Исключение',    desc:'Исключать участников с более низким званием',     icon:'🚪' },
  { key:'manage_ranks',    name:'Звания',        desc:'Создавать, менять и выдавать звания ниже своего', icon:'🎖️' },
  { key:'manage_settings', name:'Настройки',     desc:'Менять значок, тег, тип вступления и правила',    icon:'⚙️' },
  { key:'manage_stencil',  name:'Трафарет',      desc:'Публиковать общий трафарет клана на холсте',      icon:'🖼️' },
  { key:'edit_motd',       name:'Сообщение дня', desc:'Редактировать приветственное сообщение клана',    icon:'📌' },
  { key:'manage_treasury', name:'Казна',         desc:'Снимать деньги из казны и покупать товары клана за счёт казны', icon:'💰' },
];

// Готовые цвета-пресеты для быстрого выбора цвета звания
const CLAN_RANK_COLORS = ['#fbbf24','#f97316','#ef4444','#ec4899','#a855f7','#818cf8','#3690ea','#00cc78','#7eed56','#eab308','#94a3b8','#f4f4f5'];

// Готовые эмодзи-иконки для званий
const CLAN_RANK_ICONS = ['👑','🎖️','⭐','🛡️','⚔️','🏹','🔥','💎','🦅','🐺','🎯','🚀','🧠','🔧','🎨','📢','🏆','☠️'];

// ── SHOP ITEMS ──
// icon — SVG-разметка в едином стиле с остальным приложением (обводка,
// currentColor, viewBox 24×24, class="icon"), а не эмодзи — эмодзи в
// карточках магазина выглядели дёшево на фоне остального интерфейса.
const ICON_PALETTE = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3C7 3 3 6.8 3 11.4c0 3.6 2.7 5.4 5.4 5.4h1c.6 0 1 .5 1 1.1 0 .9-.8 1.4-.8 2.3 0 .8.7 1.4 1.7 1.4 4.5 0 8.7-3.8 8.7-9.2C21.9 7.3 17.6 3 12 3z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="7.7" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.3" cy="8.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="17" cy="12.3" r="1.1" fill="currentColor" stroke="none"/></svg>';
const ICON_PALETTE_PLUS = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11 3C6.6 3 3 6.5 3 10.8c0 3.4 2.5 5.2 5 5.2h.9c.6 0 1 .5 1 1 0 .9-.7 1.3-.7 2.2 0 .8.6 1.3 1.6 1.3 4.2 0 8-3.6 8-8.7C18.8 7 14.8 3 11 3z"/><circle cx="7" cy="10.3" r="1" fill="currentColor" stroke="none"/><circle cx="10.2" cy="7.3" r="1" fill="currentColor" stroke="none"/><circle cx="14.1" cy="7.9" r="1" fill="currentColor" stroke="none"/><path d="M19.5 4v4"/><path d="M17.5 6h4"/></svg>';
const ICON_BOMB = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="14" r="7"/><path d="M15.5 8.5L18 6"/><path d="M17 4l3 1-1 3"/></svg>';
const ICON_RAINBOW = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 18a9 9 0 0 1 18 0"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/></svg>';
const ICON_ERASER = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14 3l6 6-7.5 7.5"/><path d="M9 17l-5.5 3.5"/><path d="M5.5 14.5L13 7l4 4-7.5 7.5-6-2z"/></svg>';
const ICON_MIRROR = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="9.5" rx="6" ry="7"/><path d="M9 19h6"/><path d="M12 16.5V19"/></svg>';
const ICON_BOLT = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>';
const ICON_BOLT_DOUBLE = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 2L4 12h4.5l-1 10 7-10H10l1-10z"/><path d="M17.5 6L14 12h2.5l-1.5 6"/></svg>';
const ICON_ROCKET = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2c3 2 5 6 5 10 0 2-.5 4-1.5 5.5L12 22l-3.5-4.5C7.5 16 7 14 7 12c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M7 15c-2 0-3.5 1.5-4 4 2.5.5 4-1 4-1"/><path d="M17 15c2 0 3.5 1.5 4 4-2.5.5-4-1-4-1"/></svg>';
const ICON_RADIATION = '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5v5"/><path d="M12 16.5v5"/><path d="M4.3 7l4.4 2.5"/><path d="M15.3 14.5l4.4 2.5"/><path d="M19.7 7l-4.4 2.5"/><path d="M8.7 14.5L4.3 17"/></svg>';

// ── ОБЫЧНЫЕ УЛУЧШЕНИЯ ──
// Постоянные апгрейды (type:'upgrade'), а также перенесённые сюда по
// просьбе — общедоступные кулдаун-ускорители −25%/−50% и цветная бомбочка
// 3×3 (type:'cooldown_boost'/'consumable'), которые раньше требовали VIP.
// Турбо −90% и остальные "хаос"-расходники остаются эксклюзивом VIP-вкладки.
const SHOP_ITEMS_USER = [
  {id:'stencil_auto_1',title:'Авто-подбор цветов Ур.1',desc:'Автоматически выбирает ближайший цвет палитры при наведении на трафарет.',icon:ICON_PALETTE,cost:100,type:'upgrade'},
  {id:'stencil_auto_2',title:'Авто-подбор цветов Ур.2',desc:'Ур.1 + подсветка соседних пустых пикселей того же цвета.',icon:ICON_PALETTE_PLUS,cost:300,type:'upgrade',requires:'stencil_auto_1'},
  {id:'cooldown_boost_25',title:'Ускоритель −25%',desc:'Снижает кулдаун установки пикселя на 25% на 15 минут.',icon:ICON_BOLT,cost:60,type:'cooldown_boost',pct:25,durationMin:15,count:1},
  {id:'cooldown_boost_50',title:'Ускоритель −50%',desc:'Снижает кулдаун установки пикселя на 50% на 15 минут.',icon:ICON_BOLT_DOUBLE,cost:130,type:'cooldown_boost',pct:50,durationMin:15,count:1},
  {id:'bomb_3x3',title:'Цветная бомбочка 3×3',desc:'Заливает квадрат 3×3 вокруг выбранной точки выбранным цветом.',icon:ICON_BOMB,cost:50,type:'consumable',count:1},
];

const SHOP_ITEMS_VIP = [
  {id:'rainbow_5x5',title:'Радужный взрыв 5×5',desc:'Заполняет квадрат 5×5 случайными цветами из палитры. Хаос гарантирован!',icon:ICON_RAINBOW,cost:80,type:'consumable',count:1},
  {id:'eraser_10x10',title:'Большой Ластик 10×10',desc:'Стирает (заливает белым) квадрат 10×10. Идеален для расчистки места.',icon:ICON_ERASER,cost:120,type:'consumable',count:1},
  {id:'mirror_stamp',title:'Зеркальный штамп',desc:'Копирует область 5×5 под курсором и вставляет с зеркальным отражением.',icon:ICON_MIRROR,cost:200,type:'consumable',count:1},
];

// ── УСКОРИТЕЛИ КУЛДАУНА (VIP-эксклюзив) ──
// type:'cooldown_boost' — при использовании временно снижает кулдаун
// установки пикселя на pct% на durationMin минут. Действует именно в
// процентах (а не в фикс. секундах), чтобы работать предсказуемо при любом
// базовом кулдауне, который задаёт админ через слайдер.
const SHOP_ITEMS_COOLDOWN = [
  {id:'cooldown_boost_90',title:'Турбо-режим −90%',desc:'Снижает кулдаун установки пикселя на 90% на 5 минут. Для настоящего спринта!',icon:ICON_ROCKET,cost:220,type:'cooldown_boost',pct:90,durationMin:5,count:1},
];

const SHOP_ITEMS_ADMIN = [
  {id:'admin_nuke',title:'Ядерная кнопка',desc:'Полностью очищает весь холст. Используй с умом!',icon:ICON_RADIATION,cost:0,type:'admin_tool'},
  {id:'admin_rainbow',title:'Радужный шторм',desc:'Заливает весь холст случайными цветами.',icon:ICON_RAINBOW,cost:0,type:'admin_tool'},
];

// ── КЛАН: МАГАЗИН ──
// Изначальный лимит участников клана (без покупок) — должен совпадать с сервером.
const CLAN_BASE_MEMBER_LIMIT = 5;

// Расширения, которые сервер считает "анимированным" баннером (см.
// isAnimatedBannerUrl в server.js) — используем на клиенте, чтобы
// предупредить пользователя ДО загрузки файла, а не после отказа сервера.
const CLAN_ANIMATED_BANNER_EXT = ['.gif', '.webp', '.apng'];
function isAnimatedBannerFile(file) {
  if (!file) return false;
  const nameLower = (file.name || '').toLowerCase();
  if (CLAN_ANIMATED_BANNER_EXT.some(ext => nameLower.endsWith(ext))) return true;
  return file.type === 'image/gif' || file.type === 'image/webp';
}

// Тиры расширения состава клана. Каждый тир покупается один раз и заменяет предыдущий лимит.
const CLAN_MEMBER_LIMIT_TIERS = [
  { limit:10,  cost:100,  id:'members_10'  },
  { limit:25,  cost:300,  id:'members_25'  },
  { limit:50,  cost:1000, id:'members_50'  },
  { limit:100, cost:5000, id:'members_100' },
];

// Разовые товары клана (не зависят от тиров лимита)
const CLAN_SHOP_ITEMS = [
  {
    id:'banner_static', title:'Статичный баннер клана', icon:'🖼️',
    desc:'Открывает возможность загрузить собственную картинку-баннер клана (JPG/PNG), которая отображается в шапке клана и в лидерборде.',
    cost:200, type:'banner', requiresPerm:'manage_settings',
  },
  {
    id:'banner_animated', title:'Анимированный баннер клана', icon:'🎞️',
    desc:'Открывает загрузку анимированного баннера (GIF, WebP и т.д.) — выделит клан среди остальных в лидерборде и шапке.',
    cost:500, type:'banner', requiresPerm:'manage_settings', requires:'banner_static',
  },
];
// ── АЧИВКИ ──
// Полностью выводятся из уже существующих клиентских глобалок (currentPixels,
// currentCoins, currentClan, purchasedItems, isVip/isAdmin, cpFriends,
// sessionPixels) — никаких новых полей на сервере/в БД не требуется,
// поэтому это не расходует ни байта дополнительного места в Redis.
// stats передаётся из buildAchievementStats() в ui.js.
const ACHIEVEMENTS = [
  { id:'first_pixel',   title:'Первый мазок',      desc:'Поставь свой первый пиксель',            icon:'🖌️', check: s => s.pixels >= 1 },
  { id:'pixels_50',     title:'Начинающий',        desc:'Поставь 50 пикселей',                    icon:'🌱', check: s => s.pixels >= 50 },
  { id:'pixels_200',    title:'Художник',          desc:'Поставь 200 пикселей',                   icon:'🎨', check: s => s.pixels >= 200 },
  { id:'pixels_1000',   title:'Легенда',           desc:'Поставь 1000 пикселей',                  icon:'⭐', check: s => s.pixels >= 1000 },
  { id:'pixels_5000',   title:'Архитектор',        desc:'Поставь 5000 пикселей',                  icon:'🏛️', check: s => s.pixels >= 5000 },
  { id:'pixels_20000',  title:'Бог Пикселей',      desc:'Поставь 20 000 пикселей',                icon:'👑', check: s => s.pixels >= 20000 },
  { id:'coins_500',     title:'Коллекционер',      desc:'Накопи 500 монет одновременно',          icon:'🪙', check: s => s.coins >= 500 },
  { id:'coins_5000',    title:'Магнат',            desc:'Накопи 5000 монет одновременно',         icon:'💰', check: s => s.coins >= 5000 },
  { id:'first_purchase',title:'Первая покупка',    desc:'Купи что-нибудь в магазине',             icon:'🛒', check: s => s.purchasedCount > 0 },
  { id:'clan_member',   title:'Не один в поле',    desc:'Вступи в клан',                           icon:'🚩', check: s => !!s.clan },
  { id:'friend_1',      title:'Первый друг',       desc:'Добавь хотя бы одного друга',            icon:'🤝', check: s => s.friendsCount >= 1 },
  { id:'friend_5',      title:'Душа компании',     desc:'Добавь 5 друзей',                        icon:'🎉', check: s => s.friendsCount >= 5 },
  { id:'session_100',   title:'Продуктивная сессия', desc:'Поставь 100 пикселей за одну сессию',  icon:'🔥', check: s => s.sessionPixels >= 100 },
  { id:'vip',           title:'Особый статус',     desc:'Получи VIP-роль',                        icon:'💎', check: s => s.isVip || s.isAdmin },
];

const IS_DISCORD_ACTIVITY = window.location.hostname.endsWith('.discordsays.com');

// Discord Application (Client) ID — публичное значение, безопасно хранить в клиентском коде
// (в отличие от Client Secret, который используется только на сервере).
// Взять его можно в Discord Developer Portal → ваше приложение → General Information → Application ID.
const DISCORD_CLIENT_ID = '1521337257938911283';

// WS_URL вычисляется в момент вызова connect(), после patchUrlMappings
function getWsUrl() {
  return IS_DISCORD_ACTIVITY
    ? `wss://${window.location.host}/api-ws`
    : 'wss://yamikopixelbattleserver.onrender.com';
}
const WS_URL = 'wss://yamikopixelbattleserver.onrender.com'; // fallback для обратной совместимости

// Абсолютный адрес backend для HTTP-запросов (fetch).
// Нужен, потому что фронтенд может быть открыт с другого домена
// (например GitHub Pages), и относительные пути типа '/api/...'
// в этом случае ведут не на backend, а на текущий домен фронтенда.
function getApiUrl() {
  return IS_DISCORD_ACTIVITY
    ? '/api' // Discord сам проксирует /api на backend
    : 'https://yamikopixelbattleserver.onrender.com/api';
}

// ── ПРОКСИРОВАНИЕ ВНЕШНИХ КАРТИНОК (Cloudinary) ВНУТРИ DISCORD ACTIVITY ──
// CSP Discord Activity ограничивает img-src только собственным доменом
// (discordsays.com) + доменами, явно прописанными как URL Mapping в Developer
// Portal. Картинки трафаретов (Cloudinary) грузились напрямую с
// res.cloudinary.com — браузер тихо блокировал <img src>, поэтому "трафарет
// получен", а на холсте ничего не появлялось.
//
// ВАЖНО: для работы этого проксирования нужно один раз добавить в Discord
// Developer Portal → Activities → URL Mappings:
//   Prefix: /cdn-proxy      Target: res.cloudinary.com
// Discord проксирует запросы к /cdn-proxy/* НАПРЯМУЮ на res.cloudinary.com —
// никакого отдельного роута на своём backend для этого писать не нужно
// (в отличие от /api, который указывает на ваш собственный сервер).
function getProxiedImageUrl(url) {
  if (!IS_DISCORD_ACTIVITY || !url) return url;
  try {
    const u = new URL(url, window.location.origin);
    if (u.hostname.endsWith('cloudinary.com')) {
      return `/cdn-proxy${u.pathname}${u.search}`;
    }
  } catch (_) {}
  return url;
}