'use strict';

// ── CANVAS SETUP & RENDER ──
function initCanvases() {
  mainCanvas.width = canvasW; mainCanvas.height = canvasH;
  resizeOverlay();
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0,0,canvasW,canvasH);
  applyTransform();
}

function resizeOverlay() {
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
  renderOverlay();
}

function getRenderOffset() {
  return { x: Math.floor(camX), y: Math.floor(camY) };
}

function applyTransform() {
  const off = getRenderOffset();
  const t = `translate(${off.x}px,${off.y}px) scale(${camZoom})`;
  mainCanvas.style.transform = t;
  shadowDiv.style.transform = t;
  shadowDiv.style.width = canvasW + 'px';
  shadowDiv.style.height = canvasH + 'px';
  renderOverlay();
}

function renderPixel(x,y,colorIdx) {
  const c = PALETTE[colorIdx] || PALETTE[0];
  mctx.fillStyle = c.c;
  mctx.fillRect(x,y,1,1);
}

function fullRender(data) {
  const imgData = mctx.createImageData(canvasW, canvasH);
  const buf = imgData.data;
  for (let i=0;i<data.length;i++) {
    const col = PALETTE[data[i]] || PALETTE[0];
    const hex = col.c;
    buf[i*4]   = parseInt(hex.slice(1,3),16);
    buf[i*4+1] = parseInt(hex.slice(3,5),16);
    buf[i*4+2] = parseInt(hex.slice(5,7),16);
    buf[i*4+3] = 255;
  }
  mctx.putImageData(imgData,0,0);
}

// Ввод, курсоры и сетка могут запрашивать перерисовку десятки раз за кадр.
// Объединяем их в один requestAnimationFrame: это убирает накопление дорогих
// clear/draw-операций и мерцание UI после долгой игры.
let _overlayRenderFrame = 0;
function renderOverlay() {
  if (_overlayRenderFrame) return;
  _overlayRenderFrame = requestAnimationFrame(() => {
    _overlayRenderFrame = 0;
    renderOverlayNow();
  });
}

function renderOverlayNow() {
  octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Во время тайм-лапса в полноэкранном режиме оверлей (сетка, трафарет/шаблон,
  // курсор, инструменты админа и т.д.) рисуется поверх ИГРОВОЙ камеры (camX/camY/
  // camZoom), а не камеры тайм-лапса. Раньше это приводило к тому, что активный
  // трафарет/шаблон оставался виден прямо над воспроизведением тайм-лапса.
  // Тайм-лапс показывает только историю холста — никаких оверлеев ему не нужно.
  if (typeof tlFullscreen !== 'undefined' && tlFullscreen) {
    const label = document.getElementById('stencil-label');
    if (label) label.style.display = 'none';
    return;
  }

  const off = getRenderOffset();

  // Применяем ту же матрицу трансформации, что и CSS, чтобы избежать субпиксельных сдвигов
  octx.save();
  octx.translate(off.x, off.y);
  octx.scale(camZoom, camZoom);

  // Сетка
  if (gridEnabled && camZoom >= 4) {
    octx.strokeStyle = 'rgba(0,0,0,0.3)';
    octx.lineWidth = 1 / camZoom; // Чтобы толщина линии всегда была 1 пиксель на экране
    octx.beginPath();
    
    const startX = Math.max(0, Math.floor(-off.x / camZoom));
    const endX = Math.min(canvasW, Math.ceil((overlayCanvas.width - off.x) / camZoom));
    const startY = Math.max(0, Math.floor(-off.y / camZoom));
    const endY = Math.min(canvasH, Math.ceil((overlayCanvas.height - off.y) / camZoom));

    for (let i = startX; i <= endX; i++) {
      octx.moveTo(i, startY);
      octx.lineTo(i, endY);
    }
    for (let j = startY; j <= endY; j++) {
      octx.moveTo(startX, j);
      octx.lineTo(endX, j);
    }
    octx.stroke();
  }

  // Фигуры админа
  if (isDraggingAdminShape && (tool === 'admin_rect' || tool === 'admin_circle' || tool === 'admin_line')) {
      octx.strokeStyle = PALETTE[selectedColor].c;
      octx.fillStyle = PALETTE[selectedColor].c + '80';
      octx.lineWidth = 1; 
      
      if (tool === 'admin_rect') {
          let rx1 = Math.min(adminShapeStart.x, adminShapeEnd.x);
          let ry1 = Math.min(adminShapeStart.y, adminShapeEnd.y);
          let rw = Math.abs(adminShapeStart.x - adminShapeEnd.x) + 1;
          let rh = Math.abs(adminShapeStart.y - adminShapeEnd.y) + 1;
          if (adminShapeFilled) octx.fillRect(rx1, ry1, rw, rh);
          octx.strokeRect(rx1, ry1, rw, rh);
      } else {
          let cxStart = adminShapeStart.x + 0.5;
          let cyStart = adminShapeStart.y + 0.5;
          let cxEnd = adminShapeEnd.x + 0.5;
          let cyEnd = adminShapeEnd.y + 0.5;

          if (tool === 'admin_circle') {
             let r = Math.hypot(adminShapeEnd.x - adminShapeStart.x, adminShapeEnd.y - adminShapeStart.y);
             octx.beginPath();
             octx.arc(cxStart, cyStart, r, 0, Math.PI*2);
             if(adminShapeFilled) octx.fill();
             octx.stroke();
          } else if (tool === 'admin_line') {
             octx.beginPath();
             octx.moveTo(cxStart, cyStart);
             octx.lineTo(cxEnd, cyEnd);
             octx.stroke();
          }
      }
  }

  // Выделение админа
  if (tool === 'admin_move') {
      if (adminMoveState === 'select' && isDraggingAdminShape) {
          let rx1 = Math.min(adminShapeStart.x, adminShapeEnd.x);
          let ry1 = Math.min(adminShapeStart.y, adminShapeEnd.y);
          let rw = Math.abs(adminShapeStart.x - adminShapeEnd.x) + 1;
          let rh = Math.abs(adminShapeStart.y - adminShapeEnd.y) + 1;
          
          octx.strokeStyle = '#ffffff'; octx.lineWidth = 2 / camZoom; 
          octx.setLineDash([8 / camZoom, 4 / camZoom]);
          octx.strokeRect(rx1, ry1, rw, rh); octx.setLineDash([]);
      } else if ((adminMoveState === 'selected' || adminMoveState === 'moving') && adminMoveRect && adminMoveCanvas) {
          octx.globalAlpha = 0.8; octx.imageSmoothingEnabled = false;
          octx.drawImage(adminMoveCanvas, adminMoveRect.dx, adminMoveRect.dy, adminMoveRect.w, adminMoveRect.h); 
          octx.globalAlpha = 1.0;
          octx.strokeStyle = '#eab308'; octx.lineWidth = 2 / camZoom; 
          octx.setLineDash([6 / camZoom, 3 / camZoom]);
          octx.strokeRect(adminMoveRect.dx, adminMoveRect.dy, adminMoveRect.w, adminMoveRect.h); 
          octx.setLineDash([]);
      }
  }

  // Инструмент загрузки картинок
  if ((tool==='admin_image' || adminImagePreviewMode) && adminImgObj) {
    let ir=adminImgRect;
    octx.globalAlpha=0.75; octx.imageSmoothingEnabled=false;
    octx.drawImage(adminImgObj, ir.x, ir.y, ir.w, ir.h); 
    octx.globalAlpha=1.0;
    octx.strokeStyle='#6366f1'; octx.lineWidth=2 / camZoom; 
    octx.strokeRect(ir.x, ir.y, ir.w, ir.h);
    octx.fillStyle='#ffffff'; octx.strokeStyle='#6366f1'; octx.lineWidth=2.5 / camZoom;
    const r = 7 / camZoom;
    [[ir.x, ir.y], [ir.x+ir.w, ir.y], [ir.x, ir.y+ir.h], [ir.x+ir.w, ir.y+ir.h]].forEach(([cx,cy])=>{
      octx.beginPath(); octx.arc(cx, cy, r, 0, Math.PI*2); octx.fill(); octx.stroke();
    });
  }

  // Трафарет
  if (stencilActive && stencilImg) {
    let ir=stencilRect;
    octx.globalAlpha=stencilOpacity; octx.imageSmoothingEnabled=false;
    octx.drawImage(stencilImg, ir.x, ir.y, ir.w, ir.h); 
    octx.globalAlpha=1;
    
    if (stencilEditMode) {
      octx.strokeStyle='#22c55e'; octx.lineWidth=2 / camZoom;
      octx.setLineDash([6 / camZoom, 3 / camZoom]); 
      octx.strokeRect(ir.x, ir.y, ir.w, ir.h); 
      octx.setLineDash([]);
    } else {
      // Лёгкая "бегущая" обводка, чтобы трафарет визуально отличался от уже
      // выставленных пикселей холста, даже когда редактирование выключено.
      const t = performance.now() / 1000;
      const dashLen = 5 / camZoom, gapLen = 4 / camZoom;
      const dashOffset = -(t * 14) % (dashLen + gapLen);
      const pulse = 0.45 + 0.25 * Math.sin(t * 2.2); // 0.2 .. 0.7
      octx.save();
      octx.strokeStyle = `rgba(255,255,255,${pulse.toFixed(2)})`;
      octx.lineWidth = 1.5 / camZoom;
      octx.setLineDash([dashLen, gapLen]);
      octx.lineDashOffset = dashOffset;
      octx.strokeRect(ir.x, ir.y, ir.w, ir.h);
      // Второй контур контрастным тёмным цветом снизу, чтобы обводка была
      // видна и на светлом, и на тёмном фоне холста.
      octx.strokeStyle = `rgba(0,0,0,${(pulse*0.6).toFixed(2)})`;
      octx.lineDashOffset = dashOffset + (dashLen + gapLen) / 2;
      octx.strokeRect(ir.x, ir.y, ir.w, ir.h);
      octx.setLineDash([]);
      octx.restore();
    }
  }

  // Лейбл-плашка над трафаретом (DOM, не на canvas — текст должен оставаться
  // читаемым при любом зуме). Показывается только когда трафарет не в режиме
  // редактирования — в этот момент важно не спутать его с пикселями холста.
  updateStencilLabel();

  // Курсор / Пипетка
  if (tool==='pencil'||tool==='eyedrop'||(!stencilEditMode && stencilActive)) {
    if (hoveredPixel.x>=0&&hoveredPixel.x<canvasW&&hoveredPixel.y>=0&&hoveredPixel.y<canvasH) {
      octx.fillStyle='rgba(255,255,255,0.35)';
      octx.fillRect(hoveredPixel.x, hoveredPixel.y, 1, 1);
      octx.strokeStyle='rgba(0,0,0,0.5)';
      octx.lineWidth=1 / camZoom;
      octx.strokeRect(hoveredPixel.x, hoveredPixel.y, 1, 1);
    }
  }

  // Бомбочки / Расходники
  if (activeItem && hoveredPixel.x >= 0) {
    let size = 3;
    if (activeItem === 'rainbow_5x5') size = 5;
    else if (activeItem === 'eraser_10x10') size = 10;
    else if (activeItem === 'mirror_stamp') size = 5;
    const half = Math.floor(size / 2);
    
    octx.fillStyle = 'rgba(245,158,11,0.25)';
    octx.fillRect(hoveredPixel.x - half, hoveredPixel.y - half, size, size);
    octx.strokeStyle = '#f59e0b';
    octx.lineWidth = 2 / camZoom;
    octx.setLineDash([4 / camZoom, 2 / camZoom]);
    octx.strokeRect(hoveredPixel.x - half, hoveredPixel.y - half, size, size);
    octx.setLineDash([]);
  }

  // Ошибки трафарета
  if (stencilActive && stencilImg && stencilAutoHighlightEnabled && purchasedItems.includes('stencil_auto_2') && !stencilEditMode) {
    renderStencilErrors(octx);
  }

  octx.restore();
}

function renderStencilErrors(ctx) {
  if (!stencilImageData || !stencilActive) return;
  // На далёком масштабе отдельные клетки всё равно неразличимы. Пропуск
  // подсветки тут сохраняет отзывчивость для больших шаблонов без потери
  // полезной информации при реальном рисовании.
  if (camZoom < 2) return;
  const ir = stencilRect;
  const off = getRenderOffset();
  
  const startX = Math.max(0, Math.max(ir.x, Math.floor(-off.x / camZoom)));
  const startY = Math.max(0, Math.max(ir.y, Math.floor(-off.y / camZoom)));
  const endX = Math.min(canvasW, Math.min(ir.x + ir.w, Math.ceil((overlayCanvas.width - off.x) / camZoom)));
  const endY = Math.min(canvasH, Math.min(ir.y + ir.h, Math.ceil((overlayCanvas.height - off.y) / camZoom)));

  ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
  ctx.lineWidth = 1.5 / camZoom;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const canvasColorIdx = canvasData[y * canvasW + x];
      if (canvasColorIdx === 0) continue; 
      
      const sx = Math.floor(x - ir.x);
      const sy = Math.floor(y - ir.y);
      if (sx < 0 || sy < 0 || sx >= stencilImageData.width || sy >= stencilImageData.height) continue;
      const stencilColorIdx = stencilPaletteIndices ? stencilPaletteIndices[sy * stencilImageData.width + sx] : 255;
      // Оба слоя уже хранят индексы палитры. Раньше здесь для каждой клетки
      // парсились 6 hex-каналов и вычислялась дистанция — это и тормозило
      // крупные трафареты. Сравнение индексов даёт тот же точный результат.
      if (stencilColorIdx !== 255 && canvasColorIdx !== stencilColorIdx) {
          ctx.fillRect(x, y, 1, 1);
          
          if (camZoom >= 3) {
             const m = 2 / camZoom;
             ctx.beginPath();
             ctx.moveTo(x + m, y + m);
             ctx.lineTo(x + 1 - m, y + 1 - m);
             ctx.moveTo(x + 1 - m, y + m);
             ctx.lineTo(x + m, y + 1 - m);
             ctx.stroke();
          }
        }
      }
    }
}

// Плашка-лейбл над трафаретом (DOM-элемент, обновляется в координатах экрана,
// чтобы текст оставался читаемым на любом зуме). Видна только когда трафарет
// показан в режиме просмотра (не редактирования) — именно тогда легче всего
// спутать его с уже выставленными пикселями холста.
function updateStencilLabel() {
  const el = document.getElementById('stencil-label');
  if (!el) return;
  if (!stencilActive || stencilEditMode) { el.style.display = 'none'; return; }

  const isMine = !stencilLocked;
  if (isMine) {
    el.innerHTML = `<span class="stencil-label-icon">🖼️</span><span>Ваш трафарет</span>`;
  } else {
    el.innerHTML = `<span class="stencil-label-icon">👥</span><span>Трафарет: <span class="stencil-label-owner">${esc(stencilOwnerName || '?')}</span></span>`;
  }

  const ir = stencilRect;
  const topCenter = canvasToScreen(ir.x + ir.w / 2, ir.y);
  el.style.left = topCenter.x + 'px';
  el.style.top = (topCenter.y - 6) + 'px';
  el.style.display = 'flex';
}

// ── CURSORS ──
function updateCursorFlag(username, canvasX, canvasY, colorIdx, emoji, avatar) {
  if (!showCursors||(!serverCursorsEnabled&&!clanShareCursor)) return;
  const off = getRenderOffset();
  const sx = canvasX * camZoom + off.x; 
  const sy = canvasY * camZoom + off.y; 
  const col = PALETTE[colorIdx] || PALETTE[0];
  const color = col.c;
  const avatarHtml = avatar
    ? `<img class="cursor-flag-avatar" src="${avatar}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<span class="cursor-flag-emoji">${emoji||'👾'}</span>`;

  if (!cursorEls[username]) {
    const el = document.createElement('div');
    el.className = 'cursor-flag';
    el.innerHTML = `
      <div class="cursor-flag-inner">
        <svg width="12" height="16" viewBox="0 0 12 16" style="display:block;flex-shrink:0">
          <path d="M1 1 L11 6 L6.5 9 L4.5 15.5 Z" fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>
        </svg>
        <div class="cursor-flag-body">
          ${avatarHtml}
          <span style="color:${color};font-size:10px">${username}</span>
        </div>
      </div>`;
    cursorsLayer.appendChild(el);
    cursorEls[username] = {el};
  }
  const c = cursorEls[username];
  c.el.style.left = sx + 'px';
  c.el.style.top  = sy + 'px';
  const arrow = c.el.querySelector('path');
  if (arrow) arrow.setAttribute('fill', color);
  const nameEl = c.el.querySelector('.cursor-flag-body span:last-child');
  if (nameEl) nameEl.style.color = color;
}

function clearCursorFlags() {
  Object.keys(cursorEls).forEach(u=>cursorEls[u].el.remove());
  for (const k in cursorEls) delete cursorEls[k];
}

function updateAllCursorFlags() {
  for (const [u,cur] of Object.entries(otherCursors)) {
    updateCursorFlag(u,cur.x,cur.y,cur.c,cur.emoji,cur.avatar);
  }
}

// ── CAMERA ──
function centerCamera() {
  const vw=window.innerWidth, vh=window.innerHeight;
  camZoom=Math.min(Math.floor(vw/canvasW*0.8),4);
  camZoom=Math.max(camZoom,1);
  camX=vw/2-canvasW*camZoom/2; camY=vh/2-canvasH*camZoom/2;
  targetCamX = camX; targetCamY = camY; targetCamZoom = camZoom;
  applyTransform();
}

function resetCamera(){centerCamera();showToast('Камера сброшена','info');}
function zoomIn(){applyZoom(targetCamZoom*1.25,window.innerWidth/2,window.innerHeight/2);}
function zoomOut(){applyZoom(targetCamZoom/1.25,window.innerWidth/2,window.innerHeight/2);}

function applyZoom(nz, cx, cy) {
  nz=Math.max(0.5,Math.min(100,nz));
  const oldZoom = targetCamZoom;
  targetCamX=cx-(cx-targetCamX)*(nz/oldZoom);
  targetCamY=cy-(cy-targetCamY)*(nz/oldZoom);
  targetCamZoom=nz;
  if (!smoothCamera) {
    camX = targetCamX; camY = targetCamY; camZoom = targetCamZoom;
    applyTransform();
    updateAllCursorFlags();
  } else {
    startSmoothAnim();
  }
}

function startSmoothAnim() {
  if (smoothAnimId) return;
  smoothAnimId = requestAnimationFrame(smoothTick);
}

function smoothTick() {
  const EPS = 0.01;
  const FACTOR = 0.15;
  camX += (targetCamX - camX) * FACTOR;
  camY += (targetCamY - camY) * FACTOR;
  camZoom += (targetCamZoom - camZoom) * FACTOR;
  
  const done = Math.abs(targetCamX - camX) < EPS && Math.abs(targetCamY - camY) < EPS && Math.abs(targetCamZoom - camZoom) < 0.0001;
  if (done) {
    camX = targetCamX; camY = targetCamY; camZoom = targetCamZoom;
    smoothAnimId = null;
  } else {
    smoothAnimId = requestAnimationFrame(smoothTick);
  }
  applyTransform();
  updateAllCursorFlags();
}

// ── RAF RENDER LOOP (keeps overlay + cursors + stencil pulse in sync) ──
let _rafLoopId = null;

function _stencilNeedsAnim() {
  // Постоянная анимация рамки держала 60 FPS-рендер даже когда игрок ничего
  // не делает. Для больших трафаретов это лишняя нагрузка; рамка остаётся
  // видимой и обновляется при движении/масштабировании/рисовании.
  return false;
}

function _rafLoop() {
  const dragging = typeof isDragging !== 'undefined' && isDragging;
  const stencilAnim = _stencilNeedsAnim();
  if (dragging || stencilAnim) {
    renderOverlay();
    if (dragging) updateAllCursorFlags();
    _rafLoopId = requestAnimationFrame(_rafLoop);
  } else {
    _rafLoopId = null;
  }
}

function startDragRaf() {
  if (!_rafLoopId) _rafLoopId = requestAnimationFrame(_rafLoop);
}

// Алиас для читаемости в местах, где трафарет включается/обновляется.
function startStencilAnimIfNeeded() {
  if (_stencilNeedsAnim()) startDragRaf();
}

function resizeCanvas(w,h) {
  canvasW=w; canvasH=h; canvasData=new Uint8Array(w*h);
  initCanvases();
  document.getElementById('stat-canvas-size').textContent=`${w}×${h}`;
  document.getElementById('admin-canvas-w').value=w;
  document.getElementById('admin-canvas-h').value=h;
}

function canvasToScreen(cx,cy) {
  const off = getRenderOffset();
  return {x: cx * camZoom + off.x, y: cy * camZoom + off.y};
}
function screenToCanvas(sx,sy) {
  const off = getRenderOffset();
  return {x: (sx - off.x) / camZoom, y: (sy - off.y) / camZoom};
}
function getCanvasPos(sx,sy) {
  return screenToCanvas(sx, sy);
}
