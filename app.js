const canvas = document.getElementById('app');
const ctx = canvas.getContext('2d');
const reviewOverlay = document.getElementById('reviewOverlay');
const cube3dOverlay = document.getElementById('cube3dOverlay');
const cube3dEl = document.getElementById('cube3d');
const cube3dWrap = document.getElementById('cube3dWrap');
const openCube3DBtn = document.getElementById('openCube3DBtn');
const closeCube3DBtn = document.getElementById('closeCube3DBtn');
const toggleAutoSpinBtn = document.getElementById('toggleAutoSpinBtn');

const closeReviewBtn = document.getElementById('closeReviewBtn');
const openReviewBtn = document.getElementById('openReviewBtn');
const reviewCanvases = {
  top: document.getElementById('face_top'),
  front: document.getElementById('face_front'),
  right: document.getElementById('face_right'),
  left: document.getElementById('face_left'),
  back: document.getElementById('face_back'),
  bottom: document.getElementById('face_bottom')
};
let reviewShown = false;
let reviewAutoOpened = false;
let cube3dShown = false;
let cube3dYaw = -35;
let cube3dPitch = -24;
let cube3dAutoSpin = true;
let cube3dDragging = false;
let cube3dLastX = 0;
let cube3dLastY = 0;


const texturesSrc = {
  top: 'assets/top.jpg',
  front: 'assets/front.jpg',
  right: 'assets/right.jpg',
  back: 'assets/back.jpg',
  left: 'assets/left.jpg',
  bottom: 'assets/bottom.jpg'
};
const textures = {};

const faceDefs = [
  { name:'front', idx:[4,5,6,7], normal:[0,0,1] },
  { name:'back', idx:[1,0,3,2], normal:[0,0,-1] },
  { name:'left', idx:[0,4,7,3], normal:[-1,0,0] },
  { name:'right', idx:[5,1,2,6], normal:[1,0,0] },
  { name:'top', idx:[3,7,6,2], normal:[0,1,0] },
  { name:'bottom', idx:[0,1,5,4], normal:[0,-1,0] },
];

let W=0,H=0,dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
function resize(){
  W=window.innerWidth; H=window.innerHeight;
  canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize); resize();

const puzzle = {
  yaw: 0.72,
  pitch: -0.55,
  cx: () => W * 0.5,
  cy: () => {
    const uiH = W < 700 ? 220 : 205;
    return uiH + (W < 700 ? 150 : 185);
  },
  scale: () => {
    if (W < 700) return Math.min(W, H) * 0.18;
    if (W < 1100) return Math.min(W, H) * 0.20;
    return Math.min(W, H) * 0.22;
  }
};

const targetPositions = [];
for (let y=0;y<2;y++) for (let z=0;z<2;z++) for (let x=0;x<2;x++) targetPositions.push({x,y,z});

const pieceColors = ['#efc79e','#b7d59b','#b9daec','#c6b8e4','#f3d8d9','#d8c6ec','#eebdc8','#b8e0be'];

const pieces = targetPositions.map((pos,i)=>({
  id:i,
  target:pos,
  placed:false,
  slot:null,
  trayX:0, trayY:0,
  x:0, y:0,
  yaw: -0.6 + i*0.22,
  pitch: -0.4 + (i%2)*0.18,
  color: pieceColors[i % pieceColors.length],
  hit:null
}));

function resetTray(){
  reviewAutoOpened = false;
  closeReview();
  const cols = Math.min(4, Math.max(2, Math.floor(W/170)));
  const gapX = 118, gapY = 108;
  const startX = Math.max(80, W/2 - ((cols-1)*gapX)/2);
  const rows = Math.ceil(pieces.length/cols);
  const startY = H - rows*gapY - 50;
  pieces.forEach((p,i)=>{
    p.placed=false; p.slot=null;
    const col = i % cols, row = Math.floor(i/cols);
    p.trayX = startX + col*gapX;
    p.trayY = startY + row*gapY;
    p.x = p.trayX; p.y = p.trayY;
    p.yaw = 0;
    p.pitch = 0;
  });
  updateMsg();
}
function shuffleTray(){
  pieces.forEach((p,i)=>{
    if (!p.placed) {
      p.x = p.trayX + (Math.random()*26-13);
      p.y = p.trayY + (Math.random()*26-13);
      p.yaw += (Math.random()*0.5-0.25);
      p.pitch += (Math.random()*0.35-0.175);
    }
  });
}

function loadTextures(){
  return Promise.all(Object.entries(texturesSrc).map(([k,src])=>new Promise(resolve=>{
    const img = new Image();
    img.onload=()=>{ textures[k]=img; resolve(); };
    img.src=src;
  })));
}

function rotX(v,a) {
  const c=Math.cos(a), s=Math.sin(a);
  return {x:v.x, y:v.y*c - v.z*s, z:v.y*s + v.z*c};
}
function rotY(v,a) {
  const c=Math.cos(a), s=Math.sin(a);
  return {x:v.x*c + v.z*s, y:v.y, z:-v.x*s + v.z*c};
}
function transformVertex(v, localYaw, localPitch, worldPos, viewYaw, viewPitch){
  let p = rotY(v, localYaw);
  p = rotX(p, localPitch);
  p.x += worldPos.x; p.y += worldPos.y; p.z += worldPos.z;
  p = rotY(p, viewYaw);
  p = rotX(p, viewPitch);
  return p;
}
function project(p,cx,cy,scale){
  return { x: cx + p.x*scale, y: cy - p.y*scale, z: p.z };
}
function placedCount(){
  return pieces.filter(p=>p.placed).length;
}
function currentGap(){
  // 8個そろったら完全に密着した1つの立方体にする
  return placedCount() === 8 ? 0.72 : 1.95;
}
function cubeWorldPos(target){
  const gap = currentGap();
  return { x:(target.x-0.5)*gap, y:(target.y-0.5)*gap, z:(target.z-0.5)*gap };
}
function getCrop(face, t, img){
  const w2 = img.width/2, h2 = img.height/2;
  let col=0,row=0;

  // 基準:
  // x = 左→右, y = 下→上, z = 奥→手前(正面)
  // 各写真は「その面を正面から見た向き」のまま使う
  if(face==='top'){
    col = t.x;
    row = 1 - t.z;
  }
  if(face==='bottom'){
    col = t.x;
    row = t.z;
  }
  if(face==='front'){
    col = t.x;
    row = 1 - t.y;
  }
  if(face==='back'){
    col = 1 - t.x;
    row = 1 - t.y;
  }
  if(face==='left'){
    col = t.z;
    row = 1 - t.y;
  }
  if(face==='right'){
    col = 1 - t.z;
    row = 1 - t.y;
  }

  return { sx:col*w2, sy:row*h2, sw:w2, sh:h2 };
}
function faceTextureName(piece, face){
  const t = piece.target;
  if(face==='top' && t.y===1) return 'top';
  if(face==='bottom' && t.y===0) return 'bottom';
  if(face==='front' && t.z===1) return 'front';
  if(face==='back' && t.z===0) return 'back';
  if(face==='left' && t.x===0) return 'left';
  if(face==='right' && t.x===1) return 'right';
  return null;
}

function drawPoly(pts, fill, stroke='#64748b', lw=1){
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}
function clipPoly(pts){
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();
}
function pointInPoly(pt, poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
    const intersect=((yi>pt.y)!=(yj>pt.y)) && (pt.x < (xj-xi)*(pt.y-yi)/(yj-yi+1e-9)+xi);
    if(intersect) inside=!inside;
  }
  return inside;
}


function drawImageOnFace(img, crop, pts){
  // 4点のうち、0->1 を画像の上辺、0->3 を左辺として貼る
  // このアプリの投影は平行投影に近いので、アフィン変換で十分きれいに貼れます。
  const p0 = pts[0], p1 = pts[1], p3 = pts[3];
  const dw = crop.sw || 1;
  const dh = crop.sh || 1;
  ctx.save();
  clipPoly(pts);
  ctx.transform(
    (p1.x - p0.x) / dw,
    (p1.y - p0.y) / dw,
    (p3.x - p0.x) / dh,
    (p3.y - p0.y) / dh,
    p0.x,
    p0.y
  );
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
  ctx.restore();
}

function renderCube(piece, cx, cy, scale, viewYaw, viewPitch, localYaw=0, localPitch=0, worldPos={x:0,y:0,z:0}, ghost=false){
  // ほんの少し小さくして、ピース同士の境界と厚みを見やすくする
  const s=0.36;
  const verts = [
    {x:-s,y:-s,z:-s}, {x:s,y:-s,z:-s}, {x:s,y:s,z:-s}, {x:-s,y:s,z:-s},
    {x:-s,y:-s,z:s},  {x:s,y:-s,z:s},  {x:s,y:s,z:s},  {x:-s,y:s,z:s}
  ];
  const tv = verts.map(v=>transformVertex(v, localYaw, localPitch, worldPos, viewYaw, viewPitch));
  const sv = tv.map(v=>project(v,cx,cy,scale));

  const renderFaces = [];
  for(const f of faceDefs){
    const n0 = rotY({x:f.normal[0], y:f.normal[1], z:f.normal[2]}, localYaw);
    const n1 = rotX(n0, localPitch);
    const n2 = rotY(n1, viewYaw);
    const n3 = rotX(n2, viewPitch);
    if (n3.z >= 0) continue;
    const pts = f.idx.map(i=>sv[i]);
    const avgZ = f.idx.reduce((a,i)=>a+tv[i].z,0)/4;
    renderFaces.push({ name:f.name, pts, avgZ });
  }
  renderFaces.sort((a,b)=>a.avgZ-b.avgZ);

  let bodyHit = false;
  let bounds = {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for (const rf of renderFaces) {
    for(const p of rf.pts) {
      bounds.minX=Math.min(bounds.minX,p.x); bounds.minY=Math.min(bounds.minY,p.y);
      bounds.maxX=Math.max(bounds.maxX,p.x); bounds.maxY=Math.max(bounds.maxY,p.y);
    }
    const texName = faceTextureName(piece, rf.name);
    let fill = piece.color;
    if (rf.name==='top') fill='#f5efe9';
    if (rf.name==='left') fill='#d4b49a';
    if (rf.name==='right') fill='#c89f80';
    if (ghost) fill = rf.name==='top' ? 'rgba(255,255,255,0.34)' : 'rgba(180,196,220,0.18)';
    drawPoly(rf.pts, fill, ghost ? 'rgba(100,116,139,.38)' : '#475569', ghost ? 1 : 1.3);

    if (texName && textures[texName]) {
      const crop = getCrop(texName, piece.target, textures[texName]);
      if (ghost) ctx.save(), ctx.globalAlpha = 0.38;
      drawImageOnFace(textures[texName], crop, rf.pts);
      if (ghost) ctx.restore();

      // 画像の上にごく薄い陰影をかけて、サーフェスっぽさを減らす
      ctx.save();
      clipPoly(rf.pts);
      if (ghost) {
        ctx.fillStyle = rf.name==='top' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
      } else {
        ctx.fillStyle = rf.name==='top' ? 'rgba(255,255,255,0.03)' : (rf.name==='left' ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.09)');
      }
      ctx.fillRect(0,0,W,H);
      ctx.restore();

      ctx.strokeStyle = ghost ? 'rgba(71,85,105,.42)' : 'rgba(15,23,42,.55)';
      ctx.lineWidth = ghost ? 1.0 : 1.4;
      ctx.beginPath();
      ctx.moveTo(rf.pts[0].x, rf.pts[0].y);
      for(let i=1;i<rf.pts.length;i++) ctx.lineTo(rf.pts[i].x, rf.pts[i].y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  const handle = { x: bounds.maxX + 10, y: bounds.minY - 8, r: 10 };
  return { polys: renderFaces.map(f=>f.pts), bounds, handle };
}

function drawScene(){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#e9edf3';
  ctx.fillRect(0,0,W,H);

  // guide slots
  targetPositions.forEach((pos,i)=>{
    const hasPiece = pieces.some(p=>p.placed && p.slot===i);
    if (!hasPiece) {
      renderCube({target:pos,color:'#dbe7f7'}, puzzle.cx(), puzzle.cy(), puzzle.scale(), puzzle.yaw, puzzle.pitch, 0,0, cubeWorldPos(pos), true);
    }
  });

  // placed pieces
  const placed = pieces.filter(p=>p.placed);
  const slotDepth = idx => {
    const wp = cubeWorldPos(targetPositions[idx]);
    const vp = rotX(rotY(wp, puzzle.yaw), puzzle.pitch);
    return vp.z;
  };
  placed.sort((a,b)=>slotDepth(a.slot)-slotDepth(b.slot));
  placed.forEach(p=>renderCube(p, puzzle.cx(), puzzle.cy(), puzzle.scale(), puzzle.yaw, puzzle.pitch, 0,0, cubeWorldPos(targetPositions[p.slot]), false));

  // tray title
  ctx.fillStyle = '#475569';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('未配置ピース', Math.max(24, W*0.08), W < 700 ? 690 : 650);

  // loose pieces
  pieces.filter(p=>!p.placed).forEach(p=>{
    p.hit = renderCube(p, p.x, p.y, 48, puzzle.yaw, puzzle.pitch, p.yaw, p.pitch, {x:0,y:0,z:0}, false);
    ctx.beginPath();
    ctx.arc(p.hit.handle.x, p.hit.handle.y, p.hit.handle.r, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.hit.handle.x, p.hit.handle.y, 4, 0.2, Math.PI*1.6);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });
}

function nearestSlot(pt){
  let best=null, bestD=1e9;
  targetPositions.forEach((pos,i)=>{
    if (pieces.some(p=>p.placed && p.slot===i)) return;
    const wp = cubeWorldPos(pos);
    const vp = rotX(rotY(wp, puzzle.yaw), puzzle.pitch);
    const sp = project(vp, puzzle.cx(), puzzle.cy(), puzzle.scale());
    const d = Math.hypot(pt.x-sp.x, pt.y-sp.y);
    if (d < bestD) { bestD = d; best = i; }
  });
  return bestD < puzzle.scale()*0.6 ? best : null;
}

function hitLoosePiece(pt){
  const loose = pieces.filter(p=>!p.placed).slice().reverse();
  for (const p of loose) {
    if (!p.hit) continue;
    if (Math.hypot(pt.x-p.hit.handle.x, pt.y-p.hit.handle.y) <= p.hit.handle.r+5) return {piece:p, mode:'pieceRotate'};
    if (p.hit.polys.some(poly=>pointInPoly(pt, poly))) return {piece:p, mode:'pieceDrag'};
  }
  return null;
}

let drag = null;
function getPt(e){
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x:t.clientX-r.left, y:t.clientY-r.top };
}

function onDown(e){
  e.preventDefault();
  const pt = getPt(e);

  // 完成後は、キャンバス上のどこをドラッグしても全体回転にする
  if (placedCount() === 8) {
    drag = { mode:'worldRotate', x:pt.x, y:pt.y, yaw:puzzle.yaw, pitch:puzzle.pitch };
    return;
  }

  const hit = hitLoosePiece(pt);
  if (hit) {
    drag = {
      mode: hit.mode,
      piece: hit.piece,
      x: pt.x, y: pt.y,
      ox: hit.piece.x - pt.x,
      oy: hit.piece.y - pt.y,
      yaw: hit.piece.yaw,
      pitch: hit.piece.pitch
    };
  } else {
    drag = { mode:'worldRotate', x:pt.x, y:pt.y, yaw:puzzle.yaw, pitch:puzzle.pitch };
  }
}

function onMove(e){
  if (!drag) return;
  e.preventDefault();
  const pt = getPt(e);
  const dx = pt.x-drag.x, dy = pt.y-drag.y;
  if (drag.mode==='worldRotate') {
    puzzle.yaw = drag.yaw + dx*0.01;
    puzzle.pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + dy*0.01));
  } else if (drag.mode==='pieceRotate') {
    drag.piece.yaw = drag.yaw + dx*0.02;
    drag.piece.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + dy*0.02));
  } else if (drag.mode==='pieceDrag') {
    drag.piece.x = pt.x + drag.ox;
    drag.piece.y = pt.y + drag.oy;
  }
}

function onUp(e){
  if (!drag) return;
  if (drag.mode==='pieceDrag') {
    const p = drag.piece;
    const slot = nearestSlot({x:p.x,y:p.y});
    if (slot != null) {
      p.placed = true;
      p.slot = slot;
    } else {
      p.x = p.trayX;
      p.y = p.trayY;
    }
    updateMsg();
  }
  drag = null;
}

canvas.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', onDown, {passive:false});
window.addEventListener('touchmove', onMove, {passive:false});
window.addEventListener('touchend', onUp, {passive:false});

document.getElementById('resetBtn').addEventListener('click', ()=>resetTray());
document.getElementById('mixBtn').addEventListener('click', ()=>shuffleTray());

function updateMsg(){
  const placed = pieces.filter(p=>p.placed).length;
  document.getElementById('msg').textContent = placed===8
    ? '8個そろいました。完成後はキャンバス上のどこをドラッグしても立方体を回せます。必要なら「6面レビュー」を押してください。'
    : `配置済み ${placed} / 8　空き位置にはうすく完成図のヒントが出ます。8個そろうと隙間がなくなり、完成形レビュー表示になります。`;
}

function loop(){
  drawScene();
  if (cube3dShown && cube3dAutoSpin && !cube3dDragging) {
    cube3dYaw += 0.18;
    applyCube3DTransform();
  }
  if (placedCount()===8 && !reviewAutoOpened) { openReview(); reviewAutoOpened = true; }
  requestAnimationFrame(loop);
}

loadTextures().then(()=>{ resetTray(); loop(); });

function drawFaceReview(face){
  const cv = reviewCanvases[face];
  if(!cv || !textures[face]) return;
  const c = cv.getContext('2d');
  const img = textures[face];
  c.clearRect(0,0,cv.width,cv.height);
  c.fillStyle = '#fff';
  c.fillRect(0,0,cv.width,cv.height);

  const margin = 10;
  const size = cv.width - margin*2;
  c.drawImage(img, margin, margin, size, size);

  c.strokeStyle = '#111827';
  c.lineWidth = 2;
  c.strokeRect(margin, margin, size, size);

  c.strokeStyle = 'rgba(17,24,39,.45)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(margin + size/2, margin);
  c.lineTo(margin + size/2, margin + size);
  c.moveTo(margin, margin + size/2);
  c.lineTo(margin + size, margin + size/2);
  c.stroke();
}

function openReview(){
  ['top','front','right','left','back','bottom'].forEach(drawFaceReview);
  reviewOverlay.classList.add('show');
  reviewShown = true;
}
function closeReview(){
  reviewOverlay.classList.remove('show');
  reviewShown = false;
}
closeReviewBtn.addEventListener('click', closeReview);
openReviewBtn.addEventListener('click', openReview);


function syncCube3DFaces(){
  const faces = ['top','bottom','front','back','right','left'];
  for (const face of faces){
    const el = document.getElementById('cubeFace_' + face);
    if (el && textures[face]) el.style.backgroundImage = `url(${textures[face].src})`;
  }
}
function applyCube3DTransform(){
  cube3dWrap.style.transform = `translate(-50%,-50%) rotateX(${cube3dPitch}deg) rotateY(${cube3dYaw}deg)`;
}
function openCube3D(){
  syncCube3DFaces();
  cube3dOverlay.classList.add('show');
  cube3dShown = true;
  applyCube3DTransform();
}
function closeCube3D(){
  cube3dOverlay.classList.remove('show');
  cube3dShown = false;
}
openCube3DBtn.addEventListener('click', openCube3D);
closeCube3DBtn.addEventListener('click', closeCube3D);
toggleAutoSpinBtn.addEventListener('click', ()=>{
  cube3dAutoSpin = !cube3dAutoSpin;
  toggleAutoSpinBtn.textContent = cube3dAutoSpin ? '自動回転を止める' : '自動回転を始める';
});
cube3dOverlay.addEventListener('mousedown', (e)=>{
  if (e.target.closest('button')) return;
  cube3dDragging = true;
  cube3dLastX = e.clientX; cube3dLastY = e.clientY;
  cube3dAutoSpin = false;
  toggleAutoSpinBtn.textContent = '自動回転を始める';
});
window.addEventListener('mousemove', (e)=>{
  if (!cube3dDragging) return;
  cube3dYaw += (e.clientX - cube3dLastX) * 0.4;
  cube3dPitch -= (e.clientY - cube3dLastY) * 0.3;
  cube3dPitch = Math.max(-85, Math.min(85, cube3dPitch));
  cube3dLastX = e.clientX; cube3dLastY = e.clientY;
  applyCube3DTransform();
});
window.addEventListener('mouseup', ()=> cube3dDragging = false);
cube3dOverlay.addEventListener('touchstart', (e)=>{
  if (e.target.closest('button')) return;
  const t = e.touches[0];
  cube3dDragging = true;
  cube3dLastX = t.clientX; cube3dLastY = t.clientY;
  cube3dAutoSpin = false;
  toggleAutoSpinBtn.textContent = '自動回転を始める';
}, {passive:true});
window.addEventListener('touchmove', (e)=>{
  if (!cube3dDragging) return;
  const t = e.touches[0];
  cube3dYaw += (t.clientX - cube3dLastX) * 0.4;
  cube3dPitch -= (t.clientY - cube3dLastY) * 0.3;
  cube3dPitch = Math.max(-85, Math.min(85, cube3dPitch));
  cube3dLastX = t.clientX; cube3dLastY = t.clientY;
  applyCube3DTransform();
}, {passive:true});
window.addEventListener('touchend', ()=> cube3dDragging = false);