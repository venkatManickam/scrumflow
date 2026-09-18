/* ============================================================
   Scrum Command Center PRO — app.js (fully offline)
   ============================================================ */

/* ================= STATE ================= */
let TASKS = [], TICKETS = [], ENTRIES = [], CHANGES = [], charts = {};
let PLAN = []; /* [{project,phase,start:Date,end:Date,progress,status,owner,milestone,notes}] */
let EXTRA_PROJECTS = []; /* projects created in the tool that have no sheet yet */
let SESSION_EDITS = []; /* edits made inside the tool this session, shown in the Changed tab */
function logEdit(icon, title, detail){
  SESSION_EDITS.unshift({icon, title, detail, at:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})});
  const b=document.getElementById('changesBadge');
  if(b){ b.textContent=((CHANGES&&CHANGES.length)||0)+SESSION_EDITS.length; b.classList.remove('hidden'); }
}
let sortState = {col:null,dir:1}, histOpen = false, dlSelectedDate = '';
let fileHandle = null, currentFileName = '', dirty = false;
const AVATAR_COLORS = ['#2563eb','#8b5cf6','#16a34a','#ea8a0c','#dc2626','#0891b2','#c026d3','#65a30d','#e11d48','#7c3aed','#0d9488','#d97706'];
const SNAP_KEY = 'sccp_snapshot', STATE_KEY = 'sccp_state', THEME_KEY = 'sccp_theme';
const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const FSAPI = 'showOpenFilePicker' in window;

/* ================= INDEXEDDB (for persisting the file handle) ================= */
function idb(){
  return new Promise((res,rej)=>{
    const rq = indexedDB.open('sccp_db',1);
    rq.onupgradeneeded = ()=>rq.result.createObjectStore('kv');
    rq.onsuccess = ()=>res(rq.result);
    rq.onerror = ()=>rej(rq.error);
  });
}
async function idbSet(k,v){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function idbGet(k){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction('kv','readonly');const rq=tx.objectStore('kv').get(k);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error);});}
async function idbDel(k){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').delete(k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}

/* ---------- DISCONNECT / LOGOUT ---------- */
async function disconnectFile(){
  const msg = dirty
    ? 'You have UNSAVED edits — they will be lost.\n\nDisconnect from "'+currentFileName+'" and start fresh?'
    : 'Disconnect from "'+currentFileName+'"?\n\nThis clears the connected file, saved session and comparison history so you can load a different project file. (Recent files list is kept.)';
  if(!confirm(msg)) return;
  try{ await idbDel('handle'); }catch(e){}
  try{ localStorage.removeItem(STATE_KEY); localStorage.removeItem(SNAP_KEY); }catch(e){}
  fileHandle=null; currentFileName='';
  clearTimeout(awTimer);
  TASKS=[]; TICKETS=[]; ENTRIES=[]; PLAN=[]; EXTRA_PROJECTS=[]; CHANGES=null; MP=[]; SESSION_EDITS=[];
  Object.values(charts).forEach(c=>c&&c.destroy()); charts={};
  setDirty(false);
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('uploadView').classList.remove('hidden');
  toast('Disconnected ✓ — connect or drop a different tracker file');
}

/* ================= FILE CONNECTION (File System Access API) ================= */
async function connectFile(){
  if(!FSAPI){ toast('Your browser does not support connected files. Use Chrome or Edge, or use drag-drop.'); return; }
  try{
    const [h] = await window.showOpenFilePicker({
      types:[{description:'Excel tracker',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx','.xlsm']}}]
    });
    fileHandle = h;
    await idbSet('handle', h);
    await rememberHandle(h);
    await loadFromHandle();
    toast('File connected — press Refresh anytime to reload the latest version');
  }catch(e){ if(e.name!=='AbortError') toast('Could not connect: '+e.message); }
}
async function refreshFile(){
  if(dirty && !confirm('⚠ You have edits not yet written to Excel.\n\nRefreshing re-reads the file and will OVERWRITE your tool edits.\n\nTip: use ⬆ Save to Excel first to keep them.\n\nContinue with refresh anyway?')) return;
  if(!fileHandle){
    try{ fileHandle = await idbGet('handle'); }catch(e){}
  }
  if(!fileHandle){ toast('No file connected yet — click "Connect different file" first'); return; }
  try{
    let perm = await fileHandle.queryPermission({mode:'read'});
    if(perm!=='granted'){ perm = await fileHandle.requestPermission({mode:'read'}); }
    if(perm!=='granted'){ toast('Permission denied — cannot read the file'); return; }
    await loadFromHandle();
    toast('Refreshed from '+currentFileName+' ✓');
  }catch(e){ toast('Refresh failed: '+e.message); }
}
async function loadFromHandle(){
  const file = await fileHandle.getFile();
  const buf = await file.arrayBuffer();
  parseWorkbook(XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true}), file.name, true);
}

/* ================= THEME ================= */
function toggleTheme(){
  const next = document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('themeBtn').textContent = next==='dark'?'☀️':'🌙';
  try{localStorage.setItem(THEME_KEY,next);}catch(e){}
  Object.values(charts).forEach(c=>c&&c.destroy()); charts={};
  if(TASKS.length) renderCharts();
}
(function initTheme(){
  let t='light'; try{t=localStorage.getItem(THEME_KEY)||'light';}catch(e){}
  document.documentElement.setAttribute('data-theme',t);
  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('themeBtn').textContent=t==='dark'?'☀️':'🌙';
    if(!FSAPI){
      document.getElementById('fsapiNote').textContent = '⚠ Connected-file mode needs Chrome or Edge. Firefox users: use drag-drop instead.';
    } else {
      document.getElementById('fsapiNote').textContent = 'Tip: pick the file inside your local OneDrive sync folder — OneDrive keeps it updated from SharePoint, so Refresh always gets the latest.';
    }
    tryRestoreSession();
  });
})();

async function tryRestoreSession(){
  /* EXCEL-FIRST: the connected file is the source of truth.
     Browser storage is only crash-recovery for unpublished edits. */
  let pending=null;
  try{ pending=JSON.parse(localStorage.getItem(STATE_KEY)); }catch(e){}
  if(FSAPI){
    try{
      const h = await idbGet('handle');
      if(h){
        fileHandle = h;
        const perm = await h.queryPermission({mode:'read'});
        if(perm==='granted'){
          await loadFromHandle();
          if(pending && pending.tasks && pending.tasks.length){
            if(confirm('\ud83d\udcbe You have UNPUBLISHED edits from your last session ('+(pending.fname||'')+').\n\nOK = load them and write to Excel now\nCancel = discard them and keep the Excel version (recommended if unsure)')){
              hydrateState(pending);
              setDirty(true);
              toast('Unpublished edits loaded \u2014 auto-writing to Excel\u2026');
            } else {
              try{ localStorage.removeItem(STATE_KEY); }catch(e){}
            }
          }
          toast('\ud83d\udcc2 Loaded latest from '+currentFileName+' (Excel is the source of truth)');
          return;
        }
      }
    }catch(e){}
  }
  /* file not reachable: fall back to recovery copy so nothing is lost */
  if(pending && pending.tasks && pending.tasks.length){
    hydrateState(pending);
    setDirty(true);
    toast('\u26a0 File not accessible \u2014 loaded unpublished edits. Connect the tracker and they will be written to Excel.');
  }
}

/* ================= FILE INTAKE (drag/drop + manual) ================= */
document.addEventListener('DOMContentLoaded',()=>{
  const dz = document.getElementById('dropzone');
  dz.addEventListener('click',()=>document.getElementById('fileInput').click());
  dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover');});
  dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));
  dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');if(e.dataTransfer.files.length)handleFile(e.dataTransfer.files[0]);});
  document.getElementById('fileInput').addEventListener('change',e=>{if(e.target.files.length)handleFile(e.target.files[0]);e.target.value='';});
});
function handleFile(file){
  const reader = new FileReader();
  reader.onload = e => {
    try{ parseWorkbook(XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true}), file.name, false); }
    catch(err){ alert('Could not read this file.\n'+err.message); }
  };
  reader.readAsArrayBuffer(file);
}

/* ================= PARSING ================= */
function normStatus(s){
  if(!s) return 'open';
  s = String(s).toLowerCase().replace(/[\s\-_]/g,'');
  if(s.includes('complet')) return 'completed';
  if(s.includes('progress')) return 'inprogress';
  if(s.includes('hold')) return 'hold';
  if(s.includes('recur')) return 'recurring';
  return 'open';
}
function pad(n){return String(n).padStart(2,'0');}
function fmtDate(d){
  if(!d) return '';
  if(d instanceof Date && !isNaN(d)) return pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+d.getFullYear();
  return String(d).trim();
}
function todayStr(){const d=new Date();return pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+d.getFullYear();}
function isoToDMY(iso){ if(!iso) return ''; const p=iso.split('-'); return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:''; }
function dmyToISO(dmy){ const d=parseETA(dmy); return d? d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()) : ''; }
function parseETA(s){
  if(!s||/tbd/i.test(s)) return null;
  let m=String(s).match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); if(m) return new Date(+m[3],+m[2]-1,+m[1]);
  m=String(s).match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=String(s).match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})(?!\d)/); if(m) return new Date(2000+ +m[3],+m[2]-1,+m[1]);
  return null;
}
function parseEntries(update){
  if(!update) return [];
  const out = []; let cur = null;
  const refYear = new Date().getFullYear();
  for(let raw of update.split('\n')){
    let line = raw.trim(); if(!line) continue;
    line = line.replace(/^(\d{1,2})[\.\)]\s*(?=\d{1,2}[-\/][A-Za-z0-9])/,'');
    const m = line.match(/^(\d{1,2})[-\/.]([A-Za-z]{3,9}|\d{1,2})(?:[-\/_.](\d{2,4}))?\s*[':s]*[:\-–]?\s*(.*)$/);
    if(m){
      let dd=+m[1], mm, yy=null;
      if(isNaN(+m[2])){ mm = MONTHS[m[2].toLowerCase().slice(0,3)]; } else mm = +m[2];
      if(m[3]!==undefined && m[3]!==''){ yy = +m[3]<100 ? 2000+ +m[3] : +m[3]; }
      if(mm>=1 && mm<=12 && dd>=1 && dd<=31){
        if(yy===null){
          yy = refYear;
          const guess = new Date(yy,mm-1,dd);
          if(guess - new Date() > 30*864e5) yy--;
        }
        if(yy>=2020 && yy<=2035){
          cur = { date:new Date(yy,mm-1,dd), text:(m[4]||'').trim() };
          out.push(cur); continue;
        }
      }
    }
    if(cur) cur.text += (cur.text?' ':'')+line;
    else out.push({date:null, text:line});
  }
  return out.filter(e=>e.text||e.date);
}
function dateKey(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function reindexTask(t){
  t.entries = parseEntries(t.update);
  t.lastDate = t.entries.reduce((a,e)=>e.date&&(!a||e.date>a)?e.date:a, null);
}
function rebuildEntries(){
  ENTRIES = [];
  TASKS.forEach(t=>t.entries.forEach(e=>{ if(e.date) ENTRIES.push({date:e.date,key:dateKey(e.date),text:e.text,task:t}); }));
}

function toDate(v){
  if(v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(),v.getMonth(),v.getDate());
  return parseETA(String(v||''));
}
function parsePlanSheet(wb){
  const shName = wb.SheetNames.find(n=>n.toLowerCase().replace(/[\s_-]/g,'').includes('projectplan')||n.toLowerCase()==='plan');
  if(!shName) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[shName],{header:1,defval:''});
  let hIdx=-1, cols={};
  for(let i=0;i<Math.min(rows.length,4);i++){
    const j=rows[i].map(c=>String(c).toLowerCase()).join('|');
    if(j.includes('phase')&&j.includes('project')){hIdx=i;break;}
  }
  if(hIdx===-1) return null;
  rows[hIdx].forEach((h,ci)=>{
    const hl=String(h).toLowerCase();
    if(hl.includes('project'))cols.project=ci;
    else if(hl.includes('phase'))cols.phase=ci;
    else if(hl.includes('start'))cols.start=ci;
    else if(hl.includes('end'))cols.end=ci;
    else if(hl.includes('progress')||hl.includes('%'))cols.progress=ci;
    else if(hl.includes('status'))cols.status=ci;
    else if(hl.includes('owner'))cols.owner=ci;
    else if(hl.includes('milestone'))cols.milestone=ci;
    else if(hl.includes('note'))cols.notes=ci;
  });
  const plan=[];
  for(let i=hIdx+1;i<rows.length;i++){
    const r=rows[i];
    const project=String(r[cols.project]||'').trim();
    const phase=String(r[cols.phase]||'').trim();
    if(!project||!phase) continue;
    plan.push({
      project, phase,
      start: cols.start!==undefined?toDate(r[cols.start]):null,
      end: cols.end!==undefined?toDate(r[cols.end]):null,
      progress: cols.progress!==undefined?Math.min(100,Math.max(0,parseFloat(r[cols.progress])||0)):0,
      status: cols.status!==undefined?String(r[cols.status]||'').toLowerCase().trim()||'ontrack':'ontrack',
      owner: cols.owner!==undefined?String(r[cols.owner]||'').trim():'',
      milestone: cols.milestone!==undefined?/^(y|yes|true|1)/i.test(String(r[cols.milestone]||'')):false,
      notes: cols.notes!==undefined?String(r[cols.notes]||'').trim():''
    });
  }
  return plan;
}

function parseWorkbook(wb, fname, connected){
  TASKS = []; TICKETS = [];
  wb.SheetNames.forEach(name=>{
    if(name==='Summary') return;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''});
    if(!rows.length) return;
    let hIdx=-1;
    for(let i=0;i<Math.min(rows.length,5);i++){
      const j = rows[i].map(c=>String(c).toLowerCase()).join('|');
      if(j.includes('activity')||j.includes('subject')){hIdx=i;break;}
    }
    if(hIdx===-1) return;
    const cols={};
    rows[hIdx].forEach((h,ci)=>{
      const hl=String(h).toLowerCase();
      if((hl.includes('sl')&&hl.includes('no'))||hl.includes('sno'))cols.sl=ci;
      else if(hl.includes('activity')||hl.includes('subject'))cols.title=ci;
      else if(hl.includes('environment'))cols.env=ci;
      else if(hl.includes('owner'))cols.owner=ci;
      else if(hl.includes('status'))cols.status=ci;
      else if(hl.includes('priority'))cols.priority=ci;
      else if(hl.includes('blocker')||hl.includes('remark'))cols.update=ci;
      else if(hl.includes('eta'))cols.eta=ci;
      else if(hl.includes('oneit')||hl.includes('reference'))cols.ref=ci;
      else if(hl.includes('start date'))cols.startDate=ci;
    });
    const isTicket = String(rows[hIdx].join('|')).toLowerCase().includes('oneit');
    for(let i=hIdx+1;i<rows.length;i++){
      const r=rows[i];
      const title = cols.title!==undefined?String(r[cols.title]||'').trim():'';
      const upd = cols.update!==undefined?String(r[cols.update]||'').trim():'';
      if(!title&&!upd) continue;
      if(isTicket){
        TICKETS.push({ref:cols.ref!==undefined?String(r[cols.ref]||''):'',subject:title,
          status:normStatus(cols.status!==undefined?r[cols.status]:''),date:cols.startDate!==undefined?fmtDate(r[cols.startDate]):'',remarks:upd});
      } else {
        const t = { sheet:name, sl:cols.sl!==undefined?String(r[cols.sl]||''):'', title:title||'(untitled)',
          env:cols.env!==undefined?String(r[cols.env]||''):'', owner:(cols.owner!==undefined?String(r[cols.owner]||'').trim():'')||'—',
          status:normStatus(cols.status!==undefined?r[cols.status]:''),
          priority:cols.priority!==undefined?String(r[cols.priority]||'').toLowerCase().trim():'',
          update:upd, eta:cols.eta!==undefined?fmtDate(r[cols.eta]):'' };
        reindexTask(t);
        TASKS.push(t);
      }
    }
  });
  if(!TASKS.length){ alert('No tasks found — check the file structure.'); return; }
  const excelPlan = parsePlanSheet(wb);
  if(excelPlan !== null) PLAN = excelPlan; /* Excel wins when Project_Plan sheet exists; otherwise keep tool plan */
  EXTRA_PROJECTS = EXTRA_PROJECTS.filter(p=>!TASKS.some(t=>t.sheet===p)); /* project now has its own sheet — no longer "extra" */
  rebuildEntries();
  computeChanges(); saveSnapshot(fname);
  currentFileName = fname;
  setDirty(false);
  showMain(connected);
  populateFilters(); renderAll();
  notifyAlerts(false);
}
function hydrateState(st){
  TASKS = st.tasks; TICKETS = st.tickets||[];
  PLAN = (st.plan||[]).map(p=>({...p, start:p.start?parseETA(p.start):null, end:p.end?parseETA(p.end):null}));
  EXTRA_PROJECTS = st.extraProjects||[];
  TASKS.forEach(t=>{ reindexTask(t); });
  rebuildEntries();
  CHANGES = null;
  currentFileName = st.fname || 'saved session';
  setDirty(false);
  showMain(false);
  populateFilters(); renderAll();
}
function showMain(connected){
  document.getElementById('fileLabel').textContent = currentFileName;
  document.getElementById('fileMeta').textContent = ` · ${TASKS.length} tasks · ${ENTRIES.length} dated updates · ${TICKETS.length} tickets · ${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`;
  document.getElementById('connDot').className = 'dot' + (fileHandle ? ' connected' : '');
  document.getElementById('uploadView').classList.add('hidden');
  document.getElementById('mainView').classList.remove('hidden');
}

/* ================= EDITING & PERSISTENCE ================= */
function setDirty(v){
  dirty = v;
  document.getElementById('dirtyFlag').classList.toggle('hidden', !v);
  document.getElementById('saveBtn').classList.toggle('hidden', !v);
  if(v) scheduleAutoWrite();
}
function saveState(){
  try{
    localStorage.setItem(STATE_KEY, JSON.stringify({
      fname: currentFileName, savedAt: new Date().toISOString(),
      tasks: TASKS.map(t=>({sheet:t.sheet,sl:t.sl,title:t.title,env:t.env,owner:t.owner,status:t.status,priority:t.priority,update:t.update,eta:t.eta})),
      plan: PLAN.map(p=>({project:p.project,phase:p.phase,start:p.start?fmtDate(p.start):'',end:p.end?fmtDate(p.end):'',progress:p.progress,status:p.status,owner:p.owner,milestone:p.milestone,notes:p.notes})),
      extraProjects: EXTRA_PROJECTS,
      tickets: TICKETS
    }));
    setDirty(false);
    toast('\uD83D\uDCBE Saved in BROWSER only \u2014 NOT in Excel yet. Press \u2B06 Save to Excel to publish to the file.');
  }catch(e){ toast('Save failed: '+e.message); }
}
function markEdited(){
  setDirty(true);
  rebuildEntries();
  renderKPIs(); renderScrum(); renderStatus(); renderAttention();
}
function changeStatus(idx, newStatus){
  const t = TASKS[idx];
  if(t.status === newStatus) return;
  const old = t.status;
  pushTaskUndo('status '+old+' \u2192 '+newStatus+' on \u201c'+t.title.substring(0,30)+'\u2026\u201d', idx);
  t.status = newStatus;
  t.update = (t.update?t.update+'\n':'') + todayStr()+': Status changed '+old+' → '+newStatus+' (via tool)';
  reindexTask(t);
  markEdited();
  renderKanban(); renderExplorer(); renderTeam(); renderCharts(); renderDaily(); renderGrid();
  if(newStatus==='completed') confetti();
  logEdit('🔁', t.title, 'Status: '+old+' → '+newStatus+' (you, in tool)');
  toast(t.title.substring(0,40)+'… → '+newStatus);
}

/* ---- modal helpers ---- */
let modalCallback = null;
function openModal(title, bodyHTML, onOk){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalOk').textContent = 'Save';
  document.getElementById('modalBackdrop').classList.remove('hidden');
  modalCallback = onOk;
  const first = document.querySelector('#modalBody input, #modalBody textarea, #modalBody select');
  if(first&&first.focus) setTimeout(()=>{try{first.focus()}catch(e){}},50);
}
function closeModal(){ document.getElementById('modalBackdrop').classList.add('hidden'); modalCallback=null; }
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('modalOk').addEventListener('click',()=>{ if(modalCallback) modalCallback(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(WALL.active){stopWall();return;} closeModal(); } });
  try{ scaleIdx=+localStorage.getItem('sccp_scale'); if(isNaN(scaleIdx)||scaleIdx<0||scaleIdx>3) scaleIdx=1; }catch(e){ scaleIdx=1; }
  applyScale();
});

function openTaskDetail(idx){
  const t = TASKS[idx];
  const hist = t.entries.filter(e=>e.date).sort((a,b)=>b.date-a.date);
  const histHTML = hist.length
    ? hist.map(e=>`<div class="hist-entry"><span class="hist-date">${fmtDate(e.date)}</span><span class="hist-text">${esc(e.text)}</span></div>`).join('')
    : (t.update
        ? `<div class="hist-entry"><span class="hist-date">—</span><span class="hist-text">${esc(t.update)}</span></div>`
        : '<div class="hist-entry"><span class="hist-text" style="color:var(--text3)">No updates recorded yet</span></div>');
  openModal(t.title.substring(0,60)+(t.title.length>60?'…':''),
    `<div class="m-taskname">${statusBadge(t.status)} ${t.priority.includes('high')?'<span class="badge b-high">High</span>':''}
      &nbsp;👤 ${esc(t.owner)} · 📂 ${esc(t.sheet)}${t.eta?' · ⏳ ETA '+esc(t.eta):''}</div>
     ${t.status!=='completed'?`<button class="mini-btn" style="margin-bottom:10px" onclick="closeModal();openReassign(${idx})">👤 Reassign / add reviewer</button>`:''}
     <label style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">📜 Update history (${hist.length})</label>
     <div class="minutes-preview" style="margin-top:0;margin-bottom:14px">${histHTML}</div>
     <div class="m-field"><label>＋ Add update comment (saved with today's date)</label>
     <textarea id="mUpd" placeholder="e.g. Verified in QA, moving to UAT tomorrow"></textarea></div>`,
    ()=>{
      const v = document.getElementById('mUpd').value.trim();
      if(!v){ toast('Type the update comment first'); return; }
      pushTaskUndo('comment on \u201c'+t.title.substring(0,30)+'\u2026\u201d', idx);
      t.update = (t.update?t.update+'\n':'') + todayStr()+': '+v;
      reindexTask(t); rebuildEntries(); markEdited();
      logEdit('✍️', t.title, 'Update added: "'+v.substring(0,90)+'"');
      renderExplorer(); renderKanban(); renderDaily(); renderGrid(); renderCharts();
      closeModal(); toast('Update added ✓');
    });
  document.getElementById('modalOk').textContent='＋ Add update';
}
function openReassign(idx){
  const t = TASKS[idx];
  if(t.status==='completed'){ toast('This task is completed — reopen it before reassigning'); return; }
  openModal('👤 Reassign — '+t.title.substring(0,45)+(t.title.length>45?'…':''),
    `<div class="m-taskname">Current owner: <b>${esc(t.owner)}</b> · ${esc(t.sheet)} · ${statusBadge(t.status)}</div>
     <div class="m-field"><label>Assign to <span class="req">*</span></label>
       <input id="raPerson" list="ntOwners" placeholder="Pick a team member or type a name"></div>
     <div class="m-field"><label>Assignment type</label>
       <select id="raType">
         <option value="owner">New owner (replaces current owner)</option>
         <option value="review">Reviewer (added alongside owner)</option>
       </select></div>
     <div class="m-field"><label>Note (optional, added to the dated log)</label>
       <input id="raNote" placeholder="e.g. please verify the QA deployment"></div>`,
    ()=>{
      const person=document.getElementById('raPerson').value.trim();
      if(!person){ toast('Pick or type a person'); return; }
      pushTaskUndo('reassign of \u201c'+t.title.substring(0,30)+'\u2026\u201d', idx);
      const type=document.getElementById('raType').value;
      const note=document.getElementById('raNote').value.trim();
      let line;
      if(type==='owner'){
        const old=t.owner;
        t.owner=person;
        line='Reassigned owner: '+old+' → '+person+(note?' — '+note:'');
      } else {
        t.owner = (t.owner && t.owner!=='—') ? t.owner+' / '+person : person;
        line=person+' assigned as reviewer'+(note?' — '+note:'');
      }
      t.update=(t.update?t.update+'\n':'')+todayStr()+': '+line;
      reindexTask(t); rebuildEntries(); markEdited();
      logEdit('👤', t.title, line);
      populateFilters();
      renderExplorer(); renderKanban(); renderTeam(); renderCharts(); renderDaily(); renderGrid();
      closeModal(); toast('✓ '+line);
    });
  document.getElementById('modalOk').textContent='👤 Assign';
}
function openAddUpdate(idx){
  const t = TASKS[idx];
  openModal('Add update — '+todayStr(),
    `<div class="m-taskname">📌 ${esc(t.title)} <br><small>${esc(t.owner)} · ${esc(t.sheet)}</small></div>
     <div class="m-field"><label>Update text (date is added automatically)</label>
     <textarea id="mUpd" placeholder="e.g. Deployment completed in QA, verification pending"></textarea></div>`,
    ()=>{
      const v = document.getElementById('mUpd').value.trim();
      if(!v){ toast('Enter update text'); return; }
      pushTaskUndo('update on \u201c'+t.title.substring(0,30)+'\u2026\u201d', idx);
      t.update = (t.update?t.update+'\n':'') + todayStr()+': '+v;
      reindexTask(t); markEdited();
      logEdit('✍️', t.title, 'Update added: "'+v.substring(0,90)+'"');
      renderExplorer(); renderKanban(); renderDaily(); renderGrid(); renderCharts();
      closeModal(); toast('Update added ✓');
    });
}
function openEditTask(idx){
  const t = TASKS[idx];
  openModal('Edit task',
    `<div class="m-field"><label>Title</label><input id="mTitle" value="${esc(t.title)}"></div>
     <div class="m-field"><label>Owner</label><input id="mOwner" value="${esc(t.owner)}"></div>
     <div class="m-field"><label>Priority</label><select id="mPrio">
       <option value="" ${!t.priority?'selected':''}>—</option>
       <option value="high" ${t.priority.includes('high')?'selected':''}>High</option>
       <option value="medium" ${t.priority.includes('med')?'selected':''}>Medium</option>
       <option value="low" ${t.priority.includes('low')?'selected':''}>Low</option></select></div>
     <div class="m-field"><label>ETA</label><div class="eta-row">
       <input type="date" id="mEta" value="${dmyToISO(t.eta)}" ${/tbd/i.test(t.eta)?'disabled':''}>
       <label class="tbd-check"><input type="checkbox" id="mTbd" ${/tbd/i.test(t.eta)?'checked':''} onchange="document.getElementById('mEta').disabled=this.checked"> TBD</label></div></div>`,
    ()=>{
      pushTaskUndo('edit of \u201c'+t.title.substring(0,30)+'\u2026\u201d', idx);
      t.title = document.getElementById('mTitle').value.trim()||t.title;
      t.owner = document.getElementById('mOwner').value.trim()||'—';
      t.priority = document.getElementById('mPrio').value;
      t.eta = document.getElementById('mTbd').checked ? 'TBD' : isoToDMY(document.getElementById('mEta').value);
      markEdited();
      renderExplorer(); renderKanban(); renderTeam(); renderCharts(); renderGrid(); renderDaily();
      closeModal(); toast('Task updated ✓');
    });
}
function gotoNewTask(){
  const btn=document.querySelector('#mainNav button[data-tab="tab-newtask"]');
  if(btn) showTab(btn);
  const f=document.getElementById('ntTitle'); if(f) setTimeout(()=>f.focus(),100);
}
function openAddTask(){
  const sheets=allProjects();
  openModal('New task',
    `<div class="m-field"><label>Project</label><select id="mSheet">${sheets.map(s=>`<option>${esc(s)}</option>`).join('')}</select></div>
     <div class="m-field"><label>Title</label><input id="mTitle" placeholder="Activity / issue"></div>
     <div class="m-field"><label>Owner</label><input id="mOwner" placeholder="Name"></div>
     <div class="m-field"><label>Priority</label><select id="mPrio"><option value="">—</option><option value="high">High</option><option value="medium">Medium</option></select></div>
     <div class="m-field"><label>First update (optional)</label><textarea id="mUpd"></textarea></div>`,
    ()=>{
      const title = document.getElementById('mTitle').value.trim();
      if(!title){ toast('Enter a title'); return; }
      const upd = document.getElementById('mUpd').value.trim();
      const t = { sheet:document.getElementById('mSheet').value, sl:'', title,
        env:'', owner:document.getElementById('mOwner').value.trim()||'—',
        status:'open', priority:document.getElementById('mPrio').value,
        update: upd? todayStr()+': '+upd : '', eta:'' };
      reindexTask(t); TASKS.push(t);
      markEdited(); populateFilters();
      renderExplorer(); renderKanban(); renderTeam(); renderCharts(); renderGrid(); renderDaily();
      closeModal(); toast('Task created ✓');
    });
}

/* ================= SNAPSHOT DIFF ================= */
function taskKey(t){return t.sheet+'||'+t.title.toLowerCase().replace(/\s+/g,' ').trim();}
function computeChanges(){
  CHANGES=[]; let prev=null;
  try{prev=JSON.parse(localStorage.getItem(SNAP_KEY));}catch(e){}
  if(!prev||!prev.tasks){CHANGES=null;return;}
  const pm={}; prev.tasks.forEach(t=>pm[taskKey(t)]=t);
  const ck=new Set();
  TASKS.forEach(t=>{
    const k=taskKey(t); ck.add(k); const p=pm[k];
    if(!p){CHANGES.push({type:'new',t});return;}
    if(p.status!==t.status)CHANGES.push({type:'status',t,old:p.status,nw:t.status});
    if(p.update!==t.update&&t.update){
      const added=t.update.replace(p.update,'').trim();
      CHANGES.push({type:'update',t,added:(added||lastLine(t.update)).substring(0,220)});
    }
    if(p.owner!==t.owner)CHANGES.push({type:'owner',t,old:p.owner,nw:t.owner});
  });
  prev.tasks.forEach(t=>{if(!ck.has(taskKey(t)))CHANGES.push({type:'removed',t});});
  CHANGES._prevDate=prev.savedAt;
}
function saveSnapshot(fname){
  try{localStorage.setItem(SNAP_KEY,JSON.stringify({savedAt:new Date().toISOString(),fname,
    tasks:TASKS.map(t=>({sheet:t.sheet,title:t.title,status:t.status,update:t.update,owner:t.owner}))}));}catch(e){}
}
function clearSnapshot(){try{localStorage.removeItem(SNAP_KEY);}catch(e){} toast('Comparison reset — next load becomes the baseline.');}

/* ================= HELPERS ================= */
function counts(){const c={total:TASKS.length,completed:0,inprogress:0,open:0,hold:0,recurring:0};TASKS.forEach(t=>{if(c[t.status]!==undefined)c[t.status]++;});return c;}
function firstLine(s){return String(s||'').split('\n')[0].trim().substring(0,150);}
function lastLine(s){const L=String(s||'').split('\n').map(x=>x.trim()).filter(Boolean);return L.length?L[L.length-1].substring(0,180):'';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function initials(n){const p=n.trim().split(/\s+/);return((p[0][0]||'?')+(p[1]?p[1][0]:'')).toUpperCase();}
function ownerColor(n){let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;return AVATAR_COLORS[h%AVATAR_COLORS.length];}
function primaryOwners(t){return t.owner.split(/[,\/&]/).map(o=>o.trim()).filter(o=>o&&o!=='—'&&o!=='_');}
function updatedWithin(t,days){
  if(!t.lastDate) return false;
  const cutoff=new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate()-days);
  return t.lastDate>=cutoff;
}
function etaBreached(t){
  if(t.status==='completed'||t.status==='recurring')return false;
  const d=parseETA(t.eta); if(!d)return false;
  const today=new Date();today.setHours(0,0,0,0); return d<today;
}
function statusBadge(s){
  const m={completed:['b-done','Completed'],inprogress:['b-prog','In progress'],open:['b-open','Open'],hold:['b-hold','On hold'],recurring:['b-rec','Recurring']};
  const[cls,lbl]=m[s]||['b-open',s]; return `<span class="badge ${cls}">${lbl}</span>`;
}
function cssVar(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function emptyState(icon,msg){return `<div class="empty-state"><div class="es-icon">${icon}</div><p>${msg}</p></div>`;}
function niceDate(d){return d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short',year:'numeric'});}
function relLabel(d){
  const t=new Date();t.setHours(0,0,0,0); const dd=new Date(d);dd.setHours(0,0,0,0);
  const diff=Math.round((t-dd)/864e5);
  if(diff===0)return 'Today'; if(diff===1)return 'Yesterday'; if(diff>1&&diff<7)return diff+' days ago'; return '';
}
function toast(msg){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),3200);
}

/* ================= RENDER ================= */
function renderAll(){renderKPIs();renderRAG();renderCharts();renderDailyDates();renderDaily();renderGrid();renderExplorer();renderChanges();renderScrum();renderStatus();renderKanban();renderTeam();renderAttention();renderTickets();populatePlanProjects();renderPlan();}

function renderKPIs(){
  const c=counts();
  const openTix=TICKETS.filter(t=>t.status!=='completed').length;
  const breached=TASKS.filter(etaBreached).length;
  const fresh=TASKS.filter(t=>updatedWithin(t,0)).length;
  document.getElementById('kpiRow').innerHTML=
    kpi(c.total,'Total tasks','--border2')+kpi(c.inprogress,'In progress','--blue')+kpi(c.open,'Open','--orange')+
    kpi(c.completed,'Completed','--green')+kpi(breached,'ETA breached','--red',breached>0)+kpi(fresh,'Updated today','--purple')+kpi(openTix,'Open tickets','--red',openTix>0);
  document.querySelectorAll('#kpiRow .k-val[data-n]').forEach(el=>animateCount(el,+el.dataset.n));
}
function kpi(v,l,c,alert){return `<div class="kpi ${alert?'alert':''}" style="--kc:var(${c})"><div class="k-val" data-n="${v}">0</div><div class="k-lbl">${l}</div></div>`;}

function renderCharts(){
  if(typeof Chart==='undefined')return;
  const c=counts(),txt=cssVar('--text2'),grid=cssVar('--border');
  Chart.defaults.color=txt;
  mk('chStatus','doughnut',{labels:['In progress','Open','Completed','On hold','Recurring'],
    datasets:[{data:[c.inprogress,c.open,c.completed,c.hold,c.recurring],
    backgroundColor:[cssVar('--blue'),cssVar('--orange'),cssVar('--green'),cssVar('--red'),cssVar('--purple')],borderWidth:0}]},
    {cutout:'62%',plugins:{legend:{position:'right'}}});
  const sheets=[...new Set(TASKS.map(t=>t.sheet))];
  const sD=['inprogress','open','completed','hold'].map(st=>sheets.map(sh=>TASKS.filter(t=>t.sheet===sh&&t.status===st).length));
  mk('chSections','bar',{labels:sheets.map(s=>s.replace('SAP-','').replace('_',' ').substring(0,16)),
    datasets:[{label:'In progress',data:sD[0],backgroundColor:cssVar('--blue')},{label:'Open',data:sD[1],backgroundColor:cssVar('--orange')},
    {label:'Completed',data:sD[2],backgroundColor:cssVar('--green')},{label:'On hold',data:sD[3],backgroundColor:cssVar('--red')}]},
    {scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:grid},ticks:{precision:0}}}});
  const load={};
  TASKS.filter(t=>t.status==='inprogress'||t.status==='open').forEach(t=>primaryOwners(t).forEach(o=>load[o]=(load[o]||0)+1));
  const owners=Object.keys(load).sort((a,b)=>load[b]-load[a]).slice(0,14);
  mk('chOwners','bar',{labels:owners,datasets:[{label:'Active tasks',data:owners.map(o=>load[o]),backgroundColor:owners.map(ownerColor),borderRadius:5}]},
    {indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:grid},ticks:{precision:0}},y:{grid:{display:false}}}});
  const days=[],labels=[],countsArr=[];
  for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);d.setHours(0,0,0,0);days.push(dateKey(d));labels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}));}
  days.forEach(k=>countsArr.push(ENTRIES.filter(e=>e.key===k).length));
  mk('chActivity','bar',{labels,datasets:[{label:'Updates',data:countsArr,backgroundColor:cssVar('--purple'),borderRadius:4}]},
    {plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{grid:{color:grid},ticks:{precision:0}}}});
  const active=TASKS.filter(t=>t.status==='inprogress'||t.status==='open');
  const today=active.filter(t=>updatedWithin(t,0)).length;
  const d3=active.filter(t=>!updatedWithin(t,0)&&updatedWithin(t,2)).length;
  const d7=active.filter(t=>!updatedWithin(t,2)&&updatedWithin(t,6)).length;
  mk('chRecency','doughnut',{labels:['Today','1–3 days','4–7 days','Older / none'],
    datasets:[{data:[today,d3,d7,active.length-today-d3-d7],backgroundColor:[cssVar('--green'),cssVar('--blue'),cssVar('--orange'),cssVar('--red')],borderWidth:0}]},
    {cutout:'62%',plugins:{legend:{position:'right'}}});
}
function mk(id,type,data,opts){
  const el=document.getElementById(id); if(!el)return;
  if(charts[id])charts[id].destroy();
  charts[id]=new Chart(el,{type,data,options:Object.assign({responsive:true,maintainAspectRatio:false},opts)});
}

/* ---------- DAILY LOG ---------- */
function renderDailyDates(){
  const dates=[...new Set(ENTRIES.map(e=>e.key))].sort().reverse();
  document.getElementById('dlDates').innerHTML=`<button class="date-chip ${dlSelectedDate===''?'active':''}" onclick="pickDate('')">All days</button>`+
    dates.slice(0,21).map(k=>{
      const d=new Date(k);
      const lbl=relLabel(d)||d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
      return `<button class="date-chip ${dlSelectedDate===k?'active':''}" onclick="pickDate('${k}')">${lbl}</button>`;
    }).join('');
}
function pickDate(k){dlSelectedDate=k;renderDailyDates();renderDaily();}
function dailyFiltered(){
  const q=document.getElementById('dlSearch').value.toLowerCase();
  const fs=document.getElementById('dlSheet').value;
  const fo=document.getElementById('dlOwner').value;
  return ENTRIES.filter(e=>{
    if(dlSelectedDate&&e.key!==dlSelectedDate)return false;
    if(fs&&e.task.sheet!==fs)return false;
    if(fo&&!primaryOwners(e.task).includes(fo))return false;
    if(q&&!(e.text+' '+e.task.title+' '+e.task.owner).toLowerCase().includes(q))return false;
    return true;
  });
}
function renderDaily(){
  let E=dailyFiltered();
  document.getElementById('dlCount').textContent=E.length+' updates';
  if(!E.length){document.getElementById('dailyTimeline').innerHTML=emptyState('🗓','No dated updates match these filters.');return;}
  const byDay={};
  E.forEach(e=>{(byDay[e.key]=byDay[e.key]||[]).push(e);});
  const keys=Object.keys(byDay).sort().reverse();
  document.getElementById('dailyTimeline').innerHTML=keys.map(k=>{
    const d=new Date(k),items=byDay[k];
    const rel=relLabel(d);
    return `<div class="day-block">
      <div class="day-hdr"><span class="day-date">${niceDate(d)}${rel?`<span class="rel">${rel}</span>`:''}</span>
      <span class="day-line"></span><span class="day-count">${items.length} update${items.length!==1?'s':''}</span></div>
      ${items.map(e=>{
        const o=primaryOwners(e.task)[0]||'—';
        return `<div class="log-entry">
          <div class="log-dot" style="background:${ownerColor(o)}">${o==='—'?'?':initials(o)}</div>
          <div class="log-body">
            <div class="log-top"><span class="log-owner">${esc(o)}</span><span class="sheet-chip">${esc(e.task.sheet)}</span>
            ${statusBadge(e.task.status)}<span class="log-task">· ${esc(e.task.title.substring(0,70))}${e.task.title.length>70?'…':''}</span></div>
            <div class="log-text">${esc(e.text)}</div>
          </div></div>`;
      }).join('')}
    </div>`;
  }).join('');
}

/* ---------- DAY GRID ---------- */
let gridRowsCache={};
function gridDates(){
  const n=+document.getElementById('gridDays').value;
  const cutoff=new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate()-n+1);
  return [...new Set(ENTRIES.filter(e=>e.date>=cutoff).map(e=>e.key))].sort().reverse();
}
function gridFilteredEntries(){
  const fs=document.getElementById('gridSheet').value, fo=document.getElementById('gridOwner').value;
  return ENTRIES.filter(e=>{
    if(fs&&e.task.sheet!==fs)return false;
    if(fo&&!primaryOwners(e.task).includes(fo))return false;
    return true;
  });
}
function shortDay(k){
  const d=new Date(k);
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})+'<br><span style="font-weight:500;color:var(--text3)">'+d.toLocaleDateString('en-IN',{weekday:'short'})+'</span>';
}
function renderGrid(){
  const basis=document.getElementById('gridBasis').value;
  const dates=gridDates();
  const E=gridFilteredEntries();
  const todayKey=dateKey(new Date());
  const tbl=document.getElementById('gridTable');
  if(!dates.length){tbl.innerHTML='<tr><td style="padding:20px;color:var(--text3)">No dated updates in this range.</td></tr>';return;}
  const idx={}, rowMeta={};
  E.forEach(e=>{
    let keys;
    if(basis==='task') keys=[e.task.sheet+'||'+e.task.title];
    else if(basis==='owner'){keys=primaryOwners(e.task); if(!keys.length)keys=['(no owner)'];}
    else keys=[e.task.sheet];
    keys.forEach(k=>{
      (idx[k]=idx[k]||{}); (idx[k][e.key]=idx[k][e.key]||[]).push(e);
      rowMeta[k]=rowMeta[k]||{task:e.task};
    });
  });
  let head='<thead><tr><th>'+(basis==='task'?'Task':basis==='owner'?'Owner':'Project')+'</th>'+
    dates.map(k=>`<th class="${k===todayKey?'today-col':''}">${shortDay(k)}</th>`).join('')+'</tr></thead>';
  let rows=[];
  if(basis==='task'){
    const bySheet={};
    Object.keys(idx).forEach(k=>{const sh=k.split('||')[0];(bySheet[sh]=bySheet[sh]||[]).push(k);});
    Object.keys(bySheet).sort().forEach(sh=>{
      rows.push(`<tr class="pgrp"><td colspan="${dates.length+1}">▸ ${esc(sh)}</td></tr>`);
      bySheet[sh].sort().forEach(k=>{
        const t=rowMeta[k].task;
        rows.push(gridRow(esc(t.title.substring(0,80))+`<span class="row-sub">${esc(t.owner)} · ${statusBadge(t.status)}</span>`, idx[k], dates, todayKey, false));
      });
    });
  } else {
    const keys=Object.keys(idx).sort((a,b)=>Object.values(idx[b]).flat().length-Object.values(idx[a]).flat().length);
    keys.forEach(k=>{
      const label = basis==='owner'
        ? `<span style="display:flex;align-items:center;gap:7px"><span class="avatar" style="background:${ownerColor(k)};width:24px;height:24px;font-size:10px">${k==='(no owner)'?'?':initials(k)}</span>${esc(k)}</span>`
        : `<span class="sheet-chip" style="font-size:11.5px">${esc(k)}</span>`;
      rows.push(gridRow(label, idx[k], dates, todayKey, true));
    });
  }
  tbl.innerHTML=head+'<tbody>'+rows.join('')+'</tbody>';
  gridRowsCache={basis,idx,rowMeta,dates};
}
function gridRow(label, dayMap, dates, todayKey, showTask){
  return '<tr><td>'+label+'</td>'+dates.map(k=>{
    const es=dayMap[k]||[];
    if(!es.length) return `<td class="${k===todayKey?'today-col':''}"></td>`;
    const inner=es.map(e=>
      `<div class="cell-entry">${showTask?`<span class="cell-task">${esc(e.task.title.substring(0,50))}${e.task.title.length>50?'…':''}</span>`:''}${esc(e.text.substring(0,300))}${e.text.length>300?'…':''}</div>`
    ).join('');
    return `<td class="has-entry ${k===todayKey?'today-col':''}">${inner}</td>`;
  }).join('')+'</tr>';
}
function exportGridXLSX(){
  const {basis,idx,rowMeta,dates}=gridRowsCache;
  if(!dates||!dates.length){toast('Nothing to export');return;}
  const hdr=basis==='task'?'Task':basis==='owner'?'Owner':'Project';
  const aoa=[[hdr,...(basis==='task'?['Project','Owner','Status']:[]),...dates.map(k=>{const d=new Date(k);return pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+d.getFullYear();})]];
  Object.keys(idx).sort().forEach(k=>{
    const base = basis==='task' ? [rowMeta[k].task.title,rowMeta[k].task.sheet,rowMeta[k].task.owner,rowMeta[k].task.status] : [k];
    const cells=dates.map(dk=>(idx[k][dk]||[]).map(e=>(basis!=='task'?'['+e.task.title.substring(0,40)+'] ':'')+e.text).join('\n'));
    aoa.push([...base,...cells]);
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:45},...(basis==='task'?[{wch:18},{wch:14},{wch:11}]:[]),...dates.map(()=>({wch:38}))];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Day Grid');
  const d=new Date();
  XLSX.writeFile(wb,`DayGrid_${basis}_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`);
}

/* ---------- EXPLORER ---------- */
const EX_COLS=[{k:'sheet',l:'Project'},{k:'sl',l:'Sl'},{k:'title',l:'Activity / Issue'},{k:'env',l:'Env'},
  {k:'owner',l:'Owner'},{k:'status',l:'Status'},{k:'priority',l:'Priority'},{k:'lastdate',l:'Last update'},{k:'eta',l:'ETA'},{k:'act',l:''}];
function taskVal(t,k){ if(k==='lastdate')return t.lastDate?fmtDate(t.lastDate):''; return t[k]||''; }
function exFiltered(){
  const q=document.getElementById('exSearch').value.toLowerCase();
  const st=document.getElementById('exStatus').value;
  const fp=document.getElementById('exProject').value;
  let T=TASKS.map((t,i)=>({t,i})).filter(({t})=>{
    if(fp&&t.sheet!==fp)return false;
    if(st&&t.status!==st)return false;
    if(q&&!(t.title+' '+t.owner+' '+t.update+' '+t.sheet+' '+t.env).toLowerCase().includes(q))return false;
    return true;
  });
  if(sortState.col){
    const k=sortState.col;
    T=[...T].sort((a,b)=>{
      let va,vb;
      if(k==='lastdate'){va=a.t.lastDate?a.t.lastDate.getTime():0;vb=b.t.lastDate?b.t.lastDate.getTime():0;}
      else{va=String(taskVal(a.t,k)).toLowerCase();vb=String(taskVal(b.t,k)).toLowerCase();}
      return va<vb?-sortState.dir:va>vb?sortState.dir:0;
    });
  }
  return T;
}
function sortBy(col){
  if(col==='act')return;
  if(sortState.col===col)sortState.dir*=-1;else{sortState.col=col;sortState.dir=1;}
  renderExplorer();
}
let rowSeq=0;
function renderExplorer(){
  rowSeq=0;
  const T=exFiltered();
  const grp=document.getElementById('exGroup').value;
  document.getElementById('exCount').textContent=T.length+' rows';
  const head='<thead><tr><th style="width:34px"></th>'+EX_COLS.map(c=>
    `<th class="${c.k!=='act'?'sortable':''}" onclick="sortBy('${c.k}')">${c.l}${sortState.col===c.k?`<span class="s-arrow">${sortState.dir>0?'▲':'▼'}</span>`:''}</th>`).join('')+'</tr></thead>';
  let body='';
  if(!grp){ body=T.map(x=>rowHTML(x.t,x.i)).join(''); }
  else{
    const groups={};
    T.forEach(x=>{
      let keys;
      if(grp==='owner'){keys=primaryOwners(x.t);if(!keys.length)keys=['(no owner)'];}
      else if(grp==='lastdate'){keys=[x.t.lastDate?fmtDate(x.t.lastDate):'(no dated update)'];}
      else{keys=[taskVal(x.t,grp)||'(blank)'];}
      keys.forEach(k=>{(groups[k]=groups[k]||[]).push(x);});
    });
    let gkeys=Object.keys(groups);
    if(grp==='lastdate'){gkeys.sort((a,b)=>{const pa=parseETA(a),pb=parseETA(b);return(pb?pb.getTime():0)-(pa?pa.getTime():0);});}
    else gkeys.sort((a,b)=>groups[b].length-groups[a].length);
    body=gkeys.map(g=>
      `<tr class="grp-hdr"><td colspan="${EX_COLS.length+1}">▸ ${esc(g)}<span class="g-count">${groups[g].length}</span></td></tr>`+
      groups[g].map(x=>rowHTML(x.t,x.i)).join('')
    ).join('');
  }
  document.getElementById('exTable').innerHTML=head+'<tbody>'+body+'</tbody>';
}
function rowHTML(t,idx){
  const rid='r'+(rowSeq++);
  const hist=t.entries.filter(e=>e.date).sort((a,b)=>b.date-a.date);
  return `<tr>
    <td>${t.entries.length?`<button class="expand-btn" onclick="toggleHist('${rid}')">▸</button>`:''}</td>
    <td><span class="sheet-chip">${esc(t.sheet)}</span></td>
    <td class="t-sheet">${esc(t.sl)}</td>
    <td class="t-title">${esc(t.title)}</td>
    <td class="t-sheet">${esc(t.env)}</td>
    <td>${esc(t.owner)}</td>
    <td><select class="status-select" onchange="changeStatus(${idx},this.value)">
      ${['open','inprogress','hold','completed','recurring'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s==='inprogress'?'In progress':s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
    </select></td>
    <td>${t.priority.includes('high')?'<span class="badge b-high">High</span>':esc(t.priority)}</td>
    <td class="t-sheet">${t.lastDate?fmtDate(t.lastDate):'—'}</td>
    <td class="t-sheet">${esc(t.eta)||'—'}</td>
    <td style="white-space:nowrap">
      <button class="mini-btn" onclick="openAddUpdate(${idx})">＋ update</button>
      ${t.status!=='completed'?`<button class="mini-btn" onclick="openReassign(${idx})" title="Reassign / add reviewer">👤</button>`:''}
      <button class="mini-btn" onclick="openEditTask(${idx})">✎</button>
    </td>
  </tr>
  <tr class="hist-row ${histOpen?'':'hidden'}" id="${rid}"><td colspan="${EX_COLS.length+1}">
    ${hist.length?hist.map(e=>`<div class="hist-entry"><span class="hist-date">${fmtDate(e.date)}</span><span class="hist-text">${esc(e.text)}</span></div>`).join(''):
      t.update?`<div class="hist-entry"><span class="hist-date">—</span><span class="hist-text">${esc(t.update)}</span></div>`:'<div class="hist-entry"><span class="hist-text">No updates recorded</span></div>'}
  </td></tr>`;
}
function toggleHist(id){document.getElementById(id).classList.toggle('hidden');}
function toggleAllHist(){histOpen=!histOpen;renderExplorer();}

/* ---------- EXPORTS ---------- */
function exportCSV(){
  const T=exFiltered();
  const rows=[['Project','Sl','Activity','Environment','Owner','Status','Priority','Last Update Date','ETA','Full Update Log']];
  T.forEach(({t})=>rows.push([t.sheet,t.sl,t.title,t.env,t.owner,t.status,t.priority,t.lastDate?fmtDate(t.lastDate):'',t.eta,t.update.replace(/\n/g,' | ')]));
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const d=new Date(),a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));
  a.download=`Tracker_Export_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.csv`;a.click();
}
function exportXLSX(){
  const T=exFiltered();
  const data=T.map(({t})=>({Project:t.sheet,Sl:t.sl,Activity:t.title,Environment:t.env,Owner:t.owner,Status:t.status,
    Priority:t.priority,'Last Update':t.lastDate?fmtDate(t.lastDate):'',ETA:t.eta,'Update Log':t.update}));
  const ws=XLSX.utils.json_to_sheet(data);
  ws['!cols']=[{wch:18},{wch:5},{wch:50},{wch:10},{wch:16},{wch:12},{wch:9},{wch:12},{wch:12},{wch:80}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Filtered Tasks');
  const d=new Date();
  XLSX.writeFile(wb,`Tracker_Export_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`);
}
/* full tracker in original layout — for uploading back to SharePoint */
function buildTrackerWB(){
  const wb=XLSX.utils.book_new();
  const sheets=[...new Set([...TASKS.map(t=>t.sheet), ...EXTRA_PROJECTS])];
  /* Summary */
  const statuses=['completed','inprogress','open','recurring','hold'];
  const sumAoa=[['TSAT / BY Program — Open Action Tracker: Generated by Scrum Command Center'],
    ['Generated '+todayStr()],[],
    ['Section','Completed','In Progress','Open','Recurring','On Hold','Total']];
  sheets.forEach(sh=>{
    const T=TASKS.filter(t=>t.sheet===sh);
    sumAoa.push([sh,...statuses.map(s=>T.filter(t=>t.status===s).length||''),T.length]);
  });
  sumAoa.push(['Grand Total',...statuses.map(s=>TASKS.filter(t=>t.status===s).length||''),TASKS.length]);
  const sws=XLSX.utils.aoa_to_sheet(sumAoa);
  sws['!cols']=[{wch:24},{wch:10},{wch:11},{wch:8},{wch:10},{wch:9},{wch:8}];
  XLSX.utils.book_append_sheet(wb,sws,'Summary');
  /* task sheets in original layout */
  const statusLabel={completed:'Completed',inprogress:'In Progress',open:'Open',hold:'On Hold',recurring:'Recurring'};
  sheets.forEach(sh=>{
    const T=TASKS.filter(t=>t.sheet===sh);
    const aoa=[['TSAT / BY Program — Open Action Tracker  |  '+sh],
      ['Sl. No','Activity / Issue','Environment','Owner','Status','Priority','Blocker / Pending / Latest Update','ETA','Update']];
    T.forEach((t,i)=>aoa.push([t.sl||i+1,t.title,t.env,t.owner,statusLabel[t.status]||t.status,
      t.priority?t.priority.charAt(0).toUpperCase()+t.priority.slice(1):'',t.update,t.eta,'']));
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:6},{wch:48},{wch:12},{wch:16},{wch:12},{wch:9},{wch:85},{wch:12},{wch:8}];
    XLSX.utils.book_append_sheet(wb,ws,sh.substring(0,31));
  });
  /* project plan sheet */
  if(PLAN.length){
    const pws=XLSX.utils.aoa_to_sheet(planAoa());
    pws['!cols']=[{wch:22},{wch:26},{wch:12},{wch:12},{wch:10},{wch:10},{wch:14},{wch:9},{wch:35}];
    XLSX.utils.book_append_sheet(wb,pws,'Project_Plan');
  }
  /* tickets */
  if(TICKETS.length){
    const aoa=[['Sno','Start Date','End Date','OneIT reference','Subject','Status','Remarks']];
    TICKETS.forEach((t,i)=>aoa.push([i+1,t.date,'',t.ref,t.subject,t.status==='completed'?'Completed':'In Progress',t.remarks||'']));
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:5},{wch:12},{wch:10},{wch:15},{wch:55},{wch:12},{wch:30}];
    XLSX.utils.book_append_sheet(wb,ws,'Open-Service_Tickets');
  }
  return wb;
}
/* ---- style-preserving tracker builder (ExcelJS) ---- */
async function buildStyledTrackerBuffer(baseBuf){
  const ewb = new ExcelJS.Workbook();
  let baseLoaded = false;
  if(baseBuf){
    try{ await ewb.xlsx.load(baseBuf); baseLoaded = true; }
    catch(e){ toast('\u26a0 Could not read the existing file\'s formatting ('+(e.message||e)+') \u2014 writing a freshly styled copy instead'); }
  }
  const statusLabel={completed:'Completed',inprogress:'In Progress',open:'Open',hold:'On Hold',recurring:'Recurring'};
  const S_FILL={'Completed':'FFE8F5E9','In Progress':'FFE3F2FD','On Hold':'FFFFEBEE','Open':'FFFFF3E0','Recurring':'FFF3E5F5'};
  const thin={style:'thin',color:{argb:'FFD0D7E2'}};
  const B={top:thin,left:thin,bottom:thin,right:thin};
  const HDR_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FF2563EB'}};
  const HDR_FONT={bold:true,color:{argb:'FFFFFFFF'},size:10};
  function styleHeaderRow(ws,r,n){
    const row=ws.getRow(r);
    for(let c=1;c<=n;c++){const cell=row.getCell(c);cell.fill=HDR_FILL;cell.font=HDR_FONT;
      cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.border=B;}
  }
  function findDataStart(ws, words){
    for(let r=1;r<=5;r++){
      let hit=false;
      ws.getRow(r).eachCell({includeEmpty:false},c=>{
        const v=String(c.value&&c.value.richText?c.value.richText.map(x=>x.text).join(''):c.value||'').toLowerCase();
        if(words.some(w=>v.includes(w))) hit=true;
      });
      if(hit) return r+1;
    }
    return 0;
  }
  function clearFrom(ws,start){
    if(ws.rowCount>=start) ws.spliceRows(start, ws.rowCount-start+2);
  }
  const PH=['Sl. No','Activity / Issue','Environment','Owner','Status','Priority','Blocker / Pending / Latest Update','ETA','Update'];
  function ensureProjectSheet(name){
    let ws=ewb.getWorksheet(name)||ewb.getWorksheet(name.substring(0,31));
    if(ws) return ws;
    ws=ewb.addWorksheet(name.substring(0,31));
    ws.getCell('A1').value='Open Action Tracker  |  '+name;
    ws.getCell('A1').font={bold:true,size:12,color:{argb:'FF1F3A8A'}};
    ws.mergeCells(1,1,1,PH.length);
    PH.forEach((h,i)=>ws.getRow(2).getCell(i+1).value=h);
    styleHeaderRow(ws,2,PH.length);
    [7,45,13,18,14,11,75,12,10].forEach((w,i)=>ws.getColumn(i+1).width=w);
    ws.views=[{state:'frozen',ySplit:2}];
    ws.dataValidations.add('E3:E300',{type:'list',allowBlank:true,formulae:['"Open,In Progress,On Hold,Completed,Recurring"']});
    ws.dataValidations.add('F3:F300',{type:'list',allowBlank:true,formulae:['"High,Medium,Low"']});
    ws.dataValidations.add('C3:C300',{type:'list',allowBlank:true,formulae:['"DEV,QA,PROD,DR,All"']});
    return ws;
  }
  [...new Set([...TASKS.map(t=>t.sheet),...EXTRA_PROJECTS])].forEach(pname=>{
    const ws=ensureProjectSheet(pname);
    const start=findDataStart(ws,['activity'])||3;
    clearFrom(ws,start);
    TASKS.filter(t=>t.sheet===pname).forEach((t,i)=>{
      const row=ws.getRow(start+i);
      const vals=[t.sl||String(i+1),t.title,t.env,t.owner,statusLabel[t.status]||t.status,
        t.priority?t.priority.charAt(0).toUpperCase()+t.priority.slice(1):'',t.update,t.eta,''];
      vals.forEach((v,ci)=>{const c=row.getCell(ci+1);c.value=v;
        c.alignment={wrapText:true,vertical:'top'};c.border=B;});
      const sf=S_FILL[statusLabel[t.status]];
      if(sf) row.getCell(5).fill={type:'pattern',pattern:'solid',fgColor:{argb:sf}};
    });
  });
  /* tickets */
  let tws=ewb.getWorksheet('Open-Service_Tickets');
  if(!tws&&TICKETS.length){
    tws=ewb.addWorksheet('Open-Service_Tickets');
    ['Sno','Start Date','End Date','OneIT reference','Subject','Status','Remarks'].forEach((h,i)=>tws.getRow(1).getCell(i+1).value=h);
    styleHeaderRow(tws,1,7);
    [6,12,12,16,55,14,40].forEach((w,i)=>tws.getColumn(i+1).width=w);
    tws.views=[{state:'frozen',ySplit:1}];
    tws.dataValidations.add('F2:F300',{type:'list',allowBlank:true,formulae:['"Open,In Progress,Completed"']});
  }
  if(tws){
    const start=findDataStart(tws,['subject','oneit'])||2;
    clearFrom(tws,start);
    TICKETS.forEach((t,i)=>{
      const row=tws.getRow(start+i);
      [i+1,t.date,'',t.ref,t.subject,t.status==='completed'?'Completed':'In Progress',t.remarks||''].forEach((v,ci)=>{
        const c=row.getCell(ci+1);c.value=v;c.alignment={wrapText:true,vertical:'top'};c.border=B;});
      const sf=S_FILL[t.status==='completed'?'Completed':'In Progress'];
      if(sf) row.getCell(6).fill={type:'pattern',pattern:'solid',fgColor:{argb:sf}};
    });
  }
  /* project plan */
  let pws=ewb.getWorksheet('Project_Plan');
  if(!pws&&PLAN.length){
    pws=ewb.addWorksheet('Project_Plan');
    ['Project','Phase','Start Date','End Date','Progress %','Status','Owner','Milestone','Notes'].forEach((h,i)=>pws.getRow(1).getCell(i+1).value=h);
    styleHeaderRow(pws,1,9);
    [24,28,12,12,11,12,16,11,40].forEach((w,i)=>pws.getColumn(i+1).width=w);
    pws.views=[{state:'frozen',ySplit:1}];
    pws.dataValidations.add('F2:F300',{type:'list',allowBlank:true,formulae:['"ontrack,hold,completed"']});
    pws.dataValidations.add('H2:H300',{type:'list',allowBlank:true,formulae:['"Yes,No"']});
  }
  if(pws&&PLAN.length){
    const start=findDataStart(pws,['phase'])||2;
    clearFrom(pws,start);
    planAoa().slice(1).forEach((vals,i)=>{
      const row=pws.getRow(start+i);
      vals.forEach((v,ci)=>{const c=row.getCell(ci+1);c.value=v;
        c.alignment={wrapText:true,vertical:'top'};c.border=B;});
    });
  }
  return await ewb.xlsx.writeBuffer();
}
const XMIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function exportTrackerXLSX(){
  let base=null;
  try{ if(fileHandle){ base=await (await fileHandle.getFile()).arrayBuffer(); } }catch(e){}
  try{
    const buf=await buildStyledTrackerBuffer(base);
    const d=new Date(),a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([buf],{type:XMIME}));
    a.download=`Open_Action_Tracker_Updated_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`;
    a.click();
    toast('Full tracker exported (formatting preserved) \u2014 ready for SharePoint');
  }catch(e){ toast('Export failed: '+(e.message||e)); }
}
let awTimer=null, AUTOWRITE=true;
function scheduleAutoWrite(){
  if(!AUTOWRITE || !FSAPI || !fileHandle) return;
  clearTimeout(awTimer);
  awTimer=setTimeout(()=>writeBackToFile(true), 2500);
}
function toggleAutoWrite(){
  AUTOWRITE=!AUTOWRITE;
  try{ localStorage.setItem('sccp_autowrite', AUTOWRITE?'1':'0'); }catch(e){}
  const b=document.getElementById('awBtn');
  if(b) b.textContent='\u26a1 Auto-write: '+(AUTOWRITE?'ON':'OFF');
  toast(AUTOWRITE?'\u26a1 Auto-write ON \u2014 every edit is written into the Excel within seconds':'Auto-write OFF \u2014 use \u2b06 Save to Excel manually');
  if(AUTOWRITE && dirty) scheduleAutoWrite();
}
async function verifyWrite(h){
  const f=await h.getFile();
  const wb=XLSX.read(new Uint8Array(await f.arrayBuffer()),{type:'array'});
  return {count:parseTasksLight(wb).length,
    mtime:new Date(f.lastModified).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})};
}
async function writeBackToFile(silent){
  if(!fileHandle){
    try{ fileHandle = await idbGet('handle'); }catch(e){}
  }
  if(!fileHandle){ if(!silent) toast('No connected file \u2014 use \u2b07 Full updated tracker instead, then upload manually'); return; }
  if(!silent && !confirm('\u2b06 Write your current tool data INTO the connected Excel file?\n\n\u2022 Values are updated; the file\'s formatting, colors and dropdowns are PRESERVED\n\u2022 OneDrive will sync it to SharePoint for the whole team\n\nProceed?')) return;
  async function writeVia(h){
    let perm = await h.queryPermission({mode:'readwrite'});
    if(perm!=='granted') perm = await h.requestPermission({mode:'readwrite'});
    if(perm!=='granted') throw new Error('permission denied');
    const base = await (await h.getFile()).arrayBuffer();
    try{
      const cwb=XLSX.read(new Uint8Array(base.slice(0)),{type:'array'});
      const diffs=fileDiffSummary(cwb);
      if(diffs.length){
        if(silent) throw new Error('CONFLICT_SILENT');
        const ok=confirm('\u26a0 TEAM EDITS DETECTED in the file since your last Refresh:\n\n'+
          diffs.slice(0,6).join('\n')+(diffs.length>6?'\n\u2026 +'+(diffs.length-6)+' more':'')+
          '\n\nOK = overwrite THEIR edits with your version\nCancel = abort (then \ud83d\udd04 Refresh to pull their changes first)');
        if(!ok) throw new Error('CONFLICT_CANCELLED');
      }
    }catch(ce){ if(ce.message==='CONFLICT_SILENT'||ce.message==='CONFLICT_CANCELLED') throw ce; }
    const buf = await buildStyledTrackerBuffer(base);
    const w = await h.createWritable();
    await w.write(new Blob([buf],{type:XMIME}));
    await w.close();
  }
  try{
    await writeVia(fileHandle);
  }catch(e1){
    if(e1.message==='CONFLICT_SILENT'){
      toast('\u26a0 Team edited the file \u2014 auto-write paused. Press \u2b06 Save to Excel to review & decide.');
      return;
    }
    if(e1.message==='CONFLICT_CANCELLED'){
      toast('Write cancelled \u2014 \ud83d\udd04 Refresh to pull team changes (\u2b07 export first if you must keep your edits)');
      return;
    }
    if(silent){
      toast('\u26a1 Auto-write failed ('+(e1.message||e1)+') \u2014 edits kept safe; press \u2b06 Save to Excel to retry');
      return;
    }
    const retry = confirm('\u26a0 Direct write failed: '+ (e1.message||e1) +
      '\n\nCommon causes:\n\u2022 The file is OPEN in Excel \u2014 close it and press OK to retry\n\u2022 OneDrive replaced the file during sync \u2014 press OK and re-pick the SAME file to reconnect\n\nOK = reconnect & retry \u00b7 Cancel = download the export instead');
    if(retry && FSAPI){
      try{
        const [h] = await window.showOpenFilePicker({types:[{description:'Excel tracker',accept:{[XMIME]:['.xlsx','.xlsm']}}]});
        await writeVia(h);
        fileHandle = h;
        await idbSet('handle', h);
        await rememberHandle(h);
      }catch(e2){
        toast('Still failing ('+(e2.message||e2)+') \u2014 downloading export instead so nothing is lost');
        exportTrackerXLSX(); return;
      }
    } else {
      toast('Downloading export instead \u2014 upload it to SharePoint manually');
      exportTrackerXLSX(); return;
    }
  }
  saveSnapshot(currentFileName);
  setDirty(false);
  /* EXCEL-FIRST: the file is the store \u2014 clear the local recovery copy after a confirmed write */
  try{ localStorage.removeItem(STATE_KEY); }catch(e){}
  const wtime=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  let vtxt='';
  try{ const v=await verifyWrite(fileHandle); vtxt=' \u00b7 file verified: '+v.count+' tasks'; }catch(e){}
  const fm=document.getElementById('fileMeta');
  if(fm) fm.textContent=' \u00b7 \u2b06 WRITTEN'+(silent?' (auto)':'')+' at '+wtime+vtxt+' \u2713';
  toast((silent?'\u26a1 Auto-written':'\u2705 WRITTEN')+' to '+currentFileName+' at '+wtime+vtxt);
}
/* PDF exports */
function pdfDoc(){ const {jsPDF}=window.jspdf; return new jsPDF({orientation:'landscape',unit:'pt',format:'a4'}); }
function exportReportPDF(elId, title){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'pt',format:'a4'});
  const text=document.getElementById(elId).textContent;
  doc.setFont('courier','normal'); doc.setFontSize(8);
  const lines=doc.splitTextToSize(text, 520);
  let y=48; const pageH=doc.internal.pageSize.getHeight();
  doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text(title,40,30);
  doc.setFont('courier','normal'); doc.setFontSize(8);
  lines.forEach(l=>{
    if(y>pageH-40){doc.addPage();y=40;}
    doc.text(l,40,y); y+=10.5;
  });
  const d=new Date();
  doc.save(`${title.replace(/\s+/g,'_')}_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.pdf`);
}
function exportExplorerPDF(){
  const T=exFiltered();
  const doc=pdfDoc();
  doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('TSAT / BY Program — Task Report · '+todayStr(),40,32);
  doc.autoTable({
    startY:46,
    head:[['Project','Activity / Issue','Owner','Status','Priority','Last update','ETA','Latest entry']],
    body:T.map(({t})=>[t.sheet.replace('SAP-',''),t.title,t.owner,t.status,t.priority,
      t.lastDate?fmtDate(t.lastDate):'',t.eta,lastLine(t.update).substring(0,90)]),
    styles:{fontSize:6.5,cellPadding:3,overflow:'linebreak'},
    headStyles:{fillColor:[37,99,235],fontSize:7},
    columnStyles:{0:{cellWidth:60},1:{cellWidth:170},2:{cellWidth:60},3:{cellWidth:48},4:{cellWidth:38},5:{cellWidth:50},6:{cellWidth:48},7:{cellWidth:'auto'}},
    alternateRowStyles:{fillColor:[246,248,251]}
  });
  const d=new Date();
  doc.save(`Task_Report_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.pdf`);
}

/* ---------- PLAN / GANTT ---------- */
function allProjects(){
  return [...new Set([...TASKS.map(t=>t.sheet), ...EXTRA_PROJECTS, ...PLAN.map(p=>p.project)])];
}
function planProjects(){
  return allProjects();
}
function populatePlanProjects(){
  const sel=document.getElementById('planProject'); if(!sel)return;
  const cur=sel.value;
  const projs=planProjects();
  sel.innerHTML=projs.map(p=>`<option ${p===cur?'selected':''}>${esc(p)}</option>`).join('');
}
function currentPlanProject(){ const s=document.getElementById('planProject'); return s?s.value:''; }
function phaseState(p){
  const today=new Date(); today.setHours(0,0,0,0);
  if(p.progress>=100||/done|complet/.test(p.status)) return 'done';
  if(/hold/.test(p.status)) return 'hold';
  if(p.end && p.end<today) return 'late';
  return 'ontrack';
}
function renderPlan(){
  const wrap=document.getElementById('ganttWrap'); if(!wrap)return;
  const proj=currentPlanProject();
  const phases=PLAN.filter(p=>p.project===proj).sort((a,b)=>(a.start?a.start:0)-(b.start?b.start:0));
  document.getElementById('phaseCount').textContent=phases.length;
  /* meta: weighted completion */
  let totD=0,doneD=0;
  phases.forEach(p=>{ if(p.start&&p.end){const d=Math.max(1,(p.end-p.start)/864e5);totD+=d;doneD+=d*p.progress/100;} });
  const pm=document.getElementById('planMeta');
  pm.innerHTML = (proj?ragDotHTML(proj):'') + (phases.length? esc((totD?Math.round(doneD/totD*100):0)+'% complete overall') : '');

  /* phase table */
  document.getElementById('phaseTable').innerHTML = phases.length ?
    '<table><tr><th>Phase</th><th>Start</th><th>End</th><th>Progress</th><th>Status</th><th>Owner</th><th></th></tr>'+
    phases.map(p=>{
      const gi=PLAN.indexOf(p);
      const st=phaseState(p);
      const stBadge={done:'<span class="badge b-done">Done</span>',late:'<span class="badge b-hold">Delayed</span>',hold:'<span class="badge b-open">On hold</span>',ontrack:'<span class="badge b-prog">On track</span>'}[st];
      return `<tr><td class="t-title">${p.milestone?'🔷 ':''}${esc(p.phase)}${p.notes?`<div class="t-sub">${esc(p.notes)}</div>`:''}</td>
      <td class="t-sheet">${p.start?fmtDate(p.start):'—'}</td><td class="t-sheet">${p.end?fmtDate(p.end):'—'}</td>
      <td>${p.progress}%</td><td>${stBadge}</td><td class="t-sheet">${esc(p.owner)}</td>
      <td style="white-space:nowrap"><button class="mini-btn" onclick="openEditPhase(${gi})">✎</button>
      <button class="mini-btn" onclick="deletePhase(${gi})">🗑</button></td></tr>`;
    }).join('')+'</table>'
    : emptyState('📊','No plan for this project yet. Click "＋ Add phase" or "✨ Generate default phases", or add a Project_Plan sheet in Excel.');

  /* gantt */
  const dated=phases.filter(p=>p.start&&p.end&&p.end>=p.start);
  if(!dated.length){ wrap.innerHTML=emptyState('🗓','Add phases with Start and End dates to see the Gantt chart.'); return; }
  let min=new Date(Math.min(...dated.map(p=>p.start))), max=new Date(Math.max(...dated.map(p=>p.end)));
  min.setDate(min.getDate()-3); max.setDate(max.getDate()+4);
  const dayPx=Math.max(4.5, Math.min(14, 900/((max-min)/864e5)));
  const totalPx=Math.ceil((max-min)/864e5*dayPx);
  const today=new Date(); today.setHours(0,0,0,0);
  const x=d=>((d-min)/864e5)*dayPx;

  /* month header */
  let months='',mCur=new Date(min.getFullYear(),min.getMonth(),1);
  while(mCur<=max){
    const mEnd=new Date(mCur.getFullYear(),mCur.getMonth()+1,1);
    const w=(Math.min(mEnd,max)-Math.max(mCur,min))/864e5*dayPx;
    if(w>2) months+=`<div class="g-month" style="width:${w}px">${mCur.toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}</div>`;
    mCur=mEnd;
  }
  /* week ticks + grid lines */
  let weeks='',lines='',wCur=new Date(min); wCur.setDate(wCur.getDate()-((wCur.getDay()+6)%7)); /* back to Monday */
  if(wCur<min) wCur.setDate(wCur.getDate()+7);
  const firstOff=x(wCur);
  weeks+=`<div class="g-week" style="width:${firstOff}px"></div>`;
  while(wCur<=max){
    weeks+=`<div class="g-week" style="width:${7*dayPx}px">${pad(wCur.getDate())}-${pad(wCur.getMonth()+1)}</div>`;
    lines+=`<div class="g-grid-line" style="left:${x(wCur)}px"></div>`;
    wCur=new Date(wCur); wCur.setDate(wCur.getDate()+7);
  }
  const todayLine=(today>=min&&today<=max)?`<div class="g-today" style="left:${x(today)}px"></div>`:'';

  wrap.innerHTML=`<div class="gantt" style="width:${190+totalPx}px">
    <div class="g-head"><div class="g-label-col"><div class="g-summary" style="padding:8px 12px"><b>${esc(proj)}</b></div></div>
      <div style="flex:1"><div class="g-months" style="width:${totalPx}px">${months}</div>
      <div class="g-weeks" style="width:${totalPx}px">${weeks}</div></div></div>
    ${dated.map(p=>{
      const gi=PLAN.indexOf(p);
      const st=phaseState(p);
      const left=x(p.start), w=Math.max(dayPx,(p.end-p.start)/864e5*dayPx+dayPx);
      const cls={done:'g-done',late:'g-late',hold:'g-hold',ontrack:''}[st];
      const inner=p.milestone
        ? `<div class="g-milestone" style="left:${left-9+w/2}px" onclick="openEditPhase(${gi})" title="${esc(p.phase)} · ${fmtDate(p.end)}"></div>`
        : `<div class="g-bar ${cls}" style="left:${left}px;width:${w}px" onclick="openEditPhase(${gi})" title="${esc(p.phase)} · ${fmtDate(p.start)} → ${fmtDate(p.end)} · ${p.progress}%">
            <div class="g-fill" style="width:${p.progress}%"></div>
            <div class="g-bar-label">${esc(p.phase.substring(0,28))} ${p.progress}%</div></div>`;
      return `<div class="g-row"><div class="g-label-col">${esc(p.phase.substring(0,30))}<span class="g-label-sub">${esc(p.owner||'')}${p.owner?' · ':''}${fmtDate(p.start)} → ${fmtDate(p.end)}</span></div>
        <div class="g-track" style="width:${totalPx}px">${lines}${todayLine}${inner}</div></div>`;
    }).join('')}
  </div>`;
}
function phaseFormHTML(p){
  return `<div class="m-field"><label>Phase name</label><input id="pPhase" value="${esc(p.phase||'')}" placeholder="e.g. SIT Testing"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div class="m-field"><label>Start date</label><input type="date" id="pStart" value="${p.start?dmyToISO(fmtDate(p.start)):''}"></div>
    <div class="m-field"><label>End date</label><input type="date" id="pEnd" value="${p.end?dmyToISO(fmtDate(p.end)):''}"></div>
    <div class="m-field"><label>Progress %</label><input id="pProg" type="number" min="0" max="100" value="${p.progress||0}"></div>
    <div class="m-field"><label>Status</label><select id="pStatus">
      ${['ontrack','hold','completed'].map(s=>`<option value="${s}" ${(p.status||'ontrack')===s?'selected':''}>${s==='ontrack'?'On track':s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}</select></div>
    </div>
    <div class="m-field"><label>Owner</label><input id="pOwner" value="${esc(p.owner||'')}"></div>
    <div class="m-field"><label><input type="checkbox" id="pMile" ${p.milestone?'checked':''} style="width:auto;margin-right:6px">Milestone (shown as 🔷 diamond)</label></div>
    <div class="m-field"><label>Notes</label><input id="pNotes" value="${esc(p.notes||'')}"></div>`;
}
function readPhaseForm(p){
  p.phase=document.getElementById('pPhase').value.trim();
  p.start=parseETA(document.getElementById('pStart').value.trim());
  p.end=parseETA(document.getElementById('pEnd').value.trim());
  p.progress=Math.min(100,Math.max(0,parseFloat(document.getElementById('pProg').value)||0));
  p.status=document.getElementById('pStatus').value;
  p.owner=document.getElementById('pOwner').value.trim();
  p.milestone=document.getElementById('pMile').checked;
  p.notes=document.getElementById('pNotes').value.trim();
  return p;
}
function openAddPhase(){
  const proj=currentPlanProject();
  if(!proj){toast('Load a tracker first');return;}
  openModal('Add phase — '+proj, phaseFormHTML({}), ()=>{
    const p=readPhaseForm({project:proj});
    if(!p.phase){toast('Enter a phase name');return;}
    PLAN.push(p); setDirty(true); renderPlan(); closeModal(); toast('Phase added ✓');
  });
}
function openEditPhase(gi){
  const p=PLAN[gi];
  openModal('Edit phase — '+p.project, phaseFormHTML(p), ()=>{
    readPhaseForm(p); setDirty(true); renderPlan(); closeModal(); toast('Phase updated ✓');
  });
}
function deletePhase(gi){
  if(!confirm('Delete phase "'+PLAN[gi].phase+'"?'))return;
  PLAN.splice(gi,1); setDirty(true); renderPlan(); toast('Phase deleted');
}
function generateDefaultPlan(){
  const proj=currentPlanProject();
  if(!proj){toast('Load a tracker first');return;}
  if(PLAN.some(p=>p.project===proj) && !confirm('This project already has phases. Add the default template anyway?'))return;
  const names=['Requirements & Design','Development','SIT Testing','UAT','Go-Live'];
  const durations=[10,21,10,7,1];
  let cur=new Date(); cur.setHours(0,0,0,0);
  names.forEach((n,i)=>{
    const start=new Date(cur), end=new Date(cur); end.setDate(end.getDate()+durations[i]-1);
    PLAN.push({project:proj,phase:n,start,end,progress:0,status:'ontrack',owner:'',milestone:i===names.length-1,notes:''});
    cur=new Date(end); cur.setDate(cur.getDate()+1);
  });
  setDirty(true); renderPlan(); toast('Default phases added — click any bar to edit dates');
}
function openAddProject(){
  openModal('＋ New project',
    `<div class="m-field"><label>Project name (becomes a tab in the exported tracker Excel)</label>
     <input id="npName" placeholder="e.g. JAGIROAD MES Integration"></div>
     <div class="m-field"><label>Owner / Lead (optional)</label><input id="npOwner" placeholder="Name"></div>
     <div class="m-field"><label><input type="checkbox" id="npPhases" checked style="width:auto;margin-right:6px">Generate default phases (Requirements→Dev→SIT→UAT→Go-Live)</label></div>
     <div class="m-field"><label>First task (optional)</label><input id="npTask" placeholder="e.g. Kick-off workshop with client"></div>`,
    ()=>{
      const name=document.getElementById('npName').value.trim();
      if(!name){toast('Enter a project name');return;}
      if(allProjects().includes(name)){toast('A project with this name already exists');return;}
      if(name.length>31){toast('Keep the name under 31 characters (Excel sheet limit)');return;}
      EXTRA_PROJECTS.push(name);
      const owner=document.getElementById('npOwner').value.trim();
      const firstTask=document.getElementById('npTask').value.trim();
      if(firstTask){
        const t={sheet:name,sl:'1',title:firstTask,env:'',owner:owner||'—',status:'open',priority:'',update:todayStr()+': Project created in Scrum Command Center',eta:''};
        reindexTask(t); TASKS.push(t); rebuildEntries();
      }
      if(document.getElementById('npPhases').checked){
        const names=['Requirements & Design','Development','SIT Testing','UAT','Go-Live'];
        const durations=[10,21,10,7,1];
        let cur=new Date(); cur.setHours(0,0,0,0);
        names.forEach((n,i)=>{
          const start=new Date(cur), end=new Date(cur); end.setDate(end.getDate()+durations[i]-1);
          PLAN.push({project:name,phase:n,start,end,progress:0,status:'ontrack',owner:owner,milestone:i===names.length-1,notes:''});
          cur=new Date(end); cur.setDate(cur.getDate()+1);
        });
      }
      setDirty(true);
      populateFilters(); populatePlanProjects();
      const sel=document.getElementById('planProject'); if(sel) sel.value=name;
      renderAll();
      /* jump to the plan tab so the user sees their new project */
      const planBtn=document.querySelector('#mainNav button[data-tab="tab-plan"]');
      if(planBtn) showTab(planBtn);
      closeModal(); toast('Project "'+name+'" created ✓ — remember to Save and Export tracker to publish it');
    });
}
function planAoa(){
  const aoa=[['Project','Phase','Start Date','End Date','Progress %','Status','Owner','Milestone','Notes']];
  PLAN.forEach(p=>aoa.push([p.project,p.phase,p.start?fmtDate(p.start):'',p.end?fmtDate(p.end):'',p.progress,p.status,p.owner,p.milestone?'Yes':'No',p.notes]));
  return aoa;
}
function exportPlanXLSX(){
  if(!PLAN.length){toast('No plan to export');return;}
  const ws=XLSX.utils.aoa_to_sheet(planAoa());
  ws['!cols']=[{wch:22},{wch:26},{wch:12},{wch:12},{wch:10},{wch:10},{wch:14},{wch:9},{wch:35}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Project_Plan');
  const d=new Date();
  XLSX.writeFile(wb,`Project_Plan_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`);
  toast('Plan exported — you can paste this sheet into the master tracker');
}

/* ---------- CHANGES ---------- */
function renderChanges(){
  const el=document.getElementById('changesList'),badge=document.getElementById('changesBadge');
  const sessionHTML = SESSION_EDITS.length
    ? '<div class="section-mini">✏️ Edits you made in the tool this session</div>'+
      SESSION_EDITS.map(s=>`<div class="change-item"><div class="ch-icon" style="background:var(--blue-bg)">${s.icon}</div><div class="ch-body"><div class="ch-title">${esc(s.title)}</div><div class="ch-detail">${esc(s.detail)} · ${s.at}</div></div></div>`).join('')
    : '';
  if(CHANGES===null){
    document.getElementById('chgMeta').textContent='baseline';
    el.innerHTML=sessionHTML+emptyState('📌','This tab compares FILE LOADS: your first load is the baseline. Tomorrow, after the team updates the Excel, press Refresh — every new entry, status change and new task will be listed here. Edits you make inside the tool appear above as you work.');
    if(SESSION_EDITS.length){badge.textContent=SESSION_EDITS.length;badge.classList.remove('hidden');}else badge.classList.add('hidden');
    return;
  }
  const pd=CHANGES._prevDate?new Date(CHANGES._prevDate).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  document.getElementById('chgMeta').textContent=`vs ${pd}`;
  if(!CHANGES.length){
    el.innerHTML=sessionHTML+emptyState('😴','No differences between this load and the previous one — the file content is identical. Team changes appear after they edit the Excel and you Refresh.');
    if(SESSION_EDITS.length){badge.textContent=SESSION_EDITS.length;badge.classList.remove('hidden');}else badge.classList.add('hidden');
    return;
  }
  badge.textContent=CHANGES.length+SESSION_EDITS.length;badge.classList.remove('hidden');
  const icons={new:['🆕','var(--green-bg)'],status:['🔁','var(--blue-bg)'],update:['✍️','var(--purple-bg)'],owner:['👤','var(--orange-bg)'],removed:['🗑','var(--red-bg)']};
  el.innerHTML=CHANGES.map(ch=>{
    const[ic,bg]=icons[ch.type];let d='';
    if(ch.type==='new')d=`New task in project <b>${esc(ch.t.sheet)}</b> · ${esc(ch.t.owner)} · ${statusBadge(ch.t.status)}`;
    if(ch.type==='removed')d=`Removed from <b>${esc(ch.t.sheet)}</b>`;
    if(ch.type==='status')d=`Status: <span class="old">${esc(ch.old)}</span> → <span class="new">${esc(ch.nw)}</span> · ${esc(ch.t.owner)}`;
    if(ch.type==='owner')d=`Owner: <span class="old">${esc(ch.old)}</span> → <span class="new">${esc(ch.nw)}</span>`;
    if(ch.type==='update')d=`${esc(ch.t.owner)}: "${esc(ch.added)}"`;
    return `<div class="change-item"><div class="ch-icon" style="background:${bg}">${ic}</div><div class="ch-body"><div class="ch-title">${esc(ch.t.title)}</div><div class="ch-detail">${d}</div></div></div>`;
  }).join('') + sessionHTML;
}

/* ---------- SCRUM & STATUS ---------- */
function bar(ch,n){return ch.repeat(n);}
function renderScrum(){
  const dateStr=new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const c=counts();let r='';
  r+=bar('━',52)+'\n DAILY SCRUM · TSAT / BY PROGRAM\n '+dateStr+'\n'+bar('━',52)+'\n\n';
  r+=`SNAPSHOT ▸ ${c.total} tasks | ${c.inprogress} in progress | ${c.open} open | ${c.hold} hold | ${c.completed} done\n`;
  const breached=TASKS.filter(etaBreached);
  if(breached.length)r+=`⚠ ALERT  ▸ ${breached.length} task(s) past ETA\n`;
  r+='\n';
  const holds=TASKS.filter(t=>t.status==='hold');
  r+='1) 🔴 BLOCKED / ON HOLD\n'+bar('─',48)+'\n';
  r+=holds.length?holds.map(t=>`   • ${t.title}\n     ${t.owner} · ${firstLine(t.update)||'no reason recorded'}`).join('\n')+'\n':'   (none)\n';
  r+='\n2) 🚨 ETA BREACHED — commit new dates\n'+bar('─',48)+'\n';
  r+=breached.length?breached.map(t=>`   • ${t.title}\n     ${t.owner} · was due ${t.eta} · ${t.status}`).join('\n')+'\n':'   (none)\n';
  const high=TASKS.filter(t=>t.priority.includes('high')&&t.status!=='completed'&&t.status!=='hold');
  r+='\n3) ⚡ HIGH PRIORITY — status round\n'+bar('─',48)+'\n';
  r+=high.length?high.map(t=>`   • ${t.title}\n     ${t.owner} · ${t.status} · ETA ${t.eta||'TBD'}\n     ↳ ${lastLine(t.update)||'no update'}`).join('\n')+'\n':'   (none)\n';
  const stale=TASKS.filter(t=>(t.status==='inprogress'||t.status==='open')&&!updatedWithin(t,2));
  r+='\n4) ⏰ STALE (3+ days) — chase\n'+bar('─',48)+'\n';
  r+=stale.length?stale.map(t=>`   • ${t.title} — ${t.owner}`).join('\n')+'\n':'   (all fresh 👏)\n';
  const fresh=TASKS.filter(t=>updatedWithin(t,0));
  r+='\n5) 🟢 UPDATED TODAY\n'+bar('─',48)+'\n';
  r+=fresh.length?fresh.map(t=>`   • ${t.title} — ${primaryOwners(t)[0]||t.owner}\n     ↳ ${lastLine(t.update)}`).join('\n')+'\n':'   (none yet)\n';
  const tix=TICKETS.filter(t=>t.status!=='completed');
  if(tix.length)r+='\n6) 🎫 OPEN TICKETS\n'+bar('─',48)+'\n'+tix.map(t=>`   • #${t.ref} ${t.subject}`).join('\n')+'\n';
  const owners=[...new Set(TASKS.filter(t=>t.status==='inprogress'||t.status==='open').flatMap(primaryOwners))];
  r+='\n'+bar('━',52)+'\nROUND-TABLE ▸ '+owners.join(' → ')+'\n';
  document.getElementById('scrumReport').textContent=r;
}
function renderStatus(){
  const dateStr=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const fp=(document.getElementById('repProject')||{value:''}).value;
  const inc=(document.getElementById('repInclude')||{value:'all'}).value;
  let r=`STATUS REPORT · TSAT / BY PROGRAM · ${dateStr}${fp?' · Project: '+fp:''}${inc!=='all'?' · ('+(inc==='active'?'active only':'high priority only')+')':''}\n`+bar('━',52)+'\n\n';
  (fp?[fp]:[...new Set(TASKS.map(t=>t.sheet))]).forEach(sh=>{
    let T=TASKS.filter(t=>t.sheet===sh);
    if(inc==='high') T=T.filter(t=>t.priority.includes('high'));
    const d=T.filter(t=>t.status==='completed').length;
    const pct=T.length?Math.round(d/T.length*100):0;
    r+=`▶ ${sh}   [${'█'.repeat(Math.round(pct/10))}${'░'.repeat(10-Math.round(pct/10))}] ${pct}% (${d}/${T.length})\n`+bar('─',48)+'\n';
    T.filter(t=>t.status!=='completed').forEach(t=>{
      const f=t.status==='hold'?'⏸':etaBreached(t)?'🚨':t.priority.includes('high')?'⚡':'•';
      r+=`${f} ${t.title} [${t.owner}] — ${t.status.toUpperCase()}${t.eta?' · ETA '+t.eta:''}\n`;
      const l=lastLine(t.update);if(l)r+=`   ${l}\n`;
    });
    const done=T.filter(t=>t.status==='completed');
    if(done.length&&inc==='all')r+=`✔ Done: ${done.map(t=>t.title).join('; ')}\n`;
    r+='\n';
  });
  const tix=TICKETS.filter(t=>t.status!=='completed');
  if(tix.length&&!fp)r+='▶ OPEN SERVICE TICKETS\n'+bar('─',48)+'\n'+tix.map(t=>`• #${t.ref} — ${t.subject} (${t.date})`).join('\n')+'\n';
  document.getElementById('statusReport').textContent=r;
}

/* ---------- KANBAN (drag & drop) ---------- */
function populateFilters(){
  const sheets=allProjects();
  const owners=[...new Set(TASKS.flatMap(primaryOwners))].sort();
  const ntP=document.getElementById('ntProject');
  if(ntP){const cur=ntP.value;ntP.innerHTML=sheets.map(s=>`<option ${s===cur?'selected':''}>${esc(s)}</option>`).join('');}
  const ntO=document.getElementById('ntOwners');
  if(ntO){ntO.innerHTML=owners.map(o=>`<option value="${esc(o)}">`).join('');}
  ['kbSheet','dlSheet','gridSheet','exProject','repProject'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<option value="">All projects</option>'+sheets.map(s=>`<option>${esc(s)}</option>`).join('');});
  ['kbOwner','dlOwner','gridOwner'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<option value="">All owners</option>'+owners.map(o=>`<option>${esc(o)}</option>`).join('');});
}
function renderKanban(){
  const q=document.getElementById('kbSearch').value.toLowerCase();
  const fs=document.getElementById('kbSheet').value,fo=document.getElementById('kbOwner').value,fp=document.getElementById('kbPrio').value;
  const items=TASKS.map((t,i)=>({t,i})).filter(({t})=>{
    if(fs&&t.sheet!==fs)return false;
    if(fo&&!primaryOwners(t).includes(fo))return false;
    if(fp==='high'&&!t.priority.includes('high'))return false;
    if(q&&!(t.title+' '+t.owner+' '+t.update).toLowerCase().includes(q))return false;
    return true;
  });
  const cols=[{key:'open',label:'📥 Open',color:'var(--orange)'},{key:'inprogress',label:'🔵 In progress',color:'var(--blue)'},
    {key:'hold',label:'⏸ On hold',color:'var(--red)'},{key:'completed',label:'✅ Completed',color:'var(--green)'}];
  document.getElementById('kanbanBoard').innerHTML=cols.map(c=>{
    const colItems=items.filter(({t})=>t.status===c.key||(c.key==='open'&&t.status==='recurring'));
    return `<div class="kcol" data-status="${c.key}" ondragover="kbDragOver(event)" ondragleave="kbDragLeave(event)" ondrop="kbDrop(event)">
      <div class="kcol-hdr"><span style="color:${c.color}">${c.label}</span><span class="kc-count">${colItems.length}</span></div>
      ${colItems.map(({t,i})=>{
        const o=primaryOwners(t)[0]||'—',late=etaBreached(t);
        return `<div class="kcard" draggable="true" data-idx="${i}" ondragstart="kbDragStart(event)" ondragend="kbDragEnd(event)" onclick="openTaskDetail(${i})" title="Click for history & comments · drag to change status">
          <div class="kc-title">${esc(t.title)}</div>
          <div class="kc-meta"><span class="kc-owner"><span class="avatar" style="background:${ownerColor(o)}">${o==='—'?'?':initials(o)}</span>${esc(o)}</span>
          ${t.priority.includes('high')?'<span class="badge b-high">High</span>':''}
          ${t.eta?`<span class="kc-eta ${late?'late':''}">${late?'⚠ ':''}${esc(t.eta)}</span>`:''}</div>
          ${t.update?`<div class="kc-update">${esc(lastLine(t.update))}</div>`:''}
          <div class="kc-actions"><button class="mini-btn" onclick="event.stopPropagation();openAddUpdate(${i})">＋ update</button><button class="mini-btn" onclick="event.stopPropagation();openTaskDetail(${i})">📜 history</button>${t.status!=='completed'?`<button class="mini-btn" onclick="event.stopPropagation();openReassign(${i})">👤</button>`:''}</div>
        </div>`;
      }).join('')||'<div class="empty-state" style="padding:18px"><p>drop here</p></div>'}</div>`;
  }).join('');
}
let dragIdx=null;
function kbDragStart(e){ dragIdx=+e.currentTarget.dataset.idx; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; }
function kbDragEnd(e){ e.currentTarget.classList.remove('dragging'); }
function kbDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; e.currentTarget.classList.add('drag-over'); }
function kbDragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function kbDrop(e){
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if(dragIdx===null) return;
  changeStatus(dragIdx, e.currentTarget.dataset.status);
  dragIdx=null;
}

/* ---------- TEAM / ATTENTION / TICKETS ---------- */
function renderTeam(){
  const map={};
  TASKS.forEach(t=>primaryOwners(t).forEach(o=>{(map[o]=map[o]||[]).push(t);}));
  const maxLoad=Math.max(1,...Object.values(map).map(T=>T.filter(t=>t.status!=='completed').length));
  const sorted=Object.keys(map).sort((a,b)=>map[b].filter(t=>t.status!=='completed').length-map[a].filter(t=>t.status!=='completed').length);
  document.getElementById('teamGrid').innerHTML=sorted.map((o,mi)=>{
    const T=map[o];
    const rank={inprogress:0,open:1,recurring:2,hold:3,completed:4};
    const act=T.filter(t=>t.status!=='completed').sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9));
    const pct=Math.round(act.length/maxLoad*100);
    const lc=pct>75?'var(--red)':pct>45?'var(--orange)':'var(--green)';
    const mkItem=t=>`<div class="mc-item"><span class="mi-t">${esc(t.title.substring(0,60))}${t.title.length>60?'…':''}</span>${statusBadge(t.status)}</div>`;
    return `<div class="member-card"><div class="mc-top">
      <div class="mc-avatar" style="background:${ownerColor(o)}">${initials(o)}</div>
      <div><div class="mc-name">${esc(o)}</div><div class="mc-stat">${act.length} active · ${T.length-act.length} completed</div></div></div>
      <div class="mc-load"><div class="mc-load-fill" style="width:${pct}%;background:${lc}"></div></div>
      ${act.slice(0,4).map(mkItem).join('')}
      ${act.length>4?`<div class="mc-extra hidden" id="mcx${mi}">${act.slice(4).map(mkItem).join('')}</div>
      <button class="mc-more" id="mcb${mi}" onclick="toggleMember(${mi},${act.length-4})">+${act.length-4} more active ▾</button>`:''}</div>`;
  }).join('');
}
function toggleMember(mi,n){
  const extra=document.getElementById('mcx'+mi), btn=document.getElementById('mcb'+mi);
  const open=extra.classList.toggle('hidden');
  btn.innerHTML = open ? `+${n} more active ▾` : `Show less ▴`;
}
function renderAttention(){
  const breached=TASKS.filter(etaBreached);
  const stale=TASKS.filter(t=>(t.status==='inprogress'||t.status==='open')&&!updatedWithin(t,2));
  const holds=TASKS.filter(t=>t.status==='hold');
  const miss=TASKS.filter(t=>t.status!=='completed'&&((t.owner==='—'||t.owner==='_')||!t.update.trim()));
  fillT('etaTable','etaCount',breached,'🎯 All ETAs healthy');
  fillT('staleTable','staleCount',stale,'✨ Every active task fresh');
  fillT('holdTable','holdCount',holds,'Nothing on hold');
  fillT('missTable','missCount',miss,'All tasks have owners & updates');
  const total=breached.length+stale.length+miss.length;
  const badge=document.getElementById('attnBadge');
  if(total){badge.textContent=total;badge.classList.remove('hidden');}else badge.classList.add('hidden');
}
function fillT(tid,cid,rows,msg){
  document.getElementById(cid).textContent=rows.length;
  document.getElementById(tid).innerHTML=rows.length?
    '<table><tr><th>Task</th><th>Owner</th><th>Status</th><th>ETA</th></tr>'+rows.map(t=>
    `<tr><td class="t-title">${esc(t.title)}<div class="t-sub">${esc(t.sheet)}${t.update?' · '+esc(lastLine(t.update).substring(0,90)):''}</div></td><td>${esc(t.owner)}</td><td>${statusBadge(t.status)}</td><td class="t-sheet">${esc(t.eta)||'—'}</td></tr>`).join('')+'</table>'
    :emptyState('👌',msg);
}
function renderTickets(){
  const open=TICKETS.filter(t=>t.status!=='completed'),closed=TICKETS.filter(t=>t.status==='completed');
  document.getElementById('openTixCount').textContent=open.length;
  document.getElementById('openTix').innerHTML=open.length?
    '<table><tr><th>Ref</th><th>Subject</th><th>Raised</th><th>Status</th></tr>'+open.map(t=>
    `<tr><td style="color:var(--blue-t);font-weight:600">#${esc(t.ref)}</td><td>${esc(t.subject)}</td><td class="t-sheet">${esc(t.date)}</td><td>${statusBadge(t.status)}</td></tr>`).join('')+'</table>'
    :emptyState('🎉','No open tickets');
  document.getElementById('closedTix').innerHTML=closed.length?
    '<table>'+closed.slice(-8).reverse().map(t=>
    `<tr><td style="color:var(--text3);font-weight:600">#${esc(t.ref)}</td><td style="color:var(--text2)">${esc(t.subject)}</td><td class="t-sheet">${esc(t.date)}</td><td>${statusBadge('completed')}</td></tr>`).join('')+'</table>':emptyState('—','None');
}

/* ---------- LIVE SCRUM MODE (project-wise) ---------- */
let LS = {projs:[], idx:0, secs:120, left:120, timer:null, notes:[], sel:-1};
function scrumProjectsList(){
  return [...new Set(TASKS.filter(t=>t.status==='inprogress'||t.status==='open'||t.status==='hold').map(t=>t.sheet))];
}
function startLiveScrum(){
  LS.projs = scrumProjectsList();
  if(!LS.projs.length){toast('No active projects \u2014 load a tracker first');return;}
  LS.idx=0; LS.notes=[]; LS.sel=-1;
  document.getElementById('lsOverlay').classList.remove('hidden');
  lsResetTimer(); lsRender();
}
function lsResetTimer(){
  LS.secs = +document.getElementById('lsMinutes').value;
  LS.left = LS.secs;
  clearInterval(LS.timer);
  LS.timer = setInterval(lsTick, 1000);
  lsPaintTimer();
}
function lsTick(){ LS.left--; lsPaintTimer(); }
function lsPaintTimer(){
  const el=document.getElementById('lsTimer'), fill=document.getElementById('lsTimerFill');
  const over = LS.left<0;
  const v = Math.abs(LS.left);
  el.textContent = (over?'+':'')+Math.floor(v/60)+':'+pad(v%60);
  el.classList.toggle('over',over); fill.classList.toggle('over',over);
  fill.style.width = over? '100%' : Math.max(0,(LS.left/LS.secs*100))+'%';
}
function lsActive(proj){
  const rank={hold:0,inprogress:1,open:2,recurring:3};
  return TASKS.map((t,i)=>({t,i}))
    .filter(({t})=>t.sheet===proj&&t.status!=='completed')
    .sort((a,b)=>(rank[a.t.status]??9)-(rank[b.t.status]??9));
}
function lsRender(){
  if(LS.idx>=LS.projs.length){ lsFinish(); return; }
  const proj = LS.projs[LS.idx];
  document.getElementById('lsProgress').textContent = 'project '+(LS.idx+1)+' of '+LS.projs.length;
  const mine = lsActive(proj);
  const owners = [...new Set(mine.flatMap(({t})=>primaryOwners(t)))];
  const blocked = mine.filter(({t})=>t.status==='hold');
  const late = mine.filter(({t})=>etaBreached(t));
  const stale = mine.filter(({t})=>!updatedWithin(t,2));
  const qs = [];
  if(blocked.length) qs.push('Unblock: what is needed for '+blocked.length+' held task(s)?');
  if(late.length) qs.push('Dates: new commitments for '+late.length+' past-ETA task(s)?');
  if(stale.length) qs.push('Silent: status on '+stale.length+' task(s) with no update in 3+ days');
  document.getElementById('lsBody').innerHTML = `
    <div class="ls-person">
      <div class="ls-avatar" style="background:${ownerColor(proj)}">\uD83D\uDCC2</div>
      <div><div class="ls-name">${ragDotHTML(proj)} ${esc(proj)}</div>
      <div class="ls-sub">${mine.length} active task${mine.length!==1?'s':''} \u00b7 ${owners.map(o=>`<span class="avatar" style="background:${ownerColor(o)};margin-right:2px" title="${esc(o)}">${initials(o)}</span>`).join('')} ${owners.map(esc).join(', ')}</div>
      ${qs.length?`<div class="ls-qs">\uD83D\uDCA1 ${qs.join(' \u00b7 ')}</div>`:''}</div>
    </div>
    <div class="ls-hint">Click a task \u2192 type the update below \u2192 Enter. It saves with today's date.</div>
    ${mine.map(({t,i})=>{
      const cls = t.status==='hold'?'ls-blocked':etaBreached(t)?'ls-late':'';
      const o = primaryOwners(t)[0]||'\u2014';
      return `<div class="ls-task ${cls} ${LS.sel===i?'sel':''}" onclick="lsPick(${i})" id="lst${i}">
        <div class="ls-task-top">
          <span class="avatar" style="background:${ownerColor(o)}" title="${esc(t.owner)}">${o==='\u2014'?'?':initials(o)}</span>
          <span class="ls-task-title">${esc(t.title)}</span>
          ${statusBadge(t.status)}${t.priority.includes('high')?'<span class="badge b-high">High</span>':''}
          ${t.eta?`<span class="kc-eta ${etaBreached(t)?'late':''}">${etaBreached(t)?'\u26A0 ':''}ETA ${esc(t.eta)}</span>`:''}
        </div>
        <div class="ls-task-upd">\u21B3 ${esc(lastLine(t.update)||'no update recorded')}</div>
      </div>`;
    }).join('')||emptyState('\uD83C\uDFD6','No active tasks in this project')}`;
  document.getElementById('lsTaskSel').innerHTML = mine.map(({t,i})=>`<option value="${i}" ${LS.sel===i?'selected':''}>${esc(t.title.substring(0,45))}</option>`).join('');
  document.getElementById('lsNote').value='';
}
function lsPick(i){
  LS.sel=i;
  document.querySelectorAll('.ls-task').forEach(x=>x.classList.remove('sel'));
  const card=document.getElementById('lst'+i); if(card)card.classList.add('sel');
  const sel=document.getElementById('lsTaskSel'); sel.value=String(i);
  document.getElementById('lsNote').focus();
}
function lsAddNote(){
  const v = document.getElementById('lsNote').value.trim();
  if(!v){toast('Click a task, then type the update');return;}
  const idx = +document.getElementById('lsTaskSel').value;
  if(isNaN(idx)){toast('Pick a task first');return;}
  const t = TASKS[idx];
  pushTaskUndo('scrum note on \u201c'+t.title.substring(0,30)+'\u2026\u201d', idx);
  t.update = (t.update?t.update+'\n':'') + todayStr()+': '+v;
  reindexTask(t); rebuildEntries(); setDirty(true);
  logEdit('\uD83C\uDF99', t.title, 'Scrum note: "'+v.substring(0,90)+'"');
  LS.notes.push({owner:t.owner, task:t.title, text:v, proj:t.sheet});
  toast('Saved to '+t.title.substring(0,35)+'\u2026 \u2713');
  /* refresh cards without resetting the timer */
  const keepLeft=LS.left;
  lsRender(); clearInterval(LS.timer);
  LS.left=keepLeft; LS.timer=setInterval(lsTick,1000); lsPaintTimer();
}
function lsNext(){ LS.idx++; LS.sel=-1; lsRender(); if(LS.idx<LS.projs.length) lsResetTimer(); }
function lsPrev(){ if(LS.idx>0){LS.idx--; LS.sel=-1; lsRender(); lsResetTimer();} }
function lsFinish(){
  clearInterval(LS.timer);
  document.getElementById('lsBody').innerHTML = `<div class="ls-done">
    <h2>\uD83C\uDFC1 Scrum complete</h2>
    <p>${LS.notes.length} update${LS.notes.length!==1?'s':''} captured across ${LS.projs.length} project${LS.projs.length!==1?'s':''}. Everything is saved into the tracker with today's date.</p>
    <div class="ls-captured">${LS.notes.map(n=>`<div class="ls-task"><b>${esc(n.proj)}</b> \u00b7 ${esc(n.task.substring(0,55))}<div class="ls-task-upd">${esc(n.owner)}: ${esc(n.text)}</div></div>`).join('')}</div>
    <p style="margin-top:16px"><button class="btn btn-primary" onclick="endLiveScrum()">Close & review</button></p>
  </div>`;
  document.getElementById('lsProgress').textContent='done';
}
function endLiveScrum(){
  clearInterval(LS.timer);
  document.getElementById('lsOverlay').classList.add('hidden');
  renderAll();
  if(LS.notes.length) toast(LS.notes.length+' scrum updates saved \u2014 remember \uD83D\uDCBE Save & export tracker');
}

/* ---------- MINUTES CAPTURE ---------- */
let MP = [];
function openMinutesModal(){
  openModal('📝 Paste meeting minutes',
    `<p style="font-size:12.5px;color:var(--text2);margin-bottom:10px">Paste notes or Copilot's recap — one line per update, like:<br>
     <code style="font-size:11.5px">Prasad: VM migration call completed, vCPU approved</code></p>
     <div class="m-field"><textarea id="mpText" style="min-height:130px" placeholder="Kishore: NXM query finalized with DB team&#10;Rohini - CSV combination logic tested&#10;Prasad: SAML fix deployed to QA"></textarea></div>
     <div id="mpPreview"></div>`,
    ()=>{ if(MP.length) applyMinutes(); else parseMinutes(); });
  MP=[];
  document.getElementById('modalOk').textContent='Parse →';
}
function parseMinutes(){
  const text = document.getElementById('mpText').value;
  const owners = [...new Set(TASKS.flatMap(primaryOwners))];
  MP = [];
  text.split('\n').map(l=>l.trim()).filter(Boolean).forEach(line=>{
    const m = line.match(/^([A-Za-z][A-Za-z .]{1,25}?)\s*[:\-–]\s*(.+)$/);
    if(!m) { MP.push({owner:null,text:line,taskIdx:-1}); return; }
    const nameRaw = m[1].trim().toLowerCase();
    const owner = owners.find(o=>o.toLowerCase()===nameRaw) ||
                  owners.find(o=>o.toLowerCase().startsWith(nameRaw)) ||
                  owners.find(o=>nameRaw.startsWith(o.toLowerCase())) || null;
    let taskIdx = -1;
    if(owner){
      const mine = TASKS.map((t,i)=>({t,i})).filter(({t})=>primaryOwners(t).includes(owner)&&t.status!=='completed');
      /* score tasks by word overlap with the note */
      const words = m[2].toLowerCase().split(/\W+/).filter(w=>w.length>3);
      let best=null,bestScore=0;
      mine.forEach(({t,i})=>{
        const title=t.title.toLowerCase();
        const score=words.filter(w=>title.includes(w)).length;
        if(score>bestScore){bestScore=score;best=i;}
      });
      taskIdx = best!==null?best:(mine.length?mine[0].i:-1);
    }
    MP.push({owner, text:m[2].trim(), taskIdx});
  });
  const activeOptions = TASKS.map((t,i)=>({t,i})).filter(({t})=>t.status!=='completed');
  document.getElementById('mpPreview').innerHTML = '<div class="minutes-preview">'+MP.map((p,pi)=>{
    if(!p.owner) return `<div class="mp-item"><span class="mp-owner" style="color:var(--text3)">?</span><span class="mp-text" style="color:var(--text3)">${esc(p.text)} <i>(no owner matched — will be skipped, or pick a task)</i></span>
      <select onchange="MP[${pi}].taskIdx=+this.value"><option value="-1">skip</option>${activeOptions.map(({t,i})=>`<option value="${i}">${esc(t.title.substring(0,40))}</option>`).join('')}</select></div>`;
    return `<div class="mp-item"><span class="mp-owner">${esc(p.owner)}</span><span class="mp-text">${esc(p.text)}</span>
      <select onchange="MP[${pi}].taskIdx=+this.value">${activeOptions.map(({t,i})=>`<option value="${i}" ${i===p.taskIdx?'selected':''}>${esc(t.title.substring(0,40))}</option>`).join('')}<option value="-1">skip</option></select></div>`;
  }).join('')+'</div>';
  document.getElementById('modalOk').textContent='✓ Apply '+MP.filter(p=>p.taskIdx>=0).length+' updates';
}
function applyMinutes(){
  let n=0;
  const affected=MP.filter(p=>p.taskIdx>=0).map(p=>({i:p.taskIdx,c:taskFields(TASKS[p.taskIdx])}));
  if(affected.length){
    UNDO_STACK.push({label:'minutes ('+affected.length+' tasks)', undo(){ affected.forEach(a=>{Object.assign(TASKS[a.i],a.c);reindexTask(TASKS[a.i]);}); }});
    if(UNDO_STACK.length>30) UNDO_STACK.shift();
  }
  MP.forEach(p=>{
    if(p.taskIdx<0) return;
    const t=TASKS[p.taskIdx];
    t.update=(t.update?t.update+'\n':'')+todayStr()+': '+p.text;
    reindexTask(t); n++;
  });
  rebuildEntries(); setDirty(true);
  logEdit('📝','Meeting minutes', n+' update(s) applied from pasted minutes');
  renderAll();
  closeModal(); MP=[];
  toast(n+' updates applied with today\'s date ✓');
}

/* ---------- WEEKLY REPORT ---------- */
function generateWeeklyReport(){
  const fp=(document.getElementById('repProject')||{value:''}).value;
  const Tk=fp?TASKS.filter(t=>t.sheet===fp):TASKS;
  const En=fp?ENTRIES.filter(e=>e.task.sheet===fp):ENTRIES;
  const now=new Date(); now.setHours(0,0,0,0);
  const weekAgo=new Date(now); weekAgo.setDate(weekAgo.getDate()-7);
  const inWeek=d=>d&&d>=weekAgo;
  const doneThisWeek=Tk.filter(t=>t.status==='completed'&&inWeek(t.lastDate));
  const newThisWeek=Tk.filter(t=>{
    const first=t.entries.filter(e=>e.date).sort((a,b)=>a.date-b.date)[0];
    return first&&inWeek(first.date);
  });
  const breached=Tk.filter(etaBreached);
  const updatesThisWeek=En.filter(e=>inWeek(e.date));
  let r='';
  r+='WEEKLY STATUS · TSAT / BY PROGRAM'+(fp?' · '+fp:'')+'\n';
  r+='Week ending '+todayStr()+' · To: Mohit\n'+bar('━',52)+'\n\n';
  r+='EXECUTIVE SUMMARY\n'+bar('─',48)+'\n';
  r+=`• ${doneThisWeek.length} task(s) completed this week\n`;
  r+=`• ${updatesThisWeek.length} update(s) logged by the team\n`;
  r+=`• ${newThisWeek.length} new item(s) started\n`;
  r+=`• ${breached.length} task(s) past ETA${breached.length?' — needs attention':''}\n`;
  const tix=TICKETS.filter(t=>t.status!=='completed');
  r+=`• ${tix.length} OneIT ticket(s) open\n\n`;
  r+='PROGRESS BY PROJECT\n'+bar('─',48)+'\n';
  [...new Set(Tk.map(t=>t.sheet))].forEach(sh=>{
    const T=Tk.filter(t=>t.sheet===sh);
    const d=T.filter(t=>t.status==='completed').length;
    const pct=T.length?Math.round(d/T.length*100):0;
    const wk=updatesThisWeek.filter(e=>e.task.sheet===sh).length;
    const h=projectHealth(sh);
    r+=`• [${ragLabel(h.rag)}] ${sh}: ${pct}% complete (${d}/${T.length}) · ${wk} update(s) this week${h.rag!=='g'?' · '+h.reasons:''}\n`;
  });
  if(PLAN.length){
    r+='\nPLAN / PHASE STATUS\n'+bar('─',48)+'\n';
    [...new Set(PLAN.map(p=>p.project))].forEach(pr=>{
      const ph=PLAN.filter(p=>p.project===pr);
      const active=ph.find(p=>phaseState(p)==='ontrack'||phaseState(p)==='late');
      const late=ph.filter(p=>phaseState(p)==='late');
      r+=`• ${pr}: current phase "${active?active.phase:'—'}"${late.length?' · ⚠ '+late.length+' phase(s) delayed':''}\n`;
    });
  }
  if(doneThisWeek.length){
    r+='\nCOMPLETED THIS WEEK\n'+bar('─',48)+'\n';
    doneThisWeek.forEach(t=>r+=`✔ ${t.title} [${t.owner}]\n`);
  }
  if(breached.length){
    r+='\nATTENTION REQUIRED — PAST ETA\n'+bar('─',48)+'\n';
    breached.forEach(t=>r+=`🚨 ${t.title} [${t.owner}] — was due ${t.eta}\n   ${lastLine(t.update)}\n`);
  }
  const holds=Tk.filter(t=>t.status==='hold');
  if(holds.length){
    r+='\nBLOCKED / DEPENDENCIES\n'+bar('─',48)+'\n';
    holds.forEach(t=>r+=`⏸ ${t.title} — ${firstLine(t.update)||'reason not recorded'}\n`);
  }
  if(tix.length){
    r+='\nOPEN SERVICE TICKETS\n'+bar('─',48)+'\n';
    tix.forEach(t=>r+=`• #${t.ref} — ${t.subject}\n`);
  }
  r+='\nNEXT WEEK FOCUS\n'+bar('─',48)+'\n';
  const upcoming=Tk.filter(t=>{const d=parseETA(t.eta);return d&&d>=now&&d<=new Date(now.getTime()+7*864e5)&&t.status!=='completed';});
  r+=upcoming.length?upcoming.map(t=>`• ${t.title} [${t.owner}] — due ${t.eta}`).join('\n')+'\n':'• (no ETAs falling due next week — review plan)\n';
  document.getElementById('weeklyReport').textContent=r;
  toast('Weekly report generated ✓');
}

/* ---------- AUTO-REFRESH & ALERTS ---------- */
let arTimer=null;
function setAutoRefresh(mins){
  mins=+mins;
  try{localStorage.setItem('sccp_autorefresh',mins);}catch(e){}
  clearInterval(arTimer); arTimer=null;
  if(!mins){toast('Auto-refresh off');return;}
  if(!FSAPI){toast('Auto-refresh needs Chrome/Edge with a connected file');return;}
  if('Notification' in window && Notification.permission==='default') Notification.requestPermission();
  arTimer=setInterval(async()=>{
    if(dirty){ return; } /* never overwrite unsaved edits */
    if(!fileHandle){ try{fileHandle=await idbGet('handle');}catch(e){} }
    if(!fileHandle) return;
    try{
      const perm=await fileHandle.queryPermission({mode:'read'});
      if(perm!=='granted') return; /* don't prompt in background */
      await loadFromHandle();
      notifyAlerts(true);
    }catch(e){}
  }, mins*60*1000);
  toast('Auto-refresh every '+mins+' min (skips while you have unsaved edits)');
}
function alertCounts(){
  const now=new Date(); now.setHours(0,0,0,0);
  const tomorrow=new Date(now); tomorrow.setDate(tomorrow.getDate()+1);
  const dueToday=TASKS.filter(t=>{const d=parseETA(t.eta);return d&&d.getTime()===now.getTime()&&t.status!=='completed';});
  const dueTomorrow=TASKS.filter(t=>{const d=parseETA(t.eta);return d&&d.getTime()===tomorrow.getTime()&&t.status!=='completed';});
  const breached=TASKS.filter(etaBreached);
  const stale=TASKS.filter(t=>(t.status==='inprogress'||t.status==='open')&&!updatedWithin(t,2));
  return {dueToday,dueTomorrow,breached,stale};
}
function notifyAlerts(fromAuto){
  const a=alertCounts();
  const parts=[];
  if(a.dueToday.length)parts.push(a.dueToday.length+' due today');
  if(a.dueTomorrow.length)parts.push(a.dueTomorrow.length+' due tomorrow');
  if(a.breached.length)parts.push(a.breached.length+' past ETA');
  if(a.stale.length)parts.push(a.stale.length+' stale');
  if(!parts.length) return;
  const msg='⚠ '+parts.join(' · ');
  toast(msg);
  if(fromAuto && 'Notification' in window && Notification.permission==='granted'){
    try{ new Notification('Scrum Command Center',{body:msg}); }catch(e){}
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  try{ AUTOWRITE = localStorage.getItem('sccp_autowrite')!=='0'; }catch(e){ AUTOWRITE=true; }
  const awb=document.getElementById('awBtn'); if(awb) awb.textContent='\u26a1 Auto-write: '+(AUTOWRITE?'ON':'OFF');
  let ar=0; try{ar=+localStorage.getItem('sccp_autorefresh')||0;}catch(e){}
  const sel=document.getElementById('autoRefreshSel');
  if(sel){ sel.value=String(ar); if(ar) setAutoRefresh(ar); }
  refreshRecentList();
  const ri=document.getElementById('restoreInput');
  if(ri) ri.addEventListener('change',e=>{ if(e.target.files.length) restoreJSON(e.target.files[0]); e.target.value=''; });
});

/* ---------- BACKUP / RESTORE ---------- */
function backupJSON(){
  const payload={
    app:'ScrumCommandCenterPro', version:1, savedAt:new Date().toISOString(), fname:currentFileName,
    tasks:TASKS.map(t=>({sheet:t.sheet,sl:t.sl,title:t.title,env:t.env,owner:t.owner,status:t.status,priority:t.priority,update:t.update,eta:t.eta})),
    plan:PLAN.map(p=>({project:p.project,phase:p.phase,start:p.start?fmtDate(p.start):'',end:p.end?fmtDate(p.end):'',progress:p.progress,status:p.status,owner:p.owner,milestone:p.milestone,notes:p.notes})),
    extraProjects:EXTRA_PROJECTS, tickets:TICKETS
  };
  const d=new Date(),a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,1)],{type:'application/json'}));
  a.download=`SCC_Backup_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.json`;a.click();
  toast('Backup downloaded — keep it safe (or move to another PC)');
}
function restoreJSON(file){
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const st=JSON.parse(e.target.result);
      if(st.app!=='ScrumCommandCenterPro'||!st.tasks){toast('Not a valid backup file');return;}
      hydrateState(st);
      setDirty(true);
      toast('Backup restored ('+(st.fname||'')+') — press 💾 Save to keep it');
    }catch(err){ toast('Restore failed: '+err.message); }
  };
  reader.readAsText(file);
}

/* ---------- CONFETTI ---------- */
function confetti(){
  const colors=['#2563eb','#8b5cf6','#16a34a','#ea8a0c','#dc2626','#0891b2','#e11d48'];
  for(let i=0;i<70;i++){
    const p=document.createElement('div');
    p.className='confetti-piece';
    p.style.left=Math.random()*100+'vw';
    p.style.background=colors[i%colors.length];
    p.style.animationDuration=(1+Math.random()*1.2)+'s';
    p.style.animationDelay=(Math.random()*.3)+'s';
    p.style.transform='rotate('+Math.random()*360+'deg)';
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),2600);
  }
}

/* ---------- RAG PROJECT HEALTH ---------- */
function projectHealth(sh){
  const T=TASKS.filter(t=>t.sheet===sh);
  const active=T.filter(t=>t.status==='inprogress'||t.status==='open');
  const breached=T.filter(etaBreached).length;
  const holds=T.filter(t=>t.status==='hold').length;
  const stale=active.filter(t=>!updatedWithin(t,2)).length;
  const staleRatio=active.length?stale/active.length:0;
  const planLate=PLAN.filter(p=>p.project===sh&&phaseState(p)==='late').length;
  const reasons=[];
  if(breached)reasons.push(breached+' past ETA');
  if(holds)reasons.push(holds+' on hold');
  if(stale)reasons.push(stale+' stale');
  if(planLate)reasons.push(planLate+' phase(s) delayed');
  let rag='g';
  if(breached>=2||planLate>=2||(breached&&holds)||staleRatio>0.6) rag='r';
  else if(breached||holds||planLate||staleRatio>0.3) rag='a';
  return {rag,reasons:reasons.length?reasons.join(' · '):'On track — no risks detected'};
}
function ragLabel(r){return r==='r'?'RED':r==='a'?'AMBER':'GREEN';}
function renderRAG(){
  const el=document.getElementById('ragRow'); if(!el)return;
  const sheets=[...new Set(TASKS.map(t=>t.sheet))];
  el.innerHTML='<div class="rag-grid">'+sheets.map(sh=>{
    const h=projectHealth(sh);
    return `<div class="rag-chip"><span class="rag-dot rag-${h.rag}"></span>
      <span style="flex:1"><span class="rag-name">${esc(sh)}</span><br><span class="rag-why">${esc(h.reasons)}</span></span>
      <span style="color:var(--blue)">${sparkSVG(sh,64,18)}</span></div>`;
  }).join('')+'</div>';
}

/* ---------- DAILY LOG EXPORTS ---------- */
function exportDailyXLSX(){
  const E=dailyFiltered().sort((a,b)=>b.date-a.date);
  if(!E.length){toast('Nothing to export with these filters');return;}
  const aoa=[['Date','Owner','Project','Task','Update']];
  E.forEach(e=>aoa.push([fmtDate(e.date),primaryOwners(e.task)[0]||e.task.owner,e.task.sheet,e.task.title,e.text]));
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:12},{wch:14},{wch:20},{wch:45},{wch:80}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Daily Log');
  const d=new Date();
  XLSX.writeFile(wb,`Daily_Log_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`);
}
function exportDailyPDF(){
  const E=dailyFiltered().sort((a,b)=>b.date-a.date);
  if(!E.length){toast('Nothing to export with these filters');return;}
  const doc=pdfDoc();
  doc.setFontSize(13);doc.setFont('helvetica','bold');
  doc.text('Daily Update Log · TSAT / BY Program · '+todayStr(),40,32);
  doc.autoTable({
    startY:46,
    head:[['Date','Owner','Project','Task','Update']],
    body:E.map(e=>[fmtDate(e.date),primaryOwners(e.task)[0]||e.task.owner,e.task.sheet.replace('SAP-',''),e.task.title.substring(0,55),e.text.substring(0,160)]),
    styles:{fontSize:6.5,cellPadding:3,overflow:'linebreak'},
    headStyles:{fillColor:[37,99,235],fontSize:7},
    columnStyles:{0:{cellWidth:52},1:{cellWidth:58},2:{cellWidth:70},3:{cellWidth:170},4:{cellWidth:'auto'}},
    alternateRowStyles:{fillColor:[246,248,251]}
  });
  const d=new Date();
  doc.save(`Daily_Log_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.pdf`);
}

/* ---------- RECENT FILES ---------- */
async function refreshRecentList(){
  const sel=document.getElementById('recentSel'); if(!sel)return;
  let list=[]; try{list=await idbGet('handles')||[];}catch(e){}
  sel.innerHTML='<option value="">Recent files ▾</option>'+list.map((h,i)=>`<option value="${i}">${esc(h.name)}</option>`).join('');
}
async function rememberHandle(h){
  let list=[]; try{list=await idbGet('handles')||[];}catch(e){}
  list=list.filter(x=>x.name!==h.name);
  list.unshift({name:h.name,handle:h});
  list=list.slice(0,3);
  try{await idbSet('handles',list);}catch(e){}
  refreshRecentList();
}
async function openRecent(idx){
  const sel=document.getElementById('recentSel');
  if(idx===''){return;}
  let list=[]; try{list=await idbGet('handles')||[];}catch(e){}
  const item=list[+idx]; sel.value='';
  if(!item){toast('File not found in recent list');return;}
  try{
    let perm=await item.handle.queryPermission({mode:'read'});
    if(perm!=='granted') perm=await item.handle.requestPermission({mode:'read'});
    if(perm!=='granted'){toast('Permission denied');return;}
    fileHandle=item.handle;
    await idbSet('handle',fileHandle);
    await loadFromHandle();
    toast('Switched to '+item.name+' ✓');
  }catch(e){toast('Could not open: '+e.message);}
}

/* ---------- GANTT PDF ---------- */
function exportGanttPDF(){
  const proj=currentPlanProject();
  const phases=PLAN.filter(p=>p.project===proj&&p.start&&p.end&&p.end>=p.start).sort((a,b)=>a.start-b.start);
  if(!phases.length){toast('No dated phases to export for this project');return;}
  const doc=pdfDoc(); /* landscape a4: 842 x 595 pt */
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
  const left=170, right=30, top=80, rowH=26;
  let min=new Date(Math.min(...phases.map(p=>p.start))), max=new Date(Math.max(...phases.map(p=>p.end)));
  min.setDate(min.getDate()-2); max.setDate(max.getDate()+3);
  const span=(max-min)/864e5;
  const dayPt=(W-left-right)/span;
  const x=d=>left+((d-min)/864e5)*dayPt;
  doc.setFont('helvetica','bold');doc.setFontSize(15);
  doc.text('Project Plan — '+proj,30,32);
  doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(110);
  doc.text('Generated '+todayStr()+' · Scrum Command Center',30,46);
  doc.setTextColor(0);
  /* month scale */
  doc.setFontSize(8);doc.setDrawColor(200);
  let mCur=new Date(min.getFullYear(),min.getMonth(),1);
  while(mCur<=max){
    const mx=Math.max(left,x(mCur));
    doc.line(mx,top-14,mx,top+phases.length*rowH);
    doc.text(mCur.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),mx+3,top-17);
    mCur=new Date(mCur.getFullYear(),mCur.getMonth()+1,1);
  }
  /* today line */
  const today=new Date();today.setHours(0,0,0,0);
  if(today>=min&&today<=max){
    doc.setDrawColor(220,38,38);doc.setLineWidth(1);
    doc.line(x(today),top-10,x(today),top+phases.length*rowH);
    doc.setTextColor(220,38,38);doc.setFontSize(7);
    doc.text('today',x(today)+2,top-4);
    doc.setTextColor(0);doc.setLineWidth(.5);
  }
  const colors={done:[22,163,74],late:[220,38,38],hold:[234,138,12],ontrack:[37,99,235]};
  phases.forEach((p,i)=>{
    const y=top+i*rowH;
    doc.setFontSize(8.5);doc.setFont('helvetica','bold');
    doc.text((p.milestone?'◆ ':'')+p.phase.substring(0,30),30,y+11);
    doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(120);
    doc.text(fmtDate(p.start)+' → '+fmtDate(p.end)+(p.owner?' · '+p.owner:''),30,y+19);
    doc.setTextColor(0);
    const st=phaseState(p), c=colors[st];
    const bx=x(p.start), bw=Math.max(6,x(p.end)-x(p.start)+dayPt);
    if(p.milestone){
      doc.setFillColor(139,92,246);
      const cx=bx+bw/2, cy=y+11;
      doc.triangle(cx,cy-6,cx+6,cy,cx,cy+6,'F');
      doc.triangle(cx,cy-6,cx-6,cy,cx,cy+6,'F');
    } else {
      doc.setFillColor(235,238,245);
      doc.roundedRect(bx,y+4,bw,14,3,3,'F');
      doc.setFillColor(c[0],c[1],c[2]);
      if(p.progress>0) doc.roundedRect(bx,y+4,Math.max(4,bw*p.progress/100),14,3,3,'F');
      doc.setDrawColor(c[0],c[1],c[2]);
      doc.roundedRect(bx,y+4,bw,14,3,3,'S');
      doc.setFontSize(7);doc.setTextColor(60);
      doc.text(p.progress+'%',bx+bw+4,y+13);
      doc.setTextColor(0);
    }
  });
  /* legend */
  const ly=top+phases.length*rowH+22;
  doc.setFontSize(7.5);
  const leg=[['On track',colors.ontrack],['Delayed',colors.late],['On hold',colors.hold],['Done',colors.done]];
  let lx=30;
  leg.forEach(([lab,c])=>{
    doc.setFillColor(c[0],c[1],c[2]);doc.rect(lx,ly-6,9,7,'F');
    doc.text(lab,lx+13,ly);lx+=70;
  });
  doc.setFillColor(139,92,246);const cx2=lx+4;doc.triangle(cx2,ly-7,cx2+5,ly-3,cx2,ly+1,'F');doc.triangle(cx2,ly-7,cx2-5,ly-3,cx2,ly+1,'F');
  doc.text('Milestone',lx+13,ly);
  const d=new Date();
  doc.save(`Gantt_${proj.replace(/[^\w]+/g,'_')}_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.pdf`);
}

/* ---------- DEMO MODE ---------- */
function loadDemo(){
  const today=new Date(); today.setHours(0,0,0,0);
  const dstr=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+d.getFullYear();};
  const mkUpd=arr=>arr.map(([off,txt])=>dstr(off)+': '+txt).join('\n');
  TASKS=[
    {sheet:'Project Alpha',sl:'1',title:'Interface design for order flow',env:'DEV',owner:'Arun',status:'inprogress',priority:'high',update:mkUpd([[-4,'Draft mapping shared for review'],[-1,'Review comments incorporated, final draft ready']]),eta:dstr(3)},
    {sheet:'Project Alpha',sl:'2',title:'Adapter installation on QA server',env:'QA',owner:'Bhavna',status:'hold',priority:'',update:mkUpd([[-6,'Waiting for vendor license key']]),eta:'TBD'},
    {sheet:'Project Alpha',sl:'3',title:'Unit testing of message flows',env:'DEV',owner:'Chetan',status:'open',priority:'medium',update:'',eta:dstr(7)},
    {sheet:'Project Alpha',sl:'4',title:'Legacy data migration script',env:'DEV',owner:'Arun',status:'completed',priority:'',update:mkUpd([[-8,'Script developed'],[-2,'Migration verified, task closed']]),eta:dstr(-2)},
    {sheet:'Project Beta',sl:'1',title:'Workshop with client on requirements',env:'',owner:'Deepa',status:'inprogress',priority:'high',update:mkUpd([[-1,'Day-1 workshop completed, notes circulated'],[0,'Day-2 sessions ongoing']]),eta:dstr(1)},
    {sheet:'Project Beta',sl:'2',title:'Environment sizing proposal',env:'PROD',owner:'Eshan',status:'open',priority:'high',update:mkUpd([[-5,'Awaiting volumetrics from client']]),eta:dstr(-1)},
    {sheet:'Project Beta',sl:'3',title:'Security review checklist',env:'',owner:'Farah',status:'inprogress',priority:'',update:mkUpd([[0,'Checklist 60% complete']]),eta:dstr(5)},
    {sheet:'Support Ops',sl:'1',title:'Monthly server patching',env:'PROD',owner:'Gopal',status:'recurring',priority:'',update:mkUpd([[-3,'August patching completed without issues']]),eta:''},
    {sheet:'Support Ops',sl:'2',title:'Monitoring alerts fine-tuning',env:'PROD',owner:'Gopal',status:'inprogress',priority:'medium',update:mkUpd([[-2,'Threshold changes deployed'],[0,'Observing alert volumes']]),eta:dstr(4)},
    {sheet:'Support Ops',sl:'3',title:'DR drill preparation',env:'DR',owner:'Harini',status:'open',priority:'high',update:'',eta:dstr(10)}
  ];
  TASKS.forEach(reindexTask);
  TICKETS=[
    {ref:'100234',subject:'Firewall port opening request',status:'inprogress',date:dstr(-2),remarks:''},
    {ref:'100198',subject:'Service account password reset',status:'completed',date:dstr(-6),remarks:'Closed by IT'}
  ];
  PLAN=[
    {project:'Project Alpha',phase:'Requirements & Design',start:parseETA(dstr(-20)),end:parseETA(dstr(-8)),progress:100,status:'completed',owner:'Arun',milestone:false,notes:''},
    {project:'Project Alpha',phase:'Development',start:parseETA(dstr(-7)),end:parseETA(dstr(10)),progress:55,status:'ontrack',owner:'Arun',milestone:false,notes:''},
    {project:'Project Alpha',phase:'SIT Testing',start:parseETA(dstr(11)),end:parseETA(dstr(20)),progress:0,status:'ontrack',owner:'Chetan',milestone:false,notes:''},
    {project:'Project Alpha',phase:'Go-Live',start:parseETA(dstr(28)),end:parseETA(dstr(28)),progress:0,status:'ontrack',owner:'',milestone:true,notes:''},
    {project:'Project Beta',phase:'Discovery Workshops',start:parseETA(dstr(-3)),end:parseETA(dstr(4)),progress:40,status:'ontrack',owner:'Deepa',milestone:false,notes:''},
    {project:'Project Beta',phase:'Solution Design',start:parseETA(dstr(5)),end:parseETA(dstr(18)),progress:0,status:'ontrack',owner:'Eshan',milestone:false,notes:''}
  ];
  EXTRA_PROJECTS=[]; CHANGES=null; rebuildEntries();
  currentFileName='🎭 DEMO DATA (fictional)';
  fileHandle=null; setDirty(false);
  showMain(false); populateFilters(); renderAll();
  toast('Demo data loaded — safe to screen-share. Load a real file anytime.');
}


/* ---------- INVENTORY (baked from Inventory_Details_Final.xlsx, credentials excluded) ---------- */
const INVENTORY = []; /* hosted copy: server inventory removed — nothing environment-specific is published */
function envClass(e){
  e=(e||'').toLowerCase();
  if(e.includes('prod'))return 'prod';
  if(e.includes('qa')||e.includes('sit'))return 'qa';
  if(e.includes('dev'))return 'dev';
  return 'other';
}
function invIcon(label){
  const l=label.toLowerCase();
  if(l.includes('mws')||l.includes('webmethods'))return '🖥';
  if(l.includes('integration server')||l.includes('admin'))return '⚙️';
  if(l.includes('b2b'))return '🔄';
  if(l.includes('cce'))return '🎛';
  return '🌐';
}
let invEnvFilter='';
function pickInvEnv(e){invEnvFilter=e;renderInventory();}
function renderInventory(){
  const tilesEl=document.getElementById('invTiles'); if(!tilesEl)return;
  const q=(document.getElementById('invSearch').value||'').toLowerCase();
  const envs=[...new Set(INVENTORY.map(x=>x.env))];
  document.getElementById('invEnvChips').innerHTML =
    `<button class="date-chip ${invEnvFilter===''?'active':''}" onclick="pickInvEnv('')">All environments</button>`+
    envs.map(e=>`<button class="date-chip ${invEnvFilter===e?'active':''}" onclick="pickInvEnv('${esc(e)}')">${esc(e)}</button>`).join('');
  const items=INVENTORY.filter(x=>{
    if(invEnvFilter&&x.env!==invEnvFilter)return false;
    if(q&&!(x.label+' '+x.vm+' '+x.ip+' '+x.app+' '+x.env).toLowerCase().includes(q))return false;
    return true;
  });
  document.getElementById('invCount').textContent=items.length+' consoles';
  if(!items.length){tilesEl.innerHTML=emptyState('🖥','No consoles match.');return;}
  const byEnv={};
  items.forEach(x=>{(byEnv[x.env]=byEnv[x.env]||[]).push(x);});
  tilesEl.innerHTML=Object.keys(byEnv).map(env=>{
    const cls=envClass(env);
    return `<div class="inv-env-hdr"><span class="env-dot env-${cls}"></span>${esc(env)} <span class="count-chip">${byEnv[env].length}</span></div>
    <div class="inv-grid">`+byEnv[env].map(x=>{
      const primary=x.https||x.http;
      return `<div class="inv-tile tile-${cls}" onclick="window.open('${esc(primary)}','_blank')" title="${esc(primary)}">
        <span class="it-open">↗</span>
        <div class="it-icon">${invIcon(x.label)}</div>
        <div class="it-label">${esc(x.label)}</div>
        <div class="it-meta"><b>${esc(x.vm)}</b>${x.ip?' · '+esc(x.ip):''}${x.app?'<br>'+esc(x.app)+' · '+esc(x.env):''}</div>
        <div class="it-links">
          ${x.https?`<span class="it-chip sec" onclick="event.stopPropagation();window.open('${esc(x.https)}','_blank')">🔒 HTTPS</span>`:''}
          ${x.http?`<span class="it-chip" onclick="event.stopPropagation();window.open('${esc(x.http)}','_blank')">HTTP</span>`:''}
        </div>
      </div>`;
    }).join('')+'</div>';
  }).join('');
}
document.addEventListener('DOMContentLoaded',renderInventory);

/* ---------- NEW TASK PAGE ---------- */
let NT_RECENT=[];
function markInvalid(id, bad){
  const el=document.getElementById(id);
  if(el) el.classList.toggle('invalid', !!bad);
  return !bad;
}
function createTaskFromPage(){
  const proj=document.getElementById('ntProject').value;
  const owner=document.getElementById('ntOwner').value.trim();
  const title=document.getElementById('ntTitle').value.trim();
  const env=document.getElementById('ntEnv').value;
  const status=document.getElementById('ntStatus').value;
  const prio=document.getElementById('ntPrio').value;
  const tbd=document.getElementById('ntTbd').checked;
  const eta=tbd?'TBD':isoToDMY(document.getElementById('ntEta').value);
  const upd=document.getElementById('ntUpd').value.trim();
  let ok=true;
  ok = markInvalid('ntProject', !proj) && ok;
  ok = markInvalid('ntOwner', !owner) && ok;
  ok = markInvalid('ntTitle', !title) && ok;
  if(!ok){ toast('Fill the required fields: Project, Person, Title'); return; }
  markInvalid('ntEta', false); /* native date picker guarantees a valid date */
  const t={sheet:proj, sl:'', title, env, owner, status, priority:prio,
    update: upd ? todayStr()+': '+upd : (todayStr()+': Task created'), eta};
  pushCreateUndo('create \u201c'+title.substring(0,35)+'\u2026\u201d');
  reindexTask(t); TASKS.push(t); rebuildEntries();
  markEdited();
  logEdit('\u2795', title, 'New task in '+proj+' for '+owner);
  NT_RECENT.unshift({title, proj, owner, at:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})});
  renderNTRecent();
  populateFilters();
  renderExplorer(); renderKanban(); renderTeam(); renderCharts(); renderGrid(); renderDaily(); renderRAG();
  /* keep project & owner for rapid multi-add; clear the rest */
  document.getElementById('ntTitle').value='';
  document.getElementById('ntUpd').value='';
  document.getElementById('ntEta').value='';
  toast('\u2713 Task created in '+proj+' \u2014 add another or \uD83D\uDCBE Save');
  document.getElementById('ntTitle').focus();
}
function clearTaskForm(){
  ['ntOwner','ntTitle','ntEta','ntUpd'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';el.classList.remove('invalid');}});
  ['ntEnv','ntPrio'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const st=document.getElementById('ntStatus'); if(st)st.value='open';
  const tb=document.getElementById('ntTbd'); if(tb){tb.checked=false;}
  const de=document.getElementById('ntEta'); if(de){de.disabled=false;}
}
function renderNTRecent(){
  const el=document.getElementById('ntRecent'); if(!el)return;
  document.getElementById('ntRecentCount').textContent=NT_RECENT.length;
  if(!NT_RECENT.length) return;
  el.innerHTML=NT_RECENT.map(n=>`<div class="nt-item">
    <span class="avatar" style="background:${ownerColor(n.owner)}">${initials(n.owner)}</span>
    <span class="nt-t">${esc(n.title)}<br><span class="nt-meta">${esc(n.proj)} \u00b7 ${esc(n.owner)} \u00b7 ${n.at}</span></span>
    <span class="sheet-chip">new</span></div>`).join('');
}

/* ---------- FONT SCALE ---------- */
const SCALES=[0.9,1,1.15,1.3];
let scaleIdx=1;
function applyScale(){ document.body.style.zoom=SCALES[scaleIdx]; try{localStorage.setItem('sccp_scale',scaleIdx);}catch(e){} }
function fontScale(dir){
  scaleIdx=Math.max(0,Math.min(SCALES.length-1,scaleIdx+dir));
  applyScale();
  toast('Interface size: '+Math.round(SCALES[scaleIdx]*100)+'%');
}

/* ---------- COUNT-UP ---------- */
function animateCount(el, target){
  const raf=window.requestAnimationFrame||function(f){setTimeout(f,16)};
  const dur=550, t0=performance&&performance.now?performance.now():Date.now();
  function step(now){
    const t=Math.min(1,((now||Date.now())-t0)/dur);
    const eased=1-Math.pow(1-t,3);
    el.textContent=Math.round(target*eased);
    if(t<1) raf(step);
  }
  raf(step);
}

/* ---------- SPARKLINES ---------- */
function sparkCounts(project, days){
  const out=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
    const k=dateKey(d);
    out.push(ENTRIES.filter(e=>e.key===k&&(!project||e.task.sheet===project)).length);
  }
  return out;
}
function sparkSVG(project, w, h){
  w=w||70; h=h||18;
  const c=sparkCounts(project,7);
  const max=Math.max(1,...c);
  const pts=c.map((v,i)=>( (i/(c.length-1))*(w-4)+2 )+','+( h-2-(v/max)*(h-6) )).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function ragDotHTML(project){
  const h=projectHealth(project);
  return `<span class="rag-mini rag-${h.rag}" title="${ragLabel(h.rag)}: ${esc(h.reasons)}"></span>`;
}

/* ---------- WALL MODE ---------- */
let WALL={clock:null,rotate:null,spotIdx:0,active:false};
function startWall(){
  if(!TASKS.length){toast('Load a tracker (or demo data) first');return;}
  WALL.active=true; WALL.spotIdx=0;
  document.getElementById('wallOverlay').classList.remove('hidden');
  wallRender();
  WALL.clock=setInterval(wallClock,1000); wallClock();
  WALL.rotate=setInterval(()=>{WALL.spotIdx++;wallSpot();},15000);
}
function stopWall(){
  WALL.active=false;
  clearInterval(WALL.clock); clearInterval(WALL.rotate);
  document.getElementById('wallOverlay').classList.add('hidden');
}
function wallClock(){
  const n=new Date();
  document.getElementById('wallClock').textContent=pad(n.getHours())+':'+pad(n.getMinutes())+':'+pad(n.getSeconds());
  document.getElementById('wallDate').textContent=n.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function wallRender(){
  const c=counts();
  const breached=TASKS.filter(etaBreached).length;
  const fresh=TASKS.filter(t=>updatedWithin(t,0)).length;
  const kpis=[
    {v:c.total,l:'Total Tasks',cls:''},
    {v:c.inprogress,l:'In Progress',cls:'wk-blue'},
    {v:c.open,l:'Open',cls:'wk-amber'},
    {v:c.completed,l:'Completed',cls:'wk-green'},
    {v:breached,l:'Past ETA',cls:breached?'wk-red':'wk-green'},
    {v:fresh,l:'Updated Today',cls:'wk-green'}
  ];
  document.getElementById('wallKpis').innerHTML=kpis.map(k=>
    `<div class="wall-kpi ${k.cls}"><div class="wk-val" data-n="${k.v}">0</div><div class="wk-lbl">${k.l}</div></div>`).join('');
  document.querySelectorAll('#wallKpis .wk-val').forEach(el=>animateCount(el,+el.dataset.n));
  /* RAG tiles */
  const projs=[...new Set(TASKS.map(t=>t.sheet))];
  document.getElementById('wallRag').innerHTML=projs.map(p=>{
    const h=projectHealth(p);
    const T=TASKS.filter(t=>t.sheet===p);
    const done=T.filter(t=>t.status==='completed').length;
    const pct=T.length?Math.round(done/T.length*100):0;
    const cls=h.rag==='r'?'wr':h.rag==='a'?'wa':'wg';
    return `<div class="wall-tile ${cls}">
      <div class="wt-name">${esc(p)}</div>
      <span class="wt-rag">${ragLabel(h.rag)}</span>
      <div class="wt-why">${esc(h.reasons)}</div>
      <div class="wt-bar"><div class="wt-fill" style="width:${pct}%"></div></div>
      <div class="wt-spark">${sparkSVG(p,110,20)} <span style="font-size:11px;color:#9db3dd">7-day activity · ${pct}% done</span></div>
    </div>`;
  }).join('');
  wallSpot();
  /* ticker: today's updates */
  const todayKey=dateKey(new Date());
  const todays=ENTRIES.filter(e=>e.key===todayKey);
  const items=todays.length?todays.map(e=>`<b>${esc(primaryOwners(e.task)[0]||e.task.owner)}</b> · ${esc(e.task.title.substring(0,45))}: ${esc(e.text.substring(0,90))}`)
    :['No updates logged today yet — the board is waiting for the team'];
  document.getElementById('wallTicker').innerHTML=items.join('<span class="tk-sep">◆</span>');
}
function wallSpot(){
  const projs=[...new Set(TASKS.map(t=>t.sheet))];
  if(!projs.length)return;
  const p=projs[WALL.spotIdx%projs.length];
  const T=TASKS.filter(t=>t.sheet===p&&t.status!=='completed');
  const blocked=T.filter(t=>t.status==='hold');
  const late=T.filter(etaBreached);
  const todayKey=dateKey(new Date());
  const todays=ENTRIES.filter(e=>e.key===todayKey&&e.task.sheet===p).slice(0,3);
  const dots=projs.map((_,i)=>`<span class="${i===WALL.spotIdx%projs.length?'on':''}"></span>`).join('');
  let rows='';
  blocked.forEach(t=>rows+=`<div class="ws-item"><span class="ws-flag" style="color:#f87171">⏸</span><b>${esc(t.title.substring(0,60))}</b><div class="ws-sub">${esc(t.owner)} · ${esc(firstLine(t.update)||'no reason recorded')}</div></div>`);
  late.forEach(t=>rows+=`<div class="ws-item"><span class="ws-flag" style="color:#fbbf24">🚨</span><b>${esc(t.title.substring(0,60))}</b><div class="ws-sub">${esc(t.owner)} · was due ${esc(t.eta)}</div></div>`);
  todays.forEach(e=>rows+=`<div class="ws-item"><span class="ws-flag" style="color:#4ade80">🟢</span><b>${esc(primaryOwners(e.task)[0]||e.task.owner)}</b>: ${esc(e.text.substring(0,110))}</div>`);
  if(!rows) rows='<div class="ws-item"><span class="ws-flag" style="color:#4ade80">✓</span>Nothing blocked, nothing overdue — smooth sailing.</div>';
  document.getElementById('wallSpot').innerHTML=
    `<div class="ws-hdr"><span>Project Spotlight</span><span class="wall-dots">${dots}</span></div>
     <div class="ws-proj">${ragDotHTML(p)} ${esc(p)}</div>${rows}`;
}

/* ---------- UNDO ---------- */
let UNDO_STACK=[];
function taskFields(t){return {sheet:t.sheet,sl:t.sl,title:t.title,env:t.env,owner:t.owner,status:t.status,priority:t.priority,update:t.update,eta:t.eta};}
function pushTaskUndo(label, idx){
  const c=taskFields(TASKS[idx]);
  UNDO_STACK.push({label, undo(){ Object.assign(TASKS[idx], c); reindexTask(TASKS[idx]); }});
  if(UNDO_STACK.length>30) UNDO_STACK.shift();
}
function pushCreateUndo(label){
  const at=TASKS.length; /* the task about to be pushed lands at this index */
  UNDO_STACK.push({label, undo(){ TASKS.splice(at,1); }});
  if(UNDO_STACK.length>30) UNDO_STACK.shift();
}
function undoLast(){
  const e=UNDO_STACK.pop();
  if(!e){ toast('Nothing to undo'); return; }
  e.undo();
  rebuildEntries(); setDirty(true);
  renderAll();
  toast('\u21a9 Undid: '+e.label);
}

/* ---------- KEYBOARD SHORTCUTS ---------- */
function isHiddenEl(id){ const el=document.getElementById(id); return !el||!el.classList||!el.classList.contains||el.classList.contains('hidden'); }
function hotkeys(e){
  const tag=(e.target&&e.target.tagName||'').toLowerCase();
  const typing = tag==='input'||tag==='textarea'||tag==='select'||(e.target&&e.target.isContentEditable);
  if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='z'&&!typing){ e.preventDefault(); undoLast(); return; }
  if(typing||e.ctrlKey||e.metaKey||e.altKey) return;
  if(isHiddenEl('mainView')) return;
  if(!isHiddenEl('modalBackdrop')) return;
  if(typeof WALL!=='undefined'&&WALL.active){ if(String(e.key).toLowerCase()==='w') stopWall(); return; }
  if(typeof LS!=='undefined'&&LS.timer&&!isHiddenEl('lsOverlay')) return;
  const k=String(e.key).toLowerCase();
  if(k==='r'){ refreshFile(); }
  else if(k==='n'){ gotoNewTask(); }
  else if(k==='w'){ startWall(); }
  else if(k==='/'){ e.preventDefault(); const g=document.getElementById('globalSearch'); if(g) g.focus(); }
  else if(/^[1-9]$/.test(k)){
    const btns=document.querySelectorAll('#mainNav button');
    const b=btns[+k-1]; if(b) showTab(b);
  }
}

/* ---------- GLOBAL SEARCH ---------- */
let GS_RES=[];
function showTabId(id){
  const btn=document.querySelector('#mainNav button[data-tab="'+id+'"]');
  if(btn&&btn.dataset&&btn.dataset.tab) showTab(btn);
}
function gsHide(){ const d=document.getElementById('gsResults'); if(d)d.classList.add('hidden'); }
function gsGo(n){
  const r=GS_RES[n]; if(!r) return;
  r.go(); gsHide();
  const g=document.getElementById('globalSearch'); if(g) g.value='';
}
function gsRun(){
  const g=document.getElementById('globalSearch'); if(!g) return;
  const q=g.value.trim().toLowerCase();
  const drop=document.getElementById('gsResults');
  if(q.length<2){ drop.classList.add('hidden'); return; }
  GS_RES=[];
  TASKS.forEach((t,i)=>{
    if(GS_RES.length>=8) return;
    if((t.title+' '+t.owner+' '+t.update+' '+t.sheet).toLowerCase().includes(q)){
      GS_RES.push({icon:'\ud83d\udccc', main:t.title.substring(0,70), sub:t.sheet+' \u00b7 '+t.owner+' \u00b7 '+t.status,
        go:()=>{ showTabId('tab-explorer'); const s=document.getElementById('exSearch'); if(s){s.value=q;} const p=document.getElementById('exProject'); if(p)p.value=''; renderExplorer(); }});
    }
  });
  TICKETS.forEach(t=>{
    if(GS_RES.length>=11) return;
    if((t.ref+' '+t.subject).toLowerCase().includes(q)){
      GS_RES.push({icon:'\ud83c\udfab', main:'#'+t.ref+' '+t.subject.substring(0,60), sub:'Ticket \u00b7 '+t.status,
        go:()=>showTabId('tab-tickets')});
    }
  });
  PLAN.forEach(p=>{
    if(GS_RES.length>=14) return;
    if((p.project+' '+p.phase+' '+(p.owner||'')).toLowerCase().includes(q)){
      GS_RES.push({icon:'\ud83d\udcca', main:p.phase+' \u2014 '+p.project, sub:'Plan phase \u00b7 '+(p.start?fmtDate(p.start):'no date')+' \u2192 '+(p.end?fmtDate(p.end):''),
        go:()=>{ showTabId('tab-plan'); const s=document.getElementById('planProject'); if(s){s.value=p.project;} renderPlan(); }});
    }
  });
  drop.innerHTML = GS_RES.length
    ? GS_RES.map((r,n)=>`<div class="gs-item" onmousedown="gsGo(${n})"><span class="gs-ic">${r.icon}</span><span><div class="gs-main">${esc(r.main)}</div><div class="gs-sub">${esc(r.sub)}</div></span></div>`).join('')
    : '<div class="gs-empty">No matches for \u201c'+esc(q)+'\u201d</div>';
  drop.classList.remove('hidden');
}
document.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('keydown',hotkeys);
  const g=document.getElementById('globalSearch');
  if(g){
    g.addEventListener('input',gsRun);
    g.addEventListener('focus',gsRun);
    g.addEventListener('blur',()=>setTimeout(gsHide,200));
    g.addEventListener('keydown',e=>{ if(e.key==='Escape'){gsHide();g.blur();} if(e.key==='Enter'&&GS_RES.length){gsGo(0);} });
  }
});

/* ---------- WRITE-BACK CONFLICT DETECTION ---------- */
function parseTasksLight(wb){
  const out=[];
  wb.SheetNames.forEach(name=>{
    if(name==='Summary'||name==='Instructions'||name==='Project_Plan') return;
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''});
    if(!rows.length) return;
    let hIdx=-1;
    for(let i=0;i<Math.min(rows.length,5);i++){
      const j=rows[i].map(c=>String(c).toLowerCase()).join('|');
      if(j.includes('activity')||j.includes('subject')){hIdx=i;break;}
    }
    if(hIdx===-1) return;
    if(String(rows[hIdx].join('|')).toLowerCase().includes('oneit')) return; /* tickets: skip for conflict check */
    const cols={};
    rows[hIdx].forEach((h,ci)=>{
      const hl=String(h).toLowerCase();
      if(hl.includes('activity')||hl.includes('subject'))cols.title=ci;
      else if(hl.includes('owner'))cols.owner=ci;
      else if(hl.includes('status'))cols.status=ci;
      else if(hl.includes('blocker')||hl.includes('remark'))cols.update=ci;
    });
    for(let i=hIdx+1;i<rows.length;i++){
      const r=rows[i];
      const title=cols.title!==undefined?String(r[cols.title]||'').trim():'';
      const upd=cols.update!==undefined?String(r[cols.update]||'').trim():'';
      if(!title&&!upd) continue;
      out.push({sheet:name,title:title||'(untitled)',owner:cols.owner!==undefined?String(r[cols.owner]||'').trim()||'\u2014':'\u2014',
        status:normStatus(cols.status!==undefined?r[cols.status]:''),update:upd});
    }
  });
  return out;
}
function fileDiffSummary(wb){
  let prev=null;
  try{ prev=JSON.parse(localStorage.getItem(SNAP_KEY)); }catch(e){}
  if(!prev||!prev.tasks) return [];
  const cur=parseTasksLight(wb);
  const pm={}; prev.tasks.forEach(t=>pm[taskKey(t)]=t);
  const diffs=[]; const seen=new Set();
  cur.forEach(t=>{
    const k=taskKey(t); seen.add(k);
    const p=pm[k];
    if(!p){ diffs.push('\ud83c\udd95 New in file: '+t.title.substring(0,55)+' ['+t.owner+']'); return; }
    if(p.status!==t.status) diffs.push('\ud83d\udd01 '+t.title.substring(0,45)+': '+p.status+' \u2192 '+t.status);
    if(p.update!==t.update) diffs.push('\u270d '+t.owner+' edited: '+t.title.substring(0,50));
  });
  prev.tasks.forEach(t=>{ if(!seen.has(taskKey(t))) diffs.push('\ud83d\uddd1 Removed from file: '+t.title.substring(0,50)); });
  return diffs;
}

/* ---------- NAV / ACTIONS ---------- */
function showTab(btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#mainNav button').forEach(b=>b.classList.remove('active'));
  document.getElementById(btn.dataset.tab).classList.add('active');
  btn.classList.add('active');
}
function copyText(id,btn){
  navigator.clipboard.writeText(document.getElementById(id).textContent).then(()=>{
    const o=btn.innerHTML;btn.innerHTML='✅ Copied!';btn.classList.add('copied');
    setTimeout(()=>{btn.innerHTML=o;btn.classList.remove('copied');},2000);
  }).catch(()=>{
    /* clipboard may be blocked on file:// in some browsers — fallback */
    const ta=document.createElement('textarea');ta.value=document.getElementById(id).textContent;
    document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
    toast('Copied ✓');
  });
}
function downloadText(id,prefix){
  const d=new Date(),a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([document.getElementById(id).textContent],{type:'text/plain'}));
  a.download=`${prefix}_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.txt`;a.click();
}
function printPanel(id){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('print-target'));
  document.getElementById(id).classList.add('print-target');
  window.print();
}
/* warn before closing with unsaved edits */
window.addEventListener('beforeunload',e=>{ if(dirty){ e.preventDefault(); e.returnValue=''; } });


/* Hosted (GitHub Pages) copy: no server inventory, so hide the Inventory tab. */
document.addEventListener('DOMContentLoaded', function(){
  var b=document.querySelector('[data-tab="tab-inventory"]'); if(b) b.style.display='none';
});
