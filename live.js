/* ============================================================
   UM+ live: ตำแหน่งทีมอาสาแบบเรียลไทม์ + แจ้งเตือน pop up
   - อาสา (มีรหัส): แชร์ตำแหน่งทีม, เห็นทีมอื่นบนแผนที่, เด้งเตือนเมื่อมีเคสใหม่
   - ผู้แจ้ง: เด้งเตือนเมื่อทีมรับเคส และทีมอยู่พื้นที่ไหน / ห่างกี่ กม.
   ============================================================ */
const LIVE={watch:null,lastSent:0,lastPos:null,sending:false,teams:[],teamLayer:null,seen:null,audio:null,track:{}};
const SEND_MIN_MS=25000, SEND_MAX_MS=120000, SEND_MIN_M=60;

/* ---------- API ---------- */
async function apiTeams(){
  const k=isVolunteer?store.get('uh_vol_key',''):'';
  const r=await fetch(API_URL+'?action=teams'+(k?'&key='+encodeURIComponent(k):'')+'&t='+Math.floor(Date.now()/30000));return r.json();
}
/* คนทั่วไปเห็นทีมกู้ภัยเมื่อกดชิป 🚑 ทีมกู้ภัย, อาสาเห็นตลอด */
function wantTeams(){return isVolunteer||(typeof layerPrefs==='function'&&!!layerPrefs().rescue)}
function apiPing(extra){return apiPost({action:'ping',key:store.get('uh_vol_key',''),team:store.get('uh_team',''),caseId:store.get('uh_cur_case',''),...extra})}
function apiTrack(m){return apiPost({action:'track',id:m.id||'',clientId:m.cid||'',token:m.token})}
const mk=m=>m.cid||m.id;

/* ---------- pop up (toast) ---------- */
function toastRoot(){
  let el=document.getElementById('toasts');
  if(!el){el=document.createElement('div');el.id='toasts';el.className='toasts';el.setAttribute('aria-live','polite');document.body.append(el)}
  return el;
}
function toast({title,body='',tone='info',actionText,onAction,timeout=15000,key,status,caseId}){
  const root=toastRoot();
  if(key){const old=root.querySelector(`[data-key="${CSS.escape(key)}"]`);if(old)old.remove()}
  const t=document.createElement('div');t.className='toast '+tone;t.setAttribute('role','status');if(key)t.dataset.key=key;
  const txt=document.createElement('div');txt.className='toast-text';
  if(status){const row=document.createElement('div');row.className='toast-status';const st=document.createElement('span');st.className='status '+(status==='sos'?'':STATUS_CLASS[status]||'wait');st.textContent=status==='sos'?'SOS · รอความช่วยเหลือ':STATUS_TH[status]||status;row.append(st);if(caseId){const i=document.createElement('small');i.textContent='#'+caseId;row.append(i)}txt.append(row)}
  const h=document.createElement('strong');h.textContent=title;txt.append(h);
  if(body){const p=document.createElement('p');p.textContent=body;txt.append(p)}
  t.append(txt);
  if(actionText){const b=document.createElement('button');b.type='button';b.className='toast-action';b.textContent=actionText;b.onclick=()=>{t.remove();onAction&&onAction()};t.append(b)}
  const x=document.createElement('button');x.type='button';x.className='toast-close';x.setAttribute('aria-label','ปิด');x.textContent='×';x.onclick=()=>t.remove();t.append(x);
  root.prepend(t);
  while(root.children.length>3)root.lastChild.remove();
  if(timeout)setTimeout(()=>t.remove(),timeout);
  return t;
}
/* เสียง + สั่น + แจ้งเตือนระบบ (เมื่อไม่ได้เปิดหน้าเว็บอยู่) */
document.addEventListener('pointerdown',()=>{try{if(!LIVE.audio)LIVE.audio=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}},{once:true});
function beep(){
  try{const a=LIVE.audio;if(!a)return;a.resume&&a.resume();
    [0,0.22].forEach(d=>{const o=a.createOscillator(),g=a.createGain();o.frequency.value=880;g.gain.setValueAtTime(0.0001,a.currentTime+d);g.gain.exponentialRampToValueAtTime(0.25,a.currentTime+d+0.02);g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+d+0.18);o.connect(g).connect(a.destination);o.start(a.currentTime+d);o.stop(a.currentTime+d+0.2)});
  }catch(e){}
  try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}
}
async function sysNotify(title,body,tag,hash){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const opt={body,tag,renotify:true,icon:'./assets/icon-192.png',badge:'./assets/icon-192.png',data:{hash:hash||''}};
  try{const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();if(reg){await reg.showNotification(title,opt);return}}catch(e){}
  try{new Notification(title,opt)}catch(e){}
}
function alertUser(o){
  toast(o);beep();
  if(document.hidden)sysNotify(o.title,o.body||'',o.key||'umplus',o.hash);
}
function notifySupported(){return 'Notification' in window}
async function askNotify(){
  if(!notifySupported())return 'unsupported';
  if(Notification.permission==='default'){try{await Notification.requestPermission()}catch(e){}}
  return Notification.permission;
}
function notifyButton(label){
  if(!notifySupported()||Notification.permission!=='default')return null;
  const b=document.createElement('button');b.type='button';b.className='secondary-button notify-btn';b.textContent=label||'🔔 เปิดการแจ้งเตือน';
  b.onclick=async()=>{const p=await askNotify();b.textContent=p==='granted'?'✓ เปิดการแจ้งเตือนแล้ว':'ไม่ได้รับอนุญาต (เปิดได้ที่ตั้งค่าเบราว์เซอร์)';b.disabled=true};
  return b;
}

/* ============================================================
   1) ทีมอาสา: แชร์ตำแหน่งแบบเรียลไทม์
   ============================================================ */
function isSharing(){return LIVE.watch!=null}
function distM(a,b){const R=6371000,r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2),y=Math.sin((b.lng-a.lng)*r/2);return 2*R*Math.asin(Math.sqrt(x*x+Math.cos(a.lat*r)*Math.cos(b.lat*r)*y*y))}
function startSharing(){
  if(!isVolunteer)return;
  if(!store.get('uh_team','')){toast({title:'ใส่ชื่อทีมก่อน',body:'พิมพ์ชื่อทีมในช่อง "ชื่อทีม" แล้วกดเริ่มแชร์อีกครั้ง',tone:'warn'});return}
  if(!navigator.geolocation){toast({title:'อุปกรณ์นี้ไม่รองรับตำแหน่ง',tone:'warn'});return}
  if(isSharing())return;
  store.set('uh_sharing','1');
  LIVE.watch=navigator.geolocation.watchPosition(onPos,err=>{
    if(err.code===1){stopSharing(true);toast({title:'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง',body:'เปิดสิทธิ์ตำแหน่งของเบราว์เซอร์ แล้วลองใหม่',tone:'warn'})}
  },{enableHighAccuracy:true,maximumAge:15000,timeout:30000});
  renderShareChip();refreshLiveControls();
}
async function stopSharing(silent){
  if(LIVE.watch!=null){navigator.geolocation.clearWatch(LIVE.watch);LIVE.watch=null}
  store.set('uh_sharing','');LIVE.lastPos=null;LIVE.lastSent=0;
  renderShareChip();refreshLiveControls();
  if(!silent)try{await apiPing({stop:true})}catch(e){}
  loadTeams();
}
async function onPos(pos){
  const p={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy||0)};
  const now=Date.now(),since=now-LIVE.lastSent;
  const moved=LIVE.lastPos?distM(LIVE.lastPos,p):Infinity;
  if(LIVE.sending||(LIVE.lastSent&&(since<SEND_MIN_MS||(moved<SEND_MIN_M&&since<SEND_MAX_MS))))return;
  LIVE.sending=true;
  try{
    const r=await apiPing({lat:+p.lat.toFixed(6),lng:+p.lng.toFixed(6),accuracy:p.accuracy});
    if(r.ok){LIVE.lastSent=now;LIVE.lastPos=p;renderShareChip()}
    else if(r.error==='not_volunteer'){stopSharing(true)}
  }catch(e){}finally{LIVE.sending=false}
}
/* ส่งซ้ำเป็นระยะแม้ไม่ได้ขยับ (ให้ผู้แจ้งเห็นว่ายังออนไลน์) */
setInterval(()=>{if(isSharing()&&LIVE.lastPos&&Date.now()-LIVE.lastSent>=SEND_MAX_MS)onPos({coords:{latitude:LIVE.lastPos.lat,longitude:LIVE.lastPos.lng,accuracy:LIVE.lastPos.accuracy}})},30000);

/* ไม่แสดงแถบลอย "แชร์ตำแหน่งทีม" แล้ว (ควบคุมการแชร์ได้ในแผงทีมอาสา) — แสดงแค่จุดเขียวเล็ก ๆ ที่สวิตช์ทีมอาสา */
function renderShareChip(){
  const chip=document.getElementById('share-chip');if(chip)chip.remove();
  const sw=document.getElementById('vol-switch');if(sw)sw.classList.toggle('sharing',isSharing());
}

/* ปุ่มในแผง "สำหรับทีมอาสา" */
function liveControls(){
  const box=document.createElement('div');box.className='live-box';box.id='live-box';
  fillLiveControls(box);return box;
}
function refreshLiveControls(){const box=document.getElementById('live-box');if(box)fillLiveControls(box)}
function fillLiveControls(box){
  box.replaceChildren();
  const h=document.createElement('strong');h.textContent='ตำแหน่งทีม (เรียลไทม์)';
  const team=document.createElement('input');team.className='team-input';team.placeholder='ชื่อทีม / อาสา';team.value=store.get('uh_team','');team.setAttribute('aria-label','ชื่อทีม');
  team.onchange=()=>{store.set('uh_team',team.value.trim());renderVolunteerBar();if(typeof ME!=='undefined'&&ME.marker&&ME.marker.setIcon)ME.marker.setIcon(meIcon())};
  const btn=document.createElement('button');btn.type='button';
  if(isSharing()){btn.className='secondary-button';btn.textContent='หยุดแชร์ตำแหน่ง';btn.onclick=()=>stopSharing()}
  else{btn.className='solid-button';btn.textContent='📍 เริ่มแชร์ตำแหน่งทีม';btn.onclick=()=>{const t=team.value.trim();if(!t){team.focus();team.placeholder='ใส่ชื่อทีมก่อน';return}store.set('uh_team',t);startSharing()}}
  box.append(h,team,btn);
  /* เว็บส่งตำแหน่งได้เฉพาะตอนเปิดหน้าค้าง → แนะนำให้แชร์ตำแหน่งสดจาก Google Maps ซึ่งส่งต่อแม้ล็อกจอ */
  const gm=document.createElement('details');gm.className='gm-share';
  gm.innerHTML=`<summary>📍 แชร์ผ่าน Google Maps (ส่งต่อแม้ล็อกจอ)</summary>
    <ol><li>แตะ <b>เปิด Google Maps</b> → รูปโปรไฟล์ → <b>การแชร์ตำแหน่ง</b> → <b>แชร์ตำแหน่ง</b></li>
    <li>ตั้งเวลา <b>จนกว่าคุณจะปิด</b> → <b>คัดลอกไปยังคลิปบอร์ด</b></li>
    <li>วางลิงก์ที่ทีมของคุณในหน้า <a href="./admin/teams/" target="_blank" rel="noopener">จัดทีม</a> (หรือส่ง LINE ให้แอดมิน)</li></ol>
    <a class="secondary-button" href="https://www.google.com/maps" target="_blank" rel="noopener">เปิด Google Maps</a>`;
  box.append(gm);
  const nb=notifyButton('🔔 เปิดแจ้งเตือนเคสใหม่');if(nb)box.append(nb);
}

/* ตำแหน่งทีมบนแผนที่ (เฉพาะอาสา) */
async function loadTeams(){
  if(!wantTeams()){drawTeamMarkers();return}
  try{const r=await apiTeams();if(r.ok){LIVE.teams=r.teams||[];LIVE.teamsLoaded=Date.now();drawTeamMarkers();if(typeof renderLayerChips==='function')renderLayerChips()}}catch(e){}
}
function drawTeamMarkers(){
  if(typeof fmap==='undefined'||!fmap||!window.L)return;
  if(!LIVE.teamLayer)LIVE.teamLayer=L.layerGroup().addTo(fmap);
  LIVE.teamLayer.clearLayers();
  if(!wantTeams())return;
  const me=isVolunteer?store.get('uh_team',''):'';
  LIVE.teams.forEach(t=>{
    const mine=t.team===me;
    const icon=L.divIcon({className:'team-pin live'+(mine?' mine':''),html:`<span>🚑</span><em>${escH(String(t.team||'').slice(0,14))}</em>`,iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-16]});
    L.marker([t.lat,t.lng],{icon,zIndexOffset:2000,title:'ทีม '+t.team})
      .bindPopup(`<span class="pp-type" style="color:#1f5fbf">🚑 อาสากู้ภัย · ตำแหน่งสด</span><br><b>ทีม ${escH(t.team)}</b>${mine?' (ทีมของคุณ)':''}<br>อัปเดต ${escH(ago(t.updatedAt))}${isVolunteer&&t.caseId?`<br>กำลังไปเคส <a href="#" data-open-case="${escH(t.caseId)}">#${escH(t.caseId)}</a>`:t.busy?'<br>กำลังออกช่วยเหลือ':''}`)
      .addTo(LIVE.teamLayer);
  });
}

/* ============================================================
   2) อาสา: pop up เมื่อมีเคสใหม่เข้ามา
   ============================================================ */
function checkNewCases(){
  if(!isVolunteer||!lastLoaded)return;
  if(LIVE.seen==null){
    let arr=[];try{arr=JSON.parse(store.get('uh_seen','[]'))}catch(e){}
    LIVE.seen=new Set(arr);
    if(!arr.length){cases.forEach(c=>LIVE.seen.add(c.id));saveSeen();return} // ครั้งแรก: ไม่เด้งเคสเก่า
  }
  const fresh=cases.filter(c=>!LIVE.seen.has(c.id));
  if(!fresh.length)return;
  fresh.forEach(c=>LIVE.seen.add(c.id));saveSeen();
  const open=fresh.filter(c=>c.status==='open').sort((a,b)=>Number(b.urgency)-Number(a.urgency));
  if(!open.length)return;
  const c=open[0],sos=Number(c.urgency)===3;
  const area=c.district?'เขต'+c.district:(c.address?String(c.address).slice(0,40):'');
  alertUser({
    key:'newcase',tone:sos?'danger':'info',
    title:(sos?'🚨 เคสด่วนมาก':'🆕 มีเคสผู้ประสบภัยเข้ามา')+(open.length>1?` (+${open.length-1})`:''),
    body:`${(c.needs||[]).join(' · ')||'ขอความช่วยเหลือ'} · ${c.people||1} คน${area?' · '+area:''}`,
    status:sos?'sos':'open',caseId:c.id,
    actionText:'ดูเคส',onAction:()=>openCase(c.id),hash:'map',timeout:30000
  });
}
function saveSeen(){store.set('uh_seen',JSON.stringify([...LIVE.seen].slice(-800)))}

/* ============================================================
   3) ผู้แจ้ง: ติดตามเคสของตัวเอง
   ============================================================ */
function myCases(){try{return JSON.parse(store.get('uh_my_cases','[]'))||[]}catch(e){return []}}
function saveMyCases(a){store.set('uh_my_cases',a.length?JSON.stringify(a.slice(-5)):'')}
function rememberMyCase(id,token,cid){
  if((!id&&!cid)||!token||id==='ignored')return;
  const a=myCases().filter(x=>!((cid&&x.cid===cid)||(id&&x.id===id)));a.push({id:id||'',cid:cid||'',token,t:Date.now(),status:'open'});saveMyCases(a);
  renderMyCase();setTimeout(pollMyCases,3000);
}
function forgetMyCase(k){saveMyCases(myCases().filter(x=>mk(x)!==k));delete LIVE.track[k];renderMyCase()}
function kmText(km){if(km==null)return '';if(km<1)return 'ใกล้ถึงแล้ว (ไม่ถึง 1 กม.)';return 'ห่างประมาณ '+km.toLocaleString('th-TH',{maximumFractionDigits:1})+' กม.'}
async function pollMyCases(){
  const list=myCases().filter(x=>x.status!=='done'&&Date.now()-x.t<7*864e5);
  if(!list.length)return;
  let changed=false;
  for(const m of list){
    let r;try{r=await apiTrack(m)}catch(e){continue}
    if(!r||!r.ok){if(r&&(r.error==='forbidden'||(r.error==='not_found'&&m.id))){forgetMyCase(mk(m))}continue}
    if(r.status==='queued')r.status='open';if(r.id&&!m.id){m.id=r.id;changed=true}
    const prev=LIVE.track[mk(m)]||{status:m.status,volunteer:m.volunteer||'',area:m.area||'',km:m.km};
    LIVE.track[mk(m)]=r;
    const team=r.volunteer||'ทีมอาสา';
    if(r.status!==prev.status){
      if(r.status==='going')alertUser({key:'my-'+m.id,status:'going',caseId:m.id,tone:'ok',title:`✅ ${team} รับเคสของคุณแล้ว`,body:'ทีมกำลังเดินทางไปหาคุณ เปิดหน้านี้ไว้เพื่อดูว่าทีมอยู่ที่ไหน',hash:'home'});
      else if(r.status==='done')alertUser({key:'my-'+m.id,status:'done',caseId:m.id,tone:'ok',title:'💚 เคสของคุณช่วยเหลือเสร็จแล้ว',body:'เลขเคส '+m.id,hash:'home'});
      else if(r.status==='open'&&prev.status==='going')alertUser({key:'my-'+m.id,status:'open',caseId:m.id,tone:'warn',title:'ทีมยกเลิกการรับเคส',body:'ระบบกำลังรอทีมใหม่ หากอันตราย โทร 1669 / 1784',hash:'home'});
    }
    if(r.status==='going'&&r.team){
      const a=r.team.area||'',km=r.team.km;
      const kmMoved=prev.km==null||km==null?a!==prev.area:Math.abs(km-prev.km)>=0.5;
      const near=km!=null&&km<1&&!(prev.km!=null&&prev.km<1);
      if(prev.status==='going'&&(a!==prev.area||kmMoved||near)){
        alertUser({key:'loc-'+m.id,status:'going',caseId:m.id,tone:'info',title:near?`🚤 ${team} ใกล้ถึงแล้ว`:`📍 ${team} อยู่ที่ ${a||'กำลังเดินทาง'}`,body:near?(a?'อยู่ที่ '+a+' · ':'')+'ไม่ถึง 1 กม.':kmText(km),hash:'home'});
      }
    }
    m.status=r.status;m.volunteer=r.volunteer;m.area=r.team?r.team.area:'';m.km=r.team?r.team.km:null;changed=true;
  }
  if(changed){const all=myCases().map(x=>list.find(y=>mk(y)===mk(x))||x);saveMyCases(all)}
  renderMyCase();
}
function caseSteps(status){
  const steps=[['open','แจ้งแล้ว','รอทีมรับเคส'],['going','ทีมรับเคส','กำลังเดินทาง'],['done','ช่วยเหลือแล้ว','เสร็จสิ้น']];
  const cur=Math.max(0,steps.findIndex(x=>x[0]===status));
  const ol=document.createElement('ol');ol.className='case-steps';ol.setAttribute('aria-label','สถานะเคส: '+(STATUS_TH[status]||''));
  steps.forEach(([k,a,b],i)=>{const li=document.createElement('li');li.className=i<cur?'past':i===cur?'now':'';
    if(i===cur)li.setAttribute('aria-current','step');
    const dot=document.createElement('i');dot.textContent=i<cur||(i===cur&&k==='done')?'✓':String(i+1);
    const t=document.createElement('b');t.textContent=a;const sm=document.createElement('small');sm.textContent=b;
    li.append(dot,t,sm);ol.append(li)});
  return ol;
}
function renderMyCase(){
  const el=document.getElementById('my-case');if(!el)return;
  const list=myCases().filter(x=>Date.now()-x.t<7*864e5);
  if(!list.length){el.hidden=true;el.replaceChildren();return}
  el.hidden=false;el.replaceChildren();
  const head=document.createElement('div');head.className='stats-head';
  const h=document.createElement('h2');h.textContent='ติดตามเคสของฉัน';head.append(h);el.append(head);
  list.slice().reverse().forEach(m=>{
    const r=LIVE.track[mk(m)]||{status:m.status,volunteer:m.volunteer,team:m.area||m.km!=null?{area:m.area,km:m.km}:null};
    const card=document.createElement('div');card.className='my-case-card';
    const top=document.createElement('div');top.className='case-top';
    const st=document.createElement('span');st.className='status '+(STATUS_CLASS[r.status]||'wait');st.textContent=STATUS_TH[r.status]||'รอความช่วยเหลือ';
    const id=document.createElement('span');id.className='case-id';id.textContent=m.id?'#'+m.id:'รอเลขเคส';
    top.append(st,id);card.append(top);
    card.append(caseSteps(r.status));
    const p=document.createElement('p');
    if(r.status==='going'){
      const t=r.team;
      p.textContent=`${r.volunteer||'ทีมอาสา'} กำลังเดินทาง`+(t&&t.area?` · อยู่ที่ ${t.area}`:'')+(t&&t.km!=null?` · ${kmText(t.km)}`:'')+(t&&t.updatedAt?` (อัปเดต ${ago(t.updatedAt)})`:'');
    }else if(r.status==='done')p.textContent='ช่วยเหลือเรียบร้อยแล้ว';
    else p.textContent='รอทีมอาสารับเคส ระบบจะเด้งแจ้งเตือนเมื่อมีทีมรับ';
    card.append(p);
    const row=document.createElement('div');row.className='my-case-actions';
    const nb=r.status!=='done'&&notifyButton();if(nb)row.append(nb);
    const x=document.createElement('button');x.type='button';x.className='text-button';x.textContent=r.status==='done'?'ลบออก':'เลิกติดตาม';x.onclick=()=>forgetMyCase(mk(m));row.append(x);
    card.append(row);el.append(card);
  });
}
setInterval(()=>{const going=myCases().some(x=>x.status==='going');if(going||(!document.hidden&&myCases().some(x=>x.status!=='done')))pollMyCases()},45000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollMyCases()});

/* ============================================================
   hooks จาก script.js
   ============================================================ */
function onCasesLoaded(){
  checkNewCases();
  if(isVolunteer){loadTeams();if(store.get('uh_sharing','')&&!isSharing()&&store.get('uh_team',''))startSharing()}
  else{if(isSharing())stopSharing(true);if(wantTeams()&&currentView==='map')loadTeams();else drawTeamMarkers()}
}
function onStatusChanged(c,status){
  if(status==='going'){
    store.set('uh_cur_case',c.id);
    if(isSharing()){LIVE.lastSent=0;LIVE.lastPos&&onPos({coords:{latitude:LIVE.lastPos.lat,longitude:LIVE.lastPos.lng,accuracy:LIVE.lastPos.accuracy}})}
    else toast({title:'แชร์ตำแหน่งทีมให้ผู้แจ้งเห็นไหม?',body:'ผู้แจ้งจะเห็นว่าทีมอยู่พื้นที่ไหน และห่างกี่ กม.',actionText:'เริ่มแชร์',onAction:startSharing,timeout:30000,key:'askshare'});
  }else if(store.get('uh_cur_case','')===c.id){store.set('uh_cur_case','')}
}
/* อาสา: ดึงเคสเป็นระยะแม้อยู่หน้าอื่น เพื่อเด้งเตือนเคสใหม่ */
setInterval(()=>{if(isVolunteer&&(document.hidden||!['map','detail','home'].includes(currentView))&&Date.now()-lastLoaded>55000)loadCases()},60000);
renderMyCase();pollMyCases();
