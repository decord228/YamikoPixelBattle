'use strict';

// ── INPUT & EVENTS ──
wrap.addEventListener('mousedown',e=>{
  if (e.button===1||e.button===2){
    isDragging=true;dragStart={x:e.clientX,y:e.clientY};camStart={x:camX,y:camY};
    targetCamX=camX;targetCamY=camY;
    wrap.style.cursor='grabbing';e.preventDefault();
  } else if (e.button===0){
    if (stencilActive && stencilEditMode){ if (handleStencilStart(e.clientX,e.clientY)){isDraggingTool=true;} return; }
    if (tool==='admin_image'||adminImagePreviewMode){
      if (!handleToolInteractionStart(e.clientX,e.clientY)){
        isDragging=true;dragStart={x:e.clientX,y:e.clientY};camStart={x:camX,y:camY};
        targetCamX=camX;targetCamY=camY; wrap.style.cursor='grabbing';
      }
      return;
    }
    if (tool === 'admin_rect' || tool === 'admin_circle' || tool === 'admin_line') {
      const p = getCanvasPos(e.clientX, e.clientY);
      adminShapeStart = {x: Math.floor(p.x), y: Math.floor(p.y)};
      adminShapeEnd = { ...adminShapeStart };
      isDraggingAdminShape = true;
      return;
    }
    if (tool === 'admin_move') {
      const p = getCanvasPos(e.clientX, e.clientY);
      let px = Math.floor(p.x), py = Math.floor(p.y);
      if (adminMoveState === 'select') {
        adminShapeStart = {x: px, y: py}; adminShapeEnd = {x: px, y: py}; isDraggingAdminShape = true; return;
      } else if (adminMoveState === 'selected' || adminMoveState === 'moving') {
        if (adminMoveRect && px >= adminMoveRect.dx && px <= adminMoveRect.dx + adminMoveRect.w && py >= adminMoveRect.dy && py <= adminMoveRect.dy + adminMoveRect.h) {
           adminMoveState = 'moving'; adminDragOffset = {x: px - adminMoveRect.dx, y: py - adminMoveRect.dy}; isDraggingAdminShape = true; return;
        } else { cancelAdminTool(); return; }
      }
    }
    const p=getCanvasPos(e.clientX,e.clientY);
    let px=Math.floor(p.x),py=Math.floor(p.y);
    if (tool==='pencil'||tool==='stencil') placePixel();
    else if (tool==='eyedrop') eyedrop(px,py);
  }
});

wrap.addEventListener('mousemove',e=>{
  if (isDragging){
    const dx = e.clientX-dragStart.x, dy = e.clientY-dragStart.y;
    if (smoothCamera) { targetCamX = camStart.x + dx; targetCamY = camStart.y + dy; camX = targetCamX; camY = targetCamY; } 
    else { camX=camStart.x+dx; camY=camStart.y+dy; targetCamX=camX; targetCamY=camY; }
    applyTransform(); updateAllCursorFlags(); return;
  }
  if (isDraggingTool){
    if (adminActiveHandle) handleToolInteractionMove(e.clientX,e.clientY);
    else if (stencilHandle) handleStencilMove(e.clientX,e.clientY);
    return;
  }
  if (isDraggingAdminShape) {
    const p = getCanvasPos(e.clientX, e.clientY);
    if (tool === 'admin_move' && adminMoveState === 'moving') {
        adminMoveRect.dx = Math.floor(p.x) - adminDragOffset.x; adminMoveRect.dy = Math.floor(p.y) - adminDragOffset.y;
    } else { adminShapeEnd = {x: Math.floor(p.x), y: Math.floor(p.y)}; }
    renderOverlay(); return;
  }
  const p=getCanvasPos(e.clientX,e.clientY);
  const px=Math.floor(p.x),py=Math.floor(p.y);
  if (px!==hoveredPixel.x||py!==hoveredPixel.y){
    hoveredPixel={x:px,y:py}; renderOverlay(); updateInspector(e.clientX,e.clientY,px,py); updateCoordsBar(px,py);
    if (isLoggedIn&&(px!==lastSentCursor.x||py!==lastSentCursor.y)){
      lastSentCursor={x:px,y:py}; sendJSON({action:'cursor',x:px,y:py,c:selectedColor,clan_only:clanShareCursor&&!serverCursorsEnabled});
    }
  }
});

wrap.addEventListener('mouseup',e=>{
  if (e.button===1||e.button===2||(e.button===0&&isDragging)){ isDragging=false;wrap.style.cursor='crosshair'; }
  isDraggingTool=false;adminActiveHandle=null;stencilHandle=null;

  if (isDraggingAdminShape) {
    isDraggingAdminShape = false;
    if (tool === 'admin_rect' || tool === 'admin_circle' || tool === 'admin_line') {
      adminShapeFilled = document.getElementById('admin-shape-fill') ? document.getElementById('admin-shape-fill').checked : true;
      if (tool === 'admin_rect') {
          let x = Math.min(adminShapeStart.x, adminShapeEnd.x); let y = Math.min(adminShapeStart.y, adminShapeEnd.y);
          let w = Math.abs(adminShapeStart.x - adminShapeEnd.x) + 1; let h = Math.abs(adminShapeStart.y - adminShapeEnd.y) + 1;
          sendJSON({action:'admin_cmd', cmd:'draw_shape', type:'rect', params:{x,y,w,h,filled:adminShapeFilled}, colorIdx:selectedColor});
      } else if (tool === 'admin_circle') {
          let r = Math.round(Math.hypot(adminShapeEnd.x - adminShapeStart.x, adminShapeEnd.y - adminShapeStart.y));
          sendJSON({action:'admin_cmd', cmd:'draw_shape', type:'circle', params:{cx:adminShapeStart.x, cy:adminShapeStart.y, r, filled:adminShapeFilled}, colorIdx:selectedColor});
      } else if (tool === 'admin_line') {
          sendJSON({action:'admin_cmd', cmd:'draw_shape', type:'line', params:{x0:adminShapeStart.x, y0:adminShapeStart.y, x1:adminShapeEnd.x, y1:adminShapeEnd.y}, colorIdx:selectedColor});
      }
      renderOverlay();
    }
    else if (tool === 'admin_move') {
      if (adminMoveState === 'select') {
          let x = Math.min(adminShapeStart.x, adminShapeEnd.x); let y = Math.min(adminShapeStart.y, adminShapeEnd.y);
          let w = Math.abs(adminShapeStart.x - adminShapeEnd.x) + 1; let h = Math.abs(adminShapeStart.y - adminShapeEnd.y) + 1;
          adminMoveRect = {sx: x, sy: y, w, h, dx: x, dy: y}; adminMoveState = 'selected';
          adminMoveCanvas = document.createElement('canvas'); adminMoveCanvas.width = w; adminMoveCanvas.height = h;
          let ctx = adminMoveCanvas.getContext('2d'); let imgData = ctx.createImageData(w, h);
          for(let py=0; py<h; py++){
              for(let px=0; px<w; px++){
                  let cx=x+px, cy=y+py;
                  if(cx>=0&&cx<canvasW&&cy>=0&&cy<canvasH){
                      let cidx = canvasData[cy*canvasW+cx]; let hex = PALETTE[cidx].c; let idx = (py*w+px)*4;
                      imgData.data[idx] = parseInt(hex.slice(1,3),16); imgData.data[idx+1] = parseInt(hex.slice(3,5),16);
                      imgData.data[idx+2] = parseInt(hex.slice(5,7),16); imgData.data[idx+3] = 255;
                  }
              }
          }
          ctx.putImageData(imgData,0,0);
          document.getElementById('admin-floating-bar').style.display = 'flex';
          document.getElementById('admin-shape-fill-container').style.display = 'none';
          document.getElementById('admin-floating-bar-title').textContent = 'ПЕРЕТАЩИТЕ ВЫДЕЛЕНИЕ';
          showToast('Область скопирована. Перетащи её мышью, затем нажми "Применить"', 'info');
      } else if (adminMoveState === 'moving') { adminMoveState = 'selected'; }
      renderOverlay();
    }
  }
});

wrap.addEventListener('wheel',e=>{
  e.preventDefault(); applyZoom(targetCamZoom*(e.deltaY<0?1.12:1/1.12),e.clientX,e.clientY);
},{passive:false});
wrap.addEventListener('contextmenu',e=>e.preventDefault());
wrap.addEventListener('mouseleave',()=>{hoveredPixel={x:-1,y:-1};renderOverlay();document.getElementById('inspector').style.display='none';updateCoordsBar(-1,-1);});

let touches=[];
wrap.addEventListener('touchstart',e=>{
  e.preventDefault(); touches=Array.from(e.touches);
  if (touches.length===1){
    if (stencilActive && stencilEditMode){ if (handleStencilStart(touches[0].clientX,touches[0].clientY)){isDraggingTool=true;} return; }
    if (tool==='admin_image'||adminImagePreviewMode){ if (handleToolInteractionStart(touches[0].clientX,touches[0].clientY)) return; }
    isDragging=true;dragStart={x:touches[0].clientX,y:touches[0].clientY};
    camStart={x:camX,y:camY};targetCamX=camX;targetCamY=camY;
  }
},{passive:false});

wrap.addEventListener('touchmove',e=>{
  e.preventDefault(); const t=Array.from(e.touches);
  if (t.length===1&&isDraggingTool){
    if (adminActiveHandle) handleToolInteractionMove(t[0].clientX,t[0].clientY);
    else if (stencilHandle) handleStencilMove(t[0].clientX,t[0].clientY);
    return;
  }
  if (t.length===1&&isDragging){
    camX=camStart.x+(t[0].clientX-dragStart.x); camY=camStart.y+(t[0].clientY-dragStart.y);
    targetCamX=camX;targetCamY=camY; applyTransform();updateAllCursorFlags();
  } else if (t.length===2&&touches.length===2){
    const d0=Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
    const d1=Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
    const cx=(t[0].clientX+t[1].clientX)/2,cy=(t[0].clientY+t[1].clientY)/2;
    applyZoom(targetCamZoom*(d1/d0),cx,cy);
  }
  touches=t;
},{passive:false});

wrap.addEventListener('touchend',e=>{
  if (e.touches.length===0){
    isDragging=false;isDraggingTool=false;adminActiveHandle=null;stencilHandle=null;
    if (e.changedTouches.length===1){
      const t=e.changedTouches[0]; const dx=t.clientX-dragStart.x,dy=t.clientY-dragStart.y;
      if (Math.hypot(dx,dy)<10&&(tool==='pencil'||(!stencilEditMode && tool==='stencil'))){
        const p=getCanvasPos(t.clientX,t.clientY);
        hoveredPixel={x:Math.floor(p.x),y:Math.floor(p.y)};placePixel();
      }
    }
  }
  touches=Array.from(e.touches);
},{passive:false});

const dropZone=document.getElementById('image-drop-zone');
dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('drag-over');});
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop',e=>{
  e.preventDefault();dropZone.classList.remove('drag-over');
  const file=e.dataTransfer.files[0];if(!file||!file.type.startsWith('image/'))return;
  const input=document.getElementById('admin-image-file');
  const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
  handleAdminImage({target:input});
});

document.addEventListener('keydown',e=>{
  if (['input','textarea'].includes(e.target.tagName.toLowerCase())) return;
  if (e.key==='e'||e.key==='E') setTool(tool==='pencil'?'eyedrop':'pencil');
  if (e.key==='g'||e.key==='G') toggleGrid();
  if (e.key==='p'||e.key==='P') togglePalette();
  if (e.key==='Escape'){hideAllPanels();cancelAdminTool();cancelStencil();cancelUseItem();hideLeaderboard();}
  if (e.key==='+'||e.key==='=') zoomIn();
  if (e.key==='-') zoomOut();
  if (e.key===' '){e.preventDefault();placePixel();}
});