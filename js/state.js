'use strict';

// ── STATE ──
let ws = null;
let canvasW = 256, canvasH = 256;
let canvasData = new Uint8Array(canvasW * canvasH);
let selectedColor = 0;
let cooldown = 0, cooldownTime = 3.0, cooldownTimer = null;
let isLoggedIn = false, isAdmin = false, isVip = false;
let currentUser = '', currentPixels = 0, sessionPixels = 0;
let currentRank = 'Новичок', currentEmoji = '👾';
let currentCoins = 0, purchasedItems = [];
let currentClan = '';
let tool = 'pencil'; 
let gridEnabled = false, smoothCamera = true, showCursors = true;
let inspectorEnabled = true, soundEnabled = false;
let camX = 0, camY = 0, camZoom = 3;
let targetCamX = 0, targetCamY = 0, targetCamZoom = 3;
let smoothAnimId = null;
let isDragging = false, dragStart = {x:0,y:0}, camStart = {x:0,y:0};
let hoveredPixel = {x:-1,y:-1};
let otherCursors = {};
let lastSentCursor = {x:-1,y:-1};
let adminPage = 1, adminTotalPages = 1;
let allAdminUsers = [];
let sessionFile = {username:'',password:''};
let selectedEmoji = '👾';
let isReconnecting = false;
let serverCursorsEnabled = false;
let clanShareCursor = false;
let leaderboardOpen = false;

// Chat state
let chatMessages = [];
let chatUnread = 0;
let chatOpen = false;
let clanChatMessages = [];

// Admin Image Tool
let adminImageData = null;
let adminImgObj = null;
let adminImgRect = {x:0,y:0,w:0,h:0};
let isDraggingTool = false;
let adminActiveHandle = null;
let adminDragOffset = {x:0,y:0};
let adminImagePreviewMode = false;

// Admin Shape Tools
let isDraggingAdminShape = false;
let adminShapeStart = {x:0,y:0}, adminShapeEnd = {x:0,y:0};
let adminShapeFilled = true;

// Admin Move Tool
let adminMoveState = 'idle';
let adminMoveRect = null;
let adminMoveCanvas = null; 

// Stencil State
let stencilActive = false;
let stencilEditMode = true; 
let stencilImg = null;        
let stencilOrigImg = null; 
let personalStencilUrl = null; // Ссылка на личный трафарет в Cloudinary
let stencilRect = {x:0,y:0,w:100,h:100};
let stencilOpacity = 0.6;
let stencilHandle = null;
let stencilDragOffset = {x:0,y:0};
let stencilImageData = null;
let stencilOrigWidth = 0, stencilOrigHeight = 0;
let savedStencils = []; // Сохраненные пресеты трафаретов

// Active item usage
let activeItem = null;

// ── DOM ELEMENTS ──
const wrap = document.getElementById('canvas-wrap');
const mainCanvas = document.getElementById('main-canvas');
const overlayCanvas = document.getElementById('overlay-canvas');
const shadowDiv = document.getElementById('canvas-shadow');
const mctx = mainCanvas.getContext('2d');
const octx = overlayCanvas.getContext('2d');
const cursorsLayer = document.getElementById('cursors-layer');
const cursorEls = {};