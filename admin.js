/* หลังบ้าน UM+: ดู/ค้นหา/เปลี่ยนสถานะเคส ใช้รหัสทีมอาสา (ไม่เก็บข้อมูลเคสไว้ในเครื่อง) */
const API_URL='https://script.google.com/macros/s/AKfycbyWeVDhToFJntjTGHprDEByEfRFdSbOidlR7QhJ6xG1bz7co2gCRkTGIoKDI9tJqGkWTw/exec';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ST={open:'รอความช่วยเหลือ',going:'ทีมกำลังไป',done:'ช่วยเหลือแล้ว'};
const URG={3:'วิกฤต',2:'เร่งด่วน',1:'ทั่วไป'};
const VUL={elderly:'ผู้สูงอายุ',child:'เด็กเล็ก',infant:'ทารก',pregnant:'หญิงตั้งครรภ์',disabled:'ผู้พิการ',bedridden:'ผู้ป่วยติดเตียง',oxygen:'ใช้ออกซิเจน / เครื่องช่วยหายใจ',dialysis:'ผู้ป่วยฟอกไต',chronic:'ผู้ป่วยโรคเรื้อรัง'};
const LEVEL={ankle:'ข้อเท้า',knee:'เข่า',waist:'เอว',chest:'อก',roof:'มิดหัว / หลังคา'};
const store={get(k){try{return localStorage.getItem(k)||sessionStorage.getItem(k)||''}catch(e){return ''}},
  set(k,v,remember){try{if(!v){localStorage.removeItem(k);sessionStorage.removeItem(k);return}(remember?localStorage:sessionStorage).setItem(k,v)}catch(e){}}};
const A={key:store.get('uh_vol_key'),cases:[],loaded:0,loading:false,mode:'list',map:null,layer:null,openId:null,rev:null};

const sev=c=>Math.min(3,Math.max(1,Number(c.urgency)||1));
const bagsOf=c=>c.bags===''||c.bags==null?null:Number(c.bags);
const bagSuggest=c=>hh(c)||1; // แนะนำ: ครัวเรือนละ 1 ถุง
const hh=c=>{const n=Number(c.households);if(n>0)return n;const m=String(c.notes||'').match(/\[ครัวเรือน (\d+)\]/);return m?+m[1]:0};
const vul=c=>(Array.isArray(c.vulnerable)?c.vulnerable:String(c.vulnerable||'').split(/\s*,\s*/)).filter(Boolean).map(v=>VUL[v]||v);
const notesOf=c=>String(c.notes||'').replace(/^\[ครัวเรือน \d+\]\s*/,'');
const tel=c=>String(c.phone||'').replace(/^'/,'').replace(/[^\d+]/g,'');
const hasPin=c=>c.lat!==''&&c.lat!=null&&c.lng!==''&&c.lng!=null&&!isNaN(+c.lat)&&!isNaN(+c.lng);
const addr=c=>[c.address,c.district?'เขต'+c.district:''].filter(Boolean).join(' · ');
/* ลิงก์นำทาง Google Maps: มีหมุดใช้พิกัด ไม่มีหมุดใช้ที่อยู่ · dir_action=navigate = เริ่มนำทางทันทีบนมือถือ */
const navUrl=c=>{const pin=c&&c.lat!==''&&c.lat!=null&&c.lng!==''&&c.lng!=null&&isFinite(+c.lat)&&isFinite(+c.lng),q=pin?`${(+c.lat).toFixed(6)},${(+c.lng).toFixed(6)}`:[c&&c.address,c&&c.district?'เขต'+c.district:''].filter(Boolean).join(' ');
  return q?'https://www.google.com/maps/dir/?api=1&dir_action=navigate&destination='+encodeURIComponent(pin?q:q+' กรุงเทพมหานคร'):''};
function ago(t){t=Number(t);if(!t)return '';const m=Math.round((Date.now()-t)/60000);if(m<1)return 'เมื่อสักครู่';if(m<60)return m+' นาทีที่แล้ว';const h=Math.round(m/60);if(h<24)return h+' ชม.ที่แล้ว';return new Date(t).toLocaleDateString('th-TH',{day:'numeric',month:'short'})+' '+new Date(t).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}
function fullTime(t){t=Number(t);return t?new Date(t).toLocaleString('th-TH',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'}):''}
function toast(msg,ok){const t=document.createElement('div');t.className='toast'+(ok?' ok':'');t.textContent=msg;$('#toasts').append(t);setTimeout(()=>t.remove(),4000)}

/* ---------- API ---------- */
async function api(params){const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),20000);
  try{const r=await fetch(API_URL+'?'+new URLSearchParams({...params,t:Date.now()}),{signal:ctl.signal,cache:'no-store'});return await r.json()}finally{clearTimeout(tm)}}
async function post(body){const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});return r.json()}

/* ---------- เข้าสู่ระบบ ---------- */
function showLogin(msg){$('#app').hidden=true;$('#login').hidden=false;$('#login-err').textContent=msg||'';setTimeout(()=>$('#login-key').focus(),50)}
function showApp(){$('#login').hidden=true;$('#app').hidden=false}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const k=$('#login-key').value.trim();if(!k)return;
  $('#login-go').disabled=true;$('#login-err').textContent='กำลังตรวจรหัส…';
  try{const r=await api({action:'list',key:k});
    if(r&&r.ok&&r.volunteer){A.key=k;store.set('uh_vol_key',k,$('#login-remember').checked);store.set('uh_vol_ok','1',$('#login-remember').checked);$('#login-key').value='';setCases(r);showApp();render();startPolling();loadFlood()}
    else $('#login-err').textContent='รหัสไม่ถูกต้อง';
  }catch(err){$('#login-err').textContent='เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'}
  finally{$('#login-go').disabled=false}});
$('#logout').addEventListener('click',()=>{store.set('uh_vol_key','');store.set('uh_vol_ok','');A.key='';A.cases=[];closeDrawer();$('#list').replaceChildren();showLogin('ออกจากระบบแล้ว')});

/* ---------- โหลดข้อมูล ---------- */
function setCases(r){A.cases=(r.cases||[]).map(c=>({...c,needs:Array.isArray(c.needs)?c.needs:String(c.needs||'').split(/\s*,\s*/).filter(Boolean)}));A.loaded=Date.now()}
async function load(){if(A.loading||!A.key)return;A.loading=true;$('#sync').textContent='กำลังโหลด…';
  try{const r=await api({action:'list',key:A.key});
    if(!r||!r.ok)throw new Error(r&&r.error||'error');
    if(!r.volunteer){store.set('uh_vol_key','');store.set('uh_vol_ok','');A.key='';showLogin('รหัสหมดอายุหรือถูกเปลี่ยน กรุณาเข้าสู่ระบบใหม่');return}
    setCases(r);render();
  }catch(e){$('#sync').textContent='โหลดไม่สำเร็จ · ลองใหม่'}
  finally{A.loading=false}}
let pollT=null;
function startPolling(){clearInterval(pollT);pollT=setInterval(async()=>{if(document.hidden||!A.key)return;
  try{const r=await api({action:'rev'});if(r&&r.ok&&r.rev!=null){if(A.rev!==null&&r.rev!==A.rev){A.rev=r.rev;load()}else A.rev=r.rev}}catch(e){}
  if(Date.now()-A.loaded>120000)load()},15000)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&A.key&&Date.now()-A.loaded>30000)load()});
$('#refresh').addEventListener('click',load);

/* ---------- กรอง / เรียง ---------- */
const norm=s=>{s=String(s==null?'':s);try{s=s.normalize('NFC')}catch(e){}return s.replace(/[​-‍﻿]/g,'').replace(/ํ([่-๋]?)า/g,'$1ำ').toLowerCase()};
const digits=x=>{let d=String(x||'').replace(/\D/g,'');if(d.startsWith('66')&&d.length>=11)d=d.slice(2);return d.replace(/^0+/,'')};
function hay(c){return norm([c.id,(c.needs||[]).join(' '),c.district,c.district?'เขต'+c.district:'',c.address,c.name,c.phone,c.notes,c.volunteer,ST[c.status],URG[sev(c)],LEVEL[c.level]||'',(c.people||1)+' คน',hh(c)?hh(c)+' ครัวเรือน':'',vul(c).join(' ')].join(' '))}
function filtered(){
  const q=norm($('#q').value.trim()),st=$('#f-status').value,u=$('#f-urg').value,nd=$('#f-need').value,so=$('#f-sort').value;
  return A.cases.filter(c=>{
    if(q){const h=hay(c);const ok=q.split(/\s+/).every(t=>{if(h.includes(t))return true;const d=digits(t);return /^[\d+\-\s]+$/.test(t)&&d.length>=3&&digits(c.phone).includes(d)});if(!ok)return false}
    if(st==='active'&&c.status==='done')return false;
    if(['open','going','done'].includes(st)&&c.status!==st)return false;
    if(u&&String(sev(c))!==u)return false;
    if(nd&&!(c.needs||[]).join(' ').includes(nd))return false;
    const fv=$('#f-vr').value;if(fv==='covered'){if(!cov(c))return false}else if(fv==='notcovered'){if(cov(c))return false}else if(fv&&vr(c).result.k!==fv)return false;
    return true}).sort((a,b)=>{const ca=Number(a.createdAt)||0,cb=Number(b.createdAt)||0;
      if(so==='new')return cb-ca;if(so==='old')return ca-cb;if(so==='ppl')return (Number(b.people)||1)-(Number(a.people)||1);
      if(so==='score')return ((a.status==='done')-(b.status==='done'))||(vr(b).score-vr(a).score)||(ca-cb);
      return ((a.status==='done')-(b.status==='done'))||(sev(b)-sev(a))||({open:0,going:1,done:2}[a.status]-{open:0,going:1,done:2}[b.status])||(ca-cb)});
}
['#q','#f-status','#f-urg','#f-need','#f-sort','#f-vr'].forEach(s=>$(s).addEventListener(s==='#q'?'input':'change',()=>{fCount();render()}));
function fCount(){const n=($('#f-status').value!=='active')+!!$('#f-urg').value+!!$('#f-need').value+!!$('#f-vr').value+($('#f-sort').value!=='urg');$('#f-n').textContent=n;$('#f-n').hidden=!n}
$('#f-toggle').addEventListener('click',()=>{const o=!$('#filters-box').classList.contains('open');$('#filters-box').classList.toggle('open',o);$('#f-toggle').setAttribute('aria-expanded',String(o))});

/* ---------- ตรวจสอบพื้นที่ (Floodboard + CCTV) ---------- */
const VR_ORDER={confirmed:5,likely:4,conflict:3,unverified:2,notcrit:1,nopin:0};
let vrCache=new Map();
function vr(c){const k=c.id+'|'+VERIFY.F.loaded+'|'+c.cctv+'|'+c.urgency+'|'+c.level+'|'+c.lat;const h=vrCache.get(c.id);if(h&&h.k===k)return h.v;const v=VERIFY.assess(c);vrCache.set(c.id,{k,v});return v}
async function loadFlood(force){try{await VERIFY.load(force)}catch(e){}render();if(typeof COVERED!=='undefined')COVERED.load(API_URL,A.key).then(render,render)}
const cov=c=>typeof COVERED!=='undefined'?COVERED.match(c):null;
function covBadge(c){const m=cov(c);if(!m)return '';const r=m.best.r;return `<span class="cov" title="${esc(r.org+' · '+r.area+' · '+r.date+' · '+m.best.how)}">🤝 ${esc(r.org)} รับแล้ว</span>`}
function covSection(c){const m=cov(c);if(!m)return '';return `<section class="cov-box"><b>🤝 พื้นที่นี้มีองค์กรอื่นรับไปแล้ว</b><p class="small">ตรวจสอบก่อนส่งทีม เพื่อไม่ให้ซ้ำซ้อน · ข้อมูลจาก<a href="${COVERED.SHEET_URL}" target="_blank" rel="noopener"> ชีตพื้นที่ที่มอบแล้ว ↗</a></p><ul>${m.all.slice(0,4).map(h=>`<li><b>${esc(h.r.org)}</b> · ${esc(h.r.area)} · ${esc(h.r.date)}<small>${esc(h.how)}${h.d!=null?' · ห่าง '+Math.round(h.d)+' ม.':''}${h.r.link?` · <a href="${esc(h.r.link)}" target="_blank" rel="noopener">แผนที่ ↗</a>`:''}</small></li>`).join('')}</ul></section>`}
setInterval(()=>{if(A.key&&!document.hidden)loadFlood()},10*60e3);
function vrBadge(c){const v=vr(c);return covBadge(c)+`<span class="vr vr-${v.result.k}" title="${esc(v.result.d)}">${esc(v.result.t)}</span><small class="vr-score">คะแนน ${v.score}/100</small>`}

/* ---------- แสดงผล ---------- */
function render(){
  const all=A.cases,n=s=>all.filter(c=>c.status===s).length,act=all.filter(c=>c.status!=='done');
  const ppl=act.reduce((s,c)=>s+(Number(c.people)||1),0),hhs=act.reduce((s,c)=>s+hh(c),0),crit=act.filter(c=>sev(c)===3).length,confirmed=act.filter(c=>vr(c).result.k==='confirmed').length,conflict=act.filter(c=>vr(c).result.k==='conflict').length;
  $('#stats').innerHTML=[['ทั้งหมด',all.length,''],['วิกฤต · ยืนยันแล้ว '+confirmed+(conflict?' · ขัดแย้ง '+conflict:''),crit,'red'],['รอความช่วยเหลือ',n('open'),'wait'],['ทีมกำลังไป',n('going'),'go'],['ช่วยเหลือแล้ว',n('done'),'done'],['คนที่ยังรอ',ppl,''],['ครัวเรือนที่ยังรอ',hhs||'–',''],['ถุงยังชีพที่ระบุแล้ว',all.reduce((s,c)=>s+(bagsOf(c)||0),0),'']]
    .map(([t,v,k])=>`<div class="stat ${k}"><b>${esc(v)}</b><span>${t}</span></div>`).join('');
  const list=filtered();
  $('#count').textContent=`แสดง ${list.length} จาก ${all.length} เคส`;
  $('#sync').textContent=(A.loaded?'อัปเดต '+new Date(A.loaded).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):'')+(VERIFY.F.error?' · '+VERIFY.F.error:VERIFY.F.loaded?' · น้ำท่วม '+new Date(VERIFY.F.loaded).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):'');
  if(A.mode==='list'){if(document.activeElement&&document.activeElement.matches('.bag-in')){A.pendingList=true}else renderList(list)}else drawMap(list);
  if(A.openId)renderDrawer();
}
function renderList(list){
  const el=$('#list');
  if(!list.length){el.innerHTML='<p class="empty">ไม่มีเคสที่ตรงกับตัวกรอง</p>';return}
  el.innerHTML=`<table class="tbl"><thead><tr><th>ระดับ</th><th>ตรวจพื้นที่</th><th>สถานะ</th><th>ความต้องการ</th><th>คน / ครัวเรือน</th><th>ถุงยังชีพ</th><th>ที่อยู่</th><th>ผู้ติดต่อ</th><th>ทีม</th><th>แจ้งเมื่อ</th><th></th></tr></thead><tbody>`+
    list.map(c=>{const t=tel(c);return `<tr class="u${sev(c)} s-${esc(c.status)}" data-id="${esc(c.id)}">
      <td data-l="ระดับ"><span class="urg urg-${sev(c)}">${URG[sev(c)]}</span></td>
      <td data-l="ตรวจพื้นที่" class="vr-cell">${c.status==='done'?'<small>—</small>':vrBadge(c)}</td>
      <td data-l="สถานะ"><select class="st-sel st-${esc(c.status)}" data-st="${esc(c.id)}" aria-label="สถานะเคส ${esc(c.id)}">${Object.entries(ST).map(([k,v])=>`<option value="${k}" ${c.status===k?'selected':''}>${v}</option>`).join('')}</select></td>
      <td data-l="ความต้องการ" class="needs"><b>${esc((c.needs||[]).join(' · ')||'ขอความช่วยเหลือ')}</b>${c.level?`<small>น้ำ${esc(LEVEL[c.level]||c.level)}</small>`:''}${vul(c).length?`<small class="vul">ดูแลพิเศษ: ${esc(vul(c).join(', '))}</small>`:''}</td>
      <td data-l="คน / ครัวเรือน" class="num">${esc(c.people||1)} คน${hh(c)?`<small>${hh(c)} ครัวเรือน</small>`:''}</td>
      <td data-l="ถุงยังชีพ" class="bag"><input class="bag-in" type="number" min="0" max="9999" inputmode="numeric" data-bag="${esc(c.id)}" value="${bagsOf(c)==null?'':bagsOf(c)}" placeholder="${bagSuggest(c)}" aria-label="จำนวนถุงยังชีพ เคส ${esc(c.id)}" title="ว่างไว้ = ยังไม่ระบุ (แนะนำ ${bagSuggest(c)} ถุง)"><small>ถุง</small></td>
      <td data-l="ที่อยู่" class="addr">${esc(addr(c)||'—')}${hasPin(c)?'':'<small class="warn">ไม่มีหมุด</small>'}</td>
      <td data-l="ผู้ติดต่อ">${esc(c.name||'')}${t.length>=9?`<a class="tel" href="tel:${esc(t)}">${esc(String(c.phone).replace(/^'/,''))}</a>`:esc(c.phone||'')}</td>
      <td data-l="ทีม">${esc(c.volunteer||'—')}</td>
      <td data-l="แจ้งเมื่อ" class="time" title="${esc(fullTime(c.createdAt))}">${esc(ago(c.createdAt))}<small>#${esc(c.id)}</small></td>
      <td class="act"><button class="btn ghost sm" data-open="${esc(c.id)}">ดู</button></td></tr>`}).join('')+'</tbody></table>';
}
$('#list').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b){openDrawer(b.dataset.open);return}
  if(e.target.closest('a,select,button'))return;const tr=e.target.closest('tr[data-id]');if(tr)openDrawer(tr.dataset.id)});
$('#list').addEventListener('change',e=>{const b=e.target.closest('[data-bag]');if(b){saveBags(b.dataset.bag,b.value,b);return}const s=e.target.closest('[data-st]');if(s)changeStatus(s.dataset.st,s.value,s)});
$('#list').addEventListener('focusout',e=>{if(e.target.matches('.bag-in')&&A.pendingList){A.pendingList=false;setTimeout(()=>{if(!document.activeElement||!document.activeElement.matches('.bag-in'))render()},0)}});
$('#list').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('.bag-in'))e.target.blur()});
/* ---------- ถุงยังชีพ ---------- */
async function saveBags(id,val,inp){
  const c=A.cases.find(x=>String(x.id)===String(id));if(!c)return;
  const v=String(val).trim()===''?'':Math.max(0,Math.min(9999,Math.round(Number(val)||0)));
  if(String(v)===String(c.bags==null?'':c.bags))return;
  const prev=c.bags;c.bags=v;if(inp)inp.disabled=true;
  try{const r=await post({action:'update',key:A.key,id,status:c.status,volunteer:c.volunteer||'',bags:v,bagsOnly:true});
    if(!r||!r.ok){if(r&&r.error==='not_volunteer'){showLogin('รหัสหมดอายุ กรุณาเข้าสู่ระบบใหม่');return}throw new Error(r&&r.error)}
    if(!r.bagsSupported){c.bags=prev;toast('ยังบันทึกถุงยังชีพไม่ได้ ต้องอัปเดต Code.gs ก่อน');render();return}
    toast(v===''?`เคส #${id} · ล้างจำนวนถุงแล้ว`:`เคส #${id} · ถุงยังชีพ ${v} ถุง`,true);render()}
  catch(e){c.bags=prev;render();toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')}
  finally{if(inp)inp.disabled=false}}

/* ---------- เปลี่ยนสถานะ ---------- */
async function changeStatus(id,status,sel,team){
  const c=A.cases.find(x=>String(x.id)===String(id));if(!c)return;
  if(status===c.status&&!team)return;
  if(status==='going'&&!team){team=prompt('ชื่อทีมที่รับเคสนี้',c.volunteer||store.get('uh_team'));if(team===null){if(sel)sel.value=c.status;return}team=team.trim();if(!team){toast('ต้องใส่ชื่อทีมก่อนรับเคส');if(sel)sel.value=c.status;return}}
  if(team)store.set('uh_team',team,true);
  const prev={status:c.status,volunteer:c.volunteer};c.status=status;if(status==='open')c.volunteer='';else if(team)c.volunteer=team;render();
  try{const r=await post({action:'update',key:A.key,id,status,volunteer:team||c.volunteer||''});
    if(!r||!r.ok){if(r&&r.error==='not_volunteer'){showLogin('รหัสหมดอายุ กรุณาเข้าสู่ระบบใหม่');return}throw new Error(r&&r.error)}
    toast(`เคส #${id} → ${ST[status]}`,true)}
  catch(e){Object.assign(c,prev);render();toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')}
}

/* ---------- ส่วนตรวจสอบพื้นที่ในรายละเอียดเคส ---------- */
function agoT(t){return t?ago(t):''}
function vrSection(c){
  const v=vr(c),cc=v.cctv,ll=hasPin(c)?`${(+c.lat).toFixed(5)},${(+c.lng).toFixed(5)}`:'';
  const rd=v.road,reps=v.reports.slice(0,3);
  return `<section class="vr-box vr-b-${v.result.k}">
    <div class="vr-top"><div><small>ผลตรวจพื้นที่ (ช่วยตัดสินใจ)</small><b>${esc(v.result.t)}</b><p>${esc(v.result.d)}</p></div><div class="vr-num"><b>${v.score}</b><small>/100</small></div></div>
    <div class="vr-bars"><div><span>ข้อมูลผู้แจ้ง</span><i style="width:${v.R*2}%"></i><em>${v.R}/50</em></div><div><span>หลักฐานน้ำท่วม + กล้อง</span><i class="${v.E<0?'neg':''}" style="width:${Math.abs(v.E)*2}%"></i><em>${v.E>0?'+':''}${Math.round(v.E)}/50</em></div></div>
    <ul class="vr-ev">${v.ev.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    ${rd?`<p class="vr-src">ถนนใกล้สุด: <b>${esc(rd.name)}</b> · อัปเดต ${esc(agoT(rd.updated))}${rd.sources&&rd.sources.length?' · แหล่ง: '+esc(rd.sources.join(', ')):''}</p>`:''}
    ${reps.length?`<ul class="vr-reps">${reps.map(r=>`<li><b>${Math.round(r.d)} ม.</b> · ${esc(agoT(r.t))}${r.depth!=null?` · ลึก ${r.depth} ซม.`:''} · ${esc(r.source)}${r.text?` — ${esc(r.text.slice(0,90))}${r.text.length>90?'…':''}`:''}${/^https?:\/\//.test(r.url)?` <a href="${esc(r.url)}" target="_blank" rel="noopener">ที่มา</a>`:''}</li>`).join('')}</ul>`:''}
    <div class="vr-cctv"><span>ตรวจจากกล้อง CCTV:</span> <b>${cc?(cc.s==='flood'?'เห็นน้ำท่วม':'ไม่เห็นน้ำท่วม')+(cc.t?' · '+esc(cc.t):''):'ยังไม่ได้ตรวจ'}</b>
      <div class="vr-cctv-btns"><button class="btn ${cc&&cc.s==='flood'?'primary':'ghost'} sm" data-cctv="flood">กล้องเห็นน้ำท่วม</button><button class="btn ${cc&&cc.s==='clear'?'primary':'ghost'} sm" data-cctv="clear">กล้องไม่เห็นน้ำ</button>${cc?'<button class="btn ghost sm" data-cctv="">ล้างผล</button>':''}</div>
      <div class="vr-links"><a href="https://world.tehx.dyndns.info/flood#tab=roads" target="_blank" rel="noopener">เปิดกล้อง CCTV ถนน (JK World) ↗</a><a href="https://world.tehx.dyndns.info/flood#tab=area" target="_blank" rel="noopener">แถวนี้ท่วมมั้ย ↗</a><a href="https://www.floodboard.org/#map" target="_blank" rel="noopener">แผนที่น้ำท่วม Floodboard ↗</a>${ll?`<button type="button" class="linkish" data-copyll="${ll}">คัดลอกพิกัด ${ll}</button>`:''}</div>
    </div>
    <p class="vr-note">คำนวณจากข้อมูลผู้แจ้ง + ถนนน้ำท่วมและรายงานจาก Floodboard (ในรัศมี 1 กม. · 3 วัน) + ผลดูกล้องที่แอดมินบันทึก ไม่มีข้อมูลใกล้จุด ≠ ไม่ท่วม</p>
  </section>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-copyll]');if(!b)return;(navigator.clipboard?navigator.clipboard.writeText(b.dataset.copyll):Promise.reject()).then(()=>toast('คัดลอกพิกัดแล้ว ใช้ค้นหากล้องใกล้จุดได้',true)).catch(()=>toast('คัดลอกไม่สำเร็จ'))});
async function saveCctv(id,val){
  const c=A.cases.find(x=>String(x.id)===String(id));if(!c)return;
  const prev=c.cctv,now=new Date();c.cctv=val?val+'|'+now.toLocaleDateString('sv-SE')+' '+now.toTimeString().slice(0,5):'';render();
  try{const r=await post({action:'update',key:A.key,id,status:c.status,volunteer:c.volunteer||'',cctv:val,metaOnly:true});
    if(!r||!r.ok){if(r&&r.error==='not_volunteer'){showLogin('รหัสหมดอายุ กรุณาเข้าสู่ระบบใหม่');return}throw new Error(r&&r.error)}
    if(!r.bagsSupported){c.cctv=prev;render();toast('ยังบันทึกผลกล้องไม่ได้ ต้องอัปเดต Code.gs ก่อน');return}
    toast(val?`บันทึกผลกล้องแล้ว · ${vr(c).result.t}`:'ล้างผลกล้องแล้ว',true)}
  catch(e){c.cctv=prev;render();toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')}}

/* ---------- รายละเอียด ---------- */
function openDrawer(id){A.openId=String(id);renderDrawer();$('#drawer').hidden=false;$('#drawer-bg').hidden=false;document.body.classList.add('noscroll')}
function closeDrawer(){A.openId=null;$('#drawer').hidden=true;$('#drawer-bg').hidden=true;document.body.classList.remove('noscroll')}
$('#drawer-bg').addEventListener('click',closeDrawer);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&A.openId)closeDrawer()});
function renderDrawer(){
  const c=A.cases.find(x=>String(x.id)===A.openId),d=$('#drawer');if(!c){closeDrawer();return}
  const t=tel(c),rows=[['ระดับ',URG[sev(c)]],['สถานะ',ST[c.status]||c.status],['ความต้องการ',(c.needs||[]).join(', ')||'-'],['จำนวนคน',(c.people||1)+' คน'],['ถุงยังชีพ',bagsOf(c)==null?`ยังไม่ระบุ (แนะนำ ${bagSuggest(c)} ถุง)`:bagsOf(c)+' ถุง'],['ครัวเรือน / ครอบครัว',hh(c)?hh(c)+' ครัวเรือน':'ไม่ระบุ'],['ระดับน้ำ',LEVEL[c.level]||'ไม่ระบุ'],
    ['ที่อยู่ / จุดสังเกต',addr(c)||'-'],['พิกัด',hasPin(c)?`${(+c.lat).toFixed(6)}, ${(+c.lng).toFixed(6)}`:'ไม่ได้ปักหมุด'],['ผู้ติดต่อ',c.name||'-'],['เบอร์โทร',String(c.phone||'-').replace(/^'/,'')],
    ['ต้องดูแลเป็นพิเศษ',vul(c).join(', ')||'-'],['ทีมที่รับเคส',c.volunteer||'-'],['แจ้งเมื่อ',fullTime(c.createdAt)],['อัปเดตล่าสุด',fullTime(c.updatedAt)]];
  d.innerHTML=`<div class="d-head"><div><span class="urg urg-${sev(c)}">${URG[sev(c)]}</span> <span class="st st-${esc(c.status)}">${esc(ST[c.status]||'')}</span><h2>${esc((c.needs||[]).join(' · ')||'ขอความช่วยเหลือ')}</h2><small>#${esc(c.id)}</small></div><button class="x" id="d-close" aria-label="ปิด">✕</button></div>
    ${notesOf(c)?`<div class="d-notes"><b>สถานการณ์</b><p>${esc(notesOf(c))}</p></div>`:''}
    ${covSection(c)}${vrSection(c)}
    <dl class="d-rows">${rows.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="d-act">
      ${t.length>=9?`<a class="btn primary" href="tel:${esc(t)}">โทรหาผู้แจ้ง</a>`:''}
      ${navUrl(c)?`<a class="btn ghost" target="_blank" rel="noopener" href="${esc(navUrl(c))}">🧭 ${hasPin(c)?'นำทาง Google Maps':'นำทางตามที่อยู่'}</a>`:''}
      <button class="btn ghost" id="d-copy">คัดลอกข้อมูลเคส</button>
    </div>
    <fieldset class="d-status"><legend>เปลี่ยนสถานะ</legend>
      <input id="d-team" placeholder="ชื่อทีม / อาสา" value="${esc(c.volunteer||store.get('uh_team'))}" maxlength="60">
      <div class="d-st-btns">${Object.entries(ST).map(([k,v])=>`<button class="btn ${c.status===k?'primary':'ghost'}" data-dst="${k}">${v}</button>`).join('')}</div>
    </fieldset>`;
  $('#d-close').onclick=closeDrawer;
  d.querySelectorAll('[data-cctv]').forEach(b=>b.onclick=()=>saveCctv(c.id,b.dataset.cctv));
  $('#d-copy').onclick=()=>{const txt=[`เคส #${c.id} · ${URG[sev(c)]} · ${ST[c.status]}`,`ต้องการ: ${(c.needs||[]).join(', ')}`,`${c.people||1} คน${hh(c)?' · '+hh(c)+' ครัวเรือน':''}${c.level?' · น้ำ'+(LEVEL[c.level]||''):''}`,`ที่อยู่: ${addr(c)||'-'}`,hasPin(c)?`แผนที่: https://maps.google.com/?q=${c.lat},${c.lng}`:'',vul(c).length?`ดูแลพิเศษ: ${vul(c).join(', ')}`:'',`ติดต่อ: ${[c.name,String(c.phone||'').replace(/^'/,'')].filter(Boolean).join(' ')}`,notesOf(c)?`สถานการณ์: ${notesOf(c)}`:''].filter(Boolean).join('\n');
    (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('คัดลอกแล้ว',true)).catch(()=>toast('คัดลอกไม่สำเร็จ'))};
  d.querySelectorAll('[data-dst]').forEach(b=>b.onclick=()=>{const team=$('#d-team').value.trim();if(b.dataset.dst==='going'&&!team){toast('ใส่ชื่อทีมก่อนรับเคส');$('#d-team').focus();return}changeStatus(c.id,b.dataset.dst,null,b.dataset.dst==='open'?'':team)});
}

/* ---------- มุมมอง รายการ / แผนที่ ---------- */
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{A.mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));
  $('#list').hidden=A.mode!=='list';$('#map-wrap').hidden=A.mode!=='map';render()}));
let leafletP=null;
function loadLeaflet(){if(window.L)return Promise.resolve();if(leafletP)return leafletP;leafletP=new Promise((res,rej)=>{
  const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';css.integrity='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';css.crossOrigin='';document.head.append(css);
  const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';s.crossOrigin='';s.onload=res;s.onerror=()=>{leafletP=null;rej()};document.head.append(s)});return leafletP}
async function drawMap(list){
  try{await loadLeaflet()}catch(e){$('#map').innerHTML='<p class="empty">โหลดแผนที่ไม่สำเร็จ</p>';return}
  if(!A.map){A.map=L.map('map',{preferCanvas:true}).setView([13.7563,100.5018],11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(A.map);A.flood=L.layerGroup().addTo(A.map);A.layer=L.layerGroup().addTo(A.map);A.fitted=false}
  if(A.floodDrawn!==VERIFY.F.loaded){A.floodDrawn=VERIFY.F.loaded;A.flood.clearLayers();VERIFY.F.roads.forEach(r=>{const d=r.depth||0,v=r.verdict,col=v==='blocked'||r.closed||d>=50?'#c62828':v==='risky'||d>=30?'#ef6c00':v==='caution'||d>=10?'#f9a825':'#1e88e5';r.lines.forEach(l=>L.polyline(l.map(p=>[p[1],p[0]]),{color:col,weight:5,opacity:.8}).bindTooltip(`${r.name}${r.depth!=null?' · ~'+r.depth+' ซม.':''}`).addTo(A.flood))})}
  setTimeout(()=>A.map.invalidateSize(),50);A.layer.clearLayers();const pts=[];
  list.filter(hasPin).forEach(c=>{const col=c.status==='done'?'#2e9e57':c.status==='going'?'#2b6cb0':sev(c)===3?'#d32f2f':sev(c)===2?'#f57c00':'#e0a800';pts.push([+c.lat,+c.lng]);
    L.circleMarker([+c.lat,+c.lng],{radius:sev(c)===3&&c.status!=='done'?10:8,color:'#fff',weight:2,fillColor:col,fillOpacity:.95}).bindTooltip(`${URG[sev(c)]} · ${vr(c).result.t} · ${(c.needs||[]).join(', ')} · ${c.people||1} คน`).on('click',()=>openDrawer(c.id)).addTo(A.layer)});
  if(pts.length&&!A.fitted){A.map.fitBounds(pts,{padding:[40,40],maxZoom:14});A.fitted=true}
  const miss=list.length-pts.length;$('#count').textContent+=miss?` · ${miss} เคสไม่มีหมุด (ดูในรายการ)`:'';
}

/* ---------- ส่งออก CSV ---------- */
$('#export').addEventListener('click',()=>{const list=filtered();
  const head=['เลขเคส','แจ้งเมื่อ','ระดับ','สถานะ','ความต้องการ','จำนวนคน','ครัวเรือน','ถุงยังชีพ','ระดับน้ำ','ที่อยู่','เขต','lat','lng','ชื่อ','เบอร์โทร','ทีม','ต้องดูแลเป็นพิเศษ','ผลตรวจพื้นที่','คะแนนวิกฤต','องค์กรอื่นรับแล้ว','สถานการณ์'];
  const rows=list.map(c=>[c.id,fullTime(c.createdAt),URG[sev(c)],ST[c.status],(c.needs||[]).join(', '),c.people||1,hh(c)||'',bagsOf(c)==null?'':bagsOf(c),LEVEL[c.level]||'',c.address,c.district,c.lat,c.lng,c.name,String(c.phone||'').replace(/^'/,''),c.volunteer,vul(c).join(', '),vr(c).result.t,vr(c).score,(cov(c)?cov(c).best.r.org+' · '+cov(c).best.r.area:''),notesOf(c)]);
  const cell=v=>{let s=String(v==null?'':v);if(/^[=+\-@]/.test(s))s="'"+s;return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const csv='﻿'+[head,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`umplus-cases-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  toast(`ส่งออก ${list.length} เคสแล้ว · ไฟล์มีข้อมูลส่วนตัว เก็บให้ปลอดภัย`,true)});

/* ---------- เริ่ม ---------- */
if(A.key){showApp();load().then(()=>{if(A.key){startPolling();loadFlood()}})}else showLogin();
