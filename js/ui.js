'use strict';

// ── UI & LOGIC ──
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i)=>t.classList.toggle('active',(tab==='login'&&i===0)||(tab==='register'&&i===1)));
  document.getElementById('auth-login-form').style.display=tab==='login'?'':'none';
  document.getElementById('auth-register-form').style.display=tab==='register'?'':'none';
}

function doAuth(isReg) {
  if (!ws||ws.readyState!==WebSocket.OPEN){showToast('Нет соединения','error');return;}
  const u=isReg?document.getElementById('reg-username').value.trim():document.getElementById('auth-username').value.trim();
  const p=isReg?document.getElementById('reg-password').value:document.getElementById('auth-password').value;
  const e=isReg?document.getElementById('reg-email').value.trim():'';
  if (!u||!p){showToast('Заполните все поля','error');return;}
  sessionFile={username:u,password:p};
  sendJSON({action:'auth',username:u,password:p,email:e,is_register:isReg});
}

function onAuthSuccess(d) {
  document.getElementById('auth-panel').classList.remove('show');
  document.getElementById('backdrop').classList.remove('show');

  document.getElementById('prof-name').textContent=currentUser;
  const roleLabel = isAdmin?'Администратор':isVip?'VIP':'Пользователь';
  const roleClass = isAdmin?'role-admin':isVip?'role-vip':'role-user';
  document.getElementById('prof-role').textContent=roleLabel;
  document.getElementById('prof-role').className='profile-role '+roleClass;
  updateProfileStats(currentPixels,currentRank);
  updateCoinsUI(currentCoins);

  document.getElementById('phud-name').textContent=currentUser;
  document.getElementById('phud-role').textContent=roleLabel;
  document.getElementById('phud-role').className='phud-role-'+(isAdmin?'admin':isVip?'vip':'user');
  document.getElementById('profile-hud').classList.add('visible');

  document.getElementById('btn-admin').style.display=isAdmin?'flex':'none';
  document.querySelectorAll('.admin-tool-btn').forEach(el => el.style.display = isAdmin?'flex':'none');
  
  if (isAdmin){loadAdminUsers();}
  showToast('Добро пожаловать, '+currentUser+'! '+currentEmoji,'success');
  loadAvatarFromStorage();
  drawAvatarCanvas(selectedEmoji);
  drawHudAvatar(selectedEmoji);
  saveSession(sessionFile.username,sessionFile.password);
  if (currentClan) sendJSON({action:'clan_get'});
  buildShopUI();
}

function doLogout() {
  clearSession();
  isLoggedIn=false;isAdmin=false;isVip=false;currentUser='';currentClan='';
  document.getElementById('auth-panel').classList.add('show');
  document.getElementById('btn-admin').style.display='none';
  document.querySelectorAll('.admin-tool-btn').forEach(el => el.style.display = 'none');
  document.getElementById('profile-hud').classList.remove('visible');
  hidePanel('profile-panel');
  clearCursorFlags();
  showToast('Вы вышли из аккаунта','info');
}

function updateProfileStats(pixels,rank) {
  currentPixels=pixels;
  document.getElementById('prof-pixels').textContent=pixels.toLocaleString();
  document.getElementById('prof-session').textContent=sessionPixels.toLocaleString();
  const r=RANKS.slice().reverse().find(r=>pixels>=r.min)||RANKS[0];
  document.getElementById('prof-rank').textContent=r.name;
  document.getElementById('prof-rank-icon').textContent=r.icon;
}

function changePassword() {
  const np=document.getElementById('new-pass').value;
  const nc=document.getElementById('new-pass-confirm').value;
  if (!np||np!==nc){showToast('Пароли не совпадают','error');return;}
  if (np.length<4){showToast('Пароль слишком короткий','error');return;}
  sessionFile.password=np;
  saveSession(sessionFile.username,np);
  showToast('Пароль сохранён','success');
  document.getElementById('new-pass').value='';
  document.getElementById('new-pass-confirm').value='';
}

function saveSession(u,p){try{localStorage.setItem('pb_session',JSON.stringify({username:u,password:p}));}catch(_){}}
function loadSession(){try{const s=localStorage.getItem('pb_session');return s?JSON.parse(s):null;}catch(_){return null;}}
function clearSession(){try{localStorage.removeItem('pb_session');}catch(_){}}

function switchProfileTab(tab) {
  ['avatar','account'].forEach(t=>{
    document.getElementById(`prof-tab-${t}`).style.display=t===tab?'':'none';
  });
  document.querySelectorAll('#profile-panel .sub-tab').forEach((el,i)=>{
    el.classList.toggle('active',['avatar','account'][i]===tab);
  });
}

function buildEmojiAvatarPicker() {
  const c=document.getElementById('emoji-avatars'); c.innerHTML='';
  EMOJI_AVATARS.forEach(em=>{
    const d=document.createElement('div');
    d.className='av-opt'+(selectedEmoji===em?' selected':'');
    d.textContent=em;
    d.onclick=()=>{
      selectedEmoji=em;buildEmojiAvatarPicker();drawAvatarCanvas(em);drawHudAvatar(em);
      localStorage.setItem('pb_avatar',JSON.stringify({type:'emoji',val:em}));
      sendJSON({action:'save_emoji',emoji:em});
      showToast('Аватар изменён '+em,'info');
    };
    c.appendChild(d);
  });
}

function drawAvatarCanvas(emoji) {
  const canvas=document.getElementById('avatar-canvas');
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,78,78);
  const grad=ctx.createLinearGradient(0,0,78,78);
  grad.addColorStop(0,'#1c1c20');grad.addColorStop(1,'#141416');
  ctx.fillStyle=grad;ctx.fillRect(0,0,78,78);
  ctx.font='40px serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(emoji||'👾',39,41);
}

function drawHudAvatar(emoji) {
  const canvas=document.getElementById('phud-avatar-canvas');
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,34,34);
  ctx.font='22px serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(emoji||'👾',17,18);
}

function loadAvatarFromStorage() {
  try {
    const av=localStorage.getItem('pb_avatar');
    if (av){const obj=JSON.parse(av);if(obj.type==='emoji'){selectedEmoji=obj.val;drawAvatarCanvas(obj.val);drawHudAvatar(obj.val);}}
    else {drawAvatarCanvas(selectedEmoji);drawHudAvatar(selectedEmoji);}
  }catch(_){drawAvatarCanvas(selectedEmoji);drawHudAvatar(selectedEmoji);}
}

function buildColorGrid() {
  const g=document.getElementById('color-grid'); g.innerHTML='';
  PALETTE.forEach((p,i)=>{
    const d=document.createElement('div');
    d.className='color-cell'+(i===selectedColor?' selected':'');
    d.style.background=p.c;d.title=p.n;
    d.onclick=()=>selectColor(i);
    g.appendChild(d);
  });
  buildQuickPalette();
}

function buildQuickPalette() {
  const qp=document.getElementById('quick-pal'); qp.innerHTML='';
  const recent=[selectedColor,...[8,12,16,23,26].filter(x=>x!==selectedColor)].slice(0,5);
  recent.forEach((i)=>{
    const d=document.createElement('div');
    d.className='qp-cell'+(i===selectedColor?' sel':'');
    d.style.background=PALETTE[i]?.c||'#fff';d.title=PALETTE[i]?.n||'';
    d.onclick=()=>selectColor(i);
    qp.appendChild(d);
  });
}

function selectColor(idx) {
  selectedColor=idx;
  document.querySelectorAll('.color-cell').forEach((c,i)=>c.classList.toggle('selected',i===idx));
  document.getElementById('color-name-bar').textContent=PALETTE[idx]?.n||'';
  buildQuickPalette();
  if (isLoggedIn) sendJSON({action:'cursor',x:hoveredPixel.x,y:hoveredPixel.y,c:idx});
}

function placePixel() {
  if (!isLoggedIn){showToast('Войдите в аккаунт','error');return;}
  if (stencilActive && stencilEditMode) return; 

  if (activeItem) {
    useItemAt(hoveredPixel.x, hoveredPixel.y);
    return;
  }

  if (cooldown>0){showToast(`Подождите ${Math.ceil(cooldown)}с`,'error');return;}
  const x=hoveredPixel.x,y=hoveredPixel.y;
  if (x<0||y<0||x>=canvasW||y>=canvasH){showToast('Наведите на холст','error');return;}
  let colorToPlace=selectedColor;
  
  if (stencilActive&&purchasedItems.includes('stencil_auto_1')&&stencilImageData&&!stencilEditMode) {
    const ir=stencilRect;
    const sx=Math.floor((x-ir.x)/ir.w*stencilImageData.width);
    const sy=Math.floor((y-ir.y)/ir.h*stencilImageData.height);
    if (sx>=0&&sx<stencilImageData.width&&sy>=0&&sy<stencilImageData.height) {
      const si=(sy*stencilImageData.width+sx)*4;
      const r=stencilImageData.data[si],g2=stencilImageData.data[si+1],b=stencilImageData.data[si+2],a=stencilImageData.data[si+3];
      if (a>50) {
        let bestIdx=0,bestDist=Infinity;
        PALETTE.forEach((p,pi)=>{
          const pr=parseInt(p.c.slice(1,3),16),pg=parseInt(p.c.slice(3,5),16),pb=parseInt(p.c.slice(5,7),16);
          const dist=(r-pr)**2+(g2-pg)**2+(b-pb)**2;
          if (dist<bestDist){bestDist=dist;bestIdx=pi;}
        });
        colorToPlace=bestIdx;
        selectColor(bestIdx);
      }
    }
  }
  sendPixel(x,y,colorToPlace);
  canvasData[y*canvasW+x]=colorToPlace;
  renderPixel(x,y,colorToPlace);
  sessionPixels++;
  updateProfileStats(currentPixels+1,currentRank);
  spawnPixelFlash(x,y);
  startCooldown();
  if (soundEnabled) playClick();
}

function sendPixel(x,y,cidx) {
  if (!ws||ws.readyState!==WebSocket.OPEN) return;
  const buf=new Uint8Array(5);
  buf[0]=(x>>8)&0xFF;buf[1]=x&0xFF;buf[2]=(y>>8)&0xFF;buf[3]=y&0xFF;buf[4]=cidx;
  ws.send(buf.buffer);
}

function startCooldown() {
  cooldown=cooldownTime;
  document.getElementById('place-btn').disabled=true;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer=setInterval(()=>{
    cooldown-=0.05;
    const ratio=1-(cooldown/cooldownTime);
    document.getElementById('place-btn-fill').style.transform=`scaleX(${Math.max(0,Math.min(1,ratio))})`;
    if (cooldown<=0){
      cooldown=0;
      document.getElementById('place-btn').disabled=false;
      document.getElementById('place-btn').textContent='ПОСТАВИТЬ';
      document.getElementById('place-btn-fill').style.transform='scaleX(1)';
      clearInterval(cooldownTimer);
    } else {
      document.getElementById('place-btn').textContent=`ОЖИДАНИЕ ${Math.ceil(cooldown)}С`;
    }
  },50);
}

function spawnPixelFlash(x,y) {
  const screen=canvasToScreen(x+0.5,y+0.5);
  const el=document.createElement('div');
  el.className='pixel-flash';
  el.style.cssText=`left:${screen.x}px;top:${screen.y}px;background:${PALETTE[selectedColor]?.c||'#fff'};`;
  document.getElementById('game-root').appendChild(el);
  setTimeout(()=>el.remove(),450);
  for (let i=0;i<3;i++){
    const sp=document.createElement('div');sp.className='sparkle';sp.textContent='✦';
    sp.style.cssText=`left:${screen.x+(Math.random()-0.5)*30}px;top:${screen.y+(Math.random()-0.5)*30}px;color:${PALETTE[selectedColor]?.c||'#fff'};animation-delay:${i*0.08}s;`;
    document.getElementById('game-root').appendChild(sp);
    setTimeout(()=>sp.remove(),600);
  }
}

function eyedrop(x,y){
  if (x<0||y<0||x>=canvasW||y>=canvasH) return;
  selectColor(canvasData[y*canvasW+x]);
  showToast('Цвет выбран: '+PALETTE[canvasData[y*canvasW+x]]?.n,'info');
  setTool('pencil');
}

function useItemAt(x, y) {
  if (!activeItem || x < 0 || y < 0 || x >= canvasW || y >= canvasH) return;
  sendJSON({action:'use_item', item_id: activeItem, x, y, color: selectedColor});
  cancelUseItem();
}

function cancelUseItem() {
  activeItem = null;
  document.getElementById('use-item-overlay').classList.remove('active');
  renderOverlay();
}

function activateItem(itemId) {
  activeItem = itemId;
  const names = {
    bomb_3x3: '💣 Бомбочка 3×3 — кликни на холст',
    rainbow_5x5: '🌈 Радужный взрыв 5×5 — кликни на холст',
    eraser_10x10: '🧹 Ластик 10×10 — кликни на холст',
    mirror_stamp: '🪞 Зеркальный штамп — кликни на холст',
  };
  document.getElementById('use-item-label').textContent = names[itemId] || 'Кликни на холст';
  document.getElementById('use-item-overlay').classList.add('active');
  hidePanel('shop-panel');
}

function toggleStencilPanel() {
  const p = document.getElementById('stencil-panel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function toggleStencilEdit() {
  stencilEditMode = !stencilEditMode;
  document.getElementById('stencil-edit-toggle').classList.toggle('on', stencilEditMode);
  renderOverlay();
  if (stencilEditMode) {
      showToast('Режим редактирования: ВКЛ. Рисование заблокировано.', 'info');
  } else {
      showToast('Режим редактирования: ВЫКЛ. Теперь можно рисовать поверх трафарета.', 'success');
  }
}

function scaleStencil(factor) {
  if (!stencilImageData) { showToast('Сначала загрузите трафарет', 'error'); return; }
  const newW = Math.max(1, Math.round(stencilRect.w * factor));
  const newH = Math.max(1, Math.round(stencilRect.h * factor));
  stencilRect.w = newW;
  stencilRect.h = newH;
  renderOverlay();
  showToast(`Размер: ${newW}×${newH} пикс.`, 'info');
}

document.getElementById('stencil-file-input').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  if (file.size > 5 * 1024 * 1024) { showToast('Файл слишком большой! Максимум 5MB', 'error'); return; }
  
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const tmpC = document.createElement('canvas');
      tmpC.width = img.width; tmpC.height = img.height;
      const tctx = tmpC.getContext('2d');
      tctx.drawImage(img, 0, 0);
      const idata = tctx.getImageData(0, 0, img.width, img.height);
      
      for (let i = 0; i < idata.data.length; i += 4) {
        const r = idata.data[i], g = idata.data[i+1], b = idata.data[i+2], a = idata.data[i+3];
        if (a < 50) { idata.data[i+3] = 0; continue; }
        let bestIdx = 0, bestDist = Infinity;
        PALETTE.forEach((p, pi) => {
          const pr = parseInt(p.c.slice(1,3), 16), pg = parseInt(p.c.slice(3,5), 16), pb = parseInt(p.c.slice(5,7), 16);
          const dist = (r-pr)**2 + (g-pg)**2 + (b-pb)**2;
          if (dist < bestDist) { bestDist = dist; bestIdx = pi; }
        });
        const c = PALETTE[bestIdx].c;
        idata.data[i] = parseInt(c.slice(1,3), 16);
        idata.data[i+1] = parseInt(c.slice(3,5), 16);
        idata.data[i+2] = parseInt(c.slice(5,7), 16);
        idata.data[i+3] = 255;
      }
      tctx.putImageData(idata, 0, 0);

      const newImg = new Image();
      newImg.onload = () => {
        stencilImg = newImg;
        stencilImageData = idata;
        stencilOrigWidth = img.width;
        stencilOrigHeight = img.height;
        
        const cp = screenToCanvas(window.innerWidth/2, window.innerHeight/2);
        stencilRect = {
          x: Math.floor(cp.x - img.width/2),
          y: Math.floor(cp.y - img.height/2),
          w: img.width, 
          h: img.height
        };
        
        stencilActive=true;
        stencilEditMode=true;
        document.getElementById('stencil-edit-toggle').classList.add('on');
        
        showToast(`Трафарет загружен! ${img.width}×${img.height} пикс. = 1:1 с холстом.`,'info');
        renderOverlay();
      };
      newImg.src = tmpC.toDataURL();
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
});

function updateStencilOpacity(v){
  stencilOpacity=v/100;
  document.getElementById('stencil-opacity-val').textContent=v+'%';
  renderOverlay();
}

function cancelStencil(){
  stencilActive=false;stencilImg=null;stencilImageData=null;
  document.getElementById('stencil-panel').style.display='none';
  renderOverlay();
}

async function shareStencilToClan(){
  if (!currentClan){showToast('Вы не в клане','error');return;}
  if (!stencilImg) {showToast('Сначала загрузите трафарет','error');return;}
  showToast('Загрузка в облако...', 'info');
  try {
    const res = await fetch('/api/upload-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: stencilImg.src, name: 'clan_stencil', username: currentUser })
    });
    const data = await res.json();
    if (data.url) {
      sendJSON({ action: 'clan_share_stencil', stencil: { img: data.url, rect: stencilRect, opacity: stencilOpacity } });
      showToast('Трафарет отправлен соклановцам!', 'success');
    } else { showToast('Ошибка загрузки', 'error'); }
  } catch (e) { showToast('Ошибка сети', 'error'); }
}

function applySharedStencil(data){
  if (!data||!data.img) return;
  const img=new Image();
  img.crossOrigin = "Anonymous";
  img.onload=()=>{
    const tmpC = document.createElement('canvas');
    tmpC.width = img.width; tmpC.height = img.height;
    const tctx = tmpC.getContext('2d');
    tctx.drawImage(img, 0, 0);
    stencilImg=img;
    stencilRect=data.rect||{x:0,y:0,w:img.width,h:img.height};
    stencilOpacity=data.opacity||0.6;
    stencilActive=true;
    stencilEditMode=false;
    document.getElementById('stencil-edit-toggle').classList.remove('on');
    stencilImageData = tctx.getImageData(0,0,img.width,img.height);
    document.getElementById('stencil-panel').style.display='block';
    document.getElementById('stencil-panel-opacity').value = stencilOpacity * 100;
    document.getElementById('stencil-opacity-val').textContent = (stencilOpacity * 100) + '%';
    renderOverlay();
    showToast('Получен трафарет от клана!','success');
  };
  img.src=data.img;
}

function handleStencilStart(clientX,clientY){
  if (!stencilActive||!stencilImg||!stencilEditMode) return false;
  const off = getRenderOffset();
  const ir=stencilRect;
  const sx=Math.floor(ir.x*camZoom)+off.x, sy=Math.floor(ir.y*camZoom)+off.y;
  const sw=Math.floor(ir.w*camZoom), sh=Math.floor(ir.h*camZoom);
  if (clientX>=sx&&clientX<=sx+sw&&clientY>=sy&&clientY<=sy+sh){
    stencilHandle='move';
    stencilDragOffset={x:(clientX-sx)/camZoom,y:(clientY-sy)/camZoom};
    return true;
  }
  return false;
}

function handleStencilMove(clientX,clientY){
  if (!stencilHandle || !stencilEditMode) return false;
  const p=getCanvasPos(clientX,clientY);
  if (stencilHandle==='move'){
    stencilRect.x=Math.round(p.x-stencilDragOffset.x);
    stencilRect.y=Math.round(p.y-stencilDragOffset.y);
  }
  renderOverlay();
  return true;
}

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-panel').classList.toggle('open', chatOpen);
  document.getElementById('chat-btn').classList.toggle('active', chatOpen);
  if (chatOpen) {
    chatUnread = 0;
    document.getElementById('chat-unread').style.display = 'none';
    document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
  }
}

function addChatMessage(user, text, emoji) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg';
  if (user === '__system') {
    msgDiv.className += ' chat-msg-system';
    msgDiv.textContent = text;
  } else {
    msgDiv.innerHTML = `<span class="chat-msg-user">${esc(emoji||'👾')} ${esc(user)}:</span> ${esc(text)}`;
  }
  const msgs = document.getElementById('chat-messages');
  msgs.appendChild(msgDiv);
  if (msgs.children.length > 100) msgs.removeChild(msgs.firstChild);
  msgs.scrollTop = msgs.scrollHeight;
  if (!chatOpen) {
    chatUnread++;
    const unread = document.getElementById('chat-unread');
    unread.textContent = chatUnread > 9 ? '9+' : chatUnread;
    unread.style.display = 'flex';
  }
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !isLoggedIn) return;
  sendJSON({action:'chat_message', text});
  input.value = '';
}

function switchClanSubTab(tab) {
  ['browse','create','join'].forEach(t => {
    const el = document.getElementById(`clan-sub-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#clan-view-no-clan .sub-tab').forEach((el, i) => {
    el.classList.toggle('active', ['browse','create','join'][i] === tab);
  });
  if (tab === 'browse') sendJSON({action:'clan_list'});
}

function switchClanInnerTab(tab) {
  ['members','chat','requests','settings'].forEach(t => {
    const el = document.getElementById(`clan-inner-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#clan-view-in-clan .sub-tab').forEach(el => {
    el.classList.toggle('active', el.getAttribute('onclick')?.includes(tab));
  });
  if (tab === 'requests') sendJSON({action:'clan_get_requests'});
}

function createClan(){
  const name=document.getElementById('clan-create-name').value.trim();
  const tag=document.getElementById('clan-create-tag').value.trim();
  const desc=document.getElementById('clan-create-desc').value.trim();
  if (!name){showToast('Введите название клана','error');return;}
  sendJSON({action:'clan_create',name,tag,description:desc});
}

function joinClan(){
  const name=document.getElementById('clan-join-name').value.trim();
  if (!name){showToast('Введите название клана','error');return;}
  sendJSON({action:'clan_join',name});
}

function leaveClan(){
  if (!confirm('Покинуть клан?')) return;
  sendJSON({action:'clan_leave'});
}

function toggleClanCursor(){ sendJSON({action:'clan_toggle_cursor'}); }

function sendClanChat() {
  const input = document.getElementById('clan-chat-input');
  const text = input.value.trim();
  if (!text || !isLoggedIn || !currentClan) return;
  sendJSON({action:'clan_chat', text});
  input.value = '';
}

function addClanChatMessage(user, text, emoji) {
  const el = document.createElement('div');
  el.className = 'clan-chat-msg';
  el.innerHTML = `<span class="cm-user">${esc(emoji||'👾')} ${esc(user)}:</span> ${esc(text)}`;
  const msgs = document.getElementById('clan-chat-messages');
  msgs.appendChild(el);
  if (msgs.children.length > 100) msgs.removeChild(msgs.firstChild);
  msgs.scrollTop = msgs.scrollHeight;
}

function saveClanMotd() {
  const text = document.getElementById('clan-motd-input').value.trim();
  if (!text) return;
  sendJSON({action:'clan_set_motd', motd: text});
  document.getElementById('clan-motd-text').textContent = text;
}

function saveClanMotdFromSettings() {
  const text = document.getElementById('clan-motd-input-s').value.trim();
  if (!text) return;
  sendJSON({action:'clan_set_motd', motd: text});
  document.getElementById('clan-motd-text').textContent = text;
  showToast('Сообщение дня обновлено','success');
}

function renderClanRequests(requests) {
  const c = document.getElementById('clan-requests-list');
  if (!requests.length) {
    c.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px;">Заявок нет</div>';
    return;
  }
  c.innerHTML = requests.map(r => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:12px;font-weight:600;">${esc(r)}</span>
      <div style="display:flex;gap:5px;">
        <button class="action-btn ab-unban" onclick="sendJSON({action:'clan_accept_request',username:'${esc(r)}'})">✓ Принять</button>
        <button class="action-btn ab-ban" onclick="sendJSON({action:'clan_deny_request',username:'${esc(r)}'})">✕ Отказать</button>
      </div>
    </div>`).join('');
}

function renderClanView(clan){
  currentClan=clan.name||'';
  document.getElementById('clan-view-no-clan').style.display='none';
  document.getElementById('clan-view-in-clan').style.display='';
  document.getElementById('clan-disp-name').textContent=clan.name||'';
  document.getElementById('clan-disp-tag').textContent=clan.tag||'';
  document.getElementById('clan-disp-desc').textContent=clan.description||'';
  document.getElementById('clan-disp-leader').textContent=clan.leader||'';
  document.getElementById('clan-disp-members').textContent=(clan.members||[]).length;
  if (clan.motd) document.getElementById('clan-motd-text').textContent = clan.motd;
  
  const isLeader=currentUser===clan.leader;
  const settingsTab = document.getElementById('clan-settings-tab');
  if (settingsTab) settingsTab.style.display = isLeader ? '' : 'none';
  
  const tog=document.getElementById('clan-cursor-toggle');
  if (tog){clanShareCursor=!!clan.share_cursor;tog.classList.toggle('on',clanShareCursor);}
  
  const ml=document.getElementById('clan-member-list'); ml.innerHTML='';
  (clan.members||[]).forEach(m=>{
    const chip=document.createElement('div');
    chip.className='member-chip'+(m===clan.leader?' leader':'');
    if (isLeader && m !== currentUser) {
      chip.innerHTML = `${m===clan.leader?'👑 ':''}${esc(m)} <button onclick="kickClanMember('${esc(m)}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:10px;margin-left:4px;">✕</button>`;
    } else {
      chip.textContent=(m===clan.leader?'👑 ':'')+m;
    }
    ml.appendChild(chip);
  });
}

function kickClanMember(username) {
  if (!confirm(`Кикнуть ${username} из клана?`)) return;
  sendJSON({action:'clan_kick', username});
}

function renderNoClanView(){
  currentClan='';
  document.getElementById('clan-view-no-clan').style.display='';
  document.getElementById('clan-view-in-clan').style.display='none';
  sendJSON({action:'clan_list'});
}

function renderClanBrowseList(clans){
  const c=document.getElementById('clan-browse-list');
  if (!clans.length){c.innerHTML='<div style="color:var(--text3);text-align:center;padding:10px;">Кланов пока нет</div>';return;}
  c.innerHTML=clans.slice(0,10).map(cl=>`
    <div class="clan-card" style="cursor:pointer" onclick="document.getElementById('clan-join-name').value='${esc(cl.name)}';switchClanSubTab('join')">
      <div class="clan-name"><span>${esc(cl.name)}</span><span class="clan-tag">${esc(cl.tag||'')}</span></div>
      <div class="clan-meta">👥 ${cl.members} · 🖼 ${(cl.pixels||0).toLocaleString()} пикс.</div>
      ${cl.description?`<div class="clan-meta">${esc(cl.description)}</div>`:''}
    </div>`).join('');
}

function buildShopUI(){
  const body = document.getElementById('shop-body');
  if (!body) return;
  if (!isLoggedIn) { body.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;">Войдите в аккаунт</div>'; return; }
  let html = '';
  html += `<div class="shop-section"><div class="shop-section-title">Обычные улучшения</div>`;
  SHOP_ITEMS_USER.forEach(item => {
    const owned = purchasedItems.includes(item.id);
    const reqMet = !item.requires || purchasedItems.includes(item.requires);
    html += `<div class="shop-item">
      <div class="shop-header">
        <div class="shop-item-title">${item.icon} ${item.title}</div>
        ${owned ? '<span class="shop-owned">✓ Куплено</span>' : `<span class="shop-price">🪙 ${item.cost}</span>`}
      </div>
      <div class="shop-item-desc">${item.desc}</div>
      ${!owned && reqMet ? `<button class="btn btn-primary btn-sm" onclick="buyItem('${item.id}')">Купить (${item.cost} 🪙)</button>` : ''}
      ${!owned && !reqMet ? `<div style="font-size:10px;color:var(--text3);">🔒 Требуется: ${item.requires}</div>` : ''}
    </div>`;
  });
  html += '</div>';

  if (isVip || isAdmin) {
    html += `<div class="shop-section"><div class="shop-section-title">⭐ VIP Расходники</div>`;
    SHOP_ITEMS_VIP.forEach(item => {
      const count = getItemCount(item.id);
      html += `<div class="shop-item vip-item">
        <div class="shop-header">
          <div class="shop-item-title">${item.icon} ${item.title}</div>
          <span class="shop-price">🪙 ${item.cost}</span>
        </div>
        <div class="shop-item-desc">${item.desc}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-vip btn-sm" onclick="buyItem('${item.id}')">Купить (${item.cost} 🪙)</button>
          ${count > 0 ? `<button class="btn btn-secondary btn-sm" onclick="activateItem('${item.id}')">🎯 Использовать (${count})</button>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
  } else {
    html += `<div class="shop-section"><div class="shop-section-title">⭐ VIP Расходники</div>
      <div class="shop-item" style="opacity:.5">
        <div class="shop-lock">🔒</div><div class="shop-item-title">Расходники для VIP</div>
        <div class="shop-item-desc">Получите VIP-статус чтобы разблокировать взрывчатку, ластики, зеркала и многое другое!</div>
      </div></div>`;
  }

  if (isAdmin) {
    html += `<div class="shop-section"><div class="shop-section-title">🛡️ Админ-читы</div>`;
    SHOP_ITEMS_ADMIN.forEach(item => {
      html += `<div class="shop-item admin-item">
        <div class="shop-header"><div class="shop-item-title">${item.icon} ${item.title}</div><span style="font-size:10px;color:var(--text3);">БЕСПЛАТНО</span></div>
        <div class="shop-item-desc">${item.desc}</div>
        <button class="btn btn-primary btn-sm" onclick="useAdminShopItem('${item.id}')">Применить</button>
      </div>`;
    });
    html += '</div>';
  }
  body.innerHTML = html;
}

function getItemCount(itemId) { return Array.isArray(purchasedItems) ? purchasedItems.filter(i => i === itemId).length : 0; }
function buyItem(itemId) { sendJSON({action:'buy_item', item_id: itemId}); }

function useAdminShopItem(itemId) {
  if (itemId === 'admin_nuke') {
    if (!confirm('☢️ Очистить весь холст?')) return;
    sendJSON({action:'admin_cmd', cmd:'clear_canvas'});
  } else if (itemId === 'admin_rainbow') {
    sendJSON({action:'admin_cmd', cmd:'rainbow_storm'});
  }
}

function showLeaderboard() {
  leaderboardOpen = !leaderboardOpen;
  document.getElementById('leaderboard-panel').classList.toggle('show', leaderboardOpen);
  if (leaderboardOpen) sendJSON({action:'get_leaderboard'});
}
function hideLeaderboard() { leaderboardOpen = false; document.getElementById('leaderboard-panel').classList.remove('show'); }

function switchLbTab(tab){
  document.querySelector('#leaderboard-panel .sub-tab:nth-child(1)').classList.toggle('active',tab==='players');
  document.querySelector('#leaderboard-panel .sub-tab:nth-child(2)').classList.toggle('active',tab==='clans');
  document.getElementById('lb-players-list').style.display=tab==='players'?'':'none';
  document.getElementById('lb-clans-list').style.display=tab==='clans'?'':'none';
}

function renderLeaderboardPlayers(data){
  const c=document.getElementById('lb-players-list');
  if (!data.length){c.innerHTML='<div style="color:var(--text3);text-align:center;padding:20px;">Пусто</div>';return;}
  c.innerHTML=data.map((u,i)=>`
    <div class="lb-row" style="animation:float-in .3s ease ${i*0.04}s both">
      <div class="lb-rank ${i===0?'lb-rank-1':i===1?'lb-rank-2':i===2?'lb-rank-3':'lb-rank-n'}">${i<3?['🥇','🥈','🥉'][i]:i+1}</div>
      <div style="font-size:16px">${u.emoji||'👾'}</div>
      <div class="lb-name">${esc(u.username)}</div>
      <div class="lb-pixels">${(u.pixels||0).toLocaleString()} px</div>
    </div>`).join('');
}

function renderLeaderboardClans(data){
  const c=document.getElementById('lb-clans-list');
  if (!data.length){c.innerHTML='<div style="color:var(--text3);text-align:center;padding:20px;">Кланов пока нет</div>';return;}
  c.innerHTML=data.map((cl,i)=>`
    <div class="lb-row" style="animation:float-in .3s ease ${i*0.04}s both">
      <div class="lb-rank ${i===0?'lb-rank-1':i===1?'lb-rank-2':i===2?'lb-rank-3':'lb-rank-n'}">${i<3?['🥇','🥈','🥉'][i]:i+1}</div>
      <span class="clan-tag">${esc(cl.tag||'')}</span>
      <div class="lb-name">${esc(cl.name)}</div>
      <div style="font-size:11px;color:var(--text3)">👥${cl.members}</div>
      <div class="lb-pixels">${(cl.pixels||0).toLocaleString()} px</div>
    </div>`).join('');
}

function cancelAdminTool() {
  document.getElementById('admin-floating-bar').style.display='none';
  if (tool === 'admin_image') { adminImgObj = null; adminImageData = null; adminImagePreviewMode = false; }
  else if (tool === 'admin_move') { adminMoveState = 'idle'; adminMoveRect = null; adminMoveCanvas = null; }
  setTool('pencil');
  renderOverlay();
}

function applyAdminTool() {
  adminShapeFilled = document.getElementById('admin-shape-fill') ? document.getElementById('admin-shape-fill').checked : true;
  if (tool === 'admin_image' || adminImagePreviewMode) {
    if (adminImgObj&&adminImgRect.w>0&&adminImgRect.h>0){
      const tmpCanvas=document.getElementById('admin-image-canvas');
      tmpCanvas.width=adminImgRect.w;tmpCanvas.height=adminImgRect.h;
      const tctx=tmpCanvas.getContext('2d');
      tctx.imageSmoothingEnabled=false;
      tctx.drawImage(adminImgObj,0,0,adminImgRect.w,adminImgRect.h);
      const imgData=tctx.getImageData(0,0,adminImgRect.w,adminImgRect.h);
      const pixels=[];
      for (let y=0;y<adminImgRect.h;y++) for (let x=0;x<adminImgRect.w;x++){
        const idx=(y*adminImgRect.w+x)*4;
        const r=imgData.data[idx],g=imgData.data[idx+1],b=imgData.data[idx+2],a=imgData.data[idx+3];
        if (a<50) continue;
        let bestIdx=0,bestDist=Infinity;
        PALETTE.forEach((p,pi)=>{
          const pr=parseInt(p.c.slice(1,3),16),pg=parseInt(p.c.slice(3,5),16),pb=parseInt(p.c.slice(5,7),16);
          const dist=(r-pr)**2+(g-pg)**2+(b-pb)**2;
          if (dist<bestDist){bestDist=dist;bestIdx=pi;}
        });
        const cx=x+adminImgRect.x,cy=y+adminImgRect.y;
        if (cx>=0&&cx<canvasW&&cy>=0&&cy<canvasH) pixels.push({x:cx,y:cy,c:bestIdx});
      }
      if (!pixels.length){showToast('Нет пикселей','error');return;}
      showToast(`Размещаю ${pixels.length} пикселей...`,'info');
      const CHUNK=2000;let pIndex=0;
      const sendNextChunk=()=>{
        if (pIndex>=pixels.length){showToast('Картинка успешно размещена!','success');return;}
        const chunk=pixels.slice(pIndex,pIndex+CHUNK);
        sendJSON({action:'admin_cmd',cmd:'place_image',params:{pixels:chunk}});
        pIndex+=CHUNK;setTimeout(sendNextChunk,80);
      };
      sendNextChunk();
    }
    adminImagePreviewMode = false;
    cancelAdminTool();
  } else if (tool === 'admin_move') {
    if (adminMoveRect) {
      sendJSON({action: 'admin_cmd', cmd: 'move_area', params: {...adminMoveRect, persist: true}});
      cancelAdminTool();
    }
  }
}

function startAdminImagePreview() {
  if (!adminImgObj) return;
  hidePanel('admin-panel');
  adminImagePreviewMode = true;
  tool = 'admin_image';
  document.getElementById('admin-floating-bar').style.display = 'flex';
  document.getElementById('admin-shape-fill-container').style.display = 'none';
  document.getElementById('admin-floating-bar-title').textContent = 'ПРЕВЬЮ — ПЕРЕМЕСТИ, ЗАТЕМ "ПРИМЕНИТЬ"';
  showToast('Перемещайте превью, затем нажмите «Применить»', 'info');
  renderOverlay();
}

function handleToolInteractionStart(clientX,clientY){
  if ((tool==='admin_image' || adminImagePreviewMode)&&adminImgObj){
    const off = getRenderOffset();
    let ir=adminImgRect;
    let sx=Math.floor(ir.x*camZoom)+off.x,sy=Math.floor(ir.y*camZoom)+off.y,sw=Math.floor(ir.w*camZoom),sh=Math.floor(ir.h*camZoom);
    const dist=(x1,y1)=>Math.hypot(clientX-x1,clientY-y1);
    const HIT=15;
    if (dist(sx,sy)<=HIT) adminActiveHandle='tl';
    else if (dist(sx+sw,sy)<=HIT) adminActiveHandle='tr';
    else if (dist(sx,sy+sh)<=HIT) adminActiveHandle='bl';
    else if (dist(sx+sw,sy+sh)<=HIT) adminActiveHandle='br';
    else if (clientX>=sx&&clientX<=sx+sw&&clientY>=sy&&clientY<=sy+sh){
      adminActiveHandle='move';adminDragOffset={x:(clientX-sx)/camZoom,y:(clientY-sy)/camZoom};
    } else return false;
    isDraggingTool=true;return true;
  }
  return false;
}

function handleToolInteractionMove(clientX,clientY){
  if ((tool==='admin_image'||adminImagePreviewMode)&&adminActiveHandle){
    let ir=adminImgRect;
    const p=getCanvasPos(clientX,clientY);
    if (adminActiveHandle==='move'){ir.x=Math.round(p.x-adminDragOffset.x);ir.y=Math.round(p.y-adminDragOffset.y);}
    else if (adminActiveHandle==='br'){ir.w=Math.max(1,Math.round(p.x-ir.x));ir.h=Math.max(1,Math.round(p.y-ir.y));}
    else if (adminActiveHandle==='tr'){ir.w=Math.max(1,Math.round(p.x-ir.x));let ny=Math.round(p.y);ir.h=ir.y+ir.h-ny;ir.y=ny;}
    else if (adminActiveHandle==='bl'){ir.h=Math.max(1,Math.round(p.y-ir.y));let nx=Math.round(p.x);ir.w=ir.x+ir.w-nx;ir.x=nx;}
    else if (adminActiveHandle==='tl'){let nx=Math.round(p.x),ny=Math.round(p.y);ir.w=ir.x+ir.w-nx;ir.h=ir.y+ir.h-ny;ir.x=nx;ir.y=ny;}
    renderOverlay();return true;
  }
  return false;
}

function loadAdminUsers(page){page=page||adminPage;sendJSON({action:'admin_cmd',cmd:'get_users',page});}
function adminPageNav(dir){const np=adminPage+dir;if(np<1||np>adminTotalPages)return;loadAdminUsers(np);}
function filterAdminUsers(){
  const q=document.getElementById('admin-search').value.toLowerCase();
  renderAdminUsers(q?allAdminUsers.filter(u=>u.username.toLowerCase().includes(q)):allAdminUsers);
}
function renderAdminUsers(users){
  const c=document.getElementById('admin-users-list');
  if (!users.length){c.innerHTML='<div style="color:var(--text3);text-align:center;padding:20px;">Пусто</div>';return;}
  c.innerHTML=users.map(u=>`
    <div class="user-card">
      <div class="user-card-top">
        <div class="user-card-name ${u.banned?'user-card-banned':''}">${esc(u.username)} <span style="color:var(--text3);font-size:11px">(${u.pixels||0} px · 🪙${u.coins||0})</span></div>
        <span class="user-badge ${u.role==='admin'?'badge-admin':u.role==='vip'?'badge-vip':'badge-user'}">${(u.role||'user').toUpperCase()}</span>
        ${u.banned?'<span class="user-badge badge-banned">BANNED</span>':''}
      </div>
      <div class="user-actions">
        <button class="action-btn ab-role" onclick="adminCmd('set_role','${esc(u.username)}','${u.role==='admin'?'user':'admin'}')">${u.role==='admin'?'Снять админа':'Дать админа'}</button>
        <button class="action-btn ab-vip" onclick="adminCmd('set_role','${esc(u.username)}','${u.role==='vip'?'user':'vip'}')">${u.role==='vip'?'Снять VIP':'Дать VIP'}</button>
        <button class="action-btn ab-timeout" onclick="adminCmd('timeout','${esc(u.username)}',300)">5м</button>
        <button class="action-btn ab-timeout" onclick="adminCmd('timeout','${esc(u.username)}',3600)">1ч</button>
        <button class="action-btn ${u.banned?'ab-unban':'ab-ban'}" onclick="adminCmd('${u.banned?'unban':'ban'}','${esc(u.username)}',null)">${u.banned?'Разбанить':'Забанить'}</button>
        <button class="action-btn ab-msg" onclick="prefillDM('${esc(u.username)}')">✉</button>
        <button class="action-btn ab-role" onclick="promptGiveCoins('${esc(u.username)}')">🪙+</button>
      </div>
    </div>`).join('');
}
function promptGiveCoins(username){
  const amt=parseInt(prompt(`Сколько монет выдать ${username}?`));
  if (!amt||amt<=0) return;
  sendJSON({action:'admin_cmd',cmd:'give_coins',target:username,params:amt});
  setTimeout(()=>loadAdminUsers(adminPage),300);
}
function adminCmd(cmd,target,params){
  sendJSON({action:'admin_cmd',cmd,target,params,page:adminPage});
  setTimeout(()=>loadAdminUsers(adminPage),300);
}
function adminResizeCanvas(){
  const w=parseInt(document.getElementById('admin-canvas-w').value);
  const h=parseInt(document.getElementById('admin-canvas-h').value);
  if (w<16||h<16||w>2048||h>2048){showToast('Некорректный размер (16–2048)','error');return;}
  sendJSON({action:'admin_cmd',cmd:'resize_canvas',params:{w,h}});
}
function adminClearCanvas(){
  if (!confirm('Очистить весь холст?')) return;
  sendJSON({action:'admin_cmd',cmd:'clear_canvas'});
}
function adminToggleCursors(){
  serverCursorsEnabled=!serverCursorsEnabled;
  sendJSON({action:'admin_cmd',cmd:'toggle_cursors',params:serverCursorsEnabled});
}
function adminBroadcast(){
  const msg=document.getElementById('broadcast-msg').value.trim();
  if (!msg){showToast('Введите сообщение','error');return;}
  sendJSON({action:'admin_cmd',cmd:'broadcast',params:msg});
  document.getElementById('broadcast-msg').value='';
}
function adminSendDM(){
  const target=document.getElementById('dm-target').value.trim();
  const msg=document.getElementById('dm-msg').value.trim();
  if (!target||!msg){showToast('Заполните поля','error');return;}
  sendJSON({action:'admin_cmd',cmd:'send_dm',target,params:msg});
  showToast(`Отправлено ${target}`,'success');
}
function prefillDM(username){switchAdminTab('broadcast');document.getElementById('dm-target').value=username;}
function loadAdminStats(){ sendJSON({action:'admin_cmd',cmd:'admin_stats'}); }
function updateCooldownLabel(ms) {
  const secs = (parseInt(ms) / 1000).toFixed(1);
  document.getElementById('admin-cooldown-label').textContent = secs + 'с';
}
function adminSetCooldown() {
  const ms = parseInt(document.getElementById('admin-cooldown-slider').value);
  sendJSON({action:'admin_cmd', cmd:'set_cooldown', params: ms});
  cooldownTime = ms / 1000;
  showToast(`Кулдаун установлен: ${(ms/1000).toFixed(1)}с`, 'success');
}
function handleAdminImage(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      adminImgObj = img;
      adminImgRect = { x: Math.floor(screenToCanvas(window.innerWidth/2, window.innerHeight/2).x - img.width/2), y: Math.floor(screenToCanvas(window.innerWidth/2, window.innerHeight/2).y - img.height/2), w: img.width, h: img.height };
      const preview = document.getElementById('image-preview');
      preview.src = ev.target.result; preview.style.display = 'block';
      document.getElementById('btn-place-image').disabled = false;
      showToast(`Изображение ${img.width}×${img.height} готово к предпросмотру`, 'info');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function handleAdminGlobalStencil(event){
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const cp = screenToCanvas(window.innerWidth/2, window.innerHeight/2);
      const rect = {x: Math.floor(cp.x - img.width/2), y: Math.floor(cp.y - img.height/2), w: img.width, h: img.height};
      sendJSON({action:'admin_cmd', cmd:'set_global_stencil', params:{img: ev.target.result, rect, opacity: 0.6}});
      showToast('Глобальный трафарет установлен!', 'success');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function clearGlobalStencil(){ sendJSON({action:'admin_cmd', cmd:'clear_global_stencil'}); showToast('Глобальный трафарет снят', 'info'); }

function setTool(t){
  tool=t;
  document.getElementById('btn-tool-pencil').classList.toggle('active',t==='pencil');
  document.getElementById('btn-tool-eyedrop').classList.toggle('active',t==='eyedrop');
  document.querySelectorAll('.admin-tool-btn').forEach(b => b.classList.toggle('admin-active', false));
  if (t === 'admin_rect') document.getElementById('btn-tool-rect').classList.add('admin-active');
  if (t === 'admin_circle') document.getElementById('btn-tool-circle').classList.add('admin-active');
  if (t === 'admin_line') document.getElementById('btn-tool-line').classList.add('admin-active');
  if (t === 'admin_move') document.getElementById('btn-tool-move').classList.add('admin-active');
  wrap.style.cursor='crosshair';
  
  if (t === 'admin_rect' || t === 'admin_circle' || t === 'admin_line') {
     document.getElementById('admin-floating-bar').style.display = 'flex';
     document.getElementById('admin-shape-fill-container').style.display = 'flex';
     document.getElementById('admin-floating-bar-title').textContent = 'РИСОВАНИЕ ФИГУРЫ (Рисуй мышью)';
  } else if (t === 'admin_move') {
     adminMoveState = 'select'; adminMoveRect = null;
     document.getElementById('admin-floating-bar').style.display = 'none';
     showToast('Выдели область мышью', 'info');
  } else if (t !== 'admin_image') {
     document.getElementById('admin-floating-bar').style.display = 'none';
  }
}

function toggleGrid(){ gridEnabled=!gridEnabled; document.getElementById('btn-grid').classList.toggle('active',gridEnabled); document.getElementById('toggle-grid').classList.toggle('on',gridEnabled); applyTransform(); }
function togglePalette(){ const p=document.getElementById('palette-panel'); p.style.display=p.style.display==='none'?'block':'none'; }
function toggleSmoothCamera(){smoothCamera=!smoothCamera;document.getElementById('toggle-smooth').classList.toggle('on',smoothCamera);}
function toggleCursors(){showCursors=!showCursors;document.getElementById('toggle-cursors').classList.toggle('on',showCursors);if(!showCursors)clearCursorFlags();}
function toggleInspector(){inspectorEnabled=!inspectorEnabled;document.getElementById('toggle-inspector').classList.toggle('on',inspectorEnabled);}
function toggleSound(){soundEnabled=!soundEnabled;document.getElementById('toggle-sound').classList.toggle('on',soundEnabled);}

function playClick(){
  try{
    const ac=new AudioContext();const osc=ac.createOscillator();const g=ac.createGain();
    osc.connect(g);g.connect(ac.destination);osc.frequency.value=880;
    g.gain.setValueAtTime(0.08,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.07);
    osc.start(ac.currentTime);osc.stop(ac.currentTime+0.07);
  }catch(_){}
}

function switchAdminTab(tab){
  ['users','canvas','broadcast','stats'].forEach(t=>{ document.getElementById(`admin-tab-${t}`).style.display=t===tab?'':'none'; });
  document.querySelectorAll('.admin-tab').forEach((el,i)=>{ el.classList.toggle('active',['users','canvas','broadcast','stats'][i]===tab); });
  if (tab==='stats') loadAdminStats();
}
function showPanel(id){
  hideAllPanels();
  document.getElementById(id)?.classList.add('show');
  document.getElementById('backdrop').classList.add('show');
  if (id==='leaderboard-panel') sendJSON({action:'get_leaderboard'});
  if (id==='profile-panel'){buildEmojiAvatarPicker();loadAvatarFromStorage();}
  if (id==='admin-panel') loadAdminStats();
  if (id==='clan-panel') { if (currentClan) sendJSON({action:'clan_get'}); else sendJSON({action:'clan_list'}); }
  if (id==='shop-panel') buildShopUI();
}
function hidePanel(id){document.getElementById(id)?.classList.remove('show');document.getElementById('backdrop').classList.remove('show');}
function hideAllPanels(){
  document.querySelectorAll('.overlay-panel:not(#auth-panel)').forEach(p=>p.classList.remove('show'));
  document.getElementById('backdrop').classList.remove('show');
}
function showToast(msg,type='info'){
  const wrap=document.getElementById('toast-wrap');
  const t=document.createElement('div');
  t.className=`toast toast-${type}`;t.textContent=msg;
  wrap.appendChild(t);
  setTimeout(()=>{t.classList.add('hide');setTimeout(()=>t.remove(),300);},3000);
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function updateCoordsBar(x,y){document.getElementById('coords-badge').textContent=(x<0)?'— , —':`${x} , ${y}`;}
function updateInspector(mx,my,px,py){
  if (!inspectorEnabled||px<0||py<0||px>=canvasW||py>=canvasH){document.getElementById('inspector').style.display='none';return;}
  const cidx=canvasData[py*canvasW+px];
  const col=PALETTE[cidx]||{c:'#fff',n:'?'};
  document.getElementById('inspector-color').style.background=col.c;
  document.getElementById('inspector-text').textContent=`${px},${py} — ${col.n}`;
  const el=document.getElementById('inspector');
  el.style.display='flex';
  let lx=mx+14,ly=my+14;
  if (lx+200>window.innerWidth) lx=mx-190;
  if (ly+38>window.innerHeight) ly=my-38;
  el.style.left=lx+'px';el.style.top=ly+'px';
}

document.getElementById('backdrop').onclick=()=>{ if(document.getElementById('auth-panel').classList.contains('show'))return; hideAllPanels(); };