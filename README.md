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

แอปทีมอาสาสำหรับศูนย์ **central.helpme4u.com** (Capacitor · `com.helpme4u`)
- เชื่อมทีมครั้งเดียวด้วยลิงก์หน้าทีม `https://central.helpme4u.com/team/?id=<รหัสทีม>` (วางลิงก์ หรือเปิดลิงก์ `helpme4u://team?id=<รหัสทีม>`)
- เปิดสวิตช์แล้วแอปส่ง GPS เบื้องหลังไปที่ `/api/track/<รหัสทีม>` (รูปแบบ OwnTracks ที่ศูนย์รองรับอยู่แล้ว) ส่งต่อแม้ล็อกจอ
- ปุ่ม "เปิดหน้าทีม" เปิดหน้าทีมของศูนย์ในแอป
- ปุ่ม "ศูนย์ประสานงาน" เปิดแดชบอร์ด `https://central.helpme4u.com/central/dashboard/` เต็มจอในแอป (Android ปุ่มย้อนกลับ / iOS ปัดขอบซ้าย = กลับหน้าแรก) ตั้งให้เปิดแดชบอร์ดทันทีเมื่อเปิดแอปได้
- หน้าแอปอยู่ที่ `app/shell/` (HTML/JS ล้วน)

Build บน cloud (GitHub Actions เมื่อแก้ไฟล์ใน `app/`):
- **Android**: `App · Android APK` → แท็บ Actions → Artifacts
- **iOS**: ทุก push build สำหรับ simulator · push tag `ios-<เลข>` เพื่อ build + อัปโหลด TestFlight
  ต้องตั้ง Secrets: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` และสร้างแอปใน App Store Connect ด้วย Bundle ID `com.helpme4u`

ทดลองบนเครื่อง: `cd app && npm ci && npm run sync` แล้วเปิด `android/` ใน Android Studio หรือ `ios/App/App.xcworkspace` ใน Xcode
