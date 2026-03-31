'use strict';

// ── INIT ──
window.addEventListener('resize',()=>{applyTransform();resizeOverlay();updateAllCursorFlags();});

function init(){
  initCanvases();
  buildColorGrid();
  buildEmojiAvatarPicker();
  drawAvatarCanvas(selectedEmoji);
  drawHudAvatar(selectedEmoji);
  centerCamera();
  connect();
  document.getElementById('stat-canvas-size').textContent=`${canvasW}×${canvasH}`;
  
  // Открываем палитру при старте и зажигаем новую кнопку
  document.getElementById('palette-panel').style.display='block';
  const palBtn = document.getElementById('btn-palette');
  if(palBtn) palBtn.classList.add('active');
}

document.getElementById('auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth(false);});
document.getElementById('reg-password').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth(true);});

init();