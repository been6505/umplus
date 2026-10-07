/* หลังบ้าน: ส่งประกาศแจ้งเตือนพื้นที่ (ใช้ Apps Script แยก backend/broadcast.gs, รหัส BROADCAST_KEY) */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const st={get(k){try{return localStorage.getItem(k)||sessionStorage.getItem(k)||''}catch(e){return ''}},
  set(k,v,rem=true){try{localStorage.removeItem(k);sessionStorage.removeItem(k);if(v)(rem?localStorage:sessionStorage).setItem(k,v)}catch(e){}}};
const A={key:st.get('uh_bc_key'),items:[],center:null,map:null,mk:null,circle:null};
function toast(msg,ok){const t=document.createElement('div');t.className='toast'+(ok?' ok':'');t.textContent=msg;$('#toasts').append(t);setTimeout(()=>t.remove(),4500)}
async function bget(params){const r=await fetch(BROADCAST_URL+'?'+new URLSearchParams({...params,key:A.key,t:Date.now()}),{cache:'no-store'});return r.json()}
async function bpost(body){const r=await fetch(BROADCAST_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,key:A.key})});const j=await r.json();
  if(j&&j.error==='not_admin'){logout('รหัสไม่ถูกต้องหรือถูกเปลี่ยน กรุณาเข้าสู่ระบบใหม่');throw new Error('auth')}return j}
function logout(msg){st.set('uh_bc_key','');A.key='';$('#app').hidden=true;$('#login').hidden=false;$('#login-err').textContent=msg||''}
const ERR={title_required:'ใส่หัวข้อก่อน',center_required:'แตะแผนที่เพื่อวางจุดศูนย์กลางก่อน',district_required:'เลือกอย่างน้อย 1 เขต'};

/* ---------- เข้าระบบ ---------- */
async function boot(){
  if(!BROADCAST_URL){$('#setup').hidden=false;return}
  $('#logout').onclick=()=>logout('ออกจากระบบแล้ว');$('#refresh').onclick=load;
  $('#login-form').onsubmit=async e=>{e.preventDefault();const k=$('#login-key').value.trim();if(!k)return;$('#login-go').disabled=true;$('#login-err').textContent='กำลังตรวจรหัส…';
    try{A.key=k;const r=await bget({action:'broadcast_ping'});
      if(r&&r.ok){st.set('uh_bc_key',k,$('#login-remember').checked);$('#login-key').value='';$('#login').hidden=true;start()}
      else{A.key='';$('#login-err').textContent='รหัสไม่ถูกต้อง'}}
    catch(err){A.key='';$('#login-err').textContent='เชื่อมต่อไม่ได้ ตรวจ BROADCAST_URL / การ deploy'}finally{$('#login-go').disabled=false}};
  if(A.key)start();else{$('#login').hidden=false;setTimeout(()=>$('#login-key').focus(),50)}
}
function start(){$('#app').hidden=false;$('#login').hidden=true;initForm();load()}
async function load(){$('#sync').textContent='กำลังโหลด…';
  try{const r=await bget({action:'broadcasts',all:1});if(r&&r.error==='not_admin'){logout('รหัสไม่ถูกต้อง');return}
    A.items=(r&&r.broadcasts)||[];render();$('#sync').textContent='อัปเดต '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}
  catch(e){$('#sync').textContent='โหลดไม่สำเร็จ'}}

/* ---------- ฟอร์ม ---------- */
function initForm(){
  if(A.form)return;A.form=true;
  $('#dists').innerHTML=BKK_DISTRICTS.map(d=>`<label><input type="checkbox" name="district" value="${d}"><span>${d}</span></label>`).join('');
  const sync=()=>{const s=$('#bc-form').scope.value;$('#scope-district').hidden=s!=='district';$('#scope-circle').hidden=s!=='circle';if(s==='circle')initMap()};
  $$('#bc-form [name=scope]').forEach(r=>r.onchange=sync);
  $('#bc-form [name=radiusKm]').oninput=drawCircle;
  $('#bc-form').onsubmit=send;
}
function initMap(){
  if(A.map){setTimeout(()=>A.map.invalidateSize(),50);return}
  if(!window.L){$('#bc-center').textContent='โหลดแผนที่ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วรีเฟรช';return}
  A.map=L.map('bc-map').setView([13.7563,100.5018],11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(A.map);
  A.map.on('click',e=>{A.center={lat:e.latlng.lat,lng:e.latlng.lng};drawCircle()});
  setTimeout(()=>A.map.invalidateSize(),50);
}
function drawCircle(){
  if(!A.map||!A.center)return;const r=Math.max(0.1,Number($('#bc-form').radiusKm.value)||2)*1000;
  if(!A.mk){A.mk=L.marker([A.center.lat,A.center.lng],{draggable:true}).addTo(A.map);A.mk.on('dragend',()=>{const ll=A.mk.getLatLng();A.center={lat:ll.lat,lng:ll.lng};drawCircle()})}
  A.mk.setLatLng([A.center.lat,A.center.lng]);
  if(!A.circle)A.circle=L.circle([A.center.lat,A.center.lng],{radius:r,color:'#c62828',weight:2,fillOpacity:.12}).addTo(A.map);
  A.circle.setLatLng([A.center.lat,A.center.lng]);A.circle.setRadius(r);
  $('#bc-center').textContent=`จุด ${A.center.lat.toFixed(5)}, ${A.center.lng.toFixed(5)} · รัศมี ${(r/1000).toFixed(1)} กม.`;
}
async function send(e){
  e.preventDefault();const f=e.target,fd=new FormData(f);
  const item={title:String(fd.get('title')||'').trim(),body:String(fd.get('body')||'').trim(),level:fd.get('level'),scope:fd.get('scope'),
    districts:fd.getAll('district'),lat:A.center?A.center.lat:'',lng:A.center?A.center.lng:'',radiusKm:Number(fd.get('radiusKm'))||2,hours:Number(fd.get('hours'))||24,link:String(fd.get('link')||'').trim()};
  if(!item.title){toast(ERR.title_required);return}
  if(item.scope==='district'&&!item.districts.length){toast(ERR.district_required);return}
  if(item.scope==='circle'&&!A.center){toast(ERR.center_required);return}
  if(item.link&&!/^https:\/\//.test(item.link)){toast('ลิงก์ต้องขึ้นต้นด้วย https://');return}
  const area=item.scope==='all'?'ทั้งกรุงเทพฯ':item.scope==='district'?'เขต'+item.districts.join(', '):`รัศมี ${item.radiusKm} กม.`;
  if(!confirm(`ส่งประกาศ "${item.title}"\nระดับ: ${BC_LV[item.level].t}\nพื้นที่: ${area}\n\nทุกคนที่เปิดเว็บในพื้นที่นี้จะได้รับแจ้งเตือน`))return;
  const b=$('#bc-send');b.disabled=true;b.textContent='กำลังส่ง…';
  try{const r=await bpost({action:'broadcast_save',item,by:st.get('uh_staff')||st.get('uh_team')||'แอดมิน'});
    if(!r.ok){toast('ส่งไม่สำเร็จ: '+(ERR[r.error]||r.error||''));return}
    toast('ส่งประกาศแล้ว · ผู้ใช้จะเห็นภายใน 1 นาที',true);f.title.value='';f.body.value='';f.link.value='';load()}
  catch(err){if(err.message!=='auth')toast('ส่งไม่สำเร็จ ลองใหม่')}finally{b.disabled=false;b.textContent='ส่งประกาศ'}
}
/* ---------- รายการ ---------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){
  const now=Date.now(),live=b=>b.active&&(!b.expiresAt||b.expiresAt>now);
  $('#bc-count').textContent=A.items.filter(live).length+' ใช้งานอยู่';
  $('#bc-list').innerHTML=A.items.length?A.items.map(b=>{const on=live(b),lv=BC_LV[b.level]||BC_LV.info;
    return `<article class="bc bc-${esc(b.level)} ${on?'':'bc-off'}"><div class="bc-h"><span class="bc-lv">${lv.i} ${lv.t}</span><span class="bc-maybe">${on?'กำลังแสดง':!b.active?'ยกเลิกแล้ว':'หมดอายุ'}</span><small>${esc(bcAgo(b.createdAt))}${b.by?' · '+esc(b.by):''}</small></div>
      <strong>${esc(b.title)}</strong>${b.body?`<p>${esc(b.body)}</p>`:''}
      <div class="bc-f"><span>📍 ${esc(bcArea(b))}</span><span>${on?'ถึง '+new Date(b.expiresAt).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}</span>${on?`<button type="button" class="bc-map" data-cancel="${esc(b.id)}">ยกเลิกประกาศ</button>`:''}</div></article>`}).join(''):'<p class="empty">ยังไม่มีประกาศ</p>';
}
document.addEventListener('click',async e=>{const c=e.target.closest('[data-cancel]');if(!c)return;const b=A.items.find(x=>x.id===c.dataset.cancel);
  if(!b||!confirm('ยกเลิกประกาศ "'+b.title+'" ?'))return;
  try{const r=await bpost({action:'broadcast_cancel',id:b.id});if(r.ok){toast('ยกเลิกแล้ว',true);load()}else toast('ไม่สำเร็จ')}catch(err){}});
boot();
