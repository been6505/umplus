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
/* ในแอป UM+ (Capacitor): ใช้ตำแหน่งเบื้องหลังแบบ native → ส่งต่อได้แม้ล็อกจอ/สลับแอป (เหมือน Traccar) */
const IS_APP=!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform());
const BGEO=IS_APP&&Capacitor.registerPlugin?Capacitor.registerPlugin('BackgroundGeolocation'):null;
function distM(a,b){const R=6371000,r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2),y=Math.sin((b.lng-a.lng)*r/2);return 2*R*Math.asin(Math.sqrt(x*x+Math.cos(a.lat*r)*Math.cos(b.lat*r)*y*y))}
function startSharing(){
  if(!isVolunteer)return;
  if(!store.get('uh_team','')){toast({title:'ใส่ชื่อทีมก่อน',body:'พิมพ์ชื่อทีมในช่อง "ชื่อทีม" แล้วกดเริ่มแชร์อีกครั้ง',tone:'warn'});return}
  if(!navigator.geolocation){toast({title:'อุปกรณ์นี้ไม่รองรับตำแหน่ง',tone:'warn'});return}
  if(isSharing())return;
  store.set('uh_sharing','1');
  if(BGEO){
    LIVE.watch='starting';
    BGEO.addWatcher({backgroundTitle:'UM+ · ติดตามตำแหน่งทีม',backgroundMessage:'กำลังส่งตำแหน่งทีม '+store.get('uh_team','')+' ให้ศูนย์ประสานงาน',requestPermissions:true,stale:false,distanceFilter:30},(loc,err)=>{
      if(err){if(err.code==='NOT_AUTHORIZED'){stopSharing(true);if(confirm('แอปยังไม่ได้รับสิทธิ์ใช้ตำแหน่ง เปิดหน้าตั้งค่าเพื่ออนุญาตไหม? (เลือก "ตลอดเวลา" เพื่อส่งได้แม้ล็อกจอ)'))BGEO.openSettings()}else trkLog('err','GPS: '+(err.message||err.code||''));return}
      if(loc)onPos({coords:{latitude:loc.latitude,longitude:loc.longitude,accuracy:loc.accuracy,speed:loc.speed}});
    }).then(id=>{if(LIVE.watch==='starting')LIVE.watch=id;else BGEO.removeWatcher({id})}).catch(()=>{LIVE.watch=null;store.set('uh_sharing','');refreshLiveControls()});
    trkLog('info','เริ่มติดตาม (แอป · ส่งต่อแม้ล็อกจอ)');renderShareChip();refreshLiveControls();return;
  }
  LIVE.watch=navigator.geolocation.watchPosition(onPos,err=>{
    if(err.code===1){stopSharing(true);toast({title:'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง',body:'เปิดสิทธิ์ตำแหน่งของเบราว์เซอร์ แล้วลองใหม่',tone:'warn'})}
  },{enableHighAccuracy:true,maximumAge:15000,timeout:30000});
  trkLog('info','เริ่มติดตาม · '+TRK_FREQ[trkFreq()]);wakeOn();
  renderShareChip();refreshLiveControls();
}
async function stopSharing(silent){
  if(LIVE.watch!=null){if(BGEO){if(LIVE.watch!=='starting')BGEO.removeWatcher({id:LIVE.watch}).catch(()=>{})}else navigator.geolocation.clearWatch(LIVE.watch);LIVE.watch=null}
  store.set('uh_sharing','');LIVE.lastPos=null;LIVE.lastSent=0;LIVE.pending=null;wakeOff();trkLog('info','หยุดติดตาม');
  renderShareChip();refreshLiveControls();
  if(!silent)try{await apiPing({stop:true})}catch(e){}
  loadTeams();
}
/* ---------- ตัวติดตามแบบ Traccar: รหัสอุปกรณ์, ความถี่, บันทึกสถานะ, ส่งซ้ำเมื่อออนไลน์, แบตเตอรี่, กันจอดับ ---------- */
function devId(){let d=store.get('uh_dev_id','');if(!d){d=String(10000000+Math.floor(Math.random()*90000000));store.set('uh_dev_id',d)}return d}
const TRK_FREQ={30:'ทุก 30 วินาที',60:'ทุก 1 นาที',120:'ทุก 2 นาที',300:'ทุก 5 นาที'};
const trkFreq=()=>{const f=Number(store.get('uh_trk_freq',''))||30;return TRK_FREQ[f]?f:30};
const keepAwakeOn=()=>store.get('uh_trk_awake','1')==='1';
LIVE.log=[];LIVE.batt=null;
function trkLog(kind,text){LIVE.log.unshift({t:Date.now(),kind,text});LIVE.log.length=Math.min(LIVE.log.length,30);renderTrkLog()}
function renderTrkLog(){const el=document.getElementById('trk-log');if(!el)return;
  el.replaceChildren(...(LIVE.log.length?LIVE.log:[{t:Date.now(),kind:'info',text:'ยังไม่มีข้อมูล'}]).map(x=>{const li=document.createElement('li');li.className='trk-'+x.kind;
    const tm=document.createElement('time');tm.textContent=new Date(x.t).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});li.append(tm,' '+x.text);return li}))}
async function readBatt(){try{if(navigator.getBattery){const b=await navigator.getBattery();LIVE.batt=Math.round(b.level*100);return LIVE.batt}}catch(e){}return null}
async function sendPos(p,why){
  const batt=await readBatt();
  const body={lat:+p.lat.toFixed(6),lng:+p.lng.toFixed(6),accuracy:p.accuracy,deviceId:devId()};if(batt!=null)body.batt=batt;if(p.speed!=null)body.speed=p.speed;
  const info=`±${p.accuracy} ม.${batt!=null?' · แบต '+batt+'%':''}`;
  try{const r=await apiPing(body);
    if(r&&r.ok){LIVE.lastSent=Date.now();LIVE.lastPos=p;LIVE.pending=null;trkLog('ok',(why||'ส่งตำแหน่ง')+' · '+info);renderShareChip();renderTrkHead();return true}
    if(r&&r.error==='not_volunteer'){stopSharing(true);trkLog('err','รหัสทีมหมดอายุ หยุดติดตาม');return false}
    throw new Error(r&&r.error||'error');
  }catch(e){LIVE.pending=p;trkLog('wait',(navigator.onLine===false?'ออฟไลน์ ':'ส่งไม่สำเร็จ ')+'· จะส่งใหม่อัตโนมัติ');renderTrkHead();return false}
}
async function onPos(pos){
  const p={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy||0),speed:pos.coords.speed!=null&&isFinite(pos.coords.speed)?Math.round(pos.coords.speed*3.6):null};
  const now=Date.now(),since=now-LIVE.lastSent,minMs=trkFreq()*1000;
  const moved=LIVE.lastPos?distM(LIVE.lastPos,p):Infinity;
  LIVE.cur=p;
  if(LIVE.sending||(LIVE.lastSent&&(since<minMs||(moved<SEND_MIN_M&&since<Math.max(SEND_MAX_MS,minMs)))))return;
  LIVE.sending=true;try{await sendPos(p)}finally{LIVE.sending=false}
}
/* ส่งตำแหน่งทันที 1 ครั้ง (ปุ่ม "ส่งตำแหน่ง") */
function sendNow(why){
  return new Promise(res=>{if(!navigator.geolocation){toast({title:'อุปกรณ์นี้ไม่รองรับตำแหน่ง',tone:'warn'});return res(null)}
    navigator.geolocation.getCurrentPosition(async pos=>{const p={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy||0)};LIVE.cur=p;
      LIVE.sending=true;try{await sendPos(p,why)}finally{LIVE.sending=false}res(p)},
      err=>{trkLog('err',err.code===1?'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง':'หาตำแหน่งไม่ได้');toast({title:err.code===1?'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง':'หาตำแหน่งไม่ได้ ลองใหม่',tone:'warn'});res(null)},
      {enableHighAccuracy:true,maximumAge:5000,timeout:20000})})}
/* SOS: แจ้งเคสวิกฤตที่ตำแหน่งทีม (เข้าคิวหลังบ้านทันที) + ส่งตำแหน่ง */
async function sendSOS(){
  const team=store.get('uh_team','');
  if(!confirm('ส่ง SOS ขอความช่วยเหลือด่วนสำหรับทีม "'+(team||'อาสา')+'" ?'))return;
  trkLog('sos','กำลังส่ง SOS…');
  /* ไม่รอ GPS นานเกิน 6 วินาที — ใช้ตำแหน่งล่าสุดที่มีแทน */
  const p=await Promise.race([sendNow('SOS'),new Promise(r=>setTimeout(()=>r(null),6000))])||LIVE.cur||LIVE.lastPos;
  try{const r=await apiCreate({needs:['ทีมอาสาขอความช่วยเหลือ'],urgencyLabel:'ด่วนมาก · เสี่ยงต่อชีวิต',people:1,households:1,level:'',vulnerable:[],
      address:'ตำแหน่งทีมอาสา'+(p?` (±${p.accuracy} ม.)`:''),lat:p?+p.lat.toFixed(6):'',lng:p?+p.lng.toFixed(6):'',name:'ทีม '+(team||'อาสา'),phone:store.get('uh_trk_phone',''),
      details:`[SOS จากตัวติดตามทีม] ทีม ${team||'-'} · อุปกรณ์ ${devId()}${LIVE.batt!=null?' · แบต '+LIVE.batt+'%':''}`,website:''});
    if(r&&r.ok){trkLog('sos','ส่ง SOS แล้ว'+(r.id?' · เคส #'+r.id:''));toast({title:'ส่ง SOS แล้ว',body:'แอดมินเห็นเคสวิกฤตพร้อมตำแหน่งของทีมแล้ว',tone:'danger',key:'sos'})}
    else throw new Error(r&&r.error||'');
  }catch(e){trkLog('err','ส่ง SOS ไม่สำเร็จ');toast({title:'ส่ง SOS ไม่สำเร็จ',body:'โทร 1669 หรือ 191 ทันที',tone:'danger',key:'sos',timeout:0})}
}
/* กันจอดับระหว่างติดตาม (Wake Lock) — เว็บส่งตำแหน่งได้เฉพาะตอนจอติด */
async function wakeOn(){if(IS_APP||!isSharing()||!keepAwakeOn()||document.hidden||LIVE.wake||!('wakeLock' in navigator))return;
  try{LIVE.wake=await navigator.wakeLock.request('screen');LIVE.wake.addEventListener('release',()=>{LIVE.wake=null;renderTrkHead()});renderTrkHead()}catch(e){}}
function wakeOff(){try{LIVE.wake&&LIVE.wake.release()}catch(e){}LIVE.wake=null}
/* กลับมาที่หน้านี้ / กลับมาออนไลน์ → ส่งทันที + ขอกันจอดับใหม่ */
document.addEventListener('visibilitychange',()=>{if(document.hidden||!isSharing())return;wakeOn();if(Date.now()-LIVE.lastSent>15000||LIVE.pending)sendNow('กลับมาที่หน้าเว็บ')});
window.addEventListener('online',()=>{if(isSharing()&&LIVE.pending){trkLog('info','กลับมาออนไลน์');sendPos(LIVE.pending,'ส่งตำแหน่งที่ค้าง')}});
setInterval(()=>{if(isSharing()&&LIVE.pending&&!LIVE.sending&&navigator.onLine!==false)sendPos(LIVE.pending,'ส่งใหม่')},20000);
/* ส่งซ้ำเป็นระยะแม้ไม่ได้ขยับ (ให้ผู้แจ้งเห็นว่ายังออนไลน์) */
setInterval(()=>{if(isSharing()&&LIVE.lastPos&&Date.now()-LIVE.lastSent>=Math.max(SEND_MAX_MS,trkFreq()*1000))onPos({coords:{latitude:LIVE.lastPos.lat,longitude:LIVE.lastPos.lng,accuracy:LIVE.lastPos.accuracy}})},30000);

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
  const h=document.createElement('strong');h.textContent='ตัวติดตามทีม';
  const team=document.createElement('input');team.className='team-input';team.placeholder='ชื่อทีม / อาสา';team.value=store.get('uh_team','');team.setAttribute('aria-label','ชื่อทีม');
  team.onchange=()=>{store.set('uh_team',team.value.trim());renderVolunteerBar();if(typeof ME!=='undefined'&&ME.marker&&ME.marker.setIcon)ME.marker.setIcon(meIcon())};
  const needTeam=()=>{const t=team.value.trim();if(!t){team.focus();team.placeholder='ใส่ชื่อทีมก่อน';toast({title:'ใส่ชื่อทีมก่อน',tone:'warn'});return false}store.set('uh_team',t);return true};
  const card=document.createElement('div');card.className='trk';
  /* หัว: รหัสอุปกรณ์ + สถานะล่าสุด */
  const head=document.createElement('div');head.className='trk-head';head.id='trk-head';
  /* สวิตช์ติดตามอย่างต่อเนื่อง */
  const sw=document.createElement('label');sw.className='trk-switch';
  const cb=document.createElement('input');cb.type='checkbox';cb.role='switch';cb.checked=isSharing();
  cb.onchange=()=>{if(cb.checked){if(!needTeam()){cb.checked=false;return}startSharing();if(!isSharing())cb.checked=false}else stopSharing()};
  const sl=document.createElement('span');sl.textContent='ติดตามอย่างต่อเนื่อง';const knob=document.createElement('i');sw.append(sl,cb,knob);
  /* ปุ่ม */
  const row=document.createElement('div');row.className='trk-btns';
  const bSend=document.createElement('button');bSend.type='button';bSend.className='secondary-button';bSend.textContent='ส่งตำแหน่ง';bSend.onclick=async()=>{if(!needTeam())return;bSend.disabled=true;await sendNow('ส่งตำแหน่ง (กดเอง)');bSend.disabled=false};
  const bSos=document.createElement('button');bSos.type='button';bSos.className='trk-sosbtn';bSos.textContent='ส่ง SOS';bSos.onclick=()=>{if(needTeam())sendSOS()};
  const bLog=document.createElement('button');bLog.type='button';bLog.className='secondary-button';bLog.textContent='แสดงสถานะ';
  const log=document.createElement('ol');log.className='trk-log';log.id='trk-log';log.hidden=!LIVE.showLog;
  bLog.onclick=()=>{LIVE.showLog=!LIVE.showLog;log.hidden=!LIVE.showLog;renderTrkLog()};
  row.append(bSend,bSos,bLog);
  /* ตั้งค่า */
  const set=document.createElement('details');set.className='trk-set';
  set.innerHTML='<summary>การตั้งค่า</summary>';
  const fq=document.createElement('label');fq.className='trk-opt';fq.append('ความถี่ในการส่ง');
  const sel=document.createElement('select');Object.entries(TRK_FREQ).forEach(([k,v])=>{const o=document.createElement('option');o.value=k;o.textContent=v;if(Number(k)===trkFreq())o.selected=true;sel.append(o)});
  sel.onchange=()=>{store.set('uh_trk_freq',sel.value);trkLog('info','ตั้งความถี่ '+TRK_FREQ[sel.value])};fq.append(sel);
  const aw=document.createElement('label');aw.className='trk-opt';const awc=document.createElement('input');awc.type='checkbox';awc.checked=keepAwakeOn();
  awc.onchange=()=>{store.set('uh_trk_awake',awc.checked?'1':'0');if(awc.checked)wakeOn();else wakeOff();renderTrkHead()};aw.append(awc,' กันจอดับระหว่างติดตาม');
  const ph=document.createElement('label');ph.className='trk-opt';ph.append('เบอร์ติดต่อทีม (ใช้ตอนส่ง SOS)');const phi=document.createElement('input');phi.type='tel';phi.inputMode='tel';phi.className='team-input';phi.value=store.get('uh_trk_phone','');phi.onchange=()=>store.set('uh_trk_phone',phi.value.trim());ph.append(phi);
  const note=document.createElement('p');note.className='trk-note';note.textContent=IS_APP?'แอปส่งตำแหน่งต่อได้แม้ล็อกจอหรือสลับแอป (อนุญาตตำแหน่งแบบ "ตลอดเวลา" และไม่ปิดแอปทิ้ง) จะมีแจ้งเตือนค้างไว้ระหว่างติดตาม':'เว็บส่งตำแหน่งได้เมื่อเปิดหน้านี้ค้างไว้และจอติด (เปิด "กันจอดับ" และเสียบที่ชาร์จจะส่งได้ทั้งวัน) ถ้าต้องส่งตอนล็อกจอ ใช้ "แชร์ผ่าน Google Maps" ด้านล่างเพิ่ม';
  set.append(fq,...(IS_APP?[]:[aw]),ph,note);
  card.append(head,sw,row,log,set);
  box.append(h,team,card);
  renderTrkHead();renderTrkLog();
  if(!IS_APP)box.append(gmBox()); // ในแอปไม่ต้องใช้ Google Maps (แอปส่งตำแหน่งได้แม้ล็อกจอเอง)
  const nb=notifyButton('🔔 เปิดแจ้งเตือนเคสใหม่');if(nb)box.append(nb);
}
function renderTrkHead(){const el=document.getElementById('trk-head');if(!el)return;
  const st=!isSharing()?['off','ปิดอยู่']:LIVE.pending?['wait','รอส่ง · '+(navigator.onLine===false?'ออฟไลน์':'ลองใหม่อัตโนมัติ')]:LIVE.lastSent?['on','ส่งล่าสุด '+new Date(LIVE.lastSent).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})]:['on','กำลังหาตำแหน่ง…'];
  el.innerHTML=`<div><small>รหัสอุปกรณ์</small><b>${escH(devId())}</b></div><div class="trk-st trk-st-${st[0]}"><span></span>${escH(st[1])}${isSharing()&&LIVE.wake?' · 🔆 กันจอดับ':''}${LIVE.batt!=null?' · 🔋'+LIVE.batt+'%':''}</div>`}

/* ============================================================
   ตำแหน่งสดผ่าน Google Maps (ส่งต่อแม้ล็อกจอ) — เชื่อมลิงก์ให้ทีมอัตโนมัติ
   กด "แชร์ผ่าน Google Maps" → แชร์ตำแหน่ง/คัดลอกลิงก์ในแอป → กลับมาหน้านี้
   ระบบอ่านลิงก์จากคลิปบอร์ดแล้วบันทึกเข้าทีมเอง (ถ้าเบราว์เซอร์ไม่ให้อ่านเอง จะขึ้นปุ่ม "วางลิงก์" กดครั้งเดียว)
   ลิงก์เก็บต่อท้ายหมายเหตุของทีม (📍<url>) เหมือนหน้าจัดทีม
   ============================================================ */
const GM_RE=/https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.(?:com|co\.th)\/maps|maps\.google\.(?:com|co\.th))[^\s<>"']*/i;
const GM_WAIT_MS=20*60*1000;
const gmClean=n=>String(n||'').replace(GM_RE,'').replace(/\s*📍\s*/g,' ').trim();
const tnm=s=>String(s||'').replace(/^'/,'').trim();
async function gmSave(url){
  const key=store.get('uh_vol_key',''),team=store.get('uh_team','');
  if(!key||!team)throw new Error('no_team');
  const r=await (await fetch(API_URL+'?'+new URLSearchParams({action:'roster',key,t:Date.now()}),{cache:'no-store'})).json();
  if(!r||!r.ok)throw new Error(r&&r.error||'roster');
  const cur=(r.roster||[]).find(x=>tnm(x.name)===tnm(team))||{name:team,status:'out'};
  const note=[gmClean(cur.note),url?'📍'+url:''].filter(Boolean).join(' ');
  const s=await apiPost({action:'roster_save',key,team:{...cur,id:cur.id||'',gmaps:url,note},by:team});
  if(!s||!s.ok)throw new Error(s&&s.error||'save');
  store.set('uh_gmaps',url);LIVE.gmWait=0;refreshLiveControls();
}
async function gmLink(text,quiet){
  const m=String(text||'').match(GM_RE);
  if(!m){if(!quiet)toast({title:'ไม่พบลิงก์ Google Maps',body:'ในแอป Google Maps กด "แชร์ตำแหน่ง" → "คัดลอกไปยังคลิปบอร์ด" แล้วกลับมากดวางอีกครั้ง',tone:'warn'});return false}
  if(m[0]===store.get('uh_gmaps','')){LIVE.gmWait=0;if(!quiet)toast({title:'เชื่อมลิงก์นี้ไว้แล้ว',tone:'ok',timeout:4000});return true}
  try{await gmSave(m[0]);toast({title:'✓ เชื่อมตำแหน่ง Google Maps แล้ว',body:'แอดมินเห็นตำแหน่งสดของทีม '+store.get('uh_team','')+' ในหน้าจัดทีมแล้ว',tone:'ok',key:'gm'});return true}
  catch(e){toast({title:'บันทึกลิงก์ไม่สำเร็จ',body:e.message==='no_team'?'ใส่ชื่อทีมก่อน':'ลองใหม่อีกครั้ง',tone:'warn',key:'gm'});return false}
}
async function gmFromClipboard(quiet){
  try{const t=await navigator.clipboard.readText();return await gmLink(t,quiet)}catch(e){return null}
}
function gmOpen(){
  const team=store.get('uh_team','');
  if(!team){toast({title:'ใส่ชื่อทีมก่อน',tone:'warn'});return}
  LIVE.gmWait=Date.now();
  window.open('https://www.google.com/maps','_blank','noopener');
  toast({title:'แชร์ตำแหน่งใน Google Maps',body:'รูปโปรไฟล์ → การแชร์ตำแหน่ง → แชร์ตำแหน่ง → "จนกว่าคุณจะปิด" → คัดลอกไปยังคลิปบอร์ด แล้วกลับมาหน้านี้ ระบบจะเชื่อมลิงก์ให้เอง',tone:'info',timeout:0,key:'gm'});
}
/* กลับมาจาก Google Maps → ลองอ่านคลิปบอร์ดเอง ถ้าเบราว์เซอร์ไม่อนุญาต ให้กดปุ่มเดียว */
async function gmOnReturn(){
  if(document.hidden||LIVE.gmBusy||!LIVE.gmWait||Date.now()-LIVE.gmWait>GM_WAIT_MS)return;
  LIVE.gmBusy=true;let ok;try{ok=await gmFromClipboard(true)}finally{LIVE.gmBusy=false}
  if(ok||!LIVE.gmWait)return;
  toast({title:'คัดลอกลิงก์จาก Google Maps แล้ว?',body:'กดปุ่มเพื่อเชื่อมตำแหน่งสดเข้าทีมของคุณ',tone:'info',timeout:0,key:'gm',actionText:'📋 วางลิงก์',
    onAction:async()=>{const r=await gmFromClipboard(false);if(r===null){const box=document.querySelector('.gm-paste');if(box){box.hidden=false;box.focus()}toast({title:'วางลิงก์ในช่องด้านล่าง',body:'เบราว์เซอร์นี้ไม่ให้อ่านคลิปบอร์ด กดค้างในช่องแล้วเลือก "วาง"',tone:'warn',key:'gm'})}}});
}
document.addEventListener('visibilitychange',gmOnReturn);
window.addEventListener('focus',gmOnReturn);
function gmBox(){
  const wrap=document.createElement('div');wrap.className='gm-share';
  const linked=store.get('uh_gmaps','');
  const h=document.createElement('div');h.className='gm-h';
  h.innerHTML=linked?'<b>✓ ตำแหน่งสด Google Maps เชื่อมแล้ว</b><small>ส่งต่อแม้ล็อกจอ · แอดมินเปิดดูได้จากหน้าจัดทีม</small>':'<b>📍 ตำแหน่งสดผ่าน Google Maps</b><small>ส่งต่อแม้ล็อกจอหรือสลับแอป</small>';
  const go=document.createElement('button');go.type='button';go.className=linked?'secondary-button':'solid-button';
  go.textContent=linked?'เปลี่ยนลิงก์ (แชร์ใหม่ใน Google Maps)':'แชร์ผ่าน Google Maps';go.onclick=gmOpen;
  const paste=document.createElement('input');paste.className='team-input gm-paste';paste.inputMode='url';paste.placeholder='หรือวางลิงก์ maps.app.goo.gl ที่นี่';paste.setAttribute('aria-label','ลิงก์แชร์ตำแหน่ง Google Maps');
  paste.addEventListener('input',()=>{if(GM_RE.test(paste.value))gmLink(paste.value)});
  wrap.append(h,go,paste);
  if(linked){
    const row=document.createElement('div');row.className='gm-row';
    const view=document.createElement('a');view.href=linked;view.target='_blank';view.rel='noopener';view.textContent='ดูลิงก์ที่เชื่อมไว้';
    const off=document.createElement('button');off.type='button';off.className='text-button';off.textContent='ยกเลิกการเชื่อม';
    off.onclick=async()=>{try{await gmSave('');toast({title:'ยกเลิกการเชื่อมแล้ว',body:'อย่าลืมกดหยุดแชร์ในแอป Google Maps ด้วย',tone:'info'})}catch(e){toast({title:'ไม่สำเร็จ ลองใหม่',tone:'warn'})}};
    row.append(view,off);wrap.append(row);
  }
  return wrap;
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
