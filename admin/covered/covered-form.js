/* ฟอร์มกรอก "พื้นที่ที่มอบแล้ว" → เขียนแถวใหม่ลงชีต (ผ่านระบบหลังบ้าน) แทนการเปิดชีตกรอกเอง
   ถ้าระบบหลังบ้านยังไม่รองรับ จะให้คัดลอกแถวไปวางในชีตแทน */
(()=>{
const ITEMS=['ถุงยังชีพ','อาหารกล่อง','น้ำดื่ม','ข้าวสาร','ยา/เวชภัณฑ์','ของใช้จำเป็น','ผ้าห่ม/เสื้อผ้า','นมผง/ของเด็ก'];
const two=n=>String(n).padStart(2,'0');
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+two(d.getMonth()+1)+'-'+two(d.getDate())};
const thaiDate=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?(+m[3])+'/'+(+m[2])+'/'+(+m[1]+543):''};
const LL=/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)\s*$/;
let pick=null;   // แผนที่เล็กในฟอร์ม

function open(){
  const orgs=[...new Set(COVERED.C.rows.map(r=>r.org).filter(Boolean))];
  const last=store.get('uh_cov_org')||'';
  const d=$('#drawer');
  d.innerHTML=`<div class="d-head"><div><h2>เพิ่มพื้นที่ที่มอบแล้ว</h2><small class="muted">บันทึกลงชีตเดียวกับที่ทีมกรอก · ช่องที่มี * ต้องกรอก</small></div><button class="x" id="d-close" aria-label="ปิด">✕</button></div>
  <form id="cform" class="form-grid" novalidate>
    <label class="fld"><span>องค์กร *</span><input name="org" required maxlength="80" list="cf-orgs" value="${esc(last)}" placeholder="เช่น สภาเครือข่าย" autocomplete="off"><datalist id="cf-orgs">${orgs.map(o=>`<option value="${esc(o)}">`).join('')}</datalist></label>
    <label class="fld"><span>วันที่ *</span><input name="date" type="date" required value="${todayISO()}"></label>
    <label class="fld"><span>รายการ</span><input name="items" maxlength="120" list="cf-items" placeholder="เช่น ถุงยังชีพ" autocomplete="off"><datalist id="cf-items">${ITEMS.map(o=>`<option value="${o}">`).join('')}</datalist></label>
    <label class="fld"><span>จำนวน</span><input name="qty" maxlength="40" inputmode="numeric" placeholder="เช่น 120 หรือ 50 แพ็ก" autocomplete="off"></label>
    <div class="fld cf-wide"><span>สถานที่ *</span><textarea name="place" required maxlength="200" rows="2" placeholder="ชื่อชุมชน/ซอย/มัสยิด และเขต เช่น ชุมชนวังโสม หัวหมาก เขตบางกะปิ" aria-label="สถานที่"></textarea>
      <button type="button" class="btn ghost-d sm cf-find" id="cf-find">🔍 ค้นหาตำแหน่งจากชื่อสถานที่</button>
      <div class="cf-found" id="cf-found" hidden></div></div>
    <div class="fld cf-wide"><span>โลเคชั่น <small class="muted">(สำคัญ: ทำให้หมุดบนแผนที่ตรงจุด)</small></span>
      <input name="location" maxlength="300" placeholder="วางลิงก์ Google Maps หรือพิกัด เช่น 13.8123, 100.7012" autocomplete="off" aria-label="โลเคชั่น">
      <div class="cf-locbtn"><button type="button" class="btn ghost-d sm" id="cf-gps">📍 ใช้ตำแหน่งปัจจุบัน</button><button type="button" class="btn ghost-d sm" id="cf-pick">🗺 เลือกบนแผนที่</button></div>
      <div class="cf-map" id="cf-map" hidden></div>
      <small class="muted" id="cf-lochint"></small>
    </div>
    <div class="cf-wide cf-dup" id="cf-dup" hidden></div>
    <p class="err cf-wide" id="cf-err" role="alert"></p>
    <div class="form-act cf-wide"><button class="btn primary" id="cf-save" type="submit">บันทึกลงชีต</button><button class="btn ghost-d" type="button" id="cf-cancel">ยกเลิก</button></div>
    <p class="muted small cf-wide">ห้ามใส่ชื่อหรือเบอร์โทรผู้ประสบภัยในฟอร์มนี้ · บันทึกแล้วขึ้นในหน้านี้ทันที และในชีตภายในไม่กี่วินาที</p>
  </form>`;
  d.hidden=false;$('#drawer-bg').hidden=false;pick=null;
  const f=$('#cform'),close=()=>{d.hidden=true;$('#drawer-bg').hidden=true;pick=null};
  $('#d-close').onclick=close;$('#cf-cancel').onclick=close;$('#drawer-bg').onclick=close;
  setTimeout(()=>(last?f.elements.place:f.elements.org).focus(),50);
  const loc=f.elements.location;
  loc.addEventListener('input',()=>{showLoc();checkDup()});
  const pl=f.elements.place,grow=()=>{pl.style.height='auto';pl.style.height=pl.scrollHeight+2+'px'};
  pl.addEventListener('input',()=>{grow();checkDup()});
  pl.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();find()}});
  $('#cf-find').onclick=find;
  $('#cf-gps').onclick=()=>{if(!navigator.geolocation){hint('เครื่องนี้ไม่รองรับการหาตำแหน่ง');return}
    hint('กำลังหาตำแหน่ง…');navigator.geolocation.getCurrentPosition(p=>{setLL(p.coords.latitude,p.coords.longitude);hint('ใช้ตำแหน่งปัจจุบัน (คลาดเคลื่อน ~'+Math.round(p.coords.accuracy)+' ม.) ถ้าไม่ได้ยืนอยู่ที่จุดนั้น ให้เลือกบนแผนที่แทน')},
      e=>hint(e.code===1?'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์ หรือเลือกบนแผนที่':'หาตำแหน่งไม่ได้ ลองเลือกบนแผนที่'),{enableHighAccuracy:true,timeout:15000,maximumAge:60000})};
  $('#cf-pick').onclick=()=>{const m=$('#cf-map');if(!m.hidden){m.hidden=true;return}openPick()};
  f.addEventListener('submit',e=>{e.preventDefault();save(f)});
}
function hint(t){const h=$('#cf-lochint');if(h)h.textContent=t}
function curLL(){const v=$('#cform').elements.location.value.trim();const m=v.match(LL);if(m)return [+m[1],+m[2]];return COVERED.coordsFromUrl(v)}
function setLL(a,b){const f=$('#cform');f.elements.location.value=a.toFixed(6)+', '+b.toFixed(6);showLoc();checkDup()}
function showLoc(){const v=$('#cform').elements.location.value.trim(),ll=curLL();
  if(pick&&ll){putMk(ll);pick.map.setView(ll,Math.max(pick.map.getZoom(),16))}
  if(!v)hint('');else if(ll)hint('✓ ได้พิกัด '+ll[0].toFixed(5)+', '+ll[1].toFixed(5));
  else if(/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.)/i.test(v))hint('✓ ลิงก์ Google Maps ระบบจะหาพิกัดจากลิงก์ให้');
  else if(/^https?:\/\//i.test(v))hint('ลิงก์นี้ไม่ใช่ Google Maps ตรวจอีกครั้ง');
  else hint('ใส่ได้เฉพาะลิงก์ Google Maps หรือพิกัดแบบ 13.8123, 100.7012')}
function openPick(){
  const el=$('#cf-map');el.hidden=false;if(pick){setTimeout(()=>pick.map.invalidateSize(),50);return Promise.resolve(true)}
  return loadLeaflet().then(()=>{if(!document.body.contains(el))return false;if(pick)return true;
    const ll=curLL();pick={map:L.map(el).setView(ll||[13.76,100.65],ll?15:11),mk:null};
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(pick.map);
    COVERED.C.rows.filter(r=>r.lat!=null).forEach(r=>L.circleMarker([r.lat,r.lng],{radius:5,color:'#fff',weight:1.5,fillColor:'#7b3fc4',fillOpacity:.7}).bindTooltip(r.org+' · '+r.area).addTo(pick.map));
    if(ll)putMk(ll);
    pick.map.on('click',e=>setLL(e.latlng.lat,e.latlng.lng));
    hint('แตะบนแผนที่ตรงจุดที่มอบของ (จุดม่วง = พื้นที่ที่มีคนมอบแล้ว)');setTimeout(()=>pick.map.invalidateSize(),50);return true},
    ()=>{hint('โหลดแผนที่ไม่ได้ ใช้วิธีวางลิงก์แทน');return false})}
function putMk(ll){if(!pick)return;if(pick.mk){pick.mk.setLatLng(ll);return}
  pick.mk=L.marker(ll,{draggable:true}).addTo(pick.map);pick.mk.on('dragend',()=>{const p=pick.mk.getLatLng();setLL(p.lat,p.lng)})}
/* ค้นหาพิกัดจากข้อความในช่องสถานที่ทั้งกล่อง: ลองทั้งข้อความก่อน แล้วค่อยตัดคำท้ายทีละคำถ้าไม่พบ */
const BBOX='99.8,13.3,101.4,14.3';
async function geo(q,nomi){const out=[];
  try{const j=await fetch('https://photon.komoot.io/api/?limit=5&lat=13.75&lon=100.6&location_bias_scale=0.5&bbox='+BBOX+'&q='+encodeURIComponent(q)).then(x=>x.json());
    (j.features||[]).forEach(f=>{const c=f.geometry&&f.geometry.coordinates,p=f.properties||{};if(c)out.push({lat:c[1],lng:c[0],name:[p.name,p.street,p.district||p.locality,p.city].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')})})}catch(e){}
  if(!out.length&&nomi)try{const j=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=th&accept-language=th&viewbox=99.8,14.3,101.4,13.3&bounded=1&q='+encodeURIComponent(q)).then(x=>x.json());
    (j||[]).forEach(r=>out.push({lat:+r.lat,lng:+r.lon,name:String(r.display_name||'').split(',').slice(0,4).join(' ·')}))}catch(e){}
  return out}
let finding=0;
async function find(){
  const f=$('#cform'),box=$('#cf-found'),btn=$('#cf-find'),raw=f.elements.place.value.replace(/\s+/g,' ').trim();
  if(raw.length<3){box.hidden=false;box.innerHTML='<span class="muted">พิมพ์ชื่อสถานที่ก่อน แล้วกดค้นหา</span>';f.elements.place.focus();return}
  const my=++finding;btn.disabled=true;btn.textContent='กำลังค้นหา…';box.hidden=false;box.innerHTML='<span class="muted">กำลังค้นหา "'+esc(raw)+'"…</span>';
  const base=raw.replace(/\d[\d,]*\s*ชุด/g,' ').replace(/[()]/g,' ').replace(/\s+/g,' ').trim();
  const words=base.split(' ');const tries=[];for(let n=words.length;n>=1&&tries.length<4;n--){const q=words.slice(0,n).join(' ');if(q.length>=3)tries.push(q)}
  let res=[],used='';for(const q of tries){res=await geo(q+(/กรุงเทพ/.test(q)?'':' กรุงเทพ'));if(!res.length)res=await geo(q);if(res.length){used=q;break}}
  // สำรอง: OpenStreetMap Nominatim (จำกัด 1 ครั้ง/วินาที จึงลองแค่ 2 แบบ)
  if(!res.length)for(const q of tries.slice(0,2)){res=await geo(q,true);if(res.length){used=q;break}await new Promise(s=>setTimeout(s,1100))}
  if(my!==finding)return;btn.disabled=false;btn.textContent='🔍 ค้นหาตำแหน่งจากชื่อสถานที่';
  if(!res.length){box.innerHTML='ไม่พบตำแหน่งจากชื่อนี้ · ลองพิมพ์ชื่อซอย/ถนนให้สั้นลง หรือกด "เลือกบนแผนที่" แล้วแตะตรงจุด';return}
  box.innerHTML=(used!==base?'<small class="muted">ไม่พบทั้งข้อความ ค้นด้วย "'+esc(used)+'"</small>':'')+
    '<div class="cf-res">'+res.map((r,i)=>`<button type="button" data-i="${i}" aria-pressed="${i===0}"><b>${i+1}.</b> ${esc(r.name||'ไม่มีชื่อ')}<small>${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</small></button>`).join('')+'</div>'+
    '<small class="muted">แตะเลือกผลที่ตรง (เลือกผลที่ 1 ไว้ให้ก่อน) แล้วตรวจหมุดบนแผนที่ ลากหมุดหรือแตะแผนที่เพื่อขยับได้</small>';
  const use=i=>{const r=res[i];box.querySelectorAll('.cf-res button').forEach((b,j)=>b.setAttribute('aria-pressed',j===i));
    openPick().then(ok=>{setLL(r.lat,r.lng);if(ok&&pick)pick.map.setView([r.lat,r.lng],16);hint('ตำแหน่งจากการค้นหา: '+r.lat.toFixed(5)+', '+r.lng.toFixed(5)+' · ตรวจว่าหมุดตรงจุดจริง ลากหมุดเพื่อขยับได้')})};
  box.querySelectorAll('.cf-res button').forEach(b=>b.onclick=()=>use(+b.dataset.i));use(0);
}
/* เตือนก่อนบันทึก ถ้ามีองค์กรมอบใกล้จุดนี้หรือชื่อสถานที่ซ้ำ */
function checkDup(){
  const f=$('#cform'),box=$('#cf-dup'),ll=curLL(),place=f.elements.place.value.trim();
  const ks=place.length>=3?[...COVERED.keys(place)].filter(k=>k.length>=4):[];
  const near=COVERED.C.rows.map(r=>{
    if(ll&&r.lat!=null){const d=COVERED.distM(ll[0],ll[1],r.lat,r.lng);if(d<=800)return {r,why:'ห่าง ~'+(d<100?'<100':Math.round(d/50)*50)+' ม.',d}}
    if(ks.length&&r.area&&ks.some(k=>r.area.includes(k)))return {r,why:'ชื่อสถานที่คล้ายกัน',d:9e9};return null}).filter(Boolean).sort((a,b)=>a.d-b.d).slice(0,4);
  box.hidden=!near.length;
  box.innerHTML=near.length?`<b>⚠ มีองค์กรมอบในพื้นที่นี้แล้ว ${near.length} รายการ</b> ตรวจก่อนบันทึก ถ้าเป็นการมอบรอบใหม่ บันทึกได้ตามปกติ<ul>${near.map(x=>`<li>${esc(x.r.org)} · ${esc(x.r.area)} · ${esc(x.r.date)}${x.r.items?' · '+esc(x.r.items):''}${x.r.sets?' '+esc(x.r.sets):''} <small class="muted">(${x.why})</small></li>`).join('')}</ul>`:''}

async function save(f){
  const v=k=>f.elements[k].value.trim(),err=$('#cf-err');err.textContent='';
  const row={org:v('org'),date:thaiDate(v('date')),items:v('items'),qty:v('qty'),place:v('place'),location:v('location')};
  if(!row.org){err.textContent='กรอกชื่อองค์กร';f.elements.org.focus();return}
  if(!row.place){err.textContent='กรอกสถานที่';f.elements.place.focus();return}
  if(!row.date){err.textContent='เลือกวันที่';f.elements.date.focus();return}
  if(row.location&&!curLL()&&!/^https?:\/\//i.test(row.location)){err.textContent='โลเคชั่นต้องเป็นลิงก์ Google Maps หรือพิกัด เช่น 13.8123, 100.7012 (หรือเว้นว่าง)';f.elements.location.focus();return}
  if(row.location&&!/^https?:\/\//i.test(row.location)){const ll=curLL();row.location=ll[0]+', '+ll[1]}
  if(/(^|\D)0\d{1,2}[- ]?\d{3}[- ]?\d{3,4}(\D|$)/.test(row.place+' '+row.items+' '+row.qty)){err.textContent='พบเลขคล้ายเบอร์โทร ห้ามใส่เบอร์โทรในฟอร์มนี้';return}
  const btn=$('#cf-save');btn.disabled=true;btn.textContent='กำลังบันทึก…';
  let r=null;try{r=await apiPost({action:'covered_add',row,by:staffName()})}catch(e){if(e&&e.message==='auth')return}
  btn.disabled=false;btn.textContent='บันทึกลงชีต';
  if(r&&r.ok){store.set('uh_cov_org',row.org);
    const ll=curLL(),nr=COVERED.addLocal([row.org,row.place,row.date,/^https?:\/\//i.test(row.location)?row.location:'','',row.qty,'','',row.items]);
    if(ll){nr.lat=ll[0];nr.lng=ll[1]}
    $('#drawer').hidden=true;$('#drawer-bg').hidden=true;pick=null;toast('บันทึกแล้ว: '+row.place);
    M.fitted=true;render();if(nr.lat!=null&&M.map)M.map.setView([nr.lat,nr.lng],14);
    setTimeout(()=>{COVERED.C.loaded=0;load()},4000);return}
  // ระบบหลังบ้านยังไม่รองรับ / ส่งไม่ได้: ให้คัดลอกแถวไปวางในชีตเอง
  const tsv=[row.org,row.date,row.items,row.qty,row.place,row.location].join('\t');
  err.innerHTML=(r&&r.error&&r.error!=='unknown_action'?'บันทึกไม่สำเร็จ ('+esc(r.error)+')':r?'ระบบหลังบ้านยังไม่เปิดให้บันทึกจากฟอร์ม':'ส่งข้อมูลไม่ได้ ตรวจอินเทอร์เน็ต')+
    ' · ใช้วิธีสำรอง: <button type="button" class="linkish" id="cf-copy">คัดลอกแถวนี้</button> แล้ว <a href="'+esc(COVERED.SHEET_URL)+'" target="_blank" rel="noopener">เปิดชีต ↗</a> วางที่ช่อง A ของแถวว่างล่างสุด';
  $('#cf-copy').onclick=async()=>{try{await navigator.clipboard.writeText(tsv);toast('คัดลอกแล้ว ไปวางในชีตได้เลย')}catch(e){prompt('คัดลอกข้อความนี้',tsv)}};
}
$('#add-cov').addEventListener('click',open);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#drawer').hidden){$('#drawer').hidden=true;$('#drawer-bg').hidden=true;pick=null}});
})();
