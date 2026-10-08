# UM+ · ช่วยเหลือฉุกเฉิน

เว็บแจ้งจุดขอความช่วยเหลือน้ำท่วม กรุงเทพฯ พร้อมหน้าหลังบ้านสำหรับทีมอาสาและแอดมิน
เป็นเว็บ static (HTML/CSS/JS ล้วน ไม่ต้อง build) ใช้ Google Apps Script + Google Sheet เป็นฐานข้อมูล

ย้ายมาจาก branch `gh-pages` ของ [`been6505/ummatee`](https://github.com/been6505/ummatee) (commit `f2351e9`) พร้อมประวัติ commit ทั้งหมด

## หน้าต่างๆ

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าสาธารณะ: แจ้งขอความช่วยเหลือ, ติดตามเคสของตัวเอง, เบอร์ฉุกเฉิน |
| `admin.html` | หลังบ้าน: เข้าด้วยรหัสทีม, รายการเคส, ตรวจสอบพื้นที่, ถุงยังชีพ |
| `admin/dashboard/` | แดชบอร์ดสรุปเคส |
| `admin/teams/` | จัดทีม, สถานะ, ตำแหน่งสด, มอบหมายเคส |
| `admin/stock/` | สต็อกของบริจาค |

## ลองบนเครื่อง

```sh
python3 -m http.server 8000
# เปิด http://localhost:8000/
```

## ขึ้นเว็บด้วย GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → เลือก branch ที่มีโค้ดนี้ (เช่น `main`) โฟลเดอร์ `/ (root)`
เว็บจะอยู่ที่ `https://been6505.github.io/umplus/` (ทุก path ในโค้ดเป็น relative จึงใช้ได้ทันที)

## หมายเหตุ

- ทุกหน้าเรียก Apps Script ตัวเดียวกัน (`API_URL` ใน `script.js`, `admin.js`, `admin/common.js`, `admin/dashboard/dashboard.js`) ถ้าเปลี่ยน URL ต้องแก้ทั้ง 4 ไฟล์
- เมื่อแก้ไฟล์หน้าเว็บ ให้เพิ่มเลขใน `version.json`, `APP_VERSION` ใน `index.html` (ต้องตรงกับ `version.json` ไม่งั้นหน้าเว็บจะรีโหลดตัวเองวนไป) และ `CACHE` ใน `sw.js`

## แอปมือถือ HelpMe4U (`app/`)

แอปคือเว็บ **https://central.helpme4u.com** ทั้งเว็บ (Capacitor `server.url`, Bundle ID `com.helpme4u`)
- เปิดแอป = เปิด central.helpme4u.com เหมือนเว็บ 100% แก้เว็บแล้วแอปเปลี่ยนตามทันที ไม่ต้อง build ใหม่
- ไม่มีอินเทอร์เน็ต → หน้า `app/shell/error.html` (ลองใหม่ / เชื่อมต่อเองเมื่อกลับมาออนไลน์)
- ลิงก์ไปเว็บอื่น (เช่น Google Maps นำทาง) เปิดนอกแอป · iOS ปัดขอบซ้ายเพื่อย้อนกลับ

### ส่งตำแหน่งเบื้องหลังจากหน้าเว็บ central (เมื่ออยู่ในแอป)
แอปมีปลั๊กอินตำแหน่งเบื้องหลังติดตั้งไว้แล้ว หน้าทีมของ central เรียกใช้ได้ (ส่งต่อแม้ล็อกจอ) เช่น

```js
const C = window.Capacitor;
if (C && C.isNativePlatform && C.isNativePlatform()) {
  const BG = C.registerPlugin('BackgroundGeolocation');
  await BG.addWatcher({ backgroundTitle: 'HelpMe4U', backgroundMessage: 'กำลังส่งตำแหน่งทีมให้ศูนย์',
      requestPermissions: true, stale: false, distanceFilter: 30 }, (loc, err) => {
    if (!loc) return;
    fetch('/api/track/' + TEAM_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _type: 'location', lat: loc.latitude, lon: loc.longitude, acc: Math.round(loc.accuracy), tst: Math.floor(loc.time / 1000) }) });
  });
}
```
(`fetch` ในแอปวิ่งผ่าน native HTTP จึงไม่ถูกหน่วงตอนแอปอยู่เบื้องหลัง)

### Build บน cloud (GitHub Actions เมื่อแก้ไฟล์ใน `app/`)
- **Android**: `App · Android APK` → แท็บ Actions → Artifacts
- **iOS**: ทุก push build สำหรับ simulator · push tag `ios-<เลข>` เพื่อ build + อัปโหลด TestFlight
  ต้องตั้ง Secrets: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` และสร้างแอปใน App Store Connect ด้วย Bundle ID `com.helpme4u`
