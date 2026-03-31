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

function renderOverlay() {
  octx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
  const off = getRenderOffset();

  if (gridEnabled && camZoom >= 4) {
    octx.strokeStyle = 'rgba(0,0,0,0.3)';
    octx.lineWidth = 1;
    octx.beginPath();
    
    const startX = Math.max(0, Math.floor(-off.x / camZoom));
    const endX = Math.min(canvasW, Math.ceil((overlayCanvas.width - off.x) / camZoom));
    const startY = Math.max(0, Math.floor(-off.y / camZoom));
    const endY = Math.min(canvasH, Math.ceil((overlayCanvas.height - off.y) / camZoom));

    for (let i = startX; i <= endX; i++) {
      const x = Math.round(i * camZoom) + off.x;
      octx.moveTo(x + 0.5, Math.round(startY * camZoom) + off.y);
      octx.lineTo(x + 0.5, Math.round(endY * camZoom) + off.y);
    }
    for (let j = startY; j <= endY; j++) {
      const y = Math.round(j * camZoom) + off.y;
      octx.moveTo(Math.round(startX * camZoom) + off.x, y + 0.5);
      octx.lineTo(Math.round(endX * camZoom) + off.x, y + 0.5);
    }
    octx.stroke();
  }

  if (isDraggingAdminShape && (tool === 'admin_rect' || tool === 'admin_circle' || tool === 'admin_line')) {
      octx.strokeStyle = PALETTE[selectedColor].c;
      octx.fillStyle = PALETTE[selectedColor].c + '80';
      octx.lineWidth = Math.max(1, Math.floor(camZoom));
      
      if (tool === 'admin_rect') {
          let rx1 = Math.round(Math.min(adminShapeStart.x, adminShapeEnd.x) * camZoom) + off.x;
          let ry1 = Math.round(Math.min(adminShapeStart.y, adminShapeEnd.y) * camZoom) + off.y;
          let rx2 = Math.round((Math.max(adminShapeStart.x, adminShapeEnd.x) + 1) * camZoom) + off.x;
          let ry2 = Math.round((Math.max(adminShapeStart.y, adminShapeEnd.y) + 1) * camZoom) + off.y;
          if (adminShapeFilled) octx.fillRect(rx1, ry1, rx2-rx1, ry2-ry1);
          octx.strokeRect(rx1, ry1, rx2-rx1, ry2-ry1);
      } else {
          let cxStart = Math.round((adminShapeStart.x + 0.5) * camZoom) + off.x;
          let cyStart = Math.round((adminShapeStart.y + 0.5) * camZoom) + off.y;
          let cxEnd = Math.round((adminShapeEnd.x + 0.5) * camZoom) + off.x;
          let cyEnd = Math.round((adminShapeEnd.y + 0.5) * camZoom) + off.y;

          if (tool === 'admin_circle') {
             let r = Math.hypot(adminShapeEnd.x - adminShapeStart.x, adminShapeEnd.y - adminShapeStart.y) * camZoom;
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

  if (tool === 'admin_move') {
      if (adminMoveState === 'select' && isDraggingAdminShape) {
          let rx1 = Math.round(Math.min(adminShapeStart.x, adminShapeEnd.x) * camZoom) + off.x;
          let ry1 = Math.round(Math.min(adminShapeStart.y, adminShapeEnd.y) * camZoom) + off.y;
          let rx2 = Math.round((Math.max(adminShapeStart.x, adminShapeEnd.x) + 1) * camZoom) + off.x;
          let ry2 = Math.round((Math.max(adminShapeStart.y, adminShapeEnd.y) + 1) * camZoom) + off.y;
          
          octx.strokeStyle = '#ffffff'; octx.lineWidth = 2; octx.setLineDash([8,4]);
          octx.strokeRect(rx1, ry1, rx2-rx1, ry2-ry1); octx.setLineDash([]);
      } else if ((adminMoveState === 'selected' || adminMoveState === 'moving') && adminMoveRect && adminMoveCanvas) {
          let rx = Math.round(adminMoveRect.dx * camZoom) + off.x;
          let ry = Math.round(adminMoveRect.dy * camZoom) + off.y;
          let rx2 = Math.round((adminMoveRect.dx + adminMoveRect.w) * camZoom) + off.x;
          let ry2 = Math.round((adminMoveRect.dy + adminMoveRect.h) * camZoom) + off.y;
          let rw = rx2 - rx; let rh = ry2 - ry;
          
          octx.globalAlpha = 0.8; octx.imageSmoothingEnabled = false;
          octx.drawImage(adminMoveCanvas, rx, ry, rw, rh); octx.globalAlpha = 1.0;
          octx.strokeStyle = '#eab308'; octx.lineWidth = 2; octx.setLineDash([6,3]);
          octx.strokeRect(rx, ry, rw, rh); octx.setLineDash([]);
      }
  }

  if ((tool==='admin_image' || adminImagePreviewMode) && adminImgObj) {
    let ir=adminImgRect;
    let sx = Math.round(ir.x * camZoom) + off.x;
    let sy = Math.round(ir.y * camZoom) + off.y;
    let ex = Math.round((ir.x + ir.w) * camZoom) + off.x;
    let ey = Math.round((ir.y + ir.h) * camZoom) + off.y;
    let sw = ex - sx; let sh = ey - sy;
    
    octx.globalAlpha=0.75;octx.imageSmoothingEnabled=false;
    octx.drawImage(adminImgObj,sx,sy,sw,sh);octx.globalAlpha=1.0;
    octx.strokeStyle='#6366f1';octx.lineWidth=2;octx.strokeRect(sx,sy,sw,sh);
    octx.fillStyle='#ffffff';octx.strokeStyle='#6366f1';octx.lineWidth=2.5;
    [[sx,sy],[sx+sw,sy],[sx,sy+sh],[sx+sw,sy+sh]].forEach(([cx,cy])=>{
      octx.beginPath();octx.arc(cx,cy,7,0,Math.PI*2);octx.fill();octx.stroke();
    });
  }

  if (stencilActive && stencilImg) {
    let ir=stencilRect;
    let sx = Math.round(ir.x * camZoom) + off.x;
    let sy = Math.round(ir.y * camZoom) + off.y;
    let ex = Math.round((ir.x + ir.w) * camZoom) + off.x;
    let ey = Math.round((ir.y + ir.h) * camZoom) + off.y;
    let sw = ex - sx; let sh = ey - sy;
    
    octx.globalAlpha=stencilOpacity;octx.imageSmoothingEnabled=false;
    octx.drawImage(stencilImg,sx,sy,sw,sh);octx.globalAlpha=1;
    
    if (stencilEditMode) {
      octx.strokeStyle='#22c55e';octx.lineWidth=2;
      octx.setLineDash([6,3]);octx.strokeRect(sx,sy,sw,sh);octx.setLineDash([]);
    }

    if (purchasedItems.includes('stencil_auto_2') && !stencilEditMode) {
      renderStencilErrors();
    }
  }

  if (tool==='pencil'||tool==='eyedrop'||(!stencilEditMode && stencilActive)) {
    if (hoveredPixel.x>=0&&hoveredPixel.x<canvasW&&hoveredPixel.y>=0&&hoveredPixel.y<canvasH) {
      const sx = Math.round(hoveredPixel.x * camZoom) + off.x;
      const sy = Math.round(hoveredPixel.y * camZoom) + off.y;
      const ex = Math.round((hoveredPixel.x + 1) * camZoom) + off.x;
      const ey = Math.round((hoveredPixel.y + 1) * camZoom) + off.y;
      
      octx.fillStyle='rgba(255,255,255,0.35)';
      octx.fillRect(sx, sy, ex-sx, ey-sy);
      octx.strokeStyle='rgba(0,0,0,0.5)';
      octx.lineWidth=1;
      octx.strokeRect(sx + 0.5, sy + 0.5, ex-sx-1, ey-sy-1);
    }
  }

  if (activeItem && hoveredPixel.x >= 0) {
    renderItemPreview();
  }
}

function renderItemPreview() {
  const off = getRenderOffset();
  const x = hoveredPixel.x, y = hoveredPixel.y;
  let size = 3;
  if (activeItem === 'rainbow_5x5') size = 5;
  else if (activeItem === 'eraser_10x10') size = 10;
  else if (activeItem === 'mirror_stamp') size = 5;
  const half = Math.floor(size / 2);
  
  const sx = Math.round((x - half) * camZoom) + off.x;
  const sy = Math.round((y - half) * camZoom) + off.y;
  const ex = Math.round((x - half + size) * camZoom) + off.x;
  const ey = Math.round((y - half + size) * camZoom) + off.y;
  
  octx.fillStyle = 'rgba(245,158,11,0.25)';
  octx.fillRect(sx, sy, ex-sx, ey-sy);
  octx.strokeStyle = '#f59e0b';
  octx.lineWidth = 2;
  octx.setLineDash([4, 2]);
  octx.strokeRect(sx, sy, ex-sx, ey-sy);
  octx.setLineDash([]);
}

function renderStencilErrors() {
  if (!stencilImageData || !stencilActive) return;
  const ir = stencilRect;
  const off = getRenderOffset();
  
  // Рамки видимой части экрана (для оптимизации рендера)
  const startX = Math.max(0, Math.max(ir.x, Math.floor(-off.x / camZoom)));
  const startY = Math.max(0, Math.max(ir.y, Math.floor(-off.y / camZoom)));
  const endX = Math.min(canvasW, Math.min(ir.x + ir.w, Math.ceil((overlayCanvas.width - off.x) / camZoom)));
  const endY = Math.min(canvasH, Math.min(ir.y + ir.h, Math.ceil((overlayCanvas.height - off.y) / camZoom)));

  octx.fillStyle = 'rgba(239, 68, 68, 0.4)';
  octx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
  octx.lineWidth = 1.5;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const canvasColorIdx = canvasData[y * canvasW + x];
      // Игнорируем пустые (белые) пиксели, чтобы не делать кашу
      if (canvasColorIdx === 0) continue; 
      
      const sx = Math.floor((x - ir.x) / ir.w * stencilImageData.width);
      const sy = Math.floor((y - ir.y) / ir.h * stencilImageData.height);
      
      if (sx < 0 || sy < 0 || sx >= stencilImageData.width || sy >= stencilImageData.height) continue;
      
      const idx = (sy * stencilImageData.width + sx) * 4;
      const a = stencilImageData.data[idx + 3];
      
      if (a > 50) {
        const sr = stencilImageData.data[idx];
        const sg = stencilImageData.data[idx+1];
        const sb = stencilImageData.data[idx+2];
        
        const palHex = PALETTE[canvasColorIdx].c;
        const pr = parseInt(palHex.slice(1,3), 16);
        const pg = parseInt(palHex.slice(3,5), 16);
        const pb = parseInt(palHex.slice(5,7), 16);
        
        // Если цвет на холсте сильно отличается от требуемого цвета трафарета
        if (Math.abs(pr - sr) > 10 || Math.abs(pg - sg) > 10 || Math.abs(pb - sb) > 10) {
          const rectSx = Math.round(x * camZoom) + off.x;
          const rectSy = Math.round(y * camZoom) + off.y;
          const rectEx = Math.round((x + 1) * camZoom) + off.x;
          const rectEy = Math.round((y + 1) * camZoom) + off.y;
          
          octx.fillRect(rectSx, rectSy, rectEx - rectSx, rectEy - rectSy);
          
          // Крестик внутри пикселя
          if (camZoom >= 3) {
             octx.beginPath();
             octx.moveTo(rectSx + 2, rectSy + 2);
             octx.lineTo(rectEx - 2, rectEy - 2);
             octx.moveTo(rectEx - 2, rectSy + 2);
             octx.lineTo(rectSx + 2, rectEy - 2);
             octx.stroke();
          }
        }
      }
    }
  }
}

// ── CURSORS ──
function updateCursorFlag(username, canvasX, canvasY, colorIdx, emoji) {
  if (!showCursors||(!serverCursorsEnabled&&!clanShareCursor)) return;
  const off = getRenderOffset();
  const sx = Math.round(canvasX * camZoom) + off.x;
  const sy = Math.round(canvasY * camZoom) + off.y;
  const col = PALETTE[colorIdx] || PALETTE[0];
  const color = col.c;

  if (!cursorEls[username]) {
    const el = document.createElement('div');
    el.className = 'cursor-flag';
    el.innerHTML = `
      <div class="cursor-flag-inner">
        <svg width="12" height="16" viewBox="0 0 12 16" style="display:block;flex-shrink:0">
          <path d="M1 1 L11 6 L6.5 9 L4.5 15.5 Z" fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>
        </svg>
        <div class="cursor-flag-body">
          <span class="cursor-flag-emoji">${emoji||'👾'}</span>
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
    updateCursorFlag(u,cur.x,cur.y,cur.c,cur.emoji);
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

function resizeCanvas(w,h) {
  canvasW=w; canvasH=h; canvasData=new Uint8Array(w*h);
  initCanvases();
  document.getElementById('stat-canvas-size').textContent=`${w}×${h}`;
  document.getElementById('admin-canvas-w').value=w;
  document.getElementById('admin-canvas-h').value=h;
}

function canvasToScreen(cx,cy) {
  const off = getRenderOffset();
  return {x: Math.round(cx * camZoom) + off.x, y: Math.round(cy * camZoom) + off.y};
}
function screenToCanvas(sx,sy) {
  const off = getRenderOffset();
  return {x: (sx - off.x) / camZoom, y: (sy - off.y) / camZoom};
}
function getCanvasPos(sx,sy) {
  return screenToCanvas(sx, sy);
}