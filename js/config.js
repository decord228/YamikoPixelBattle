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
const SHOP_ITEMS_USER = [
  {id:'stencil_auto_1',title:'Авто-подбор цветов Ур.1',desc:'Автоматически выбирает ближайший цвет палитры при наведении на трафарет.',icon:'🤖',cost:100,type:'upgrade'},
  {id:'stencil_auto_2',title:'Авто-подбор цветов Ур.2',desc:'Ур.1 + подсветка соседних пустых пикселей того же цвета.',icon:'🤖✨',cost:300,type:'upgrade',requires:'stencil_auto_1'},
];

const SHOP_ITEMS_VIP = [
  {id:'bomb_3x3',title:'Цветная бомбочка 3×3',desc:'Заливает квадрат 3×3 вокруг выбранной точки выбранным цветом. 🎯',icon:'💣',cost:50,type:'consumable',count:1},
  {id:'rainbow_5x5',title:'Радужный взрыв 5×5',desc:'Заполняет квадрат 5×5 случайными цветами из палитры. Хаос гарантирован! 🌈',icon:'🌈',cost:80,type:'consumable',count:1},
  {id:'eraser_10x10',title:'Большой Ластик 10×10',desc:'Стирает (заливает белым) квадрат 10×10. Идеален для расчистки места.',icon:'🧹',cost:120,type:'consumable',count:1},
  {id:'mirror_stamp',title:'Зеркальный штамп',desc:'Копирует область 5×5 под курсором и вставляет с зеркальным отражением.',icon:'🪞',cost:200,type:'consumable',count:1},
];

const SHOP_ITEMS_ADMIN = [
  {id:'admin_nuke',title:'☢️ Ядерная кнопка',desc:'Полностью очищает весь холст. Используй с умом!',icon:'☢️',cost:0,type:'admin_tool'},
  {id:'admin_rainbow',title:'🌈 Радужный шторм',desc:'Заливает весь холст случайными цветами.',icon:'🌈',cost:0,type:'admin_tool'},
];

// ── КЛАН: МАГАЗИН ──
// Изначальный лимит участников клана (без покупок) — должен совпадать с сервером.
const CLAN_BASE_MEMBER_LIMIT = 5;

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
const IS_DISCORD_ACTIVITY = window.location.hostname.endsWith('.discordsays.com');

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