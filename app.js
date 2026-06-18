/* ===========================================================================
   FitTrack Pro v2 — self-updating file pattern
   Data is baked into the HTML file itself. Saving = downloading a new copy
   of this exact file with updated data embedded. No browser storage needed.
   =========================================================================== */
(function(){
"use strict";

/* clone helper — works on every browser (avoids structuredClone) */
function clone(o){ return JSON.parse(JSON.stringify(o)); }

/* ===========================================================================
   STORAGE  — IndexedDB (with localStorage fallback). Auto-saves every change.
   =========================================================================== */
const DEFAULTS = {
  workouts:[],
  goals:{dailyCalories:500,weeklyCalories:3000,monthlyCalories:12000,
         exerciseMinutes:45,workoutsPerWeek:4,steps:8000,distance:25,weight:75},
  settings:{theme:"dark",accent:"#FF5A3C",units:"metric"},
  custom:[],
  meta:{lastBackup:null}
};
let DB = clone(DEFAULTS);

const IDB_NAME = "fittrackpro", IDB_STORE = "kv", IDB_KEY = "db";
let _idb = null;

function idbOpen(){
  return new Promise((resolve)=>{
    if(!("indexedDB" in window)){ resolve(null); return; }
    try{
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = ()=>{ req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = ()=>resolve(req.result);
      req.onerror   = ()=>resolve(null);
    }catch(e){ resolve(null); }
  });
}
function idbGet(){
  return new Promise((resolve)=>{
    if(!_idb){ resolve(null); return; }
    try{
      const tx = _idb.transaction(IDB_STORE,"readonly");
      const rq = tx.objectStore(IDB_STORE).get(IDB_KEY);
      rq.onsuccess = ()=>resolve(rq.result||null);
      rq.onerror   = ()=>resolve(null);
    }catch(e){ resolve(null); }
  });
}
function idbSet(val){
  return new Promise((resolve)=>{
    if(!_idb){ resolve(false); return; }
    try{
      const tx = _idb.transaction(IDB_STORE,"readwrite");
      tx.objectStore(IDB_STORE).put(val, IDB_KEY);
      tx.oncomplete = ()=>resolve(true);
      tx.onerror    = ()=>resolve(false);
    }catch(e){ resolve(false); }
  });
}

async function loadDB(){
  _idb = await idbOpen();
  let data = await idbGet();
  if(!data){
    // migrate from any earlier localStorage version
    try{
      const ls = localStorage.getItem("fittrackpro.v1") || localStorage.getItem("fittrackpro");
      if(ls) data = JSON.parse(ls);
    }catch(e){}
  }
  if(data && data.workouts){
    DB = data;
    DB.goals    = {...DEFAULTS.goals,    ...(DB.goals||{})};
    DB.settings = {...DEFAULTS.settings, ...(DB.settings||{})};
    DB.workouts = DB.workouts||[];
    DB.custom   = DB.custom||[];
    DB.meta     = {...DEFAULTS.meta, ...(DB.meta||{})};
  }else{
    DB = clone(DEFAULTS);
  }
}

/* auto-save (debounced) + status indicator */
let _saveTimer = null, _saving = false;
function persist(){
  setStatus("saving");
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(doPersist, 250);
}
async function doPersist(){
  _saving = true;
  let ok = await idbSet(DB);
  if(!ok){
    try{ localStorage.setItem("fittrackpro.v1", JSON.stringify(DB)); ok = true; }catch(e){ ok = false; }
  }
  _saving = false;
  setStatus(ok ? "saved" : "error");
}
function setStatus(state){
  const el = document.getElementById("saveStatus");
  if(!el) return;
  if(state==="saving"){ el.textContent="Saving…"; el.className="save-status saving"; }
  else if(state==="saved"){ el.textContent="Saved"; el.className="save-status saved";
    clearTimeout(el._t); el._t=setTimeout(()=>{ el.textContent="Saved \u2713"; }, 100); }
  else if(state==="error"){ el.textContent="Save failed"; el.className="save-status error"; }
}
/* compatibility shims for the rest of the app (which calls markDirty) */
function markDirty(){ persist(); }
function markClean(){}
function updateSaveBtn(){}

/* ---------- platform detection ---------- */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_STANDALONE = window.matchMedia('(display-mode:standalone)').matches ||
  window.navigator.standalone === true;

/* ===========================================================================
   BACKUP REMINDER  — nudge every 7 days to export a JSON safety copy
   =========================================================================== */
function backupDue(){
  const last = DB.meta && DB.meta.lastBackup ? new Date(DB.meta.lastBackup) : null;
  if(!last) return DB.workouts.length >= 3; // only nag once there's data worth keeping
  return (Date.now() - last.getTime()) > 7*86400000;
}
function markBackedUp(){
  DB.meta = DB.meta || {};
  DB.meta.lastBackup = new Date().toISOString();
  persist();
}


/* ===========================================================================
   CONSTANTS
   =========================================================================== */
const KCAL_PER_KG_FAT = 7700;
const TODAY = ()=>fmtISO(new Date());

const TYPES = {
  walking:   {label:"Walking",    icon:"walk"},
  running:   {label:"Running",    icon:"run"},
  gym:       {label:"Gym",        icon:"dumbbell"},
  cycling:   {label:"Cycling",    icon:"bike"},
  swimming:  {label:"Swimming",   icon:"swim"},
  rowing:    {label:"Rowing",     icon:"row"},
  hiit:      {label:"HIIT",       icon:"bolt"},
  yoga:      {label:"Yoga",       icon:"yoga"},
  football:  {label:"Football",   icon:"ball"},
  basketball:{label:"Basketball", icon:"ball"},
  hiking:    {label:"Hiking",     icon:"mountain"},
  other:     {label:"Other",      icon:"star"}
};
const INTENSITIES = ["low","moderate","high","max"];
const MOODS       = ["😣","🙁","😐","🙂","😄"];

/* ===========================================================================
   SVG ICONS
   =========================================================================== */
const ICONS = {
  dashboard:   '<path d="M3 13h8V3H3v10zm10 8h8v-6h-8v6zM3 21h8v-6H3v6zM13 3v6h8V3h-8z"/>',
  calendar:    '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  workouts:    '<path d="M6.5 6.5 17.5 17.5M5 9 9 5M15 19l4-4M3 13l2 2M19 11l2-2M9 21l2-2M13 5l2-2"/>',
  analytics:   '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  reports:     '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  goals:       '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  achievements:'<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
  settings:    '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4L4.6 11a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4z"/>',
  fire:        '<path d="M12 2c1 3-1.5 4.5-1.5 7A1.5 1.5 0 0 0 12 10c0-2 2-2.5 1.5-5 2 1.5 4 4.2 4 7.5a5.5 5.5 0 1 1-11 0c0-2.6 1.5-4 2.5-5.5C9.8 6 10 4 12 2z"/>',
  bolt:        '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  clock:       '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trend:       '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  sun:         '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5 3.5 3.5M20.5 20.5 19 19M19 5l1.5-1.5M3.5 20.5 5 19"/>',
  moon:        '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8z"/>',
  plus:        '<path d="M12 5v14M5 12h14"/>',
  edit:        '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 5l4 4"/>',
  trash:       '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  download:    '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/>',
  upload:      '<path d="M12 21V9m0 0 4 4m-4-4-4 4M4 3h16"/>',
  print:       '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>',
  search:      '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  star:        '<path d="M12 3l2.6 5.6 6 .7-4.5 4 1.2 6L12 16.8 6.7 19.4l1.2-6-4.5-4 6-.7z"/>',
  save:        '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  walk:        '<circle cx="13" cy="4" r="2"/><path d="M11 22l1.5-7-2-2 1-5 3 3 2 1M10 13l-2 4M11 9l-3 2"/>',
  run:         '<circle cx="14" cy="4" r="2"/><path d="M9 21l3-5-3-3 1-4 3 2 3 1M6 12l3-1M14 11l1 4 3 2"/>',
  bike:        '<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17l4-7h5l3 7M9 6h3l-1 4"/>',
  swim:        '<circle cx="7" cy="8" r="2"/><path d="M3 15c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0 2.5-1 4 0M10 13l4-3-3-2-3 2"/>',
  row:         '<path d="M3 18l18-12M8 9l3 3M14 12l-3 3M5 16l3 3"/>',
  yoga:        '<circle cx="12" cy="4" r="2"/><path d="M12 7v6M5 20l7-3 7 3M8 11h8"/>',
  ball:        '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/>',
  mountain:    '<path d="M3 20h18L14 7l-3 5-2-3-6 11z"/>',
  dumbbell:    '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
  spark:       '<path d="M3 17l6-6 4 4 8-8"/>',
  info:        '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
  check:       '<path d="M5 12l4 4L19 7"/>',
  x:           '<path d="M6 6l12 12M18 6 6 18"/>',
  trophy:      '<path d="M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 18h6M8 22h8M12 13v5"/>',
  medal:       '<circle cx="12" cy="15" r="5"/><path d="M9 2l3 7 3-7M12 13v4M10 15h4"/>',
  steps:       '<path d="M8 4c2 0 3 1.5 3 4s-1 5-3 5-3-2-3-4 1-5 3-5zM16 9c2 0 3 1.5 3 4s-1 5-3 5-3-2-3-4 1-5 3-5z"/>',
  heart:       '<path d="M12 21C7 17 3 13.5 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 4.5-4 8-9 12z"/>',
  ruler:       '<rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M6 7v4M10 7v6M14 7v4M18 7v6"/>',
  floppy:      '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><rect x="7" y="13" width="10" height="8"/><rect x="8" y="3" width="6" height="5"/>'
};
const svg = (name,w)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"${w?` width="${w}" height="${w}"`:''}>${ICONS[name]||ICONS.star}</svg>`;

/* ===========================================================================
   DATE / NUMBER HELPERS
   =========================================================================== */
function fmtISO(d){const z=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;}
function parseISO(s){const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function startOfWeek(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x;}
function fmtNum(n){return(Math.round(n*10)/10).toLocaleString(undefined,{maximumFractionDigits:1});}
function fmtInt(n){return Math.round(n).toLocaleString();}
function fmtDate(s){return parseISO(s).toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"});}
function fmtDateLong(s){return parseISO(s).toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"});}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function esc(s){return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function num(id){const v=document.getElementById(id)?.value;return v===""||v==null?0:Number(v);}

/* ===========================================================================
   UNITS
   =========================================================================== */
const U={
  dist(km){return DB.settings.units==="imperial"?km*0.621371:km;},
  distU(){return DB.settings.units==="imperial"?"mi":"km";},
  distIn(v){return DB.settings.units==="imperial"?v/0.621371:v;},
  wt(kg){return DB.settings.units==="imperial"?kg*2.20462:kg;},
  wtU(){return DB.settings.units==="imperial"?"lb":"kg";},
  wtIn(v){return DB.settings.units==="imperial"?v/2.20462:v;},
  pace(min,km){
    if(!km||!min)return"—";
    const perUnit=min/U.dist(km);
    const m=Math.floor(perUnit),s=Math.round((perUnit-m)*60);
    return`${m}:${String(s).padStart(2,"0")} /${U.distU()}`;
  }
};

/* ===========================================================================
   DERIVED STATS
   =========================================================================== */
function byDate(){const m={};for(const w of DB.workouts){(m[w.date]=m[w.date]||[]).push(w);}return m;}
function sortedWorkouts(){return[...DB.workouts].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);}
function sum(arr,f){return arr.reduce((t,x)=>t+(Number(f(x))||0),0);}
function rangeCalories(from,to){return sum(DB.workouts.filter(w=>w.date>=from&&w.date<=to),w=>w.calories);}

function streaks(){
  const days=[...new Set(DB.workouts.map(w=>w.date))].sort();
  if(!days.length)return{current:0,longest:0};
  let longest=1,run=1;
  for(let i=1;i<days.length;i++){
    const gap=Math.round((parseISO(days[i])-parseISO(days[i-1]))/86400000);
    if(gap===1){run++;longest=Math.max(longest,run);}else run=1;
  }
  let current=0;const set=new Set(days);let cur=new Date();cur.setHours(0,0,0,0);
  if(!set.has(fmtISO(cur))){cur=addDays(cur,-1);if(!set.has(fmtISO(cur)))return{current:0,longest};}
  while(set.has(fmtISO(cur))){current++;cur=addDays(cur,-1);}
  return{current,longest:Math.max(longest,current)};
}

function stats(){
  const ws=DB.workouts;
  const totalCalories=sum(ws,w=>w.calories);
  const totalDuration=sum(ws,w=>w.duration);
  const totalDistance=sum(ws,w=>w.distance);
  const totalSteps=sum(ws,w=>w.steps);
  const s=streaks();
  const today=TODAY();
  const wkStart=fmtISO(startOfWeek(new Date()));
  const now=new Date();
  const moStart=fmtISO(new Date(now.getFullYear(),now.getMonth(),1));
  const yrStart=fmtISO(new Date(now.getFullYear(),0,1));
  const moMap={},wkMap={},dayMonthMap={};
  for(const w of ws){
    const d=parseISO(w.date);
    const mk=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    moMap[mk]=(moMap[mk]||0)+(Number(w.calories)||0);
    const ws2=fmtISO(startOfWeek(d));
    wkMap[ws2]=(wkMap[ws2]||0)+(Number(w.calories)||0);
    (dayMonthMap[mk]=dayMonthMap[mk]||new Set()).add(w.date);
  }
  const topMonth=Object.entries(moMap).sort((a,b)=>b[1]-a[1])[0];
  const topWeek=Object.entries(wkMap).sort((a,b)=>b[1]-a[1])[0];
  const consistent=Object.entries(dayMonthMap).map(([k,set])=>[k,set.size]).sort((a,b)=>b[1]-a[1])[0];
  const runs=ws.filter(w=>w.type==="running"&&w.distance>0&&w.duration>0);
  const fastest=runs.sort((a,b)=>(a.duration/a.distance)-(b.duration/b.distance))[0];
  const walks=ws.filter(w=>w.type==="walking"&&w.distance>0).sort((a,b)=>b.distance-a.distance)[0];
  const bestCal=[...ws].sort((a,b)=>b.calories-a.calories)[0];
  const bestDur=[...ws].sort((a,b)=>b.duration-a.duration)[0];
  return{
    totalCalories,totalDuration,totalDistance,totalSteps,
    count:ws.length,
    current:s.current,longest:s.longest,
    today:rangeCalories(today,today),
    week:rangeCalories(wkStart,today),
    month:rangeCalories(moStart,today),
    year:rangeCalories(yrStart,today),
    avgPerDay:ws.length?totalCalories/Math.max(1,new Set(ws.map(w=>w.date)).size):0,
    avgDuration:ws.length?totalDuration/ws.length:0,
    avgCalPerWorkout:ws.length?totalCalories/ws.length:0,
    fatLossKg:totalCalories/KCAL_PER_KG_FAT,
    topMonth,topWeek,consistent,fastest,walks,bestCal,bestDur,moMap,wkMap
  };
}

/* ===========================================================================
   CANVAS CHARTS
   =========================================================================== */
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()||v;}
function setupCanvas(cv,h){
  const dpr=window.devicePixelRatio||1;
  const w=cv.parentElement?.clientWidth||cv.clientWidth||600;
  cv.height=h*dpr;cv.width=w*dpr;
  cv.style.height=h+"px";cv.style.width="100%";
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  return{ctx,w,h};
}
function niceMax(v){if(v<=0)return 10;const pow=Math.pow(10,Math.floor(Math.log10(v)));const n=v/pow;const step=n<=1?1:n<=2?2:n<=5?5:10;return step*pow;}
function roundRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,Math.max(h/2,1));ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

function barChart(cv,labels,values,opts={}){
  const{ctx,w,h}=setupCanvas(cv,opts.height||180);
  const pad={l:44,r:10,t:14,b:28};
  const max=niceMax(Math.max(...values,1));
  const accent=css("--accent"),muted=css("--muted"),line=css("--line");
  const cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
  ctx.font=`10px ui-monospace,monospace`;ctx.textBaseline="middle";
  for(let i=0;i<=4;i++){
    const y=pad.t+ch*(i/4);
    ctx.strokeStyle=line;ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(pad.l,y+.5);ctx.lineTo(w-pad.r,y+.5);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=muted;ctx.textAlign="right";ctx.fillText(fmtInt(max*(1-i/4)),pad.l-7,y);
  }
  const n=values.length,bw=cw/n,barW=Math.min(28,bw*.65);
  values.forEach((v,i)=>{
    const x=pad.l+bw*i+(bw-barW)/2,bh=Math.max(ch*(v/max),v>0?2:0),y=pad.t+ch-bh;
    const g=ctx.createLinearGradient(0,y,0,pad.t+ch);
    g.addColorStop(0,accent);g.addColorStop(1,accent+"55");
    ctx.fillStyle=v>0?g:line;
    roundRect(ctx,x,y,barW,bh||1,4);ctx.fill();
  });
  ctx.fillStyle=muted;ctx.textAlign="center";ctx.textBaseline="top";
  const skip=Math.ceil(n/(opts.maxLabels||12));
  labels.forEach((lb,i)=>{if(i%skip===0)ctx.fillText(lb,pad.l+bw*i+bw/2,h-pad.b+8);});
}

function lineChart(cv,labels,series,opts={}){
  const{ctx,w,h}=setupCanvas(cv,opts.height||180);
  const pad={l:44,r:12,t:14,b:28};
  const all=series.flatMap(s=>s.values);
  const max=niceMax(Math.max(...all,1));
  const muted=css("--muted"),line=css("--line");
  const cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
  ctx.font="10px ui-monospace,monospace";ctx.textBaseline="middle";
  for(let i=0;i<=4;i++){
    const y=pad.t+ch*(i/4);
    ctx.strokeStyle=line;ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(pad.l,y+.5);ctx.lineTo(w-pad.r,y+.5);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=muted;ctx.textAlign="right";ctx.fillText(fmtInt(max*(1-i/4)),pad.l-7,y);
  }
  const n=labels.length;const xx=i=>pad.l+(n<=1?cw/2:cw*(i/(n-1)));const yy=v=>pad.t+ch-ch*(v/max);
  series.forEach(s=>{
    if(s.fill){
      ctx.beginPath();ctx.moveTo(xx(0),pad.t+ch);
      s.values.forEach((v,i)=>ctx.lineTo(xx(i),yy(v)));
      ctx.lineTo(xx(n-1),pad.t+ch);ctx.closePath();
      const g=ctx.createLinearGradient(0,pad.t,0,pad.t+ch);g.addColorStop(0,s.color+"44");g.addColorStop(1,s.color+"00");
      ctx.fillStyle=g;ctx.fill();
    }
    ctx.beginPath();ctx.lineWidth=2.3;ctx.strokeStyle=s.color;ctx.lineJoin="round";
    s.values.forEach((v,i)=>{i?ctx.lineTo(xx(i),yy(v)):ctx.moveTo(xx(i),yy(v));});ctx.stroke();
    if(opts.dots){s.values.forEach((v,i)=>{ctx.beginPath();ctx.arc(xx(i),yy(v),2.8,0,7);ctx.fillStyle=s.color;ctx.fill();});}
  });
  ctx.fillStyle=muted;ctx.textAlign="center";ctx.textBaseline="top";
  const skip=Math.ceil(n/(opts.maxLabels||10));
  labels.forEach((lb,i)=>{if(i%skip===0)ctx.fillText(lb,xx(i),h-pad.b+8);});
}

function doughnut(cv,segs,opts={}){
  const{ctx,w,h}=setupCanvas(cv,opts.height||200);
  const cx=w/2,cy=h/2,r=Math.min(w,h)/2-10,ir=r*.62;
  const total=segs.reduce((t,s)=>t+s.value,0)||1;
  let a=-Math.PI/2;
  segs.forEach(s=>{
    const ang=(s.value/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a,a+ang);ctx.closePath();ctx.fillStyle=s.color;ctx.fill();
    a+=ang;
  });
  ctx.globalCompositeOperation="destination-out";ctx.beginPath();ctx.arc(cx,cy,ir,0,7);ctx.fill();ctx.globalCompositeOperation="source-over";
  if(opts.center){
    ctx.fillStyle=css("--text");ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.font="700 22px ui-monospace,monospace";ctx.fillText(opts.center,cx,cy-6);
    ctx.fillStyle=css("--muted");ctx.font="11px system-ui,sans-serif";ctx.fillText(opts.centerSub||"",cx,cy+14);
  }
}

function ringChart(cv,pct,opts={}){
  const{ctx,w,h}=setupCanvas(cv,opts.height||120);
  const cx=w/2,cy=h/2,r=Math.min(w,h)/2-10;
  ctx.lineWidth=12;ctx.lineCap="round";
  ctx.strokeStyle=css("--surface-3");ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.stroke();
  const accent=css("--accent"),ai=css("--accent-ink")||accent;
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,accent);g.addColorStop(1,ai);
  ctx.strokeStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(pct,0,1));ctx.stroke();
  ctx.fillStyle=css("--text");ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font="700 24px ui-monospace,monospace";ctx.fillText(Math.round(pct*100)+"%",cx,cy-5);
  ctx.fillStyle=css("--muted");ctx.font="10px system-ui,sans-serif";ctx.fillText(opts.label||"of goal",cx,cy+14);
}

/* ===========================================================================
   ROUTER
   =========================================================================== */
const NAV=[
  ["dashboard","Dashboard"],["calendar","Calendar"],["workouts","Workouts"],
  ["analytics","Analytics"],["reports","Reports"],["goals","Goals"],
  ["achievements","Achievements"],["settings","Settings"]
];
let current="dashboard";
let calMonth=new Date();calMonth.setDate(1);
let workoutFilter={q:"",type:"all"};

function go(view){current=view;render();window.scrollTo({top:0,behavior:"instant"});}

function render(){
  document.querySelectorAll("#nav button,#botnav button").forEach(b=>b.classList.toggle("active",b.dataset.v===current));
  const titles={
    dashboard:["Dashboard",dashSub()],calendar:["Calendar","Tap any day to log or review"],
    workouts:["Workouts",`${DB.workouts.length} sessions logged`],
    analytics:["Analytics","Trends across your training"],reports:["Reports","Summaries and exports"],
    goals:["Goals","Targets that keep you honest"],achievements:["Achievements","Milestones earned and in reach"],
    settings:["Settings","Make it yours"]
  };
  document.getElementById("viewTitle").textContent=titles[current][0];
  document.getElementById("viewSub").textContent=titles[current][1];
  ({dashboard:viewDashboard,calendar:viewCalendar,workouts:viewWorkouts,analytics:viewAnalytics,
    reports:viewReports,goals:viewGoals,achievements:viewAchievements,settings:viewSettings}[current])();
  document.getElementById("footWorkouts").textContent=fmtInt(stats().count);
  document.getElementById("footCals").textContent=fmtInt(stats().totalCalories);
  updateSaveBtn();
  if(current==="dashboard") showInstallBanner();
}

function dashSub(){const s=streaks();return s.current>0?`You're on a ${s.current}-day streak — keep it alive`:`Log a workout today to start a streak`;}

function emptyState(title,msg){
  return`<div class="card"><div class="empty">${svg("spark")}<h3>${title}</h3><p>${msg}</p>
    <button class="btn primary" onclick="window.__addWorkout()">${svg("plus")}Log your first workout</button></div></div>`;
}

/* ===========================================================================
   VIEWS
   =========================================================================== */

/* ---- DASHBOARD ---- */
function viewDashboard(){
  const v=document.getElementById("view");
  if(!DB.workouts.length){
    v.innerHTML=emptyState("Your dashboard is ready","Log a workout and this fills with streaks, calories, charts and goal progress. Everything saves automatically on this device.");
    return;
  }
  const st=stats();
  const goalPct=DB.goals.dailyCalories?st.today/DB.goals.dailyCalories:0;
  const todayList=(byDate()[TODAY()]||[]);
  const recent=sortedWorkouts().slice(0,6);
  const last14=[],last14L=[];
  for(let i=13;i>=0;i--){const d=addDays(new Date(),-i);const iso=fmtISO(d);last14.push(rangeCalories(iso,iso));last14L.push(d.toLocaleDateString(undefined,{day:"numeric"}));}
  const typeMap={};for(const w of DB.workouts){typeMap[w.type]=(typeMap[w.type]||0)+w.calories;}
  const segs=Object.entries(typeMap).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([t,val],i)=>({label:TYPES[t]?.label||t,value:val,color:wheel(i)}));

  v.innerHTML=`
  <div class="grid cols-4" style="margin-bottom:var(--gap)">
    ${statCard("fire","Calories today",fmtInt(st.today),"kcal")}
    ${statCard("calendar","This week",fmtInt(st.week),"kcal")}
    ${statCard("trend","This month",fmtInt(st.month),"kcal")}
    ${statCard("bolt","Current streak",st.current,st.current===1?"day":"days")}
  </div>
  <div class="grid cols-3" style="margin-bottom:var(--gap)">
    <div class="card pad-lg">
      <div class="eyebrow" style="margin-bottom:14px">Daily goal</div>
      <div class="ring-wrap">
        <canvas data-ring="${goalPct}" data-label="of daily goal"></canvas>
        <div class="ring-meta">
          <div class="num big">${fmtInt(st.today)}<small style="font-size:14px;color:var(--muted)"> / ${fmtInt(DB.goals.dailyCalories)} kcal</small></div>
          <div class="ring-legend">
            <div class="row"><span class="dot" style="background:var(--accent)"></span>Burned today</div>
            <div class="row"><span class="dot" style="background:var(--surface-3)"></span>Remaining: ${fmtInt(Math.max(0,DB.goals.dailyCalories-st.today))} kcal</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card span-2">
      <div class="card-head"><h3>Last 14 days</h3><span class="eyebrow">calories burned</span></div>
      <div class="chart-box"><canvas data-bar='${JSON.stringify({labels:last14L,values:last14})}'></canvas></div>
    </div>
  </div>
  <div class="grid cols-3" style="margin-bottom:var(--gap)">
    <div class="card span-2">
      <div class="card-head"><h3>${todayList.length?"Today's workouts":"Recent workouts"}</h3>
        <button class="btn sm ghost" onclick="window.__go('workouts')">View all</button></div>
      <div class="wlist">${(todayList.length?todayList:recent).map(workoutRow).join("")||`<p class="note" style="padding:14px 4px">Nothing today yet.</p>`}</div>
    </div>
    <div class="card">
      <div class="card-head"><h3>By activity</h3></div>
      <div class="chart-box"><canvas data-doughnut='${JSON.stringify(segs)}' data-center="${fmtInt(st.totalCalories)}" data-csub="total kcal"></canvas></div>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">
        ${segs.slice(0,4).map(s=>`<div class="ring-legend"><div class="row"><span class="dot" style="background:${s.color}"></span>${s.label}<b class="num" style="margin-left:auto;color:var(--text)">${fmtInt(s.value)}</b></div></div>`).join("")}
      </div>
    </div>
  </div>
  <div class="grid cols-4" style="margin-bottom:var(--gap)">
    ${miniStat("Yearly total",fmtInt(st.year)+" kcal")}
    ${miniStat("Avg / active day",fmtInt(st.avgPerDay)+" kcal")}
    ${miniStat("Avg duration",fmtInt(st.avgDuration)+" min")}
    ${miniStat("Longest streak",st.longest+" days")}
    ${miniStat("Est. fat loss",fmtNum(U.wt(st.fatLossKg))+" "+U.wtU())}
    ${miniStat("Total time",fmtNum(st.totalDuration/60)+" h")}
    ${miniStat("Total distance",fmtNum(U.dist(st.totalDistance))+" "+U.distU())}
    ${miniStat("Total workouts",fmtInt(st.count))}
  </div>
  <div class="card">
    <div class="card-head"><h3>Activity heatmap</h3><span class="eyebrow">past year · calories</span></div>
    ${heatmapHTML()}
  </div>`;

  v.querySelectorAll("[data-ring]").forEach(c=>ringChart(c,parseFloat(c.dataset.ring),{label:c.dataset.label}));
  v.querySelectorAll("[data-bar]").forEach(c=>{const d=JSON.parse(c.dataset.bar);barChart(c,d.labels,d.values,{maxLabels:14});});
  v.querySelectorAll("[data-doughnut]").forEach(c=>{const s=JSON.parse(c.dataset.doughnut);doughnut(c,s,{center:c.dataset.center,centerSub:c.dataset.csub});});
  bindHeatmap(v);
}

function statCard(icon,lbl,val,unit){
  return`<div class="card stat"><div class="lbl">${svg(icon,15)}${lbl}</div><div class="val num">${val}<small>${unit||""}</small></div></div>`;
}
function miniStat(lbl,val){
  return`<div class="card stat"><div class="lbl" style="color:var(--muted)">${lbl}</div><div class="val num" style="font-size:21px">${val}</div></div>`;
}
function workoutRow(w){
  const t=TYPES[w.type]||TYPES.other;
  return`<div class="wrow" onclick="window.__editWorkout('${w.id}')">
    <div class="wicon" style="color:var(--accent)">${svg(t.icon)}</div>
    <div class="wmeta">
      <div class="t">${t.label}${w.intensity?`<span class="pill ${w.intensity}">${w.intensity}</span>`:""}</div>
      <div class="d">${fmtDate(w.date)} · ${fmtInt(w.duration)} min${w.distance?` · ${fmtNum(U.dist(w.distance))} ${U.distU()}`:""}${w.mood?` · ${w.mood}`:""}</div>
    </div>
    <div class="wcal"><b class="num">${fmtInt(w.calories)}</b><span>kcal</span></div>
  </div>`;
}
function wheel(i){
  const base=[css("--accent"),css("--cool"),css("--warn"),css("--good"),"#9D8DF1","#F472B6","#60A5FA","#F59E0B"];
  return base[i%base.length];
}

/* ---- HEATMAP ---- */
function heatLevel(cal){if(cal<=0)return 0;if(cal<150)return 1;if(cal<350)return 2;if(cal<600)return 3;return 4;}
function heatColor(level){if(level===0)return"var(--heat-0)";const op=[0,.28,.52,.76,1][level];return`color-mix(in srgb, var(--accent) ${op*100}%, var(--heat-0))`;}

function heatmapHTML(){
  const map=byDate();
  const end=new Date();end.setHours(0,0,0,0);
  let cur=new Date(startOfWeek(addDays(end,-364)));
  let cols="";
  while(cur<=end){
    let cells="";
    for(let d=0;d<7;d++){
      if(cur>end){cells+=`<div class="heatcell" style="visibility:hidden"></div>`;}
      else{
        const iso=fmtISO(cur);const cal=(map[iso]||[]).reduce((t,w)=>t+w.calories,0);
        cells+=`<div class="heatcell" data-iso="${iso}" data-cal="${cal}" style="background:${heatColor(heatLevel(cal))}" title="${fmtDateLong(iso)} · ${fmtInt(cal)} kcal"></div>`;
      }
      cur=addDays(cur,1);
    }
    cols+=`<div class="heatcol">${cells}</div>`;
  }
  return`<div class="heatmap">${cols}</div>
  <div class="heat-legend">Less <span class="cells">${[0,1,2,3,4].map(l=>`<span class="heatcell" style="background:${heatColor(l)}"></span>`).join("")}</span> More</div>`;
}
function bindHeatmap(scope){
  scope.querySelectorAll(".heatcell[data-iso]").forEach(c=>{c.addEventListener("click",()=>openDay(c.dataset.iso));});
}

/* ---- CALENDAR ---- */
function viewCalendar(){
  const v=document.getElementById("view");
  const y=calMonth.getFullYear(),m=calMonth.getMonth();
  const first=new Date(y,m,1);const startPad=(first.getDay()+6)%7;
  const days=new Date(y,m+1,0).getDate();
  const map=byDate();const todayIso=TODAY();
  const monthName=calMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const monthWs=DB.workouts.filter(w=>w.date.startsWith(`${y}-${String(m+1).padStart(2,"0")}`)).sort((a,b)=>a.date<b.date?-1:1);
  let cells="";
  for(let i=0;i<startPad;i++)cells+=`<div class="cal-cell empty"></div>`;
  for(let d=1;d<=days;d++){
    const iso=fmtISO(new Date(y,m,d));const list=map[iso]||[];
    const cal=list.reduce((t,w)=>t+w.calories,0);const lvl=heatLevel(cal);
    const t=list[0]?TYPES[list[0].type]:null;
    cells+=`<div class="cal-cell${iso===todayIso?" today":""}" onclick="window.__openDay('${iso}')"${cal>0?` style="background:${heatColor(lvl)};border-color:color-mix(in srgb,var(--accent) ${20+lvl*12}%,var(--line))"`:""}>
      <div class="dn">${d}</div>
      ${t?`<div class="ic" style="color:var(--accent-ink)">${svg(t.icon,16)}</div>`:""}
      ${cal>0?`<div class="ccal num">${fmtInt(cal)}<span style="font-size:9px;color:var(--muted)"> kcal</span></div>`:""}
      ${list.length>1?`<div class="cmulti">+${list.length-1} more</div>`:""}
    </div>`;
  }
  const monthCals=monthWs.reduce((t,w)=>t+w.calories,0);
  v.innerHTML=`
  <div class="card pad-lg" style="margin-bottom:var(--gap)">
    <div class="cal-head">
      <div style="display:flex;align-items:center;gap:10px">
        <button class="iconbtn" onclick="window.__calMove(-1)">${svg("x").replace("M6 6l12 12M18 6 6 18","M15 6l-6 6 6 6")}</button>
        <div class="cal-title">${monthName}</div>
        <button class="iconbtn" onclick="window.__calMove(1)">${svg("x").replace("M6 6l12 12M18 6 6 18","M9 6l6 6-6 6")}</button>
        <button class="btn sm ghost" onclick="window.__calToday()">Today</button>
      </div>
      <div class="note">${monthWs.length} workouts · <b class="num" style="color:var(--text)">${fmtInt(monthCals)}</b> kcal</div>
    </div>
    <div class="cal-grid">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>`<div class="cal-dow">${d}</div>`).join("")}${cells}</div>
  </div>
  <div class="card">
    <div class="card-head"><h3>${monthName} agenda</h3></div>
    <div class="wlist">${monthWs.length?monthWs.map(workoutRow).join(""):`<div class="empty" style="padding:28px"><p>No workouts this month.</p><button class="btn primary" onclick="window.__addWorkout()">${svg("plus")}Log a workout</button></div>`}</div>
  </div>`;
}

/* ---- WORKOUTS ---- */
function viewWorkouts(){
  const v=document.getElementById("view");
  if(!DB.workouts.length){v.innerHTML=emptyState("No workouts yet","Every session — calories, duration, distance, heart rate and more — lives here.");return;}
  let ws=sortedWorkouts();
  if(workoutFilter.type!=="all")ws=ws.filter(w=>w.type===workoutFilter.type);
  if(workoutFilter.q){const q=workoutFilter.q.toLowerCase();ws=ws.filter(w=>(TYPES[w.type]?.label||"").toLowerCase().includes(q)||(w.notes||"").toLowerCase().includes(q)||w.date.includes(q));}
  const typeOpts=`<option value="all">All types</option>`+Object.entries(TYPES).map(([k,t])=>`<option value="${k}"${workoutFilter.type===k?" selected":""}>${t.label}</option>`).join("");
  v.innerHTML=`
  <div class="card" style="margin-bottom:var(--gap);display:flex;gap:12px;flex-wrap:wrap;align-items:center">
    <div style="position:relative;flex:1;min-width:200px">
      <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted)">${svg("search",17)}</span>
      <input class="input" style="padding-left:38px" placeholder="Search by type, note or date" value="${esc(workoutFilter.q)}" oninput="window.__wSearch(this.value)">
    </div>
    <select class="input" style="max-width:180px" onchange="window.__wType(this.value)">${typeOpts}</select>
    <span class="note">${ws.length} shown</span>
  </div>
  <div class="card" style="overflow-x:auto">
    <table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Intensity</th><th class="right">Cal</th><th class="right">Min</th><th class="right">Dist</th><th class="right">Avg HR</th><th class="right">RPE</th><th></th></tr></thead>
    <tbody>${ws.map(w=>{const t=TYPES[w.type]||TYPES.other;return`<tr>
      <td>${fmtDate(w.date)}</td>
      <td><span style="display:inline-flex;align-items:center;gap:8px"><span style="color:var(--accent)">${svg(t.icon,16)}</span>${t.label}</span></td>
      <td>${w.intensity?`<span class="pill ${w.intensity}">${w.intensity}</span>`:"—"}</td>
      <td class="right num">${fmtInt(w.calories)}</td><td class="right num">${fmtInt(w.duration)}</td>
      <td class="right num">${w.distance?fmtNum(U.dist(w.distance)):"—"}</td>
      <td class="right num">${w.avgHeartRate||"—"}</td><td class="right num">${w.rpe||"—"}</td>
      <td class="actions">
        <button class="iconbtn" style="width:32px;height:32px" onclick="window.__editWorkout('${w.id}')">${svg("edit",15)}</button>
        <button class="iconbtn" style="width:32px;height:32px" onclick="window.__delWorkout('${w.id}')">${svg("trash",15)}</button>
      </td></tr>`;}).join("")||`<tr><td colspan="9" class="note" style="text-align:center;padding:30px">No matches.</td></tr>`}
    </tbody></table>
  </div>`;
}

/* ---- ANALYTICS ---- */
function viewAnalytics(){
  const v=document.getElementById("view");
  if(!DB.workouts.length){v.innerHTML=emptyState("Nothing to analyse yet","Charts appear once you log sessions.");return;}
  const d30=[],d30L=[];for(let i=29;i>=0;i--){const d=addDays(new Date(),-i);const iso=fmtISO(d);d30.push(rangeCalories(iso,iso));d30L.push(d.toLocaleDateString(undefined,{day:"numeric"}));}
  const roll7=d30.map((_,i)=>{const sl=d30.slice(Math.max(0,i-6),i+1);return sl.reduce((a,b)=>a+b,0)/sl.length;});
  const wk=[],wkL=[];let ws=startOfWeek(new Date());for(let i=11;i>=0;i--){const s=addDays(ws,-7*i);const e=addDays(s,6);wk.push(rangeCalories(fmtISO(s),fmtISO(e)));wkL.push(s.toLocaleDateString(undefined,{day:"numeric",month:"short"}));}
  const mo=[],moL=[];const now=new Date();for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const s=fmtISO(d);const e=fmtISO(new Date(d.getFullYear(),d.getMonth()+1,0));mo.push(rangeCalories(s,e));moL.push(d.toLocaleDateString(undefined,{month:"short"}));}
  const yr=now.getFullYear();const cum=[],cumL=[];let run=0;
  for(let i=0;i<12;i++){const d=new Date(yr,i,1);if(d>now)break;const s=fmtISO(d);const e=fmtISO(new Date(yr,i+1,0));run+=rangeCalories(s,e);cum.push(run);cumL.push(d.toLocaleDateString(undefined,{month:"short"}));}
  const freq={},cals={};for(const w of DB.workouts){freq[w.type]=(freq[w.type]||0)+1;cals[w.type]=(cals[w.type]||0)+w.calories;}
  const typeRows=Object.entries(cals).sort((a,b)=>b[1]-a[1]);
  const freqSegs=Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([t,c],i)=>({label:TYPES[t]?.label||t,value:c,color:wheel(i)}));

  v.innerHTML=`
  <div class="grid cols-2" style="margin-bottom:var(--gap)">
    <div class="card"><div class="card-head"><h3>Daily calories</h3><span class="eyebrow">30 days</span></div><div class="chart-box"><canvas data-c="bar" data-d='${JSON.stringify({l:d30L,v:d30})}'></canvas></div></div>
    <div class="card"><div class="card-head"><h3>Rolling 7-day average</h3></div><div class="chart-box"><canvas data-c="line" data-d='${JSON.stringify({l:d30L,s:[{values:roll7,color:css("--cool"),fill:true}]})}'></canvas></div></div>
  </div>
  <div class="grid cols-2" style="margin-bottom:var(--gap)">
    <div class="card"><div class="card-head"><h3>Weekly calories</h3><span class="eyebrow">12 weeks</span></div><div class="chart-box"><canvas data-c="bar" data-d='${JSON.stringify({l:wkL,v:wk})}'></canvas></div></div>
    <div class="card"><div class="card-head"><h3>Monthly calories</h3><span class="eyebrow">12 months</span></div><div class="chart-box"><canvas data-c="bar" data-d='${JSON.stringify({l:moL,v:mo})}'></canvas></div></div>
  </div>
  <div class="grid cols-3" style="margin-bottom:var(--gap)">
    <div class="card span-2"><div class="card-head"><h3>Cumulative calories</h3><span class="eyebrow">${yr}</span></div><div class="chart-box"><canvas data-c="line" data-d='${JSON.stringify({l:cumL,s:[{values:cum,color:css("--accent"),fill:true}]})}' data-dots="1"></canvas></div></div>
    <div class="card"><div class="card-head"><h3>Frequency</h3></div><div class="chart-box"><canvas data-c="dough" data-d='${JSON.stringify(freqSegs)}' data-center="${DB.workouts.length}" data-csub="workouts"></canvas></div></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Calories by activity</h3></div>
    <table class="tbl"><thead><tr><th>Activity</th><th class="right">Sessions</th><th class="right">Calories</th><th class="right">Avg / session</th><th style="width:30%">Share</th></tr></thead>
    <tbody>${typeRows.map(([t,c],i)=>{const cnt=freq[t];return`<tr>
      <td><span style="display:inline-flex;align-items:center;gap:8px"><span style="color:var(--accent)">${svg(TYPES[t]?.icon||"star",16)}</span>${TYPES[t]?.label||t}</span></td>
      <td class="right num">${cnt}</td><td class="right num">${fmtInt(c)}</td><td class="right num">${fmtInt(c/cnt)}</td>
      <td><div class="prog"><i style="width:${(c/typeRows[0][1]*100).toFixed(0)}%;background:${wheel(i)}"></i></div></td></tr>`;}).join("")}</tbody></table>
  </div>`;
  v.querySelectorAll("canvas[data-c]").forEach(c=>{
    const d=JSON.parse(c.dataset.d);
    if(c.dataset.c==="bar")barChart(c,d.l,d.v,{maxLabels:12});
    else if(c.dataset.c==="line")lineChart(c,d.l,d.s,{dots:!!c.dataset.dots,maxLabels:12});
    else doughnut(c,d,{center:c.dataset.center,centerSub:c.dataset.csub});
  });
}

/* ---- GOALS ---- */
function viewGoals(){
  const v=document.getElementById("view");const st=stats();const g=DB.goals;
  const now=new Date();const wkStart=fmtISO(startOfWeek(now));const today=TODAY();
  const wkWs=DB.workouts.filter(w=>w.date>=wkStart&&w.date<=today);
  const wkWorkouts=wkWs.length,wkMin=sum(wkWs,w=>w.duration),wkSteps=sum(wkWs,w=>w.steps),wkDist=sum(wkWs,w=>w.distance);
  const items=[
    ["Daily calories",st.today,g.dailyCalories,"kcal","fire"],
    ["Weekly calories",st.week,g.weeklyCalories,"kcal","calendar"],
    ["Monthly calories",st.month,g.monthlyCalories,"kcal","trend"],
    ["Exercise minutes this week",wkMin,g.exerciseMinutes*7,"min","clock"],
    ["Workouts this week",wkWorkouts,g.workoutsPerWeek,"","bolt"],
    ["Steps this week",wkSteps,g.steps*7,"steps","steps"],
    ["Distance this week",U.dist(wkDist),U.dist(g.distance),U.distU(),"ruler"]
  ];
  v.innerHTML=`
  <div class="grid cols-2" style="margin-bottom:var(--gap)">
    ${items.map(([lbl,cur2,goal,unit,icon])=>{const pct=goal?clamp(cur2/goal,0,1):0;const done=pct>=1;return`<div class="card">
      <div class="goal-row"><span class="gt" style="display:flex;align-items:center;gap:9px"><span style="color:${done?"var(--good)":"var(--accent)"}">${svg(done?"check":icon,17)}</span>${lbl}</span>
        <span class="gv"><b class="num">${fmtInt(cur2)}</b> / ${fmtInt(goal)} ${unit}</span></div>
      <div class="prog"><i style="width:${(pct*100).toFixed(0)}%;${done?"background:var(--good)":""}"></i></div>
      <div class="note" style="margin-top:7px">${done?"Goal reached.":`${fmtInt(Math.max(0,goal-cur2))} ${unit} to go · ${Math.round(pct*100)}%`}</div>
    </div>`;}).join("")}
  </div>
  <div class="card">
    <div class="card-head"><h3>Set your targets</h3><button class="btn primary sm" onclick="window.__saveGoals()">${svg("check",15)}Save targets</button></div>
    <div class="row3">
      ${goalField("dailyCalories","Daily calories","kcal")}
      ${goalField("weeklyCalories","Weekly calories","kcal")}
      ${goalField("monthlyCalories","Monthly calories","kcal")}
      ${goalField("exerciseMinutes","Exercise minutes / day","min")}
      ${goalField("workoutsPerWeek","Workouts / week","")}
      ${goalField("steps","Steps / day","steps")}
      ${goalField("distanceDisp","Weekly distance",U.distU(),U.dist(g.distance))}
      ${goalField("weightDisp","Target weight",U.wtU(),U.wt(g.weight))}
    </div>
  </div>`;
}
function goalField(key,lbl,unit,override){
  const val=override!==undefined?fmtNum(override):(DB.goals[key]||"");
  return`<div class="field"><label>${lbl}${unit?` (${unit})`:""}</label><input class="input num" type="number" id="goal_${key}" value="${val}"></div>`;
}

/* ---- ACHIEVEMENTS ---- */
function achievementDefs(){
  const st=stats();
  return[
    {id:"s7",  t:"Spark",          d:"7-day streak",      icon:"bolt",   cur:st.longest,           goal:7},
    {id:"s30", t:"Inferno",        d:"30-day streak",     icon:"fire",   cur:st.longest,           goal:30},
    {id:"w100",t:"Centurion",      d:"100 workouts",      icon:"medal",  cur:st.count,             goal:100},
    {id:"w500",t:"Iron Habit",     d:"500 workouts",      icon:"trophy", cur:st.count,             goal:500},
    {id:"c10", t:"10k Club",       d:"10,000 kcal",       icon:"fire",   cur:st.totalCalories,     goal:10000},
    {id:"c25", t:"25k Club",       d:"25,000 kcal",       icon:"fire",   cur:st.totalCalories,     goal:25000},
    {id:"c50", t:"50k Club",       d:"50,000 kcal",       icon:"fire",   cur:st.totalCalories,     goal:50000},
    {id:"c100",t:"100k Club",      d:"100,000 kcal",      icon:"trophy", cur:st.totalCalories,     goal:100000},
    {id:"h250",t:"250 Hours",      d:"250 hours trained", icon:"clock",  cur:st.totalDuration/60,  goal:250},
    {id:"h500",t:"500 Hours",      d:"500 hours trained", icon:"clock",  cur:st.totalDuration/60,  goal:500},
  ];
}
function viewAchievements(){
  const v=document.getElementById("view");
  const defs=achievementDefs();const earned=defs.filter(d=>d.cur>=d.goal).length;
  v.innerHTML=`
  <div class="grid cols-4" style="margin-bottom:var(--gap)">
    ${miniStat("Earned",`${earned} / ${defs.length}`)}
    ${miniStat("Custom",DB.custom.length)}
    ${miniStat("Best streak",stats().longest+" days")}
    ${miniStat("Lifetime kcal",fmtInt(stats().totalCalories))}
  </div>
  <div class="card" style="margin-bottom:var(--gap)">
    <div class="card-head"><h3>Milestones</h3></div>
    <div class="badge-grid">${defs.map(d=>{const done=d.cur>=d.goal;const pct=clamp(d.cur/d.goal,0,1);return`<div class="badge ${done?"earned":"locked"}">
      <div class="bi">${svg(d.icon,26)}</div><b>${d.t}</b><small>${d.d}</small>
      ${done?`<div class="when">Unlocked</div>`:`<div class="prog" style="margin-top:10px"><i style="width:${(pct*100).toFixed(0)}%"></i></div><small style="margin-top:5px">${Math.round(pct*100)}%</small>`}
    </div>`;}).join("")}</div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Custom achievements</h3><button class="btn sm" onclick="window.__addCustom()">${svg("plus",15)}Add</button></div>
    ${DB.custom.length?`<div class="badge-grid">${DB.custom.map((c,i)=>`<div class="badge earned" style="position:relative">
      <div class="bi">${svg("star",26)}</div><b>${esc(c.title)}</b><small>${esc(c.description||"")}</small>
      <div class="when">${c.earnedDate?fmtDate(c.earnedDate):"Earned"}</div>
      <button class="iconbtn" style="position:absolute;top:8px;right:8px;width:28px;height:28px" onclick="window.__delCustom(${i})">${svg("x",14)}</button>
    </div>`).join("")}</div>`:`<p class="note" style="padding:12px 2px">Mark your own milestones — a first 10k, a personal challenge, anything worth remembering.</p>`}
  </div>`;
}

/* ---- REPORTS ---- */
function viewReports(){
  const v=document.getElementById("view");const st=stats();
  function monthLabel(k){const[y,m]=k.split("-");return new Date(y,m-1,1).toLocaleDateString(undefined,{month:"long",year:"numeric"});}
  v.innerHTML=`
  <div class="grid cols-4" style="margin-bottom:var(--gap)">
    ${miniStat("Total sessions",fmtInt(st.count))}
    ${miniStat("Total calories",fmtInt(st.totalCalories))}
    ${miniStat("Total time",fmtNum(st.totalDuration/60)+" h")}
    ${miniStat("Total distance",fmtNum(U.dist(st.totalDistance))+" "+U.distU())}
  </div>
  <div class="grid cols-2" style="margin-bottom:var(--gap)">
    <div class="card">
      <div class="card-head"><h3>Statistics</h3></div>
      <table class="tbl"><tbody>
        <tr><td style="color:var(--muted)">Highest-calorie workout</td><td class="right num">${st.bestCal?`${fmtInt(st.bestCal.calories)} kcal · ${TYPES[st.bestCal.type]?.label} · ${fmtDate(st.bestCal.date)}`:"—"}</td></tr>
        <tr><td style="color:var(--muted)">Longest workout</td><td class="right num">${st.bestDur?`${fmtInt(st.bestDur.duration)} min · ${TYPES[st.bestDur.type]?.label}`:"—"}</td></tr>
        <tr><td style="color:var(--muted)">Fastest run</td><td class="right num">${st.fastest?U.pace(st.fastest.duration,st.fastest.distance):"—"}</td></tr>
        <tr><td style="color:var(--muted)">Longest walk</td><td class="right num">${st.walks?`${fmtNum(U.dist(st.walks.distance))} ${U.distU()}`:"—"}</td></tr>
        <tr><td style="color:var(--muted)">Most active month</td><td class="right num">${st.topMonth?`${monthLabel(st.topMonth[0])} · ${fmtInt(st.topMonth[1])} kcal`:"—"}</td></tr>
        <tr><td style="color:var(--muted)">Most active week</td><td class="right num">${st.topWeek?`w/c ${fmtDate(st.topWeek[0])} · ${fmtInt(st.topWeek[1])} kcal`:"—"}</td></tr>
        <tr><td style="color:var(--muted)">Most consistent month</td><td class="right num">${st.consistent?`${monthLabel(st.consistent[0])} · ${st.consistent[1]} active days`:"—"}</td></tr>
        <tr><td style="color:var(--muted)">Avg workout length</td><td class="right num">${fmtInt(st.avgDuration)} min</td></tr>
        <tr><td style="color:var(--muted)">Avg kcal / workout</td><td class="right num">${fmtInt(st.avgCalPerWorkout)} kcal</td></tr>
        <tr><td style="color:var(--muted)">Estimated fat loss</td><td class="right num">${fmtNum(U.wt(st.fatLossKg))} ${U.wtU()}</td></tr>
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-head"><h3>Text report</h3>
        <select class="input" style="max-width:160px" id="repPeriod" onchange="window.__buildReport()">
          <option value="week">This week</option><option value="month" selected>This month</option>
          <option value="quarter">This quarter</option><option value="year">Year to date</option>
        </select>
      </div>
      <div class="report-out" id="reportOut">Select a period…</div>
      <div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">
        <button class="btn sm" onclick="window.print()">${svg("print",15)}Print / PDF</button>
        <button class="btn sm" onclick="window.__copyReport()">${svg("reports",15)}Copy text</button>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Backup &amp; restore</h3></div>
    <p class="note" style="margin-bottom:14px">Your data saves automatically on this device. Keep an occasional <b style="color:var(--text)">JSON backup</b> in iCloud or Files — it\u2019s your safety copy if you reinstall or switch phones. CSV and Excel are for opening data in spreadsheets.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn primary" onclick="window.__exportJSON()">${svg("download",16)}JSON backup</button>
      <button class="btn" onclick="window.__importJSON()">${svg("upload",16)}Restore backup</button>
      <button class="btn" onclick="window.__exportCSV()">${svg("download",16)}CSV</button>
      <button class="btn" onclick="window.__exportXLS()">${svg("download",16)}Excel (.xls)</button>
    </div>
    <p class="note" style="margin-top:12px">${DB.meta && DB.meta.lastBackup ? "Last backup: "+new Date(DB.meta.lastBackup).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "No backup saved yet."}</p>
  </div>`;
  buildReport();
}
function buildReport(){
  const sel=document.getElementById("repPeriod");if(!sel)return;
  const period=sel.value;const now=new Date();let from,to=TODAY(),title;
  if(period==="week"){from=fmtISO(startOfWeek(now));title="Weekly report";}
  else if(period==="month"){from=fmtISO(new Date(now.getFullYear(),now.getMonth(),1));title="Monthly report";}
  else if(period==="quarter"){const q=Math.floor(now.getMonth()/3);from=fmtISO(new Date(now.getFullYear(),q*3,1));title="Quarterly report";}
  else{from=fmtISO(new Date(now.getFullYear(),0,1));title="Year-to-date report";}
  const ws=DB.workouts.filter(w=>w.date>=from&&w.date<=to);
  const cal=sum(ws,w=>w.calories),dur=sum(ws,w=>w.duration),dist=sum(ws,w=>w.distance),steps=sum(ws,w=>w.steps);
  const days=new Set(ws.map(w=>w.date)).size;
  const byType={};ws.forEach(w=>byType[w.type]=(byType[w.type]||0)+w.calories);
  const typeLines=Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`  ${(TYPES[t]?.label||t).padEnd(14)} ${fmtInt(c).padStart(8)} kcal`).join("\n");
  document.getElementById("reportOut").textContent=
`${title.toUpperCase()}
${fmtDateLong(from)}  →  ${fmtDateLong(to)}
${"-".repeat(46)}
Workouts logged      ${String(ws.length).padStart(8)}
Active days          ${String(days).padStart(8)}
Calories burned      ${fmtInt(cal).padStart(8)} kcal
Time exercised       ${fmtNum(dur/60).padStart(8)} h
Distance covered     ${fmtNum(U.dist(dist)).padStart(8)} ${U.distU()}
Steps                ${fmtInt(steps).padStart(8)}
Avg / active day     ${fmtInt(days?cal/days:0).padStart(8)} kcal
Est. fat loss        ${fmtNum(U.wt(cal/KCAL_PER_KG_FAT)).padStart(8)} ${U.wtU()}
${"-".repeat(46)}
BY ACTIVITY
${typeLines||"  (none)"}
${"-".repeat(46)}
Generated ${new Date().toLocaleString()} · FitTrack Pro`;
}

/* ---- SETTINGS ---- */
function viewSettings(){
  const v=document.getElementById("view");const s=DB.settings;
  const accents=["#FF5A3C","#36D6C3","#7C5CFF","#22C55E","#F43F5E","#3B82F6","#F59E0B"];
  v.innerHTML=`
  <div class="grid cols-2" style="margin-bottom:var(--gap)">
    <div class="card">
      <div class="card-head"><h3>Appearance</h3></div>
      <div class="field"><label>Theme</label>
        <div class="seg">${["dark","light","system"].map(t=>`<button class="${s.theme===t?"on":""}" onclick="window.__setTheme('${t}')">${t[0].toUpperCase()+t.slice(1)}</button>`).join("")}</div>
      </div>
      <div class="field"><label>Accent colour</label>
        <div class="swatches">
          ${accents.map(c=>`<span class="swatch${s.accent.toLowerCase()===c.toLowerCase()?" on":""}" style="background:${c}" onclick="window.__setAccent('${c}')"></span>`).join("")}
          <input type="color" class="color-input" value="${s.accent}" oninput="window.__setAccent(this.value)">
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Units</h3></div>
      <div class="field"><label>Measurement system</label>
        <div class="seg">
          <button class="${s.units==="metric"?"on":""}" onclick="window.__setUnits('metric')">Metric (kg, km)</button>
          <button class="${s.units==="imperial"?"on":""}" onclick="window.__setUnits('imperial')">Imperial (lb, mi)</button>
        </div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-bottom:var(--gap)">
    <div class="card-head"><h3>How your data is saved</h3></div>
    <p class="note" style="line-height:1.7;margin-bottom:14px">
      FitTrack saves <b style="color:var(--text)">automatically on this device</b> as you go — no cloud, no account, no internet. Your data stays even after you close the app. The only time it can be lost is if you delete the app or wipe Safari\u2019s data, so keep an occasional backup.
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn primary" onclick="window.__exportJSON()">${svg("download",16)}Back up now</button>
      <button class="btn" onclick="window.__importJSON()">${svg("upload",16)}Restore backup</button>
    </div>
    <p class="note" style="margin-bottom:14px">${DB.meta && DB.meta.lastBackup ? "Last backup: "+new Date(DB.meta.lastBackup).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "No backup saved yet — tap \u201cBack up now\u201d and choose Save to Files."}</p>
    <div id="platformHelp"></div>
  </div>
  <div class="card" style="margin-bottom:var(--gap)">
    <div class="card-head"><h3>Demo data</h3></div>
    <p class="note" style="margin-bottom:12px">Loads ~90 days of example workouts so you can explore charts and analytics. Delete them from the Workouts view afterwards.</p>
    <button class="btn" onclick="window.__loadDemo()">${svg("spark",16)}Load demo data</button>
  </div>
  <div class="card">
    <div class="card-head"><h3>Reset</h3></div>
    <p class="note" style="margin-bottom:12px">Permanently clear all workouts, goals and settings from this device. Export a JSON backup from Reports first.</p>
    <button class="btn danger" onclick="window.__resetApp()">${svg("trash",16)}Erase all data</button>
  </div>`;

  // platform-specific install/backup help
  const help = document.getElementById("platformHelp");
  if(help){
    if(IS_IOS && !IS_STANDALONE){
      help.innerHTML = `
        <div class="step"><div class="n">1</div><div class="tx"><b>Install:</b> in <b>Safari</b>, tap the Share icon, then <b>Add to Home Screen</b>. After that it opens like an app and runs fully offline.</div></div>
        <div class="step"><div class="n">2</div><div class="tx"><b>Back up:</b> from Reports, tap <b>JSON backup</b> now and then and save it to iCloud or Files — that\u2019s your safety copy.</div></div>
        <div class="step"><div class="n">3</div><div class="tx"><b>New phone / reinstall:</b> install the app again, then open Reports and import your JSON backup.</div></div>`;
    } else if(IS_STANDALONE){
      help.innerHTML = `
        <div class="step"><div class="n">1</div><div class="tx"><b>You\u2019re installed.</b> FitTrack now runs offline from your Home Screen and saves automatically.</div></div>
        <div class="step"><div class="n">2</div><div class="tx"><b>Back up:</b> export a JSON backup from Reports occasionally and keep it in iCloud/Files, in case you reinstall.</div></div>`;
    } else {
      help.innerHTML = `
        <div class="step"><div class="n">1</div><div class="tx"><b>Install:</b> use your browser\u2019s Install icon in the address bar (Chrome/Edge) to add it as a desktop app.</div></div>
        <div class="step"><div class="n">2</div><div class="tx"><b>Back up:</b> export a JSON backup from Reports now and then; import it to restore or move to another device.</div></div>`;
    }
  }
}

/* ===========================================================================
   WORKOUT MODAL
   =========================================================================== */
let draft={};
function openWorkout(id,dateHint){
  const w=id?DB.workouts.find(x=>x.id===id):null;
  const d=w?{...w}:{id:null,date:dateHint||TODAY(),type:"running",calories:"",duration:"",distance:"",steps:"",avgHeartRate:"",maxHeartRate:"",rpe:"",intensity:"moderate",mood:"",notes:""};
  const distVal=d.distance!==""&&d.distance!=null?fmtNum(U.dist(Number(d.distance))):"";
  const modal=document.getElementById("modal");
  modal.innerHTML=`
    <div class="modal-head"><h2>${w?"Edit workout":"Log workout"}</h2><button class="iconbtn" onclick="window.__closeModal()">${svg("x")}</button></div>
    <div class="modal-body">
      <div class="field"><label>Activity</label>
        <div class="seg" id="typeSeg">${Object.entries(TYPES).map(([k,t])=>`<button data-t="${k}" class="${d.type===k?"on":""}" onclick="window.__pickType('${k}')">${t.label}</button>`).join("")}</div>
      </div>
      <div class="row2">
        <div class="field"><label>Date</label><input class="input" type="date" id="f_date" value="${d.date}"></div>
        <div class="field"><label>Calories burned (kcal)</label><input class="input num" type="number" id="f_calories" value="${d.calories}" placeholder="e.g. 420"></div>
      </div>
      <div class="row3">
        <div class="field"><label>Duration (min)</label><input class="input num" type="number" id="f_duration" value="${d.duration}" placeholder="45"></div>
        <div class="field"><label>Distance (${U.distU()})</label><input class="input num" type="number" step="0.01" id="f_distance" value="${distVal}" placeholder="5"></div>
        <div class="field"><label>Steps</label><input class="input num" type="number" id="f_steps" value="${d.steps}" placeholder="6000"></div>
      </div>
      <div class="row3">
        <div class="field"><label>Avg heart rate</label><input class="input num" type="number" id="f_avg" value="${d.avgHeartRate}" placeholder="bpm"></div>
        <div class="field"><label>Max heart rate</label><input class="input num" type="number" id="f_max" value="${d.maxHeartRate}" placeholder="bpm"></div>
        <div class="field"><label>RPE (1–10)</label><input class="input num" type="number" min="1" max="10" id="f_rpe" value="${d.rpe}" placeholder="7"></div>
      </div>
      <div class="field"><label>Intensity</label>
        <div class="seg" id="intSeg">${INTENSITIES.map(x=>`<button data-i="${x}" class="${d.intensity===x?"on":""}" onclick="window.__pickInt('${x}')">${x[0].toUpperCase()+x.slice(1)}</button>`).join("")}</div>
      </div>
      <div class="field"><label>Mood</label>
        <div class="seg" id="moodSeg">${MOODS.map(m=>`<button data-m="${m}" class="${d.mood===m?"on":""}" style="font-size:18px" onclick="window.__pickMood('${m}')">${m}</button>`).join("")}</div>
      </div>
      <div class="field"><label>Notes</label><textarea class="input" id="f_notes" placeholder="How did it feel? Route, weather, PBs…">${esc(d.notes||"")}</textarea></div>
    </div>
    <div class="modal-foot">
      <div>${w?`<button class="btn danger ghost" onclick="window.__delWorkout('${w.id}',true)">${svg("trash",15)}Delete</button>`:""}</div>
      <div style="display:flex;gap:9px">
        <button class="btn ghost" onclick="window.__closeModal()">Cancel</button>
        <button class="btn primary" onclick="window.__saveWorkout('${w?w.id:""}')">${svg("check",15)}${w?"Save changes":"Save workout"}</button>
      </div>
    </div>`;
  draft={type:d.type,intensity:d.intensity,mood:d.mood};
  document.getElementById("scrim").classList.add("open");
}
function openDay(iso){
  const list=(byDate()[iso]||[]);
  if(!list.length){openWorkout(null,iso);return;}
  const modal=document.getElementById("modal");
  modal.innerHTML=`
    <div class="modal-head"><h2>${fmtDateLong(iso)}</h2><button class="iconbtn" onclick="window.__closeModal()">${svg("x")}</button></div>
    <div class="modal-body"><div class="wlist">${list.map(workoutRow).join("")}</div></div>
    <div class="modal-foot">
      <div class="note">${fmtInt(list.reduce((t,w)=>t+w.calories,0))} kcal · ${list.length} workout${list.length>1?"s":""}</div>
      <button class="btn primary" onclick="window.__addOnDay('${iso}')">${svg("plus",15)}Add another</button>
    </div>`;
  document.getElementById("scrim").classList.add("open");
}

/* ===========================================================================
   TOAST
   =========================================================================== */
function toast(msg,good){
  const t=document.createElement("div");
  t.className=`toast${good?" good":""}`;
  t.innerHTML=(good?svg("check",15):"")+" "+msg;
  document.getElementById("toasts").appendChild(t);
  setTimeout(()=>{t.style.opacity="0";t.style.transition=".3s";setTimeout(()=>t.remove(),300);},3000);
}

/* ===========================================================================
   GLOBAL HANDLERS
   =========================================================================== */
window.__go           = go;
window.__addWorkout   = ()=>openWorkout(null);
window.__editWorkout  = id=>openWorkout(id);
window.__openDay      = iso=>openDay(iso);
window.__addOnDay     = iso=>openWorkout(null,iso);
window.__closeModal   = ()=>document.getElementById("scrim").classList.remove("open");
window.__calMove      = n=>{calMonth.setMonth(calMonth.getMonth()+n);viewCalendar();};
window.__calToday     = ()=>{calMonth=new Date();calMonth.setDate(1);viewCalendar();};
window.__wSearch      = v=>{workoutFilter.q=v;clearTimeout(window.__wt);window.__wt=setTimeout(viewWorkouts,200);};
window.__wType        = v=>{workoutFilter.type=v;viewWorkouts();};
window.__pickType     = t=>{draft.type=t;document.querySelectorAll("#typeSeg button").forEach(b=>b.classList.toggle("on",b.dataset.t===t));};
window.__pickInt      = i=>{draft.intensity=i;document.querySelectorAll("#intSeg button").forEach(b=>b.classList.toggle("on",b.dataset.i===i));};
window.__pickMood     = m=>{draft.mood=draft.mood===m?"":m;document.querySelectorAll("#moodSeg button").forEach(b=>b.classList.toggle("on",b.dataset.m===m&&draft.mood===m));};
window.__buildReport  = buildReport;
window.__copyReport   = ()=>{const t=document.getElementById("reportOut")?.textContent;navigator.clipboard?.writeText(t).then(()=>toast("Copied",true));};

window.__saveWorkout = id=>{
  const date=document.getElementById("f_date").value||TODAY();
  const calories=num("f_calories"),duration=num("f_duration");
  if(calories<=0&&duration<=0){toast("Enter at least calories or duration.");return;}
  const rec={
    id:id||uid(),date,type:draft.type,calories,duration,
    distance:U.distIn(num("f_distance")),steps:num("f_steps"),
    avgHeartRate:num("f_avg")||"",maxHeartRate:num("f_max")||"",
    rpe:num("f_rpe")||"",intensity:draft.intensity,mood:draft.mood||"",
    notes:document.getElementById("f_notes").value.trim()
  };
  if(id){const i=DB.workouts.findIndex(w=>w.id===id);if(i>=0)DB.workouts[i]=rec;else DB.workouts.push(rec);}
  else DB.workouts.push(rec);
  markDirty();
  window.__closeModal();render();
  checkAchievements();
  toast(id?"Workout updated":"Workout saved",true);
};

window.__delWorkout = (id,fromModal)=>{
  if(!confirm("Delete this workout?"))return;
  DB.workouts=DB.workouts.filter(w=>w.id!==id);
  markDirty();
  if(fromModal)window.__closeModal();
  render();toast("Workout deleted");
};

window.__saveGoals = ()=>{
  ["dailyCalories","weeklyCalories","monthlyCalories","exerciseMinutes","workoutsPerWeek","steps"].forEach(k=>{
    const el=document.getElementById("goal_"+k);if(el)DB.goals[k]=Number(el.value)||0;
  });
  const dist=document.getElementById("goal_distanceDisp"),wt2=document.getElementById("goal_weightDisp");
  if(dist)DB.goals.distance=U.distIn(Number(dist.value)||0);
  if(wt2)DB.goals.weight=U.wtIn(Number(wt2.value)||0);
  markDirty();render();toast("Targets saved",true);
};

window.__addCustom = ()=>{
  const modal=document.getElementById("modal");
  modal.innerHTML=`<div class="modal-head"><h2>Custom achievement</h2><button class="iconbtn" onclick="window.__closeModal()">${svg("x")}</button></div>
    <div class="modal-body">
      <div class="field"><label>Title</label><input class="input" id="c_title" placeholder="First 10k run"></div>
      <div class="field"><label>Description</label><input class="input" id="c_desc" placeholder="Ran 10km without stopping"></div>
      <div class="field"><label>Date earned</label><input class="input" type="date" id="c_date" value="${TODAY()}"></div>
    </div>
    <div class="modal-foot"><div></div><button class="btn primary" onclick="window.__saveCustom()">${svg("check",15)}Add</button></div>`;
  document.getElementById("scrim").classList.add("open");
};
window.__saveCustom = ()=>{
  const title=document.getElementById("c_title").value.trim();if(!title){toast("Give it a title.");return;}
  DB.custom.unshift({id:uid(),title,description:document.getElementById("c_desc").value.trim(),earnedDate:document.getElementById("c_date").value});
  markDirty();window.__closeModal();render();toast("Achievement added",true);
};
window.__delCustom = i=>{DB.custom.splice(i,1);markDirty();render();};

window.__setTheme = t=>{DB.settings.theme=t;markDirty();applyTheme();render();};
window.__setAccent = c=>{DB.settings.accent=c;markDirty();applyAccent();render();};
window.__setUnits = u=>{DB.settings.units=u;markDirty();render();toast("Units updated",true);};

window.__loadDemo = ()=>{
  if(DB.workouts.length&&!confirm("Add demo workouts to existing data?"))return;
  seedDemo();markDirty();render();toast("Demo data loaded",true);
};
window.__resetApp = ()=>{
  if(!confirm("Erase ALL data from this file permanently?"))return;
  DB=clone(DEFAULTS);markDirty();applyTheme();applyAccent();go("dashboard");toast("All data cleared");
};

/* exports */
function dl(name,content,type){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.__exportCSV = ()=>{
  const cols=["date","type","calories","duration","distance_km","steps","avgHeartRate","maxHeartRate","rpe","intensity","mood","notes"];
  const rows=sortedWorkouts().map(w=>[w.date,w.type,w.calories,w.duration,w.distance,w.steps,w.avgHeartRate,w.maxHeartRate,w.rpe,w.intensity,w.mood,(w.notes||"").replace(/"/g,'""')].map(x=>`"${x??""}"`).join(","));
  dl(`fittrack-${TODAY()}.csv`,[cols.join(","),...rows].join("\n"),"text/csv");toast("CSV exported",true);
};
window.__exportXLS = ()=>{
  const head=["Date","Type","Calories","Duration (min)","Distance (km)","Steps","Avg HR","Max HR","RPE","Intensity","Mood","Notes"];
  const rows=sortedWorkouts().map(w=>`<tr>${[w.date,TYPES[w.type]?.label||w.type,w.calories,w.duration,w.distance,w.steps,w.avgHeartRate,w.maxHeartRate,w.rpe,w.intensity,w.mood,w.notes].map(x=>`<td>${esc(String(x??""))}</td>`).join("")}</tr>`).join("");
  const html=`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr>${rows}</table></body></html>`;
  dl(`fittrack-${TODAY()}.xls`,html,"application/vnd.ms-excel");toast("Excel exported",true);
};
window.__exportJSON = ()=>{dl(`fittrack-backup-${TODAY()}.json`,JSON.stringify(DB,null,2),"application/json");markBackedUp();render();toast("Backup saved to your device",true);};
window.__importJSON = ()=>{
  const inp=document.createElement("input");inp.type="file";inp.accept=".json,application/json";
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const data=JSON.parse(r.result);
        if(!data||!Array.isArray(data.workouts))throw new Error("not a FitTrack backup");
        if(!confirm(`Restore ${data.workouts.length} workouts from this backup? This replaces the data currently on this device.`))return;
        DB=Object.assign(clone(DEFAULTS),data);
        DB.goals={...DEFAULTS.goals,...(data.goals||{})};
        DB.settings={...DEFAULTS.settings,...(data.settings||{})};
        DB.meta={...DEFAULTS.meta,...(data.meta||{})};
        DB.workouts=data.workouts||[];DB.custom=data.custom||[];
        persist();applyAccent();applyTheme();go("dashboard");
        toast("Backup restored",true);
      }catch(e){toast("That file isn't a valid FitTrack backup.");}
    };
    r.readAsText(f);
  };
  inp.click();
};

/* ===========================================================================
   ACHIEVEMENT UNLOCK TOAST
   =========================================================================== */
let earnedSet=new Set();
function checkAchievements(){
  const defs=achievementDefs();
  const now=new Set(defs.filter(d=>d.cur>=d.goal).map(d=>d.id));
  for(const id of now){if(!earnedSet.has(id)){const d=defs.find(x=>x.id===id);toast(`Achievement unlocked — ${d.t}!`,true);}}
  earnedSet=now;
}

/* ===========================================================================
   DEMO DATA
   =========================================================================== */
function seedDemo(){
  const pool=["running","walking","gym","cycling","hiit","yoga","swimming","rowing","hiking"];
  for(let i=89;i>=0;i--){
    if(Math.random()<0.28)continue;
    const date=fmtISO(addDays(new Date(),-i));
    const n=Math.random()<0.12?2:1;
    for(let k=0;k<n;k++){
      const type=pool[Math.floor(Math.random()*pool.length)];
      const dur=Math.round(20+Math.random()*60);
      const cal=Math.round(dur*(5+Math.random()*6));
      const dist=["running","walking","cycling","hiking"].includes(type)?Math.round((2+Math.random()*12)*10)/10:0;
      DB.workouts.push({id:uid(),date,type,calories:cal,duration:dur,distance:dist,
        steps:["walking","running","hiking"].includes(type)?Math.round(3000+Math.random()*11000):0,
        avgHeartRate:Math.round(110+Math.random()*50),maxHeartRate:Math.round(160+Math.random()*25),
        rpe:Math.round(3+Math.random()*6),intensity:INTENSITIES[Math.floor(Math.random()*4)],
        mood:MOODS[Math.floor(2+Math.random()*3)],notes:""});
    }
  }
}

/* ===========================================================================
   iOS INSTALL / FIRST-RUN GUIDANCE
   =========================================================================== */
function showInstallBanner(){
  const v = document.getElementById('view');
  if(!v) return;

  // 1) Backup reminder — highest priority, any platform
  if(backupDue() && !DB.__backupDismissed && !document.getElementById('backupBanner')){
    const b = document.createElement('div');
    b.className = 'install-banner show';
    b.id = 'backupBanner';
    b.innerHTML = `
      <div class="ib-ic">${svg('download',20)}</div>
      <div class="ib-tx"><b>Time for a backup</b><br>Save a copy of your data somewhere safe (iCloud, Files, email) in case you ever reinstall.</div>
      <button class="btn sm primary" onclick="window.__exportJSON()">Back up</button>
      <button class="iconbtn" style="width:32px;height:32px" onclick="window.__dismissBackup()">${svg('x',15)}</button>`;
    v.insertBefore(b, v.firstChild);
  }

  // 2) iOS install hint — only in a normal browser tab, not yet installed
  if(IS_IOS && !IS_STANDALONE && !DB.__bannerDismissed && !document.getElementById('iosBanner')){
    const banner = document.createElement('div');
    banner.className = 'install-banner show';
    banner.id = 'iosBanner';
    banner.innerHTML = `
      <div class="ib-ic">${svg('plus',20)}</div>
      <div class="ib-tx"><b>Install as an app</b><br>Tap the <b>Share</b> icon below, then <b>Add to Home Screen</b>. After that it runs fully offline.</div>
      <button class="iconbtn" style="width:32px;height:32px" onclick="window.__dismissBanner()">${svg('x',15)}</button>`;
    v.insertBefore(banner, v.firstChild);
  }
}
window.__dismissBanner = ()=>{ DB.__bannerDismissed = true; document.getElementById('iosBanner')?.remove(); };
window.__dismissBackup = ()=>{ DB.__backupDismissed = true; document.getElementById('backupBanner')?.remove(); };

/* Mobile "More" menu — reaches the sections that don't fit in the bottom bar */
window.__moreMenu = ()=>{
  const items=[
    ["reports","Reports","reports"],
    ["goals","Goals","goals"],
    ["achievements","Achievements","achievements"],
    ["settings","Settings","settings"]
  ];
  const modal=document.getElementById("modal");
  modal.innerHTML=`
    <div class="modal-head"><h2>More</h2><button class="iconbtn" onclick="window.__closeModal()">${svg('x')}</button></div>
    <div class="modal-body">
      <div class="wlist">
        ${items.map(([v,label,icon])=>`<div class="wrow" onclick="window.__closeModal();window.__go('${v}')">
          <div class="wicon" style="color:var(--accent)">${svg(icon)}</div>
          <div class="wmeta"><div class="t">${label}</div></div>
          <div style="color:var(--muted)">${svg('x',16).replace('M6 6l12 12M18 6 6 18','M9 6l6 6-6 6')}</div>
        </div>`).join("")}
      </div>
      <button class="btn primary" style="width:100%;justify-content:center;margin-top:14px" onclick="window.__closeModal();window.__exportJSON()">${svg('download',16)}Back up my data now</button>
    </div>`;
  document.getElementById("scrim").classList.add("open");
};

/* ===========================================================================
   THEME / ACCENT
   =========================================================================== */
function applyTheme(){
  let t=DB.settings.theme;
  if(t==="system")t=window.matchMedia("(prefers-color-scheme:light)").matches?"light":"dark";
  document.documentElement.setAttribute("data-theme",t);
  const themeBtn=document.getElementById("themeBtn");
  if(themeBtn)themeBtn.innerHTML=svg(DB.settings.theme==="light"?"sun":DB.settings.theme==="system"?"settings":"moon");
}
function applyAccent(){
  document.documentElement.style.setProperty("--accent",DB.settings.accent);
  try{
    const c=DB.settings.accent.replace("#","");
    const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);
    const f=x=>Math.min(255,Math.round(x+(255-x)*.28));
    const ink=`#${[f(r),f(g),f(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}`;
    document.documentElement.style.setProperty("--accent-ink",ink);
  }catch(e){}
}

/* ===========================================================================
   BOOT
   =========================================================================== */
function buildNav(){
  const nav=document.getElementById("nav"),bot=document.getElementById("botnav");
  nav.innerHTML=NAV.map(([v,l])=>`<button data-v="${v}" onclick="window.__go('${v}')">${svg(v,19)}<span>${l}</span></button>`).join("");
  const botItems=[["dashboard","Home"],["calendar","Calendar"],["workouts","Log"],["analytics","Stats"],["__more","More"]];
  bot.innerHTML=botItems.map(([v,l])=>`<button data-v="${v}" onclick="${v==='__more'?'window.__moreMenu()':`window.__go('${v}')`}">${svg(v==='__more'?'settings':v,21)}<span>${l}</span></button>`).join("");
  const mark=`<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M3 15 L8 7 L11 12 L15 5 L21 13"/></svg>`;
  const bm=document.getElementById("brandMark");if(bm)bm.innerHTML=mark;
  const bmm=document.getElementById("brandMarkM");if(bmm)bmm.innerHTML=mark;
}

async function boot(){
  await loadDB();                       // <-- load saved data before drawing anything
  applyAccent();applyTheme();buildNav();

  document.getElementById("themeBtn").onclick=()=>{
    const order=["dark","light","system"];
    DB.settings.theme=order[(order.indexOf(DB.settings.theme)+1)%3];
    markDirty();applyTheme();if(current==="settings")render();
  };
  document.getElementById("addBtn").onclick=()=>openWorkout(null);
  document.getElementById("scrim").onclick=e=>{if(e.target===document.getElementById("scrim"))window.__closeModal();};

  // Shorten the "Log workout" label on small screens to just "Log"
  const setAddLabel=()=>{const l=document.querySelector(".addlbl");if(l)l.textContent=window.innerWidth<560?"Log":"Log workout";};
  setAddLabel();
  window.addEventListener("keydown",e=>{
    if(e.key==="Escape")window.__closeModal();
    if(e.key==="n"&&!/input|textarea|select/i.test(e.target.tagName))openWorkout(null);
  });
  window.matchMedia("(prefers-color-scheme:light)").addEventListener("change",()=>{if(DB.settings.theme==="system")applyTheme();});
  let rt;window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{setAddLabel();if(["dashboard","analytics"].includes(current))render();},220);});
  earnedSet=new Set(achievementDefs().filter(d=>d.cur>=d.goal).map(d=>d.id));
  setStatus("saved");
  go("dashboard");

  // register service worker for offline use (only works over http/https, ignored on file://)
  if("serviceWorker" in navigator && location.protocol.startsWith("http")){
    navigator.serviceWorker.register("service-worker.js").catch(()=>{});
  }
}

boot().catch(err=>{
  var v = document.getElementById("view");
  if(v){
    v.innerHTML = '<div class="card"><div class="empty">'
      + '<h3>Couldn\'t start the app</h3>'
      + '<p>Something went wrong loading FitTrack Pro. If you opened this directly from the Files app on iPhone, that preview can\'t run apps — install it to your Home Screen first (see the setup steps you were given).</p>'
      + '<p style="font-family:var(--font-num);font-size:11px;color:var(--faint);margin-top:10px;word-break:break-word">'+ (err && err.message ? String(err.message) : 'unknown error') +'</p>'
      + '</div></div>';
  }
});
})();
