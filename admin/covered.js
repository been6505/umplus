/* พื้นที่ที่องค์กรอื่นรับไปแล้ว (จาก Google Sheet ที่ทีมกรอก)
   - ดึงจากชีตสาธารณะ (gviz CSV) หรือจาก /api?action=covered ถ้าระบบหลังบ้านรองรับ (ได้พิกัดจากลิงก์ Google Maps)
   - ถ้าไม่มีพิกัด จะหาพิกัดโดยประมาณจากชื่อพื้นที่ (Photon) และเทียบชื่อพื้นที่กับที่อยู่ของเคส
   ใช้ร่วม: หน้าจัดการเคส, แดชบอร์ด, จัดทีม */
const COVERED=(()=>{
  const SHEET_ID='1QwVsFfWqNBP8qJMBBk_PrvbSm6gNFOF0CGwJl5BNaFc';
  const SHEET_URL='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/edit';
  const CSV_URL='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/gviz/tq?tqx=out:csv';
  const NEAR_M=800;
  /* ตัวช่วยแปลงลิงก์ย่อ Google Maps เป็นพิกัด (Cloudflare Worker ของมูลนิธิ) — ใช้เมื่อเว็บนี้ไม่ได้อยู่บน Cloudflare เอง */
  const RESOLVER='https://ummatee-help.akasitlove.workers.dev/api';
  function coordsFromUrl(u){u=String(u||'');try{u=decodeURIComponent(u)}catch(e){}
    const pats=[/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,/[?&](?:q|ll|query|destination|center)=(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/,/\/(?:search|place|dir)\/(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/,/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)\s*$/];
    for(const re of pats){const m=u.match(re);if(m){const a=+m[1],b=+m[2];if(a>5&&a<21&&b>97&&b<106)return [a,b]}}return null}
  const C={rows:[],loaded:0,error:'',loading:null,source:'',local:[]};
  const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').replace(/ซ\.\s*/g,'ซอย').replace(/ถ\.\s*/g,'ถนน').toLowerCase().trim();
  function parseCSV(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch}else if(ch==='"')q=true;else if(ch===','){row.push(cur);cur=''}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(cur);cur='';rows.push(row);row=[]}else cur+=ch}
    if(cur||row.length){row.push(cur);rows.push(row)}return rows}
  /* จัดข้อมูลให้เป็นแบบเดียวกันแม้ชีตกรอกต่างกัน: แยก "เขตxxx" และ "N ชุด" ออกจากชื่อพื้นที่, ปีเป็น พ.ศ. 4 หลัก, ตัดส่วนท้ายลิงก์ */
  /* หาคอลัมน์จากหัวตาราง (ชีตอาจย้ายคอลัมน์ เช่น ลิงก์ไปอยู่ E) — ถ้าไม่พบใช้ลำดับ A B C D */
  function colMap(h){h=h.map(x=>String(x||'').replace(/\s+/g,''));const f=(re,d)=>{const i=h.findIndex(x=>re.test(x));return i<0?d:i};
    return [f(/องค/,0),f(/สถานที่|พื้นที่/,1),f(/วันที่/,2),f(/โลเค|ลิง[คก]|link|location/i,3),f(/เขต|จังหวัด/,-1),f(/จำนวน|ชุด/,-1),f(/หมายเหตุ/,-1),f(/พิกัด/,-1),f(/รายการ|สิ่งของ/,-1)]}
  function pick(r,cols){const out=cols.map(i=>i<0?'':r[i]||'');if(!out[3]){const u=r.find(x=>/https?:\/\//.test(x||''));if(u)out[3]=u}return out}
  /* ตำแหน่งที่ทีมหาไว้ให้แถวที่ยังไม่มีลิงก์ (ค้นจาก Google Maps 2 ต.ค. 69) — ใช้เมื่อชีตยังไม่มีลิงก์/พิกัด */
  const KNOWN={"ร้านข้าวเช้าซอยรามคำแหง 53 เขตวังทองหลาง": [13.7698003, 100.6183919, "กลาง"], "บึงขวางซอย 3 เกษรหอม 1": [13.784469, 100.761265, "กลาง"], "มัสยิดอัลยุซรอ หลอแหล": [13.769399, 100.6939231, "สูง"], "มัสยิด 53": [13.7615138, 100.6197928, "กลาง"], "เสรีไทย ซอย 9": [13.7748298, 100.6549002, "กลาง"], "ปากคลองทับช้าง": [13.7290161, 100.6916157, "สูง"], "บึงขวาง 3 แยก 14": [13.785707, 100.757104, "สูง"], "เคหะร่มเกล้า 14 มัสยิดนะฟีอะหฺ": [13.7758841, 100.7251432, "สูง"], "กรุงเทพกรีฑา 45": [13.740695, 100.6890053, "กลาง"], "หัวหมากน้อย วังโสม": [13.7579636, 100.6571238, "สูง"], "กรุุงเทพกรีฑา 7 แยก 1-2 ซอยวะกัฟ": [13.7488631, 100.656936, "กลาง"], "มัสยิดอััลยุซรอ": [13.769399, 100.6939231, "สูง"], "วัดปากบ่อ": [13.7146469, 100.6310799, "สูง"], "เคหะร่มเกล้า โซน 10 มัสยิดอันนูร": [13.7605285, 100.7364273, "สูง"], "บ้านมา 2 ข้างพาสิโอ": [13.7206009, 100.7276188, "กลาง"], "ชุมชนข้างวัดขจรศิริ": [13.7148151, 100.641278, "กลาง"], "บ้านเอื้ออาทร ลาดกระบัง 2": [13.7205423, 100.8243633, "สูง"], "เคหะร่มเกล้า": [13.7678303, 100.7323762, "ต่ำ"], "มัสยิดสมอเซ": [13.7224237, 100.9424902, "สูง"], "ชุมชนคลองห้อง อ่อนนุช 63": [13.7219969, 100.6805344, "กลาง"], "คลองประเวศฝั่งเหนือ ตรงข้ามวัดกระทุ่ม": [13.7229237, 100.6887065, "กลาง"], "รามคำแหง 81": [13.7624741, 100.63385, "กลาง"]};
  /* พิกัดของลิงก์ย่อ maps.app.goo.gl ในชีต (ทีมหาไว้ 3 ต.ค. 69) — ใช้เมื่อระบบแปลงลิงก์ (Worker) ใช้งานไม่ได้ แทนการเดาจากชื่อ */
  const LINKPOS={"ZwL4bmYyUYr922UTA":[13.857504,100.833061,"กลาง"],"ZqiqAVnW29xC9m857":[13.794696,100.511289,"สูง"],"oscRpdCNzjA8FR9R9":[13.707,100.6333,"ต่ำ"],"mPN2h29oBwG3FD6r8":[13.723361,100.486297,"สูง"],"wdUeFKjmtTjboaYz6":[13.810372,100.758663,"กลาง"],"Lw83v7mdJEveMmWx7":[13.760529,100.736427,"สูง"],"3kJAC62aKCz1k3xX7":[13.774088,100.651234,"สูง"],"nrj4rbCo6fxetMWH6":[13.750232,100.65126,"สูง"],"7bA2LCwruiSds99w7":[13.743327,100.7,"สูง"],"ok41tUpoZ6sneoB88":[13.749317,100.691657,"สูง"],"GQchXymeR3XeFKyk7":[13.793174,100.74647,"ต่ำ"],"hQhz4pA9m97s3JAWA":[13.791832,100.753425,"สูง"],"XH2VTSUmXkKdFFG97":[13.723436,100.67311,"สูง"],"Sifa7GjGqsdd7tvn9":[13.779712,100.701867,"สูง"],"Gw96r6sVXdF43zkLA":[13.705469,100.693987,"สูง"],"qEBRTFCoiA3Mcg3e6":[13.722382,100.673581,"สูง"],"qWTHsm5aBGeeJFNH9":[13.726967,100.681408,"กลาง"],"C9uuPbk6txD5q6Vx8":[13.720739,100.795397,"ต่ำ"],"FZy328FG7dbD6Kjb7":[13.775421,100.724287,"สูง"],"c2bvX2LwACsgDNew5":[13.797068,100.760936,"กลาง"],"B4NX7GrhNpt8Ppbx5":[13.788748,100.764998,"กลาง"],"CczTvP3ZZom6sCJWA":[13.786546,100.765015,"กลาง"],"EkpWzfaDimmF9gC89":[13.791877,100.757593,"กลาง"],"4eDwF4S8399Mez87A":[13.72125,100.67255,"กลาง"],"p8ijvEWQ2971cQmPA":[13.74902,100.674415,"สูง"]};
  function fromCells(r){let [org,area,date,link,district,sets,note,coord,items]=r.map(x=>String(x||'').replace(/\s+/g,' ').trim());
    items=items||'';if(!sets){const m=area.match(/(\d[\d,]*)\s*ชุด/);if(m){sets=m[1];area=area.replace(m[0],' ')}}
    if(!district){const m=area.match(/เขต\s*([ก-๙]+)\s*$/);if(m&&area.length-m[0].length>=4){district=m[1];area=area.slice(0,m.index)}}
    district=String(district||'').replace(/^เขต\s*/,'');area=area.replace(/\s+/g,' ').trim();
    const d=date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(d){let y=+d[3];if(y<100)y=y>=50?2500+y:y+2543;else if(y<2400)y+=543;date=d[1]+'/'+d[2]+'/'+y;const now=new Date().getFullYear()+543;if(Math.abs(y-now)>1)note=(note?note+' · ':'')+'ปี '+y+' อาจพิมพ์ผิด ตรวจในชีต'}
    link=link.replace(/\?g_st=\w+$/,'');
    const k0=String(r[1]||'').replace(/\s+/g,' ').trim(),kn=KNOWN[k0];
    const tok=(link.match(/goo\.gl\/([A-Za-z0-9]+)/)||[])[1],lp=tok&&LINKPOS[tok];
    let src='',ll=coordsFromUrl(coord);if(ll)src='coord';
    if(!ll&&(ll=coordsFromUrl(link)))src='link';
    if(!ll&&lp){ll=lp;src='known'}
    if(!ll&&kn&&!link){ll=kn;src='known'}
    const low=src==='known'&&ll[2]==='ต่ำ';
    if(link&&!/^https?:\/\//i.test(link))link=ll&&coordsFromUrl(link)?'https://www.google.com/maps?q='+ll[0]+','+ll[1]:'';
    return {org,area,date,link,district,items,sets:sets||'',note:note||'',lat:ll?ll[0]:null,lng:ll?ll[1]:null,approx:low,src}}
  /* วันที่ในชีตเขียนหลายแบบ (2/10/69, 1/10/2569, 1/10/26) → แสดงตามที่กรอก แต่แปลงเป็นเวลาไว้เรียง */
  function dateMs(s){const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return 0;let y=+m[3];if(y<100)y=y>=50?2500+y-543:2000+y;else if(y>2400)y-=543;return Date.UTC(y,+m[2]-1,+m[1])}
  const geoCache=(()=>{try{return JSON.parse(localStorage.getItem('uh_cov_geo')||'{}')}catch(e){return {}}})();
  function saveGeo(){try{localStorage.setItem('uh_cov_geo',JSON.stringify(geoCache))}catch(e){}}
  async function geocode(r){const k=norm(r.area);if(geoCache[k]!==undefined){const g=geoCache[k];if(g){r.lat=g[0];r.lng=g[1];r.approx=true}return false}
    try{const j=await fetch('https://photon.komoot.io/api/?limit=1&lat=13.75&lon=100.6&location_bias_scale=0.5&bbox=99.8,13.3,101.4,14.3&q='+encodeURIComponent(r.area.replace(/\d+\s*ชุด/,'')+' กรุงเทพ')).then(x=>x.json());
      const f=(j.features||[])[0];geoCache[k]=f?[f.geometry.coordinates[1],f.geometry.coordinates[0]]:null}catch(e){return}
    saveGeo();if(geoCache[k]){r.lat=geoCache[k][0];r.lng=geoCache[k][1];r.approx=true}return true}
  async function load(apiUrl,key){
    if(C.loading)return C.loading;if(C.loaded&&Date.now()-C.loaded<5*60e3)return;
    C.loading=(async()=>{
      let rows=null;
      {const base=apiUrl&&apiUrl.charAt(0)==='/'?apiUrl:RESOLVER;try{const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),12000);const j=await fetch(base+'?action=covered&key='+encodeURIComponent(key||'')+'&t='+Math.floor(Date.now()/60000),{signal:ctl.signal}).then(x=>x.json()).finally(()=>clearTimeout(tm));if(j&&j.ok&&Array.isArray(j.items)){rows=j.items.map(it=>{const r=fromCells([it.org,it.area,it.date,it.link,it.district,it.sets,it.note,'',it.items]);if(it.lat!=null&&it.lat!==''){r.lat=+it.lat;r.lng=+it.lng;r.src='link';r.approx=false}return r});C.source='api'}}catch(e){}}
      if(!rows){try{const t=await fetch(CSV_URL+'&t='+Math.floor(Date.now()/60000)).then(x=>{if(!x.ok)throw 0;return x.text()});
        const all=parseCSV(t);const cols=colMap(all[0]||[]);rows=all.slice(1).map(r=>pick(r,cols)).filter(r=>r[1]&&String(r[1]).trim()).map(fromCells);C.source='sheet'}catch(e){C.error='โหลดข้อมูลพื้นที่องค์กรอื่นไม่สำเร็จ';return}}
      rows.forEach(r=>{r.t=dateMs(r.date);r.n=norm(r.area);if(r.lat!=null&&r.lat!=='')r.lat=+r.lat,r.lng=+r.lng;else r.lat=r.lng=null});
      // แถวที่เพิ่งกรอกผ่านฟอร์ม: แสดงไว้จนกว่าชีต/แคชจะมีแถวนั้น (ไม่เกิน 15 นาที)
      {const k=r=>[r.org,r.area,r.date].join('|'),have=new Set(rows.map(k));C.local=C.local.filter(r=>Date.now()-r._local<15*60e3&&!have.has(k(r)));rows=C.local.concat(rows)}
      C.rows=rows;C.error='';C.loaded=Date.now();if(C.onupdate)try{C.onupdate()}catch(e){}
      // หาพิกัดโดยประมาณทีละแถว (เฉพาะที่ยังไม่มีพิกัด) ไม่ให้ยิงคำขอถี่เกิน
      for(const r of rows.filter(x=>x.lat==null)){if(await geocode(r))await new Promise(s=>setTimeout(s,300));if(C.onupdate)try{C.onupdate()}catch(e){}}
      C.loaded=Date.now();
    })().finally(()=>{C.loading=null});
    return C.loading;
  }
  function distM(a,b,c,d){const R=6371e3,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,h=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
  /* คำสำคัญจากชื่อพื้นที่: ชื่อซอย/ถนน/ชุมชน + เลขซอย (เช่น "บึงขวาง 3", "อ่อนนุช 61", "หลวงแพ่ง") */
  const STOP=/^(ชุมชน|หมู่บ้าน|มัสยิด|สุเหร่า|โรงเรียน|ซอย|ถนน|เขต|แขวง|แยก|พื้นที่|และ|ชุด|ศูนย์พักพิงชั่วคราว|ร้านข้าวเช้า|มูลนิธิ)$/;
  const GENERIC=/^(โซน|แฟลต|แยก|หมู่|หมู่ที่|เลขที่|คลอง|เขต|พื้นที่|อาคาร|ตึก|ชั้น|บ้าน|ห้อง)$/;
  function keys(n){const out=new Set();const t=n.replace(/\d+\s*ชุด/g,' ').replace(/[(),]/g,' ').replace(/พื้นที่\s*\d+/g,' ').replace(/ชุมชน|หมู่บ้าน|ซอย|ถนน|และแยก|และ/g,' ');
    (t.match(/[ก-๙a-z]{3,}\s*\d+(\s*แยก\s*\d+)?/g)||[]).forEach(x=>{const k=x.replace(/\s+/g,' ').trim();if(!GENERIC.test(k.replace(/\s*\d.*$/,'')))out.add(k)});
    return [...out].filter(k=>k.length>=4&&!STOP.test(k))}
  /* ที่อยู่มีคำสำคัญนี้ไหม (เลขต้องไม่ติดเลขอื่น เช่น "บึงขวาง 8" ไม่ตรงกับ "บึงขวาง 81") */
  function hasKey(addr,k){const a=addr.replace(/\s+/g,''),m=k.replace(/\s+/g,'').match(/^([^\d]+)(\d.*)$/);if(!m)return '';
    /* ภาษาไทยไม่เว้นวรรค: ชื่อในชีตอาจมีคำนำหน้าติดมา ("อาปาเช่อ่อนนุช 46") จึงลองตัดหน้าทีละตัว เหลืออย่างน้อย 6 ตัวอักษร */
    for(let L=m[1].length;L>=Math.min(6,m[1].length);L--){const kk=m[1].slice(-L)+m[2];let i=a.indexOf(kk);while(i>=0){if(!/\d/.test(a.charAt(i+kk.length)))return (m[1].slice(-L)+' '+m[2]).replace(/(\d)แยก(\d)/,'$1 แยก $2');i=a.indexOf(kk,i+1)}}return ''}
  function match(c){
    if(!C.rows.length)return null;const hits=[];
    const has=c.lat!==''&&c.lat!=null&&isFinite(+c.lat);
    if(has)C.rows.forEach(r=>{if(r.lat==null)return;const d=distM(+c.lat,+c.lng,r.lat,r.lng);if(d<=(r.approx?NEAR_M*1.5:NEAR_M))hits.push({r,d,how:r.approx?'ใกล้ (พิกัดโดยประมาณ)':'ใกล้'})});
    const addr=norm([c.address,c.district].filter(Boolean).join(' ')).replace(/ซอย|ถนน/g,' ');
    if(addr.length>=4)C.rows.forEach(r=>{if(hits.some(h=>h.r===r))return;let k='';keys(r.n).forEach(x=>{const h=hasKey(addr,x);if(h.length>k.length)k=h});if(k)hits.push({r,d:null,len:k.length,how:'ชื่อพื้นที่คล้ายกัน "'+k+'" (อาจเป็นที่เดียวกัน)'})});
    if(!hits.length)return null;
    hits.sort((a,b)=>(a.d==null?1e9:a.d)-(b.d==null?1e9:b.d)||(b.len||0)-(a.len||0)||b.r.t-a.r.t);
    return {best:hits[0],all:hits};
  }
  function addLocal(cells){const r=fromCells(cells);r.t=dateMs(r.date);r.n=norm(r.area);r._local=Date.now();r.note=r.note||'เพิ่งกรอก';C.local.push(r);C.rows.unshift(r);return r}
  return {C,load,match,SHEET_URL,distM,keys,coordsFromUrl,addLocal};
})();
