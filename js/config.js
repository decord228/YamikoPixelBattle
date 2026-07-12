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

// ── ЗВАНИЯ (Этап 4: переход на опыт) ──
// 1 поставленный пиксель = 1 xp. Список должен 1-в-1 совпадать (имена/иконки/
// пороги) с RANK_THRESHOLDS в server.js — сервер является источником правды
// для реальной проверки, здесь только для отображения на клиенте.
const RANKS = [
  {name:'Новичок',            icon:'🌱', min:0},
  {name:'Ученик',             icon:'🖍️', min:50},
  {name:'Художник',           icon:'🎨', min:150},
  {name:'Подмастерье',        icon:'🧵', min:350},
  {name:'Маэстро',            icon:'🖌️', min:700},
  {name:'Виртуоз',            icon:'🎭', min:1200},
  {name:'Вдохновлённый',      icon:'💫', min:1600},
  {name:'Легенда',            icon:'⭐', min:2000},
  {name:'Чемпион',            icon:'🏆', min:3000},
  {name:'Мастер Цвета',       icon:'🌈', min:4200},
  {name:'Хранитель Холста',   icon:'🛡️', min:5800},
  {name:'Архитектор',         icon:'🏛️', min:7800},
  {name:'Зодчий',             icon:'🏗️', min:9000},
  {name:'Творец Миров',       icon:'🌍', min:10200},
  {name:'Провидец',           icon:'🔮', min:13000},
  {name:'Император Пикселей', icon:'👁️', min:16200},
  {name:'Небожитель',         icon:'🌠', min:18500},
  {name:'Бог Пикселей',       icon:'👑', min:20000},
];

// Награда(-ы) за звание — ТОЛЬКО для отображения в UI (иконка/подпись
// награды в карточке ранга). Реальную выдачу делает сервер по кнопке
// "Забрать" (action:'claim_rank_reward') — см. RANK_REWARDS в server.js,
// значения должны совпадать 1-в-1. Три типа: coins / banner (tier) /
// shop_item (itemId) / vip_temp (hours).
//
// ВАЖНО: каждое звание теперь хранит МАССИВ наград (может отсутствовать),
// а не одну награду. Награда НЕ открывается сразу по достижению звания-
// владельца — вместо этого её порог XP вычисляется как точка МЕЖДУ min
// текущего звания и min следующего (см. getRankCheckpoints ниже): при
// ровно одной награде в массиве это середина отрезка, при нескольких —
// отрезок делится на равные части по числу наград (награда i из N
// открывается на xp = min + (nextMin-min) * (i+1)/(N+1)).
const RANK_REWARDS = {
  'Новичок':            [{ type:'coins',     amount:10 }],
  'Ученик':             [{ type:'coins',     amount:15 }],
  'Художник':           [{ type:'coins',     amount:20 }],
  'Подмастерье':        [{ type:'banner',    tier:'free' }],
  'Маэстро':            [{ type:'coins',     amount:60 }],
  'Виртуоз':            [{ type:'banner',    tier:'free' }],
  // Между "Вдохновлённый" и "Легенда" — две промежуточные награды.
  'Вдохновлённый':      [{ type:'coins',     amount:50 }, { type:'vip_temp', hours:1 }],
  'Легенда':            [{ type:'banner',    tier:'gradient' }],
  'Чемпион':            [{ type:'coins',     amount:150 }],
  'Мастер Цвета':       [{ type:'banner',    tier:'gradient' }],
  'Хранитель Холста':   [{ type:'shop_item', itemId:'cooldown_boost_25' }],
  'Архитектор':         [{ type:'coins',     amount:500 }],
  // Между "Зодчий" и "Творец Миров" — две промежуточные награды.
  'Зодчий':             [{ type:'coins',     amount:400 }, { type:'vip_temp', hours:24 }],
  'Творец Миров':       [{ type:'banner',    tier:'animated' }],
  'Провидец':           [{ type:'shop_item', itemId:'cooldown_boost_50' }],
  'Император Пикселей': [{ type:'banner',    tier:'animated' }],
  'Небожитель':         [{ type:'coins',     amount:1000 }],
  'Бог Пикселей':       [{ type:'coins',     amount:2000 }],
};

// Возвращает список "чекпоинтов" (промежуточных наград) для звания rankName:
// [{ id, reward, xpRequired, index, count }]. id — стабильный идентификатор
// вида "RankName#i", используется и в acc.claimed_ranks (чтобы отдельно
// отмечать забранной каждую награду), и при отправке claim_rank_reward.
// xpRequired — порог XP, на котором награда становится доступной: точка
// МЕЖДУ min этого звания и min следующего. Если звание последнее в списке
// (следующего нет) — используем min самого звания.
function getRankCheckpoints(rankName) {
  const rewards = RANK_REWARDS[rankName];
  if (!rewards || !rewards.length) return [];
  const idx = RANKS.findIndex(r => r.name === rankName);
  if (idx === -1) return [];
  const rank = RANKS[idx];
  const next = RANKS[idx + 1];
  const span = next ? (next.min - rank.min) : 0;
  const count = rewards.length;
  return rewards.map((reward, i) => ({
    id: `${rankName}#${i}`,
    reward,
    index: i,
    count,
    xpRequired: next ? Math.round(rank.min + span * (i + 1) / (count + 1)) : rank.min,
  }));
}

// ── МОНЕТНЫЙ БОНУС ПОД КАЖДОЙ КАРТОЧКОЙ ЗВАНИЯ ──
// Отдельно от RANK_REWARDS (жетон-"сюрприз" МЕЖДУ карточками, может быть
// баннером/предметом) — это фиксированные монеты, которые показываются
// прямо ПОД карточкой самого звания (иконка монеты слева, "N монет"
// справа), чтобы у любого звания, даже без coin-награды в RANK_REWARDS,
// был на виду простой монетный бонус. Пока это ЧИСТО отображение на
// клиенте (плейсхолдер-баланс, растёт вместе с порогом XP звания) —
// если нужна реальная выдача этих монет по кнопке "Забрать", это нужно
// завести на сервере отдельным полем и присылать сюда с бэкенда.
const RANK_COIN_BONUS = Object.fromEntries(
  RANKS.map(r => [r.name, Math.max(5, Math.round(r.min / 10))])
);


// Человекочитаемое описание награды за звание — используется и в карусели
// "Все звания", и в мини-бейдже прогресса. itemId ищется в ALL_SHOP_ITEMS
// (объявлен ниже, после каталогов магазина).
function rankRewardInfo(reward) {
  if (!reward) return null;
  if (reward.type === 'coins')  return { icon:'🪙', label:`+${reward.amount} монет` };
  if (reward.type === 'banner') {
    const tierLabel = { free:'Простой баннер', gradient:'Градиентный баннер', animated:'Анимированный баннер' }[reward.tier] || 'Баннер';
    return { icon:'🖼️', label: tierLabel };
  }
  if (reward.type === 'shop_item') {
    const item = typeof getShopItemById === 'function' ? getShopItemById(reward.itemId) : null;
    return { icon:'🎁', label: item ? item.title : 'Предмет магазина' };
  }
  if (reward.type === 'vip_temp') {
    return { icon:'💎', label: `VIP на ${reward.hours} ${reward.hours === 1 ? 'час' : (reward.hours < 5 ? 'часа' : 'часов')}` };
  }
  return null;
}

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

// ── ИКОНКИ ЧЕКПОИНТОВ "ДОРОГИ НАГРАД" (открытый/закрытый замок, галочка) ──
// fill="currentColor", поэтому цвет задаётся через CSS (color) на самом
// круге-чекпоинте (.road-checkpoint-done/-current/-locked) — один и тот же
// SVG переиспользуется для любого состояния/цветовой темы.
const ICON_ROAD_LOCK_OPEN = '<svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 6.66699C0 6.13656 0.210714 5.62785 0.585787 5.25278C0.960859 4.87771 1.46957 4.66699 2 4.66699H10C10.5304 4.66699 11.0391 4.87771 11.4142 5.25278C11.7893 5.62785 12 6.13656 12 6.66699V11.3337C12 11.8641 11.7893 12.3728 11.4142 12.7479C11.0391 13.1229 10.5304 13.3337 10 13.3337H2C1.46957 13.3337 0.960859 13.1229 0.585787 12.7479C0.210714 12.3728 0 11.8641 0 11.3337V6.66699ZM6.66667 8.00033C6.66667 7.82352 6.59643 7.65395 6.4714 7.52892C6.34638 7.4039 6.17681 7.33366 6 7.33366C5.82319 7.33366 5.65362 7.4039 5.5286 7.52892C5.40357 7.65395 5.33333 7.82352 5.33333 8.00033V10.0003C5.33333 10.1771 5.40357 10.3467 5.5286 10.4717C5.65362 10.5968 5.82319 10.667 6 10.667C6.17681 10.667 6.34638 10.5968 6.4714 10.4717C6.59643 10.3467 6.66667 10.1771 6.66667 10.0003V8.00033Z" fill="currentColor"/><path d="M8.00098 5.33398V3.33398C8.00098 2.80366 7.78997 2.29497 7.41504 1.91992C7.04 1.54488 6.53136 1.33402 6.00098 1.33398C5.47054 1.33398 4.96199 1.54485 4.58691 1.91992C4.32659 2.18014 3.90388 2.18014 3.64355 1.91992C3.38324 1.65961 3.38331 1.23692 3.64355 0.976562C4.26868 0.351441 5.11692 0 6.00098 0C6.88486 3.28554e-05 7.73236 0.351635 8.35742 0.976562C8.98254 1.60168 9.33398 2.44993 9.33398 3.33398V5.33398C9.33381 5.70187 9.03584 5.99976 8.66797 6C8.29989 6 8.00115 5.70202 8.00098 5.33398Z" fill="currentColor"/></svg>';
const ICON_ROAD_LOCK_CLOSED = '<svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 6.66699C0 6.13656 0.210714 5.62785 0.585787 5.25278C0.960859 4.87771 1.46957 4.66699 2 4.66699H10C10.5304 4.66699 11.0391 4.87771 11.4142 5.25278C11.7893 5.62785 12 6.13656 12 6.66699V11.3337C12 11.8641 11.7893 12.3728 11.4142 12.7479C11.0391 13.1229 10.5304 13.3337 10 13.3337H2C1.46957 13.3337 0.960859 13.1229 0.585787 12.7479C0.210714 12.3728 0 11.8641 0 11.3337V6.66699ZM6.66667 8.00033C6.66667 7.82351 6.59643 7.65395 6.4714 7.52892C6.34638 7.4039 6.17681 7.33366 6 7.33366C5.82319 7.33366 5.65362 7.4039 5.5286 7.52892C5.40357 7.65395 5.33333 7.82351 5.33333 8.00033V10.0003C5.33333 10.1771 5.40357 10.3467 5.5286 10.4717C5.65362 10.5968 5.82319 10.667 6 10.667C6.17681 10.667 6.34638 10.5968 6.4714 10.4717C6.59643 10.3467 6.66667 10.1771 6.66667 10.0003V8.00033Z" fill="currentColor"/><path d="M8.00033 5.33398V3.33398C8.00033 2.8037 7.78926 2.29496 7.41439 1.91992C7.03939 1.54493 6.53064 1.33407 6.00033 1.33398C5.46989 1.33398 4.96134 1.54485 4.58626 1.91992C4.21119 2.29499 4.00033 2.80355 4.00033 3.33398V5.33398C4.00015 5.70202 3.70141 6 3.33333 6C2.96525 6 2.66652 5.70202 2.66634 5.33398V3.33398C2.66634 2.44993 3.01778 1.60168 3.6429 0.976562C4.26802 0.351441 5.11627 0 6.00033 0C6.88419 8.61602e-05 7.73174 0.35162 8.35677 0.976562C8.98189 1.60168 9.33333 2.44993 9.33333 3.33398V5.33398C9.33316 5.70202 9.03442 6 8.66634 6C8.29841 5.99982 8.0005 5.70192 8.00033 5.33398Z" fill="currentColor"/></svg>';
const ICON_ROAD_CHECK = '<svg width="10" height="7" viewBox="0 0 10 7" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.79289 0.292893C8.18342 -0.0976311 8.81643 -0.0976311 9.20696 0.292893C9.59748 0.683417 9.59748 1.31643 9.20696 1.70696L4.20696 6.70696C3.81643 7.09748 3.18342 7.09748 2.79289 6.70696L0.292893 4.20696C-0.0976311 3.81643 -0.0976311 3.18342 0.292893 2.79289C0.683417 2.40237 1.31643 2.40237 1.70696 2.79289L3.49992 4.58586L7.79289 0.292893Z" fill="currentColor"/></svg>';

// ── ОБЫЧНЫЕ УЛУЧШЕНИЯ ──
// Постоянные апгрейды (type:'upgrade'), а также перенесённые сюда по
// просьбе — общедоступные кулдаун-ускорители −25%/−50% и цветная бомбочка
// 3×3 (type:'cooldown_boost'/'consumable'), которые раньше требовали VIP.
// Турбо −90% и остальные "хаос"-расходники остаются эксклюзивом VIP-вкладки.
const SHOP_ITEMS_USER = [
  {id:'stencil_auto_1',title:'Авто-подбор цветов Ур.1',desc:'Автоматически выбирает ближайший цвет палитры при наведении на трафарет.',icon:ICON_PALETTE,cost:70,type:'upgrade'},
  {id:'stencil_auto_2',title:'Авто-подбор цветов Ур.2',desc:'Ур.1 + подсветка соседних пустых пикселей того же цвета.',icon:ICON_PALETTE_PLUS,cost:150,type:'upgrade',requires:'stencil_auto_1'},
  {id:'cooldown_boost_25',title:'Ускоритель −25%',desc:'Снижает кулдаун установки пикселя на 25% на 15 минут.',icon:ICON_BOLT,cost:10,type:'cooldown_boost',pct:25,durationMin:15,count:1},
  {id:'cooldown_boost_50',title:'Ускоритель −50%',desc:'Снижает кулдаун установки пикселя на 50% на 15 минут.',icon:ICON_BOLT_DOUBLE,cost:25,type:'cooldown_boost',pct:50,durationMin:15,count:1},
  {id:'bomb_3x3',title:'Цветная бомбочка 3×3',desc:'Заливает квадрат 3×3 вокруг выбранной точки выбранным цветом.',icon:ICON_BOMB,cost:5,type:'consumable',count:1},
];

const SHOP_ITEMS_VIP = [
  {id:'rainbow_5x5',title:'Радужный взрыв 5×5',desc:'Заполняет квадрат 5×5 случайными цветами из палитры. Хаос гарантирован!',icon:ICON_RAINBOW,cost:12,type:'consumable',count:1},
  {id:'eraser_10x10',title:'Большой Ластик 10×10',desc:'Стирает (заливает белым) квадрат 10×10. Идеален для расчистки места.',icon:ICON_ERASER,cost:20,type:'consumable',count:1},
  {id:'mirror_stamp',title:'Зеркальный штамп',desc:'Копирует область 5×5 под курсором и вставляет с зеркальным отражением.',icon:ICON_MIRROR,cost:35,type:'consumable',count:1},
];

// ── УСКОРИТЕЛИ КУЛДАУНА (VIP-эксклюзив) ──
// type:'cooldown_boost' — при использовании временно снижает кулдаун
// установки пикселя на pct% на durationMin минут. Действует именно в
// процентах (а не в фикс. секундах), чтобы работать предсказуемо при любом
// базовом кулдауне, который задаёт админ через слайдер.
const SHOP_ITEMS_COOLDOWN = [
  {id:'cooldown_boost_90',title:'Турбо-режим −90%',desc:'Снижает кулдаун установки пикселя на 90% на 5 минут. Для настоящего спринта!',icon:ICON_ROCKET,cost:55,type:'cooldown_boost',pct:90,durationMin:5,count:1},
];

const SHOP_ITEMS_ADMIN = [
  {id:'admin_nuke',title:'Ядерная кнопка',desc:'Полностью очищает весь холст. Используй с умом!',icon:ICON_RADIATION,cost:0,type:'admin_tool'},
  {id:'admin_rainbow',title:'Радужный шторм',desc:'Заливает весь холст случайными цветами.',icon:ICON_RAINBOW,cost:0,type:'admin_tool'},
];

// Единый список всех товаров (без admin-инструментов) — нужен, чтобы
// найти title/icon предмета по itemId, когда он приходит наградой за
// звание (RANK_REWARDS: {type:'shop_item', itemId}), см. rankRewardInfo() выше.
const ALL_SHOP_ITEMS = [...SHOP_ITEMS_USER, ...SHOP_ITEMS_VIP, ...SHOP_ITEMS_COOLDOWN];
function getShopItemById(id) { return ALL_SHOP_ITEMS.find(i => i.id === id) || null; }

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
  { limit:10,  cost:30,   id:'members_10'  },
  { limit:25,  cost:90,   id:'members_25'  },
  { limit:50,  cost:300,  id:'members_50'  },
  { limit:100, cost:1500, id:'members_100' },
];

// Разовые товары клана (не зависят от тиров лимита)
const CLAN_SHOP_ITEMS = [
  {
    id:'banner_static', title:'Статичный баннер клана', icon:'🖼️',
    desc:'Открывает возможность загрузить собственную картинку-баннер клана (JPG/PNG), которая отображается в шапке клана и в лидерборде.',
    cost:60, type:'banner', requiresPerm:'manage_settings',
  },
  {
    id:'banner_animated', title:'Анимированный баннер клана', icon:'🎞️',
    desc:'Открывает загрузку анимированного баннера (GIF, WebP и т.д.) — выделит клан среди остальных в лидерборде и шапке.',
    cost:150, type:'banner', requiresPerm:'manage_settings', requires:'banner_static',
  },
];
// ── АЧИВКИ ──
// Полностью выводятся из уже существующих клиентских глобалок (currentPixels,
// currentCoins, currentClan, purchasedItems, isVip/isAdmin, cpFriends,
// sessionPixels) — никаких новых полей на сервере/в БД не требуется,
// поэтому это не расходует ни байта дополнительного места в Redis.
// stats передаётся из buildAchievementStats() в ui.js.
// xp — награда опытом, показывается бейджем справа от карточки ачивки и
// начисляется сервером в acc.xp в момент реальной разблокировки (см.
// ACHIEVEMENTS_DEF/checkAchievements в server.js — значения xp должны
// совпадать 1-в-1 с этим списком).
// progress(s) — [текущее, нужное] значение для прогресс-бара. Для
// булевых ачивок (клан/vip/покупка) это просто [0|1, 1].
const ACHIEVEMENTS = [
  // ── Опыт/пиксели ──
  { id:'first_pixel',   title:'Первый мазок',      desc:'Наберите 1 очко опыта',                  icon:'🖌️', xp:10,   check: s => s.xp >= 1,        progress: s => [s.xp, 1] },
  { id:'pixels_50',     title:'Начинающий',        desc:'Наберите 50 очков опыта',                icon:'🌱', xp:20,   check: s => s.xp >= 50,       progress: s => [s.xp, 50] },
  { id:'pixels_200',    title:'Художник',          desc:'Наберите 200 очков опыта',               icon:'🎨', xp:40,   check: s => s.xp >= 200,      progress: s => [s.xp, 200] },
  { id:'pixels_1000',   title:'Легенда',           desc:'Наберите 1000 очков опыта',              icon:'⭐', xp:80,   check: s => s.xp >= 1000,     progress: s => [s.xp, 1000] },
  { id:'pixels_3000',   title:'Виртуоз',            desc:'Наберите 3000 очков опыта',              icon:'🌈', xp:130,  check: s => s.xp >= 3000,     progress: s => [s.xp, 3000] },
  { id:'pixels_5000',   title:'Архитектор',        desc:'Наберите 5000 очков опыта',              icon:'🏛️', xp:180,  check: s => s.xp >= 5000,     progress: s => [s.xp, 5000] },
  { id:'pixels_10000',  title:'Мастер оттенков',   desc:'Наберите 10 000 очков опыта',            icon:'🌀', xp:260,  check: s => s.xp >= 10000,    progress: s => [s.xp, 10000] },
  { id:'pixels_20000',  title:'Бог Пикселей',      desc:'Наберите 20 000 очков опыта',            icon:'👑', xp:380,  check: s => s.xp >= 20000,    progress: s => [s.xp, 20000] },
  { id:'pixels_50000',  title:'Пиксельный титан',  desc:'Наберите 50 000 очков опыта',            icon:'🔥', xp:600,  check: s => s.xp >= 50000,    progress: s => [s.xp, 50000] },
  { id:'pixels_100000', title:'Повелитель холста', desc:'Наберите 100 000 очков опыта',           icon:'🌌', xp:1000, check: s => s.xp >= 100000,   progress: s => [s.xp, 100000] },
  { id:'pixels_250000', title:'Мифический творец', desc:'Наберите 250 000 очков опыта',           icon:'🐉', xp:2000, check: s => s.xp >= 250000,   progress: s => [s.xp, 250000] },
  // ── Монеты ──
  { id:'coins_100',     title:'Первая заначка',    desc:'Накопи 100 монет одновременно',          icon:'👛', xp:15,   check: s => s.coins >= 100,       progress: s => [s.coins, 100] },
  { id:'coins_500',     title:'Коллекционер',      desc:'Накопи 500 монет одновременно',          icon:'🪙', xp:30,   check: s => s.coins >= 500,       progress: s => [s.coins, 500] },
  { id:'coins_1000',    title:'Богач',             desc:'Накопи 1000 монет одновременно',         icon:'💵', xp:55,   check: s => s.coins >= 1000,      progress: s => [s.coins, 1000] },
  { id:'coins_2500',    title:'Инвестор',           desc:'Накопи 2500 монет одновременно',         icon:'💴', xp:90,   check: s => s.coins >= 2500,      progress: s => [s.coins, 2500] },
  { id:'coins_5000',    title:'Магнат',            desc:'Накопи 5000 монет одновременно',         icon:'💰', xp:130,  check: s => s.coins >= 5000,      progress: s => [s.coins, 5000] },
  { id:'coins_10000',   title:'Олигарх',            desc:'Накопи 10 000 монет одновременно',       icon:'🏦', xp:200,  check: s => s.coins >= 10000,     progress: s => [s.coins, 10000] },
  { id:'coins_25000',   title:'Финансовый гений',   desc:'Накопи 25 000 монет одновременно',       icon:'💎', xp:350,  check: s => s.coins >= 25000,     progress: s => [s.coins, 25000] },
  { id:'coins_50000',   title:'Хранитель сокровищ', desc:'Накопи 50 000 монет одновременно',       icon:'🏆', xp:600,  check: s => s.coins >= 50000,     progress: s => [s.coins, 50000] },
  { id:'coins_100000',  title:'Пиксельный миллионер', desc:'Накопи 100 000 монет одновременно',    icon:'🤑', xp:1100, check: s => s.coins >= 100000,    progress: s => [s.coins, 100000] },
  // ── Покупки ──
  { id:'first_purchase',title:'Первая покупка',    desc:'Купи что-нибудь в магазине',             icon:'🛒', xp:15,   check: s => s.purchasedCount > 0, progress: s => [Math.min(s.purchasedCount,1), 1] },
  { id:'purchase_5',    title:'Постоянный клиент', desc:'Соверши 5 покупок в магазине',           icon:'🛍️', xp:25,   check: s => s.purchasedCount >= 5,  progress: s => [s.purchasedCount, 5] },
  { id:'purchase_10',   title:'Завсегдатай магазина', desc:'Соверши 10 покупок в магазине',       icon:'🧺', xp:45,   check: s => s.purchasedCount >= 10, progress: s => [s.purchasedCount, 10] },
  { id:'purchase_20',   title:'Шопоголик',         desc:'Соверши 20 покупок в магазине',          icon:'🧾', xp:75,   check: s => s.purchasedCount >= 20, progress: s => [s.purchasedCount, 20] },
  { id:'purchase_50',   title:'Скупщик товаров',   desc:'Соверши 50 покупок в магазине',          icon:'📦', xp:150,  check: s => s.purchasedCount >= 50, progress: s => [s.purchasedCount, 50] },
  { id:'purchase_100',  title:'Владелец лавки',     desc:'Соверши 100 покупок в магазине',         icon:'🏪', xp:280,  check: s => s.purchasedCount >= 100, progress: s => [s.purchasedCount, 100] },
  // ── Друзья ──
  { id:'friend_1',      title:'Первый друг',       desc:'Добавь хотя бы одного друга',            icon:'🤝', xp:15,   check: s => s.friendsCount >= 1,  progress: s => [s.friendsCount, 1] },
  { id:'friend_5',      title:'Душа компании',     desc:'Добавь 5 друзей',                        icon:'🎉', xp:35,   check: s => s.friendsCount >= 5,  progress: s => [s.friendsCount, 5] },
  { id:'friend_10',     title:'Душа общества',     desc:'Добавь 10 друзей',                       icon:'🎊', xp:60,   check: s => s.friendsCount >= 10, progress: s => [s.friendsCount, 10] },
  { id:'friend_25',     title:'Центр тусовки',      desc:'Добавь 25 друзей',                       icon:'🥳', xp:120,  check: s => s.friendsCount >= 25, progress: s => [s.friendsCount, 25] },
  { id:'friend_50',     title:'Мэр сообщества',     desc:'Добавь 50 друзей',                       icon:'🌐', xp:220,  check: s => s.friendsCount >= 50, progress: s => [s.friendsCount, 50] },
  { id:'friend_100',    title:'Легенда социума',    desc:'Добавь 100 друзей',                      icon:'🫂', xp:400,  check: s => s.friendsCount >= 100, progress: s => [s.friendsCount, 100] },
  // ── Баннеры ──
  { id:'banners_3',     title:'Коллекционер баннеров', desc:'Владей 3 баннерами профиля',         icon:'🖼️', xp:40,   check: s => (s.ownedBannersCount||0) >= 3,  progress: s => [s.ownedBannersCount||0, 3] },
  { id:'banners_6',     title:'Ценитель стиля',     desc:'Владей 6 баннерами профиля',             icon:'🎏', xp:70,   check: s => (s.ownedBannersCount||0) >= 6,  progress: s => [s.ownedBannersCount||0, 6] },
  { id:'banners_10',    title:'Модный игрок',       desc:'Владей 10 баннерами профиля',            icon:'🏳️', xp:120,  check: s => (s.ownedBannersCount||0) >= 10, progress: s => [s.ownedBannersCount||0, 10] },
  { id:'banners_15',    title:'Витрина достижений', desc:'Владей 15 баннерами профиля',            icon:'🪧', xp:200,  check: s => (s.ownedBannersCount||0) >= 15, progress: s => [s.ownedBannersCount||0, 15] },
  { id:'banners_20',    title:'Галерея баннеров',   desc:'Владей 20 баннерами профиля',            icon:'🏵️', xp:320,  check: s => (s.ownedBannersCount||0) >= 20, progress: s => [s.ownedBannersCount||0, 20] },
  // ── Сессия (только клиент, не персистится на сервере) ──
  { id:'session_100',   title:'Продуктивная сессия', desc:'Поставь 100 пикселей за одну сессию',  icon:'🕐', xp:25,  check: s => s.sessionPixels >= 100, progress: s => [s.sessionPixels||0, 100] },
  // ── Клан / статус ──
  { id:'clan_member',   title:'Не один в поле',    desc:'Вступи в клан',                           icon:'🚩', xp:20,   check: s => !!s.clan,             progress: s => [s.clan ? 1 : 0, 1] },
  { id:'vip',           title:'Особый статус',     desc:'Получи VIP-роль',                        icon:'✨', xp:50,   check: s => s.isVip || s.isAdmin, progress: s => [(s.isVip||s.isAdmin) ? 1 : 0, 1] },
  // ── Комбо-ачивки ──
  { id:'combo_starter',          title:'Крепкий старт',          desc:'Наберите 50 опыта и накопите 100 монет',                                        icon:'🚀', xp:30,   check: s => s.xp >= 50 && s.coins >= 100, progress: s => [(s.xp>=50&&s.coins>=100)?1:0, 1] },
  { id:'combo_social_clan',      title:'Душа клана',             desc:'Вступи в клан и заведи 5 друзей',                                               icon:'🏰', xp:90,   check: s => !!s.clan && s.friendsCount >= 5, progress: s => [(!!s.clan&&s.friendsCount>=5)?1:0, 1] },
  { id:'combo_shopaholic',       title:'Транжира',               desc:'20 покупок и 5000 монет в кошельке одновременно',                               icon:'💸', xp:200,  check: s => s.purchasedCount >= 20 && s.coins >= 5000, progress: s => [(s.purchasedCount>=20&&s.coins>=5000)?1:0, 1] },
  { id:'combo_collector_deluxe', title:'Коллекционер де люкс',   desc:'10 баннеров и 20 покупок в магазине',                                           icon:'🎭', xp:220,  check: s => (s.ownedBannersCount||0) >= 10 && s.purchasedCount >= 20, progress: s => [((s.ownedBannersCount||0)>=10&&s.purchasedCount>=20)?1:0, 1] },
  { id:'combo_ultimate',         title:'Идеальный игрок',        desc:'100 000 опыта, 50 000 монет, 25 друзей, 15 баннеров, клан и VIP — всё сразу',   icon:'🌠', xp:1500, check: s => s.xp >= 100000 && s.coins >= 50000 && s.friendsCount >= 25 && (s.ownedBannersCount||0) >= 15 && !!s.clan && (s.isVip||s.isAdmin), progress: s => [[s.xp>=100000,s.coins>=50000,s.friendsCount>=25,(s.ownedBannersCount||0)>=15,!!s.clan,(s.isVip||s.isAdmin)].filter(Boolean).length, 6] },
  { id:'combo_grandmaster',      title:'Гроссмейстер пикселей',  desc:'250 000 опыта, 100 000 монет и 100 покупок — вершина мастерства',               icon:'🏅', xp:2500, check: s => s.xp >= 250000 && s.coins >= 100000 && s.purchasedCount >= 100, progress: s => [[s.xp>=250000,s.coins>=100000,s.purchasedCount>=100].filter(Boolean).length, 3] },
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