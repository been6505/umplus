/* ส่วนกลางหน้าหลังบ้าน (จัดทีม / สต็อก): เข้าระบบด้วยรหัสทีม, เรียก API, แจ้งเตือน */
const API_URL='https://script.google.com/macros/s/AKfycbyWeVDhToFJntjTGHprDEByEfRFdSbOidlR7QhJ6xG1bz7co2gCRkTGIoKDI9tJqGkWTw/exec';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* ลิงก์นำทาง Google Maps: มีหมุดใช้พิกัด ไม่มีหมุดใช้ที่อยู่ · dir_action=navigate = เริ่มนำทางทันทีบนมือถือ */
const navUrl=c=>{const pin=c&&c.lat!==''&&c.lat!=null&&c.lng!==''&&c.lng!=null&&isFinite(+c.lat)&&isFinite(+c.lng),q=pin?`${(+c.lat).toFixed(6)},${(+c.lng).toFixed(6)}`:[c&&c.address,c&&c.district?'เขต'+c.district:''].filter(Boolean).join(' ');
  return q?'https://www.google.com/maps/dir/?api=1&dir_action=navigate&destination='+encodeURIComponent(pin?q:q+' กรุงเทพมหานคร'):''};
const nf=n=>Number(n||0).toLocaleString('th-TH');
const store={get(k){try{return localStorage.getItem(k)||sessionStorage.getItem(k)||''}catch(e){return ''}},
  set(k,v,rem=true){try{if(!v){localStorage.removeItem(k);sessionStorage.removeItem(k);return}(rem?localStorage:sessionStorage).setItem(k,v)}catch(e){}}};
const ADM={key:store.get('uh_vol_key')};
function ago(t){t=Number(t);if(!t)return '';const m=Math.round((Date.now()-t)/60000);if(m<1)return 'เมื่อสักครู่';if(m<60)return m+' นาทีที่แล้ว';const h=Math.round(m/60);if(h<24)return h+' ชม.ที่แล้ว';return new Date(t).toLocaleDateString('th-TH',{day:'numeric',month:'short'})+' '+new Date(t).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}
function toast(msg,ok){const t=document.createElement('div');t.className='toast'+(ok?' ok':'');t.textContent=msg;$('#toasts').append(t);setTimeout(()=>t.remove(),4000)}
async function apiGet(params){const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),25000);
  try{const r=await fetch(API_URL+'?'+new URLSearchParams({...params,key:ADM.key,t:Date.now()}),{signal:ctl.signal,cache:'no-store'});return await r.json()}finally{clearTimeout(tm)}}
async function apiPost(body){const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,key:ADM.key})});const j=await r.json();
  if(j&&j.error==='not_volunteer'){logout('รหัสหมดอายุ กรุณาเข้าสู่ระบบใหม่');throw new Error('auth')}return j}
function staffName(){let n=store.get('uh_staff')||store.get('uh_team');if(!n){n=(prompt('ชื่อผู้บันทึก (ใช้ระบุว่าใครแก้ข้อมูล)')||'').trim();if(n)store.set('uh_staff',n)}return n}
function logout(msg){store.set('uh_vol_key','');store.set('uh_vol_ok','');ADM.key='';$('#app').hidden=true;$('#login').hidden=false;$('#login-err').textContent=msg||''}
/* onReady(firstResponse) เรียกเมื่อเข้าระบบได้ */
function adminBoot(probe,field,onReady){
  const good=r=>r&&r.ok&&r[field]!==undefined;
  $('#logout').addEventListener('click',()=>logout('ออกจากระบบแล้ว'));
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const k=$('#login-key').value.trim();if(!k)return;$('#login-go').disabled=true;$('#login-err').textContent='กำลังตรวจรหัส…';
    try{ADM.key=k;const r=await apiGet(probe);
      if(good(r)){const rem=$('#login-remember').checked;store.set('uh_vol_key',k,rem);store.set('uh_vol_ok','1',rem);$('#login-key').value='';$('#login').hidden=true;$('#app').hidden=false;onReady(r)}
      else{ADM.key='';$('#login-err').textContent=r&&r.error==='not_volunteer'?'รหัสไม่ถูกต้อง':r&&r.ok?'ระบบหลังบ้านยังไม่รองรับหน้านี้ ต้องอัปเดต Code.gs ก่อน':'ใช้งานไม่ได้: '+(r&&r.error||'')}}
    catch(err){ADM.key='';$('#login-err').textContent='เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'}finally{$('#login-go').disabled=false}});
  if(ADM.key){$('#app').hidden=false;apiGet(probe).then(r=>{if(good(r))onReady(r);else if(r&&r.error==='not_volunteer')logout('รหัสหมดอายุ กรุณาเข้าสู่ระบบใหม่');else{$('#main').innerHTML='<p class="empty">หน้านี้ต้องอัปเดต Code.gs ก่อนจึงจะใช้งานได้ (ระบบตอบกลับ: '+esc(r&&r.error||'ไม่รองรับ')+')</p>'}}).catch(()=>{$('#main').innerHTML='<p class="empty">เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรช</p>'})}
  else{$('#login').hidden=false;setTimeout(()=>$('#login-key').focus(),50)}
}
