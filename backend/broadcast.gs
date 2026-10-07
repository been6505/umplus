/**
 * UM+ ระบบประกาศแจ้งเตือนพื้นที่ (Broadcast) — Apps Script แยกตัว ไม่ยุ่งกับ Code.gs เดิม
 *
 * ติดตั้ง (ครั้งเดียว ~5 นาที):
 *  1) เปิด Google Sheet ใหม่ (หรือชีตเดิมก็ได้) → ส่วนขยาย → Apps Script → สร้างไฟล์ broadcast.gs วางโค้ดนี้ทั้งหมด
 *     (ถ้าวางในโปรเจกต์เดียวกับ Code.gs เดิม ให้สร้างเป็น "โปรเจกต์ใหม่" แยกต่างหากแทน เพราะชื่อ doGet/doPost จะชนกัน)
 *  2) ตั้งค่าโปรเจกต์ (รูปเฟือง) → Script properties → เพิ่ม BROADCAST_KEY = รหัสสำหรับแอดมินที่จะส่งประกาศ
 *  3) Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy → คัดลอก URL (/exec)
 *  4) ใส่ URL ใน broadcast.js (BROADCAST_URL) ของหน้าเว็บ
 *
 * API
 *  GET  ?action=broadcasts            → ประกาศที่ยังไม่หมดอายุ/ยังไม่ยกเลิก (สาธารณะ)
 *  GET  ?action=broadcasts&all=1&key= → ทั้งหมด 200 รายการล่าสุด (แอดมิน)
 *  POST {action:'broadcast_save',key,item}   → สร้าง/แก้ไข
 *  POST {action:'broadcast_cancel',key,id}   → ยกเลิกประกาศ
 */
const BC_SHEET = 'Broadcasts';
const BC_COLS = ['id','createdAt','by','title','body','level','scope','districts','lat','lng','radiusKm','expiresAt','link','active'];
const BC_LEVELS = ['info','warn','danger'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'broadcasts') {
    const admin = p.all && bcAuth_(p.key);
    if (p.all && !admin) return bcOut_({ ok: false, error: 'not_admin' });
    const now = Date.now();
    let rows = bcRows_();
    if (!admin) rows = rows.filter(r => r.active && (!r.expiresAt || r.expiresAt > now));
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return bcOut_({ ok: true, now, broadcasts: rows.slice(0, admin ? 200 : 50) });
  }
  if (p.action === 'broadcast_ping') return bcOut_({ ok: bcAuth_(p.key), error: bcAuth_(p.key) ? '' : 'not_admin' });
  return bcOut_({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (err) { return bcOut_({ ok: false, error: 'bad_json' }); }
  if (!bcAuth_(b.key)) return bcOut_({ ok: false, error: 'not_admin' });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (b.action === 'broadcast_save') return bcOut_(bcSave_(b.item || {}, String(b.by || '').slice(0, 60)));
    if (b.action === 'broadcast_cancel') return bcOut_(bcCancel_(String(b.id || '')));
    return bcOut_({ ok: false, error: 'unknown_action' });
  } finally { lock.releaseLock(); }
}

function bcAuth_(key) {
  const k = PropertiesService.getScriptProperties().getProperty('BROADCAST_KEY');
  return !!k && !!key && String(key) === k;
}
function bcSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BC_SHEET);
  if (!sh) { sh = ss.insertSheet(BC_SHEET); sh.appendRow(BC_COLS); sh.setFrozenRows(1); }
  return sh;
}
function bcRows_() {
  const v = bcSheet_().getDataRange().getValues(); v.shift();
  return v.filter(r => r[0]).map(r => {
    const o = {}; BC_COLS.forEach((c, i) => o[c] = r[i]);
    ['createdAt', 'expiresAt', 'lat', 'lng', 'radiusKm'].forEach(c => o[c] = o[c] === '' ? '' : Number(o[c]));
    o.active = o.active === true || o.active === 'TRUE' || o.active === 1;
    o.districts = String(o.districts || '').split(',').map(s => s.trim()).filter(Boolean);
    o.id = String(o.id);
    return o;
  });
}
function bcClean_(s, n) { return String(s == null ? '' : s).replace(/^[=+\-@]/, "'$&").slice(0, n); } // กันสูตรในชีต
function bcSave_(it, by) {
  const title = bcClean_(it.title, 120).trim(), body = bcClean_(it.body, 1500).trim();
  if (!title) return { ok: false, error: 'title_required' };
  const level = BC_LEVELS.indexOf(it.level) >= 0 ? it.level : 'info';
  const scope = ['all', 'district', 'circle'].indexOf(it.scope) >= 0 ? it.scope : 'all';
  const lat = Number(it.lat), lng = Number(it.lng), radiusKm = Math.max(0.1, Math.min(100, Number(it.radiusKm) || 2));
  if (scope === 'circle' && !(isFinite(lat) && isFinite(lng) && lat && lng)) return { ok: false, error: 'center_required' };
  const districts = (Array.isArray(it.districts) ? it.districts : []).map(d => bcClean_(d, 40).trim()).filter(Boolean).slice(0, 50);
  if (scope === 'district' && !districts.length) return { ok: false, error: 'district_required' };
  const link = /^https:\/\//.test(String(it.link || '')) ? String(it.link).slice(0, 500) : '';
  const now = Date.now(), hours = Math.max(1, Math.min(24 * 14, Number(it.hours) || 24));
  const sh = bcSheet_(), rows = bcRows_();
  const row = {
    id: it.id && rows.some(r => r.id === String(it.id)) ? String(it.id) : 'B' + now.toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase(),
    createdAt: now, by, title, body, level, scope, districts: districts.join(','),
    lat: scope === 'circle' ? +lat.toFixed(6) : '', lng: scope === 'circle' ? +lng.toFixed(6) : '', radiusKm: scope === 'circle' ? radiusKm : '',
    expiresAt: now + hours * 3600000, link, active: true
  };
  const idx = rows.findIndex(r => r.id === row.id);
  const vals = [BC_COLS.map(c => row[c])];
  if (idx >= 0) { row.createdAt = rows[idx].createdAt; vals[0][1] = row.createdAt; sh.getRange(idx + 2, 1, 1, BC_COLS.length).setValues(vals); }
  else sh.appendRow(vals[0]);
  return { ok: true, id: row.id };
}
function bcCancel_(id) {
  const rows = bcRows_(), idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return { ok: false, error: 'not_found' };
  bcSheet_().getRange(idx + 2, BC_COLS.indexOf('active') + 1).setValue(false);
  return { ok: true };
}
function bcOut_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
