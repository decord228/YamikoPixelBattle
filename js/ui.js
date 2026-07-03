'use strict';

// ── CLAN BANNER STATE ──
let clanBannerUrl = null;
let clanBannerCrop = { x: 0, y: 0, w: 1, h: 1 };
let clanBannerUploadPending = false;
let clanBannerImgNaturalAspect = null;
let bcmCropSnapshot = null;
let bcmDragMode = null;
let bcmDragStart = { x: 0, y: 0 };
let bcmBoxStart = { x: 0, y: 0, w: 0, h: 0, imgBox: null };
const CLAN_BANNER_MAX_MB = 5;

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
  const adminDiv=document.getElementById('divider-before-admin');
  if(adminDiv) adminDiv.style.display=isAdmin?'':'none';
  document.querySelectorAll('.admin-tool-btn').forEach(el => el.style.display = isAdmin?'flex':'none');
  
  if (isAdmin){loadAdminUsers();}
  // Индикатор записи тайм-лапса в топ-баре должен быть виден ВСЕМ
  // пользователям, не только админам — раньше поллинг статуса запускался
  // только для isAdmin, поэтому обычные пользователи никогда не видели иконку
  // записи, даже когда она реально шла (сервер тоже теперь отвечает на
  // timelapse_status без требования admin-роли — см. server.js).
  if (typeof tlStartStatusPolling === 'function') tlStartStatusPolling();
  showToast('Добро пожаловать, '+currentUser+'! '+currentEmoji,'success');
  loadAvatarFromStorage();
  drawAvatarCanvas(selectedEmoji);
  drawHudAvatar(selectedEmoji);
  saveSession(sessionFile.username,sessionFile.password);
  
  if (d.stencil) applySharedStencil(d.stencil);
  if (currentClan) sendJSON({action:'clan_get'});
  updateStencilPanelClanStatus();
  buildShopUI();
}

function doLogout() {
  clearSession();
  isLoggedIn=false;isAdmin=false;isVip=false;currentUser='';currentClan='';
  if (typeof tlStopStatusPolling === 'function') tlStopStatusPolling();
  const tlInd=document.getElementById('tl-rec-indicator'); if (tlInd) tlInd.style.display='none';
  document.getElementById('auth-panel').classList.add('show');
  document.getElementById('btn-admin').style.display='none';
  const adminDivL=document.getElementById('divider-before-admin');
  if(adminDivL) adminDivL.style.display='none';
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
  ctx.clearRect(0,0,48,48);
  ctx.font='28px serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(emoji||'👾',24,26);
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
}

function selectColor(idx) {
  selectedColor=idx;
  document.querySelectorAll('.color-cell').forEach((c,i)=>c.classList.toggle('selected',i===idx));
  document.getElementById('color-name-bar').textContent=PALETTE[idx]?.n||'';
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
  // Сразу записываем себя в кэш авторов — не ждём ответа сервера
  pixelOwnerCache.set(`${x},${y}`, { username: currentUser, emoji: currentEmoji });
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
    const sp=document.createElement('div');sp.className='sparkle';sp.innerHTML='<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l1.3 6.7L20 10l-6.7 1.3L12 18l-1.3-6.7L4 10l6.7-1.3L12 2z" fill="currentColor" stroke="none"/></svg>';
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
    bomb_3x3: '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="14" r="7"/><path d="M15.5 8.5L18 6"/><path d="M17 4l3 1-1 3"/></svg> Бомбочка 3×3 — кликни на холст',
    rainbow_5x5: '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 18a9 9 0 0 1 18 0"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/></svg> Радужный взрыв 5×5 — кликни на холст',
    eraser_10x10: '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14 3l6 6-7.5 7.5"/><path d="M9 17l-5.5 3.5"/><path d="M5.5 14.5L13 7l4 4-7.5 7.5-6-2z"/></svg> Ластик 10×10 — кликни на холст',
    mirror_stamp: '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="9.5" rx="6" ry="7"/><path d="M9 19h6"/><path d="M12 16.5V19"/></svg> Зеркальный штамп — кликни на холст',
  };
  document.getElementById('use-item-label').innerHTML = names[itemId] || 'Кликни на холст';
  document.getElementById('use-item-overlay').classList.add('active');
  hidePanel('shop-panel');
}

function toggleStencilPanel() {
  const p = document.getElementById('stencil-panel');
  const isHidden = p.style.display === 'none';
  setStencilToolActive(isHidden);
  if (isHidden) {
    updateStencilPanelClanStatus();
    if (currentClan) requestClanStencils();
  }
}

// Единая точка для синхронизации кнопки "Трафарет" в сайдбаре с панелью
// трафарета — чтобы кнопка всегда отражала, открыта ли панель, независимо
// от того, что её открыло (клик по кнопке, загрузка трафарета соклановца,
// загрузка сохранённого шаблона, и т.д.).
function setStencilToolActive(active) {
  const p = document.getElementById('stencil-panel');
  if (p) p.style.display = active ? 'block' : 'none';
  document.getElementById('btn-tool-stencil')?.classList.toggle('active', active);
}

function toggleStencilEdit() {
  if (stencilLocked) { showToast('Это трафарет соклановца — менять положение и размер нельзя', 'error'); return; }
  stencilEditMode = !stencilEditMode;
  document.getElementById('stencil-edit-toggle').classList.toggle('on', stencilEditMode);
  renderOverlay();
  if (stencilEditMode) {
      showToast('Режим редактирования: ВКЛ. Рисование заблокировано.', 'info');
  } else {
      showToast('Режим редактирования: ВЫКЛ. Теперь можно рисовать поверх трафарета.', 'success');
      if (typeof startStencilAnimIfNeeded === 'function') startStencilAnimIfNeeded();
  }
}

async function uploadPersonalStencil(dataUrl) {
    stencilUploadPending = true;
    const myGen = ++stencilUploadGen; // помечаем эту загрузку текущим "поколением"
    showToast('Сохранение в облако...', 'info');
    try {
        const res = await fetch(getApiUrl() + '/upload-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: dataUrl, name: 'stencil_' + currentUser, username: currentUser })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        // Если за время запроса трафарет был отменён или заменён новой загрузкой —
        // stencilUploadGen уже не совпадает, и этот ответ безопасно отбрасываем,
        // чтобы он не "оживил" уже неактуальный трафарет.
        if (myGen !== stencilUploadGen) return;
        if (data.url) {
            personalStencilUrl = data.url;
            stencilUploadPending = false;
            // Если за время загрузки юзер успел подвинуть/изменить трафарет —
            // stencilPendingSave хранит САМЫЕ СВЕЖИЕ rect/opacity на момент
            // последнего действия. Отправляем именно их, а не те, что были
            // в момент старта загрузки — иначе позиция "откатится".
            const toSave = stencilPendingSave || { rect: stencilRect, opacity: stencilOpacity };
            stencilPendingSave = null;
            sendJSON({ action: 'save_personal_stencil', stencil: { img: data.url, rect: toSave.rect, opacity: toSave.opacity } });
            showToast('Трафарет сохранён в облаке!', 'success');
        } else {
            stencilUploadPending = false;
        }
    } catch (e) { console.error(e); if (myGen === stencilUploadGen) stencilUploadPending = false; }
}

// Единая точка сохранения личного трафарета (позиция/прозрачность/картинка).
// Все места, которые раньше звали sendJSON({action:'save_personal_stencil', ...})
// напрямую, теперь должны звать эту функцию — она защищает от гонки, когда
// картинка ещё грузится на Cloudinary и personalStencilUrl ещё не актуален:
// в этом случае новые rect/opacity просто откладываются и отправятся сразу
// после того, как загрузка завершится с правильным URL.
function savePersonalStencil() {
  if (stencilUploadPending) {
    stencilPendingSave = { rect: { ...stencilRect }, opacity: stencilOpacity };
    return;
  }
  if (!personalStencilUrl) return;
  sendJSON({ action: 'save_personal_stencil', stencil: { img: personalStencilUrl, rect: stencilRect, opacity: stencilOpacity } });
}

// Кэш палитры в виде массива RGB для быстрого поиска
const _paletteRGB = PALETTE.map(p => ({
  r: parseInt(p.c.slice(1,3),16),
  g: parseInt(p.c.slice(3,5),16),
  b: parseInt(p.c.slice(5,7),16)
}));

function snapColorToPalette(r, g, b) {
  let bestIdx = 0, bestDist = Infinity;
  for (let pi = 0; pi < _paletteRGB.length; pi++) {
    const p = _paletteRGB[pi];
    const dist = (r-p.r)**2 + (g-p.g)**2 + (b-p.b)**2;
    if (dist < bestDist) { bestDist = dist; bestIdx = pi; }
  }
  return _paletteRGB[bestIdx];
}

function updateStencilGraphic() {
  if (!stencilOrigImg) return;
  const tmpC = document.createElement('canvas');
  tmpC.width = stencilRect.w;
  tmpC.height = stencilRect.h;
  const tctx = tmpC.getContext('2d');
  // imageSmoothingEnabled=false помогает при увеличении, но при уменьшении
  // браузер всё равно может смешивать — поэтому снапим цвета к палитре вручную
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(stencilOrigImg, 0, 0, stencilRect.w, stencilRect.h);

  const idata = tctx.getImageData(0, 0, stencilRect.w, stencilRect.h);
  for (let i = 0; i < idata.data.length; i += 4) {
    const a = idata.data[i+3];
    if (a < 128) { idata.data[i+3] = 0; continue; }
    // Снапим к ближайшему цвету палитры — убираем любые промежуточные цвета
    // от интерполяции браузера при масштабировании
    const snapped = snapColorToPalette(idata.data[i], idata.data[i+1], idata.data[i+2]);
    idata.data[i]   = snapped.r;
    idata.data[i+1] = snapped.g;
    idata.data[i+2] = snapped.b;
    idata.data[i+3] = 255;
  }
  tctx.putImageData(idata, 0, 0);

  const scaledImg = new Image();
  scaledImg.onload = () => {
    stencilImg = scaledImg;
    stencilImageData = idata;
    renderOverlay();
  };
  scaledImg.src = tmpC.toDataURL();
}

function scaleStencil(factor) {
  if (stencilLocked) { showToast('Это трафарет соклановца — менять размер нельзя', 'error'); return; }
  if (!stencilOrigImg) { showToast('Сначала загрузите трафарет', 'error'); return; }
  const newW = Math.max(1, Math.round(stencilRect.w * factor));
  const newH = Math.max(1, Math.round(stencilRect.h * factor));
  stencilRect.w = newW;
  stencilRect.h = newH;
  updateStencilGraphic();
  showToast(`Размер: ${newW}×${newH} пикс.`, 'info');
  savePersonalStencil();
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

      const snappedImg = new Image();
      snappedImg.onload = () => {
        // Позиционирование нового трафарета:
        // 1) Если на холсте уже что-то показано (свой трафарет ИЛИ взятый у
        //    соклановца) — новая картинка занимает то же МЕСТО (центр старого
        //    прямоугольника), просто с новым размером. Так удобно подменить
        //    картинку без необходимости заново её подгонять под нужный участок.
        // 2) Если трафарета нет вообще — кладём по центру текущего вида экрана,
        //    это единственный разумный дефолт для первой загрузки.
        let centerX, centerY;
        if (stencilActive && stencilRect) {
          centerX = stencilRect.x + stencilRect.w / 2;
          centerY = stencilRect.y + stencilRect.h / 2;
        } else {
          const cp = screenToCanvas(window.innerWidth/2, window.innerHeight/2);
          centerX = cp.x; centerY = cp.y;
        }

        stencilOrigImg = snappedImg;
        stencilOrigWidth = img.width;
        stencilOrigHeight = img.height;

        stencilRect = {
          x: Math.floor(centerX - img.width/2),
          y: Math.floor(centerY - img.height/2),
          w: img.width, 
          h: img.height
        };

        // Новая загруженная картинка — это всегда МОЙ трафарет, даже если до
        // этого на холсте был "взятый" (locked) трафарет соклановца.
        stencilActive=true;
        stencilEditMode=true;
        stencilLocked=false;
        stencilOwnerName='';
        document.getElementById('stencil-edit-toggle').classList.add('on');
        updateStencilLockUI();
        setStencilToolActive(true);
        
        updateStencilGraphic(); 
        showToast(`Трафарет загружен! ${img.width}×${img.height} пикс.`,'info');
        
        uploadPersonalStencil(tmpC.toDataURL());
      };
      snappedImg.src = tmpC.toDataURL();
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
});

function updateStencilOpacity(v){
  stencilOpacity=v/100;
  document.getElementById('stencil-opacity-val').textContent=v+'%';
  renderOverlay();
  if (!stencilLocked) savePersonalStencil();
}

function cancelStencil(){
  const wasLocked = stencilLocked;
  // Сбрасываем весь стейт трафарета
  stencilActive=false; stencilImg=null; stencilImageData=null; stencilOrigImg=null; personalStencilUrl=null;
  stencilHandle=null; isDraggingTool=false; adminActiveHandle=null; stencilLocked=false; stencilOwnerName='';
  stencilUploadPending=false; stencilPendingSave=null; stencilUploadGen++;
  document.getElementById('stencil-panel').style.display='none';
  if (typeof setStencilToolActive === 'function') setStencilToolActive(false);
  updateStencilLockUI();
  // Если это был "взятый" трафарет соклановца — он никогда не сохранялся как личный,
  // поэтому очищать личный трафарет на сервере не нужно (чтобы не затереть свой).
  if (!wasLocked) sendJSON({ action: 'save_personal_stencil', stencil: null });
  renderOverlay();
}

// Сохранение через inline-инпут (без prompt — работает в Discord)
function doSaveStencil() {
  if (!stencilImg) { showToast('Сначала загрузите трафарет', 'error'); return; }
  if (!personalStencilUrl) { showToast('Трафарет ещё загружается, подождите...', 'error'); return; }
  const inp = document.getElementById('stencil-save-name');
  const name = (inp ? inp.value : '').trim().slice(0, 30) || ('Шаблон ' + (savedStencils.length + 1));
  sendJSON({ action: 'save_stencil_preset', name, stencil: { img: personalStencilUrl, rect: stencilRect, opacity: stencilOpacity } });
  if (inp) inp.value = '';
}

// Оставляем алиас для совместимости
function promptSaveStencil() { doSaveStencil(); }

function renderSavedStencils() {
  const c = document.getElementById('saved-stencils-list');
  if (!c) return;
  if (!savedStencils || !savedStencils.length) {
    c.innerHTML = '<div class="stencil-list-empty">Сохранённых шаблонов нет</div>';
    return;
  }
  // Сервер хранит массив { name, stencil: { img, rect, opacity } }
  c.innerHTML = savedStencils.map((s, i) => {
    const r = s.stencil && s.stencil.rect;
    const safeN = esc(s.name || ('Шаблон ' + (i + 1)));
    return `<div class="stencil-item">
      <div class="stencil-item-info">
        <div class="stencil-item-name">${safeN}</div>
        <div class="stencil-item-meta">${r ? r.w + '×' + r.h + ' пикс.' : ''}</div>
      </div>
      <button class="stencil-item-load" data-onclick="loadSavedStencil(${i})">Загр.</button>
      <button class="stencil-item-delete" data-onclick="deleteSavedStencil(${i})">✕</button>
    </div>`;
  }).join('');
}

function loadSavedStencil(i) {
  const s = savedStencils[i];
  if (!s || !s.stencil || !s.stencil.img) { showToast('Трафарет повреждён', 'error'); return; }
  const savedRect = s.stencil.rect;
  let rect;
  if (savedRect && savedRect.w && savedRect.h && savedRect.x !== undefined && savedRect.y !== undefined) {
    rect = { x: savedRect.x, y: savedRect.y, w: savedRect.w, h: savedRect.h };
  } else {
    // Фоллбэк: центр экрана если координаты не сохранились
    const cp = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
    const w = (savedRect && savedRect.w) || 64;
    const h = (savedRect && savedRect.h) || 64;
    rect = { x: Math.floor(cp.x - w / 2), y: Math.floor(cp.y - h / 2), w, h };
  }
  applySharedStencil({ img: s.stencil.img, opacity: s.stencil.opacity || 0.6, rect });
}

function deleteSavedStencil(i) {
  // Без confirm() — сразу удаляем и оптимистично убираем из локального массива
  if (i < 0 || i >= savedStencils.length) return;
  savedStencils.splice(i, 1);
  renderSavedStencils();
  sendJSON({ action: 'delete_stencil_preset', index: i });
}

async function shareStencilToClan(){
  if (!currentClan){showToast('Вы не в клане','error');return;}
  if (!stencilImg) {showToast('Сначала загрузите трафарет','error');return;}
  if (stencilLocked) {showToast('Это трафарет соклановца — поделиться им от своего имени нельзя','error');return;}
  if (stencilUploadPending) {showToast('Картинка ещё загружается в облако, подождите секунду...','info');return;}

  if (clanSharedStencil && clanSharedStencil.owner !== currentUser) {
    showToast(`В клане уже есть трафарет от ${clanSharedStencil.owner}`, 'error');
    return;
  }

  if (personalStencilUrl) {
      sendJSON({ action: 'clan_share_stencil', stencil: { img: personalStencilUrl, rect: stencilRect, opacity: stencilOpacity } });
      showToast('Трафарет отправлен соклановцам!', 'success');
      return;
  }
  
  showToast('Загрузка в облако...', 'info');
  try {
    const res = await fetch(getApiUrl() + '/upload-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: stencilImg.src, name: 'clan_stencil', username: currentUser })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.url) {
      personalStencilUrl = data.url;
      sendJSON({ action: 'clan_share_stencil', stencil: { img: data.url, rect: stencilRect, opacity: stencilOpacity } });
      showToast('Трафарет отправлен соклановцам!', 'success');
    } else { showToast('Ошибка загрузки', 'error'); }
  } catch (e) { showToast('Ошибка сети', 'error'); }
}

// Владелец клановского трафарета убирает его — у всех соклановцев он исчезнет
// (если они его сейчас просматривают).
async function unshareClanStencil() {
  if (!clanSharedStencil || clanSharedStencil.owner !== currentUser) {
    console.warn('[unshareClanStencil] Отмена: clanSharedStencil=', clanSharedStencil, 'currentUser=', currentUser);
    return;
  }
  const ok = await showConfirm('Снять ваш трафарет с показа всему клану?', { title: 'Снять трафарет', icon: '🪞' });
  if (!ok) return;
  sendJSON({ action: 'clan_unshare_stencil' });
}

// ── CLAN STENCIL (один на клан, с владельцем) ──
let clanSharedStencil = null; // { owner, emoji, stencil } | null

function requestClanStencils() {
  if (!currentClan) return;
  sendJSON({ action: 'clan_get_stencils' });
}

function renderClanStencilsList() {
  const c = document.getElementById('clan-stencils-list');
  if (!c) return;
  if (!clanSharedStencil) {
    c.innerHTML = '<div class="stencil-list-empty">Никто не поделился трафаретом</div>';
    return;
  }
  const entry = clanSharedStencil;
  const isMine = entry.owner === currentUser;
  const isShowingThis = stencilActive && personalStencilUrl === (entry.stencil && entry.stencil.img);
  c.innerHTML = `
    <div class="stencil-item${isMine ? ' stencil-item-mine' : ''}">
      <span class="stencil-item-emoji">${esc(entry.emoji||'👾')}</span>
      <div class="stencil-item-info" data-onclick="loadClanMemberStencil()" style="cursor:pointer;">
        <div class="stencil-item-name">${isMine ? 'Ваш трафарет' : esc(entry.owner)}${isShowingThis ? ' · сейчас показан' : ''}</div>
        <div class="stencil-item-meta">${entry.stencil&&entry.stencil.rect?entry.stencil.rect.w+'×'+entry.stencil.rect.h+' пикс.':''}</div>
      </div>
      ${isMine
        ? `<button class="stencil-item-delete" data-onclick="unshareClanStencil()" title="Снять трафарет с клана">✕</button>`
        : `<span class="stencil-item-action" data-onclick="loadClanMemberStencil()" style="cursor:pointer;">${isShowingThis ? 'ПОКАЗАН' : 'ВЗЯТЬ'}</span>`
      }
    </div>`;
}

function loadClanMemberStencil() {
  const entry = clanSharedStencil;
  if (!entry || !entry.stencil || !entry.stencil.img) { showToast('Трафарет недоступен', 'error'); return; }
  if (entry.owner === currentUser) {
    // Это свой же трафарет — просто открываем его как редактируемый (полные права).
    applySharedStencil(entry.stencil, false);
    showToast('Ваш трафарет загружен', 'success');
    return;
  }
  // Берём трафарет ровно в тех координатах, в которых его сохранил соклановец —
  // без перемещения в центр экрана. Чужой трафарет — только просмотр (locked).
  applySharedStencil(entry.stencil, true, entry.owner);
  showToast(`Загружен трафарет от ${entry.owner}`, 'success');
}

function applySharedStencil(data, locked = false, ownerName = ''){
  if (!data||!data.img) return;
  const img=new Image();
  img.crossOrigin = "Anonymous";
  img.onload=()=>{
    stencilOrigImg = img;
    stencilOrigWidth = img.width;
    stencilOrigHeight = img.height;

    stencilRect=data.rect||{x:0,y:0,w:img.width,h:img.height};
    stencilOpacity=data.opacity||0.6;
    stencilActive=true;
    stencilEditMode=false;
    stencilLocked=locked;
    stencilOwnerName = locked ? (ownerName || '') : '';
    document.getElementById('stencil-edit-toggle').classList.remove('on');
    setStencilToolActive(true);
    document.getElementById('stencil-panel-opacity').value = stencilOpacity * 100;
    document.getElementById('stencil-opacity-val').textContent = (stencilOpacity * 100) + '%';
    updateStencilLockUI();

    personalStencilUrl = data.img;
    stencilUploadPending = false; // применяем уже готовый URL — никакой загрузки в облако не идёт
    stencilPendingSave = null;
    stencilUploadGen++; // отбрасываем любую предыдущую незавершённую загрузку файла
    if (!locked) savePersonalStencil();

    updateStencilGraphic(); 
    showToast('Трафарет успешно загружен!','success');
    if (typeof startStencilAnimIfNeeded === 'function') startStencilAnimIfNeeded();
  };
  img.src=getProxiedImageUrl(data.img);
}

// Показывает/скрывает элементы управления трафаретом в зависимости от того,
// можно ли его двигать/масштабировать (нельзя — если он взят у соклановца).
function updateStencilLockUI() {
  const editRow = document.getElementById('stencil-edit-row');
  const scaleRow = document.getElementById('stencil-scale-row');
  const lockNote = document.getElementById('stencil-lock-note');
  if (editRow) editRow.style.display = stencilLocked ? 'none' : '';
  if (scaleRow) scaleRow.style.display = stencilLocked ? 'none' : '';
  if (lockNote) {
    lockNote.style.display = stencilLocked ? 'flex' : 'none';
    const span = lockNote.querySelector('span');
    if (span) span.textContent = stencilOwnerName
      ? `Трафарет от ${stencilOwnerName} — можно менять только прозрачность`
      : 'Трафарет соклановца — можно менять только прозрачность';
  }
  if (typeof updateStencilPanelClanStatus === 'function') updateStencilPanelClanStatus();
}

// Управляет блоком "Поделиться с кланом" в панели трафарета: показывает кто сейчас
// держит общий трафарет клана и подменяет кнопку на "СНЯТЬ", если это владелец.
function updateStencilPanelClanStatus() {
  const statusEl = document.getElementById('stencil-clan-share-status');
  const btnEl = document.getElementById('stencil-clan-share-btn');
  const rowEl = document.getElementById('stencil-clan-share-row');
  if (!statusEl || !btnEl) return;

  if (!currentClan) {
    if (rowEl) rowEl.style.display = 'none';
    return;
  }
  if (rowEl) rowEl.style.display = '';

  if (stencilLocked) {
    // Сейчас показан чужой трафарет — делиться им от своего имени нельзя,
    // зато можно показать, кто именно сейчас держит трафарет клана.
    statusEl.textContent = clanSharedStencil ? `Сейчас делится: ${clanSharedStencil.owner}` : '';
    btnEl.textContent = 'ПРОСМОТР';
    btnEl.className = 'btn btn-secondary btn-sm';
    btnEl.style.background = '';
    btnEl.setAttribute('data-onclick', "showToast('Загрузите свою картинку, чтобы поделиться','info')");
  } else if (!clanSharedStencil) {
    statusEl.textContent = 'Никто не делится';
    btnEl.textContent = 'ОТПРАВИТЬ';
    btnEl.className = 'btn btn-primary btn-sm';
    btnEl.style.background = 'var(--accent2)';
    btnEl.setAttribute('data-onclick', 'shareStencilToClan()');
  } else if (clanSharedStencil.owner === currentUser) {
    statusEl.textContent = 'Ваш трафарет виден всему клану';
    btnEl.textContent = 'СНЯТЬ';
    btnEl.className = 'btn btn-danger btn-sm';
    btnEl.style.background = '';
    btnEl.setAttribute('data-onclick', 'unshareClanStencil()');
  } else {
    statusEl.textContent = `Сейчас делится: ${clanSharedStencil.owner}`;
    btnEl.textContent = 'ЗАНЯТО';
    btnEl.className = 'btn btn-secondary btn-sm';
    btnEl.style.background = '';
    btnEl.setAttribute('data-onclick', 'shareStencilToClan()');
  }
}

function handleStencilStart(clientX,clientY){
  if (!stencilActive||!stencilImg||!stencilEditMode) return false;
  const off = getRenderOffset();
  const ir=stencilRect;
  const sx = ir.x * camZoom + off.x; 
  const sy = ir.y * camZoom + off.y;
  const sw = ir.w * camZoom;
  const sh = ir.h * camZoom;
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

// Кнопка чата (#chat-btn) открывает попап с редизайном чата, встроенный
// прямо в проект (разметка — в index.html #chat-popup-panel, стили — в
// style.css, логика — в js/chat-popup.js). Раньше это был отдельный
// chat-popup.html, подключаемый через iframe. Старая простая панель
// (#chat-panel) больше не показывается, но остаётся в DOM нетронутой —
// addChatMessage() ниже по-прежнему пишет в неё сообщения с сервера, чтобы
// ничего не сломать, пока новый чат работает на моковых данных без бэкенда.
function toggleChat() {
  const overlay = document.getElementById('chat-popup-overlay');
  if (overlay.classList.contains('show')) closeChatPopup();
  else openChatPopup();
}

function openChatPopup() {
  const overlay = document.getElementById('chat-popup-overlay');
  // Инициализируем разметку попапа лениво — только при первом открытии.
  if (typeof initChatPopup === 'function') initChatPopup();
  // А данные (друзья/ЛС/онлайн) подтягиваем с сервера при каждом открытии,
  // чтобы список не был протухшим, если попап долго не открывали.
  if (typeof cpRefreshAll === 'function') cpRefreshAll();
  overlay.classList.add('show');
  document.getElementById('chat-btn').classList.add('active');
  chatOpen = true;
  chatUnread = 0;
  document.getElementById('chat-unread').style.display = 'none';
}

function closeChatPopup() {
  document.getElementById('chat-popup-overlay').classList.remove('show');
  document.getElementById('chat-btn').classList.remove('active');
  chatOpen = false;
}

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.getElementById('chat-popup-overlay')?.classList.contains('show')) {
    closeChatPopup();
  }
});

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
  sendJSON({action:'chat_send', text});
  input.value = '';
}

function switchClanSubTab(tab) {
  ['browse','create'].forEach(t => {
    const el = document.getElementById(`clan-sub-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#clan-view-no-clan .sub-tab').forEach((el, i) => {
    el.classList.toggle('active', ['browse','create'][i] === tab);
  });
  if (tab === 'browse') sendJSON({action:'clan_list'});
}

const CLAN_INNER_TABS = ['overview','members','ranks','requests','chat','shop','treasury','settings'];

function switchClanInnerTab(tab) {
  CLAN_INNER_TABS.forEach(t => {
    const el = document.getElementById(`clan-inner-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#clan-view-in-clan .clan-sidenav .csn-item[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  if (tab === 'requests') sendJSON({action:'clan_get_requests'});
  if (tab === 'ranks') { clanRanksEditingId = null; renderClanRanksTab(); }
  if (tab === 'members') renderClanMemberPage();
  if (tab === 'overview') renderClanOverview();
  if (tab === 'shop') renderClanShopTab();
  if (tab === 'treasury') renderClanTreasuryTab();
}

function createClan(){
  const name=document.getElementById('clan-create-name').value.trim();
  const tag=document.getElementById('clan-create-tag').value.trim();
  const desc=document.getElementById('clan-create-desc').value.trim();
  if (!name){showToast('Введите название клана','error');return;}
  sendJSON({action:'clan_create',name,tag,description:desc});
}

function joinClan(explicitName){
  const name=(explicitName||document.getElementById('clan-join-name')?.value||'').trim();
  if (!name){showToast('Введите название клана','error');return;}
  sendJSON({action:'clan_join',name});
}

// ── Определяет, может ли текущий пользователь вступить в клан из списка ──
// Возвращает { canJoin, label, reason } — используется для рендера кнопки
// на карточке клана в горизонтальном списке обзора.
function clanBrowseJoinState(cl) {
  if (!isLoggedIn) return { canJoin:false, label:'Войдите', reason:'Нужно войти в аккаунт' };
  if (currentClan) return { canJoin:false, label:'Вы в клане', reason:'Сначала покиньте текущий клан' };
  if (cl.join_type === 'closed') return { canJoin:false, label:'Закрыто', reason:'Вступление в этот клан закрыто' };
  const need = cl.min_pixels || 0;
  if (need && (currentPixels||0) < need) return { canJoin:false, label:`Нужно ${need.toLocaleString()} px`, reason:`Нужно минимум ${need} пикселей` };
  if (cl.join_type === 'request') return { canJoin:true, label:'Запрос', reason:'' };
  return { canJoin:true, label:'Вступить', reason:'' };
}

async function leaveClan(){
  const isLdr = currentClan && clanFullData && clanFullData.leader === currentUser;
  const msg = isLdr ? 'Вы лидер клана. При выходе лидерство перейдёт участнику с самым высоким званием. Покинуть клан?' : 'Покинуть клан?';
  const ok = await showConfirm(msg, { title: 'Выйти из клана', icon: '🚪' });
  if (!ok) return;
  sendJSON({action:'clan_leave'});
}

async function disbandClan(){
  const ok = await showConfirm('Распустить клан? Все участники будут исключены, это действие необратимо.', { title: 'Распустить клан', icon: '⚠️', danger: true, confirmText: 'Распустить' });
  if (!ok) return;
  sendJSON({action:'clan_disband'});
}

// ─────────────────────────────────────────────
// CLAN CHAT v2 — инициализация и добавление сообщений
// ─────────────────────────────────────────────
let _clanChatV2Init = false;
let _clanChatV2Messages = [];

function initClanChatV2() {
  const inner = document.getElementById('clan-inner-chat');
  if (!inner || inner.dataset.v2) return;
  inner.dataset.v2 = '1';
  _clanChatV2Init = true;
  inner.innerHTML = `
      <div class="clan-chat-v2-wrap" id="clan-chat-v2-msgs">
          <div class="clan-chat-v2-empty">
              <div class="clan-chat-v2-empty-icon">💬</div>
              <div>Здесь появятся сообщения клана</div>
          </div>
      </div>
      <div class="clan-chat-v2-input-row">
          <input class="clan-chat-v2-input" id="clan-chat-v2-input"
              placeholder="Сообщение клану..." maxlength="200"
              data-onkeydown="if(event.key==='Enter')sendClanChatV2()">
          <button class="clan-chat-v2-send" data-onclick="sendClanChatV2()">
              <svg class="icon icon-arrow" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
          </button>
      </div>`;
  // Восстановить историю
  if (_clanChatV2Messages.length) {
    const wrap = document.getElementById('clan-chat-v2-msgs');
    if (wrap) {
      wrap.innerHTML = '';
      _clanChatV2Messages.forEach(m => _appendClanChatV2Msg(m.username, m.text, m.emoji, m.ts));
    }
  }
}

function _appendClanChatV2Msg(user, text, emoji, ts) {
  const wrap = document.getElementById('clan-chat-v2-msgs');
  if (!wrap) return;
  const empty = wrap.querySelector('.clan-chat-v2-empty');
  if (empty) empty.remove();
  const pad = n => String(n).padStart(2, '0');
  let timeStr = '';
  if (ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      timeStr = pad(d.getHours()) + ':' + pad(d.getMinutes());
    } else {
      timeStr = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
  }
  const el = document.createElement('div');
  el.className = 'clan-chat-v2-msg';
  el.innerHTML = `
      <div class="clan-chat-v2-avatar">${esc(emoji || '👾')}</div>
      <div class="clan-chat-v2-body">
          <div class="clan-chat-v2-header">
              <span class="clan-chat-v2-user">${esc(user)}</span>
              ${timeStr ? `<span class="clan-chat-v2-time">${timeStr}</span>` : ''}
          </div>
          <div class="clan-chat-v2-text">${esc(text)}</div>
      </div>`;
  wrap.appendChild(el);
  while (wrap.children.length > 120) wrap.removeChild(wrap.firstChild);
  wrap.scrollTop = wrap.scrollHeight;
}

function addClanChatMessage(user, text, emoji, ts) {
  const msg = { username: user, text, emoji: emoji || '👾', ts: ts || Date.now() };
  _clanChatV2Messages.push(msg);
  if (_clanChatV2Messages.length > 120) _clanChatV2Messages.shift();
  _appendClanChatV2Msg(user, text, emoji, msg.ts);
}

function sendClanChatV2() {
  const input = document.getElementById('clan-chat-v2-input');
  const text = (input?.value || '').trim();
  if (!text || !isLoggedIn || !currentClan) return;
  sendJSON({ action: 'clan_chat_send', text });
  if (input) input.value = '';
}

function sendClanChat() { sendClanChatV2(); }

function buildClanIconPicker(current) {
  const grid = document.getElementById('cs-icon-grid');
  if (!grid) return;
  grid.innerHTML = '';
  EMOJI_AVATARS.forEach(em => {
    const d = document.createElement('div');
    d.className = 'av-opt' + (em === current ? ' selected' : '');
    d.textContent = em;
    d.onclick = () => {
      document.getElementById('cs-icon').value = em;
      document.getElementById('cs-icon-preview').textContent = em;
      grid.querySelectorAll('.av-opt').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
    };
    grid.appendChild(d);
  });
}

function buildClanColorPicker(current) {
  const grid = document.getElementById('cs-tag-color-grid');
  if (!grid) return;
  grid.innerHTML = '';
  PALETTE.forEach(p => {
    const d = document.createElement('div');
    d.className = 'color-cell' + (p.c === current ? ' selected' : '');
    d.style.background = p.c;
    d.title = p.n;
    d.onclick = () => {
      document.getElementById('cs-tag-color').value = p.c;
      document.getElementById('cs-tag-color-preview').style.background = p.c;
      grid.querySelectorAll('.color-cell').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
    };
    grid.appendChild(d);
  });
}

function saveClanSettings() {
  if (clanBannerUploadPending) { showToast('Дождитесь загрузки баннера...', 'info'); return; }
  const icon       = document.getElementById('cs-icon').value || '🏴';
  const tag_color  = document.getElementById('cs-tag-color').value || '#818cf8';
  const join_type  = document.getElementById('cs-join-type').value || 'open';
  const min_pixels = parseInt(document.getElementById('cs-min-pixels').value) || 0;
  const is_public  = document.getElementById('cs-public-toggle').classList.contains('on');
  const share_cursor = document.getElementById('cs-cursor-toggle').classList.contains('on');
  // MOTD теперь сохраняется отдельной кнопкой (saveClanMotdInline), т.к. у неё
  // может быть своё, более узкое право (edit_motd) — шлём текущее значение,
  // чтобы сервер (у которого есть право manage_settings) его не затирал пустотой.
  const message_of_day = (document.getElementById('cs-motd')?.value || '').trim().slice(0, 200);

  sendJSON({
    action: 'clan_update_settings',
    settings: {
      icon, tag_color, join_type, min_pixels, is_public, share_cursor, message_of_day,
      banner_url:    clanBannerUrl,
      banner_crop_x: clanBannerCrop.x,
      banner_crop_y: clanBannerCrop.y,
      banner_crop_w: clanBannerCrop.w,
      banner_crop_h: clanBannerCrop.h,
    }
  });
  showToast('Настройки клана сохранены ✓', 'success');
}

function saveClanMotdInline() {
  const text = (document.getElementById('cs-motd')?.value || '').trim().slice(0, 200);
  sendJSON({action:'clan_set_motd', motd: text});
  const motdEl = document.getElementById('clan-motd-text');
  if (motdEl) motdEl.textContent = text || 'Добро пожаловать в клан!';
  showToast('Сообщение дня обновлено ✓', 'success');
}

async function transferLeadership(username) {
  if (!username) return;
  const ok = await showConfirm(`Передать лидерство клана участнику ${username}? Вы станете обычным участником.`, { title: 'Передача лидерства', icon: '👑', danger: true, confirmText: 'Передать' });
  if (!ok) return;
  sendJSON({action:'clan_transfer_leadership', username});
}

function transferLeadershipFromSettings() {
  const sel = document.getElementById('cs-transfer-select');
  if (!sel || !sel.value) { showToast('Выберите участника', 'error'); return; }
  transferLeadership(sel.value);
}

function renderClanRequests(requests) {
  const c = document.getElementById('clan-requests-list');
  const badge = document.getElementById('clan-req-count');
  if (badge) {
    if (requests.length) { badge.textContent = requests.length; badge.style.display = ''; }
    else badge.style.display = 'none';
  }
  if (!requests.length) {
    c.innerHTML = '<div class="clan-empty-state">📭<div>Заявок на вступление нет</div></div>';
    return;
  }
  c.innerHTML = `<div class="clan-req-list">` + requests.map(r => `
    <div class="clan-req-card">
      <div class="clan-req-avatar">🙋</div>
      <div class="clan-req-info">
        <div class="clan-req-name">${esc(r)}</div>
        <div class="clan-req-sub">Хочет вступить в клан</div>
      </div>
      <div class="clan-req-actions">
        <button class="clan-req-btn clan-req-accept" data-onclick="sendJSON({action:'clan_accept_request',username:'${esc(r)}'})" title="Принять">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5l4.5 4.5L19 7"/></svg>
        </button>
        <button class="clan-req-btn clan-req-deny" data-onclick="sendJSON({action:'clan_deny_request',username:'${esc(r)}'})" title="Отказать">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
        </button>
      </div>
    </div>`).join('') + `</div>`;
}

// ══════════════════════════════════════════════════
//  CLAN RANKS / PERMISSIONS — клиентские хелперы
//  (зеркалят логику сервера для мгновенного отклика UI;
//   сервер всё равно перепроверяет права на каждое действие)
// ══════════════════════════════════════════════════
function clanDefaultRanks() {
  return [
    { id:'leader', name:'Лидер', icon:'👑', color:'#fbbf24', priority:100, isLeader:true, isDefault:true,
      permissions:{invite:true,kick:true,manage_ranks:true,manage_settings:true,manage_stencil:true,edit_motd:true} },
    { id:'member', name:'Участник', icon:'⚔️', color:'#818cf8', priority:0, isDefault:true,
      permissions:{invite:false,kick:false,manage_ranks:false,manage_settings:false,manage_stencil:false,edit_motd:false} },
  ];
}
function clanGetRanks(clan) {
  if (!clan || !Array.isArray(clan.ranks) || !clan.ranks.some(r=>r.id==='leader') || !clan.ranks.some(r=>r.id==='member')) return clanDefaultRanks();
  return clan.ranks;
}
function clanRankOfUser(clan, username) {
  const ranks = clanGetRanks(clan);
  if (!clan) return ranks[1];
  if (clan.leader === username) return ranks.find(r=>r.id==='leader') || ranks[0];
  const rid = (clan.member_roles||{})[username] || 'member';
  return ranks.find(r=>r.id===rid) || ranks.find(r=>r.id==='member') || ranks[1];
}
function clanHasPermUser(clan, username, perm) {
  if (!clan || !username) return false;
  if (clan.leader === username) return true;
  const rank = clanRankOfUser(clan, username);
  return !!(rank && rank.permissions && rank.permissions[perm]);
}
function clanPriorityOfUser(clan, username) {
  const rank = clanRankOfUser(clan, username);
  return rank ? (rank.priority || 0) : 0;
}
function clanPermBadges(rank) {
  const granted = CLAN_PERMISSIONS.filter(p => rank.permissions && rank.permissions[p.key]);
  if (!granted.length) return '<span class="clan-perm-none">без особых прав</span>';
  return granted.map(p => `<span class="clan-perm-pill" title="${esc(p.name)}: ${esc(p.desc)}">${p.icon} ${esc(p.name)}</span>`).join('');
}

// ─────────────────────────────────────────────
// КЛАН: МАГАЗИН (баннеры + расширение лимита участников)
// Оплата — только из казны клана.
// ─────────────────────────────────────────────
function clanOwnedShopItems(clan) {
  return (clan && (clan.shop_items || clan.purchased_shop_items)) || [];
}
function clanCurrentMemberLimit(clan) {
  if (clan && clan.member_limit) return clan.member_limit;
  const owned = clanOwnedShopItems(clan);
  let limit = CLAN_BASE_MEMBER_LIMIT;
  CLAN_MEMBER_LIMIT_TIERS.forEach(t => { if (owned.includes(t.id)) limit = Math.max(limit, t.limit); });
  return limit;
}

function renderClanShopTab() {
  const clan = clanFullData;
  const box = document.getElementById('clan-shop-content');
  if (!box || !clan) return;

  const canBuy = clanHasPermUser(clan, currentUser, 'manage_treasury');
  const treasury = clan.treasury || 0;
  const owned = clanOwnedShopItems(clan);
  const memberCount = (clan.members || []).length;
  const curLimit = clanCurrentMemberLimit(clan);

  const balanceRow = `
    <div class="clan-shop-balance-row">
      <div class="clan-shop-balance-label">💰 Оплата — из казны клана</div>
      <div class="clan-shop-balance-amount">${Math.floor(treasury).toLocaleString()}🪙</div>
    </div>`;

  // ── Баннеры (компактные строки: иконка + текст + одна короткая кнопка/иконка-статус) ──
  const bannerItems = CLAN_SHOP_ITEMS.map(item => {
    const isOwned = owned.includes(item.id);
    const lockedByRequire = item.requires && !owned.includes(item.requires);
    const requireTitle = item.requires ? esc(CLAN_SHOP_ITEMS.find(i=>i.id===item.requires)?.title||'') : '';
    let actionHtml;
    if (isOwned) actionHtml = `<span class="shop-owned">✓</span>`;
    else if (!canBuy) actionHtml = `<span class="shop-lock-inline" title="Нужно право «Казна», чтобы покупать в магазине клана">🔒</span>`;
    else if (lockedByRequire) actionHtml = `<span class="shop-lock-inline" title="Сначала купите «${requireTitle}»">🔒</span>`;
    else actionHtml = `<button class="btn btn-secondary btn-sm" data-onclick="buyClanShopItem('${item.id}')">${item.cost}🪙</button>`;
    return `
    <div class="clan-shop-item ${isOwned?'is-owned':''}">
      <div class="clan-shop-item-icon">${item.icon}</div>
      <div class="clan-shop-item-body">
        <div class="clan-shop-item-title">${esc(item.title)}</div>
        <div class="clan-shop-item-desc">${esc(item.desc)}</div>
      </div>
      <div class="clan-shop-item-action">${actionHtml}</div>
    </div>`;
  }).join('');

  // ── Лимит участников: базовый тир + все покупные тиры в ОДНОЙ сетке ──
  const nextTierId = CLAN_MEMBER_LIMIT_TIERS.filter(t=>t.limit>curLimit).sort((a,b)=>a.limit-b.limit)[0]?.id;
  const tierCells = [
    { limit: CLAN_BASE_MEMBER_LIMIT, lbl: 'базовый', owned: true, next: false, cost: 0, id: null },
    ...CLAN_MEMBER_LIMIT_TIERS.map(tier => ({
      limit: tier.limit, lbl: 'участников', owned: curLimit >= tier.limit,
      next: curLimit < tier.limit && nextTierId === tier.id, cost: tier.cost, id: tier.id,
    })),
  ].map(tier => {
    let actionHtml;
    if (!tier.id || tier.owned) actionHtml = `<span class="shop-owned">✓</span>`;
    else if (!canBuy) actionHtml = `<span class="clan-shop-tier-locked" title="Нужно право «Казна»">🔒</span>`;
    else if (!tier.next) actionHtml = `<span class="clan-shop-tier-locked" title="Тиры покупаются по порядку">🔒</span>`;
    else actionHtml = `<button class="btn btn-secondary btn-sm" data-onclick="buyClanMemberLimit('${tier.id}')">${tier.cost}🪙</button>`;
    return `
    <div class="clan-shop-tier ${tier.owned?'is-owned':''} ${tier.next?'is-next':''}">
      <div class="clan-shop-tier-num">${tier.limit}</div>
      <div class="clan-shop-tier-lbl">${tier.lbl}</div>
      <div class="clan-shop-tier-action">${actionHtml}</div>
    </div>`;
  }).join('');

  box.innerHTML = `
    ${balanceRow}
    <div class="clan-shop-section-title">🖼️ Баннеры клана</div>
    <div class="clan-shop-items-list">${bannerItems}</div>

    <div class="clan-shop-section-title is-spaced">👥 Лимит участников <span class="clan-shop-section-sub">сейчас: ${memberCount}/${curLimit}</span></div>
    <div class="clan-shop-tiers-row">${tierCells}</div>`;
}

function buyClanShopItem(itemId) {
  sendJSON({action:'clan_shop_buy', item_id: itemId, source: 'treasury'});
}

function buyClanMemberLimit(tierId) {
  sendJSON({action:'clan_shop_buy', item_id: tierId, source: 'treasury'});
}

// ─────────────────────────────────────────────
// КЛАН: КАЗНА
// ─────────────────────────────────────────────
function renderClanTreasuryTab() {
  const clan = clanFullData;
  const box = document.getElementById('clan-treasury-content');
  if (!box || !clan) return;

  const balance = clan.treasury || 0;
  const canManage = clanHasPermUser(clan, currentUser, 'manage_treasury');
  const log = (clan.treasury_log || []).slice(0, 30);

  const navAmount = document.getElementById('clan-treasury-nav-amount');
  if (navAmount) navAmount.textContent = Math.floor(balance).toLocaleString();

  box.innerHTML = `
    <div class="clan-treasury-balance-card">
      <div class="clan-treasury-balance-icon">💰</div>
      <div class="clan-treasury-balance-label">Баланс казны клана</div>
      <div class="clan-treasury-balance-amount">${Math.floor(balance).toLocaleString()}🪙</div>
    </div>
    ${!canManage ? '<div class="clan-perm-hint" style="margin-bottom:14px;">🔒 У твоего звания нет права «Казна» — ты можешь только пополнять казну.</div>' : ''}

    <div class="clan-treasury-actions">
      <div class="clan-settings-card">
        <div class="clan-settings-card-title">📥 Пополнить</div>
        <div class="clan-treasury-input-row">
          <input type="number" min="1" class="form-input" id="clan-treasury-deposit-amount" placeholder="Сумма">
          <button class="btn btn-primary btn-sm" data-onclick="clanTreasuryDeposit()">Внести</button>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px;">Личный кошелёк: ${Math.floor(currentCoins)}🪙</div>
      </div>

      <div class="clan-settings-card" ${!canManage?'style="opacity:.6"':''}>
        <div class="clan-settings-card-title">📤 Снять</div>
        <div class="clan-treasury-input-row">
          <input type="number" min="1" class="form-input" id="clan-treasury-withdraw-amount" placeholder="Сумма" ${!canManage?'disabled':''}>
          <button class="btn btn-secondary btn-sm" data-onclick="clanTreasuryWithdraw()" ${!canManage?'disabled':''}>Снять</button>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px;">${canManage ? 'На личный счёт' : 'Нужно право «Казна»'}</div>
      </div>
    </div>

    <div class="clan-shop-section-title">🧾 История операций</div>
    ${log.length ? log.map(l => `
      <div class="clan-treasury-log-row">
        <div class="clan-treasury-log-icon ${l.amount>=0?'plus':'minus'}">${l.amount>=0?'+':'−'}</div>
        <div class="clan-treasury-log-body">
          <div class="clan-treasury-log-text">${esc(l.text || (l.amount>=0 ? `${esc(l.username||'?')} пополнил казну` : `${esc(l.username||'?')} снял из казны`))}</div>
          <div class="clan-treasury-log-time">${l.time ? new Date(l.time).toLocaleString('ru-RU') : ''}</div>
        </div>
        <div class="clan-treasury-log-amount ${l.amount>=0?'plus':'minus'}">${l.amount>=0?'+':''}${Math.floor(l.amount||0)}🪙</div>
      </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:16px;font-size:11px;">Операций пока не было</div>'}`;
}

async function clanTreasuryDeposit() {
  const input = document.getElementById('clan-treasury-deposit-amount');
  const amount = Math.floor(Number(input?.value || 0));
  if (!amount || amount <= 0) { showToast('Введите сумму больше нуля', 'error'); return; }
  if (amount > currentCoins) { showToast('Недостаточно монет', 'error'); return; }
  sendJSON({action:'clan_treasury_deposit', amount});
  if (input) input.value = '';
}

async function clanTreasuryWithdraw() {
  const input = document.getElementById('clan-treasury-withdraw-amount');
  const amount = Math.floor(Number(input?.value || 0));
  if (!amount || amount <= 0) { showToast('Введите сумму больше нуля', 'error'); return; }
  const ok = await showConfirm(`Снять ${amount}🪙 из казны клана на свой личный счёт?`, { title: 'Снять из казны', icon: '💸' });
  if (!ok) return;
  sendJSON({action:'clan_treasury_withdraw', amount});
  if (input) input.value = '';
}

// ─────────────────────────────────────────────
// Рендер шапки-баннера клана
// ─────────────────────────────────────────────
function renderClanBannerHeader(clan, canManageSettings) {
    const bannerUrl = clan.banner_url || null;
    const bannerCrop = {
        x: clan.banner_crop_x ?? 0,
        y: clan.banner_crop_y ?? 0,
        w: clan.banner_crop_w ?? 1,
        h: clan.banner_crop_h ?? 1,
    };
    const bgStyle = bannerUrl ? clanBannerComputeBgStyle(bannerUrl, bannerCrop) : '';
    const tc = clan.tag_color || '#818cf8';
    const icon = clan.icon || '🏴';
    const glowColor = tc + '38';

    return `<div class="clan-banner-wrap">
        <div class="clan-banner-bg" style="${escapeHtml(bgStyle)}"></div>
        ${!bannerUrl ? `
        <div class="clan-banner-glow clan-banner-glow-1" style="background:${glowColor}"></div>
        <div class="clan-banner-glow clan-banner-glow-2" style="background:${glowColor}"></div>` : ''}
        <div class="clan-banner-overlay"></div>
        <div class="clan-banner-content">
            <div class="clan-banner-icon">${escapeHtml(icon)}</div>
            <div class="clan-banner-info">
                <div class="clan-banner-name-row">
                    <span class="clan-banner-name">${escapeHtml(clan.name || '')}</span>
                    <span class="clan-banner-tag" style="color:${tc};border-color:${tc}55;">${escapeHtml((icon ? icon + ' ' : '') + (clan.tag || ''))}</span>
                </div>
                ${clan.description ? `<div class="clan-banner-desc">${escapeHtml(clan.description)}</div>` : ''}
            </div>
            <div class="clan-banner-stats">
                <div class="clan-banner-stat">
                    <span class="clan-banner-stat-num">${escapeHtml(String((clan.members || []).length))}</span>
                    <span class="clan-banner-stat-lbl">участников</span>
                </div>
                <div class="clan-banner-stat">
                    <span class="clan-banner-stat-num">${(clan.pixels || 0).toLocaleString()}</span>
                    <span class="clan-banner-stat-lbl">пикселей</span>
                </div>
                <div class="clan-banner-stat">
                    <span class="clan-banner-stat-num">${Math.floor(clan.treasury || 0).toLocaleString()}🪙</span>
                    <span class="clan-banner-stat-lbl">казна</span>
                </div>
            </div>
        </div>
        ${canManageSettings ? `<button class="clan-banner-edit-btn" data-onclick="switchClanInnerTab('settings')">
            <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M14.5 4.5l3.5 3.5L7 19l-4 1 1-4z"/></svg>
            Изменить баннер
        </button>` : ''}
    </div>
    <div class="clan-motd-v2">
        <span class="clan-motd-v2-icon">📌</span>
        <span class="clan-motd-v2-text" id="clan-motd-text">${escapeHtml(clan.message_of_day || clan.motd || 'Добро пожаловать в клан!')}</span>
    </div>`;
}

function renderClanView(clan){
  currentClan = clan.name || '';
  clanFullData = clan;
  document.getElementById('clan-view-no-clan').style.display='none';
  document.getElementById('clan-view-in-clan').style.display='';

  const isLeader = currentUser === clan.leader;
  const myRank = clanRankOfUser(clan, currentUser);
  const canManageSettings = clanHasPermUser(clan, currentUser, 'manage_settings');
  const canEditMotd = clanHasPermUser(clan, currentUser, 'edit_motd') || canManageSettings;
  const canInvite = clanHasPermUser(clan, currentUser, 'invite');

  // ── Рендерим баннер-хедер ──
  const shellHeader = document.querySelector('.clan-shell-header');
  if (shellHeader) {
    shellHeader.innerHTML = renderClanBannerHeader(clan, canManageSettings);
  }

  // ── Обновляем старые DOM-элементы (для обратной совместимости, могут отсутствовать) ──
  const setIfExists = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setIfExists('clan-disp-name', clan.name || '');
  setIfExists('clan-disp-members', (clan.members || []).length);
  setIfExists('clan-disp-pixels', (clan.pixels || 0).toLocaleString());
  const heroIcon = document.getElementById('clan-hero-icon');
  if (heroIcon) heroIcon.textContent = clan.icon || '🏴';
  const dispTag = document.getElementById('clan-disp-tag');
  if (dispTag) {
    dispTag.textContent = (clan.icon ? clan.icon + ' ' : '') + (clan.tag||'');
    const tc0 = clan.tag_color || '#818cf8';
    dispTag.style.color = tc0;
    dispTag.style.background = tc0 + '22';
    dispTag.style.borderColor = tc0 + '55';
  }
  const dispDesc = document.getElementById('clan-disp-desc');
  if (dispDesc) dispDesc.textContent = clan.description || 'Описание не указано';

  const navMemberCount = document.getElementById('clan-nav-member-count');
  if (navMemberCount) navMemberCount.textContent = (clan.members||[]).length;

  const settingsTab = document.getElementById('clan-settings-tab');
  if (settingsTab) settingsTab.style.display = (canManageSettings || canEditMotd || isLeader) ? '' : 'none';
  const requestsTab = document.getElementById('clan-requests-tab');
  if (requestsTab) requestsTab.style.display = canInvite ? '' : 'none';
  const reqBadge = document.getElementById('clan-req-count');
  if (reqBadge) {
    const n = (clan.join_requests||[]).length;
    if (canInvite && n) { reqBadge.textContent = n; reqBadge.style.display = ''; } else reqBadge.style.display = 'none';
  }

  clanShareCursor = !!clan.share_cursor;

  // Danger zone
  const disbandBtn = document.getElementById('clan-disband-btn');
  const leaveBtn = document.getElementById('clan-leave-btn');
  if (disbandBtn && leaveBtn) {
    disbandBtn.style.display = isLeader ? '' : 'none';
    leaveBtn.style.display = '';
  }

  // Settings form (visible section toggling by permission)
  const appearanceBlock = document.getElementById('clan-settings-appearance');
  if (appearanceBlock) {
    // Инжектируем секцию баннера в начало блока настроек
    const bannerSectionId = 'clan-banner-settings-section';
    let bannerSection = document.getElementById(bannerSectionId);
    if (!bannerSection) {
      bannerSection = document.createElement('div');
      bannerSection.id = bannerSectionId;
      appearanceBlock.insertBefore(bannerSection, appearanceBlock.firstChild);
    }
    bannerSection.innerHTML = renderClanBannerSettingsBlock(clan, canManageSettings);
    appearanceBlock.style.display = canManageSettings ? '' : 'none';
  }
  const appearanceLocked = document.getElementById('clan-settings-locked-hint');
  if (appearanceLocked) appearanceLocked.style.display = canManageSettings ? 'none' : '';
  const motdBlock = document.getElementById('clan-settings-motd-block');
  if (motdBlock) motdBlock.style.display = canEditMotd ? '' : 'none';
  const leadershipSep = document.getElementById('clan-settings-leadership-sep');
  const leadershipBlock = document.getElementById('clan-settings-leadership');
  if (leadershipSep) leadershipSep.style.display = isLeader ? '' : 'none';
  if (leadershipBlock) leadershipBlock.style.display = isLeader ? '' : 'none';

  if (canManageSettings) {
    const icon = clan.icon || '🏴';
    const tagColor = clan.tag_color || '#818cf8';
    const minPx = clan.min_pixels || 0;

    const iconInput = document.getElementById('cs-icon');
    if (iconInput) iconInput.value = icon;
    const iconPreview = document.getElementById('cs-icon-preview');
    if (iconPreview) iconPreview.textContent = icon;
    buildClanIconPicker(icon);

    const colorInput = document.getElementById('cs-tag-color');
    if (colorInput) colorInput.value = tagColor;
    const colorPreview = document.getElementById('cs-tag-color-preview');
    if (colorPreview) colorPreview.style.background = tagColor;
    buildClanColorPicker(tagColor);

    const joinSel = document.getElementById('cs-join-type');
    if (joinSel) joinSel.value = clan.join_type || 'open';

    const minSlider = document.getElementById('cs-min-pixels');
    if (minSlider) { minSlider.value = minPx; }
    const minLabel = document.getElementById('cs-min-pixels-label');
    if (minLabel) minLabel.textContent = minPx === 0 ? 'без ограничений' : minPx + ' пикс.';

    const pubTog = document.getElementById('cs-public-toggle');
    if (pubTog) pubTog.classList.toggle('on', clan.is_public !== false);
    const curTog = document.getElementById('cs-cursor-toggle');
    if (curTog) curTog.classList.toggle('on', !!clan.share_cursor);

    // Синхронизируем состояние баннера
    clanBannerUrl = clan.banner_url || null;
    clanBannerCrop = {
      x: clan.banner_crop_x ?? 0, y: clan.banner_crop_y ?? 0,
      w: clan.banner_crop_w ?? 1, h: clan.banner_crop_h ?? 1,
    };
    refreshClanBannerUploadUI();
  }
  if (canEditMotd) {
    const motdInput = document.getElementById('cs-motd');
    if (motdInput) motdInput.value = clan.message_of_day || clan.motd || '';
  }
  if (isLeader && leadershipBlock) {
    const sel = document.getElementById('cs-transfer-select');
    if (sel) {
      const others = (clan.members||[]).filter(m => m !== currentUser);
      sel.innerHTML = others.length
        ? others.map(m => `<option value="${esc(m)}">${esc(m)} — ${esc(clanRankOfUser(clan,m).icon)} ${esc(clanRankOfUser(clan,m).name)}</option>`).join('')
        : `<option value="">Нет других участников</option>`;
    }
  }

  // Store for member list rendering
  _clanMembers = clan.members || [];
  _clanMemberSearch = '';
  const searchInput = document.getElementById('clan-member-search');
  if (searchInput) searchInput.value = '';
  _clanMemberPage = 1;

  renderClanOverview();
  renderClanMemberPage();
  if (document.getElementById('clan-inner-ranks')?.style.display !== 'none') renderClanRanksTab();
  if (document.getElementById('clan-inner-shop')?.style.display !== 'none') renderClanShopTab();
  if (document.getElementById('clan-inner-treasury')?.style.display !== 'none') renderClanTreasuryTab();
  const treasuryNav = document.getElementById('clan-treasury-nav-amount');
  if (treasuryNav) treasuryNav.textContent = Math.floor(clan.treasury || 0).toLocaleString();
  // Инициализируем чат v2, если ещё не сделан
  initClanChatV2();
}

// ─────────────────────────────────────────────
// Секция баннера внутри настроек клана
// ─────────────────────────────────────────────
function renderClanBannerSettingsBlock(clan, canEdit) {
  if (!canEdit) return '';

  const owned = clanOwnedShopItems(clan);
  const hasStatic = owned.includes('banner_static');
  const hasAnimated = owned.includes('banner_animated');

  // Ничего не куплено — вместо формы загрузки показываем карточку-приглашение
  // в магазин клана (загрузка баннера всё равно будет отклонена сервером,
  // так что раньше показывать саму форму было бессмысленно и запутывало).
  if (!hasStatic && !hasAnimated) {
    return `<div class="clan-settings-card" style="margin-bottom:16px;">
        <div class="clan-settings-card-title">🖼️ Баннер клана</div>
        <div class="clan-banner-locked-box">
            <div class="clan-banner-locked-icon">🔒</div>
            <div class="clan-banner-locked-text">Баннер клана открывается покупкой в «Магазине клана»: статичный — 200🪙, анимированный (GIF/WebP) — 500🪙. После покупки здесь появится загрузка.</div>
            <button class="btn btn-primary btn-sm" data-onclick="switchClanInnerTab('shop')" style="flex-shrink:0;">В магазин</button>
        </div>
    </div>`;
  }

  const bannerUrl = clan.banner_url || clanBannerUrl || null;
  const bannerCrop = clanBannerUrl ? clanBannerCrop : {
    x: clan.banner_crop_x ?? 0, y: clan.banner_crop_y ?? 0,
    w: clan.banner_crop_w ?? 1, h: clan.banner_crop_h ?? 1,
  };
  const previewStyle = bannerUrl ? clanBannerComputeBgStyle(bannerUrl, bannerCrop) : '';
  // Тип купленного товара определяет, какие файлы разрешаем выбрать
  // в системном диалоге — без анимированного тира GIF/WebP/APNG не предлагаем.
  const accept = hasAnimated ? 'image/*' : 'image/jpeg,image/png';

  const badges = `
    <span class="clan-banner-tier-pill">✓ Статичный</span>
    ${hasAnimated ? `<span class="clan-banner-tier-pill">✓ Анимированный</span>` : `<span class="clan-banner-tier-pill is-locked">🔒 Анимированный</span>`}`;

  const upsell = !hasAnimated ? `
    <div class="clan-banner-upsell-row">
        <span>🎞️ Для GIF/WebP-анимации нужен доп. товар в магазине</span>
        <button class="btn btn-secondary btn-sm" data-onclick="switchClanInnerTab('shop')">Докупить · 500🪙</button>
    </div>` : '';

  return `<div style="margin-bottom:16px;">
      <div class="clan-settings-card-title" style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        🖼️ Баннер клана
        <div class="clan-banner-settings-badges">${badges}</div>
      </div>
      <div class="clan-banner-upload-zone" id="clan-banner-upload-zone" data-onclick="document.getElementById('clan-banner-file-input').click()">
          <div class="clan-banner-upload-preview" id="clan-banner-upload-preview" style="${escapeHtml(previewStyle)};display:${bannerUrl ? '' : 'none'}"></div>
          <div class="clan-banner-upload-label">
              <div class="clan-banner-upload-label-icon">
                  <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5.5-5.5L9 16l-2.5-2.5L3 17"/></svg>
              </div>
              <span class="clan-banner-upload-label-text" id="clan-banner-upload-lbl">${bannerUrl ? 'Нажмите для замены' : (hasAnimated ? 'Загрузите баннер (JPG/PNG/GIF/WebP до 5 МБ)' : 'Загрузите баннер (JPG/PNG до 5 МБ)')}</span>
              <span class="clan-banner-upload-label-sub">Рекомендуем: 900×148 px или шире</span>
          </div>
      </div>
      <input type="file" id="clan-banner-file-input" accept="${accept}" style="display:none" data-onchange="handleClanBannerFile(event)">
      <div id="clan-banner-act-row" style="display:${bannerUrl ? 'flex' : 'none'};gap:8px;margin-top:6px;">
          <button class="btn btn-primary btn-sm" data-onclick="openClanBannerCropModal()" style="flex:1;">🎯 Позиционирование</button>
          <button class="btn btn-danger btn-sm" data-onclick="clearClanBanner()" style="flex:1;">Убрать</button>
      </div>
      ${upsell}
      <p style="font-size:10px;color:var(--text3);margin-top:6px;">Баннер виден всем участникам в шапке страницы клана</p>
  </div>`;
}

// ─────────────────────────────────────────────
// Баннер: crop-хелперы и логика загрузки/редактирования
// ─────────────────────────────────────────────
function getClanBannerAspect() { return 916 / 148; }

function clanBannerComputeDefaultCrop(imgAspect, targetAspect) {
  if (!imgAspect || !isFinite(imgAspect)) return { x: 0, y: 0, w: 1, h: 1 };
  if (imgAspect > targetAspect) {
    const w = targetAspect / imgAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  } else {
    const h = imgAspect / targetAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
}

function clanBannerComputeBgStyle(url, crop) {
  if (!url) return '';
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  let { x = 0, y = 0, w = 1, h = 1 } = c;
  w = Math.min(1, Math.max(0.02, w));
  h = Math.min(1, Math.max(0.02, h));
  x = Math.min(1 - w, Math.max(0, x));
  y = Math.min(1 - h, Math.max(0, y));
  const sizeX = (100 / w).toFixed(3);
  const sizeY = (100 / h).toFixed(3);
  const posX = w >= 0.999 ? 50 : (x / (1 - w) * 100).toFixed(3);
  const posY = h >= 0.999 ? 50 : (y / (1 - h) * 100).toFixed(3);
  const proxied = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(url) : url;
  return `background-image:url('${escapeHtml(proxied)}');background-repeat:no-repeat;background-size:${sizeX}% ${sizeY}%;background-position:${posX}% ${posY}%`;
}

// Надёжный вариант кропа баннера без риска растягивания: рендерит
// настоящий <img> с object-fit:cover (браузер гарантированно сохраняет
// пропорции картинки, просто обрезая лишнее) вместо CSS background-size
// с ручным расчётом процентов. Используем там, где пропорция контейнера
// заранее неизвестна/отличается от той, под которую подгонялся кроп
// (тонкие строки списка кланов, лидерборд).
function clanBannerObjectPosition(crop) {
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  let { x = 0, y = 0, w = 1, h = 1 } = c;
  w = Math.min(1, Math.max(0.02, w));
  h = Math.min(1, Math.max(0.02, h));
  x = Math.min(1 - w, Math.max(0, x));
  y = Math.min(1 - h, Math.max(0, y));
  const cx = ((x + w / 2) * 100).toFixed(2);
  const cy = ((y + h / 2) * 100).toFixed(2);
  return `${cx}% ${cy}%`;
}

function clanBannerImgTag(url, crop, extraClass) {
  if (!url) return '';
  const proxied = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(url) : url;
  const pos = clanBannerObjectPosition(crop);
  return `<img class="clan-banner-cover-img${extraClass ? ' ' + extraClass : ''}" src="${escapeHtml(proxied)}" style="object-position:${pos}" alt="" loading="lazy">`;
}

function refreshClanBannerUploadUI() {
  const zone = document.getElementById('clan-banner-upload-zone');
  if (!zone) return;
  const preview = document.getElementById('clan-banner-upload-preview');
  const lbl = document.getElementById('clan-banner-upload-lbl');
  if (preview) {
    if (clanBannerUrl) {
      preview.style.cssText = clanBannerComputeBgStyle(clanBannerUrl, clanBannerCrop);
      preview.style.display = '';
    } else {
      preview.style.display = 'none';
    }
  }
  if (lbl) {
    if (clanBannerUploadPending) lbl.textContent = 'Загрузка...';
    else if (clanBannerUrl) lbl.textContent = 'Нажмите для замены';
    else lbl.textContent = 'Загрузите баннер (JPG/PNG до 5 МБ)';
  }
  const actRow = document.getElementById('clan-banner-act-row');
  if (actRow) actRow.style.display = clanBannerUrl ? 'flex' : 'none';
}

function handleClanBannerFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Только изображения!', 'error'); return; }
  if (file.size > CLAN_BANNER_MAX_MB * 1024 * 1024) {
    showToast(`Файл слишком большой! Максимум ${CLAN_BANNER_MAX_MB} МБ`, 'error'); return;
  }
  // Проверяем купленный тир ДО загрузки на Cloudinary — иначе пользователь
  // видит "успешную" загрузку, а при сохранении настроек сервер её тихо
  // отклоняет (баннер остаётся старым без понятной причины).
  const owned = clanOwnedShopItems(clanFullData);
  const hasStatic = owned.includes('banner_static');
  const hasAnimated = owned.includes('banner_animated');
  if (!hasStatic && !hasAnimated) {
    showToast('Баннер клана нужно сначала купить в магазине клана', 'error'); return;
  }
  if (!hasAnimated && isAnimatedBannerFile(file)) {
    showToast('Анимированные баннеры (GIF/WebP) нужно докупить в магазине клана за 500🪙', 'error'); return;
  }
  const reader = new FileReader();
  reader.onload = async ev => {
    clanBannerUploadPending = true;
    clanBannerImgNaturalAspect = null;
    showToast('Загрузка баннера...', 'info');
    refreshClanBannerUploadUI();
    try {
      const res = await fetch(getApiUrl() + '/upload-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: ev.target.result, name: 'clan_banner_' + currentClan, username: currentUser }),
      });
      const data = await res.json();
      if (data.url) {
        clanBannerUrl = data.url;
        const probe = new Image();
        probe.onload = () => {
          clanBannerImgNaturalAspect = probe.naturalWidth / probe.naturalHeight;
          clanBannerCrop = clanBannerComputeDefaultCrop(clanBannerImgNaturalAspect, getClanBannerAspect());
          clanBannerUploadPending = false;
          refreshClanBannerUploadUI();
        };
        probe.src = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(data.url) : data.url;
        showToast(data.fallback ? 'Баннер загружен (без CDN)' : '🖼️ Баннер загружен! Сохраните настройки.', data.fallback ? 'info' : 'success');
      } else {
        showToast('Ошибка загрузки: ' + (data.error || ''), 'error');
        clanBannerUploadPending = false;
        refreshClanBannerUploadUI();
      }
    } catch (e) {
      showToast('Ошибка сети', 'error');
      clanBannerUploadPending = false;
      refreshClanBannerUploadUI();
    }
  };
  reader.readAsDataURL(file);
}

function clearClanBanner() {
  clanBannerUrl = null;
  clanBannerCrop = { x: 0, y: 0, w: 1, h: 1 };
  clanBannerImgNaturalAspect = null;
  refreshClanBannerUploadUI();
  showToast('Баннер убран. Нажмите «Сохранить»', 'info');
}

function openClanBannerCropModal() {
  if (!clanBannerUrl) return;
  bcmCropSnapshot = { ...clanBannerCrop };
  const img = document.getElementById('bcm-img');
  if (!img) return;
  const onReady = () => {
    clanBannerImgNaturalAspect = img.naturalWidth / img.naturalHeight;
    if (clanBannerCrop.w >= 0.999 && clanBannerCrop.h >= 0.999) {
      clanBannerCrop = clanBannerComputeDefaultCrop(clanBannerImgNaturalAspect, getClanBannerAspect());
    }
    bcmLayoutCropBox();
  };
  img.onload = onReady;
  img.src = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(clanBannerUrl) : clanBannerUrl;
  if (img.complete && img.naturalWidth) onReady();
  initBcmListeners();
  document.getElementById('bcm-backdrop')?.classList.add('show');
  document.getElementById('bcm-dialog')?.classList.add('show');
}

function closeClanBannerCropModal(apply) {
  document.getElementById('bcm-backdrop')?.classList.remove('show');
  document.getElementById('bcm-dialog')?.classList.remove('show');
  bcmDragMode = null;
  if (!apply && bcmCropSnapshot) clanBannerCrop = bcmCropSnapshot;
  bcmCropSnapshot = null;
  refreshClanBannerUploadUI();
}

function resetClanBannerCrop() {
  const img = document.getElementById('bcm-img');
  const aspect = (img && img.naturalWidth) ? img.naturalWidth / img.naturalHeight : clanBannerImgNaturalAspect;
  clanBannerCrop = clanBannerComputeDefaultCrop(aspect, getClanBannerAspect());
  bcmLayoutCropBox();
}

function bcmGetImgBox() {
  const stage = document.getElementById('bcm-stage');
  const img = document.getElementById('bcm-img');
  if (!stage || !img) return { left: 0, top: 0, width: 1, height: 1 };
  const sr = stage.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  return { left: ir.left - sr.left, top: ir.top - sr.top, width: ir.width, height: ir.height };
}

function bcmLayoutCropBox() {
  const imgBox = bcmGetImgBox();
  const box = document.getElementById('bcm-crop-box');
  if (!box || imgBox.width < 1) return;
  const c = clanBannerCrop;
  box.style.left = (imgBox.left + c.x * imgBox.width) + 'px';
  box.style.top = (imgBox.top + c.y * imgBox.height) + 'px';
  box.style.width = (c.w * imgBox.width) + 'px';
  box.style.height = (c.h * imgBox.height) + 'px';
}

function _bcmPointerDown(mode, ev) {
  if (ev.cancelable) ev.preventDefault();
  ev.stopPropagation();
  bcmDragMode = mode;
  bcmDragStart = { x: ev.clientX, y: ev.clientY };
  bcmBoxStart = { x: clanBannerCrop.x, y: clanBannerCrop.y, w: clanBannerCrop.w, h: clanBannerCrop.h, imgBox: bcmGetImgBox() };
}

function initBcmListeners() {
  const cropBox = document.getElementById('bcm-crop-box');
  const handle = document.getElementById('bcm-handle');
  if (!cropBox || cropBox.dataset.bcmOk) return;
  cropBox.dataset.bcmOk = '1';
  cropBox.addEventListener('pointerdown', ev => {
    if (ev.target.id === 'bcm-handle') return;
    _bcmPointerDown('move', ev);
  });
  if (handle) handle.addEventListener('pointerdown', ev => _bcmPointerDown('resize', ev));
}

document.addEventListener('pointermove', ev => {
  if (!bcmDragMode) return;
  const imgBox = bcmBoxStart.imgBox;
  if (!imgBox || imgBox.width < 5) return;
  const dxFrac = (ev.clientX - bcmDragStart.x) / imgBox.width;
  const dyFrac = (ev.clientY - bcmDragStart.y) / imgBox.height;
  if (bcmDragMode === 'move') {
    clanBannerCrop.x = Math.max(0, Math.min(1 - bcmBoxStart.w, bcmBoxStart.x + dxFrac));
    clanBannerCrop.y = Math.max(0, Math.min(1 - bcmBoxStart.h, bcmBoxStart.y + dyFrac));
  } else {
    const aspect = bcmBoxStart.w / bcmBoxStart.h;
    let w = Math.abs(dxFrac) > Math.abs(dyFrac) ? bcmBoxStart.w + dxFrac : (bcmBoxStart.h + dyFrac) * aspect;
    w = Math.max(0.05, Math.min(1, w));
    let h = w / aspect;
    if (h > 1) { h = 1; w = h * aspect; }
    if (bcmBoxStart.x + w > 1) { w = 1 - bcmBoxStart.x; h = w / aspect; }
    if (bcmBoxStart.y + h > 1) { h = 1 - bcmBoxStart.y; w = h * aspect; }
    clanBannerCrop.w = w; clanBannerCrop.h = h;
  }
  bcmLayoutCropBox();
});

document.addEventListener('pointerup', () => { if (bcmDragMode) bcmDragMode = null; });

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initBcmListeners, 300);
  document.getElementById('bcm-backdrop')?.addEventListener('click', () => closeClanBannerCropModal(false));
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && document.getElementById('bcm-dialog')?.classList.contains('show')) {
      closeClanBannerCropModal(false);
    }
  });
  window.addEventListener('resize', () => {
    if (document.getElementById('bcm-dialog')?.classList.contains('show')) bcmLayoutCropBox();
  });
});

function renderClanOverview() {
  const clan = clanFullData;
  const wrap = document.getElementById('clan-inner-overview');
  if (!wrap || !clan) return;

  const leaderEl = document.getElementById('clan-overview-leader');
  if (leaderEl) leaderEl.innerHTML = `<div class="clan-overview-person">👑 <strong>${esc(clan.leader||'—')}</strong></div><div class="clan-overview-sub">Основатель и полноправный управляющий кланом</div>`;

  const myRank = clanRankOfUser(clan, currentUser);
  const myRankEl = document.getElementById('clan-overview-myrank');
  if (myRankEl) myRankEl.innerHTML = `
    <div class="clan-overview-person"><span class="clan-rank-dot" style="background:${myRank.color}"></span> ${myRank.icon} <strong>${esc(myRank.name)}</strong></div>
    <div class="clan-perm-row">${clanPermBadges(myRank)}</div>`;

  const topWrap = document.getElementById('clan-overview-top-members');
  if (topWrap) {
    const sorted = (clan.members||[]).slice().sort((a,b)=>clanPriorityOfUser(clan,b)-clanPriorityOfUser(clan,a)).slice(0,5);
    topWrap.innerHTML = sorted.map(m => {
      const r = clanRankOfUser(clan, m);
      return `<div class="clan-mini-member"><span class="clan-rank-dot" style="background:${r.color}"></span>${r.icon} <span>${esc(m)}</span><span class="clan-mini-member-rank">${esc(r.name)}</span></div>`;
    }).join('') || '<div class="clan-empty-state">Пока никого нет</div>';
  }

  const joinEl = document.getElementById('clan-overview-jointype');
  if (joinEl) {
    const jt = clan.join_type || 'open';
    const jtLabel = jt === 'open' ? '🟢 Открытый — вступает любой' : jt === 'request' ? '🟡 По заявкам — одобряет лидерство' : '🔴 Закрытый — набор не идёт';
    const minPx = clan.min_pixels || 0;
    joinEl.innerHTML = `<div>${jtLabel}</div><div class="clan-overview-sub">${minPx ? `Минимум ${minPx.toLocaleString()} пикселей для вступления` : 'Без ограничения по пикселям'}</div>`;
  }

  const stencilEl = document.getElementById('clan-overview-stencil');
  if (stencilEl) {
    if (clan.shared_stencil) stencilEl.innerHTML = `<div>🖼️ Делится: <strong>${esc(clan.shared_stencil.owner)}</strong></div><div class="clan-overview-sub">Открой панель «Трафарет», чтобы включить его</div>`;
    else stencilEl.innerHTML = `<div class="clan-overview-sub">Сейчас никто не делится общим трафаретом клана</div>`;
  }
}

// ── CLAN MEMBER PAGINATION ──
let _clanMembers = [], _clanMemberPage = 1, _clanMemberSearch = '';
const CLAN_PAGE_SIZE = 10;

function renderClanMemberPage() {
  const ml = document.getElementById('clan-member-list');
  const pg = document.getElementById('clan-member-pagination');
  if (!ml || !clanFullData) return;
  const clan = clanFullData;

  const searchInput = document.getElementById('clan-member-search');
  _clanMemberSearch = (searchInput?.value || '').trim().toLowerCase();

  let list = _clanMembers.slice().sort((a,b)=>clanPriorityOfUser(clan,b)-clanPriorityOfUser(clan,a) || a.localeCompare(b));
  if (_clanMemberSearch) list = list.filter(m => m.toLowerCase().includes(_clanMemberSearch));

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / CLAN_PAGE_SIZE));
  _clanMemberPage = Math.max(1, Math.min(_clanMemberPage, totalPages));
  const start = (_clanMemberPage - 1) * CLAN_PAGE_SIZE;
  const page = list.slice(start, start + CLAN_PAGE_SIZE);

  const myPriority = clanPriorityOfUser(clan, currentUser);
  const isLeader = currentUser === clan.leader;
  const iCanManageRanks = clanHasPermUser(clan, currentUser, 'manage_ranks');
  const iCanKick = clanHasPermUser(clan, currentUser, 'kick');
  const ranks = clanGetRanks(clan);
  const assignableRanks = ranks.filter(r => r.id !== 'leader' && r.priority < myPriority);

  if (!page.length) {
    ml.innerHTML = `<div class="clan-empty-state">${_clanMemberSearch ? '🔍 Никого не найдено' : '👥 Пока нет участников'}</div>`;
  } else {
    ml.innerHTML = page.map(m => {
      const isLdr = m === clan.leader;
      const rank = clanRankOfUser(clan, m);
      const targetPriority = clanPriorityOfUser(clan, m);
      const isMe = m === currentUser;
      const canChangeRank = !isMe && !isLdr && iCanManageRanks && myPriority > targetPriority;
      const canKick = !isMe && !isLdr && iCanKick && myPriority > targetPriority;
      const canTransfer = isLeader && !isMe && !isLdr;

      const rankSelect = canChangeRank ? `
        <select class="member-rank-select" data-onchange="assignClanMemberRank('${esc(m)}', this.value)" title="Изменить звание">
          ${assignableRanks.map(r => `<option value="${esc(r.id)}" ${r.id===rank.id?'selected':''}>${esc(r.icon)} ${esc(r.name)}</option>`).join('')}
        </select>` : `<span class="member-rank-badge" style="color:${rank.color};background:${rank.color}1e;border-color:${rank.color}55;">${esc(rank.icon)} ${esc(rank.name)}</span>`;

      return `<div class="member-row${isLdr?' member-row-is-leader':''}">
        <div class="member-row-info">
          ${cpAvatarHTML(m, 'sm')}
          ${isLdr ? '<span class="member-row-crown" title="Лидер">👑</span>' : ''}
          <span class="member-row-name${isLdr ? ' member-row-leader' : ''}">${esc(m)}${isMe?' <span class="member-row-you">(вы)</span>':''}</span>
        </div>
        <div class="member-row-actions">
          ${rankSelect}
          ${canTransfer ? `<button class="member-action-btn member-transfer-btn" data-onclick="transferLeadership('${esc(m)}')" title="Передать лидерство">👑</button>` : ''}
          ${canKick ? `<button class="member-kick-btn" data-onclick="kickClanMember('${esc(m)}')" title="Исключить">
            <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
          </button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  if (!pg) return;
  if (totalPages <= 1) { pg.style.display = 'none'; return; }
  pg.style.display = 'flex';
  pg.innerHTML = `
    <button class="page-btn" data-onclick="_clanMemberPage--;renderClanMemberPage()" ${_clanMemberPage<=1?'disabled':''}>&#8249; Пред</button>
    <span class="page-info">${_clanMemberPage} / ${totalPages}</span>
    <button class="page-btn" data-onclick="_clanMemberPage++;renderClanMemberPage()" ${_clanMemberPage>=totalPages?'disabled':''}>След &#8250;</button>`;
}

function assignClanMemberRank(username, rankId) {
  sendJSON({action:'clan_rank_assign', username, rankId});
}

async function kickClanMember(username) {
  const ok = await showConfirm(`Исключить ${username} из клана?`, { title: 'Исключить участника', icon: '👋', danger: true, confirmText: 'Исключить' });
  if (!ok) return;
  sendJSON({action:'clan_kick', username});
}

// ══════════════════════════════════════════════════
//  CLAN RANKS TAB — управление званиями
// ══════════════════════════════════════════════════
function renderClanRanksTab() {
  const clan = clanFullData;
  const list = document.getElementById('clan-ranks-list');
  if (!list || !clan) return;

  const myPriority = clanPriorityOfUser(clan, currentUser);
  const iCanManage = clanHasPermUser(clan, currentUser, 'manage_ranks');
  const addBtn = document.getElementById('clan-rank-add-btn');
  if (addBtn) addBtn.style.display = iCanManage ? '' : 'none';

  const ranks = clanGetRanks(clan).slice().sort((a,b)=>b.priority-a.priority);
  const counts = {};
  (clan.members||[]).forEach(m => { const r = clanRankOfUser(clan, m); counts[r.id] = (counts[r.id]||0)+1; });
  if (clan.leader) counts['leader'] = 1;

  list.innerHTML = ranks.map(r => {
    const canEdit = iCanManage && (r.id === 'leader' ? false : r.priority < myPriority || r.id === 'member');
    const canDelete = iCanManage && !r.isDefault && r.priority < myPriority;
    const memberCount = counts[r.id] || 0;
    return `<div class="clan-rank-card" style="--rank-color:${r.color}">
      <div class="clan-rank-card-icon" style="background:${r.color}22;border-color:${r.color}55;color:${r.color}">${esc(r.icon)}</div>
      <div class="clan-rank-card-body">
        <div class="clan-rank-card-title">${esc(r.name)} ${r.isDefault ? `<span class="clan-rank-sys-tag">${r.id==='leader'?'системное':'базовое'}</span>` : ''}</div>
        <div class="clan-rank-card-meta">${memberCount} ${memberCount===1?'участник':'участников'} · приоритет ${r.priority}</div>
        <div class="clan-perm-row">${clanPermBadges(r)}</div>
      </div>
      <div class="clan-rank-card-actions">
        ${canEdit ? `<button class="member-action-btn" data-onclick="openClanRankEditor('${esc(r.id)}')" title="Редактировать">✏️</button>` : ''}
        ${canDelete ? `<button class="member-action-btn member-kick-btn" data-onclick="deleteClanRank('${esc(r.id)}')" title="Удалить">🗑️</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openClanRankEditor(rankId) {
  clanRanksEditingId = rankId;
  const clan = clanFullData;
  const editor = document.getElementById('clan-rank-editor');
  if (!editor || !clan) return;

  const isNew = !rankId;
  const rank = isNew ? { id:null, name:'', icon:'⭐', color:'#818cf8', priority: Math.max(1, clanPriorityOfUser(clan, currentUser) - 1), permissions:{} } : clanGetRanks(clan).find(r=>r.id===rankId);
  if (!rank) return;
  const isSystem = rank.id === 'leader' || rank.id === 'member';
  const myPriority = clanPriorityOfUser(clan, currentUser);
  const maxPriority = Math.max(1, myPriority - 1);

  editor.style.display = '';
  editor.innerHTML = `
    <div class="clan-rank-editor-header">${isNew ? '✨ Новое звание' : `✏️ Редактирование: ${esc(rank.name)}`}</div>
    <div class="clan-rank-editor-row">
      <div class="form-group" style="flex:2;min-width:140px;">
        <label class="form-label">Название</label>
        <input class="form-input" id="cre-name" maxlength="20" value="${esc(rank.name)}" placeholder="Например: Модератор">
      </div>
      <div class="form-group" style="flex:1;min-width:90px;">
        <label class="form-label">Значок</label>
        <div id="cre-icon-preview" class="clan-rank-icon-preview">${esc(rank.icon)}</div>
      </div>
      <div class="form-group" style="flex:1;min-width:90px;">
        <label class="form-label">Цвет</label>
        <div id="cre-color-preview" class="clan-rank-color-preview" style="background:${rank.color}"></div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Значок звания</label>
      <div id="cre-icon-grid" class="clan-icon-grid"></div>
    </div>
    <div class="form-group">
      <label class="form-label">Цвет звания</label>
      <div id="cre-color-grid" class="clan-color-grid"></div>
    </div>
    ${!isSystem ? `
    <div class="form-group">
      <label class="form-label">Приоритет: <span id="cre-priority-val" style="color:var(--accent2);font-family:'Space Mono',monospace;">${rank.priority}</span> <span style="color:var(--text3);font-weight:400;">(чем выше — тем старше звание)</span></label>
      <input type="range" class="admin-range" id="cre-priority" min="1" max="${maxPriority}" step="1" value="${Math.min(rank.priority||1, maxPriority)}"
        data-oninput="document.getElementById('cre-priority-val').textContent=this.value" style="width:100%;margin-top:6px;">
    </div>` : `<div class="clan-rank-sys-hint">${rank.id==='leader' ? '👑 Лидер всегда обладает всеми правами — это нельзя изменить.' : '⚔️ Базовое звание получают все новые участники. У него нет приоритета — оно всегда самое младшее.'}</div>`}
    <div class="form-group">
      <label class="form-label">Права звания</label>
      <div class="clan-perm-grid" id="cre-perms">
        ${CLAN_PERMISSIONS.map(p => `
          <label class="clan-perm-toggle-row ${isSystem && rank.id==='leader' ? 'disabled' : ''}">
            <input type="checkbox" data-perm="${p.key}" ${rank.permissions && rank.permissions[p.key] ? 'checked' : ''} ${rank.id==='leader' ? 'disabled checked' : ''}>
            <span class="clan-perm-toggle-icon">${p.icon}</span>
            <span class="clan-perm-toggle-text"><strong>${esc(p.name)}</strong><small>${esc(p.desc)}</small></span>
          </label>`).join('')}
      </div>
    </div>
    <div class="clan-rank-editor-footer">
      <button class="btn btn-secondary btn-sm" data-onclick="closeClanRankEditor()">Отмена</button>
      <button class="btn btn-primary btn-sm" data-onclick="saveClanRankEditor(${isNew ? 'null' : `'${esc(rank.id)}'`})">${isNew ? 'Создать звание' : 'Сохранить'}</button>
    </div>
  `;

  // icon grid
  const iconGrid = document.getElementById('cre-icon-grid');
  let selIcon = rank.icon;
  CLAN_RANK_ICONS.forEach(em => {
    const d = document.createElement('div');
    d.className = 'av-opt' + (em === selIcon ? ' selected' : '');
    d.textContent = em;
    d.onclick = () => {
      selIcon = em;
      document.getElementById('cre-icon-preview').textContent = em;
      iconGrid.querySelectorAll('.av-opt').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
    };
    iconGrid.appendChild(d);
  });
  editor.dataset.icon = selIcon;
  iconGrid.addEventListener('click', () => { editor.dataset.icon = selIcon; });

  // color grid
  const colorGrid = document.getElementById('cre-color-grid');
  let selColor = rank.color;
  CLAN_RANK_COLORS.forEach(c => {
    const d = document.createElement('div');
    d.className = 'color-cell' + (c === selColor ? ' selected' : '');
    d.style.background = c;
    d.onclick = () => {
      selColor = c;
      document.getElementById('cre-color-preview').style.background = c;
      colorGrid.querySelectorAll('.color-cell').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
    };
    colorGrid.appendChild(d);
  });

  editor._getIcon = () => selIcon;
  editor._getColor = () => selColor;
  editor.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function closeClanRankEditor() {
  clanRanksEditingId = null;
  const editor = document.getElementById('clan-rank-editor');
  if (editor) { editor.style.display = 'none'; editor.innerHTML = ''; }
}

function saveClanRankEditor(rankId) {
  const editor = document.getElementById('clan-rank-editor');
  if (!editor) return;
  const name = document.getElementById('cre-name').value.trim();
  if (!name) { showToast('Введите название звания', 'error'); return; }
  const icon = editor._getIcon ? editor._getIcon() : '⭐';
  const color = editor._getColor ? editor._getColor() : '#818cf8';
  const priorityEl = document.getElementById('cre-priority');
  const priority = priorityEl ? parseInt(priorityEl.value) : undefined;
  const permissions = {};
  editor.querySelectorAll('#cre-perms input[type=checkbox]').forEach(cb => { permissions[cb.dataset.perm] = cb.checked; });

  if (!rankId) {
    sendJSON({action:'clan_rank_create', name, icon, color, priority, permissions});
  } else {
    sendJSON({action:'clan_rank_update', id: rankId, name, icon, color, priority, permissions});
  }
  closeClanRankEditor();
}

async function deleteClanRank(rankId) {
  const ok = await showConfirm('Удалить звание? Все участники с этим званием станут «Участник».', { title: 'Удалить звание', icon: '🗑️', danger: true, confirmText: 'Удалить' });
  if (!ok) return;
  sendJSON({action:'clan_rank_delete', id: rankId});
}

function renderNoClanView(){
  currentClan='';
  clanFullData = null;
  document.getElementById('clan-view-no-clan').style.display='';
  document.getElementById('clan-view-in-clan').style.display='none';
  sendJSON({action:'clan_list'});
}

function renderClanBrowseList(clans){
  const c=document.getElementById('clan-browse-list');
  if (!clans.length){c.innerHTML='<div class="clan-empty-state">🏴 Кланов пока нет — создай первый!</div>';return;}
  c.innerHTML=clans.map(cl=>{
    const tc = cl.tag_color || '#818cf8';
    const icon = cl.icon || '🏴';
    const bannerUrl = cl.banner_url || null;
    const bannerCrop = { x: cl.banner_crop_x??0, y: cl.banner_crop_y??0, w: cl.banner_crop_w??1, h: cl.banner_crop_h??1 };
    const glowColor = tc + '38';
    const js = clanBrowseJoinState(cl);
    const btnClass = 'clan-hcard-join' + (js.canJoin ? (js.label==='Запрос' ? ' is-request' : '') : ' is-disabled');
    const btnAction = js.canJoin ? `joinClan('${esc(cl.name).replace(/'/g,"\\'")}')` : '';
    return `
    <div class="clan-hcard">
      ${bannerUrl ? clanBannerImgTag(bannerUrl, bannerCrop) : ''}
      ${!bannerUrl ? `
      <div class="clan-hcard-glow clan-hcard-glow-1" style="background:${glowColor}"></div>
      <div class="clan-hcard-glow clan-hcard-glow-2" style="background:${glowColor}"></div>` : ''}
      <div class="clan-hcard-overlay"></div>
      <div class="clan-hcard-row">
        <div class="clan-hcard-icon">${esc(icon)}</div>
        <div class="clan-hcard-titles">
          <div class="clan-hcard-name-row">
            <span class="clan-hcard-name">${esc(cl.name)}</span>
            <span class="clan-hcard-tag" style="color:${tc};background:${tc}22;border-color:${tc}55">${esc((icon?icon+' ':'')+(cl.tag||''))}</span>
          </div>
          ${cl.description?`<div class="clan-hcard-desc">${esc(cl.description)}</div>`:''}
        </div>
        <div class="clan-hcard-meta">
          <span class="clan-hcard-meta-item"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3.3 2.7-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M16 8.3a2.6 2.6 0 1 1 0 5.1"/><path d="M16 14c2.4 0 4.5 1.8 4.5 5"/></svg>${cl.members}/${cl.member_limit || CLAN_BASE_MEMBER_LIMIT}</span>
          <span class="clan-hcard-meta-item"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5.5-5.5L9 16l-2.5-2.5L3 17"/></svg>${(cl.pixels||0).toLocaleString()}</span>
          ${cl.join_type==='request'?'<span class="clan-hcard-meta-item clan-hcard-jt">📝 По заявке</span>':''}
          ${cl.join_type==='closed'?'<span class="clan-hcard-meta-item clan-hcard-jt">🔒 Закрыт</span>':''}
          ${cl.min_pixels?`<span class="clan-hcard-meta-item clan-hcard-jt">⭐ от ${cl.min_pixels.toLocaleString()} px</span>`:''}
        </div>
        <button class="${btnClass}" ${js.canJoin?`data-onclick="${btnAction}"`:'disabled'} ${js.reason?`title="${esc(js.reason)}"`:''}>
          ${js.label==='Запрос' ? '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="13" height="13"><path d="M12 5v14"/><path d="M5 12l7-7 7 7"/></svg>' : ''}
          ${esc(js.label)}
        </button>
      </div>
    </div>`;
  }).join('');
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
        ${owned ? '<span class="shop-owned"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5l4.5 4.5L19 7"/></svg> Куплено</span>' : `<span class="shop-price">🪙 ${item.cost}</span>`}
      </div>
      <div class="shop-item-desc">${item.desc}</div>
      ${!owned && reqMet ? `<button class="btn btn-primary btn-sm" data-onclick="buyItem('${item.id}')">Купить (${item.cost} 🪙)</button>` : ''}
      ${!owned && !reqMet ? `<div style="font-size:10px;color:var(--text3);"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg> Требуется: ${item.requires}</div>` : ''}
    </div>`;
  });
  html += '</div>';

  if (isVip || isAdmin) {
    html += `<div class="shop-section"><div class="shop-section-title"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6L12 3z"/></svg> VIP Расходники</div>`;
    SHOP_ITEMS_VIP.forEach(item => {
      const count = getItemCount(item.id);
      html += `<div class="shop-item vip-item">
        <div class="shop-header">
          <div class="shop-item-title">${item.icon} ${item.title}</div>
          <span class="shop-price">🪙 ${item.cost}</span>
        </div>
        <div class="shop-item-desc">${item.desc}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-vip btn-sm" data-onclick="buyItem('${item.id}')">Купить (${item.cost} 🪙)</button>
          ${count > 0 ? `<button class="btn btn-secondary btn-sm" data-onclick="activateItem('${item.id}')"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg> Использовать (${count})</button>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
  } else {
    html += `<div class="shop-section"><div class="shop-section-title"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6L12 3z"/></svg> VIP Расходники</div>
      <div class="shop-item" style="opacity:.5">
        <div class="shop-lock"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div><div class="shop-item-title">Расходники для VIP</div>
        <div class="shop-item-desc">Получите VIP-статус чтобы разблокировать взрывчатку, ластики, зеркала и многое другое!</div>
      </div></div>`;
  }

  if (isAdmin) {
    html += `<div class="shop-section"><div class="shop-section-title"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5l8 3.5v6c0 5-8 9.5-8 9.5S4 16.5 4 11.5v-6l8-3.5z"/></svg> Админ-читы</div>`;
    SHOP_ITEMS_ADMIN.forEach(item => {
      html += `<div class="shop-item admin-item">
        <div class="shop-header"><div class="shop-item-title">${item.icon} ${item.title}</div><span style="font-size:10px;color:var(--text3);">БЕСПЛАТНО</span></div>
        <div class="shop-item-desc">${item.desc}</div>
        <button class="btn btn-primary btn-sm" data-onclick="useAdminShopItem('${item.id}')">Применить</button>
      </div>`;
    });
    html += '</div>';
  }
  body.innerHTML = html;
}

function getItemCount(itemId) { return Array.isArray(purchasedItems) ? purchasedItems.filter(i => i === itemId).length : 0; }
function buyItem(itemId) { sendJSON({action:'shop_buy', itemId: itemId}); }

async function useAdminShopItem(itemId) {
  if (itemId === 'admin_nuke') {
    const ok = await showConfirm('Очистить весь холст?', { title: 'Ядерная кнопка', icon: '☢️', danger: true, confirmText: 'Очистить' });
    if (!ok) return;
    sendJSON({action:'admin_cmd', cmd:'clear_canvas'});
  } else if (itemId === 'admin_rainbow') {
    sendJSON({action:'admin_cmd', cmd:'rainbow_storm'});
  }
}

function showLeaderboard() {
  leaderboardOpen = !leaderboardOpen;
  document.getElementById('leaderboard-panel').classList.toggle('show', leaderboardOpen);
  document.getElementById('btn-leaderboard')?.classList.toggle('active', leaderboardOpen);
  if (leaderboardOpen) sendJSON({action:'get_leaderboard'});
}
function hideLeaderboard() {
  leaderboardOpen = false;
  document.getElementById('leaderboard-panel').classList.remove('show');
  document.getElementById('btn-leaderboard')?.classList.remove('active');
}

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
      <div class="lb-rank ${i===0?'lb-rank-1':i===1?'lb-rank-2':i===2?'lb-rank-3':'lb-rank-n'}">${i<3?['<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>','<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>','<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>'][i]:i+1}</div>
      ${cpAvatarHTML(u.username, 'sm', {emoji: u.emoji, rank: u.rank, online: u.online})}
      <div class="lb-name">${esc(u.username)}</div>
      <div class="lb-capsule"><div class="lb-pixels">${(u.pixels||0).toLocaleString()} px</div></div>
    </div>`).join('');
}

function renderLeaderboardClans(data){
  const c=document.getElementById('lb-clans-list');
  if (!data.length){c.innerHTML='<div style="color:var(--text3);text-align:center;padding:20px;">Кланов пока нет</div>';return;}
  c.innerHTML=data.map((cl,i)=>{
    const bannerUrl = cl.banner_url || null;
    const bannerCrop = { x: cl.banner_crop_x??0, y: cl.banner_crop_y??0, w: cl.banner_crop_w??1, h: cl.banner_crop_h??1 };
    return `
    <div class="lb-row${bannerUrl?' has-banner':''}" style="animation:float-in .3s ease ${i*0.04}s both">
      ${bannerUrl ? clanBannerImgTag(bannerUrl, bannerCrop) : ''}
      ${bannerUrl ? '<div class="lb-row-banner-overlay"></div>' : ''}
      <div class="lb-rank ${i===0?'lb-rank-1':i===1?'lb-rank-2':i===2?'lb-rank-3':'lb-rank-n'}">${i<3?['<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>','<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>','<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>'][i]:i+1}</div>
      <span class="clan-tag" style="color:${cl.tag_color||'#818cf8'};background:${(cl.tag_color||'#818cf8')+'22'};border-color:${(cl.tag_color||'#818cf8')+'55'}">${(cl.icon?cl.icon+' ':'')+esc(cl.tag||'')}</span>
      <div class="lb-name">${esc(cl.name)}</div>
      <div class="lb-capsule"><div class="lb-members"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3.3 2.7-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M16 8.3a2.6 2.6 0 1 1 0 5.1"/><path d="M16 14c2.4 0 4.5 1.8 4.5 5"/></svg>${cl.members}</div></div>
      <div class="lb-capsule"><div class="lb-pixels">${(cl.pixels||0).toLocaleString()} px</div></div>
    </div>`;
  }).join('');
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
    let sx = ir.x * camZoom + off.x; 
    let sy = ir.y * camZoom + off.y;
    let sw = ir.w * camZoom; 
    let sh = ir.h * camZoom;
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
        <button class="action-btn ab-role" data-onclick="adminCmd('set_role','${esc(u.username)}','${u.role==='admin'?'user':'admin'}')">${u.role==='admin'?'Снять админа':'Дать админа'}</button>
        <button class="action-btn ab-vip" data-onclick="adminCmd('set_role','${esc(u.username)}','${u.role==='vip'?'user':'vip'}')">${u.role==='vip'?'Снять VIP':'Дать VIP'}</button>
        <button class="action-btn ab-timeout" data-onclick="adminCmd('timeout','${esc(u.username)}',300)">5м</button>
        <button class="action-btn ab-timeout" data-onclick="adminCmd('timeout','${esc(u.username)}',3600)">1ч</button>
        <button class="action-btn ${u.banned?'ab-unban':'ab-ban'}" data-onclick="adminCmd('${u.banned?'unban':'ban'}','${esc(u.username)}',null)">${u.banned?'Разбанить':'Забанить'}</button>
        <button class="action-btn ab-msg" data-onclick="prefillDM('${esc(u.username)}')"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6.5l8.5 6 8.5-6"/></svg></button>
        <button class="action-btn ab-role" data-onclick="promptGiveCoins('${esc(u.username)}')">🪙+</button>
      </div>
    </div>`).join('');
}
async function promptGiveCoins(username){
  const val = await showPrompt(`Сколько монет выдать ${username}?`, '', { title: 'Выдать монеты', icon: '🪙' });
  if (val === null) return;
  const amt = parseInt(val);
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
async function adminClearCanvas(){
  const ok = await showConfirm('Очистить весь холст?', { title: 'Очистка холста', icon: '🧹', danger: true, confirmText: 'Очистить' });
  if (!ok) return;
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

function togglePalette(){
  const p = document.getElementById('palette-panel');
  const isHidden = p.style.display === 'none';
  p.style.display = isHidden ? 'block' : 'none';
  const btn = document.getElementById('btn-palette');
  if(btn) btn.classList.toggle('active', isHidden);
}

function toggleGrid(){ gridEnabled=!gridEnabled; document.getElementById('btn-grid').classList.toggle('active',gridEnabled); document.getElementById('toggle-grid').classList.toggle('on',gridEnabled); applyTransform(); }
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
  ['users','canvas','broadcast','stats','clans','news','timelapse'].forEach(t=>{ document.getElementById(`admin-tab-${t}`).style.display=t===tab?'':'none'; });
  document.querySelectorAll('.admin-tab').forEach((el,i)=>{ el.classList.toggle('active',['users','canvas','broadcast','stats','clans','news','timelapse'][i]===tab); });
  if (tab==='stats') loadAdminStats();
  if (tab==='clans') loadAdminClans();
  if (tab==='news') { renderAdminNewsList(); closeNewsAdminForm(); }
  if (tab==='timelapse') tlRefreshStatus();
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
  if (id==='news-panel' && typeof newsStartAutoplay === 'function') { newsStartAutoplay(); newsStartTimerTick(); }
}
function hidePanel(id){
  document.getElementById(id)?.classList.remove('show');
  document.getElementById('backdrop').classList.remove('show');
  if (id==='news-panel' && typeof newsStopAutoplay === 'function') { newsStopAutoplay(); newsStopTimerTick(); newsCheckUnread(); }
}
function hideAllPanels(){
  document.querySelectorAll('.overlay-panel:not(#auth-panel)').forEach(p=>p.classList.remove('show'));
  document.getElementById('backdrop').classList.remove('show');
  leaderboardOpen = false;
  document.getElementById('btn-leaderboard')?.classList.remove('active');
  if (typeof newsStopAutoplay === 'function') newsStopAutoplay();
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
function updateInspector(mx, my, px, py, fromCache) {
  if (!inspectorEnabled||px<0||py<0||px>=canvasW||py>=canvasH){document.getElementById('inspector').style.display='none';return;}
  const cidx=canvasData[py*canvasW+px];
  const col=PALETTE[cidx]||{c:'#fff',n:'?'};

  // Определяем строку автора из кэша
  const key = `${px},${py}`;
  const cached = pixelOwnerCache.get(key);
  let ownerHtml = '';
  if (cached === 'loading') {
    ownerHtml = '<span class="inspector-owner">⏳</span>';
  } else if (cached && cached !== 'unknown') {
    ownerHtml = `<span class="inspector-owner">${cached.emoji} <b>${esc(cached.username)}</b></span>`;
  }

  document.getElementById('inspector-color').style.background=col.c;
  document.getElementById('inspector-text').innerHTML=
    `<span>${px},${py} — ${col.n}</span>${ownerHtml}`;

  // Если ещё нет в кэше — запрашиваем у сервера с дебаунсом
  if (!cached && !fromCache && isLoggedIn) {
    pixelOwnerCache.set(key, 'loading');
    clearTimeout(pixelInfoDebounceTimer);
    pixelInfoLastPos = { x: px, y: py };
    pixelInfoDebounceTimer = setTimeout(() => {
      sendJSON({ action: 'pixel_info', x: pixelInfoLastPos.x, y: pixelInfoLastPos.y });
    }, 250);
  }

  const el=document.getElementById('inspector');
  el.style.display='flex';
  if (mx !== null) {
    let lx=mx+14,ly=my+14;
    if (lx+220>window.innerWidth) lx=mx-210;
    if (ly+52>window.innerHeight) ly=my-52;
    el.style.left=lx+'px';el.style.top=ly+'px';
  }
}

document.getElementById('backdrop').onclick=()=>{ if(document.getElementById('auth-panel').classList.contains('show'))return; hideAllPanels(); };

// ── ADMIN CLAN MANAGEMENT ──
let adminClansData = [];

function loadAdminClans() {
  sendJSON({action:'admin_cmd', cmd:'get_clans'});
}

function renderAdminClans(clans) {
  adminClansData = clans || [];
  const c = document.getElementById('admin-clans-list');
  if (!c) return;
  if (!adminClansData.length) {
    c.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;">\u041a\u043b\u0430\u043d\u043e\u0432 \u043d\u0435\u0442</div>';
    return;
  }
  c.innerHTML = adminClansData.map(cl => {
    const tc = cl.tag_color || '#818cf8';
    return `<div class="user-card">
      <div class="user-card-top">
        <div class="user-card-name">
          <span style="font-size:16px">${esc(cl.icon||'\u{1F3F4}')}</span>
          ${esc(cl.name)}
          <span class="clan-tag" style="color:${tc};background:${tc}22;border-color:${tc}55">${(cl.icon?cl.icon+' ':'')+esc(cl.tag||'')}</span>
        </div>
        <span style="font-size:11px;color:var(--text3);">${(cl.pixels||0).toLocaleString()}\u00a0px</span>
      </div>
      <div style="font-size:11px;color:var(--text3);margin:4px 0 6px;">
        \u041b\u0438\u0434\u0435\u0440: <b style="color:var(--text2)">${esc(cl.leader||'?')}</b> &middot;
        \u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432: <b style="color:var(--text2)">${(cl.members||[]).length}</b>
        ${cl.description ? '&middot; ' + esc(cl.description.slice(0,50)) : ''}
      </div>
      <div class="user-actions">
        <button class="action-btn ab-warn" data-onclick="adminEditClan('${esc(cl.name)}')">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 4.5l3.5 3.5L7 19l-4 1 1-4z"/></svg>
          Изменить
        </button>
        ${cl.banner_url ? `<button class="action-btn ab-warn" data-onclick="adminRemoveClanBanner('${esc(cl.name)}')">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 6l9 6 9-6"/><path d="M4 20l16-16" stroke="currentColor"/></svg>
          Убрать баннер
        </button>` : ''}
        <button class="action-btn ab-ban" data-onclick="adminDeleteClan('${esc(cl.name)}')">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          Удалить
        </button>
        <button class="action-btn ab-msg" data-onclick="adminBroadcastToClan('${esc(cl.name)}')">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6.5l8.5 6 8.5-6"/></svg>
          Сообщение
        </button>
      </div>
    </div>`;
  }).join('');
}

async function adminEditClan(name) {
  const cl = adminClansData.find(c => c.name === name);
  if (!cl) return;

  const newName = await showPrompt('Название клана:', cl.name, { title: `Изменить клан «${cl.name}»`, icon: '🏴' });
  if (newName === null) return;
  const newTag = await showPrompt('Тег клана (до 4 символов):', cl.tag || '', { title: `Изменить клан «${cl.name}»`, icon: '🏷️' });
  if (newTag === null) return;
  const newDesc = await showPrompt('Описание клана:', cl.description || '', { title: `Изменить клан «${cl.name}»`, icon: '📝' });
  if (newDesc === null) return;

  const params = { name: cl.name };
  if (newName.trim() && newName.trim() !== cl.name) params.new_name = newName.trim();
  if (newTag.trim() !== (cl.tag || '')) params.tag = newTag.trim().slice(0,4);
  if (newDesc !== (cl.description || '')) params.description = newDesc;

  if (Object.keys(params).length <= 1) { showToast('Изменений нет', 'info'); return; }
  sendJSON({action:'admin_cmd', cmd:'edit_clan', params});
  showToast('Изменения отправлены', 'success');
  setTimeout(() => loadAdminClans(), 400);
}

async function adminRemoveClanBanner(name) {
  const ok = await showConfirm(`Убрать баннер клана «${name}»? Это действие для модерации запрещённого контента.`, { title: 'Убрать баннер', icon: '🚫', danger: true, confirmText: 'Убрать' });
  if (!ok) return;
  sendJSON({action:'admin_cmd', cmd:'remove_clan_banner', params:{name}});
  showToast('Баннер удалён', 'success');
  setTimeout(() => loadAdminClans(), 400);
}

async function adminDeleteClan(name) {
  const ok = await showConfirm(`Удалить клан «${name}»? Все участники будут исключены.`, { title: 'Удалить клан', icon: '🗑️', danger: true, confirmText: 'Удалить' });
  if (!ok) return;
  sendJSON({action:'admin_cmd', cmd:'delete_clan', params:{name}});
  setTimeout(() => loadAdminClans(), 400);
}

async function adminBroadcastToClan(name) {
  const msg = await showPrompt(`Сообщение для клана «${name}»:`, '', { title: 'Сообщение клану', icon: '📢' });
  if (!msg) return;
  sendJSON({action:'admin_cmd', cmd:'clan_broadcast', params:{name, message: msg}});
  showToast('Отправлено', 'success');
}

function filterAdminClans() {
  const q = document.getElementById('admin-clans-search').value.toLowerCase();
  const filtered = q ? adminClansData.filter(cl => cl.name.toLowerCase().includes(q) || (cl.tag||'').toLowerCase().includes(q)) : adminClansData;
  renderAdminClans(filtered);
}
// ════════════════════════════════════════════════════════════
//  NEWS PANEL — данные приходят с сервера (newsItems[], см. network.js action:'news_data')
// ════════════════════════════════════════════════════════════
let newsCurrentSlide = 0;
let newsSelectedId = null;
let newsTimerInterval = null;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function openNewsPanel() {
  showPanel('news-panel');
  newsCurrentSlide = 0;
  newsUpdateSlidePosition(false);
  const dot = document.getElementById('news-indicator-dot');
  if (dot) dot.style.display = 'none';
  if (newsItems.length) { try { localStorage.setItem('yamiko_news_seen', newsItems[0].id); } catch(_) {} }
}

function newsCheckUnread() {
  const dot = document.getElementById('news-indicator-dot');
  if (!dot) return;
  if (!newsItems.length) { dot.style.display = 'none'; return; }
  let seen = null;
  try { seen = localStorage.getItem('yamiko_news_seen'); } catch(_) {}
  const panelOpen = document.getElementById('news-panel')?.classList.contains('show');
  dot.style.display = (!panelOpen && seen !== newsItems[0].id) ? '' : 'none';
}

// ── Красивый таймер обратного отсчёта для событий ──
function newsFormatCountdown(target) {
  const diff = target - Date.now();
  if (diff <= 0) return { done: true };
  return {
    done: false,
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

function newsTimerHtml(target) {
  if (!target) return '';
  const t = newsFormatCountdown(target);
  const pad = n => String(n).padStart(2, '0');
  if (t.done) {
    return `<div class="news-slide-timer news-slide-timer-done" data-news-timer="${target}"><span class="news-timer-done-icon">🎉</span><span class="news-timer-done-label">Событие началось!</span></div>`;
  }
  return `<div class="news-slide-timer" data-news-timer="${target}">
    <span class="news-timer-icon">⏳</span>
    <div class="news-timer-box"><span class="news-timer-num">${pad(t.d)}</span><span class="news-timer-lbl">дн</span></div>
    <div class="news-timer-sep">:</div>
    <div class="news-timer-box"><span class="news-timer-num">${pad(t.h)}</span><span class="news-timer-lbl">ч</span></div>
    <div class="news-timer-sep">:</div>
    <div class="news-timer-box"><span class="news-timer-num">${pad(t.m)}</span><span class="news-timer-lbl">мин</span></div>
    <div class="news-timer-sep">:</div>
    <div class="news-timer-box"><span class="news-timer-num">${pad(t.s)}</span><span class="news-timer-lbl">сек</span></div>
  </div>`;
}

function newsTickCountdowns() {
  const els = document.querySelectorAll('[data-news-timer]');
  if (!els.length) { newsStopTimerTick(); return; }
  els.forEach(el => {
    const target = Number(el.getAttribute('data-news-timer'));
    if (!target) return;
    const t = newsFormatCountdown(target);
    if (t.done) {
      if (!el.classList.contains('news-slide-timer-done')) el.outerHTML = newsTimerHtml(target);
      return;
    }
    const pad = n => String(n).padStart(2, '0');
    const nums = el.querySelectorAll('.news-timer-num');
    if (nums.length === 4) { nums[0].textContent = pad(t.d); nums[1].textContent = pad(t.h); nums[2].textContent = pad(t.m); nums[3].textContent = pad(t.s); }
  });
}
function newsStartTimerTick() { if (!newsTimerInterval) newsTimerInterval = setInterval(newsTickCountdowns, 1000); }
function newsStopTimerTick() { if (newsTimerInterval) { clearInterval(newsTimerInterval); newsTimerInterval = null; } }

// ── Рендер слайда: художку/бейджик/текст можно скрыть по отдельности —
// удобно, когда весь визуал уже сделан одной картинкой (например, из Figma)
// и остаётся только подставить её фоном без дублирующих элементов поверх. ──
function newsIconHtml(item, cls) {
  if (item.iconType === 'image' && item.iconImage) {
    const url = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(item.iconImage) : item.iconImage;
    return `<div class="${cls} ${cls}-img"><img src="${escapeHtml(url)}" alt=""></div>`;
  }
  return `<div class="${cls}">${escapeHtml(item.art || '📰')}</div>`;
}

function newsSlideHtml(item) {
  const bgStyle = item.bgImage ? ` style="${newsComputeBgStyle(item)}"` : '';
  const artHtml = item.showArt !== false ? newsIconHtml(item, 'news-slide-art') : '';
  const tagHtml = (item.showTag !== false && item.tag) ? `<div class="news-slide-tag">${escapeHtml(item.tag)}</div>` : '';
  const textHtml = item.showText !== false ? `
      <div class="news-slide-title">${escapeHtml(item.title || 'Без названия')}</div>
      <div class="news-slide-desc">${escapeHtml(item.desc || '')}</div>` : '';
  return `<div class="news-slide${item.bgImage ? ' news-slide-has-bg' : ''}"${bgStyle}>
      ${artHtml}
      <div class="news-slide-content">
        ${tagHtml}
        ${textHtml}
        ${newsTimerHtml(item.eventTimer)}
      </div>
    </div>`;
}

function newsRenderAll() {
  const track = document.getElementById('news-slides-track');
  const dots  = document.getElementById('news-slide-dots');
  const list  = document.getElementById('news-list');
  const detail = document.getElementById('news-detail-col');
  if (!track || !dots || !list || !detail) return;

  if (!newsItems.length) {
    track.innerHTML = `<div class="news-slide news-slide-empty"><div class="news-slide-content"><div class="news-slide-art">📭</div><div class="news-slide-title">Пока нет новостей</div><div class="news-slide-desc">Загляните позже — здесь появятся анонсы и события проекта</div></div></div>`;
    dots.innerHTML = '';
    list.innerHTML = `<div class="news-empty">Новостей пока нет</div>`;
    detail.innerHTML = '';
    newsCheckUnread();
    return;
  }

  track.innerHTML = newsItems.map(newsSlideHtml).join('');
  dots.innerHTML = newsItems.map((_, i) => `<div class="news-slide-dot${i===0?' active':''}" data-onclick="newsSlideGoto(${i})"></div>`).join('');
  list.innerHTML = newsItems.map((item, i) => `
    <div class="news-list-item${i===0?' active':''}" data-onclick="newsSelectItem(this, '${item.id}')">
      ${newsIconHtml(item, 'news-list-item-icon')}
      <div class="news-list-item-info">
        <div class="news-list-item-title">${escapeHtml(item.title || 'Без названия')}</div>
        <div class="news-list-item-date">${escapeHtml(item.date || '')}</div>
      </div>
    </div>`).join('');

  if (newsCurrentSlide >= newsItems.length) newsCurrentSlide = 0;
  newsUpdateSlidePosition(false);
  newsSelectItemById(newsItems[0].id);
  newsCheckUnread();
  newsStartTimerTick();
}

function newsUpdateSlidePosition(animate = true) {
  const track = document.getElementById('news-slides-track');
  if (!track) return;
  track.style.transition = animate ? '' : 'none';
  track.style.transform = `translateX(-${newsCurrentSlide * 100}%)`;
  if (!animate) { void track.offsetHeight; track.style.transition = ''; }
  document.querySelectorAll('.news-slide-dot').forEach((d, i) => d.classList.toggle('active', i === newsCurrentSlide));
}

function newsSlideNext() {
  if (!newsItems.length) return;
  newsCurrentSlide = (newsCurrentSlide + 1) % newsItems.length;
  newsUpdateSlidePosition();
}
function newsSlidePrev() {
  if (!newsItems.length) return;
  newsCurrentSlide = (newsCurrentSlide - 1 + newsItems.length) % newsItems.length;
  newsUpdateSlidePosition();
}
function newsSlideGoto(i) { newsCurrentSlide = i; newsUpdateSlidePosition(); }

// Автопрокрутка слайдшоу, пока панель открыта
let newsAutoplayTimer = null;
function newsStartAutoplay() {
  newsStopAutoplay();
  newsAutoplayTimer = setInterval(() => {
    const panel = document.getElementById('news-panel');
    if (!panel || !panel.classList.contains('show')) { newsStopAutoplay(); return; }
    newsSlideNext();
  }, 6000);
}
function newsStopAutoplay() { if (newsAutoplayTimer) { clearInterval(newsAutoplayTimer); newsAutoplayTimer = null; } }

function newsSelectItem(el, id) {
  document.querySelectorAll('.news-list-item').forEach(it => it.classList.remove('active'));
  el.classList.add('active');
  newsSelectItemById(id);
}

function newsSelectItemById(id) {
  const item = newsItems.find(n => n.id === id);
  const col = document.getElementById('news-detail-col');
  if (!col) return;
  if (!item) { col.innerHTML = ''; return; }
  newsSelectedId = id;
  col.innerHTML = `
    ${item.tag ? `<div class="news-detail-tag">${escapeHtml(item.tag)}</div>` : ''}
    <div class="news-detail-title">${escapeHtml(item.title || 'Без названия')}</div>
    <div class="news-detail-date">${escapeHtml(item.date || '')}</div>
    <div class="news-detail-sep"></div>
    <div class="news-detail-text">${escapeHtml(item.text || item.desc || '')}</div>
    ${item.eventTimer ? newsTimerHtml(item.eventTimer) : ''}
  `;
  newsStartTimerTick();
}

// ════════════════════════════════════════════════════════════
//  АДМИНКА НОВОСТЕЙ — создание/редактирование/удаление/порядок
// ════════════════════════════════════════════════════════════
let newsAdminShowArt = true, newsAdminShowTag = true, newsAdminShowText = true;
// Крой картинки: доли (0..1) от исходного изображения. w/h всегда в
// соотношении, равном реальным пропорциям блока слайда новостей.
let newsAdminCrop = { x: 0, y: 0, w: 1, h: 1 };
let newsAdminImgNaturalAspect = null;

// ── Иконка новости: эмодзи ИЛИ картинка ──
let newsAdminIconType = 'emoji'; // 'emoji' | 'image'
let newsAdminIconImage = null;   // URL картинки-иконки в облаке
let newsAdminIconUploadPending = false;
const NEWS_QUICK_EMOJI = ['📰','🎉','⚡','🛠️','🎨','🏆','🔥','✨','📢','🎁','🗓️','💥','🚀','⭐','🧩','🌈'];

function renderAdminNewsList() {
  const box = document.getElementById('admin-news-list');
  if (!box) return;
  if (!newsItems.length) { box.innerHTML = `<div style="color:var(--text3);text-align:center;padding:20px;">Новостей ещё нет — создайте первую</div>`; return; }
  box.innerHTML = newsItems.map((item, i) => `
    <div class="admin-news-item">
      ${newsIconHtml(item, 'admin-news-item-icon')}
      <div class="admin-news-item-info">
        <div class="admin-news-item-title">${escapeHtml(item.title || 'Без названия')}${item.bgImage ? ' 🖼️' : ''}${item.eventTimer ? ' ⏳' : ''}</div>
        <div class="admin-news-item-sub">${escapeHtml(item.tag || '—')} · ${escapeHtml(item.date || '')}</div>
      </div>
      <div class="admin-news-item-actions">
        <button class="admin-news-mini-btn" data-onclick="moveNewsAdmin('${item.id}',-1)" ${i===0?'disabled':''} title="Выше">↑</button>
        <button class="admin-news-mini-btn" data-onclick="moveNewsAdmin('${item.id}',1)" ${i===newsItems.length-1?'disabled':''} title="Ниже">↓</button>
        <button class="admin-news-mini-btn" data-onclick="openNewsAdminForm('${item.id}')" title="Редактировать">✎</button>
        <button class="admin-news-mini-btn admin-news-mini-btn-danger" data-onclick="deleteNewsAdmin('${item.id}')" title="Удалить">✕</button>
      </div>
    </div>`).join('');
}

function newsAdminSetToggle(field, val) {
  if (field === 'art') newsAdminShowArt = val;
  if (field === 'tag') newsAdminShowTag = val;
  if (field === 'text') newsAdminShowText = val;
  const el = document.getElementById(`na-toggle-${field}`);
  if (el) el.classList.toggle('on', val);
}
function newsAdminToggle(field) {
  const cur = field === 'art' ? newsAdminShowArt : field === 'tag' ? newsAdminShowTag : newsAdminShowText;
  newsAdminSetToggle(field, !cur);
}

function openNewsAdminForm(id) {
  newsAdminEditId = id || null;
  const item = id ? newsItems.find(n => n.id === id) : null;

  document.getElementById('admin-news-form-title').textContent = item ? 'Редактирование новости' : 'Новая новость';
  document.getElementById('na-title').value = item?.title || '';
  document.getElementById('na-tag').value = item?.tag || '';
  document.getElementById('na-art').value = item?.art || '📰';
  document.getElementById('na-desc').value = item?.desc || '';
  document.getElementById('na-text').value = item?.text || '';
  document.getElementById('na-date').value = item?.date || '';

  // Иконка: тип (эмодзи/картинка) + сама картинка, если есть
  newsAdminIconUploadPending = false;
  newsAdminIconImage = item?.iconImage || null;
  newsAdminSetIconType(item?.iconType === 'image' && newsAdminIconImage ? 'image' : 'emoji');
  newsAdminBuildEmojiChips();
  newsAdminRefreshIconPreview();

  newsAdminBgImage = item?.bgImage || null;
  newsAdminImgNaturalAspect = null;
  newsAdminUploadPending = false;
  if (newsAdminBgImage && item?.bgCropW > 0 && item?.bgCropH > 0) {
    // Уже был выбран крой раньше — используем его как есть.
    newsAdminCrop = { x: item.bgCropX || 0, y: item.bgCropY || 0, w: item.bgCropW, h: item.bgCropH };
    newsAdminRefreshBgPreview();
  } else if (newsAdminBgImage) {
    // Старая новость без сохранённого кроя (или совсем новая картинка) —
    // временно ставим "во весь кадр", а как только картинка догрузится,
    // подставляем красивый дефолт по центру с правильными пропорциями.
    newsAdminCrop = { x: 0, y: 0, w: 1, h: 1 };
    newsAdminRefreshBgPreview();
    const probe = new Image();
    probe.onload = () => {
      if (newsAdminBgImage !== (item?.bgImage || null)) return; // форму уже закрыли/сменили картинку
      newsAdminImgNaturalAspect = probe.naturalWidth / probe.naturalHeight;
      newsAdminCrop = newsAdminComputeDefaultCrop(newsAdminImgNaturalAspect, getNewsSlideAspect());
      newsAdminRefreshBgPreview();
    };
    probe.src = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(newsAdminBgImage) : newsAdminBgImage;
  } else {
    newsAdminCrop = { x: 0, y: 0, w: 1, h: 1 };
    newsAdminRefreshBgPreview();
  }

  const dt = document.getElementById('na-timer');
  if (item?.eventTimer) {
    const d = new Date(item.eventTimer);
    const off = d.getTimezoneOffset();
    dt.value = new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  } else {
    dt.value = '';
  }
  newsAdminUpdateTimerBadge();
  // Свёрнутые карточки: раскрываем таймер, только если он уже был задан у новости
  const timerCard = document.getElementById('na-card-timer');
  if (timerCard) timerCard.open = !!item?.eventTimer;
  const visCard = document.getElementById('na-card-visibility');
  if (visCard) visCard.open = item ? (item.showArt === false || item.showTag === false || item.showText === false) : false;

  newsAdminSetToggle('art', item ? item.showArt !== false : true);
  newsAdminSetToggle('tag', item ? item.showTag !== false : true);
  newsAdminSetToggle('text', item ? item.showText !== false : true);

  document.getElementById('admin-news-list-wrap').style.display = 'none';
  document.getElementById('admin-news-form').style.display = '';
}

// ── Переключатель типа иконки, живое превью, быстрый выбор эмодзи ──
function newsAdminBuildEmojiChips() {
  const box = document.getElementById('na-emoji-chips');
  if (!box || box.dataset.built) return;
  box.dataset.built = '1';
  box.innerHTML = NEWS_QUICK_EMOJI.map(em => `<div class="emoji-chip" data-onclick="newsAdminPickEmoji('${em}')">${em}</div>`).join('');
}

function newsAdminPickEmoji(em) {
  document.getElementById('na-art').value = em;
  newsAdminOnArtInput();
}

function newsAdminOnArtInput() {
  document.querySelectorAll('#na-emoji-chips .emoji-chip').forEach(chip => {
    chip.classList.toggle('selected', chip.textContent === document.getElementById('na-art').value.trim());
  });
  newsAdminRefreshIconPreview();
  newsAdminRefreshBgPreview();
}

function newsAdminSetIconType(type) {
  newsAdminIconType = type;
  document.getElementById('na-icon-type-emoji')?.classList.toggle('active', type === 'emoji');
  document.getElementById('na-icon-type-image')?.classList.toggle('active', type === 'image');
  document.getElementById('na-icon-emoji-block').style.display = type === 'emoji' ? '' : 'none';
  document.getElementById('na-icon-image-block').style.display = type === 'image' ? '' : 'none';
  newsAdminOnArtInput();
  newsAdminRefreshIconPreview();
}

function newsAdminRefreshIconPreview() {
  const preview = document.getElementById('na-icon-preview');
  const dropBox = document.getElementById('na-icon-image-block');
  if (!preview) return;
  if (newsAdminIconType === 'image' && newsAdminIconImage) {
    const url = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(newsAdminIconImage) : newsAdminIconImage;
    preview.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
    if (dropBox) {
      dropBox.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-secondary btn-sm" data-onclick="document.getElementById('na-icon-file').click()" style="flex:1;">Заменить</button>
          <button class="btn btn-danger btn-sm" data-onclick="clearNewsAdminIconImage()" style="flex:1;">Убрать</button>
        </div>
        <input type="file" id="na-icon-file" accept="image/*" style="display:none" data-onchange="handleNewsAdminIconImage(event)">`;
    }
  } else if (newsAdminIconType === 'image') {
    preview.textContent = '🖼️';
    if (dropBox && !document.getElementById('na-icon-drop')) {
      dropBox.innerHTML = `
        <div class="na-icon-drop" id="na-icon-drop" data-onclick="document.getElementById('na-icon-file').click()">${newsAdminIconUploadPending ? 'Загрузка...' : 'Нажмите, чтобы загрузить иконку'}</div>
        <input type="file" id="na-icon-file" accept="image/*" style="display:none" data-onchange="handleNewsAdminIconImage(event)">`;
    }
  } else {
    preview.textContent = document.getElementById('na-art').value.trim() || '📰';
  }
}

function clearNewsAdminIconImage() {
  newsAdminIconImage = null;
  newsAdminRefreshIconPreview();
  newsAdminRefreshBgPreview();
}

async function handleNewsAdminIconImage(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    newsAdminIconUploadPending = true;
    newsAdminRefreshIconPreview();
    showToast('Загрузка иконки в облако...', 'info');
    try {
      const res = await fetch(getApiUrl() + '/upload-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: ev.target.result, name: 'news_icon', username: currentUser }),
      });
      const data = await res.json();
      if (data.url) {
        newsAdminIconImage = data.url;
        showToast(data.fallback ? 'Иконка загружена (без CDN — облако не настроено)' : 'Иконка загружена!', data.fallback ? 'info' : 'success');
      } else { showToast('Ошибка загрузки иконки: ' + (data.error || 'сервер не вернул ссылку'), 'error'); }
    } catch (e) { showToast('Ошибка сети при загрузке иконки', 'error'); }
    newsAdminIconUploadPending = false;
    newsAdminRefreshIconPreview();
    newsAdminRefreshBgPreview();
  };
  reader.readAsDataURL(file);
}

function newsAdminUpdateTimerBadge() {
  const badge = document.getElementById('na-timer-badge');
  const val = document.getElementById('na-timer')?.value;
  if (badge) { badge.textContent = val ? 'Вкл' : 'Выкл'; badge.style.color = val ? 'var(--accent2)' : ''; }
}

function closeNewsAdminForm() {
  document.getElementById('admin-news-form').style.display = 'none';
  document.getElementById('admin-news-list-wrap').style.display = '';
  newsAdminEditId = null;
}

let newsAdminUploadPending = false;

// ── Измерение реальных пропорций слайда ──
// #news-slideshow всегда в DOM (панель новостей скрыта через opacity:0, а
// не display:none — см. .overlay-panel в style.css), поэтому его реальный
// getBoundingClientRect() всегда доступен и даёт ТОЧНЫЕ живые пропорции
// поста, без каких-либо предположений/захардкоженных чисел.
function getNewsSlideAspect() {
  const el = document.getElementById('news-slideshow');
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 10 && r.height > 10) return r.width / r.height;
  }
  return 2.7; // запасной вариант, если элемент почему-то ещё не отрисован
}

// Дефолтный крой (аналог background-size:cover + position:center): берём
// максимально большую область картинки, вписывающуюся в нужные пропорции,
// по центру.
function newsAdminComputeDefaultCrop(imgAspect, targetAspect) {
  if (!imgAspect || !isFinite(imgAspect)) return { x: 0, y: 0, w: 1, h: 1 };
  if (imgAspect > targetAspect) {
    const w = targetAspect / imgAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  } else {
    const h = imgAspect / targetAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
}

// Переводит долевой крой {x,y,w,h} в background-size/position, которые дают
// точно такой же визуальный результат, что и объектный кроп в редакторе —
// без искажений пропорций картинки.
function newsComputeBgStyle(item) {
  if (!item.bgImage) return '';
  const bgUrl = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(item.bgImage) : item.bgImage;
  let { bgCropX: x = 0, bgCropY: y = 0, bgCropW: w = 1, bgCropH: h = 1 } = item;
  w = Math.min(1, Math.max(0.02, w || 1));
  h = Math.min(1, Math.max(0.02, h || 1));
  x = Math.min(1 - w, Math.max(0, x || 0));
  y = Math.min(1 - h, Math.max(0, y || 0));
  const sizeX = (100 / w).toFixed(3);
  const sizeY = (100 / h).toFixed(3);
  const posX = w >= 0.999 ? 50 : (x / (1 - w) * 100).toFixed(3);
  const posY = h >= 0.999 ? 50 : (y / (1 - h) * 100).toFixed(3);
  return `background-image:url('${escapeHtml(bgUrl)}');background-repeat:no-repeat;background-size:${sizeX}% ${sizeY}%;background-position:${posX}% ${posY}%`;
}

// Превью строится ТОЙ ЖЕ разметкой/классами, что и настоящий слайд
// (newsSlideHtml), а контейнер получает точный пиксельный размер, снятый
// с реального #news-slideshow (при необходимости пропорционально уменьшенный,
// чтобы влезть в узкую панель админки) — визуально это 1-в-1 копия поста.
function newsAdminRefreshBgPreview() {
  const wrap = document.getElementById('na-bg-preview-wrap');
  const box = document.getElementById('na-bg-preview');
  const frame = document.getElementById('na-bg-preview-frame');
  if (!wrap || !box) return;

  if (!newsAdminBgImage) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const real = document.getElementById('news-slideshow')?.getBoundingClientRect();
  const realW = real && real.width > 10 ? real.width : 724;
  const realH = real && real.height > 10 ? real.height : 150;
  const availW = frame ? frame.clientWidth : realW;
  const scale = Math.min(1, availW / realW);
  box.style.width = Math.round(realW * scale) + 'px';
  box.style.height = Math.round(realH * scale) + 'px';

  const previewItem = {
    title: document.getElementById('na-title')?.value.trim() || 'Без названия',
    tag: document.getElementById('na-tag')?.value.trim() || '',
    art: document.getElementById('na-art')?.value.trim() || '📰',
    iconType: newsAdminIconType,
    iconImage: newsAdminIconImage,
    desc: document.getElementById('na-desc')?.value.trim() || '',
    bgImage: newsAdminBgImage,
    bgCropX: newsAdminCrop.x, bgCropY: newsAdminCrop.y, bgCropW: newsAdminCrop.w, bgCropH: newsAdminCrop.h,
    eventTimer: null,
    showArt: newsAdminShowArt,
    showTag: newsAdminShowTag,
    showText: newsAdminShowText,
  };
  box.innerHTML = newsSlideHtml(previewItem);
}

function clearNewsAdminBgImage() {
  newsAdminBgImage = null;
  newsAdminImgNaturalAspect = null;
  newsAdminCrop = { x: 0, y: 0, w: 1, h: 1 };
  newsAdminRefreshBgPreview();
}

async function handleNewsAdminBgImage(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    newsAdminUploadPending = true;
    showToast('Загрузка картинки в облако...', 'info');
    try {
      const res = await fetch(getApiUrl() + '/upload-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: ev.target.result, name: 'news_bg', username: currentUser }),
      });
      const data = await res.json();
      if (data.url) {
        newsAdminBgImage = data.url;
        newsAdminImgNaturalAspect = null;
        newsAdminCrop = { x: 0, y: 0, w: 1, h: 1 };
        newsAdminRefreshBgPreview();
        const probe = new Image();
        probe.onload = () => {
          if (newsAdminBgImage !== data.url) return;
          newsAdminImgNaturalAspect = probe.naturalWidth / probe.naturalHeight;
          newsAdminCrop = newsAdminComputeDefaultCrop(newsAdminImgNaturalAspect, getNewsSlideAspect());
          newsAdminRefreshBgPreview();
        };
        probe.src = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(data.url) : data.url;
        showToast(data.fallback ? 'Фон загружен (без CDN — облако не настроено)' : 'Фон загружен!', data.fallback ? 'info' : 'success');
      } else { showToast('Ошибка загрузки фона: ' + (data.error || 'сервер не вернул ссылку'), 'error'); }
    } catch (e) { showToast('Ошибка сети при загрузке фона', 'error'); }
    newsAdminUploadPending = false;
  };
  reader.readAsDataURL(file);
}

// ════════════════════════════════════════════════════════════
//  МОДАЛКА ВЫБОРА ВИДИМОЙ ЗОНЫ (crop-редактор)
// ════════════════════════════════════════════════════════════
let ncmCropSnapshot = null;
let ncmDragMode = null; // null | 'move' | 'resize'
let ncmDragStart = { x: 0, y: 0 };
let ncmBoxStart = { x: 0, y: 0, w: 0, h: 0, imgBox: null };

function ncmGetImgBox() {
  const stage = document.getElementById('ncm-stage');
  const img = document.getElementById('ncm-img');
  const sr = stage.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  return { left: ir.left - sr.left, top: ir.top - sr.top, width: ir.width, height: ir.height };
}

function ncmLayoutCropBox() {
  const imgBox = ncmGetImgBox();
  const box = document.getElementById('ncm-crop-box');
  if (!box || imgBox.width < 1) return;
  const c = newsAdminCrop;
  box.style.left = (imgBox.left + c.x * imgBox.width) + 'px';
  box.style.top = (imgBox.top + c.y * imgBox.height) + 'px';
  box.style.width = (c.w * imgBox.width) + 'px';
  box.style.height = (c.h * imgBox.height) + 'px';
}

function openNewsCropModal() {
  if (!newsAdminBgImage) return;
  ncmCropSnapshot = { ...newsAdminCrop };
  const img = document.getElementById('ncm-img');
  const onReady = () => {
    newsAdminImgNaturalAspect = img.naturalWidth / img.naturalHeight;
    // Если крой ещё не задавали (полный кадр по умолчанию) — сразу подставляем
    // красивый центрированный вариант вместо растянутого "во весь кадр".
    if (newsAdminCrop.w >= 0.999 && newsAdminCrop.h >= 0.999) {
      newsAdminCrop = newsAdminComputeDefaultCrop(newsAdminImgNaturalAspect, getNewsSlideAspect());
    }
    ncmLayoutCropBox();
  };
  img.onload = onReady;
  img.src = typeof getProxiedImageUrl === 'function' ? getProxiedImageUrl(newsAdminBgImage) : newsAdminBgImage;
  if (img.complete && img.naturalWidth) onReady();
  document.getElementById('ncm-backdrop').classList.add('show');
  document.getElementById('ncm-dialog').classList.add('show');
}

function closeNewsCropModal(apply) {
  document.getElementById('ncm-backdrop').classList.remove('show');
  document.getElementById('ncm-dialog').classList.remove('show');
  ncmDragMode = null;
  if (!apply && ncmCropSnapshot) newsAdminCrop = ncmCropSnapshot;
  ncmCropSnapshot = null;
  newsAdminRefreshBgPreview();
}

function resetNewsCrop() {
  const img = document.getElementById('ncm-img');
  const aspect = (img && img.naturalWidth) ? img.naturalWidth / img.naturalHeight : newsAdminImgNaturalAspect;
  newsAdminCrop = newsAdminComputeDefaultCrop(aspect, getNewsSlideAspect());
  ncmLayoutCropBox();
}

function _ncmPointerDown(mode, ev) {
  if (ev.cancelable) ev.preventDefault();
  ev.stopPropagation();
  ncmDragMode = mode;
  ncmDragStart = { x: ev.clientX, y: ev.clientY };
  ncmBoxStart = { x: newsAdminCrop.x, y: newsAdminCrop.y, w: newsAdminCrop.w, h: newsAdminCrop.h, imgBox: ncmGetImgBox() };
}

document.getElementById('ncm-crop-box')?.addEventListener('pointerdown', ev => {
  if (ev.target.id === 'ncm-handle') return;
  _ncmPointerDown('move', ev);
});
document.getElementById('ncm-handle')?.addEventListener('pointerdown', ev => _ncmPointerDown('resize', ev));

document.addEventListener('pointermove', ev => {
  if (!ncmDragMode) return;
  const imgBox = ncmBoxStart.imgBox;
  if (!imgBox || imgBox.width < 5 || imgBox.height < 5) return;
  const dxFrac = (ev.clientX - ncmDragStart.x) / imgBox.width;
  const dyFrac = (ev.clientY - ncmDragStart.y) / imgBox.height;

  if (ncmDragMode === 'move') {
    let nx = Math.max(0, Math.min(1 - ncmBoxStart.w, ncmBoxStart.x + dxFrac));
    let ny = Math.max(0, Math.min(1 - ncmBoxStart.h, ncmBoxStart.y + dyFrac));
    newsAdminCrop.x = nx; newsAdminCrop.y = ny;
  } else if (ncmDragMode === 'resize') {
    // Рамка тянется за нижний правый угол, верхний левый (x,y) — точка
    // привязки. w/h всегда меняются вместе, чтобы сохранить соотношение
    // сторон блока поста.
    const aspect = ncmBoxStart.w / ncmBoxStart.h;
    const byX = ncmBoxStart.w + dxFrac;
    const byY = (ncmBoxStart.h + dyFrac) * aspect;
    let w = Math.abs(dxFrac) > Math.abs(dyFrac) ? byX : byY;
    w = Math.max(0.05, Math.min(1, w));
    let h = w / aspect;
    if (h > 1) { h = 1; w = h * aspect; }
    if (ncmBoxStart.x + w > 1) { w = 1 - ncmBoxStart.x; h = w / aspect; }
    if (ncmBoxStart.y + h > 1) { h = 1 - ncmBoxStart.y; w = h * aspect; }
    newsAdminCrop.w = w; newsAdminCrop.h = h;
  }
  ncmLayoutCropBox();
});
document.addEventListener('pointerup', () => { ncmDragMode = null; });

document.getElementById('ncm-backdrop')?.addEventListener('click', () => closeNewsCropModal(false));
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && document.getElementById('ncm-dialog')?.classList.contains('show')) closeNewsCropModal(false);
});
window.addEventListener('resize', () => {
  if (document.getElementById('ncm-dialog')?.classList.contains('show')) ncmLayoutCropBox();
});

function saveNewsAdmin() {
  if (newsAdminUploadPending) { showToast('Дождитесь загрузки картинки...', 'info'); return; }
  const title = document.getElementById('na-title').value.trim();
  if (!title) { showToast('Введите заголовок новости', 'error'); return; }

  const dtVal = document.getElementById('na-timer').value;
  const eventTimer = dtVal ? new Date(dtVal).getTime() : null;

  if (newsAdminIconType === 'image' && newsAdminIconUploadPending) { showToast('Дождитесь загрузки иконки...', 'info'); return; }

  const params = {
    title,
    tag: document.getElementById('na-tag').value.trim(),
    art: document.getElementById('na-art').value.trim() || '📰',
    iconType: newsAdminIconType,
    iconImage: newsAdminIconType === 'image' ? newsAdminIconImage : null,
    desc: document.getElementById('na-desc').value.trim(),
    text: document.getElementById('na-text').value.trim(),
    date: document.getElementById('na-date').value.trim() || new Date().toLocaleDateString('ru-RU'),
    bgImage: newsAdminBgImage,
    bgCropX: newsAdminCrop.x,
    bgCropY: newsAdminCrop.y,
    bgCropW: newsAdminCrop.w,
    bgCropH: newsAdminCrop.h,
    eventTimer,
    showArt: newsAdminShowArt,
    showTag: newsAdminShowTag,
    showText: newsAdminShowText,
  };

  if (newsAdminEditId) sendJSON({ action:'admin_cmd', cmd:'news_update', params:{ id:newsAdminEditId, ...params } });
  else sendJSON({ action:'admin_cmd', cmd:'news_create', params });

  closeNewsAdminForm();
}

async function deleteNewsAdmin(id) {
  const ok = await showConfirm('Удалить эту новость безвозвратно?', { danger:true, confirmText:'Удалить' });
  if (!ok) return;
  sendJSON({ action:'admin_cmd', cmd:'news_delete', params:{ id } });
}

function moveNewsAdmin(id, dir) {
  const idx = newsItems.findIndex(n => n.id === id);
  const newIdx = idx + dir;
  if (idx < 0 || newIdx < 0 || newIdx >= newsItems.length) return;
  const ids = newsItems.map(n => n.id);
  [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
  sendJSON({ action:'admin_cmd', cmd:'news_reorder', params:{ ids } });
}
// ══════════════════════════════════════════════════════════════
//  SOCIAL HUB — попап чата (друзья, ЛС, онлайн, каналы)
// ══════════════════════════════════════════════════════════════
// Раньше жил в отдельном js/chat-popup.js и работал на моковых данных
// (CP_USERS/CP_CONVERSATIONS/...). Теперь удалён как отдельный файл —
// логика здесь, состояние в state.js, сеть в network.js. Вся разметка
// в index.html (#chat-popup-panel) и стили в style.css не менялись,
// поэтому все id/классы с префиксом cp- совпадают 1-в-1.

function cpToast(text) { if (typeof showToast === 'function') showToast(text, 'info'); }

function cpChannelsList() {
  return [{
    id: 'ch-general', type: 'channel', name: 'Общий чат', icon: '💬',
    desc: 'открытое обсуждение · весь Pixel Battle',
  }];
}

function cpDmList() {
  const list = cpDmConversations.map(c => ({ id: 'dm-' + c.username, type: 'dm', user: c.username, ...c }));
  const known = new Set(list.map(c => c.user));
  cpFriends.forEach(f => {
    if (known.has(f.username)) return;
    list.push({ id: 'dm-' + f.username, type: 'dm', user: f.username, ...f, lastMessage: '', lastFrom: '', lastTs: 0, unread: 0 });
    known.add(f.username);
  });
  return list;
}

function cpAllConversations() { return [...cpChannelsList(), ...cpDmList()]; }
function cpGetActiveConv() { return cpAllConversations().find(c => c.id === cpActiveConvId) || cpChannelsList()[0]; }

function cpUser(username) {
  return cpUserCache[username] || { username, emoji: '👾', rank: 'Новичок', role: 'user', clan: '', online: false };
}

function cpFmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const pad = n => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return pad(d.getHours()) + ':' + pad(d.getMinutes());
  const days = ['вс','пн','вт','ср','чт','пт','сб'];
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays < 7) return days[d.getDay()];
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
}

// ── "ПОЛЬЗОВАТЕЛЬ ПЕЧАТАЕТ…" ──
// cpSendTyping троттлит собственную отправку (не чаще раза в 2с на активность),
// cpShowTyping/cpRenderTypingRow показывают анимированное троеточие у собеседника.
function cpSendTyping() {
  if (!isLoggedIn || cpMyTypingTimer) return;
  const conv = cpGetActiveConv();
  const payload = conv.type === 'dm' ? { action:'typing', to: conv.user } : { action:'typing' };
  sendJSON(payload);
  cpMyTypingTimer = setTimeout(() => { cpMyTypingTimer = null; }, 2000);
}

function cpShowTyping(from, isChannel) {
  cpTypingFrom[from] = { channel: !!isChannel };
  clearTimeout(cpTypingTimers[from]);
  cpTypingTimers[from] = setTimeout(() => { delete cpTypingFrom[from]; cpRenderTypingRow(); }, 3000);
  cpRenderTypingRow();
}

function cpRenderTypingRow() {
  const root = document.getElementById('cp-messages');
  if (!root) return;
  const old = document.getElementById('cp-typing-indicator');
  if (old) old.remove();
  const conv = cpGetActiveConv();
  const names = Object.keys(cpTypingFrom).filter(u => {
    if (u === currentUser) return false;
    const info = cpTypingFrom[u];
    return conv.type === 'channel' ? info.channel : (!info.channel && u === conv.user);
  });
  if (!names.length) return;
  const row = document.createElement('div');
  row.className = 'cp-typing-row';
  row.id = 'cp-typing-indicator';
  const verb = names.length > 1 ? 'печатают' : 'печатает';
  row.innerHTML = `<div class="cp-typing-squares"><span></span><span></span><span></span></div><div>${esc(names.join(', '))} ${verb}…</div>`;
  root.appendChild(row);
  root.scrollTop = root.scrollHeight + 999;
}

function initChatPopup() {
  if (cpInited) return;
  cpInited = true;
  cpUpdateFreqBadge();
  cpRenderSidebar();
  cpSelectConversation('ch-general');
}

function cpRefreshAll() {
  if (!isLoggedIn) return;
  cpFetchFriends();
  cpFetchConversations();
  cpFetchOnline();
}

function cpRowTimePreview(conv) {
  if (conv.type === 'channel') {
    const last = chatMessages[chatMessages.length - 1];
    if (!last) return { user: '', text: 'Нет сообщений' };
    return { user: last.username === currentUser ? null : last.username, text: last.text };
  }
  if (!conv.lastMessage) return { user: '', text: 'Нет сообщений' };
  return { user: conv.lastFrom === currentUser ? null : conv.lastFrom, text: conv.lastMessage };
}

function cpRenderSidebar() {
  const root = document.getElementById('cp-sb-scroll');
  if (!root) return;
  root.innerHTML = '';

  if (cpActiveTab === 'chats') {
    const q = cpSearchQuery.toLowerCase();
    const channels = cpChannelsList().filter(c => !q || c.name.toLowerCase().includes(q));
    const dms = cpDmList().filter(c => !q || cpUser(c.user).username.toLowerCase().includes(q));

    root.appendChild(cpSectionLabel('Каналы'));
    channels.forEach(c => root.appendChild(cpChannelRow(c)));
    root.appendChild(cpSectionLabel('Личные сообщения'));
    if (dms.length === 0) root.appendChild(cpEmptyHint(cpDmConversations.length === 0 ? 'Пока нет переписок — добавьте друзей' : 'Ничего не найдено'));
    dms.forEach(c => root.appendChild(cpDmRow(c)));
  } else {
    const q = cpSearchQuery.toLowerCase();
    const incoming = cpIncoming.filter(u => u.username.toLowerCase().includes(q));
    if (incoming.length) {
      root.appendChild(cpSectionLabel(`Заявки в друзья · ${incoming.length}`));
      incoming.forEach(u => root.appendChild(cpRequestRow(u)));
    }
    const friends = cpFriends.filter(u => u.username.toLowerCase().includes(q));
    const online = friends.filter(u => u.online);
    const offline = friends.filter(u => !u.online);
    root.appendChild(cpSectionLabel(`В сети · ${online.length}`));
    online.forEach(u => root.appendChild(cpFriendRow(u)));
    root.appendChild(cpSectionLabel(`Не в сети · ${offline.length}`));
    if (offline.length === 0 && online.length === 0 && incoming.length === 0) root.appendChild(cpEmptyHint('У вас пока нет друзей'));
    offline.forEach(u => root.appendChild(cpFriendRow(u)));

    const cta = document.createElement('div');
    cta.className = 'cp-addfriend-cta';
    cta.onclick = openAddFriend;
    cta.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Добавить друга`;
    root.appendChild(cta);
  }
}

function cpSectionLabel(t) { const d = document.createElement('div'); d.className = 'cp-list-label'; d.textContent = t; return d; }
function cpEmptyHint(t) { const d = document.createElement('div'); d.className = 'cp-empty-hint'; d.textContent = t; return d; }

// ── ЕДИНЫЙ АВАТАР ПОЛЬЗОВАТЕЛЯ (круг + рамка звания + индикатор "в сети") ──
// cpAvatarHTML — строковая версия для мест, где разметка собирается через
// .map().join() в innerHTML (лидерборд, список участников клана), а не через
// createElement (как в попапе чата). Обе функции дают идентичный визуал —
// один аватар-компонент на всё приложение, а не два разных стиля.
// overrides позволяет подставить свежие данные, даже если пользователя ещё
// нет в cpUserCache (например, участник клана, который ни разу не писал в чат).
function cpAvatarHTML(username, size = '', overrides = {}) {
  const base = cpUser(username);
  const clean = {};
  Object.keys(overrides || {}).forEach(k => { if (overrides[k] !== undefined) clean[k] = overrides[k]; });
  const user = { ...base, ...clean };
  const rankClass = CP_RANK_CLASS[user.rank] || 'cp-rank-novice';
  const dot = size === 'sm' || size === 'xs'
    ? ''
    : `<div class="cp-status-dot ${user.online ? 'online' : ''}"></div>`;
  return `<div class="cp-avatar ${size} ${rankClass}">${esc(user.emoji || '👾')}${dot}</div>`;
}

function cpAvatarEl(username, size = '', overrides = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = cpAvatarHTML(username, size, overrides);
  return wrap.firstElementChild;
}

function cpChannelRow(c) {
  const row = document.createElement('div');
  row.className = 'cp-row' + (c.id === cpActiveConvId ? ' active' : '');
  row.onclick = () => cpSelectConversation(c.id);
  const p = cpRowTimePreview(c);
  const last = chatMessages[chatMessages.length - 1];
  row.innerHTML = `
    <div class="cp-channel-icon">${c.icon}</div>
    <div class="cp-row-body">
      <div class="cp-row-toprow">
        <div class="cp-row-name">${esc(c.name)}</div>
        <div class="cp-row-time">${last ? cpFmtTime(last.ts) : ''}</div>
      </div>
      <div class="cp-row-preview">${p.user ? `<span class="cp-you">${esc(p.user)}:</span> ` : ''}${esc(p.text)}</div>
    </div>
  `;
  return row;
}

function cpDmRow(c) {
  const user = cpUser(c.user);
  const row = document.createElement('div');
  row.className = 'cp-row' + (c.id === cpActiveConvId ? ' active' : '') + (c.unread > 0 ? ' unread' : '');
  row.onclick = () => cpSelectConversation(c.id);
  const p = cpRowTimePreview(c);
  row.appendChild(cpAvatarEl(c.user));
  const body = document.createElement('div');
  body.className = 'cp-row-body';
  body.innerHTML = `
    <div class="cp-row-toprow">
      <div class="cp-row-name">${esc(user.username)}</div>
      <div class="cp-row-time">${cpFmtTime(c.lastTs)}</div>
    </div>
    <div class="cp-row-preview">${p.user ? `<span class="cp-you">${esc(p.user)}:</span> ` : ''}${esc(p.text)}</div>
  `;
  row.appendChild(body);
  if (c.unread > 0) { const b = document.createElement('div'); b.className = 'cp-unread-badge'; b.textContent = c.unread; row.appendChild(b); }
  return row;
}

function cpFriendRow(u) {
  const row = document.createElement('div');
  row.className = 'cp-row';
  row.onclick = () => cpSelectConversation('dm-' + u.username);
  row.appendChild(cpAvatarEl(u.username));
  const body = document.createElement('div');
  body.className = 'cp-row-body';
  body.innerHTML = `
    <div class="cp-row-name">${esc(u.username)}</div>
    <div class="cp-row-preview">${CP_STATUS_LABEL[u.online ? 'online' : 'offline']}</div>
  `;
  row.appendChild(body);
  return row;
}

function cpRequestRow(u) {
  const row = document.createElement('div');
  row.className = 'cp-freq-row';
  row.appendChild(cpAvatarEl(u.username));
  const body = document.createElement('div');
  body.className = 'cp-row-body';
  body.innerHTML = `<div class="cp-row-name">${esc(u.username)}</div><div class="cp-row-preview">хочет добавить вас в друзья</div>`;
  row.appendChild(body);
  const actions = document.createElement('div');
  actions.className = 'cp-freq-actions';
  actions.innerHTML = `
    <button class="cp-freq-btn accept" title="Принять"><svg class="icon" style="width:14px;height:14px" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></button>
    <button class="cp-freq-btn decline" title="Отклонить"><svg class="icon" style="width:14px;height:14px" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  `;
  actions.children[0].onclick = (e) => { e.stopPropagation(); cpAcceptFriendReq(u.username); cpToast(`${u.username} теперь в друзьях`); };
  actions.children[1].onclick = (e) => { e.stopPropagation(); cpDeclineFriendReq(u.username); cpToast('Заявка отклонена'); };
  row.appendChild(actions);
  return row;
}

function cpUpdateFreqBadge() {
  const el = document.getElementById('cp-freq-count');
  if (!el) return;
  if (cpIncoming.length === 0) { el.style.display = 'none'; } else { el.style.display = ''; el.textContent = cpIncoming.length; }
}

function switchTab(tab) {
  cpActiveTab = tab;
  document.getElementById('cp-tab-chats').classList.toggle('active', tab === 'chats');
  document.getElementById('cp-tab-friends').classList.toggle('active', tab === 'friends');
  cpRenderSidebar();
}

function onSearch(v) { cpSearchQuery = v; cpRenderSidebar(); }

function cpSelectConversation(id) {
  cpActiveConvId = id;
  const conv = cpGetActiveConv();
  if (conv.type === 'dm') {
    if (conv.unread) { const c = cpDmConversations.find(x => x.username === conv.user); if (c) c.unread = 0; }
    if (!cpDmThreads[conv.user]) cpFetchDmHistory(conv.user);
    sendJSON({ action:'dm_mark_read', with: conv.user });
  }
  cpRenderSidebar();
  cpRenderHeader(conv);
  cpRenderMessages(conv);
  cpRenderInfoPanel(conv);
  document.getElementById('chat-popup-panel').classList.add('cp-chat-open');
}

function closeChatMobile() { document.getElementById('chat-popup-panel').classList.remove('cp-chat-open'); }

function cpRenderHeader(conv) {
  const nameEl = document.getElementById('cp-mh-name');
  const subEl = document.getElementById('cp-mh-sub');
  const avEl = document.getElementById('cp-mh-avatar');

  if (conv.type === 'channel') {
    avEl.outerHTML = `<div class="cp-channel-icon" id="cp-mh-avatar">${conv.icon}</div>`;
    nameEl.textContent = conv.name;
    subEl.textContent = conv.desc;
  } else {
    const u = cpUser(conv.user);
    const fresh = cpAvatarEl(conv.user);
    fresh.id = 'cp-mh-avatar';
    document.getElementById('cp-mh-avatar').replaceWith(fresh);
    nameEl.textContent = u.username;
    subEl.innerHTML = `<span class="cp-sqdot" style="background:${u.online ? 'var(--green)' : 'var(--text3)'}"></span>${CP_STATUS_LABEL[u.online ? 'online' : 'offline']}`;
  }
}

// Рисует реальный кусок холста 11×11 вокруг прикреплённой точки (а не
// случайные цвета "для вида"), чтобы в сообщении правда было видно место,
// а не абстрактную мозаику. По центру — флажок-маркер самой точки.
function cpCanvasCardHTML(cx, cy) {
  const RADIUS = 5; // зона вокруг точки: 11×11 клеток
  let cells = '';
  for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      const x = cx + dx, y = cy + dy;
      let bg = 'var(--surface3)'; // за пределами холста
      if (x >= 0 && x < canvasW && y >= 0 && y < canvasH) {
        const idx = canvasData[y * canvasW + x];
        bg = (PALETTE[idx] || PALETTE[0]).c;
      }
      const isCenter = dx === 0 && dy === 0;
      cells += `<div style="background:${bg}">${isCenter ? '<span class="cc-flag">🚩</span>' : ''}</div>`;
    }
  }
  return `
    <div class="cp-canvas-card">
      <div class="cc-grid cc-grid-11">${cells}</div>
      <div class="cc-foot">
        <div class="cc-coords">X:${cx} Y:${cy}</div>
        <div class="cc-go" data-onclick="jumpToCanvas(${cx},${cy})">Перейти →</div>
      </div>
    </div>`;
}

const CP_CANVAS_MARK_RE = /\[\[canvas:(-?\d+):(-?\d+)\]\]/;
function cpMsgBodyHTML(text) {
  const m = text.match(CP_CANVAS_MARK_RE);
  if (!m) return esc(text);
  const rest = text.replace(CP_CANVAS_MARK_RE, '').trim();
  return (rest ? esc(rest) + '<div style="height:6px"></div>' : '') + cpCanvasCardHTML(+m[1], +m[2]);
}

// Единый рендер сообщений — используется и для общего чата, и для ЛС,
// чтобы не поддерживать два разных визуальных стиля (раньше ЛС рисовались
// пузырями cp-bubble-row, а общий чат — группами cp-msg-group). Теперь оба
// используют группы: аватар + ник только у первого сообщения "пачки" от
// одного автора, у последующих подряд идущих сообщений — только время по
// ховеру слева (cp-msg-continued-row).
function cpRenderMessages(conv) {
  const root = document.getElementById('cp-messages');
  if (!root) return;
  root.innerHTML = '';
  const isChannel = conv.type === 'channel';
  const thread = isChannel ? chatMessages : (cpDmThreads[conv.user] || []);

  root.appendChild(cpDaySeparator(isChannel ? 'Сегодня' : 'Начало переписки'));

  if (thread.length === 0) {
    root.appendChild(cpEmptyHint(isChannel ? 'Пока нет сообщений — начните разговор' : 'Напишите первое сообщение'));
  } else {
    let lastUser = null;
    thread.forEach(m => {
      const uname = isChannel ? m.username : m.from;
      if (uname !== lastUser) {
        const g = document.createElement('div');
        g.className = 'cp-msg-group';
        g.appendChild(cpAvatarEl(uname));
        const col = document.createElement('div');
        col.className = 'cp-msg-col';
        col.innerHTML = `
          <div class="cp-msg-headline"><span class="cp-msg-user">${esc(uname)}</span><span class="cp-msg-time">${cpFmtTime(m.ts)}</span></div>
          <div class="cp-msg-text">${cpMsgBodyHTML(m.text)}</div>
        `;
        g.appendChild(col);
        root.appendChild(g);
      } else {
        const g = document.createElement('div');
        g.className = 'cp-msg-continued-row cp-msg-continued';
        g.innerHTML = `
          <div class="cp-msg-time-hover">${cpFmtTime(m.ts)}</div>
          <div class="cp-msg-col"><div class="cp-msg-text">${cpMsgBodyHTML(m.text)}</div></div>`;
        root.appendChild(g);
      }
      lastUser = uname;
    });
  }

  cpRenderTypingRow();
  root.scrollTop = root.scrollHeight + 999;
}

function cpOnGlobalMessage(msg) {
  if (cpActiveConvId === 'ch-general') cpRenderMessages(cpGetActiveConv());
  if (chatOpen) cpRenderSidebar();
}

function cpDaySeparator(t) { const d = document.createElement('div'); d.className = 'cp-day-sep'; d.textContent = t; return d; }

function toggleInfo() {
  cpInfoOpen = !cpInfoOpen;
  document.getElementById('chat-popup-panel').classList.toggle('cp-info-open', cpInfoOpen);
  document.getElementById('cp-info-toggle-btn').classList.toggle('active', cpInfoOpen);
}

function cpRenderInfoPanel(conv) {
  const root = document.getElementById('cp-info-inner');
  if (!root) return;
  if (conv.type === 'channel') {
    root.innerHTML = `
      <div class="cp-ip-close"><button class="cp-modal-x" data-onclick="toggleInfo()"><svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="cp-ip-profile">
        <div class="cp-channel-icon" style="width:72px;height:72px;border-radius:20px;font-size:30px;margin:0 auto 12px;">${conv.icon}</div>
        <div class="cp-ip-name">${esc(conv.name)}</div>
        <div class="cp-ip-rank">${esc(conv.desc)}</div>
      </div>
      <div class="cp-ip-section-label">Правила</div>
      <div style="font-size:12.5px;color:var(--text2);line-height:1.6;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:11px 12px;">
        Без спама, уважайте чужие работы на холсте
      </div>
    `;
    return;
  }

  const u = cpUser(conv.user);
  const isFriend = cpFriends.some(f => f.username === conv.user);
  const requestSent = cpOutgoing.some(f => f.username === conv.user);
  root.innerHTML = `
    <div class="cp-ip-close"><button class="cp-modal-x" data-onclick="toggleInfo()"><svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="cp-ip-profile">
      ${cpAvatarEl(conv.user, 'lg').outerHTML}
      <div class="cp-ip-name">${esc(u.username)}</div>
      <div class="cp-ip-rank">${esc(u.rank || 'Новичок')}${u.clan ? ' · ' + esc(u.clan) : ''}</div>
    </div>
    <div class="cp-ip-stats">
      <div class="cp-ip-stat"><div class="v mono">${(u.pixels||0).toLocaleString('ru-RU')}</div><div class="l">пикселей</div></div>
      <div class="cp-ip-stat"><div class="v mono">${u.online ? 'в сети' : 'офлайн'}</div><div class="l">статус</div></div>
    </div>
    <div class="cp-ip-actions">
      ${isFriend
        ? `<button class="cp-ip-btn danger" data-onclick="cpRemoveFriendUI('${esc(conv.user)}')"><svg class="icon" style="width:15px;height:15px" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M17 8l5 5M22 8l-5 5"/></svg> Удалить из друзей</button>`
        : requestSent
          ? `<button class="cp-ip-btn" data-onclick="cpCancelFriendReq('${esc(conv.user)}')">Отменить заявку</button>`
          : `<button class="cp-ip-btn" data-onclick="cpSendFriendRequest('${esc(conv.user)}')"><svg class="icon" style="width:15px;height:15px" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Добавить в друзья</button>`}
    </div>
  `;
}

function cpRemoveFriendUI(username) {
  cpRemoveFriendReq(username);
  cpToast(`${username} удалён из друзей`);
}

function jumpToCanvas(x, y) {
  closeChatPopup();
  const vw = window.innerWidth, vh = window.innerHeight;
  targetCamZoom = Math.max(targetCamZoom, 4);
  targetCamX = vw / 2 - x * targetCamZoom;
  targetCamY = vh / 2 - y * targetCamZoom;
  if (!smoothCamera) { camX = targetCamX; camY = targetCamY; camZoom = targetCamZoom; applyTransform(); updateAllCursorFlags(); }
  else startSmoothAnim();
  cpToast(`Переход к холсту: ${x}, ${y}`);
}

function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

function onComposerInput(el) {
  autoGrow(el);
  if (el.value.trim()) cpSendTyping();
}

function onComposerKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function sendMessage() {
  if (!isLoggedIn) { cpToast('Сначала войдите в аккаунт'); return; }
  const input = document.getElementById('cp-composer-input');
  const text = input.value.trim();
  if (!text) return;
  const conv = cpGetActiveConv();
  if (conv.type === 'channel') sendJSON({ action:'chat_send', text });
  else sendJSON({ action:'dm_send', to: conv.user, text });
  input.value = ''; input.style.height = 'auto';
}

// Раньше эта функция сразу отправляла сообщение с координатами последней
// наведённой точки холста (часто устаревшей/случайной, т.к. попап чата
// перекрывает холст). Теперь — честный режим "укажи точку": попап чата
// прячется, показывается баннер-подсказка, курсор становится прицелом, и
// координаты берутся из реального клика по холсту. После клика попап чата
// открывается обратно, а токен места вставляется в поле ввода — пользователь
// сам решает, отправлять сразу или дописать текст.
function attachCanvasSnippet() {
  if (!isLoggedIn) { cpToast('Сначала войдите в аккаунт'); return; }
  const conv = cpGetActiveConv();
  canvasAttachConvId = conv.id;
  canvasAttachPickMode = true;
  document.getElementById('chat-popup-overlay').classList.remove('show');
  document.getElementById('chat-btn').classList.remove('active');
  document.body.classList.add('canvas-attach-picking');
  document.getElementById('canvas-attach-banner').classList.add('show');
}

function cancelCanvasAttachPick() {
  canvasAttachPickMode = false;
  canvasAttachConvId = null;
  document.body.classList.remove('canvas-attach-picking');
  document.getElementById('canvas-attach-banner').classList.remove('show');
}

// Вызывается из input.js по клику на холст, пока активен режим выбора точки.
function confirmCanvasAttachPick(x, y) {
  if (!canvasAttachPickMode) return;
  const convId = canvasAttachConvId;
  cancelCanvasAttachPick();

  openChatPopup();
  if (convId) cpSelectConversation(convId);

  const input = document.getElementById('cp-composer-input');
  if (input) {
    const marker = `[[canvas:${x}:${y}]]`;
    input.value = input.value ? (input.value.trim() + ' ' + marker) : marker;
    if (typeof autoGrow === 'function') autoGrow(input);
    input.focus();
  }
  cpToast(`Место (${x}, ${y}) прикреплено к сообщению`);
}

function quickEmoji() {
  const input = document.getElementById('cp-composer-input');
  const emojis = ['🔥', '👍', '✨'];
  input.value += emojis[Math.floor(Math.random() * emojis.length)];
  input.focus();
}

function openAddFriend() {
  document.getElementById('cp-add-friend-backdrop').classList.add('show');
  document.getElementById('cp-modal-search-input').value = '';
  cpSearchResults = [];
  cpRenderSearchResults();
  setTimeout(() => document.getElementById('cp-modal-search-input').focus(), 80);
}
function closeAddFriend() { document.getElementById('cp-add-friend-backdrop').classList.remove('show'); }

function filterSuggestions(q) {
  clearTimeout(cpSearchDebounceTimer);
  if (!q.trim()) { cpSearchResults = []; cpRenderSearchResults(); return; }
  cpSearchDebounceTimer = setTimeout(() => cpSearchUsers(q.trim()), 250);
}

function cpRenderSearchResults() {
  const root = document.getElementById('cp-suggest-list');
  if (!root) return;
  root.innerHTML = '';
  const q = document.getElementById('cp-modal-search-input')?.value || '';
  if (!q.trim()) return;
  if (cpSearchResults.length === 0) { root.appendChild(cpEmptyHint('Пользователь не найден')); return; }
  cpSearchResults.forEach(u => {
    const row = document.createElement('div');
    row.className = 'cp-suggest-row';
    const isFriend = u.isFriend;
    const label = isFriend ? 'В друзьях' : u.requestSent ? 'Отправлено' : u.requestReceived ? 'Принять' : 'Добавить';
    row.innerHTML = `
      ${cpAvatarEl(u.username, 'sm').outerHTML}
      <div class="cp-row-body"><div class="cp-row-name">${esc(u.username)}</div><div class="cp-row-preview">${esc(u.rank || 'Новичок')}</div></div>
      <div class="cp-suggest-add ${isFriend || u.requestSent ? 'added' : ''}">${label}</div>
    `;
    if (!isFriend) {
      row.querySelector('.cp-suggest-add').onclick = () => {
        if (u.requestReceived) cpAcceptFriendReq(u.username);
        else if (!u.requestSent) cpSendFriendRequest(u.username);
        else return;
        cpToast(u.requestReceived ? `Вы подружились с ${u.username}` : `Заявка отправлена: ${u.username}`);
        setTimeout(() => cpSearchUsers(q.trim()), 150);
      };
    }
    root.appendChild(row);
  });
}

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.getElementById('cp-add-friend-backdrop')?.classList.contains('show')) closeAddFriend();
});