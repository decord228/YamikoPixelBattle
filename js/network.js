'use strict';

// ── WEBSOCKET ──
function connect() {
  if (ws&&ws.readyState===WebSocket.OPEN) ws.close();
  updateConnStatus(false);
  ws = new WebSocket(WS_URL);
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
    currentCoins=d.coins||0;
    purchasedItems=d.purchased_items||d.purchased_levels||[];
    currentClan=d.clan||'';
    selectedEmoji=currentEmoji;
    savedStencils = d.saved_stencils || [];
    if (typeof renderSavedStencils === 'function') renderSavedStencils();
    if (d.canvas_w&&d.canvas_h&&(d.canvas_w!==canvasW||d.canvas_h!==canvasH)) resizeCanvas(d.canvas_w,d.canvas_h);
    if (d.settings) applyServerSettings(d.settings);
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
  }
  else if (a==='resize') {
    resizeCanvas(d.w,d.h||canvasH);
    sendJSON({action:'auth',username:sessionFile.username,password:sessionFile.password,email:'',is_register:false});
  }
  else if (a==='cursor') {
    otherCursors[d.u]={x:d.x,y:d.y,c:d.c,emoji:d.emoji||'👾',clan:d.clan||''};
    updateCursorFlag(d.u,d.x,d.y,d.c,d.emoji||'👾');
  }
  else if (a==='server_settings') { applyServerSettings(d.settings); }
  else if (a==='online_count') { document.getElementById('online-count').textContent=d.count; }
  else if (a==='coins_update') {
    currentCoins=d.coins||0;
    updateCoinsUI(currentCoins);
    if (d.pixels) currentPixels=d.pixels;
  }
  else if (a==='clan_update') {
    if (d.clan) {
      currentClan=d.clan.name||'';
      renderClanView(d.clan);
    } else {
      currentClan='';
      renderNoClanView();
    }
    if (d.coins!==undefined) {currentCoins=d.coins;updateCoinsUI(currentCoins);}
    if (d.message) showToast(d.message,'success');
  }
  else if (a==='clan_data') {
    if (d.clan) renderClanView(d.clan);
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
    if (d.stencil) applySharedStencil(d.stencil);
  }
  else if (a==='clan_chat_message') {
    if (d.msg) addClanChatMessage(d.msg.username, d.msg.text, d.msg.emoji);
  }
  else if (a==='clan_motd') {
    document.getElementById('clan-motd-text').textContent = d.motd || 'Добро пожаловать в клан!';
  }
  else if (a==='clan_requests') {
    renderClanRequests(d.requests || []);
  }
  else if (a==='chat_message') {
    if (d.msg) addChatMessage(d.msg.username, d.msg.text, d.msg.emoji || '👾');
  }
  else if (a==='chat_history') {
    if (d.messages && Array.isArray(d.messages)) {
      d.messages.forEach(m => addChatMessage(m.username, m.text, m.emoji || '👾'));
    }
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
}

function applyServerSettings(s) {
  if (!s) return;
  serverCursorsEnabled=!!s.cursorTrackingEnabled;
  if (s.cooldownMs) cooldownTime=s.cooldownMs/1000;
  const atog=document.getElementById('admin-toggle-cursors');
  if (atog) atog.classList.toggle('on',serverCursorsEnabled);
  if (!serverCursorsEnabled&&!clanShareCursor) clearCursorFlags();
  const slider = document.getElementById('admin-cooldown-slider');
  if (slider && s.cooldownMs) { slider.value = s.cooldownMs; updateCooldownLabel(s.cooldownMs); }
}

function updateCoinsUI(coins) {
  document.getElementById('phud-coins').textContent = '🪙 ' + Math.floor(coins);
  document.getElementById('prof-coins').textContent=Math.floor(coins);
}