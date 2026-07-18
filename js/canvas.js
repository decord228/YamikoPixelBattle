'use strict';

// ── CANVAS SETUP & RENDER ──
function initCanvases() {
  mainCanvas.width = canvasW; mainCanvas.height = canvasH;
  resizeOverlay();
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0,0,canvasW,canvasH);
  invalidateCanvasContent();
  applyTransform();
}

let overlayCssWidth = 0, overlayCssHeight = 0, overlayDpr = 1;
let lastCanvasTransform = '';
let lastCanvasFarZoomState = null;
let worldFrameCanvas = null;
let worldFrameCtx = null;
let worldFrameKey = '';
let boardRevision = 0;
let canvasContentRevision = 0;
let stencilErrorMaskCanvas = null;
let stencilErrorMaskKey = '';

function invalidateWorldFrame() {
  boardRevision++;
  worldFrameKey = '';
}

function invalidateCanvasContent(refreshErrorMask = true) {
  if (refreshErrorMask) {
    canvasContentRevision++;
    stencilErrorMaskKey = '';
  }
  invalidateWorldFrame();
}
function resizeOverlay() {
  // Overlay живёт в CSS-координатах viewport. Backing store повышаем до DPR,
  // но viewport-расчёты всегда ведём по CSS-размеру.
  overlayCssWidth = window.innerWidth;
  overlayCssHeight = window.innerHeight;
  overlayDpr = window.devicePixelRatio || 1;
  overlayCanvas.style.width = `${overlayCssWidth}px`;
  overlayCanvas.style.height = `${overlayCssHeight}px`;
  overlayCanvas.width = Math.max(1, Math.round(overlayCssWidth * overlayDpr));
  overlayCanvas.height = Math.max(1, Math.round(overlayCssHeight * overlayDpr));
  octx.setTransform(overlayDpr, 0, 0, overlayDpr, 0, 0);
  invalidateWorldFrame();
  renderOverlay();
}

function getRenderOffset() {
  // И основной canvas, и overlay работают в одних CSS-координатах. Здесь
  // нельзя округлять смещение до физических пикселей: при 90%/110% масштабе
  // браузер округляет CSS-transform и Canvas 2D по-разному, из-за чего
  // сетка/трафарет могли совпадать друг с другом, но сдвигаться от холста.
  return { x: camX, y: camY };
}

function applyTransform() {
  const off = getRenderOffset();
  // Та же 2D-матрица, что у overlay: это гарантирует совпадение каждой
  // клетки холста с сеткой и трафаретом при любом масштабе интерфейса.
  const t = `translate(${off.x}px,${off.y}px) scale(${camZoom})`;
  if (t !== lastCanvasTransform) {
    lastCanvasTransform = t;
    invalidateWorldFrame();
  }
  // Ниже одного CSS-пикселя на клетку nearest-neighbor даёт мерцание на
  // дробных координатах. На таком расстоянии отдельные пиксели всё равно
  // не читаются, поэтому используем стабильную фильтрацию браузера.
  const farZoom = camZoom < 1;
  if (farZoom !== lastCanvasFarZoomState) {
    mainCanvas.classList.toggle('canvas-far-zoom', farZoom);
    lastCanvasFarZoomState = farZoom;
  }
  shadowDiv.style.width = canvasW + 'px';
  shadowDiv.style.height = canvasH + 'px';
  renderOverlay();
}

function renderPixel(x,y,colorIdx) {
  const c = PALETTE[colorIdx] || PALETTE[0];
  mctx.fillStyle = c.c;
  mctx.fillRect(x,y,1,1);
  // Обновление за пределами трафарета не меняет маску ошибок. Это важно при
  // активном большом шаблоне: чужие пиксели на другом участке не заставляют
  // повторно проходить весь шаблон.
  const affectsStencilErrors = stencilActive && stencilRect &&
    x >= stencilRect.x && x < stencilRect.x + stencilRect.w &&
    y >= stencilRect.y && y < stencilRect.y + stencilRect.h;
  invalidateCanvasContent(!!affectsStencilErrors);
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
  invalidateCanvasContent();
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
  // Базовый кадр хранится в физических пикселях, поэтому сначала очищаем
  // итоговый canvas без дополнительной матрицы.
  octx.setTransform(1, 0, 0, 1, 0, 0);
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

  // Тяжёлая часть (полотно + сетка + трафарет) кэшируется. При движении
  // курсора или показе инспектора мы только копируем готовый кадр и рисуем
  // динамические подсказки, не ресемплируя заново весь холст.
  const frame = getWorldFrame(off);
  octx.drawImage(frame, 0, 0);

  // Динамические элементы ниже по-прежнему используют CSS-координаты.
  octx.setTransform(overlayDpr, 0, 0, overlayDpr, 0, 0);

  // Оставшиеся интерактивные оверлеи используют ту же world-матрицу.
  octx.save();
  octx.translate(off.x, off.y);
  octx.scale(camZoom, camZoom);

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

  // Рамка трафарета. Само пиксельное изображение уже нарисовано выше через
  // drawStencilSurface() в общем с полотном рендер-пайплайне.
  if (stencilActive && stencilImg) {
    let ir=stencilRect;
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

  octx.restore();
}

function getVisibleBoardRect(off) {
  const x0 = Math.max(0, Math.floor(-off.x / camZoom));
  const y0 = Math.max(0, Math.floor(-off.y / camZoom));
  const x1 = Math.min(canvasW, Math.ceil((overlayCssWidth - off.x) / camZoom));
  const y1 = Math.min(canvasH, Math.ceil((overlayCssHeight - off.y) / camZoom));
  return { x0, y0, x1, y1 };
}

function getWorldFrame(off) {
  const stencilKey = stencilActive && stencilImg && stencilRect
    ? `${stencilImg.src || ''}:${stencilRect.x},${stencilRect.y},${stencilRect.w},${stencilRect.h}:${stencilOpacity}`
    : 'none';
  const key = [
    boardRevision, overlayCanvas.width, overlayCanvas.height,
    camX, camY, camZoom, gridEnabled, stencilKey,
    stencilAutoHighlightEnabled, purchasedItems.includes('stencil_auto_2')
  ].join('|');

  if (worldFrameCanvas && worldFrameKey === key) return worldFrameCanvas;

  if (!worldFrameCanvas) {
    worldFrameCanvas = document.createElement('canvas');
    worldFrameCtx = worldFrameCanvas.getContext('2d');
  }
  if (worldFrameCanvas.width !== overlayCanvas.width || worldFrameCanvas.height !== overlayCanvas.height) {
    worldFrameCanvas.width = overlayCanvas.width;
    worldFrameCanvas.height = overlayCanvas.height;
  }
  worldFrameCtx.setTransform(1, 0, 0, 1, 0, 0);
  worldFrameCtx.clearRect(0, 0, worldFrameCanvas.width, worldFrameCanvas.height);
  worldFrameCtx.setTransform(overlayDpr, 0, 0, overlayDpr, 0, 0);
  drawBoardSurface(worldFrameCtx, off);
  drawGridSurface(worldFrameCtx, off);
  drawStencilSurface(worldFrameCtx, off);
  drawStencilErrorsSurface(worldFrameCtx, off);
  worldFrameKey = key;
  return worldFrameCanvas;
}

function drawBoardSurface(ctx, off) {
  const r = getVisibleBoardRect(off);
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    mainCanvas, r.x0, r.y0, w, h,
    off.x + r.x0 * camZoom, off.y + r.y0 * camZoom,
    w * camZoom, h * camZoom
  );
  ctx.restore();
}

function drawGridSurface(ctx, off) {
  if (!gridEnabled || camZoom < 4) return;
  const r = getVisibleBoardRect(off);
  const line = 1 / overlayDpr;
  const left = off.x + r.x0 * camZoom;
  const top = off.y + r.y0 * camZoom;
  const right = off.x + r.x1 * camZoom;
  const bottom = off.y + r.y1 * camZoom;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  for (let x = r.x0; x <= r.x1; x++) ctx.fillRect(off.x + x * camZoom, top, line, bottom - top);
  for (let y = r.y0; y <= r.y1; y++) ctx.fillRect(left, off.y + y * camZoom, right - left, line);
  ctx.restore();
}

function drawStencilSurface(ctx, off) {
  if (!stencilActive || !stencilImg || !stencilRect) return;
  const ir = stencilRect;
  ctx.save();
  ctx.globalAlpha = stencilOpacity;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    stencilImg,
    off.x + ir.x * camZoom, off.y + ir.y * camZoom,
    ir.w * camZoom, ir.h * camZoom
  );
  ctx.restore();
}

function getStencilErrorMask() {
  if (!stencilImageData || !stencilPaletteIndices || !stencilRect) return null;
  const ir = stencilRect;
  const width = stencilImageData.width;
  const height = stencilImageData.height;
  const key = `${canvasContentRevision}|${stencilImg?.src || ''}|${ir.x},${ir.y},${width},${height}`;
  if (stencilErrorMaskCanvas && stencilErrorMaskKey === key) return stencilErrorMaskCanvas;

  if (!stencilErrorMaskCanvas) stencilErrorMaskCanvas = document.createElement('canvas');
  stencilErrorMaskCanvas.width = width;
  stencilErrorMaskCanvas.height = height;
  const maskCtx = stencilErrorMaskCanvas.getContext('2d');
  const maskData = maskCtx.createImageData(width, height);
  const out = maskData.data;

  // Полная проверка выполняется только после изменения полотна/трафарета.
  // В обычном кадре эта маска рисуется одним drawImage ниже.
  for (let sy = 0; sy < height; sy++) {
    const cy = ir.y + sy;
    if (cy < 0 || cy >= canvasH) continue;
    for (let sx = 0; sx < width; sx++) {
      const expected = stencilPaletteIndices[sy * width + sx];
      if (expected === 255) continue;
      const cx = ir.x + sx;
      if (cx < 0 || cx >= canvasW) continue;
      const actual = canvasData[cy * canvasW + cx];
      if (actual === 0 || actual === expected) continue;
      const i = (sy * width + sx) * 4;
      out[i] = 239; out[i + 1] = 68; out[i + 2] = 68; out[i + 3] = 105;
    }
  }
  maskCtx.putImageData(maskData, 0, 0);
  stencilErrorMaskKey = key;
  return stencilErrorMaskCanvas;
}

function drawStencilErrorsSurface(ctx, off) {
  if (!stencilActive || stencilEditMode || !stencilImg || !stencilAutoHighlightEnabled || !purchasedItems.includes('stencil_auto_2')) return;
  if (camZoom < 2) return;
  const mask = getStencilErrorMask();
  if (!mask || !stencilRect) return;
  const ir = stencilRect;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mask, off.x + ir.x * camZoom, off.y + ir.y * camZoom, ir.w * camZoom, ir.h * camZoom);
  ctx.restore();
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
  const endX = Math.min(canvasW, Math.min(ir.x + ir.w, Math.ceil((overlayCssWidth - off.x) / camZoom)));
  const endY = Math.min(canvasH, Math.min(ir.y + ir.h, Math.ceil((overlayCssHeight - off.y) / camZoom)));

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
let stencilLabelContentKey = '';
function updateStencilLabel() {
  const el = document.getElementById('stencil-label');
  if (!el) return;
  if (!stencilActive || stencilEditMode) { el.style.display = 'none'; stencilLabelContentKey = ''; return; }

  const isMine = !stencilLocked;
  const contentKey = isMine ? 'mine' : `shared:${stencilOwnerName || '?'}`;
  if (contentKey !== stencilLabelContentKey) {
    if (isMine) {
      el.innerHTML = `<span class="stencil-label-icon">🖼️</span><span>Ваш трафарет</span>`;
    } else {
      el.innerHTML = `<span class="stencil-label-icon">👥</span><span>Трафарет: <span class="stencil-label-owner">${esc(stencilOwnerName || '?')}</span></span>`;
    }
    stencilLabelContentKey = contentKey;
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
