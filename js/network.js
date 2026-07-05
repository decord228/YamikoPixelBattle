'use strict';

// ── WEBSOCKET ──
function connect() {
  if (ws&&ws.readyState===WebSocket.OPEN) ws.close();
  updateConnStatus(false);
  ws = new WebSocket(typeof getWsUrl === 'function' ? getWsUrl() : WS_URL);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    updateConnStatus(true);
    document.getElementById('connecting-screen').classList.add('hide');
    const s=loadSession();
    if (s&&s.username&&s.password) {
      sessionFile=s;
      sendJSON({action:'auth',username:s.username,password:s.password,email:'',is_register:false});
    }
  };

  ws.onclose = () => {
    updateConnStatus(false);
    if (isLoggedIn){isLoggedIn=false;showToast('Соединение потеряно. Переподключение...','error');}
    document.getElementById('online-count').textContent='0';
    clearCursorFlags();
    if (!isReconnecting){isReconnecting=true;setTimeout(()=>{isReconnecting=false;connect();},3500);}
  };

  ws.onerror=()=>{};

  ws.onmessage=(e)=>{
    if (e.data instanceof ArrayBuffer) handleBinary(new Uint8Array(e.data));
    else try{handleJSON(JSON.parse(e.data));}catch(_){}
  };
}

function sendJSON(obj){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function reconnectWS(){connect();}

function updateConnStatus(ok){
  const el=document.getElementById('conn-status');
  el.textContent=ok?'⬤ Онлайн':'⬤ Отключён';
  el.className=ok?'ok':'';
}

function handleBinary(data) {
  const len=data.length;
  if (len===canvasW*canvasH){canvasData.set(data);fullRender(data);}
  else if (len===3&&data[0]===255){document.getElementById('online-count').textContent=(data[1]<<8)|data[2];}
  else if (len%5===0&&len>0){
    for (let i=0;i<len;i+=5){
      const x=(data[i]<<8)|data[i+1],y=(data[i+2]<<8)|data[i+3],cidx=data[i+4];
      if (x>=0&&x<canvasW&&y>=0&&y<canvasH&&cidx<PALETTE.length){
        canvasData[y*canvasW+x]=cidx;renderPixel(x,y,cidx);
        // Инвалидируем кэш автора — пиксель только что перекрасили
        pixelOwnerCache.delete(`${x},${y}`);
      }
    }
  }
}

function handleJSON(d) {
  const a=d.action||d.type||'';

  if (a==='auth_success'||a==='auth_ok') {
    isLoggedIn=true;
    currentUser=d.username||'?';
    isAdmin=(d.role==='admin');
    isVip=(d.role==='vip');
    currentPixels=d.pixels||0;
    currentRank=d.rank||'Новичок';
    currentEmoji=d.emoji||'👾';
    currentAvatar=d.avatar||null;
    currentBannerId=d.banner||null;
    ownedBanners=d.owned_banners||[];
    if (d.banners_catalog) profileBannersCatalog=d.banners_catalog;
    currentCoins=d.coins||0;
    purchasedItems=d.purchased_items||d.purchased_levels||[];
    currentClan=d.clan||'';
    selectedEmoji=currentEmoji;
    savedStencils = d.saved_stencils || [];
    if (typeof renderSavedStencils === 'function') renderSavedStencils();
    if (d.canvas_w&&d.canvas_h&&(d.canvas_w!==canvasW||d.canvas_h!==canvasH)) resizeCanvas(d.canvas_w,d.canvas_h);
    if (d.settings) applyServerSettings(d.settings);
    applyCooldownBoost(d.cooldown_boost?.pct || 0, d.cooldown_boost?.until || 0);
    // Раньше себя не было в cpUserCache вообще (сервер намеренно не включает
    // самого игрока в список "онлайн" — это нормально для списка ДРУГИХ
    // пользователей). Но из-за этого cpUser(currentUser)/cpAvatarEl всегда
    // возвращали online:false для собственного аккаунта — свой же аватар с
    // рамкой звания везде показывал "офлайн", хотя ты только что залогинился.
    // Явно заводим свою карточку в кэше с online:true.
    if (typeof cpCacheUser === 'function') {
      cpCacheUser({ username: currentUser, emoji: currentEmoji, avatar: currentAvatar, rank: currentRank, role: (isAdmin?'admin':isVip?'vip':'user'), clan: currentClan, online: true });
    }
    onAuthSuccess(d);
  }
  else if (a==='toast') {
    const msg=d.message||'Уведомление';
    const type=msg.includes('ошибка')||msg.includes('Нет')||msg.includes('уже')?'error':'info';
    showToast(msg,type);
  }
  else if (a==='leaderboard_data') {
    renderLeaderboardPlayers(d.players||[]);
    renderLeaderboardClans(d.clans||[]);
  }
  else if (a==='admin_users_list') {
    allAdminUsers=d.users||[];
    adminPage=d.page||1;
    adminTotalPages=d.total_pages||1;
    renderAdminUsers(allAdminUsers);
    document.getElementById('admin-page-info').textContent=`${adminPage} / ${adminTotalPages}`;
    const navCount=document.getElementById('admin-nav-user-count');
    if (navCount) navCount.textContent = d.total!=null ? d.total : allAdminUsers.length;
  }
  else if (a==='admin_user_detail') {
    if (typeof renderAdminUserModal === 'function') renderAdminUserModal(d.user);
  }
  else if (a==='admin_clans_list') {
    if (typeof renderAdminClans === 'function') renderAdminClans(d.clans||[]);
  }
  else if (a==='resize') {
    resizeCanvas(d.w,d.h||canvasH);
    sendJSON({action:'auth',username:sessionFile.username,password:sessionFile.password,email:'',is_register:false});
  }
  else if (a==='cursor') {
    otherCursors[d.u]={x:d.x,y:d.y,c:d.c,emoji:d.emoji||'👾',avatar:d.avatar||null,clan:d.clan||''};
    updateCursorFlag(d.u,d.x,d.y,d.c,d.emoji||'👾',d.avatar||null);
  }
  else if (a==='server_settings') { applyServerSettings(d.settings); }
  else if (a==='online_count') { document.getElementById('online-count').textContent=d.count; }
  else if (a==='coins_update') {
    currentCoins=d.coins||0;
    updateCoinsUI(currentCoins);
    if (d.pixels) currentPixels=d.pixels;
  }
  else if (a==='banner_update') {
    currentBannerId=d.banner||null;
    ownedBanners=d.owned_banners||[];
    currentCoins=d.coins||0;
    updateCoinsUI(currentCoins);
    if (typeof buildBannerPicker === 'function') buildBannerPicker();
    if (typeof updateProfileBannerDisplay === 'function') updateProfileBannerDisplay();
    if (d.message) showToast(d.message,'success');
  }
  else if (a==='profile_data') {
    // Ответ на profile_get — актуален, только если панель всё ещё открыта
    // именно на этом юзере (пользователь мог успеть закрыть/переключить
    // профиль, пока ответ летел с сервера).
    if (viewingProfileUsername !== d.username) return;
    if (d.notFound) { showToast('Пользователь не найден','error'); hidePanel('profile-panel'); return; }
    if (typeof renderProfileData === 'function') renderProfileData(d);
  }
  else if (a==='clan_update') {
    if (d.clan) {
      currentClan=d.clan.name||'';
      clanSharedStencil = d.clan.shared_stencil || null;
      clanFullData = d.clan;
      renderClanView(d.clan);
    } else {
      currentClan='';
      clanSharedStencil = null;
      clanFullData = null;
      // Если мы только что покинули клан/были исключены, а на холсте у нас
      // показан "чужой" (locked) трафарет клана — он больше не актуален.
      if (stencilLocked) cancelStencil();
      renderNoClanView();
    }
    if (d.coins!==undefined) {currentCoins=d.coins;updateCoinsUI(currentCoins);}
    if (d.message) showToast(d.message,'success');
    if (typeof updateStencilPanelClanStatus === 'function') updateStencilPanelClanStatus();
    if (typeof renderClanStencilsList === 'function') renderClanStencilsList();
  }
  else if (a==='clan_data') {
    if (d.clan) {
      clanSharedStencil = d.clan.shared_stencil || null;
      clanFullData = d.clan;
      renderClanView(d.clan);
      if (typeof updateStencilPanelClanStatus === 'function') updateStencilPanelClanStatus();
      if (typeof renderClanStencilsList === 'function') renderClanStencilsList();
    } else {
      // Сервер ответил null — клан, на который у нас была ссылка, больше не
      // существует (например, полностью пропал из БД). Раньше этот случай
      // никак не обрабатывался: currentClan/clanFullData оставались старыми,
      // и панель клана продолжала показывать "призрачные" данные вместо
      // экрана "клана нет" (см. баг с переименованием клана в админке).
      currentClan = '';
      clanSharedStencil = null;
      clanFullData = null;
      if (stencilLocked) cancelStencil();
      renderNoClanView();
      if (typeof updateStencilPanelClanStatus === 'function') updateStencilPanelClanStatus();
      if (typeof renderClanStencilsList === 'function') renderClanStencilsList();
    }
  }
  else if (a==='clan_list_data') {
    renderClanBrowseList(d.clans||[]);
  }
  else if (a==='clan_settings_update') {
    clanShareCursor=!!d.share_cursor;
    const tog=document.getElementById('cs-cursor-toggle');
    if (tog) tog.classList.toggle('on',clanShareCursor);
    if (!clanShareCursor) clearCursorFlags();
  }
  else if (a==='clan_stencil_update') {
    // Сервер шлёт уже готовый объект { owner, emoji, stencil } или null (если снят).
    clanSharedStencil = d.stencil || null;
    if (typeof renderClanStencilsList === 'function') renderClanStencilsList();
    if (typeof updateStencilPanelClanStatus === 'function') updateStencilPanelClanStatus();

    const isWatchingClanStencil = stencilLocked; // мы сейчас смотрим на чужой (взятый) трафарет
    if (d.from && d.from !== currentUser && !isWatchingClanStencil) {
      if (d.removed) showToast(`${d.from} убрал трафарет из клана`, 'info');
      else showToast(`${d.from} обновил трафарет клана`, 'info');
    }

    // Если прямо сейчас на холсте показан ЧУЖОЙ (locked) трафарет — синхронизируем
    // его вживую: подвинулся/изменился у владельца → подвинется и у нас;
    // владелец снял трафарет → автоматически скрываем у себя тоже.
    if (isWatchingClanStencil) {
      if (!clanSharedStencil || d.removed) {
        cancelStencil();
        showToast('Трафарет клана был снят владельцем', 'info');
      } else if (clanSharedStencil.stencil) {
        const wasShowingOwner = stencilOwnerName === clanSharedStencil.owner;
        if (wasShowingOwner) {
          stencilRect = clanSharedStencil.stencil.rect || stencilRect;
          stencilOpacity = clanSharedStencil.stencil.opacity || stencilOpacity;
          personalStencilUrl = clanSharedStencil.stencil.img;
          document.getElementById('stencil-panel-opacity').value = stencilOpacity * 100;
          document.getElementById('stencil-opacity-val').textContent = Math.round(stencilOpacity * 100) + '%';
          if (clanSharedStencil.stencil.img !== stencilOrigImg?.src) {
            applySharedStencil(clanSharedStencil.stencil, true, clanSharedStencil.owner);
          } else {
            renderOverlay();
          }
          if (d.from && d.from !== currentUser) showToast(`${d.from} обновил трафарет клана`, 'info');
        }
      }
    }
  }
  else if (a==='clan_stencils_list') {
    clanSharedStencil = d.stencil || null;
    if (typeof renderClanStencilsList === 'function') renderClanStencilsList();
    // Обновляем «статус в клане» в панели трафарета, если она открыта
    if (typeof updateStencilPanelClanStatus === 'function') updateStencilPanelClanStatus();
  }
  else if (a==='clan_chat_message') {
    if (d.msg) addClanChatMessage(d.msg.username, d.msg.text, d.msg.emoji, d.msg.ts, d.msg.avatar);
  }
  else if (a==='clan_motd') {
    document.getElementById('clan-motd-text').textContent = d.motd || 'Добро пожаловать в клан!';
  }
  else if (a==='clan_requests') {
    renderClanRequests(d.requests || []);
  }
  else if (a==='chat_message') {
    if (d.msg) {
      addChatMessage(d.msg.username, d.msg.text, d.msg.emoji || '👾', d.msg.avatar || null);
      chatMessages.push(d.msg);
      if (chatMessages.length > 200) chatMessages.shift();
      if (typeof cpOnGlobalMessage === 'function') cpOnGlobalMessage(d.msg);
    }
  }
  else if (a==='chat_history') {
    if (d.messages && Array.isArray(d.messages)) {
      d.messages.forEach(m => addChatMessage(m.username, m.text, m.emoji || '👾', m.avatar || null));
      chatMessages = d.messages.slice(-200);
      if (typeof cpRenderMessages === 'function' && cpActiveConvId === 'ch-general') cpRenderMessages(cpGetActiveConv());
    }
  }
  // ── SOCIAL HUB: друзья / ЛС / онлайн ──
  else if (a==='friends_update') {
    cpFriends  = d.friends  || [];
    cpIncoming = d.incoming || [];
    cpOutgoing = d.outgoing || [];
    [...cpFriends, ...cpIncoming, ...cpOutgoing].forEach(cpCacheUser);
    if (typeof cpUpdateFreqBadge === 'function') cpUpdateFreqBadge();
    if (typeof cpRenderSidebar === 'function') cpRenderSidebar();
    if (typeof cpRenderInfoPanel === 'function' && cpActiveConvId !== 'ch-general') cpRenderInfoPanel(cpGetActiveConv());
    // Если сейчас открыта вкладка "Друзья" в профиле — обновляем её тоже
    // (иначе принятая/отклонённая заявка не пропадёт из списка без
    // повторного открытия вкладки).
    const friendsTabEl = document.getElementById('prof-tab-friends');
    if (friendsTabEl && friendsTabEl.style.display !== 'none' && typeof renderProfileFriendsTab === 'function') {
      renderProfileFriendsTab();
    }
    const achTabEl = document.getElementById('prof-tab-achievements');
    if (achTabEl && achTabEl.style.display !== 'none' && typeof renderProfileAchievementsTab === 'function') {
      renderProfileAchievementsTab();
    }
    // Новый друг может ещё не иметь записи в cpDmConversations (она заводится
    // только когда есть история сообщений или это уже друг) — подтягиваем
    // актуальный список ЛС сразу, чтобы открыть переписку без перезахода в чат.
    sendJSON({ action:'dm_conversations' });
  }
  else if (a==='typing') {
    if (d.from && d.from !== currentUser && typeof cpShowTyping === 'function') cpShowTyping(d.from, !!d.channel);
  }
  else if (a==='friend_presence') {
    if (cpUserCache[d.username]) cpUserCache[d.username].online = !!d.online;
    const f = cpFriends.find(u => u.username === d.username);
    if (f) f.online = !!d.online;
    const c = cpDmConversations.find(u => u.username === d.username);
    if (c) c.online = !!d.online;
    if (typeof cpRenderSidebar === 'function') cpRenderSidebar();
    if (typeof cpRenderHeader === 'function' && cpActiveConvId === 'dm-' + d.username) cpRenderHeader(cpGetActiveConv());
  }
  else if (a==='dm_message') {
    if (!d.msg || !d.peer) return;
    if (!cpDmThreads[d.peer]) cpDmThreads[d.peer] = [];
    cpDmThreads[d.peer].push(d.msg);
    const isActive = cpActiveConvId === 'dm-' + d.peer;
    if (isActive) {
      if (typeof cpRenderMessages === 'function') cpRenderMessages(cpGetActiveConv());
      sendJSON({ action:'dm_mark_read', with: d.peer });
    } else if (d.msg.from !== currentUser && chatOpen === false) {
      showToast(`Новое сообщение от ${d.peer}`, 'info');
    }
    sendJSON({ action:'dm_conversations' }); // обновляем превью/непрочитанные в списке
  }
  else if (a==='dm_history_data') {
    cpDmThreads[d.with] = d.messages || [];
    if (typeof cpRenderMessages === 'function' && cpActiveConvId === 'dm-' + d.with) cpRenderMessages(cpGetActiveConv());
  }
  else if (a==='dm_conversations_data') {
    cpDmConversations = d.conversations || [];
    cpDmConversations.forEach(cpCacheUser);
    if (typeof cpRenderSidebar === 'function') cpRenderSidebar();
  }
  else if (a==='online_users_data') {
    cpOnlineUsers = d.users || [];
    cpOnlineUsers.forEach(cpCacheUser);
  }
  else if (a==='user_search_results') {
    cpSearchResults = d.results || [];
    cpSearchResults.forEach(cpCacheUser);
    if (typeof cpRenderSearchResults === 'function') cpRenderSearchResults();
  }
  else if (a==='purchase_update' || a==='stencil_level_update') {
    purchasedItems=d.purchased_items||d.purchased_levels||[];
    if (d.coins!==undefined){currentCoins=d.coins;updateCoinsUI(currentCoins);}
    if (d.message) showToast(d.message,'success');
    buildShopUI();
  }
  else if (a==='stencil_presets_update') {
    savedStencils = d.stencils || [];
    if (typeof renderSavedStencils === 'function') renderSavedStencils();
    if (d.message) showToast(d.message, 'success');
  }
  else if (a==='admin_stats_data') {
    document.getElementById('stat-total-users').textContent=d.total_users||0;
    document.getElementById('stat-online').textContent=d.online||0;
    document.getElementById('stat-banned').textContent=d.banned||0;
    document.getElementById('stat-total-pixels').textContent=(d.total_pixels||0).toLocaleString();
    document.getElementById('stat-canvas-size').textContent=`${d.canvas_w||canvasW}×${d.canvas_h||canvasH}`;
    if (d.cooldownMs) {
      const slider = document.getElementById('admin-cooldown-slider');
      if (slider) { slider.value = d.cooldownMs; updateCooldownLabel(d.cooldownMs); }
    }
  }
  else if (a==='move_saved') {
    showToast('Перемещение сохранено на холст!','success');
    if (d.pixels) { canvasData.set(d.pixels); fullRender(d.pixels); }
  }
  else if (a==='pixel_info_result') {
    const key = `${d.x},${d.y}`;
    if (d.username) {
      pixelOwnerCache.set(key, { username: d.username, emoji: d.emoji || '👾', avatar: d.avatar || null });
    } else {
      pixelOwnerCache.set(key, 'unknown');
    }
    // Если курсор всё ещё на этом пикселе — обновим инспектор
    if (hoveredPixel.x === d.x && hoveredPixel.y === d.y) {
      updateInspector(null, null, d.x, d.y, true);
    }
  }
  else if (a === 'cooldown_boost_update') {
    applyCooldownBoost(d.pct || 0, d.until || 0);
  }
  else if (a === 'timelapse_status') {
    if (typeof tlHandleStatus === 'function') tlHandleStatus(d);
  }
  else if (a === 'timelapse_session_deleted') {
    if (typeof tlHandleSessionDeleted === 'function') tlHandleSessionDeleted(d.sessionId);
  }
  else if (a === 'news_data') {
    newsItems = (d.items || []).slice().sort((x, y) => (x.order || 0) - (y.order || 0));
    if (typeof newsRenderAll === 'function') newsRenderAll();
    if (typeof renderAdminNewsList === 'function') renderAdminNewsList();
  }
}

function applyServerSettings(s) {
  if (!s) return;
  serverCursorsEnabled=!!s.cursorTrackingEnabled;
  if (s.cooldownMs) { baseCooldownTime=s.cooldownMs/1000; recomputeCooldownTime(); }
  const atog=document.getElementById('admin-toggle-cursors');
  if (atog) atog.classList.toggle('on',serverCursorsEnabled);
  if (!serverCursorsEnabled&&!clanShareCursor) clearCursorFlags();
  const slider = document.getElementById('admin-cooldown-slider');
  if (slider && s.cooldownMs) { slider.value = s.cooldownMs; updateCooldownLabel(s.cooldownMs); }

  if (s.lockdown && typeof applyLockdownState === 'function') { lockdownState = s.lockdown; applyLockdownState(); }
  if (s.ads && typeof applyAdsConfig === 'function') { adsConfig = s.ads; applyAdsConfig(); }
}

// ── SOCIAL HUB: исходящие запросы к серверу ──
function cpCacheUser(card) { if (card && card.username) cpUserCache[card.username] = { ...cpUserCache[card.username], ...card }; }

function cpFetchFriends()      { sendJSON({ action:'friends_get' }); }
function cpFetchConversations(){ sendJSON({ action:'dm_conversations' }); }
function cpFetchOnline()       { sendJSON({ action:'online_users_get' }); }
function cpFetchDmHistory(withUser) { sendJSON({ action:'dm_history', with: withUser }); }
function cpSendFriendRequest(to)    { sendJSON({ action:'friend_request', to }); }
function cpAcceptFriendReq(from)    { sendJSON({ action:'friend_accept', from }); }
function cpDeclineFriendReq(from)   { sendJSON({ action:'friend_decline', from }); }
function cpCancelFriendReq(to)      { sendJSON({ action:'friend_cancel', to }); }
function cpRemoveFriendReq(username){ sendJSON({ action:'friend_remove', username }); }
function cpSearchUsers(query) { sendJSON({ action:'user_search', query }); }

function updateCoinsUI(coins) {
  document.getElementById('phud-coins').textContent = '🪙 ' + Math.floor(coins);
  document.getElementById('prof-coins').textContent=Math.floor(coins);
}