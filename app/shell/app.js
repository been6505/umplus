/* HelpMe4U แอปทีม: เชื่อมลิงก์ทีมครั้งเดียว แล้วส่ง GPS ให้ศูนย์ (central.helpme4u.com/api/track/<รหัสทีม>)
   แบบเบื้องหลัง — ส่งต่อแม้ล็อกจอ (รูปแบบ OwnTracks ที่ศูนย์รองรับอยู่แล้ว) */
const SERVER='https://central.helpme4u.com';
const $=s=>document.querySelector(s);
const C=window.Capacitor,NATIVE=!!(C&&C.isNativePlatform&&C.isNativePlatform());
const P=n=>NATIVE&&C.registerPlugin?C.registerPlugin(n):null;
const BG=P('BackgroundGeolocation'),Browser=P('Browser'),Device=P('Device'),App=P('App');
const st={get:(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}},set:(k,v)=>{try{v==null||v===''?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}};
const T={watch:null,pending:null,sending:false,sentAt:0,log:[]};

/* ---------- ลิงก์ทีม ---------- */
function tokenFrom(text){
  const s=String(text||'').trim();let id='';
  const m=s.match(/[?&#](?:id|t|tk)=([A-Za-z0-9]{10,64})/)||s.match(/\/api\/track\/([A-Za-z0-9]{10,64})/)||s.match(/^([A-Za-z0-9]{10,64})$/);
  if(m)id=m[1];return id.toLowerCase();
}
function serverFrom(text){const m=String(text||'').match(/https:\/\/([a-z0-9.-]*helpme4u\.com|[a-z0-9-]+\.pages\.dev|admin\.um\.help)\b/i);return m?'https://'+m[1].toLowerCase():''}
const tk=()=>st.get('hm_tk','');
const srv=()=>{const s=st.get('hm_srv','');return /helpme4u\.com$/.test(s.replace('https://',''))||!s?SERVER:s};
function link(text){
  const id=tokenFrom(text);
  if(!id){$('#link-err').textContent='ไม่พบรหัสทีมในลิงก์ — ขอลิงก์หน้าทีม (…/team/?id=…) จากศูนย์';return false}
  st.set('hm_tk',id);st.set('hm_srv',serverFrom(text)||SERVER);$('#link-err').textContent='';render();log('info','เชื่อมทีมแล้ว');
  return true;
}
$('#link-go').onclick=()=>link($('#link-in').value);
$('#link-in').addEventListener('input',e=>{if(tokenFrom(e.target.value))link(e.target.value)});
$('#paste').onclick=async()=>{try{const t=await navigator.clipboard.readText();if(!link(t))$('#link-in').value=t}catch(e){$('#link-err').textContent='อ่านคลิปบอร์ดไม่ได้ — กดค้างในช่องด้านล่างแล้วเลือก "วาง"';$('#link-in').focus()}};
$('#unlink').onclick=async()=>{if(!confirm('เลิกเชื่อมทีมนี้และหยุดส่งตำแหน่ง?'))return;await stop();st.set('hm_tk','');st.set('hm_srv','');render()};
/* เปิดจากลิงก์ helpme4u://team?id=… หรือ https://central.helpme4u.com/team/?id=… */
if(App)App.addListener('appUrlOpen',e=>{if(tokenFrom(e.url)){const had=tk();link(e.url);if(!had&&!T.watch)ask()}});

/* ---------- ส่งตำแหน่ง ---------- */
async function battery(){try{if(Device){const b=await Device.getBatteryInfo();return b&&b.batteryLevel>=0?Math.round(b.batteryLevel*100):null}}catch(e){}return null}
async function send(p,why){
  if(!tk())return false;
  T.sending=true;const batt=await battery();
  const body={_type:'location',lat:+p.lat.toFixed(6),lon:+p.lng.toFixed(6),acc:Math.round(p.acc||0),tst:Math.floor((p.t||Date.now())/1000),tid:'HM'};
  if(p.speed!=null&&p.speed>=0)body.vel=Math.round(p.speed*3.6);if(p.heading!=null&&p.heading>=0)body.cog=Math.round(p.heading);if(batt!=null)body.batt=batt;
  try{
    const r=await fetch(srv()+'/api/track/'+tk(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===403){log('err','ลิงก์ทีมใช้ไม่ได้แล้ว — ขอลิงก์ใหม่จากศูนย์');setSt('bad','ลิงก์ทีมใช้ไม่ได้');return false}
    if(!r.ok)throw new Error('HTTP '+r.status);
    T.pending=null;T.sentAt=Date.now();st.set('hm_sent',String(T.sentAt));
    log('ok',(why||'ส่งตำแหน่ง')+` · ±${body.acc} ม.`+(batt!=null?` · แบต ${batt}%`:''));setSt('on','ส่งล่าสุด '+hm(T.sentAt));return true;
  }catch(e){T.pending=p;log('wait','ส่งไม่สำเร็จ ('+(e.message||'ออฟไลน์')+') · จะส่งใหม่เอง');setSt('wait','รอส่ง · สัญญาณไม่ดี');return false}
  finally{T.sending=false}
}
function onLoc(loc,err){
  if(err){if(err.code==='NOT_AUTHORIZED'){stop();if(confirm('แอปยังไม่ได้รับสิทธิ์ตำแหน่ง เปิดหน้าตั้งค่าไหม?\nเลือก "อนุญาตตลอดเวลา" เพื่อให้ส่งได้แม้ล็อกจอ'))BG.openSettings()}else log('err','GPS: '+(err.message||err.code));return}
  if(!loc)return;
  const p={lat:loc.latitude,lng:loc.longitude,acc:loc.accuracy,speed:loc.speed,heading:loc.bearing,t:loc.time||Date.now()};
  if(T.sending){T.pending=p;return}send(p);
}
async function start(){
  if(!tk())return;
  if(!BG){alert('ฟีเจอร์นี้ใช้ได้ในแอปบนมือถือเท่านั้น');$('#trk').checked=false;return}
  if(T.watch)return;
  T.watch='starting';st.set('hm_on','1');setSt('wait','กำลังหาตำแหน่ง…');
  try{const id=await BG.addWatcher({backgroundTitle:'HelpMe4U · ส่งตำแหน่งทีม',backgroundMessage:'ศูนย์กำลังเห็นตำแหน่งทีมของคุณ แตะเพื่อเปิดแอป',requestPermissions:true,stale:false,distanceFilter:Number(st.get('hm_dist','30'))||30},onLoc);
    if(T.watch==='starting')T.watch=id;else BG.removeWatcher({id});log('info','เริ่มส่งตำแหน่งอัตโนมัติ')}
  catch(e){T.watch=null;st.set('hm_on','');log('err','เริ่มไม่ได้: '+(e.message||e))}
  render();
}
async function stop(){
  if(T.watch&&T.watch!=='starting'&&BG)try{await BG.removeWatcher({id:T.watch})}catch(e){}
  T.watch=null;st.set('hm_on','');setSt('','ปิดอยู่');log('info','หยุดส่งตำแหน่ง');render();
}
function ask(){if(confirm('เริ่มส่งตำแหน่งทีมให้ศูนย์อัตโนมัติเลยไหม?'))start()}
$('#trk').onchange=e=>e.target.checked?start():stop();
$('#send-now').onclick=()=>{if(!navigator.geolocation)return;const b=$('#send-now');b.disabled=true;
  navigator.geolocation.getCurrentPosition(async q=>{await send({lat:q.coords.latitude,lng:q.coords.longitude,acc:q.coords.accuracy,speed:q.coords.speed,heading:q.coords.heading,t:Date.now()},'ส่งตำแหน่ง (กดเอง)');b.disabled=false},
    e=>{log('err',e.code===1?'ไม่ได้รับสิทธิ์ตำแหน่ง':'หาตำแหน่งไม่ได้');b.disabled=false},{enableHighAccuracy:true,timeout:20000,maximumAge:5000})};
$('#open-team').onclick=()=>{const u=srv()+'/team/?id='+encodeURIComponent(tk());Browser?Browser.open({url:u}):window.open(u,'_blank')};
$('#dist').onchange=async e=>{st.set('hm_dist',e.target.value);if(T.watch){await stop();start()}};
/* ส่งที่ค้างเมื่อกลับมาออนไลน์ / ทุก 30 วิ */
addEventListener('online',()=>{if(T.pending&&!T.sending)send(T.pending,'ส่งตำแหน่งที่ค้าง')});
setInterval(()=>{if(T.pending&&!T.sending)send(T.pending,'ส่งใหม่')},30000);

/* ---------- แสดงผล ---------- */
const hm=t=>new Date(t).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
function setSt(k,txt){const el=$('#st');el.className='st '+k;el.querySelector('em').textContent=txt}
function log(kind,text){T.log.unshift({t:Date.now(),kind,text});T.log.length=Math.min(T.log.length,50);
  $('#log').replaceChildren(...T.log.map(x=>{const li=document.createElement('li');li.className=x.kind;const tm=document.createElement('time');tm.textContent=new Date(x.t).toLocaleTimeString('th-TH');li.append(tm,x.text);return li}))}
function render(){
  const linked=!!tk();$('#link-card').hidden=linked;$('#main-card').hidden=!linked;
  if(!linked)return;
  $('#tk').textContent=tk().slice(0,4)+'…'+tk().slice(-3);$('#srv').textContent=srv().replace('https://','');
  $('#trk').checked=!!T.watch;$('#dist').value=st.get('hm_dist','30');
  $('#hint').textContent=!NATIVE?'เปิดในแอปบนมือถือเพื่อส่งตำแหน่งเบื้องหลัง':T.watch?'มีแจ้งเตือนค้างไว้ระหว่างส่ง (Android) — อย่าปัดปิดแอปทิ้ง':'เปิดสวิตช์ แล้วอนุญาตตำแหน่งแบบ "ตลอดเวลา"';
  if(!T.watch&&!$('#st').classList.contains('bad'))setSt('',+st.get('hm_sent','0')?'ปิดอยู่ · ส่งล่าสุด '+hm(+st.get('hm_sent','0')):'ปิดอยู่');
}
render();
if(tk()&&st.get('hm_on','')==='1')start(); // เปิดแอปใหม่ → ส่งต่อจากเดิม
