/* หน้า "พื้นที่มอบแล้ว": ตารางสดจากชีต + นับเคสที่อาจซ้ำ */
const P={cases:[],org:'',q:''};
$('#sheet-link').href=COVERED.SHEET_URL;
function render(){
  const rows=COVERED.C.rows.slice().sort((a,b)=>b.t-a.t||a.org.localeCompare(b.org,'th'));
  const st=$('#status');
  if(!rows.length){st.hidden=false;st.innerHTML=COVERED.C.error?esc(COVERED.C.error)+' · ตรวจว่าชีตแชร์แบบ "ทุกคนที่มีลิงก์ดูได้" <button class="linkish" id="retry">ลองใหม่</button>':'กำลังโหลดข้อมูลจากชีต…';
    const r=$('#retry');if(r)r.onclick=()=>{COVERED.C.loaded=0;load()};$('#tb').innerHTML='';$('#stats').innerHTML='';return}
  st.hidden=true;
  // นับเคสที่ยังไม่เสร็จที่ตรงกับแต่ละพื้นที่
  const hit=new Map();P.cases.filter(c=>c.status!=='done').forEach(c=>{const m=COVERED.match(c);if(m)m.all.forEach(h=>{const a=hit.get(h.r)||[];a.push(c);hit.set(h.r,a)})});
  const orgs=[...new Set(rows.map(r=>r.org).filter(Boolean))];
  $('#orgs').innerHTML=['',...orgs].map(o=>`<button data-o="${esc(o)}" aria-selected="${o===P.org}">${o?esc(o):'ทั้งหมด'} <small>${o?rows.filter(r=>r.org===o).length:rows.length}</small></button>`).join('');
  const q=P.q.trim().toLowerCase();
  const v=rows.filter(r=>(!P.org||r.org===P.org)&&(!q||[r.org,r.area,r.district,r.note,r.items].join(' ').toLowerCase().includes(q)));
  const sets=v.reduce((a,r)=>a+(/^[\d,]+(\s*ชุด)?$/.test(String(r.sets).trim())?parseInt(String(r.sets).replace(/,/g,''))||0:0),0);
  $('#stats').innerHTML=[[v.length,'พื้นที่'],[orgs.length,'องค์กร'],[v.filter(r=>!r.link).length,'ยังไม่มีลิงก์แผนที่'],[sets?nf(sets):'–','ชุด/ชิ้นที่ระบุ'],[v.filter(r=>hit.has(r)).length,'พื้นที่ที่มีเคสอาจซ้ำ']]
    .map(([n,l],i)=>`<div class="cv-stat${i===4&&n?' alert':''}"><b>${n}</b><span>${l}</span></div>`).join('');
  $('#tb').innerHTML=v.length?v.map(r=>{const cs=hit.get(r)||[];
    const map=r.link?`<a href="${esc(r.link)}" target="_blank" rel="noopener">เปิดแผนที่ ↗</a>`:'<span class="cv-warn">ยังไม่มีลิงก์</span>';
    const pos=r.lat==null?'<small class="muted">ไม่พบตำแหน่ง</small>':r.approx?'<small class="muted">ตำแหน่งโดยประมาณ</small>':r.src==='known'?'<small class="cv-ok">ตำแหน่งที่ทีมตรวจแล้ว</small>':'<small class="cv-ok">ตำแหน่งจากลิงก์</small>';
    return `<tr><td data-l="องค์กร"><span class="cov">${esc(r.org)}</span></td><td data-l="พื้นที่"><b>${esc(r.area)}</b>${r.note?`<small class="muted cv-note">${esc(r.note)}</small>`:''}</td><td data-l="เขต">${esc(r.district)}</td><td data-l="วันที่" class="d">${esc(r.date)}</td><td data-l="รายการ">${esc(r.items)}${r.items&&r.sets?'<br>':''}${r.sets?`<b>${/^[\d,]+$/.test(String(r.sets).trim())?nf(String(r.sets).replace(/,/g,''))+' ชุด':esc(r.sets)}</b>`:''}</td><td data-l="แผนที่">${map}<br>${pos}</td>
      <td data-l="เคสที่อาจซ้ำ"${cs.length?'':' class="cv-nodup"'}>${cs.length?`<a class="cv-dup" href="../../admin.html" title="${esc(cs.map(c=>'#'+c.id+' '+(c.address||'')).join('\n'))}"><span class="cv-m">⚠ อาจซ้ำ </span>${cs.length} เคส</a>`:'<span class="muted">–</span>'}</td><td data-l="go">${r.lat!=null?`<button class="cv-go" data-i="${COVERED.C.rows.indexOf(r)}">ดูบนแผนที่</button>`:''}</td></tr>`}).join(''):'<tr><td colspan="7" class="empty">ไม่พบพื้นที่ที่ตรงกับการค้นหา</td></tr>';
  drawMap(hit);
  $('#sync').textContent=COVERED.C.loaded?'อัปเดต '+ago(COVERED.C.loaded):'';
}
/* ---- แผนที่ ---- */
let leafletP=null;const M={map:null,cov:null,cases:null,fitted:false,mk:new Map()};
function loadLeaflet(){if(window.L)return Promise.resolve();if(leafletP)return leafletP;leafletP=new Promise((res,rej)=>{
  const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';css.integrity='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';css.crossOrigin='';document.head.append(css);
  const sc=document.createElement('script');sc.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';sc.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';sc.crossOrigin='';sc.onload=res;sc.onerror=()=>{leafletP=null;rej()};document.head.append(sc)});return leafletP}
function drawMap(hit){
  if(!window.L){loadLeaflet().then(()=>drawMap(hit),()=>{$('#cmap').innerHTML='<p class="empty" style="padding:16px">โหลดแผนที่ไม่ได้ ตรวจอินเทอร์เน็ตแล้วกดโหลดใหม่</p>'});return}
  if(!M.map){M.map=L.map($('#cmap'),{scrollWheelZoom:false}).setView([13.76,100.65],11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(M.map);
    M.cov=L.layerGroup().addTo(M.map);M.cases=L.layerGroup().addTo(M.map)}
  M.cov.clearLayers();M.cases.clearLayers();M.mk.clear();const pts=[];
  const rows=COVERED.C.rows.filter(r=>(!P.org||r.org===P.org)&&(!P.q||[r.org,r.area,r.district,r.note,r.items].join(' ').toLowerCase().includes(P.q.trim().toLowerCase())));
  rows.filter(r=>r.lat!=null).forEach(r=>{const ll=[r.lat,r.lng];pts.push(ll);const cs=(hit.get(r)||[]).length;
    L.circle(ll,{radius:r.approx?900:500,color:'#7b3fc4',weight:1.5,fillColor:'#7b3fc4',fillOpacity:r.approx?.06:.12,dashArray:r.approx?'5 5':null,interactive:false}).addTo(M.cov);
    const m=L.circleMarker(ll,{radius:r.approx?6:8,color:'#fff',weight:2,fillColor:'#7b3fc4',fillOpacity:r.approx?.55:1}).bindPopup(
      `<b>🤝 ${esc(r.org)}</b><br>${esc(r.area)}${r.district?' · เขต'+esc(r.district):''}<br>วันที่ ${esc(r.date)}${r.items?'<br>'+esc(r.items):''}${r.sets?' · '+esc(r.sets)+(/^[\d,]+$/.test(String(r.sets).trim())?' ชุด':''):''}${cs?`<br><b style="color:#5b2d91">เคสที่อาจซ้ำ ${cs} เคส</b>`:''}${r.approx?'<br><small>ตำแหน่งโดยประมาณจากชื่อพื้นที่</small>':''}${r.link?`<br><a href="${esc(r.link)}" target="_blank" rel="noopener">เปิดใน Google Maps ↗</a>`:''}`).addTo(M.cov);
    M.mk.set(r,m)});
  if($('#mt-cases').checked)P.cases.filter(c=>c.status!=='done'&&c.lat!==''&&c.lat!=null&&isFinite(+c.lat)).forEach(c=>{
    L.circleMarker([+c.lat,+c.lng],{radius:4,color:'#d03b3b',weight:1,fillColor:'#d03b3b',fillOpacity:.8}).bindPopup(`เคส #${esc(c.id)}<br>${esc((c.needs||[]).join(', ')||'ขอความช่วยเหลือ')}<br>${esc(c.address||'')}<br><a href="../../admin.html">เปิดหน้าจัดการเคส →</a>`).addTo(M.cases)});
  const miss=rows.filter(r=>r.lat==null).length;$('#map-miss').textContent=COVERED.C.loading?'กำลังหาตำแหน่ง…':miss?`ไม่พบตำแหน่ง ${miss} พื้นที่`:'';
  if(!M.fitted&&pts.length&&!COVERED.C.loading){M.fitted=true;M.map.fitBounds(pts,{padding:[30,30],maxZoom:14})}
  setTimeout(()=>M.map.invalidateSize(),50);
}
$('#tb').addEventListener('click',e=>{const b=e.target.closest('.cv-go');if(!b)return;const r=COVERED.C.rows[+b.dataset.i],m=M.mk.get(r);if(!m)return;
  $$('#tb tr.on').forEach(t=>t.classList.remove('on'));b.closest('tr').classList.add('on');
  $('#cmap').scrollIntoView({behavior:'smooth',block:'center'});M.map.setView([r.lat,r.lng],15);m.openPopup()});
$('#mt-cases').addEventListener('change',()=>render());
COVERED.C.onupdate=()=>render();
function load(){render();return COVERED.load(API_URL,ADM.key).then(render,render)}
$('#orgs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;P.org=b.dataset.o;render()});
$('#q').addEventListener('input',e=>{P.q=e.target.value;render()});
$('#refresh').addEventListener('click',async()=>{COVERED.C.loaded=0;const r=await apiGet({action:'list'}).catch(()=>null);if(r&&r.cases)P.cases=r.cases;load()});
setInterval(()=>{if(!document.hidden)load()},5*60e3);
adminBoot({action:'list'},'cases',r=>{P.cases=r.cases||[];render();load()});
// เข้าระบบไว้แล้ว: โหลดข้อมูลชีตทันที ไม่ต้องรอรายการเคส (Apps Script ช้า)
if(ADM.key)load();
