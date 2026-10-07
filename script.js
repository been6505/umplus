/* จำนวนครัวเรือน: คอลัมน์ households (Code.gs ใหม่) หรืออ่านจาก [ครัวเรือน N] ในรายละเอียด (Code.gs เดิม) */
const VUL_TH={elderly:'ผู้สูงอายุ',child:'เด็กเล็ก',infant:'ทารก',pregnant:'หญิงตั้งครรภ์',disabled:'ผู้พิการ',bedridden:'ผู้ป่วยติดเตียง',oxygen:'ใช้ออกซิเจน / เครื่องช่วยหายใจ',dialysis:'ผู้ป่วยฟอกไต',chronic:'ผู้ป่วยโรคเรื้อรัง'};
const vulList=c=>(Array.isArray(c&&c.vulnerable)?c.vulnerable:String(c&&c.vulnerable||'').split(/\s*,\s*/)).filter(Boolean).map(v=>VUL_TH[v]||v);
function hhOf(c){const n=Number(c&&c.households);if(n>0)return n;const m=String(c&&c.notes||'').match(/\[ครัวเรือน (\d+)\]/);return m?Number(m[1]):0}
const stripHH=t=>String(t||'').replace(/^\[ครัวเรือน \d+\]\s*/,'');
/* ============================================================
   UM+ — เชื่อมกับ Google Sheet ผ่าน Apps Script Web app
   ============================================================ */
const API_URL = 'https://script.google.com/macros/s/AKfycbyWeVDhToFJntjTGHprDEByEfRFdSbOidlR7QhJ6xG1bz7co2gCRkTGIoKDI9tJqGkWTw/exec';

const $ = s => document.querySelector(s);
let currentView='home', detailOrigin='map', selectedCase=null, geo=null;
let cases=[], isVolunteer=false, lastLoaded=0, loading=false;
const STATUS_TH={open:'รอความช่วยเหลือ',going:'ทีมกำลังไป',done:'ช่วยเหลือแล้ว'};
const STATUS_CLASS={open:'wait',going:'enroute',done:'done'};
const LEVEL_TH={ankle:'ข้อเท้า',knee:'เข่า',waist:'เอว',chest:'อก',roof:'มิดหัว / ขึ้นหลังคา'};

/* ---------------- storage helpers ---------------- */
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}},set(k,v){try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch(e){}}};

/* ---------------- API ---------------- */
async function apiPost(body){
  const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});
  return r.json();
}
/* Firebase = ฐานข้อมูลสำรอง: ถ้าส่งเข้า Google Sheet ไม่ได้ จะส่งเข้า Firebase แทน (ค่าเหล่านี้เป็นค่าสาธารณะ ใส่ในเว็บได้) */
const FIREBASE={projectId:'',apiKey:''};
function randHex(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('')}
function fsValue(v){
  if(Array.isArray(v))return {arrayValue:{values:v.map(fsValue)}};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(v instanceof Date)return {timestampValue:v.toISOString()};
  return {stringValue:String(v??'')};
}
async function fbInboxCreate(data,clientId,token){
const keep=['level','needs','vulnerable','urgencyLabel','people','households','address','lat','lng','phone','name','details','website'];
  const fields={clientId:fsValue(clientId),token:fsValue(token),sentAt:fsValue(new Date())};
  keep.forEach(k=>{const v=data[k];if(v===''&&(k==='lat'||k==='lng'))return;if(v!=null)fields[k]=fsValue(v)});
  const url=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE.projectId)}/databases/(default)/documents/inbox?documentId=${encodeURIComponent(clientId)}&key=${encodeURIComponent(FIREBASE.apiKey)}`;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
  if(!r.ok&&r.status!==409)throw new Error('firebase '+r.status);
  return {ok:true,id:'',queued:true,clientId,token};
}
async function apiCreate(data){
  const clientId=Date.now().toString(36)+randHex(4);
  let last;
  for(let i=0;i<3;i++){
    try{const r=await apiPost({action:'create',clientId,...data});r.clientId=clientId;return r}
    catch(e){last=e;if(i<2)await new Promise(r=>setTimeout(r,1000*(i+1)))}
  }
  if(FIREBASE.projectId&&FIREBASE.apiKey){
    try{return await fbInboxCreate(data,clientId,randHex(16))}catch(e){last=e}
  }
  throw last;
}
async function apiList(){
  const k=store.get('uh_vol_key','');
  const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),20000); // ไม่ค้างถ้าเซิร์ฟเวอร์ช้า
  try{const r=await fetch(API_URL+'?action=list'+(k?'&key='+encodeURIComponent(k):'')+'&t='+Math.floor(Date.now()/15000),{signal:ctl.signal});return await r.json()}
  finally{clearTimeout(tm)}
}
function apiUpdate(id,status,volunteer){
  return apiPost({action:'update',key:store.get('uh_vol_key',''),id,status,volunteer:volunteer||''});
}

/* ---------------- helpers ---------------- */
function ago(ts){
  if(!ts)return '';
  const m=Math.max(0,Math.round((Date.now()-ts)/60000));
  if(m<1)return 'เมื่อสักครู่';
  if(m<60)return m+' นาทีที่แล้ว';
  const h=Math.floor(m/60);if(h<24)return h+' ชั่วโมงที่แล้ว';
  return new Date(ts).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}
function hasPin(c){return c.lat!==''&&c.lat!=null&&c.lng!==''&&c.lng!=null&&!isNaN(+c.lat)}
function caseTitle(c){
  const needs=(c.needs||[]).join(' · ')||'ขอความช่วยเหลือ';
  return `${needs} · ${c.people||1} คน`;
}
function caseArea(c){return c.district?('เขต'+c.district):(c.address||'ไม่ระบุที่อยู่')}
function isSOS(c){return Number(c.urgency)===3&&c.status==='open'}
function statusLabel(c){return (isSOS(c)?'SOS · ':'')+STATUS_TH[c.status]}
function statusClass(c){return STATUS_CLASS[c.status]}
/* ความวิกฤต: แดง = วิกฤต/เสี่ยงต่อชีวิต (urgency 3), เหลือง = เร่งด่วน / ทั่วไป */
function critLevel(c){const u=Number(c.urgency);return u===3?'red':u===2?'orange':'yellow'}
function critLabel(c){const u=Number(c.urgency);return u===3?'วิกฤต':u===2?'เร่งด่วน':'ทั่วไป'}
function statusEl(c){const s=document.createElement('span');s.className='status '+statusClass(c);s.append(statusLabel(c));if(c.status!=='done'){const d=document.createElement('i');d.className='sdot sdot-'+critLevel(c);d.title=critLabel(c);s.append(d)}return s}

/* ---------------- views ---------------- */
function setView(view,record=true){
  if(!document.querySelector(`#view-${view}`))return;
  if((view==='map'||view==='detail')&&!isVolunteer)view='home'; // ปิดดูเคสสำหรับคนทั่วไป: ทีมอาสาใช้หน้าหลังบ้าน admin.html
  currentView=view;
  if(record&&location.hash!==`#${view}`)history.pushState(null,'',`#${view}`);
  document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));
  const navView=['request','summary'].includes(view)?'home':view==='detail'?'map':view;
  document.querySelectorAll('nav [data-view]').forEach(el=>{const active=el.dataset.view===navView;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  if(view==='map'){renderMap();loadCases();initFloodMap()}
  if(view==='home'){renderHomeStats();loadCases()}
  if(view==='request')ensureRequestMap();
  window.scrollTo({top:0,behavior:'instant'});
  $('#main').focus({preventScroll:true});
}

/* ---------------- cases list ---------------- */
/* ลิงก์นำทาง Google Maps: มีหมุดใช้พิกัด ไม่มีหมุดใช้ที่อยู่ · dir_action=navigate = เริ่มนำทางทันทีบนมือถือ */
function navUrl(c){
  const pin=hasPin(c),q=pin?`${(+c.lat).toFixed(6)},${(+c.lng).toFixed(6)}`:[c.address,c.district?'เขต'+c.district:''].filter(Boolean).join(' ');
  if(!q)return '';return 'https://www.google.com/maps/dir/?api=1&dir_action=navigate&destination='+encodeURIComponent(pin?q:q+' กรุงเทพมหานคร');
}
function caseCard(c){
  const div=document.createElement('button');div.className='case-card case-simple'+(c.status!=='done'?' crit-card-'+critLevel(c):'');div.type='button';div.dataset.id=c.id;
  const top=document.createElement('div');top.className='case-top';
  const st=statusEl(c);
  const t=document.createElement('span');t.className='case-id';t.textContent=ago(c.createdAt);
  top.append(st,t);
  const ppl=document.createElement('p');ppl.className='case-people';ppl.textContent='👥 '+(Number(c.people)||1)+' คน'+(hhOf(c)?' · 🏠 '+hhOf(c)+' ครัวเรือน':'');if(vulList(c).length){const v=document.createElement('small');v.className='case-vul';v.textContent='ดูแลพิเศษ: '+vulList(c).join(', ');ppl.append(document.createElement('br'),v)}
  const h=document.createElement('h3');h.className='case-needs';h.textContent=(c.needs||[]).join(' · ')||'ขอความช่วยเหลือ';
  const ad=document.createElement('p');ad.className='case-addr';const at=[c.address,c.district?'เขต'+c.district:''].filter(Boolean).join(' · ');ad.textContent='📍 '+(at||'ไม่ระบุที่อยู่');if(!at)ad.classList.add('none');
  const ct=document.createElement('p');ct.className='case-contact';const ctt=[c.name?'👤 '+c.name:'',c.phone?'☎ '+c.phone:''].filter(Boolean).join('   ');ct.textContent=ctt;
  div.append(top,ppl,h,ad);if(ctt)div.append(ct);
  div.addEventListener('click',()=>openCase(c.id));
  return div;
}
/* ค้นหาเคส: ทุกคำต้องตรง (เลขเคส ความต้องการ เขต ที่อยู่ ชื่อ เบอร์ หมายเหตุ ทีม สถานะ ความวิกฤต) */
/* ทำข้อความไทยให้เทียบกันได้: สระอำแบบแยกตัว/วรรณยุกต์สลับที่, ตัวอักษรล่องหน, ตัวพิมพ์เล็ก-ใหญ่ */
function srchNorm(s){s=String(s==null?'':s);try{s=s.normalize('NFC')}catch(e){}
  return s.replace(/[​-‍﻿]/g,'').replace(/ํ([่-๋]?)า/g,'$1ำ').replace(/([่-๋])ํา/g,'$1ำ').replace(/^'+/,'').toLowerCase()}
function searchQuery(){const i=$('#case-search');return i?srchNorm(i.value.trim()):''}
function caseHay(c){
  const d=c.createdAt?new Date(Number(c.createdAt)||c.createdAt):null,dt=d&&!isNaN(d)?d.toLocaleDateString('th-TH',{day:'numeric',month:'short'})+' '+d.toLocaleDateString('th-TH',{day:'numeric',month:'long'})+' '+d.getDate()+'/'+(d.getMonth()+1):'';
  const parts=[c.id,'#'+c.id,(c.needs||[]).join(' '),c.district,c.district?'เขต'+c.district:'',c.address,c.name,c.phone,c.notes,c.volunteer,vulList(c).join(' '),
    statusLabel(c),STATUS_TH[c.status],critLabel(c),c.level,c.level?'น้ำ'+(LEVEL_TH[c.level]||c.level)+' ระดับ'+(LEVEL_TH[c.level]||''):'',c.people?c.people+' คน':'',hhOf(c)?hhOf(c)+' ครัวเรือน':'',dt,c.lat&&c.lng?(+c.lat).toFixed(4)+','+(+c.lng).toFixed(4):'',c.createdBy,c.contact,c.reporter];
  return srchNorm(parts.filter(Boolean).join(' '))}
function normDigits(x){let d=String(x||'').replace(/\D/g,'');if(d.startsWith('66')&&d.length>=11)d=d.slice(2);return d.replace(/^0+/,'')}
function caseMatches(c,q){const hay=caseHay(c),hayS=hay.replace(/\s+/g,''),nm=srchNorm(c.name).replace(/\s+/g,''),digits=normDigits(c.phone);
  const qq=q.replace(/(\+?\d[\d\s-]{6,}\d)/g,m=>m.replace(/[\s-]/g,''));
  if(q.length>=3&&hayS.includes(q.replace(/\s+/g,'')))return true;
  return qq.split(/\s+/).every(t=>{if(hay.includes(t)||(nm&&t.length>=2&&nm.includes(t)))return true;if(!/^\+?[\d-]+$/.test(t))return false;const raw=t.replace(/\D/g,''),d=normDigits(t);if(raw.length<3||!d)return false;return /^(0|\+?66)/.test(t)?digits.startsWith(d):digits.includes(d)})}
/* ตัวกรองแบบติ๊กเลือก: ในกลุ่มเดียวกัน = อย่างใดอย่างหนึ่ง, ข้ามกลุ่ม = ต้องตรงทุกกลุ่ม, ไม่ติ๊กเลย = ทั้งหมด */
const CF_GROUPS=[
  {key:'status',title:'สถานะ',opts:[['open','รอความช่วยเหลือ'],['going','ทีมกำลังไป'],['done','ช่วยเหลือแล้ว']]},
  {key:'crit',title:'สีความวิกฤต',opts:[['red','วิกฤต','#d32f2f'],['orange','เร่งด่วน','#f57c00'],['yellow','ทั่วไป','#f2b705']]},
  {key:'need',title:'ความต้องการ',opts:[['อพยพ','อพยพ'],['ผู้ป่วย','ผู้ป่วย / ผู้สูงอายุ'],['อาหาร','อาหาร / น้ำดื่ม'],['ยา','ยา'],['ของใช้เด็ก','ของใช้เด็ก'],['เรือ','เรือ / รถสูง'],['อื่น','อื่น ๆ']]},
  {key:'people',title:'จำนวนคน',opts:[['1-5','1–5 คน'],['6-10','6–10 คน'],['11-50','11–50 คน'],['51-99999','มากกว่า 50 คน']]},
  {key:'level',title:'ระดับน้ำ',opts:[['ankle','ข้อเท้า'],['knee','เข่า'],['waist','เอว'],['chest','อก'],['roof','มิดหัว / หลังคา'],['none','ไม่ระบุ']]}
];
const CF_DEFAULT={status:['open','going'],crit:[],need:[],people:[],level:[]};
let cf=(()=>{try{const v=JSON.parse(localStorage.getItem('uh_filters')||'null');if(v&&typeof v==='object')return Object.assign({},CF_DEFAULT,v)}catch(e){}return JSON.parse(JSON.stringify(CF_DEFAULT))})();
function cfSave(){try{localStorage.setItem('uh_filters',JSON.stringify(cf))}catch(e){}}
function cfStatusDefault(){return cf.status.length===2&&cf.status.includes('open')&&cf.status.includes('going')}
function cfMatch(c,skipStatus){
  if(!skipStatus&&cf.status.length&&!cf.status.includes(c.status))return false;
  if(cf.crit.length&&!cf.crit.includes(critLevel(c)))return false;
  if(cf.need.length){const n=(c.needs||[]).join(' ');if(!cf.need.some(k=>n.includes(k)))return false}
  if(cf.people.length){const n=Number(c.people)||1;if(!cf.people.some(r=>{const [a,b]=r.split('-').map(Number);return n>=a&&n<=b}))return false}
  if(cf.level.length&&!cf.level.includes(c.level||'none'))return false;
  return true}
function filteredCases(){
  const q=searchQuery(),skipStatus=!!q&&cfStatusDefault();
  const rank={open:0,going:1,done:2};
  return cases
    .filter(c=>q?true:cfMatch(c,skipStatus))
    .filter(c=>!q||caseMatches(c,q))
    .sort((a,b)=>(rank[a.status]-rank[b.status])||(Number(b.urgency)-Number(a.urgency))||((a.createdAt||0)-(b.createdAt||0)));
}
function cfLabel(g,v){const o=g.opts.find(x=>x[0]===v);return o?o[1]:v}
function cfActiveCount(){return CF_GROUPS.reduce((n,g)=>n+(g.key==='status'&&cfStatusDefault()?0:cf[g.key].length),0)}
function renderCfBar(){
  const n=cfActiveCount(),b=$('#cf-count');if(b){b.hidden=!n;b.textContent=n}
  const box=$('#cf-active');if(!box)return;box.replaceChildren();
  CF_GROUPS.forEach(g=>{if(g.key==='status'&&cfStatusDefault())return;cf[g.key].forEach(v=>{const t=document.createElement('button');t.type='button';t.className='cf-tag';
    const o=g.opts.find(x=>x[0]===v);if(o&&o[2]){const d=document.createElement('i');d.className='cf-dot';d.style.background=o[2];t.append(d)}
    t.append(cfLabel(g,v)+' ✕');t.title='เอาออก';t.addEventListener('click',()=>{cf[g.key]=cf[g.key].filter(x=>x!==v);cfSave();cfApply()});box.append(t)})});
  if(n){const r=document.createElement('button');r.type='button';r.className='cf-tag cf-reset';r.textContent='ล้างทั้งหมด';r.addEventListener('click',()=>{cf=JSON.parse(JSON.stringify(CF_DEFAULT));cfSave();cfApply()});box.append(r)}
}
function cfCounts(){const base=cases.filter(c=>!searchQuery()||caseMatches(c,searchQuery()));const out={};
  CF_GROUPS.forEach(g=>{out[g.key]={};g.opts.forEach(([v])=>{const saved=cf[g.key];cf[g.key]=[v];out[g.key][v]=base.filter(c=>cfMatch(c,false)).length;cf[g.key]=saved})});return out}
const cfWide=window.matchMedia?matchMedia('(min-width:1100px)'):{matches:false,addEventListener(){}};
function renderCfPanel(){
  const p=$('#cf-panel');if(!p)return;if(cfWide.matches)p.hidden=false;if(p.hidden)return;const counts=cfCounts();p.replaceChildren();
  CF_GROUPS.forEach(g=>{const fs=document.createElement('fieldset');fs.className='cf-group';const lg=document.createElement('legend');lg.textContent=g.title;fs.append(lg);
    const grid=document.createElement('div');grid.className='cf-opts';
    g.opts.forEach(([v,label,col])=>{const l=document.createElement('label');l.className='cf-opt';const i=document.createElement('input');i.type='checkbox';i.value=v;i.checked=cf[g.key].includes(v);
      i.addEventListener('change',()=>{cf[g.key]=i.checked?[...new Set([...cf[g.key],v])]:cf[g.key].filter(x=>x!==v);cfSave();cfApply()});
      const sp=document.createElement('span');if(col){const d=document.createElement('i');d.className='cf-dot';d.style.background=col;sp.append(d)}
      sp.append(label);const n=document.createElement('small');n.textContent=counts[g.key][v];sp.append(n);l.append(i,sp);grid.append(l)});
    fs.append(grid);p.append(fs)});
  const ft=document.createElement('div');ft.className='cf-foot';
  const clr=document.createElement('button');clr.type='button';clr.className='cf-clear';clr.textContent='ล้างตัวกรอง';clr.addEventListener('click',()=>{cf=JSON.parse(JSON.stringify(CF_DEFAULT));cfSave();cfApply()});
  const ok=document.createElement('button');ok.type='button';ok.className='solid-button cf-ok';ok.textContent=`ดูผล ${filteredCases().length} เคส`;ok.addEventListener('click',()=>cfToggle(false));
  ft.append(clr,ok);p.append(ft)}
function cfToggle(open){const p=$('#cf-panel'),b=$('#cf-btn');if(!p)return;p.hidden=!open;b.setAttribute('aria-expanded',String(open));b.classList.toggle('on',open);if(open)renderCfPanel();else{const pts=filteredCases().filter(hasPin).map(c=>[c.lat,c.lng]);if(fmap&&pts.length&&cfActiveCount())fmap.fitBounds(pts,{padding:[40,40],maxZoom:15})}}
function cfApply(){renderMap()}
function renderMap(){
  const matching=filteredCases();
  const q=searchQuery();$('#case-count').textContent=q&&cases.length?`พบ ${matching.length} เคส (ค้นจากทุกเคส)`:!lastLoaded&&cases.length?`${matching.length} เคส · ${loading?'กำลังอัปเดต…':'ข้อมูลที่บันทึกไว้ (ยังเชื่อมต่อไม่ได้)'}`:loading&&!lastLoaded?'กำลังโหลด…':`${matching.length} เคส`;
  const el=$('#map-cases');el.replaceChildren(...matching.map(caseCard));
  if(!matching.length&&lastLoaded){const empty=document.createElement('div');empty.className='empty';empty.textContent=cases.length?'ไม่พบเคสที่ตรงกับการค้นหา':'ยังไม่มีเคสขอความช่วยเหลือ';if(q&&cases.length&&!isVolunteer){const h=document.createElement('small');h.className='search-hint';h.textContent='ค้นด้วยชื่อ-นามสกุล หรือเบอร์โทรเต็ม ได้ในโหมดทีมอาสา';empty.append(h)}el.append(empty)}
  const si=$('#case-search');if(si)si.placeholder=isVolunteer?'ค้นหา: ชื่อ นามสกุล เบอร์โทร เขต เลขเคส':'ค้นหาเคส: เขต ที่อยู่ ความต้องการ เลขเคส';
  renderVolunteerBar();
  renderCfBar();renderCfPanel();
  drawCaseMarkers();
  if(typeof tripRefresh==='function')tripRefresh();
  if(typeof renderLayerChips==='function')renderLayerChips();
}
async function loadCases(){
  if(loading)return;loading=true;
  try{
    const r=await apiList();
    if(!r.ok)throw new Error(r.error||'error');
    cases=(r.cases||[]).map(c=>({...c,lat:c.lat===''?'':+c.lat,lng:c.lng===''?'':+c.lng}));
    isVolunteer=!!r.volunteer;lastLoaded=Date.now();
    // จำโหมดอาสาไว้ในเครื่อง: รหัสถูก = จำไว้, เซิร์ฟเวอร์ปฏิเสธรหัสจริงๆ เท่านั้นถึงลบ (เน็ตหลุดไม่ลบ)
    if(isVolunteer)store.set('uh_vol_ok','1');
    else if(store.get('uh_vol_key','')){store.set('uh_vol_key','');store.set('uh_vol_ok','')}
    if(!isVolunteer)store.set('uh_cases_cache',JSON.stringify({t:lastLoaded,cases})); // เก็บเฉพาะข้อมูลสาธารณะ (ปิดเบอร์แล้ว) ไว้เปิดครั้งหน้าได้ทันที
    $('#sync-status').textContent='อัปเดตล่าสุด '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
    if(selectedCase){selectedCase=cases.find(c=>c.id===selectedCase.id)||selectedCase;if(currentView==='detail')renderDetail()}
  }catch(e){
    $('#sync-status').textContent='โหลดข้อมูลไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต แล้วลองใหม่';
    const cc=$('#case-count');if(cc&&!lastLoaded)cc.textContent=cases.length?`${cases.length} เคส · ข้อมูลที่บันทึกไว้ล่าสุด (เชื่อมต่อไม่ได้)`:'โหลดข้อมูลเคสไม่สำเร็จ · ลองใหม่อีกครั้ง';
  }finally{loading=false;if(currentView==='map')renderMap();renderHomeStats();if(typeof onCasesLoaded==='function')onCasesLoaded()}
}
/* เปิดแอปมา: ถ้าเคยเข้าโหมดอาสาไว้ ให้อยู่ในโหมดอาสาเลย ไม่ต้องใส่รหัสใหม่ */
if(store.get('uh_vol_key','')&&store.get('uh_vol_ok',''))isVolunteer=true;
/* ---------- อัปเดตแบบเรียลไทม์ ----------
   เช็ก "เลขเวอร์ชันข้อมูล" ทุก 12 วิ (เบามาก ไม่อ่าน Sheet) → มีอะไรเปลี่ยนค่อยโหลดรายการเคสใหม่
   สำรอง: โหลดเต็มทุก 2 นาที เผื่อระบบหลังบ้านยังไม่รองรับ */
let dataRev=null,revFails=0;
async function checkRev(){
  if(document.hidden||loading)return;
  try{
    const r=await fetch(API_URL+'?action=rev&t='+Date.now()).then(x=>x.json());
    if(!r||!r.ok||r.rev==null){revFails++;return}
    revFails=0;
    if(dataRev!==null&&r.rev!==dataRev){dataRev=r.rev;await loadCases();markLive(true);return}
    dataRev=r.rev;markLive(false);
  }catch(e){revFails++}
}
function markLive(changed){
  const el=document.getElementById('live-dot');if(!el)return;
  el.hidden=false;el.textContent='● สด · '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if(changed){el.classList.remove('pulse');void el.offsetWidth;el.classList.add('pulse')}
}
setInterval(()=>{if(['map','detail','home'].includes(currentView)&&revFails<5)checkRev()},12000);
setInterval(()=>{if(document.hidden)return;const age=Date.now()-lastLoaded;if(['map','detail','home'].includes(currentView)&&age>115000)loadCases()},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastLoaded>20000)loadCases()});
/* แสดงข้อมูลล่าสุดที่เคยโหลดไว้ทันที ระหว่างรอข้อมูลใหม่ */
(function(){if(store.get('uh_vol_key',''))return;try{const c=JSON.parse(store.get('uh_cases_cache','null'));if(c&&Date.now()-c.t<6*3600e3&&Array.isArray(c.cases)){cases=c.cases}}catch(e){}})();

/* ---------------- home stats ---------------- */
function renderHomeStats(){
  const el=id=>document.getElementById(id);if(!el('st-total'))return;
  if(!lastLoaded)return;
  const n={open:0,going:0,done:0};let people=0;
  cases.forEach(c=>{n[c.status]=(n[c.status]||0)+1;people+=Number(c.people)||0});
  const f=x=>x.toLocaleString('th-TH');
  el('st-total').textContent=f(cases.length);el('st-open').textContent=f(n.open);el('st-going').textContent=f(n.going);el('st-done').textContent=f(n.done);el('st-people').textContent=f(people);
  el('stats-updated').textContent='อัปเดต '+new Date(lastLoaded).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
}

/* ---------------- volunteer mode ---------------- */
function renderVolunteerBar(){
  const bar=$('#volunteer-bar');
  const sw=$('#vol-switch');if(sw){const on=isVolunteer||volPanelOpen;sw.setAttribute('aria-checked',String(on));sw.classList.toggle('on',on);sw.classList.toggle('pending',on&&!isVolunteer);sw.classList.toggle('active',isVolunteer);const t=store.get('uh_team','');sw.querySelector('span').textContent=isVolunteer&&t?t:'ทีมอาสา'}
  const panel=$('#vol-panel');if(panel)panel.hidden=!volPanelOpen;
  const tb=$('#vol-tools-btn');if(tb){tb.hidden=!isVolunteer;tb.setAttribute('aria-expanded',String(volPanelOpen));tb.classList.toggle('open',volPanelOpen)}
  const mode=isVolunteer?'vol':'pub';if(bar.dataset.mode===mode&&bar.children.length)return; // ไม่สร้างใหม่ทุกครั้ง (กันช่องที่กำลังพิมพ์หาย)
  bar.dataset.mode=mode;bar.replaceChildren();
  if(isVolunteer){
    const s=document.createElement('span');s.className='vol-on';s.textContent='● โหมดอาสา · เห็นเบอร์และรับเคสได้';
    bar.append(s);if(typeof liveControls==='function')bar.append(liveControls());if(typeof placeControls==='function')bar.append(placeControls());return;
  }
  const s=document.createElement('span');s.className='vol-note';s.textContent='ใส่รหัสอาสา';
  const inp=document.createElement('input');inp.type='password';inp.id='vol-key';inp.placeholder='รหัสอาสา';inp.setAttribute('aria-label','รหัสอาสา');inp.autocomplete='off';
  const btn=document.createElement('button');btn.type='button';btn.className='secondary-button';btn.textContent='เข้าโหมดอาสา';
  btn.onclick=async()=>{const k=inp.value.trim();if(!k){inp.focus();return}store.set('uh_vol_key',k);store.set('uh_vol_ok','');btn.disabled=true;btn.textContent='กำลังตรวจรหัส…';const before=lastLoaded;await loadCases();btn.disabled=false;btn.textContent='เข้าโหมดอาสา';
    if(isVolunteer){volPanelOpen=false;return}
    if(lastLoaded===before){$('#sync-status').textContent='ยังเชื่อมต่อระบบไม่ได้ · บันทึกรหัสไว้ในเครื่องแล้ว จะเข้าโหมดอาสาให้เองเมื่อเชื่อมต่อได้';return}
    store.set('uh_vol_key','');$('#sync-status').textContent='รหัสอาสาไม่ถูกต้อง'};
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click()});
  bar.append(s,inp,btn);
  if(volPanelOpen)setTimeout(()=>inp.focus(),50);
}
let volPanelOpen=false;
$('#vol-switch').addEventListener('click',async()=>{
  if(isVolunteer){
    if(typeof isSharing==='function'&&isSharing())await stopSharing();
    store.set('uh_vol_key','');store.set('uh_vol_ok','');isVolunteer=false;volPanelOpen=false;renderMap();loadCases();return;
  }
  volPanelOpen=!volPanelOpen;renderVolunteerBar();
});
$('#vol-tools-btn').addEventListener('click',()=>{volPanelOpen=!volPanelOpen;renderVolunteerBar()});

/* ---------------- flood map: Floodboard roads + UM+ case pins ---------------- */
const FLOOD_URL='https://www.floodboard.org/api/export/roads.geojson';
const VERDICT_TH={blocked:'ผ่านไม่ได้',risky:'เสี่ยง',caution:'ระวัง',ok:'ผ่านได้'};
let fmap=null,floodLayer=null,pinLayer=null,floodFitted=false,floodRenderer=null;
const escH=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function floodVerdict(p){const v=p.verdict;return typeof v==='string'?v:(v&&(v.sedan||v.pickup||v.motorbike))||''}
function floodColor(p){const v=floodVerdict(p),d=Number(p.depthCm)||0;
  if(v==='blocked'||d>=50)return '#c62828';if(v==='risky'||d>=30)return '#ef6c00';if(v==='caution'||d>=10)return '#f9a825';return '#1e88e5'}
function initFloodMap(){
  if(fmap){requestAnimationFrame(()=>fmap.invalidateSize());return}
  const el=document.getElementById('flood-map');if(!el||typeof loadLeaflet!=='function')return;
  loadLeaflet().then(()=>{
    el.replaceChildren();
    fmap=L.map('flood-map',{scrollWheelZoom:false,preferCanvas:true}).setView([13.7563,100.5018],11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap · น้ำท่วม: Floodboard.org'}).addTo(fmap);
    floodLayer=L.layerGroup().addTo(fmap);pinLayer=L.layerGroup().addTo(fmap);
    drawCaseMarkers();setTimeout(loadFlood,150); // หมุดเคสขึ้นก่อน แล้วค่อยวาดชั้นน้ำท่วมif(typeof onFloodMapReady==='function')onFloodMapReady();requestAnimationFrame(()=>fmap.invalidateSize());
  }).catch(()=>{el.textContent='โหลดแผนที่ไม่สำเร็จ'});
}
async function loadFlood(){
  if(!fmap)return;const info=document.getElementById('flood-updated');
  try{
    const r=await fetch(FLOOD_URL);if(!r.ok)throw new Error(r.status);
    const g=await r.json();floodLayer.clearLayers();
    L.geoJSON(g,{renderer:floodRenderer||(floodRenderer=L.canvas({padding:.3,tolerance:6})),smoothFactor:1.5,
      style:f=>({color:floodColor(f.properties||{}),weight:5,opacity:.8}),
      pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:6,color:floodColor(f.properties||{}),fillOpacity:.8,weight:2}),
      onEachFeature:(f,l)=>{const p=f.properties||{};const v=floodVerdict(p);
        l.bindPopup(`<b>${escH(p.name||'ถนน')}</b><br>น้ำลึกประมาณ ${p.depthCm!=null?escH(p.depthCm)+' ซม.':'-'}${v?'<br>รถเก๋ง: '+escH(VERDICT_TH[v]||v):''}`)}
    }).addTo(floodLayer);
    pinLayer.bringToFront&&pinLayer.eachLayer(x=>x.bringToFront&&x.bringToFront());
    if(info)info.textContent='· อัปเดต '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  }catch(e){if(info)info.textContent='· โหลดข้อมูลน้ำท่วมไม่สำเร็จ'}
}
function drawCaseMarkers(){
  if(!fmap||!pinLayer)return;pinLayer.clearLayers();const pts=[];
  filteredCases().filter(hasPin).forEach(c=>{
    const col=c.status==='done'?'#277343':c.status==='going'?'#28639a':critLevel(c)==='red'?'#d32f2f':critLevel(c)==='orange'?'#f57c00':'#f2b705';
    const icon=L.divIcon({className:'case-pin',html:`<span style="background:${col}"></span>`,iconSize:[30,38],iconAnchor:[15,36],popupAnchor:[0,-32]});
    pts.push([c.lat,c.lng]);
    L.marker([c.lat,c.lng],{icon,zIndexOffset:1000,title:caseTitle(c)})
      .bindPopup(`<b style="color:${critLevel(c)==='red'?'#c62828':critLevel(c)==='orange'?'#c25e00':'#a67c00'}">${escH(critLabel(c))}</b> · <b>${escH(statusLabel(c))}</b><br>${escH((c.needs||[]).join(', ')||'ขอความช่วยเหลือ')} · ${escH(c.people||1)} คน${hhOf(c)?' · '+hhOf(c)+' ครัวเรือน':''}${c.level&&typeof LEVEL_TH!=='undefined'?'<br>ระดับน้ำ: '+escH(LEVEL_TH[c.level]||c.level):''}${(c.address||c.district)?'<br>📍 '+escH([c.address,c.district?'เขต'+c.district:''].filter(Boolean).join(' · ')):''}${(c.name||c.phone)?'<br>'+(c.name?'👤 '+escH(c.name)+' ':'')+(c.phone?(isVolunteer&&String(c.phone).replace(/[^\d+]/g,'').length>=9?'☎ <a href="tel:'+escH(String(c.phone).replace(/[^\d+]/g,''))+'">'+escH(c.phone)+'</a>':'☎ '+escH(c.phone)):''):''}<br><a href="#" data-open-case="${escH(c.id)}">ดูรายละเอียด →</a>${c.status!=='done'?` · <a href="${escH(navUrl(c))}" target="_blank" rel="noopener"><b>🧭 นำทาง</b></a>`:''}${c.status!=='done'?`<br><a href="#" class="pop-trip" data-trip-add="${escH(c.id)}">${typeof tripIndex==='function'&&tripIndex(c.id)>=0?'✓ อยู่ในแผนเดินทาง (แตะเพื่อเอาออก)':'➕ เพิ่มในแผนเดินทาง'}</a>`:''}`)
      .addTo(pinLayer);
  });
  if(!floodFitted&&pts.length){fmap.fitBounds(pts,{padding:[40,40],maxZoom:14});floodFitted=true}
  if(typeof drawTeamMarkers==='function')drawTeamMarkers();
  if(typeof drawTrip==='function')drawTrip();
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-open-case]');if(a){e.preventDefault();openCase(a.getAttribute('data-open-case'))}});
setInterval(()=>{if(currentView==='map'&&!document.hidden)loadFlood()},10*60*1000);
/* fullscreen map toggle (CSS overlay: works on iPhone too) */
(function(){
  const btn=document.getElementById('map-full-btn');if(!btn)return;
  const wrap=btn.closest('.flood-map-wrap');
  const setFull=on=>{
    wrap.classList.toggle('is-full',on);document.body.classList.toggle('map-full-open',on);
    btn.querySelector('span').textContent=on?'ปิด':'เต็มจอ';btn.setAttribute('aria-label',on?'ปิดแผนที่เต็มจอ':'ขยายแผนที่เต็มจอ');
    btn.innerHTML=on?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg><span>ปิด</span>'
                    :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>เต็มจอ</span>';
    setTimeout(()=>fmap&&fmap.invalidateSize(),60);
  };
  btn.addEventListener('click',()=>setFull(!wrap.classList.contains('is-full')));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&wrap.classList.contains('is-full'))setFull(false)});
  document.addEventListener('click',e=>{if(e.target.closest('[data-open-case]')&&wrap.classList.contains('is-full'))setFull(false)},true);
  window.addEventListener('hashchange',()=>{if(wrap.classList.contains('is-full'))setFull(false)});
})();


/* ---------------- case detail ---------------- */
function openCase(id){selectedCase=cases.find(c=>c.id===id);if(!selectedCase)return;detailOrigin='map';renderDetail();setView('detail')}
function renderDetail(){
  const c=selectedCase,el=$('#detail-content');el.replaceChildren();
  const wrap=document.createElement('div');wrap.className='detail-shell';
  const head=document.createElement('div');head.className='detail-heading';
  const title=document.createElement('div');
  const status=statusEl(c);
  const h=document.createElement('h1');h.id='detail-title';h.textContent=caseTitle(c);
  const muted=document.createElement('p');muted.className='case-meta';muted.textContent=`#${c.id} · แจ้งเมื่อ ${ago(c.createdAt)}`;
  title.append(status,h,muted);head.append(title);
  const card=document.createElement('div');card.className='detail-card';
  const facts=document.createElement('div');facts.className='detail-facts';
  const rows=[...(c.district?[['พื้นที่','เขต'+c.district]]:[]),['จำนวนคน',`${c.people||1} คน`],...(hhOf(c)?[['ครัวเรือน / ครอบครัว',hhOf(c)+' ครัวเรือน']]:[]),...(vulList(c).length?[['ต้องดูแลเป็นพิเศษ',vulList(c).join(', ')]]:[]),['ความต้องการ',(c.needs||[]).join(', ')||'-'],['ความเร่งด่วน',Number(c.urgency)===3?'ด่วนมาก · เสี่ยงต่อชีวิต':Number(c.urgency)===2?'ต้องการความช่วยเหลือเร็ว':'ทั่วไป']];
  if(c.address&&c.district)rows.push(['ที่อยู่ / จุดสังเกต',c.address]);
  if(c.name)rows.push(['ผู้ติดต่อ',c.name]);
  if(c.level)rows.push(['ระดับน้ำ',LEVEL_TH[c.level]||c.level]);
  rows.push(['เบอร์โทร',c.phone||'-']);
  if(c.volunteer&&c.status!=='open')rows.push(['ทีมที่รับเคส',c.volunteer]);
  rows.forEach(([key,val])=>{const cell=document.createElement('div');cell.className='fact';const s=document.createElement('span');s.textContent=key;const st=document.createElement('strong');st.textContent=val;cell.append(s,st);facts.append(cell)});
  card.append(facts);
  if(c.address&&!c.district){const h2=document.createElement('h2');h2.textContent='ที่อยู่ / จุดสังเกต';const p=document.createElement('p');p.textContent=c.address;card.prepend(h2,p)}
  /* แผนที่ + พิกัดของเคส */
  if(hasPin(c)){
    const lat=+c.lat,lng=+c.lng,box=document.createElement('div');box.className='detail-loc';
    const mp=document.createElement('div');mp.className='detail-map';mp.setAttribute('role','region');mp.setAttribute('aria-label','แผนที่ตำแหน่งเคส');mp.textContent='กำลังโหลดแผนที่…';
    const row=document.createElement('div');row.className='detail-coord';
    const ct=document.createElement('span');ct.textContent='📍 '+lat.toFixed(6)+', '+lng.toFixed(6);
    const cp=document.createElement('button');cp.type='button';cp.className='coord-copy';cp.textContent='คัดลอกพิกัด';
    cp.onclick=()=>{const t=lat.toFixed(6)+','+lng.toFixed(6);(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{cp.textContent='✓ คัดลอกแล้ว';setTimeout(()=>cp.textContent='คัดลอกพิกัด',2000)}).catch(()=>{window.prompt('คัดลอกพิกัด',t)})};
    row.append(ct,cp);box.append(mp,row);
    const addrP=card.querySelector(':scope > p');if(addrP)addrP.after(box);else card.prepend(box);
    if(window.__detailMap){try{window.__detailMap.remove()}catch(e){}window.__detailMap=null}
    loadLeaflet().then(()=>{if(!mp.isConnected)return;mp.textContent='';
      const m=L.map(mp,{scrollWheelZoom:false,zoomControl:true,attributionControl:true}).setView([lat,lng],16);window.__detailMap=m;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(m);
      const col=c.status==='done'?'#277343':c.status==='going'?'#28639a':critLevel(c)==='red'?'#d32f2f':critLevel(c)==='orange'?'#f57c00':'#f2b705';
      L.marker([lat,lng],{icon:L.divIcon({className:'case-pin',html:`<span style="background:${col}"></span>`,iconSize:[30,38],iconAnchor:[15,36]})}).addTo(m);
      requestAnimationFrame(()=>m.invalidateSize());setTimeout(()=>m.invalidateSize(),300);
    }).catch(()=>{mp.textContent='โหลดแผนที่ไม่สำเร็จ'});
  }else{const np=document.createElement('p');np.className='detail-nopin';np.textContent='ผู้แจ้งไม่ได้ปักหมุดตำแหน่ง';const addrP=card.querySelector(':scope > p');if(addrP)addrP.after(np);else card.prepend(np)}
  if(isVolunteer&&stripHH(c.notes)){const h2=document.createElement('h2');h2.textContent='สถานการณ์';const p=document.createElement('p');p.textContent=stripHH(c.notes);card.append(h2,p)}
  const actions=document.createElement('div');actions.className='detail-actions';
  const nu=navUrl(c);if(nu){const a=document.createElement('a');a.className='secondary-button nav-go';a.textContent=hasPin(c)?'🧭 นำทางด้วย Google Maps':'🧭 นำทางตามที่อยู่ (ไม่มีหมุด)';a.href=nu;a.target='_blank';a.rel='noopener';actions.prepend(a)}
  if(typeof tripButton==='function'&&hasPin(c)&&c.status!=='done')actions.append(tripButton(c));
  if(isVolunteer){
    const tel=String(c.phone||'').replace(/[^\d+]/g,'');
    if(tel){const call=document.createElement('a');call.className='secondary-button';call.href='tel:'+tel;call.textContent='☎ โทรหาผู้แจ้ง';actions.append(call)}
    /* ติ๊กเปลี่ยนสถานะ */
    const pick=document.createElement('fieldset');pick.className='status-pick';
    const lg=document.createElement('legend');lg.textContent='สถานะเคส (ติ๊กเพื่อเปลี่ยน)';pick.append(lg);
    const team=document.createElement('input');team.className='team-input';team.placeholder='ชื่อทีม / อาสา';team.value=c.volunteer||store.get('uh_team','');team.setAttribute('aria-label','ชื่อทีม');
    const opts=document.createElement('div');opts.className='status-opts';
    [['open','รอความช่วยเหลือ','#c93643'],['going','ทีมกำลังไป','#28639a'],['done','ช่วยเหลือแล้ว','#277343']].forEach(([v,label,col])=>{
      const l=document.createElement('label');l.className='status-opt';const i=document.createElement('input');i.type='radio';i.name='case-status-'+c.id;i.value=v;i.checked=c.status===v;
      const sp=document.createElement('span');sp.style.setProperty('--sc',col);sp.textContent=label;l.append(i,sp);opts.append(l);
      i.addEventListener('change',()=>{if(!i.checked||v===c.status)return;
        let t=v==='done'?team.value.trim():'';if(v==='going'){t=team.value.trim();if(!t){team.focus();team.placeholder='ใส่ชื่อทีมก่อน แล้วติ๊กอีกครั้ง';i.checked=false;opts.querySelector(`input[value="${c.status}"]`).checked=true;return}store.set('uh_team',t)}
        changeStatus(c,v,t,pick)});
    });
    pick.append(opts,team);actions.append(pick);
  }else{
    const note=document.createElement('div');note.className='detail-disclaimer';
    note.textContent='ทีมอาสาที่มีรหัสจะเห็นเบอร์โทรและรับเคสได้ในหน้า "ดูเคส" หากพบผู้ประสบภัยอยู่ในอันตราย โทร 1669 หรือ 1784';
    card.append(note);
  }
  card.append(actions);wrap.append(head,card);el.append(wrap);
}
async function changeStatus(c,status,team,btn){
  btn.disabled=true;
  try{
    const r=await apiUpdate(c.id,status,team);
    if(!r.ok){if(r.error==='not_volunteer'){store.set('uh_vol_key','');isVolunteer=false}throw new Error(r.error)}
    c.status=status;if(team)c.volunteer=team;if(status==='open')c.volunteer='';
    renderDetail();loadCases();
    if(typeof onStatusChanged==='function')onStatusChanged(c,status);
  }catch(e){btn.disabled=false;alertInline(btn,'อัปเดตไม่สำเร็จ ลองอีกครั้ง')}
}
function alertInline(anchor,msg){const p=document.createElement('p');p.className='field-error';p.textContent=msg;anchor.after(p);setTimeout(()=>p.remove(),5000)}

/* ---------------- request form ---------------- */
let pendingRequest=null;
/* ตรวจข้อมูลครบก่อนส่ง: ปุ่มกดไม่ได้จนกว่าจะครบ และบอกว่าขาดอะไร */
function formMissing(){
  const f=$('#request-form'),miss=[],v=n=>String((f.elements[n]||{}).value||'').trim();
  if(!document.querySelector('#needs input:checked'))miss.push(['needs','ความช่วยเหลือที่ต้องการ (เลือกอย่างน้อย 1 ข้อ)']);
  if(!document.querySelector('input[name=level]:checked'))miss.push(['levels','ระดับน้ำตอนนี้']);
  if(!(Number(v('people'))>=1))miss.push(['people','จำนวนคน']);
  if(!(Number(v('households'))>=1))miss.push(['households','จำนวนครัวเรือน / ครอบครัว']);
  const mapDown=!$('#map-error').hidden;
  if(!geo&&!mapDown)miss.push(['request-map','ตำแหน่ง (กด "ใช้ตำแหน่งปัจจุบัน" หรือแตะแผนที่เพื่อปักหมุด)']);
  if(!v('address'))miss.push(['address','จุดสังเกต / ที่อยู่']);
  if(!v('name'))miss.push(['name','ชื่อผู้ติดต่อ']);
  const d=v('phone').replace(/\D/g,'');if(d.length<9||d.length>12)miss.push(['phone',d?'เบอร์โทร (ต้องมี 9–10 หลัก)':'เบอร์โทรติดต่อกลับ']);
  return miss;
}
let formTouched=false;
function fieldEl(k){return document.getElementById(k)||$('#request-form').elements[k]}
function sectionOf(k){const e=fieldEl(k);return e&&(e.closest('.field')||e.closest('.form-section'))}
function renderFormCheck(){
  const box=$('#form-missing'),btn=$('#request-submit');if(!box||!btn)return;
  const miss=formMissing();btn.disabled=miss.length>0;btn.setAttribute('aria-disabled',String(miss.length>0));
  document.querySelectorAll('#request-form .is-missing').forEach(x=>x.classList.remove('is-missing'));
  if(!miss.length){box.className='form-missing ok';box.textContent='✓ กรอกข้อมูลครบแล้ว กด "ถัดไป" เพื่อตรวจข้อมูลก่อนส่ง';return}
  if(formTouched)miss.forEach(([k])=>{const sec=sectionOf(k);if(sec)sec.classList.add('is-missing')});
  box.className='form-missing';box.replaceChildren();
  const h=document.createElement('strong');h.textContent=`กรุณากรอกข้อมูลให้ครบ (ยังขาด ${miss.length} รายการ)`;box.append(h);
  const ul=document.createElement('ul');miss.forEach(([k,t])=>{const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=t;
    b.onclick=()=>{formTouched=true;renderFormCheck();const sec=sectionOf(k)||fieldEl(k);if(sec)sec.scrollIntoView({behavior:'smooth',block:'center'});const inp=fieldEl(k);if(inp&&inp.focus&&/INPUT|SELECT|TEXTAREA/.test(inp.tagName))setTimeout(()=>inp.focus({preventScroll:true}),350)};li.append(b);ul.append(li)});
  box.append(ul);
}
['input','change'].forEach(ev=>$('#request-form').addEventListener(ev,e=>{if(e.target&&e.target.name!=='website'){if(ev==='change')formTouched=true;renderFormCheck()}}));
setInterval(()=>{if(currentView==='request')renderFormCheck()},700); // ตำแหน่งจากแผนที่/GPS เปลี่ยนนอกฟอร์ม
$('#request-form').addEventListener('submit',e=>{
  e.preventDefault();
  const checked=[...document.querySelectorAll('#needs input:checked')].map(x=>x.value);
  const miss=formMissing();formTouched=true;renderFormCheck();
  if(miss.length){const sec=sectionOf(miss[0][0]);if(sec)sec.scrollIntoView({behavior:'smooth',block:'center'});return}
  const form=new FormData(e.currentTarget);
  const phone=String(form.get('phone')||'').trim(),address=String(form.get('address')||'').trim();
  pendingRequest={
    level:(document.querySelector('input[name=level]:checked')||{}).value||'',
    needs:checked,vulnerable:[...document.querySelectorAll('#vulnerable input:checked')].map(x=>x.value),urgencyLabel:form.get('urgency'),people:Number(form.get('people'))||1,households:Math.max(1,Math.min(999,Number(form.get('households'))||1)),
    address,lat:geo?+geo.lat.toFixed(6):'',lng:geo?+geo.lng.toFixed(6):'',
    phone,name:String(form.get('name')||'').trim(),details:[`[ครัวเรือน ${Math.max(1,Math.min(999,Number(form.get('households'))||1))}]`,String(form.get('details')||'').trim()].filter(Boolean).join(' '),
    website:String(form.get('website')||'')
  };
  const rows=[['ความช่วยเหลือ',checked.join(', ')],['ระดับน้ำ',LEVEL_TH[pendingRequest.level]||''],['ความเร่งด่วน',form.get('urgency')],['จำนวนคน',`${pendingRequest.people} คน`],['ครัวเรือน / ครอบครัว',`${pendingRequest.households} ครัวเรือน`],['ต้องดูแลเป็นพิเศษ',vulList(pendingRequest).join(', ')],['สถานการณ์',pendingRequest.details.replace(/^\[ครัวเรือน \d+\]\s*/,'')],['ที่อยู่ / จุดสังเกต',address],['ตำแหน่ง',geo?'ปักหมุดแล้ว ✓':''],['ผู้ติดต่อ',pendingRequest.name],['เบอร์โทร',phone]];
  const summary=$('#summary-content');
  summary.replaceChildren(...rows.filter(([,val])=>val).map(([key,val])=>{const row=document.createElement('div');row.className='summary-row';const s=document.createElement('span');s.textContent=key;const v=document.createElement('strong');v.textContent=val;row.append(s,v);return row}));
  $('#send-result').hidden=true;$('#summary-actions').hidden=false;$('#send-request').disabled=false;$('#send-request').textContent='ส่งคำขอความช่วยเหลือ';
  setView('summary');
});
$('#send-request').addEventListener('click',async()=>{
  if(!pendingRequest)return;
  const btn=$('#send-request');btn.disabled=true;btn.textContent='กำลังส่ง…';
  const res=$('#send-result');
  try{
    const r=await apiCreate(pendingRequest);
    if(!r.ok)throw new Error(r.error||'error');
    if(r.token&&typeof rememberMyCase==='function')rememberMyCase(r.id,r.token,r.clientId);
    res.className='notice success';
    res.innerHTML='';
    const s=document.createElement('strong');s.textContent=r.queued?'ส่งคำขอแล้ว (ผ่านระบบสำรอง) · รหัสอ้างอิง '+r.clientId.slice(-6).toUpperCase():'ส่งคำขอแล้ว · เลขเคส '+r.id;
    const p=document.createElement('p');p.textContent='ทีมงานจะโทรกลับที่ '+pendingRequest.phone+' · อันตราย โทร 1669';
    const p2=document.createElement('p');p2.textContent='สถานะ: รอทีมอาสารับเคส · ดูสถานะได้ที่ "ติดตามเคสของฉัน" หน้าหลัก เปิดหน้านี้ไว้ ระบบจะเด้งแจ้งเตือนเมื่อสถานะเปลี่ยน';
    const wrap=document.createElement('div');wrap.append(s,p,p2);if(typeof caseSteps==='function')wrap.append(caseSteps('open'));const nb=typeof notifyButton==='function'&&notifyButton();if(nb)wrap.append(nb);res.append(wrap);res.hidden=false;
    $('#summary-actions').hidden=true;
    pendingRequest=null;$('#request-form').reset();formTouched=false;setTimeout(renderFormCheck,0);document.querySelectorAll('#needs input').forEach(i=>i.checked=false);
    if(typeof clearRequestLocation==='function')clearRequestLocation();
    $('#summary-back').hidden=true;
    lastLoaded=0;
  }catch(e){
    res.className='notice warning';res.innerHTML='';
    const s=document.createElement('strong');s.textContent='ส่งไม่สำเร็จ';
    const p=document.createElement('p');p.textContent='อาจเป็นเพราะสัญญาณอินเทอร์เน็ต กดส่งอีกครั้ง หรือโทรแจ้ง 1555 / 1784 พร้อมข้อมูลด้านบน';
    const wrap=document.createElement('div');wrap.append(s,p);res.append(wrap);res.hidden=false;
    btn.disabled=false;btn.textContent='ลองส่งอีกครั้ง';
  }
});
$('#new-request').addEventListener('click',()=>{$('#summary-back').hidden=false;$('#send-result').hidden=true;setView('request')});

/* ---------------- wiring ---------------- */
document.addEventListener('click',e=>{const btn=e.target.closest('[data-view]');if(btn){e.preventDefault();setView(btn.dataset.view);}});
$('#start-request').addEventListener('click',()=>setView('request'));
$('#detail-back').addEventListener('click',()=>setView(detailOrigin));
$('#cf-btn').addEventListener('click',()=>cfToggle($('#cf-panel').hidden));
try{cfWide.addEventListener('change',()=>{if(!cfWide.matches)cfToggle(false);renderCfPanel()})}catch(e){}
(function(){const i=$('#case-search'),x=$('#case-search-clear');if(!i)return;let tm;
  const fitResults=()=>{if(!fmap||!searchQuery())return;const pts=filteredCases().filter(hasPin).map(c=>[c.lat,c.lng]);if(pts.length)fmap.fitBounds(pts,{padding:[40,40],maxZoom:15})};
  const run=()=>{x.hidden=!i.value;clearTimeout(tm);tm=setTimeout(()=>{renderMap();fitResults()},200)};
  i.addEventListener('input',run);
  i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();i.blur();clearTimeout(tm);renderMap();fitResults()}});
  x.addEventListener('click',()=>{i.value='';x.hidden=true;renderMap();i.focus()});
})();
$('#refresh-cases').addEventListener('click',loadCases);
function restoreView(){let target=location.hash.slice(1)||'home';if(target==='volunteer')target='map';if(target==='detail'&&!selectedCase)target='map';if(target==='summary'&&!$('#summary-content').children.length)target='request';if(!['home','map','request','emergency','summary','detail'].includes(target))target='home';setView(target,false)}
window.addEventListener('popstate',restoreView);
document.querySelectorAll('#needs input').forEach(el=>el.addEventListener('change',()=>{$('#needs-error').hidden=[...document.querySelectorAll('#needs input')].some(i=>i.checked)}));
restoreView();

/* ---------- ตำแหน่งของฉันบนแผนที่ (อยู่ในเครื่องเท่านั้น ไม่ส่งไปที่ไหน) ---------- */
const ME={watch:null,marker:null,ring:null,pos:null,centered:false};
function meStop(){
  if(ME.watch!=null){navigator.geolocation.clearWatch(ME.watch);ME.watch=null}
  if(ME.marker){ME.marker.remove();ME.marker=null}if(ME.ring){ME.ring.remove();ME.ring=null}
  ME.pos=null;ME.centered=false;meBtn(false);
}
function meBtn(on,busy){const b=document.getElementById('map-me-btn');if(!b)return;b.setAttribute('aria-pressed',String(on));b.classList.toggle('on',on);b.classList.toggle('busy',!!busy);b.querySelector('span').textContent=busy?'กำลังหา…':on?'ตำแหน่งฉัน ✓':'ตำแหน่งฉัน'}
function mePopup(){
  const p=ME.pos;if(!p)return '';
  if(isVolunteer){const t=store.get('uh_team','')||'ทีมอาสา';return `<div class="place-pop"><b>🚑 ${escH(t)}</b><small>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</small></div>`}
  return `<div class="place-pop"><span class="pp-type" style="color:#1a73e8">● คุณอยู่ที่นี่</span><b>ความแม่นยำ ±${Math.round(p.acc)} ม.</b><small>ตำแหน่งนี้แสดงในเครื่องคุณเท่านั้น</small><div class="pp-actions"><button type="button" data-me-request>🆘 ขอความช่วยเหลือที่จุดนี้</button></div></div>`;
}
/* โหมดอาสา: จุดของเรา = ชื่อทีม + ตำแหน่ง เท่านั้น */
function meIcon(){
  ME.vol=isVolunteer;
  if(isVolunteer){const t=store.get('uh_team','')||'ทีมอาสา';return L.divIcon({className:'me-pin vol',html:`<span></span><em>${escH(t.slice(0,16))}</em>`,iconSize:[22,22],iconAnchor:[11,11],popupAnchor:[0,-10]})}
  return L.divIcon({className:'me-pin',html:'<span></span>',iconSize:[22,22],iconAnchor:[11,11],popupAnchor:[0,-10]});
}
function meUpdate(pos){
  if(!fmap||!window.L)return;
  const p=ME.pos={lat:pos.coords.latitude,lng:pos.coords.longitude,acc:pos.coords.accuracy||0};
  const ll=[p.lat,p.lng];meBtn(true);
  if(!ME.marker){
    ME.ring=L.circle(ll,{radius:p.acc,color:'#1a73e8',weight:1,fillColor:'#1a73e8',fillOpacity:.12,interactive:false}).addTo(fmap);
    ME.marker=L.marker(ll,{icon:meIcon(),zIndexOffset:4000,title:'ตำแหน่งของฉัน'}).bindPopup(mePopup).addTo(fmap);
  }else{ME.marker.setLatLng(ll);ME.ring.setLatLng(ll);ME.ring.setRadius(p.acc);if(ME.marker.setIcon&&ME.vol!==isVolunteer)ME.marker.setIcon(meIcon())}
  if(!ME.centered){ME.centered=true;fmap.setView(ll,Math.max(fmap.getZoom(),15));if(!isVolunteer&&ME.marker.openPopup)ME.marker.openPopup()}
}
document.getElementById('map-me-btn')&&document.getElementById('map-me-btn').addEventListener('click',()=>{
  if(!navigator.geolocation){typeof toast==='function'&&toast({title:'อุปกรณ์นี้ไม่รองรับการหาตำแหน่ง',tone:'warn'});return}
  if(ME.watch!=null){ // กดซ้ำ: ถ้ายังไม่อยู่กลางจอ ให้เลื่อนไปหา / ถ้าอยู่แล้วให้ปิด
    if(ME.pos&&fmap&&fmap.getCenter&&fmap.getCenter().distanceTo&&fmap.getCenter().distanceTo([ME.pos.lat,ME.pos.lng])>150){fmap.setView([ME.pos.lat,ME.pos.lng],Math.max(fmap.getZoom(),15));return}
    meStop();return;
  }
  meBtn(false,true);
  ME.watch=navigator.geolocation.watchPosition(meUpdate,err=>{
    meStop();
    typeof toast==='function'&&toast({title:err.code===1?'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง':'หาตำแหน่งไม่สำเร็จ',body:err.code===1?'เปิดสิทธิ์ตำแหน่งของเบราว์เซอร์ในการตั้งค่า แล้วลองอีกครั้ง':'ลองออกไปที่โล่ง หรือเปิด GPS แล้วลองใหม่',tone:'warn'});
  },{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
});
document.addEventListener('click',async e=>{
  if(!e.target.closest('[data-me-request]'))return;e.preventDefault();
  const p=ME.pos;if(!p)return;
  document.querySelector('.flood-map-wrap.is-full')&&document.getElementById('map-full-btn').click();
  setView('request');
  const m=await ensureRequestMap();if(typeof setRequestLocation==='function')setRequestLocation(p.lat,p.lng,true);
  const st=document.getElementById('location-status');if(st)st.textContent='ใช้ตำแหน่งปัจจุบันจากแผนที่แล้ว · ลากหมุดปรับได้';
});
