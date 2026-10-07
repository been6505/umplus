/* ============================================================
   UM+ ประกาศแจ้งเตือนพื้นที่ประสบภัย (Broadcast)
   - ดึงประกาศจาก Apps Script แยก (backend/broadcast.gs) ทุก 1 นาที + ตอนกลับมาเปิดหน้า
   - ตรงพื้นที่ผู้ใช้ (ทั้งกรุงเทพฯ / เขตที่เลือก / รัศมีจากจุด) → แถบประกาศ + เด้งเตือน + เสียง + แจ้งเตือนระบบ
   - ตำแหน่งผู้ใช้: GPS (ถ้าเคยอนุญาต), จุดที่แจ้งขอความช่วยเหลือ, หรือเขตที่ผู้ใช้เลือกเอง
   ============================================================ */
const BROADCAST_URL=''; // ← ใส่ URL /exec ของ backend/broadcast.gs หลัง deploy
const BC={items:[],loaded:0,layer:null,open:false};
const BC_LV={info:{t:'ข่าวสาร',i:'ℹ️'},warn:{t:'เฝ้าระวัง',i:'⚠️'},danger:{t:'อันตราย · อพยพ',i:'🚨'}};
const bcGet=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const bcSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const bcEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bcKm(a,b){const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2),y=Math.sin((b.lng-a.lng)*r/2);return 12742*Math.asin(Math.sqrt(x*x+Math.cos(a.lat*r)*Math.cos(b.lat*r)*y*y))}
/* ตำแหน่งที่ใช้เทียบ: GPS ปัจจุบัน > ตำแหน่งที่บันทึกไว้ (≤ 3 วัน) */
function bcMyLoc(){
  if(typeof ME!=='undefined'&&ME.pos)return {lat:ME.pos.lat,lng:ME.pos.lng};
  const l=bcGet('uh_bc_loc',null);return l&&Date.now()-l.t<3*864e5?l:null;
}
function bcRememberPlace(lat,lng){lat=+lat;lng=+lng;if(isFinite(lat)&&isFinite(lng)&&lat&&lng)bcSet('uh_bc_loc',{lat,lng,t:Date.now()})}
const bcMyDistrict=()=>bcGet('uh_bc_district','');
/* true = ตรงพื้นที่, false = พื้นที่อื่น, null = ยังไม่รู้ตำแหน่งผู้ใช้ */
function bcMatch(b){
  if(b.scope==='all')return true;
  if(b.scope==='circle'){const me=bcMyLoc();return me?bcKm(me,{lat:+b.lat,lng:+b.lng})<=(+b.radiusKm||0)+0.2:null}
  if(b.scope==='district'){const d=bcMyDistrict();return d?(b.districts||[]).includes(d):null}
  return null;
}
function bcArea(b){return b.scope==='all'?'ทั้งกรุงเทพฯ':b.scope==='district'?'เขต'+(b.districts||[]).join(', เขต'):`รัศมี ${b.radiusKm} กม.${b.link?'':''}`}
function bcAgo(t){const m=Math.round((Date.now()-t)/6e4);return m<1?'เมื่อสักครู่':m<60?m+' นาทีที่แล้ว':m<1440?Math.round(m/60)+' ชม.ที่แล้ว':new Date(t).toLocaleDateString('th-TH',{day:'numeric',month:'short'})}

async function loadBroadcasts(){
  if(!BROADCAST_URL)return;
  try{const r=await fetch(BROADCAST_URL+'?action=broadcasts&t='+Math.floor(Date.now()/30000),{cache:'no-store'}).then(x=>x.json());
    if(!r||!r.ok)return;
    const now=Date.now();BC.items=(r.broadcasts||[]).filter(b=>b.active!==false&&(!b.expiresAt||b.expiresAt>now));BC.loaded=now;
    renderBroadcasts();drawBroadcastAreas();announceNew();
  }catch(e){}
}
/* ประกาศใหม่ที่ตรงพื้นที่ (หรือระดับอันตรายที่ยังไม่รู้พื้นที่) → เด้งเตือน */
function announceNew(){
  const seen=new Set(bcGet('uh_bc_seen',[])),first=!bcGet('uh_bc_init',false);
  BC.items.forEach(b=>{const key=b.id+'@'+b.createdAt;if(seen.has(key))return;seen.add(key);if(first)return;
    const m=bcMatch(b);if(m===false||(m===null&&b.level!=='danger'))return;
    const lv=BC_LV[b.level]||BC_LV.info,o={title:`${lv.i} ${b.title}`,body:(m===null?'(อาจเกี่ยวกับพื้นที่ของคุณ) ':'')+String(b.body||'').slice(0,160),tone:b.level==='danger'?'danger':b.level==='warn'?'warn':'info',key:'bc-'+b.id,timeout:b.level==='danger'?0:20000,actionText:'อ่านประกาศ',onAction:()=>bcShow(b.id),hash:''};
    if(typeof alertUser==='function')alertUser(o);
    if(b.level==='danger')try{navigator.vibrate&&navigator.vibrate([400,150,400,150,400])}catch(e){}
  });
  bcSet('uh_bc_seen',[...seen].slice(-200));bcSet('uh_bc_init',true);
}
function bcCard(b,m){
  const lv=BC_LV[b.level]||BC_LV.info,el=document.createElement('article');el.className='bc bc-'+(b.level||'info');el.id='bc-'+b.id;
  const tag=m===true?(b.scope==='all'?'':'<span class="bc-you">ในพื้นที่ของคุณ</span>'):m===null?'<span class="bc-maybe">อาจเกี่ยวกับพื้นที่ของคุณ</span>':'';
  el.innerHTML=`<div class="bc-h"><span class="bc-lv">${lv.i} ${lv.t}</span>${tag}<small>${bcEsc(bcAgo(b.createdAt))}</small></div>
    <strong>${bcEsc(b.title)}</strong>${b.body?`<p>${bcEsc(b.body)}</p>`:''}
    <div class="bc-f"><span>📍 ${bcEsc(bcArea(b))}</span>${b.scope==='circle'?`<button type="button" class="bc-map" data-bc-map="${bcEsc(b.id)}">ดูบนแผนที่</button>`:''}${b.link?`<a href="${bcEsc(b.link)}" target="_blank" rel="noopener">เปิดลิงก์ ↗</a>`:''}</div>`;
  return el;
}
function renderBroadcasts(){
  let bar=document.getElementById('bc-bar');
  if(!bar){const main=document.getElementById('main');if(!main)return;bar=document.createElement('section');bar.id='bc-bar';bar.className='bc-bar';bar.setAttribute('aria-label','ประกาศแจ้งเตือนพื้นที่');bar.setAttribute('aria-live','polite');main.prepend(bar)}
  const rank={danger:0,warn:1,info:2},items=BC.items.map(b=>({b,m:bcMatch(b)})).sort((x,y)=>(rank[x.b.level]-rank[y.b.level])||(y.b.createdAt-x.b.createdAt));
  const mine=items.filter(x=>x.m===true||(x.m===null&&x.b.level==='danger')),unknown=items.filter(x=>x.m===null&&x.b.level!=='danger'),other=items.filter(x=>x.m===false);
  bar.replaceChildren();bar.hidden=!items.length;if(!items.length)return;
  const shown=BC.open?items:mine.slice(0,3);
  shown.forEach(x=>bar.append(bcCard(x.b,x.m)));
  const rest=items.length-shown.length,needLoc=items.some(x=>x.m===null);
  const foot=document.createElement('div');foot.className='bc-foot';
  if(rest>0||BC.open){const t=document.createElement('button');t.type='button';t.className='bc-more';t.textContent=BC.open?'ย่อประกาศ':`ประกาศทั้งหมด ${items.length} รายการ`+(other.length?` (พื้นที่อื่น ${other.length})`:'');t.onclick=()=>{BC.open=!BC.open;renderBroadcasts()};foot.append(t)}
  if(needLoc){
    const g=document.createElement('button');g.type='button';g.className='bc-more';g.textContent='📍 ตรวจว่าตรงพื้นที่ฉันไหม';
    g.onclick=()=>{if(!navigator.geolocation)return;g.disabled=true;g.textContent='กำลังหาตำแหน่ง…';navigator.geolocation.getCurrentPosition(p=>{bcRememberPlace(p.coords.latitude,p.coords.longitude);renderBroadcasts()},()=>{g.disabled=false;g.textContent='หาตำแหน่งไม่ได้ · เลือกเขตแทน'},{enableHighAccuracy:false,timeout:15000,maximumAge:300000})};
    foot.append(g);
  }
  if(items.some(x=>x.b.scope==='district')){
    const s=document.createElement('select');s.className='bc-district';s.setAttribute('aria-label','เขตของฉัน');
    s.innerHTML='<option value="">เขตของฉัน…</option>'+(typeof BKK_DISTRICTS!=='undefined'?BKK_DISTRICTS:[]).map(d=>`<option ${d===bcMyDistrict()?'selected':''}>${bcEsc(d)}</option>`).join('');
    s.onchange=()=>{bcSet('uh_bc_district',s.value);renderBroadcasts()};foot.append(s);
  }
  if(foot.children.length)bar.append(foot);
  if(!mine.length&&!BC.open&&unknown.length+other.length){const n=document.createElement('p');n.className='bc-none';n.textContent=`มีประกาศ ${items.length} รายการ`+(unknown.length?' · ยังไม่รู้ว่าตรงพื้นที่คุณไหม':' ในพื้นที่อื่น');bar.prepend(n)}
}
function bcShow(id){BC.open=true;renderBroadcasts();const el=document.getElementById('bc-'+id);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('bc-flash');setTimeout(()=>el.classList.remove('bc-flash'),1600)}}
/* วงพื้นที่ประกาศบนแผนที่ */
function drawBroadcastAreas(){
  if(typeof fmap==='undefined'||!fmap||!window.L)return;
  if(!BC.layer)BC.layer=L.layerGroup().addTo(fmap);BC.layer.clearLayers();
  const col={danger:'#c62828',warn:'#ef6c00',info:'#1f5fbf'};
  BC.items.filter(b=>b.scope==='circle'&&isFinite(+b.lat)&&+b.lat).forEach(b=>{
    L.circle([+b.lat,+b.lng],{radius:(+b.radiusKm||1)*1000,color:col[b.level]||col.info,weight:2,fillOpacity:.10,dashArray:b.level==='info'?'6 6':null})
      .bindPopup(`<b>${bcEsc((BC_LV[b.level]||BC_LV.info).i+' '+b.title)}</b><br>${bcEsc(String(b.body||'').slice(0,200))}<br><small>รัศมี ${bcEsc(b.radiusKm)} กม. · ${bcEsc(bcAgo(b.createdAt))}</small>`).addTo(BC.layer)});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-bc-map]');if(!b)return;const it=BC.items.find(x=>x.id===b.dataset.bcMap);if(!it)return;
  if(typeof setView==='function')setView('map');setTimeout(()=>{if(typeof fmap!=='undefined'&&fmap){fmap.invalidateSize();fmap.fitBounds(L.circle([+it.lat,+it.lng],{radius:(+it.radiusKm||1)*1000}).addTo(fmap).getBounds(),{padding:[20,20]});drawBroadcastAreas()}},400)});
/* แผนที่สร้างทีหลัง → วาดวงเมื่อแผนที่พร้อม */
/* หน้าหลังบ้านโหลดไฟล์นี้เพื่อใช้ค่าคงที่ร่วม (BROADCAST_URL, BC_LV) เท่านั้น — แสดงผลเฉพาะหน้าเว็บสาธารณะ */
if(document.getElementById('view-home')){
setInterval(()=>{if(BC.items.length&&typeof fmap!=='undefined'&&fmap&&!BC.layer)drawBroadcastAreas()},3000);
setInterval(()=>{if(!document.hidden)loadBroadcasts()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-BC.loaded>30000)loadBroadcasts()});
loadBroadcasts();
}
