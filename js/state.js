'use strict';

// ── STATE ──
let ws = null;
let canvasW = 256, canvasH = 256;
let canvasData = new Uint8Array(canvasW * canvasH);
let selectedColor = 0;
let cooldown = 0, cooldownTime = 10.0, cooldownTimer = null;
// ── КУЛДАУН-УСКОРИТЕЛИ (магазин) ──
// baseCooldownTime — базовый кулдаун от сервера (settings.cooldownMs).
// cooldownBoostPct/Until — активный процентный буст поверх базового;
// cooldownTime всегда пересчитывается через recomputeCooldownTime().
let baseCooldownTime = 10.0, cooldownBoostPct = 0, cooldownBoostUntil = 0, cooldownBoostExpireTimer = null;
function recomputeCooldownTime() {
  const active = cooldownBoostUntil > Date.now() && cooldownBoostPct > 0;
  cooldownTime = active ? +(baseCooldownTime * (1 - cooldownBoostPct / 100)).toFixed(2) : baseCooldownTime;
  clearTimeout(cooldownBoostExpireTimer);
  if (active) {
    cooldownBoostExpireTimer = setTimeout(() => {
      cooldownBoostPct = 0; cooldownBoostUntil = 0;
      recomputeCooldownTime();
      if (typeof showToast === 'function') showToast('⌛ Действие ускорителя кулдауна закончилось', 'info');
      if (typeof buildShopUI === 'function') buildShopUI();
    }, cooldownBoostUntil - Date.now());
  }
}
function applyCooldownBoost(pct, until) {
  cooldownBoostPct = pct || 0;
  cooldownBoostUntil = until || 0;
  recomputeCooldownTime();
  if (typeof buildShopUI === 'function') buildShopUI();
}
let isLoggedIn = false, isAdmin = false, isVip = false;
let currentUser = '', currentPixels = 0, sessionPixels = 0;
let currentRank = 'Новичок', currentEmoji = '👾', currentAvatar = null;
let currentCoins = 0, purchasedItems = [];
// ── БАННЕР ПРОФИЛЯ (Этап 2) ──
let currentBannerId = null;       // текущий выбранный баннер (id из каталога, или null)
let ownedBanners = [];            // купленные платные баннеры (id-шники)
let profileBannersCatalog = [];   // весь каталог баннеров, приходит с сервера в auth_success
let currentClan = '';
let clanFullData = null;   // последний полный объект клана с сервера (name, ranks, member_roles, ...)
let clanRanksEditingId = null; // id звания, которое сейчас редактируется в панели "Звания" (null = форма создания скрыта)
let tool = 'pencil'; 
let gridEnabled = false, smoothCamera = true, showCursors = true;
let inspectorEnabled = true, soundEnabled = false;
let camX = 0, camY = 0, camZoom = 3;
let targetCamX = 0, targetCamY = 0, targetCamZoom = 3;
let smoothAnimId = null;
let isDragging = false, dragStart = {x:0,y:0}, camStart = {x:0,y:0};
let hoveredPixel = {x:-1,y:-1};
let otherCursors = {};
let lastSentCursor = {x:-1,y:-1};
let adminPage = 1, adminTotalPages = 1;
let allAdminUsers = [];
let sessionFile = {username:'',password:''};
let selectedEmoji = '👾';
let isReconnecting = false;
let serverCursorsEnabled = false;
let clanShareCursor = false;
let leaderboardOpen = false;

// ── ЭТАП 3: профиль любого пользователя ──
// viewingProfileUsername — чей профиль сейчас открыт в #profile-panel
// (null/currentUser = свой). viewingProfileData — последние полученные
// от сервера publичные данные ЧУЖОГО профиля (profile_data), null пока
// смотрим свой профиль. См. openProfile()/renderProfileData() в ui.js.
let viewingProfileUsername = null;
let viewingProfileData = null;

// News state
let newsItems = [];            // данные новостей с сервера (уже отсортированы по order)
let newsAdminEditId = null;    // id новости, которая сейчас редактируется в админке (null = новая)
let newsAdminBgImage = null;   // URL загруженной картинки фона (пока форма открыта)
let newsAdminEventTimer = null; // выбранный таймстамп события (мс) в форме админки

// Chat state
let chatMessages = [];
let chatUnread = 0;
let chatOpen = false;
let clanChatMessages = [];

// ── SOCIAL HUB (попап чата: друзья, ЛС, онлайн) ──
// Раньше это была отдельная js/chat-popup.js с моковыми данными (CP_*).
// Теперь она удалена, а состояние живёт здесь и питается настоящим бэкендом
// (friends_get/friends_update, dm_conversations/dm_message, online_users_get и т.д.)
const CP_RANK_CLASS = { 'Новичок':'cp-rank-novice', 'Художник':'cp-rank-artist', 'Маэстро':'cp-rank-maestro', 'Легенда':'cp-rank-legend', 'Архитектор':'cp-rank-architect', 'Бог Пикселей':'cp-rank-god' };
const CP_STATUS_LABEL = { online: 'в сети', offline: 'не в сети' };

let cpActiveTab = 'chats';       // 'chats' | 'friends'
let cpActiveConvId = 'ch-general';
let cpSearchQuery = '';
let cpInfoOpen = false;      // синхронизировано с DOM: изначально .cp-info-open не навешан в HTML
let cpInited = false;

let cpFriends = [];              // [userCard]
let cpIncoming = [];             // входящие заявки в друзья [userCard]
let cpOutgoing = [];             // исходящие заявки [userCard]
let cpDmConversations = [];      // [{username, emoji, rank, online, lastMessage, lastFrom, lastTs, unread, ...}]
let cpDmThreads = {};            // username -> [{from, text, ts}]
let cpOnlineUsers = [];          // [{username, emoji, role, rank, clan}]
let cpUserCache = {};            // username -> последняя известная карточка (для аватарок где угодно)
let cpSearchResults = [];        // результаты user_search в модалке "Добавить друга"
let cpSearchDebounceTimer = null;

// Admin Image Tool
let adminImageData = null;
let adminImgObj = null;
let adminImgRect = {x:0,y:0,w:0,h:0};
let isDraggingTool = false;
let adminActiveHandle = null;
let adminDragOffset = {x:0,y:0};
let adminImagePreviewMode = false;

// Admin Shape Tools
let isDraggingAdminShape = false;
let adminShapeStart = {x:0,y:0}, adminShapeEnd = {x:0,y:0};
let adminShapeFilled = true;

// Admin Move Tool
let adminMoveState = 'idle';
let adminMoveRect = null;
let adminMoveCanvas = null; 

// Stencil State
let stencilActive = false;
let stencilEditMode = true; 
let stencilImg = null;        
let stencilOrigImg = null; 
let personalStencilUrl = null; // Ссылка на личный трафарет в Cloudinary
let stencilRect = {x:0,y:0,w:100,h:100};
let stencilOpacity = 0.6;
let stencilHandle = null;
let stencilDragOffset = {x:0,y:0};
let stencilImageData = null;
let stencilOrigWidth = 0, stencilOrigHeight = 0;
let savedStencils = []; // Сохраненные пресеты трафаретов
let stencilLocked = false; // true = трафарет взят у соклановца, нельзя двигать/масштабировать
let stencilOwnerName = ''; // имя владельца, если трафарет взят у соклановца (для лейбла)
let stencilUploadPending = false; // true = картинка ещё грузится на Cloudinary, personalStencilUrl устарел
let stencilPendingSave = null; // { rect, opacity } — копится, пока upload не завершится, и шлётся сразу после
let stencilUploadGen = 0; // увеличивается при каждой новой загрузке/отмене — отбрасывает устаревшие ответы fetch

// Active item usage
let activeItem = null;

// ── ЛОКАУТ (глобальное закрытие Пиксель Батла) ──
let lockdownState = { active:false, until:0, message:'' };
let lockdownCountdownTimer = null;

// ── РЕКЛАМА ──
let adsConfig = { active:false, type:'banner', imageUrl:'', link:'', intervalMinutes:5 };
let adsShowTimer = null;
let adsAdminImageUrl = null; // временное хранилище загруженной картинки рекламы, пока открыта форма в админке

// ── ПРИКРЕПЛЕНИЕ МЕСТА НА ХОЛСТЕ К СООБЩЕНИЮ В ЧАТЕ ──
// true = попап чата скрыт, ждём клика по холсту, чтобы взять координаты
// и вставить их в поле ввода того чата/ЛС, из которого был вызван режим.
let canvasAttachPickMode = false;
let canvasAttachConvId = null;

// "Пользователь печатает…" — троеточие в шапке/списке ЛС
let cpTypingTimers = {};      // username -> timeout, сбрасывающий индикатор
let cpTypingFrom = {};        // username -> true, если сейчас печатает нам
let cpMyTypingTimer = null;   // троттлинг отправки собственного 'typing' на сервер

// ── PIXEL OWNERSHIP CACHE ──
// Ключ: "x,y" → { username, emoji } | 'loading' | 'unknown'
const pixelOwnerCache = new Map();
let pixelInfoDebounceTimer = null;
let pixelInfoLastPos = { x: -1, y: -1 };

// ── DOM ELEMENTS ──
const wrap = document.getElementById('canvas-wrap');
const mainCanvas = document.getElementById('main-canvas');
const overlayCanvas = document.getElementById('overlay-canvas');
const shadowDiv = document.getElementById('canvas-shadow');
const mctx = mainCanvas.getContext('2d');
const octx = overlayCanvas.getContext('2d');
const cursorsLayer = document.getElementById('cursors-layer');
const cursorEls = {};