// UM+: เก็บหน้าเว็บไว้ในเครื่อง ให้เปิดเบอร์ฉุกเฉินได้แม้สัญญาณแย่
const CACHE='umplus-v61';
const SHELL=['./','./index.html','./styles.css','./emergency.css','./mobile.css','./hotlines.js','./location.js','./script.js','./live.js','./places.js','./trip.js','./assets/ummatee-logo.png','./assets/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(u=>c.add(u)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==CACHE+'-ext').map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.hostname.includes('script.google')||url.hostname.includes('googleusercontent'))return; // ข้อมูลเคสต้องสดเสมอ
  // Leaflet + ข้อมูลน้ำท่วม Floodboard: ใช้ของในเครื่องก่อน แล้วอัปเดตเบื้องหลัง (เปิดแผนที่ได้เร็ว)
  if(url.hostname==='unpkg.com'||(url.hostname.endsWith('floodboard.org')&&url.pathname.startsWith('/api/export/'))){
    e.respondWith(caches.open(CACHE+'-ext').then(async c=>{
      const hit=await c.match(req);
      const net=fetch(req).then(r=>{if(r.ok)c.put(req,r.clone());return r}).catch(()=>hit);
      const fresh=hit&&(Date.now()-new Date(hit.headers.get('date')||0).getTime()<10*60*1000||url.hostname==='unpkg.com');
      if(hit){if(!fresh||url.hostname!=='unpkg.com')e.waitUntil(net);return hit}
      return net;
    }));
    return;
  }
  if(url.origin===location.origin&&url.pathname.endsWith('/version.json'))return; // เช็กเวอร์ชันต้องสดเสมอ
  if(url.origin===location.origin){
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c));return r}).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));
  }
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();const h=(e.notification.data&&e.notification.data.hash)||'';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    const c=cs.find(x=>x.url.startsWith(self.registration.scope));
    if(c){if(h)c.navigate(self.registration.scope+'#'+h).catch(()=>{});return c.focus()}
    return self.clients.openWindow(self.registration.scope+(h?'#'+h:''));
  }));
});
