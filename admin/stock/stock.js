/* สต็อก: คงเหลือ / รับเข้า / จ่ายออก / ต้องการ — แทนกระดานในศูนย์ */
const S={items:[],log:[],cat:'all',loaded:0};
const TYPE={in:'รับเข้า',out:'จ่ายออก',set:'ตั้งยอด'};
const CATS=['อาหาร','ยา','ถุงยังชีพ','ของใช้'];

async function loadAll(){$('#sync').textContent='กำลังโหลด…';
  try{const r=await apiGet({action:'stock'});if(r&&r.ok){S.items=r.items||[];S.log=r.log||[];S.loaded=Date.now();render()}else throw 0}
  catch(e){$('#sync').textContent='โหลดไม่สำเร็จ'}}
$('#refresh').addEventListener('click',loadAll);
setInterval(()=>{if(ADM.key&&!document.hidden&&$('#drawer').hidden)loadAll()},60000);

function expTag(i){if(!i.expiry)return '';const d=Math.ceil((Date.parse(i.expiry)-Date.now())/864e5);if(isNaN(d))return '';const t=new Date(i.expiry).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'});return d<0?` · <span class="needtag">หมดอายุแล้ว (${t})</span>`:d<=30?` · <span class="warn">หมดอายุใน ${d} วัน</span>`:` · หมดอายุ ${t}`}
const low=i=>i.min!==''&&i.min!=null&&Number(i.qty)<=Number(i.min);
function filtered(){const q=$('#q').value.trim().toLowerCase();
  return S.items.filter(i=>{if(q&&!(i.name+' '+i.category+' '+i.note+' '+(i.location||'')).toLowerCase().includes(q))return false;
    if(S.cat==='low')return low(i)||Number(i.qty)<=0;if(S.cat==='need')return i.needed;if(S.cat!=='all'&&i.category!==S.cat)return false;return true})}
function render(){
  $('#sync').textContent=S.loaded?'อัปเดต '+new Date(S.loaded).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):'';
  const I=S.items,today=new Date();today.setHours(0,0,0,0);const tl=S.log.filter(l=>Number(l.time)>=today.getTime());
  $('#stats').innerHTML=[['รายการในคลัง',I.length,''],['ของหมด',I.filter(i=>Number(i.qty)<=0).length,'red'],['ใกล้หมด',I.filter(i=>low(i)&&Number(i.qty)>0).length,'wait'],['ต้องการเพิ่ม',I.filter(i=>i.needed).length,'go'],
    ['รับเข้าวันนี้',tl.filter(l=>l.type==='in').length+' ครั้ง','done'],['จ่ายออกวันนี้',tl.filter(l=>l.type==='out').length+' ครั้ง','']].map(([t,v,k])=>`<div class="stat ${k}"><b>${esc(v)}</b><span>${t}</span></div>`).join('');
  const cats=[['all','ทั้งหมด'],...CATS.map(c=>[c,c]),...[...new Set(I.map(i=>i.category).filter(c=>c&&!CATS.includes(c)))].map(c=>[c,c]),['low','หมด / ใกล้หมด'],['need','ต้องการ']];
  $('#cat').innerHTML=cats.map(([k,t])=>`<button data-cat="${esc(k)}" aria-selected="${S.cat===k}">${esc(t)}</button>`).join('');
  const L=filtered();
  $('#items').innerHTML=L.length?`<table class="tbl stk"><thead><tr><th>รายการ</th><th class="r">คงเหลือ</th><th></th></tr></thead><tbody>${L.map(i=>{const q=Number(i.qty)||0,cls=q<=0?'zero':low(i)?'low':'';
    return `<tr class="${cls}" data-id="${esc(i.id)}"><td><b>${esc(i.name)}</b><small>${esc(i.category||'')}${i.min!==''&&i.min!=null?` · ขั้นต่ำ ${nf(i.min)}`:''}${i.needed?' · <span class="needtag">ต้องการ</span>':''}${i.location?' · 📍 '+esc(i.location):''}${expTag(i)}</small></td>
      <td class="r qty">${nf(q)} <span class="unit">${esc(i.unit||'')}</span>${q<=0?'<small class="warn">หมด</small>':low(i)?'<small class="warn">ใกล้หมด</small>':''}</td>
      <td class="act"><button class="btn primary sm" data-mv="in" data-item="${esc(i.id)}">+ รับเข้า</button><button class="btn ghost sm" data-mv="out" data-item="${esc(i.id)}">− จ่ายออก</button><button class="btn ghost sm" data-ed="${esc(i.id)}" aria-label="แก้ไข ${esc(i.name)}">✎</button></td></tr>`}).join('')}</tbody></table>`:'<p class="empty">ไม่มีรายการ</p>';
  const need=I.filter(i=>i.needed||Number(i.qty)<=0||low(i));
  $('#need-list').innerHTML=need.length?need.map(i=>`<li><b>${esc(i.name)}</b> <small>${i.needed?'ต้องการ':''}${Number(i.qty)<=0?(i.needed?' · ':'')+'หมด':low(i)?(i.needed?' · ':'')+'เหลือ '+nf(i.qty)+' '+esc(i.unit):''}</small></li>`).join(''):'<li class="muted">ยังไม่มี</li>';
  $('#log').innerHTML=S.log.length?S.log.slice(0,80).map(l=>`<div class="lg lg-${esc(l.type)}"><span class="lg-d">${l.type==='set'?'=':Number(l.delta)>0?'+':''}${nf(l.type==='set'?l.after:l.delta)}</span><div><b>${esc(l.item)}</b> <small>${esc(TYPE[l.type]||l.type)} · เหลือ ${nf(l.after)}${l.note?' · '+esc(l.note):''}${l.caseId?' · เคส #'+esc(l.caseId):''}</small><small class="muted">${esc(ago(l.time))}${l.by?' · '+esc(l.by):''}</small></div></div>`).join(''):'<p class="muted small">ยังไม่มีการรับเข้า / จ่ายออก</p>';
}
$('#q').addEventListener('input',render);
document.addEventListener('click',e=>{
  const c=e.target.closest('[data-cat]');if(c){S.cat=c.dataset.cat;render();return}
  const m=e.target.closest('[data-mv]');if(m){openMove(S.items.find(i=>i.id===m.dataset.item),m.dataset.mv);return}
  const ed=e.target.closest('[data-ed]');if(ed){openItem(S.items.find(i=>i.id===ed.dataset.ed));return}
});
$('#add-item').addEventListener('click',()=>openItem(null));

/* ---------- รับเข้า / จ่ายออก ---------- */
function drawer(html){const d=$('#drawer');d.innerHTML=html;d.hidden=false;$('#drawer-bg').hidden=false;$('#d-close').onclick=closeD;$('#drawer-bg').onclick=closeD;setTimeout(()=>{const f=d.querySelector('input');if(f)f.focus()},50)}
function closeD(){$('#drawer').hidden=true;$('#drawer-bg').hidden=true}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeD()});
function openMove(it,type){if(!it)return;
  drawer(`<div class="d-head"><div><small class="muted">${esc(it.category||'')}</small><h2>${esc(it.name)}</h2><small>คงเหลือ <b>${nf(it.qty)}</b> ${esc(it.unit||'')}</small></div><button class="x" id="d-close" aria-label="ปิด">✕</button></div>
  <form id="mform" class="form-grid">
    <div class="seg mv-seg">${Object.entries(TYPE).map(([k,v])=>`<button type="button" data-t="${k}" aria-selected="${k===type}">${v}</button>`).join('')}</div>
    <label class="fld"><span id="amt-lab">จำนวน (${esc(it.unit||'หน่วย')})</span><input name="amount" type="number" min="0" inputmode="numeric" required></label>
    <p class="muted small" id="preview"></p>
    <label class="fld"><span>หมายเหตุ</span><input name="note" maxlength="200" placeholder="เช่น รับบริจาคจาก… / แจกชุมชน…"></label>
    <label class="fld" id="case-f"><span>เลขเคส (ถ้าจ่ายให้เคส)</span><input name="caseId" maxlength="30" placeholder="เช่น C10011527-M3WZ"></label>
    <div class="form-act"><button class="btn primary" type="submit" id="m-go">บันทึก</button></div>
  </form>`);
  let t=type;const f=$('#mform'),amt=f.elements.amount;
  const upd=()=>{$$('.mv-seg [data-t]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.t===t)));$('#case-f').hidden=t!=='out';const a=Number(amt.value)||0,q=Number(it.qty)||0,after=t==='in'?q+a:t==='out'?q-a:a;
    $('#preview').textContent=amt.value===''?'':`หลังบันทึก: ${nf(after)} ${it.unit||''}${after<0?' — ของไม่พอ':''}`;$('#preview').className='small '+(after<0?'warn':'muted');$('#m-go').textContent=TYPE[t]};
  $$('.mv-seg [data-t]').forEach(b=>b.onclick=()=>{t=b.dataset.t;upd()});amt.oninput=upd;upd();
  f.onsubmit=async e=>{e.preventDefault();const a=Math.round(Number(amt.value));if(!(a>=0)||amt.value===''){amt.focus();return}
    const q=Number(it.qty)||0;if(t==='out'&&a>q){toast(`ของไม่พอ เหลือ ${nf(q)} ${it.unit||''}`);return}
    $('#m-go').disabled=true;
    try{const r=await apiPost({action:'stock_move',itemId:it.id,type:t,amount:a,note:f.elements.note.value,caseId:t==='out'?f.elements.caseId.value:'',by:staffName()});
      if(!r.ok){toast(r.error==='not_enough'?`ของไม่พอ (เหลือ ${nf(r.qty)})`:'บันทึกไม่สำเร็จ: '+(r.error||''));return}
      it.qty=r.qty;toast(`${TYPE[t]} ${it.name} ${nf(a)} ${it.unit||''} · เหลือ ${nf(r.qty)}`,true);closeD();render();loadAll()}
    catch(err){if(err.message!=='auth')toast('บันทึกไม่สำเร็จ ลองใหม่')}finally{const b=$('#m-go');if(b)b.disabled=false}};
}
/* ---------- เพิ่ม / แก้ไขรายการ ---------- */
function openItem(it){it=it||{};const isNew=!it.id;
  drawer(`<div class="d-head"><div><h2>${isNew?'เพิ่มรายการใหม่':'แก้ไขรายการ'}</h2></div><button class="x" id="d-close" aria-label="ปิด">✕</button></div>
  <form id="iform" class="form-grid">
    <label class="fld"><span>ชื่อรายการ *</span><input name="name" required maxlength="80" value="${esc(it.name)}"></label>
    <label class="fld"><span>หมวด</span><input name="category" list="cats" maxlength="30" value="${esc(it.category)}" placeholder="อาหาร, ยา, ของใช้…"><datalist id="cats">${CATS.map(c=>`<option value="${c}">`).join('')}</datalist></label>
    ${isNew?`<label class="fld"><span>จำนวนรับเข้าตอนนี้</span><input name="qty0" type="number" min="0" inputmode="numeric" placeholder="เว้นว่าง = 0"></label>`:''}
    <label class="fld"><span>หน่วย</span><input name="unit" maxlength="20" list="units" placeholder="ห่อ, แผง, ขวด…" value="${esc(it.unit)}"><datalist id="units">${['ห่อ','แผง','ขวด','แพ็ค','ถุง','กล่อง','ชิ้น','ซอง','หลอด','ตลับ','กระป๋อง','คู่','ชุด','ฟอง','กิโลกรัม'].map(u=>`<option value="${u}">`).join('')}</datalist></label>
    ${isNew?`<label class="fld"><span>รับจาก / ผู้บริจาค</span><input name="source" maxlength="80" placeholder="เช่น มัสยิด… / ร้าน… / ซื้อเอง"></label>`:''}
    <label class="fld"><span>วันหมดอายุ (ถ้ามี)</span><input name="expiry" type="date" value="${esc(it.expiry)}"></label>
    <label class="fld"><span>ที่เก็บ</span><input name="location" maxlength="60" placeholder="เช่น ห้องเก็บของ ชั้น 2 / ชั้นวาง A" value="${esc(it.location)}"></label>
    <label class="fld"><span>แจ้งเตือนเมื่อเหลือไม่เกิน</span><input name="min" type="number" min="0" inputmode="numeric" value="${esc(it.min)}" placeholder="เว้นว่าง = ไม่แจ้งเตือน"></label>
    <label class="fld"><span>หมายเหตุ</span><input name="note" maxlength="200" value="${esc(it.note)}"></label>
    <label class="chk"><input name="needed" type="checkbox" ${it.needed?'checked':''}><span>ต้องการรับบริจาคเพิ่ม (ขึ้นในรายการ "ต้องการ")</span></label>
    <div class="form-act"><button class="btn primary" type="submit" id="i-go">บันทึก</button></div>
  </form>`);
  $('#iform').onsubmit=async e=>{e.preventDefault();const f=e.target,v=n=>f.elements[n]?f.elements[n].value.trim():'';
    const d={id:it.id||'',name:v('name'),unit:v('unit'),category:v('category'),min:v('min'),needed:f.elements.needed.checked,note:v('note'),expiry:v('expiry'),location:v('location')};
    if(!d.name)return;const q0=Math.max(0,Math.round(Number(v('qty0'))||0));$('#i-go').disabled=true;
    try{const r=await apiPost({action:'stock_item',item:d});if(!r.ok){toast('บันทึกไม่สำเร็จ: '+(r.error||''));return}
      if(isNew&&q0>0){const m=await apiPost({action:'stock_move',itemId:r.id,type:'in',amount:q0,note:['ยอดตั้งต้น',v('source')?'จาก '+v('source'):''].filter(Boolean).join(' · '),by:staffName()});
        if(!m.ok)toast('เพิ่มรายการแล้ว แต่บันทึกจำนวนไม่สำเร็จ กด "+ รับเข้า" อีกครั้ง');else toast(`เพิ่ม ${d.name} · ${nf(q0)} ${d.unit}`,true)}
      else toast('บันทึกรายการแล้ว',true);
      closeD();loadAll()}catch(err){if(err.message!=='auth')toast('บันทึกไม่สำเร็จ ลองใหม่')}finally{const b=$('#i-go');if(b)b.disabled=false}};
}
/* ---------- คัดลอก / ส่งออก ---------- */
$('#copy-need').addEventListener('click',()=>{const need=S.items.filter(i=>i.needed||Number(i.qty)<=0||low(i));
  const txt='📦 ศูนย์ UMMATEE ต้องการรับบริจาค\n'+need.map((i,n)=>`${n+1}. ${i.name}${Number(i.qty)<=0?' (หมด)':low(i)?` (เหลือ ${nf(i.qty)} ${i.unit||''})`:''}`).join('\n');
  (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('คัดลอกแล้ว วางในไลน์ / เพจได้เลย',true)).catch(()=>toast('คัดลอกไม่สำเร็จ'))});
$('#export').addEventListener('click',()=>{const cell=v=>{let s=String(v==null?'':v);if(/^[=+\-@]/.test(s))s="'"+s;return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const rows=[['รายการ','หมวด','คงเหลือ','หน่วย','ขั้นต่ำ','ต้องการ','วันหมดอายุ','ที่เก็บ','หมายเหตุ'],...S.items.map(i=>[i.name,i.category,i.qty,i.unit,i.min,i.needed?'ต้องการ':'',i.expiry||'',i.location||'',i.note])];
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));a.download=`umplus-stock-${new Date().toISOString().slice(0,10)}.csv`;a.click()});

adminBoot({action:'stock'},'items',r=>{S.items=r.items||[];S.log=r.log||[];S.loaded=Date.now();render()});
