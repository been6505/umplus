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

## แอปมือถือ (`app/`)

ห่อหน้าเว็บเดิมด้วย [Capacitor](https://capacitorjs.com) — แก้เว็บที่เดียวได้ทั้งเว็บและแอป
ในแอป ตัวติดตามทีมใช้ตำแหน่งเบื้องหลังแบบ native จึงส่งตำแหน่งได้แม้ล็อกจอ

- **Android**: ทุก push GitHub Actions (`App · Android APK`) จะสร้าง APK ให้ดาวน์โหลดที่แท็บ Actions → Artifacts
- **iOS**: ทุก push จะ build สำหรับ simulator เพื่อตรวจว่าคอมไพล์ผ่าน · push tag `ios-<เลข>` เพื่อ build + อัปโหลด TestFlight
  ต้องตั้ง Secrets ใน repo: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`
  และสร้างแอปใน App Store Connect ด้วย Bundle ID `org.helpme4u` ก่อน

ทดลองบนเครื่อง: `cd app && npm ci && npm run sync` แล้วเปิด `android/` ใน Android Studio หรือ `ios/App/App.xcworkspace` ใน Xcode
