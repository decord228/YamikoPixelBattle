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
  const adminDiv=document.getElementById('divider-before-admin');
  if(adminDiv) adminDiv.style.display=isAdmin?'':'none';
  document.querySelectorAll('.admin-tool-btn').forEach(el => el.style.display = isAdmin?'flex':'none');
  
  if (isAdmin){loadAdminUsers();}
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
function unshareClanStencil() {
  if (!clanSharedStencil || clanSharedStencil.owner !== currentUser) return;
  if (!confirm('Снять ваш трафарет с показа всему клану?')) return;
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
  img.src=data.img;
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
  sendJSON({action:'chat_send', text});
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

function disbandClan(){
  if (!confirm('Распустить клан? Все участники будут исключены, это действие необратимо.')) return;
  sendJSON({action:'clan_disband'});
}

function toggleClanCursor(){ sendJSON({action:'clan_toggle_cursor'}); }

function sendClanChat() {
  const input = document.getElementById('clan-chat-input');
  const text = input.value.trim();
  if (!text || !isLoggedIn || !currentClan) return;
  sendJSON({action:'clan_chat_send', text});
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
  const icon       = document.getElementById('cs-icon').value || '🏴';
  const tag_color  = document.getElementById('cs-tag-color').value || '#818cf8';
  const join_type  = document.getElementById('cs-join-type').value || 'open';
  const min_pixels = parseInt(document.getElementById('cs-min-pixels').value) || 0;
  const is_public  = document.getElementById('cs-public-toggle').classList.contains('on');
  const share_cursor = document.getElementById('cs-cursor-toggle').classList.contains('on');
  const message_of_day = (document.getElementById('cs-motd').value || '').trim().slice(0, 200);

  sendJSON({
    action: 'clan_update_settings',
    settings: { icon, tag_color, join_type, min_pixels, is_public, share_cursor, message_of_day }
  });

  // Update display immediately (optimistic)
  const dispTag = document.getElementById('clan-disp-tag');
  if (dispTag) {
    const rawTag = dispTag.dataset.tag || dispTag.textContent.replace(/^\S+\s+/, '');
    dispTag.textContent = icon + ' ' + rawTag;
    dispTag.style.color = tag_color;
    dispTag.style.background = tag_color + '22';
    dispTag.style.borderColor = tag_color + '55';
  }
  const iconPreview = document.getElementById('cs-icon-preview');
  if (iconPreview) iconPreview.textContent = icon;
  if (message_of_day) {
    const motdEl = document.getElementById('clan-motd-text');
    if (motdEl) motdEl.textContent = message_of_day;
  }
  showToast('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043a\u043b\u0430\u043d\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b \u2713', 'success');
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
        <button class="action-btn ab-unban" data-onclick="sendJSON({action:'clan_accept_request',username:'${esc(r)}'})"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5l4.5 4.5L19 7"/></svg> Принять</button>
        <button class="action-btn ab-ban" data-onclick="sendJSON({action:'clan_deny_request',username:'${esc(r)}'})"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg> Отказать</button>
      </div>
    </div>`).join('');
}

function renderClanView(clan){
  currentClan=clan.name||'';
  document.getElementById('clan-view-no-clan').style.display='none';
  document.getElementById('clan-view-in-clan').style.display='';
  document.getElementById('clan-disp-name').textContent=clan.name||'';
  const dispTag = document.getElementById('clan-disp-tag');
  dispTag.textContent = (clan.icon ? clan.icon + ' ' : '') + (clan.tag||'');
  const tc = clan.tag_color || '#818cf8';
  dispTag.style.color = tc;
  dispTag.style.background = tc + '22';
  dispTag.style.borderColor = tc + '55';
  document.getElementById('clan-disp-desc').textContent=clan.description||'';
  document.getElementById('clan-disp-leader').textContent=clan.leader||'';
  document.getElementById('clan-disp-members').textContent=(clan.members||[]).length;
  if (clan.motd||clan.message_of_day) document.getElementById('clan-motd-text').textContent = clan.motd||clan.message_of_day;
  
  const isLeader=currentUser===clan.leader;
  const settingsTab = document.getElementById('clan-settings-tab');
  if (settingsTab) settingsTab.style.display = isLeader ? '' : 'none';
  
  const tog=document.getElementById('clan-cursor-toggle');
  if (tog){clanShareCursor=!!clan.share_cursor;tog.classList.toggle('on',clanShareCursor);}

  // Show disband button only for leader
  const disbandBtn = document.getElementById('clan-disband-btn');
  const leaveBtn = document.getElementById('clan-leave-btn');
  if (disbandBtn && leaveBtn) {
    disbandBtn.style.display = isLeader ? '' : 'none';
    leaveBtn.style.display = isLeader ? 'none' : '';
  }

  // Populate settings form for leader
  if (isLeader) {
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

    const motdInput = document.getElementById('cs-motd');
    if (motdInput) motdInput.value = clan.message_of_day || clan.motd || '';
  }
  
  // Store members + leader for paginated rendering
  _clanMembers = clan.members || [];
  _clanLeader = clan.leader || '';
  _clanIsLeader = isLeader;
  _clanMemberPage = 1;
  renderClanMemberPage();
}

// ── CLAN MEMBER PAGINATION ──
let _clanMembers = [], _clanLeader = '', _clanIsLeader = false, _clanMemberPage = 1;
const CLAN_PAGE_SIZE = 10;

function renderClanMemberPage() {
  const ml = document.getElementById('clan-member-list');
  const pg = document.getElementById('clan-member-pagination');
  if (!ml) return;

  const total = _clanMembers.length;
  const totalPages = Math.max(1, Math.ceil(total / CLAN_PAGE_SIZE));
  _clanMemberPage = Math.max(1, Math.min(_clanMemberPage, totalPages));
  const start = (_clanMemberPage - 1) * CLAN_PAGE_SIZE;
  const page = _clanMembers.slice(start, start + CLAN_PAGE_SIZE);

  ml.innerHTML = page.map(m => {
    const isLdr = m === _clanLeader;
    const canKick = _clanIsLeader && m !== currentUser && !isLdr;
    return `<div class="member-row">
      <div class="member-row-info">
        <span class="member-row-emoji">${isLdr ? '\u{1F451}' : '\u{1F464}'}</span>
        <span class="member-row-name${isLdr ? ' member-row-leader' : ''}">${esc(m)}</span>
        ${isLdr ? '<span class="member-leader-badge">\u041b\u0438\u0434\u0435\u0440</span>' : ''}
      </div>
      ${canKick ? `<button class="member-kick-btn" data-onclick="kickClanMember('${esc(m)}')" title="\u041a\u0438\u043a\u043d\u0443\u0442\u044c">
        <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
      </button>` : ''}
    </div>`;
  }).join('');

  if (!pg) return;
  if (totalPages <= 1) { pg.style.display = 'none'; return; }
  pg.style.display = 'flex';
  pg.innerHTML = `
    <button class="page-btn" data-onclick="_clanMemberPage--;renderClanMemberPage()" ${_clanMemberPage<=1?'disabled':''}>&#8249; \u041f\u0440\u0435\u0434</button>
    <span class="page-info">${_clanMemberPage} / ${totalPages}</span>
    <button class="page-btn" data-onclick="_clanMemberPage++;renderClanMemberPage()" ${_clanMemberPage>=totalPages?'disabled':''}>\u0421\u043b\u0435\u0434 &#8250;</button>`;
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
    <div class="clan-card" style="cursor:pointer" data-onclick="document.getElementById('clan-join-name').value='${esc(cl.name)}';switchClanSubTab('join')">
      <div class="clan-name"><span>${esc(cl.name)}</span><span class="clan-tag" style="color:${cl.tag_color||'#818cf8'};background:${(cl.tag_color||'#818cf8')+ '22'};border-color:${(cl.tag_color||'#818cf8')+'55'}">${(cl.icon?cl.icon+' ':'')+ esc(cl.tag||'')}</span></div>
      <div class="clan-meta"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3.3 2.7-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M16 8.3a2.6 2.6 0 1 1 0 5.1"/><path d="M16 14c2.4 0 4.5 1.8 4.5 5"/></svg> ${cl.members} · <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5.5-5.5L9 16l-2.5-2.5L3 17"/></svg> ${(cl.pixels||0).toLocaleString()} пикс.</div>
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
        ${owned ? '<span class="shop-owned"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5l4.5 4.5L19 7"/></svg> Куплено</span>' : `<span class="shop-price">🪙 ${item.cost}</span>`}
      </div>
      <div class="shop-item-desc">${item.desc}</div>
      ${!owned && reqMet ? `<button class="btn btn-primary btn-sm" data-data-data-onclick="buyItem('${item.id}')">Купить (${item.cost} 🪙)</button>` : ''}
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
          <button class="btn btn-vip btn-sm" data-data-data-onclick="buyItem('${item.id}')">Купить (${item.cost} 🪙)</button>
          ${count > 0 ? `<button class="btn btn-secondary btn-sm" data-data-data-onclick="activateItem('${item.id}')"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg> Использовать (${count})</button>` : ''}
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
        <button class="btn btn-primary btn-sm" data-data-data-onclick="useAdminShopItem('${item.id}')">Применить</button>
      </div>`;
    });
    html += '</div>';
  }
  body.innerHTML = html;
}

function getItemCount(itemId) { return Array.isArray(purchasedItems) ? purchasedItems.filter(i => i === itemId).length : 0; }
function buyItem(itemId) { sendJSON({action:'shop_buy', itemId: itemId}); }

function useAdminShopItem(itemId) {
  if (itemId === 'admin_nuke') {
    if (!confirm('Очистить весь холст?')) return;
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
      <div class="lb-rank ${i===0?'lb-rank-1':i===1?'lb-rank-2':i===2?'lb-rank-3':'lb-rank-n'}">${i<3?['<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>','<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>','<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l-1.3 5.4L12 11l-1.7-2.6L9 3z"/><circle cx="12" cy="15.5" r="5"/><path d="M9.7 14.3l1.6 1.6 2.8-2.8" stroke-width="1.7"/></svg>'][i]:i+1}</div>
      <span class="clan-tag" style="color:${cl.tag_color||'#818cf8'};background:${(cl.tag_color||'#818cf8')+'22'};border-color:${(cl.tag_color||'#818cf8')+'55'}">${(cl.icon?cl.icon+' ':'')+esc(cl.tag||'')}</span>
      <div class="lb-name">${esc(cl.name)}</div>
      <div style="font-size:11px;color:var(--text3)"><svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3.3 2.7-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M16 8.3a2.6 2.6 0 1 1 0 5.1"/><path d="M16 14c2.4 0 4.5 1.8 4.5 5"/></svg>${cl.members}</div>
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
  ['users','canvas','broadcast','stats','clans'].forEach(t=>{ document.getElementById(`admin-tab-${t}`).style.display=t===tab?'':'none'; });
  document.querySelectorAll('.admin-tab').forEach((el,i)=>{ el.classList.toggle('active',['users','canvas','broadcast','stats','clans'][i]===tab); });
  if (tab==='stats') loadAdminStats();
  if (tab==='clans') loadAdminClans();
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
  leaderboardOpen = false;
  document.getElementById('btn-leaderboard')?.classList.remove('active');
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
        <button class="action-btn ab-ban" data-onclick="adminDeleteClan('${esc(cl.name)}')">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          \u0423\u0434\u0430\u043b\u0438\u0442\u044c
        </button>
        <button class="action-btn ab-msg" data-onclick="adminBroadcastToClan('${esc(cl.name)}')">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6.5l8.5 6 8.5-6"/></svg>
          \u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435
        </button>
      </div>
    </div>`;
  }).join('');
}

function adminDeleteClan(name) {
  if (!confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043a\u043b\u0430\u043d \u00ab' + name + '\u00bb? \u0412\u0441\u0435 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438 \u0431\u0443\u0434\u0443\u0442 \u0438\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u044b.')) return;
  sendJSON({action:'admin_cmd', cmd:'delete_clan', params:{name}});
  setTimeout(() => loadAdminClans(), 400);
}

function adminBroadcastToClan(name) {
  const msg = prompt('\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u043a\u043b\u0430\u043d\u0430 \u00ab' + name + '\u00bb:');
  if (!msg) return;
  sendJSON({action:'admin_cmd', cmd:'clan_broadcast', params:{name, message: msg}});
  showToast('\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e', 'success');
}

function filterAdminClans() {
  const q = document.getElementById('admin-clans-search').value.toLowerCase();
  const filtered = q ? adminClansData.filter(cl => cl.name.toLowerCase().includes(q) || (cl.tag||'').toLowerCase().includes(q)) : adminClansData;
  renderAdminClans(filtered);
}