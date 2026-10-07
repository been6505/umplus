/* จัดทีม: รายชื่อทีม สถานะ พาหนะ เคสที่ถือ + มอบหมายเคสที่รออยู่ให้ทีม */
const T={roster:[],live:[],cases:[],filter:'all',loaded:0};
const TST={ready:'พร้อม',out:'ออกงาน',rest:'พัก'};
const VEH={boat:'เรือ',truck:'รถสูง / รถบรรทุก',pickup:'รถกระบะ',car:'รถเก๋ง / รถตู้',motorbike:'มอเตอร์ไซค์',foot:'เดินเท้า',other:'อื่น ๆ'};
const URG={3:'วิกฤต',2:'เร่งด่วน',1:'ทั่วไป'};
const LEVEL={ankle:'ข้อเท้า',knee:'เข่า',waist:'เอว',chest:'อก',roof:'มิดหัว'};
const sev=c=>Math.min(3,Math.max(1,Number(c.urgency)||1));
const hasPin=c=>c&&c.lat!==''&&c.lat!=null&&c.lng!==''&&c.lng!=null&&isFinite(+c.lat)&&isFinite(+c.lng);
const km=(a,b,c,d)=>{const R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,h=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const tname=s=>String(s||'').replace(/^'/,'').trim();
const tel=p=>String(p||'').replace(/^'/,'').replace(/[^\d+]/g,'');
/* ตำแหน่งสดผ่าน Google Maps: ทีมแชร์ตำแหน่งจากแอป Google Maps (ทำงานต่อแม้ล็อกจอ) แล้ววางลิงก์ไว้ที่ทีม
   ลิงก์เก็บต่อท้ายหมายเหตุ (📍<url>) จึงไม่ต้องแก้ Apps Script · ส่งช่อง gmaps ไปด้วยเผื่อหลังบ้านรองรับ */
const GM_RE=/https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.(?:com|co\.th)\/maps|maps\.google\.(?:com|co\.th))[^\s<>"']*/i;
const gmOf=t=>{const m=String(t&&t.gmaps||'').match(GM_RE)||String(t&&t.note||'').match(GM_RE);return m?m[0]:''};
const noteText=t=>String(t&&t.note||'').replace(GM_RE,'').replace(/\s*📍\s*/g,' ').trim();

async function loadAll(){
  $('#sync').textContent='กำลังโหลด…';
  try{const [r,c]=await Promise.all([apiGet({action:'roster'}),apiGet({action:'list'})]);
    if(r&&r.ok){T.roster=r.roster||[];T.live=r.live||[]}
    if(c&&c.ok)T.cases=(c.cases||[]).map(x=>({...x,needs:Array.isArray(x.needs)?x.needs:String(x.needs||'').split(/\s*,\s*/).filter(Boolean)}));
    T.loaded=Date.now();render()}
  catch(e){$('#sync').textContent='โหลดไม่สำเร็จ'}}
$('#refresh').addEventListener('click',loadAll);
setInterval(()=>{if(ADM.key&&!document.hidden)loadAll()},60000);

function teamCases(name){const n=tname(name);return T.cases.filter(c=>tname(c.volunteer)===n)}
function liveOf(name){return T.live.find(l=>tname(l.team)===tname(name))}
function needsVehicle(c){const n=(c.needs||[]).join(' ');return /เรือ|รถสูง/.test(n)||c.level==='chest'||c.level==='roof'?'boat':''}
function suggest(c){
  const ready=T.roster.filter(t=>t.status!=='rest');if(!ready.length)return [];
  const want=needsVehicle(c);
  return ready.map(t=>{const lv=liveOf(t.name),d=lv&&hasPin(c)?km(+c.lat,+c.lng,lv.lat,lv.lng):null,busy=teamCases(t.name).filter(x=>x.status==='going').length;
    let s=0;if(t.status==='ready')s+=30;if(want==='boat'&&(t.vehicle==='boat'||t.vehicle==='truck'))s+=30;if(want==='boat'&&t.vehicle&&!['boat','truck'].includes(t.vehicle))s-=20;
    if(d!=null)s+=Math.max(0,25-d*2.5);s-=busy*8;
    const why=[TST[t.status]||'',t.vehicle?VEH[t.vehicle]:'',d!=null?`ห่าง ${d.toFixed(1)} กม.`:'',busy?`ถืออยู่ ${busy} เคส`:'ว่าง'].filter(Boolean).join(' · ');
    return {t,s,why}}).sort((a,b)=>b.s-a.s)}

function render(){
  $('#sync').textContent=T.loaded?'อัปเดต '+new Date(T.loaded).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):'';
  const R=T.roster,cnt=s=>R.filter(t=>t.status===s).length,people=R.reduce((s,t)=>s+(Number(t.members)||0),0);
  const queue=T.cases.filter(c=>c.status==='open');
  const going=T.cases.filter(c=>c.status==='going').length;
  $('#stats').innerHTML=[['ทีมทั้งหมด',R.length,''],['พร้อมออกงาน',cnt('ready'),'done'],['กำลังออกงาน',cnt('out'),'go'],['พัก',cnt('rest'),''],['อาสาทั้งหมด',people||'–',''],['เคสรอจัดทีม',queue.length,'red'],['เคสที่ทีมกำลังไป',going,'go']]
    .map(([t,v,k])=>`<div class="stat ${k}"><b>${esc(v)}</b><span>${t}</span></div>`).join('');
  /* teams */
  const list=R.filter(t=>T.filter==='all'||t.status===T.filter).sort((a,b)=>({ready:0,out:1,rest:2}[a.status]??3)-({ready:0,out:1,rest:2}[b.status]??3)||String(a.name).localeCompare(String(b.name),'th'));
  const el=$('#team-list');
  if(!R.length)el.innerHTML='<p class="empty">ยังไม่มีทีม กด "+ เพิ่มทีม" เพื่อเริ่ม<br><small>ทีมที่เคยรับเคสจะขึ้นด้านล่างให้เพิ่มได้ในคลิกเดียว</small></p>';
  else el.innerHTML=list.map(t=>{const cs=teamCases(t.name),g=cs.filter(c=>c.status==='going'),d=cs.filter(c=>c.status==='done'),lv=liveOf(t.name),p=tel(t.phone),gm=gmOf(t),nt=noteText(t);
    return `<article class="team st-${esc(t.status)}"><div class="team-h"><div><b>${esc(t.name)}</b><small>${[t.vehicle?VEH[t.vehicle]:'',t.members?t.members+' คน':'',t.zone?'พื้นที่ '+t.zone:''].filter(Boolean).map(esc).join(' · ')||'ยังไม่ระบุรายละเอียด'}</small></div>
      <select class="tst tst-${esc(t.status)}" data-tst="${esc(t.id)}" aria-label="สถานะทีม ${esc(t.name)}">${Object.entries(TST).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="team-m">${t.leader?`หัวหน้าทีม ${esc(t.leader)} `:''}${p.length>=9?`<a href="tel:${esc(p)}">${esc(tname(t.phone))}</a>`:''}${lv?`<span class="live">● แชร์ตำแหน่ง ${esc(ago(lv.updatedAt))}</span>`:''}${gm?`<a class="gm" href="${esc(gm)}" target="_blank" rel="noopener">📍 ตำแหน่งสด Google Maps</a>`:''}</div>
      ${g.length?`<ul class="tcases">${g.map(c=>`<li><span class="urg urg-${sev(c)}">${URG[sev(c)]}</span> ${esc((c.needs||[]).join(', ')||'ขอความช่วยเหลือ')} · ${esc(c.people||1)} คน <small>${esc([c.address,c.district?'เขต'+c.district:''].filter(Boolean).join(' · '))}</small> ${navUrl(c)?`<a class="nav-go" href="${esc(navUrl(c))}" target="_blank" rel="noopener">🧭 นำทาง</a>`:''} <button class="linkish" data-done="${esc(c.id)}">✓ ช่วยแล้ว</button></li>`).join('')}</ul>`:'<p class="muted small">ไม่มีเคสที่กำลังไป</p>'}
      <div class="team-f"><span class="muted small">ช่วยแล้ว ${d.length} เคส${nt?' · '+esc(nt):''}</span><button class="btn ghost sm" data-edit="${esc(t.id)}">แก้ไข</button></div></article>`}).join('')||'<p class="empty">ไม่มีทีมในสถานะนี้</p>';
  /* teams seen in cases but not in roster */
  const known=new Set(R.map(t=>tname(t.name))),seen=[...new Set(T.cases.map(c=>tname(c.volunteer)).filter(Boolean))].filter(n=>!known.has(n));
  if(seen.length)el.insertAdjacentHTML('beforeend',`<div class="seen"><small class="muted">ทีมที่เคยรับเคสแต่ยังไม่อยู่ในรายชื่อ:</small> ${seen.map(n=>`<button class="chip" data-quick="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>`);
  /* queue */
  const order=c=>{const v=typeof VERIFY!=='undefined'?VERIFY.assess(c).score:0;return sev(c)*100+v};
  const q=queue.slice().sort((a,b)=>order(b)-order(a)||(Number(a.createdAt)-Number(b.createdAt)));
  $('#q-count').textContent=q.length?q.length+' เคส':'';
  $('#queue').innerHTML=q.length?q.slice(0,60).map(c=>{const sg=suggest(c),best=sg[0],vr=typeof VERIFY!=='undefined'?VERIFY.assess(c):null;
    return `<article class="qcase u${sev(c)}"><div class="q-h"><span class="urg urg-${sev(c)}">${URG[sev(c)]}</span>${vr&&vr.result.k!=='nopin'?`<span class="vr vr-${vr.result.k}">${esc(vr.result.t)}</span>`:''}${(()=>{const m=typeof COVERED!=='undefined'?COVERED.match(c):null;return m?`<span class="cov" title="${esc(m.best.r.area+' · '+m.best.how)}">🤝 ${esc(m.best.r.org)} รับแล้ว</span>`:''})()}<small class="muted">${esc(ago(c.createdAt))} · #${esc(c.id)}</small></div>
      <b>${esc((c.needs||[]).join(' · ')||'ขอความช่วยเหลือ')}</b><div class="small">${esc(c.people||1)} คน${c.level?' · น้ำ'+esc(LEVEL[c.level]||''):''} · ${esc([c.address,c.district?'เขต'+c.district:''].filter(Boolean).join(' · ')||'ไม่ระบุที่อยู่')}</div>
      ${R.length?`<div class="assign"><select data-pick="${esc(c.id)}" aria-label="เลือกทีมสำหรับเคส ${esc(c.id)}">${sg.map((x,i)=>`<option value="${esc(x.t.name)}">${i===0?'แนะนำ: ':''}${esc(x.t.name)} (${esc(x.why)})</option>`).join('')}</select><button class="btn primary sm" data-assign="${esc(c.id)}">มอบหมาย</button></div>${navUrl(c)?`<a class="nav-go small" href="${esc(navUrl(c))}" target="_blank" rel="noopener">🧭 นำทางไปเคสนี้</a>`:''}`:'<p class="muted small">เพิ่มทีมก่อนจึงจะมอบหมายได้</p>'}
    </article>`}).join(''):'<p class="empty">ไม่มีเคสรอจัดทีม 👍</p>';
}

/* ---------- actions ---------- */
async function saveTeam(t,msg){try{const r=await apiPost({action:'roster_save',team:t,by:staffName()});
  if(!r.ok){toast(r.error==='duplicate_name'?'มีทีมชื่อนี้อยู่แล้ว':'บันทึกไม่สำเร็จ: '+(r.error||''));return false}toast(msg||'บันทึกทีมแล้ว',true);await loadAll();return true}catch(e){if(e.message!=='auth')toast('บันทึกไม่สำเร็จ ลองใหม่');return false}}
async function updateCase(c,status,team){const prev={status:c.status,volunteer:c.volunteer};c.status=status;if(team)c.volunteer=team;render();
  try{const r=await apiPost({action:'update',id:c.id,status,volunteer:team||c.volunteer||''});if(!r.ok)throw 0;toast(status==='going'?`มอบหมายเคส #${c.id} ให้ ${team} แล้ว`:`ปิดเคส #${c.id} แล้ว`,true)}
  catch(e){Object.assign(c,prev);render();if(e&&e.message==='auth')return;toast('บันทึกไม่สำเร็จ ลองใหม่')}}
document.addEventListener('change',e=>{const s=e.target.closest('[data-tst]');if(!s)return;const t=T.roster.find(x=>String(x.id)===s.dataset.tst);if(t)saveTeam({...t,status:s.value},`${t.name} → ${TST[s.value]}`)});
document.addEventListener('click',e=>{
  const f=e.target.closest('#team-filter [data-f]');if(f){T.filter=f.dataset.f;$$('#team-filter [data-f]').forEach(b=>b.setAttribute('aria-selected',String(b===f)));render();return}
  const a=e.target.closest('[data-assign]');if(a){const c=T.cases.find(x=>String(x.id)===a.dataset.assign),sel=document.querySelector(`[data-pick="${CSS.escape(a.dataset.assign)}"]`);if(c&&sel&&sel.value){updateCase(c,'going',sel.value);const t=T.roster.find(x=>x.name===sel.value);if(t&&t.status==='ready')saveTeam({...t,status:'out'},`${t.name} → ออกงาน`)}return}
  const d=e.target.closest('[data-done]');if(d){const c=T.cases.find(x=>String(x.id)===d.dataset.done);if(c)updateCase(c,'done');return}
  const ed=e.target.closest('[data-edit]');if(ed){openForm(T.roster.find(x=>String(x.id)===ed.dataset.edit));return}
  const q=e.target.closest('[data-quick]');if(q){saveTeam({name:q.dataset.quick,status:'ready'},`เพิ่มทีม ${q.dataset.quick} แล้ว`);return}
});
$('#add-team').addEventListener('click',()=>openForm(null));

/* ---------- ฟอร์มเพิ่ม/แก้ไขทีม ---------- */
function openForm(t){t=t||{status:'ready'};const d=$('#drawer');
  d.innerHTML=`<div class="d-head"><div><h2>${t.id?'แก้ไขทีม':'เพิ่มทีมใหม่'}</h2></div><button class="x" id="d-close" aria-label="ปิด">✕</button></div>
  <form id="tform" class="form-grid">
    <label class="fld"><span>ชื่อทีม *</span><input name="name" required maxlength="60" value="${esc(t.name)}"></label>
    <label class="fld"><span>หัวหน้าทีม</span><input name="leader" maxlength="60" value="${esc(t.leader)}"></label>
    <label class="fld"><span>เบอร์โทรหัวหน้าทีม</span><input name="phone" type="tel" inputmode="tel" maxlength="20" value="${esc(tname(t.phone))}"></label>
    <label class="fld"><span>จำนวนคนในทีม</span><input name="members" type="number" min="0" max="999" inputmode="numeric" value="${esc(t.members)}"></label>
    <label class="fld"><span>พาหนะ</span><select name="vehicle"><option value="">ไม่ระบุ</option>${Object.entries(VEH).map(([k,v])=>`<option value="${k}" ${t.vehicle===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label class="fld"><span>พื้นที่รับผิดชอบ</span><input name="zone" maxlength="80" placeholder="เช่น บึงกุ่ม, ลาดพร้าว" value="${esc(t.zone)}"></label>
    <label class="fld"><span>สถานะ</span><select name="status">${Object.entries(TST).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label class="fld wide"><span>ลิงก์ตำแหน่งสด Google Maps</span><input name="gmaps" inputmode="url" maxlength="200" placeholder="https://maps.app.goo.gl/…" value="${esc(gmOf(t))}"></label>
    <details class="gm-help wide"><summary>วิธีแชร์ตำแหน่งสดจาก Google Maps (ส่งต่อแม้ล็อกจอ)</summary>
      <ol><li>เปิดแอป Google Maps → แตะรูปโปรไฟล์ → <b>การแชร์ตำแหน่ง</b> → <b>แชร์ตำแหน่ง</b></li>
      <li>ตั้งเวลา <b>จนกว่าคุณจะปิด</b> → เลือก <b>คัดลอกไปยังคลิปบอร์ด</b> (หรือส่งทาง LINE ให้แอดมิน)</li>
      <li>วางลิงก์ในช่องด้านบน แล้วกดบันทึก (วางทั้งข้อความที่คัดลอกมาได้เลย ระบบดึงลิงก์ออกให้)</li></ol>
      <a class="btn ghost sm" href="https://www.google.com/maps" target="_blank" rel="noopener">เปิด Google Maps</a></details>
    <label class="fld"><span>หมายเหตุ</span><input name="note" maxlength="200" value="${esc(noteText(t))}"></label>
    <div class="form-act"><button class="btn primary" type="submit">บันทึก</button>${t.id?'<button class="btn ghost" type="button" id="t-off">ปิดทีมนี้</button>':''}</div>
  </form>`;
  d.hidden=false;$('#drawer-bg').hidden=false;
  $('#d-close').onclick=closeForm;$('#drawer-bg').onclick=closeForm;
  $('#tform').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));if(!fd.name.trim())return;
    const raw=String(fd.gmaps||'').trim(),m=raw.match(GM_RE),gm=m?m[0]:'';
    if(raw&&!gm){toast('ลิงก์ต้องเป็นลิงก์แชร์จาก Google Maps เช่น https://maps.app.goo.gl/…');e.target.gmaps.focus();return}
    fd.gmaps=gm;fd.note=[String(fd.note||'').trim(),gm?'📍'+gm:''].filter(Boolean).join(' ');
    if(await saveTeam({...t,...fd,id:t.id||''}))closeForm()};
  const off=$('#t-off');if(off)off.onclick=async()=>{if(await saveTeam({...t,active:false},`ปิดทีม ${t.name} แล้ว`))closeForm()};
  setTimeout(()=>d.querySelector('input').focus(),50)}
function closeForm(){$('#drawer').hidden=true;$('#drawer-bg').hidden=true}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeForm()});

adminBoot({action:'roster'},'roster',r=>{T.roster=r.roster||[];T.live=r.live||[];render();loadAll();if(typeof VERIFY!=='undefined')VERIFY.load().then(render,()=>{});if(typeof COVERED!=='undefined')COVERED.load(API_URL,ADM.key).then(render,()=>{})});
